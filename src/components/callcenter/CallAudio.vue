<script setup>
// Audio himoyalangan endpointdan (Authorization header bilan) Blob qilib
// olinadi — <audio src="/api/..."> to'g'ridan-to'g'ri ishlatilmaydi, chunki
// token URL ga qo'yilmasligi kerak.
import { ref, watch, onBeforeUnmount } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { callsApi } from '@/api'

const props = defineProps({
  callId: { type: Number, required: true },
  available: { type: Boolean, default: false },
  autoload: { type: Boolean, default: false }
})

const url = ref('')
const loading = ref(false)
const error = ref('')
// Faqat foydalanuvchi o'zi bosganda avtomatik ijro etiladi
const userRequested = ref(false)

function revoke() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}

async function load() {
  if (!props.available || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const blob = await callsApi.recordingBlob(props.callId)
    revoke()
    url.value = URL.createObjectURL(blob)
  } catch (err) {
    error.value = err?.message || "Audio yuklanmadi."
  } finally {
    loading.value = false
  }
}

watch(() => [props.callId, props.available], () => {
  revoke()
  userRequested.value = false
  if (props.autoload) load()
}, { immediate: true })

onBeforeUnmount(revoke)
</script>

<template>
  <div>
    <p v-if="!available" class="text-xs text-slate-400">Audio saqlanmagan.</p>
    <audio v-else-if="url" :src="url" controls :autoplay="userRequested" class="h-10 w-full" />
    <button v-else type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            :disabled="loading" @click="userRequested = true; load()">
      <AppIcon name="play" class="h-4 w-4 text-blue-600" />
      {{ loading ? 'Yuklanmoqda...' : 'Audioni tinglash' }}
    </button>
    <p v-if="error" class="mt-1.5 text-xs text-rose-600">{{ error }}</p>
  </div>
</template>
