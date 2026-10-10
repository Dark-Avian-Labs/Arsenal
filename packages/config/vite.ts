import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const sharedPublicDir = fileURLToPath(new URL('../ui/public/', import.meta.url));
const sharedPublicFiles = ['theme-init.js', 'favicon.svg', 'favicon.png'];

function contentType(name: string): string {
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.png')) return 'image/png';
  return 'text/javascript; charset=utf-8';
}

function sharedPublicPlugin(): Plugin {
  return {
    name: 'dal-shared-public',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0]?.replace(/^\//, '') ?? '';
        if (!sharedPublicFiles.includes(name)) {
          next();
          return;
        }
        const file = path.join(sharedPublicDir, name);
        if (!fs.existsSync(file)) {
          next();
          return;
        }
        res.setHeader('Content-Type', contentType(name));
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const name of sharedPublicFiles) {
        this.emitFile({
          type: 'asset',
          fileName: name,
          source: fs.readFileSync(path.join(sharedPublicDir, name)),
        });
      }
    },
  };
}

export interface AppViteOptions {
  rootDir: string;
  devApiTarget?: string;
  devPort?: number;
  proxyPaths?: string[];
  watchIgnored?: string[];
  alias?: Record<string, string>;
  defines?: Record<string, string>;
}

export function defineAppVite(options: AppViteOptions) {
  return defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const read = (key: string, fallback: string) => {
      const bare = key.startsWith('VITE_') ? key.slice('VITE_'.length) : '';
      return (
        process.env[key]?.trim() ||
        (bare ? process.env[bare]?.trim() : '') ||
        env[key]?.trim() ||
        (bare ? env[bare]?.trim() : '') ||
        fallback
      );
    };
    const defines: Record<string, string> = {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.APP_VERSION ?? '0.0.0-dev'),
    };
    for (const [key, fallback] of Object.entries(options.defines ?? {})) {
      defines[`import.meta.env.${key}`] = JSON.stringify(read(key, fallback));
    }

    const alias: Record<string, string> = {
      '@': path.resolve(options.rootDir, 'client'),
    };
    for (const [key, value] of Object.entries(options.alias ?? {})) {
      alias[key] = path.resolve(options.rootDir, value);
    }

    const devApiTarget = options.devApiTarget
      ? read('VITE_DEV_API_TARGET', options.devApiTarget)
      : '';
    const fallbackPort = options.devPort ?? 5173;
    const devPort = Number.parseInt(read('VITE_DEV_PORT', String(fallbackPort)), 10);
    const proxyPaths = options.proxyPaths ?? (devApiTarget ? ['/api'] : []);
    const proxy = Object.fromEntries(
      proxyPaths.map((proxyPath) => [proxyPath, { target: devApiTarget, changeOrigin: true }]),
    );
    const hasServer = Boolean(devApiTarget || options.devPort);

    return {
      base: '/',
      plugins: [react(), tailwindcss(), sharedPublicPlugin()],
      define: defines,
      resolve: { alias },
      build: {
        outDir: 'dist/client',
        emptyOutDir: true,
      },
      ...(hasServer
        ? {
            server: {
              port: Number.isFinite(devPort) && devPort > 0 ? devPort : fallbackPort,
              ...(options.watchIgnored ? { watch: { ignored: options.watchIgnored } } : {}),
              ...(Object.keys(proxy).length > 0 ? { proxy } : {}),
            },
          }
        : {}),
    };
  });
}
