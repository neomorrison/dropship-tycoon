// Funnel: organic traffic, the CVR model (SPEC §6), orders, per-ad conversions, analytics.
import type { ConversionEvent, Device, GameState, Order, PageGrade, ProductDef, StoreProduct, TrafficPacket, TrafficSource } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { DIFFICULTY } from '../../core/difficulty'
import { binomial, chance, clamp, lognormal, pick, rand, randInt, randRange, stochRound, weightedPick } from '../../core/rng'
import { dayOf, domOf, hourOfDay, isBfcm, monthOf, weekday } from '../../core/time'
import { addPnl } from '../../core/money'
import { notify } from '../../core/notify'
import { coachTip } from '../../core/notify'
import { money } from '../../core/format'
import { EMAIL_DOMAINS, FIRST_NAMES, LAST_NAMES, US_CITIES } from '../../data/customers'
import { sectionSettings } from '../../data/sections'
import { productAppeal } from '../market'
import { addSrc, dayRec, hourRec, productRec } from './analytics'
import { effectivePrice, effectivePromise, gradePage, hasBundles, realDeliveryWindow } from './grade'
import { PAYPAL_SHARE } from './analytics'
import {
  APP_SIM, appPlanIdx, defOf, dutyPctFor, fulfillment, hasApp, hourCurve, isThreePl, lifetimeOrders, planFees, r2, sectionOf,
  threePlCost, today,
} from './util'
import { takeInventory } from '../market'

// ---------------------------------------------------------------------------
// Conversion model
// ---------------------------------------------------------------------------
const DEVICE_MULT: Record<Device, number> = (() => {
  // Littledata: desktop converts ~1.58× mobile; normalized so the traffic-weighted mean is 1
  const m = 1 / (BENCHMARKS.store.mobileShare + BENCHMARKS.store.desktopShare * 1.58 + BENCHMARKS.store.tabletShare * 1.3)
  return { mobile: m, desktop: m * 1.58, tablet: m * 1.3 }
})()

export function absPriceBase(price: number): number {
  if (price <= 25) return 1.12
  if (price <= 50) return 1.0
  if (price <= 80) return 0.82
  if (price <= 130) return 0.66
  if (price <= 200) return 0.52
  return 0.42
}
export function priceFactor(r: number): number {
  if (r <= 1) return Math.min(1.3, 1 + 0.45 * (1 - r)) * (r < 0.45 ? 0.85 : 1)
  return Math.exp(-2.4 * (r - 1))
}

export interface CvrParts {
  /** final purchase probability per session */
  cvr: number
  /** propensity before checkout-stage factors (shipping cost & payment options) — drives ATC */
  pre: number
  factors: Record<string, number>
}

/** Page grade for conversion (cached at last save/rollover; computed if missing). */
export function gradeFor(s: GameState, p: StoreProduct): PageGrade {
  return p.grade ?? gradePage(s, p)
}

/**
 * CVR = 0.026 × appealF × priceF × absPriceF × grade.cvrMult × speedF × intent × messageMatch
 *       × shipF × payF × brandF × modifiers.cvrMult × seasonalCvr × weekdayCvr × noise   (cap 0.25)
 * Pass `noise: false` for the expected value.
 */
