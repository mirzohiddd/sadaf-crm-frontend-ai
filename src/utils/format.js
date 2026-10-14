export const money = (n) => '$' + Number(n || 0).toLocaleString('en-US')

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

const AVATAR_TONES = [
  'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700', 'bg-teal-100 text-teal-700'
]
export const avatarTone = (name = '') =>
  AVATAR_TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length]

export const todayUz = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

// Jadvalni CSV qilib yuklab olish
export function exportCsv(filename, columns, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [
    columns.map((c) => esc(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// So'mdagi summa: 12 500 000 so'm
export const som = (n) =>
  Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm"

// Tur narxi: yangi turlar so'mda (currency: 'UZS'); valyutasi yozilmagan
// eski turlar USD da saqlangan — ular avvalgidek "$" bilan ko'rsatiladi.
export const isSomTour = (t) => t?.currency === 'UZS'
export const tourPrice = (t, n = t?.price) => (isSomTour(t) ? som(n) : money(n))

// ISO sana (2026-11-20) → 20.11.2026
export const isoToUz = (iso) => (iso ? String(iso).split('-').reverse().join('.') : '')

// Ixcham so'm (ko'rsatkich kartalari uchun): 12 500 000 → { value: '12,5', unit: "mln so'm" }
export const somShort = (n) => {
  const v = Math.round(Number(n || 0))
  const fmt = (x) => String(Math.round(x * 10) / 10).replace('.', ',')
  if (Math.abs(v) >= 1e9) return { value: fmt(v / 1e9), unit: "mlrd so'm" }
  if (Math.abs(v) >= 1e6) return { value: fmt(v / 1e6), unit: "mln so'm" }
  return { value: som(v).replace(" so'm", ''), unit: "so'm" }
}