// Runs the built ops app: pm2 start ecosystem.config.js
// Build first (once, and after code changes): npm run build
const base = { autorestart: true, max_restarts: 10, restart_delay: 3000 };

module.exports = {
  apps: [
    { ...base, name: 'ops-app', script: 'node_modules/next/dist/bin/next', args: 'start -p 3010' },
    { ...base, name: 'ops-worker', script: 'node_modules/tsx/dist/cli.mjs', args: '--env-file=.env scripts/worker.ts' },
  ],
};
