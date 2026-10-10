import type { Server } from 'node:http';

import type { Express } from 'express';

import { log } from './logger.js';
import type { createAppSentinelAgent } from './sentinelAgent.js';

type SentinelAgent = NonNullable<ReturnType<typeof createAppSentinelAgent>>;

export interface StartServerOptions {
  app: Express;
  appName?: string;
  host: string;
  port: number;
  shutdownTimeoutMs: number;
  onClose?: () => void;
  beforeClose?: () => void | Promise<void>;
  sentinelAgent?: SentinelAgent | null;
}

export function startServer(options: StartServerOptions): Server {
  const { app, appName, host, port, shutdownTimeoutMs, onClose, beforeClose, sentinelAgent } =
    options;
  sentinelAgent?.start();

  const server = app.listen(port, host, () => {
    log('info', 'Server running', {
      app: appName,
      host,
      port,
      env: process.env.NODE_ENV || 'development',
    });
  });

  let shuttingDown = false;
  function shutdown(exitCode: number, signal?: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    if (exitCode === 0) sentinelAgent?.noteGracefulExit(signal);
    else sentinelAgent?.noteCrash(new Error(`shutdown exit ${exitCode}`));
    sentinelAgent?.stop();

    let done = false;
    function closeAndExit(code = exitCode): void {
      if (done) return;
      done = true;
      try {
        onClose?.();
      } catch (err) {
        log('error', 'Failed to close resources during shutdown', { error: String(err) });
      }
      process.exit(code);
    }

    const timeout = setTimeout(closeAndExit, shutdownTimeoutMs);
    void (async () => {
      try {
        await beforeClose?.();
      } catch (err) {
        log('error', 'Shutdown hook failed', { error: String(err) });
      }
      if (done) return;
      server.close((err) => {
        clearTimeout(timeout);
        if (err) {
          log('error', 'HTTP server close failed', { error: String(err) });
          closeAndExit(1);
          return;
        }
        closeAndExit();
      });
      server.closeIdleConnections();
      const forceCloseMs = Math.max(0, shutdownTimeoutMs - 500);
      setTimeout(() => {
        server.closeAllConnections();
      }, forceCloseMs);
    })();
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

  return server;
}
