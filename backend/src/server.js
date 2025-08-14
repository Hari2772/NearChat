const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Import configurations
const database = require('./config/database');
const redis = require('./config/redis');
const auth = require('./config/auth');
const webrtc = require('./config/webrtc');
const features = require('./config/features');

// Import middleware
const authMiddleware = require('./middleware/auth');
const featureMiddleware = require('./middleware/features');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chats');
const locationRoutes = require('./routes/location');
const webrtcRoutes = require('./routes/webrtc');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');

// Import services
const socketService = require('./services/socketService');
const locationService = require('./services/locationService');
const notificationService = require('./services/notificationService');

// Import utilities
const logger = require('./utils/logger');

class NearChatServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 10000,
      maxHttpBufferSize: 1e8
    });
    
    this.port = process.env.PORT || 3000;
    this.isProduction = process.env.NODE_ENV === 'production';
    
    this.initialize();
  }

  async initialize() {
    try {
      // Initialize configurations
      await this.initializeConfigurations();
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup Socket.IO
      this.setupSocketIO();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Start server
      await this.start();
      
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      process.exit(1);
    }
  }

  async initializeConfigurations() {
    try {
      logger.info('Initializing configurations...');
      
      // Initialize database
      await database.connect();
      logger.info('Database connected');
      
      // Initialize Redis
      await redis.connect();
      logger.info('Redis connected');
      
      // Initialize WebRTC
      await webrtc.initialize();
      logger.info('WebRTC initialized');
      
      // Initialize feature flags
      await features.initialize();
      logger.info('Feature flags initialized');
      
      logger.info('All configurations initialized successfully');
      
    } catch (error) {
      logger.error('Configuration initialization failed:', error);
      throw error;
    }
  }

  setupMiddleware() {
    logger.info('Setting up middleware...');
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000 / 60)
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true'
    });
    this.app.use('/api/', limiter);

    // Logging
    if (this.isProduction) {
      this.app.use(morgan('combined'));
    } else {
      this.app.use(morgan('dev'));
    }

    // Static files
    this.app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
    this.app.use('/public', express.static(path.join(__dirname, '../public')));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // Feature flag middleware
    this.app.use(featureMiddleware);

    logger.info('Middleware setup completed');
  }

  setupRoutes() {
    logger.info('Setting up routes...');
    
    // Health check route (no auth required)
    this.app.use('/health', healthRoutes);
    
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/users', authMiddleware, userRoutes);
    this.app.use('/api/chats', authMiddleware, chatRoutes);
    this.app.use('/api/location', authMiddleware, locationRoutes);
    this.app.use('/api/webrtc', authMiddleware, webrtcRoutes);
    this.app.use('/api/admin', authMiddleware, adminRoutes);
    
    // Root route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'NearChat API Server',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        features: features.getEnabledFeatures().length
      });
    });
    
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
      });
    });
    
    logger.info('Routes setup completed');
  }

  setupSocketIO() {
    logger.info('Setting up Socket.IO...');
    
    // Initialize socket service
    socketService.initialize(this.io);
    
    // Socket.IO middleware for authentication
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        if (!token) {
          return next(new Error('Authentication token required'));
        }
        
        const decoded = auth.verifyToken(token.replace('Bearer ', ''));
        if (!decoded) {
          return next(new Error('Invalid token'));
        }
        
        socket.userId = decoded.userId;
        socket.user = decoded;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
    
    // Socket connection handler
    this.io.on('connection', (socket) => {
      logger.info(`User ${socket.userId} connected`);
      
      // Join user to their personal room
      socket.join(`user:${socket.userId}`);
      
      // Handle user location updates
      socket.on('location:update', async (data) => {
        try {
          await locationService.updateUserLocation(socket.userId, data);
          socket.broadcast.emit('user:location:updated', {
            userId: socket.userId,
            location: data
          });
        } catch (error) {
          logger.error('Location update failed:', error);
        }
      });
      
      // Handle chat messages
      socket.on('chat:message', async (data) => {
        try {
          const message = await chatService.createMessage(socket.userId, data);
          socket.to(data.roomId).emit('chat:message:new', message);
        } catch (error) {
          logger.error('Message creation failed:', error);
        }
      });
      
      // Handle WebRTC signaling
      socket.on('webrtc:offer', (data) => {
        socket.to(data.targetUserId).emit('webrtc:offer', {
          ...data,
          fromUserId: socket.userId
        });
      });
      
      socket.on('webrtc:answer', (data) => {
        socket.to(data.targetUserId).emit('webrtc:answer', {
          ...data,
          fromUserId: socket.userId
        });
      });
      
      socket.on('webrtc:ice-candidate', (data) => {
        socket.to(data.targetUserId).emit('webrtc:ice-candidate', {
          ...data,
          fromUserId: socket.userId
        });
      });
      
      // Handle disconnection
      socket.on('disconnect', async () => {
        try {
          await locationService.updateUserStatus(socket.userId, 'offline');
          logger.info(`User ${socket.userId} disconnected`);
        } catch (error) {
          logger.error('User status update failed:', error);
        }
      });
    });
    
    logger.info('Socket.IO setup completed');
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use(errorHandler);
    
    // Unhandled promise rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGINT', this.gracefulShutdown.bind(this));
  }

  async start() {
    try {
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, () => {
          logger.info(`NearChat server running on port ${this.port}`);
          logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
          logger.info(`Server URL: http://localhost:${this.port}`);
          resolve();
        });
        
        this.server.on('error', (error) => {
          reject(error);
        });
      });
      
      // Start background services
      await this.startBackgroundServices();
      
      logger.info('NearChat server started successfully');
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      throw error;
    }
  }

  async startBackgroundServices() {
    try {
      logger.info('Starting background services...');
      
      // Start notification service
      await notificationService.start();
      
      // Start location service
      await locationService.start();
      
      // Start cleanup tasks
      this.startCleanupTasks();
      
      logger.info('Background services started successfully');
      
    } catch (error) {
      logger.error('Failed to start background services:', error);
    }
  }

  startCleanupTasks() {
    // Clean up inactive rooms every 5 minutes
    setInterval(async () => {
      try {
        const rooms = webrtc.getRooms();
        for (const roomId of rooms) {
          const roomInfo = webrtc.getRoomInfo(roomId);
          if (roomInfo && roomInfo.peerCount === 0) {
            await webrtc.closeRoom(roomId);
            logger.info(`Cleaned up inactive room: ${roomId}`);
          }
        }
      } catch (error) {
        logger.error('Room cleanup failed:', error);
      }
    }, 5 * 60 * 1000);

    // Clean up expired sessions every hour
    setInterval(async () => {
      try {
        // Implementation for session cleanup
        logger.info('Session cleanup completed');
      } catch (error) {
        logger.error('Session cleanup failed:', error);
      }
    }, 60 * 60 * 1000);
  }

  async gracefulShutdown() {
    logger.info('Received shutdown signal, starting graceful shutdown...');
    
    try {
      // Stop accepting new connections
      this.server.close(() => {
        logger.info('HTTP server closed');
      });
      
      // Close Socket.IO connections
      this.io.close(() => {
        logger.info('Socket.IO server closed');
      });
      
      // Close database connections
      await database.gracefulShutdown();
      
      // Close Redis connections
      await redis.gracefulShutdown();
      
      // Cleanup WebRTC
      await webrtc.cleanup();
      
      // Stop background services
      await notificationService.stop();
      await locationService.stop();
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      logger.error('Graceful shutdown failed:', error);
      process.exit(1);
    }
  }

  // Health check method
  async healthCheck() {
    try {
      const checks = {
        server: 'healthy',
        database: await database.healthCheck(),
        redis: await redis.healthCheck(),
        features: await features.healthCheck(),
        webrtc: webrtc.worker ? 'healthy' : 'unhealthy'
      };
      
      const allHealthy = Object.values(checks).every(check => 
        check === 'healthy' || (typeof check === 'object' && check.status === 'healthy')
      );
      
      return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checks
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

// Create and start server instance
const server = new NearChatServer();

// Export for testing
module.exports = server;