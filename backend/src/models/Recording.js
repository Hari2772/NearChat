const mongoose = require('mongoose');
const features = require('../config/features');

const recordingSchema = new mongoose.Schema({
  // Recording Information
  recordingId: {
    type: String,
    required: true,
    unique: true
  },
  
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  description: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  
  // Recording Type
  type: {
    type: String,
    enum: ['call', 'screen', 'voice', 'video', 'audio'],
    required: true
  },
  
  // Recording Source
  source: {
    type: {
      type: String,
      enum: ['call', 'chat', 'story', 'user-upload', 'system'],
      required: true
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'source.model'
    },
    model: {
      type: String,
      enum: ['Call', 'Chat', 'Story', 'User'],
      required: function() {
        return this.source.type !== 'system';
      }
    }
  },
  
  // Creator Information
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Recording Content
  content: {
    fileUrl: {
      type: String,
      required: true
    },
    thumbnailUrl: String,
    filename: String,
    mimeType: String,
    fileSize: {
      type: Number,
      required: true
    },
    duration: {
      type: Number, // in seconds
      required: true
    },
    format: {
      type: String,
      enum: ['webm', 'mp4', 'mkv', 'mp3', 'wav', 'ogg'],
      required: true
    },
    quality: {
      type: String,
      enum: ['low', 'medium', 'high', 'ultra'],
      default: 'medium'
    },
    resolution: {
      width: Number,
      height: Number
    },
    frameRate: Number,
    bitrate: Number,
    codec: String
  },
  
  // Recording Status
  status: {
    type: String,
    enum: ['processing', 'ready', 'failed', 'deleted'],
    default: 'processing'
  },
  
  // Processing Information
  processing: {
    startedAt: {
      type: Date,
      default: Date.now
    },
    completedAt: Date,
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    steps: [{
      name: String,
      status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed']
      },
      startedAt: Date,
      completedAt: Date,
      error: String
    }],
    error: String
  },
  
  // Privacy & Access Control
  privacy: {
    visibility: {
      type: String,
      enum: ['public', 'private', 'friends', 'custom'],
      default: 'private'
    },
    allowedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    password: String,
    expiresAt: Date,
    isDownloadable: {
      type: Boolean,
      default: false
    },
    isShareable: {
      type: Boolean,
      default: false
    }
  },
  
  // Recording Metadata
  metadata: {
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
      }
    },
    tags: [String],
    language: {
      type: String,
      default: 'en'
    },
    transcription: {
      text: String,
      language: String,
      confidence: Number,
      segments: [{
        start: Number,
        end: Number,
        text: String,
        confidence: Number
      }]
    },
    aiAnalysis: {
      sentiment: {
        type: String,
        enum: ['positive', 'negative', 'neutral']
      },
      topics: [String],
      entities: [String],
      moderation: {
        status: {
          type: String,
          enum: ['pending', 'approved', 'flagged', 'removed'],
          default: 'pending'
        },
        score: Number,
        categories: [String],
        flags: [String]
      }
    }
  },
  
  // Call-specific Information (for call recordings)
  callInfo: {
    callId: String,
    callType: String,
    participants: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      role: String,
      isSpeaking: Boolean,
      audioLevel: Number
    }],
    qualityMetrics: {
      overall: Number,
      audio: Number,
      video: Number,
      network: Number
    }
  },
  
  // Screen Recording Information
  screenInfo: {
    application: String,
    windowTitle: String,
    resolution: {
      width: Number,
      height: Number
    },
    frameRate: Number,
    mouseCursor: {
      type: Boolean,
      default: true
    },
    clicks: [{
      x: Number,
      y: Number,
      timestamp: Number,
      button: String
    }],
    keystrokes: [{
      key: String,
      timestamp: Number,
      isModifier: Boolean
    }]
  },
  
  // Storage Information
  storage: {
    provider: {
      type: String,
      enum: ['local', 'aws-s3', 'google-cloud', 'azure'],
      default: 'local'
    },
    bucket: String,
    key: String,
    region: String,
    version: String,
    isEncrypted: {
      type: Boolean,
      default: false
    },
    encryptionKey: String,
    compression: {
      enabled: {
        type: Boolean,
        default: false
      },
      algorithm: String,
      ratio: Number
    }
  },
  
  // Analytics & Usage
  analytics: {
    viewCount: {
      type: Number,
      default: 0
    },
    downloadCount: {
      type: Number,
      default: 0
    },
    shareCount: {
      type: Number,
      default: 0
    },
    playTime: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    engagement: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
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
    flags: [{
      type: {
        type: String,
        enum: ['inappropriate-content', 'copyright', 'harassment', 'spam', 'technical-issue', 'other']
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
  
  // Retention & Cleanup
  retention: {
    policy: {
      type: String,
      enum: ['permanent', 'temporary', 'auto-delete'],
      default: 'permanent'
    },
    expiresAt: Date,
    maxAge: Number, // in days
    isArchived: {
      type: Boolean,
      default: false
    },
    archivedAt: Date
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
recordingSchema.index({ recordingId: 1 });
recordingSchema.index({ creator: 1, createdAt: -1 });
recordingSchema.index({ type: 1 });
recordingSchema.index({ status: 1 });
recordingSchema.index({ 'source.sourceId': 1 });
recordingSchema.index({ 'metadata.location.coordinates': '2dsphere' });
recordingSchema.index({ 'privacy.visibility': 1 });
recordingSchema.index({ 'retention.expiresAt': 1 }, { expireAfterSeconds: 0 });
recordingSchema.index({ 'metadata.aiAnalysis.moderation.status': 1 });
recordingSchema.index({ tags: 1 });
recordingSchema.index({ isArchived: 1 });

// Virtuals
recordingSchema.virtual('isExpired').get(function() {
  if (!this.retention.expiresAt) return false;
  return new Date() > this.retention.expiresAt;
});

recordingSchema.virtual('isPublic').get(function() {
  return this.privacy.visibility === 'public';
});

recordingSchema.virtual('isPrivate').get(function() {
  return this.privacy.visibility === 'private';
});

recordingSchema.virtual('isProcessing').get(function() {
  return this.status === 'processing';
});

recordingSchema.virtual('isReady').get(function() {
  return this.status === 'ready';
});

recordingSchema.virtual('isFailed').get(function() {
  return this.status === 'failed';
});

recordingSchema.virtual('fileSizeMB').get(function() {
  return (this.content.fileSize / (1024 * 1024)).toFixed(2);
});

recordingSchema.virtual('durationFormatted').get(function() {
  const hours = Math.floor(this.content.duration / 3600);
  const minutes = Math.floor((this.content.duration % 3600) / 60);
  const seconds = this.content.duration % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Pre-save middleware
recordingSchema.pre('save', function(next) {
  // Generate recording ID if not provided
  if (!this.recordingId) {
    this.recordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Set retention expiry if auto-delete is enabled
  if (this.retention.policy === 'auto-delete' && this.retention.maxAge && !this.retention.expiresAt) {
    this.retention.expiresAt = new Date(Date.now() + this.retention.maxAge * 24 * 60 * 60 * 1000);
  }
  
  // Update timestamp
  this.updatedAt = new Date();
  
  next();
});

// Pre-validate middleware
recordingSchema.pre('validate', function(next) {
  // Validate file size limits
  const maxFileSize = 1024 * 1024 * 1024; // 1GB
  if (this.content.fileSize > maxFileSize) {
    this.invalidate('content.fileSize', 'File size exceeds maximum limit of 1GB');
  }
  
  // Validate duration limits
  const maxDuration = 24 * 60 * 60; // 24 hours
  if (this.content.duration > maxDuration) {
    this.invalidate('content.duration', 'Recording duration exceeds maximum limit of 24 hours');
  }
  
  // Validate format based on type
  if (this.type === 'screen' && !['webm', 'mp4', 'mkv'].includes(this.content.format)) {
    this.invalidate('content.format', 'Screen recordings must be in webm, mp4, or mkv format');
  }
  
  if (this.type === 'voice' && !['mp3', 'wav', 'ogg'].includes(this.content.format)) {
    this.invalidate('content.format', 'Voice recordings must be in mp3, wav, or ogg format');
  }
  
  next();
});

// Instance methods
recordingSchema.methods.updateProcessingProgress = function(progress, stepName = null) {
  this.processing.progress = progress;
  
  if (stepName) {
    const step = this.processing.steps.find(s => s.name === stepName);
    if (step) {
      step.status = progress === 100 ? 'completed' : 'processing';
      if (progress === 100) {
        step.completedAt = new Date();
      }
    }
  }
  
  if (progress === 100) {
    this.status = 'ready';
    this.processing.completedAt = new Date();
  }
  
  return this.save();
};

recordingSchema.methods.addProcessingStep = function(name) {
  this.processing.steps.push({
    name,
    status: 'pending',
    startedAt: new Date()
  });
  
  return this.save();
};

recordingSchema.methods.completeProcessingStep = function(name, error = null) {
  const step = this.processing.steps.find(s => s.name === name);
  if (step) {
    step.status = error ? 'failed' : 'completed';
    step.completedAt = new Date();
    if (error) {
      step.error = error;
    }
  }
  
  if (error) {
    this.status = 'failed';
    this.processing.error = error;
  }
  
  return this.save();
};

recordingSchema.methods.updateTranscription = function(transcription, language = 'en', confidence = 0.8) {
  this.metadata.transcription = {
    text: transcription,
    language,
    confidence,
    segments: []
  };
  
  return this.save();
};

recordingSchema.methods.addTranscriptionSegment = function(start, end, text, confidence) {
  if (!this.metadata.transcription.segments) {
    this.metadata.transcription.segments = [];
  }
  
  this.metadata.transcription.segments.push({
    start,
    end,
    text,
    confidence
  });
  
  return this.save();
};

recordingSchema.methods.updateAIAnalysis = function(analysis) {
  if (analysis.sentiment) {
    this.metadata.aiAnalysis.sentiment = analysis.sentiment;
  }
  
  if (analysis.topics) {
    this.metadata.aiAnalysis.topics = analysis.topics;
  }
  
  if (analysis.entities) {
    this.metadata.aiAnalysis.entities = analysis.entities;
  }
  
  if (analysis.moderation) {
    this.metadata.aiAnalysis.moderation = analysis.moderation;
  }
  
  return this.save();
};

recordingSchema.methods.incrementViewCount = function() {
  this.analytics.viewCount += 1;
  return this.save();
};

recordingSchema.methods.incrementDownloadCount = function() {
  this.analytics.downloadCount += 1;
  return this.save();
};

recordingSchema.methods.incrementShareCount = function() {
  this.analytics.shareCount += 1;
  return this.save();
};

recordingSchema.methods.updatePlayTime = function(seconds) {
  this.analytics.playTime += seconds;
  
  // Calculate completion rate if duration is available
  if (this.content.duration > 0) {
    this.analytics.completionRate = Math.min(100, (this.analytics.playTime / this.content.duration) * 100);
  }
  
  return this.save();
};

recordingSchema.methods.archive = function() {
  this.retention.isArchived = true;
  this.retention.archivedAt = new Date();
  return this.save();
};

recordingSchema.methods.unarchive = function() {
  this.retention.isArchived = false;
  this.retention.archivedAt = undefined;
  return this.save();
};

recordingSchema.methods.addModerationFlag = function(type, reportedBy, description) {
  this.moderation.flags.push({
    type,
    reportedBy,
    description,
    reportedAt: new Date()
  });
  
  return this.save();
};

recordingSchema.methods.updateModerationFlag = function(flagIndex, status) {
  if (this.moderation.flags[flagIndex]) {
    this.moderation.flags[flagIndex].status = status;
  }
  
  return this.save();
};

// Static methods
recordingSchema.statics.findByUser = function(userId, options = {}) {
  const {
    type = null,
    status = null,
    limit = 50,
    offset = 0,
    includeArchived = false
  } = options;
  
  let query = { creator: userId };
  
  if (type) {
    query.type = type;
  }
  
  if (status) {
    query.status = status;
  }
  
  if (!includeArchived) {
    query['retention.isArchived'] = false;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('creator', 'username displayName avatar')
    .populate('source.sourceId');
};

recordingSchema.statics.findBySource = function(sourceType, sourceId, options = {}) {
  const {
    type = null,
    limit = 50,
    offset = 0
  } = options;
  
  let query = {
    'source.type': sourceType,
    'source.sourceId': sourceId
  };
  
  if (type) {
    query.type = type;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('creator', 'username displayName avatar');
};

recordingSchema.statics.findPublicRecordings = function(options = {}) {
  const {
    type = null,
    tags = [],
    limit = 50,
    offset = 0
  } = options;
  
  let query = {
    'privacy.visibility': 'public',
    status: 'ready',
    'retention.isArchived': false
  };
  
  if (type) {
    query.type = type;
  }
  
  if (tags.length > 0) {
    query['metadata.tags'] = { $in: tags };
  }
  
  return this.find(query)
    .sort({ 'analytics.viewCount': -1 })
    .skip(offset)
    .limit(limit)
    .populate('creator', 'username displayName avatar')
    .select('-storage -moderation.flags');
};

recordingSchema.statics.findExpiredRecordings = function() {
  return this.find({
    'retention.expiresAt': { $lt: new Date() },
    'retention.policy': { $in: ['temporary', 'auto-delete'] }
  });
};

// Export model
module.exports = mongoose.model('Recording', recordingSchema);