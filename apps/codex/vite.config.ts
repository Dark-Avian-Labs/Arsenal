import path from 'path';
import { fileURLToPath } from 'url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const resolvedAppName = env.VITE_APP_NAME?.trim() || env.APP_NAME?.trim() || 'Codex';
  const resolvedAppId = env.VITE_APP_ID?.trim() || env.APP_ID?.trim() || 'codex';
  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_NAME': JSON.stringify(resolvedAppName),
      'import.meta.env.VITE_APP_ID': JSON.stringify(resolvedAppId),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.APP_VERSION ?? '0.0.0-dev'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'client'),
      },
    },
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
    },
  };
});
