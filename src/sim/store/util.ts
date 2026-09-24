// Shared helpers for the store module (internal).
import type { FulfillmentMode, GameState, InstalledApp, Order, ProductDef, SectionId, StoreProduct } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { themeDef, type ThemeDef } from '../../data/themes'
import { dayOf } from '../../core/time'
import { dutyPct as marketDutyPct, fulfillmentFor, getProduct } from '../market'

export const today = (s: GameState) => dayOf(s.time.hour)
export const r2 = (n: number) => Math.round(n * 100) / 100

/** Catalog definition (null if the catalog id is unknown). */
export function defOf(catalogId: string): ProductDef | null {
  try {
    return getProduct(catalogId)
  } catch {
    return null
  }
}

/** Import duty rate for a product: the market module's rate, else a deterministic rate within BENCHMARKS.shipping.chinaDutyPct. */
export function dutyPctFor(catalogId: string): number {
  try {
    const m = marketDutyPct(catalogId)
    if (m > 0) return m
  } catch { /* market unavailable (isolated tests) */ }
  let h = 2166136261
  for (let i = 0; i < catalogId.length; i++) {
    h ^= catalogId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const u = ((h >>> 0) % 10000) / 10000
  const [a, b] = BENCHMARKS.shipping.chinaDutyPct
  return a + (b - a) * u
}

export interface Fulfillment { mode: FulfillmentMode; unitCost: number; shipCost: number; shipDays: [number, number]; inStock: boolean }

/**
 * Fulfillment route for a product (market module), with a catalog-based fallback
 * (supplier cost + duty, AliExprez shipping) if the market has no cost data.
 */
export function fulfillment(s: GameState, catalogId: string): Fulfillment {
  let f: Fulfillment | null = null
  try {
    f = fulfillmentFor(s, catalogId)
  } catch {
    f = null
  }
  if (f && f.unitCost > 0) return f
  const d = defOf(catalogId)
  if (!d) return f ?? { mode: 'dropship', unitCost: 0, shipCost: 0, shipDays: [15, 30], inStock: true }
  return {
    mode: f?.mode ?? 'dropship',
    unitCost: r2(d.cogs * (1 + dutyPctFor(catalogId))),
    shipCost: d.shipCost,
    shipDays: f && f.shipDays[1] > 0 ? f.shipDays : d.shipDays,
    inStock: f?.inStock ?? true,
  }
}

export const isThreePl = (mode: FulfillmentMode) => mode === 'bulk' || mode === 'private_label'

/** US 3PL costs per order (pick & pack + domestic postage by weight). */
export function threePlCost(weightKg: number, qty: number): number {
  const pickPack = BENCHMARKS.shipping.threePlPickPackPerOrder
  return r2(pickPack + 4 + 1.5 * weightKg * qty)
}

// ---- apps ----
export const installedApp = (s: GameState, id: string): InstalledApp | undefined => s.store.apps.find(a => a.appId === id)
export const hasApp = (s: GameState, id: string) => s.store.apps.some(a => a.appId === id)
export const appPlanIdx = (s: GameState, id: string) => installedApp(s, id)?.planIdx ?? -1
export const hasReviewsApp = (s: GameState) => hasApp(s, 'judgyme') || hasApp(s, 'lookz') || hasApp(s, 'vitalz')

/** Simulated app effects (what apps really do; listings may over-promise). */
export const APP_SIM = {
  klavioRecovery: [0.06, 0.09] as [number, number],
  rekonvertTake: [[0.1, 0.12], [0.12, 0.14]] as [number, number][],
  rekonvertPriceShare: [0.25, 0.4] as [number, number],
  /** Gorgeous: ticket handling time −40% → tickets per hour ×1/0.6 */
  gorgeousSpeed: 1 / 0.6,
  /** Gorgeous Basic: WISMO auto-replies */
  gorgeousWismoCut: 0.5,
  trackwiseWismoCut: 0.35,
  klarnoFee: 0.06,
  klarnoCvr: 1.08,
  klarnoMinPrice: 60,
  pagefliDesign: 10,
  swiftspeed: 0.4,
  spinwheelSubscriberMult: 2,
  seoboostOrganic: 1.1,
} as const

// ---- plan / fees ----
export function planFees(s: GameState) {
  const plans = BENCHMARKS.fees.plans
  const plan = s.store.plan === 'trial' ? plans.basic : plans[s.store.plan]
  return plan
}
export const PLAN_LABEL: Record<GameState['store']['plan'], string> = {
  trial: 'Basic (trial)', basic: 'Basic', shopifly: 'Shopifly', advanced: 'Advanced',
}

export const theme = (s: GameState): ThemeDef => themeDef(s.store.theme.id)

/** Player-facing (parody) names for the checkout payment options in StoreState.payments. */
export const PAYMENT_LABELS: Record<keyof GameState['store']['payments'], string> = {
  paypal: 'PayPel', shopPay: 'Shopifly Pay', bnpl: 'Klarno Pay Later',
}

// ---- products / orders ----
export const findProduct = (s: GameState, id: string): StoreProduct | undefined => s.store.products.find(p => p.id === id)
export function findOrder(s: GameState, id: number): Order | undefined {
  const arr = s.store.orders
  // orders are appended in id order → binary search
  let lo = 0, hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = arr[mid].id
    if (v === id) return arr[mid]
    if (v < id) lo = mid + 1
    else hi = mid - 1
  }
  return arr.find(o => o.id === id)
}
export const sectionOn = (p: StoreProduct, id: SectionId) => p.sections.some(x => x.id === id && x.enabled)
export const sectionOf = (p: StoreProduct, id: SectionId) => p.sections.find(x => x.id === id)

/** Share of daily traffic in this hour ×24 (mean 1). */
export const hourCurve = (h: number) => BENCHMARKS.seasonality.trafficByHour[((h % 24) + 24) % 24] * 24

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'my-store'
}

/** 13.4 → 12.99, 14.0 → 13.99 */
export function roundTo99(x: number): number {
  return Math.max(0.99, Math.round(x) - 0.01)
}

export const storeDomain = (s: GameState) => s.store.customDomain ?? s.store.subdomain
export const supportEmail = (s: GameState) => `support@${s.store.customDomain ?? s.store.subdomain}`

/** Lifetime order count (survives order-history pruning). */
export const lifetimeOrders = (s: GameState) => s.store.lifetimeOrders ?? Math.max(0, s.store.orderSeq - 1001)
