// Daily/hourly market simulation: product releases, competitor entry/exit & saturation,
// public AliExprez stats, your own sales tally, sample & bulk arrivals, sourcing unlocks,
// 3PL storage fees, stock warnings and the Mineo renewal.
import type { CatalogSales, CatalogState, GameState, ProductDef, ProductMarket } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { PRODUCTS } from '../../data/products'
import { dayOf, domOf, formatDate, hourOfDay } from '../../core/time'
import { pay } from '../../core/money'
import { mail, notify } from '../../core/notify'
import { binomial, clamp, lognormal, poisson, randn, stochRound } from '../../core/rng'
import { money, num } from '../../core/format'
import { findProduct } from './catalog'
import { hrand } from './noise'
import { AGENT, THREE_PL, dropshipFulfillment, spyToolRenewal, threePlDays } from './sourcing'
import { saturationOf, trendIndexAt, trendShock } from './trend'

const r2 = (x: number) => Math.round(x * 100) / 100
const HIST_EVERY = 2
const HIST_MAX = 45
export const AGENT_UNLOCK_ORDERS = 100
export const PRIVATE_LABEL_UNLOCK_ORDERS = 500

export function createCatalogState(_s: GameState): CatalogState {
  return {
    available: [], market: {}, favorites: [], samples: [], samplesOwned: [], bulkOrders: [], inventory: {}, sourcing: {},
    unlocks: { agent: false, threePL: false, privateLabel: false, spyTool: false }, spyToolUntilDay: null, research: {},
    sales: {}, salesCountedOrderId: 0, spyToolAutoRenew: false,
  }
}

// ---------------------------------------------------------------------------
// Market state
// ---------------------------------------------------------------------------
const ratingTarget = (p: ProductDef) => clamp(p.publicSignals.rating - 1.2 * p.defectRate, 3.5, 4.95)

/** Lowest price among stores advertising it: undercut perceived value more as the market saturates. */
function floorPrice(p: ProductDef, saturation: number, landed: number, day: number): number {
  const wobble = 0.97 + 0.06 * hrand(p.id, 'floor', Math.floor(day / 10))
  const v = Math.max(landed * 1.45, p.perceivedValue * (0.97 - 0.42 * saturation) * wobble)
  return Math.max(0.99, Math.floor(v) + 0.99 - (v < 10 ? 0.5 : 0))
}

export function initMarketEntry(s: GameState, p: ProductDef, day: number): ProductMarket {
  const ti = trendIndexAt(p, day)
  const c = p.startCompetitors
  const sat = saturationOf(c)
  const f = dropshipFulfillment(s, p)
  return {
    competitors: c,
    saturation: Math.round(sat * 1000) / 1000,
    trendIndex: ti,
    trendIndex14: trendIndexAt(p, day - 14),
    orders30d: Math.round(p.publicSignals.ordersBase * ti * (1 + c / 25)),
    rating: Math.round(ratingTarget(p) * 100) / 100,
    reviews: p.publicSignals.reviews,
    competitorPrice: floorPrice(p, sat, f.unitCost + f.shipCost, day),
    yourShare: 0,
    hist: [],
  }
}

function ensureCatalogShape(s: GameState) {
  const c = s.catalog
  c.sales ??= {}
  c.salesCountedOrderId ??= 0
  const day = dayOf(s.time.hour)
  for (const p of PRODUCTS) if (!c.market[p.id]) c.market[p.id] = initMarketEntry(s, p, day)
}

export function marketOnNewGame(s: GameState): void {
  const day = dayOf(s.time.hour)
  ensureCatalogShape(s)
  s.catalog.available = PRODUCTS.filter(p => p.releaseDay <= day).map(p => p.id)
  for (const id of s.catalog.available) pushHist(s.catalog.market[id], day, true)
}

function pushHist(m: ProductMarket, day: number, force = false) {
  if (!force && day % HIST_EVERY !== 0) return
  const h = (m.hist ??= [])
  if (h.length && h[h.length - 1][0] === day) h.pop()
  h.push([day, Math.round(m.orders30d), m.competitors, Math.round(m.trendIndex * 100)])
  if (h.length > HIST_MAX) h.splice(0, h.length - HIST_MAX)
}

