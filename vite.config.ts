import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import sourceIdentifierPlugin from 'vite-plugin-source-identifier'

const isProd = process.env.BUILD_MODE === 'prod'
export default defineConfig({
  plugins: [
    react(),
    sourceIdentifierPlugin({
      enabled: !isProd,
      attributePrefix: 'data-matrix',
      includeProps: true,
    })
  ],
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['simple-peer'],
    exclude: ['simple-peer/simplepeer.min.js'],
    force: true
  },
  build: {
    commonjsOptions: {
      include: [/simple-peer/, /node_modules/],
      transformMixedEsModules: true
    },
    rollupOptions: {
      external: (id) => {
        // Don't externalize simple-peer and its dependencies
        if (id.includes('simple-peer')) return false
        // Don't externalize Node.js built-ins that simple-peer needs
        if (['events', 'util', 'buffer', 'stream'].includes(id)) return false
        return false
      }
    }
  },
  // Add polyfills for Node.js modules that simple-peer needs
  esbuild: {
    banner: `
      import { Buffer } from 'buffer';
      window.Buffer = Buffer;
      window.global = window;
      window.process = { env: {} };
    `
  }
})
