<script setup>
import { ref, computed, onMounted } from 'vue'
import PanelCard from '@/components/PanelCard.vue'
import AppIcon from '@/components/AppIcon.vue'
import {
  appearance, saveAppearance, resetAppearance,
  pickWallpaper, presetColors, presetWallpapers,
  presetVideos, activeVideo, hasMediaBackground, videoState,
  pickVideo, setVideoEnabled, nextVideo, findVideo, loadVideoManifest
} from '@/store'

const customColor = ref(appearance.color)
const showCustom = ref(false)
const uploadError = ref('')

const isActiveColor = (c) => appearance.mode === 'color' && appearance.color.toLowerCase() === c.toLowerCase()
const isActiveImage = (url) => appearance.mode === 'image' && appearance.image === url

// Rang tanlansa aksent ham shu rangga o'tadi
const pickColor = (c) => saveAppearance({ mode: 'color', color: c.value, accent: c.accent })

function applyCustomColor() {
  saveAppearance({ mode: 'color', color: customColor.value, accent: customColor.value })
  showCustom.value = false
}

function onUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    uploadError.value = 'Faqat rasm fayli tanlang.'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    uploadError.value = 'Rasm hajmi 5MB dan oshmasin.'
    return
  }
  uploadError.value = ''

  const reader = new FileReader()
  reader.onload = () => saveAppearance({ mode: 'image', image: String(reader.result) })
  reader.readAsDataURL(file)
}

const isImage = computed(() => appearance.mode === 'image' && !!appearance.image)

// ——— Video fon ———
const videoCategories = computed(() => ['Barchasi', ...new Set(presetVideos.map((v) => v.category))])
const videoCategory = ref('Barchasi')
const shownVideos = computed(() => videoCategory.value === 'Barchasi'
  ? presetVideos
  : presetVideos.filter((v) => v.category === videoCategory.value))

const selectedVideo = computed(() => findVideo(appearance.video))
const isActiveVideo = (v) => appearance.videoEnabled && appearance.video === v.id

// Kartaga sichqoncha olib borilganda qisqa jonli preview (faqat sichqonchali qurilmada,
// kichik 360p fayl bilan). Telefonda — faqat poster, trafik sarflanmaydi.
const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
const hovered = ref('')

const statusText = computed(() => {
  if (!appearance.videoEnabled) return "Video fon o'chirilgan"
  switch (videoState.status) {
    case 'playing': return videoState.source === 'local' ? "O'ynamoqda (loyiha ichidagi fayl)" : "O'ynamoqda (Mixkit serveridan)"
    case 'loading': return 'Yuklanmoqda…'
    case 'poster': return videoState.reason === 'save-data'
      ? "Trafikni tejash yoqilgan — faqat rasm ko'rsatilmoqda"
      : "Qurilmada \"harakatni kamaytirish\" yoqilgan — faqat rasm ko'rsatilmoqda"
    case 'error': return videoState.reason || 'Video yuklanmadi — rasm ko\'rsatilmoqda'
    default: return ''
  }
})
// Lokal nusxalar (npm run videos:fetch) bo'lsa — kartalar va preview ular bilan ishlaydi
const localVideos = ref({})
onMounted(async () => { localVideos.value = await loadVideoManifest() })
const posterOf = (v) => (localVideos.value[v.id]?.poster ? `/videos/${v.id}.jpg` : v.poster)
// Preview kichik: avval lokal 480p, so'ng Mixkit 360p, oxirida 720p
const previewSources = (v) => [
  ...(localVideos.value[v.id] ? [`/videos/${v.id}-480.mp4`, `/videos/${v.id}.mp4`] : []),
  v.srcMobile, v.src
].filter(Boolean)

// Poster yuklanmasa (internet yo'q) — singan rasm o'rniga rangli fon qoladi
const brokenPosters = ref(new Set())
const onPosterError = (id) => { brokenPosters.value = new Set([...brokenPosters.value, id]) }

const statusTone = computed(() => ({
  playing: 'bg-emerald-500', loading: 'bg-amber-400', error: 'bg-rose-500', poster: 'bg-slate-400'
}[videoState.status] || 'bg-slate-300'))
</script>

