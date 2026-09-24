// Order / customer / dispute derivations for the Shopifly admin pages (pure, UI-side).
import type { Chargeback, Day, GameState, Order, StoreProduct, SupportTicket } from '../../../../core/types'
import type { BadgeProgress, BadgeTone } from '../../../kit/polaris'
import { dayOf } from '../../../../core/time'
import { productImage } from '../../../../core/assets'
import { getProduct } from '../../../../sim/market'

export interface StatusBadge { label: string; tone?: BadgeTone; progress?: BadgeProgress }

/** Payment status badge, Shopify wording. */
export function paymentBadge(o: Order): StatusBadge {
  switch (o.financial) {
    case 'paid': return { label: 'Paid', progress: 'complete' }
    case 'partially_refunded': return { label: 'Partially refunded', progress: 'partiallyComplete' }
    case 'refunded': return { label: 'Refunded', progress: 'complete' }
    case 'disputed': return { label: 'Chargeback open', tone: 'critical', progress: 'incomplete' }
    case 'chargeback_won': return { label: 'Chargeback won', tone: 'success', progress: 'complete' }
    case 'chargeback_lost': return { label: 'Chargeback lost', tone: 'critical', progress: 'complete' }
  }
}

/** True while the supplier/3PL order has been placed but nothing has shipped yet. */
export const inProgress = (o: Order) => o.fulfillment === 'unfulfilled' && !o.cancelled && o.supplierOrderedHour != null

/** Waiting for the merchant (no fulfillment app, or the supplier charge failed). */
export const needsFulfillment = (o: Order) =>
  o.fulfillment === 'unfulfilled' && !o.cancelled && o.supplierOrderedHour == null &&
  (o.financial === 'paid' || o.financial === 'partially_refunded' || o.financial === 'disputed')

/** Fulfillment status badge, Shopify wording. */
export function fulfillmentBadge(o: Order): StatusBadge {
  if (o.cancelled) return { label: 'Canceled', progress: 'complete' }
  if (o.fulfillment === 'fulfilled' || o.fulfillment === 'delivered') return { label: 'Fulfilled', progress: 'complete' }
  if (inProgress(o)) return { label: 'In progress', tone: 'info', progress: 'partiallyComplete' }
  if (o.financial === 'refunded') return { label: 'Unfulfilled', progress: 'incomplete' }
  return { label: 'Unfulfilled', tone: 'attention', progress: 'incomplete' }
}

/** Delivery status column text ('' while nothing shipped). */
export function deliveryStatus(o: Order, today: Day): string {
  if (o.cancelled) return ''
  if (o.fulfillment === 'delivered') return 'Delivered'
  if (o.fulfillment === 'fulfilled') return o.deliverDay <= today ? 'Out for delivery' : 'In transit'
  return ''
}

export const deliveryMethod = (o: Order) => (o.shippingCharged > 0 ? 'Standard shipping' : 'Free shipping')

/** Closed orders live in the Archived view (settled, canceled or delivered with nothing open). */
export function isArchived(o: Order, openOrderIds: Set<number>): boolean {
  if (o.cancelled) return true
  if (o.financial === 'refunded' || o.financial === 'chargeback_lost' || o.financial === 'chargeback_won') return true
  return o.fulfillment === 'delivered' && o.financial !== 'disputed' && !openOrderIds.has(o.id)
}

/** Order ids with an open ticket or an active dispute. */
export function openOrderIdSet(tickets: SupportTicket[], chargebacks: Chargeback[]): Set<number> {
  const ids = new Set<number>()
  for (const t of tickets) if (t.status !== 'solved') ids.add(t.orderId)
  for (const c of chargebacks) if (c.status === 'needs_response' || c.status === 'submitted') ids.add(c.orderId)
  return ids
}

export const orderName = (id: number) => `#${id}`

