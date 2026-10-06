<script setup>
import { ref, computed, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import CallDetail from './CallDetail.vue'
import { callsApi } from '@/api'
import { callCenter, isSuperAdmin, db } from '@/store'
import { fmtDuration, scoreTone } from './callFormat.js'

const props = defineProps({
  leadId: { type: Number, default: null },
  managerId: { type: Number, default: null },
  callId: { type: Number, default: null }
})

const rows = ref([])
const loading = ref(false)
const error = ref('')
const q = ref('')
const status = ref('')
const manager = ref(props.managerId)
const leadFilter = ref(props.leadId)
const selected = ref(props.callId)

watch(() => [props.leadId, props.managerId, props.callId], ([l, m, c]) => {
  leadFilter.value = l
  manager.value = m
  if (c) selected.value = c
})

// Bosh menejer uchun menejer filtri: hodimlar ro'yxati (u faqat Bosh
// menejerga to'liq keladi) + arxivda uchragan ismlar
const managers = computed(() => {
  const map = new Map()
  db.employees.forEach((e) => map.set(e.id, e.name))
  rows.value.forEach((r) => { if (!map.has(r.managerId)) map.set(r.managerId, r.managerName) })
  return [...map.entries()].map(([id, name]) => ({ id, name }))
})

const leadName = computed(() => {
  if (!leadFilter.value) return ''
  return db.leads.find((l) => l.id === leadFilter.value)?.name || rows.value[0]?.leadName || `#${leadFilter.value}`
})

async function load() {
  loading.value = !rows.value.length
  error.value = ''
  try {
    rows.value = await callsApi.list({
      leadId: leadFilter.value || undefined,
      // Backend bu parametrni faqat Bosh menejer uchun hisobga oladi
      managerId: isSuperAdmin.value && manager.value ? manager.value : undefined,
      status: status.value || undefined,
      q: q.value.trim() || undefined,
      limit: 300
    })
    if (!selected.value && rows.value.length) selected.value = rows.value[0].id
  } catch (err) {
    error.value = err?.message || "Arxivni yuklab bo'lmadi."
  } finally {
    loading.value = false
  }
}

let debounce = null
watch([leadFilter, manager, status], load, { immediate: true })
watch(q, () => { clearTimeout(debounce); debounce = setTimeout(load, 300) })
watch(() => callCenter.version, load)

function onDeleted(id) {
  rows.value = rows.value.filter((r) => r.id !== id)
  selected.value = rows.value[0]?.id || null
}

const STATUS_FILTERS = [
  { v: '', l: 'Barchasi' },
  { v: 'analyzed', l: 'Tahlil qilingan' },
  { v: 'pending_analysis', l: 'Tahlil kutilmoqda' },
  { v: 'problems', l: 'Muammoli' }
]
</script>

<template>
  <div class="grid min-h-0 gap-4 lg:h-full lg:grid-cols-[340px_1fr]">
    <!-- Ro'yxat -->
    <section class="flex min-h-0 flex-col gap-3">
      <div v-if="leadFilter" class="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <span class="min-w-0 flex-1 truncate">Lead arxivi: <b>{{ leadName }}</b></span>
        <button type="button" class="rounded p-0.5 hover:bg-blue-100" aria-label="Filtrni olib tashlash" @click="leadFilter = null">
          <AppIcon name="close" class="h-4 w-4" />
        </button>
      </div>
      <div class="relative">
        <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input v-model="q" type="search" class="field py-2.5 pl-9" placeholder="Lead, telefon yoki menejer" />
      </div>
      <div class="flex gap-2">
        <select v-model="status" class="field py-2 text-sm">
          <option v-for="s in STATUS_FILTERS" :key="s.v" :value="s.v">{{ s.l }}</option>
        </select>
        <select v-if="isSuperAdmin" v-model="manager" class="field py-2 text-sm">
          <option :value="null">Barcha menejerlar</option>
          <option v-for="m in managers" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </div>

      <p v-if="error" class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</p>

      <ul class="min-h-0 flex-1 space-y-1.5 overflow-y-auto lg:pr-1">
        <li v-if="loading" class="py-8 text-center text-sm text-slate-400">Yuklanmoqda...</li>
        <li v-else-if="!rows.length" class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
          Qo'ng'iroqlar topilmadi.
        </li>
        <li v-for="r in rows" :key="r.id">
          <button type="button" class="w-full rounded-xl border px-3 py-2.5 text-left transition"
                  :class="selected === r.id ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'"
                  @click="selected = r.id">
            <span class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{{ r.leadName || 'Nomsiz lead' }}</span>
              <span v-if="r.analysisSummary" class="text-sm font-bold tabular-nums" :class="scoreTone(r.analysisSummary.score)">
                {{ r.analysisSummary.score }}
              </span>
            </span>
            <span class="mt-0.5 block text-xs text-slate-500">
              {{ r.date }} {{ r.time }} · {{ fmtDuration(r.duration) }}<template v-if="isSuperAdmin"> · {{ r.managerName }}</template>
            </span>
            <span class="mt-1.5 flex flex-wrap gap-1">
              <span class="badge" :class="r.recording ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'">Audio</span>
              <span class="badge" :class="{ done: 'bg-emerald-50 text-emerald-700', failed: 'bg-rose-50 text-rose-700' }[r.transcriptStatus] || 'bg-slate-100 text-slate-500'">Transcript</span>
              <span class="badge" :class="{ done: 'bg-emerald-50 text-emerald-700', failed: 'bg-rose-50 text-rose-700' }[r.analysisStatus] || 'bg-slate-100 text-slate-500'">
                AI{{ r.analysisStatus === 'failed' ? ': FAILED' : r.recording && r.analysisStatus !== 'done' ? ': PENDING' : '' }}
              </span>
              <span v-if="r.analysisSummary?.problems" class="badge bg-rose-50 text-rose-700">{{ r.analysisSummary.problems }} muammo</span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <!-- Tafsilot -->
    <section class="min-h-0 overflow-y-auto rounded-2xl border border-slate-200 p-4 sm:p-5">
      <CallDetail v-if="selected" :key="selected" :call-id="selected" @deleted="onDeleted" @changed="load" />
      <div v-else class="grid h-full min-h-[200px] place-items-center text-sm text-slate-400">Qo'ng'iroqni tanlang.</div>
    </section>
  </div>
</template>
