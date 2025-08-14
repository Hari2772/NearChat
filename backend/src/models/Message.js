const mongoose = require('mongoose');
const features = require('../config/features');

const messageSchema = new mongoose.Schema({
  // Message Content
  content: {
    type: String,
    required: function() {
      return !this.media && !this.voiceMessage;
    },
    maxlength: 5000,
    trim: true
  },
  
  // Media Content
  media: {
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'file', 'location']
    },
    url: String,
    thumbnail: String,
    filename: String,
    mimeType: String,
    size: Number,
    duration: Number, // For audio/video
    dimensions: {
      width: Number,
      height: Number
    },
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Voice Message
  voiceMessage: {
    url: String,
    duration: Number, // in seconds
    waveform: [Number], // audio waveform data
    transcription: String, // AI-generated transcription
    language: {
      type: String,
      default: 'en'
    }
  },
  
  // Location Message
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
  
  // Message Metadata
  messageType: {
    type: String,
    enum: ['text', 'media', 'voice', 'location', 'system', 'reaction', 'reply', 'forward'],
    default: 'text'
  },
  
  // Sender Information
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Chat Room
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  
  // Reply to another message
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  
  // Forwarded from another message
  forwardedFrom: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat'
    },
    originalSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Message Status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  
  // Read receipts
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Delivery receipts
  deliveredTo: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deliveredAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Reactions
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
  
  // Message Flags
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Self-destructing messages
  selfDestruct: {
    enabled: {
      type: Boolean,
      default: false
    },
    expiresAt: Date,
    duration: Number // in seconds
  },
  
  // Encryption
  isEncrypted: {
    type: Boolean,
    default: features.isEnabled('END_TO_END_ENCRYPTION')
  },
  encryptionKey: String,
  
  // Moderation
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'flagged', 'removed'],
    default: 'pending'
  },
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
  }],
  
  // AI Features
  aiAnalysis: {
    sentiment: {
      type: String,
      enum: ['positive', 'negative', 'neutral']
    },
    toxicity: {
      type: Number,
      min: 0,
      max: 1
    },
    language: String,
    translation: {
      originalLanguage: String,
      translatedContent: String,
      targetLanguage: String
    }
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
    replyCount: {
      type: Number,
      default: 0
    },
    forwardCount: {
      type: Number,
      default: 0
    }
  },
  
  // Metadata
  clientInfo: {
    platform: String, // ios, android, web
    version: String,
    deviceId: String
  },
  
  // Timestamps
  sentAt: {
    type: Date,
    default: Date.now
  },
  deliveredAt: Date,
  readAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
messageSchema.index({ chatId: 1, sentAt: -1 });
messageSchema.index({ sender: 1, sentAt: -1 });
messageSchema.index({ 'reactions.userId': 1 });
messageSchema.index({ 'readBy.userId': 1 });
messageSchema.index({ 'deliveredTo.userId': 1 });
messageSchema.index({ replyTo: 1 });
messageSchema.index({ 'forwardedFrom.messageId': 1 });
messageSchema.index({ 'location.coordinates': '2dsphere' });
messageSchema.index({ 'selfDestruct.expiresAt': 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ isDeleted: 1 });
messageSchema.index({ moderationStatus: 1 });

// Virtuals
messageSchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

messageSchema.virtual('readCount').get(function() {
  return this.readBy.length;
});

messageSchema.virtual('deliveryCount').get(function() {
  return this.deliveredTo.length;
});

messageSchema.virtual('isExpired').get(function() {
  if (!this.selfDestruct.enabled || !this.selfDestruct.expiresAt) return false;
  return new Date() > this.selfDestruct.expiresAt;
});

messageSchema.virtual('isReadByUser').get(function() {
  return function(userId) {
    return this.readBy.some(read => read.userId.toString() === userId.toString());
  };
});

messageSchema.virtual('isDeliveredToUser').get(function() {
  return function(userId) {
    return this.deliveredTo.some(delivery => delivery.userId.toString() === userId.toString());
  };
});

messageSchema.virtual('hasReactionFromUser').get(function() {
  return function(userId, emoji = null) {
    if (emoji) {
      return this.reactions.some(reaction => 
        reaction.userId.toString() === userId.toString() && reaction.emoji === emoji
      );
    }
    return this.reactions.some(reaction => reaction.userId.toString() === userId.toString());
  };
});

// Pre-save middleware
messageSchema.pre('save', function(next) {
  // Set message type based on content
  if (!this.messageType) {
    if (this.media) this.messageType = 'media';
    else if (this.voiceMessage) this.messageType = 'voice';
    else if (this.location) this.messageType = 'location';
    else this.messageType = 'text';
  }
  
  // Set self-destruct expiry if enabled
  if (this.selfDestruct.enabled && this.selfDestruct.duration && !this.selfDestruct.expiresAt) {
    this.selfDestruct.expiresAt = new Date(Date.now() + this.selfDestruct.duration * 1000);
  }
  
  // Set sentAt if not provided
  if (!this.sentAt) {
    this.sentAt = new Date();
  }
  
  next();
});

