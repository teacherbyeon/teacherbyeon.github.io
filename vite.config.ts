import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4310,
    host: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4311',
        ws: true
      },
      '/api': {
        target: 'http://localhost:4311'
      }
    }
  }
});
