require('dotenv').config({ path: __dirname + '/.env.local' });

module.exports = {
  apps: [
    {
      name: 'zagros-repost',
      script: 'dist/server.cjs',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3001,
        DATA_DIR: process.env.DATA_DIR,
        DATABASE_URL: process.env.DATABASE_URL,
        ADMIN_RECOVERY_KEY: process.env.ADMIN_RECOVERY_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        USERBOT_SERVICE_URL: process.env.USERBOT_SERVICE_URL,
        USERBOT_SECRET: process.env.USERBOT_SECRET,
        USERBOT_RELAY_CHANNEL: process.env.USERBOT_RELAY_CHANNEL,
        LOG_LEVEL: process.env.LOG_LEVEL,
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      watch: false,
    },
  ],
};