// ---------------------------------------------------------------------------
// Your sales (counted from store.orders)
// ---------------------------------------------------------------------------
const emptySales = (): CatalogSales => ({ orders: 0, units: 0, revenue: 0, costs: 0, dropshipUnits: 0, daily: [] })

export function countSales(s: GameState): void {
  const orders = s.store?.orders
  if (!orders?.length) return
  const c = s.catalog
  const last = c.salesCountedOrderId ?? 0
  const fresh: typeof orders = []
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i]
    if (o.id <= last) break
    fresh.push(o)
  }
  if (!fresh.length) return
  const sales = (c.sales ??= {})
  let maxId = last
  for (let i = fresh.length - 1; i >= 0; i--) {
    const o = fresh[i]
    maxId = Math.max(maxId, o.id)
    if (!o.catalogId) continue
    const st = (sales[o.catalogId] ??= emptySales())
    st.orders += 1
    st.units += o.qty
    st.revenue += o.total
    st.costs += o.cogs + o.shippingCost + o.fees
    if (o.fulfilledBy === 'dropship') st.dropshipUnits += o.qty
    const d = dayOf(o.hour)
    let bucket = st.daily.find(b => b[0] === d)
    if (!bucket) {
      bucket = [d, 0, 0, 0]
      st.daily.push(bucket)
      st.daily.sort((a, b) => a[0] - b[0])
    }
    bucket[1] += 1
    bucket[2] += o.qty
    bucket[3] = r2(bucket[3] + o.total)
  }
  c.salesCountedOrderId = maxId
  const cutoff = dayOf(s.time.hour) - 30
  for (const st of Object.values(sales)) if (st.daily.length && st.daily[0][0] < cutoff) st.daily = st.daily.filter(b => b[0] >= cutoff)
}

/** Your revenue/units for a product over the last `days` days (incl. today). */
export function recentSales(s: GameState, catalogId: string, days: number): { orders: number; units: number; revenue: number } {
  const st = s.catalog.sales?.[catalogId]
  const out = { orders: 0, units: 0, revenue: 0 }
  if (!st) return out
  const from = dayOf(s.time.hour) - days + 1
  for (const [d, o, u, r] of st.daily) if (d >= from) {
    out.orders += o
    out.units += u
    out.revenue += r
  }
  return out
}
/** Daily revenue for one product on a given day. */
export function salesOnDay(s: GameState, catalogId: string, day: number): number {
  return s.catalog.sales?.[catalogId]?.daily.find(b => b[0] === day)?.[3] ?? 0
}
export const lifetimeStoreOrders = (s: GameState) => Object.values(s.catalog.sales ?? {}).reduce((a, st) => a + st.orders, 0)

// ---------------------------------------------------------------------------
// Daily rollover
// ---------------------------------------------------------------------------
export function marketDayRollover(s: GameState, day: number): void {
  ensureCatalogShape(s)
  countSales(s)
  releaseProducts(s, day)
  for (const id of s.catalog.available) {
    const p = findProduct(id)
    if (p) evolve(s, p, s.catalog.market[id], day)
  }
  processArrivals(s, day, false)
  unlockChecks(s)
  if (domOf(day) === 1) storageFees(s, day)
  stockWarnings(s, day)
  spyToolRenewal(s, day)
}

function releaseProducts(s: GameState, day: number) {
  const c = s.catalog
  const fresh = PRODUCTS.filter(p => p.releaseDay <= day && !c.available.includes(p.id))
  if (!fresh.length) return
  for (const p of fresh) {
    c.available.push(p.id)
    c.market[p.id] = initMarketEntry(s, p, day)
    pushHist(c.market[p.id], day, true)
  }
  if (day === 0) return
  notify(s, {
    kind: 'info',
    title: fresh.length === 1 ? `New on AliExprez: ${fresh[0].name}` : `${fresh.length} new products on AliExprez`,
    body: fresh.length === 1 ? 'Just listed by the supplier. Early listings have few competitors — and no track record.' : fresh.map(p => p.name).join(' · '),
    site: 'aliexprez', path: fresh.length === 1 ? `item/${fresh[0].id}` : 'new',
  })
}

