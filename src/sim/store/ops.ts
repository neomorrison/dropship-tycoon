// Operations: supplier/3PL fulfillment, deliveries, support tickets, refunds,
// chargebacks (full lifecycle), reviews.
import type { Chargeback, GameState, Modifiers, Order, SupportTicket } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { DIFFICULTY } from '../../core/difficulty'
import { chance, clamp, randInt } from '../../core/rng'
import { dayOf, formatDate, hourOfDay } from '../../core/time'
import { addPnl, pay, receive } from '../../core/money'
import { coachTip, mail, notify } from '../../core/notify'
import { money } from '../../core/format'
import { uid } from '../../core/ids'
import { enqueueActivity, grantXp } from '../life'
import { dayRec } from './analytics'
import { DISPUTE_REASON_TEXT, ticketText } from './templates'
import { appPlanIdx, defOf, findOrder, findProduct, fulfillment, hasApp, hasReviewsApp, isThreePl, r2, today } from './util'

const TRACK_CHARS = '0123456789'
function trackingNumber(s: GameState, threePl: boolean): string {
  let digits = ''
  const n = threePl ? 18 : 12
  for (let i = 0; i < n; i++) digits += TRACK_CHARS[randInt(s, 0, 9)]
  return threePl ? `9400${digits}` : `LX${digits}CN`
}

const expectDays = (o: Order) => o.promisedMaxDays ?? 14

// ---------------------------------------------------------------------------
// Fulfillment
// ---------------------------------------------------------------------------
/** Orders waiting for a supplier/3PL order to be placed & paid. */
export const awaitingSupplier = (o: Order) =>
  o.fulfillment === 'unfulfilled' && !o.cancelled && o.supplierOrderedHour == null &&
  (o.financial === 'paid' || o.financial === 'partially_refunded' || o.financial === 'disputed')

/** Supplier order placed & paid: set ship/delivery days and schedule customer events. */
function markOrdered(s: GameState, o: Order) {
  const day = today(s)
  const orderDay = dayOf(o.hour)
  o.supplierOrderedHour = s.time.hour
  const threePl = o.fulfilledBy === '3pl'
  let transit: number
  let ship: number
  if (threePl) {
    const [a, b] = BENCHMARKS.shipping.usWarehouse3pl
    transit = randInt(s, a, b)
    ship = randInt(s, 0, 1)
  } else {
    const f = fulfillment(s, o.catalogId)
    const days = f.mode === o.mode ? f.shipDays : (defOf(o.catalogId)?.shipDays ?? f.shipDays)
    const delay = Math.max(0, Math.round(s.events?.modifiers?.dropshipDelayDays ?? 0))
    transit = randInt(s, days[0], days[1]) + delay
    ship = o.mode === 'agent' ? randInt(s, 1, 2) : Math.max(1, randInt(s, 1, 3) - (appPlanIdx(s, 'dserz') >= 1 ? 1 : 0))
  }
  o.deliverDay = day + Math.max(transit, ship + 1)
  o.shipDay = day + Math.min(ship, transit - 1)
  o.tracking = trackingNumber(s, threePl)
  scheduleEvents(s, o, orderDay)
}

/** Decide (hidden) WISMO, issue, and chargeback days from real vs promised delivery. */
function scheduleEvents(s: GameState, o: Order, orderDay: number) {
  const dif = DIFFICULTY[s.meta.difficulty]
  const total = o.deliverDay - orderDay
  const exp = expectDays(o)
  const late = total > exp
  const veryLate = total > exp + 5
  // WISMO
  let pW = late ? BENCHMARKS.shipping.wismoRateLate : BENCHMARKS.shipping.wismoRateOnTime
  if (hasApp(s, 'trackwise')) pW *= 1 - 0.35
  o.wismoDay = null
  if (chance(s, pW)) {
    const d = late ? orderDay + exp + randInt(s, 1, 3) : orderDay + randInt(s, 4, Math.max(4, total - 1))
    if (d < o.deliverDay) o.wismoDay = Math.max(today(s) + 1, d)
  }
  // post-delivery issues
  o.issueDay = null
  if (o.defective) o.issueDay = o.deliverDay + randInt(s, 1, 5)
  else if (veryLate && chance(s, 0.15 * dif.refundMult)) o.issueDay = o.deliverDay + randInt(s, 0, 2)
  // chargeback
  const mods = s.events?.modifiers as (Modifiers & { chargebackMult?: number; chargebackMinOrder?: number }) | undefined
  // friendly-fraud waves (events) only hit orders above the wave's minimum order value
  const waveMult = mods?.chargebackMult && o.total >= (mods.chargebackMinOrder ?? 0) ? mods.chargebackMult : 1
  const p = 0.0035 * dif.chargebackMult * (o.defective ? 6 : 1) * (late ? 3 : 1) * ((o.honesty ?? 1) < 0.7 ? 2.5 : 1)
    * (o.total > 80 ? 1.4 : 1) * waveMult
  if (!o.cbDay && chance(s, clamp(p, 0, 0.6))) o.cbDay = Math.max(today(s) + 1, orderDay + randInt(s, 10, 40))
}

