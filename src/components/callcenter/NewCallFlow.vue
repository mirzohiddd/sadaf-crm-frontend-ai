<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import CallDetail from './CallDetail.vue'
import { callsApi } from '@/api'
import { db, callCenter } from '@/store'
import { WavRecorder } from '@/utils/wavRecorder.js'
import { fmtDuration, digits } from './callFormat.js'

const props = defineProps({ presetLeadId: { type: Number, default: null } })
const emit = defineEmits(['open-archive'])

const cfg = ref({ stt: true, analysis: true, maxUploadMb: 100 })
onMounted(async () => {
  try { cfg.value = await callsApi.config() } catch { /* standart qiymatlar qoladi */ }
})

// ——— 1. Lead tanlash ———
// db.leads backendda allaqachon foydalanuvchi doirasiga qisqartirilgan:
// menejer bu yerda faqat o'ziga biriktirilgan leadlarni ko'radi.
const phase = ref('select') // select | recording | processing | result
const query = ref('')
const selectedId = ref(props.presetLeadId)
const consent = ref(false)
const error = ref('')
const starting = ref(false)

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  const qd = digits(q)
  const rows = db.leads.filter((l) =>
    !q || String(l.name || '').toLowerCase().includes(q) || (qd && digits(l.phone).includes(qd))
  )
  return rows.slice(0, 8)
})
const lead = computed(() => db.leads.find((l) => l.id === selectedId.value) || null)
const platformOf = (l) => l?.platform || l?.source || '—'

watch(() => props.presetLeadId, (id) => {
  if (phase.value === 'select' && id) { selectedId.value = id; consent.value = false; error.value = '' }
})

// ——— 2. Recording ———
let rec = null
let ticker = null
const call = ref(null)
const elapsed = ref(0)
const paused = ref(false)
const micOk = ref(true)
const silentFor = ref(0)
const levels = reactive(Array(32).fill(0))
let lastLevel = 0

function onLevel(v) { lastLevel = v }

async function startCall() {
  if (!lead.value || !consent.value || starting.value) return
  error.value = ''
  starting.value = true
  rec = new WavRecorder({ onLevel, onEnded: () => stopRecording('Mikrofon uzildi — yozuv avtomatik yakunlandi.') })
  try {
    await rec.start()
  } catch (err) {
    error.value = err?.message || "Mikrofonni ishga tushirib bo'lmadi."
    rec = null
    starting.value = false
    return
  }
  try {
    call.value = await callsApi.create(lead.value.id, true)
  } catch (err) {
    await rec.cancel()
    rec = null
    error.value = err?.message || "Qo'ng'iroqni yaratib bo'lmadi."
    starting.value = false
    return
  }
  starting.value = false
  paused.value = false
  elapsed.value = 0
  silentFor.value = 0
  phase.value = 'recording'
  callCenter.recording = true
  ticker = setInterval(() => {
    if (!rec) return
    elapsed.value = rec.duration
    micOk.value = rec.micActive
    levels.shift()
    levels.push(paused.value ? 0 : lastLevel)
    silentFor.value = !paused.value && lastLevel < 0.02 ? silentFor.value + 0.25 : 0
  }, 250)
}

function togglePause() {
  if (!rec) return
  paused.value = !paused.value
  paused.value ? rec.pause() : rec.resume()
}

const notice = ref('')
let pendingAudio = null // yuklanmaguncha brauzer xotirasida saqlanadi — yo'qolmaydi

async function stopRecording(reason = '') {
  if (!rec) return
  clearInterval(ticker)
  const current = rec
  rec = null
  const { blob, duration } = await current.stop()
  // callCenter.recording = "saqlanmagan audio bor" — audio serverga
  // yuklanmaguncha true qoladi (modal yopilishidan himoya).
  notice.value = reason
  if (duration < 1) {
    await callsApi.remove(call.value.id).catch(() => {})
    reset()
    error.value = "Yozuv juda qisqa (1 soniyadan kam). Qaytadan urinib ko'ring."
    return
  }
  pendingAudio = { blob, duration }
  phase.value = 'processing'
  await runPipeline()
}

async function cancelRecording() {
  if (!window.confirm("Yozuv bekor qilinsinmi? Audio saqlanmaydi.")) return
  clearInterval(ticker)
  const current = rec
  rec = null
  await current?.cancel()
  callCenter.recording = false
  if (call.value) await callsApi.remove(call.value.id).catch(() => {})
  reset()
}

// ——— 3–5. Processing: upload → transcript → AI analiz ———
const steps = reactive({
  upload: { state: 'idle', error: '' },
  transcript: { state: 'idle', error: '' },
  analysis: { state: 'idle', error: '' }
})

