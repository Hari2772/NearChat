const User = require('../../models/User');
const TierData = require('../../models/TierData');
const Analytics = require('../../models/Analytics');
const features = require('../../config/features');
const logger = require('../../utils/logger');
const redis = require('../../config/redis');

class LocationHandler {
  constructor() {
    this.userLocations = new Map(); // userId -> location data
    this.locationUpdates = new Map(); // userId -> last update timestamp
    this.proximityCache = new Map(); // userId -> nearby users cache
    this.updateInterval = 60000; // 1 minute
    this.lastGlobalUpdate = Date.now();
  }

  handleConnection(socket, socketManager) {
    try {
      const userId = socket.userId;

      // Handle location events
      socket.on('update_location', (data) => this.handleUpdateLocation(socket, socketManager, data));
      socket.on('get_nearby_users', (data) => this.handleGetNearbyUsers(socket, socketManager, data));
      socket.on('get_user_location', (data) => this.handleGetUserLocation(socket, socketManager, data));
      socket.on('share_location', (data) => this.handleShareLocation(socket, socketManager, data));
      socket.on('stop_sharing_location', (data) => this.handleStopSharingLocation(socket, socketManager, data));
      socket.on('get_location_history', (data) => this.handleGetLocationHistory(socket, socketManager, data));

      // Initialize user location
      this.initializeUserLocation(userId);

      // Start periodic updates
      this.startPeriodicUpdates(socketManager);

      logger.info(`Location handler initialized for user ${userId}`);
    } catch (error) {
      logger.error('Error initializing location handler:', error);
    }
  }

  async initializeUserLocation(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.location) return;

      // Store user location
      this.userLocations.set(userId, {
        coordinates: user.location.coordinates,
        accuracy: user.location.accuracy,
        timestamp: user.location.timestamp,
        isSharing: user.privacy?.locationVisibility !== 'hidden'
      });

      // Set last update timestamp
      this.locationUpdates.set(userId, Date.now());

