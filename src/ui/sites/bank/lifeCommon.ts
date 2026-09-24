// Shared helpers for the life sites (Chaise Bank, Inboxly, McDoodle's Crew, Zillo, Amazin, UpWorx,
// Ecom Academy). OWNER: ui-life-sites. Pure UI helpers: no state writes happen here.
import { useCallback, useEffect, useRef, useState } from 'react'
import { produce } from 'immer'
import { act, getGS, useGS } from '../../../core/store'
import type { Day, GameState, Hour } from '../../../core/types'
import { dayOf, formatDate, hourOfDay, monthName, yearOf, dateOfDay } from '../../../core/time'
/** Whole game state. The sites re-render at most once per in-game tick, which is fine for these pages. */
export const useWorld = (): GameState => useGS(st => st)

/**
 * Call a sim query that may default optional fields with `??=` (the life/finance ensure* helpers).
 * Those assignments throw on the frozen store state — even when the field is already null — so on
 * failure the query is re-run against a throwaway immer draft (changes discarded) and its result is
 * cloned out as plain data.
 */
export function simRead<T>(s: GameState, fn: (st: GameState) => T, fallback: T): T {
  try {
    return fn(s)
  } catch {
    /* frozen-state write inside an ensure* helper: retry on a scratch draft */
  }
  let out = fallback
  try {
    produce(s, d => {
      out = JSON.parse(JSON.stringify(fn(d as GameState))) as T
    })
  } catch {
    /* keep the fallback */
  }
  return out
}

export const todayOf = (s: GameState): Day => dayOf(s.time.hour)

/**
 * Run a read-only sim helper. Some helpers default optional fields (`??=`) on old saves, which
 * throws on frozen state; a failure falls back instead of taking the whole site down.
 */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/** Run a sim action inside act() and hand back its return value. */
export function run<T>(fn: (s: GameState) => T): T | undefined {
  let out: T | undefined
  act(s => {
    out = fn(s)
  })
  return out
}

/** Read the latest state right now (event handlers). */
export const now = () => getGS()

export const usd = (n: number, cents = true) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })

export const round2 = (n: number) => Math.round(n * 100) / 100

/** "7 AM", "11:30 PM" */
export function clockLabel(hourOfDayValue: number, minutes = 0): string {
  const h = ((Math.floor(hourOfDayValue) % 24) + 24) % 24
  const h12 = h % 12 === 0 ? 12 : h % 12
  const m = minutes ? `:${String(minutes).padStart(2, '0')}` : ':00'
  return `${h12}${m} ${h < 12 ? 'AM' : 'PM'}`
}

/** Absolute hour → "Mar 4, 2026, 3:00 PM" */
export function stamp(hour: Hour): string {
  return `${formatDate(dayOf(hour), 'short')}, ${clockLabel(hourOfDay(hour))}`
}

/** Relative day wording: Today / Tomorrow / Yesterday / in 3 days / 5 days ago */
export function relDay(day: Day, today: Day): string {
  const d = day - today
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  if (d > 1) return `in ${d} days`
  return `${-d} days ago`
}

/** Duration in minutes → "5h 20m" / "45m" */
export function durationLabel(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m >= 24 * 60) {
    const d = Math.floor(m / 1440)
    const hh = Math.floor((m % 1440) / 60)
    return hh ? `${d}d ${hh}h` : `${d}d`
  }
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h && r) return `${h}h ${r}m`
  if (h) return `${h}h`
  return `${r}m`
}

/** Month key (y*12+m) for a day, and its label. */
export const monthKey = (day: Day) => yearOf(day) * 12 + dateOfDay(day).getUTCMonth()
export const monthKeyLabel = (key: number, long = false) => `${monthName(key % 12, long)} ${Math.floor(key / 12)}`

export const firstNameOf = (s: GameState) => (s.player.name || s.meta.playerName || 'there').trim().split(/\s+/)[0] || 'there'

/** Short-lived inline status message for site actions ("Payment sent", errors). */
export interface Flash { tone: 'success' | 'critical' | 'info' | 'warning'; text: string }
export function useFlash(ms = 5000): [Flash | null, (f: Flash | null) => void] {
  const [flash, setFlash] = useState<Flash | null>(null)
  const timer = useRef<number | null>(null)
  const set = useCallback(
    (f: Flash | null) => {
      if (timer.current) window.clearTimeout(timer.current)
      setFlash(f)
      if (f) timer.current = window.setTimeout(() => setFlash(null), ms)
    },
    [ms],
  )
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])
  return [flash, set]
}

/** Split a site path "a/b/c" into segments. */
export const segs = (path: string) => path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)

/** Stable pseudo-random 0..1 from a string (for flavour text that must not flicker). */
export function hash01(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}
