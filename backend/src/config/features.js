const redis = require('./redis');
const logger = require('../utils/logger');

class FeatureFlags {
  constructor() {
    this.features = new Map();
    this.defaultFeatures = {
      // Core Features
      LOCATION_BASED_CHAT: true,
      AUDIO_CALLS: true,
      VIDEO_CALLS: true,
      SCREEN_SHARING: true,
      SCREEN_RECORDING: true,
      GROUP_CHATS: true,
      CHANNELS: true,
      BROADCASTS: true,
      
      // Social Features
      ANONYMOUS_CHAT: false,
      STORY_SHARING: true,
      EVENT_CREATION: true,
      LOCATION_HISTORY: true,
      FRIEND_REQUESTS: true,
      BLOCK_USERS: true,
      
      // AI & Moderation
      AI_MODERATION: true,
      TRANSLATION: true,
      VOICE_MESSAGES: true,
      CONTENT_FILTERING: true,
      SPAM_DETECTION: true,
      
      // Media Features
      IMAGE_SHARING: true,
      VIDEO_SHARING: true,
      AUDIO_SHARING: true,
      FILE_SHARING: true,
      MEDIA_COMPRESSION: true,
      
      // Privacy & Security
      END_TO_END_ENCRYPTION: true,
      PRIVATE_CHATS: true,
      SELF_DESTRUCTING_MESSAGES: true,
      TWO_FACTOR_AUTH: true,
      PRIVACY_CONTROLS: true,
      
      // Performance Features
      MESSAGE_CACHING: true,
      PUSH_NOTIFICATIONS: true,
      OFFLINE_MESSAGING: true,
      MESSAGE_SYNC: true,
      
      // Admin Features
      ADMIN_PANEL: true,
      USER_MANAGEMENT: true,
      CONTENT_MODERATION: true,
      ANALYTICS_DASHBOARD: true,
      FEATURE_ROLLOUT: true
    };
    
    this.initialize();
  }

  async initialize() {
    try {
      // Load default features
      for (const [feature, enabled] of Object.entries(this.defaultFeatures)) {
        this.features.set(feature, enabled);
      }

      // Load custom features from Redis if available
      await this.loadFromRedis();
      
      logger.info('Feature flags initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize feature flags:', error);
      // Continue with default features
    }
  }

  async loadFromRedis() {
    try {
      const features = await redis.hgetall('feature_flags');
      if (features && Object.keys(features).length > 0) {
        for (const [feature, value] of Object.entries(features)) {
          this.features.set(feature, value === 'true');
        }
        logger.info('Feature flags loaded from Redis');
      }
    } catch (error) {
      logger.warn('Failed to load feature flags from Redis:', error.message);
    }
  }

  async saveToRedis() {
    try {
      const features = {};
      for (const [feature, enabled] of this.features) {
        features[feature] = enabled.toString();
      }
      
      await redis.hset('feature_flags', features);
      logger.info('Feature flags saved to Redis');
      
    } catch (error) {
      logger.error('Failed to save feature flags to Redis:', error);
    }
  }

  // Check if a feature is enabled
  isEnabled(featureName) {
    return this.features.get(featureName) || false;
  }

  // Enable a feature
  async enableFeature(featureName) {
    this.features.set(featureName, true);
    await this.saveToRedis();
    logger.info(`Feature ${featureName} enabled`);
    
    // Emit feature change event
    await this.emitFeatureChange(featureName, true);
  }

  // Disable a feature
  async disableFeature(featureName) {
    this.features.set(featureName, false);
    await this.saveToRedis();
    logger.info(`Feature ${featureName} disabled`);
    
    // Emit feature change event
    await this.emitFeatureChange(featureName, false);
  }

  // Toggle a feature
  async toggleFeature(featureName) {
    const currentState = this.isEnabled(featureName);
    if (currentState) {
      await this.disableFeature(featureName);
    } else {
      await this.enableFeature(featureName);
    }
    return !currentState;
  }

  // Set feature with custom value
  async setFeature(featureName, enabled) {
    this.features.set(featureName, Boolean(enabled));
    await this.saveToRedis();
    logger.info(`Feature ${featureName} set to ${enabled}`);
    
    // Emit feature change event
    await this.emitFeatureChange(featureName, Boolean(enabled));
  }

