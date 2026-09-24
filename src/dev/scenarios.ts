// ============================================================================
// DEV ONLY — QA scenarios: realistic mid-game states built by driving the real
// public sim APIs + tickHour on createNewGame (see src/dev/player.ts). Loaded by
// src/dev/boot.ts from `?scenario=<name>` in dev builds; never shipped.
//
//   fresh   day 0, 7:00 AM — brand-new game, nothing set up
//   store   day 3 — store created, DSerz / Fadbook / TikTak channels / JudgyMe installed,
//           2 products imported (one well-written & active, one untouched draft),
//           the AliExprez sample in hand, Mineo subscribed. No ad accounts yet.
//   ads     day 35 — Fadbook + TikTak accounts with campaigns / ad sets / ads, several
//           ready creatives (self-shot + UGC), orders, tickets, chargebacks and payouts
//           flowing, Mineo still active. No pending decision modal.
//   scaled  day 120 — agent + 3PL bulk inventory, staff hired, Studio apartment (tier 2),
//           four months of history.
//   crisis  day 314 (mid-January, a month before Chinese New Year) — Fadbook account
//           restricted, TikTak account payment_failed, credit card near its limit and
//           checking drained, open chargebacks and unanswered tickets, CNY warning mails.
//
// Deterministic for a given seed. Typical build time: fresh/store < 0.1 s, ads ≈ 0.3 s,
// scaled ≈ 1–2 s, crisis ≈ 2–4 s.
// ============================================================================
import type { Difficulty, GameState } from '../core/types'
import { createNewGame } from '../core/newGame'
import { cardAvailable, pay } from '../core/money'
import { resolveModal } from '../core/modals'
import { dismissCoachTip, registerEventModalHandlers } from '../sim/events'
import { tickHour } from '../sim'
import { dayOf } from '../core/time'
import * as market from '../sim/market'
import * as ads from '../sim/ads'
import * as life from '../sim/life'
import * as finance from '../sim/finance'
import { banAccount } from '../sim/ads/accounts'
import { openChargeback } from '../sim/store/ops'
import { Player, today } from './player'

export const SCENARIO_NAMES = ['fresh', 'store', 'ads', 'scaled', 'crisis'] as const
export type ScenarioName = (typeof SCENARIO_NAMES)[number]

export const SCENARIO_INFO: Record<ScenarioName, string> = {
  fresh: 'Day 1, 7:00 AM: brand-new game, nothing set up',
  store: 'Day 4: store + 4 apps, 2 products (1 polished & active), sample in hand, no ad accounts',
  ads: 'Day 36: Fadbook + TikTak campaigns live, creatives, orders, tickets, disputes, payouts',
  scaled: 'Day 121: agent + 3PL stock, staff, Studio apartment, 4 months of history',
  crisis: 'Day 315: Fadbook restricted, TikTak payment failed, card maxed, open disputes, CNY warnings',
}

export interface ScenarioOptions {
  seed?: number
  difficulty?: Difficulty
  playerName?: string
}

export const DEFAULT_SEED = 20260302

export function isScenarioName(x: unknown): x is ScenarioName {
  return typeof x === 'string' && (SCENARIO_NAMES as readonly string[]).includes(x)
}

/** absolute hour of `day` at `hourOfDay` */
const at = (day: number, hourOfDay: number) => day * 24 + hourOfDay

/** Build a scenario's GameState (plain object, not yet in the store). Throws on an unknown name. */
export function buildScenario(name: string, opts: ScenarioOptions = {}): GameState {
  if (!isScenarioName(name)) throw new Error(`Unknown scenario "${name}". Use one of: ${SCENARIO_NAMES.join(', ')}`)
  // decision-modal handlers for event kinds (idempotent) — the scenario resolves modals while simulating
  try { registerEventModalHandlers() } catch { /* already registered */ }
  const s = createNewGame({ playerName: opts.playerName ?? 'Jordan Rivera', difficulty: opts.difficulty ?? 'normal', seed: opts.seed ?? DEFAULT_SEED })
  switch (name) {
    case 'fresh': return s
    case 'store': return buildStore(s)
    case 'ads': return buildAds(s)
    case 'scaled': return buildScaled(s)
    case 'crisis': return buildCrisis(s)
  }
}

