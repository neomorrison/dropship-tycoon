// Date-range presets & month-grid math for the in-game calendar (Day 0 = Mon Mar 2, 2026).
// Shared by the Polaris (Shopifly analytics) and Ads Manager (Fadbook/TikTak) date pickers.
import { useMemo, useState } from 'react'
import type { Day } from '../../../core/types'
import {
  dateOfDay, dayOfDate, daysInMonth, firstOfMonth, formatDate, monthName, rangeLastN, rangeLastNIncl,
  type DateRange,
} from '../../../core/time'

export type { DateRange }

/** Shopify-analytics presets (ranges INCLUDE today, like Shopify). */
export type ShopPresetId =
  | 'today' | 'yesterday' | 'last7' | 'last30' | 'last90' | 'last365'
  | 'lastMonth' | 'weekToDate' | 'monthToDate' | 'quarterToDate' | 'yearToDate' | 'allTime'
/** Ads-Manager presets (last-N ranges EXCLUDE today, like Meta/TikTok). */
export type AdsPresetId = 'today' | 'yesterday' | 'last7' | 'last14' | 'last30' | 'thisMonth' | 'lastMonth' | 'maximum'
export type DatePresetId = ShopPresetId | AdsPresetId

export interface DateRangeValue {
  /** preset id, or 'custom' for a hand-picked range */
  preset: DatePresetId | 'custom'
  range: DateRange
}

export interface PresetDef { id: DatePresetId; label: string }

export const SHOP_PRESETS: PresetDef[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'last365', label: 'Last 365 days' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'weekToDate', label: 'Week to date' },
  { id: 'monthToDate', label: 'Month to date' },
  { id: 'quarterToDate', label: 'Quarter to date' },
  { id: 'yearToDate', label: 'Year to date' },
  { id: 'allTime', label: 'All time' },
]

export const ADS_PRESETS: PresetDef[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last14', label: 'Last 14 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'maximum', label: 'Maximum' },
]

/**
 * Resolve a preset to a concrete inclusive day range.
 * `style: 'shop'` → last-N includes today; `style: 'ads'` → last-N are complete days before today.
 */
export function resolvePreset(id: DatePresetId, today: Day, style: 'shop' | 'ads' = 'shop'): DateRange {
  const lastN = (n: number) => (style === 'ads' ? rangeLastN(today, n) : rangeLastNIncl(today, n))
  switch (id) {
    case 'today': return { from: today, to: today }
    case 'yesterday': return { from: today - 1, to: today - 1 }
    case 'last7': return lastN(7)
    case 'last14': return lastN(14)
    case 'last30': return lastN(30)
    case 'last90': return lastN(90)
    case 'last365': return lastN(365)
    case 'thisMonth':
    case 'monthToDate': return { from: firstOfMonth(today), to: today }
    case 'lastMonth': {
      const first = firstOfMonth(today)
      return { from: firstOfMonth(first - 1), to: first - 1 }
    }
    case 'weekToDate': {
      // Shopify weeks start Sunday; game weekday() is 0=Mon … 6=Sun
      const jsDow = dateOfDay(today).getUTCDay()
      return { from: today - jsDow, to: today }
    }
    case 'quarterToDate': {
      const d = dateOfDay(today)
      const q0 = Math.floor(d.getUTCMonth() / 3) * 3
      return { from: dayOfDate(d.getUTCFullYear(), q0, 1), to: today }
    }
    case 'yearToDate': {
      const d = dateOfDay(today)
      return { from: dayOfDate(d.getUTCFullYear(), 0, 1), to: today }
    }
    case 'allTime':
    case 'maximum': return { from: 0, to: today }
  }
}

/** Build a DateRangeValue for a preset. */
export const presetValue = (id: DatePresetId, today: Day, style: 'shop' | 'ads' = 'shop'): DateRangeValue => ({
  preset: id,
  range: resolvePreset(id, today, style),
})

