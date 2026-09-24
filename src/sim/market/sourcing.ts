// Sourcing & fulfillment: AliExprez dropship → sourcing agent → bulk stock at a US 3PL → private label.
// Import duty applies to every China-origin parcel/shipment (US de minimis suspended, BENCHMARKS.shipping).
import type { FulfillmentMode, GameState, Niche, ProductDef, SourcingState } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { dayOf, domOf, formatDate } from '../../core/time'
import { pay } from '../../core/money'
import { mail, notify } from '../../core/notify'
import { uid } from '../../core/ids'
import { clamp, randInt } from '../../core/rng'
import { money, num } from '../../core/format'
import { removeBillByRef, upsertBill } from '../finance'
import { cnyWindowAt, productionDoneDay } from '../events/calendar'
import { findProduct } from './catalog'
import { hrand } from './noise'

const r2 = (x: number) => Math.round(x * 100) / 100
const SH = BENCHMARKS.shipping

export const AGENT = { from: 'Lily Chen · SourcePro', fromEmail: 'lily@sourcepro-agent.com' }
export const ALIEXPREZ = { from: 'AliExprez', fromEmail: 'transaction@notice.aliexprez.com' }
export const THREE_PL = { name: 'ParcelPeak Fulfillment', from: 'ParcelPeak Fulfillment', fromEmail: 'receiving@parcelpeak3pl.com' }
export const MINEO = { from: 'Mineo', fromEmail: 'billing@mineo.io' }

// ---------------------------------------------------------------------------
// Import duty & delivery windows
// ---------------------------------------------------------------------------
/** Typical combined MFN + Section 301 + 2026 forced-labor tariff by category (applied to declared value). */
const NICHE_DUTY: Record<Niche, number> = {
  pet: 0.25, beauty: 0.3, home: 0.3, kitchen: 0.27, fitness: 0.28, wellness: 0.29,
  car: 0.33, gadgets: 0.38, baby: 0.26, kids: 0.23, fashion: 0.36, outdoor: 0.31,
}
/** Per-product duty rate within BENCHMARKS.shipping.chinaDutyPct (deterministic by HTS-like category). */
export function dutyPctFor(p: ProductDef): number {
  const [lo, hi] = SH.chinaDutyPct
  const jitter = (hrand(p.id, 'duty') - 0.5) * 0.04
  return Math.round(clamp(NICHE_DUTY[p.niche] + jitter, lo, hi) * 1000) / 1000
}
/** AliExprez delivery incl. US customs entry (+2–5 days since de minimis ended). */
export const dropshipDays = (p: ProductDef): [number, number] => [p.shipDays[0] + SH.customsExtraDays[0], p.shipDays[1] + SH.customsExtraDays[1]]
export const agentDays = (): [number, number] => [SH.agentExpress[0] + SH.customsExtraDays[0], SH.agentExpress[1] + SH.customsExtraDays[1]]
export const threePlDays = (): [number, number] => [SH.usWarehouse3pl[0], SH.usWarehouse3pl[1]]

/** Supplier price hikes from events (multiplier on supplier unit price). */
export function supplierPriceMult(s: GameState, catalogId: string): number {
  let m = 1
  for (const e of s.events?.active ?? []) if (e.kind === 'supplier_price_hike' && e.data?.catalogId === catalogId) m *= 1 + Number(e.data?.pct ?? 0.08)
  return m
}

export const AGENT_MARKUP = 1.12
export const agentShipCost = (p: ProductDef) => r2(4.5 + 2.5 * Math.max(0, p.weightKg - 0.5))
/** 3PL pick & pack + US domestic postage (≈$4 + $1.50/kg). */
export const threePlShipCost = (p: ProductDef) => r2(SH.threePlPickPackPerOrder + 4 + 1.5 * p.weightKg)
export const agentQuoteFor = (s: GameState, p: ProductDef) =>
  s.catalog.sourcing[p.id]?.agentQuote ?? r2(p.bulkCogs * AGENT_MARKUP)

function sourcing(s: GameState, catalogId: string): SourcingState {
  return (s.catalog.sourcing[catalogId] ??= { mode: 'dropship' })
}

