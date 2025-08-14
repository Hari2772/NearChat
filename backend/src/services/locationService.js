const User = require('../models/User');
const TierData = require('../models/TierData');
const Analytics = require('../models/Analytics');
const features = require('../config/features');
const logger = require('../utils/logger');
const redis = require('../config/redis');

class LocationService {
  constructor() {
    this.tierBoundaries = new Map(); // tier -> boundary data
    this.locationCache = new Map(); // userId -> cached location data
    this.updateInterval = 300000; // 5 minutes
    this.lastGlobalUpdate = Date.now();
  }

  // Calculate distance between two points using Haversine formula
  calculateDistance(point1, point2) {
    try {
      if (!point1 || !point2 || !point1.coordinates || !point2.coordinates) {
        return 0;
      }

      const [lon1, lat1] = point1.coordinates;
      const [lon2, lat2] = point2.coordinates;

      // Validate coordinates
      if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90 ||
          lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) {
        return 0;
      }

      const R = 6371e3; // Earth's radius in meters
      const φ1 = (lat1 * Math.PI) / 180;
      const φ2 = (lat2 * Math.PI) / 180;
      const Δφ = ((lat2 - lat1) * Math.PI) / 180;
      const Δλ = ((lon2 - lon1) * Math.PI) / 180;

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

  // Calculate proximity tier based on location and density
  async calculateProximityTier(location, userId = null) {
    try {
      if (!location || !location.coordinates) {
        return 0;
      }

      // Get nearby users to determine density
      const nearbyUsers = await this.getNearbyUsers(location, 10000); // 10km radius
      const density = nearbyUsers.length;

      // Calculate tier based on density and location
      let tier = this.calculateTierFromDensity(density, location);

      // Apply user-specific adjustments
      if (userId) {
        tier = await this.applyUserTierAdjustments(userId, tier, location);
      }

      return Math.max(1, Math.min(6, tier));
    } catch (error) {
      logger.error('Error calculating proximity tier:', error);
      return 1;
    }
  }

  // Calculate tier based on user density
  calculateTierFromDensity(density, location) {
    try {
      // Base tier calculation on density
      // Tier 1: Very high density (100+ users in 10km)
      // Tier 2: High density (50-99 users in 10km)
      // Tier 3: Medium density (20-49 users in 10km)
      // Tier 4: Low density (10-19 users in 10km)
      // Tier 5: Very low density (5-9 users in 10km)
      // Tier 6: Sparse (0-4 users in 10km)

      if (density >= 100) return 1;
      if (density >= 50) return 2;
      if (density >= 20) return 3;
      if (density >= 10) return 4;
      if (density >= 5) return 5;
      return 6;
    } catch (error) {
      logger.error('Error calculating tier from density:', error);
      return 3; // Default to medium density
    }
  }

  // Apply user-specific tier adjustments
  async applyUserTierAdjustments(userId, baseTier, location) {
    try {
      const user = await User.findById(userId);
      if (!user) return baseTier;

      let adjustedTier = baseTier;

      // Premium users get better tier placement
      if (user.roles && user.roles.includes('premium')) {
        adjustedTier = Math.max(1, adjustedTier - 1);
      }

      // Active users get better tier placement
      if (user.statistics && user.statistics.totalMessages > 1000) {
        adjustedTier = Math.max(1, adjustedTier - 1);
      }

      // New users get slightly better tier placement
      const daysSinceJoin = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceJoin < 7) {
        adjustedTier = Math.max(1, adjustedTier - 1);
      }

      return adjustedTier;
    } catch (error) {
      logger.error('Error applying user tier adjustments:', error);
      return baseTier;
    }
  }

  // Get nearby users within specified radius
  async getNearbyUsers(location, radius = 10000, options = {}) {
    try {
      if (!location || !location.coordinates) {
        return [];
      }

      const { excludeUserId, limit = 100, tier, privacy = 'public' } = options;

      // Build query
      const query = {
        location: {
          $near: {
            $geometry: location,
            $maxDistance: radius
          }
        },
        status: 'active'
      };

      // Exclude specific user
      if (excludeUserId) {
        query._id = { $ne: excludeUserId };
      }

      // Filter by tier
      if (tier) {
        query.proximityTier = tier;
      }

      // Apply privacy filters
      if (privacy === 'public') {
        query['privacy.locationVisibility'] = { $ne: 'hidden' };
      } else if (privacy === 'friends') {
        // This would require additional logic to check friendship status
        query['privacy.locationVisibility'] = { $in: ['public', 'friends'] };
      }

      const nearbyUsers = await User.find(query)
        .select('username displayName avatar location proximityTier isOnline lastSeen')
        .limit(limit)
        .sort({ 'location.coordinates': 1 });

      // Calculate distances and add to results
      return nearbyUsers.map(user => {
        const distance = this.calculateDistance(location, user.location);
        return {
          ...user.toObject(),
          distance: Math.round(distance)
        };
      });
    } catch (error) {
      logger.error('Error getting nearby users:', error);
      return [];
    }
  }