  // Get all features
  getAllFeatures() {
    const features = {};
    for (const [feature, enabled] of this.features) {
      features[feature] = enabled;
    }
    return features;
  }

  // Get enabled features only
  getEnabledFeatures() {
    const enabledFeatures = [];
    for (const [feature, enabled] of this.features) {
      if (enabled) {
        enabledFeatures.push(feature);
      }
    }
    return enabledFeatures;
  }

  // Get disabled features only
  getDisabledFeatures() {
    const disabledFeatures = [];
    for (const [feature, enabled] of this.features) {
      if (!enabled) {
        disabledFeatures.push(feature);
      }
    }
    return disabledFeatures;
  }

  // Check multiple features
  areEnabled(featureNames) {
    if (!Array.isArray(featureNames)) {
      featureNames = [featureNames];
    }
    
    return featureNames.every(feature => this.isEnabled(feature));
  }

  // Check if any of the features are enabled
  isAnyEnabled(featureNames) {
    if (!Array.isArray(featureNames)) {
      featureNames = [featureNames];
    }
    
    return featureNames.some(feature => this.isEnabled(feature));
  }

  // Add new feature
  async addFeature(featureName, enabled = false) {
    if (this.features.has(featureName)) {
      throw new Error(`Feature ${featureName} already exists`);
    }
    
    this.features.set(featureName, enabled);
    await this.saveToRedis();
    logger.info(`New feature ${featureName} added with state: ${enabled}`);
    
    return enabled;
  }

  // Remove feature
  async removeFeature(featureName) {
    if (!this.features.has(featureName)) {
      throw new Error(`Feature ${featureName} does not exist`);
    }
    
    this.features.delete(featureName);
    await this.saveToRedis();
    logger.info(`Feature ${featureName} removed`);
  }

  // Bulk update features
  async bulkUpdate(featureUpdates) {
    try {
      for (const [feature, enabled] of Object.entries(featureUpdates)) {
        this.features.set(feature, Boolean(enabled));
      }
      
      await this.saveToRedis();
      logger.info(`Bulk updated ${Object.keys(featureUpdates).length} features`);
      
      // Emit bulk feature change event
      await this.emitBulkFeatureChange(featureUpdates);
      
    } catch (error) {
      logger.error('Failed to bulk update features:', error);
      throw error;
    }
  }

  // Reset to defaults
  async resetToDefaults() {
    try {
      this.features.clear();
      
      for (const [feature, enabled] of Object.entries(this.defaultFeatures)) {
        this.features.set(feature, enabled);
      }
      
      await this.saveToRedis();
      logger.info('Feature flags reset to defaults');
      
      // Emit reset event
      await this.emitFeatureReset();
      
    } catch (error) {
      logger.error('Failed to reset feature flags:', error);
      throw error;
    }
  }

  // Get feature metadata
  getFeatureMetadata(featureName) {
    const metadata = {
      name: featureName,
      enabled: this.isEnabled(featureName),
      category: this.getFeatureCategory(featureName),
      description: this.getFeatureDescription(featureName),
      version: this.getFeatureVersion(featureName),
      dependencies: this.getFeatureDependencies(featureName)
    };
    
    return metadata;
  }

