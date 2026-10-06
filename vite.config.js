import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  // .env fayllari config ichida process.env ga avtomatik tushmaydi —
  // shuning uchun loadEnv bilan o'qiymiz (aks holda VITE_BACKEND_URL e'tiborsiz qolardi).
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const backend = env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
    },
    server: {
      port: 5173,
      // Frontend /api ga so'rov yuboradi, Vite uni backendga uzatadi.
      // Shu tufayli production'da ham bir domendan ishlaydi — CORS muammosi yo'q.
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/ws': { target: backend, ws: true, changeOrigin: true }
      }
    }
  }
})
