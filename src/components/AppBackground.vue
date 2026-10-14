<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { appearance, activeVideo, videoState, loadVideoManifest } from '@/store'

const hasImage = computed(() => appearance.mode === 'image' && !!appearance.image)
const srcset = computed(() => appearance.imageSrcset || null)
const dim = computed(() => Math.max(0, Math.min(90, Number(appearance.dim) || 0)))

// ——— Video fon ———
// Qatlamlar (pastdan yuqoriga): rang/rasm → poster rasm → video → oqartirish.
// Video yuklanmasa yoki o'ynamasa — poster (u ham bo'lmasa rang/rasm) qoladi.

const mq = (q) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null)
const smallScreen = mq('(max-width: 768px)')
const reducedMotion = mq('(prefers-reduced-motion: reduce)')
const saveData = typeof navigator !== 'undefined' && !!navigator.connection?.saveData

const isSmall = ref(!!smallScreen?.matches)
const reduceMotion = ref(!!reducedMotion?.matches)
// Harakatni kamaytirish yoki trafikni tejash yoqilgan bo'lsa — faqat poster
const posterOnly = computed(() => reduceMotion.value || saveData)

const manifest = ref({})
const manifestLoaded = ref(false)
// manifest.json faqat video yoqilganda so'raladi — video o'chiq bo'lsa hech qanday qo'shimcha so'rov yo'q
async function ensureManifest() {
  if (manifestLoaded.value) return
  manifest.value = await loadVideoManifest()
  manifestLoaded.value = true
}
const ready = ref(false) // lazy: sahifa yuklanib bo'lgach video qo'shiladi
const playing = ref(false)
const failed = ref(false)
const videoEl = ref(null)

const local = computed(() => (activeVideo.value ? manifest.value[activeVideo.value.id] || null : null))

// Manbalar tartibi: lokal (kichik ekranda 480p) → Mixkit (kichik ekranda 360p) → Mixkit 720p.
// <source> lardan biri ochilmasa brauzer avtomatik keyingisiga o'tadi.
const sources = computed(() => {
  const v = activeVideo.value
  if (!v) return []
  const list = []
  if (local.value) {
    if (isSmall.value && local.value.mobile) list.push({ src: `/videos/${v.id}-480.mp4`, kind: 'local' })
    list.push({ src: `/videos/${v.id}.mp4`, kind: 'local' })
  }
  if (isSmall.value && v.srcMobile) list.push({ src: v.srcMobile, kind: 'remote' })
  list.push({ src: v.src, kind: 'remote' })
  return list.filter((s, i, a) => a.findIndex((x) => x.src === s.src) === i)
})

const poster = computed(() => {
  const v = activeVideo.value
  if (!v) return ''
  return local.value?.poster ? `/videos/${v.id}.jpg` : v.poster
})

const videoKey = computed(() => sources.value.map((s) => s.src).join('|'))
const showVideo = computed(() =>
  !!activeVideo.value && ready.value && manifestLoaded.value && !posterOnly.value && !failed.value)

function setState(status, extra = {}) {
  Object.assign(videoState, { status, source: '', reason: '', ...extra })
}

watch([activeVideo, posterOnly], ([v]) => {
  playing.value = false
  failed.value = false
  if (v && ready.value) ensureManifest()
  if (!v) setState('idle')
  else if (posterOnly.value) setState('poster', { reason: reduceMotion.value ? 'reduced-motion' : 'save-data' })
  else setState('loading')
}, { immediate: true })

function onPlaying() {
  playing.value = true
  const current = videoEl.value?.currentSrc || ''
  setState('playing', { source: current.startsWith(location.origin) || current.startsWith('/') ? 'local' : 'remote' })
}

// Har bir <source> xatosi: oxirgisi ham ishlamasa — video butunlay o'chadi, poster qoladi
function onSourceError(index) {
  if (index !== sources.value.length - 1) return
  failed.value = true
  playing.value = false
  setState('error', { reason: 'Video yuklanmadi. Internet yoki manzilni tekshiring.' })
}