  // Get feature category
  getFeatureCategory(featureName) {
    const categories = {
      'LOCATION_BASED_CHAT': 'core',
      'AUDIO_CALLS': 'communication',
      'VIDEO_CALLS': 'communication',
      'SCREEN_SHARING': 'communication',
      'SCREEN_RECORDING': 'communication',
      'GROUP_CHATS': 'social',
      'CHANNELS': 'social',
      'BROADCASTS': 'social',
      'ANONYMOUS_CHAT': 'social',
      'STORY_SHARING': 'social',
      'EVENT_CREATION': 'social',
      'LOCATION_HISTORY': 'privacy',
      'AI_MODERATION': 'ai',
      'TRANSLATION': 'ai',
      'VOICE_MESSAGES': 'media',
      'CONTENT_FILTERING': 'moderation',
      'SPAM_DETECTION': 'moderation',
      'IMAGE_SHARING': 'media',
      'VIDEO_SHARING': 'media',
      'AUDIO_SHARING': 'media',
      'FILE_SHARING': 'media',
      'END_TO_END_ENCRYPTION': 'security',
      'PRIVATE_CHATS': 'privacy',
      'SELF_DESTRUCTING_MESSAGES': 'privacy',
      'TWO_FACTOR_AUTH': 'security',
      'PRIVACY_CONTROLS': 'privacy',
      'MESSAGE_CACHING': 'performance',
      'PUSH_NOTIFICATIONS': 'performance',
      'OFFLINE_MESSAGING': 'performance',
      'MESSAGE_SYNC': 'performance',
      'ADMIN_PANEL': 'admin',
      'USER_MANAGEMENT': 'admin',
      'CONTENT_MODERATION': 'admin',
      'ANALYTICS_DASHBOARD': 'admin',
      'FEATURE_ROLLOUT': 'admin'
    };
    
    return categories[featureName] || 'other';
  }

  // Get feature description
  getFeatureDescription(featureName) {
    const descriptions = {
      'LOCATION_BASED_CHAT': 'Enable location-based chat functionality',
      'AUDIO_CALLS': 'Enable audio calling between users',
      'VIDEO_CALLS': 'Enable video calling between users',
      'SCREEN_SHARING': 'Enable screen sharing during calls',
      'SCREEN_RECORDING': 'Enable screen recording functionality',
      'GROUP_CHATS': 'Enable group chat creation and management',
      'CHANNELS': 'Enable public and private channels',
      'BROADCASTS': 'Enable broadcast messaging to multiple users',
      'ANONYMOUS_CHAT': 'Enable anonymous chat mode',
      'STORY_SHARING': 'Enable story sharing functionality',
      'EVENT_CREATION': 'Enable event creation and management',
      'LOCATION_HISTORY': 'Track and store user location history',
      'AI_MODERATION': 'Use AI for content moderation',
      'TRANSLATION': 'Enable message translation',
      'VOICE_MESSAGES': 'Enable voice message recording and sharing',
      'CONTENT_FILTERING': 'Filter inappropriate content',
      'SPAM_DETECTION': 'Detect and prevent spam messages',
      'IMAGE_SHARING': 'Enable image sharing in chats',
      'VIDEO_SHARING': 'Enable video sharing in chats',
      'AUDIO_SHARING': 'Enable audio file sharing in chats',
      'FILE_SHARING': 'Enable general file sharing in chats',
      'END_TO_END_ENCRYPTION': 'Enable end-to-end message encryption',
      'PRIVATE_CHATS': 'Enable private one-on-one chats',
      'SELF_DESTRUCTING_MESSAGES': 'Enable self-destructing messages',
      'TWO_FACTOR_AUTH': 'Enable two-factor authentication',
      'PRIVACY_CONTROLS': 'Enable user privacy control settings',
      'MESSAGE_CACHING': 'Cache messages for better performance',
      'PUSH_NOTIFICATIONS': 'Send push notifications to users',
      'OFFLINE_MESSAGING': 'Store messages for offline users',
      'MESSAGE_SYNC': 'Synchronize messages across devices',
      'ADMIN_PANEL': 'Enable admin panel access',
      'USER_MANAGEMENT': 'Enable user management tools',
      'CONTENT_MODERATION': 'Enable content moderation tools',
      'ANALYTICS_DASHBOARD': 'Enable analytics dashboard',
      'FEATURE_ROLLOUT': 'Enable feature rollout management'
    };
    
    return descriptions[featureName] || 'No description available';
  }

