const socketIO = require('socket.io');
const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const features = require('../config/features');
const redis = require('../config/redis');

// Import handlers
const chatHandler = require('./chatHandler');
const callHandler = require('./callHandler');
const webrtcHandler = require('./webrtcHandler');
const tierHandler = require('./tierHandler');
const locationHandler = require('./locationHandler');
const featureFlagHandler = require('./featureFlagHandler');

class SocketManager {
  constructor() {
    this.io = null;
    this.redisAdapter = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userRooms = new Map(); // userId -> [roomIds]
    this.roomUsers = new Map(); // roomId -> [userId]
  }

  initialize(server) {
    try {
      // Create Socket.IO server
      this.io = socketIO(server, {
        cors: {
          origin: process.env.FRONTEND_URL || "http://localhost:3000",
          methods: ["GET", "POST"],
          credentials: true
        },
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000,
        upgradeTimeout: 10000,
        maxHttpBufferSize: 1e8, // 100MB
        allowRequest: (req, callback) => {
          // Allow CORS preflight requests
          if (req.method === 'OPTIONS') {
            callback(null, true);
          } else {
            callback(null, true);
          }
        }
      });

      // Setup Redis adapter for horizontal scaling
      this.setupRedisAdapter();

      // Setup middleware
      this.setupMiddleware();

      // Setup event handlers
      this.setupEventHandlers();

      // Setup error handling
      this.setupErrorHandling();

      logger.info('Socket.IO server initialized successfully');
      
      // Make io available to the app
      server.set('io', this.io);
      
      return this.io;
    } catch (error) {
      logger.error('Failed to initialize Socket.IO server:', error);
      throw error;
    }
  }

  setupRedisAdapter() {
    try {
      // Create Redis clients for pub/sub
      const pubClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      });

      const subClient = pubClient.duplicate();

      // Create Redis adapter
      this.redisAdapter = createAdapter(pubClient, subClient);
      this.io.adapter(this.redisAdapter);

      // Handle Redis adapter events
      this.redisAdapter.on('error', (error) => {
        logger.error('Redis adapter error:', error);
      });