/** Place & pay supplier/3PL orders (DSerz auto-fulfill; 3PL always). Batched per hour into one charge. */
export function processFulfillmentQueue(s: GameState) {
  const st = s.store
  const dserz = hasApp(s, 'dserz')
  const queue = st.orders.filter(o => awaitingSupplier(o) && (o.fulfilledBy === '3pl' || dserz))
  if (!queue.length) return
  const drop = queue.filter(o => o.fulfilledBy !== '3pl')
  const tpl = queue.filter(o => o.fulfilledBy === '3pl')
  payBatch(s, drop, 'AliExprez supplier orders via DSerz')
  payBatch(s, tpl, '3PL pick, pack & postage')
}

function payBatch(s: GameState, orders: Order[], label: string) {
  if (!orders.length) return
  const cost = (o: Order) => (o.fulfilledBy === '3pl' ? o.shippingCost : o.supplierCost ?? o.cogs + o.shippingCost)
  const total = r2(orders.reduce((a, o) => a + cost(o), 0))
  const memo = `${label} · ${orders.length} order${orders.length === 1 ? '' : 's'} (#${orders[0].id}${orders.length > 1 ? `–#${orders[orders.length - 1].id}` : ''})`
  const tpl = orders[0].fulfilledBy === '3pl'
  if (pay(s, total, { category: tpl ? 'shipping' : 'cogs', memo, business: true, prefer: 'card', pnl: null })) {
    for (const o of orders) chargeRecorded(s, o)
    return
  }
  // not enough for the whole batch: pay what we can, oldest first
  let paid = 0
  for (const o of orders) {
    if (!pay(s, cost(o), { category: tpl ? 'shipping' : 'cogs', memo: `${label} · order #${o.id}`, business: true, prefer: 'card', pnl: null })) break
    chargeRecorded(s, o)
    paid++
  }
  if (paid < orders.length) {
    const key = `store_supplier_unpaid_${today(s)}`
    if (!s.flags[key]) {
      s.flags[key] = true
      notify(s, { kind: 'critical', title: `${orders.length - paid} order${orders.length - paid === 1 ? '' : 's'} can't be fulfilled`, body: 'Your card and bank account can\'t cover the supplier payments. Customers are waiting. Pay down your card or add funds.', site: 'bank', path: '' })
    }
  }
}
function chargeRecorded(s: GameState, o: Order) {
  if (o.fulfilledBy === '3pl') addPnl(s, 'shipping', o.shippingCost)
  else {
    addPnl(s, 'cogs', o.cogs)
    addPnl(s, 'shipping', o.shippingCost)
  }
  markOrdered(s, o)
}

