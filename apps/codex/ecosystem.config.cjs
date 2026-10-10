const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'Codex',
      script: 'server/index.ts',
      interpreter: 'node',
      cwd: path.join(__dirname, '..', '..', 'current'),
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 12000,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
