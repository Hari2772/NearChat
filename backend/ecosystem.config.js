module.exports = {
  apps: [
    {
      name: 'nearchat-api',
      script: 'src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000,
      source_map_support: false,
      node_args: '--max-old-space-size=4096'
    },
    {
      name: 'nearchat-webrtc',
      script: 'src/webrtc-server.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'development',
        WEBRTC_PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        WEBRTC_PORT: 3001
      },
      error_file: './logs/webrtc-err.log',
      out_file: './logs/webrtc-out.log',
      log_file: './logs/webrtc-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000,
      node_args: '--max-old-space-size=8192'
    },
    {
      name: 'nearchat-worker',
      script: 'src/worker.js',
      instances: 4,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: './logs/worker-err.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 8000
    }
  ],
  deploy: {
    production: {
      user: 'nearchat',
      host: 'your-production-server.com',
      ref: 'origin/main',
      repo: 'https://github.com/nearchat/backend.git',
      path: '/var/www/nearchat-backend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
