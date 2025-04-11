import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: './',
  build:{
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve:{
    alias:{
      '@': path.resolve(__dirname, './src'), 
    }
  }
})
