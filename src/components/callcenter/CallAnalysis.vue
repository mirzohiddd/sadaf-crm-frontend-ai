<script setup>
import { computed } from 'vue'
import { RATING_TONE, scoreTone } from './callFormat.js'

const props = defineProps({
  analysis: { type: Object, default: null },
  outdated: { type: Boolean, default: false }
})

const r = computed(() => props.analysis?.result || null)

const MARK = {
  pass: { sign: '✓', cls: 'bg-emerald-500 text-white', title: 'Bajarilgan' },
  fail: { sign: '✗', cls: 'bg-rose-500 text-white', title: 'Bajarilmagan' },
  na: { sign: '—', cls: 'bg-slate-200 text-slate-500', title: "Bu suhbatda kerak bo'lmagan" }
}

const leadRows = computed(() => {
  const l = r.value?.lead
  if (!l) return []
  return [
    ['Nimaga qiziqmoqda', l.interest],
    ['Asosiy ehtiyoj', l.mainNeed],
    ['Asosiy muammo', l.mainProblem],
    ['Budjet', l.budget],
    ['Safar sanasi', l.travelDate],
    ['Sotuv imkoniyati', `${l.salesOpportunity?.label || '—'}${l.salesOpportunityReason ? ' — ' + l.salesOpportunityReason : ''}`],
    ['Keyingi qadam', l.nextStep]
  ]
})
</script>

<template>
  <div v-if="!r" class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
    AI analiz hali tayyor emas.
  </div>

  <div v-else class="space-y-4">
    <p v-if="outdated" class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Transcript analizdan keyin o'zgargan. Natija eskirgan bo'lishi mumkin — analizni qayta ishga tushiring.
    </p>

    <!-- Umumiy xulosa -->
    <div class="flex items-start gap-4 rounded-xl border border-slate-200 p-4">
      <div class="text-center">
        <p class="text-3xl font-bold leading-none tabular-nums" :class="scoreTone(r.score)">{{ r.score }}</p>
        <p class="mt-1 text-[11px] text-slate-400">/ 100</p>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap gap-1.5">
          <span class="badge ring-1" :class="RATING_TONE[r.rating.key]">Umumiy: {{ r.rating.label }}</span>
          <span class="badge ring-1" :class="RATING_TONE[r.communication.rating.key]">Muloqot sifati: {{ r.communication.rating.label }}</span>
          <span class="badge ring-1" :class="RATING_TONE[r.sales.rating.key]">Sotuv: {{ r.sales.rating.label }}</span>
        </div>
        <p class="mt-2 text-sm leading-relaxed text-slate-700">{{ r.summary }}</p>
      </div>
    </div>

    <!-- Checklistlar -->
    <div class="grid gap-4 lg:grid-cols-2">
      <section v-for="block in [{ title: 'Muloqot (Communication)', data: r.communication }, { title: 'Sotuv (Sales)', data: r.sales }]"
               :key="block.title" class="rounded-xl border border-slate-200">
        <h4 class="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">{{ block.title }}</h4>
        <ul class="divide-y divide-slate-100">
          <li v-for="item in block.data.items" :key="item.key" class="flex gap-3 px-4 py-2.5">
            <span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  :class="MARK[item.status].cls" :title="MARK[item.status].title">{{ MARK[item.status].sign }}</span>
            <span class="min-w-0">
              <span class="block text-sm font-medium text-slate-800">{{ item.label }}</span>
              <span v-if="item.comment" class="block text-xs text-slate-500">{{ item.comment }}</span>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <!-- Muammolar va tavsiyalar -->
    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
        <h4 class="text-sm font-semibold text-rose-800">Aniqlangan muammolar ({{ r.problems.length }})</h4>
        <ul v-if="r.problems.length" class="mt-2 space-y-1.5">
          <li v-for="(p, i) in r.problems" :key="i" class="flex gap-2 text-sm text-slate-700">
            <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />{{ p }}
          </li>
        </ul>
        <p v-else class="mt-2 text-sm text-slate-500">Muammo aniqlanmadi.</p>
      </section>
      <section class="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
        <h4 class="text-sm font-semibold text-emerald-800">AI tavsiyasi</h4>
        <ul v-if="r.recommendations.length" class="mt-2 space-y-1.5">
          <li v-for="(p, i) in r.recommendations" :key="i" class="flex gap-2 text-sm text-slate-700">
            <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{{ p }}
          </li>
        </ul>
        <p v-else class="mt-2 text-sm text-slate-500">Qo'shimcha tavsiya yo'q.</p>
      </section>
    </div>

    <section v-if="r.inappropriatePhrases.length" class="rounded-xl border border-rose-200 p-4">
      <h4 class="text-sm font-semibold text-rose-800">Nomaqbul / qo'pol iboralar</h4>
      <ul class="mt-2 space-y-1">
        <li v-for="(p, i) in r.inappropriatePhrases" :key="i" class="text-sm italic text-slate-700">"{{ p }}"</li>
      </ul>
    </section>

    <!-- Lead tahlili -->
    <section class="rounded-xl border border-slate-200">
      <h4 class="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">Lead bo'yicha xulosa</h4>
      <dl class="divide-y divide-slate-100">
        <div v-for="[label, value] in leadRows" :key="label" class="grid grid-cols-[150px_1fr] gap-3 px-4 py-2 text-sm">
          <dt class="text-slate-500">{{ label }}</dt>
          <dd class="text-slate-800">{{ value || '—' }}</dd>
        </div>
        <div class="grid grid-cols-[150px_1fr] gap-3 px-4 py-2 text-sm">
          <dt class="text-slate-500">Follow-up</dt>
          <dd :class="r.followUp.agreed ? 'text-emerald-700' : 'text-rose-600'">
            {{ r.followUp.agreed ? `Kelishilgan${r.followUp.when ? ': ' + r.followUp.when : ''}` : 'Belgilanmagan' }}
          </dd>
        </div>
      </dl>
    </section>

    <p class="text-[11px] text-slate-400">
      AI tahlili avtomatik — yakuniy qarorni menejer qabul qiladi. Model: {{ analysis.model }}
    </p>
  </div>
</template>