// Brauzer avtomatik o'ynatishni bloklasa (kam uchraydi, chunki video ovozsiz)
function tryPlay() {
  const el = videoEl.value
  if (!el) return
  el.muted = true
  const p = el.play()
  if (p && typeof p.catch === 'function') p.catch(() => {})
}

// Varaq ko'rinmayotganda video to'xtaydi — CPU va batareya tejaladi
function onVisibility() {
  const el = videoEl.value
  if (!el) return
  if (document.hidden) el.pause()
  else tryPlay()
}

const onSmall = (e) => { isSmall.value = e.matches }
const onMotion = (e) => { reduceMotion.value = e.matches }

let idleHandle = null
function whenIdle(fn) {
  const run = () => {
    if ('requestIdleCallback' in window) idleHandle = window.requestIdleCallback(fn, { timeout: 2500 })
    else idleHandle = setTimeout(fn, 600)
  }
  if (document.readyState === 'complete') run()
  else window.addEventListener('load', run, { once: true })
}

onMounted(() => {
  smallScreen?.addEventListener?.('change', onSmall)
  reducedMotion?.addEventListener?.('change', onMotion)
  document.addEventListener('visibilitychange', onVisibility)
  // Manifest va video CRM'ning asosiy ma'lumotlari yuklanib bo'lgach olinadi
  whenIdle(() => {
    ready.value = true
    if (activeVideo.value) ensureManifest()
  })
})

onBeforeUnmount(() => {
  smallScreen?.removeEventListener?.('change', onSmall)
  reducedMotion?.removeEventListener?.('change', onMotion)
  document.removeEventListener('visibilitychange', onVisibility)
  if (idleHandle && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleHandle)
  else clearTimeout(idleHandle)
})
</script>
<template>
  <div class="app-bg" aria-hidden="true">
    <img
      v-if="hasImage"
      :src="appearance.image"
      :srcset="srcset"
      sizes="100vw"
      alt=""
      decoding="async"
      fetchpriority="high"
      class="app-bg__img"
    />
    <div v-else class="app-bg__solid" :style="{ background: appearance.color }" />

    <!-- Video foni: poster darhol, video esa sahifa yuklangach -->
    <template v-if="activeVideo">
      <img v-if="poster" :key="poster" :src="poster" alt="" decoding="async" fetchpriority="low"
           class="app-bg__img app-bg__layer" />
      <video
        v-if="showVideo"
        :key="videoKey"
        ref="videoEl"
        class="app-bg__img app-bg__layer app-bg__video"
        :class="{ 'is-playing': playing }"
        :poster="poster || undefined"
        autoplay
        muted
        loop
        playsinline
        preload="auto"
        disablepictureinpicture
        disableremoteplayback
        tabindex="-1"
        @playing="onPlaying"
        @loadeddata="tryPlay"
      >
        <source v-for="(s, i) in sources" :key="s.src" :src="s.src" type="video/mp4" @error="onSourceError(i)" />
      </video>
    </template>

    <div v-if="(hasImage || activeVideo) && dim > 0" class="app-bg__overlay" :style="{ opacity: dim / 100 }" />
  </div>
</template>

<style scoped>
.app-bg {
  position: fixed;
  inset: 0;
  z-index: -10;
  overflow: hidden;
}

.app-bg__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.app-bg__layer {
  position: absolute;
  inset: 0;
}
/* Video o'ynay boshlagach silliq paydo bo'ladi — poster bilan "sakrash" bo'lmaydi */
.app-bg__video {
  opacity: 0;
  transition: opacity .8s ease;
  pointer-events: none;
}
.app-bg__video.is-playing {
  opacity: 1;
}
.app-bg__solid {
  width: 100%;
  height: 100%;
}
.app-bg__overlay {
  position: absolute;
  inset: 0;
  background: #ffffff;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .app-bg__video { transition: none; }
}
</style>