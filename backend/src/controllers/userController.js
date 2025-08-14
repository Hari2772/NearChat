const User = require('../models/User');
const Chat = require('../models/Chat');
const Group = require('../models/Group');
const Story = require('../models/Story');
const Analytics = require('../models/Analytics');
const features = require('../config/features');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { uploadToCloud } = require('../utils/fileUpload');
const { sendPushNotification } = require('../utils/notifications');

class UserController {
  // Get user profile
  async getProfile(req, res) {
    try {
      if (!features.isEnabled('user_profiles')) {
        return res.status(403).json({ error: 'User profiles feature is disabled' });
      }

      const userId = req.params.userId || req.user.id;
      const user = await User.findById(userId)
        .select('-password -refreshToken -emailVerificationToken -passwordResetToken')
        .populate('friends', 'username displayName avatar isOnline lastSeen')
        .populate('friendRequests', 'username displayName avatar')
        .populate('blockedUsers', 'username displayName avatar');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if requesting user is blocked
      if (user.blockedUsers.some(blocked => blocked._id.toString() === req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check privacy settings
      const isOwnProfile = userId === req.user.id;
      const isFriend = user.friends.some(friend => friend._id.toString() === req.user.id);
      const isPublic = user.privacy.profileVisibility === 'public';

      if (!isOwnProfile && !isFriend && !isPublic) {
        return res.status(403).json({ error: 'Profile is private' });
      }

      // Filter sensitive information based on privacy settings
      const profileData = {
        _id: user._id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
        location: user.privacy.locationVisibility === 'public' ? user.location : null,
        proximityTier: user.proximityTier,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        status: user.status,
        createdAt: user.createdAt,
        friends: user.friends,
        friendRequests: isOwnProfile ? user.friendRequests : [],
        blockedUsers: isOwnProfile ? user.blockedUsers : [],
        privacy: isOwnProfile ? user.privacy : { profileVisibility: user.privacy.profileVisibility },
        preferences: isOwnProfile ? user.preferences : {},
        statistics: isOwnProfile ? user.statistics : {
          totalFriends: user.friends.length,
          totalStories: user.statistics.totalStories,
          totalGroups: user.statistics.totalGroups
        }
      };

      res.json(profileData);
    } catch (error) {
      logger.error('Error getting user profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      if (!features.isEnabled('profile_editing')) {
        return res.status(403).json({ error: 'Profile editing feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const updateData = req.body;

      // Validate updateable fields
      const allowedFields = [
        'displayName', 'bio', 'avatar', 'status', 'preferences',
        'privacy', 'notificationSettings', 'location'
      ];

      const filteredData = {};
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          filteredData[field] = updateData[field];
        }
      });

      // Handle avatar upload
      if (req.file) {
        try {
          const avatarUrl = await uploadToCloud(req.file, 'avatars');
          filteredData.avatar = avatarUrl;
        } catch (uploadError) {
          logger.error('Avatar upload failed:', uploadError);
          return res.status(400).json({ error: 'Avatar upload failed' });
        }
      }

      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        filteredData,
        { new: true, runValidators: true }
      ).select('-password -refreshToken');

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'user_profile_updates' },
        {
          $inc: { 'metrics.user.profileUpdates': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json(updatedUser);
    } catch (error) {
      logger.error('Error updating user profile:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update user location
  async updateLocation(req, res) {
    try {
      if (!features.isEnabled('location_sharing')) {
        return res.status(403).json({ error: 'Location sharing feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { latitude, longitude, accuracy, timestamp } = req.body;

      // Validate coordinates
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Invalid coordinates' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update location
      user.location = {
        type: 'Point',
        coordinates: [longitude, latitude],
        accuracy: accuracy || 0,
        timestamp: timestamp || new Date()
      };

      // Update proximity tier based on new location
      await user.updateProximityTier();

      // Update last seen
      user.lastSeen = new Date();
      await user.save();

      // Notify friends about location update (if enabled)
      if (user.privacy.locationVisibility === 'friends') {
        const friends = await User.find({ _id: { $in: user.friends } });
        for (const friend of friends) {
          if (friend.notificationSettings.locationUpdates) {
            await sendPushNotification(friend._id, {
              title: `${user.displayName} updated their location`,
              body: 'Tap to view their new location',
              data: { type: 'location_update', userId: user._id }
            });
          }
        }
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'location_updates' },
        {
          $inc: { 'metrics.location.totalUpdates': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({
        message: 'Location updated successfully',
        location: user.location,
        proximityTier: user.proximityTier
      });
    } catch (error) {
      logger.error('Error updating user location:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get nearby users
  async getNearbyUsers(req, res) {
    try {
      if (!features.isEnabled('proximity_system')) {
        return res.status(403).json({ error: 'Proximity system feature is disabled' });
      }

      const userId = req.user.id;
      const { latitude, longitude, radius = 10000, tier, limit = 50 } = req.query;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Use user's current location if coordinates not provided
      let searchLocation = user.location;
      if (latitude && longitude) {
        searchLocation = {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        };
      }

      if (!searchLocation) {
        return res.status(400).json({ error: 'Location not available' });
      }

      // Build query
      const query = {
        _id: { $ne: userId },
        location: {
          $near: {
            $geometry: searchLocation,
            $maxDistance: parseInt(radius)
          }
        },
        'privacy.locationVisibility': { $ne: 'hidden' }
      };

      // Filter by tier if specified
      if (tier) {
        query.proximityTier = parseInt(tier);
      }

      // Exclude blocked users
      if (user.blockedUsers.length > 0) {
        query._id = { $nin: user.blockedUsers };
      }

      const nearbyUsers = await User.find(query)
        .select('username displayName avatar location proximityTier isOnline lastSeen status')
        .limit(parseInt(limit))
        .sort({ 'location.coordinates': 1 });

      // Calculate distances
      const usersWithDistance = nearbyUsers.map(nearbyUser => {
        const distance = user.calculateDistance(nearbyUser.location);
        return {
          ...nearbyUser.toObject(),
          distance: Math.round(distance)
        };
      });

      res.json({
        users: usersWithDistance,
        total: usersWithDistance.length,
        searchLocation: searchLocation,
        radius: parseInt(radius)
      });
    } catch (error) {
      logger.error('Error getting nearby users:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Send friend request
  async sendFriendRequest(req, res) {
    try {
      if (!features.isEnabled('friend_system')) {
        return res.status(403).json({ error: 'Friend system feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const senderId = req.user.id;
      const { recipientId } = req.body;

      if (senderId === recipientId) {
        return res.status(400).json({ error: 'Cannot send friend request to yourself' });
      }

      const sender = await User.findById(senderId);
      const recipient = await User.findById(recipientId);

      if (!sender || !recipient) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if already friends
      if (sender.friends.includes(recipientId)) {
        return res.status(400).json({ error: 'Already friends' });
      }

      // Check if request already sent
      if (sender.friendRequests.includes(recipientId)) {
        return res.status(400).json({ error: 'Friend request already sent' });
      }

      // Check if blocked
      if (sender.blockedUsers.includes(recipientId) || recipient.blockedUsers.includes(senderId)) {
        return res.status(403).json({ error: 'Cannot send friend request' });
      }

      // Send friend request
      sender.friendRequests.push(recipientId);
      await sender.save();

      // Send notification
      if (recipient.notificationSettings.friendRequests) {
        await sendPushNotification(recipient._id, {
          title: 'New Friend Request',
          body: `${sender.displayName} sent you a friend request`,
          data: { type: 'friend_request', senderId: sender._id }
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'friend_requests' },
        {
          $inc: { 'metrics.social.friendRequestsSent': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'Friend request sent successfully' });
    } catch (error) {
      logger.error('Error sending friend request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Accept friend request
  async acceptFriendRequest(req, res) {
    try {
      if (!features.isEnabled('friend_system')) {
        return res.status(403).json({ error: 'Friend system feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { senderId } = req.body;

      const user = await User.findById(userId);
      const sender = await User.findById(senderId);

      if (!user || !sender) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if request exists
      if (!user.friendRequests.includes(senderId)) {
        return res.status(400).json({ error: 'Friend request not found' });
      }

      // Remove from friend requests
      user.friendRequests = user.friendRequests.filter(id => id.toString() !== senderId);
      
      // Add to friends
      user.friends.push(senderId);
      sender.friends.push(userId);

      // Remove from sender's sent requests
      sender.friendRequests = sender.friendRequests.filter(id => id.toString() !== userId);

      await Promise.all([user.save(), sender.save()]);

      // Send notification
      if (sender.notificationSettings.friendRequests) {
        await sendPushNotification(sender._id, {
          title: 'Friend Request Accepted',
          body: `${user.displayName} accepted your friend request`,
          data: { type: 'friend_request_accepted', userId: user._id }
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'friend_requests' },
        {
          $inc: { 'metrics.social.friendRequestsAccepted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'Friend request accepted successfully' });
    } catch (error) {
      logger.error('Error accepting friend request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Reject friend request
  async rejectFriendRequest(req, res) {
    try {
      if (!features.isEnabled('friend_system')) {
        return res.status(403).json({ error: 'Friend system feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { senderId } = req.body;

      const user = await User.findById(userId);
      const sender = await User.findById(senderId);

      if (!user || !sender) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if request exists
      if (!user.friendRequests.includes(senderId)) {
        return res.status(400).json({ error: 'Friend request not found' });
      }

      // Remove from friend requests
      user.friendRequests = user.friendRequests.filter(id => id.toString() !== senderId);
      await user.save();

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'friend_requests' },
        {
          $inc: { 'metrics.social.friendRequestsRejected': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'Friend request rejected successfully' });
    } catch (error) {
      logger.error('Error rejecting friend request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Remove friend
  async removeFriend(req, res) {
    try {
      if (!features.isEnabled('friend_system')) {
        return res.status(403).json({ error: 'Friend system feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { friendId } = req.body;

      const user = await User.findById(userId);
      const friend = await User.findById(friendId);

      if (!user || !friend) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if friends
      if (!user.friends.includes(friendId)) {
        return res.status(400).json({ error: 'Not friends' });
      }

      // Remove from friends
      user.friends = user.friends.filter(id => id.toString() !== friendId);
      friend.friends = friend.friends.filter(id => id.toString() !== userId);

      await Promise.all([user.save(), friend.save()]);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'friend_requests' },
        {
          $inc: { 'metrics.social.friendsRemoved': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'Friend removed successfully' });
    } catch (error) {
      logger.error('Error removing friend:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Block user
  async blockUser(req, res) {
    try {
      if (!features.isEnabled('user_blocking')) {
        return res.status(403).json({ error: 'User blocking feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { targetId } = req.body;

      if (userId === targetId) {
        return res.status(400).json({ error: 'Cannot block yourself' });
      }

      const user = await User.findById(userId);
      const target = await User.findById(targetId);

      if (!user || !target) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if already blocked
      if (user.blockedUsers.includes(targetId)) {
        return res.status(400).json({ error: 'User already blocked' });
      }

      // Remove from friends if friends
      if (user.friends.includes(targetId)) {
        user.friends = user.friends.filter(id => id.toString() !== targetId);
        target.friends = target.friends.filter(id => id.toString() !== userId);
      }

      // Remove from friend requests
      user.friendRequests = user.friendRequests.filter(id => id.toString() !== targetId);
      target.friendRequests = target.friendRequests.filter(id => id.toString() !== userId);

      // Add to blocked users
      user.blockedUsers.push(targetId);
      target.blockedUsers.push(userId);

      await Promise.all([user.save(), target.save()]);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'user_blocking' },
        {
          $inc: { 'metrics.social.usersBlocked': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'User blocked successfully' });
    } catch (error) {
      logger.error('Error blocking user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Unblock user
  async unblockUser(req, res) {
    try {
      if (!features.isEnabled('user_blocking')) {
        return res.status(403).json({ error: 'User blocking feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { targetId } = req.body;

      const user = await User.findById(userId);
      const target = await User.findById(targetId);

      if (!user || !target) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if blocked
      if (!user.blockedUsers.includes(targetId)) {
        return res.status(400).json({ error: 'User not blocked' });
      }

      // Remove from blocked users
      user.blockedUsers = user.blockedUsers.filter(id => id.toString() !== targetId);
      target.blockedUsers = target.blockedUsers.filter(id => id.toString() !== userId);

      await Promise.all([user.save(), target.save()]);

      res.json({ message: 'User unblocked successfully' });
    } catch (error) {
      logger.error('Error unblocking user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get user statistics
  async getUserStats(req, res) {
    try {
      if (!features.isEnabled('user_statistics')) {
        return res.status(403).json({ error: 'User statistics feature is disabled' });
      }

      const userId = req.params.userId || req.user.id;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check privacy
      const isOwnStats = userId === req.user.id;
      const isFriend = user.friends.includes(req.user.id);
      const isPublic = user.privacy.profileVisibility === 'public';

      if (!isOwnStats && !isFriend && !isPublic) {
        return res.status(403).json({ error: 'Statistics are private' });
      }

      // Get additional stats
      const [messageCount, storyCount, groupCount] = await Promise.all([
        Message.countDocuments({ sender: userId }),
        Story.countDocuments({ creator: userId }),
        Group.countDocuments({ 'members.user': userId })
      ]);

      const stats = {
        basic: user.statistics,
        messages: messageCount,
        stories: storyCount,
        groups: groupCount,
        friends: user.friends.length,
        friendRequests: isOwnStats ? user.friendRequests.length : undefined,
        blockedUsers: isOwnStats ? user.blockedUsers.length : undefined
      };

      res.json(stats);
    } catch (error) {
      logger.error('Error getting user stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Search users
  async searchUsers(req, res) {
    try {
      if (!features.isEnabled('user_search')) {
        return res.status(403).json({ error: 'User search feature is disabled' });
      }

      const { query, limit = 20, offset = 0 } = req.query;

      if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Search query must be at least 2 characters' });
      }

      const searchQuery = {
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { displayName: { $regex: query, $options: 'i' } },
          { bio: { $regex: query, $options: 'i' } }
        ],
        _id: { $ne: req.user.id }
      };

      const users = await User.find(searchQuery)
        .select('username displayName avatar bio proximityTier isOnline lastSeen')
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .sort({ 'statistics.totalFriends': -1, createdAt: -1 });

      const total = await User.countDocuments(searchQuery);

      res.json({
        users,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('Error searching users:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update notification settings
  async updateNotificationSettings(req, res) {
    try {
      if (!features.isEnabled('notifications')) {
        return res.status(403).json({ error: 'Notifications feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { notificationSettings } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update notification settings
      user.notificationSettings = {
        ...user.notificationSettings,
        ...notificationSettings
      };

      await user.save();

      res.json({ message: 'Notification settings updated successfully' });
    } catch (error) {
      logger.error('Error updating notification settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update privacy settings
  async updatePrivacySettings(req, res) {
    try {
      if (!features.isEnabled('privacy_controls')) {
        return res.status(403).json({ error: 'Privacy controls feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { privacy } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Update privacy settings
      user.privacy = {
        ...user.privacy,
        ...privacy
      };

      await user.save();

      res.json({ message: 'Privacy settings updated successfully' });
    } catch (error) {
      logger.error('Error updating privacy settings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Delete user account
  async deleteAccount(req, res) {
    try {
      if (!features.isEnabled('account_deletion')) {
        return res.status(403).json({ error: 'Account deletion feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { password, reason } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify password
      if (!user.comparePassword(password)) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      // Soft delete - mark as deleted
      user.status = 'deleted';
      user.deletedAt = new Date();
      user.deletionReason = reason;
      await user.save();

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'account_deletions' },
        {
          $inc: { 'metrics.user.accountDeletions': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'Account deleted successfully' });
    } catch (error) {
      logger.error('Error deleting account:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = new UserController();