// AI Call Center uchun kichik formatlash yordamchilari.

export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${String(m).padStart(2, '0')}:${r}`
}

// CRM'dagi barcha sana/vaqtlar kabi Asia/Tashkent bo'yicha (brauzer zonasidan qat'i nazar)
const TASHKENT_FMT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
})

export function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return TASHKENT_FMT.format(d).replace(',', '')
}

// Bosqich statuslari: pending | processing | done | failed
export const STEP_STATUS = {
  pending: { label: 'Kutilmoqda', cls: 'bg-slate-100 text-slate-600' },
  processing: { label: 'Jarayonda', cls: 'bg-amber-50 text-amber-700' },
  done: { label: 'Tayyor', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'FAILED', cls: 'bg-rose-50 text-rose-700' }
}

export const RATING_TONE = {
  excellent: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  good: 'bg-blue-50 text-blue-700 ring-blue-200',
  average: 'bg-amber-50 text-amber-700 ring-amber-200',
  poor: 'bg-rose-50 text-rose-700 ring-rose-200'
}

export function scoreTone(score) {
  const s = Number(score) || 0
  if (s >= 85) return 'text-emerald-600'
  if (s >= 65) return 'text-blue-600'
  if (s >= 45) return 'text-amber-600'
  return 'text-rose-600'
}

export const digits = (phone) => String(phone || '').replace(/\D/g, '')
