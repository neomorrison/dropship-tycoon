// Store analytics: StoreDay/StoreHour records, range sums, chart series, break-even.
import type { Day, GameState, Hour, StoreDay, StoreHour, TrafficSource } from '../../core/types'
import { dayOf, eachDay, formatClock, formatDate, hourAt, rangeDays, type DateRange } from '../../core/time'
import { safeDiv } from '../../core/format'
import { BENCHMARKS } from '../../data/benchmarks'
import { findProduct, fulfillment, isThreePl, planFees, r2, threePlCost } from './util'
import { effectivePrice } from './grade'

export function emptyStoreDay(): StoreDay {
  return {
    sessions: 0, sessionsBySource: {}, sessionsByDevice: { mobile: 0, desktop: 0, tablet: 0 }, atc: 0, checkout: 0,
    converted: 0, orders: 0, units: 0, grossSales: 0, discounts: 0, returns: 0, netSales: 0, shipping: 0, taxes: 0,
    totalSales: 0, newCustomers: 0, returningCustomers: 0, ordersBySource: {}, salesBySource: {}, byProduct: {}, cogs: 0, fees: 0,
  }
}
export const emptyStoreHour = (): StoreHour => ({ sessions: 0, orders: 0, sales: 0, atc: 0, checkout: 0, visitors: 0 })

export function dayRec(s: GameState, day: Day = dayOf(s.time.hour)): StoreDay {
  return (s.store.analytics.daily[day] ??= emptyStoreDay())
}
export function hourRec(s: GameState, hour: Hour = s.time.hour): StoreHour {
  return (s.store.analytics.hourly[hour] ??= emptyStoreHour())
}
export function productRec(d: StoreDay, spId: string) {
  return (d.byProduct[spId] ??= { sessions: 0, atc: 0, orders: 0, units: 0, sales: 0 })
}
export const addSrc = (m: Partial<Record<TrafficSource, number>>, k: TrafficSource, v: number) => {
  m[k] = (m[k] ?? 0) + v
}

/** Sum StoreDay over a range. */
export function storeRange(s: GameState, range: DateRange): StoreDay {
  const out = emptyStoreDay()
  for (const d of eachDay(range)) {
    const x = s.store.analytics.daily[d]
    if (!x) continue
    out.sessions += x.sessions
    out.atc += x.atc
    out.checkout += x.checkout
    out.converted += x.converted
    out.orders += x.orders
    out.units += x.units
    out.grossSales += x.grossSales
    out.discounts += x.discounts
    out.returns += x.returns
    out.netSales += x.netSales
    out.shipping += x.shipping
    out.taxes += x.taxes
    out.totalSales += x.totalSales
    out.newCustomers += x.newCustomers
    out.returningCustomers += x.returningCustomers
    out.cogs += x.cogs
    out.fees += x.fees
    for (const [k, v] of Object.entries(x.sessionsBySource)) addSrc(out.sessionsBySource, k as TrafficSource, v ?? 0)
    for (const [k, v] of Object.entries(x.ordersBySource)) addSrc(out.ordersBySource, k as TrafficSource, v ?? 0)
    for (const [k, v] of Object.entries(x.salesBySource)) addSrc(out.salesBySource, k as TrafficSource, v ?? 0)
    out.sessionsByDevice.mobile += x.sessionsByDevice.mobile
    out.sessionsByDevice.desktop += x.sessionsByDevice.desktop
    out.sessionsByDevice.tablet += x.sessionsByDevice.tablet
    for (const [id, bp] of Object.entries(x.byProduct)) {
      const o = productRec(out, id)
      o.sessions += bp.sessions
      o.atc += bp.atc
      o.orders += bp.orders
      o.units += bp.units
      o.sales += bp.sales
    }
  }
  return out
}

export type StoreMetric = 'totalSales' | 'netSales' | 'orders' | 'sessions' | 'conversionRate' | 'aov' | 'atcRate' | 'returningRate'

function dayMetric(d: StoreDay, m: StoreMetric): number {
  switch (m) {
    case 'totalSales': return r2(d.totalSales)
    case 'netSales': return r2(d.netSales)
    case 'orders': return d.orders
    case 'sessions': return d.sessions
    case 'conversionRate': return safeDiv(d.converted, d.sessions)
    case 'aov': return r2(safeDiv(d.grossSales - d.discounts, d.orders))
    case 'atcRate': return safeDiv(d.atc, d.sessions)
    case 'returningRate': return safeDiv(d.returningCustomers, d.newCustomers + d.returningCustomers)
  }
}

