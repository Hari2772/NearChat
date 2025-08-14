const mongoose = require('mongoose');
const features = require('../config/features');

const groupSchema = new mongoose.Schema({
  // Group Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  
  avatar: {
    type: String,
    default: null
  },
  
  coverImage: {
    type: String,
    default: null
  },
  
  // Group Type
  type: {
    type: String,
    enum: ['social', 'business', 'education', 'entertainment', 'sports', 'travel', 'food', 'fashion', 'technology', 'other'],
    default: 'social'
  },
  
  // Group Category
  category: {
    type: String,
    enum: ['public', 'private', 'secret', 'location-based'],
    default: 'private'
  },
  
  // Privacy Settings
  privacy: {
    isPublic: {
      type: Boolean,
      default: false
    },
    isSearchable: {
      type: Boolean,
      default: true
    },
    allowMemberInvites: {
      type: Boolean,
      default: true
    },
    requireAdminApproval: {
      type: Boolean,
      default: false
    },
    allowAnonymousPosts: {
      type: Boolean,
      default: false
    },
    allowGuestViewing: {
      type: Boolean,
      default: false
    }
  },
  
  // Location Information
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
    radius: {
      type: Number,
      default: 5000, // meters
      min: 100,
      max: 50000
    }
  },
  
  // Group Settings
  settings: {
    maxMembers: {
      type: Number,
      default: 1000,
      max: 10000
    },
    maxAdmins: {
      type: Number,
      default: 10,
      max: 50
    },
    maxModerators: {
      type: Number,
      default: 20,
      max: 100
    },
    allowMemberPosts: {
      type: Boolean,
      default: true
    },
    allowMemberComments: {
      type: Boolean,
      default: true
    },
    allowMemberEvents: {
      type: Boolean,
      default: false
    },
    allowMemberPolls: {
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
      maxPostsPerHour: {
        type: Number,
        default: 5,
        min: 1,
        max: 50
      },
      maxCommentsPerHour: {
        type: Number,
        default: 20,
        min: 1,
        max: 100
      }
    }
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
      canPost: {
        type: Boolean,
        default: true
      },
      canComment: {
        type: Boolean,
        default: true
      },
      canInvite: {
        type: Boolean,
        default: false
      },
      canModerate: {
        type: Boolean,
        default: false
      },
      canManageMembers: {
        type: Boolean,
        default: false
      },
      canManageSettings: {
        type: Boolean,
        default: false
      }
    },
    notificationSettings: {
      posts: {
        type: Boolean,
        default: true
      },
      comments: {
        type: Boolean,
        default: true
      },
      events: {
        type: Boolean,
        default: true
      },
      announcements: {
        type: Boolean,
        default: true
      }
    },
    contributionStats: {
      posts: {
        type: Number,
        default: 0
      },
      comments: {
        type: Number,
        default: 0
      },
      events: {
        type: Number,
        default: 0
      },
      lastContribution: Date
    }
  }],
  
  // Pending Members
  pendingMembers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    message: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  }],
  
  // Banned Members
  bannedMembers: [{
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
    expiresAt: Date,
    isPermanent: {
      type: Boolean,
      default: false
    }
  }],
  
  // Group Rules
  rules: [{
    title: String,
    description: String,
    category: {
      type: String,
      enum: ['behavior', 'content', 'privacy', 'technical', 'other']
    },
    severity: {
      type: String,
      enum: ['warning', 'temporary-ban', 'permanent-ban'],
      default: 'warning'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Group Events
  events: [{
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event'
    },
    title: String,
    startDate: Date,
    endDate: Date,
    location: String,
    description: String,
    attendees: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      status: {
        type: String,
        enum: ['going', 'maybe', 'not-going'],
        default: 'going'
      },
      respondedAt: {
        type: Date,
        default: Date.now
      }
    }]
  }],
  
  // Group Polls
  polls: [{
    pollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Poll'
    },
    question: String,
    options: [{
      text: String,
      votes: Number
    }],
    totalVotes: Number,
    isActive: {
      type: Boolean,
      default: true
    },
    endsAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Group Announcements
  announcements: [{
    title: String,
    content: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    isPinned: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date,
    readBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }]
  }],
  
  // Group Statistics
  stats: {
    totalMembers: {
      type: Number,
      default: 0
    },
    activeMembers: {
      type: Number,
      default: 0
    },
    totalPosts: {
      type: Number,
      default: 0
    },
    totalComments: {
      type: Number,
      default: 0
    },
    totalEvents: {
      type: Number,
      default: 0
    },
    totalPolls: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastActivity: Date
  },
  
  // Moderation
  moderation: {
    isModerated: {
      type: Boolean,
      default: true
    },
    moderators: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
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
      },
      filters: {
        profanity: {
          type: Boolean,
          default: true
        },
        spam: {
          type: Boolean,
          default: true
        },
        inappropriate: {
          type: Boolean,
          default: true
        }
      }
    },
    reportedContent: [{
      contentType: {
        type: String,
        enum: ['post', 'comment', 'event', 'poll', 'user']
      },
      contentId: mongoose.Schema.Types.ObjectId,
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reportedAt: {
        type: Date,
        default: Date.now
      },
      reason: String,
      description: String,
      status: {
        type: String,
        enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
        default: 'pending'
      },
      moderator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      action: {
        type: String,
        enum: ['none', 'warning', 'temporary-ban', 'permanent-ban', 'content-removal'],
        default: 'none'
      }
    }]
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
    }],
    externalServices: [{
      service: String,
      config: mongoose.Schema.Types.Mixed,
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
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
groupSchema.index({ name: 'text', description: 'text' });
groupSchema.index({ type: 1, category: 1 });
groupSchema.index({ 'location.coordinates': '2dsphere' });
groupSchema.index({ 'members.userId': 1 });
groupSchema.index({ 'members.role': 1 });
groupSchema.index({ 'bannedMembers.userId': 1 });
groupSchema.index({ tags: 1 });
groupSchema.index({ isArchived: 1, isDeleted: 1 });
groupSchema.index({ 'stats.lastActivity': -1 });
groupSchema.index({ 'moderation.reportedContent.status': 1 });

// Virtuals
groupSchema.virtual('memberCount').get(function() {
  return this.members.filter(member => member.isActive).length;
});

groupSchema.virtual('activeMemberCount').get(function() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  return this.members.filter(member => 
    member.isActive && member.lastSeen > thirtyMinutesAgo
  ).length;
});

groupSchema.virtual('adminCount').get(function() {
  return this.members.filter(member => 
    member.isActive && ['admin', 'owner'].includes(member.role)
  ).length;
});

groupSchema.virtual('moderatorCount').get(function() {
  return this.members.filter(member => 
    member.isActive && ['moderator', 'admin', 'owner'].includes(member.role)
  ).length;
});

groupSchema.virtual('owner').get(function() {
  const owner = this.members.find(member => member.role === 'owner');
  return owner ? owner.userId : null;
});

groupSchema.virtual('admins').get(function() {
  return this.members.filter(member => 
    member.isActive && ['admin', 'owner'].includes(member.role)
  );
});

groupSchema.virtual('moderators').get(function() {
  return this.members.filter(member => 
    member.isActive && ['moderator', 'admin', 'owner'].includes(member.role)
  );
});

groupSchema.virtual('isLocationBased').get(function() {
  return this.category === 'location-based' && this.location && this.location.coordinates;
});

groupSchema.virtual('isPublic').get(function() {
  return this.privacy.isPublic;
});

groupSchema.virtual('isSearchable').get(function() {
  return this.privacy.isSearchable;
});

groupSchema.virtual('canJoin').get(function() {
  return this.memberCount < this.settings.maxMembers;
});

// Pre-save middleware
groupSchema.pre('save', function(next) {
  // Update member count
  this.stats.totalMembers = this.memberCount;
  this.stats.activeMembers = this.activeMemberCount;
  
  // Update last activity
  this.stats.lastActivity = new Date();
  
  // Validate member limits
  if (this.memberCount > this.settings.maxMembers) {
    return next(new Error(`Group cannot exceed ${this.settings.maxMembers} members`));
  }
  
  if (this.adminCount > this.settings.maxAdmins) {
    return next(new Error(`Group cannot exceed ${this.settings.maxAdmins} admins`));
  }
  
  if (this.moderatorCount > this.settings.maxModerators) {
    return next(new Error(`Group cannot exceed ${this.settings.maxModerators} moderators`));
  }
  
  next();
});

// Pre-validate middleware
groupSchema.pre('validate', function(next) {
  // Validate location for location-based groups
  if (this.category === 'location-based' && (!this.location || !this.location.coordinates)) {
    this.invalidate('location', 'Location-based groups must have coordinates');
  }
  
  // Validate member limits
  if (this.members.length > this.settings.maxMembers) {
    this.invalidate('members', `Group cannot exceed ${this.settings.maxMembers} members`);
  }
  
  // Ensure at least one owner
  const ownerCount = this.members.filter(m => m.role === 'owner').length;
  if (ownerCount === 0) {
    this.invalidate('members', 'Group must have at least one owner');
  }
  
  if (ownerCount > 1) {
    this.invalidate('members', 'Group can only have one owner');
  }
  
  next();
});

// Instance methods
groupSchema.methods.addMember = function(userId, role = 'member', addedBy = null) {
  // Check if user is already a member
  const existingMember = this.members.find(m => m.userId.toString() === userId.toString());
  if (existingMember) {
    throw new Error('User is already a member of this group');
  }
  
  // Check if user is banned
  const bannedMember = this.bannedMembers.find(b => b.userId.toString() === userId.toString());
  if (bannedMember) {
    if (bannedMember.isPermanent || (bannedMember.expiresAt && bannedMember.expiresAt > new Date())) {
      throw new Error('User is banned from this group');
    } else {
      // Remove expired ban
      this.bannedMembers = this.bannedMembers.filter(b => b.userId.toString() !== userId.toString());
    }
  }
  
  // Check member limits
  if (this.memberCount >= this.settings.maxMembers) {
    throw new Error(`Group cannot exceed ${this.settings.maxMembers} members`);
  }
  
  // Check role limits
  if (role === 'admin' && this.adminCount >= this.settings.maxAdmins) {
    throw new Error(`Group cannot exceed ${this.settings.maxAdmins} admins`);
  }
  
  if (role === 'moderator' && this.moderatorCount >= this.settings.maxModerators) {
    throw new Error(`Group cannot exceed ${this.settings.maxModerators} moderators`);
  }
  
  // Add member
  this.members.push({
    userId,
    role,
    joinedAt: new Date(),
    lastSeen: new Date(),
    isActive: true
  });
  
  // Remove from pending members if exists
  this.pendingMembers = this.pendingMembers.filter(p => p.userId.toString() !== userId.toString());
  
  return this.save();
};

groupSchema.methods.removeMember = function(userId, removedBy = null) {
  const memberIndex = this.members.findIndex(m => m.userId.toString() === userId.toString());
  if (memberIndex === -1) {
    throw new Error('User is not a member of this group');
  }
  
  const member = this.members[memberIndex];
  
  // Prevent removing the owner
  if (member.role === 'owner') {
    throw new Error('Cannot remove the owner from the group');
  }
  
  // Check if remover has permission
  if (removedBy) {
    const remover = this.members.find(m => m.userId.toString() === removedBy.toString());
    if (!remover || !['admin', 'owner'].includes(remover.role)) {
      throw new Error('Insufficient permissions to remove members');
    }
  }
  
  // Remove member
  this.members.splice(memberIndex, 1);
  
  return this.save();
};

groupSchema.methods.updateMemberRole = function(userId, newRole, updatedBy = null) {
  const member = this.members.find(m => m.userId.toString() === userId.toString());
  if (!member) {
    throw new Error('User is not a member of this group');
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
  
  // Check role limits
  if (newRole === 'admin' && this.adminCount >= this.settings.maxAdmins) {
    throw new Error(`Group cannot exceed ${this.settings.maxAdmins} admins`);
  }
  
  if (newRole === 'moderator' && this.moderatorCount >= this.settings.maxModerators) {
    throw new Error(`Group cannot exceed ${this.settings.maxModerators} moderators`);
  }
  
  member.role = newRole;
  return this.save();
};

groupSchema.methods.banMember = function(userId, reason = '', bannedBy = null, expiresAt = null, isPermanent = false) {
  // Remove from members first
  await this.removeMember(userId, bannedBy);
  
  // Add to banned members
  this.bannedMembers.push({
    userId,
    bannedBy,
    reason,
    expiresAt,
    isPermanent
  });
  
  return this.save();
};

groupSchema.methods.unbanMember = function(userId, unbannedBy = null) {
  const banIndex = this.bannedMembers.findIndex(b => b.userId.toString() === userId.toString());
  if (banIndex === -1) {
    throw new Error('User is not banned from this group');
  }
  
  // Check if unbanner has permission
  if (unbannedBy) {
    const unbanner = this.members.find(m => m.userId.toString() === unbannedBy.toString());
    if (!unbanner || !['admin', 'owner'].includes(unbanner.role)) {
      throw new Error('Insufficient permissions to unban users');
    }
  }
  
  // Remove ban
  this.bannedMembers.splice(banIndex, 1);
  
  return this.save();
};

groupSchema.methods.isUserBanned = function(userId) {
  const ban = this.bannedMembers.find(b => b.userId.toString() === userId.toString());
  if (!ban) return false;
  
  // Check if ban has expired
  if (!ban.isPermanent && ban.expiresAt && new Date() > ban.expiresAt) {
    // Remove expired ban
    this.bannedMembers = this.bannedMembers.filter(b => b.userId.toString() !== userId.toString());
    this.save();
    return false;
  }
  
  return true;
};

groupSchema.methods.canUserPost = function(userId) {
  // Check if user is banned
  if (this.isUserBanned(userId)) return false;
  
  // Check if user is a member
  const member = this.members.find(m => m.userId.toString() === userId.toString());
  if (!member || !member.isActive) return false;
  
  // Check member permissions
  if (!member.permissions.canPost) return false;
  
  // Check slow mode
  if (this.settings.slowMode.enabled) {
    // Implement slow mode logic
  }
  
  return true;
};

groupSchema.methods.addRule = function(title, description, category, severity, createdBy) {
  this.rules.push({
    title,
    description,
    category,
    severity,
    createdBy,
    createdAt: new Date()
  });
  
  return this.save();
};

groupSchema.methods.addEvent = function(eventData) {
  const event = {
    ...eventData,
    attendees: []
  };
  
  this.events.push(event);
  this.stats.totalEvents += 1;
  
  return this.save();
};

groupSchema.methods.addPoll = function(pollData) {
  const poll = {
    ...pollData,
    totalVotes: 0
  };
  
  this.polls.push(poll);
  this.stats.totalPolls += 1;
  
  return this.save();
};

groupSchema.methods.addAnnouncement = function(announcementData) {
  const announcement = {
    ...announcementData,
    createdAt: new Date(),
    readBy: []
  };
  
  this.announcements.push(announcement);
  
  return this.save();
};

// Static methods
groupSchema.statics.findByUser = function(userId, options = {}) {
  const {
    role = null,
    limit = 50,
    offset = 0,
    includeArchived = false
  } = options;
  
  let query = {
    'members.userId': userId,
    'members.isActive': true
  };
  
  if (role) {
    query['members.role'] = role;
  }
  
  if (!includeArchived) {
    query.isArchived = false;
  }
  
  return this.find(query)
    .sort({ 'stats.lastActivity': -1 })
    .skip(offset)
    .limit(limit)
    .populate('members.userId', 'username displayName avatar')
    .populate('owner', 'username displayName avatar');
};

groupSchema.statics.findPublicGroups = function(options = {}) {
  const {
    type = null,
    category = null,
    tags = [],
    limit = 50,
    offset = 0
  } = options;
  
  let query = {
    'privacy.isPublic': true,
    isArchived: false,
    isDeleted: false
  };
  
  if (type) {
    query.type = type;
  }
  
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
    .populate('owner', 'username displayName avatar')
    .select('-moderation -integrations');
};

groupSchema.statics.findNearbyGroups = function(coordinates, maxDistance = 10000, limit = 20) {
  return this.find({
    category: 'location-based',
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    },
    isArchived: false,
    isDeleted: false
  })
  .sort({ 'stats.totalMembers': -1 })
  .limit(limit)
  .populate('owner', 'username displayName avatar');
};

groupSchema.statics.searchGroups = function(searchTerm, options = {}) {
  const {
    type = null,
    category = null,
    limit = 50,
    offset = 0
  } = options;
  
  let query = {
    $text: { $search: searchTerm },
    'privacy.isSearchable': true,
    isArchived: false,
    isDeleted: false
  };
  
  if (type) {
    query.type = type;
  }
  
  if (category) {
    query.category = category;
  }
  
  return this.find(query)
    .sort({ score: { $meta: 'textScore' } })
    .skip(offset)
    .limit(limit)
    .populate('owner', 'username displayName avatar')
    .select('-moderation -integrations');
};

// Export model
module.exports = mongoose.model('Group', groupSchema);