/**
 * What each scenario promises. Returns the unmet promises (empty = all good). The sim is
 * changing under active development, so the boot logs these as warnings instead of failing.
 */
export function scenarioChecks(name: ScenarioName, s: GameState): string[] {
  const out: string[] = []
  const expect = (ok: boolean, what: string) => { if (!ok) out.push(what) }
  const acc = (p: 'fadbook' | 'tiktak') => s.ads.accounts.filter(a => a.platform === p).map(a => a.status)
  expect(s.events.modals.length === 0, 'no pending decision modal')
  if (name === 'fresh') return out
  expect(s.store.created, 'store created')
  expect(s.store.products.length >= 2, '2+ products imported')
  expect(s.store.products.some(p => p.status === 'active'), 'an active product')
  expect(s.catalog.samplesOwned.length >= 1, 'sample in hand')
  if (name === 'store') {
    for (const app of ['dserz', 'fadbook-channel', 'tiktak-channel', 'judgyme']) expect(s.store.apps.some(a => a.appId === app), `${app} installed`)
    expect(s.ads.accounts.length === 0, 'no ad accounts yet')
    return out
  }
  expect(s.store.orders.length >= 50, '50+ orders')
  expect(s.store.payouts.length >= 1, 'payouts')
  expect(s.creatives.creatives.filter(c => c.status === 'ready').length >= 3, '3+ ready creatives')
  if (name === 'ads') {
    expect(acc('fadbook').includes('active'), 'active Fadbook account')
    expect(acc('tiktak').includes('active'), 'active TikTak account')
    expect(s.ads.campaigns.filter(c => c.status !== 'deleted').length >= 2, 'campaigns on both platforms')
    expect(s.ads.ads.length >= 4, '4+ ads')
    expect(s.store.tickets.length >= 1, 'support tickets')
    expect(s.store.chargebacks.some(c => c.status === 'needs_response'), 'a dispute awaiting response')
  }
  if (name === 'scaled') {
    expect(s.catalog.unlocks.agent && s.catalog.unlocks.threePL, 'agent + 3PL unlocked')
    expect(Object.values(s.catalog.inventory).some(x => x.units > 0), '3PL inventory on hand')
    expect(s.staff.members.length >= 1, 'staff hired')
    expect(s.home.tier === 2, 'Studio apartment (tier 2)')
    expect(acc('fadbook').includes('active'), 'active Fadbook account')
  }
  if (name === 'crisis') {
    expect(acc('fadbook').includes('restricted'), 'Fadbook account restricted')
    expect(acc('tiktak').includes('payment_failed'), 'TikTak account payment_failed')
    expect(s.finance.card.balance >= 0.9 * s.finance.card.limit, 'card near its limit')
    expect(s.store.chargebacks.some(c => c.status === 'needs_response'), 'open chargebacks')
    expect(s.inbox.some(m => /spring festival|chinese new year/i.test(m.subject)), 'CNY warning mail')
  }
  return out
}

// ---------------------------------------------------------------------------
// store — day 3
// ---------------------------------------------------------------------------
function buildStore(s: GameState): GameState {
  const p = new Player(s, { platforms: [], cancelSpyDay: null })
  p.setupStore(['dserz', 'fadbook-channel', 'tiktak-channel', 'judgyme'])
  // no creatives / ads yet: this is the "page built, sample just arrived" moment
  p.t.launchAds = false
  p.t.manageAds = false
  p.t.orderCreatives = false
  p.runUntil(at(3, 9))
  // the sample is forced to arrive by day 2 (fastSample); make sure it's in hand either way
  receiveSamples(s)
  finish(p)
  return s
}

// ---------------------------------------------------------------------------
// ads — day 35
// ---------------------------------------------------------------------------
function buildAds(s: GameState): GameState {
  const p = new Player(s, { platforms: ['fadbook', 'tiktak'], cancelSpyDay: null, maxBudget: 300, supportEvery: 3 })
  p.setupStore()
  p.setupAds()
  p.onDaily = d => {
    if (d === 33) p.t.respondDisputes = false // leave the newest disputes for the player
  }
  p.runUntil(at(35, 20))
  ensureOpenDisputes(s, 1)
  finish(p)
  return s
}

