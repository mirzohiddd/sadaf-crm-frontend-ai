#!/usr/bin/env node
/**
 * Fon videolarini yuklab olish va siqish (bir marta ishga tushiriladi).
 *
 *   cd frontend
 *   brew install ffmpeg          # bir marta (macOS)
 *   npm run videos:fetch
 *
 * Nima qiladi:
 *   1. src/data/videoBackgrounds.json dagi har bir videoni Mixkit'dan yuklaydi
 *   2. ffmpeg bilan siqadi:  <id>.mp4      — 720p, H.264, ovozsiz, faststart
 *                            <id>-480.mp4  — 480p, mobil qurilmalar uchun
 *                            <id>.jpg      — poster (birinchi kadrlar)
 *   3. public/videos/manifest.json yozadi — CRM shu fayl orqali lokal
 *      nusxalarni topadi. Manifestda yo'q videolar Mixkit'dan o'qiladi.
 *
 * Parametrlar:
 *   --only id1,id2     faqat shu videolar
 *   --force            mavjud fayllarni qayta yaratish
 *   --source <papka>   yuklamasdan, papkadagi <id>.mp4 fayllardan foydalanish
 *                      (masalan, brauzer orqali qo'lda yuklab olingan bo'lsa)
 *   --keep-source      yuklangan asl fayllarni o'chirmaslik (.source/ papkada)
 *
 * Xatolik bo'lsa: sababi ko'rsatiladi, qolgan videolar davom etadi va
 * oxirida xulosa chiqadi. Birorta video muvaffaqiyatsiz bo'lsa — exit code 1.
 */
import { spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'src', 'data', 'videoBackgrounds.json')
const OUT = join(ROOT, 'public', 'videos')
const SRC_DIR = join(OUT, '.source')
const MANIFEST = join(OUT, 'manifest.json')

const DOWNLOAD_TIMEOUT_MS = 120_000
const RETRIES = 3

// ——— Konsol ———
const tty = process.stdout.isTTY
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
const red = paint('31'), green = paint('32'), yellow = paint('33'), dim = paint('2'), bold = paint('1')
const log = (...a) => console.log(...a)
const fail = (msg) => { console.error(red(`\n✖ ${msg}\n`)); process.exit(1) }

// ——— Parametrlar ———
function parseArgs(argv) {
  const opts = { only: null, force: false, source: null, keepSource: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') opts.force = true
    else if (a === '--keep-source') opts.keepSource = true
    else if (a === '--only') opts.only = new Set(String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean))
    else if (a === '--source') opts.source = resolve(String(argv[++i] || ''))
    else if (a === '-h' || a === '--help') {
      log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?/, '').replace(/^ \* ?/gm, ''))
      process.exit(0)
    } else fail(`Noma'lum parametr: ${a}  (yordam: npm run videos:fetch -- --help)`)
  }
  return opts
}

// ——— ffmpeg ———
function have(cmd) {
  const r = spawnSync(cmd, ['-version'], { stdio: 'ignore' })
  return r.status === 0
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg xatosi: ${(r.stderr || '').trim().split('\n').slice(-3).join(' | ') || `kod ${r.status}`}`)
}

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,codec_name:format=duration', '-of', 'json', file], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffprobe faylni o'qiy olmadi: ${(r.stderr || '').trim() || file}`)
  const j = JSON.parse(r.stdout)
  const s = (j.streams || [])[0]
  if (!s) throw new Error('Faylda video oqimi topilmadi (buzilgan yoki video emas).')
  return { width: s.width, height: s.height, codec: s.codec_name, duration: Number(j.format?.duration || 0) }
}

const kb = (file) => Math.round(statSync(file).size / 1024)
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2)

