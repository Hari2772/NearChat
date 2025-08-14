const webrtc = require('../../config/webrtc');
const Call = require('../../models/Call');
const Recording = require('../../models/Recording');
const Analytics = require('../../models/Analytics');
const features = require('../../config/features');
const logger = require('../../utils/logger');
const redis = require('../../config/redis');

class WebRTCHandler {
  constructor() {
    this.mediaProducers = new Map(); // callId -> Map of userId -> producer
    this.mediaConsumers = new Map(); // callId -> Map of userId -> consumer
    this.screenSharing = new Map(); // callId -> { userId, producerId, startTime }
    this.recordings = new Map(); // callId -> recording data
  }

  handleConnection(socket, socketManager) {
    try {
      const userId = socket.userId;

      // Handle WebRTC events
      socket.on('webrtc_transport_create', (data) => this.handleTransportCreate(socket, socketManager, data));
      socket.on('webrtc_transport_connect', (data) => this.handleTransportConnect(socket, socketManager, data));
      socket.on('webrtc_produce', (data) => this.handleProduce(socket, socketManager, data));
      socket.on('webrtc_consume', (data) => this.handleConsume(socket, socketManager, data));
      socket.on('webrtc_producer_close', (data) => this.handleProducerClose(socket, socketManager, data));
      socket.on('webrtc_consumer_close', (data) => this.handleConsumerClose(socket, socketManager, data));
      socket.on('webrtc_screen_share_start', (data) => this.handleScreenShareStart(socket, socketManager, data));
      socket.on('webrtc_screen_share_stop', (data) => this.handleScreenShareStop(socket, socketManager, data));
      socket.on('webrtc_recording_start', (data) => this.handleRecordingStart(socket, socketManager, data));
      socket.on('webrtc_recording_stop', (data) => this.handleRecordingStop(socket, socketManager, data));
      socket.on('webrtc_get_stats', (data) => this.handleGetStats(socket, socketManager, data));
      socket.on('webrtc_network_quality', (data) => this.handleNetworkQuality(socket, socketManager, data));

      logger.info(`WebRTC handler initialized for user ${userId}`);
    } catch (error) {
      logger.error('Error initializing WebRTC handler:', error);
    }
  }