      logger.info(`User ${userId} location initialized`);
    } catch (error) {
      logger.error('Error initializing user location:', error);
    }
  }

  async handleUpdateLocation(socket, socketManager, data) {
    try {
      if (!features.isEnabled('location_sharing')) {
        socket.emit('error', { message: 'Location sharing feature is disabled' });
        return;
      }

      const { latitude, longitude, accuracy, timestamp } = data;
      const userId = socket.userId;

      // Validate coordinates
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
      }

      // Update user location in database
      const user = await User.findById(userId);
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      user.location = {
        type: 'Point',
        coordinates: [longitude, latitude],
        accuracy: accuracy || 0,
        timestamp: timestamp || new Date()
      };

      // Update proximity tier
      const newTier = this.calculateProximityTier(user.location);
      user.proximityTier = newTier;

      await user.save();

      // Update local tracking
      this.userLocations.set(userId, {
        coordinates: user.location.coordinates,
        accuracy: user.location.accuracy,
        timestamp: user.location.timestamp,
        isSharing: user.privacy?.locationVisibility !== 'hidden'
      });

      this.locationUpdates.set(userId, Date.now());

      // Clear proximity cache for this user
      this.proximityCache.delete(userId);

      // Emit location updated confirmation
      socket.emit('location_updated', {
        location: user.location,
        tier: newTier,
        timestamp: new Date()
      });

      // Notify friends about location update (if enabled)
      if (user.privacy?.locationVisibility === 'friends') {
        await this.notifyFriendsLocationUpdate(socketManager, user, user.location);
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

      logger.info(`User ${userId} location updated to tier ${newTier}`);

    } catch (error) {
      logger.error('Error updating location:', error);
      socket.emit('error', { message: 'Failed to update location' });
    }
  }

  async handleGetNearbyUsers(socket, socketManager, data) {
    try {
      if (!features.isEnabled('proximity_system')) {
        socket.emit('error', { message: 'Proximity system feature is disabled' });
        return;
      }

      const { latitude, longitude, radius = 10000, tier, limit = 50 } = data;
      const userId = socket.userId;

      // Validate coordinates
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
      }

      // Check cache first
      const cacheKey = `${userId}_${Math.round(latitude * 1000)}_${Math.round(longitude * 1000)}_${radius}`;
      if (this.proximityCache.has(cacheKey)) {
        const cached = this.proximityCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 30000) { // 30 second cache
          socket.emit('nearby_users', cached.data);
          return;
        }
      }

      // Build query
      const query = {
        _id: { $ne: userId },
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude]
            },
            $maxDistance: parseInt(radius)
          }
        },
        'privacy.locationVisibility': { $ne: 'hidden' }
      };

      // Filter by tier if specified
      if (tier) {
        query.proximityTier = parseInt(tier);
      }

      // Get nearby users
      const nearbyUsers = await User.find(query)
        .select('username displayName avatar location proximityTier isOnline lastSeen')
        .limit(parseInt(limit));

      // Calculate distances and filter by privacy
      const usersWithDistance = nearbyUsers
        .map(user => {
          const distance = this.calculateDistance(
            { latitude, longitude },
            user.location.coordinates
          );
          return {
            ...user.toObject(),
            distance: Math.round(distance)
          };
        })
        .filter(user => user.distance <= radius);

      const result = {
        users: usersWithDistance,
        total: usersWithDistance.length,
        searchLocation: { latitude, longitude },
        radius: parseInt(radius),
        timestamp: new Date()
      };

      // Cache the result
      this.proximityCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      socket.emit('nearby_users', result);

    } catch (error) {
      logger.error('Error getting nearby users:', error);
      socket.emit('error', { message: 'Failed to get nearby users' });
    }
  }

  async handleGetUserLocation(socket, socketManager, data) {
    try {
      if (!features.isEnabled('location_sharing')) {
        socket.emit('error', { message: 'Location sharing feature is disabled' });
        return;
      }

      const { targetUserId } = data;
      const userId = socket.userId;

      // Check if user can access target's location
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      const canAccess = this.canAccessUserLocation(userId, targetUserId, targetUser);
      if (!canAccess) {
        socket.emit('error', { message: 'Cannot access user location' });
        return;
      }

      // Get location data
      const locationData = this.userLocations.get(targetUserId);
      if (!locationData || !locationData.isSharing) {
        socket.emit('error', { message: 'Location not available' });
        return;
      }

      socket.emit('user_location', {
        userId: targetUserId,
        location: {
          coordinates: locationData.coordinates,
          accuracy: locationData.accuracy,
          timestamp: locationData.timestamp
        },
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error getting user location:', error);
      socket.emit('error', { message: 'Failed to get user location' });
    }
  }

  async handleShareLocation(socket, socketManager, data) {
    try {
      if (!features.isEnabled('location_sharing')) {
        socket.emit('error', { message: 'Location sharing feature is disabled' });
        return;
      }

      const { duration = 3600000 } = data; // Default 1 hour
      const userId = socket.userId;

      // Update user privacy settings
      const user = await User.findById(userId);
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      user.privacy.locationVisibility = 'friends';
      await user.save();

      // Update local tracking
      const locationData = this.userLocations.get(userId);
      if (locationData) {
        locationData.isSharing = true;
        this.userLocations.set(userId, locationData);
      }

      // Set auto-stop timer
      setTimeout(() => {
        this.autoStopLocationSharing(userId, socketManager);
      }, duration);

      socket.emit('location_sharing_started', {
        duration,
        timestamp: new Date()
      });

      // Notify friends
      await this.notifyFriendsLocationUpdate(socketManager, user, user.location);

      logger.info(`User ${userId} started sharing location for ${duration}ms`);

    } catch (error) {
      logger.error('Error starting location sharing:', error);
      socket.emit('error', { message: 'Failed to start location sharing' });
    }
  }

  async handleStopSharingLocation(socket, socketManager, data) {
    try {
      const userId = socket.userId;

      // Update user privacy settings
      const user = await User.findById(userId);
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      user.privacy.locationVisibility = 'hidden';
      await user.save();

      // Update local tracking
      const locationData = this.userLocations.get(userId);
      if (locationData) {
        locationData.isSharing = false;
        this.userLocations.set(userId, locationData);
      }

      socket.emit('location_sharing_stopped', {
        timestamp: new Date()
      });

      // Notify friends
      await this.notifyFriendsLocationUpdate(socketManager, user, null);

      logger.info(`User ${userId} stopped sharing location`);

    } catch (error) {
      logger.error('Error stopping location sharing:', error);
      socket.emit('error', { message: 'Failed to stop location sharing' });
    }
  }

  async handleGetLocationHistory(socket, socketManager, data) {
    try {
      if (!features.isEnabled('location_history')) {
        socket.emit('error', { message: 'Location history feature is disabled' });
        return;
      }

      const { days = 7, limit = 100 } = data;
      const userId = socket.userId;

      // Get location history from database
      // Note: This would require a separate LocationHistory model
      // For now, we'll return a placeholder response
      socket.emit('location_history', {
        userId,
        history: [],
        days,
        total: 0,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error getting location history:', error);
      socket.emit('error', { message: 'Failed to get location history' });
    }
  }

  calculateProximityTier(location) {
    try {
      if (!location || !location.coordinates) return 0;

      // Simple tier calculation based on coordinates
      // In a real implementation, this would use more sophisticated algorithms
      const [longitude, latitude] = location.coordinates;
      
      // Example tier calculation (simplified)
      // This is a placeholder - real implementation would use actual distance calculations
      const baseTier = Math.floor(Math.random() * 6) + 1;
      
      return Math.min(baseTier, 6);
    } catch (error) {
      logger.error('Error calculating proximity tier:', error);
      return 0;
    }
  }

  calculateDistance(point1, point2) {
    try {
      // Haversine formula for calculating distance between two points
      const R = 6371e3; // Earth's radius in meters
      const φ1 = (point1.latitude * Math.PI) / 180;
      const φ2 = (point2[1] * Math.PI) / 180;
      const Δφ = ((point2[1] - point1.latitude) * Math.PI) / 180;
      const Δλ = ((point2[0] - point1.longitude) * Math.PI) / 180;

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c; // Distance in meters
    } catch (error) {
      logger.error('Error calculating distance:', error);
      return 0;
    }
  }

  canAccessUserLocation(userId, targetUserId, targetUser) {
    try {
      // Users can always access their own location
      if (userId === targetUserId) return true;

      // Check if target user is sharing location
      if (targetUser.privacy?.locationVisibility === 'hidden') return false;

      // Public location
      if (targetUser.privacy?.locationVisibility === 'public') return true;

      // Friends-only location
      if (targetUser.privacy?.locationVisibility === 'friends') {
        return targetUser.friends.includes(userId);
      }

      return false;
    } catch (error) {
      logger.error('Error checking location access:', error);
      return false;
    }
  }

  async notifyFriendsLocationUpdate(socketManager, user, location) {
    try {
      if (!user.friends || user.friends.length === 0) return;

      const friends = await User.find({ _id: { $in: user.friends } });
      
      friends.forEach(friend => {
        if (friend.notificationSettings?.locationUpdates) {
          socketManager.broadcastToUser(friend._id, 'friend_location_updated', {
            userId: user._id,
            displayName: user.displayName,
            location: location,
            timestamp: new Date()
          });
        }
      });
    } catch (error) {
      logger.error('Error notifying friends about location update:', error);
    }
  }

  async autoStopLocationSharing(userId, socketManager) {
    try {
      // This would be called automatically when location sharing duration expires
      const user = await User.findById(userId);
      if (!user) return;

      user.privacy.locationVisibility = 'hidden';
      await user.save();

      // Update local tracking
      const locationData = this.userLocations.get(userId);
      if (locationData) {
        locationData.isSharing = false;
        this.userLocations.set(userId, locationData);
      }

      // Notify user
      socketManager.broadcastToUser(userId, 'location_sharing_expired', {
        timestamp: new Date()
      });

      logger.info(`User ${userId} location sharing expired automatically`);

    } catch (error) {
      logger.error('Error auto-stopping location sharing:', error);
    }
  }

  startPeriodicUpdates(socketManager) {
    // Update location analytics every minute
    setInterval(async () => {
      try {
        await this.updateLocationAnalytics();
        this.lastGlobalUpdate = Date.now();
      } catch (error) {
        logger.error('Error in periodic location updates:', error);
      }
    }, this.updateInterval);
  }

  async updateLocationAnalytics() {
    try {
      const totalUsersWithLocation = this.userLocations.size;
      const sharingUsers = Array.from(this.userLocations.values())
        .filter(location => location.isSharing).length;

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'location_tracking' },
        {
          $set: {
            'metrics.location.totalUsersWithLocation': totalUsersWithLocation,
            'metrics.location.sharingUsers': sharingUsers,
            'metrics.location.lastUpdate': new Date()
          }
        },
        { upsert: true }
      );

      // Clean up old cache entries
      this.cleanupCache();

    } catch (error) {
      logger.error('Error updating location analytics:', error);
    }
  }

  cleanupCache() {
    try {
      const now = Date.now();
      const maxAge = 300000; // 5 minutes

      // Clean up proximity cache
      for (const [key, value] of this.proximityCache.entries()) {
        if (now - value.timestamp > maxAge) {
          this.proximityCache.delete(key);
        }
      }

      // Clean up old location updates
      for (const [userId, timestamp] of this.locationUpdates.entries()) {
        if (now - timestamp > maxAge) {
          this.locationUpdates.delete(userId);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up cache:', error);
    }
  }

  // Utility methods
  getUserLocation(userId) {
    return this.userLocations.get(userId);
  }

  isUserSharingLocation(userId) {
    const locationData = this.userLocations.get(userId);
    return locationData ? locationData.isSharing : false;
  }

  getTotalUsersWithLocation() {
    return this.userLocations.size;
  }

  getSharingUsers() {
    return Array.from(this.userLocations.values())
      .filter(location => location.isSharing).length;
  }

  // Cleanup
  cleanup() {
    this.userLocations.clear();
    this.locationUpdates.clear();
    this.proximityCache.clear();
  }
}

module.exports = new LocationHandler();