export function conversionParts(
  s: GameState, p: StoreProduct, packet: Pick<TrafficPacket, 'intent' | 'messageMatch'>, opts: { noise?: boolean; grade?: PageGrade } = {},
): CvrParts {
  const grade = opts.grade ?? gradeFor(s, p)
  const d = defOf(p.catalogId)
  const st = s.store
  const day = dayOf(s.time.hour)
  const price = effectivePrice(s, p)
  const pv = d?.perceivedValue ?? price
  let appeal = 1
  try { appeal = productAppeal(s, p.catalogId) } catch { appeal = 1 }
  const appealF = clamp(0.35 + 0.8 * appeal, 0.3, 1.6)
  const r = price / Math.max(0.01, pv)
  const priceF = priceFactor(r)
  // "raised to power (1.4 − trust) — trust softens high-ticket": the exponent softens the high-price
  // penalty (base < 1). Applied to the ≤$25 bonus (1.12) it would make LOW trust convert better, so it isn't.
  const base = absPriceBase(price)
  const absPriceF = base < 1 ? Math.pow(base, 1.4 - grade.trust) : base
  const speedF = Math.max(0.55, 1 - BENCHMARKS.store.cvrLossPerSecondSlow * Math.max(0, grade.loadTime - 2.5))
  const shipF = st.shipping.freeShipping ? 1 : st.shipping.freeOver != null ? (st.shipping.freeOver <= price ? 1 : 0.95) : 0.82
  let payF = 1
  if (st.payments.shopPay) payF *= 1.03
  if (st.payments.paypal) payF *= 1.04
  if (bnplActive(s) && price > APP_SIM.klarnoMinPrice) payF *= APP_SIM.klarnoCvr
  const f = fulfillment(s, p.catalogId)
  const brandF = f.mode === 'private_label' ? 1 + 0.15 * (d?.brandable ?? 0.5) : 1
  const mods = s.events?.modifiers
  const modF = mods?.cvrMult ?? 1
  const seasonal = isBfcm(day) ? BENCHMARKS.seasonality.bfcmCvrMult : BENCHMARKS.seasonality.cvrByMonth[monthOf(day)]
  let xmasF = 1
  if (monthOf(day) === 11 && domOf(day) >= 12 && domOf(day) <= 24 && d) {
    const daysLeft = 25 - domOf(day)
    if (realDeliveryWindow(s, p.catalogId)[1] > daysLeft) xmasF = 1 - 0.35 * d.giftable
  }
  const weekdayF = BENCHMARKS.seasonality.cvrByWeekday[weekday(day)]
  // lying about shipping converts a little better short-term (paid for later in chargebacks)
  const lieF = grade.shippingLie ? 1.05 : 1
  const noise = opts.noise === false ? 1 : lognormal(s, 0.18 * DIFFICULTY[s.meta.difficulty].noiseMult)
  const pre = 0.026 * appealF * priceF * absPriceF * grade.cvrMult * speedF * packet.intent * packet.messageMatch * brandF * modF * seasonal * xmasF * weekdayF * lieF * noise
  const cvr = Math.min(0.25, pre * shipF * payF)
  return {
    cvr,
    pre: Math.min(0.25, pre),
    factors: { appealF, priceF, absPriceF, cvrMult: grade.cvrMult, speedF, intent: packet.intent, messageMatch: packet.messageMatch, shipF, payF, brandF, modF, seasonal, xmasF, weekdayF, lieF, noise },
  }
}

