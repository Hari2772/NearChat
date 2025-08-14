const mediasoup = require('mediasoup');
const logger = require('../utils/logger');

class WebRTCConfig {
  constructor() {
    this.worker = null;
    this.router = null;
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.rooms = new Map();
    
    this.mediasoupOptions = {
      worker: {
        rtcMinPort: parseInt(process.env.MEDIASOUP_WORKER_RTC_MIN_PORT) || 10000,
        rtcMaxPort: parseInt(process.env.MEDIASOUP_WORKER_RTC_MAX_PORT) || 10100,
        logLevel: process.env.MEDIASOUP_WORKER_LOG_LEVEL || 'warn',
        logTags: [
          'info',
          'ice',
          'dtls',
          'rtp',
          'srtp',
          'rtcp'
        ]
      },
      router: {
        mediaCodecs: [
          {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2
          },
          {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000,
            parameters: {
              'x-google-start-bitrate': 1000
            }
          },
          {
            kind: 'video',
            mimeType: 'video/H264',
            clockRate: 90000,
            parameters: {
              'packetization-mode': 1,
              'profile-level-id': '42e01f',
              'level-asymmetry-allowed': 1
            }
          }
        ]
      },
      webRtcTransport: {
        listenIps: [
          {
            ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
            announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1'
          }
        ],
        initialAvailableOutgoingBitrate: 1000000,
        minimumAvailableOutgoingBitrate: 600000,
        maxSctpMessageSize: 262144,
        maxIncomingBitrate: 1500000
      }
    };
  }

  async initialize() {
    try {
      // Create mediasoup worker
      this.worker = await mediasoup.createWorker(this.mediasoupOptions.worker);
      
      logger.info('Mediasoup worker created successfully');

      // Handle worker events
      this.worker.on('died', () => {
        logger.error('Mediasoup worker died, exiting in 2 seconds...');
        setTimeout(() => process.exit(1), 2000);
      });

      // Set worker event handlers
      this.worker.on('error', (error) => {
        logger.error('Mediasoup worker error:', error);
      });

      logger.info('WebRTC configuration initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize WebRTC configuration:', error);
      throw error;
    }
  }

  async createRouter(roomId) {
    try {
      if (!this.worker) {
        throw new Error('Mediasoup worker not initialized');
      }

      const router = await this.worker.createRouter(this.mediasoupOptions.router);
      
      // Store router for the room
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {
          router,
          transports: new Map(),
          producers: new Map(),
          consumers: new Map(),
          peers: new Map()
        });
      } else {
        this.rooms.get(roomId).router = router;
      }

