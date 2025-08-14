const mongoose = require('mongoose');
const features = require('../config/features');

const storySchema = new mongoose.Schema({
  // Story Information
  title: {
    type: String,
    trim: true,
    maxlength: 100
  },
  
  content: {
    type: String,
    maxlength: 1000,
    trim: true
  },
  
  // Story Type
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'location', 'poll', 'question'],
    required: true
  },
  
  // Media Content
  media: {
    url: String,
    thumbnail: String,
    filename: String,
    mimeType: String,
    size: Number,
    duration: Number, // For video/audio
    dimensions: {
      width: Number,
      height: Number
    },
    format: {
      type: String,
      enum: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mp3', 'wav', 'ogg']
    },
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Location Story
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number],
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    },
    placeName: String,
    description: String
  },
  
  // Poll Story
  poll: {
    question: String,
    options: [{
      text: String,
      votes: {
        type: Number,
        default: 0
      },
      voters: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }]
    }],
    totalVotes: {
      type: Number,
      default: 0
    },
    isMultipleChoice: {
      type: Boolean,
      default: false
    },
    endsAt: Date
  },
  
  // Question Story
  question: {
    text: String,
    answers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      answer: String,
      answeredAt: {
        type: Date,
        default: Date.now
      }
    }],
    isAnonymous: {
      type: Boolean,
      default: false
    }
  },
  
  // Creator Information
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Privacy & Visibility
  privacy: {
    visibility: {
      type: String,
      enum: ['public', 'friends', 'custom', 'location'],
      default: 'friends'
    },
    allowedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    blockedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    locationRadius: {
      type: Number,
      default: 5000, // meters
      min: 100,
      max: 50000
    },
    isAnonymous: {
      type: Boolean,
      default: false
    }
  },
  
  // Story Settings
  settings: {
    allowReplies: {
      type: Boolean,
      default: true
    },
    allowReactions: {
      type: Boolean,
      default: true
    },
    allowSharing: {
      type: Boolean,
      default: true
    },
    allowScreenshots: {
      type: Boolean,
      default: true
    },
    music: {
      enabled: {
        type: Boolean,
        default: false
      },
      track: String,
      artist: String,
      startTime: Number,
      duration: Number
    },
    filters: {
      enabled: {
        type: Boolean,
        default: false
      },
      type: String,
      intensity: Number
    },
    stickers: [{
      id: String,
      position: {
        x: Number,
        y: Number
      },
      rotation: Number,
      scale: Number
    }],
    textStyle: {
      font: String,
      size: Number,
      color: String,
      alignment: {
        type: String,
        enum: ['left', 'center', 'right']
      },
      backgroundColor: String,
      shadow: Boolean
    }
  },
  
  // Engagement
  views: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    },
    viewDuration: Number, // in seconds
    isReplay: {
      type: Boolean,
      default: false
    }
  }],
  
  reactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  replies: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reply: String,
    repliedAt: {
      type: Date,
      default: Date.now
    },
    isAnonymous: {
      type: Boolean,
      default: false
    }
  }],
  
  shares: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sharedAt: {
      type: Date,
      default: Date.now
    },
    platform: String,
    isAnonymous: {
      type: Boolean,
      default: false
    }
  }],
  
  // Story Status
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'deleted'],
    default: 'published'
  },
  
  // Expiration
  expiresAt: {
    type: Date,
    required: true,
    default: function() {
      // Default to 24 hours from creation
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
  },
  
  // Moderation
  moderation: {
    isModerated: {
      type: Boolean,
      default: false
    },
    moderator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'flagged', 'removed'],
      default: 'pending'
    },
    flags: [{
      type: {
        type: String,
        enum: ['inappropriate-content', 'harassment', 'spam', 'copyright', 'other']
      },
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reportedAt: {
        type: Date,
        default: Date.now
      },
      description: String,
      status: {
        type: String,
        enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
        default: 'pending'
      }
    }],
    autoModeration: {
      enabled: {
        type: Boolean,
        default: features.isEnabled('AI_MODERATION')
      },
      score: Number,
      categories: [String],
      action: {
        type: String,
        enum: ['none', 'flag', 'block', 'remove'],
        default: 'none'
      }
    }
  },
  
  // AI Features
  aiAnalysis: {
    sentiment: {
      type: String,
      enum: ['positive', 'negative', 'neutral']
    },
    topics: [String],
    entities: [String],
    language: String,
    translation: {
      originalLanguage: String,
      translatedContent: String,
      targetLanguage: String
    },
    contentModeration: {
      toxicity: Number,
      violence: Number,
      sexual: Number,
      hate: Number
    }
  },
  
  // Analytics
  analytics: {
    totalViews: {
      type: Number,
      default: 0
    },
    uniqueViews: {
      type: Number,
      default: 0
    },
    totalReactions: {
      type: Number,
      default: 0
    },
    totalReplies: {
      type: Number,
      default: 0
    },
    totalShares: {
      type: Number,
      default: 0
    },
    averageViewDuration: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  
  // Metadata
  tags: [String],
  category: {
    type: String,
    enum: ['personal', 'entertainment', 'news', 'education', 'business', 'travel', 'food', 'fashion', 'sports', 'other'],
    default: 'personal'
  },
  language: {
    type: String,
    default: 'en'
  },
  timezone: {
    type: String,
    default: 'UTC'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
storySchema.index({ creator: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-expiration
storySchema.index({ status: 1 });
storySchema.index({ type: 1 });
storySchema.index({ 'privacy.visibility': 1 });
storySchema.index({ 'metadata.location.coordinates': '2dsphere' });
storySchema.index({ tags: 1 });
storySchema.index({ category: 1 });
storySchema.index({ 'moderation.status': 1 });
storySchema.index({ 'views.userId': 1 });
storySchema.index({ 'reactions.userId': 1 });

// Virtuals
storySchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

storySchema.virtual('isActive').get(function() {
  return this.status === 'published' && !this.isExpired;
});

storySchema.virtual('timeRemaining').get(function() {
  const now = new Date();
  const remaining = this.expiresAt - now;
  return Math.max(0, Math.floor(remaining / 1000)); // seconds remaining
});

storySchema.virtual('viewCount').get(function() {
  return this.views.length;
});

storySchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

storySchema.virtual('replyCount').get(function() {
  return this.replies.length;
});

storySchema.virtual('shareCount').get(function() {
  return this.shares.length;
});

storySchema.virtual('uniqueViewCount').get(function() {
  const uniqueUserIds = new Set(this.views.map(view => view.userId.toString()));
  return uniqueUserIds.size;
});

storySchema.virtual('isAnonymous').get(function() {
  return this.privacy.isAnonymous;
});

storySchema.virtual('canBeViewedBy').get(function() {
  return function(userId) {
    // Check if user is blocked
    if (this.privacy.blockedUsers.some(id => id.toString() === userId.toString())) {
      return false;
    }
    
    // Check privacy settings
    switch (this.privacy.visibility) {
      case 'public':
        return true;
      case 'friends':
        // Check if user is friends with creator
        // This would need to be implemented based on your friend system
        return true; // Placeholder
      case 'custom':
        return this.privacy.allowedUsers.some(id => id.toString() === userId.toString());
      case 'location':
        // Check if user is within location radius
        // This would need to be implemented based on your location system
        return true; // Placeholder
      default:
        return false;
    }
  };
});

// Pre-save middleware
storySchema.pre('save', function(next) {
  // Set expiration if not provided
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  
  // Update analytics
  this.analytics.totalViews = this.viewCount;
  this.analytics.uniqueViews = this.uniqueViewCount;
  this.analytics.totalReactions = this.reactionCount;
  this.analytics.totalReplies = this.replyCount;
  this.analytics.totalShares = this.shareCount;
  
  // Calculate average view duration
  if (this.views.length > 0) {
    const totalDuration = this.views.reduce((sum, view) => sum + (view.viewDuration || 0), 0);
    this.analytics.averageViewDuration = totalDuration / this.views.length;
  }
  
  // Calculate completion rate (simplified - assumes full view if duration > 0)
  if (this.views.length > 0) {
    const completedViews = this.views.filter(view => view.viewDuration > 0).length;
    this.analytics.completionRate = (completedViews / this.views.length) * 100;
  }
  
  next();
});

// Pre-validate middleware
storySchema.pre('validate', function(next) {
  // Validate media requirements
  if (this.type === 'image' && !this.media?.url) {
    this.invalidate('media.url', 'Image stories must have a media URL');
  }
  
  if (this.type === 'video' && !this.media?.url) {
    this.invalidate('media.url', 'Video stories must have a media URL');
  }
  
  if (this.type === 'audio' && !this.media?.url) {
    this.invalidate('media.url', 'Audio stories must have a media URL');
  }
  
  if (this.type === 'location' && !this.location?.coordinates) {
    this.invalidate('location.coordinates', 'Location stories must have coordinates');
  }
  
  if (this.type === 'poll' && (!this.poll?.question || !this.poll?.options || this.poll.options.length < 2)) {
    this.invalidate('poll', 'Poll stories must have a question and at least 2 options');
  }
  
  if (this.type === 'question' && !this.question?.text) {
    this.invalidate('question.text', 'Question stories must have question text');
  }
  
  // Validate expiration time
  if (this.expiresAt && this.expiresAt <= new Date()) {
    this.invalidate('expiresAt', 'Story expiration time must be in the future');
  }
  
  next();
});

// Instance methods
storySchema.methods.addView = function(userId, viewDuration = 0, isReplay = false) {
  // Check if user has already viewed
  const existingView = this.views.find(view => view.userId.toString() === userId.toString());
  
  if (existingView) {
    // Update existing view
    existingView.viewedAt = new Date();
    existingView.viewDuration = viewDuration;
    existingView.isReplay = isReplay;
  } else {
    // Add new view
    this.views.push({
      userId,
      viewedAt: new Date(),
      viewDuration,
      isReplay
    });
  }
  
  return this.save();
};

storySchema.methods.addReaction = function(userId, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(reaction => 
    reaction.userId.toString() !== userId.toString()
  );
  
  // Add new reaction
  this.reactions.push({
    userId,
    emoji,
    addedAt: new Date()
  });
  
  return this.save();
};

storySchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(reaction => 
    reaction.userId.toString() !== userId.toString()
  );
  
  return this.save();
};

storySchema.methods.addReply = function(userId, reply, isAnonymous = false) {
  this.replies.push({
    userId,
    reply,
    repliedAt: new Date(),
    isAnonymous
  });
  
  return this.save();
};

storySchema.methods.addShare = function(userId, platform, isAnonymous = false) {
  this.shares.push({
    userId,
    sharedAt: new Date(),
    platform,
    isAnonymous
  });
  
  return this.save();
};

storySchema.methods.voteInPoll = function(userId, optionIndex) {
  if (this.type !== 'poll') {
    throw new Error('This story is not a poll');
  }
  
  if (optionIndex < 0 || optionIndex >= this.poll.options.length) {
    throw new Error('Invalid option index');
  }
  
  const option = this.poll.options[optionIndex];
  
  // Check if user has already voted
  const hasVoted = option.voters.some(voter => voter.toString() === userId.toString());
  
  if (hasVoted && !this.poll.isMultipleChoice) {
    throw new Error('User has already voted in this poll');
  }
  
  // Add vote
  option.votes += 1;
  option.voters.push(userId);
  this.poll.totalVotes += 1;
  
  return this.save();
};

storySchema.methods.answerQuestion = function(userId, answer, isAnonymous = false) {
  if (this.type !== 'question') {
    throw new Error('This story is not a question');
  }
  
  // Check if user has already answered
  const hasAnswered = this.question.answers.some(ans => ans.userId.toString() === userId.toString());
  
  if (hasAnswered) {
    throw new Error('User has already answered this question');
  }
  
  this.question.answers.push({
    userId,
    answer,
    answeredAt: new Date(),
    isAnonymous
  });
  
  return this.save();
};

storySchema.methods.extendExpiration = function(hours = 24) {
  this.expiresAt = new Date(this.expiresAt.getTime() + hours * 60 * 60 * 1000);
  return this.save();
};

storySchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

storySchema.methods.delete = function() {
  this.status = 'deleted';
  return this.save();
};

storySchema.methods.addModerationFlag = function(type, reportedBy, description) {
  this.moderation.flags.push({
    type,
    reportedBy,
    description,
    reportedAt: new Date()
  });
  
  return this.save();
};

// Static methods
storySchema.statics.findByUser = function(userId, options = {}) {
  const {
    status = 'published',
    type = null,
    limit = 50,
    offset = 0,
    includeExpired = false
  } = options;
  
  let query = { creator: userId, status };
  
  if (type) {
    query.type = type;
  }
  
  if (!includeExpired) {
    query.expiresAt = { $gt: new Date() };
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('creator', 'username displayName avatar')
    .populate('views.userId', 'username displayName avatar')
    .populate('reactions.userId', 'username displayName avatar')
    .populate('replies.userId', 'username displayName avatar');
};

storySchema.statics.findFeed = function(userId, options = {}) {
  const {
    limit = 20,
    offset = 0,
    category = null,
    type = null
  } = options;
  
  let query = {
    status: 'published',
    expiresAt: { $gt: new Date() },
    $or: [
      { 'privacy.visibility': 'public' },
      { creator: userId },
      // Add logic for friends' stories
    ]
  };
  
  if (category) {
    query.category = category;
  }
  
  if (type) {
    query.type = type;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('creator', 'username displayName avatar')
    .populate('views.userId', 'username displayName avatar')
    .populate('reactions.userId', 'username displayName avatar');
};

storySchema.statics.findNearbyStories = function(coordinates, maxDistance = 5000, limit = 20) {
  return this.find({
    status: 'published',
    expiresAt: { $gt: new Date() },
    'privacy.visibility': { $in: ['public', 'location'] },
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    }
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .populate('creator', 'username displayName avatar');
};

storySchema.statics.findExpiredStories = function() {
  return this.find({
    expiresAt: { $lte: new Date() },
    status: 'published'
  });
};

// Export model
module.exports = mongoose.model('Story', storySchema);