/** Chart series: hourly buckets for ≤2-day ranges, else daily. Future buckets are omitted. */
export function storeSeries(s: GameState, metric: StoreMetric, range: DateRange): { t: number; label: string; value: number }[] {
  const now = s.time.hour
  const today = dayOf(now)
  const out: { t: number; label: string; value: number }[] = []
  if (rangeDays(range) <= 2) {
    const multiDay = rangeDays(range) > 1
    // returning customers per hour come from the order log
    const returningByHour = new Map<number, [number, number]>()
    if (metric === 'returningRate') {
      for (const o of s.store.orders) {
        const d = dayOf(o.hour)
        if (d < range.from || d > range.to) continue
        const cur = returningByHour.get(o.hour) ?? [0, 0]
        cur[o.customer.returning ? 0 : 1]++
        returningByHour.set(o.hour, cur)
      }
    }
    for (let d = Math.max(0, range.from); d <= range.to; d++) {
      for (let h = 0; h < 24; h++) {
        const t = hourAt(d, h)
        if (t > now) break
        const x = s.store.analytics.hourly[t]
        let value = 0
        if (x) {
          switch (metric) {
            case 'totalSales': case 'netSales': value = r2(x.sales); break
            case 'orders': value = x.orders; break
            case 'sessions': value = x.sessions; break
            case 'conversionRate': value = safeDiv(x.orders, x.sessions); break
            case 'aov': value = r2(safeDiv(x.sales, x.orders)); break
            case 'atcRate': value = safeDiv(x.atc, x.sessions); break
            case 'returningRate': {
              const r = returningByHour.get(t)
              value = r ? safeDiv(r[0], r[0] + r[1]) : 0
              break
            }
          }
        }
        out.push({ t, label: multiDay ? `${formatDate(d, 'md')}, ${formatClock(t)}` : formatClock(t), value })
      }
    }
    return out
  }
  for (let d = Math.max(0, range.from); d <= Math.min(range.to, today); d++) {
    const x = s.store.analytics.daily[d]
    out.push({ t: d, label: formatDate(d, 'md'), value: x ? dayMetric(x, metric) : 0 })
  }
  return out
}

/**
 * Unit economics at the current price: landed cost (unit incl. import duty + shipping
 * [+ 3PL pick/pack]), payment fees, margin, break-even CPA and ROAS (Infinity when margin ≤ 0).
 */
export function breakEven(s: GameState, storeProductId: string): { landedCost: number; fees: number; margin: number; breakEvenCpa: number; breakEvenRoas: number } {
  const p = findProduct(s, storeProductId)
  if (!p) return { landedCost: 0, fees: 0, margin: 0, breakEvenCpa: 0, breakEvenRoas: 0 }
  const f = fulfillment(s, p.catalogId)
  const price = effectivePrice(s, p)
  const landed = f.unitCost + (isThreePl(f.mode) ? threePlCost(p.weightKg, 1) : f.shipCost)
  const plan = planFees(s)
  let fees = price * plan.cardPct + plan.cardFixed
  if (s.store.payments.paypal) {
    const share = PAYPAL_SHARE
    const pp = price * (BENCHMARKS.fees.paypalPct + plan.thirdPartyFee) + BENCHMARKS.fees.paypalFixed
    fees = fees * (1 - share) + pp * share
  }
  const margin = price - landed - fees
  return {
    landedCost: r2(landed),
    fees: r2(fees),
    margin: r2(margin),
    breakEvenCpa: r2(Math.max(0, margin)),
    breakEvenRoas: margin > 0 ? Math.round((price / margin) * 100) / 100 : Infinity,
  }
}

/** Share of checkouts paid with the wallet option (payments.paypal) when it's enabled. */
export const PAYPAL_SHARE = 0.22

/** Keep all StoreDays; drop byProduct older than 120 days and hourly older than 72h. */
export function pruneAnalytics(s: GameState, day: Day) {
  const a = s.store.analytics
  const cutoffDay = day - 120
  for (const k of Object.keys(a.daily)) {
    const d = Number(k)
    if (d < cutoffDay && Object.keys(a.daily[d].byProduct).length) a.daily[d].byProduct = {}
  }
  const cutoffHour = s.time.hour - 72
  for (const k of Object.keys(a.hourly)) if (Number(k) < cutoffHour) delete a.hourly[Number(k)]
}

/** Orders per day over the last N days (incl. today). */
export function ordersLastDays(s: GameState, n: number): number {
  const today = dayOf(s.time.hour)
  let t = 0
  for (let d = today - n + 1; d <= today; d++) t += s.store.analytics.daily[d]?.orders ?? 0
  return t
}
