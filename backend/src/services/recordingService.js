const Recording = require('../models/Recording');
const Analytics = require('../models/Analytics');
const features = require('../config/features');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const fs = require('fs').promises;
const path = require('path');

class RecordingService {
  constructor() {
    this.processingQueue = new Map(); // recordingId -> processing data
    this.storagePath = process.env.RECORDING_STORAGE_PATH || './recordings';
    this.maxFileSize = parseInt(process.env.MAX_RECORDING_SIZE) || 100 * 1024 * 1024; // 100MB
    this.supportedFormats = ['webm', 'mp4', 'wav', 'mp3'];
    this.updateInterval = 60000; // 1 minute
    this.lastGlobalUpdate = Date.now();
  }

  // Initialize recording service
  async initialize() {
    try {
      // Create storage directory if it doesn't exist
      await this.ensureStorageDirectory();
      
      // Start periodic updates
      this.startPeriodicUpdates();
      
      logger.info('Recording service initialized successfully');
    } catch (error) {
      logger.error('Error initializing recording service:', error);
    }
  }

  // Ensure storage directory exists
  async ensureStorageDirectory() {
    try {
      await fs.access(this.storagePath);
    } catch (error) {
      await fs.mkdir(this.storagePath, { recursive: true });
      logger.info(`Created recording storage directory: ${this.storagePath}`);
    }
  }

  // Create a new recording
  async createRecording(recordingData) {
    try {
      if (!features.isEnabled('call_recording')) {
        throw new Error('Call recording feature is disabled');
      }

      const recording = new Recording(recordingData);
      await recording.save();

      // Add to processing queue
      this.processingQueue.set(recording._id, {
        status: 'pending',
        startTime: Date.now(),
        attempts: 0
      });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'recording_creation' },
        {
          $inc: { 'metrics.recordings.totalCreated': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      logger.info(`Recording ${recording._id} created successfully`);
      return recording;

    } catch (error) {
      logger.error('Error creating recording:', error);
      throw error;
    }
  }

  // Process a recording file
  async processRecording(recordingId, filePath, options = {}) {
    try {
      const recording = await Recording.findById(recordingId);
      if (!recording) {
        throw new Error('Recording not found');
      }

      // Update processing status
      recording.processing.status = 'processing';
      recording.processing.progress = 10;
      recording.processing.steps.push('File processing started');
      await recording.save();

      // Update queue status
      if (this.processingQueue.has(recordingId)) {
        this.processingQueue.get(recordingId).status = 'processing';
      }

      // Validate file
      await this.validateRecordingFile(filePath);

      // Process file based on type
      const processedData = await this.processFileByType(filePath, recording.type, options);

      // Update recording with processed data
      recording.content = {
        url: processedData.url,
        size: processedData.size,
        duration: processedData.duration,
        format: processedData.format,
        quality: processedData.quality,
        metadata: processedData.metadata
      };

      recording.processing.status = 'completed';
      recording.processing.progress = 100;
      recording.processing.steps.push('File processing completed');
      recording.status = 'completed';
      recording.completedAt = new Date();

      await recording.save();

      // Remove from processing queue
      this.processingQueue.delete(recordingId);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'recording_processing' },
        {
          $inc: { 'metrics.recordings.processed': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      logger.info(`Recording ${recordingId} processed successfully`);
      return recording;

    } catch (error) {
      logger.error('Error processing recording:', error);
      
      // Update recording with error status
      await this.updateRecordingError(recordingId, error.message);
      throw error;
    }
  }

  // Validate recording file
  async validateRecordingFile(filePath) {
    try {
      // Check if file exists
      const stats = await fs.stat(filePath);
      
      // Check file size
      if (stats.size > this.maxFileSize) {
        throw new Error(`File size ${stats.size} exceeds maximum allowed size ${this.maxFileSize}`);
      }

      // Check file extension
      const ext = path.extname(filePath).toLowerCase().substring(1);
      if (!this.supportedFormats.includes(ext)) {
        throw new Error(`Unsupported file format: ${ext}`);
      }

      logger.debug(`Recording file validation passed: ${filePath}`);
    } catch (error) {
      logger.error('Error validating recording file:', error);
      throw error;
    }
  }

  // Process file based on type
  async processFileByType(filePath, type, options = {}) {
    try {
      const ext = path.extname(filePath).toLowerCase().substring(1);
      const stats = await fs.stat(filePath);

      let processedData = {
        url: filePath,
        size: stats.size,
        duration: 0,
        format: ext,
        quality: 'medium',
        metadata: {}
      };

      // Process based on file type
      switch (ext) {
        case 'webm':
        case 'mp4':
          processedData = await this.processVideoFile(filePath, processedData, options);
          break;
        case 'wav':
        case 'mp3':
          processedData = await this.processAudioFile(filePath, processedData, options);
          break;
        default:
          // For other formats, just get basic info
          processedData.metadata = await this.getBasicFileMetadata(filePath);
      }

      return processedData;

    } catch (error) {
      logger.error('Error processing file by type:', error);
      throw error;
    }
  }

  // Process video file
  async processVideoFile(filePath, baseData, options = {}) {
    try {
      // This would typically use ffmpeg or similar tools
      // For now, we'll simulate the processing
      
      const processedData = { ...baseData };
      
      // Simulate video processing
      processedData.duration = options.duration || Math.floor(Math.random() * 300) + 30; // 30s to 5m
      processedData.quality = options.quality || 'high';
      processedData.metadata = {
        codec: 'H.264',
        resolution: '1920x1080',
        frameRate: 30,
        bitrate: '2Mbps'
      };

      // Add processing steps
      if (options.generateThumbnail) {
        processedData.metadata.thumbnail = await this.generateVideoThumbnail(filePath);
      }

      if (options.extractAudio) {
        processedData.metadata.audioTrack = await this.extractAudioFromVideo(filePath);
      }

      return processedData;

    } catch (error) {
      logger.error('Error processing video file:', error);
      throw error;
    }
  }

  // Process audio file
  async processAudioFile(filePath, baseData, options = {}) {
    try {
      const processedData = { ...baseData };
      
      // Simulate audio processing
      processedData.duration = options.duration || Math.floor(Math.random() * 180) + 10; // 10s to 3m
      processedData.quality = options.quality || 'high';
      processedData.metadata = {
        codec: 'AAC',
        sampleRate: 44100,
        channels: 2,
        bitrate: '128kbps'
      };

      // Add processing steps
      if (options.generateWaveform) {
        processedData.metadata.waveform = await this.generateAudioWaveform(filePath);
      }

      if (options.transcribe) {
        processedData.metadata.transcription = await this.transcribeAudio(filePath);
      }

      return processedData;

    } catch (error) {
      logger.error('Error processing audio file:', error);
      throw error;
    }
  }

  // Get basic file metadata
  async getBasicFileMetadata(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        filename: path.basename(filePath),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        permissions: stats.mode
      };
    } catch (error) {
      logger.error('Error getting basic file metadata:', error);
      return {};
    }
  }

