const Call = require('../models/Call');
const Recording = require('../models/Recording');
const Analytics = require('../models/Analytics');
const features = require('../config/features');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const webrtc = require('../config/webrtc');

class CallService {
  constructor() {
    this.activeCalls = new Map(); // callId -> call data
    this.callQualityMetrics = new Map(); // callId -> quality metrics
    this.recordingSessions = new Map(); // callId -> recording session
    this.updateInterval = 30000; // 30 seconds
    this.lastGlobalUpdate = Date.now();
  }

  // Start a new call session
  async startCall(callData) {
    try {
      if (!features.isEnabled('voice_video_calls')) {
        throw new Error('Voice/video calls feature is disabled');
      }

      const { callId, type, participants, settings } = callData;

      // Create call record
      const call = new Call({
        callId,
        type,
        status: 'initiating',
        participants: participants.map(participantId => ({
          user: participantId,
          status: 'invited',
          joinedAt: null
        })),
        settings: {
          maxParticipants: settings.maxParticipants || 10,
          allowRecording: settings.allowRecording !== false,
          allowScreenSharing: settings.allowScreenSharing !== false,
          allowMute: settings.allowMute !== false,
          allowVideo: type === 'video' ? (settings.allowVideo !== false) : true,
          qualityThreshold: settings.qualityThreshold || 'medium',
          ...settings
        },
        startTime: new Date()
      });

      await call.save();

      // Store in active calls
      this.activeCalls.set(callId, call);

      // Initialize quality metrics
      this.callQualityMetrics.set(callId, {
        audioQuality: 'unknown',
        videoQuality: 'unknown',
        networkLatency: 0,
        packetLoss: 0,
        bandwidth: 0,
        lastUpdate: Date.now()
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_sessions' },
        {
          $inc: { [`metrics.calls.${type}CallsStarted`: 1] },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      logger.info(`Call ${callId} started successfully`);
      return call;

    } catch (error) {
      logger.error('Error starting call:', error);
      throw error;
    }
  }

  // Join a call
  async joinCall(callId, userId, deviceInfo = {}) {
    try {
      const call = await Call.findOne({ callId });
      if (!call) {
        throw new Error('Call not found');
      }

      // Check if call is active
      if (call.status !== 'initiating' && call.status !== 'ringing') {
        throw new Error('Call is not active');
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        throw new Error('Not a participant in this call');
      }

      // Update participant status
      participant.status = 'connected';
      participant.joinedAt = new Date();
      participant.deviceInfo = deviceInfo;

      // Update call status if first participant joins
      if (call.participants.filter(p => p.status === 'connected').length === 1) {
        call.status = 'connected';
        call.connectedAt = new Date();
      }

      await call.save();

      // Update active calls
      if (this.activeCalls.has(callId)) {
        this.activeCalls.get(callId).status = call.status;
      }

      logger.info(`User ${userId} joined call ${callId}`);
      return call;

    } catch (error) {
      logger.error('Error joining call:', error);
      throw error;
    }
  }

  // Leave a call
  async leaveCall(callId, userId) {
    try {
      const call = await Call.findOne({ callId });
      if (!call) {
        throw new Error('Call not found');
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        throw new Error('Not a participant in this call');
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
        this.callQualityMetrics.delete(callId);
        this.recordingSessions.delete(callId);
      }

      logger.info(`User ${userId} left call ${callId}`);
      return call;

    } catch (error) {
      logger.error('Error leaving call:', error);
      throw error;
    }
  }

  // Update call quality metrics
  async updateCallQuality(callId, userId, qualityData) {
    try {
      if (!features.isEnabled('call_quality_monitoring')) {
        return;
      }

      const call = await Call.findOne({ callId });
      if (!call) {
        throw new Error('Call not found');
      }

      // Update quality metrics
      if (!call.qualityMetrics) {
        call.qualityMetrics = {};
      }

      call.qualityMetrics = {
        ...call.qualityMetrics,
        ...qualityData,
        lastUpdated: new Date()
      };

      await call.save();

      // Update local quality metrics
      if (this.callQualityMetrics.has(callId)) {
        this.callQualityMetrics.set(callId, {
          ...this.callQualityMetrics.get(callId),
          ...qualityData,
          lastUpdate: Date.now()
        });
      }

      // Check if quality is below threshold
      await this.checkQualityThreshold(callId, qualityData);

      logger.debug(`Call ${callId} quality updated for user ${userId}`);

    } catch (error) {
      logger.error('Error updating call quality:', error);
    }
  }

  // Check if call quality is below threshold
  async checkQualityThreshold(callId, qualityData) {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) return;

      const threshold = call.settings.qualityThreshold || 'medium';
      const thresholds = {
        low: { latency: 200, packetLoss: 5, bandwidth: 100 },
        medium: { latency: 100, packetLoss: 2, bandwidth: 500 },
        high: { latency: 50, packetLoss: 1, bandwidth: 1000 }
      };

      const currentThreshold = thresholds[threshold];
      if (!currentThreshold) return;

      // Check if quality is below threshold
      const isLowQuality = 
        qualityData.networkLatency > currentThreshold.latency ||
        qualityData.packetLoss > currentThreshold.packetLoss ||
        qualityData.bandwidth < currentThreshold.bandwidth;

      if (isLowQuality) {
        // Notify participants about low quality
        await this.notifyLowQuality(callId, qualityData);
        
        // Update analytics
        await Analytics.findOneAndUpdate(
          { name: 'call_quality_issues' },
          {
            $inc: { 'metrics.calls.lowQualityCalls': 1 },
            $set: { lastUpdated: new Date() }
          },
          { upsert: true }
        );
      }

    } catch (error) {
      logger.error('Error checking quality threshold:', error);
    }
  }

  // Notify participants about low quality
  async notifyLowQuality(callId, qualityData) {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) return;

      // This would typically emit to Socket.IO
      // For now, we'll just log it
      logger.warn(`Call ${callId} has low quality:`, qualityData);

      // Update call with quality warning
      await Call.findByIdAndUpdate(call._id, {
        $push: {
          qualityWarnings: {
            timestamp: new Date(),
            metrics: qualityData,
            severity: 'warning'
          }
        }
      });

    } catch (error) {
      logger.error('Error notifying low quality:', error);
    }
  }

  // Start recording a call
  async startRecording(callId, userId, options = {}) {
    try {
      if (!features.isEnabled('call_recording')) {
        throw new Error('Call recording feature is disabled');
      }

      const call = await Call.findOne({ callId });
      if (!call) {
        throw new Error('Call not found');
      }

      // Check if recording is allowed
      if (!call.settings.allowRecording) {
        throw new Error('Recording not allowed in this call');
      }

      // Check if already recording
      if (call.recording && call.recording.active) {
        throw new Error('Recording already in progress');
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

      // Store recording session
      this.recordingSessions.set(callId, {
        recordingId: recording._id,
        startTime: Date.now(),
        config: recordingConfig
      });

      logger.info(`Recording started for call ${callId}`);
      return recording;

    } catch (error) {
      logger.error('Error starting recording:', error);
      throw error;
    }
  }

  // Stop recording a call
  async stopRecording(callId, userId) {
    try {
      const call = await Call.findOne({ callId });
      if (!call) {
        throw new Error('Call not found');
      }

      // Check if recording is active
      if (!call.recording || !call.recording.active) {
        throw new Error('No active recording');
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
      const recordingSession = this.recordingSessions.get(callId);
      if (recordingSession) {
        const recording = await Recording.findById(recordingSession.recordingId);
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
      }

      // Remove recording session
      this.recordingSessions.delete(callId);

      logger.info(`Recording stopped for call ${callId}`);
      return call;

    } catch (error) {
      logger.error('Error stopping recording:', error);
      throw error;
    }
  }

  // Get call statistics
  async getCallStats(callId) {
    try {
      const call = this.activeCalls.get(callId);
      if (!call) {
        throw new Error('Call not found');
      }

      const qualityMetrics = this.callQualityMetrics.get(callId) || {};
      const recordingSession = this.recordingSessions.get(callId);

      const stats = {
        callId: call.callId,
        type: call.type,
        status: call.status,
        duration: call.duration || (call.startTime ? Date.now() - call.startTime.getTime() : 0),
        participants: call.participants.length,
        connectedParticipants: call.participants.filter(p => p.status === 'connected').length,
        qualityMetrics,
        recording: recordingSession ? {
          active: true,
          duration: Date.now() - recordingSession.startTime
        } : null
      };

      return stats;

    } catch (error) {
      logger.error('Error getting call stats:', error);
      throw error;
    }
  }

  // Get call quality analytics
  async getCallQualityAnalytics(callId) {
    try {
      const call = await Call.findById(callId);
      if (!call) {
        throw new Error('Call not found');
      }

      const analytics = {
        callId: call.callId,
        type: call.type,
        duration: call.duration || 0,
        participants: call.participants.length,
        qualityMetrics: call.qualityMetrics || {},
        qualityWarnings: call.qualityWarnings || [],
        recording: call.recording || null
      };

      return analytics;

    } catch (error) {
      logger.error('Error getting call quality analytics:', error);
      throw error;
    }
  }

  // End a call
  async endCall(callId, userId, reason = 'ended_by_user') {
    try {
      const call = await Call.findOne({ callId });
      if (!call) {
        throw new Error('Call not found');
      }

      // Check if user is a participant
      const participant = call.participants.find(p => p.user.toString() === userId);
      if (!participant) {
        throw new Error('Not a participant in this call');
      }

      // Stop recording if active
      if (call.recording && call.recording.active) {
        await this.stopRecording(callId, userId);
      }

      // Update call status
      call.status = 'ended';
      call.endTime = new Date();
      call.endReason = reason;
      call.duration = call.endTime - call.startTime;

      await call.save();

      // Remove from active calls
      this.activeCalls.delete(callId);
      this.callQualityMetrics.delete(callId);
      this.recordingSessions.delete(callId);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'call_sessions' },
        {
          $inc: { 'metrics.calls.callsEnded': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      logger.info(`Call ${callId} ended by user ${userId}`);
      return call;

    } catch (error) {
      logger.error('Error ending call:', error);
      throw error;
    }
  }

  // Get active calls
  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  // Get call quality metrics
  getCallQualityMetrics(callId) {
    return this.callQualityMetrics.get(callId);
  }

  // Get recording sessions
  getRecordingSessions() {
    return Array.from(this.recordingSessions.values());
  }

  // Start periodic updates
  startPeriodicUpdates() {
    setInterval(async () => {
      try {
        await this.updateCallAnalytics();
        this.lastGlobalUpdate = Date.now();
      } catch (error) {
        logger.error('Error in periodic call updates:', error);
      }
    }, this.updateInterval);
  }

  // Update call analytics
  async updateCallAnalytics() {
    try {
      const activeCalls = this.getActiveCalls();
      const totalActiveCalls = activeCalls.length;
      const totalParticipants = activeCalls.reduce((sum, call) => sum + call.participants.length, 0);
      const recordingCalls = activeCalls.filter(call => call.recording && call.recording.active).length;

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'active_calls' },
        {
          $set: {
            'metrics.calls.activeCalls': totalActiveCalls,
            'metrics.calls.totalParticipants': totalParticipants,
            'metrics.calls.recordingCalls': recordingCalls,
            'metrics.calls.lastUpdate': new Date()
          }
        },
        { upsert: true }
      );

      // Clean up old quality metrics
      this.cleanupQualityMetrics();

    } catch (error) {
      logger.error('Error updating call analytics:', error);
    }
  }

  // Clean up old quality metrics
  cleanupQualityMetrics() {
    try {
      const now = Date.now();
      const maxAge = 300000; // 5 minutes

      for (const [callId, metrics] of this.callQualityMetrics.entries()) {
        if (now - metrics.lastUpdate > maxAge) {
          this.callQualityMetrics.delete(callId);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up quality metrics:', error);
    }
  }

  // Cleanup
  cleanup() {
    this.activeCalls.clear();
    this.callQualityMetrics.clear();
    this.recordingSessions.clear();
  }
}

module.exports = new CallService();