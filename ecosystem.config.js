const path = require('path');

const rootDir = __dirname;

module.exports = {
  apps: [
    {
      name: 'yunlist',
      cwd: rootDir,
      script: path.join(rootDir, 'dist', 'index.js'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      out_file: path.join(rootDir, 'logs', 'yunlist.out.log'),
      error_file: path.join(rootDir, 'logs', 'yunlist.err.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'changeme',
        JWT_SECRET: process.env.JWT_SECRET || 'change-this-before-production',
        FILES_ROOT: process.env.FILES_ROOT || path.join(rootDir, 'data', 'files'),
        DB_PATH: process.env.DB_PATH || path.join(rootDir, 'data', 'db', 'yunlist.db'),
        FRONTEND_DIST_PATH: process.env.FRONTEND_DIST_PATH || path.join(rootDir, 'frontend', 'dist'),
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};