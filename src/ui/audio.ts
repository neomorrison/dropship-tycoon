// ============================================================================
// Game audio — WebAudio-synthesized SFX + looping lo-fi music with crossfade.
// OWNER: ui-shell.
//
// Usage from any UI module:
//   import { sfx, playSfx } from '../audio'   // (path relative to your file)
//   sfx.chaChing()        // or playSfx('chaChing')
//
// Master mute / master volume / music on-off live in the UI store (core/ui:
// muted, volume, musicOn). Per-channel volumes (music, sfx) live in
// `useAudioPrefs`. Everything is persisted to localStorage as a per-browser
// convenience. Browsers block audio until a user gesture, so nothing plays
// before `unlockAudio()` runs (installAudioUnlock() wires that up once).
// Missing/undecodable music files are skipped silently.
// ============================================================================
import { create } from 'zustand'
import { useUI } from '../core/ui'
import { audioFile } from '../core/assets'

export type SfxName = 'chaChing' | 'ping' | 'click' | 'error' | 'levelUp' | 'fryer' | 'whoosh' | 'pop'

interface AudioPrefs {
  /** 0..1 music channel volume (multiplied by master volume) */
  musicVolume: number
  /** 0..1 sound-effects channel volume (multiplied by master volume) */
  sfxVolume: number
  sfxOn: boolean
  set: (p: Partial<Omit<AudioPrefs, 'set'>>) => void
}

const PREFS_KEY = 'dropship-tycoon:audio'

interface StoredPrefs { muted?: boolean; musicOn?: boolean; volume?: number; musicVolume?: number; sfxVolume?: number; sfxOn?: boolean }

function readStored(): StoredPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? (JSON.parse(raw) as StoredPrefs) : {}
  } catch {
    return {}
  }
}
const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d)

const stored = readStored()

export const useAudioPrefs = create<AudioPrefs>()(set => ({
  musicVolume: clamp01(stored.musicVolume, 0.55),
  sfxVolume: clamp01(stored.sfxVolume, 0.8),
  sfxOn: stored.sfxOn ?? true,
  set: p => set(p),
}))

// Apply persisted master settings to the UI store once at import.
{
  const patch: Partial<{ muted: boolean; musicOn: boolean; volume: number }> = {}
  if (typeof stored.muted === 'boolean') patch.muted = stored.muted
  if (typeof stored.musicOn === 'boolean') patch.musicOn = stored.musicOn
  if (typeof stored.volume === 'number') patch.volume = clamp01(stored.volume, 0.6)
  if (Object.keys(patch).length) useUI.getState().set(patch)
}

function persist() {
  try {
    const u = useUI.getState()
    const a = useAudioPrefs.getState()
    const out: StoredPrefs = { muted: u.muted, musicOn: u.musicOn, volume: u.volume, musicVolume: a.musicVolume, sfxVolume: a.sfxVolume, sfxOn: a.sfxOn }
    localStorage.setItem(PREFS_KEY, JSON.stringify(out))
  } catch {
    /* storage unavailable (private mode) — settings just won't persist */
  }
}

// ---------------------------------------------------------------------------
// Context & routing
// ---------------------------------------------------------------------------
let ctx: AudioContext | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let unlocked = false

function getCtx(): AudioContext | null {
  if (ctx) return ctx
  const Ctor: typeof AudioContext | undefined =
    typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 10
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.2
  comp.connect(ctx.destination)
  sfxBus = ctx.createGain()
  sfxBus.connect(comp)
  musicBus = ctx.createGain()
  musicBus.gain.value = 0
  musicBus.connect(ctx.destination)
  applyVolumes(true)
  return ctx
}

const sfxLevel = () => {
  const u = useUI.getState()
  const a = useAudioPrefs.getState()
  return u.muted || !a.sfxOn ? 0 : u.volume * a.sfxVolume
}
const musicLevel = () => {
  const u = useUI.getState()
  const a = useAudioPrefs.getState()
  // lo-fi sits under the SFX; 0.5 keeps it a background bed at 100%
  return u.muted || !u.musicOn ? 0 : u.volume * a.musicVolume * 0.5
}

function applyVolumes(immediate = false) {
  if (!ctx || !sfxBus || !musicBus) return
  const t = ctx.currentTime
  if (immediate) {
    sfxBus.gain.value = sfxLevel()
    musicBus.gain.value = musicLevel()
  } else {
    sfxBus.gain.setTargetAtTime(sfxLevel(), t, 0.03)
    musicBus.gain.setTargetAtTime(musicLevel(), t, 0.25)
  }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf
  const len = Math.floor(c.sampleRate * 2)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  noiseBuf = buf
  return buf
}

