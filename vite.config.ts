import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/asomobile-api': {
          target: 'https://app.asomobile.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/asomobile-api/, '/asomobile-public-api'),
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      minify: 'terser',
      chunkSizeWarningLimit: 1000, // Increase limit to 1000 kB (from default 500 kB)
      terserOptions: {
        format: {
          comments: false, // Remove all comments
        },
        compress: {
          drop_console: false, // Keep console logs (set to true to remove them)
          drop_debugger: true,
          pure_funcs: ['console.log'], // Optional: remove console.log calls
        }
      },
      // Use Vite's default chunk splitting to avoid circular dependencies between manual vendor bundles
      rollupOptions: {
        output: {
          banner: ''
        }
      }
    }
  };
});