  // Generate video thumbnail (placeholder)
  async generateVideoThumbnail(filePath) {
    try {
      // This would typically use ffmpeg to extract a frame
      // For now, return a placeholder
      return `thumbnail_${path.basename(filePath, path.extname(filePath))}.jpg`;
    } catch (error) {
      logger.error('Error generating video thumbnail:', error);
      return null;
    }
  }

  // Extract audio from video (placeholder)
  async extractAudioFromVideo(filePath) {
    try {
      // This would typically use ffmpeg to extract audio
      // For now, return a placeholder
      return `audio_${path.basename(filePath, path.extname(filePath))}.mp3`;
    } catch (error) {
      logger.error('Error extracting audio from video:', error);
      return null;
    }
  }

  // Generate audio waveform (placeholder)
  async generateAudioWaveform(filePath) {
    try {
      // This would typically analyze the audio file
      // For now, return a placeholder array
      return Array.from({ length: 100 }, () => Math.random() * 100);
    } catch (error) {
      logger.error('Error generating audio waveform:', error);
      return [];
    }
  }

  // Transcribe audio (placeholder)
  async transcribeAudio(filePath) {
    try {
      // This would typically use a speech-to-text service
      // For now, return a placeholder
      return "Audio transcription would be generated here using a speech-to-text service.";
    } catch (error) {
      logger.error('Error transcribing audio:', error);
      return null;
    }
  }

  // Update recording with error status
  async updateRecordingError(recordingId, errorMessage) {
    try {
      const recording = await Recording.findById(recordingId);
      if (!recording) return;

      recording.processing.status = 'failed';
      recording.processing.progress = 0;
      recording.processing.steps.push(`Error: ${errorMessage}`);
      recording.status = 'failed';
      recording.error = errorMessage;
      recording.failedAt = new Date();

      await recording.save();

      // Remove from processing queue
      this.processingQueue.delete(recordingId);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'recording_processing' },
        {
          $inc: { 'metrics.recordings.failed': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error('Error updating recording error:', error);
    }
  }

  // Get recording by ID
  async getRecording(recordingId) {
    try {
      const recording = await Recording.findById(recordingId);
      if (!recording) {
        throw new Error('Recording not found');
      }

      return recording;
    } catch (error) {
      logger.error('Error getting recording:', error);
      throw error;
    }
  }

  // Get recordings by user
  async getRecordingsByUser(userId, options = {}) {
    try {
      const { limit = 20, offset = 0, status, type } = options;

      const query = { creator: userId };
      if (status) query.status = status;
      if (type) query.type = type;

      const recordings = await Recording.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset));

      const total = await Recording.countDocuments(query);

      return {
        recordings,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

    } catch (error) {
      logger.error('Error getting recordings by user:', error);
      throw error;
    }
  }

