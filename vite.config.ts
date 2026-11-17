import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Solo con VITE_DEMO=false: backend a cui il dev server inoltra /api (default locale).
  const target = env.VITE_API_PROXY || 'http://127.0.0.1:8787';
  const proxy = { '/api': { target, changeOrigin: true } };

  return {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom')) return 'react-dom';
              if (/[\\/]react[\\/]/.test(id)) return 'react';
              return 'vendor';
            }
            // I widget sono lazy-loaded (vedi WidgetContent.tsx): un chunk per widget.
          }
        }
      }
    },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy }
  };
});
