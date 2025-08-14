const Call = require('../models/Call');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Analytics = require('../models/Analytics');
const features = require('../config/features');
const logger = require('../utils/logger');
const redis = require('../config/redis');

class CallHandler {
  constructor() {
    this.activeCalls = new Map(); // callId -> call data
    this.callParticipants = new Map(); // callId -> Set of participant userIds
    this.callRooms = new Map(); // callId -> roomId
  }

  handleConnection(socket, socketManager) {
    try {
      const userId = socket.userId;

      // Handle call events
      socket.on('initiate_call', (data) => this.handleInitiateCall(socket, socketManager, data));
      socket.on('accept_call', (data) => this.handleAcceptCall(socket, socketManager, data));
      socket.on('reject_call', (data) => this.handleRejectCall(socket, socketManager, data));
      socket.on('end_call', (data) => this.handleEndCall(socket, socketManager, data));
      socket.on('join_call', (data) => this.handleJoinCall(socket, socketManager, data));
      socket.on('leave_call', (data) => this.handleLeaveCall(socket, socketManager, data));
      socket.on('call_ice_candidate', (data) => this.handleIceCandidate(socket, socketManager, data));
      socket.on('call_sdp_offer', (data) => this.handleSdpOffer(socket, socketManager, data));
      socket.on('call_sdp_answer', (data) => this.handleSdpAnswer(socket, socketManager, data));
      socket.on('call_quality_update', (data) => this.handleCallQualityUpdate(socket, socketManager, data));
      socket.on('call_mute_toggle', (data) => this.handleMuteToggle(socket, socketManager, data));
      socket.on('call_video_toggle', (data) => this.handleVideoToggle(socket, socketManager, data));
      socket.on('call_screen_share_request', (data) => this.handleScreenShareRequest(socket, socketManager, data));

      logger.info(`Call handler initialized for user ${userId}`);
    } catch (error) {
      logger.error('Error initializing call handler:', error);
    }
  }