// ---------------------------------------------------------------------------
// scaled — day 120
// ---------------------------------------------------------------------------
function buildScaled(s: GameState): GameState {
  const p = new Player(s, { platforms: ['fadbook', 'tiktak'], cancelSpyDay: 25, maxBudget: 450, tiktakBudget: 40 })
  p.setupStore()
  p.setupAds()
  const cat = () => p.ids.catalogId
  let quoted = false
  p.onDaily = d => {
    const c = s.catalog
    // sourcing agent once unlocked (100 orders): quote, then switch to agent dropship
    if (c.unlocks.agent && !quoted) {
      market.requestAgentQuote(s, cat())
      quoted = true
    } else if (quoted && market.fulfillmentFor(s, cat()).mode === 'dropship' && !c.bulkOrders.length) {
      market.setFulfillmentMode(s, cat(), 'agent')
    }
    // bulk stock at a US 3PL: a first air shipment (~3 weeks of sales), then sea freight
    // for ~60 days, topped up by air whenever stock + incoming runs low
    if (c.unlocks.threePL && d >= 30) {
      const unitsPerDay = Math.max(1, market.recentSales(s, cat(), 14).units / 14)
      const stock = (c.inventory[cat()]?.units ?? 0) + c.bulkOrders.filter(o => o.catalogId === cat() && o.status !== 'received').reduce((a, o) => a + o.qty, 0)
      if (!c.bulkOrders.length) placeBulk(s, cat(), Math.round(unitsPerDay * 21), 'air')
      else if (c.bulkOrders.length === 1 && d >= 50) placeBulk(s, cat(), Math.round(unitsPerDay * 60), 'sea')
      const onHand = c.inventory[cat()]?.units ?? 0
      const airInFlight = c.bulkOrders.some(o => o.catalogId === cat() && o.method === 'air' && o.status !== 'received')
      if (c.bulkOrders.length >= 2 && !airInFlight && onHand < unitsPerDay * 7 && stock < unitsPerDay * 45) placeBulk(s, cat(), Math.round(unitsPerDay * 21), 'air')
      if ((c.inventory[cat()]?.units ?? 0) > 0 && market.fulfillmentFor(s, cat()).configuredMode !== 'bulk' && market.fulfillmentFor(s, cat()).mode !== 'bulk') market.setFulfillmentMode(s, cat(), 'bulk')
    }
    // staff: a VA for support first, then a UGC creator / copywriter
    if (d >= 70 && s.staff.members.length < 2) {
      if (!s.staff.candidates.length || s.staff.candidates.every(x => x.expiresDay < d)) life.refreshCandidates(s)
      const want = s.staff.members.length === 0 ? ['va'] : ['ugc_creator', 'copywriter', 'designer', 'ops_manager']
      const cand = want.map(r => s.staff.candidates.find(x => x.role === r && x.expiresDay >= d)).find(Boolean)
      if (cand) life.hireStaff(s, cand.id)
    }
    // move up to the Studio once the landlord says yes
    if (d >= 80 && s.home.tier < 2) life.moveApartment(s, 2)
  }
  p.runUntil(at(120, 20))
  // guarantee the scenario's promises even if the market/RNG was unkind
  if (s.home.tier < 2) life.moveApartment(s, 2)
  if (!s.staff.members.length) {
    life.refreshCandidates(s)
    const va = s.staff.candidates.find(x => x.role === 'va') ?? s.staff.candidates[0]
    if (va) life.hireStaff(s, va.id)
  }
  finish(p)
  return s
}

