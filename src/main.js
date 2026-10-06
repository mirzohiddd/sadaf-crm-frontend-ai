import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { loadAll } from '@/store'
import { tokenStore } from '@/api'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
import flagFontUrl from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url'

// Windows (Chrome/Edge) davlat bayroqlari emojisini ko'rsatmaydi — "TR" kabi harflar
// chiqadi. Faqat shunday brauzerda bayroq shrifti ulanadi (fayl bundle ichidan,
// tashqi CDN'siz). Boshqa qurilmalarda hech narsa o'zgarmaydi.
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFontUrl)

// Sahifa yangilanganda token bo'lsa ma'lumotlarni oldindan yuklaymiz —
// shunda birinchi ekran bo'sh ko'rinmaydi. Xato bo'lsa router guard hal qiladi.
async function bootstrap() {
  if (tokenStore.get()) {
    try {
      await loadAll()
    } catch {
      // jim o'tamiz — guard login sahifasiga yo'naltiradi
    }
  }
  createApp(App).use(router).mount('#app')
}

bootstrap()