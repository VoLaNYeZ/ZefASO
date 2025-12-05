import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',

    },
    plugins: [react()],
    define: {
      // API keys removed - now handled securely via Supabase Edge Functions
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      minify: 'terser' as const,
      chunkSizeWarningLimit: 1000,
      terserOptions: {
        format: {
          comments: false,
        },
        compress: {
          drop_console: false,
          drop_debugger: true,
          pure_funcs: ['console.log'],
        }
      },
      rollupOptions: {
        output: {
          banner: ''
        }
      }
    }
  };
});