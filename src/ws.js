// Real vaqtli sinxronizatsiya — WebSocket mijozi.
//
// Login bo'lgach ulanadi. Backend (storage.write) har qanday kolleksiyani
// (leadlar, mijozlar, vazifalar, hodimlar, savdolar va h.k.) yozganda
// { type: 'collection', collection: '<nom>' } xabarini yuboradi — biz shu
// bo'limni serverdan qayta yuklaymiz. Shu tufayli bir hodim ikkinchisiga
// vazifa bersa, ikkinchi tomonda sahifani yangilamasdan darhol ko'rinadi.
//
// Ulanish uzilsa — eksponensial backoff bilan qayta urinadi. WebSocket
// umuman ishlamasa ham, AppLayout dagi 60s polling zaxira sifatida qoladi.

import { tokenStore } from '@/api'

let socket = null
let reconnectTimer = null
let reconnectDelay = 1000
let manualClose = false
let handler = () => {}

// Manzil tartibi: VITE_WS_URL (aniq berilgan) → VITE_API_URL dan hosil
// qilingan (backend boshqa domenda, masalan Render) → joriy host (Vite proxy).
function wsBase() {
  const explicit = String(import.meta.env.VITE_WS_URL || '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const api = String(import.meta.env.VITE_API_URL || '').trim()
  if (/^https?:\/\//i.test(api)) {
    const origin = api.replace(/\/+$/, '').replace(/\/api$/, '')
    return origin.replace(/^http/i, 'ws') + '/ws'
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

function wsUrl() {
  return `${wsBase()}?token=${encodeURIComponent(tokenStore.get())}`
}

function scheduleReconnect() {
  if (manualClose) return
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 1.6, 15000)
    connectRealtime(handler)
  }, reconnectDelay)
}

/** Ulanishni ochadi. `onMessage(data)` — har bir xabar uchun chaqiriladi. */
export function connectRealtime(onMessage) {
  if (!tokenStore.get()) return
  handler = onMessage || handler
  manualClose = false

  // Allaqachon ulangan yoki ulanayotgan bo'lsa — qayta ochmaymiz
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  try {
    socket = new WebSocket(wsUrl())
  } catch {
    scheduleReconnect()
    return
  }

  socket.onopen = () => { reconnectDelay = 1000 }

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      handler(data)
    } catch {
      // JSON bo'lmagan xabar — e'tiborsiz qoldiramiz
    }
  }

  socket.onclose = () => { socket = null; scheduleReconnect() }
  socket.onerror = () => { socket?.close() }
}

export function disconnectRealtime() {
  manualClose = true
  clearTimeout(reconnectTimer)
  reconnectDelay = 1000
  if (socket) { socket.close(); socket = null }
}
