/**
 * PM2 Ecosystem Configuration
 * 管理 Studio API 和 Web 的生产环境进程
 *
 * 启动: pm2 start ecosystem.config.cjs
 * 重启: pm2 restart ecosystem.config.cjs --update-env
 * 状态: pm2 status
 * 日志: pm2 logs
 * 保存: pm2 save     (持久化，服务器重启后自动恢复)
 * 自启: pm2 startup  (系统启动时自动拉起 PM2)
 */

const path = require('path');

const PROJECT_ROOT = __dirname;
const ENV_FILE = path.join(PROJECT_ROOT, '.env');

// bash -c 命令，先 source .env 再执行
const wrapEnv = (cmd) =>
  `set -a; source ${ENV_FILE}; set +a; ${cmd}`;

module.exports = {
  apps: [
    {
      // ── Studio API (:4401) ────────────────────────────────────
      name: 'studio-api',
      cwd: PROJECT_ROOT,
      script: '/usr/bin/bash',
      args: [
        '-c',
        wrapEnv('pnpm --filter @ai-engineering-agent/studio-api start'),
      ],
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: path.join(PROJECT_ROOT, 'logs', 'api-error.log'),
      out_file: path.join(PROJECT_ROOT, 'logs', 'api-out.log'),
      merge_logs: true,
    },
    {
      // ── Studio Web (:4400) ────────────────────────────────────
      name: 'studio-web',
      cwd: path.join(PROJECT_ROOT, 'apps', 'studio-web'),
      script: '/usr/bin/bash',
      args: [
        '-c',
        wrapEnv('pnpm preview --port 4400 --host 0.0.0.0'),
      ],
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: path.join(PROJECT_ROOT, 'logs', 'web-error.log'),
      out_file: path.join(PROJECT_ROOT, 'logs', 'web-out.log'),
      merge_logs: true,
    },
  ],
};