function evolve(s: GameState, p: ProductDef, m: ProductMarket, day: number) {
  const ti = trendIndexAt(p, day) * trendShock(s, p.id)
  m.trendIndex14 = trendIndexAt(p, day - 14)
  m.trendIndex = ti
  const your7 = recentSales(s, p.id, 7)
  const privateLabel = s.catalog.sourcing[p.id]?.mode === 'private_label'
  // Competitor entry: stores chase what is trending and what is visibly selling.
  const attract = clamp(p.baseDemand / 0.8, 0.35, 1.15)
  let lambda = 0.12 * ti * (1 + m.orders30d / 20_000) * attract
  // Spy tools surface your ads once you spend real money: copycats follow (branding halves it).
  if (your7.revenue > 0) lambda += 0.04 * Math.min(3, your7.revenue / 7 / 500) * (privateLabel ? 0.5 : 1)
  const entries = poisson(s, lambda)
  // Exit: unprofitable/declining products shed advertisers.
  const churn = 0.004 + (ti < 0.5 ? 0.01 : 0) + (p.baseDemand < 0.45 ? 0.006 : 0)
  const exits = binomial(s, m.competitors, churn)
  m.competitors = Math.max(0, m.competitors + entries - exits)
  m.saturation = Math.round(saturationOf(m.competitors) * 1000) / 1000
  // Public 30-day order count (rolling window → ~10-day lag), incl. what YOU buy from the supplier.
  const yourDropship30 = Math.round((s.catalog.sales?.[p.id]?.dropshipUnits ?? 0) > 0 ? recentDropshipUnits(s, p.id) : 0)
  const target = p.publicSignals.ordersBase * ti * (1 + m.competitors / 25) * lognormal(s, 0.08) + yourDropship30
  m.orders30d = Math.max(0, Math.round(m.orders30d + (target - m.orders30d) * 0.1))
  m.reviews += stochRound(s, (m.orders30d / 30) * 0.03)
  m.rating = Math.round(clamp(m.rating + (ratingTarget(p) - m.rating) * 0.05 + randn(s) * 0.008, 3.5, 4.95) * 100) / 100
  const f = dropshipFulfillment(s, p)
  m.competitorPrice = floorPrice(p, m.saturation, f.unitCost + f.shipCost, day)
  const yourUnits = your7.units
  const market7 = (m.orders30d * 7) / 30
  m.yourShare = yourUnits > 0 ? Math.round((yourUnits / (yourUnits + market7)) * 1000) / 1000 : 0
  pushHist(m, day)
}

function recentDropshipUnits(s: GameState, catalogId: string): number {
  // dropship share of your recent units ≈ lifetime dropship share × last-30-day units
  const st = s.catalog.sales?.[catalogId]
  if (!st || !st.units) return 0
  return recentSales(s, catalogId, 30).units * (st.dropshipUnits / st.units)
}

// ---------------------------------------------------------------------------
// Hourly
// ---------------------------------------------------------------------------
export function marketTickHour(s: GameState): void {
  countSales(s)
  // Couriers deliver early afternoon.
  if (hourOfDay(s.time.hour) === 13) processArrivals(s, dayOf(s.time.hour), true)
}