      logger.info('Redis adapter setup completed');
    } catch (error) {
      logger.error('Failed to setup Redis adapter:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || 
                     socket.handshake.headers.authorization?.replace('Bearer ', '') ||
                     socket.handshake.query.token;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        socket.user = decoded;

        // Check if user exists and is active
        const User = require('../models/User');
        const user = await User.findById(decoded.userId);
        
        if (!user || user.status !== 'active') {
          return next(new Error('User not found or inactive'));
        }

        // Update user's online status
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();

        next();
      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Rate limiting middleware
    this.io.use((socket, next) => {
      if (!features.isEnabled('socket_rate_limiting')) {
        return next();
      }

      const userId = socket.userId;
      const now = Date.now();
      const windowMs = 60000; // 1 minute
      const maxRequests = 100; // max requests per minute

      // Get user's request count from Redis
      redis.get(`socket_rate_limit:${userId}`)
        .then(count => {
          const currentCount = parseInt(count) || 0;
          
          if (currentCount >= maxRequests) {
            return next(new Error('Rate limit exceeded'));
          }

          // Increment counter
          redis.multi()
            .incr(`socket_rate_limit:${userId}`)
            .expire(`socket_rate_limit:${userId}`, Math.ceil(windowMs / 1000))
            .exec();

          next();
        })
        .catch(error => {
          logger.error('Rate limiting error:', error);
          next(); // Continue on error
        });
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      try {
        logger.info(`User ${socket.userId} connected via Socket.IO`);

        // Store connection mapping
        this.connectedUsers.set(socket.userId, socket.id);
        this.userRooms.set(socket.userId, []);

        // Join user to their personal room
        socket.join(socket.userId.toString());

        // Setup individual handlers
        chatHandler.handleConnection(socket, this);
        callHandler.handleConnection(socket, this);
        webrtcHandler.handleConnection(socket, this);
        tierHandler.handleConnection(socket, this);
        locationHandler.handleConnection(socket, this);
        featureFlagHandler.handleConnection(socket, this);

        // Handle disconnection
        socket.on('disconnect', (reason) => {
          this.handleDisconnection(socket, reason);
        });

        // Handle errors
        socket.on('error', (error) => {
          logger.error(`Socket error for user ${socket.userId}:`, error);
        });

        // Handle custom events
        socket.on('ping', () => {
          socket.emit('pong', { timestamp: Date.now() });
        });

        // Emit connection success
        socket.emit('connected', {
          userId: socket.userId,
          timestamp: new Date(),
          features: this.getEnabledFeatures()
        });

      } catch (error) {
        logger.error('Error in socket connection handler:', error);
        socket.disconnect(true);
      }
    });
  }

  setupErrorHandling() {
    this.io.engine.on('connection_error', (err) => {
      logger.error('Socket.IO connection error:', err);
    });

    process.on('SIGTERM', () => {
      this.gracefulShutdown();
    });

    process.on('SIGINT', () => {
      this.gracefulShutdown();
    });
  }

  handleDisconnection(socket, reason) {
    try {
      const userId = socket.userId;
      logger.info(`User ${userId} disconnected: ${reason}`);

      // Remove from connected users
      this.connectedUsers.delete(userId);

      // Leave all rooms
      const userRooms = this.userRooms.get(userId) || [];
      userRooms.forEach(roomId => {
        this.leaveRoom(userId, roomId);
      });

      // Clear user rooms
      this.userRooms.delete(userId);

      // Update user's online status
      this.updateUserOfflineStatus(userId);

      // Notify other users in shared rooms
      this.notifyUserDisconnection(userId, reason);

    } catch (error) {
      logger.error('Error handling socket disconnection:', error);
    }
  }

  async updateUserOfflineStatus(userId) {
    try {
      const User = require('../models/User');
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date()
      });
    } catch (error) {
      logger.error('Error updating user offline status:', error);
    }
  }

  notifyUserDisconnection(userId, reason) {
    try {
      const userRooms = this.userRooms.get(userId) || [];
      userRooms.forEach(roomId => {
        const roomUsers = this.roomUsers.get(roomId) || [];
        roomUsers.forEach(otherUserId => {
          if (otherUserId !== userId) {
            this.io.to(otherUserId.toString()).emit('user_disconnected', {
              userId,
              reason,
              timestamp: new Date()
            });
          }
        });
      });
    } catch (error) {
      logger.error('Error notifying user disconnection:', error);
    }
  }

  // Room management methods
  joinRoom(userId, roomId, roomType = 'chat') {
    try {
      if (!this.connectedUsers.has(userId)) {
        return false; // User not connected
      }

      const socketId = this.connectedUsers.get(userId);
      const socket = this.io.sockets.sockets.get(socketId);

      if (!socket) {
        return false;
      }

      // Join the room
      socket.join(roomId);

      // Update tracking maps
      if (!this.userRooms.has(userId)) {
        this.userRooms.set(userId, []);
      }
      if (!this.userRooms.get(userId).includes(roomId)) {
        this.userRooms.get(userId).push(roomId);
      }

      if (!this.roomUsers.has(roomId)) {
        this.roomUsers.set(roomId, []);
      }
      if (!this.roomUsers.get(roomId).includes(userId)) {
        this.roomUsers.get(roomId).push(userId);
      }

      // Emit room joined event
      socket.emit('room_joined', {
        roomId,
        roomType,
        timestamp: new Date()
      });

      // Notify other users in the room
      const roomUsers = this.roomUsers.get(roomId) || [];
      roomUsers.forEach(otherUserId => {
        if (otherUserId !== userId) {
          this.io.to(otherUserId.toString()).emit('user_joined_room', {
            roomId,
            userId,
            timestamp: new Date()
          });
        }
      });

      logger.info(`User ${userId} joined room ${roomId}`);
      return true;
    } catch (error) {
      logger.error('Error joining room:', error);
      return false;
    }
  }

  leaveRoom(userId, roomId) {
    try {
      if (!this.connectedUsers.has(userId)) {
        return false;
      }

      const socketId = this.connectedUsers.get(userId);
      const socket = this.io.sockets.sockets.get(socketId);

      if (socket) {
        socket.leave(roomId);
      }

      // Update tracking maps
      if (this.userRooms.has(userId)) {
        this.userRooms.set(userId, this.userRooms.get(userId).filter(id => id !== roomId));
      }

      if (this.roomUsers.has(roomId)) {
        this.roomUsers.set(roomId, this.roomUsers.get(roomId).filter(id => id !== userId));
        
        // Remove room if empty
        if (this.roomUsers.get(roomId).length === 0) {
          this.roomUsers.delete(roomId);
        }
      }

      // Notify other users in the room
      const roomUsers = this.roomUsers.get(roomId) || [];
      roomUsers.forEach(otherUserId => {
        this.io.to(otherUserId.toString()).emit('user_left_room', {
          roomId,
          userId,
          timestamp: new Date()
        });
      });

      logger.info(`User ${userId} left room ${roomId}`);
      return true;
    } catch (error) {
      logger.error('Error leaving room:', error);
      return false;
    }
  }

  // Broadcast methods
  broadcastToRoom(roomId, event, data, excludeUserId = null) {
    try {
      if (excludeUserId) {
        this.io.to(roomId).except(excludeUserId.toString()).emit(event, data);
      } else {
        this.io.to(roomId).emit(event, data);
      }
    } catch (error) {
      logger.error('Error broadcasting to room:', error);
    }
  }

  broadcastToUser(userId, event, data) {
    try {
      if (this.connectedUsers.has(userId)) {
        this.io.to(userId.toString()).emit(event, data);
      }
    } catch (error) {
      logger.error('Error broadcasting to user:', error);
    }
  }

  broadcastToUsers(userIds, event, data) {
    try {
      userIds.forEach(userId => {
        this.broadcastToUser(userId, event, data);
      });
    } catch (error) {
      logger.error('Error broadcasting to users:', error);
    }
  }

  // Utility methods
  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  getUserSocket(userId) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      return this.io.sockets.sockets.get(socketId);
    }
    return null;
  }

  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  getEnabledFeatures() {
    try {
      return features.getEnabledFeatures();
    } catch (error) {
      logger.error('Error getting enabled features:', error);
      return {};
    }
  }

  // Graceful shutdown
  async gracefulShutdown() {
    try {
      logger.info('Starting Socket.IO graceful shutdown...');

      // Disconnect all users
      this.io.sockets.sockets.forEach((socket) => {
        socket.disconnect(true);
      });

      // Close Socket.IO server
      if (this.io) {
        this.io.close();
      }

      // Close Redis adapter
      if (this.redisAdapter) {
        this.redisAdapter.close();
      }

      logger.info('Socket.IO graceful shutdown completed');
    } catch (error) {
      logger.error('Error during Socket.IO graceful shutdown:', error);
    }
  }

  // Get server statistics
  getStats() {
    try {
      return {
        connectedUsers: this.connectedUsers.size,
        totalRooms: this.roomUsers.size,
        totalSockets: this.io.sockets.sockets.size,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Error getting Socket.IO stats:', error);
      return {};
    }
  }
}

module.exports = new SocketManager();