      logger.info(`Router created for room: ${roomId}`);
      return router;
      
    } catch (error) {
      logger.error(`Failed to create router for room ${roomId}:`, error);
      throw error;
    }
  }

  async createWebRtcTransport(roomId, peerId, direction = 'sendrecv') {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }

      const transport = await room.router.createWebRtcTransport({
        ...this.mediasoupOptions.webRtcTransport,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
      });

      // Store transport
      if (!room.transports.has(peerId)) {
        room.transports.set(peerId, new Map());
      }
      room.transports.get(peerId).set(transport.id, transport);

      // Handle transport events
      transport.on('dtlsstatechange', (dtlsState) => {
        logger.info(`Transport DTLS state changed: ${dtlsState}`);
      });

      transport.on('close', () => {
        logger.info(`Transport closed: ${transport.id}`);
      });

      logger.info(`WebRTC transport created for peer ${peerId} in room ${roomId}`);
      return transport;
      
    } catch (error) {
      logger.error(`Failed to create WebRTC transport for peer ${peerId} in room ${roomId}:`, error);
      throw error;
    }
  }

  async createProducer(roomId, peerId, transportId, kind, rtpParameters) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }

      const peerTransports = room.transports.get(peerId);
      if (!peerTransports) {
        throw new Error(`No transports found for peer ${peerId}`);
      }

      const transport = peerTransports.get(transportId);
      if (!transport) {
        throw new Error(`Transport ${transportId} not found`);
      }

      const producer = await transport.produce({
        kind,
        rtpParameters,
        appData: { peerId, roomId }
      });

      // Store producer
      if (!room.producers.has(peerId)) {
        room.producers.set(peerId, new Map());
      }
      room.producers.get(peerId).set(producer.id, producer);

      // Handle producer events
      producer.on('transportclose', () => {
        logger.info(`Producer transport closed: ${producer.id}`);
      });

      producer.on('close', () => {
        logger.info(`Producer closed: ${producer.id}`);
      });

      logger.info(`Producer created: ${producer.id} for peer ${peerId} in room ${roomId}`);
      return producer;
      
    } catch (error) {
      logger.error(`Failed to create producer for peer ${peerId} in room ${roomId}:`, error);
      throw error;
    }
  }

  async createConsumer(roomId, peerId, transportId, producerId, rtpCapabilities, paused = false) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }

      const peerTransports = room.transports.get(peerId);
      if (!peerTransports) {
        throw new Error(`No transports found for peer ${peerId}`);
      }

      const peerProducer = room.producers.get(peerId);
      if (!peerProducer) {
        throw new Error(`No producers found for peer ${peerId}`);
      }

      const producer = peerProducer.get(producerId);
      if (!producer) {
        throw new Error(`Producer ${producerId} not found`);
      }

      const transport = peerTransports.get(transportId);
      if (!transport) {
        throw new Error(`Transport ${transportId} not found`);
      }

      // Check if consumer can consume
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error('Cannot consume this producer');
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused
      });

      // Store consumer
      if (!room.consumers.has(peerId)) {
        room.consumers.set(peerId, new Map());
      }
      room.consumers.get(peerId).set(consumer.id, consumer);

      // Handle consumer events
      consumer.on('transportclose', () => {
        logger.info(`Consumer transport closed: ${consumer.id}`);
      });

      consumer.on('close', () => {
        logger.info(`Consumer closed: ${consumer.id}`);
      });

      logger.info(`Consumer created: ${consumer.id} for peer ${peerId} in room ${roomId}`);
      return consumer;
      
    } catch (error) {
      logger.error(`Failed to create consumer for peer ${peerId} in room ${roomId}:`, error);
      throw error;
    }
  }

  async closeRoom(roomId) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        return;
      }

      // Close all transports
      for (const [peerId, peerTransports] of room.transports) {
        for (const [transportId, transport] of peerTransports) {
          transport.close();
        }
      }

      // Close all producers
      for (const [peerId, peerProducers] of room.producers) {
        for (const [producerId, producer] of peerProducers) {
          producer.close();
        }
      }

      // Close all consumers
      for (const [peerId, peerConsumers] of room.consumers) {
        for (const [consumerId, consumer] of peerConsumers) {
          consumer.close();
        }
      }

      // Close router
      if (room.router) {
        room.router.close();
      }

      // Remove room
      this.rooms.delete(roomId);

      logger.info(`Room ${roomId} closed successfully`);
      
    } catch (error) {
      logger.error(`Failed to close room ${roomId}:`, error);
    }
  }

  async getRoomStats(roomId) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        return null;
      }

      const stats = {
        roomId,
        routerStats: await room.router.getStats(),
        transports: [],
        producers: [],
        consumers: [],
        peers: room.peers.size
      };

      // Get transport stats
      for (const [peerId, peerTransports] of room.transports) {
        for (const [transportId, transport] of peerTransports) {
          const transportStats = await transport.getStats();
          stats.transports.push({
            peerId,
            transportId,
            stats: transportStats
          });
        }
      }

      // Get producer stats
      for (const [peerId, peerProducers] of room.producers) {
        for (const [producerId, producer] of peerProducers) {
          const producerStats = await producer.getStats();
          stats.producers.push({
            peerId,
            producerId,
            stats: producerStats
          });
        }
      }

      // Get consumer stats
      for (const [peerId, peerConsumers] of room.consumers) {
        for (const [consumerId, consumer] of peerConsumers) {
          const consumerStats = await consumer.getStats();
          stats.consumers.push({
            peerId,
            consumerId,
            stats: consumerStats
          });
        }
      }

      return stats;
      
    } catch (error) {
      logger.error(`Failed to get room stats for room ${roomId}:`, error);
      return null;
    }
  }

  // Screen sharing methods
  async enableScreenSharing(roomId, peerId, transportId) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }

      // Create screen sharing producer
      const screenProducer = await this.createProducer(
        roomId,
        peerId,
        transportId,
        'video',
        { screen: true }
      );

      logger.info(`Screen sharing enabled for peer ${peerId} in room ${roomId}`);
      return screenProducer;
      
    } catch (error) {
      logger.error(`Failed to enable screen sharing for peer ${peerId} in room ${roomId}:`, error);
      throw error;
    }
  }

  // Recording methods
  async startRecording(roomId, options = {}) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        throw new Error(`Room ${roomId} not found`);
      }

      const recordingConfig = {
        audio: options.audio !== false,
        video: options.video !== false,
        screen: options.screen || false,
        quality: options.quality || 'high',
        format: options.format || 'webm',
        ...options
      };

      // Initialize recording for the room
      room.recording = {
        active: true,
        config: recordingConfig,
        startTime: Date.now(),
        streams: []
      };

      logger.info(`Recording started for room ${roomId} with config:`, recordingConfig);
      return room.recording;
      
    } catch (error) {
      logger.error(`Failed to start recording for room ${roomId}:`, error);
      throw error;
    }
  }

  async stopRecording(roomId) {
    try {
      const room = this.rooms.get(roomId);
      if (!room || !room.recording) {
        throw new Error(`No active recording found for room ${roomId}`);
      }

      const recording = room.recording;
      recording.active = false;
      recording.endTime = Date.now();
      recording.duration = recording.endTime - recording.startTime;

      logger.info(`Recording stopped for room ${roomId}, duration: ${recording.duration}ms`);
      return recording;
      
    } catch (error) {
      logger.error(`Failed to stop recording for room ${roomId}:`, error);
      throw error;
    }
  }

  // Get all rooms
  getRooms() {
    return Array.from(this.rooms.keys());
  }

  // Get room info
  getRoomInfo(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    return {
      roomId,
      hasRouter: !!room.router,
      transportCount: Array.from(room.transports.values()).reduce((acc, peerTransports) => acc + peerTransports.size, 0),
      producerCount: Array.from(room.producers.values()).reduce((acc, peerProducers) => acc + peerProducers.size, 0),
      consumerCount: Array.from(room.consumers.values()).reduce((acc, peerConsumers) => acc + peerConsumers.size, 0),
      peerCount: room.peers.size,
      recording: room.recording || null
    };
  }

  // Cleanup method
  async cleanup() {
    try {
      // Close all rooms
      for (const roomId of this.rooms.keys()) {
        await this.closeRoom(roomId);
      }

      // Close worker
      if (this.worker) {
        this.worker.close();
      }

      logger.info('WebRTC configuration cleaned up successfully');
      
    } catch (error) {
      logger.error('Failed to cleanup WebRTC configuration:', error);
    }
  }
}

module.exports = new WebRTCConfig();