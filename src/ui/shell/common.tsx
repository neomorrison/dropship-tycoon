// Small shared building blocks for the shell (sh- prefix).
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import clsx from 'clsx'
import type { Hour, Shift, JobState } from '../../core/types'
import { siteDef } from '../sites/registry'
import type { SiteId } from '../../core/types'

/** Viewport width, updated on resize (rAF-throttled). */
export function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth))
  useEffect(() => {
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setW(window.innerWidth))
    }
    window.addEventListener('resize', on)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', on)
    }
  }, [])
  return w
}
/** below this the scene & panel stack */
export const STACK_BREAKPOINT = 900
/** below this the browser renders in phone mode (compact sites) */
export const PHONE_BREAKPOINT = 720

/** <img> that swaps to a tasteful fallback when the file is missing. */
export function Img({ src, alt, className, fallback, style, draggable = false }: {
  src: string
  alt: string
  className?: string
  fallback: ReactNode
  style?: CSSProperties
  draggable?: boolean
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (failedSrc === src) return <>{fallback}</>
  return <img src={src} alt={alt} className={className} style={style} draggable={draggable} onError={() => setFailedSrc(src)} />
}

/** Favicon chip: colored rounded square with the site's glyph. */
export function SiteChip({ site, size = 16, className }: { site: SiteId; size?: number; className?: string }) {
  const d = siteDef(site)
  const isEmoji = /\p{Extended_Pictographic}/u.test(d.glyph)
  return (
    <span
      className={clsx('sh-chip', isEmoji && 'sh-chip-emoji', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * (isEmoji ? 0.7 : 0.62)), background: isEmoji ? `${d.color}22` : d.color }}
      aria-hidden
    >
      {d.glyph}
    </span>
  )
}

/** "▶", "▶▶", "▶▶▶" speed glyph drawn as SVG triangles. */
export function SpeedGlyph({ n }: { n: number }) {
  if (n === 0) {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
        <rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
      </svg>
    )
  }
  const w = 7 * n + 3
  return (
    <svg width={w} height="12" viewBox={`0 0 ${w} 12`} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${1.5 + i * 7} 1.8 L${9 + i * 7} 6 L${1.5 + i * 7} 10.2 Z`} fill="currentColor" strokeLinejoin="round" stroke="currentColor" strokeWidth="1" />
      ))}
    </svg>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={clsx('sh-switch', checked && 'is-on')}
      onClick={() => onChange(!checked)}
    >
      <span className="sh-switch-knob" />
    </button>
  )
}

/** 95 → "1h 35m", 30 → "30m", 480 → "8h" */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

/** relative in-game time: "just now", "3h ago", "yesterday", "5d ago" */
export function relHours(now: Hour, then: Hour): string {
  const d = now - then
  if (d <= 0) return 'just now'
  if (d < 24) return `${d}h ago`
  const days = Math.floor(d / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

/** The shift that is in progress, or the next scheduled one. */
export function nextShift(job: JobState, hour: Hour): Shift | null {
  let best: Shift | null = null
  let bestStart = Infinity
  for (const sh of job.shifts) {
    if (sh.status === 'in_progress') return sh
    if (sh.status !== 'scheduled') continue
    const start = sh.day * 24 + sh.startHour
    if (start + sh.hours <= hour) continue
    if (start < bestStart) {
      best = sh
      bestStart = start
    }
  }
  return best
}
export const shiftStart = (sh: Shift) => sh.day * 24 + sh.startHour
export const shiftEnd = (sh: Shift) => sh.day * 24 + sh.startHour + sh.hours

/** "11:00 AM" for an hour-of-day (0..23, may exceed 24) */
export function clockOf(h: number): string {
  const hh = ((Math.floor(h) % 24) + 24) % 24
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:00 ${hh < 12 ? 'AM' : 'PM'}`
}

export function ProgressBar({ value, tone = 'accent', className }: { value: number; tone?: 'accent' | 'mint' | 'amber' | 'red' | 'blue'; className?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <div className={clsx('sh-progress', `sh-progress-${tone}`, className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className="sh-progress-fill" style={{ transform: `scaleX(${v})` }} />
    </div>
  )
}

/** Close on outside pointerdown / Escape. Escape is marked handled (defaultPrevented) for the global shortcut handler. */
export function useDismiss(open: boolean, onClose: () => void, refs: Array<{ current: HTMLElement | null }>) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (t && refs.some(r => r.current?.contains(t))) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        onClose()
      }
    }
    // defer so the click that opened it doesn't immediately close it
    const id = window.setTimeout(() => window.addEventListener('pointerdown', onDown, true), 0)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose])
}

/** true when the event target is a text field / editor (don't hijack its keys) */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  const tag = t.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file', 'reset'].includes(type)
  }
  return false
}

/** Returns 'up' | 'down' for ~900ms after `value` changes (for money flashes). */
export function useFlash(value: number, threshold = 0.005): 'up' | 'down' | null {
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; key: number } | null>(null)
  const [prev, setPrev] = useState(value)
  if (value !== prev) {
    setPrev(value)
    if (Math.abs(value - prev) > threshold) setFlash({ dir: value > prev ? 'up' : 'down', key: Date.now() })
  }
  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 900)
    return () => window.clearTimeout(t)
  }, [flash])
  return flash?.dir ?? null
}

export type PortraitMood = 'neutral' | 'happy' | 'tired' | 'stressed'
/** Which player portrait fits the current needs. */
export function portraitMood(energy: number, mood: number, hunger: number, moneyStress: boolean): PortraitMood {
  if (energy < 22) return 'tired'
  if (mood < 30 || hunger < 12 || (moneyStress && mood < 55)) return 'stressed'
  if (mood >= 68 && energy >= 40) return 'happy'
  return 'neutral'
}
export const MOOD_EMOJI: Record<PortraitMood, string> = { neutral: '🙂', happy: '😄', tired: '🥱', stressed: '😣' }

/** Tiny formatter for sim-authored text: paragraphs, line breaks and **bold**. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const paras = String(text ?? '').split(/\n{2,}/)
  return (
    <div className={className}>
      {paras.map((p, i) => (
        <p key={i}>
          {p.split('\n').map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {line.split(/(\*\*[^*]+\*\*)/g).map((seg, k) =>
                seg.startsWith('**') && seg.endsWith('**') && seg.length > 4 ? <strong key={k}>{seg.slice(2, -2)}</strong> : seg,
              )}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}

/** "in 3h 20m", "in 1d 4h", "now" for a number of in-game hours */
export function fmtUntil(hours: number): string {
  if (hours <= 0) return 'now'
  const totalMin = Math.round(hours * 60)
  if (totalMin < 60) return `in ${totalMin}m`
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return h ? `in ${d}d ${h}h` : `in ${d}d`
  return m ? `in ${h}h ${m}m` : `in ${h}h`
}