/**
 * Date-range state that keeps rolling forward as in-game days pass: preset ranges are
 * re-resolved against `today`, custom ranges stay fixed.
 *
 *   const [range, setRange] = useDateRangeState(today, 'last30', 'shop')
 *   <DateRangePicker today={today} value={range} onChange={setRange} />
 */
export function useDateRangeState(today: Day, initial: DatePresetId = 'last30', style: 'shop' | 'ads' = 'shop'): [DateRangeValue, (v: DateRangeValue) => void] {
  const [v, setV] = useState<DateRangeValue>(() => presetValue(initial, today, style))
  const live = useMemo<DateRangeValue>(
    () => (v.preset === 'custom' ? v : { preset: v.preset, range: resolvePreset(v.preset, today, style) }),
    [v, today, style],
  )
  return [live, setV]
}

/** "Mar 3 – Mar 9, 2026" / "Mar 3, 2026" / "Dec 28, 2026 – Jan 3, 2027" */
export function formatRange(r: DateRange): string {
  if (r.from === r.to) return formatDate(r.from, 'short')
  const a = dateOfDay(r.from)
  const b = dateOfDay(r.to)
  if (a.getUTCFullYear() === b.getUTCFullYear()) return `${formatDate(r.from, 'md')} – ${formatDate(r.to, 'short')}`
  return `${formatDate(r.from, 'short')} – ${formatDate(r.to, 'short')}`
}

/** Label for a preset id (falls back to the formatted range for custom). */
export function presetLabel(v: DateRangeValue): string {
  if (v.preset === 'custom') return formatRange(v.range)
  const def = [...SHOP_PRESETS, ...ADS_PRESETS].find(p => p.id === v.preset)
  return def ? def.label : formatRange(v.range)
}

export interface MonthCell {
  day: Day
  dom: number
  inMonth: boolean
}

/** 6×7 calendar grid (weeks start Sunday, US style) for a month of the in-game calendar. */
export function monthGrid(year: number, month0: number): MonthCell[][] {
  const first = dayOfDate(year, month0, 1)
  const lead = dateOfDay(first).getUTCDay() // 0=Sun
  const start = first - lead
  const n = daysInMonth(year, month0)
  const weeks: MonthCell[][] = []
  for (let w = 0; w < 6; w++) {
    const row: MonthCell[] = []
    for (let i = 0; i < 7; i++) {
      const day = start + w * 7 + i
      const idx = day - first
      row.push({ day, dom: dateOfDay(day).getUTCDate(), inMonth: idx >= 0 && idx < n })
    }
    weeks.push(row)
  }
  // drop a trailing all-next-month week to keep the grid compact
  if (!weeks[5].some(c => c.inMonth)) weeks.pop()
  return weeks
}

/** { year, month0 } for a game day */
export function ymOf(day: Day): { year: number; month0: number } {
  const d = dateOfDay(day)
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() }
}
export const monthTitle = (year: number, month0: number) => `${monthName(month0, true)} ${year}`
export const WEEKDAY_INITIALS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** Step a {year, month0} pair by delta months. */
export function addMonths(ym: { year: number; month0: number }, delta: number) {
  const t = ym.year * 12 + ym.month0 + delta
  return { year: Math.floor(t / 12), month0: ((t % 12) + 12) % 12 }
}

/** Parse "YYYY-MM-DD" or "Mar 5, 2026" into a game Day (null if unparseable). */
export function parseDayInput(text: string): Day | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim())
  if (iso) return dayOfDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const t = Date.parse(text.trim() + ' UTC')
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  return dayOfDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** Analytics comparison modes ("Compare to: Previous period"). */
export type ComparisonMode = 'previous_period' | 'previous_year' | 'none'

/** The range to compare against, or null for 'none'. */
export function comparisonRange(r: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === 'none') return null
  if (mode === 'previous_year') return { from: r.from - 364, to: r.to - 364 } // same weekday alignment, like Shopify
  const len = r.to - r.from + 1
  return { from: r.from - len, to: r.from - 1 }
}