/** Current title of the ordered product (falls back to the catalog name if it was deleted). */
export function productTitle(products: StoreProduct[], o: Pick<Order, 'storeProductId' | 'catalogId'>): string {
  const p = products.find(x => x.id === o.storeProductId)
  if (p) return p.title
  try {
    return getProduct(o.catalogId).name
  } catch {
    return 'Deleted product'
  }
}

/** Image for a store product: first media item, or the catalog photo. */
export function productThumb(products: StoreProduct[], storeProductId: string, catalogId: string): string {
  const p = products.find(x => x.id === storeProductId)
  return p?.media[0]?.src || productImage(catalogId)
}

export const itemsLabel = (qty: number) => `${qty} item${qty === 1 ? '' : 's'}`

/** Display tags Shopify apps would add to the order. */
export function orderTags(o: Order): string[] {
  const t: string[] = []
  if (o.recovered) t.push('Klavio recovered')
  if (o.customer.returning) t.push('Repeat customer')
  if (o.replacementSent) t.push('Replacement sent')
  if (o.discountCode) t.push(o.discountCode)
  return t
}

// ---------------------------------------------------------------------------
// Customers (derived from the retained order log)
// ---------------------------------------------------------------------------
export interface CustomerRow {
  id: string
  name: string
  email: string
  city: string
  region: string
  orders: number
  spent: number
  refunded: number
  firstHour: number
  lastHour: number
  orderIds: number[]
  /** accepted email marketing at checkout */
  subscribed: boolean
}

/** Stable pseudo-random 0..1 per string (email marketing consent, etc.). */
export function unitHash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

// ---------------------------------------------------------------------------
// Addresses (orders only keep city/state; street and ZIP are derived from the email)
// ---------------------------------------------------------------------------
const STREETS = ['Maple Ave', 'Oak St', 'Pine St', 'Cedar Ln', 'Elm St', 'Washington Blvd', 'Lakeview Dr', 'Park Ave', 'Sunset Blvd', 'Highland Ave', 'Main St', 'Willow Way', 'Chestnut St', 'Ridge Rd', 'Meadow Ln', 'Hillcrest Dr']

/** Deterministic street line for a customer (orders store only city/state). */
export function streetFor(email: string): string {
  const h = unitHash(email)
  const num = 100 + Math.floor(h * 9800)
  const street = STREETS[Math.floor(unitHash(`${email}#s`) * STREETS.length)]
  const apt = unitHash(`${email}#a`) < 0.3 ? `, Apt ${1 + Math.floor(unitHash(`${email}#n`) * 24)}` : ''
  return `${num} ${street}${apt}`
}

/** First three ZIP digits by state (ranges), so addresses read like "Austin TX 78704". */
const ZIP3: Record<string, [number, number]> = {
  AL: [350, 369], AK: [995, 999], AZ: [850, 865], AR: [716, 729], CA: [900, 961], CO: [800, 816], CT: [60, 69], DE: [197, 199],
  DC: [200, 205], FL: [320, 349], GA: [300, 319], HI: [967, 968], ID: [832, 838], IL: [600, 629], IN: [460, 479], IA: [500, 528],
  KS: [660, 679], KY: [400, 427], LA: [700, 714], ME: [39, 49], MD: [206, 219], MA: [10, 27], MI: [480, 499], MN: [550, 567],
  MS: [386, 397], MO: [630, 658], MT: [590, 599], NE: [680, 693], NV: [889, 898], NH: [30, 38], NJ: [70, 89], NM: [870, 884],
  NY: [100, 149], NC: [270, 289], ND: [580, 588], OH: [430, 459], OK: [730, 749], OR: [970, 979], PA: [150, 196], RI: [28, 29],
  SC: [290, 299], SD: [570, 577], TN: [370, 385], TX: [750, 799], UT: [840, 847], VT: [50, 59], VA: [220, 246], WA: [980, 994],
  WV: [247, 268], WI: [530, 549], WY: [820, 831],
}