// Pre-validate middleware
messageSchema.pre('validate', function(next) {
  // Validate content requirements
  if (!this.content && !this.media && !this.voiceMessage && !this.location) {
    this.invalidate('content', 'Message must have content, media, voice, or location');
  }
  
  // Validate media requirements
  if (this.media && !this.media.url) {
    this.invalidate('media.url', 'Media URL is required');
  }
  
  // Validate voice message requirements
  if (this.voiceMessage && !this.voiceMessage.url) {
    this.invalidate('voiceMessage.url', 'Voice message URL is required');
  }
  
  // Validate location requirements
  if (this.location && !this.location.coordinates) {
    this.invalidate('location.coordinates', 'Location coordinates are required');
  }
  
  next();
});

// Instance methods
messageSchema.methods.markAsRead = function(userId) {
  if (!this.isReadByUser(userId)) {
    this.readBy.push({
      userId,
      readAt: new Date()
    });
    this.readAt = new Date();
    this.status = 'read';
    return this.save();
  }
  return Promise.resolve(this);
};

messageSchema.methods.markAsDelivered = function(userId) {
  if (!this.isDeliveredToUser(userId)) {
    this.deliveredTo.push({
      userId,
      deliveredAt: new Date()
    });
    this.deliveredAt = new Date();
    this.status = 'delivered';
    return this.save();
  }
  return Promise.resolve(this);
};

messageSchema.methods.addReaction = function(userId, emoji) {
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

messageSchema.methods.removeReaction = function(userId, emoji = null) {
  if (emoji) {
    this.reactions = this.reactions.filter(reaction => 
      !(reaction.userId.toString() === userId.toString() && reaction.emoji === emoji)
    );
  } else {
    this.reactions = this.reactions.filter(reaction => 
      reaction.userId.toString() !== userId.toString()
    );
  }
  
  return this.save();
};

messageSchema.methods.edit = function(newContent) {
  // Store edit history
  this.editHistory.push({
    content: this.content,
    editedAt: new Date()
  });
  
  // Update content
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  
  return this.save();
};

messageSchema.methods.delete = function(userId, permanent = false) {
  if (permanent) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = userId;
  } else {
    // Soft delete - keep message but mark as deleted
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = userId;
  }
  
  return this.save();
};

messageSchema.methods.forward = function(targetChatId, forwardedBy) {
  // Create a new message that references this one
  const Message = mongoose.model('Message');
  return Message.create({
    content: this.content,
    media: this.media,
    voiceMessage: this.voiceMessage,
    location: this.location,
    messageType: 'forward',
    sender: forwardedBy,
    chatId: targetChatId,
    forwardedFrom: {
      messageId: this._id,
      chatId: this.chatId,
      originalSender: this.sender
    }
  });
};

messageSchema.methods.reply = function(replyContent, replySender, replyChatId) {
  const Message = mongoose.model('Message');
  return Message.create({
    content: replyContent,
    messageType: 'reply',
    sender: replySender,
    chatId: replyChatId || this.chatId,
    replyTo: this._id
  });
};

// Static methods
messageSchema.statics.findByChat = function(chatId, options = {}) {
  const {
    limit = 50,
    offset = 0,
    beforeMessageId = null,
    afterMessageId = null,
    messageType = null,
    sender = null
  } = options;
  
  let query = { chatId, isDeleted: false };
  
  if (beforeMessageId) {
    query._id = { $lt: beforeMessageId };
  }
  
  if (afterMessageId) {
    query._id = { $gt: afterMessageId };
  }
  
  if (messageType) {
    query.messageType = messageType;
  }
  
  if (sender) {
    query.sender = sender;
  }
  
  return this.find(query)
    .sort({ sentAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('sender', 'username displayName avatar')
    .populate('replyTo', 'content sender')
    .populate('readBy.userId', 'username displayName avatar')
    .populate('reactions.userId', 'username displayName avatar');
};

messageSchema.statics.findReplies = function(messageId) {
  return this.find({ replyTo: messageId, isDeleted: false })
    .sort({ sentAt: 1 })
    .populate('sender', 'username displayName avatar');
};

messageSchema.statics.findByUser = function(userId, options = {}) {
  const {
    limit = 50,
    offset = 0,
    messageType = null,
    startDate = null,
    endDate = null
  } = options;
  
  let query = { sender: userId, isDeleted: false };
  
  if (messageType) {
    query.messageType = messageType;
  }
  
  if (startDate || endDate) {
    query.sentAt = {};
    if (startDate) query.sentAt.$gte = new Date(startDate);
    if (endDate) query.sentAt.$lte = new Date(endDate);
  }
  
  return this.find(query)
    .sort({ sentAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('chatId', 'name type')
    .populate('replyTo', 'content');
};

messageSchema.statics.searchMessages = function(chatId, searchTerm, options = {}) {
  const {
    limit = 50,
    offset = 0,
    messageType = null,
    sender = null
  } = options;
  
  let query = {
    chatId,
    isDeleted: false,
    $or: [
      { content: { $regex: searchTerm, $options: 'i' } },
      { 'voiceMessage.transcription': { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  if (messageType) {
    query.messageType = messageType;
  }
  
  if (sender) {
    query.sender = sender;
  }
  
  return this.find(query)
    .sort({ sentAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate('sender', 'username displayName avatar');
};

// Export model
module.exports = mongoose.model('Message', messageSchema);