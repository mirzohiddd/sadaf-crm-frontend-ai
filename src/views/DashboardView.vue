<script setup>
import StatCard from '@/components/StatCard.vue'
import PanelCard from '@/components/PanelCard.vue'
import DonutChart from '@/components/DonutChart.vue'
import AreaChart from '@/components/AreaChart.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import AppIcon from '@/components/AppIcon.vue'
import AttendanceCard from '@/components/AttendanceCard.vue'
import { db, tasksApi, dashboard, loadDashboard, roleLabel } from '@/store'
import { onMounted, computed } from 'vue'

// Dashboard har bir account uchun ALOHIDA hisoblanadi:
// operator — faqat o'z statistikasi, menejer — jamoasi, admin — hammasi.
onMounted(loadDashboard)

// Backend kartalar nomida eski "ledlar" yozuvini qaytarishi mumkin —
// foydalanuvchiga ko'rinadigan matn frontendda "leadlar" ga to'g'rilanadi.
const fixLeadText = (text) => String(text || '').replace(/\b([Ll])ed(lar\w*|\b)/g, (_, l, rest) => (l === 'L' ? 'Lead' : 'lead') + rest)

// ——— Kartalar uchun mini-analitika (faqat REAL ma'lumot) ———
const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
const lastDays = (n) => {
  const out = []
  const now = new Date()
  for (let k = n - 1; k >= 0; k--) out.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - k)))
  return out
}
// "40%" → 0.4 (backend hisoblagan ulush)
const shareOf = (delta) => {
  const n = parseFloat(String(delta || '').replace('%', ''))
  return Number.isFinite(n) && String(delta).includes('%') ? n / 100 : undefined
}

const leadsTrend = computed(() => {
  const counts = {}
  db.leads.forEach((l) => { const d = String(l.date || '').slice(0, 10); counts[d] = (counts[d] || 0) + 1 })
  return lastDays(14).map((d) => counts[d] || 0)
})
const recentSaleBars = computed(() =>
  [...db.sales].sort((a, b) => Number(a.id) - Number(b.id)).slice(-8).map((s) => Number(s.amount || 0))
)

function vizFor(s) {
  switch (s.key) {
    case 'leads':
      return { trend: leadsTrend.value, vizSummary: `Oxirgi 14 kundagi leadlar: ${leadsTrend.value.join(', ')}` }
    case 'revenue':
      return { trend: dashboard.salesSeries.points || [], vizSummary: 'Oxirgi 30 kunlik savdo dinamikasi' }
    case 'avg':
      return { bars: recentSaleBars.value, vizSummary: "So'nggi savdolar summalari" }
    case 'tours': {
      const ratio = shareOf(s.delta)
      return ratio === undefined ? {} : { ratio, vizCaption: 'jami turlardan' }
    }
    case 'clients': {
      const ratio = shareOf(s.delta)
      return ratio === undefined ? {} : { ratio, vizCaption: 'jami mijozlardan' }
    }
    default:
      return {}
  }
}

const stats = computed(() => dashboard.stats.map((s) => ({ ...s, label: fixLeadText(s.label), ...vizFor(s) })))
const leadSources = computed(() => dashboard.leadSources)
const salesSeries = computed(() => dashboard.salesSeries)
const topDirections = computed(() => dashboard.topDirections)
const recentLeads = computed(() => dashboard.recentLeads)
const bookings = computed(() => dashboard.bookings)

const scopeNote = computed(() => ({
  all: 'Barcha jamoa statistikasi',
  team: 'Sizning jamoangiz statistikasi',
  own: 'Sizga biriktirilgan ma\'lumotlar'
}[dashboard.scope] || ''))

const sourceDot = {
  Telegram: 'bg-blue-500',
  Instagram: 'bg-pink-500',
  Sayt: 'bg-slate-700',
  "Qo'ng'iroq": 'bg-amber-500'
}
</script>