/** Deterministic ZIP code for a customer in a state. */
export function zipFor(email: string, state: string): string {
  const [lo, hi] = ZIP3[state] ?? [100, 999]
  const z3 = lo + Math.floor(unitHash(`${email}#z`) * (hi - lo + 1))
  const z2 = Math.floor(unitHash(`${email}#zz`) * 100)
  return `${String(z3).padStart(3, '0')}${String(z2).padStart(2, '0')}`
}

/** Customer id used in URLs (customers/<id>). */
export const customerId = (email: string) => encodeURIComponent(email.toLowerCase())

/**
 * Group orders by email. `optInRate` = share of buyers who ticked "Email me with news and offers"
 * (the store module grows the list by ~45% of orders).
 */
export function deriveCustomers(orders: Order[], optInRate = 0.45): CustomerRow[] {
  const map = new Map<string, CustomerRow>()
  for (const o of orders) {
    const key = o.customer.email.toLowerCase()
    let c = map.get(key)
    if (!c) {
      c = {
        id: customerId(key), name: o.customer.name, email: o.customer.email, city: o.customer.city, region: o.customer.region,
        orders: 0, spent: 0, refunded: 0, firstHour: o.hour, lastHour: o.hour, orderIds: [],
        subscribed: unitHash(key) < optInRate,
      }
      map.set(key, c)
    }
    c.orders++
    c.spent += o.total - o.refunded
    c.refunded += o.refunded
    c.firstHour = Math.min(c.firstHour, o.hour)
    c.lastHour = Math.max(c.lastHour, o.hour)
    c.orderIds.push(o.id)
    c.city = o.customer.city
    c.region = o.customer.region
  }
  return [...map.values()]
}

// ---------------------------------------------------------------------------
// Ads (truth from ad stats; used for profit and marketing reports)
// ---------------------------------------------------------------------------
/** Ad name for an order's adId ('' when unknown / deleted). */
export function adName(s: GameState, adId: string | undefined): string {
  if (!adId) return ''
  return s.ads.ads.find(a => a.id === adId)?.name ?? ''
}

/** Ad spend per store product over [from, to] (from retained daily ad stats). */
export function adSpendByProduct(s: GameState, from: Day, to: Day): Record<string, number> {
  const out: Record<string, number> = {}
  for (const ad of s.ads.ads) {
    let spend = 0
    for (let d = Math.max(0, from); d <= to; d++) spend += ad.stats[d]?.spend ?? 0
    if (spend > 0) out[ad.storeProductId] = (out[ad.storeProductId] ?? 0) + spend
  }
  return out
}

/** Daily ad stats are kept this long before the ads module folds them into lifetime totals. */
const AD_STATS_DAYS = 120

/**
 * Ad spend per platform over [from, to]: what the ads actually spent each day (the same numbers
 * as Ads Manager and the attribution / profit reports). The P&L only books ad spend when the
 * platform bills the card (at thresholds), so it's used only for days older than the ad stats.
 */
export function adSpendByPlatform(s: GameState, from: Day, to: Day): { fadbook: number; tiktak: number } {
  const out = { fadbook: 0, tiktak: 0 }
  const statsFrom = Math.max(0, dayOf(s.time.hour) - AD_STATS_DAYS + 1)
  for (const ad of s.ads.ads) {
    for (let d = Math.max(statsFrom, from); d <= to; d++) {
      const st = ad.stats[d]
      if (st) out[ad.platform] += st.spend
    }
  }
  for (let d = Math.max(0, from); d <= Math.min(to, statsFrom - 1); d++) {
    const p = s.finance.pnl[d]
    if (!p) continue
    out.fadbook += p.adSpendFadbook
    out.tiktak += p.adSpendTiktak
  }
  return out
}

/** Orders placed within [from, to]. Orders are stored in id (= time) order. */
export function ordersInRange(orders: Order[], from: Day, to: Day): Order[] {
  const out: Order[] = []
  for (const o of orders) {
    const d = dayOf(o.hour)
    if (d >= from && d <= to) out.push(o)
  }
  return out
}
