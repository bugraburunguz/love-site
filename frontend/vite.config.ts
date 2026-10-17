import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev the backend runs on :8080; in prod Spring Boot serves the build, so no CORS is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/actuator': 'http://localhost:8080',
    },
  },
})