// ---------------------------------------------------------------------------
// fulfillmentFor — used by the store for every order and by break-even math
// ---------------------------------------------------------------------------
export interface Fulfillment {
  mode: FulfillmentMode
  /** landed unit cost incl. import duty (bulk: average landed cost of stock on hand) */
  unitCost: number
  /** per-order shipping to the customer */
  shipCost: number
  /** delivery window in days from order (excl. CNY delays: store adds modifiers.dropshipDelayDays) */
  shipDays: [number, number]
  /** false when the chosen 3PL mode is out of stock and orders fall back to AliExprez */
  inStock: boolean
  /** duty per unit included in unitCost (0 for 3PL stock: paid on the shipment) */
  duty?: number
  dutyPct?: number
  /** the configured mode (differs from `mode` during a stockout fallback) */
  configuredMode?: FulfillmentMode
}

export function dropshipFulfillment(s: GameState, p: ProductDef): Fulfillment {
  const dutyPct = dutyPctFor(p)
  const item = p.cogs * supplierPriceMult(s, p.id)
  const duty = item * dutyPct
  return { mode: 'dropship', unitCost: r2(item + duty), shipCost: p.shipCost, shipDays: dropshipDays(p), inStock: true, duty: r2(duty), dutyPct }
}

export function fulfillmentFor(s: GameState, catalogId: string): Fulfillment {
  const p = findProduct(catalogId)
  if (!p) return { mode: 'dropship', unitCost: 0, shipCost: 0, shipDays: [15, 30], inStock: false }
  const configured: FulfillmentMode = s.catalog.sourcing[catalogId]?.mode ?? 'dropship'
  const u = s.catalog.unlocks
  if (configured === 'agent' && u.agent) {
    const dutyPct = dutyPctFor(p)
    const item = agentQuoteFor(s, p) * supplierPriceMult(s, catalogId)
    const duty = item * dutyPct
    return { mode: 'agent', unitCost: r2(item + duty), shipCost: agentShipCost(p), shipDays: agentDays(), inStock: true, duty: r2(duty), dutyPct, configuredMode: configured }
  }
  if ((configured === 'bulk' || configured === 'private_label') && u.threePL) {
    const inv = s.catalog.inventory[catalogId]
    if (inv && inv.units >= 1) {
      return { mode: configured, unitCost: r2(inv.avgCost), shipCost: threePlShipCost(p), shipDays: threePlDays(), inStock: true, duty: 0, dutyPct: dutyPctFor(p), configuredMode: configured }
    }
    return { ...dropshipFulfillment(s, p), inStock: false, configuredMode: configured }
  }
  return { ...dropshipFulfillment(s, p), configuredMode: configured }
}