function processArrivals(s: GameState, day: number, includeToday: boolean) {
  const c = s.catalog
  const due = (d: number) => (includeToday ? d <= day : d < day)
  for (const smp of c.samples) {
    if (smp.received || !due(smp.arriveDay)) continue
    smp.received = true
    if (!c.samplesOwned.includes(smp.catalogId)) c.samplesOwned.push(smp.catalogId)
    const p = findProduct(smp.catalogId)
    notify(s, {
      kind: 'success', title: `Sample delivered: ${p?.name ?? 'product'}`,
      body: 'Check the build quality yourself — and you can now film your own creatives with it.',
      site: 'studio',
    })
  }
  for (const o of c.bulkOrders) {
    const p = findProduct(o.catalogId)
    if (!p) continue
    if (o.status === 'production' && day >= o.shipDay) {
      o.status = 'in_transit'
      notify(s, { kind: 'info', title: `Shipped: ${num(o.qty)} × ${p.name}`, body: `${o.method === 'sea' ? 'Ocean freight' : 'Air freight'} — ETA ${formatDate(o.arriveDay, 'md')} at ${THREE_PL.name}.`, site: 'aliexprez', path: 'business' })
      mail(s, {
        ...AGENT, tag: 'supplier', site: 'aliexprez', path: 'business',
        subject: `Shipped — ${num(o.qty)} × ${o.brandName ? `${o.brandName} ` : ''}${p.name}`,
        body: `Hi!\n\nQC passed and your goods left the factory today. ${o.method === 'sea' ? `The container sails from Yantian; ocean transit is about ${Math.round((o.arriveDay - o.shipDay) * 0.8)} days plus customs.` : 'Air freight via Hong Kong, customs clearance on arrival.'}\n\nEstimated delivery to ${THREE_PL.name}: ${formatDate(o.arriveDay, 'long')}.\n\nI'll keep an eye on it.\n\nLily`,
      })
    }
    if (o.status === 'in_transit' && due(o.arriveDay)) {
      o.status = 'received'
      const inv = (c.inventory[o.catalogId] ??= { units: 0, avgCost: 0 })
      const unitLanded = o.total / Math.max(1, o.qty)
      inv.avgCost = r2((inv.units * inv.avgCost + o.qty * unitLanded) / Math.max(1, inv.units + o.qty))
      inv.units += o.qty
      const src = (c.sourcing[o.catalogId] ??= { mode: 'dropship' })
      let switched = ''
      if (o.kind === 'private_label' && src.mode !== 'private_label') {
        src.mode = 'private_label'
        if (o.brandName) src.brandName = o.brandName
        switched = ` Fulfillment switched to your ${o.brandName ?? 'private-label'} stock.`
      } else if (o.kind === 'bulk' && (src.mode === 'dropship' || src.mode === 'agent')) {
        src.mode = 'bulk'
        switched = ' Fulfillment switched to 3PL stock.'
      }
      const [lo, hi] = threePlDays()
      notify(s, { kind: 'success', title: `Stock received: ${num(o.qty)} × ${p.name}`, body: `Orders now ship from the US in ${lo}–${hi} days.${switched} Update the delivery promise on your product page.`, site: 'aliexprez', path: 'business' })
      mail(s, {
        from: THREE_PL.from, fromEmail: THREE_PL.fromEmail, tag: 'supplier', site: 'aliexprez', path: 'business',
        subject: `Inbound received: ${num(o.qty)} units — ${p.name}`,
        body: `Hello,\n\nYour inbound shipment has been received, counted and put away.\n\nSKU: ${p.name}${o.brandName ? ` (${o.brandName})` : ''}\nUnits received: ${num(o.qty)}\nOn hand: ${num(inv.units)}\n\nStorage is billed at ${money(BENCHMARKS.shipping.threePlStoragePerUnitMonth)}/unit/month on the 1st. Pick & pack is ${money(BENCHMARKS.shipping.threePlPickPackPerOrder)} per order plus postage.\n\nThanks for shipping with ${THREE_PL.name}!`,
      })
    }
  }
}