<template>
  <div class="space-y-5">
    <!-- Ish vaqti (Check in / Check out) -->
    <AttendanceCard />

    <p v-if="scopeNote" class="flex items-center gap-1.5 text-xs text-slate-500">
      <AppIcon name="filter" class="h-3.5 w-3.5" /> {{ scopeNote }} · {{ roleLabel }}
    </p>

    <!-- Statistik kartalar -->
    <div class="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard v-for="s in stats" :key="s.key" v-bind="s" />
    </div>

    <!-- Grafiklar -->
    <div class="stagger grid grid-cols-1 gap-5 lg:grid-cols-3">
      <PanelCard title="Leadlar manbalari">
        <template #action>
          <button class="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600">
            Bugun <AppIcon name="chevron" class="h-4 w-4" />
          </button>
        </template>
        <DonutChart :data="leadSources" />
      </PanelCard>

      <PanelCard title="Sotuvlar dinamikasi">
        <template #action>
          <button class="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600">
            Bu oy <AppIcon name="chevron" class="h-4 w-4" />
          </button>
        </template>
        <AreaChart :points="salesSeries.points" :labels="salesSeries.labels" />
      </PanelCard>

      <PanelCard title="Top yo'nalishlar">
        <ul class="divide-y divide-slate-100">
          <li v-if="!topDirections.length" class="py-8 text-center text-sm text-slate-400">Hozircha yo'nalish yo'q</li>
          <li v-for="d in topDirections" :key="d.name" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span class="grid h-9 w-9 place-items-center rounded-lg bg-sky-50 text-sky-600">
              <AppIcon name="globe" class="h-5 w-5" />
            </span>
            <span class="text-sm font-medium text-slate-800">{{ d.name }}</span>
            <span class="ml-auto text-sm font-semibold text-slate-900">{{ d.amount }}</span>
          </li>
        </ul>
      </PanelCard>
    </div>

    <!-- Ro'yxatlar -->
    <div class="stagger grid grid-cols-1 gap-5 lg:grid-cols-3">
      <PanelCard title="So'nggi leadlar">
        <template #action>
          <router-link to="/ledlar" class="text-sm font-medium text-blue-600 hover:underline">Barchasi</router-link>
        </template>
        <ul class="divide-y divide-slate-100">
          <li v-if="!recentLeads.length" class="py-8 text-center text-sm text-slate-400">Hozircha lead yo'q</li>
          <li v-for="l in recentLeads" :key="l.name" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span class="h-9 w-9 shrink-0 rounded-full" :class="sourceDot[l.source]" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-slate-800">{{ l.name }}</span>
              <span class="block text-xs text-slate-400">{{ l.source }}</span>
            </span>
            <span class="ml-auto shrink-0 text-right">
              <span class="block text-xs text-slate-500">{{ l.date }}</span>
              <span class="block text-xs text-slate-400">{{ l.time }}</span>
            </span>
          </li>
        </ul>
      </PanelCard>

      <PanelCard title="So'nggi vazifalar">
        <template #action>
          <span class="text-sm font-medium text-blue-600">Barchasi</span>
        </template>
        <ul class="divide-y divide-slate-100">
          <li v-if="!db.tasks.length" class="py-8 text-center text-sm text-slate-400">Vazifa yo'q</li>
          <li v-for="t in db.tasks.slice(0, 5)" :key="t.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <button class="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition"
                    :class="t.done ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 hover:border-blue-400'"
                    :aria-label="t.title" @click="tasksApi.toggle(t.id)">
              <span v-if="t.done" class="h-1.5 w-1.5 rounded-full bg-white" />
            </button>
            <span class="min-w-0 truncate text-sm" :class="t.done ? 'text-slate-400 line-through' : 'text-slate-700'">
              {{ t.title }}
            </span>
            <span class="ml-auto shrink-0 text-xs text-slate-400">{{ t.time }}</span>
          </li>
        </ul>
        <button class="mt-4 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
          <AppIcon name="plus" class="h-4 w-4" /> Yangi vazifa qo'shish
        </button>
      </PanelCard>

      <PanelCard title="So'nggi bronlar">
        <template #action>
          <span class="text-sm font-medium text-blue-600">Barchasi</span>
        </template>
        <ul class="divide-y divide-slate-100">
          <li v-if="!bookings.length" class="py-8 text-center text-sm text-slate-400">Bron yo'q</li>
          <li v-for="b in bookings" :key="b.name" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600">
              <AppIcon name="globe" class="h-5 w-5" />
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-slate-800">{{ b.name }}</span>
              <span class="block text-xs text-slate-400">{{ b.direction }}</span>
            </span>
            <span class="ml-auto flex shrink-0 items-center gap-3">
              <StatusBadge :status="b.status" />
              <span class="text-sm font-semibold text-slate-900">{{ b.amount }}</span>
            </span>
          </li>
        </ul>
      </PanelCard>
    </div>
  </div>
</template>