async function step(name, fn) {
  steps[name].state = 'working'
  steps[name].error = ''
  try {
    await fn()
    steps[name].state = 'done'
    return true
  } catch (err) {
    steps[name].state = 'failed'
    steps[name].error = err?.message || 'Xatolik yuz berdi.'
    return false
  }
}

async function runPipeline() {
  if (!call.value?.recording) {
    const ok = await step('upload', async () => {
      call.value = await callsApi.uploadRecording(call.value.id, pendingAudio.blob, pendingAudio.duration)
    })
    if (!ok) return // audio brauzerda saqlanib turadi: qayta yuklash yoki faylni yuklab olish mumkin
    pendingAudio = null
    callCenter.recording = false
  }
  if (!cfg.value.stt) {
    steps.transcript.state = 'skipped'
    steps.transcript.error = 'Speech-to-text sozlanmagan (backend .env: GROQ_API_KEY). Audio arxivga saqlandi.'
    phase.value = 'result'
    return
  }
  if (call.value.transcriptStatus !== 'done') {
    const ok = await step('transcript', async () => { call.value = await callsApi.transcribe(call.value.id) })
    if (!ok) { phase.value = 'result'; return }
  } else {
    steps.transcript.state = 'done'
  }
  if (!cfg.value.analysis) {
    steps.analysis.state = 'skipped'
    steps.analysis.error = 'AI analiz sozlanmagan (backend .env: GROQ_API_KEY). Transcript saqlandi.'
    phase.value = 'result'
    return
  }
  await step('analysis', async () => { call.value = await callsApi.analyze(call.value.id) })
  phase.value = 'result'
}

function retryUpload() { runPipeline() }

// Natija ekranida (CallDetail) qayta urinish muvaffaqiyatli bo'lsa —
// stepper va banner ham yangi holatni ko'rsatsin.
function syncFromCall(c) {
  call.value = c
  for (const [key, field] of [['transcript', 'transcriptStatus'], ['analysis', 'analysisStatus']]) {
    if (c?.[field] === 'done') { steps[key].state = 'done'; steps[key].error = '' }
    if (c?.[field] === 'failed') { steps[key].state = 'failed'; steps[key].error = c[field.replace('Status', 'Error')] || steps[key].error }
  }
}