function placeBulk(s: GameState, catalogId: string, qty: number, method: 'sea' | 'air'): boolean {
  const q0 = market.bulkQuote(s, catalogId, qty, method, 'bulk')
  const moq = q0.moq || 0
  let units = Math.max(moq, qty)
  // keep a cash buffer: never spend more than half of cash + available credit on stock
  // (a big order shrinks to what that buffer allows instead of waiting forever)
  const budget = 0.5 * (s.finance.cash + cardAvailable(s))
  if (q0.landedUnit > 0 && units * q0.landedUnit > budget) units = Math.max(moq, Math.floor(budget / q0.landedUnit / 50) * 50)
  const q = market.bulkQuote(s, catalogId, units, method, 'bulk')
  if (!q.ok || q.total > budget) return false
  return market.placeBulkOrder(s, catalogId, units, method, 'bulk')
}

// ---------------------------------------------------------------------------
// crisis — day 314 (T-28 before CNY 2027)
// Story: Neo saved up at McDoodle's for eight months, launched in mid-November right
// before BFCM, scaled on the credit card through the holidays and let support slide.
// (The idle months are simulated without a business, which keeps the build fast.)
// ---------------------------------------------------------------------------
const CRISIS_LAUNCH_DAY = 250

function buildCrisis(s: GameState): GameState {
  const p = new Player(s, { platforms: ['fadbook', 'tiktak'], cancelSpyDay: CRISIS_LAUNCH_DAY + 30, maxBudget: 260, tiktakBudget: 40, quitJob: false })
  p.idleUntil(at(CRISIS_LAUNCH_DAY, 9))
  p.setupStore()
  p.setupAds()
  p.onDaily = d => {
    if (d === 290) {
      // the holidays went well: stop paying the card down, autopay covers minimums only, scale TikTak
      p.t.payDownCard = false
      finance.setAutopay(s, 'min')
      const set = s.ads.adSets.find(x => x.id === p.ids.ttAdGroupId)
      if (set) ads.updateAdSet(s, set.id, { dailyBudget: 120 })
    }
    if (d === 296) p.o.supportEvery = 3 // too busy: tickets escalate into chargebacks
    if (d === 302) p.t.answerTickets = false
    if (d === 305) p.t.respondDisputes = false // …and the disputes pile up
  }
  p.runUntil(at(311, 20))
  p.t.answerTickets = false
  p.t.recoverAccounts = false
  p.t.manageAds = false
  p.t.launchAds = false
  // day 312: Fadbook restricts the account (too much negative feedback)
  p.runUntil(at(312, 10))
  const fb = s.ads.accounts.find(a => a.platform === 'fadbook' && a.status !== 'restricted' && a.status !== 'disabled')
  if (fb) restrict(s, fb.id)
  // "Decide later": leave the appeal to the player (Account quality → Request review)
  for (const m of [...s.events.modals]) if (m.choices.some(c => c.id === 'later')) resolveModal(s, m.id, 'later')
  p.resolveModals()
  p.runUntil(at(314, 11))
  // the cash crunch: a big pre-CNY stock order on the card + the balance from checking
  squeezeCash(s, p.ids.catalogId)
  failTiktakBilling(s)
  ensureOpenDisputes(s, 2)
  p.resolveModals()
  finish(p, { tick: false })
  return s
}

/** Restrict an ad account through the sim's own ban path (mail, notification, modal), always as "restricted". */
function restrict(s: GameState, accountId: string) {
  const acc = s.ads.accounts.find(a => a.id === accountId)
  if (!acc) return
  const mailsBefore = s.inbox.length
  const notesBefore = s.notifications.length
  banAccount(s, acc, 'feedback')
  if (acc.status === 'disabled') {
    acc.status = 'restricted'
    for (const m of s.inbox.slice(mailsBefore)) {
      m.subject = m.subject.replace('disabled', 'restricted')
      m.body = m.body.replace(/disabled/g, 'restricted')
    }
    for (const n of s.notifications.slice(notesBefore)) {
      n.title = n.title.replace('disabled', 'restricted')
      if (n.body) n.body = n.body.replace(/disabled/g, 'restricted')
    }
    for (const m of s.events.modals) {
      m.title = m.title.replace('disabled', 'restricted')
    }
  }
}