function unlockChecks(s: GameState) {
  const c = s.catalog
  const total = lifetimeStoreOrders(s)
  if (!c.unlocks.agent && total >= AGENT_UNLOCK_ORDERS) {
    c.unlocks.agent = true
    c.unlocks.threePL = true
    notify(s, { kind: 'success', title: 'Sourcing agent unlocked', body: 'A sourcing agent reached out — faster shipping, lower unit costs, QC, and bulk orders to a US warehouse.', site: 'mail' })
    const top = Object.entries(c.sales ?? {}).sort((a, b) => b[1].orders - a[1].orders)[0]
    const topName = top ? findProduct(top[0])?.name : undefined
    mail(s, {
      ...AGENT, tag: 'supplier', site: 'aliexprez', path: 'business',
      subject: 'Lower your cost & ship in 7 days? — SourcePro',
      body: [
        'Hello!',
        '',
        `My name is Lily, I'm a sourcing agent in Shenzhen. I noticed your store is getting consistent orders${topName ? ` on the ${topName}` : ''} — congrats, you passed ${AGENT_UNLOCK_ORDERS} orders!`,
        '',
        'Most stores at your stage are overpaying on AliExprez and waiting 2–4 weeks for delivery. We work directly with factories:',
        '',
        '• Unit price usually 20–30% below AliExprez',
        '• Express line to the US: 6–10 days + customs, duty cleared for you',
        '• QC inspection on every unit (about 40% fewer defects)',
        '• Bulk orders shipped to a US 3PL so customers get it in 2–5 days',
        '• Custom packaging and private label when you are ready',
        '',
        'Reply or request a quote for any product from the Business tab. No fees until you place orders.',
        '',
        'Best,',
        'Lily Chen',
        'SourcePro Sourcing',
      ].join('\n'),
    })
  }
  if (!c.unlocks.privateLabel) {
    const star = Object.entries(c.sales ?? {}).find(([, st]) => st.orders >= PRIVATE_LABEL_UNLOCK_ORDERS)
    if (star) {
      c.unlocks.privateLabel = true
      c.unlocks.agent = true
      c.unlocks.threePL = true
      const p = findProduct(star[0])
      notify(s, { kind: 'success', title: 'Private label unlocked', body: `${p?.name ?? 'Your best seller'} passed ${PRIVATE_LABEL_UNLOCK_ORDERS} orders. Put your own brand on it.`, site: 'aliexprez', path: 'business' })
      if (p) mail(s, {
        ...AGENT, tag: 'supplier', site: 'aliexprez', path: 'business',
        subject: `Your own brand for the ${p.name}?`,
        body: [
          'Hi!',
          '',
          `${num(PRIVATE_LABEL_UNLOCK_ORDERS)}+ orders on the ${p.name} — that's a real product now. Time to make it YOURS.`,
          '',
          'With private label the factory prints your logo on the product and packaging, and we add an insert card. Why it matters:',
          '• Customers trust a brand more than a generic gadget → better conversion and fewer refunds',
          '• Copycat stores can’t buy the exact same thing on AliExprez',
          '• You can raise your price a little and nobody can compare it 1:1',
          '',
          `MOQ ${num(p.privateLabelMoq)} units at about ${money(p.privateLabelCogs)}/unit ex-factory (+ freight & duty). Production takes 8–16 days.`,
          '',
          'Pick a brand name and place the order from the Business tab.',
          '',
          'Lily',
        ].join('\n'),
      })
    }
  }
}

function storageFees(s: GameState, day: number) {
  let units = 0
  for (const inv of Object.values(s.catalog.inventory)) units += inv.units
  if (units <= 0) return
  const fee = r2(units * BENCHMARKS.shipping.threePlStoragePerUnitMonth)
  const acct = pay(s, fee, { category: 'inventory', memo: `${THREE_PL.name} storage — ${num(units)} units`, business: true, pnl: 'otherBusiness' })
  if (!acct) notify(s, { kind: 'critical', title: '3PL storage invoice declined', body: `${THREE_PL.name} couldn't charge ${money(fee)}. Pay down your card — unpaid 3PL invoices get inventory frozen.`, site: 'bank' })
  else notify(s, { kind: 'info', title: `3PL storage fee: ${money(fee)}`, body: `${num(units)} units on hand on ${formatDate(day, 'md')}.`, site: 'aliexprez', path: 'business' })
}

function stockWarnings(s: GameState, day: number) {
  const c = s.catalog
  for (const [id, inv] of Object.entries(c.inventory)) {
    const mode = c.sourcing[id]?.mode
    if (mode !== 'bulk' && mode !== 'private_label') continue
    if (inv.units <= 0) continue
    const perDay = recentSales(s, id, 7).units / 7
    if (perDay <= 0.2) continue
    const daysLeft = inv.units / perDay
    const incoming = c.bulkOrders.some(o => o.catalogId === id && o.status !== 'received')
    if (daysLeft >= 21 || incoming) continue
    const key = `lowstock:${id}`
    const last = s.events.cooldowns[key]
    if (last !== undefined && day - last < 5) continue
    s.events.cooldowns[key] = day
    const p = findProduct(id)
    notify(s, {
      kind: 'warning', title: `Low stock: ${p?.name ?? id}`,
      body: `${num(inv.units)} units ≈ ${Math.max(1, Math.round(daysLeft))} days of sales. Sea freight takes 5–7 weeks door to door; air about 2–3 weeks.`,
      site: 'aliexprez', path: 'business',
    })
  }
}
