import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  main: {
    define: {
      '__HOUSE_OPENAI_KEY__': JSON.stringify(process.env.HOUSE_OPENAI_KEY || '')
    },
    build: {
      sourcemap: false,
      minify: isProd ? 'terser' : false,
      terserOptions: isProd
        ? {
            compress: { drop_console: true, drop_debugger: true },
            mangle: { toplevel: true }
          }
        : undefined
    }
  },
  preload: {
    build: {
      sourcemap: false,
      minify: isProd ? 'terser' : false
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      sourcemap: false,
      minify: isProd ? 'terser' : false,
      terserOptions: isProd
        ? {
            compress: { drop_console: true, drop_debugger: true },
            mangle: { toplevel: true }
          }
        : undefined
    }
  }
})
