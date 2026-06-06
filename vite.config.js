import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  optimizeDeps: {
    include: ['@soundtouchjs/audio-worklet'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