  // Delete recording
  async deleteRecording(recordingId, userId) {
    try {
      const recording = await Recording.findById(recordingId);
      if (!recording) {
        throw new Error('Recording not found');
      }

      // Check if user can delete the recording
      if (recording.creator.toString() !== userId) {
        throw new Error('Cannot delete recording created by another user');
      }

      // Delete file if it exists
      if (recording.content && recording.content.url) {
        try {
          await fs.unlink(recording.content.url);
        } catch (fileError) {
          logger.warn(`Could not delete file: ${recording.content.url}`, fileError);
        }
      }

      // Delete recording record
      await Recording.findByIdAndDelete(recordingId);

      // Remove from processing queue if present
      this.processingQueue.delete(recordingId);

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'recording_deletion' },
        {
          $inc: { 'metrics.recordings.deleted': 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true }
      );

      logger.info(`Recording ${recordingId} deleted successfully`);
      return true;

    } catch (error) {
      logger.error('Error deleting recording:', error);
      throw error;
    }
  }

  // Archive recording
  async archiveRecording(recordingId, userId) {
    try {
      const recording = await Recording.findById(recordingId);
      if (!recording) {
        throw new Error('Recording not found');
      }

      // Check if user can archive the recording
      if (recording.creator.toString() !== userId) {
        throw new Error('Cannot archive recording created by another user');
      }

      recording.status = 'archived';
      recording.archivedAt = new Date();
      recording.archivedBy = userId;

      await recording.save();

      logger.info(`Recording ${recordingId} archived successfully`);
      return recording;

    } catch (error) {
      logger.error('Error archiving recording:', error);
      throw error;
    }
  }

  // Get recording statistics
  async getRecordingStatistics(userId = null) {
    try {
      const query = userId ? { creator: userId } : {};

      const [total, completed, processing, failed, archived] = await Promise.all([
        Recording.countDocuments(query),
        Recording.countDocuments({ ...query, status: 'completed' }),
        Recording.countDocuments({ ...query, status: 'processing' }),
        Recording.countDocuments({ ...query, status: 'failed' }),
        Recording.countDocuments({ ...query, status: 'archived' })
      ]);

      return {
        total,
        completed,
        processing,
        failed,
        archived,
        successRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0
      };

    } catch (error) {
      logger.error('Error getting recording statistics:', error);
      return {
        total: 0,
        completed: 0,
        processing: 0,
        failed: 0,
        archived: 0,
        successRate: 0
      };
    }
  }

  // Start periodic updates
  startPeriodicUpdates() {
    setInterval(async () => {
      try {
        await this.updateRecordingAnalytics();
        this.lastGlobalUpdate = Date.now();
      } catch (error) {
        logger.error('Error in periodic recording updates:', error);
      }
    }, this.updateInterval);
  }

  // Update recording analytics
  async updateRecordingAnalytics() {
    try {
      const totalRecordings = await Recording.countDocuments();
      const processingRecordings = this.processingQueue.size;
      const completedRecordings = await Recording.countDocuments({ status: 'completed' });
      const failedRecordings = await Recording.countDocuments({ status: 'failed' });

      // Update analytics
      await Analytics.findOneAndUpdate(
        { name: 'recording_system' },
        {
          $set: {
            'metrics.recordings.totalRecordings': totalRecordings,
            'metrics.recordings.processingRecordings': processingRecordings,
            'metrics.recordings.completedRecordings': completedRecordings,
            'metrics.recordings.failedRecordings': failedRecordings,
            'metrics.recordings.lastUpdate': new Date()
          }
        },
        { upsert: true }
      );

      // Clean up old processing queue entries
      this.cleanupProcessingQueue();

    } catch (error) {
      logger.error('Error updating recording analytics:', error);
    }
  }

  // Clean up old processing queue entries
  cleanupProcessingQueue() {
    try {
      const now = Date.now();
      const maxAge = 1800000; // 30 minutes

      for (const [recordingId, data] of this.processingQueue.entries()) {
        if (now - data.startTime > maxAge) {
          this.processingQueue.delete(recordingId);
          logger.warn(`Removed stale processing queue entry for recording ${recordingId}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up processing queue:', error);
    }
  }

  // Utility methods
  getProcessingQueue() {
    return Array.from(this.processingQueue.entries());
  }

  getProcessingStatus(recordingId) {
    return this.processingQueue.get(recordingId);
  }

  isProcessing(recordingId) {
    return this.processingQueue.has(recordingId);
  }

  // Cleanup
  cleanup() {
    this.processingQueue.clear();
  }
}

module.exports = new RecordingService();