  // Update user location and proximity tier
  async updateUserLocation(userId, locationData) {
    try {
      if (!features.isEnabled('location_sharing')) {
        throw new Error('Location sharing feature is disabled');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate location data
      const { latitude, longitude, accuracy, timestamp } = locationData;
      
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new Error('Invalid coordinates');
      }

      // Create location object
      const location = {
        type: 'Point',
        coordinates: [longitude, latitude],
        accuracy: accuracy || 0,
        timestamp: timestamp || new Date()
      };

      // Calculate new proximity tier
      const newTier = await this.calculateProximityTier(location, userId);

      // Update user
      user.location = location;
      user.proximityTier = newTier;
      user.lastSeen = new Date();

      await user.save();

      // Update location cache
      this.locationCache.set(userId, {
        location,
        tier: newTier,
        timestamp: Date.now()
      });

      // Update tier data
      await this.updateTierData(newTier, location);

      // Update analytics
      await this.updateLocationAnalytics(userId, location, newTier);

      return {
        location: user.location,
        tier: newTier,
        nearbyUsers: await this.getNearbyUsers(location, 5000, { excludeUserId: userId, limit: 20 })
      };
    } catch (error) {
      logger.error('Error updating user location:', error);
      throw error;
    }
  }

  // Update tier data with new user
  async updateTierData(tier, location) {
    try {
      const tierData = await TierData.findOne({ tier });
      
      if (tierData) {
        // Update existing tier data
        tierData.statistics.totalUsers += 1;
        tierData.statistics.onlineUsers += 1;
        tierData.lastUpdated = new Date();
        
        // Add location hotspot if it doesn't exist
        const hotspotExists = tierData.locationPatterns.hotspots.some(
          hotspot => this.calculateDistance(location, hotspot) < 1000
        );
        
        if (!hotspotExists) {
          tierData.locationPatterns.hotspots.push({
            coordinates: location.coordinates,
            userCount: 1,
            lastUpdated: new Date()
          });
        }
        
        await tierData.save();
      } else {
        // Create new tier data
        const newTierData = new TierData({
          tier,
          statistics: {
            totalUsers: 1,
            activeUsers: 1,
            onlineUsers: 1
          },
          locationPatterns: {
            hotspots: [{
              coordinates: location.coordinates,
              userCount: 1,
              lastUpdated: new Date()
            }]
          },
          lastUpdated: new Date()
        });
        
        await newTierData.save();
      }
    } catch (error) {
      logger.error('Error updating tier data:', error);
    }
  }