/** Card to ~98% of its limit (pre-CNY stock order) and checking down to pocket change. */
function squeezeCash(s: GameState, catalogId: string) {
  const card = s.finance.card
  const onCard = card.limit * 0.985 - card.balance
  if (onCard > 50) {
    const q = market.bulkQuote(s, catalogId, 1, 'sea', 'bulk')
    const unit = q.landedUnit || 1
    const qty = Math.floor(onCard / unit)
    const quote = market.bulkQuote(s, catalogId, qty, 'sea', 'bulk')
    const placed = quote.ok && quote.total <= cardAvailable(s) && market.placeBulkOrder(s, catalogId, qty, 'sea', 'bulk')
    const rest = card.limit * 0.985 - card.balance
    if (!placed || rest > 50) {
      pay(s, Math.max(0, rest), { category: 'inventory', memo: 'SourcePro: pre-CNY production deposit (30%)', business: true, prefer: 'card', strict: true })
    }
  }
  drainChecking(s)
}

function drainChecking(s: GameState) {
  const extra = s.finance.cash - 38.12
  if (extra > 0) pay(s, extra, { category: 'inventory', memo: 'SourcePro: pre-CNY production balance (70%)', business: true, prefer: 'bank', strict: true })
}

/** Let TikTak's next charge bounce: the player tries to pay the balance early and it's declined. */
function failTiktakBilling(s: GameState) {
  const tt = () => s.ads.accounts.find(a => a.platform === 'tiktak' && (a.status === 'active' || a.status === 'payment_failed'))
  for (let i = 0; i < 72; i++) {
    const acc = tt()
    if (!acc || acc.status === 'payment_failed') break
    const funds = Math.max(s.finance.cash, cardAvailable(s))
    if (acc.unbilled > funds + 1) {
      ads.payAdBalance(s, acc.id)
      break
    }
    tickHour(s)
    drainChecking(s) // payouts keep landing: the player keeps sending them to the supplier
  }
}

// ---------------------------------------------------------------------------
// shared
// ---------------------------------------------------------------------------
/**
 * Make sure at least `n` chargebacks await a response. The sim opens disputes from escalated
 * tickets / late or defective orders; if the RNG produced fewer, open them on the orders a
 * real customer would most likely dispute (late, escalated, defective, then any shipped order).
 */
function ensureOpenDisputes(s: GameState, n: number) {
  const open = () => s.store.chargebacks.filter(c => c.status === 'needs_response').length
  if (open() >= n) return
  const disputed = new Set(s.store.chargebacks.map(c => c.orderId))
  const escalated = new Set(s.store.tickets.filter(t => t.status === 'escalated').map(t => t.orderId))
  const day = today(s)
  const rank = (o: GameState['store']['orders'][number]) => (escalated.has(o.id) ? 4 : 0) + (o.late ? 2 : 0) + (o.defective ? 1 : 0)
  const pool = s.store.orders
    .filter(o => !disputed.has(o.id) && o.financial === 'paid' && o.fulfillment !== 'unfulfilled' && dayOf(o.hour) >= day - 40 && dayOf(o.hour) <= day - 8)
    .sort((a, b) => rank(b) - rank(a) || b.hour - a.hour)
  for (const o of pool) {
    if (open() >= n) break
    openChargeback(s, o)
  }
}

function receiveSamples(s: GameState) {
  for (const smp of s.catalog.samples) {
    if (smp.received) continue
    smp.received = true
    smp.arriveDay = Math.min(smp.arriveDay, today(s))
    if (!s.catalog.samplesOwned.includes(smp.catalogId)) s.catalog.samplesOwned.push(smp.catalogId)
  }
}

/**
 * Leave the game in a calm, modal-free moment with the player at home (so the desktop
 * computer, not the phone, is available): tick a few more hours if needed.
 */
function finish(p: Player, o: { tick?: boolean } = {}) {
  const s = p.s
  p.resolveModals()
  if (o.tick !== false) {
    for (let i = 0; i < 16 && (s.player.location !== 'home' || s.player.activity?.kind === 'sleep'); i++) {
      tickHour(s)
      p.resolveModals()
    }
  }
  // a real player reads or dismisses Coach Kev's tips as they come: drop the ones older than 2 days
  for (const tip of [...s.coach.queue]) if (s.time.hour - tip.hour > 48) dismissCoachTip(s, tip.id)
}
