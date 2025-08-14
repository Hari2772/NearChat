const FeatureFlag = require('../../models/FeatureFlag');
const Analytics = require('../../models/Analytics');
const features = require('../../config/features');
const logger = require('../../utils/logger');
const redis = require('../../config/redis');

class FeatureFlagHandler {
  constructor() {
    this.subscribedUsers = new Map(); // userId -> Set of feature categories
    this.featureUpdates = new Map(); // featureName -> last update timestamp
    this.updateInterval = 60000; // 1 minute
    this.lastGlobalUpdate = Date.now();
  }

  handleConnection(socket, socketManager) {
    try {
      const userId = socket.userId;

      // Handle feature flag events
      socket.on('subscribe_features', (data) => this.handleSubscribeFeatures(socket, socketManager, data));
      socket.on('unsubscribe_features', (data) => this.handleUnsubscribeFeatures(socket, socketManager, data));
      socket.on('get_feature_flags', (data) => this.handleGetFeatureFlags(socket, socketManager, data));
      socket.on('get_feature_status', (data) => this.handleGetFeatureStatus(socket, socketManager, data));
      socket.on('admin_update_feature', (data) => this.handleAdminUpdateFeature(socket, socketManager, data));
      socket.on('admin_bulk_update_features', (data) => this.handleAdminBulkUpdateFeatures(socket, socketManager, data));

      // Initialize user with current features
      this.initializeUserFeatures(userId, socket);

      // Start periodic updates
      this.startPeriodicUpdates(socketManager);

      logger.info(`Feature flag handler initialized for user ${userId}`);
    } catch (error) {
      logger.error('Error initializing feature flag handler:', error);
    }
  }

  async initializeUserFeatures(userId, socket) {
    try {
      // Get user's current feature access
      const userFeatures = await this.getUserFeatureAccess(userId);
      
      // Send initial feature state
      socket.emit('features_initialized', {
        features: userFeatures,
        timestamp: new Date()
      });

      logger.info(`User ${userId} features initialized`);
    } catch (error) {
      logger.error('Error initializing user features:', error);
    }
  }

  async getUserFeatureAccess(userId) {
    try {
      // Get all enabled features
      const enabledFeatures = features.getEnabledFeatures();
      
      // Get user-specific feature overrides
      const userOverrides = await this.getUserFeatureOverrides(userId);
      
      // Merge global features with user overrides
      const userFeatures = { ...enabledFeatures };
      
      // Apply user-specific overrides
      Object.keys(userOverrides).forEach(featureName => {
        userFeatures[featureName] = userOverrides[featureName];
      });

      return userFeatures;
    } catch (error) {
      logger.error('Error getting user feature access:', error);
      return {};
    }
  }

  async getUserFeatureOverrides(userId) {
    try {
      // Get user-specific feature flags from database
      const userFlags = await FeatureFlag.find({
        'configuration.users': userId,
        enabled: true
      });

      const overrides = {};
      userFlags.forEach(flag => {
        overrides[flag.name] = flag.enabled;
      });

      return overrides;
    } catch (error) {
      logger.error('Error getting user feature overrides:', error);
      return {};
    }
  }

  async handleSubscribeFeatures(socket, socketManager, data) {
    try {
      if (!features.isEnabled('feature_flag_subscriptions')) {
        socket.emit('error', { message: 'Feature flag subscriptions feature is disabled' });
        return;
      }

      const { categories = [], featureNames = [] } = data;
      const userId = socket.userId;

      // Subscribe to feature categories
      if (categories.length > 0) {
        if (!this.subscribedUsers.has(userId)) {
          this.subscribedUsers.set(userId, new Set());
        }

        categories.forEach(category => {
          this.subscribedUsers.get(userId).add(`category:${category}`);
        });
      }

      // Subscribe to specific features
      if (featureNames.length > 0) {
        if (!this.subscribedUsers.has(userId)) {
          this.subscribedUsers.set(userId, new Set());
        }

        featureNames.forEach(featureName => {
          this.subscribedUsers.get(userId).add(`feature:${featureName}`);
        });
      }

      socket.emit('features_subscribed', {
        categories,
        featureNames,
        timestamp: new Date()
      });

      logger.info(`User ${userId} subscribed to features: ${categories.join(', ')} ${featureNames.join(', ')}`);

    } catch (error) {
      logger.error('Error subscribing to features:', error);
      socket.emit('error', { message: 'Failed to subscribe to features' });
    }
  }