// ——— Yuklab olish ———
async function download(url, dest) {
  let lastErr
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'sadaf-crm-video-fetch/1.0' } })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`)
      const type = res.headers.get('content-type') || ''
      if (!/video|octet-stream/i.test(type)) throw new Error(`Server video emas, "${type || "noma'lum"}" qaytardi — ${url}`)
      const total = Number(res.headers.get('content-length') || 0)
      let got = 0
      const body = Readable.fromWeb(res.body)
      body.on('data', (chunk) => {
        got += chunk.length
        if (tty) process.stdout.write(`\r    ${dim('yuklanmoqda')} ${mb(got)} MB${total ? ` / ${mb(total)} MB` : ''}   `)
      })
      const tmp = `${dest}.part`
      await pipeline(body, createWriteStream(tmp))
      if (tty) process.stdout.write('\r\x1b[2K')
      if (total && got !== total) throw new Error(`Yuklash to'liq emas (${mb(got)} / ${mb(total)} MB)`)
      if (got < 10_000) throw new Error(`Fayl juda kichik (${got} bayt) — ehtimol xato sahifa`)
      renameSync(tmp, dest)
      return got
    } catch (err) {
      if (tty) process.stdout.write('\r\x1b[2K')
      lastErr = err.name === 'AbortError' ? new Error(`Vaqt tugadi (${DOWNLOAD_TIMEOUT_MS / 1000}s) — ${url}`) : err
      if (attempt < RETRIES) log(yellow(`    ! ${attempt}-urinish muvaffaqiyatsiz: ${lastErr.message}. Qayta urinilmoqda…`))
    } finally {
      clearTimeout(timer)
    }
  }
  const code = lastErr?.cause?.code
  const hint = code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? ' — internet yoki DNS ishlamayapti'
    : code === 'ECONNRESET' || code === 'ETIMEDOUT' ? ' — ulanish uzildi' : ''
  const msg = String(lastErr?.message || lastErr)
  throw new Error(`Yuklab bo'lmadi${code ? ` (${code}${hint})` : ''}: ${msg}${msg.includes(url) ? '' : ` — ${url}`}`)
}

// ——— Bitta video ———
async function processVideo(v, opts) {
  const out720 = join(OUT, `${v.id}.mp4`)
  const out480 = join(OUT, `${v.id}-480.mp4`)
  const poster = join(OUT, `${v.id}.jpg`)

  if (!opts.force && [out720, out480, poster].every(existsSync)) {
    log(dim('    allaqachon bor — o\'tkazib yuborildi (--force bilan qayta yaratiladi)'))
    return { skipped: true }
  }

  // 1) Manba fayl
  let source
  if (opts.source) {
    source = join(opts.source, `${v.id}.mp4`)
    if (!existsSync(source)) throw new Error(`--source papkada fayl yo'q: ${source}`)
  } else {
    source = join(SRC_DIR, `${v.id}.source.mp4`)
    const bytes = await download(v.src, source)
    log(`    ${green('✓')} yuklandi: ${mb(bytes)} MB`)
  }
  const info = probe(source)
  log(dim(`    manba: ${info.width}x${info.height}, ${info.codec}, ${info.duration.toFixed(1)}s`))

  // 2) Siqish. Ovoz olib tashlanadi (-an), moov atomi boshiga (+faststart) —
  //    brauzer videoni to'liq yuklamasdan o'ynay boshlaydi.
  const common = ['-an', '-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-movflags', '+faststart', '-t', '30']
  ffmpeg(['-i', source, '-vf', "scale=-2:'min(720,ih)':flags=lanczos,fps=25",
    ...common, '-crf', '27', '-maxrate', '2500k', '-bufsize', '5000k', `${out720}.tmp.mp4`])
  renameSync(`${out720}.tmp.mp4`, out720)
  ffmpeg(['-i', source, '-vf', "scale=-2:'min(480,ih)':flags=lanczos,fps=25",
    ...common, '-crf', '29', '-maxrate', '1000k', '-bufsize', '2000k', `${out480}.tmp.mp4`])
  renameSync(`${out480}.tmp.mp4`, out480)

  // 3) Poster: 1-soniyadagi kadr (video juda qisqa bo'lsa — birinchi kadr)
  const at = info.duration > 2 ? '1' : '0'
  ffmpeg(['-ss', at, '-i', out720, '-frames:v', '1', '-vf', 'scale=-2:720', '-q:v', '4', `${poster}.tmp.jpg`])
  renameSync(`${poster}.tmp.jpg`, poster)

  // 4) Tekshiruv
  const r720 = probe(out720)
  const r480 = probe(out480)
  if (r720.height > 720 || r720.duration <= 0) throw new Error(`720p natija noto'g'ri: ${r720.width}x${r720.height}`)
  if (r480.height > 480 || r480.duration <= 0) throw new Error(`480p natija noto'g'ri: ${r480.width}x${r480.height}`)

  if (!opts.source && !opts.keepSource) rmSync(source, { force: true })
  return {
    size720: kb(out720), size480: kb(out480), sizePoster: kb(poster),
    width: r720.width, height: r720.height, duration: Math.round(r720.duration * 10) / 10
  }
}

