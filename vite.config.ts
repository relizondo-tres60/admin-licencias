import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El frontend se compila a dist/client y el Worker lo sirve vía el binding ASSETS.
// En desarrollo, Vite (puerto 5173) hace proxy de /api al Worker (wrangler dev, 8787).
export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  // Los archivos de licencias/public/ se copian a dist/client (assets del Worker).
  // Incluye usuarios.xlsx, servido en /usuarios.xlsx y leído por el Worker.
  publicDir: '../../public',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
