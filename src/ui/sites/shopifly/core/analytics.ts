// Analytics helpers for the Shopifly admin: metric definitions (Shopify wording), range
// aggregation, and chart series with an aligned comparison period.
import type { Day, GameState, StoreDay, StoreHour } from '../../../../core/types'
import type { ChartFormat, LineChartPoint } from '../../../kit/charts'
import { emptyStoreDay, storeRange } from '../../../../sim/store'
import { formatDate, hourAt, rangeDays, type DateRange } from '../../../../core/time'
import { clock } from './format'

export type MetricKey =
  | 'totalSales' | 'grossSales' | 'netSales' | 'orders' | 'units' | 'sessions' | 'conversionRate' | 'aov'
  | 'returningRate' | 'atcRate' | 'checkoutRate' | 'discounts' | 'returns'

export interface MetricDef {
  label: string
  format: ChartFormat
  /** definition shown on the dotted-underline title */
  tip: string
  /** lower is better (delta badge colors) */
  invert?: boolean
  /** rate metrics are recomputed from sums, never summed */
  rate?: boolean
}

export const METRICS: Record<MetricKey, MetricDef> = {
  totalSales: { label: 'Total sales', format: 'money', tip: 'Gross sales, minus discounts and returns, plus shipping and taxes.' },
  grossSales: { label: 'Gross sales', format: 'money', tip: 'Product price × quantity sold, before discounts, shipping, taxes and returns.' },
  netSales: { label: 'Net sales', format: 'money', tip: 'Gross sales minus discounts and returns. Excludes shipping and taxes.' },
  orders: { label: 'Orders', format: 'number', tip: 'Number of orders placed.' },
  units: { label: 'Items ordered', format: 'number', tip: 'Total quantity of products ordered.' },
  sessions: { label: 'Sessions', format: 'number', tip: 'A session is a period of continuous activity from a visitor on your online store.' },
  conversionRate: { label: 'Conversion rate', format: 'percent', rate: true, tip: 'Percentage of sessions that resulted in an order.' },
  aov: { label: 'Average order value', format: 'money', rate: true, tip: 'Gross sales minus discounts, divided by the number of orders.' },
  returningRate: { label: 'Returning customer rate', format: 'percent', rate: true, tip: 'Percentage of customers who placed more than one order in your store.' },
  atcRate: { label: 'Added to cart', format: 'percent', rate: true, tip: 'Percentage of sessions in which a visitor added a product to their cart.' },
  checkoutRate: { label: 'Reached checkout', format: 'percent', rate: true, tip: 'Percentage of sessions in which a visitor reached the checkout page.' },
  discounts: { label: 'Discounts', format: 'money', invert: true, tip: 'Value of discount codes and automatic discounts applied to orders.' },
  returns: { label: 'Returns', format: 'money', invert: true, tip: 'Value of refunds issued in the period.' },
}

/** Aggregated StoreDay for a range plus the derived rates. */
export interface Agg extends StoreDay {
  conversionRate: number
  aov: number
  returningRate: number
  atcRate: number
  checkoutRate: number
}

const div = (a: number, b: number) => (b ? a / b : 0)

export function withRates(d: StoreDay): Agg {
  return {
    ...d,
    conversionRate: div(d.converted, d.sessions),
    aov: div(d.grossSales - d.discounts, d.orders),
    returningRate: div(d.returningCustomers, d.newCustomers + d.returningCustomers),
    atcRate: div(d.atc, d.sessions),
    checkoutRate: div(d.checkout, d.sessions),
  }
}

/** Sum over a range (days before day 0 contribute nothing). */
export function aggregate(s: GameState, range: DateRange | null): Agg {
  if (!range || range.to < 0) return withRates(emptyStoreDay())
  return withRates(storeRange(s, range))
}

export function metricOf(a: Agg, key: MetricKey): number {
  switch (key) {
    case 'totalSales': return a.totalSales
    case 'grossSales': return a.grossSales
    case 'netSales': return a.netSales
    case 'orders': return a.orders
    case 'units': return a.units
    case 'sessions': return a.sessions
    case 'conversionRate': return a.conversionRate
    case 'aov': return a.aov
    case 'returningRate': return a.returningRate
    case 'atcRate': return a.atcRate
    case 'checkoutRate': return a.checkoutRate
    case 'discounts': return a.discounts
    case 'returns': return a.returns
  }
}

function dayValue(d: StoreDay | undefined, key: MetricKey): number {
  if (!d) return 0
  return metricOf(withRates(d), key)
}

