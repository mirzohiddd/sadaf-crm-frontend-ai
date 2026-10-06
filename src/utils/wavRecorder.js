// Brauzer mikrofonidan qo'ng'iroqni yozish (Web Audio API).
//
// Nega MediaRecorder emas: brauzerlar MediaRecorder bilan turli formatlar
// beradi (Chrome — WebM/Opus, Safari — MP4). Bir xil natija uchun
// ovoz to'g'ridan-to'g'ri PCM sifatida olinadi va 16 kHz mono 16-bit WAV ga
// aylantiriladi — bu STT uchun "native" format, barcha brauzerlarda bir xil
// ishlaydi va hajmi ~1.9 MB/daqiqa. Groq Whisper (Free Tier) 25 MB gacha
// qabul qiladi — ya'ni ~13 daqiqalik qo'ng'iroq bitta so'rovda transcript bo'ladi.
//
// MUHIM CHEKLOV: bu FAQAT kompyuter mikrofonini yozadi. Mijoz ovozi ham
// yozilishi uchun telefon karnay (speaker) rejimida mikrofonga yaqin turishi
// kerak. Haqiqiy telefon (VoIP/SIP) liniyasini yozish emas — u uchun backend
// `channel`/`externalId` maydonlari va recording endpointi tayyor.

const TARGET_RATE = 16000
const WORKLET_CHUNK = 4096

const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${WORKLET_CHUNK}); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i]
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0 }
      }
    }
    return true
  }
}
registerProcessor('sadaf-pcm-capture', PcmCapture)
`

export class MicError extends Error {}

function micErrorMessage(err) {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return "Mikrofonga ruxsat berilmadi. Brauzer manzil qatoridagi qulf belgisidan mikrofonga ruxsat bering."
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Mikrofon topilmadi. Mikrofon ulanganini tekshiring.'
  if (name === 'NotReadableError') return "Mikrofon boshqa dastur tomonidan band. Uni yopib, qayta urinib ko'ring."
  return "Mikrofonni ishga tushirib bo'lmadi."
}

export class WavRecorder {
  constructor({ onLevel = () => {}, onEnded = () => {} } = {}) {
    this.onLevel = onLevel
    this.onEnded = onEnded
    this.paused = false
    this.samples = 0
    this.chunks = []
    this._t = 0
    this._prev = 0
  }

  static supported() {
    return !!(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext))
  }

  async start() {
    if (!window.isSecureContext) {
      throw new MicError('Mikrofon faqat HTTPS (yoki localhost) orqali ishlaydi.')
    }
    if (!WavRecorder.supported()) throw new MicError("Bu brauzer mikrofon yozishni qo'llab-quvvatlamaydi.")

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true }
      })
    } catch (err) {
      throw new MicError(micErrorMessage(err))
    }

    this.track = this.stream.getAudioTracks()[0]
    this.track?.addEventListener('ended', () => this.onEnded())

    const Ctx = window.AudioContext || window.webkitAudioContext
    this.ctx = new Ctx()
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.inRate = this.ctx.sampleRate
    this.ratio = this.inRate / TARGET_RATE

    this.source = this.ctx.createMediaStreamSource(this.stream)
    // Anti-aliasing: 16 kHz ga tushirishdan oldin yuqori chastotalarni kesish
    this.filter = this.ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 7200
    this.source.connect(this.filter)

    const handle = (data) => this._onChunk(data)
    if (this.ctx.audioWorklet && window.AudioWorkletNode) {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
      try {
        await this.ctx.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      this.node = new AudioWorkletNode(this.ctx, 'sadaf-pcm-capture')
      this.node.port.onmessage = (e) => handle(e.data)
    } else {
      // Eski brauzerlar uchun zaxira
      this.node = this.ctx.createScriptProcessor(WORKLET_CHUNK, 1, 1)
      this.node.onaudioprocess = (e) => handle(new Float32Array(e.inputBuffer.getChannelData(0)))
    }
    // Ovoz karnayga chiqmasligi uchun nol-gain orqali ulanadi
    this.mute = this.ctx.createGain()
    this.mute.gain.value = 0
    this.filter.connect(this.node)
    this.node.connect(this.mute)
    this.mute.connect(this.ctx.destination)
  }

  get micActive() {
    return !!this.track && this.track.readyState === 'live' && !this.track.muted
  }

  get duration() {
    return this.samples / TARGET_RATE
  }

  pause() { this.paused = true }
  resume() { this.paused = false }

  _onChunk(x) {
    // Daraja o'lchagichi (RMS) — pauza paytida ham ko'rsatiladi
    let sum = 0
    for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
    this.onLevel(Math.min(1, Math.sqrt(sum / x.length) * 4))
    if (this.paused) return

    // Oqimli chiziqli interpolyatsiya bilan inRate -> 16 kHz
    const n = x.length
    const out = new Int16Array(Math.ceil(n / this.ratio) + 2)
    let k = 0
    let t = this._t
    while (t <= n - 1) {
      const i = Math.floor(t)
      const frac = t - i
      const a = i < 0 ? this._prev : x[i]
      const b = i + 1 < n ? x[i + 1] : x[n - 1]
      const v = Math.max(-1, Math.min(1, a + (b - a) * frac))
      out[k++] = v < 0 ? v * 0x8000 : v * 0x7fff
      t += this.ratio
    }
    this._t = t - n
    this._prev = x[n - 1]
    if (k) {
      this.chunks.push(out.subarray(0, k))
      this.samples += k
    }
  }

  async stop() {
    try { this.node?.disconnect() } catch { /* allaqachon uzilgan */ }
    try { this.filter?.disconnect() } catch { /* allaqachon uzilgan */ }
    try { this.source?.disconnect() } catch { /* allaqachon uzilgan */ }
    if (this.node?.port) this.node.port.onmessage = null
    this.stream?.getTracks().forEach((tr) => tr.stop())
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close().catch(() => {})
    return { blob: this._wav(), duration: this.duration }
  }

  /** Mikrofonni yozuvsiz yopish (bekor qilish). */
  async cancel() {
    this.chunks = []
    this.samples = 0
    await this.stop()
  }

  _wav() {
    const dataBytes = this.samples * 2
    const header = new ArrayBuffer(44)
    const v = new DataView(header)
    const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
    str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE')
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
    v.setUint32(24, TARGET_RATE, true); v.setUint32(28, TARGET_RATE * 2, true)
    v.setUint16(32, 2, true); v.setUint16(34, 16, true)
    str(36, 'data'); v.setUint32(40, dataBytes, true)
    return new Blob([header, ...this.chunks], { type: 'audio/wav' })
  }
}
