import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/** Strip crossorigin attributes from HTML — breaks file:// loading on Windows */
function stripCrossOrigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '')
    }
  }
}

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  main: {
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
    plugins: [react(), stripCrossOrigin()],
    build: {
      sourcemap: false,
      minify: isProd ? 'terser' : false,
      terserOptions: isProd
        ? {
            compress: { drop_console: true, drop_debugger: true },
            mangle: { toplevel: true }
          }
        : undefined,
      modulePreload: false
    }
  }
})