// ---------------------------------------------------------------------------
// Synth helpers
// ---------------------------------------------------------------------------
interface ToneOpts { type?: OscillatorType; gain?: number; attack?: number; decay: number; toFreq?: number; detune?: number; dest?: AudioNode }
function tone(c: AudioContext, freq: number, at: number, o: ToneOpts) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, at)
  if (o.toFreq) osc.frequency.exponentialRampToValueAtTime(o.toFreq, at + o.decay)
  if (o.detune) osc.detune.value = o.detune
  const peak = o.gain ?? 0.3
  const atk = o.attack ?? 0.004
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, at + atk + o.decay)
  osc.connect(g)
  g.connect(o.dest ?? sfxBus!)
  osc.start(at)
  osc.stop(at + atk + o.decay + 0.05)
}

function noiseBurst(c: AudioContext, at: number, dur: number, o: { gain: number; hp?: number; lp?: number; bp?: number; q?: number; attack?: number }) {
  const src = c.createBufferSource()
  src.buffer = noise(c)
  let node: AudioNode = src
  const chain = (f: BiquadFilterNode) => {
    node.connect(f)
    node = f
  }
  if (o.hp) {
    const f = c.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = o.hp
    chain(f)
  }
  if (o.lp) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = o.lp
    chain(f)
  }
  if (o.bp) {
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = o.bp
    f.Q.value = o.q ?? 1
    chain(f)
  }
  const g = c.createGain()
  const atk = o.attack ?? 0.002
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(o.gain, at + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  node.connect(g)
  g.connect(sfxBus!)
  // noise buffer is 2s long: pick a random window that still fits
  const offset = Math.random() * Math.max(0, 1.9 - dur)
  src.start(at, offset, dur + 0.05)
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------
const SYNTHS: Record<SfxName, (c: AudioContext, t: number) => void> = {
  /** Cash register: mechanical "ka" + drawer rattle + two bright bell partials. */
  chaChing(c, t) {
    noiseBurst(c, t, 0.05, { gain: 0.35, bp: 2600, q: 2.5 })
    noiseBurst(c, t + 0.035, 0.07, { gain: 0.18, bp: 5200, q: 3 })
    const ding = t + 0.09
    tone(c, 2093, ding, { gain: 0.22, decay: 0.9 })
    tone(c, 2637, ding, { gain: 0.16, decay: 0.8 })
    tone(c, 3136, ding + 0.002, { gain: 0.09, decay: 0.55 })
    tone(c, 5274, ding, { gain: 0.035, decay: 0.3, detune: 12 })
    tone(c, 1046.5, ding, { gain: 0.08, decay: 0.5, type: 'triangle' })
  },
  /** Soft notification ping. */
  ping(c, t) {
    tone(c, 1318.5, t, { gain: 0.2, decay: 0.45 })
    tone(c, 1975.5, t + 0.07, { gain: 0.12, decay: 0.4 })
  },
  /** UI tick. */
  click(c, t) {
    tone(c, 1900, t, { gain: 0.1, decay: 0.035, toFreq: 950, type: 'triangle' })
    noiseBurst(c, t, 0.015, { gain: 0.05, hp: 3000 })
  },
  /** Descending "nope". */
  error(c, t) {
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1400
    lp.connect(sfxBus!)
    tone(c, 311, t, { type: 'square', gain: 0.09, decay: 0.12, dest: lp })
    tone(c, 233, t + 0.13, { type: 'square', gain: 0.09, decay: 0.22, dest: lp })
  },
  /** Bright arpeggio for milestones & level-ups. */
  levelUp(c, t) {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) => tone(c, f, t + i * 0.085, { type: 'triangle', gain: 0.2, decay: 0.28 }))
    const end = t + notes.length * 0.085
    tone(c, 1046.5, end, { type: 'triangle', gain: 0.14, decay: 0.8 })
    tone(c, 1318.5, end, { type: 'sine', gain: 0.1, decay: 0.8 })
    tone(c, 1568, end, { type: 'sine', gain: 0.08, decay: 0.8 })
  },
  /** Fry basket drop: oil sizzle with crackles. */
  fryer(c, t) {
    noiseBurst(c, t, 1.5, { gain: 0.16, hp: 2200, lp: 9000, attack: 0.06 })
    noiseBurst(c, t, 0.25, { gain: 0.12, bp: 900, q: 0.8 })
    for (let i = 0; i < 14; i++) {
      const at = t + 0.05 + Math.random() * 1.2
      noiseBurst(c, at, 0.012 + Math.random() * 0.02, { gain: 0.1 + Math.random() * 0.12, bp: 3000 + Math.random() * 3000, q: 4 })
    }
  },
  /** Window open/close swish. */
  whoosh(c, t) {
    const src = c.createBufferSource()
    src.buffer = noise(c)
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.2
    f.frequency.setValueAtTime(500, t)
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.22)
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.08)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    src.connect(f)
    f.connect(g)
    g.connect(sfxBus!)
    src.start(t, Math.random(), 0.32)
  },
  /** Bubble pop (coach tips, menus). */
  pop(c, t) {
    tone(c, 420, t, { gain: 0.16, decay: 0.09, toFreq: 980 })
    tone(c, 1400, t + 0.02, { gain: 0.05, decay: 0.06 })
  },
}