function hourValue(h: StoreHour | undefined, key: MetricKey, returning?: [number, number]): number {
  if (!h) return 0
  switch (key) {
    case 'totalSales': case 'grossSales': case 'netSales': return h.sales
    case 'orders': case 'units': return h.orders
    case 'sessions': return h.sessions
    case 'conversionRate': return div(h.orders, h.sessions)
    case 'aov': return div(h.sales, h.orders)
    case 'atcRate': return div(h.atc, h.sessions)
    case 'checkoutRate': return div(h.checkout, h.sessions)
    case 'returningRate': return returning ? div(returning[0], returning[0] + returning[1]) : 0
    case 'discounts': case 'returns': return 0
  }
}

/** Hourly analytics are kept for 72h; older single-day ranges fall back to daily buckets. */
export function hourlyAvailable(s: GameState, range: DateRange): boolean {
  if (rangeDays(range) > 2) return false
  const oldest = hourAt(Math.max(0, range.from), 0)
  return s.time.hour - oldest <= 72
}

/** Returning-vs-new orders per absolute hour (for the hourly returning-customer chart). */
function returningByHour(s: GameState, from: Day, to: Day): Map<number, [number, number]> {
  const m = new Map<number, [number, number]>()
  for (const o of s.store.orders) {
    const d = Math.floor(o.hour / 24)
    if (d < from || d > to) continue
    const cur = m.get(o.hour) ?? [0, 0]
    cur[o.customer.returning ? 0 : 1]++
    m.set(o.hour, cur)
  }
  return m
}

/**
 * Chart points for a metric over `range`, with the comparison period aligned by position
 * (hour-of-day for 1–2 day ranges, day index otherwise). Buckets after "now" are null so
 * the current line stops at the present, like Shopify.
 */
export function seriesPoints(s: GameState, key: MetricKey, range: DateRange, cmp: DateRange | null): LineChartPoint[] {
  const now = s.time.hour
  const hourly = hourlyAvailable(s, range) && (!cmp || hourlyAvailable(s, cmp) || cmp.to < 0)
  const out: LineChartPoint[] = []
  if (hourly) {
    const n = rangeDays(range) * 24
    const multi = rangeDays(range) > 1
    const ret = key === 'returningRate' ? returningByHour(s, Math.min(range.from, cmp?.from ?? range.from), range.to) : undefined
    for (let i = 0; i < n; i++) {
      const t = hourAt(range.from, 0) + i
      const day = Math.floor(t / 24)
      // single-day charts label the x-axis with the clock only
      const label = multi ? `${formatDate(day, 'md')}, ${clock(t)}` : clock(t)
      const value = t > now ? null : day < 0 ? 0 : hourValue(s.store.analytics.hourly[t], key, ret?.get(t))
      const p: LineChartPoint = { label, value }
      if (cmp) {
        const ct = hourAt(cmp.from, 0) + i
        const cday = Math.floor(ct / 24)
        p.compare = cday < 0 ? 0 : hourValue(s.store.analytics.hourly[ct], key, ret?.get(ct))
        p.compareLabel = `${formatDate(cday, 'md')}, ${clock(ct)}`
      }
      out.push(p)
    }
    return out
  }
  const n = rangeDays(range)
  for (let i = 0; i < n; i++) {
    const day = range.from + i
    const value = day < 0 ? 0 : day > Math.floor(now / 24) ? null : dayValue(s.store.analytics.daily[day], key)
    const p: LineChartPoint = { label: formatDate(day, 'md'), value }
    if (cmp) {
      const cday = cmp.from + i
      p.compare = cday < 0 ? 0 : dayValue(s.store.analytics.daily[cday], key)
      p.compareLabel = formatDate(cday, 'md')
    }
    out.push(p)
  }
  return out
}

/** Compact numbers for sparklines (one value per bucket, current period only). */
export function sparkValues(s: GameState, key: MetricKey, range: DateRange): number[] {
  return seriesPoints(s, key, range, null).map(p => (p.value ?? 0))
}

/** Per-day values of a metric for a range (days before 0 are zeros). */
export function dailyValues(s: GameState, key: MetricKey, range: DateRange): number[] {
  const out: number[] = []
  for (let d = range.from; d <= range.to; d++) out.push(d < 0 ? 0 : dayValue(s.store.analytics.daily[d], key))
  return out
}

/** Shopify-style formatting of a headline metric value. */
export function formatMetric(key: MetricKey, v: number): string {
  const f = METRICS[key].format
  if (f === 'money') return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (f === 'percent') return `${(Number.isFinite(v) ? v * 100 : 0).toFixed(2)}%`
  return Math.round(v).toLocaleString('en-US')
}

/**
 * All-zero series render as the chart's empty state (the chart otherwise auto-scales a flat
 * zero line to an arbitrary 0–4 axis, e.g. 0–400% for rates).
 */
export function zeroToEmpty(points: LineChartPoint[]): LineChartPoint[] {
  const any = points.some(p => (p.value ?? 0) !== 0 || (p.compare ?? 0) !== 0)
  return any ? points : points.map(p => ({ ...p, value: null, compare: p.compare === undefined ? undefined : null }))
}