  async handleUnsubscribeFeatures(socket, socketManager, data) {
    try {
      const { categories = [], featureNames = [] } = data;
      const userId = socket.userId;

      if (this.subscribedUsers.has(userId)) {
        // Unsubscribe from categories
        categories.forEach(category => {
          this.subscribedUsers.get(userId).delete(`category:${category}`);
        });

        // Unsubscribe from features
        featureNames.forEach(featureName => {
          this.subscribedUsers.get(userId).delete(`feature:${featureName}`);
        });

        // Remove user if no subscriptions
        if (this.subscribedUsers.get(userId).size === 0) {
          this.subscribedUsers.delete(userId);
        }
      }

      socket.emit('features_unsubscribed', {
        categories,
        featureNames,
        timestamp: new Date()
      });

      logger.info(`User ${userId} unsubscribed from features: ${categories.join(', ')} ${featureNames.join(', ')}`);

    } catch (error) {
      logger.error('Error unsubscribing from features:', error);
      socket.emit('error', { message: 'Failed to unsubscribe from features' });
    }
  }

  async handleGetFeatureFlags(socket, socketManager, data) {
    try {
      if (!features.isEnabled('feature_flag_queries')) {
        socket.emit('error', { message: 'Feature flag queries feature is disabled' });
        return;
      }

      const { categories = [], includeDisabled = false } = data;
      const userId = socket.userId;

      // Get feature flags from database
      const query = {};
      if (categories.length > 0) {
        query.category = { $in: categories };
      }
      if (!includeDisabled) {
        query.enabled = true;
      }

      const featureFlags = await FeatureFlag.find(query)
        .select('name displayName description category enabled rolloutStatus configuration metadata')
        .sort({ category: 1, priority: -1 });

      // Get user's feature access
      const userFeatures = await this.getUserFeatureAccess(userId);

      socket.emit('feature_flags', {
        flags: featureFlags,
        userAccess: userFeatures,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error getting feature flags:', error);
      socket.emit('error', { message: 'Failed to get feature flags' });
    }
  }

  async handleGetFeatureStatus(socket, socketManager, data) {
    try {
      const { featureName } = data;
      const userId = socket.userId;

      if (!featureName) {
        socket.emit('error', { message: 'Feature name is required' });
        return;
      }

      // Check if feature is enabled globally
      const isEnabled = features.isEnabled(featureName);
      
      // Check user-specific overrides
      const userOverrides = await this.getUserFeatureOverrides(userId);
      const userEnabled = userOverrides[featureName] !== undefined ? userOverrides[featureName] : isEnabled;

      // Get feature details
      const featureFlag = await FeatureFlag.findOne({ name: featureName })
        .select('name displayName description category enabled rolloutStatus configuration metadata');

      socket.emit('feature_status', {
        featureName,
        globallyEnabled: isEnabled,
        userEnabled,
        feature: featureFlag,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error getting feature status:', error);
      socket.emit('error', { message: 'Failed to get feature status' });
    }
  }

  async handleAdminUpdateFeature(socket, socketManager, data) {
    try {
      if (!features.isEnabled('admin_feature_management')) {
        socket.emit('error', { message: 'Admin feature management feature is disabled' });
        return;
      }

      const { featureName, enabled, rolloutPercentage, targetAudience } = data;
      const userId = socket.userId;

      // Check if user is admin
      const isAdmin = await this.checkAdminPermissions(userId);
      if (!isAdmin) {
        socket.emit('error', { message: 'Admin access required' });
        return;
      }

      // Update feature flag
      const updateData = {};
      if (enabled !== undefined) updateData.enabled = enabled;
      if (rolloutPercentage !== undefined) updateData.rolloutPercentage = rolloutPercentage;
      if (targetAudience !== undefined) updateData.targetAudience = targetAudience;

      const featureFlag = await FeatureFlag.findOneAndUpdate(
        { name: featureName },
        {
          $set: {
            ...updateData,
            lastModifiedBy: userId,
            lastModifiedAt: new Date()
          }
        },
        { new: true }
      );

      if (!featureFlag) {
        socket.emit('error', { message: 'Feature flag not found' });
        return;
      }

      // Update local features config
      if (enabled !== undefined) {
        if (enabled) {
          features.enableFeature(featureName);
        } else {
          features.disableFeature(featureName);
        }
      }

      // Broadcast feature update to subscribed users
      await this.broadcastFeatureUpdate(socketManager, featureName, featureFlag);

      // Emit confirmation
      socket.emit('feature_updated', {
        featureName,
        feature: featureFlag,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'feature_flag_updates' },
        {
          $inc: { 'metrics.features.adminUpdates': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      logger.info(`Admin ${userId} updated feature ${featureName}`);

    } catch (error) {
      logger.error('Error updating feature flag:', error);
      socket.emit('error', { message: 'Failed to update feature flag' });
    }
  }

  async handleAdminBulkUpdateFeatures(socket, socketManager, data) {
    try {
      if (!features.isEnabled('admin_feature_management')) {
        socket.emit('error', { message: 'Admin feature management feature is disabled' });
        return;
      }

      const { updates } = data;
      const userId = socket.userId;

      // Check if user is admin
      const isAdmin = await this.checkAdminPermissions(userId);
      if (!isAdmin) {
        socket.emit('error', { message: 'Admin access required' });
        return;
      }

      if (!Array.isArray(updates) || updates.length === 0) {
        socket.emit('error', { message: 'Invalid updates array' });
        return;
      }

      const results = [];
      const updatedFeatures = [];

      // Process each update
      for (const update of updates) {
        try {
          const { featureName, enabled, rolloutPercentage, targetAudience } = update;

          if (!featureName) {
            results.push({ featureName, success: false, error: 'Feature name is required' });
            continue;
          }

          // Update feature flag
          const updateData = {};
          if (enabled !== undefined) updateData.enabled = enabled;
          if (rolloutPercentage !== undefined) updateData.rolloutPercentage = rolloutPercentage;
          if (targetAudience !== undefined) updateData.targetAudience = targetAudience;

          const featureFlag = await FeatureFlag.findOneAndUpdate(
            { name: featureName },
            {
              $set: {
                ...updateData,
                lastModifiedBy: userId,
                lastModifiedAt: new Date()
              }
            },
            { new: true }
          );

          if (featureFlag) {
            // Update local features config
            if (enabled !== undefined) {
              if (enabled) {
                features.enableFeature(featureName);
              } else {
                features.disableFeature(featureName);
              }
            }

            results.push({ featureName, success: true, feature: featureFlag });
            updatedFeatures.push(featureFlag);
          } else {
            results.push({ featureName, success: false, error: 'Feature flag not found' });
          }
        } catch (error) {
          results.push({ featureName: update.featureName, success: false, error: error.message });
        }
      }

      // Broadcast feature updates to subscribed users
      for (const feature of updatedFeatures) {
        await this.broadcastFeatureUpdate(socketManager, feature.name, feature);
      }

      // Emit confirmation
      socket.emit('features_bulk_updated', {
        results,
        updatedFeatures,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'feature_flag_updates' },
        {
          $inc: { 'metrics.features.bulkUpdates': 1, 'metrics.features.featuresUpdated': updatedFeatures.length },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      logger.info(`Admin ${userId} bulk updated ${updatedFeatures.length} features`);

    } catch (error) {
      logger.error('Error bulk updating feature flags:', error);
      socket.emit('error', { message: 'Failed to bulk update feature flags' });
    }
  }

  async checkAdminPermissions(userId) {
    try {
      const User = require('../../models/User');
      const user = await User.findById(userId);
      return user && user.roles && user.roles.includes('admin');
    } catch (error) {
      logger.error('Error checking admin permissions:', error);
      return false;
    }
  }

  async broadcastFeatureUpdate(socketManager, featureName, featureFlag) {
    try {
      // Mark feature for update
      this.featureUpdates.set(featureName, Date.now());

      // Get subscribed users
      const subscribedUsers = Array.from(this.subscribedUsers.entries());
      
      for (const [userId, subscriptions] of subscribedUsers) {
        let shouldNotify = false;

        // Check if user is subscribed to this feature
        if (subscriptions.has(`feature:${featureName}`)) {
          shouldNotify = true;
        }

        // Check if user is subscribed to the category
        if (featureFlag.category && subscriptions.has(`category:${featureFlag.category}`)) {
          shouldNotify = true;
        }

        if (shouldNotify) {
          socketManager.broadcastToUser(userId, 'feature_flag_updated', {
            featureName,
            feature: featureFlag,
            timestamp: new Date()
          });
        }
      }

      // Publish to Redis for other instances
      await redis.publish('feature_flag_updates', JSON.stringify({
        featureName,
        feature: featureFlag,
        timestamp: new Date()
      }));

    } catch (error) {
      logger.error('Error broadcasting feature update:', error);
    }
  }

  startPeriodicUpdates(socketManager) {
    // Update feature analytics every minute
    setInterval(async () => {
      try {
        await this.updateFeatureAnalytics();
        this.lastGlobalUpdate = Date.now();
      } catch (error) {
        logger.error('Error in periodic feature updates:', error);
      }
    }, this.updateInterval);
  }

  async updateFeatureAnalytics() {
    try {
      const totalFeatures = Object.keys(features.getEnabledFeatures()).length;
      const totalSubscribers = this.subscribedUsers.size;
      const totalUpdates = this.featureUpdates.size;

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'feature_flag_system' },
        {
          $set: {
            'metrics.features.totalFeatures': totalFeatures,
            'metrics.features.totalSubscribers': totalSubscribers,
            'metrics.features.totalUpdates': totalUpdates,
            'metrics.features.lastUpdate': new Date()
          }
        },
        { upsert: true }
      );

      // Clean up old feature updates
      this.cleanupFeatureUpdates();

    } catch (error) {
      logger.error('Error updating feature analytics:', error);
    }
  }

  cleanupFeatureUpdates() {
    try {
      const now = Date.now();
      const maxAge = 300000; // 5 minutes

      for (const [featureName, timestamp] of this.featureUpdates.entries()) {
        if (now - timestamp > maxAge) {
          this.featureUpdates.delete(featureName);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up feature updates:', error);
    }
  }

  // Handle Redis feature flag updates from other instances
  async handleRedisFeatureUpdate(data) {
    try {
      const { featureName, feature, timestamp } = JSON.parse(data);
      
      // Update local features config
      if (feature.enabled) {
        features.enableFeature(featureName);
      } else {
        features.disableFeature(featureName);
      }

      // Mark feature for update
      this.featureUpdates.set(featureName, Date.now());

      logger.info(`Received Redis feature update for ${featureName}`);
    } catch (error) {
      logger.error('Error handling Redis feature update:', error);
    }
  }

  // Setup Redis subscription for feature flag updates
  setupRedisSubscription() {
    try {
      const subscriber = redis.duplicate();
      
      subscriber.subscribe('feature_flag_updates', (err) => {
        if (err) {
          logger.error('Error subscribing to feature flag updates:', err);
        } else {
          logger.info('Subscribed to feature flag updates');
        }
      });

      subscriber.on('message', (channel, message) => {
        if (channel === 'feature_flag_updates') {
          this.handleRedisFeatureUpdate(message);
        }
      });

      return subscriber;
    } catch (error) {
      logger.error('Error setting up Redis subscription:', error);
      return null;
    }
  }

  // Utility methods
  getSubscribedUsers() {
    return Array.from(this.subscribedUsers.keys());
  }

  getUserSubscriptions(userId) {
    return Array.from(this.subscribedUsers.get(userId) || []);
  }

  isUserSubscribed(userId, featureName) {
    const subscriptions = this.subscribedUsers.get(userId);
    if (!subscriptions) return false;

    return subscriptions.has(`feature:${featureName}`);
  }

  getFeatureUpdateCount() {
    return this.featureUpdates.size;
  }

  // Cleanup
  cleanup() {
    this.subscribedUsers.clear();
    this.featureUpdates.clear();
  }
}

module.exports = new FeatureFlagHandler();