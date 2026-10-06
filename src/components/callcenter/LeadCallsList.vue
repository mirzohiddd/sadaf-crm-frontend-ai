<script setup>
// Lead detail panelidagi "📞 Qo'ng'iroqlar" bo'limi: shu leadning BARCHA
// qo'ng'iroqlari (har biri alohida yozuv), eng yangisi birinchi.
// Ro'yxat backendda ruxsat bo'yicha filtrlanadi (GET /api/leads/{id}/calls).
import { ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import CallAudio from './CallAudio.vue'
import { callsApi } from '@/api'
import { callCenter, openCallCenter } from '@/store'
import { fmtDuration, scoreTone } from './callFormat.js'

const props = defineProps({ leadId: { type: Number, required: true } })

const rows = ref([])
const loading = ref(false)
const error = ref('')
const playing = ref(null)

async function load() {
  loading.value = !rows.value.length
  error.value = ''
  try {
    rows.value = await callsApi.forLead(props.leadId)
  } catch (err) {
    error.value = err?.message || "Qo'ng'iroqlarni yuklab bo'lmadi."
  } finally {
    loading.value = false
  }
}

watch(() => props.leadId, () => { rows.value = []; playing.value = null; load() }, { immediate: true })
watch(() => callCenter.version, load)

const openDetail = (r) => openCallCenter({ tab: 'archive', archiveLeadId: props.leadId, callId: r.id })

function aiLabel(r) {
  if (r.analysisStatus === 'done') return `AI ${r.analysisSummary?.score ?? ''}`
  if (r.analysisStatus === 'failed') return 'AI: FAILED'
  if (r.analysisStatus === 'processing') return 'AI: jarayonda'
  return r.recording ? 'AI: PENDING' : 'AI: —'
}
</script>

<template>
  <div>
    <p v-if="loading" class="text-xs text-slate-400">Yuklanmoqda...</p>
    <p v-else-if="error" class="text-xs text-rose-600">{{ error }}</p>
    <p v-else-if="!rows.length" class="text-xs text-slate-400">Bu lead bilan hali qo'ng'iroq yozilmagan.</p>

    <ul v-else class="space-y-2">
      <li v-for="r in rows" :key="r.id" class="rounded-xl border border-slate-200 bg-white">
        <button type="button" class="block w-full px-3 py-2.5 text-left hover:bg-slate-50" @click="openDetail(r)">
          <span class="flex items-center gap-2 text-[12px] font-medium text-slate-800">
            <span class="flex-1">{{ r.date }} {{ r.time }}</span>
            <span class="tabular-nums text-slate-500">{{ fmtDuration(r.duration) }}</span>
          </span>
          <span class="mt-0.5 block truncate text-[11px] text-slate-500">Menejer: {{ r.managerName || '—' }}</span>
          <span class="mt-1.5 flex flex-wrap gap-1">
            <span class="badge" :class="r.recording ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'">Audio</span>
            <span class="badge"
                  :class="{ done: 'bg-emerald-50 text-emerald-700', failed: 'bg-rose-50 text-rose-700' }[r.transcriptStatus] || 'bg-slate-100 text-slate-500'">
              Transcript
            </span>
            <span class="badge"
                  :class="r.analysisStatus === 'done' ? 'bg-blue-50 ' + scoreTone(r.analysisSummary?.score)
                    : r.analysisStatus === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'">
              {{ aiLabel(r) }}
            </span>
            <span v-if="r.analysisSummary?.problems" class="badge bg-rose-50 text-rose-700">
              {{ r.analysisSummary.problems }} muammo
            </span>
          </span>
        </button>
        <div v-if="r.recording" class="border-t border-slate-100 px-3 py-2">
          <CallAudio v-if="playing === r.id" :call-id="r.id" :available="true" autoload />
          <button v-else type="button" class="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 hover:text-blue-700"
                  @click="playing = r.id">
            <AppIcon name="play" class="h-3 w-3" /> Audioni tinglash
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
