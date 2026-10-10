import { createApp } from './app.js';
import {
  APP_ID,
  APP_NAME,
  HOST,
  NODE_ENV,
  PORT,
  SESSION_DB_PATH,
  SHUTDOWN_TIMEOUT_MS,
} from './config.js';
import { closeSessionDb } from './db/connection.js';
import { log } from './logger.js';
import { createAppSentinelAgent } from './sentinelAgent.js';

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
});

const { app, sessionStore } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});
log('info', 'Session store ready', { app: APP_NAME, path: SESSION_DB_PATH });

sentinelAgent?.start();

const server = app.listen(PORT, HOST, () => {
  log('info', 'Server running', { app: APP_NAME, host: HOST, port: PORT, env: NODE_ENV });
});

let shuttingDown = false;
function shutdown(exitCode: number, signal?: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  if (exitCode === 0) sentinelAgent?.noteGracefulExit(signal);
  else sentinelAgent?.noteCrash(new Error(`shutdown exit ${exitCode}`));
  sentinelAgent?.stop();

  let done = false;
  function closeAndExit(): void {
    if (done) return;
    done = true;
    sessionStore.dispose();
    try {
      closeSessionDb();
    } catch (err) {
      log('error', 'Failed to close session DB during shutdown', { error: String(err) });
    }
    process.exit(exitCode);
  }

  const timeout = setTimeout(closeAndExit, SHUTDOWN_TIMEOUT_MS);
  server.close(() => {
    clearTimeout(timeout);
    closeAndExit();
  });
  server.closeIdleConnections();
  const forceCloseMs = Math.max(0, SHUTDOWN_TIMEOUT_MS - 500);
  setTimeout(() => {
    server.closeAllConnections();
  }, forceCloseMs);
}

process.on('SIGINT', () => shutdown(0, 'SIGINT'));
process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));

process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled promise rejection; shutting down', {
    error: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  });
  sentinelAgent?.noteCrash(reason);
  shutdown(1);
});

process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception; shutting down', {
    error: err.stack ?? err.message,
  });
  sentinelAgent?.noteCrash(err);
  shutdown(1);
});