/** Manual "Fulfill" (no DSerz): place & pay the supplier order for one order. */
export function fulfillOrder(s: GameState, orderId: number): boolean {
  const o = findOrder(s, orderId)
  if (!o || !awaitingSupplier(o)) return false
  const amt = o.fulfilledBy === '3pl' ? o.shippingCost : o.supplierCost ?? o.cogs + o.shippingCost
  const acct = pay(s, amt, { category: o.fulfilledBy === '3pl' ? 'shipping' : 'cogs', memo: `AliExprez order for #${o.id} (manual)`, business: true, prefer: 'card', pnl: null })
  if (!acct) {
    notify(s, { kind: 'warning', title: `Couldn't pay the supplier for #${o.id}`, body: `${money(amt)} needed. Your card is maxed and your bank balance is too low.`, site: 'bank', path: '' })
    return false
  }
  chargeRecorded(s, o)
  return true
}
/** Fulfill many orders (or all waiting ones). Returns how many were placed. */
export function fulfillOrders(s: GameState, ids?: number[]): number {
  const list = ids ? ids.map(id => findOrder(s, id)).filter((o): o is Order => !!o) : s.store.orders.filter(awaitingSupplier)
  let n = 0
  for (const o of list) if (fulfillOrder(s, o.id)) n++
  return n
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
function openTicket(s: GameState, o: Order, kind: SupportTicket['kind']): SupportTicket | null {
  const st = s.store
  const p = findProduct(s, o.storeProductId)
  const first = o.customer.name.split(' ')[0]
  const days = today(s) - dayOf(o.hour)
  const promise = o.promisedMaxDays ? `delivery in ${o.promisedMaxDays} days` : 'fast shipping'
  const txt = ticketText(s, kind, { first, order: o.id, product: p?.title.split(/[:\-–|,]/)[0].trim().slice(0, 48) || 'item', days, promise })
  const t: SupportTicket = {
    id: uid(s, 'tk'), orderId: o.id, kind, subject: txt.subject, body: txt.body, createdHour: s.time.hour, status: 'open',
    dueHour: s.time.hour + 48, customer: o.customer.name, email: o.customer.email, productTitle: p?.title,
  }
  // Gorgeous Basic auto-replies to about half of WISMO tickets with live tracking
  if (kind === 'wismo' && o.tracking && appPlanIdx(s, 'gorgeous') >= 1 && chance(s, 0.5)) {
    t.status = 'solved'
    t.resolution = 'answered'
    t.solvedHour = s.time.hour
    t.solvedBy = 'auto'
    o.ticketAnswered = true
  }
  st.tickets.push(t)
  return t
}

function orderSettled(o: Order) {
  return o.financial === 'refunded' || o.financial === 'chargeback_lost' || o.financial === 'chargeback_won' || o.financial === 'disputed'
}

/** Hourly per-order events: shipping status, delivery, tickets, disputes. Each order "lives" at its purchase hour. */
export function orderEventsHour(s: GameState) {
  const st = s.store
  const now = s.time.hour
  const h = hourOfDay(now)
  const day = today(s)
  const dif = DIFFICULTY[s.meta.difficulty]
  const newTickets: SupportTicket[] = []
  for (const o of st.orders) {
    if (o.hour % 24 !== h) continue
    const orderDay = dayOf(o.hour)
    if (orderDay === day) continue
    const age = day - orderDay
    if (age > 75) continue
    // shipping status
    if (o.fulfillment === 'unfulfilled' && !o.cancelled && o.supplierOrderedHour != null && o.shipDay != null && o.shipDay <= day) o.fulfillment = 'fulfilled'
    if (o.fulfillment === 'fulfilled' && o.deliverDay <= day) {
      o.fulfillment = 'delivered'
      o.deliveredDay = day
      o.late = day - orderDay > expectDays(o)
    }
    const settled = orderSettled(o)
    // stuck orders: never sent to the supplier
    if (o.fulfillment === 'unfulfilled' && !o.cancelled && o.supplierOrderedHour == null && !settled) {
      if (age === 4 && chance(s, 0.4)) pushT(newTickets, openTicket(s, o, 'wismo'))
      if (age === 8) {
        if (chance(s, 0.55)) pushT(newTickets, openTicket(s, o, 'angry'))
        if (!o.cbDay && chance(s, 0.3 * dif.chargebackMult)) o.cbDay = day + randInt(s, 2, 10)
      }
      if (age === 15 && !o.cbDay && chance(s, 0.35 * dif.chargebackMult)) o.cbDay = day + randInt(s, 1, 6)
    }
    if (o.wismoDay === day && !settled) {
      o.wismoDay = null
      if (o.fulfillment !== 'delivered') {
        const veryLate = age > expectDays(o) + 8
        pushT(newTickets, openTicket(s, o, veryLate && chance(s, 0.35) ? 'angry' : 'wismo'))
      }
    }
    if (o.issueDay === day && !settled && o.financial !== 'partially_refunded') {
      o.issueDay = null
      if (o.defective && !o.replacementSent) {
        if (chance(s, 0.7)) pushT(newTickets, openTicket(s, o, chance(s, clamp((0.55 / 0.7) * dif.refundMult, 0, 1)) ? 'refund_request' : 'defect'))
      } else if (!o.defective) pushT(newTickets, openTicket(s, o, chance(s, 0.3) ? 'angry' : 'refund_request'))
    }
    if (o.questionDay === day && !settled) {
      o.questionDay = null
      pushT(newTickets, openTicket(s, o, 'question'))
    }
    if (o.cbDay === day) {
      o.cbDay = null
      if (o.financial === 'paid' || o.financial === 'partially_refunded') openChargeback(s, o)
    }
  }
  const open = newTickets.filter(t => t.status === 'open')
  if (open.length) {
    notify(s, {
      kind: 'info',
      title: open.length === 1 ? `New message from ${open[0].customer ?? 'a customer'}` : `${open.length} new customer messages`,
      body: open.length === 1 ? open[0].subject : 'Reply within 48 hours to avoid escalations.',
      site: 'shopifly', path: open.length === 1 ? `inbox/${open[0].id}` : 'inbox',
    })
  }
}
const pushT = (arr: SupportTicket[], t: SupportTicket | null) => { if (t) arr.push(t) }

const ESCALATION_CB: Record<SupportTicket['kind'], number> = { wismo: 0.3, refund_request: 0.45, angry: 0.55, defect: 0.35, question: 0.08 }

/** Unanswered tickets past 48h escalate; ~30% turn into disputes. */
export function escalateTickets(s: GameState) {
  const now = s.time.hour
  let n = 0
  for (const t of s.store.tickets) {
    if (t.status !== 'open' || t.dueHour > now) continue
    t.status = 'escalated'
    n++
    const o = findOrder(s, t.orderId)
    const sup = (s.store.support ??= { solved: 0, escalated: 0, responseHoursSum: 0, answered: 0 })
    sup.escalated++
    if (!o) continue
    o.escalated = true
    // ~30% of ignored customers go to their bank; angry and refund-seeking customers far more than pre-sale questions
    if (!o.cbDay && (o.financial === 'paid' || o.financial === 'partially_refunded') && chance(s, ESCALATION_CB[t.kind])) o.cbDay = today(s) + randInt(s, 1, 6)
  }
  if (n) {
    notify(s, { kind: 'warning', title: `${n} support ticket${n === 1 ? '' : 's'} escalated`, body: 'Customers waited 48h without a reply. Some will now dispute the charge with their bank.', site: 'shopifly', path: 'inbox' })
    coachTip(s, 'store_tickets_escalating', 'Unanswered customer emails turn into chargebacks. A refund costs you the order. A chargeback costs the order + $15 + a strike on your processor account. Work through the Inbox (Customer support activity) or hire a VA.', { app: 'shopifly', cooldownHours: 72 })
  }
}

/** Reply to a ticket with a resolution. */
export function answerTicket(s: GameState, ticketId: string, resolution: 'answered' | 'refunded' | 'replacement' | 'partial_refund', by: 'you' | 'staff' = 'you'): boolean {
  const t = s.store.tickets.find(x => x.id === ticketId)
  if (!t || t.status === 'solved') return false
  const o = findOrder(s, t.orderId)
  if (resolution === 'replacement' && o) {
    const f = fulfillment(s, o.catalogId)
    const cost = r2(f.unitCost + (isThreePl(f.mode) ? 7.25 : f.shipCost))
    if (!pay(s, cost, { category: 'cogs', memo: `Replacement unit for order #${o.id}`, business: true, prefer: 'card' })) {
      notify(s, { kind: 'warning', title: 'Couldn\'t pay for the replacement', body: `${money(cost)} needed for a replacement unit.`, site: 'bank', path: '' })
      return false
    }
    o.replacementSent = true
    if (o.cbDay && chance(s, 0.8)) o.cbDay = null
  }
  t.status = 'solved'
  t.resolution = resolution
  t.solvedHour = s.time.hour
  t.solvedBy = by
  const sup = (s.store.support ??= { solved: 0, escalated: 0, responseHoursSum: 0, answered: 0 })
  sup.solved++
  sup.answered++
  sup.responseHoursSum += Math.max(0, s.time.hour - t.createdHour)
  if (o) {
    o.ticketAnswered = true
    switch (resolution) {
      case 'answered':
        if (t.kind === 'wismo' || t.kind === 'question') {
          if (o.cbDay && o.fulfillment !== 'unfulfilled' && chance(s, 0.5)) o.cbDay = null
        } else if (!o.cbDay && (o.financial === 'paid' || o.financial === 'partially_refunded') && chance(s, t.kind === 'angry' ? 0.4 : 0.25)) {
          o.cbDay = today(s) + randInt(s, 3, 12)
        }
        break
      case 'refunded':
        refundOrder(s, o.id)
        break
      case 'partial_refund':
        refundOrder(s, o.id, r2(Math.min(o.total - o.refunded, o.total * 0.35)))
        if (o.cbDay && chance(s, 0.7)) o.cbDay = null
        break
      case 'replacement':
        break
    }
  }
  if (by === 'you') grantXp(s, 'operations', 5)
  return true
}

/** Work through up to `count` open tickets, picking a sensible resolution. Returns solved count. */
export function resolveTickets(s: GameState, count: number, by: 'you' | 'staff' = 'you'): number {
  const eff = Math.floor(count * (hasApp(s, 'gorgeous') ? (by === 'you' ? 1 / 0.6 : 1.25) : 1))
  const queue = s.store.tickets
    .filter(t => t.status !== 'solved')
    .sort((a, b) => (a.status === 'escalated' ? 0 : 1) - (b.status === 'escalated' ? 0 : 1) || a.dueHour - b.dueHour)
  let solved = 0
  for (const t of queue) {
    if (solved >= eff) break
    const o = findOrder(s, t.orderId)
    let res: 'answered' | 'refunded' | 'replacement' | 'partial_refund' = 'answered'
    if (o && !orderSettledForRefund(o)) {
      if (t.kind === 'defect') res = (o.supplierCost ?? o.cogs) < o.total * 0.45 ? 'replacement' : 'partial_refund'
      else if (t.kind === 'refund_request') res = chance(s, 0.5) ? 'partial_refund' : 'refunded'
      else if (t.kind === 'angry') res = o.fulfillment === 'unfulfilled' && o.supplierOrderedHour == null ? 'refunded' : 'partial_refund'
    }
    if (answerTicket(s, t.id, res, by) || answerTicket(s, t.id, 'answered', by)) solved++
  }
  return solved
}
const orderSettledForRefund = (o: Order) => o.financial === 'refunded' || o.financial === 'disputed' || o.financial === 'chargeback_lost' || o.financial === 'chargeback_won'

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------
export function refundOrder(s: GameState, orderId: number, amount?: number): boolean {
  const st = s.store
  const o = findOrder(s, orderId)
  if (!o) return false
  if (o.financial === 'disputed' || o.financial === 'chargeback_lost' || o.financial === 'chargeback_won') {
    notify(s, { kind: 'warning', title: `Order #${o.id} is in a dispute`, body: 'You can\'t refund an order with an open or closed chargeback. Respond to the dispute instead.', site: 'shopifly', path: 'disputes' })
    return false
  }
  const max = r2(o.total - o.refunded)
  const amt = r2(clamp(amount ?? max, 0, max))
  if (amt <= 0) return false
  o.refunded = r2(o.refunded + amt)
  o.financial = o.refunded >= o.total - 0.01 ? 'refunded' : 'partially_refunded'
  st.pendingBalance -= amt
  const bb = (st.balanceBreakdown ??= { gross: 0, fees: 0, refunds: 0, adjustments: 0 })
  bb.refunds += amt
  addPnl(s, 'refunds', amt)
  const dr = dayRec(s)
  dr.returns += amt
  dr.netSales -= amt
  dr.totalSales -= amt
  if (o.financial === 'refunded') {
    o.cbDay = null
    o.wismoDay = null
    o.issueDay = null
    const wasOpen = o.fulfillment === 'unfulfilled' && !o.cancelled
    if (o.fulfillment === 'unfulfilled' && o.supplierOrderedHour == null) o.cancelled = true
    else if (o.fulfillment === 'unfulfilled' && o.fulfilledBy !== '3pl' && (o.shipDay ?? 0) > today(s)) {
      // supplier hasn't shipped yet: cancel the AliExprez order and get the supplier payment back
      o.cancelled = true
      const back = r2(o.supplierCost ?? o.cogs + o.shippingCost)
      receive(s, back, { category: 'refund', memo: `Supplier refund: cancelled order #${o.id}`, business: true, pnl: null })
      addPnl(s, 'cogs', -o.cogs)
      addPnl(s, 'shipping', -o.shippingCost)
    }
    // cancelled before shipping: no product cost for the profit report
    if (wasOpen && o.cancelled) {
      const od = st.analytics.daily[dayOf(o.hour)]
      if (od) od.cogs = Math.max(0, od.cogs - o.cogs - o.shippingCost)
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// Chargebacks
// ---------------------------------------------------------------------------
export function openChargeback(s: GameState, o: Order): Chargeback | null {
  const st = s.store
  const amount = r2(o.total - o.refunded)
  if (amount <= 0) return null
  const day = today(s)
  const delivered = o.fulfillment === 'delivered'
  const reason: Chargeback['reason'] = !delivered || o.late ? 'not_received' : o.defective ? 'not_as_described' : chance(s, 0.6) ? 'fraudulent' : 'unrecognized'
  const fee = BENCHMARKS.chargebacks.feePerDispute
  const cb: Chargeback = {
    id: uid(s, 'cb'), orderId: o.id, amount, reason, openedDay: day, respondByDay: day + BENCHMARKS.chargebacks.respondWithinDays,
    status: 'needs_response', evidence: 0, fee, customer: o.customer.name, reasonText: DISPUTE_REASON_TEXT[reason],
  }
  st.chargebacks.push(cb)
  o.financial = 'disputed'
  o.cbDay = null
  st.pendingBalance -= amount + fee
  const bb = (st.balanceBreakdown ??= { gross: 0, fees: 0, refunds: 0, adjustments: 0 })
  bb.adjustments -= amount + fee
  addPnl(s, 'chargebacks', amount + fee)
  cb.evidenceItems = evidenceFor(s, cb, o, 'self').items
  if (hasApp(s, 'chargeflo')) {
    submitChargeback(s, cb.id, 'app')
    notify(s, { kind: 'warning', title: `Chargeback on #${o.id}: ChargeFlo responded`, body: `${money(amount)} + ${money(fee)} fee held. Evidence submitted automatically.`, site: 'shopifly', path: `disputes/${cb.id}` })
  } else {
    notify(s, { kind: 'critical', title: `Chargeback opened on order #${o.id}`, body: `${money(amount)} + ${money(fee)} fee taken from your balance. Respond by ${formatDate(cb.respondByDay, 'md')} or you lose automatically.`, site: 'shopifly', path: `disputes/${cb.id}` })
    mail(s, {
      from: 'Shopifly Payments', fromEmail: 'disputes@shopifly.com', tag: 'shopifly', site: 'shopifly', path: `disputes/${cb.id}`,
      subject: `Action required: chargeback on order #${o.id}`,
      body: `${o.customer.name}'s bank opened a chargeback for ${money(amount)} on order #${o.id}.\n\nReason: ${DISPUTE_REASON_TEXT[reason]}\n\nThe disputed amount and a ${money(fee)} dispute fee have been withheld from your balance. Submit evidence (tracking, proof of delivery, your policies and customer messages) by ${formatDate(cb.respondByDay, 'long')}. If you don't respond, the dispute is closed in the customer's favor.\n\nThe fee is returned if you win.`,
    })
    coachTip(s, 'store_first_chargeback', 'First chargeback! Respond from Shopifly → Disputes before the deadline. With tracking and proof of delivery you win about a third of the time yourself. ChargeFlo automates it and wins more often, for a cut. Better still: answer customers fast and refund unhappy ones before they call their bank.', { app: 'shopifly', essential: true })
  }
  return cb
}

function evidenceFor(s: GameState, cb: Chargeback, o: Order | undefined, by: 'self' | 'app' | 'staff', bonus = 0): { e: number; items: { label: string; ok: boolean }[] } {
  const items: { label: string; ok: boolean }[] = []
  let e = 0.3
  if (!o) return { e: 0.2, items: [{ label: 'Order record', ok: false }] }
  const shipped = o.supplierOrderedHour != null && o.shipDay != null && o.shipDay <= today(s)
  items.push({ label: 'Tracking number', ok: shipped })
  if (shipped) e += 0.2
  const delivered = o.fulfillment === 'delivered'
  items.push({ label: 'Proof of delivery', ok: delivered })
  if (delivered) e += 0.25 + (hasApp(s, 'trackwise') ? 0.05 : 0)
  const pol = s.store.policies
  const polOk = pol.refund.trim().length >= 80 && pol.shipping.trim().length >= 80 && pol.terms.trim().length >= 80
  items.push({ label: 'Refund, shipping & terms policies', ok: polOk })
  if (polOk) e += 0.1
  const honest = (o.honesty ?? 1) >= 0.85
  items.push({ label: 'Product page matches what was delivered', ok: honest })
  if (honest) e += 0.1
  else if ((o.honesty ?? 1) < 0.7) e -= 0.15
  items.push({ label: 'Customer communication', ok: !!o.ticketAnswered })
  if (o.ticketAnswered) e += 0.05
  else if (o.escalated) e -= 0.1
  if (cb.reason === 'not_received' && !delivered) e *= 0.4
  if (cb.reason === 'not_as_described' && o.defective) e *= 0.6
  if ((cb.reason === 'fraudulent' || cb.reason === 'unrecognized') && delivered) e += 0.1
  if (by === 'self') e += 0.03 * Math.max(0, (s.skills?.operations?.level ?? 1) - 1)
  else if (by === 'app') e += 0.1
  // 'staff' (a VA): their craft comes in through `bonus`
  e += bonus
  return { e: clamp(e, 0, 1), items }
}

/** Submit dispute evidence: 'self' (activity completion), 'app' (ChargeFlo) or 'staff' (a VA, skill via opts.evidenceBonus; no player XP). */
export function submitChargeback(s: GameState, id: string, by: 'self' | 'app' | 'staff', opts: { evidenceBonus?: number } = {}): void {
  const cb = s.store.chargebacks.find(c => c.id === id)
  if (!cb || cb.status !== 'needs_response') return
  const o = findOrder(s, cb.orderId)
  const ev = evidenceFor(s, cb, o, by, opts.evidenceBonus ?? 0)
  cb.evidence = Math.round(ev.e * 100) / 100
  cb.evidenceItems = ev.items
  cb.status = 'submitted'
  cb.handledBy = by
  cb.submittedDay = today(s)
  cb.decideDay = today(s) + randInt(s, 10, 20)
  if (by === 'self') {
    grantXp(s, 'operations', 20)
    notify(s, { kind: 'info', title: `Evidence submitted for #${cb.orderId}`, body: `The bank will decide in 10–20 days. Evidence strength: ${Math.round(cb.evidence * 100)}%.`, site: 'shopifly', path: `disputes/${cb.id}` })
  }
}

/** 'self' enqueues the fight_chargeback activity; 'accept' concedes immediately. */
export function respondChargeback(s: GameState, id: string, how: 'self' | 'accept'): void {
  const cb = s.store.chargebacks.find(c => c.id === id)
  if (!cb || cb.status !== 'needs_response') return
  if (how === 'accept') {
    cb.status = 'accepted'
    const o = findOrder(s, cb.orderId)
    if (o) o.financial = 'chargeback_lost'
    notify(s, { kind: 'info', title: `Chargeback on #${cb.orderId} accepted`, body: `${money(cb.amount)} returned to the customer. The ${money(cb.fee ?? 15)} fee is not refundable.`, site: 'shopifly', path: `disputes/${cb.id}` })
    return
  }
  enqueueActivity(s, 'fight_chargeback', { payload: { chargebackId: id }, label: `Fight chargeback on #${cb.orderId}` })
}

/** Daily: decisions on submitted disputes, missed deadlines. */
export function chargebacksDaily(s: GameState, day: number) {
  const st = s.store
  for (const cb of st.chargebacks) {
    if (cb.status === 'needs_response' && day > cb.respondByDay) {
      cb.status = 'lost'
      const o = findOrder(s, cb.orderId)
      if (o) o.financial = 'chargeback_lost'
      notify(s, { kind: 'critical', title: `Chargeback lost: no response on #${cb.orderId}`, body: `The deadline passed. ${money(cb.amount)} + fee are gone.`, site: 'shopifly', path: `disputes/${cb.id}` })
      continue
    }
    if (cb.status !== 'submitted' || cb.decideDay == null || cb.decideDay > day) continue
    const base = cb.handledBy === 'app' ? BENCHMARKS.chargebacks.winRateApp : BENCHMARKS.chargebacks.winRateSelf
    const won = chance(s, base * cb.evidence)
    const o = findOrder(s, cb.orderId)
    const fee = cb.fee ?? BENCHMARKS.chargebacks.feePerDispute
    if (won) {
      cb.status = 'won'
      if (o) o.financial = 'chargeback_won'
      st.pendingBalance += cb.amount + fee
      const bb = (st.balanceBreakdown ??= { gross: 0, fees: 0, refunds: 0, adjustments: 0 })
      bb.adjustments += cb.amount + fee
      addPnl(s, 'chargebacks', -(cb.amount + fee))
      if (cb.handledBy === 'app') {
        const cut = r2(cb.amount * BENCHMARKS.chargebacks.appFeeOnRecovered)
        pay(s, cut, { category: 'fees', memo: `ChargeFlo success fee (#${cb.orderId})`, business: true, prefer: 'card', pnl: 'paymentFees' })
      }
      notify(s, { kind: 'success', title: `Chargeback won on #${cb.orderId}`, body: `${money(cb.amount)} + ${money(fee)} fee returned to your balance.`, site: 'shopifly', path: `disputes/${cb.id}` })
    } else {
      cb.status = 'lost'
      if (o) o.financial = 'chargeback_lost'
      notify(s, { kind: 'warning', title: `Chargeback lost on #${cb.orderId}`, body: `The bank sided with the cardholder. ${money(cb.amount)} + fee are gone.`, site: 'shopifly', path: `disputes/${cb.id}` })
    }
  }
}

/** Disputes opened in the last `days` ÷ orders in the same window (processor dispute ratio). */
export function chargebackRatio(s: GameState, days = 30): number {
  const day = today(s)
  const from = day - days + 1
  const disputes = s.store.chargebacks.filter(c => c.openedDay >= from).length
  let orders = 0
  for (let d = from; d <= day; d++) orders += s.store.analytics.daily[d]?.orders ?? 0
  return orders ? disputes / orders : 0
}

// ---------------------------------------------------------------------------
// Reviews (organic accrual after delivery)
// ---------------------------------------------------------------------------
export function reviewsDaily(s: GameState, day: number) {
  if (!hasReviewsApp(s)) return
  const judgy = hasApp(s, 'judgyme')
  const lookz = hasApp(s, 'lookz')
  const rate = lookz ? 0.09 : judgy ? (appPlanIdx(s, 'judgyme') >= 1 ? 0.09 : 0.06) : 0.05
  const photoShare = lookz ? 0.3 : judgy && appPlanIdx(s, 'judgyme') >= 1 ? 0.15 : 0.05
  for (const o of s.store.orders) {
    if (o.reviewed || o.deliveredDay == null || o.deliveredDay !== day - 5) continue
    o.reviewed = true
    if (o.financial === 'refunded' || o.financial === 'disputed' || o.financial === 'chargeback_lost') continue
    if (!chance(s, rate * (o.defective ? 1.8 : 1))) continue
    const p = findProduct(s, o.storeProductId)
    if (!p) continue
    let stars: number
    if (o.defective && !o.replacementSent) stars = chance(s, 0.6) ? 1 : 2
    else if (o.defective) stars = chance(s, 0.5) ? 3 : 4
    else if (o.late) stars = chance(s, 0.5) ? 3 : 4
    else stars = chance(s, 0.72) ? 5 : chance(s, 0.8) ? 4 : 3
    const r = p.reviews
    r.avg = Math.round(((r.avg * r.count + stars) / (r.count + 1)) * 100) / 100
    r.count++
    if (chance(s, photoShare)) r.photos++
    if (r.source === 'none') r.source = 'organic'
  }
}

/** Evidence preview for the dispute page (does not mutate). */
export function chargebackEvidencePreview(s: GameState, id: string): { evidence: number; items: { label: string; ok: boolean }[] } | null {
  const cb = s.store.chargebacks.find(c => c.id === id)
  if (!cb) return null
  const r = evidenceFor(s, cb, findOrder(s, cb.orderId), hasApp(s, 'chargeflo') ? 'app' : 'self')
  return { evidence: Math.round(r.e * 100) / 100, items: r.items }
}

export const openTicketCount = (s: GameState) => s.store.tickets.filter(t => t.status !== 'solved').length
export const ordersToFulfill = (s: GameState) => s.store.orders.filter(awaitingSupplier)

/** Remove old solved tickets and settled chargebacks from long histories. */
export function pruneOps(s: GameState, day: number) {
  const st = s.store
  const hourCut = (day - 45) * 24
  if (st.tickets.length > 400) st.tickets = st.tickets.filter(t => t.status !== 'solved' || (t.solvedHour ?? t.createdHour) >= hourCut)
  if (st.chargebacks.length > 300) {
    const keep = st.chargebacks.filter(c => c.status === 'needs_response' || c.status === 'submitted' || c.openedDay >= day - 120)
    st.chargebacks = keep
  }
  // orders: keep last 1,500 plus anything still in flight
  const CAP = 1500
  if (st.orders.length > CAP) {
    const excess = st.orders.length - CAP
    const openIds = new Set<number>()
    for (const t of st.tickets) if (t.status !== 'solved') openIds.add(t.orderId)
    for (const c of st.chargebacks) if (c.status === 'needs_response' || c.status === 'submitted') openIds.add(c.orderId)
    let removed = 0
    st.orders = st.orders.filter(o => {
      if (removed >= excess) return true
      const inFlight = openIds.has(o.id) || o.cbDay != null || (o.fulfillment !== 'delivered' && !o.cancelled && o.financial === 'paid')
      if (inFlight) return true
      removed++
      return false
    })
  }
}