  async handleTransportCreate(socket, socketManager, data) {
    try {
      if (!features.isEnabled('webrtc_transport')) {
        socket.emit('error', { message: 'WebRTC transport feature is disabled' });
        return;
      }

      const { callId, direction } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      if (!call.participants.find(p => p.user.toString() === userId)) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Create WebRTC transport
      const transport = await webrtc.createWebRtcTransport(callId, userId, direction);
      
      if (!transport) {
        socket.emit('error', { message: 'Failed to create transport' });
        return;
      }

      // Emit transport created event
      socket.emit('webrtc_transport_created', {
        callId,
        direction,
        transportId: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters,
        timestamp: new Date()
      });

      logger.info(`WebRTC transport created for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error creating WebRTC transport:', error);
      socket.emit('error', { message: 'Failed to create transport' });
    }
  }

  async handleTransportConnect(socket, socketManager, data) {
    try {
      const { callId, transportId, dtlsParameters } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      if (!call.participants.find(p => p.user.toString() === userId)) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Connect transport
      const room = webrtc.rooms.get(callId);
      if (!room) {
        socket.emit('error', { message: 'Call room not found' });
        return;
      }

      const peerTransports = room.transports.get(userId);
      if (!peerTransports) {
        socket.emit('error', { message: 'User transports not found' });
        return;
      }

      const transport = peerTransports.get(transportId);
      if (!transport) {
        socket.emit('error', { message: 'Transport not found' });
        return;
      }

      await transport.connect({ dtlsParameters });

      // Emit transport connected event
      socket.emit('webrtc_transport_connected', {
        callId,
        transportId,
        timestamp: new Date()
      });

      logger.info(`WebRTC transport connected for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error connecting WebRTC transport:', error);
      socket.emit('error', { message: 'Failed to connect transport' });
    }
  }

  async handleProduce(socket, socketManager, data) {
    try {
      if (!features.isEnabled('webrtc_media_production')) {
        socket.emit('error', { message: 'WebRTC media production feature is disabled' });
        return;
      }

      const { callId, transportId, kind, rtpParameters, appData = {} } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      if (!call.participants.find(p => p.user.toString() === userId)) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Create producer
      const producer = await webrtc.createProducer(callId, userId, transportId, kind, rtpParameters);
      
      if (!producer) {
        socket.emit('error', { message: 'Failed to create producer' });
        return;
      }

      // Store producer reference
      if (!this.mediaProducers.has(callId)) {
        this.mediaProducers.set(callId, new Map());
      }
      this.mediaProducers.get(callId).set(userId, producer);

      // Emit producer created event
      socket.emit('webrtc_producer_created', {
        callId,
        producerId: producer.id,
        kind,
        timestamp: new Date()
      });

      // Notify other participants about new producer
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      otherParticipants.forEach(participant => {
        socketManager.broadcastToUser(participant.user, 'webrtc_new_producer', {
          callId,
          producerId: producer.id,
          kind,
          userId,
          timestamp: new Date()
        });
      });

      logger.info(`WebRTC producer created for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error creating WebRTC producer:', error);
      socket.emit('error', { message: 'Failed to create producer' });
    }
  }

  async handleConsume(socket, socketManager, data) {
    try {
      if (!features.isEnabled('webrtc_media_consumption')) {
        socket.emit('error', { message: 'WebRTC media consumption feature is disabled' });
        return;
      }

      const { callId, transportId, producerId, rtpCapabilities, paused = false } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      if (!call.participants.find(p => p.user.toString() === userId)) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Create consumer
      const consumer = await webrtc.createConsumer(callId, userId, transportId, producerId, rtpCapabilities, paused);
      
      if (!consumer) {
        socket.emit('error', { message: 'Failed to create consumer' });
        return;
      }

      // Store consumer reference
      if (!this.mediaConsumers.has(callId)) {
        this.mediaConsumers.set(callId, new Map());
      }
      this.mediaConsumers.get(callId).set(userId, consumer);

      // Emit consumer created event
      socket.emit('webrtc_consumer_created', {
        callId,
        consumerId: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        score: consumer.score,
        paused: consumer.paused,
        timestamp: new Date()
      });

      logger.info(`WebRTC consumer created for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error creating WebRTC consumer:', error);
      socket.emit('error', { message: 'Failed to create consumer' });
    }
  }

  async handleProducerClose(socket, socketManager, data) {
    try {
      const { callId, producerId } = data;
      const userId = socket.userId;

      // Close producer
      const room = webrtc.rooms.get(callId);
      if (room && room.producers.has(userId)) {
        const userProducers = room.producers.get(userId);
        if (userProducers && userProducers.has(producerId)) {
          const producer = userProducers.get(producerId);
          producer.close();
          userProducers.delete(producerId);
        }
      }

      // Remove from local tracking
      if (this.mediaProducers.has(callId)) {
        const userProducers = this.mediaProducers.get(callId);
        if (userProducers && userProducers.has(userId)) {
          userProducers.delete(userId);
        }
      }

      // Notify other participants
      const call = await Call.findOne({ callId });
      if (call) {
        const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
        otherParticipants.forEach(participant => {
          socketManager.broadcastToUser(participant.user, 'webrtc_producer_closed', {
            callId,
            producerId,
            userId,
            timestamp: new Date()
          });
        });
      }

      socket.emit('webrtc_producer_closed', {
        callId,
        producerId,
        timestamp: new Date()
      });

      logger.info(`WebRTC producer closed for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error closing WebRTC producer:', error);
    }
  }

  async handleConsumerClose(socket, socketManager, data) {
    try {
      const { callId, consumerId } = data;
      const userId = socket.userId;

      // Close consumer
      const room = webrtc.rooms.get(callId);
      if (room && room.consumers.has(userId)) {
        const userConsumers = room.consumers.get(userId);
        if (userConsumers && userConsumers.has(consumerId)) {
          const consumer = userConsumers.get(consumerId);
          consumer.close();
          userConsumers.delete(consumerId);
        }
      }

      // Remove from local tracking
      if (this.mediaConsumers.has(callId)) {
        const userConsumers = this.mediaConsumers.get(callId);
        if (userConsumers && userConsumers.has(userId)) {
          userConsumers.delete(userId);
        }
      }

      socket.emit('webrtc_consumer_closed', {
        callId,
        consumerId,
        timestamp: new Date()
      });

      logger.info(`WebRTC consumer closed for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error closing WebRTC consumer:', error);
    }
  }

  async handleScreenShareStart(socket, socketManager, data) {
    try {
      if (!features.isEnabled('screen_sharing')) {
        socket.emit('error', { message: 'Screen sharing feature is disabled' });
        return;
      }

      const { callId, transportId, rtpParameters } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      if (!call.participants.find(p => p.user.toString() === userId)) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Check if screen sharing is allowed
      if (!call.settings.allowScreenSharing) {
        socket.emit('error', { message: 'Screen sharing not allowed in this call' });
        return;
      }

      // Check if already sharing
      if (this.screenSharing.has(callId)) {
        socket.emit('error', { message: 'Screen sharing already active' });
        return;
      }

      // Create screen sharing producer
      const producer = await webrtc.createProducer(callId, userId, transportId, 'video', rtpParameters);
      
      if (!producer) {
        socket.emit('error', { message: 'Failed to create screen sharing producer' });
        return;
      }

      // Store screen sharing info
      this.screenSharing.set(callId, {
        userId,
        producerId: producer.id,
        startTime: new Date()
      });

      // Update call screen sharing info
      call.screenSharing = {
        active: true,
        startedBy: userId,
        startTime: new Date(),
        producerId: producer.id
      };
      await call.save();

      // Emit screen sharing started event
      socket.emit('webrtc_screen_share_started', {
        callId,
        producerId: producer.id,
        timestamp: new Date()
      });

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      otherParticipants.forEach(participant => {
        socketManager.broadcastToUser(participant.user, 'webrtc_screen_share_started', {
          callId,
          producerId: producer.id,
          userId,
          timestamp: new Date()
        });
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'screen_sharing' },
        {
          $inc: { 'metrics.calls.screenSharingStarted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      logger.info(`Screen sharing started for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error starting screen sharing:', error);
      socket.emit('error', { message: 'Failed to start screen sharing' });
    }
  }

  async handleScreenShareStop(socket, socketManager, data) {
    try {
      const { callId } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      if (!call.participants.find(p => p.user.toString() === userId)) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Check if user started the screen sharing
      const screenShareInfo = this.screenSharing.get(callId);
      if (!screenShareInfo || screenShareInfo.userId !== userId) {
        socket.emit('error', { message: 'Cannot stop screen sharing started by another user' });
        return;
      }

      // Close screen sharing producer
      const room = webrtc.rooms.get(callId);
      if (room && room.producers.has(userId)) {
        const userProducers = room.producers.get(userId);
        if (userProducers && userProducers.has(screenShareInfo.producerId)) {
          const producer = userProducers.get(screenShareInfo.producerId);
          producer.close();
          userProducers.delete(screenShareInfo.producerId);
        }
      }

      // Update call screen sharing info
      call.screenSharing.active = false;
      call.screenSharing.stopTime = new Date();
      call.screenSharing.duration = call.screenSharing.stopTime - call.screenSharing.startTime;
      await call.save();

      // Remove from local tracking
      this.screenSharing.delete(callId);

      // Emit screen sharing stopped event
      socket.emit('webrtc_screen_share_stopped', {
        callId,
        timestamp: new Date()
      });

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      otherParticipants.forEach(participant => {
        socketManager.broadcastToUser(participant.user, 'webrtc_screen_share_stopped', {
          callId,
          userId,
          timestamp: new Date()
        });
      });

      logger.info(`Screen sharing stopped for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error stopping screen sharing:', error);
      socket.emit('error', { message: 'Failed to stop screen sharing' });
    }
  }

  async handleRecordingStart(socket, socketManager, data) {
    try {
      if (!features.isEnabled('call_recording')) {
        socket.emit('error', { message: 'Call recording feature is disabled' });
        return;
      }

      const { callId, options = {} } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      if (!call.participants.find(p => p.user.toString() === userId)) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Check if recording is allowed
      if (!call.settings.allowRecording) {
        socket.emit('error', { message: 'Recording not allowed in this call' });
        return;
      }

      // Check if already recording
      if (this.recordings.has(callId)) {
        socket.emit('error', { message: 'Recording already in progress' });
        return;
      }

      // Start recording in WebRTC
      const recordingConfig = await webrtc.startRecording(callId, options);

      // Store recording info
      this.recordings.set(callId, {
        startedBy: userId,
        startTime: new Date(),
        config: recordingConfig
      });

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

      // Emit recording started event
      socket.emit('webrtc_recording_started', {
        callId,
        recordingId: recording._id,
        timestamp: new Date()
      });

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      otherParticipants.forEach(participant => {
        socketManager.broadcastToUser(participant.user, 'webrtc_recording_started', {
          callId,
          startedBy: userId,
          timestamp: new Date()
        });
      });

      logger.info(`Recording started for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error starting recording:', error);
      socket.emit('error', { message: 'Failed to start recording' });
    }
  }

  async handleRecordingStop(socket, socketManager, data) {
    try {
      const { callId } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      if (!call.participants.find(p => p.user.toString() === userId)) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Check if recording is active
      if (!this.recordings.has(callId)) {
        socket.emit('error', { message: 'No active recording' });
        return;
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

      // Remove from local tracking
      this.recordings.delete(callId);

      // Emit recording stopped event
      socket.emit('webrtc_recording_stopped', {
        callId,
        recordingId: recording?._id,
        timestamp: new Date()
      });

      // Notify other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      otherParticipants.forEach(participant => {
        socketManager.broadcastToUser(participant.user, 'webrtc_recording_stopped', {
          callId,
          stoppedBy: userId,
          timestamp: new Date()
        });
      });

      logger.info(`Recording stopped for user ${userId} in call ${callId}`);

    } catch (error) {
      logger.error('Error stopping recording:', error);
      socket.emit('error', { message: 'Failed to stop recording' });
    }
  }

  async handleGetStats(socket, socketManager, data) {
    try {
      const { callId } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) {
        socket.emit('error', { message: 'Call not found' });
        return;
      }

      if (!call.participants.find(p => p.user.toString() === userId)) {
        socket.emit('error', { message: 'Not a participant in this call' });
        return;
      }

      // Get WebRTC room stats
      const roomStats = await webrtc.getRoomStats(callId);

      // Emit stats
      socket.emit('webrtc_stats', {
        callId,
        stats: roomStats,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error getting WebRTC stats:', error);
      socket.emit('error', { message: 'Failed to get stats' });
    }
  }

  async handleNetworkQuality(socket, socketManager, data) {
    try {
      const { callId, quality } = data;
      const userId = socket.userId;

      // Validate call access
      const call = await Call.findOne({ callId });
      if (!call) return;

      if (!call.participants.find(p => p.user.toString() === userId)) return;

      // Update call quality metrics
      if (!call.qualityMetrics) {
        call.qualityMetrics = {};
      }

      call.qualityMetrics = {
        ...call.qualityMetrics,
        ...quality,
        lastUpdated: new Date()
      };

      await call.save();

      // Broadcast quality update to other participants
      const otherParticipants = call.participants.filter(p => p.user.toString() !== userId);
      otherParticipants.forEach(participant => {
        socketManager.broadcastToUser(participant.user, 'webrtc_network_quality_update', {
          callId,
          userId,
          quality,
          timestamp: new Date()
        });
      });

    } catch (error) {
      logger.error('Error handling network quality update:', error);
    }
  }

  // Utility methods
  getScreenSharingInfo(callId) {
    return this.screenSharing.get(callId);
  }

  getRecordingInfo(callId) {
    return this.recordings.get(callId);
  }

  isScreenSharing(callId) {
    return this.screenSharing.has(callId);
  }

  isRecording(callId) {
    return this.recordings.has(callId);
  }

  // Cleanup
  cleanup() {
    this.mediaProducers.clear();
    this.mediaConsumers.clear();
    this.screenSharing.clear();
    this.recordings.clear();
  }
}

module.exports = new WebRTCHandler();