<template>
  <PanelCard title="Orqa fon">
    <template #action>
      <button class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
              @click="resetAppearance()">Standart holatga qaytarish</button>
    </template>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
      <!-- Chap: ranglar, rasmlar -->
      <div>
        <p class="mb-2.5 text-sm font-semibold text-slate-700">Mavjud ranglar</p>
        <div class="flex flex-wrap items-center gap-2">
          <button v-for="c in presetColors" :key="c.value"
                  class="h-8 w-8 rounded-lg border border-slate-200 transition hover:scale-110"
                  :class="isActiveColor(c.value) ? 'ring-2 ring-offset-2' : ''"
                  :style="{ background: c.value, ...(isActiveColor(c.value) ? { '--tw-ring-color': 'var(--accent)' } : {}) }"
                  :title="c.name" :aria-label="c.name"
                  @click="pickColor(c)" />

          <button class="grid h-8 w-8 place-items-center rounded-lg border border-slate-300 text-slate-500 transition hover:bg-slate-50"
                  aria-label="O'z rangim" @click="showCustom = !showCustom">
            <AppIcon name="plus" class="h-4 w-4" />
          </button>
        </div>

        <div v-if="showCustom" class="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
          <input v-model="customColor" type="color" aria-label="O'z rangim"
                 class="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" />
          <span class="text-sm text-slate-600">{{ customColor }}</span>
          <button class="btn-accent ml-auto !px-3 !py-1 !text-xs" @click="applyCustomColor">Qo'llash</button>
        </div>

        <!-- Rasmlar galereyasi -->
        <div class="mb-2.5 mt-6 flex items-center justify-between">
          <p class="text-sm font-semibold text-slate-700">Fon rasmlari</p>
          <span class="text-xs text-slate-400">Rasm tanlansa interfeys rangi ham moslashadi</span>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <button v-for="w in presetWallpapers" :key="w.id"
                  class="group relative aspect-video overflow-hidden rounded-xl border-2 transition"
                  :class="isActiveImage(w.url) ? 'scale-[1.02]' : 'border-transparent hover:border-slate-300'"
                  :style="isActiveImage(w.url) ? { borderColor: w.accent, boxShadow: `0 0 0 3px ${w.accent}33` } : null"
                  :title="w.label" @click="pickWallpaper(w)">
            <img :src="w.thumb || w.url" :alt="w.label" loading="lazy" decoding="async"
                 sizes="(min-width: 1024px) 20vw, 45vw"
                 class="h-full w-full object-cover transition duration-300 group-hover:scale-110" />

            <span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-left text-[11px] font-medium text-white">
              {{ w.label }}
            </span>

            <span v-if="isActiveImage(w.url)"
                  class="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white">
              <AppIcon name="check-circle" class="h-3.5 w-3.5" :style="{ color: w.accent }" />
            </span>
          </button>
        </div>

        <!-- Video fon -->
        <div class="mt-8 rounded-2xl border border-slate-200 p-4">
          <div class="flex flex-wrap items-center gap-3">
            <div class="w-full min-w-0 sm:w-auto sm:flex-1">
              <p class="text-sm font-semibold text-slate-700">Video fon</p>
              <p class="text-xs text-slate-400">Ovozsiz, uzluksiz takrorlanadi. Mobilda yengil versiya ishlatiladi.</p>
            </div>
            <button type="button" role="switch" :aria-checked="appearance.videoEnabled"
                    aria-label="Video fonni yoqish yoki o'chirish"
                    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                    :style="{ background: appearance.videoEnabled ? 'var(--accent)' : '#cbd5e1' }"
                    @click="setVideoEnabled(!appearance.videoEnabled)">
              <span class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
                    :class="appearance.videoEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'" />
            </button>
            <button type="button"
                    class="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
                    title="Keyingi videoga almashtirish" @click="nextVideo()">
              <AppIcon name="refresh" class="h-4 w-4" /> Keyingi video
            </button>
          </div>

          <p v-if="statusText" class="mt-3 flex items-center gap-2 text-xs text-slate-500" role="status">
            <span class="h-2 w-2 shrink-0 rounded-full" :class="appearance.videoEnabled ? statusTone : 'bg-slate-300'" />
            {{ statusText }}
          </p>

          <!-- Toifalar -->
          <div class="mt-4 flex flex-wrap gap-2">
            <button v-for="c in videoCategories" :key="c" type="button"
                    class="rounded-full border px-3 py-1 text-xs font-medium transition"
                    :class="videoCategory === c ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
                    :style="videoCategory === c ? { background: 'var(--accent)' } : null"
                    @click="videoCategory = c">{{ c }}</button>
          </div>

          <!-- Videolar -->
          <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <button v-for="v in shownVideos" :key="v.id" type="button"
                    class="group relative aspect-video overflow-hidden rounded-xl border-2 text-left transition"
                    :class="isActiveVideo(v) ? 'scale-[1.02]' : 'border-transparent hover:border-slate-300'"
                    :style="{ background: `linear-gradient(135deg, ${v.accent}, #0f172a)`,
                              ...(isActiveVideo(v) ? { borderColor: v.accent, boxShadow: `0 0 0 3px ${v.accent}33` } : {}) }"
                    :title="v.description" :aria-pressed="isActiveVideo(v)"
                    @click="pickVideo(v)"
                    @mouseenter="canHover && (hovered = v.id)" @mouseleave="hovered = ''"
                    @focus="canHover && (hovered = v.id)" @blur="hovered = ''">
              <img v-if="!brokenPosters.has(v.id)" :src="posterOf(v)" alt="" loading="lazy" decoding="async"
                   class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                   @error="onPosterError(v.id)" />
              <video v-if="hovered === v.id" :key="'h-' + v.id" class="absolute inset-0 h-full w-full object-cover"
                     autoplay muted loop playsinline preload="none">
                <source v-for="src in previewSources(v)" :key="src" :src="src" type="video/mp4" />
              </video>
              <span class="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {{ v.category }}
              </span>
              <span class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-medium text-white">
                <span class="truncate">{{ v.label }}</span>
                <span class="shrink-0 opacity-80">{{ v.duration }}s</span>
              </span>
              <span v-if="isActiveVideo(v)" class="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white">
                <AppIcon name="check-circle" class="h-3.5 w-3.5" :style="{ color: v.accent }" />
              </span>
              <span v-else class="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                <AppIcon name="play" class="h-3 w-3" />
              </span>
            </button>
          </div>

          <p class="mt-3 text-[11px] leading-relaxed text-slate-400">
            Videolar: Mixkit (Mixkit Stock Video Free License). Tezroq ishlashi uchun ularni loyihaga yuklab qo'yish mumkin:
            <code class="rounded bg-slate-100 px-1 py-0.5 text-slate-500">npm run videos:fetch</code>
          </p>
        </div>

        <!-- O'z rasmini yuklash -->
        <p class="mb-2.5 mt-6 text-sm font-semibold text-slate-700">O'z rasmini yuklash</p>
        <label class="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-slate-300 py-7 text-center transition hover:bg-slate-50"
               @mouseenter="null">
          <AppIcon name="upload" class="h-5 w-5 text-slate-400" />
          <span class="text-sm font-medium text-slate-700">Rasm tanlash</span>
          <span class="text-xs text-slate-400">JPG, PNG yoki WEBP. Maks. 5MB</span>
          <input type="file" accept="image/*" class="sr-only" @change="onUpload" />
        </label>
        <p v-if="uploadError" class="mt-2 text-xs text-rose-600">{{ uploadError }}</p>
      </div>

      <!-- O'ng: tanlangan fon -->
      <div>
        <p class="mb-2.5 text-sm font-semibold text-slate-700">Tanlangan fon</p>
        <div class="relative aspect-video overflow-hidden rounded-xl border border-slate-200">
          <video v-if="activeVideo" :key="activeVideo.id + Object.keys(localVideos).length"
                 :poster="posterOf(activeVideo)" class="h-full w-full object-cover"
                 :style="{ background: `linear-gradient(135deg, ${activeVideo.accent}, #0f172a)` }"
                 autoplay muted loop playsinline preload="metadata">
            <source v-for="src in previewSources(activeVideo)" :key="src" :src="src" type="video/mp4" />
          </video>
          <img v-else-if="isImage" :src="appearance.image"
               :srcset="appearance.imageSrcset || null" sizes="320px"
               alt="" decoding="async"
               class="h-full w-full object-cover object-center" />
          <div v-else class="h-full w-full" :style="{ background: appearance.color }" />
          <div v-if="hasMediaBackground && appearance.dim > 0" class="absolute inset-0 bg-white"
               :style="{ opacity: appearance.dim / 100 }" />
        </div>

        <!-- Aksent rang -->
        <div class="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 p-3">
          <span class="h-9 w-9 shrink-0 rounded-lg" style="background: var(--accent)" />
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-700">Interfeys rangi</p>
            <p class="truncate text-xs text-slate-400">Tugma va ikonkalar shu rangda</p>
          </div>
        </div>

        <button class="btn-accent mt-3 w-full">Namuna tugma</button>

        <p v-if="activeVideo" class="mt-2 truncate text-xs text-slate-500">
          <AppIcon name="play" class="mr-1 inline h-3 w-3" />{{ activeVideo.label }} — {{ activeVideo.description }}
        </p>
        <p v-else-if="selectedVideo && !appearance.videoEnabled" class="mt-2 truncate text-xs text-slate-400">
          Tanlangan video: {{ selectedVideo.label }} (o'chirilgan)
        </p>

        <div v-if="appearance.mode === 'image' || hasMediaBackground" class="mt-4 space-y-4">
          <div>
            <label for="dim" class="mb-1.5 flex items-center justify-between text-sm text-slate-700">
              Fonni oqartirish <span class="text-xs text-slate-400">{{ appearance.dim }}%</span>
            </label>
            <input id="dim" type="range" min="0" max="70" class="w-full"
                   style="accent-color: var(--accent)"
                   :value="appearance.dim"
                   @input="saveAppearance({ dim: Number($event.target.value) })" />
            <p class="mt-1 text-xs text-slate-400">0% — rasm/video eng tiniq holatda.</p>
          </div>

          <div>
            <label for="cardSolidity" class="mb-1.5 flex items-center justify-between text-sm text-slate-700">
              Kartalar shaffofligi <span class="text-xs text-slate-400">{{ appearance.cardSolidity ?? 82 }}%</span>
            </label>
            <input id="cardSolidity" type="range" min="50" max="100" class="w-full"
                   style="accent-color: var(--accent)"
                   :value="appearance.cardSolidity ?? 82"
                   @input="saveAppearance({ cardSolidity: Number($event.target.value) })" />
            <p class="mt-1 text-xs text-slate-400">Pasaytirsangiz fon rasmi kartalar ortidan ko'proq ko'rinadi.</p>
          </div>
        </div>
      </div>
    </div>
  </PanelCard>
</template>