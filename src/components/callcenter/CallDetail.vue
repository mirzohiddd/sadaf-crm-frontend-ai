<script setup>
import { ref, computed, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import CallAudio from './CallAudio.vue'
import CallTranscript from './CallTranscript.vue'
import CallAnalysis from './CallAnalysis.vue'
import { callsApi } from '@/api'
import { callCenter, isSuperAdmin } from '@/store'
import { fmtDuration, STEP_STATUS } from './callFormat.js'

const props = defineProps({
  callId: { type: Number, required: true },
  // Yangi qo'ng'iroq oqimida tayyor obyekt uzatiladi (qayta so'rov shart emas)
  initial: { type: Object, default: null }
})
const emit = defineEmits(['deleted', 'changed'])

const call = ref(props.initial)
const loading = ref(false)
const error = ref('')
const busy = ref('') // transcribe | analyze | swap | delete
const view = ref('analysis') // analysis | transcript

async function load() {
  loading.value = !call.value
  error.value = ''
  try {
    call.value = await callsApi.get(props.callId)
  } catch (err) {
    error.value = err?.message || "Qo'ng'iroqni yuklab bo'lmadi."
  } finally {
    loading.value = false
  }
}

watch(() => props.callId, () => { call.value = props.initial?.id === props.callId ? props.initial : null; load() }, { immediate: true })
watch(() => callCenter.version, () => { if (!busy.value) load() })

const canModify = computed(() => !!call.value?.canModify)

async function run(kind) {
  busy.value = kind
  error.value = ''
  try {
    if (kind === 'transcribe') call.value = await callsApi.transcribe(props.callId)
    if (kind === 'analyze') call.value = await callsApi.analyze(props.callId)
    if (kind === 'swap') call.value = await callsApi.swapRoles(props.callId)
    view.value = kind === 'analyze' ? 'analysis' : view.value
    emit('changed', call.value)
  } catch (err) {
    error.value = err?.message || 'Xatolik yuz berdi.'
    await load() // FAILED statusi va xato matni bazadan
  } finally {
    busy.value = ''
  }
}

async function remove() {
  if (!window.confirm("Qo'ng'iroq, uning audiosi, transcripti va AI analizi butunlay o'chiriladi. Davom etasizmi?")) return
  busy.value = 'delete'
  try {
    await callsApi.remove(props.callId)
    emit('deleted', props.callId)
  } catch (err) {
    error.value = err?.message || "O'chirib bo'lmadi."
  } finally {
    busy.value = ''
  }
}

const steps = computed(() => {
  const c = call.value
  if (!c) return []
  return [
    { key: 'recording', label: 'Audio', status: c.recording ? 'done' : 'pending' },
    { key: 'transcript', label: 'Transcript', status: c.transcriptStatus, error: c.transcriptError },
    { key: 'analysis', label: 'AI analiz', status: c.analysisStatus, error: c.analysisError }
  ]
})
</script>

<template>
  <div v-if="loading" class="grid h-48 place-items-center text-sm text-slate-400">Yuklanmoqda...</div>
  <div v-else-if="!call" class="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ error }}</div>

  <div v-else class="space-y-4">
    <!-- Sarlavha -->
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-lg font-semibold text-slate-900">{{ call.leadName || 'Nomsiz lead' }}</h3>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>Lead #{{ call.leadId }}</span>
          <span>{{ call.leadPhone }}</span>
          <span>{{ call.date }} {{ call.time }}</span>
          <span class="tabular-nums">{{ fmtDuration(call.duration) }}</span>
          <span>Menejer: {{ call.managerName }}</span>
          <StatusBadge v-if="call.leadStage" :status="call.leadStage" />
        </p>
      </div>
      <button v-if="isSuperAdmin || (canModify && !call.recording)" type="button"
              class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              title="O'chirish" :disabled="!!busy" @click="remove">
        <AppIcon name="trash" class="h-4 w-4" />
      </button>
    </div>

    <CallAudio :call-id="call.id" :available="!!call.recording" />

    <!-- Statuslar + qayta urinish -->
    <div class="grid gap-2 sm:grid-cols-3">
      <div v-for="s in steps" :key="s.key" class="rounded-xl border border-slate-200 px-3 py-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-slate-600">{{ s.label }}</span>
          <span class="badge" :class="STEP_STATUS[s.status]?.cls">{{ STEP_STATUS[s.status]?.label || s.status }}</span>
        </div>
        <p v-if="s.status === 'failed' && s.error" class="mt-1.5 text-xs text-rose-600">{{ s.error }}</p>
      </div>
    </div>

    <div v-if="canModify && call.recording" class="flex flex-wrap gap-2">
      <button v-if="call.transcriptStatus !== 'done'" type="button"
              class="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              :disabled="!!busy" @click="run('transcribe')">
        📝 {{ busy === 'transcribe' ? 'Transcript tayyorlanmoqda...' : (call.transcriptStatus === 'failed' ? "Transcriptni qayta urinish" : 'Transcript tayyorlash') }}
      </button>
      <button v-if="call.transcriptStatus === 'done'" type="button"
              class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              :disabled="!!busy" @click="run('analyze')">
        🤖 {{ busy === 'analyze' ? 'AI analiz qilinmoqda...'
          : call.analysisStatus === 'failed' ? 'AI analizni qayta urinish'
          : call.analysisStatus === 'done' ? 'Qayta analiz qilish' : 'AI analiz qilish' }}
      </button>
    </div>

    <p v-if="error" class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ error }}</p>

    <!-- Transcript / Analiz -->
    <div class="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
      <button v-for="t in [{ k: 'analysis', l: '🤖 AI Analysis' }, { k: 'transcript', l: '📝 Transcript' }]" :key="t.k"
              type="button" class="flex-1 rounded-lg px-3 py-1.5 transition"
              :class="view === t.k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
              @click="view = t.k">{{ t.l }}</button>
    </div>

    <CallAnalysis v-if="view === 'analysis'" :analysis="call.analysis" :outdated="call.analysisOutdated" />
    <CallTranscript v-else :transcript="call.transcript" :can-modify="canModify" :busy="!!busy" @swap="run('swap')" />
  </div>
</template>
