const User = require('../../models/User');
const TierData = require('../../models/TierData');
const Analytics = require('../../models/Analytics');
const features = require('../../config/features');
const logger = require('../../utils/logger');
const redis = require('../../config/redis');

class TierHandler {
  constructor() {
    this.tierUsers = new Map(); // tier -> Set of userIds
    this.userTiers = new Map(); // userId -> tier
    this.tierUpdates = new Map(); // tier -> last update timestamp
    this.updateInterval = 30000; // 30 seconds
    this.lastGlobalUpdate = Date.now();
  }

  handleConnection(socket, socketManager) {
    try {
      const userId = socket.userId;

      // Handle tier events
      socket.on('join_tier_room', (data) => this.handleJoinTierRoom(socket, socketManager, data));
      socket.on('leave_tier_room', (data) => this.handleLeaveTierRoom(socket, socketManager, data));
      socket.on('get_tier_info', (data) => this.handleGetTierInfo(socket, socketManager, data));
      socket.on('get_nearby_users', (data) => this.handleGetNearbyUsers(socket, socketManager, data));
      socket.on('update_proximity', (data) => this.handleUpdateProximity(socket, socketManager, data));

      // Initialize user tier
      this.initializeUserTier(userId);

      // Start periodic updates
      this.startPeriodicUpdates(socketManager);

      logger.info(`Tier handler initialized for user ${userId}`);
    } catch (error) {
      logger.error('Error initializing tier handler:', error);
    }
  }

  async initializeUserTier(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.location) return;

      const tier = this.calculateTier(user.location);
      this.setUserTier(userId, tier);