export const bnplActive = (s: GameState) => s.store.payments.bnpl && hasApp(s, 'klarno')

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
function newCustomer(s: GameState): Order['customer'] {
  const first = pick(s, FIRST_NAMES)
  const last = pick(s, LAST_NAMES)
  const c = weightedPick(s, US_CITIES, x => x.pop)
  const dom = weightedPick(s, EMAIL_DOMAINS, x => x.weight).domain
  const style = randInt(s, 0, 3)
  const f = first.toLowerCase().replace(/[^a-z]/g, '')
  const l = last.toLowerCase().replace(/[^a-z]/g, '')
  const local = style === 0 ? `${f}.${l}` : style === 1 ? `${f}${l}${randInt(s, 1, 99)}` : style === 2 ? `${f[0]}${l}` : `${f}_${l}${randInt(s, 70, 2005)}`
  return { name: `${first} ${last}`, email: `${local}@${dom}`, city: c.city, region: c.state, returning: false }
}
function returningCustomer(s: GameState): Order['customer'] {
  const orders = s.store.orders
  if (orders.length) {
    const o = orders[Math.max(0, orders.length - 1 - Math.floor(rand(s) * Math.min(600, orders.length)))]
    return { ...o.customer, returning: true }
  }
  return { ...newCustomer(s), returning: true }
}
function pickDevice(s: GameState): Device {
  const r = rand(s)
  return r < BENCHMARKS.store.mobileShare ? 'mobile' : r < BENCHMARKS.store.mobileShare + BENCHMARKS.store.desktopShare ? 'desktop' : 'tablet'
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
interface OrderCtx {
  source: TrafficSource
  adId?: string
  device: Device
  returning: boolean
  recovered?: boolean
}

/** Create and record a paid order (money captured, analytics, repeat pipeline). Supplier payment happens in the fulfillment queue. */
export function createOrder(s: GameState, p: StoreProduct, grade: PageGrade, ctx: OrderCtx): Order {
  const st = s.store
  const d = defOf(p.catalogId)
  const day = today(s)
  const price = p.price
  const bundles = hasBundles(s, p)
  const autoDiscounts = st.discounts.filter(x => x.active && x.automatic)
  // ---- quantity ----
  let p2 = 0.04
  let p3 = 0.01
  if (bundles) {
    const scale = clamp(grade.aovMult, 1, 1.35) / 1.2
    p2 = randRange(s, 0.14, 0.22) * scale
    p3 = 0.05 * scale
  } else if (autoDiscounts.some(x => x.kind === 'quantity_break')) {
    p2 = 0.1
    p3 = 0.025
  }
  if (autoDiscounts.some(x => x.kind === 'bxgy')) p3 += 0.06
  const r = rand(s)
  const qty = r < p3 ? 3 : r < p3 + p2 ? 2 : 1
  const subtotal = r2(price * qty)
  // ---- discounts ----
  let discount = 0
  let discountCode: string | undefined
  if (bundles && qty >= 2) {
    const tiers = sectionSettings('bundle_offer', sectionOf(p, 'bundle_offer')?.settings).tiers
    const tier = tiers.filter(t => t.qty <= qty).sort((a, b) => b.qty - a.qty)[0]
    if (tier) discount += subtotal * clamp(tier.discountPct, 0, 60) / 100
  }
  let freeShipDiscount = false
  let best = 0
  let bestDisc: (typeof autoDiscounts)[number] | null = null
  for (const x of autoDiscounts) {
    let v = 0
    if (x.kind === 'percent') v = (subtotal - discount) * clamp(x.value, 0, 90) / 100
    else if (x.kind === 'fixed') v = Math.min(subtotal - discount, x.value)
    else if (x.kind === 'quantity_break' && qty >= 2) v = (subtotal - discount) * clamp(x.value, 0, 60) / 100
    else if (x.kind === 'bxgy' && qty >= 3) v = price
    else if (x.kind === 'free_shipping' && !st.shipping.freeShipping) {
      freeShipDiscount = true
      x.usage++
    }
    if (v > best) { best = v; bestDisc = x }
  }
  if (bestDisc) { bestDisc.usage++; discountCode = bestDisc.code }
  discount += best
  const codes = st.discounts.filter(x => x.active && !x.automatic)
  if (codes.length && chance(s, ctx.source === 'email' ? 0.35 : 0.08)) {
    const c = pick(s, codes)
    let v = 0
    if (c.kind === 'percent') v = (subtotal - discount) * clamp(c.value, 0, 90) / 100
    else if (c.kind === 'fixed') v = Math.min(subtotal - discount, c.value)
    else if (c.kind === 'free_shipping') freeShipDiscount = true
    if (v > 0 || c.kind === 'free_shipping') {
      discount += v
      c.usage++
      discountCode = c.code
    }
  }
  discount = r2(Math.min(subtotal, discount))
  // ---- shipping ----
  let shippingCharged = 0
  if (!st.shipping.freeShipping && !freeShipDiscount) {
    const after = subtotal - discount
    shippingCharged = st.shipping.freeOver != null && after >= st.shipping.freeOver ? 0 : r2(st.shipping.flatRate)
  }
  // ---- post-purchase upsell ----
  let upsell = 0
  if (hasApp(s, 'rekonvert')) {
    const [a, b] = APP_SIM.rekonvertTake[Math.min(1, Math.max(0, appPlanIdx(s, 'rekonvert')))]
    if (chance(s, randRange(s, a, b))) upsell = r2(price * randRange(s, APP_SIM.rekonvertPriceShare[0], APP_SIM.rekonvertPriceShare[1]))
  }
  const total = r2(subtotal - discount + shippingCharged + upsell)
  // ---- payment method & fees ----
  const plan = planFees(s)
  let paymentMethod: Order['paymentMethod'] = 'card'
  const pr = rand(s)
  if (bnplActive(s) && price > APP_SIM.klarnoMinPrice && pr < 0.12) paymentMethod = 'bnpl'
  else if (st.payments.paypal && pr < 0.12 + PAYPAL_SHARE) paymentMethod = 'paypal'
  else if (st.payments.shopPay && rand(s) < 0.38) paymentMethod = 'shop_pay'
  let fees: number
  if (paymentMethod === 'bnpl') fees = total * APP_SIM.klarnoFee + 0.3
  else if (paymentMethod === 'paypal') fees = total * (BENCHMARKS.fees.paypalPct + plan.thirdPartyFee) + BENCHMARKS.fees.paypalFixed
  else fees = total * plan.cardPct + plan.cardFixed
  fees = r2(fees)
  // ---- fulfillment route & costs ----
  let f = fulfillment(s, p.catalogId)
  let mode = f.mode
  if (isThreePl(mode)) {
    let ok = false
    try { ok = takeInventory(s, p.catalogId, qty) } catch { ok = false }
    if (!ok) {
      // stockout → falls back to slow AliExprez dropship
      mode = 'dropship'
      const cogs = d ? d.cogs * (1 + dutyPctFor(p.catalogId)) : f.unitCost
      f = { mode, unitCost: r2(cogs), shipCost: d?.shipCost ?? f.shipCost, shipDays: d?.shipDays ?? [15, 30], inStock: false }
      if (s.flags.storeStockoutDay !== day) {
        s.flags.storeStockoutDay = day
        notify(s, { kind: 'critical', title: `Out of stock at your 3PL: ${p.title.slice(0, 40)}`, body: 'New orders are falling back to slow AliExprez dropshipping. Reorder inventory now.', site: 'aliexprez', path: 'business' })
      }
    }
  }
  const unitCostAll = f.unitCost * qty
  const upsellCost = upsell * 0.35
  const shipCost = isThreePl(mode) ? threePlCost(p.weightKg, qty) : f.shipCost * (1 + 0.5 * (qty - 1))
  const defectMult = mode === 'agent' || mode === 'bulk' ? 0.6 : mode === 'private_label' ? 0.4 : 1
  const defective = chance(s, (d?.defectRate ?? 0.05) * defectMult)
  const promise = effectivePromise(p)
  const customer = ctx.returning ? returningCustomer(s) : newCustomer(s)
  const variant = p.variants[0]?.values.length ? pick(s, p.variants[0].values) : undefined

  const o: Order = {
    id: st.orderSeq++,
    hour: s.time.hour,
    storeProductId: p.id,
    catalogId: p.catalogId,
    qty,
    variant,
    subtotal,
    discount,
    shippingCharged,
    total,
    upsell,
    source: ctx.source,
    adId: ctx.adId,
    device: ctx.device,
    customer,
    financial: 'paid',
    fulfillment: 'unfulfilled',
    fulfilledBy: isThreePl(mode) ? '3pl' : 'dropship',
    shipDay: null,
    deliverDay: day + (isThreePl(mode) ? 5 : f.shipDays[1]),
    deliveredDay: null,
    promisedMaxDays: promise ? promise[1] : null,
    cogs: r2(unitCostAll + upsellCost),
    shippingCost: r2(shipCost),
    fees,
    refunded: 0,
    defective,
    mode,
    supplierOrderedHour: null,
    supplierCost: r2(unitCostAll + upsellCost + shipCost),
    paymentMethod,
    discountCode,
    honesty: grade.honesty,
    questionDay: chance(s, 0.03) ? day + randInt(s, 0, 2) : null,
    recovered: ctx.recovered || undefined,
  }
  st.orders.push(o)
  recordOrder(s, p, o, d)
  return o
}

/** Money capture + analytics + customers + repeat pipeline for a new order. */
function recordOrder(s: GameState, p: StoreProduct, o: Order, d: ProductDef | null) {
  const st = s.store
  const day = today(s)
  // money: revenue recognized now, net captured into the Shopifly balance
  addPnl(s, 'revenue', o.total)
  addPnl(s, 'paymentFees', o.fees)
  st.pendingBalance += o.total - o.fees
  const bb = (st.balanceBreakdown ??= { gross: 0, fees: 0, refunds: 0, adjustments: 0 })
  bb.gross += o.total
  bb.fees += o.fees
  st.lifetimeOrders = (st.lifetimeOrders ?? Math.max(0, o.id - 1001)) + 1
  st.lifetimeSales = (st.lifetimeSales ?? 0) + o.total
  // analytics
  const dr = dayRec(s, day)
  const gross = r2(o.subtotal + o.upsell)
  dr.orders++
  dr.units += o.qty + (o.upsell > 0 ? 1 : 0)
  dr.grossSales += gross
  dr.discounts += o.discount
  dr.shipping += o.shippingCharged
  dr.netSales += gross - o.discount
  dr.totalSales += o.total
  dr.cogs += o.cogs + o.shippingCost
  dr.fees += o.fees
  addSrc(dr.ordersBySource, o.source, 1)
  addSrc(dr.salesBySource, o.source, o.total)
  const pr = productRec(dr, p.id)
  pr.orders++
  pr.units += o.qty
  pr.sales += o.total
  if (o.customer.returning) { dr.returningCustomers++; st.customers.returning++ } else { dr.newCustomers++; st.customers.total++ }
  const hr = hourRec(s)
  hr.orders++
  hr.sales += o.total
  // repeat purchases for consumables
  if (d && d.repeatRate > 0) {
    const due = day + randInt(s, 25, 60)
    const boost = hasApp(s, 'klavio') ? 1.3 : 1
    const ex = st.repeatPipeline.find(x => x.storeProductId === p.id && x.day === due)
    if (ex) ex.count += d.repeatRate * boost
    else st.repeatPipeline.push({ catalogId: p.catalogId, storeProductId: p.id, day: due, count: d.repeatRate * boost })
  }
  // email list (marketing consent at checkout)
  const subMult = hasApp(s, 'spinwheel') ? APP_SIM.spinwheelSubscriberMult : 1
  st.emailSubscribers += stochRound(s, 0.45 * subMult)
  // hourly sale notification batch
  batchSale(s, o)
}

function batchSale(s: GameState, o: Order) {
  const st = s.store
  const b = st.saleBatch
  const existing = b && b.hour === s.time.hour ? s.notifications.find(n => n.id === b.notifId) : undefined
  if (b && existing) {
    b.count++
    b.amount = r2(b.amount + o.total)
    existing.title = `${b.count} new orders`
    existing.body = `${money(b.amount)} in sales this hour · latest #${o.id}`
    existing.amount = b.amount
    existing.path = 'orders'
    existing.read = false
    return
  }
  const id = notify(s, { kind: 'sale', title: `New order #${o.id}`, body: `${money(o.total)} · ${o.customer.city}, ${o.customer.region}`, site: 'shopifly', path: `orders/${o.id}`, amount: o.total })
  st.saleBatch = { hour: s.time.hour, count: 1, amount: o.total, notifId: id }
}

// ---------------------------------------------------------------------------
// Organic traffic
// ---------------------------------------------------------------------------
export function storeOrganicTraffic(s: GameState): TrafficPacket[] {
  const st = s.store
  if (!st.created) return []
  const active = st.products.filter(p => p.status === 'active')
  if (!active.length) return []
  const day = today(s)
  const h = hourOfDay(s.time.hour)
  const curve = hourCurve(h)
  const out: TrafficPacket[] = []
  // weights: products with recent orders get more direct/search visits
  const weights = active.map(p => {
    let w = 1
    for (let d = day - 7; d < day; d++) w += st.analytics.daily[d]?.byProduct[p.id]?.orders ?? 0
    return w
  })
  const spread = (total: number, source: TrafficSource, intent: number, messageMatch = 1, returning = false) => {
    const n = stochRound(s, total)
    if (n <= 0) return
    if (active.length === 1) {
      out.push({ source, storeProductId: active[0].id, sessions: n, intent, messageMatch, returning: returning || undefined })
      return
    }
    const wsum = weights.reduce((a, b) => a + b, 0)
    let left = n
    active.forEach((p, i) => {
      const k = i === active.length - 1 ? left : Math.min(left, stochRound(s, (n * weights[i]) / wsum))
      left -= k
      if (k > 0) out.push({ source, storeProductId: p.id, sessions: k, intent, messageMatch, returning: returning || undefined })
    })
  }
  // baseline search/direct: new stores get bots, spy tools and a few curious searchers
  // (~35 sessions a day, almost none of them buyers: a store can't live on unpaid traffic)
  const lo = lifetimeOrders(s)
  const seo = hasApp(s, 'seoboost') ? APP_SIM.seoboostOrganic : 1
  spread(0.8 * curve * seo, 'organic', 0.25)
  spread(0.65 * curve, 'direct', 0.05)
  // brand searches grow with the customer base
  spread(0.05 * Math.sqrt(lo) * curve * seo, 'organic', 1.4)
  // brand halo: people who saw your ads type the URL later
  const y = st.analytics.daily[day - 1]
  if (y) {
    const paid = (y.sessionsBySource.fadbook ?? 0) + (y.sessionsBySource.tiktak ?? 0) + (y.sessionsBySource.tiktak_organic ?? 0)
    if (paid > 0) spread((0.06 * paid * curve) / 24, 'direct', 1.3)
  }
  // influencer shoutouts / viral boosts (events module)
  const boost = s.events?.modifiers?.organicBoost ?? {}
  for (const p of active) {
    const b = boost[p.id]
    if (b && b > 0) {
      const n = stochRound(s, b * curve)
      if (n > 0) out.push({ source: 'influencer', storeProductId: p.id, sessions: n, intent: 1.1, messageMatch: 1.05 })
    }
  }
  // repeat customers (consumables): Klavio replenishment flows, otherwise some come back direct
  const klavio = hasApp(s, 'klavio')
  for (const e of st.repeatPipeline) {
    if (e.day !== day) continue
    const p = active.find(x => x.id === e.storeProductId)
    if (!p) continue
    const n = stochRound(s, (e.count * (klavio ? 6 : 4) * curve) / 24)
    if (n > 0) out.push({ source: klavio ? 'email' : 'direct', storeProductId: p.id, sessions: n, intent: klavio ? 3.0 : 2.2, messageMatch: 1.1, returning: true })
  }
  return out
}

// ---------------------------------------------------------------------------
// Process traffic
// ---------------------------------------------------------------------------
export function storeProcessTraffic(s: GameState, packets: TrafficPacket[]): ConversionEvent[] {
  const st = s.store
  if (!st.created) return []
  const events = new Map<string, ConversionEvent>()
  const grades = new Map<string, PageGrade>()
  const day = today(s)
  const dr = dayRec(s, day)
  const hr = hourRec(s)
  let hourSessions = 0
  let draftTraffic = 0
  const abandoned = st.abandoned && st.abandoned.day === day ? st.abandoned : (st.abandoned = { day, byProduct: {} })

  for (const pk of packets) {
    const p = st.products.find(x => x.id === pk.storeProductId)
    const sessions = stochRound(s, Math.max(0, pk.sessions))
    if (sessions <= 0) continue
    hourSessions += sessions
    // session analytics (also for broken links)
    dr.sessions += sessions
    addSrc(dr.sessionsBySource, pk.source, sessions)
    hr.sessions += sessions
    hr.visitors += Math.max(1, Math.round(sessions * 0.92))
    const mob = binomial(s, sessions, BENCHMARKS.store.mobileShare)
    const desk = binomial(s, sessions - mob, BENCHMARKS.store.desktopShare / (1 - BENCHMARKS.store.mobileShare))
    const tab = sessions - mob - desk
    dr.sessionsByDevice.mobile += mob
    dr.sessionsByDevice.desktop += desk
    dr.sessionsByDevice.tablet += tab
    for (const pl of ['fadbook', 'tiktak'] as const) if (st.pixel[pl].installed) st.pixel[pl].views += sessions
    if (!p || p.status !== 'active') {
      // 404 / password page: no conversions
      if (pk.adId) draftTraffic += sessions
      continue
    }
    productRec(dr, p.id).sessions += sessions
    let g = grades.get(p.id)
    if (!g) { g = gradeFor(s, p); grades.set(p.id, g) }
    const parts = conversionParts(s, p, pk, { grade: g })
    const devCounts: [Device, number][] = [['mobile', mob], ['desktop', desk], ['tablet', tab]]
    let purchases = 0
    const buyDevices: Device[] = []
    for (const [dev, n] of devCounts) {
      const k = binomial(s, n, Math.min(0.25, parts.cvr * DEVICE_MULT[dev]))
      purchases += k
      for (let i = 0; i < k; i++) buyDevices.push(dev)
    }
    // ATC ≈ purchases + rest × cvr×(2.6–3.6); checkout ≈ cvr×(1.6–2.1). Better pages sit at the low end of both
    // ranges (carts convert more efficiently), matching Littledata's ATC→order ratios.
    const q = clamp((g.cvrMult - 0.45) / 0.9, 0, 1)
    const atcK = clamp(3.6 - q + randRange(s, -0.15, 0.15), 2.6, 3.6)
    const chkK = clamp(2.1 - 0.5 * q + randRange(s, -0.08, 0.08), 1.6, 2.1)
    const atcExtra = binomial(s, sessions - purchases, Math.min(0.6, parts.pre * atcK))
    const atc = purchases + atcExtra
    const pCheckout = clamp((parts.pre * chkK - parts.cvr) / Math.max(1e-6, parts.pre * atcK), 0, 0.95)
    const checkout = purchases + binomial(s, atcExtra, pCheckout)
    const abandons = checkout - purchases
    dr.atc += atc
    dr.checkout += checkout
    dr.converted += purchases
    hr.atc += atc
    hr.checkout += checkout
    productRec(dr, p.id).atc += atc
    if (abandons > 0) {
      abandoned.byProduct[p.id] = (abandoned.byProduct[p.id] ?? 0) + abandons
      st.emailSubscribers += stochRound(s, abandons * 0.3 * (hasApp(s, 'spinwheel') ? APP_SIM.spinwheelSubscriberMult : 1))
    }
    for (const pl of ['fadbook', 'tiktak'] as const) {
      if (!st.pixel[pl].installed) continue
      st.pixel[pl].atc += atc
      st.pixel[pl].purchases += purchases
    }
    let revenue = 0
    for (const dev of buyDevices) {
      const o = createOrder(s, p, g, { source: pk.source, adId: pk.adId, device: dev, returning: !!pk.returning })
      revenue += o.total
    }
    if (pk.adId) {
      const ev = events.get(pk.adId) ?? { adId: pk.adId, atc: 0, checkouts: 0, purchases: 0, revenue: 0 }
      ev.atc += atc
      ev.checkouts += checkout
      ev.purchases += purchases
      ev.revenue = r2(ev.revenue + revenue)
      events.set(pk.adId, ev)
    }
  }

  // Klavio abandoned-checkout recoveries due this hour
  if (st.recovery?.length) {
    const due = st.recovery.filter(x => x.hour <= s.time.hour)
    if (due.length) {
      st.recovery = st.recovery.filter(x => x.hour > s.time.hour)
      for (const r of due) {
        const p = st.products.find(x => x.id === r.storeProductId && x.status === 'active')
        if (!p) continue
        const g = grades.get(p.id) ?? gradeFor(s, p)
        for (let i = 0; i < r.count; i++) {
          dr.sessions++
          addSrc(dr.sessionsBySource, 'email', 1)
          const dev = pickDevice(s)
          dr.sessionsByDevice[dev]++
          dr.converted++
          dr.checkout++
          dr.atc++
          hr.sessions++
          hr.visitors++
          hourSessions++
          productRec(dr, p.id).sessions++
          createOrder(s, p, g, { source: 'email', device: dev, returning: false, recovered: true })
          for (const pl of ['fadbook', 'tiktak'] as const) if (st.pixel[pl].installed) st.pixel[pl].purchases++
        }
      }
    }
  }

  st.liveVisitors = hourSessions > 0 ? Math.max(0, Math.round(hourSessions * 0.09 * lognormal(s, 0.25))) : 0
  if (draftTraffic >= 5) {
    coachTip(s, 'store_ads_to_draft', `Your ads are sending people to a product that isn't live (${draftTraffic} visits this hour hit a dead page). Set the product to Active in Shopifly or pause those ads. You're paying for traffic that can't buy.`, { app: 'shopifly', essential: true, cooldownHours: 24 })
  }
  return [...events.values()]
}
