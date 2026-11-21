const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'Arsenal',
      script: 'server/index.ts',
      interpreter: 'node',
      cwd: path.join(__dirname, '..', '..', 'current'),
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 15000,
      max_memory_restart: '1024M',
      env: {
        NODE_ENV: 'production',
        PORT: '3006',
      },
    },
  ],
};
