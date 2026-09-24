// Retail & supply-chain calendar shared by the market and events modules:
// Chinese New Year factory shutdowns, US gifting holidays, BFCM, shipping cutoffs.
// Pure functions of the day number (day 0 = Mon 2026-03-02). No state, no RNG.
import type { Day } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { CNY_DATES, blackFridayDay, bfcmRange, dateOfDay, dayOfDate, dayOfIso, domOf, monthOf, yearOf } from '../../core/time'

// ---------------------------------------------------------------------------
// Chinese New Year
// ---------------------------------------------------------------------------
/** Factories wind down a week before the holiday and are dark ~2 weeks after it. */
export const CNY_SHUTDOWN_BEFORE = 7
export const CNY_SHUTDOWN_AFTER = 14
/** Backlog period after reopening: slow restart, missing workers (BENCHMARKS.cny.workerNonReturnRate). */
export const CNY_BACKLOG_AFTER = 28

/** Lunar New Year days; closures that began before the game starts (CNY 2026) are ignored. */
const CNY_ALL: Record<number, Day> = (() => {
  const out: Record<number, Day> = {}
  const add = (iso: string) => {
    const d = dayOfIso(iso)
    if (d - CNY_SHUTDOWN_BEFORE >= 0) out[Number(iso.slice(0, 4))] = d
  }
  for (const iso of BENCHMARKS.cny.lunarNewYearDates) add(iso)
  for (const iso of Object.values(CNY_DATES)) add(iso)
  return out
})()

export interface CnyWindow {
  year: number
  /** Lunar New Year's day */
  day: Day
  shutdownStart: Day
  shutdownEnd: Day
  backlogEnd: Day
}

export function cnyWindow(year: number): CnyWindow | null {
  const day = CNY_ALL[year]
  if (day === undefined) return null
  return { year, day, shutdownStart: day - CNY_SHUTDOWN_BEFORE, shutdownEnd: day + CNY_SHUTDOWN_AFTER, backlogEnd: day + CNY_BACKLOG_AFTER }
}

/** The CNY window whose shutdown or backlog period contains `day`, if any. */
export function cnyWindowAt(day: Day): (CnyWindow & { phase: 'shutdown' | 'backlog' }) | null {
  for (const y of [yearOf(day), yearOf(day) + 1, yearOf(day) - 1]) {
    const w = cnyWindow(y)
    if (!w) continue
    if (day >= w.shutdownStart && day <= w.shutdownEnd) return { ...w, phase: 'shutdown' }
    if (day > w.shutdownEnd && day <= w.backlogEnd) return { ...w, phase: 'backlog' }
  }
  return null
}

/** Next CNY whose shutdown has not ended yet (the one players should prepare for). */
export function upcomingCny(day: Day): CnyWindow | null {
  const years = Object.keys(CNY_ALL).map(Number).sort((a, b) => a - b)
  for (const y of years) {
    const w = cnyWindow(y)
    if (w && w.shutdownEnd >= day) return w
  }
  return null
}

/** Extra dropship delivery days during the shutdown for a given CNY (BENCHMARKS.cny.extraDelayDays), deterministic per save. */
export function cnyDropshipDelay(seed: number, year: number): number {
  const [lo, hi] = BENCHMARKS.cny.extraDelayDays
  const h = Math.abs(Math.imul(seed ^ (year * 2654435761), 0x9e3779b1)) % 1000
  return lo + Math.round((h / 999) * (hi - lo))
}

/**
 * Day a factory finishes `prodDays` of production when ordered on `orderDay`,
 * skipping CNY shutdown days and adding the post-holiday backlog when the job straddles it.
 */
export function productionDoneDay(orderDay: Day, prodDays: number): Day {
  let d = orderDay
  let left = Math.max(0, Math.round(prodDays))
  let crossed: CnyWindow | null = null
  let guard = 0
  while (left > 0 && guard++ < 400) {
    d++
    const w = cnyWindowAt(d)
    if (w && w.phase === 'shutdown') {
      crossed = w
      continue
    }
    left--
  }
  // Workers trickle back after the holiday (10–30% don't return): restart takes ~a week.
  if (crossed && d <= crossed.backlogEnd) d += Math.max(0, Math.min(7, crossed.backlogEnd - d))
  return d
}

// ---------------------------------------------------------------------------
// US retail holidays
// ---------------------------------------------------------------------------
/** nth weekday (0 = Sunday … 6 = Saturday, JS convention) of a month */
function nthWeekdayOfMonth(year: number, m0: number, jsWeekday: number, n: number): Day {
  const first = new Date(Date.UTC(year, m0, 1)).getUTCDay()
  const dom = 1 + ((jsWeekday - first + 7) % 7) + (n - 1) * 7
  return dayOfDate(year, m0, dom)
}
export const valentinesDay = (year: number): Day => dayOfDate(year, 1, 14)
/** 2nd Sunday of May */
export const mothersDay = (year: number): Day => nthWeekdayOfMonth(year, 4, 0, 2)
/** 3rd Sunday of June */
export const fathersDay = (year: number): Day => nthWeekdayOfMonth(year, 5, 0, 3)
/** Amazin "Mega Deal Days" (parody of the big July marketplace sale): 2nd Tuesday of July + Wednesday */
export const megaDealDays = (year: number): [Day, Day] => {
  const tue = nthWeekdayOfMonth(year, 6, 2, 2)
  return [tue, tue + 1]
}
export const backToSchool = (year: number): [Day, Day] => [dayOfDate(year, 6, 20), dayOfDate(year, 8, 5)]
export const christmasDay = (year: number): Day => dayOfDate(year, 11, 25)
export { blackFridayDay, bfcmRange }

/**
 * Gift-demand bump (≥ 1) for a product with the given giftability on `day`.
 * Valentine's Feb 1–14 (+20%), Mother's Day 2 weeks (+25%, female/all audiences),
 * Father's Day 2 weeks (+20%, male/all audiences), Q4 gifting Nov 1 – Dec 22 (+30–60%).
 */
export function giftBump(day: Day, giftable: number, audience: 'female' | 'male' | 'all'): number {
  if (giftable <= 0) return 1
  const y = yearOf(day)
  const m = monthOf(day)
  let bump = 0
  if (m === 1 && domOf(day) <= 14) bump = Math.max(bump, 0.2 * (0.5 + 0.5 * (domOf(day) / 14)))
  const md = mothersDay(y)
  if (day >= md - 14 && day <= md) bump = Math.max(bump, 0.25 * (audience === 'male' ? 0.4 : 1))
  const fd = fathersDay(y)
  if (day >= fd - 14 && day <= fd) bump = Math.max(bump, 0.2 * (audience === 'female' ? 0.4 : 1))
  if (m === 10 || m === 11) {
    const bf = blackFridayDay(y)
    const dec15 = dayOfDate(y, 11, 15)
    const dec22 = dayOfDate(y, 11, 22)
    let q4 = 0
    if (day < bf) {
      const nov1 = dayOfDate(y, 10, 1)
      q4 = 0.3 + 0.15 * ((day - nov1) / Math.max(1, bf - nov1))
    } else if (day <= dec15) q4 = 0.6
    else if (day <= dec22) q4 = 0.4
    else if (day < christmasDay(y)) q4 = 0.12
    bump = Math.max(bump, q4)
  }
  return 1 + bump * giftable
}

/** "Oct 3" style date label */
export function shortDate(day: Day): string {
  const d = dateOfDay(day)
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCDate()}`
}
