// Shopifly admin formatting helpers (dates the way the Shopify admin writes them).
// Game time only has whole hours, so display minutes come from a stable hash of the
// record id: timestamps look like "3:17 pm" instead of every order landing on ":00".
import type { Day, Hour } from '../../../../core/types'
import { dateOfDay, dayOf, formatDate, hourOfDay, monthName, weekdayName } from '../../../../core/time'
import { ui } from '../../../../core/ui'

/** Stable 0..59 minute offset for a record id (orders, tickets, disputes). */
export function minuteOf(id: string | number): number {
  const str = String(id)
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 60
}

/**
 * Display minute for an event stamped at `hour`: a stable hash of its id, except that events in the
 * hour now under way never show a minute later than the in-game clock.
 */
export function eventMinute(id: string | number, hour: Hour, now?: Hour): number {
  const m = minuteOf(id)
  if (now === undefined || hour < now) return m
  const live = Math.floor((ui().hourFrac || 0) * 60)
  return Math.min(m, live)
}

/** Cap an explicit display minute for an event in the hour now under way. */
export function capMinute(minute: number, hour: Hour, now: Hour): number {
  return hour < now ? minute : Math.min(minute, Math.floor((ui().hourFrac || 0) * 60))
}

/** "3:17 pm" (Shopify admin uses lowercase am/pm). */
export function clock(hour: Hour, minute = 0): string {
  const h = hourOfDay(hour)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(minute).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/**
 * Orders-list style date: "Today at 3:17 pm", "Yesterday at 9:02 am", "Wednesday at 1:40 pm"
 * (within the last week), "Mar 5 at 3:17 pm" (this year), "Mar 5, 2025".
 */
export function listDate(hour: Hour, now: Hour, id?: string | number): string {
  const d = dayOf(hour)
  const today = dayOf(now)
  const t = clock(hour, id === undefined ? 0 : eventMinute(id, hour, now))
  if (d === today) return `Today at ${t}`
  if (d === today - 1) return `Yesterday at ${t}`
  if (today - d < 7 && d < today) return `${weekdayName(d, true)} at ${t}`
  if (dateOfDay(d).getUTCFullYear() === dateOfDay(today).getUTCFullYear()) return `${formatDate(d, 'md')} at ${t}`
  return formatDate(d, 'short')
}

/** "March 5, 2026 at 3:17 pm" */
export function longDateTime(hour: Hour, id?: string | number, now?: Hour): string {
  const d = dateOfDay(dayOf(hour))
  return `${monthName(d.getUTCMonth(), true)} ${d.getUTCDate()}, ${d.getUTCFullYear()} at ${clock(hour, id === undefined ? 0 : eventMinute(id, hour, now))}`
}

/** "March 5, 2026" */
export function longDate(day: Day): string {
  const d = dateOfDay(day)
  return `${monthName(d.getUTCMonth(), true)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** "Mar 5" / "Mar 5, 2025" when not the current year. */
export function shortDate(day: Day, today: Day): string {
  return dateOfDay(day).getUTCFullYear() === dateOfDay(today).getUTCFullYear() ? formatDate(day, 'md') : formatDate(day, 'short')
}

/** "just now", "3 hours ago", "yesterday", "5 days ago", "Mar 5" */
export function timeAgo(hour: Hour, now: Hour): string {
  const dh = now - hour
  if (dh < 1) return 'just now'
  if (dh < 24) return `${dh} hour${dh === 1 ? '' : 's'} ago`
  const dd = dayOf(now) - dayOf(hour)
  if (dd <= 1) return 'yesterday'
  if (dd < 7) return `${dd} days ago`
  return shortDate(dayOf(hour), dayOf(now))
}

/** Short relative label for inbox lists: "2h", "Yesterday", "Mar 5". */
export function inboxTime(hour: Hour, now: Hour, id?: string | number): string {
  const d = dayOf(hour)
  const today = dayOf(now)
  if (d === today) return clock(hour, id === undefined ? 0 : eventMinute(id, hour, now))
  if (d === today - 1) return 'Yesterday'
  if (today - d < 7) return weekdayName(d)
  return shortDate(d, today)
}

/** "in 3 days" / "tomorrow" / "today" / "2 days ago" for a calendar day. */
export function dayDistance(day: Day, today: Day): string {
  const d = day - today
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d === -1) return 'yesterday'
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}

/** 0.0231 → "2.31%"; non-finite → "0%" (Shopify shows 0% rather than a dash). */
export function pct2(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '0%'
  return `${(x * 100).toFixed(digits)}%`
}

/** 1234.5 → "$1,234.50" (negative: "-$12.00"). */
export function usd(n: number, cents = true): string {
  const neg = n < 0
  const body = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
  return `${neg ? '-' : ''}$${body}`
}

/** 12840 → "12,840" */
export const int = (n: number) => Math.round(n).toLocaleString('en-US')

export const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n === 1 ? one : many}`

/** Masked card-style tracking display: "LX2837…19CN" */
export function trackingShort(t: string): string {
  return t.length > 14 ? `${t.slice(0, 6)}…${t.slice(-4)}` : t
}
