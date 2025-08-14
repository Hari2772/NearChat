const User = require('../models/User');
const Chat = require('../models/Chat');
const Call = require('../models/Call');
const Story = require('../models/Story');
const Group = require('../models/Group');
const FeatureFlag = require('../models/FeatureFlag');
const Analytics = require('../models/Analytics');
const TierData = require('../models/TierData');
const features = require('../config/features');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const redis = require('../config/redis');
const webrtc = require('../config/webrtc');

class AdminController {
  // Check admin permissions
  async checkAdminPermissions(req, res, next) {
    try {
      if (!req.user || !req.user.roles.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    } catch (error) {
      logger.error('Error checking admin permissions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get system overview
  async getSystemOverview(req, res) {
    try {
      if (!features.isEnabled('admin_dashboard')) {
        return res.status(403).json({ error: 'Admin dashboard feature is disabled' });
      }

      // Get counts
      const [userCount, chatCount, callCount, storyCount, groupCount] = await Promise.all([
        User.countDocuments(),
        Chat.countDocuments(),
        Call.countDocuments(),
        Story.countDocuments(),
        Group.countDocuments()
      ]);

      // Get active users (online in last 24 hours)
      const activeUsers = await User.countDocuments({
        lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      // Get active calls
      const activeCalls = await Call.countDocuments({
        status: { $in: ['initiating', 'ringing', 'connected'] }
      });

      // Get system health
      const systemHealth = await this.getSystemHealth();

      // Get recent analytics
      const recentAnalytics = await Analytics.find()
        .sort({ lastUpdated: -1 })
        .limit(5)
        .select('name type metrics lastUpdated');

      const overview = {
        counts: {
          users: userCount,
          chats: chatCount,
          calls: callCount,
          stories: storyCount,
          groups: groupCount
        },
        active: {
          users: activeUsers,
          calls: activeCalls
        },
        systemHealth,
        recentAnalytics
      };

      res.json(overview);
    } catch (error) {
      logger.error('Error getting system overview:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get system health
  async getSystemHealth(req, res) {
    try {
      const health = {
        database: 'unknown',
        redis: 'unknown',
        webrtc: 'unknown',
        features: 'unknown',
        timestamp: new Date()
      };

      // Check database
      try {
        await User.db.db.admin().ping();
        health.database = 'healthy';
      } catch (error) {
        health.database = 'unhealthy';
        logger.error('Database health check failed:', error);
      }

      // Check Redis
      try {
        await redis.ping();
        health.redis = 'healthy';
      } catch (error) {
        health.redis = 'unhealthy';
        logger.error('Redis health check failed:', error);
      }

      // Check WebRTC
      try {
        const rooms = webrtc.getRooms();
        health.webrtc = 'healthy';
        health.webrtcRooms = rooms.length;
      } catch (error) {
        health.webrtc = 'unhealthy';
        logger.error('WebRTC health check failed:', error);
      }

      // Check features
      try {
        const featureFlags = await FeatureFlag.find({ enabled: true });
        health.features = 'healthy';
        health.activeFeatures = featureFlags.length;
      } catch (error) {
        health.features = 'unhealthy';
        logger.error('Features health check failed:', error);
      }

      if (req.path) {
        res.json(health);
      } else {
        return health;
      }
    } catch (error) {
      logger.error('Error getting system health:', error);
      if (req.path) {
        res.status(500).json({ error: 'Internal server error' });
      } else {
        throw error;
      }
    }
  }

  // Get user management data
  async getUserManagement(req, res) {
    try {
      if (!features.isEnabled('user_management')) {
        return res.status(403).json({ error: 'User management feature is disabled' });
      }

      const { limit = 50, offset = 0, status, role, search } = req.query;

      const query = {};

      if (status) {
        query.status = status;
      }

      if (role) {
        query.roles = role;
      }

      if (search) {
        query.$or = [
          { username: { $regex: search, $options: 'i' } },
          { displayName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const users = await User.find(query)
        .select('-password -refreshToken -emailVerificationToken -passwordResetToken')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await User.countDocuments(query);

      // Get user statistics
      const stats = await User.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: {
              $sum: {
                $cond: [
                  { $gte: ['$lastSeen', new Date(Date.now() - 24 * 60 * 60 * 1000)] },
                  1,
                  0
                ]
              }
            },
            verifiedUsers: {
              $sum: {
                $cond: ['$emailVerified', 1, 0]
              }
            },
            premiumUsers: {
              $sum: {
                $cond: ['$isPremium', 1, 0]
              }
            }
          }
        }
      ]);

      res.json({
        users,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        stats: stats[0] || {
          totalUsers: 0,
          activeUsers: 0,
          verifiedUsers: 0,
          premiumUsers: 0
        }
      });
    } catch (error) {
      logger.error('Error getting user management data:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update user role
  async updateUserRole(req, res) {
    try {
      if (!features.isEnabled('user_management')) {
        return res.status(403).json({ error: 'User management feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { userId } = req.params;
      const { roles, action } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (action === 'add') {
        // Add roles
        roles.forEach(role => {
          if (!user.roles.includes(role)) {
            user.roles.push(role);
          }
        });
      } else if (action === 'remove') {
        // Remove roles (but keep 'user' role)
        user.roles = user.roles.filter(role => 
          role === 'user' || !roles.includes(role)
        );
      } else if (action === 'set') {
        // Set roles (ensure 'user' role is always present)
        user.roles = ['user', ...roles.filter(role => role !== 'user')];
      } else {
        return res.status(400).json({ error: 'Invalid action. Use: add, remove, or set' });
      }

      await user.save();

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'user_role_updates' },
        {
          $inc: { 'metrics.admin.roleUpdates': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({
        message: 'User roles updated successfully',
        user: {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          roles: user.roles
        }
      });
    } catch (error) {
      logger.error('Error updating user role:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Ban/unban user
  async toggleUserBan(req, res) {
    try {
      if (!features.isEnabled('user_management')) {
        return res.status(403).json({ error: 'User management feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { userId } = req.params;
      const { banned, reason } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (banned) {
        user.status = 'banned';
        user.bannedAt = new Date();
        user.bannedBy = req.user.id;
        user.banReason = reason;
      } else {
        user.status = 'active';
        user.bannedAt = null;
        user.bannedBy = null;
        user.banReason = null;
      }

      await user.save();

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'user_bans' },
        {
          $inc: { [`metrics.admin.users${banned ? 'Banned' : 'Unbanned'}`]: 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({
        message: `User ${banned ? 'banned' : 'unbanned'} successfully`,
        user: {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          status: user.status,
          bannedAt: user.bannedAt,
          banReason: user.banReason
        }
      });
    } catch (error) {
      logger.error('Error toggling user ban:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get feature flag management
  async getFeatureFlags(req, res) {
    try {
      if (!features.isEnabled('feature_flag_management')) {
        return res.status(403).json({ error: 'Feature flag management feature is disabled' });
      }

      const { limit = 50, offset = 0, category, status } = req.query;

      const query = {};

      if (category) {
        query.category = category;
      }

      if (status !== undefined) {
        query.enabled = status === 'enabled';
      }

      const featureFlags = await FeatureFlag.find(query)
        .populate('createdBy', 'username displayName')
        .populate('lastModifiedBy', 'username displayName')
        .sort({ updatedAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await FeatureFlag.countDocuments(query);

      // Get categories
      const categories = await FeatureFlag.distinct('category');

      res.json({
        featureFlags,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        categories
      });
    } catch (error) {
      logger.error('Error getting feature flags:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Create feature flag
  async createFeatureFlag(req, res) {
    try {
      if (!features.isEnabled('feature_flag_management')) {
        return res.status(403).json({ error: 'Feature flag management feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        name,
        displayName,
        description,
        category,
        enabled = false,
        rolloutPercentage = 0,
        targetAudience = 'all',
        metadata = {}
      } = req.body;

      // Check if feature flag already exists
      const existingFlag = await FeatureFlag.findOne({ name });
      if (existingFlag) {
        return res.status(400).json({ error: 'Feature flag with this name already exists' });
      }

      const featureFlag = new FeatureFlag({
        name,
        displayName,
        description,
        category,
        enabled,
        rolloutPercentage,
        targetAudience,
        metadata: {
          ...metadata,
          version: metadata.version || '1.0.0',
          priority: metadata.priority || 'medium'
        },
        createdBy: req.user.id,
        lastModifiedBy: req.user.id
      });

      await featureFlag.save();

      // Update Redis cache
      await features.updateFeature(name, enabled);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'feature_flag_creation' },
        {
          $inc: { 'metrics.admin.featureFlagsCreated': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.status(201).json({
        message: 'Feature flag created successfully',
        featureFlag
      });
    } catch (error) {
      logger.error('Error creating feature flag:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update feature flag
  async updateFeatureFlag(req, res) {
    try {
      if (!features.isEnabled('feature_flag_management')) {
        return res.status(403).json({ error: 'Feature flag management feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { flagId } = req.params;
      const updateData = req.body;

      const featureFlag = await FeatureFlag.findById(flagId);
      if (!featureFlag) {
        return res.status(404).json({ error: 'Feature flag not found' });
      }

      // Update fields
      Object.keys(updateData).forEach(key => {
        if (key !== '_id' && key !== 'createdBy') {
          featureFlag[key] = updateData[key];
        }
      });

      featureFlag.lastModifiedBy = req.user.id;
      featureFlag.lastModifiedAt = new Date();

      await featureFlag.save();

      // Update Redis cache
      await features.updateFeature(featureFlag.name, featureFlag.enabled);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'feature_flag_updates' },
        {
          $inc: { 'metrics.admin.featureFlagsUpdated': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({
        message: 'Feature flag updated successfully',
        featureFlag
      });
    } catch (error) {
      logger.error('Error updating feature flag:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Delete feature flag
  async deleteFeatureFlag(req, res) {
    try {
      if (!features.isEnabled('feature_flag_management')) {
        return res.status(403).json({ error: 'Feature flag management feature is disabled' });
      }

      const { flagId } = req.params;

      const featureFlag = await FeatureFlag.findById(flagId);
      if (!featureFlag) {
        return res.status(404).json({ error: 'Feature flag not found' });
      }

      // Remove from Redis cache
      await features.disableFeature(featureFlag.name);

      await FeatureFlag.findByIdAndDelete(flagId);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'feature_flag_deletion' },
        {
          $inc: { 'metrics.admin.featureFlagsDeleted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'Feature flag deleted successfully' });
    } catch (error) {
      logger.error('Error deleting feature flag:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Bulk update feature flags
  async bulkUpdateFeatureFlags(req, res) {
    try {
      if (!features.isEnabled('feature_flag_management')) {
        return res.status(403).json({ error: 'Feature flag management feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { updates } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'Updates array is required' });
      }

      const results = [];

      for (const update of updates) {
        try {
          const { flagId, enabled, rolloutPercentage } = update;

          const featureFlag = await FeatureFlag.findById(flagId);
          if (!featureFlag) {
            results.push({ flagId, success: false, error: 'Feature flag not found' });
            continue;
          }

          featureFlag.enabled = enabled;
          if (rolloutPercentage !== undefined) {
            featureFlag.rolloutPercentage = rolloutPercentage;
          }
          featureFlag.lastModifiedBy = req.user.id;
          featureFlag.lastModifiedAt = new Date();

          await featureFlag.save();

          // Update Redis cache
          await features.updateFeature(featureFlag.name, enabled);

          results.push({ flagId, success: true });
        } catch (error) {
          results.push({ flagId, success: false, error: error.message });
        }
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'feature_flag_bulk_updates' },
        {
          $inc: { 'metrics.admin.bulkUpdatesPerformed': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({
        message: 'Bulk update completed',
        results
      });
    } catch (error) {
      logger.error('Error bulk updating feature flags:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get analytics dashboard
  async getAnalyticsDashboard(req, res) {
    try {
      if (!features.isEnabled('admin_analytics')) {
        return res.status(403).json({ error: 'Admin analytics feature is disabled' });
      }

      const { period = '7d', type } = req.query;

      // Calculate date range
      const now = new Date();
      let startDate;
      switch (period) {
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      // Get user growth
      const userGrowth = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Get message activity
      const messageActivity = await Analytics.aggregate([
        {
          $match: {
            name: 'message_sending',
            lastUpdated: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$lastUpdated'
              }
            },
            messages: { $sum: '$metrics.messages.totalSent' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Get call statistics
      const callStats = await Call.aggregate([
        {
          $match: {
            startTime: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalDuration: { $sum: '$duration' },
            avgDuration: { $avg: '$duration' }
          }
        }
      ]);

      // Get feature usage
      const featureUsage = await FeatureFlag.aggregate([
        {
          $group: {
            _id: '$category',
            total: { $sum: 1 },
            enabled: {
              $sum: { $cond: ['$enabled', 1, 0] }
            }
          }
        }
      ]);

      // Get tier data
      const tierData = await TierData.find()
        .sort({ tier: 1 })
        .select('tier statistics userDistribution activityMetrics');

      const analytics = {
        period,
        userGrowth,
        messageActivity,
        callStats,
        featureUsage,
        tierData,
        generatedAt: new Date()
      };

      res.json(analytics);
    } catch (error) {
      logger.error('Error getting analytics dashboard:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get system logs
  async getSystemLogs(req, res) {
    try {
      if (!features.isEnabled('admin_logs')) {
        return res.status(403).json({ error: 'Admin logs feature is disabled' });
      }

      const { level, limit = 100, offset = 0 } = req.query;

      // This would typically read from log files or a log aggregation service
      // For now, we'll return a placeholder response
      const logs = [
        {
          timestamp: new Date(),
          level: 'info',
          message: 'System logs feature not fully implemented',
          source: 'admin_controller'
        }
      ];

      res.json({
        logs,
        total: logs.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('Error getting system logs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Clear system cache
  async clearSystemCache(req, res) {
    try {
      if (!features.isEnabled('admin_cache_management')) {
        return res.status(403).json({ error: 'Cache management feature is disabled' });
      }

      // Clear Redis cache
      await redis.flushdb();

      // Reload feature flags
      await features.reloadFeatures();

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'cache_clearing' },
        {
          $inc: { 'metrics.admin.cacheClears': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'System cache cleared successfully' });
    } catch (error) {
      logger.error('Error clearing system cache:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get WebRTC room information
  async getWebRTCRooms(req, res) {
    try {
      if (!features.isEnabled('admin_webrtc_monitoring')) {
        return res.status(403).json({ error: 'WebRTC monitoring feature is disabled' });
      }

      const rooms = webrtc.getRooms();
      const roomDetails = [];

      for (const roomId of rooms) {
        const roomInfo = webrtc.getRoomInfo(roomId);
        if (roomInfo) {
          roomDetails.push(roomInfo);
        }
      }

      res.json({
        totalRooms: rooms.length,
        rooms: roomDetails
      });
    } catch (error) {
      logger.error('Error getting WebRTC rooms:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Force close WebRTC room
  async forceCloseWebRTCRoom(req, res) {
    try {
      if (!features.isEnabled('admin_webrtc_management')) {
        return res.status(403).json({ error: 'WebRTC management feature is disabled' });
      }

      const { roomId } = req.params;

      await webrtc.closeRoom(roomId);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'webrtc_room_management' },
        {
          $inc: { 'metrics.admin.roomsForceClosed': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'WebRTC room closed successfully' });
    } catch (error) {
      logger.error('Error force closing WebRTC room:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = new AdminController();