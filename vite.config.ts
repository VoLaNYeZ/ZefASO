import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
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
      rollupOptions: {
        output: {
          // Remove banner comments (license headers)
          banner: '',
          // Better chunk splitting strategy
          manualChunks(id) {
            // Split large vendor libraries into separate chunks
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor';
              }
              if (id.includes('@supabase')) {
                return 'supabase';
              }
              if (id.includes('i18next')) {
                return 'i18n';
              }
              // Group all other node_modules into a common vendor chunk
              return 'vendor';
            }
          }
        }
      }
    }
  };
});
