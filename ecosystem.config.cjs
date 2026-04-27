// pm2 ecosystem config
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: "pi-telegram",
      script: "./dist/index.js",
      interpreter: "node",

      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,

      // Memory guard — restart if heap exceeds 1GB
      max_memory_restart: "1G",

      // Env vars are loaded from .env by dotenv
      // but you can also set them here for production:
      env_production: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
      },

      // Log files (PM2's own logs)
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};
