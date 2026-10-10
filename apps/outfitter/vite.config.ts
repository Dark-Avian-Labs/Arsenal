import path from 'path';
import { fileURLToPath } from 'url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devApiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:3004';
  const base = env.VITE_BASE_PATH || '/';
  const devPort = Number.parseInt(env.VITE_DEV_PORT || '5174', 10);

  return {
    base,
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.APP_VERSION ?? '0.0.0-dev'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'client'),
        '@shared': path.resolve(__dirname, 'shared'),
      },
    },
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
    },
    server: {
      port: Number.isFinite(devPort) && devPort > 0 ? devPort : 5173,
      watch: {
        ignored: ['**/_resources/**', '**/data/**'],
      },
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
        },
        '/hero-images': {
          target: devApiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
