<script setup>
// Raqam o'zgarganda eski qiymatdan yangisiga silliq o'tadi.
// Formatni saqlaydi: "$12,400" → "$", ming ajratgich; "34%" → "%"; "4.5" → 1 xona.
// Raqam emas qiymat ("—" kabi) o'zgarishsiz ko'rsatiladi.
// Ekran o'quvchilar uchun yakuniy qiymat alohida (sr-only) beriladi.
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  value: { type: [String, Number], default: '' },
  duration: { type: Number, default: 700 }
})

const display = ref('')
let frame = 0
let current = null // hozir ekranda turgan son (keyingi animatsiya shu yerdan boshlanadi)

const NUM_RE = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(.*)$/s

function parse(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const decimals = Number.isInteger(value) ? 0 : Math.min(2, String(value).split('.')[1]?.length || 0)
    return { prefix: '', suffix: '', num: value, decimals, grouped: false }
  }
  const match = NUM_RE.exec(String(value ?? ''))
  if (!match) return null
  const raw = match[2]
  const num = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(num)) return null
  return {
    prefix: match[1],
    suffix: match[3],
    num,
    decimals: raw.includes('.') ? raw.split('.')[1].length : 0,
    grouped: raw.includes(',')
  }
}

function format(num, meta) {
  const text = meta.grouped
    ? num.toLocaleString('en-US', { minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals })
    : num.toFixed(meta.decimals)
  return meta.prefix + text + meta.suffix
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function animate(value) {
  cancelAnimationFrame(frame)
  const meta = parse(value)
  if (!meta) {
    display.value = String(value ?? '')
    current = null
    return
  }
  const from = current ?? 0
  const to = meta.num
  if (from === to || reducedMotion()) {
    display.value = format(to, meta)
    current = to
    return
  }
  const start = performance.now()
  const step = (now) => {
    const t = Math.min(1, (now - start) / props.duration)
    const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
    current = from + (to - from) * eased
    display.value = format(t === 1 ? to : current, meta)
    if (t < 1) frame = requestAnimationFrame(step)
    else current = to
  }
  frame = requestAnimationFrame(step)
}

watch(() => props.value, animate, { immediate: true })
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <span class="tabular-nums" aria-hidden="true">{{ display }}</span>
  <span class="sr-only">{{ value }}</span>
</template>
