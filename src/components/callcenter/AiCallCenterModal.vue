<script setup>
// AI CALL CENTER — navbardagi "AI Call Center" tugmasi va lead panelidagi
// "📞 Call" tugmasi ochadigan katta modal. AppLayout ichida bir marta
// joylashtiriladi, holati store'dagi `callCenter` orqali boshqariladi.
//
// Tablar:
//   new       — Yangi qo'ng'iroq (lead → recording → processing → transcript → AI → arxiv)
//   archive   — Qo'ng'iroqlar arxivi
//   stats     — AI Center statistikasi
//   assistant — mavjud "AI yordamchi" chat (o'zgarishsiz saqlangan)
import { computed, watch, onBeforeUnmount } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AiAssistantPanel from '@/components/AiAssistantPanel.vue'
import NewCallFlow from './NewCallFlow.vue'
import CallArchive from './CallArchive.vue'
import CallStats from './CallStats.vue'
import { callCenter, closeCallCenter, isSuperAdmin } from '@/store'

const TABS = [
  { key: 'new', label: "Yangi qo'ng'iroq", icon: 'mic' },
  { key: 'archive', label: 'Arxiv', icon: 'layers' },
  { key: 'stats', label: 'Statistika', icon: 'chart' },
  { key: 'assistant', label: 'AI yordamchi', icon: 'bot' }
]

const scopeText = computed(() =>
  isSuperAdmin.value
    ? "Bosh menejer: barcha menejerlarning qo'ng'iroqlari va analizlari"
    : "Faqat sizga biriktirilgan leadlar va o'z qo'ng'iroqlaringiz"
)

function requestClose() {
  if (callCenter.recording &&
      !window.confirm("Saqlanmagan qo'ng'iroq yozuvi bor. Oyna yopilsa audio yo'qoladi. Baribir yopilsinmi?")) {
    return
  }
  closeCallCenter()
}

function openArchive({ leadId = null, callId = null, managerId = null } = {}) {
  callCenter.archiveLeadId = leadId
  callCenter.archiveManagerId = managerId
  callCenter.callId = callId
  callCenter.tab = 'archive'
}

// Capture bosqichida ushlanadi va tarqalishi to'xtatiladi — aks holda Esc
// ostidagi sahifani ham yopardi (masalan Ledlar sahifasidagi lead paneli).
function onKey(e) {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  requestClose()
}

watch(() => callCenter.open, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  open ? window.addEventListener('keydown', onKey, true) : window.removeEventListener('keydown', onKey, true)
}, { immediate: true })

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <Teleport to="body">
    <transition name="modal">
      <div v-if="callCenter.open"
           class="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
           role="dialog" aria-modal="true" aria-labelledby="ai-call-center-title"
           @click.self="requestClose">
        <div class="modal-panel flex h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[90vh] sm:max-w-6xl sm:rounded-2xl">
          <!-- Sarlavha -->
          <header class="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-6">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
              <AppIcon name="bot" class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 id="ai-call-center-title" class="text-base font-semibold text-slate-900 sm:text-lg">🤖 AI Call Center</h2>
              <p class="truncate text-xs text-slate-500">{{ scopeText }}</p>
            </div>
            <span v-if="callCenter.recording"
                  class="hidden items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 sm:inline-flex">
              <span class="h-2 w-2 rounded-full bg-rose-500" /> Saqlanmagan yozuv
            </span>
            <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Yopish" @click="requestClose">
              <AppIcon name="close" class="h-5 w-5" />
            </button>
          </header>

          <!-- Tablar -->
          <nav class="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 px-3 sm:px-5" role="tablist">
            <button v-for="t in TABS" :key="t.key" type="button" role="tab"
                    :aria-selected="callCenter.tab === t.key"
                    class="-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition"
                    :class="callCenter.tab === t.key
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'"
                    @click="callCenter.tab = t.key">
              <AppIcon :name="t.icon" class="h-4 w-4" />
              {{ t.label }}
            </button>
          </nav>

          <!-- Kontent -->
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
               :class="callCenter.tab === 'archive' ? 'lg:overflow-hidden' : ''">
            <!-- v-show: yozuv paytida boshqa tabga o'tilsa ham recorder to'xtamaydi -->
            <NewCallFlow v-show="callCenter.tab === 'new'"
                         :preset-lead-id="callCenter.leadId"
                         @open-archive="openArchive" />

            <CallArchive v-if="callCenter.tab === 'archive'"
                         :lead-id="callCenter.archiveLeadId"
                         :manager-id="callCenter.archiveManagerId"
                         :call-id="callCenter.callId" />

            <CallStats v-else-if="callCenter.tab === 'stats'"
                       @open-manager="(id) => openArchive({ managerId: id })" />

            <div v-else-if="callCenter.tab === 'assistant'"
                 class="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200">
              <AiAssistantPanel />
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>