function readManifest() {
  try {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
    return m && typeof m.videos === 'object' ? m : { videos: {} }
  } catch {
    return { videos: {} }
  }
}

// ——— Asosiy ———
async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (!have('ffmpeg') || !have('ffprobe')) {
    fail("ffmpeg topilmadi. macOS'da o'rnating:\n    brew install ffmpeg\n  (Homebrew yo'q bo'lsa: https://brew.sh)")
  }
  if (typeof fetch !== 'function') fail('Node.js 18 yoki undan yangi versiya kerak (node -v).')

  let data
  try {
    data = JSON.parse(readFileSync(DATA, 'utf8'))
  } catch (err) {
    fail(`Video ro'yxatini o'qib bo'lmadi: ${DATA}\n  ${err.message}`)
  }
  let videos = data.videos || []
  if (opts.only) {
    const unknown = [...opts.only].filter((id) => !videos.some((v) => v.id === id))
    if (unknown.length) fail(`Noma'lum video ID: ${unknown.join(', ')}\n  Mavjudlari: ${videos.map((v) => v.id).join(', ')}`)
    videos = videos.filter((v) => opts.only.has(v.id))
  }

  mkdirSync(OUT, { recursive: true })
  if (!opts.source) mkdirSync(SRC_DIR, { recursive: true })

  const manifest = readManifest()
  const results = []
  log(bold(`\nSadaf CRM — fon videolari (${videos.length} ta) → ${OUT}\n`))

  for (const [i, v] of videos.entries()) {
    log(`${bold(`[${i + 1}/${videos.length}]`)} ${v.label} ${dim(`(${v.id})`)}`)
    try {
      const r = await processVideo(v, opts)
      if (!r.skipped) {
        manifest.videos[v.id] = {
          file: `${v.id}.mp4`, mobile: true, poster: true,
          width: r.width, height: r.height, duration: r.duration,
          sizeKb: r.size720, mobileSizeKb: r.size480, posterKb: r.sizePoster,
          source: v.src, page: v.page
        }
        log(`    ${green('✓')} tayyor: 720p ${r.size720} KB · 480p ${r.size480} KB · poster ${r.sizePoster} KB`)
      }
      results.push({ v, ok: true, skipped: !!r.skipped })
    } catch (err) {
      delete manifest.videos[v.id]
      for (const f of [`${v.id}.mp4`, `${v.id}-480.mp4`, `${v.id}.jpg`]) {
        for (const suffix of ['.tmp.mp4', '.tmp.jpg']) rmSync(join(OUT, f + suffix), { force: true })
      }
      console.error(red(`    ✖ XATO: ${err.message}`))
      results.push({ v, ok: false, error: err.message })
    }
  }

  manifest.generatedAt = new Date().toISOString()
  manifest.note = 'npm run videos:fetch yaratgan. CRM faqat shu ro\'yxatdagi lokal videolarni ishlatadi.'
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  if (!opts.source && !opts.keepSource) rmSync(SRC_DIR, { recursive: true, force: true })

  const okCount = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  log(bold(`\nXulosa: ${okCount}/${results.length} muvaffaqiyatli`))
  log(dim(`Manifest: ${MANIFEST}`))
  if (failed.length) {
    console.error(red(`\nMuvaffaqiyatsiz (${failed.length} ta) — bular Mixkit serveridan o'qilishda davom etadi:`))
    for (const f of failed) console.error(red(`  • ${f.v.id}: ${f.error}`))
    console.error(yellow("\nMaslahat: internetni tekshiring va qayta ishga tushiring:  npm run videos:fetch -- --only " +
      failed.map((f) => f.v.id).join(',')))
    process.exit(1)
  }
  log(green('\nHammasi tayyor. Frontendni qayta ishga tushiring (npm run dev) yoki build qiling.\n'))
}

main().catch((err) => fail(err?.stack || String(err)))
