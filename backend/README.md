# NearChat Backend

A production-ready, scalable backend for NearChat - a location-aware social messaging platform with 220+ features including real-time audio/video calls, screen recording, and admin-controlled feature rollout system.

## 🚀 Features

### Core Features
- **Location-based Social Messaging** - 6-tier proximity system
- **Real-time Communication** - WebRTC audio/video calls with screen sharing
- **Advanced Media Support** - Screen recording, voice messages, file sharing
- **Feature Flag System** - Admin-controlled feature rollout and management
- **Scalable Architecture** - Designed for 25K+ concurrent users

### Technical Features
- **WebRTC Integration** - Mediasoup for high-performance media handling
- **Real-time Updates** - Socket.IO for instant messaging and notifications
- **Database Optimization** - MongoDB with 2dsphere indexing for location queries
- **Caching Layer** - Redis for session management and performance
- **Security** - JWT authentication, Google OAuth, rate limiting
- **Monitoring** - Comprehensive logging and health checks

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Web Server    │    │   API Gateway   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx Proxy   │    │  Express API    │    │  Socket.IO      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WebRTC Server │    │   Worker Pool   │    │   Redis Cache   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MongoDB       │    │   File Storage  │    │   Monitoring    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- **Node.js** 18.0.0 or higher
- **MongoDB** 7.0 or higher
- **Redis** 7.2 or higher
- **PM2** (for production deployment)
- **Docker** (optional, for containerized deployment)

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/nearchat/backend.git
cd backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
cp .env.example .env
# Edit .env with your configuration values
```

### 4. Database Setup
```bash
# MongoDB
# Ensure MongoDB is running and accessible
# Create database: nearchat

# Redis
# Ensure Redis is running and accessible
```

### 5. Start Development Server
```bash
npm run dev
```

## 🚀 Production Deployment

### Using PM2 (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start production server
npm run pm2:start

# Monitor processes
npm run pm2:monit

# View logs
npm run pm2:logs
```

### Using Docker
```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Environment Variables

#### Required Variables
```bash
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/nearchat
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_super_secret_jwt_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

#### Optional Variables
```bash
# WebRTC Configuration
WEBRTC_PORT=3001
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=your_public_ip

# Feature Flags
FEATURE_LOCATION_BASED_CHAT=true
FEATURE_AUDIO_CALLS=true
FEATURE_VIDEO_CALLS=true

# Security
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.js   # MongoDB configuration
│   │   ├── redis.js      # Redis configuration
│   │   ├── auth.js       # Authentication configuration
│   │   ├── webrtc.js     # WebRTC configuration
│   │   └── features.js   # Feature flag system
│   ├── middleware/       # Express middleware
│   ├── routes/           # API routes
│   ├── services/         # Business logic services
│   ├── models/           # Database models
│   ├── utils/            # Utility functions
│   └── server.js         # Main server file
├── logs/                 # Log files
├── uploads/              # File uploads
├── public/               # Static files
├── package.json          # Dependencies
├── ecosystem.config.js   # PM2 configuration
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker services
└── .env.example         # Environment template
```

## 🔧 Configuration

### Database Configuration
- **MongoDB Atlas** - Cloud-hosted MongoDB with 2dsphere indexing
- **Connection Pooling** - Optimized for high concurrency
- **Indexes** - Automatic creation of location-based indexes

### Redis Configuration
- **Cluster Mode** - Support for Redis cluster deployment
- **Session Storage** - User session management
- **Caching** - API response caching and rate limiting

### WebRTC Configuration
- **Mediasoup** - High-performance WebRTC media server
- **Multiple Codecs** - VP8, H.264, Opus support
- **Screen Sharing** - Advanced screen recording capabilities

### Feature Flags
- **Dynamic Control** - Runtime feature enabling/disabling
- **Admin Panel** - Web-based feature management
- **Redis Persistence** - Feature state persistence

## 📊 Monitoring & Health Checks

### Health Endpoints
```bash
GET /health                    # Overall system health
GET /health/database          # Database connectivity
GET /health/redis            # Redis connectivity
GET /health/features         # Feature flag status
GET /health/webrtc           # WebRTC server status
```

### Logging
- **Winston Logger** - Structured logging with multiple transports
- **Log Rotation** - Automatic log file management
- **Error Tracking** - Comprehensive error logging and monitoring

### Performance Monitoring
- **PM2 Monitoring** - Process monitoring and metrics
- **Memory Management** - Automatic memory limit enforcement
- **Connection Pooling** - Database and Redis connection optimization

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Google OAuth** - Social login integration
- **Rate Limiting** - API abuse prevention
- **CORS Protection** - Cross-origin request security
- **Helmet Security** - HTTP security headers
- **Input Validation** - Request data sanitization

## 📈 Scaling

### Horizontal Scaling
- **PM2 Cluster Mode** - Multi-process deployment
- **Load Balancing** - Nginx reverse proxy
- **Database Sharding** - MongoDB sharding support
- **Redis Clustering** - Distributed caching

### Vertical Scaling
- **Memory Optimization** - Efficient memory usage
- **Connection Pooling** - Optimized database connections
- **Async Processing** - Non-blocking I/O operations

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📝 API Documentation

### Authentication
```bash
POST /api/auth/login          # User login
POST /api/auth/register       # User registration
POST /api/auth/google         # Google OAuth
POST /api/auth/refresh        # Token refresh
```

### Users
```bash
GET /api/users/profile        # Get user profile
PUT /api/users/profile        # Update user profile
GET /api/users/nearby         # Find nearby users
```

### Chats
```bash
POST /api/chats/create        # Create chat room
GET /api/chats/messages       # Get chat messages
POST /api/chats/message       # Send message
```

### WebRTC
```bash
POST /api/webrtc/room        # Create WebRTC room
POST /api/webrtc/join        # Join WebRTC room
POST /api/webrtc/leave       # Leave WebRTC room
```

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Failed
```bash
# Check MongoDB status
systemctl status mongod

# Verify connection string
echo $MONGODB_URI
```

#### Redis Connection Failed
```bash
# Check Redis status
systemctl status redis

# Test Redis connection
redis-cli ping
```

#### WebRTC Issues
```bash
# Check Mediasoup worker
ps aux | grep mediasoup

# Verify port availability
netstat -tulpn | grep :3001
```

### Performance Issues

#### High Memory Usage
```bash
# Check PM2 memory usage
pm2 monit

# Restart with memory limits
pm2 restart ecosystem.config.js
```

#### Slow Database Queries
```bash
# Check MongoDB indexes
db.collection.getIndexes()

# Analyze slow queries
db.setProfilingLevel(2)
```

## 📞 Support

- **Documentation**: [Wiki](https://github.com/nearchat/backend/wiki)
- **Issues**: [GitHub Issues](https://github.com/nearchat/backend/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nearchat/backend/discussions)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- **Mediasoup** - WebRTC media server
- **Socket.IO** - Real-time communication
- **MongoDB** - Database solution
- **Redis** - Caching and session storage
- **Express.js** - Web framework
- **PM2** - Process manager