  // Get feature version
  getFeatureVersion(featureName) {
    const versions = {
      'LOCATION_BASED_CHAT': '1.0.0',
      'AUDIO_CALLS': '1.0.0',
      'VIDEO_CALLS': '1.0.0',
      'SCREEN_SHARING': '1.1.0',
      'SCREEN_RECORDING': '1.2.0',
      'GROUP_CHATS': '1.0.0',
      'CHANNELS': '1.1.0',
      'BROADCASTS': '1.2.0',
      'ANONYMOUS_CHAT': '1.3.0',
      'STORY_SHARING': '1.3.0',
      'EVENT_CREATION': '1.4.0',
      'LOCATION_HISTORY': '1.4.0',
      'AI_MODERATION': '1.5.0',
      'TRANSLATION': '1.5.0',
      'VOICE_MESSAGES': '1.6.0',
      'CONTENT_FILTERING': '1.6.0',
      'SPAM_DETECTION': '1.6.0',
      'IMAGE_SHARING': '1.0.0',
      'VIDEO_SHARING': '1.1.0',
      'AUDIO_SHARING': '1.2.0',
      'FILE_SHARING': '1.2.0',
      'END_TO_END_ENCRYPTION': '1.7.0',
      'PRIVATE_CHATS': '1.0.0',
      'SELF_DESTRUCTING_MESSAGES': '1.7.0',
      'TWO_FACTOR_AUTH': '1.7.0',
      'PRIVACY_CONTROLS': '1.7.0',
      'MESSAGE_CACHING': '1.8.0',
      'PUSH_NOTIFICATIONS': '1.8.0',
      'OFFLINE_MESSAGING': '1.8.0',
      'MESSAGE_SYNC': '1.8.0',
      'ADMIN_PANEL': '1.9.0',
      'USER_MANAGEMENT': '1.9.0',
      'CONTENT_MODERATION': '1.9.0',
      'ANALYTICS_DASHBOARD': '1.9.0',
      'FEATURE_ROLLOUT': '1.9.0'
    };
    
    return versions[featureName] || '1.0.0';
  }

  // Get feature dependencies
  getFeatureDependencies(featureName) {
    const dependencies = {
      'VIDEO_CALLS': ['AUDIO_CALLS'],
      'SCREEN_SHARING': ['VIDEO_CALLS'],
      'SCREEN_RECORDING': ['SCREEN_SHARING'],
      'GROUP_CHATS': ['LOCATION_BASED_CHAT'],
      'CHANNELS': ['GROUP_CHATS'],
      'BROADCASTS': ['CHANNELS'],
      'STORY_SHARING': ['IMAGE_SHARING', 'VIDEO_SHARING'],
      'EVENT_CREATION': ['LOCATION_BASED_CHAT'],
      'AI_MODERATION': ['CONTENT_FILTERING'],
      'TRANSLATION': ['AI_MODERATION'],
      'CONTENT_FILTERING': ['MESSAGE_CACHING'],
      'SPAM_DETECTION': ['CONTENT_FILTERING'],
      'SELF_DESTRUCTING_MESSAGES': ['END_TO_END_ENCRYPTION'],
      'OFFLINE_MESSAGING': ['MESSAGE_CACHING'],
      'MESSAGE_SYNC': ['OFFLINE_MESSAGING'],
      'CONTENT_MODERATION': ['AI_MODERATION'],
      'ANALYTICS_DASHBOARD': ['MESSAGE_CACHING'],
      'FEATURE_ROLLOUT': ['ADMIN_PANEL']
    };
    
    return dependencies[featureName] || [];
  }

  // Emit feature change event
  async emitFeatureChange(featureName, enabled) {
    try {
      await redis.publish('feature_changes', JSON.stringify({
        feature: featureName,
        enabled,
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('Failed to emit feature change event:', error);
    }
  }

  // Emit bulk feature change event
  async emitBulkFeatureChange(featureUpdates) {
    try {
      await redis.publish('feature_bulk_changes', JSON.stringify({
        updates: featureUpdates,
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('Failed to emit bulk feature change event:', error);
    }
  }

  // Emit feature reset event
  async emitFeatureReset() {
    try {
      await redis.publish('feature_reset', JSON.stringify({
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('Failed to emit feature reset event:', error);
    }
  }

  // Health check
  async healthCheck() {
    try {
      const totalFeatures = this.features.size;
      const enabledFeatures = this.getEnabledFeatures().length;
      const disabledFeatures = this.getDisabledFeatures().length;
      
      return {
        status: 'healthy',
        totalFeatures,
        enabledFeatures,
        disabledFeatures,
        lastUpdated: Date.now()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = new FeatureFlags();