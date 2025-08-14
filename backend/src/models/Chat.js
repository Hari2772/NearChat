const mongoose = require('mongoose');
const features = require('../config/features');

const chatSchema = new mongoose.Schema({
  // Chat Information
  name: {
    type: String,
    required: function() {
      return this.type === 'group' || this.type === 'channel';
    },
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  
  avatar: {
    type: String,
    default: null
  },
  
  // Chat Type
  type: {
    type: String,
    enum: ['direct', 'group', 'channel', 'broadcast', 'location'],
    required: true
  },
  
  // Chat Category
  category: {
    type: String,
    enum: ['personal', 'social', 'business', 'education', 'entertainment', 'other'],
    default: 'personal'
  },
  
  // Privacy Settings
  privacy: {
    type: String,
    enum: ['public', 'private', 'secret'],
    default: 'private'
  },
  
  isArchived: {
    type: Boolean,
    default: false
  },
  
  isPinned: {
    type: Boolean,
    default: false
  },
  
  // Location-based Chat
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number],
    radius: {
      type: Number,
      default: 1000, // meters
      min: 100,
      max: 50000
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    },
    placeName: String
  },
  
  // Members
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['member', 'moderator', 'admin', 'owner'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    },
    permissions: {
      canSendMessages: {
        type: Boolean,
        default: true
      },
      canSendMedia: {
        type: Boolean,
        default: true
      },
      canInviteUsers: {
        type: Boolean,
        default: false
      },
      canManageChat: {
        type: Boolean,
        default: false
      },
      canPinMessages: {
        type: Boolean,
        default: false
      }
    },
    notificationSettings: {
      muted: {
        type: Boolean,
        default: false
      },
      muteUntil: Date,
      mentionNotifications: {
        type: Boolean,
        default: true
      }
    }
  }],
  
  // Direct Chat Participants (for direct chats)
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Group/Channel Settings
  groupSettings: {
    maxMembers: {
      type: Number,
      default: 200,
      max: 1000
    },
    allowMemberInvites: {
      type: Boolean,
      default: true
    },
    requireAdminApproval: {
      type: Boolean,
      default: false
    },
    slowMode: {
      enabled: {
        type: Boolean,
        default: false
      },
      interval: {
        type: Number,
        default: 30, // seconds
        min: 5,
        max: 300
      }
    },
    antiSpam: {
      enabled: {
        type: Boolean,
        default: true
      },
      maxMessagesPerMinute: {
        type: Number,
        default: 10,
        min: 1,
        max: 100
      }
    }
  },
  
  // Channel Settings
  channelSettings: {
    isVerified: {
      type: Boolean,
      default: false
    },
    subscriberCount: {
      type: Number,
      default: 0
    },
    topics: [String],
    rules: [String],
    links: [{
      title: String,
      url: String,
      description: String
    }]
  },
  
  // Broadcast Settings
  broadcastSettings: {
    isLive: {
      type: Boolean,
      default: false
    },
    liveStartedAt: Date,
    liveEndedAt: Date,
    viewerCount: {
      type: Number,
      default: 0
    },
    maxViewers: {
      type: Number,
      default: 1000
    }
  },
  
  // Message Settings
  messageSettings: {
    allowText: {
      type: Boolean,
      default: true
    },
    allowMedia: {
      type: Boolean,
      default: true
    },
    allowVoice: {
      type: Boolean,
      default: features.isEnabled('VOICE_MESSAGES')
    },
    allowLocation: {
      type: Boolean,
      default: true
    },
    allowReactions: {
      type: Boolean,
      default: true
    },
    allowReplies: {
      type: Boolean,
      default: true
    },
    allowForwarding: {
      type: Boolean,
      default: true
    },
    allowEditing: {
      type: Boolean,
      default: true
    },
    allowDeletion: {
      type: Boolean,
      default: true
    },
    maxMessageLength: {
      type: Number,
      default: 5000,
      max: 10000
    }
  },
  
  // Pinned Messages
  pinnedMessages: [{
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    pinnedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Chat Statistics
  stats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    totalMembers: {
      type: Number,
      default: 0
    },
    lastMessageAt: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // Moderation
  moderation: {
    isModerated: {
      type: Boolean,
      default: false
    },
    moderators: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    bannedUsers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      bannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      bannedAt: {
        type: Date,
        default: Date.now
      },
      reason: String,
      expiresAt: Date
    }],
    autoModeration: {
      enabled: {
        type: Boolean,
        default: features.isEnabled('AI_MODERATION')
      },
      level: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
      }
    }
  },
  
  // Encryption
  encryption: {
    enabled: {
      type: Boolean,
      default: features.isEnabled('END_TO_END_ENCRYPTION')
    },
    algorithm: {
      type: String,
      default: 'AES-256-GCM'
    },
    keyExchange: {
      type: String,
      default: 'ECDH'
    }
  },
  
  // Integration Settings
  integrations: {
    webhooks: [{
      url: String,
      events: [String],
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    bots: [{
      botId: String,
      permissions: [String],
      isActive: {
        type: Boolean,
        default: true
      }
    }]
  },
  
  // Metadata
  tags: [String],
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
chatSchema.index({ type: 1, 'members.userId': 1 });
chatSchema.index({ 'participants': 1 });
chatSchema.index({ 'location.coordinates': '2dsphere' });
chatSchema.index({ privacy: 1, isArchived: 1 });
chatSchema.index({ 'stats.lastMessageAt': -1 });
chatSchema.index({ category: 1 });
chatSchema.index({ tags: 1 });
chatSchema.index({ 'moderation.bannedUsers.userId': 1 });

// Virtuals
chatSchema.virtual('memberCount').get(function() {
  return this.members.filter(member => member.isActive).length;
});

chatSchema.virtual('activeMemberCount').get(function() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return this.members.filter(member => 
    member.isActive && member.lastSeen > thirtyMinutesAgo
  ).length;
});

chatSchema.virtual('isDirectChat').get(function() {
  return this.type === 'direct';
});

chatSchema.virtual('isGroupChat').get(function() {
  return this.type === 'group';
});

chatSchema.virtual('isChannel').get(function() {
  return this.type === 'channel';
});

chatSchema.virtual('isBroadcast').get(function() {
  return this.type === 'broadcast';
});

chatSchema.virtual('isLocationBased').get(function() {
  return this.type === 'location';
});

chatSchema.virtual('owner').get(function() {
  const owner = this.members.find(member => member.role === 'owner');
  return owner ? owner.userId : null;
});

chatSchema.virtual('admins').get(function() {
  return this.members.filter(member => 
    member.role === 'admin' || member.role === 'owner'
  );
});

chatSchema.virtual('moderators').get(function() {
  return this.members.filter(member => 
    member.role === 'moderator' || member.role === 'admin' || member.role === 'owner'
  );
});

// Pre-save middleware
chatSchema.pre('save', function(next) {
  // Update member count
  this.stats.totalMembers = this.memberCount;
  
  // Set default name for direct chats
  if (this.type === 'direct' && this.participants.length === 2) {
    // Name will be set dynamically based on participants
  }
  
  // Validate member limits
  if (this.type === 'group' && this.members.length > this.groupSettings.maxMembers) {
    return next(new Error(`Group cannot exceed ${this.groupSettings.maxMembers} members`));
  }
  
  next();
});

// Pre-validate middleware
chatSchema.pre('validate', function(next) {
  // Validate direct chat participants
  if (this.type === 'direct' && this.participants.length !== 2) {
    this.invalidate('participants', 'Direct chats must have exactly 2 participants');
  }
  
  // Validate location for location-based chats
  if (this.type === 'location' && (!this.location || !this.location.coordinates)) {
    this.invalidate('location', 'Location-based chats must have coordinates');
  }
  
  // Validate group settings
  if (this.type === 'group' && this.members.length > this.groupSettings.maxMembers) {
    this.invalidate('members', `Group cannot exceed ${this.groupSettings.maxMembers} members`);
  }
  
  next();
});

// Instance methods
chatSchema.methods.addMember = function(userId, role = 'member', addedBy = null) {
  // Check if user is already a member
  const existingMember = this.members.find(m => m.userId.toString() === userId.toString());
  if (existingMember) {
    throw new Error('User is already a member of this chat');
  }
  
  // Check member limits for groups
  if (this.type === 'group' && this.members.length >= this.groupSettings.maxMembers) {
    throw new Error(`Group cannot exceed ${this.groupSettings.maxMembers} members`);
  }
  
  // Add new member
  this.members.push({
    userId,
    role,
    joinedAt: new Date(),
    lastSeen: new Date(),
    isActive: true
  });
  
  // Update stats
  this.stats.totalMembers = this.memberCount;
  
  return this.save();
};

chatSchema.methods.removeMember = function(userId, removedBy = null) {
  const memberIndex = this.members.findIndex(m => m.userId.toString() === userId.toString());
  if (memberIndex === -1) {
    throw new Error('User is not a member of this chat');
  }
  
  const member = this.members[memberIndex];
  
  // Prevent removing the owner
  if (member.role === 'owner') {
    throw new Error('Cannot remove the owner from the chat');
  }
  
  // Check if remover has permission
  if (removedBy) {
    const remover = this.members.find(m => m.userId.toString() === removedBy.toString());
    if (!remover || (remover.role !== 'admin' && remover.role !== 'owner')) {
      throw new Error('Insufficient permissions to remove members');
    }
  }
  
  // Remove member
  this.members.splice(memberIndex, 1);
  
  // Update stats
  this.stats.totalMembers = this.memberCount;
  
  return this.save();
};

chatSchema.methods.updateMemberRole = function(userId, newRole, updatedBy = null) {
  const member = this.members.find(m => m.userId.toString() === userId.toString());
  if (!member) {
    throw new Error('User is not a member of this chat');
  }
  
  // Check if updater has permission
  if (updatedBy) {
    const updater = this.members.find(m => m.userId.toString() === updatedBy.toString());
    if (!updater || updater.role !== 'owner') {
      throw new Error('Only the owner can change member roles');
    }
  }
  
  // Prevent changing owner role
  if (member.role === 'owner') {
    throw new Error('Cannot change the owner role');
  }
  
  member.role = newRole;
  return this.save();
};

chatSchema.methods.banUser = async function(userId, reason = '', bannedBy = null, expiresAt = null) {
  // Remove from members first
  await this.removeMember(userId, bannedBy);
  
  // Add to banned users
  this.moderation.bannedUsers.push({
    userId,
    bannedBy,
    reason,
    expiresAt
  });
  
  return this.save();
};

chatSchema.methods.unbanUser = function(userId, unbannedBy = null) {
  const banIndex = this.moderation.bannedUsers.findIndex(b => b.userId.toString() === userId.toString());
  if (banIndex === -1) {
    throw new Error('User is not banned from this chat');
  }
  
  // Check if unbanner has permission
  if (unbannedBy) {
    const unbanner = this.members.find(m => m.userId.toString() === unbannedBy.toString());
    if (!unbanner || (unbanner.role !== 'admin' && unbanner.role !== 'owner')) {
      throw new Error('Insufficient permissions to unban users');
    }
  }
  
  // Remove ban
  this.moderation.bannedUsers.splice(banIndex, 1);
  
  return this.save();
};

chatSchema.methods.isUserBanned = function(userId) {
  const ban = this.moderation.bannedUsers.find(b => b.userId.toString() === userId.toString());
  if (!ban) return false;
  
  // Check if ban has expired
  if (ban.expiresAt && new Date() > ban.expiresAt) {
    // Remove expired ban
    this.moderation.bannedUsers = this.moderation.bannedUsers.filter(b => b.userId.toString() !== userId.toString());
    this.save();
    return false;
  }
  
  return true;
};

chatSchema.methods.canUserSendMessage = function(userId) {
  // Check if user is banned
  if (this.isUserBanned(userId)) return false;
  
  // Check if user is a member
  const member = this.members.find(m => m.userId.toString() === userId.toString());
  if (!member || !member.isActive) return false;
  
  // Check member permissions
  if (!member.permissions.canSendMessages) return false;
  
  // Check slow mode
  if (this.groupSettings.slowMode.enabled) {
    // Implement slow mode logic
  }
  
  return true;
};

chatSchema.methods.pinMessage = function(messageId, pinnedBy) {
  // Check if user can pin messages
  const user = this.members.find(m => m.userId.toString() === pinnedBy.toString());
  if (!user || !user.permissions.canPinMessages) {
    throw new Error('Insufficient permissions to pin messages');
  }
  
  // Check if message is already pinned
  const existingPin = this.pinnedMessages.find(p => p.messageId.toString() === messageId.toString());
  if (existingPin) {
    throw new Error('Message is already pinned');
  }
  
  // Add to pinned messages
  this.pinnedMessages.push({
    messageId,
    pinnedBy,
    pinnedAt: new Date()
  });
  
  return this.save();
};

chatSchema.methods.unpinMessage = function(messageId, unpinnedBy) {
  const pinIndex = this.pinnedMessages.findIndex(p => p.messageId.toString() === messageId.toString());
  if (pinIndex === -1) {
    throw new Error('Message is not pinned');
  }
  
  // Check if user can unpin messages
  const user = this.members.find(m => m.userId.toString() === unpinnedBy.toString());
  if (!user || !user.permissions.canPinMessages) {
    throw new Error('Insufficient permissions to unpin messages');
  }
  
  // Remove pin
  this.pinnedMessages.splice(pinIndex, 1);
  
  return this.save();
};

chatSchema.methods.updateLastMessage = function(messageId, timestamp) {
  this.stats.lastMessageAt = timestamp || new Date();
  this.stats.totalMessages += 1;
  return this.save();
};

// Static methods
chatSchema.statics.findByUser = function(userId, options = {}) {
  const {
    type = null,
    limit = 50,
    offset = 0,
    includeArchived = false
  } = options;
  
  let query = {
    'members.userId': userId,
    'members.isActive': true
  };
  
  if (type) {
    query.type = type;
  }
  
  if (!includeArchived) {
    query.isArchived = false;
  }
  
  return this.find(query)
    .sort({ 'stats.lastMessageAt': -1 })
    .skip(offset)
    .limit(limit)
    .populate('members.userId', 'username displayName avatar isOnline lastSeenAt')
    .populate('pinnedMessages.messageId', 'content sender')
    .populate('location');
};

chatSchema.statics.findDirectChat = function(userId1, userId2) {
  return this.findOne({
    type: 'direct',
    participants: { $all: [userId1, userId2] }
  }).populate('participants', 'username displayName avatar isOnline lastSeenAt');
};

chatSchema.statics.findNearbyChats = function(coordinates, maxDistance = 5000, limit = 20) {
  return this.find({
    type: 'location',
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    },
    isArchived: false
  })
  .populate('members.userId', 'username displayName avatar')
  .limit(limit);
};

chatSchema.statics.findPublicGroups = function(options = {}) {
  const {
    category = null,
    tags = [],
    limit = 50,
    offset = 0
  } = options;
  
  let query = {
    type: 'group',
    privacy: 'public',
    isArchived: false
  };
  
  if (category) {
    query.category = category;
  }
  
  if (tags.length > 0) {
    query.tags = { $in: tags };
  }
  
  return this.find(query)
    .sort({ 'stats.totalMembers': -1 })
    .skip(offset)
    .limit(limit)
    .populate('members.userId', 'username displayName avatar')
    .select('-moderation -encryption -integrations');
};

// Export model
module.exports = mongoose.model('Chat', chatSchema);