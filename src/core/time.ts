// Calendar helpers. Day 0 = 2026-03-02 (Monday). Absolute hour 0 = 00:00 of day 0.
// All dates computed in UTC to avoid DST drift.
import type { Day, Hour } from './types'

export const START_DATE = '2026-03-02'
export const START_HOUR = 7 // new games begin at 7:00 AM on day 0
const START_MS = Date.UTC(2026, 2, 2)
const DAY_MS = 86_400_000

export const dayOf = (hour: Hour): Day => Math.floor(hour / 24)
export const hourOfDay = (hour: Hour) => ((hour % 24) + 24) % 24
export const hourAt = (day: Day, h = 0): Hour => day * 24 + h

export const dateOfDay = (day: Day) => new Date(START_MS + day * DAY_MS)
export const dayOfDate = (y: number, m0: number, d: number): Day => Math.round((Date.UTC(y, m0, d) - START_MS) / DAY_MS)
export const dayOfIso = (iso: string): Day => {
  const [y, m, d] = iso.split('-').map(Number)
  return dayOfDate(y, m - 1, d)
}
/** 0 = Monday … 6 = Sunday */
export const weekday = (day: Day) => ((day % 7) + 7) % 7
export const isWeekend = (day: Day) => weekday(day) >= 5
export const monthOf = (day: Day) => dateOfDay(day).getUTCMonth()
export const yearOf = (day: Day) => dateOfDay(day).getUTCFullYear()
export const domOf = (day: Day) => dateOfDay(day).getUTCDate()
export const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate()
export const firstOfNextMonth = (day: Day): Day => {
  const d = dateOfDay(day)
  return dayOfDate(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}
export const firstOfMonth = (day: Day): Day => {
  const d = dateOfDay(day)
  return dayOfDate(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

export const isBusinessDay = (day: Day) => !isWeekend(day)
export function addBusinessDays(day: Day, n: number): Day {
  let d = day
  let left = n
  while (left > 0) {
    d++
    if (isBusinessDay(d)) left--
  }
  return d
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function formatDate(day: Day, style: 'short' | 'medium' | 'long' | 'iso' | 'md' = 'medium'): string {
  const d = dateOfDay(day)
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate()
  switch (style) {
    case 'iso': return `${y}-${String(m + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    case 'md': return `${MONTHS[m]} ${dd}`
    case 'short': return `${MONTHS[m]} ${dd}, ${y}`
    case 'long': return `${WEEKDAYS_LONG[weekday(day)]}, ${MONTHS_LONG[m]} ${dd}, ${y}`
    default: return `${WEEKDAYS[weekday(day)]}, ${MONTHS[m]} ${dd}, ${y}`
  }
}
export const monthName = (m0: number, long = false) => (long ? MONTHS_LONG : MONTHS)[m0]
export const weekdayName = (day: Day, long = false) => (long ? WEEKDAYS_LONG : WEEKDAYS)[weekday(day)]

/** "7:00 AM"; frac (0..1) adds minutes within the hour */
export function formatClock(hour: Hour, frac = 0): string {
  const h = hourOfDay(hour)
  const min = Math.floor(frac * 60 / 10) * 10
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// ---- Retail calendar ----
/** Black Friday = day after the 4th Thursday of November */
export function blackFridayDay(year: number): Day {
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay() // 0=Sun
  const firstThu = 1 + ((4 - nov1 + 7) % 7)
  return dayOfDate(year, 10, firstThu + 21 + 1)
}
/** BFCM window: Thanksgiving Thursday .. Cyber Monday */
export function bfcmRange(year: number): [Day, Day] {
  const bf = blackFridayDay(year)
  return [bf - 1, bf + 3]
}
export const isBfcm = (day: Day) => {
  const [a, b] = bfcmRange(yearOf(day))
  return day >= a && day <= b
}
export const isLateDec = (day: Day) => monthOf(day) === 11 && domOf(day) >= 20

/** Chinese New Year (Spring Festival) dates */
export const CNY_DATES: Record<number, string> = {
  2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03', 2031: '2031-01-23',
  2032: '2032-02-11', 2033: '2033-01-31', 2034: '2034-02-19', 2035: '2035-02-08', 2036: '2036-01-28',
  2037: '2037-02-15', 2038: '2038-02-04', 2039: '2039-01-24', 2040: '2040-02-12',
}
export function nextCny(fromDay: Day): { year: number; day: Day } | null {
  for (const [y, iso] of Object.entries(CNY_DATES)) {
    const d = dayOfIso(iso)
    if (d >= fromDay - 30) return { year: Number(y), day: d }
  }
  return null
}

// ---- Date ranges (inclusive days) for analytics & ads ----
export interface DateRange { from: Day; to: Day }
export const rangeToday = (today: Day): DateRange => ({ from: today, to: today })
export const rangeYesterday = (today: Day): DateRange => ({ from: today - 1, to: today - 1 })
/** last N complete days NOT including today (Ads-Manager style) */
export const rangeLastN = (today: Day, n: number): DateRange => ({ from: today - n, to: today - 1 })
/** last N days INCLUDING today (Shopify style) */
export const rangeLastNIncl = (today: Day, n: number): DateRange => ({ from: today - n + 1, to: today })
export const rangeLifetime = (today: Day): DateRange => ({ from: 0, to: today })
export const rangeDays = (r: DateRange) => r.to - r.from + 1
/** the equal-length range immediately before r (for "vs previous period") */
export const previousRange = (r: DateRange): DateRange => ({ from: r.from - rangeDays(r), to: r.from - 1 })
export function* eachDay(r: DateRange) { for (let d = Math.max(0, r.from); d <= r.to; d++) yield d }