/** Landed cost per order (unit + shipping) with the current fulfillment. */
export function landedCost(s: GameState, catalogId: string): number {
  const f = fulfillmentFor(s, catalogId)
  return r2(f.unitCost + f.shipCost)
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------
export function sampleCost(s: GameState, p: ProductDef): number {
  const f = dropshipFulfillment(s, p)
  return r2(f.unitCost + f.shipCost)
}

export function orderSample(s: GameState, catalogId: string): boolean {
  const p = findProduct(catalogId)
  if (!p || !s.catalog.available.includes(catalogId)) return false
  const day = dayOf(s.time.hour)
  const cost = sampleCost(s, p)
  const acct = pay(s, cost, { category: 'samples', memo: `AliExprez sample — ${p.name}`, business: true })
  if (!acct) {
    notify(s, { kind: 'critical', title: 'Sample payment declined', body: `Neither your checking account nor your card could cover ${money(cost)}.`, site: 'bank' })
    return false
  }
  const [lo, hi] = dropshipDays(p)
  const arriveDay = day + randInt(s, lo, hi) + Math.max(0, Math.round(s.events.modifiers.dropshipDelayDays || 0))
  s.catalog.samples.push({ id: uid(s, 'smp'), catalogId, orderedDay: day, arriveDay, received: false, cost })
  notify(s, {
    kind: 'info', title: `Sample ordered: ${p.name}`,
    body: `Paid ${money(cost)} incl. shipping and ${Math.round(dutyPctFor(p) * 100)}% import duty. Estimated delivery ${formatDate(arriveDay, 'md')}.`,
    site: 'aliexprez', path: 'orders',
  })
  return true
}

// ---------------------------------------------------------------------------
// Sourcing agent
// ---------------------------------------------------------------------------
export function requestAgentQuote(s: GameState, catalogId: string): number | null {
  const p = findProduct(catalogId)
  if (!p || !s.catalog.unlocks.agent) return null
  const src = sourcing(s, catalogId)
  if (src.agentQuote) return src.agentQuote
  const quote = r2(p.bulkCogs * AGENT_MARKUP * (0.97 + 0.06 * hrand(s.meta.seed, catalogId, 'quote')))
  src.agentQuote = quote
  const [dl, dh] = agentDays()
  const ali = dropshipFulfillment(s, p)
  const dutyPct = dutyPctFor(p)
  mail(s, {
    ...AGENT, tag: 'supplier', site: 'aliexprez', path: 'business',
    subject: `Quote: ${p.name} — ${money(quote)}/unit`,
    body: [
      'Hi!',
      '',
      `Thanks for your inquiry. I checked 3 factories for the ${p.name} and negotiated this for you:`,
      '',
      `• Unit price (we dropship for you): ${money(quote)} — AliExprez listing is ${money(p.cogs)}`,
      `• Shipping per order to the US: ${money(agentShipCost(p))} (express line, ${dl}–${dh} days incl. customs)`,
      `• Import duty: about ${Math.round(dutyPct * 100)}% of the declared value, we clear it for you and bill it with the order`,
      '• Every unit is QC-inspected before it leaves our warehouse (roughly 40% fewer defects than random AliExprez sellers)',
      '• Custom packaging inserts available',
      '',
      `Your landed cost per order would be about ${money(quote * (1 + dutyPct) + agentShipCost(p))} vs ${money(ali.unitCost + ali.shipCost)} on AliExprez, and customers get it in about a week instead of 2–4.`,
      '',
      `When volume grows we can also ship bulk to a US 3PL (MOQ ${num(p.moq)} units at ${money(p.bulkCogs)}/unit ex-factory).`,
      '',
      'Switch the product to "Agent" in your sourcing settings whenever you are ready.',
      '',
      'Best regards,',
      'Lily Chen',
      'SourcePro Sourcing — Shenzhen',
    ].join('\n'),
  })
  return quote
}

// ---------------------------------------------------------------------------
// Bulk & private label (US 3PL)
// ---------------------------------------------------------------------------
export interface BulkQuote {
  ok: boolean
  reason?: string
  qty: number
  moq: number
  unitCost: number
  goods: number
  freight: number
  duty: number
  dutyPct: number
  customsFee: number
  total: number
  /** all-in cost per unit on arrival at the 3PL */
  landedUnit: number
  productionDays: [number, number]
  transitDays: [number, number]
  /** expected (midpoint) production-done and arrival days, incl. CNY closures */
  expectedShipDay: number
  expectedArriveDay: number
  opsDiscountPct: number
}

function opsDiscount(s: GameState): number {
  const ops = s.staff?.members?.find(m => m.role === 'ops_manager')
  return ops ? Math.min(0.1, 0.05 + 0.005 * ops.skill) : 0
}

export function bulkQuote(s: GameState, catalogId: string, qty: number, method: 'sea' | 'air', kind: 'bulk' | 'private_label'): BulkQuote {
  const p = findProduct(catalogId)
  const day = dayOf(s.time.hour)
  const empty: BulkQuote = {
    ok: false, qty, moq: 0, unitCost: 0, goods: 0, freight: 0, duty: 0, dutyPct: 0, customsFee: 0, total: 0, landedUnit: 0,
    productionDays: [5, 10], transitDays: [0, 0], expectedShipDay: day, expectedArriveDay: day, opsDiscountPct: 0,
  }
  if (!p) return { ...empty, reason: 'Unknown product' }
  const moq = kind === 'bulk' ? p.moq : p.privateLabelMoq
  const disc = opsDiscount(s)
  const base = kind === 'bulk' ? p.bulkCogs : p.privateLabelCogs
  const unitCost = r2(base * supplierPriceMult(s, catalogId) * (1 - disc))
  const q = Math.max(0, Math.floor(qty))
  const goods = r2(unitCost * q)
  const freightPerUnit = method === 'sea' ? 0.6 * Math.max(1, p.weightKg) : 2.8 * Math.max(0.25, p.weightKg)
  const freight = r2(freightPerUnit * q)
  const dutyPct = dutyPctFor(p)
  const duty = r2(goods * dutyPct)
  // Formal customs entry (> $2,500) needs a broker + bond; small shipments clear informally.
  const customsFee = q === 0 ? 0 : goods > 2500 ? 175 : 45
  const total = r2(goods + freight + duty + customsFee)
  const productionDays: [number, number] = kind === 'private_label' ? [8, 16] : [5, 10]
  const transitDays: [number, number] = method === 'sea' ? SH.seaFreightDays : SH.airFreightDays
  const midProd = Math.round((productionDays[0] + productionDays[1]) / 2)
  const shipDay = productionDoneDay(day, midProd)
  const arrive = shipDay + Math.round((transitDays[0] + transitDays[1]) / 2) + 4 + 2
  const out: BulkQuote = {
    ok: true, qty: q, moq, unitCost, goods, freight, duty, dutyPct, customsFee, total, landedUnit: q ? r2(total / q) : 0,
    productionDays, transitDays, expectedShipDay: shipDay, expectedArriveDay: arrive, opsDiscountPct: disc,
  }
  if (kind === 'bulk' && !s.catalog.unlocks.threePL) return { ...out, ok: false, reason: 'Bulk orders unlock with your sourcing agent (after 100 store orders).' }
  if (kind === 'private_label' && !s.catalog.unlocks.privateLabel) return { ...out, ok: false, reason: 'Private label unlocks once one product passes 500 orders.' }
  if (q < moq) return { ...out, ok: false, reason: `Minimum order quantity is ${num(moq)} units.` }
  return out
}

export function placeBulkOrder(s: GameState, catalogId: string, qty: number, method: 'sea' | 'air', kind: 'bulk' | 'private_label', brandName?: string): boolean {
  const p = findProduct(catalogId)
  if (!p) return false
  const q = bulkQuote(s, catalogId, qty, method, kind)
  if (!q.ok) {
    notify(s, { kind: 'warning', title: 'Order not placed', body: q.reason, site: 'aliexprez', path: 'business' })
    return false
  }
  const src = sourcing(s, catalogId)
  const brand = (brandName ?? src.brandName ?? '').trim()
  if (kind === 'private_label' && brand.length < 2) {
    notify(s, { kind: 'warning', title: 'Choose a brand name first', body: 'Private-label units are printed with your logo — the factory needs the brand name before production.', site: 'aliexprez', path: 'business' })
    return false
  }
  const label = kind === 'bulk' ? 'Bulk order' : 'Private-label order'
  const acct = pay(s, q.total, { category: 'inventory', memo: `${label} — ${num(q.qty)} × ${p.name} (${method} freight, duty incl.)`, business: true })
  if (!acct) {
    notify(s, { kind: 'critical', title: `${label} declined`, body: `${money(q.total)} is more than your cash and available card credit.`, site: 'bank' })
    return false
  }
  const day = dayOf(s.time.hour)
  const prodDays = randInt(s, q.productionDays[0], q.productionDays[1])
  let shipDay = productionDoneDay(day, prodDays)
  // Non-CNY supplier delays (the production calendar above already skips CNY closures).
  const mod = Math.round(s.events.modifiers.supplierDelayDays || 0)
  if (mod > 0 && !cnyWindowAt(day) && !cnyWindowAt(shipDay)) shipDay += mod
  const transit = randInt(s, q.transitDays[0], q.transitDays[1])
  const clearance = randInt(s, SH.customsExtraDays[0], SH.customsExtraDays[1])
  const arriveDay = shipDay + transit + clearance + 2
  s.catalog.bulkOrders.push({
    id: uid(s, 'po'), catalogId, qty: q.qty, unitCost: q.unitCost, method, kind, orderedDay: day, shipDay, arriveDay,
    status: 'production', total: q.total, goods: q.goods, freight: q.freight, duty: q.duty, customsFee: q.customsFee,
    brandName: kind === 'private_label' ? brand : undefined,
  })
  if (kind === 'private_label') src.brandName = brand
  mail(s, {
    ...AGENT, tag: 'supplier', site: 'aliexprez', path: 'business',
    subject: `PO confirmed: ${num(q.qty)} × ${kind === 'private_label' ? `${brand} ` : ''}${p.name}`,
    body: [
      'Hi!',
      '',
      `Payment received, thank you. Your ${kind === 'private_label' ? `private-label run (brand: "${brand}", custom box + logo)` : 'bulk order'} is booked with the factory.`,
      '',
      `• Quantity: ${num(q.qty)} units at ${money(q.unitCost)}`,
      `• Goods: ${money(q.goods)}`,
      `• ${method === 'sea' ? 'Sea' : 'Air'} freight to ${THREE_PL.name}: ${money(q.freight)}`,
      `• US import duty (${Math.round(q.dutyPct * 100)}%): ${money(q.duty)}`,
      `• Customs entry & bond: ${money(q.customsFee)}`,
      `• Total: ${money(q.total)} (${money(q.landedUnit)}/unit landed)`,
      '',
      `Production finishes around ${formatDate(shipDay, 'md')}${cnyWindowAt(shipDay - 3) || shipDay - day > prodDays + 2 ? ' (factory holiday closure included)' : ''}. Estimated arrival at the warehouse: ${formatDate(arriveDay, 'md')}.`,
      '',
      'I will send photos from the QC inspection before shipping.',
      '',
      'Lily',
    ].join('\n'),
  })
  notify(s, { kind: 'success', title: `${label} placed`, body: `${num(q.qty)} × ${p.name} · ETA ${formatDate(arriveDay, 'md')} at your US 3PL`, site: 'aliexprez', path: 'business' })
  return true
}

export function setFulfillmentMode(s: GameState, catalogId: string, mode: FulfillmentMode): void {
  const p = findProduct(catalogId)
  if (!p) return
  const c = s.catalog
  const src = sourcing(s, catalogId)
  const hasStockOrIncoming = (kind?: 'bulk' | 'private_label') =>
    (c.inventory[catalogId]?.units ?? 0) > 0 || c.bulkOrders.some(o => o.catalogId === catalogId && o.status !== 'received' && (!kind || o.kind === kind))
  if (mode === 'agent') {
    if (!c.unlocks.agent) {
      notify(s, { kind: 'warning', title: 'No sourcing agent yet', body: 'Agents take on stores after ~100 orders. Keep selling!', site: 'aliexprez', path: 'business' })
      return
    }
    if (!src.agentQuote) requestAgentQuote(s, catalogId)
  }
  if (mode === 'bulk' && (!c.unlocks.threePL || !hasStockOrIncoming())) {
    notify(s, { kind: 'warning', title: 'No 3PL stock', body: 'Place a bulk order first — orders can only ship from your US warehouse once stock arrives.', site: 'aliexprez', path: 'business' })
    return
  }
  if (mode === 'private_label' && (!c.unlocks.privateLabel || !src.brandName || !hasStockOrIncoming('private_label'))) {
    notify(s, { kind: 'warning', title: 'No private-label stock', body: 'Place a private-label order (with your brand name) first.', site: 'aliexprez', path: 'business' })
    return
  }
  if (src.mode === mode) return
  src.mode = mode
  const f = fulfillmentFor(s, catalogId)
  const label = { dropship: 'AliExprez dropship', agent: 'SourcePro agent', bulk: 'US 3PL stock', private_label: `private label (${src.brandName ?? 'your brand'})` }[mode]
  notify(s, {
    kind: 'success', title: `${p.name}: fulfillment switched to ${label}`,
    body: `${money(f.unitCost)} landed + ${money(f.shipCost)} shipping per order · delivery ${f.shipDays[0]}–${f.shipDays[1]} days${f.inStock ? '' : ' (out of stock — falling back to AliExprez)'}. Update the delivery promise on your product page.`,
    site: 'aliexprez', path: 'business',
  })
}

/** Consume 3PL inventory for an order; false if out of stock (store falls back to dropship). */
export function takeInventory(s: GameState, catalogId: string, qty: number): boolean {
  const inv = s.catalog.inventory[catalogId]
  const n = Math.max(1, Math.floor(qty))
  if (!inv || inv.units < n) {
    stockoutAlert(s, catalogId)
    return false
  }
  inv.units -= n
  if (inv.units === 0) stockoutAlert(s, catalogId)
  return true
}

function stockoutAlert(s: GameState, catalogId: string) {
  const day = dayOf(s.time.hour)
  const key = `stockout:${catalogId}`
  const last = s.events.cooldowns[key]
  if (last !== undefined && day - last < 2) return
  s.events.cooldowns[key] = day
  const p = findProduct(catalogId)
  if (!p) return
  const [lo, hi] = dropshipDays(p)
  notify(s, {
    kind: 'critical', title: `Out of stock at ${THREE_PL.name}: ${p.name}`,
    body: `New orders fall back to AliExprez dropship (${lo}–${hi} days) until your next shipment lands. Your page still promises 3PL delivery times — expect "where is my order?" tickets.`,
    site: 'aliexprez', path: 'business',
  })
}

// ---------------------------------------------------------------------------
// Mineo (ad spy tool) subscription
// ---------------------------------------------------------------------------
export const MINEO_MONTHLY = 49

export function spyToolActive(s: GameState): boolean {
  const c = s.catalog
  return !!c.unlocks.spyTool && c.spyToolUntilDay !== null && dayOf(s.time.hour) <= c.spyToolUntilDay
}

export function subscribeSpyTool(s: GameState): boolean {
  const c = s.catalog
  const day = dayOf(s.time.hour)
  if (spyToolActive(s)) {
    if (!c.spyToolAutoRenew) {
      c.spyToolAutoRenew = true
      // same schedule as a fresh subscription (the renewal bills on the last day of paid access), but
      // never today: today's bills already ran, and the renewal check needs the charge before access ends
      upsertBill(s, mineoBill(s, Math.max(c.spyToolUntilDay ?? day, day + 1)))
    }
    return true
  }
  const acct = pay(s, MINEO_MONTHLY, { category: 'subscription', memo: 'Mineo Pro — monthly plan', business: true, pnl: 'apps' })
  if (!acct) {
    notify(s, { kind: 'critical', title: 'Mineo payment declined', body: `Your card couldn't cover ${money(MINEO_MONTHLY)}.`, site: 'bank' })
    return false
  }
  c.unlocks.spyTool = true
  c.spyToolUntilDay = day + 30
  c.spyToolAutoRenew = true
  upsertBill(s, mineoBill(s, day + 30))
  mail(s, {
    ...MINEO, tag: 'platform', site: 'mineo',
    subject: 'Welcome to Mineo Pro — your receipt',
    body: `Thanks for subscribing!\n\nPlan: Mineo Pro (monthly)\nCharged: ${money(MINEO_MONTHLY)} to your card on file\nRenews: ${formatDate(day + 30, 'long')}\n\nYou now have full access to the ad library: active ads, advertisers, engagement trends and top creatives for every product we track.\n\nPro tip from our team: lots of ads that have been running for months = a crowded market. A handful of recent ads with strong engagement = an early mover's window.\n\n— The Mineo team`,
  })
  return true
}

function mineoBill(s: GameState, nextDueDay: number) {
  return {
    id: 'bill_mineo', name: 'Mineo Pro', amount: MINEO_MONTHLY, cadence: 'monthly' as const, nextDueDay,
    payWith: 'card' as const, category: 'subscription' as const, business: true, ref: 'mineo', dom: domOf(nextDueDay),
  }
}

/** Stop auto-renew; access continues until the paid period ends. */
export function cancelSpyTool(s: GameState): void {
  const c = s.catalog
  if (!c.unlocks.spyTool) return
  c.spyToolAutoRenew = false
  removeBillByRef(s, 'mineo')
  notify(s, { kind: 'info', title: 'Mineo subscription canceled', body: c.spyToolUntilDay !== null ? `You keep access until ${formatDate(c.spyToolUntilDay, 'md')}.` : undefined, site: 'mineo' })
}

/** Daily: extend access when the finance module has paid the monthly bill, lapse otherwise. */
export function spyToolRenewal(s: GameState, day: number): void {
  const c = s.catalog
  if (!c.unlocks.spyTool || c.spyToolUntilDay === null || day <= c.spyToolUntilDay) return
  const bill = s.finance.bills.find(b => b.ref === 'mineo')
  if (c.spyToolAutoRenew && bill && !bill.failedSince && bill.nextDueDay > c.spyToolUntilDay) {
    c.spyToolUntilDay = bill.nextDueDay
    return
  }
  c.unlocks.spyTool = false
  c.spyToolAutoRenew = false
  if (bill) removeBillByRef(s, 'mineo')
  notify(s, {
    kind: bill?.failedSince ? 'warning' : 'info',
    title: 'Mineo access ended',
    body: bill?.failedSince ? 'Your renewal payment failed. Resubscribe any time.' : 'Your Mineo Pro subscription has ended.',
    site: 'mineo',
  })
}
