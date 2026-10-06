<script setup>
import AppIcon from '@/components/AppIcon.vue'
import { fmtDuration } from './callFormat.js'

defineProps({
  transcript: { type: Object, default: null },
  canModify: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
})
defineEmits(['swap'])

const METHOD = { ai: 'Rollar AI orqali aniqlangan', heuristic: 'Rollar taxminiy aniqlangan', manual: "Rollar qo'lda tuzatilgan", single: 'Bitta ovoz' }
</script>

<template>
  <div v-if="!transcript" class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
    Transcript hali tayyor emas.
  </div>
  <div v-else>
    <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span>{{ METHOD[transcript.roleMethod] || '' }}</span>
      <span v-if="transcript.language" class="badge bg-slate-100 text-slate-600">{{ transcript.language }}</span>
      <button v-if="canModify && Object.keys(transcript.roleMap || {}).length > 1" type="button"
              class="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              :disabled="busy" title="ADMIN va MIJOZ noto'g'ri aniqlangan bo'lsa"
              @click="$emit('swap')">
        <AppIcon name="swap" class="h-3.5 w-3.5" /> ADMIN ⇄ MIJOZ
      </button>
    </div>

    <p v-if="transcript.warning" class="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
      {{ transcript.warning }}
    </p>

    <ol class="space-y-2.5">
      <li v-for="(s, i) in transcript.segments" :key="i" class="flex gap-3">
        <span class="w-[60px] shrink-0 pt-0.5 text-[11px] font-bold tracking-wide"
              :class="s.role === 'ADMIN' ? 'text-blue-700' : 'text-emerald-700'">
          {{ s.role }}:
        </span>
        <p class="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm leading-relaxed"
           :class="s.role === 'ADMIN' ? 'bg-blue-50/70 text-slate-800' : 'bg-emerald-50/70 text-slate-800'">
          {{ s.text }}
          <span class="mt-0.5 block text-[10px] text-slate-400">{{ fmtDuration(s.start) }}</span>
        </p>
      </li>
    </ol>
  </div>
</template>