const lastPlayed: Partial<Record<SfxName, number>> = {}
const MIN_GAP_MS: Partial<Record<SfxName, number>> = { chaChing: 350, fryer: 900, click: 40 }

export function playSfx(name: SfxName) {
  if (!unlocked) return
  if (sfxLevel() <= 0) return
  const c = getCtx()
  if (!c || !sfxBus) return
  const now = performance.now()
  const gap = MIN_GAP_MS[name] ?? 70
  if (now - (lastPlayed[name] ?? -1e9) < gap) return
  lastPlayed[name] = now
  if (c.state === 'suspended') void c.resume().catch(() => {})
  try {
    SYNTHS[name](c, c.currentTime + 0.01)
  } catch {
    /* never let a sound break the game */
  }
}

/** Convenience: sfx.chaChing(), sfx.ping(), ... */
export const sfx: Record<SfxName, () => void> = {
  chaChing: () => playSfx('chaChing'),
  ping: () => playSfx('ping'),
  click: () => playSfx('click'),
  error: () => playSfx('error'),
  levelUp: () => playSfx('levelUp'),
  fryer: () => playSfx('fryer'),
  whoosh: () => playSfx('whoosh'),
  pop: () => playSfx('pop'),
}

// ---------------------------------------------------------------------------
// Music: lofi1/lofi2 playlist with ~6s crossfades
// ---------------------------------------------------------------------------
const TRACKS = ['lofi1.mp3', 'lofi2.mp3']
const XFADE = 6
interface Track { el: HTMLAudioElement; gain: GainNode; broken: boolean; ready: boolean }
let tracks: Track[] = []
let current = -1
let fading = false
let pauseTimer: ReturnType<typeof setTimeout> | null = null

function setupTracks(c: AudioContext) {
  if (tracks.length) return
  tracks = TRACKS.map(name => {
    const el = new Audio()
    el.preload = 'auto'
    el.loop = false
    el.src = audioFile(name)
    const gain = c.createGain()
    gain.gain.value = 0
    const t: Track = { el, gain, broken: false, ready: false }
    try {
      const src = c.createMediaElementSource(el)
      src.connect(gain)
      gain.connect(musicBus!)
    } catch {
      t.broken = true
    }
    el.addEventListener('error', () => {
      t.broken = true
      if (tracks[current] === t) advance(true)
    })
    el.addEventListener('canplay', () => (t.ready = true))
    el.addEventListener('timeupdate', () => {
      if (tracks[current] !== t || fading) return
      const d = el.duration
      if (Number.isFinite(d) && d > XFADE * 2 && el.currentTime >= d - XFADE - 0.5) advance(false)
    })
    el.addEventListener('ended', () => {
      if (tracks[current] === t && !fading) advance(true)
    })
    return t
  })
}

function playTrack(i: number, fadeIn: number) {
  const c = ctx
  const t = tracks[i]
  if (!c || !t || t.broken) return false
  current = i
  t.el.currentTime = 0
  const g = t.gain.gain
  g.cancelScheduledValues(c.currentTime)
  g.setValueAtTime(0.0001, c.currentTime)
  g.linearRampToValueAtTime(1, c.currentTime + fadeIn)
  t.el.play().catch(() => {
    /* autoplay refused or file missing: stay silent */
  })
  return true
}