  // Update location analytics
  async updateLocationAnalytics(userId, location, tier) {
    try {
      await Analytics.findOneAndUpdate(
        { name: 'location_updates' },
        {
          $inc: { 
            'metrics.location.totalUpdates': 1,
            [`metrics.location.tier${tier}Updates`]: 1
          },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      // Update user-specific analytics
      await Analytics.findOneAndUpdate(
        { name: `user_${userId}_location` },
        {
          $push: {
            'metrics.location.history': {
              coordinates: location.coordinates,
              tier,
              timestamp: location.timestamp
            }
          },
          $set: { 
            'metrics.location.currentTier': tier,
            'metrics.location.lastUpdate': new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      logger.error('Error updating location analytics:', error);
    }
  }

  // Get location statistics for a specific area
  async getLocationStatistics(center, radius = 10000) {
    try {
      const nearbyUsers = await this.getNearbyUsers(center, radius);
      
      const statistics = {
        totalUsers: nearbyUsers.length,
        onlineUsers: nearbyUsers.filter(user => user.isOnline).length,
        tierDistribution: {},
        averageDistance: 0,
        density: nearbyUsers.length / (Math.PI * Math.pow(radius / 1000, 2)) // users per km²
      };

      // Calculate tier distribution
      nearbyUsers.forEach(user => {
        const tier = user.proximityTier;
        statistics.tierDistribution[tier] = (statistics.tierDistribution[tier] || 0) + 1;
      });

      // Calculate average distance
      if (nearbyUsers.length > 0) {
        const totalDistance = nearbyUsers.reduce((sum, user) => sum + user.distance, 0);
        statistics.averageDistance = Math.round(totalDistance / nearbyUsers.length);
      }

      return statistics;
    } catch (error) {
      logger.error('Error getting location statistics:', error);
      return {
        totalUsers: 0,
        onlineUsers: 0,
        tierDistribution: {},
        averageDistance: 0,
        density: 0
      };
    }
  }

  // Find optimal meeting points for a group of users
  async findOptimalMeetingPoints(userIds, options = {}) {
    try {
      const { maxDistance = 5000, maxPoints = 3 } = options;

      // Get user locations
      const users = await User.find({ _id: { $in: userIds } })
        .select('location displayName');

      if (users.length < 2) {
        throw new Error('At least 2 users required for meeting point calculation');
      }

      // Calculate centroid
      const centroid = this.calculateCentroid(users.map(u => u.location));

      // Find nearby public places or calculate optimal points
      const meetingPoints = [];

      // Add centroid as first option
      meetingPoints.push({
        type: 'centroid',
        coordinates: centroid.coordinates,
        description: 'Central meeting point',
        averageDistance: this.calculateAverageDistance(centroid, users.map(u => u.location))
      });

      // Find other optimal points based on user distribution
      const additionalPoints = this.calculateAdditionalMeetingPoints(users, maxDistance);
      meetingPoints.push(...additionalPoints);

      // Sort by average distance and limit results
      return meetingPoints
        .sort((a, b) => a.averageDistance - b.averageDistance)
        .slice(0, maxPoints);
    } catch (error) {
      logger.error('Error finding optimal meeting points:', error);
      return [];
    }
  }

  // Calculate centroid of multiple locations
  calculateCentroid(locations) {
    try {
      if (!locations || locations.length === 0) {
        return null;
      }

      const validLocations = locations.filter(loc => loc && loc.coordinates);
      if (validLocations.length === 0) {
        return null;
      }

      const totalLon = validLocations.reduce((sum, loc) => sum + loc.coordinates[0], 0);
      const totalLat = validLocations.reduce((sum, loc) => sum + loc.coordinates[1], 0);

      return {
        type: 'Point',
        coordinates: [totalLon / validLocations.length, totalLat / validLocations.length]
      };
    } catch (error) {
      logger.error('Error calculating centroid:', error);
      return null;
    }
  }

  // Calculate average distance from a point to multiple locations
  calculateAverageDistance(point, locations) {
    try {
      if (!point || !locations || locations.length === 0) {
        return 0;
      }

      const totalDistance = locations.reduce((sum, location) => {
        return sum + this.calculateDistance(point, location);
      }, 0);

      return Math.round(totalDistance / locations.length);
    } catch (error) {
      logger.error('Error calculating average distance:', error);
      return 0;
    }
  }

  // Calculate additional meeting points
  calculateAdditionalMeetingPoints(users, maxDistance) {
    try {
      const points = [];
      
      // Find users at the edges of the group
      const locations = users.map(u => u.location);
      const centroid = this.calculateCentroid(locations);
      
      if (!centroid) return points;

      // Find users furthest from centroid
      const distances = locations.map(location => ({
        location,
        distance: this.calculateDistance(centroid, location)
      })).sort((a, b) => b.distance - a.distance);

      // Create meeting points at strategic locations
      const edgeUsers = distances.slice(0, Math.min(3, distances.length));
      
      edgeUsers.forEach((user, index) => {
        if (user.distance > maxDistance / 2) {
          // Create a meeting point between centroid and edge user
          const midPoint = this.calculateMidPoint(centroid, user.location);
          
          points.push({
            type: `edge_${index + 1}`,
            coordinates: midPoint.coordinates,
            description: `Meeting point near ${users.find(u => 
              this.calculateDistance(u.location, user.location) < 100
            )?.displayName || 'user'}`,
            averageDistance: this.calculateAverageDistance(midPoint, locations)
          });
        }
      });

      return points;
    } catch (error) {
      logger.error('Error calculating additional meeting points:', error);
      return [];
    }
  }

  // Calculate midpoint between two locations
  calculateMidPoint(point1, point2) {
    try {
      if (!point1 || !point2 || !point1.coordinates || !point2.coordinates) {
        return null;
      }

      const [lon1, lat1] = point1.coordinates;
      const [lon2, lat2] = point2.coordinates;

      return {
        type: 'Point',
        coordinates: [(lon1 + lon2) / 2, (lat1 + lat2) / 2]
      };
    } catch (error) {
      logger.error('Error calculating midpoint:', error);
      return null;
    }
  }

  // Start periodic updates
  startPeriodicUpdates() {
    setInterval(async () => {
      try {
        await this.updateGlobalLocationAnalytics();
        this.lastGlobalUpdate = Date.now();
      } catch (error) {
        logger.error('Error in periodic location updates:', error);
      }
    }, this.updateInterval);
  }

  // Update global location analytics
  async updateGlobalLocationAnalytics() {
    try {
      const totalUsersWithLocation = await User.countDocuments({ location: { $exists: true } });
      const onlineUsers = await User.countDocuments({ 
        location: { $exists: true },
        isOnline: true 
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'global_location' },
        {
          $set: {
            'metrics.location.totalUsersWithLocation': totalUsersWithLocation,
            'metrics.location.onlineUsers': onlineUsers,
            'metrics.location.lastUpdate': new Date()
          }
        },
        { upsert: true }
      );

      // Clean up old cache entries
      this.cleanupCache();

    } catch (error) {
      logger.error('Error updating global location analytics:', error);
    }
  }

  // Clean up old cache entries
  cleanupCache() {
    try {
      const now = Date.now();
      const maxAge = 1800000; // 30 minutes

      for (const [userId, data] of this.locationCache.entries()) {
        if (now - data.timestamp > maxAge) {
          this.locationCache.delete(userId);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up cache:', error);
    }
  }

  // Utility methods
  getUserLocation(userId) {
    return this.locationCache.get(userId);
  }

  getTotalUsersWithLocation() {
    return this.locationCache.size;
  }

  getTierBoundaries() {
    return Array.from(this.tierBoundaries.entries());
  }

  // Cleanup
  cleanup() {
    this.tierBoundaries.clear();
    this.locationCache.clear();
  }
}

module.exports = new LocationService();