function downloadLocal() {
  if (!pendingAudio) return
  const url = URL.createObjectURL(pendingAudio.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sadaf-call-${call.value?.id || 'yozuv'}.wav`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ——— 6. Arxiv / qayta boshlash ———
function reset() {
  callCenter.recording = false
  phase.value = 'select'
  call.value = null
  consent.value = false
  pendingAudio = null
  notice.value = ''
  Object.values(steps).forEach((s) => { s.state = 'idle'; s.error = '' })
  levels.fill(0)
}

function newCall() {
  reset()
  error.value = ''
}

// Stepper: 1 Lead → 2 Recording → 3 Processing → 4 Transcript → 5 AI Analysis → 6 Archive
const STEPS = ['Lead tanlash', 'Recording', 'Processing', 'Transcript', 'AI Analysis', 'Archive']
const activeStep = computed(() => {
  if (phase.value === 'select') return 0
  if (phase.value === 'recording') return 1
  if (phase.value === 'processing') {
    if (steps.analysis.state === 'working') return 4
    if (steps.transcript.state === 'working') return 3
    return 2
  }
  return 5
})
const analysisComplete = computed(() => steps.analysis.state === 'done')

// Har bir stepper bandining holati: active | done | failed | skipped | todo.
// Xato bo'lgan bosqich yashil ✓ emas, qizil ✗ bo'lib ko'rinishi kerak.
const STEP_KEYS = { 2: 'upload', 3: 'transcript', 4: 'analysis' }
function stepState(i) {
  const key = STEP_KEYS[i]
  if (key && steps[key].state === 'failed') return 'failed'
  if (key && steps[key].state === 'skipped') return 'skipped'
  if (i === activeStep.value) return 'active'
  return i < activeStep.value ? 'done' : 'todo'
}
const STEP_STYLE = {
  active: { li: 'bg-blue-50 font-semibold text-blue-700', dot: 'bg-blue-600 text-white' },
  done: { li: 'text-emerald-700', dot: 'bg-emerald-500 text-white' },
  failed: { li: 'bg-rose-50 font-semibold text-rose-700', dot: 'bg-rose-500 text-white' },
  skipped: { li: 'text-amber-700', dot: 'bg-amber-400 text-white' },
  todo: { li: 'text-slate-400', dot: 'bg-slate-200 text-slate-500' }
}
const STEP_SIGN = { done: '✓', failed: '✗', skipped: '—' }

const PROCESS_ROWS = [
  { key: 'upload', icon: '🎙', working: 'Audio processing...', done: 'Audio CRM ga saqlandi' },
  { key: 'transcript', icon: '📝', working: 'Transcript tayyorlanmoqda...', done: 'Transcript tayyor' },
  { key: 'analysis', icon: '🤖', working: 'AI analiz qilinmoqda...', done: 'Analysis complete' }
]

// Yozuv yoki yuklanmagan audio bor paytda sahifani tasodifan yopishdan himoya
function beforeUnload(e) {
  if (rec || pendingAudio) { e.preventDefault(); e.returnValue = '' }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(async () => {
  window.removeEventListener('beforeunload', beforeUnload)
  clearInterval(ticker)
  if (rec) { await rec.stop().catch(() => {}); callCenter.recording = false }
})
</script>

<template>
  <div class="space-y-5">
    <!-- Stepper -->
    <ol class="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <li v-for="(label, i) in STEPS" :key="label" class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
          :class="STEP_STYLE[stepState(i)].li">
        <span class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
              :class="STEP_STYLE[stepState(i)].dot">
          {{ STEP_SIGN[stepState(i)] || i + 1 }}
        </span>
        <span class="truncate">{{ label }}</span>
      </li>
    </ol>

    <p v-if="error" class="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ error }}</p>

    <!-- 1. LEAD TANLASH -->
    <div v-if="phase === 'select'" class="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <section>
        <div class="relative">
          <AppIcon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input v-model="query" type="search" class="field pl-9" placeholder="Lead qidirish: ism yoki telefon" />
        </div>
        <ul class="mt-3 max-h-[46vh] space-y-1.5 overflow-y-auto">
          <li v-for="l in matches" :key="l.id">
            <button type="button" class="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
                    :class="selectedId === l.id ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'"
                    @click="selectedId = l.id; consent = false">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-slate-900">{{ l.name || 'Nomsiz lead' }}</span>
                <span class="block text-xs text-slate-500">#{{ l.id }} · {{ l.phone || '—' }}</span>
              </span>
              <StatusBadge :status="l.stage" />
            </button>
          </li>
          <li v-if="!matches.length" class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
            Sizga biriktirilgan lead topilmadi.
          </li>
        </ul>
      </section>

      <section class="rounded-2xl border border-slate-200 p-5">
        <template v-if="lead">
          <p class="text-xs text-slate-400">Lead #{{ lead.id }}</p>
          <h3 class="mt-0.5 text-xl font-semibold text-slate-900">{{ lead.name || 'Nomsiz lead' }}</h3>
          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt class="text-xs text-slate-500">Telefon</dt>
              <dd class="font-medium text-slate-800"><a :href="`tel:+${digits(lead.phone)}`" class="hover:text-blue-600">{{ lead.phone || '—' }}</a></dd></div>
            <div><dt class="text-xs text-slate-500">Platforma</dt><dd class="font-medium text-slate-800">{{ platformOf(lead) }}</dd></div>
            <div><dt class="text-xs text-slate-500">Lead statusi</dt><dd><StatusBadge :status="lead.stage" /></dd></div>
            <div><dt class="text-xs text-slate-500">Mas'ul menejer</dt><dd class="font-medium text-slate-800">{{ lead.manager || '—' }}</dd></div>
          </dl>

          <div class="mt-5 space-y-2 rounded-xl bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600">
            <p>
              Brauzer faqat <b>kompyuter mikrofonini</b> yozadi — bu telefon liniyasining o'zini yozish emas.
              Mijoz ovozi ham yozilishi uchun telefonni karnay (speaker) rejimida mikrofonga yaqin qo'ying.
            </p>
            <label class="flex cursor-pointer items-start gap-2.5 text-slate-800">
              <input v-model="consent" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
              <span>Mijozga suhbat yozib olinishi va sifat nazorati uchun tahlil qilinishi aytildi, u rozi bo'ldi.</span>
            </label>
          </div>

          <button type="button"
                  class="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!consent || starting" @click="startCall">
            🎙 {{ starting ? 'Mikrofon ulanmoqda...' : "Qo'ng'iroqni boshlash" }}
          </button>
          <p v-if="!consent" class="mt-2 text-center text-[11px] text-slate-400">Boshlash uchun rozilikni tasdiqlang.</p>
        </template>
        <div v-else class="grid h-full min-h-[200px] place-items-center text-center text-sm text-slate-400">
          Chap tomondan lead tanlang.
        </div>
      </section>
    </div>

    <!-- 2. RECORDING -->
    <div v-else-if="phase === 'recording'" class="mx-auto max-w-2xl">
      <div class="rounded-2xl bg-navy-800 p-6 text-white shadow-xl sm:p-8">
        <div class="flex items-center justify-between gap-3">
          <span class="inline-flex items-center gap-2 text-sm font-bold tracking-wider"
                :class="paused ? 'text-amber-300' : 'text-rose-400'">
            <span class="relative flex h-3 w-3">
              <span v-if="!paused" class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75 motion-reduce:hidden" />
              <span class="relative inline-flex h-3 w-3 rounded-full" :class="paused ? 'bg-amber-300' : 'bg-rose-500'" />
            </span>
            {{ paused ? 'PAUSE' : 'RECORDING' }}
          </span>
          <span class="truncate text-sm text-white/70">{{ call?.leadName }} · {{ call?.leadPhone }}</span>
        </div>

        <p class="mt-6 text-center text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl">{{ fmtDuration(elapsed) }}</p>

        <div class="mt-6 flex h-14 items-end justify-center gap-[3px]" aria-hidden="true">
          <span v-for="(v, i) in levels" :key="i" class="w-1.5 rounded-full transition-[height] duration-200"
                :class="paused ? 'bg-white/20' : v > 0.6 ? 'bg-rose-400' : 'bg-white/70'"
                :style="{ height: `${Math.max(6, v * 100)}%` }" />
        </div>

        <dl class="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-xl bg-white/5 px-4 py-3">
            <dt class="text-xs text-white/50">Mikrofon</dt>
            <dd class="mt-0.5 font-medium" :class="micOk ? 'text-emerald-300' : 'text-rose-300'">
              {{ micOk ? (silentFor > 8 ? 'Ulangan, ovoz eshitilmayapti' : 'Faol') : 'Uzilgan' }}
            </dd>
          </div>
          <div class="rounded-xl bg-white/5 px-4 py-3">
            <dt class="text-xs text-white/50">Yozuv holati</dt>
            <dd class="mt-0.5 font-medium">{{ paused ? "To'xtatib turilgan" : 'Yozilmoqda' }}</dd>
          </div>
        </dl>

        <div class="mt-6 grid grid-cols-2 gap-3">
          <button type="button" class="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm font-semibold hover:bg-white/15"
                  @click="togglePause">
            <AppIcon :name="paused ? 'play' : 'pause'" class="h-4 w-4" /> {{ paused ? 'Davom ettirish' : 'Pauza' }}
          </button>
          <button type="button" class="flex items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-semibold hover:bg-rose-500"
                  @click="stopRecording()">
            <AppIcon name="stop" class="h-4 w-4" /> Yakunlash
          </button>
        </div>
      </div>
      <button type="button" class="mx-auto mt-3 block text-xs text-slate-400 hover:text-rose-600" @click="cancelRecording">
        Yozuvni bekor qilish
      </button>
    </div>

    <!-- 3. PROCESSING -->
    <div v-else-if="phase === 'processing'" class="mx-auto max-w-xl space-y-3">
      <p v-if="notice" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{{ notice }}</p>
      <div v-for="row in PROCESS_ROWS" :key="row.key"
           class="flex items-start gap-3 rounded-xl border px-4 py-3.5"
           :class="steps[row.key].state === 'failed' ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'">
        <span class="text-lg leading-none">{{ row.icon }}</span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium"
             :class="steps[row.key].state === 'idle' ? 'text-slate-400' : steps[row.key].state === 'failed' ? 'text-rose-700' : 'text-slate-800'">
            {{ steps[row.key].state === 'done' ? row.done : row.working }}
          </p>
          <p v-if="steps[row.key].error" class="mt-1 text-xs text-rose-600">{{ steps[row.key].error }}</p>
        </div>
        <span v-if="steps[row.key].state === 'working'" class="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <span v-else-if="steps[row.key].state === 'done'" class="text-sm font-bold text-emerald-600">✓</span>
      </div>
      <div v-if="steps.upload.state === 'failed'" class="flex flex-wrap gap-2 pt-1">
        <button type="button" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" @click="retryUpload">
          Qayta yuklash
        </button>
        <button type="button" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" @click="downloadLocal">
          Audioni kompyuterga saqlash
        </button>
        <p class="w-full text-xs text-slate-500">Audio brauzer xotirasida turibdi — oynani yopmang.</p>
      </div>
    </div>

    <!-- 4–6. NATIJA (transcript + analiz, arxivga saqlangan) -->
    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
           :class="analysisComplete ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'">
        <p class="flex-1 text-sm font-semibold">
          {{ analysisComplete ? '✅ Analysis complete — qo\'ng\'iroq lead arxiviga saqlandi.'
            : 'Qo\'ng\'iroq audiosi arxivga saqlandi. ' + (steps.transcript.error || steps.analysis.error || '') }}
        </p>
        <button type="button" class="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                @click="emit('open-archive', { leadId: call?.leadId, callId: call?.id })">
          Lead arxivini ochish
        </button>
        <button type="button" class="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800" @click="newCall">
          Yangi qo'ng'iroq
        </button>
      </div>
      <CallDetail v-if="call" :call-id="call.id" :initial="call" @changed="syncFromCall" />
    </div>
  </div>
</template>
