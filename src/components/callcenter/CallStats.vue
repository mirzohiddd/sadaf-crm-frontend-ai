<script setup>
import { ref, watch } from 'vue'
import MetricTile from '@/components/MetricTile.vue'
import { callsApi } from '@/api'
import { callCenter } from '@/store'
import { fmtDateTime, scoreTone } from './callFormat.js'
import { roleLabelOf } from '@/data/mock.js'

const emit = defineEmits(['open-manager'])

const data = ref(null)
const error = ref('')

async function load() {
  error.value = ''
  try {
    data.value = await callsApi.stats()
  } catch (err) {
    error.value = err?.message || "Statistikani yuklab bo'lmadi."
  }
}
watch(() => callCenter.version, load, { immediate: true })
</script>

<template>
  <div class="space-y-5">
    <p v-if="error" class="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ error }}</p>
    <div v-if="!data && !error" class="py-12 text-center text-sm text-slate-400">Yuklanmoqda...</div>

    <template v-if="data">
      <div v-if="!data.config.stt || !data.config.analysis" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {{ !data.config.stt ? 'Speech-to-text o\'chiq (backend .env da GROQ_API_KEY yo\'q).' : '' }}
        {{ !data.config.analysis ? 'AI analiz o\'chiq (backend .env da GROQ_API_KEY yo\'q).' : '' }}
        Recording ishlayveradi, transcript/analizni keyin arxivdan ishga tushirish mumkin.
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile :label="`Bugungi qo'ng'iroqlar`" :value="data.totals.todayCalls" unit="ta" icon="phone" color="blue" />
        <MetricTile label="Yozib olingan" :value="data.totals.recorded" unit="ta" icon="mic" color="violet" />
        <MetricTile label="Tahlil qilingan" :value="data.totals.analyzed" unit="ta" icon="check-circle" color="green" />
        <MetricTile label="Tahlil kutilmoqda" :value="data.totals.pendingAnalysis" unit="ta" icon="clock" color="amber" />
        <MetricTile label="Topilgan muammolar" :value="data.totals.problemsFound" unit="ta" icon="x-circle" color="rose" />
      </div>

      <section class="card overflow-hidden">
        <header class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 class="text-sm font-semibold text-slate-900">
            {{ data.scope === 'all' ? 'Menejerlar kesimida' : 'Mening natijalarim' }}
          </h3>
          <span class="text-xs text-slate-400">Jami: {{ data.totals.calls }} ta qo'ng'iroq</span>
        </header>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-sm">
            <thead>
              <tr class="bg-slate-50/70 text-left text-xs text-slate-500">
                <th class="px-5 py-2.5 font-medium">Menejer</th>
                <th class="px-3 py-2.5 text-right font-medium">Qo'ng'iroqlar</th>
                <th class="px-3 py-2.5 text-right font-medium">Tahlil qilingan</th>
                <th class="px-3 py-2.5 text-right font-medium">O'rtacha ball</th>
                <th class="px-3 py-2.5 text-right font-medium">Muammolar</th>
                <th class="px-3 py-2.5 text-right font-medium">Follow-ups</th>
                <th class="px-5 py-2.5 font-medium">Oxirgi faollik</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in data.managers" :key="m.managerId"
                  class="border-t border-slate-100"
                  :class="data.scope === 'all' ? 'cursor-pointer hover:bg-slate-50' : ''"
                  @click="data.scope === 'all' && emit('open-manager', m.managerId)">
                <td class="px-5 py-3">
                  <span class="font-medium text-slate-900">{{ m.name }}</span>
                  <span class="ml-1.5 text-xs text-slate-400">{{ roleLabelOf(m.role) }}</span>
                </td>
                <td class="px-3 py-3 text-right tabular-nums">{{ m.calls }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ m.analyzed }}</td>
                <td class="px-3 py-3 text-right font-semibold tabular-nums" :class="m.avgScore != null ? scoreTone(m.avgScore) : 'text-slate-300'">
                  {{ m.avgScore ?? '—' }}
                </td>
                <td class="px-3 py-3 text-right tabular-nums" :class="m.problemsFound ? 'text-rose-600' : ''">{{ m.problemsFound }}</td>
                <td class="px-3 py-3 text-right tabular-nums">
                  <span class="text-emerald-700">{{ m.followUps }} ✓</span>
                  <span class="text-slate-300"> / </span>
                  <span class="text-rose-600">{{ m.missedFollowUps }} ✗</span>
                </td>
                <td class="px-5 py-3 text-slate-600">{{ fmtDateTime(m.lastActivity) }}</td>
              </tr>
              <tr v-if="!data.managers.length">
                <td colspan="7" class="px-5 py-8 text-center text-slate-400">Hali qo'ng'iroqlar yo'q.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