  async handleInitiateCall(socket, socketManager, data) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        socket.emit('error', { message: 'Voice/video calls feature is disabled' });
        return;
      }

      const { chatId, type = 'audio', participants, settings = {} } = data;
      const userId = socket.userId;

      // Validate call type
      if (!['audio', 'video', 'screen'].includes(type)) {
        socket.emit('error', { message: 'Invalid call type' });
        return;
      }

      // Check if user can access the chat
      const chat = await Chat.findById(chatId);
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }

      if (!chat.participants.includes(userId)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Check if there's already an active call
      const activeCall = await Call.findOne({
        chat: chatId,
        status: { $in: ['initiating', 'ringing', 'connected'] }
      });

      if (activeCall) {
        socket.emit('error', { message: 'Call already in progress' });
        return;
      }

      // Determine participants
      let callParticipants = participants || chat.participants;
      if (!callParticipants.includes(userId)) {
        callParticipants.push(userId);
      }

      // Create call record
      const call = new Call({
        callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        status: 'initiating',
        direction: 'outgoing',
        initiator: userId,
        chat: chatId,
        participants: callParticipants.map(participantId => ({
          user: participantId,
          status: participantId === userId ? 'connected' : 'invited',
          joinedAt: participantId === userId ? new Date() : null
        })),
        settings: {
          maxParticipants: settings.maxParticipants || 10,
          allowRecording: settings.allowRecording !== false,
          allowScreenSharing: settings.allowScreenSharing !== false,
          allowMute: settings.allowMute !== false,
          allowVideo: type === 'video' ? (settings.allowVideo !== false) : false,
          ...settings
        },
        startTime: new Date()
      });

      await call.save();

      // Store call data
      this.activeCalls.set(call.callId, call);
      this.callParticipants.set(call.callId, new Set([userId]));
      this.callRooms.set(call.callId, `call_${call.callId}`);

      // Join call room
      socketManager.joinRoom(userId, `call_${call.callId}`, 'call');

      // Send push notifications to participants
      for (const participantId of callParticipants) {
        if (participantId.toString() === userId) continue;

        const participant = await User.findById(participantId);
        if (participant && participant.notificationSettings.incomingCalls) {
          // Emit to Socket.IO for real-time notification
          socketManager.broadcastToUser(participantId, 'incoming_call', {
            callId: call.callId,
            chatId,
            type,
            initiator: {
              id: socket.user._id,
              displayName: socket.user.displayName,
              avatar: socket.user.avatar
            },
            settings: call.settings,
            timestamp: new Date()
          });
        }
      }

      // Emit call initiated confirmation
      socket.emit('call_initiated', {
        callId: call.callId,
        status: call.status,
        participants: call.participants,
        settings: call.settings,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_initiation' },
        {
          $inc: { [`metrics.calls.${type}CallsInitiated`: 1] },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error initiating call:', error);
      socket.emit('error', { message: 'Failed to initiate call' });
    }
  }

  async handleAcceptCall(socket, socketManager, data) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        socket.emit('error', { message: 'Voice/video calls feature is disabled' });
        return;
      }

      const { callId } = data;
      const userId = socket.userId;

      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Check if call can be accepted
      if (call.status !== 'initiating') {
        socket.emit('error', { message: 'Call cannot be accepted in current state' });
        return;
      }

      // Update participant status
      participant.status = 'connected';
      participant.joinedAt = new Date();
      participant.deviceInfo = data.deviceInfo || {};

      // Update call status
      call.status = 'ringing';
      await call.save();

      // Update active calls
      if (this.activeCalls.has(callId)) {
        this.activeCalls.get(callId).status = 'ringing';
      }

      // Join call room
      socketManager.joinRoom(userId, `call_${callId}`, 'call');

      // Add to participants set
      if (this.callParticipants.has(callId)) {
        this.callParticipants.get(callId).add(userId);
      }

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        socketManager.broadcastToUser(otherParticipant.user, 'participant_joined_call', {
          callId,
          participant: {
            id: userId,
            displayName: socket.user.displayName,
            avatar: socket.user.avatar,
            joinedAt: participant.joinedAt
          },
          timestamp: new Date()
        });
      }

      // Emit call accepted confirmation
      socket.emit('call_accepted', {
        callId: call.callId,
        status: call.status,
        participant: participant,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_acceptance' },
        {
          $inc: { 'metrics.calls.callsAccepted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error accepting call:', error);
      socket.emit('error', { message: 'Failed to accept call' });
    }
  }

  async handleRejectCall(socket, socketManager, data) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        socket.emit('error', { message: 'Voice/video calls feature is disabled' });
        return;
      }

      const { callId, reason } = data;
      const userId = socket.userId;

      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Update participant status
      participant.status = 'rejected';
      participant.leftAt = new Date();
      participant.rejectionReason = reason;

      // Check if all participants rejected
      const allRejected = call.participants.every(p => 
        p.status === 'rejected' || p.status === 'declined'
      );

      if (allRejected) {
        call.status = 'ended';
        call.endTime = new Date();
        call.endReason = 'all_rejected';
      }

      await call.save();

      // Remove from active calls if ended
      if (call.status === 'ended') {
        this.activeCalls.delete(callId);
        this.callParticipants.delete(callId);
        this.callRooms.delete(callId);
      }

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        socketManager.broadcastToUser(otherParticipant.user, 'participant_rejected', {
          callId,
          participant: {
            id: userId,
            displayName: socket.user.displayName,
            reason
          },
          timestamp: new Date()
        });
      }

      // Emit call rejected confirmation
      socket.emit('call_rejected', {
        callId: call.callId,
        status: call.status,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_rejection' },
        {
          $inc: { 'metrics.calls.callsRejected': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error rejecting call:', error);
      socket.emit('error', { message: 'Failed to reject call' });
    }
  }

  async handleEndCall(socket, socketManager, data) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        socket.emit('error', { message: 'Voice/video calls feature is disabled' });
        return;
      }

      const { callId } = data;
      const userId = socket.userId;

      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Update participant status
      participant.status = 'left';
      participant.leftAt = new Date();

      // Check if all participants left
      const allLeft = call.participants.every(p => 
        p.status === 'left' || p.status === 'rejected' || p.status === 'declined'
      );

      if (allLeft) {
        call.status = 'ended';
        call.endTime = new Date();
        call.endReason = 'all_participants_left';
        call.duration = call.endTime - call.startTime;
      }

      await call.save();

      // Remove from active calls if ended
      if (call.status === 'ended') {
        this.activeCalls.delete(callId);
        this.callParticipants.delete(callId);
        this.callRooms.delete(callId);
      }

      // Leave call room
      socketManager.leaveRoom(userId, `call_${callId}`);

      // Remove from participants set
      if (this.callParticipants.has(callId)) {
        this.callParticipants.get(callId).delete(userId);
      }

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        socketManager.broadcastToUser(otherParticipant.user, 'participant_left_call', {
          callId,
          participant: {
            id: userId,
            displayName: socket.user.displayName,
            leftAt: participant.leftAt
          },
          timestamp: new Date()
        });
      }

      // Emit call ended confirmation
      socket.emit('call_ended', {
        callId: call.callId,
        status: call.status,
        timestamp: new Date()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_ending' },
        {
          $inc: { 'metrics.calls.callsEnded': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error ending call:', error);
      socket.emit('error', { message: 'Failed to end call' });
    }
  }

  async handleJoinCall(socket, socketManager, data) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        socket.emit('error', { message: 'Voice/video calls feature is disabled' });
        return;
      }

      const { callId } = data;
      const userId = socket.userId;

      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Check if call is active
      if (call.status !== 'ringing' && call.status !== 'connected') {
        socket.emit('error', { message: 'Call is not active' });
        return;
      }

      // Update participant info
      participant.deviceInfo = data.deviceInfo || {};
      participant.networkInfo = data.networkInfo || {};
      participant.lastSeen = new Date();

      // Update call status if first participant joins
      if (call.participants.filter(p => p.status === 'connected').length === 1) {
        call.status = 'connected';
        call.connectedAt = new Date();
      }

      await call.save();

      // Join call room
      socketManager.joinRoom(userId, `call_${callId}`, 'call');

      // Add to participants set
      if (this.callParticipants.has(callId)) {
        this.callParticipants.get(callId).add(userId);
      }

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        socketManager.broadcastToUser(otherParticipant.user, 'participant_joined_call', {
          callId,
          participant: {
            id: userId,
            displayName: socket.user.displayName,
            avatar: socket.user.avatar,
            joinedAt: new Date()
          },
          timestamp: new Date()
        });
      }

      // Emit call joined confirmation
      socket.emit('call_joined', {
        callId: call.callId,
        status: call.status,
        participant: participant,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error joining call:', error);
      socket.emit('error', { message: 'Failed to join call' });
    }
  }

  async handleLeaveCall(socket, socketManager, data) {
    try {
      const { callId } = data;
      const userId = socket.userId;

      // Leave call room
      socketManager.leaveRoom(userId, `call_${callId}`);

      // Remove from participants set
      if (this.callParticipants.has(callId)) {
        this.callParticipants.get(callId).delete(userId);
      }

      socket.emit('call_left', {
        callId,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error leaving call:', error);
      socket.emit('error', { message: 'Failed to leave call' });
    }
  }

  // WebRTC signaling handlers
  handleIceCandidate(socket, socketManager, data) {
    try {
      const { callId, targetUserId, candidate } = data;
      const userId = socket.userId;

      // Forward ICE candidate to target user
      socketManager.broadcastToUser(targetUserId, 'call_ice_candidate', {
        callId,
        fromUserId: userId,
        candidate,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error handling ICE candidate:', error);
    }
  }

  handleSdpOffer(socket, socketManager, data) {
    try {
      const { callId, targetUserId, offer } = data;
      const userId = socket.userId;

      // Forward SDP offer to target user
      socketManager.broadcastToUser(targetUserId, 'call_sdp_offer', {
        callId,
        fromUserId: userId,
        offer,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error handling SDP offer:', error);
    }
  }

  handleSdpAnswer(socket, socketManager, data) {
    try {
      const { callId, targetUserId, answer } = data;
      const userId = socket.userId;

      // Forward SDP answer to target user
      socketManager.broadcastToUser(targetUserId, 'call_sdp_answer', {
        callId,
        fromUserId: userId,
        answer,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error handling SDP answer:', error);
    }
  }

  // Call quality and control handlers
  async handleCallQualityUpdate(socket, socketManager, data) {
    try {
      const { callId, qualityMetrics } = data;
      const userId = socket.userId;

      const call = await Call.findOne({ callId });
      if (!call) return;

      // Update call quality metrics
      if (!call.qualityMetrics) {
        call.qualityMetrics = {};
      }

      call.qualityMetrics = {
        ...call.qualityMetrics,
        ...qualityMetrics,
        lastUpdated: new Date()
      };

      await call.save();

    } catch (error) {
      logger.error('Error handling call quality update:', error);
    }
  }

  handleMuteToggle(socket, socketManager, data) {
    try {
      const { callId, isMuted } = data;
      const userId = socket.userId;

      // Broadcast mute status to other participants
      socketManager.broadcastToRoom(`call_${callId}`, 'call_mute_toggled', {
        callId,
        userId,
        isMuted,
        timestamp: new Date()
      }, userId);

    } catch (error) {
      logger.error('Error handling mute toggle:', error);
    }
  }

  handleVideoToggle(socket, socketManager, data) {
    try {
      const { callId, isVideoEnabled } = data;
      const userId = socket.userId;

      // Broadcast video status to other participants
      socketManager.broadcastToRoom(`call_${callId}`, 'call_video_toggled', {
        callId,
        userId,
        isVideoEnabled,
        timestamp: new Date()
      }, userId);

    } catch (error) {
      logger.error('Error handling video toggle:', error);
    }
  }

  handleScreenShareRequest(socket, socketManager, data) {
    try {
      const { callId, targetUserId } = data;
      const userId = socket.userId;

      // Forward screen share request to target user
      socketManager.broadcastToUser(targetUserId, 'call_screen_share_request', {
        callId,
        fromUserId: userId,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error handling screen share request:', error);
    }
  }

  // Utility methods
  getActiveCall(callId) {
    return this.activeCalls.get(callId);
  }

  getCallParticipants(callId) {
    return this.callParticipants.get(callId) || new Set();
  }

  isUserInCall(userId, callId) {
    return this.callParticipants.has(callId) && 
           this.callParticipants.get(callId).has(userId);
  }

  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  // Cleanup
  cleanup() {
    this.activeCalls.clear();
    this.callParticipants.clear();
    this.callRooms.clear();
  }
}

module.exports = new CallHandler();