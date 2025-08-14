const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const features = require('../config/features');

const userSchema = new mongoose.Schema({
  // Basic Information
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Please provide a valid email address'
    }
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    validate: {
      validator: function(username) {
        return /^[a-zA-Z0-9_]+$/.test(username);
      },
      message: 'Username can only contain letters, numbers, and underscores'
    }
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  avatar: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: 500,
    default: ''
  },
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(date) {
        return date <= new Date() && date >= new Date('1900-01-01');
      },
      message: 'Please provide a valid date of birth'
    }
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say'],
    default: 'prefer-not-to-say'
  },

  // Authentication
  password: {
    type: String,
    required: function() {
      return !this.googleId && !this.facebookId;
    },
    minlength: 8,
    validate: {
      validator: function(password) {
        if (!password) return true; // Skip validation if no password (OAuth)
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
        return hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
      },
      message: 'Password must contain uppercase, lowercase, number, and special character'
    }
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  facebookId: {
    type: String,
    sparse: true,
    unique: true
  },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  twoFactorSecret: String,
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,

  // Location & Proximity
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function(coords) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 &&
                 coords[1] >= -90 && coords[1] <= 90;
        },
        message: 'Invalid coordinates'
      }
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  proximityTier: {
    type: Number,
    enum: [1, 2, 3, 4, 5, 6],
    default: 1,
    validate: {
      validator: function(tier) {
        return tier >= 1 && tier <= 6;
      },
      message: 'Proximity tier must be between 1 and 6'
    }
  },
  isLocationVisible: {
    type: Boolean,
    default: true
  },
  locationHistory: [{
    coordinates: {
      type: [Number],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    accuracy: Number
  }],

  // Social Features
  friends: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'blocked'],
      default: 'pending'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  friendRequests: [{
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    sentAt: {
      type: Date,
      default: Date.now
    }
  }],
  blockedUsers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    blockedAt: {
      type: Date,
      default: Date.now
    },
    reason: String
  }],
  streaks: [{
    friendId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    count: {
      type: Number,
      default: 0
    },
    lastInteraction: {
      type: Date,
      default: Date.now
    },
    startedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Privacy & Settings
  privacySettings: {
    profileVisibility: {
      type: String,
      enum: ['public', 'friends', 'private'],
      default: 'public'
    },
    locationVisibility: {
      type: String,
      enum: ['everyone', 'friends', 'nobody'],
      default: 'friends'
    },
    onlineStatus: {
      type: String,
      enum: ['visible', 'friends', 'hidden'],
      default: 'visible'
    },
    allowFriendRequests: {
      type: Boolean,
      default: true
    },
    allowMessages: {
      type: String,
      enum: ['everyone', 'friends', 'nobody'],
      default: 'friends'
    },
    allowCalls: {
      type: String,
      enum: ['everyone', 'friends', 'nobody'],
      default: 'friends'
    }
  },
  notificationSettings: {
    pushNotifications: {
      type: Boolean,
      default: true
    },
    emailNotifications: {
      type: Boolean,
      default: true
    },
    friendRequests: {
      type: Boolean,
      default: true
    },
    messages: {
      type: Boolean,
      default: true
    },
    calls: {
      type: Boolean,
      default: true
    },
    locationUpdates: {
      type: Boolean,
      default: false
    }
  },

  // Status & Activity
  isActive: {
    type: Boolean,
    default: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  },
  lastLoginAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['online', 'away', 'busy', 'offline'],
    default: 'offline'
  },
  customStatus: {
    type: String,
    maxlength: 100
  },

  // Preferences
  language: {
    type: String,
    default: 'en',
    enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  theme: {
    type: String,
    enum: ['light', 'dark', 'auto'],
    default: 'auto'
  },

  // Statistics
  stats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    totalCalls: {
      type: Number,
      default: 0
    },
    totalCallDuration: {
      type: Number,
      default: 0
    },
    totalStories: {
      type: Number,
      default: 0
    },
    totalFriends: {
      type: Number,
      default: 0
    },
    joinDate: {
      type: Date,
      default: Date.now
    }
  },

  // Admin & Moderation
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin', 'superadmin'],
    default: 'user'
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: String,
  banExpiresAt: Date,
  moderationNotes: [{
    note: String,
    moderator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ location: '2dsphere' });
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ facebookId: 1 });
userSchema.index({ 'friends.userId': 1 });
userSchema.index({ 'blockedUsers.userId': 1 });
userSchema.index({ isOnline: 1, lastSeenAt: 1 });
userSchema.index({ proximityTier: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Virtuals
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.virtual('friendCount').get(function() {
  return this.friends.filter(friend => friend.status === 'accepted').length;
});

userSchema.virtual('pendingFriendRequests').get(function() {
  return this.friendRequests.filter(request => request.status === 'pending').length;
});

// Pre-save middleware
userSchema.pre('save', async function(next) {
  try {
    // Hash password if modified
    if (this.isModified('password') && this.password) {
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      this.password = await bcrypt.hash(this.password, saltRounds);
    }

    // Set display name if not provided
    if (!this.displayName) {
      this.displayName = this.username;
    }

    // Update last seen if online status changed
    if (this.isModified('isOnline') && this.isOnline) {
      this.lastSeenAt = new Date();
    }

    // Update proximity tier based on location
    if (this.isModified('location.coordinates')) {
      this.updateProximityTier();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-validate middleware
userSchema.pre('validate', function(next) {
  // Ensure at least one authentication method
  if (!this.password && !this.googleId && !this.facebookId) {
    this.invalidate('password', 'At least one authentication method is required');
  }

  // Validate age for certain features
  if (features.isEnabled('AGE_RESTRICTED_FEATURES') && this.age < 13) {
    this.invalidate('dateOfBirth', 'User must be at least 13 years old');
  }

  next();
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.updateProximityTier = function() {
  // Calculate proximity tier based on location density
  // This is a simplified calculation - in production, you'd use actual proximity data
  if (this.location && this.location.coordinates) {
    // Placeholder logic - replace with actual density calculation
    const density = Math.random(); // Replace with actual density calculation
    if (density > 0.8) this.proximityTier = 1;
    else if (density > 0.6) this.proximityTier = 2;
    else if (density > 0.4) this.proximityTier = 3;
    else if (density > 0.2) this.proximityTier = 4;
    else if (density > 0.1) this.proximityTier = 5;
    else this.proximityTier = 6;
  }
};

userSchema.methods.addFriend = function(friendId) {
  const existingFriend = this.friends.find(f => f.userId.toString() === friendId.toString());
  if (existingFriend) {
    throw new Error('Friend relationship already exists');
  }
  
  this.friends.push({
    userId: friendId,
    status: 'pending'
  });
  
  return this.save();
};

userSchema.methods.acceptFriendRequest = function(friendId) {
  const friendRequest = this.friendRequests.find(r => r.from.toString() === friendId.toString());
  if (!friendRequest) {
    throw new Error('Friend request not found');
  }
  
  friendRequest.status = 'accepted';
  
  // Add to friends list
  this.friends.push({
    userId: friendId,
    status: 'accepted'
  });
  
  return this.save();
};

userSchema.methods.blockUser = function(userId, reason = '') {
  // Remove from friends and friend requests
  this.friends = this.friends.filter(f => f.userId.toString() !== userId.toString());
  this.friendRequests = this.friendRequests.filter(r => r.from.toString() !== userId.toString());
  
  // Add to blocked users
  this.blockedUsers.push({
    userId,
    reason
  });
  
  return this.save();
};

userSchema.methods.isBlocked = function(userId) {
  return this.blockedUsers.some(b => b.userId.toString() === userId.toString());
};

userSchema.methods.canInteractWith = function(userId) {
  if (this.isBlocked(userId)) return false;
  
  const friend = this.friends.find(f => f.userId.toString() === userId.toString());
  if (friend && friend.status === 'accepted') return true;
  
  // Check privacy settings
  if (this.privacySettings.allowMessages === 'everyone') return true;
  if (this.privacySettings.allowMessages === 'nobody') return false;
  
  return false;
};

userSchema.methods.updateLocation = function(coordinates, address = null) {
  this.location.coordinates = coordinates;
  if (address) {
    this.location.address = address;
  }
  this.location.lastUpdated = new Date();
  this.updateProximityTier();
  
  // Add to location history if feature is enabled
  if (features.isEnabled('LOCATION_HISTORY')) {
    this.locationHistory.push({
      coordinates,
      timestamp: new Date()
    });
    
    // Keep only last 100 location entries
    if (this.locationHistory.length > 100) {
      this.locationHistory = this.locationHistory.slice(-100);
    }
  }
  
  return this.save();
};

userSchema.methods.updateOnlineStatus = function(isOnline, status = 'online') {
  this.isOnline = isOnline;
  this.status = status;
  this.lastSeenAt = new Date();
  
  if (isOnline) {
    this.lastLoginAt = new Date();
  }
  
  return this.save();
};

// Static methods
userSchema.statics.findNearbyUsers = function(coordinates, maxDistance = 10000, limit = 50) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    },
    isActive: true,
    isLocationVisible: true
  })
  .select('username displayName avatar location proximityTier isOnline lastSeenAt')
  .limit(limit);
};

userSchema.statics.findByProximityTier = function(tier, coordinates = null, limit = 50) {
  let query = { proximityTier: tier, isActive: true };
  
  if (coordinates) {
    query.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        }
      }
    };
  }
  
  return this.find(query)
    .select('username displayName avatar location proximityTier isOnline lastSeenAt')
    .limit(limit);
};

userSchema.statics.findFriends = function(userId) {
  return this.findById(userId)
    .populate('friends.userId', 'username displayName avatar isOnline lastSeenAt')
    .then(user => {
      if (!user) throw new Error('User not found');
      return user.friends.filter(f => f.status === 'accepted');
    });
};

// Export model
module.exports = mongoose.model('User', userSchema);