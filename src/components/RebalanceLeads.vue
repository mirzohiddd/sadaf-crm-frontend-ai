<script setup>
// "Leadlarni taqsimlash" — barcha leadlarni faol menejerlar orasida round-robin
// bo'yicha qayta taqsimlaydi (POST /api/leads/rebalance, faqat Bosh menejer).
//
// 1) Tugma bosilganda avval dryRun so'rovi — hech narsa saqlanmaydi, faqat
//    haqiqiy sonlar (jami leadlar, kimga nechta) tasdiqlash oynasida ko'rsatiladi.
// 2) Tasdiqlansa — haqiqiy so'rov; natija shu oynada ko'rsatiladi.
// Token va xatolarni mavjud API klient (@/api) boshqaradi. Leadlar ro'yxati
// WebSocket orqali avtomatik yangilanadi.
import { ref, computed } from 'vue'
import ModalDialog from './ModalDialog.vue'
import ToolbarButton from './ToolbarButton.vue'
import UserAvatar from './UserAvatar.vue'
import AppIcon from './AppIcon.vue'
import { leadsApi } from '@/api'
import { roleLabelOf } from '@/data/mock.js'

const open = ref(false)
const step = ref('preview') // preview | done
const loading = ref(false)
const error = ref('')
const result = ref(null)

const max = computed(() => Math.max(1, ...(result.value?.managers || []).map((m) => m.leads)))
const title = computed(() => (step.value === 'done' ? 'Leadlar taqsimlandi' : 'Leadlarni taqsimlash'))
const submitLabel = computed(() => {
  if (step.value === 'done') return 'Yopish'
  return loading.value ? 'Bajarilmoqda…' : 'Taqsimlash'
})

async function load(dryRun) {
  loading.value = true
  error.value = ''
  try {
    result.value = await leadsApi.rebalance(dryRun)
    if (!dryRun) step.value = 'done'
  } catch (err) {
    error.value = err?.message || "Taqsimlab bo'lmadi. Qayta urinib ko'ring."
  } finally {
    loading.value = false
  }
}

function start() {
  open.value = true
  step.value = 'preview'
  result.value = null
  load(true)
}

function submit() {
  if (step.value === 'done') return close()
  if (loading.value || !result.value) return
  load(false)
}

function close() {
  if (loading.value && step.value === 'preview' && result.value) return // saqlash davomida yopilmaydi
  open.value = false
}
</script>

<template>
  <ToolbarButton icon="swap" @click="start">Leadlarni taqsimlash</ToolbarButton>

  <ModalDialog :open="open" :title="title" :submit-label="submitLabel"
               :submit-disabled="loading || (!result && step === 'preview')"
               @close="close" @submit="submit">
    <p v-if="loading && !result" class="py-6 text-center text-sm text-slate-500">Hisoblanmoqda…</p>

    <div v-else-if="error && !result" class="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ error }}</div>

    <div v-else-if="result" class="space-y-4">
      <div class="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
           :class="step === 'done' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'">
        <AppIcon :name="step === 'done' ? 'check-circle' : 'swap'" class="mt-0.5 h-4 w-4 shrink-0" />
        <p v-if="step === 'done'">
          Jami <b>{{ result.total }}</b> ta lead {{ result.managers.length }} ta menejerga taqsimlandi
          ({{ result.changed }} ta leadning menejeri o'zgardi).
        </p>
        <p v-else>
          <b>{{ result.total }}</b> ta lead faol menejerlar orasida round-robin bo'yicha taqsimlanadi.
          <span class="block text-xs opacity-80">
            {{ result.changed }} ta leadning menejeri o'zgaradi. Leadning boshqa ma'lumotlari o'zgarmaydi.
          </span>
        </p>
      </div>

      <ul class="space-y-2" :aria-label="step === 'done' ? 'Taqsimot natijasi' : 'Taqsimot rejasi'">
        <li v-for="m in result.managers" :key="m.id" class="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <UserAvatar :name="m.name" size="sm" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-slate-900">{{ m.name }}</p>
            <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div class="h-full rounded-full bg-blue-500" :style="{ width: (m.leads / max) * 100 + '%' }" />
            </div>
          </div>
          <div class="w-24 shrink-0 text-right">
            <p class="text-sm font-semibold tabular-nums text-slate-900">{{ m.leads }} ta</p>
            <p class="text-xs text-slate-400">{{ roleLabelOf(m.role) }}</p>
          </div>
        </li>
      </ul>

      <p v-if="result.nextManager" class="text-xs text-slate-500">
        Keyingi yangi lead: <span class="font-medium text-slate-700">{{ result.nextManager.name }}</span>
      </p>
      <p v-if="error" class="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ error }}</p>
    </div>
  </ModalDialog>
</template>