function advance(hardCut: boolean) {
  const c = ctx
  if (!c || !tracks.length) return
  const prev = tracks[current]
  const candidates = tracks.map((_, i) => i).filter(i => !tracks[i].broken)
  if (!candidates.length) return
  const next = candidates.length === 1 ? candidates[0] : candidates.find(i => i !== current) ?? candidates[0]
  const fade = hardCut ? 1.5 : XFADE
  if (prev && prev !== tracks[next]) {
    fading = true
    const g = prev.gain.gain
    g.cancelScheduledValues(c.currentTime)
    g.setValueAtTime(Math.max(0.0001, g.value), c.currentTime)
    g.linearRampToValueAtTime(0.0001, c.currentTime + fade)
    setTimeout(() => {
      prev.el.pause()
      fading = false
    }, fade * 1000 + 200)
  }
  playTrack(next, fade)
}

function startMusic() {
  const c = getCtx()
  if (!c || !musicBus) return
  setupTracks(c)
  if (pauseTimer) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
  const cur = tracks[current]
  if (cur && !cur.broken) {
    if (cur.el.paused) cur.el.play().catch(() => {})
    const g = cur.gain.gain
    g.cancelScheduledValues(c.currentTime)
    g.setValueAtTime(Math.max(0.0001, g.value), c.currentTime)
    g.linearRampToValueAtTime(1, c.currentTime + 1.5)
    return
  }
  const first = Math.floor(Math.random() * tracks.length)
  if (!playTrack(first, 3)) advance(true)
}

function stopMusic() {
  if (!ctx || !tracks.length) return
  const cur = tracks[current]
  if (!cur) return
  const g = cur.gain.gain
  g.cancelScheduledValues(ctx.currentTime)
  g.setValueAtTime(Math.max(0.0001, g.value), ctx.currentTime)
  g.linearRampToValueAtTime(0.0001, ctx.currentTime + 1)
  if (pauseTimer) clearTimeout(pauseTimer)
  pauseTimer = setTimeout(() => {
    for (const t of tracks) t.el.pause()
    pauseTimer = null
  }, 1200)
}

function syncMusic() {
  if (!unlocked) return
  if (musicLevel() > 0) startMusic()
  else stopMusic()
}

// ---------------------------------------------------------------------------
// Unlock & public controls
// ---------------------------------------------------------------------------
/** Call from a user gesture. Creates/resumes the AudioContext and starts music (if enabled). */
export function unlockAudio() {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => {})
  if (!unlocked) {
    unlocked = true
    applyVolumes(true)
    syncMusic()
  }
}

let unlockInstalled = false
/** Attach one-time gesture listeners that unlock audio. Safe to call repeatedly. */
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true
  const handler = () => {
    unlockAudio()
    window.removeEventListener('pointerdown', handler, true)
    window.removeEventListener('keydown', handler, true)
    window.removeEventListener('touchstart', handler, true)
  }
  window.addEventListener('pointerdown', handler, true)
  window.addEventListener('keydown', handler, true)
  window.addEventListener('touchstart', handler, true)
}

export const isAudioUnlocked = () => unlocked

export function setMuted(muted: boolean) {
  useUI.getState().set({ muted })
}
export function toggleMuted() {
  const u = useUI.getState()
  u.set({ muted: !u.muted })
  if (!unlocked) unlockAudio()
}
export function setMasterVolume(volume: number) {
  useUI.getState().set({ volume: clamp01(volume, 0.6) })
}
export function setMusicOn(on: boolean) {
  useUI.getState().set({ musicOn: on })
}
export function setMusicVolume(v: number) {
  useAudioPrefs.getState().set({ musicVolume: clamp01(v, 0.55) })
}
export function setSfxVolume(v: number) {
  useAudioPrefs.getState().set({ sfxVolume: clamp01(v, 0.8) })
}
export function setSfxOn(on: boolean) {
  useAudioPrefs.getState().set({ sfxOn: on })
}

// React to settings changes from anywhere (UI store or prefs store).
let prevKey = ''
function onSettingsChange() {
  const u = useUI.getState()
  const a = useAudioPrefs.getState()
  const key = `${u.muted}|${u.musicOn}|${u.volume}|${a.musicVolume}|${a.sfxVolume}|${a.sfxOn}`
  if (key === prevKey) return
  prevKey = key
  persist()
  applyVolumes()
  syncMusic()
}
useUI.subscribe(onSettingsChange)
useAudioPrefs.subscribe(onSettingsChange)
prevKey = (() => {
  const u = useUI.getState()
  const a = useAudioPrefs.getState()
  return `${u.muted}|${u.musicOn}|${u.volume}|${a.musicVolume}|${a.sfxVolume}|${a.sfxOn}`
})()
