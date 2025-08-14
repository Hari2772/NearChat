const Call = require('../models/Call');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Recording = require('../models/Recording');
const Analytics = require('../models/Analytics');
const features = require('../config/features');
const webrtc = require('../config/webrtc');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { sendPushNotification } = require('../utils/notifications');
const redis = require('../config/redis');

class CallController {
  // Initiate call
  async initiateCall(req, res) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        return res.status(403).json({ error: 'Voice/video calls feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { chatId, type = 'audio', participants, settings = {} } = req.body;

      // Validate call type
      if (!['audio', 'video', 'screen'].includes(type)) {
        return res.status(400).json({ error: 'Invalid call type' });
      }

      // Check if user can access the chat
      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      if (!chat.participants.includes(userId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check if there's already an active call
      const activeCall = await Call.findOne({
        chat: chatId,
        status: { $in: ['initiating', 'ringing', 'connected'] }
      });

      if (activeCall) {
        return res.status(400).json({ error: 'Call already in progress' });
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

      // Create WebRTC room
      await webrtc.createRouter(call.callId);

      // Send push notifications to participants
      for (const participantId of callParticipants) {
        if (participantId.toString() === userId) continue;

        const participant = await User.findById(participantId);
        if (participant && participant.notificationSettings.incomingCalls) {
          await sendPushNotification(participantId, {
            title: chat.type === 'direct' ? req.user.displayName : chat.name,
            body: `Incoming ${type} call`,
            data: { 
              type: 'incoming_call', 
              callId: call.callId, 
              chatId,
              callType: type 
            }
          });
        }

        // Emit to Socket.IO
        req.app.get('io').to(participantId.toString()).emit('incoming_call', {
          callId: call.callId,
          chatId,
          type,
          initiator: {
            id: req.user._id,
            displayName: req.user.displayName,
            avatar: req.user.avatar
          },
          settings: call.settings
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_initiation' },
        {
          $inc: { [`metrics.calls.${type}CallsInitiated`: 1] },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.status(201).json({
        callId: call.callId,
        status: call.status,
        participants: call.participants,
        settings: call.settings
      });
    } catch (error) {
      logger.error('Error initiating call:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Accept call
  async acceptCall(req, res) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        return res.status(403).json({ error: 'Voice/video calls feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { callId } = req.params;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
      }

      // Check if call can be accepted
      if (call.status !== 'ringing') {
        return res.status(400).json({ error: 'Call cannot be accepted in current state' });
      }

      // Update participant status
      participant.status = 'connected';
      participant.joinedAt = new Date();
      participant.deviceInfo = req.body.deviceInfo || {};

      // Update call status if first participant joins
      if (call.participants.filter(p => p.status === 'connected').length === 1) {
        call.status = 'connected';
        call.connectedAt = new Date();
      }

      await call.save();

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        req.app.get('io').to(otherParticipant.user.toString()).emit('participant_joined', {
          callId,
          participant: {
            id: userId,
            displayName: req.user.displayName,
            avatar: req.user.avatar,
            joinedAt: participant.joinedAt
          }
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_acceptance' },
        {
          $inc: { 'metrics.calls.callsAccepted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({
        callId: call.callId,
        status: call.status,
        participant: participant
      });
    } catch (error) {
      logger.error('Error accepting call:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Reject call
  async rejectCall(req, res) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        return res.status(403).json({ error: 'Voice/video calls feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { callId } = req.params;
      const { reason } = req.body;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
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

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        req.app.get('io').to(otherParticipant.user.toString()).emit('participant_rejected', {
          callId,
          participant: {
            id: userId,
            displayName: req.user.displayName,
            reason
          }
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_rejection' },
        {
          $inc: { 'metrics.calls.callsRejected': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'Call rejected successfully' });
    } catch (error) {
      logger.error('Error rejecting call:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // End call
  async endCall(req, res) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        return res.status(403).json({ error: 'Voice/video calls feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { callId } = req.params;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
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

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        req.app.get('io').to(otherParticipant.user.toString()).emit('participant_left', {
          callId,
          participant: {
            id: userId,
            displayName: req.user.displayName,
            leftAt: participant.leftAt
          }
        });
      }

      // Close WebRTC room if call ended
      if (call.status === 'ended') {
        await webrtc.closeRoom(call.callId);
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_ending' },
        {
          $inc: { 'metrics.calls.callsEnded': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({ message: 'Call ended successfully' });
    } catch (error) {
      logger.error('Error ending call:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Join call
  async joinCall(req, res) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        return res.status(403).json({ error: 'Voice/video calls feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { callId } = req.params;
      const { deviceInfo, networkInfo } = req.body;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
      }

      // Check if call is active
      if (call.status !== 'connected') {
        return res.status(400).json({ error: 'Call is not active' });
      }

      // Update participant info
      participant.deviceInfo = deviceInfo || {};
      participant.networkInfo = networkInfo || {};
      participant.lastSeen = new Date();

      await call.save();

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        req.app.get('io').to(otherParticipant.user.toString()).emit('participant_joined_call', {
          callId,
          participant: {
            id: userId,
            displayName: req.user.displayName,
            avatar: req.user.avatar,
            joinedAt: new Date()
          }
        });
      }

      res.json({
        callId: call.callId,
        status: call.status,
        participant: participant
      });
    } catch (error) {
      logger.error('Error joining call:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Start recording
  async startRecording(req, res) {
    try {
      if (!features.isEnabled('call_recording')) {
        return res.status(403).json({ error: 'Call recording feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { callId } = req.params;
      const { options = {} } = req.body;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
      }

      // Check if recording is allowed
      if (!call.settings.allowRecording) {
        return res.status(403).json({ error: 'Recording not allowed in this call' });
      }

      // Check if already recording
      if (call.recording && call.recording.active) {
        return res.status(400).json({ error: 'Recording already in progress' });
      }

      // Start recording in WebRTC
      const recordingConfig = await webrtc.startRecording(callId, options);

      // Update call recording info
      call.recording = {
        active: true,
        startedBy: userId,
        startTime: new Date(),
        config: recordingConfig
      };

      await call.save();

      // Create recording record
      const recording = new Recording({
        title: `Call Recording - ${call.type} call`,
        description: `Recording of ${call.type} call in ${call.chat}`,
        type: 'call',
        source: {
          type: 'Call',
          id: call._id,
          callId: call.callId
        },
        creator: userId,
        status: 'processing',
        processing: {
          status: 'recording',
          progress: 0,
          steps: ['Started recording']
        },
        callInfo: {
          callId: call.callId,
          type: call.type,
          participants: call.participants.length
        }
      });

      await recording.save();

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        req.app.get('io').to(otherParticipant.user.toString()).emit('recording_started', {
          callId,
          startedBy: {
            id: userId,
            displayName: req.user.displayName
          },
          startTime: call.recording.startTime
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_recording' },
        {
          $inc: { 'metrics.calls.recordingsStarted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({
        message: 'Recording started successfully',
        recording: call.recording,
        recordingId: recording._id
      });
    } catch (error) {
      logger.error('Error starting recording:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Stop recording
  async stopRecording(req, res) {
    try {
      if (!features.isEnabled('call_recording')) {
        return res.status(403).json({ error: 'Call recording feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { callId } = req.params;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
      }

      // Check if recording is active
      if (!call.recording || !call.recording.active) {
        return res.status(400).json({ error: 'No active recording' });
      }

      // Stop recording in WebRTC
      const recordingResult = await webrtc.stopRecording(callId);

      // Update call recording info
      call.recording.active = false;
      call.recording.stoppedBy = userId;
      call.recording.stopTime = new Date();
      call.recording.duration = call.recording.stopTime - call.recording.startTime;

      await call.save();

      // Update recording record
      const recording = await Recording.findOne({
        'source.type': 'Call',
        'source.id': call._id
      });

      if (recording) {
        recording.status = 'completed';
        recording.processing.status = 'completed';
        recording.processing.progress = 100;
        recording.processing.steps.push('Recording completed');
        recording.content = {
          url: recordingResult.fileUrl || '',
          size: recordingResult.fileSize || 0,
          duration: call.recording.duration,
          format: recordingResult.format || 'webm',
          quality: recordingResult.quality || 'high'
        };
        await recording.save();
      }

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        req.app.get('io').to(otherParticipant.user.toString()).emit('recording_stopped', {
          callId,
          stoppedBy: {
            id: userId,
            displayName: req.user.displayName
          },
          stopTime: call.recording.stopTime,
          duration: call.recording.duration
        });
      }

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_recording' },
        {
          $inc: { 'metrics.calls.recordingsCompleted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      res.json({
        message: 'Recording stopped successfully',
        recording: call.recording,
        recordingId: recording?._id
      });
    } catch (error) {
      logger.error('Error stopping recording:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Enable screen sharing
  async enableScreenSharing(req, res) {
    try {
      if (!features.isEnabled('screen_sharing')) {
        return res.status(403).json({ error: 'Screen sharing feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { callId } = req.params;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
      }

      // Check if screen sharing is allowed
      if (!call.settings.allowScreenSharing) {
        return res.status(403).json({ error: 'Screen sharing not allowed in this call' });
      }

      // Check if already sharing
      if (call.screenSharing && call.screenSharing.active) {
        return res.status(400).json({ error: 'Screen sharing already active' });
      }

      // Enable screen sharing in WebRTC
      const screenProducer = await webrtc.enableScreenSharing(callId, userId);

      // Update call screen sharing info
      call.screenSharing = {
        active: true,
        startedBy: userId,
        startTime: new Date(),
        producerId: screenProducer.id
      };

      await call.save();

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        req.app.get('io').to(otherParticipant.user.toString()).emit('screen_sharing_started', {
          callId,
          startedBy: {
            id: userId,
            displayName: req.user.displayName
          },
          startTime: call.screenSharing.startTime
        });
      }

      res.json({
        message: 'Screen sharing enabled successfully',
        screenSharing: call.screenSharing
      });
    } catch (error) {
      logger.error('Error enabling screen sharing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Disable screen sharing
  async disableScreenSharing(req, res) {
    try {
      if (!features.isEnabled('screen_sharing')) {
        return res.status(403).json({ error: 'Screen sharing feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { callId } = req.params;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
      }

      // Check if screen sharing is active
      if (!call.screenSharing || !call.screenSharing.active) {
        return res.status(400).json({ error: 'No active screen sharing' });
      }

      // Check if user started the screen sharing
      if (call.screenSharing.startedBy.toString() !== userId) {
        return res.status(403).json({ error: 'Cannot stop screen sharing started by another user' });
      }

      // Disable screen sharing in WebRTC
      await webrtc.closeRoom(callId);

      // Update call screen sharing info
      call.screenSharing.active = false;
      call.screenSharing.stopTime = new Date();
      call.screenSharing.duration = call.screenSharing.stopTime - call.screenSharing.startTime;

      await call.save();

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      for (const otherParticipant of otherParticipants) {
        req.app.get('io').to(otherParticipant.user.toString()).emit('screen_sharing_stopped', {
          callId,
          stoppedBy: {
            id: userId,
            displayName: req.user.displayName
          },
          stopTime: call.screenSharing.stopTime,
          duration: call.screenSharing.duration
        });
      }

      res.json({
        message: 'Screen sharing disabled successfully',
        screenSharing: call.screenSharing
      });
    } catch (error) {
      logger.error('Error disabling screen sharing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get call statistics
  async getCallStats(req, res) {
    try {
      if (!features.isEnabled('call_analytics')) {
        return res.status(403).json({ error: 'Call analytics feature is disabled' });
      }

      const userId = req.user.id;
      const { callId } = req.params;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
      }

      // Get WebRTC room stats
      const roomStats = await webrtc.getRoomStats(callId);

      // Calculate call quality metrics
      const qualityMetrics = {
        audioQuality: call.qualityMetrics?.audioQuality || 'unknown',
        videoQuality: call.qualityMetrics?.videoQuality || 'unknown',
        networkLatency: call.qualityMetrics?.networkLatency || 0,
        packetLoss: call.qualityMetrics?.packetLoss || 0,
        bandwidth: call.qualityMetrics?.bandwidth || 0
      };

      const stats = {
        callId: call.callId,
        type: call.type,
        status: call.status,
        duration: call.duration || (call.startTime ? Date.now() - call.startTime.getTime() : 0),
        participants: call.participants.length,
        connectedParticipants: call.participants.filter(p => p.status === 'connected').length,
        qualityMetrics,
        roomStats,
        recording: call.recording,
        screenSharing: call.screenSharing
      };

      res.json(stats);
    } catch (error) {
      logger.error('Error getting call stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update call quality metrics
  async updateCallQuality(req, res) {
    try {
      if (!features.isEnabled('call_quality_monitoring')) {
        return res.status(403).json({ error: 'Call quality monitoring feature is disabled' });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const userId = req.user.id;
      const { callId } = req.params;
      const { qualityMetrics } = req.body;

      const call = await Call.findOne({ callId });
      if (!call) {
        return res.status(404).json({ error: 'Call not found' });
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        return res.status(403).json({ error: 'Not a participant in this call' });
      }

      // Update quality metrics
      if (!call.qualityMetrics) {
        call.qualityMetrics = {};
      }

      call.qualityMetrics = {
        ...call.qualityMetrics,
        ...qualityMetrics,
        lastUpdated: new Date()
      };

      await call.save();

      res.json({ message: 'Call quality metrics updated successfully' });
    } catch (error) {
      logger.error('Error updating call quality:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get user's call history
  async getCallHistory(req, res) {
    try {
      if (!features.isEnabled('call_history')) {
        return res.status(403).json({ error: 'Call history feature is disabled' });
      }

      const userId = req.user.id;
      const { limit = 20, offset = 0, status, type } = req.query;

      const query = {
        participants: { $elemMatch: { user: userId } }
      };

      if (status) {
        query.status = status;
      }

      if (type) {
        query.type = type;
      }

      const calls = await Call.find(query)
        .populate('chat', 'name type')
        .populate('initiator', 'username displayName avatar')
        .populate('participants.user', 'username displayName avatar')
        .sort({ startTime: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await Call.countDocuments(query);

      res.json({
        calls,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      logger.error('Error getting call history:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = new CallController();