      logger.info(`User ${userId} initialized with tier ${tier}`);
    } catch (error) {
      logger.error('Error initializing user tier:', error);
    }
  }

  calculateTier(location) {
    try {
      if (!location || !location.coordinates) return 0;

      // Simple tier calculation based on coordinates
      // In a real implementation, this would use more sophisticated algorithms
      const [longitude, latitude] = location.coordinates;
      
      // Example tier calculation (simplified)
      // Tier 1: Very close (0-100m)
      // Tier 2: Close (100m-500m)
      // Tier 3: Near (500m-1km)
      // Tier 4: Moderate (1km-5km)
      // Tier 5: Far (5km-10km)
      // Tier 6: Very far (10km+)
      
      // This is a placeholder - real implementation would use actual distance calculations
      const baseTier = Math.floor(Math.random() * 6) + 1;
      
      return Math.min(baseTier, 6);
    } catch (error) {
      logger.error('Error calculating tier:', error);
      return 0;
    }
  }

  setUserTier(userId, tier) {
    try {
      // Remove user from previous tier
      if (this.userTiers.has(userId)) {
        const previousTier = this.userTiers.get(userId);
        if (this.tierUsers.has(previousTier)) {
          this.tierUsers.get(previousTier).delete(userId);
        }
      }

      // Set new tier
      this.userTiers.set(userId, tier);

      // Add user to new tier
      if (!this.tierUsers.has(tier)) {
        this.tierUsers.set(tier, new Set());
      }
      this.tierUsers.get(tier).add(userId);

      // Mark tier for update
      this.tierUpdates.set(tier, Date.now());

      logger.debug(`User ${userId} moved to tier ${tier}`);
    } catch (error) {
      logger.error('Error setting user tier:', error);
    }
  }

  async handleJoinTierRoom(socket, socketManager, data) {
    try {
      if (!features.isEnabled('proximity_system')) {
        socket.emit('error', { message: 'Proximity system feature is disabled' });
        return;
      }

      const { tier } = data;
      const userId = socket.userId;

      if (!tier || tier < 1 || tier > 6) {
        socket.emit('error', { message: 'Invalid tier number' });
        return;
      }

      // Join tier room
      const roomId = `tier_${tier}`;
      const success = socketManager.joinRoom(userId, roomId, 'tier');

      if (success) {
        // Get tier information
        const tierInfo = await this.getTierInfo(tier);
        
        socket.emit('tier_room_joined', {
          tier,
          roomId,
          tierInfo,
          timestamp: new Date()
        });

        // Update analytics
        await Analytics.findOneAndUpdate(
          { name: 'tier_room_joins' },
          {
            $inc: { [`metrics.tier.tier${tier}Joins`: 1] },
            $set: { lastUpdated: new Date() }
          },
          { upsert: true }
        );
      }
    } catch (error) {
      logger.error('Error joining tier room:', error);
      socket.emit('error', { message: 'Failed to join tier room' });
    }
  }

  async handleLeaveTierRoom(socket, socketManager, data) {
    try {
      const { tier } = data;
      const userId = socket.userId;

      if (!tier || tier < 1 || tier > 6) {
        return;
      }

      // Leave tier room
      const roomId = `tier_${tier}`;
      socketManager.leaveRoom(userId, roomId);

      socket.emit('tier_room_left', {
        tier,
        roomId,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Error leaving tier room:', error);
    }
  }

  async handleGetTierInfo(socket, socketManager, data) {
    try {
      if (!features.isEnabled('proximity_system')) {
        socket.emit('error', { message: 'Proximity system feature is disabled' });
        return;
      }

      const { tier } = data;
      const userId = socket.userId;

      if (!tier || tier < 1 || tier > 6) {
        socket.emit('error', { message: 'Invalid tier number' });
        return;
      }

      // Get tier information
      const tierInfo = await this.getTierInfo(tier);
      
      socket.emit('tier_info', {
        tier,
        info: tierInfo,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error getting tier info:', error);
      socket.emit('error', { message: 'Failed to get tier info' });
    }
  }

  async handleGetNearbyUsers(socket, socketManager, data) {
    try {
      if (!features.isEnabled('proximity_system')) {
        socket.emit('error', { message: 'Proximity system feature is disabled' });
        return;
      }

      const { latitude, longitude, radius = 10000, tier } = data;
      const userId = socket.userId;

      // Validate coordinates
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
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
        .limit(50);

      // Calculate distances
      const usersWithDistance = nearbyUsers.map(user => {
        const distance = this.calculateDistance(
          { latitude, longitude },
          user.location.coordinates
        );
        return {
          ...user.toObject(),
          distance: Math.round(distance)
        };
      });

      socket.emit('nearby_users', {
        users: usersWithDistance,
        total: usersWithDistance.length,
        searchLocation: { latitude, longitude },
        radius: parseInt(radius),
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error getting nearby users:', error);
      socket.emit('error', { message: 'Failed to get nearby users' });
    }
  }

  async handleUpdateProximity(socket, socketManager, data) {
    try {
      if (!features.isEnabled('proximity_system')) {
        socket.emit('error', { message: 'Proximity system feature is disabled' });
        return;
      }

      const { latitude, longitude, accuracy } = data;
      const userId = socket.userId;

      // Validate coordinates
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return;
      }

      // Update user location
      const user = await User.findById(userId);
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      user.location = {
        type: 'Point',
        coordinates: [longitude, latitude],
        accuracy: accuracy || 0,
        timestamp: new Date()
      };

      // Calculate new tier
      const newTier = this.calculateTier(user.location);
      user.proximityTier = newTier;

      await user.save();

      // Update tier tracking
      this.setUserTier(userId, newTier);

      // Emit proximity updated event
      socket.emit('proximity_updated', {
        location: user.location,
        tier: newTier,
        timestamp: new Date()
      });

      // Notify tier room members
      const roomId = `tier_${newTier}`;
      socketManager.broadcastToRoom(roomId, 'user_proximity_updated', {
        userId,
        tier: newTier,
        timestamp: new Date()
      }, userId);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'proximity_updates' },
        {
          $inc: { 'metrics.location.totalUpdates': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      logger.info(`User ${userId} proximity updated to tier ${newTier}`);

    } catch (error) {
      logger.error('Error updating proximity:', error);
      socket.emit('error', { message: 'Failed to update proximity' });
    }
  }

  async getTierInfo(tier) {
    try {
      // Get tier data from database
      let tierData = await TierData.findOne({ tier });
      
      if (!tierData) {
        // Create default tier data if it doesn't exist
        tierData = new TierData({
          tier,
          statistics: {
            totalUsers: 0,
            activeUsers: 0,
            onlineUsers: 0
          }
        });
        await tierData.save();
      }

      // Get real-time user counts
      const onlineUsers = this.tierUsers.get(tier)?.size || 0;
      const totalUsers = await User.countDocuments({ proximityTier: tier });

      // Update tier data
      tierData.statistics.totalUsers = totalUsers;
      tierData.statistics.onlineUsers = onlineUsers;
      tierData.statistics.activeUsers = await User.countDocuments({
        proximityTier: tier,
        lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      tierData.lastUpdated = new Date();
      await tierData.save();

      return {
        tier,
        statistics: tierData.statistics,
        onlineUsers,
        totalUsers,
        lastUpdated: tierData.lastUpdated
      };

    } catch (error) {
      logger.error('Error getting tier info:', error);
      return {
        tier,
        statistics: { totalUsers: 0, activeUsers: 0, onlineUsers: 0 },
        onlineUsers: 0,
        totalUsers: 0,
        lastUpdated: new Date()
      };
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

  startPeriodicUpdates(socketManager) {
    // Update tier information every 30 seconds
    setInterval(async () => {
      try {
        await this.broadcastTierUpdates(socketManager);
        this.lastGlobalUpdate = Date.now();
      } catch (error) {
        logger.error('Error in periodic tier updates:', error);
      }
    }, this.updateInterval);
  }

  async broadcastTierUpdates(socketManager) {
    try {
      // Update each tier
      for (let tier = 1; tier <= 6; tier++) {
        const lastUpdate = this.tierUpdates.get(tier) || 0;
        const now = Date.now();

        // Only update if enough time has passed or if there are changes
        if (now - lastUpdate > this.updateInterval || this.tierUsers.has(tier)) {
          const tierInfo = await this.getTierInfo(tier);
          
          // Broadcast to tier room
          const roomId = `tier_${tier}`;
          socketManager.broadcastToRoom(roomId, 'tier_update', {
            tier,
            info: tierInfo,
            timestamp: new Date()
          });

          // Update tier data in database
          await TierData.findOneAndUpdate(
            { tier },
            {
              $set: {
                statistics: tierInfo.statistics,
                lastUpdated: tierInfo.lastUpdated,
                'realTimeData.lastUpdated': new Date(),
                'realTimeData.frequency': this.updateInterval
              }
            },
            { upsert: true }
          );
        }
      }

      // Update global proximity analytics
      await this.updateGlobalProximityAnalytics();

    } catch (error) {
      logger.error('Error broadcasting tier updates:', error);
    }
  }

  async updateGlobalProximityAnalytics() {
    try {
      const totalOnlineUsers = Array.from(this.tierUsers.values())
        .reduce((total, userSet) => total + userSet.size, 0);

      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({
        lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'global_proximity' },
        {
          $set: {
            'metrics.proximity.totalOnlineUsers': totalOnlineUsers,
            'metrics.proximity.totalUsers': totalUsers,
            'metrics.proximity.activeUsers': activeUsers,
            'metrics.proximity.tierDistribution': Array.from(this.tierUsers.entries()).map(([tier, users]) => ({
              tier,
              onlineUsers: users.size
            })),
            lastUpdated: new Date()
          }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error updating global proximity analytics:', error);
    }
  }

  // Utility methods
  getUserTier(userId) {
    return this.userTiers.get(userId) || 0;
  }

  getTierUsers(tier) {
    return Array.from(this.tierUsers.get(tier) || []);
  }

  getOnlineUsersInTier(tier) {
    return this.tierUsers.get(tier)?.size || 0;
  }

  getTotalOnlineUsers() {
    return Array.from(this.tierUsers.values())
      .reduce((total, userSet) => total + userSet.size, 0);
  }

  // Cleanup
  cleanup() {
    this.tierUsers.clear();
    this.userTiers.clear();
    this.tierUpdates.clear();
  }
}

module.exports = new TierHandler();