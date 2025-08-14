const mongoose = require('mongoose');
const features = require('../config/features');

const callSchema = new mongoose.Schema({
  // Call Information
  callId: {
    type: String,
    required: true,
    unique: true
  },
  
  callType: {
    type: String,
    enum: ['audio', 'video', 'screen-share'],
    required: true
  },
  
  status: {
    type: String,
    enum: ['initiating', 'ringing', 'answered', 'connected', 'ended', 'missed', 'rejected', 'busy', 'failed'],
    default: 'initiating'
  },
  
  direction: {
    type: String,
    enum: ['incoming', 'outgoing'],
    required: true
  },
  
  // Participants
  initiator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['caller', 'callee', 'participant'],
      default: 'participant'
    },
    status: {
      type: String,
      enum: ['invited', 'ringing', 'answered', 'connected', 'left', 'rejected'],
      default: 'invited'
    },
    joinedAt: Date,
    leftAt: Date,
    deviceInfo: {
      platform: String,
      version: String,
      deviceId: String,
      userAgent: String
    },
    networkInfo: {
      connectionType: String,
      bandwidth: Number,
      latency: Number
    }
  }],
  
  // Call Details
  startTime: {
    type: Date,
    default: Date.now
  },
  
  endTime: Date,
  
  duration: {
    type: Number, // in seconds
    default: 0
  },
  
  // WebRTC Information
  webrtc: {
    roomId: String,
    sessionId: String,
    iceServers: [String],
    mediaConstraints: {
      audio: {
        type: Boolean,
        default: true
      },
      video: {
        type: Boolean,
        default: false
      },
      screenShare: {
        type: Boolean,
        default: false
      }
    },
    streams: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      streamType: {
        type: String,
        enum: ['audio', 'video', 'screen'],
        required: true
      },
      streamId: String,
      trackId: String,
      enabled: {
        type: Boolean,
        default: true
      },
      muted: {
        type: Boolean,
        default: false
      }
    }]
  },
  
  // Call Quality Metrics
  qualityMetrics: {
    overall: {
      type: Number,
      min: 1,
      max: 5,
      default: 5
    },
    audio: {
      quality: {
        type: Number,
        min: 1,
        max: 5,
        default: 5
      },
      bitrate: Number,
      packetLoss: Number,
      jitter: Number,
      latency: Number
    },
    video: {
      quality: {
        type: Number,
        min: 1,
        max: 5,
        default: 5
      },
      bitrate: Number,
      packetLoss: Number,
      jitter: Number,
      latency: Number,
      resolution: {
        width: Number,
        height: Number
      },
      frameRate: Number
    },
    network: {
      connectionType: String,
      bandwidth: Number,
      latency: Number,
      packetLoss: Number,
      jitter: Number
    }
  },
  
  // Recording
  recording: {
    enabled: {
      type: Boolean,
      default: false
    },
    recordingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recording'
    },
    startTime: Date,
    endTime: Date,
    duration: Number,
    fileUrl: String,
    fileSize: Number,
    format: {
      type: String,
      enum: ['webm', 'mp4', 'mkv'],
      default: 'webm'
    }
  },
  
  // Screen Sharing
  screenSharing: {
    enabled: {
      type: Boolean,
      default: false
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    startTime: Date,
    endTime: Date,
    duration: Number,
    resolution: {
      width: Number,
      height: Number
    },
    frameRate: Number
  },
  
  // Call Events
  events: [{
    type: {
      type: String,
      enum: ['initiated', 'ringing', 'answered', 'connected', 'muted', 'unmuted', 'video-on', 'video-off', 'screen-share-start', 'screen-share-stop', 'recording-start', 'recording-stop', 'participant-joined', 'participant-left', 'call-ended', 'call-failed'],
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Call Settings
  settings: {
    maxParticipants: {
      type: Number,
      default: 2,
      max: 10
    },
    allowRecording: {
      type: Boolean,
      default: features.isEnabled('SCREEN_RECORDING')
    },
    allowScreenSharing: {
      type: Boolean,
      default: features.isEnabled('SCREEN_SHARING')
    },
    allowVideo: {
      type: Boolean,
      default: features.isEnabled('VIDEO_CALLS')
    },
    allowAudio: {
      type: Boolean,
      default: features.isEnabled('AUDIO_CALLS')
    },
    encryption: {
      type: Boolean,
      default: features.isEnabled('END_TO_END_ENCRYPTION')
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
        enum: ['inappropriate-content', 'harassment', 'spam', 'technical-issue', 'other']
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
    }]
  },
  
  // Analytics
  analytics: {
    viewCount: {
      type: Number,
      default: 0
    },
    shareCount: {
      type: Number,
      default: 0
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 0
    },
    feedback: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
      },
      comment: String,
      submittedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  
  // Metadata
  tags: [String],
  notes: String,
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
callSchema.index({ callId: 1 });
callSchema.index({ initiator: 1, startTime: -1 });
callSchema.index({ 'participants.userId': 1 });
callSchema.index({ status: 1 });
callSchema.index({ callType: 1 });
callSchema.index({ startTime: -1 });
callSchema.index({ 'webrtc.roomId': 1 });
callSchema.index({ 'recording.recordingId': 1 });
callSchema.index({ isArchived: 1 });

// Virtuals
callSchema.virtual('isActive').get(function() {
  return ['initiating', 'ringing', 'answered', 'connected'].includes(this.status);
});

callSchema.virtual('isEnded').get(function() {
  return ['ended', 'missed', 'rejected', 'busy', 'failed'].includes(this.status);
});

callSchema.virtual('participantCount').get(function() {
  return this.participants.filter(p => p.status === 'connected').length;
});

callSchema.virtual('activeParticipantCount').get(function() {
  return this.participants.filter(p => 
    ['answered', 'connected'].includes(p.status)
  ).length;
});

callSchema.virtual('callDuration').get(function() {
  if (this.endTime && this.startTime) {
    return Math.floor((this.endTime - this.startTime) / 1000);
  }
  if (this.isActive) {
    return Math.floor((new Date() - this.startTime) / 1000);
  }
  return 0;
});

// Pre-save middleware
callSchema.pre('save', function(next) {
  // Update duration when call ends
  if (this.endTime && this.startTime) {
    this.duration = Math.floor((this.endTime - this.startTime) / 1000);
  }
  
  // Generate call ID if not provided
  if (!this.callId) {
    this.callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  next();
});

// Pre-validate middleware
callSchema.pre('validate', function(next) {
  // Validate participant count
  if (this.participants.length > this.settings.maxParticipants) {
    this.invalidate('participants', `Call cannot exceed ${this.settings.maxParticipants} participants`);
  }
  
  // Validate call type permissions
  if (this.callType === 'video' && !this.settings.allowVideo) {
    this.invalidate('callType', 'Video calls are not allowed');
  }
  
  if (this.callType === 'audio' && !this.settings.allowAudio) {
    this.invalidate('callType', 'Audio calls are not allowed');
  }
  
  next();
});

// Instance methods
callSchema.methods.addParticipant = function(userId, role = 'participant') {
  // Check if user is already a participant
  const existingParticipant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (existingParticipant) {
    throw new Error('User is already a participant in this call');
  }
  
  // Check participant limits
  if (this.participants.length >= this.settings.maxParticipants) {
    throw new Error(`Call cannot exceed ${this.settings.maxParticipants} participants`);
  }
  
  // Add participant
  this.participants.push({
    userId,
    role,
    status: 'invited',
    deviceInfo: {},
    networkInfo: {}
  });
  
  // Add event
  this.events.push({
    type: 'participant-joined',
    userId,
    timestamp: new Date()
  });
  
  return this.save();
};

callSchema.methods.removeParticipant = function(userId) {
  const participantIndex = this.participants.findIndex(p => p.userId.toString() === userId.toString());
  if (participantIndex === -1) {
    throw new Error('User is not a participant in this call');
  }
  
  const participant = this.participants[participantIndex];
  
  // Update participant status
  participant.status = 'left';
  participant.leftAt = new Date();
  
  // Add event
  this.events.push({
    type: 'participant-left',
    userId,
    timestamp: new Date()
  });
  
  // Check if call should end
  if (this.participants.filter(p => p.status === 'connected').length === 0) {
    this.endCall();
  }
  
  return this.save();
};

callSchema.methods.updateParticipantStatus = function(userId, status, metadata = {}) {
  const participant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (!participant) {
    throw new Error('User is not a participant in this call');
  }
  
  const oldStatus = participant.status;
  participant.status = status;
  
  // Update timestamps
  if (status === 'connected') {
    participant.joinedAt = new Date();
  } else if (status === 'left') {
    participant.leftAt = new Date();
  }
  
  // Add event
  this.events.push({
    type: this.getEventTypeForStatusChange(oldStatus, status),
    userId,
    timestamp: new Date(),
    metadata
  });
  
  return this.save();
};

callSchema.methods.startRecording = function(userId) {
  if (!this.settings.allowRecording) {
    throw new Error('Recording is not allowed for this call');
  }
  
  if (this.recording.enabled) {
    throw new Error('Recording is already in progress');
  }
  
  this.recording.enabled = true;
  this.recording.startTime = new Date();
  
  // Add event
  this.events.push({
    type: 'recording-start',
    userId,
    timestamp: new Date()
  });
  
  return this.save();
};

callSchema.methods.stopRecording = function(userId, recordingData = {}) {
  if (!this.recording.enabled) {
    throw new Error('No recording in progress');
  }
  
  this.recording.enabled = false;
  this.recording.endTime = new Date();
  this.recording.duration = Math.floor((this.recording.endTime - this.recording.startTime) / 1000);
  
  // Update recording data
  Object.assign(this.recording, recordingData);
  
  // Add event
  this.events.push({
    type: 'recording-stop',
    userId,
    timestamp: new Date()
  });
  
  return this.save();
};

callSchema.methods.startScreenSharing = function(userId) {
  if (!this.settings.allowScreenSharing) {
    throw new Error('Screen sharing is not allowed for this call');
  }
  
  if (this.screenSharing.enabled) {
    throw new Error('Screen sharing is already in progress');
  }
  
  this.screenSharing.enabled = true;
  this.screenSharing.sharedBy = userId;
  this.screenSharing.startTime = new Date();
  
  // Add event
  this.events.push({
    type: 'screen-share-start',
    userId,
    timestamp: new Date()
  });
  
  return this.save();
};

callSchema.methods.stopScreenSharing = function(userId) {
  if (!this.screenSharing.enabled) {
    throw new Error('No screen sharing in progress');
  }
  
  this.screenSharing.enabled = false;
  this.screenSharing.endTime = new Date();
  this.screenSharing.duration = Math.floor((this.screenSharing.endTime - this.screenSharing.startTime) / 1000);
  
  // Add event
  this.events.push({
    type: 'screen-share-stop',
    userId,
    timestamp: new Date()
  });
  
  return this.save();
};

callSchema.methods.endCall = function(reason = 'ended') {
  this.status = 'ended';
  this.endTime = new Date();
  this.duration = Math.floor((this.endTime - this.startTime) / 1000);
  
  // Stop recording if active
  if (this.recording.enabled) {
    this.recording.enabled = false;
    this.recording.endTime = new Date();
  }
  
  // Stop screen sharing if active
  if (this.screenSharing.enabled) {
    this.screenSharing.enabled = false;
    this.screenSharing.endTime = new Date();
  }
  
  // Update all participants to left status
  this.participants.forEach(participant => {
    if (participant.status === 'connected') {
      participant.status = 'left';
      participant.leftAt = new Date();
    }
  });
  
  // Add event
  this.events.push({
    type: 'call-ended',
    timestamp: new Date(),
    metadata: { reason }
  });
  
  return this.save();
};

callSchema.methods.updateQualityMetrics = function(userId, metrics) {
  // Update overall quality based on individual metrics
  if (metrics.audio && metrics.video) {
    const audioQuality = metrics.audio.quality || 5;
    const videoQuality = metrics.video.quality || 5;
    this.qualityMetrics.overall = Math.round((audioQuality + videoQuality) / 2);
  }
  
  // Update specific metrics
  if (metrics.audio) {
    Object.assign(this.qualityMetrics.audio, metrics.audio);
  }
  
  if (metrics.video) {
    Object.assign(this.qualityMetrics.video, metrics.video);
  }
  
  if (metrics.network) {
    Object.assign(this.qualityMetrics.network, metrics.network);
  }
  
  return this.save();
};

callSchema.methods.addFeedback = function(userId, rating, comment = '') {
  // Check if user has already provided feedback
  const existingFeedback = this.analytics.feedback.find(f => f.userId.toString() === userId.toString());
  if (existingFeedback) {
    throw new Error('User has already provided feedback for this call');
  }
  
  // Add feedback
  this.analytics.feedback.push({
    userId,
    rating,
    comment,
    submittedAt: new Date()
  });
  
  // Update average rating
  const totalRating = this.analytics.feedback.reduce((sum, f) => sum + f.rating, 0);
  this.analytics.rating = Math.round(totalRating / this.analytics.feedback.length);
  
  return this.save();
};

// Helper methods
callSchema.methods.getEventTypeForStatusChange = function(oldStatus, newStatus) {
  const statusMap = {
    'invited': 'ringing',
    'ringing': 'answered',
    'answered': 'connected',
    'connected': 'left'
  };
  
  return statusMap[newStatus] || 'participant-joined';
};

// Static methods
callSchema.statics.findByUser = function(userId, options = {}) {
  const {
    status = null,
    callType = null,
    limit = 50,
    offset = 0,
    includeArchived = false
  } = options;
  
  let query = {
    $or: [
      { initiator: userId },
      { 'participants.userId': userId }
    ]
  };
  
  if (status) {
    query.status = status;
  }
  
  if (callType) {
    query.callType = callType;
  }
  
  if (!includeArchived) {
    query.isArchived = false;
  }
  
  return this.find(query)
    .sort({ startTime: -1 })
    .skip(offset)
    .limit(limit)
    .populate('initiator', 'username displayName avatar')
    .populate('participants.userId', 'username displayName avatar')
    .populate('webrtc.streams.userId', 'username displayName avatar');
};

callSchema.statics.findActiveCalls = function() {
  return this.find({
    status: { $in: ['initiating', 'ringing', 'answered', 'connected'] }
  }).populate('initiator', 'username displayName avatar')
    .populate('participants.userId', 'username displayName avatar');
};

callSchema.statics.findByRoomId = function(roomId) {
  return this.findOne({ 'webrtc.roomId': roomId })
    .populate('initiator', 'username displayName avatar')
    .populate('participants.userId', 'username displayName avatar');
};

// Export model
module.exports = mongoose.model('Call', callSchema);