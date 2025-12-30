import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: (process.env.NODE_ENV === 'production' || process.env.BUILD_MODE === 'prod') ? './' : '/',
  plugins: [
    react()
  ],
  define: {
    global: 'globalThis',
    'process.env': {}
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: 'buffer/',
      process: 'process/browser',
      stream: 'stream-browserify',
      util: 'util/'
    },
  },
  optimizeDeps: {
    include: ['buffer', 'process', 'simple-peer'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },
  build: {
    commonjsOptions: {
      include: [/simple-peer/, /node_modules/],
      transformMixedEsModules: true
    }
  }
})
