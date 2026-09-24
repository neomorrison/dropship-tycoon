import { describe, expect, it, vi } from 'vitest'

vi.mock('../../market', async () => (await import('./mocks')).marketMock)
vi.mock('../../finance', async () => (await import('./mocks')).financeMock)
vi.mock('../../life', async () => (await import('./mocks')).lifeMock)

import { dayOf } from '../../../core/time'
import {
  awaitingSupplier, conversionParts, createStore, fulfillOrder, importProduct, setProductStatus, storeOrganicTraffic,
  storeProcessTraffic, storeRange, storeTickHour,
} from '../index'
import { adPackets, makeState, runHours, setupGreatStore, setupNaiveStore, WINNER } from './fixtures'

// Traffic quality from the SPEC §7 intent formula:
//  novice — broad, no pixel app (×0.7), stuck in learning (×0.95), supplier-edit creative (fit ≈ 0.35)
//  expert — broad with ~150 pixel purchases (0.9 + 0.2·0.5), learning (×0.95), problem-callout hook (×1.05), fit ≈ 0.8
const NOVICE = { intent: 0.9 * 0.95 * 0.7, messageMatch: 0.9 + 0.2 * 0.35 }
const EXPERT = { intent: (0.9 + 0.2 * 0.5) * 0.95 * 1.05, messageMatch: 0.9 + 0.2 * 0.8 }
const SESSIONS_PER_DAY = 1000
const DAYS = 5 // ≈ 5,000 sessions

describe('conversion model (winner product)', () => {
  it('naive supplier-copy page converts ~0.4–1.2% over ~5,000 sessions', () => {
    // four independent stores × ~5,000 sessions: each run is a ~5k-session sample (±13% binomial noise);
    // the pooled rate pins the model's mean
    let sessions = 0
    let converted = 0
    for (const seed of [15838, 104729, 7, 2026]) {
      const s = makeState('normal', seed)
      const id = setupNaiveStore(s)
      const p = s.store.products.find(x => x.id === id)!
      const expected = conversionParts(s, p, NOVICE, { noise: false }).cvr
      expect(expected).toBeGreaterThan(0.004)
      expect(expected).toBeLessThan(0.012)
      const from = dayOf(s.time.hour)
      runHours(s, DAYS * 24, h => adPackets(id, SESSIONS_PER_DAY, h, NOVICE.intent, NOVICE.messageMatch))
      const r = storeRange(s, { from, to: dayOf(s.time.hour) })
      expect(r.sessions).toBeGreaterThan(4500)
      expect(r.sessions).toBeLessThan(5500)
      const cvr = r.converted / r.sessions
      expect(cvr).toBeGreaterThan(0.004)
      expect(cvr).toBeLessThan(0.016)
      sessions += r.sessions
      converted += r.converted
    }
    const pooled = converted / sessions
    expect(pooled).toBeGreaterThan(0.004)
    expect(pooled).toBeLessThan(0.012)
  })

  it('great page converts ~2.5–5% over ~5,000 sessions', () => {
    const s = makeState('normal', 15838)
    const id = setupGreatStore(s)
    const p = s.store.products.find(x => x.id === id)!
    const expected = conversionParts(s, p, EXPERT, { noise: false }).cvr
    expect(expected).toBeGreaterThan(0.025)
    expect(expected).toBeLessThan(0.05)
    const from = dayOf(s.time.hour)
    runHours(s, DAYS * 24, h => adPackets(id, SESSIONS_PER_DAY, h, EXPERT.intent, EXPERT.messageMatch))
    const r = storeRange(s, { from, to: dayOf(s.time.hour) })
    const cvr = r.converted / r.sessions
    expect(cvr).toBeGreaterThan(0.025)
    expect(cvr).toBeLessThan(0.05)
    // funnel shape stays within benchmark-like ratios
    expect(r.atc / r.sessions).toBeGreaterThan(cvr * 2.5)
    expect(r.checkout).toBeGreaterThanOrEqual(r.converted)
    expect(r.checkout).toBeLessThanOrEqual(r.atc)
  })

  it('page quality alone moves conversion substantially on identical traffic', () => {
    const a = makeState('normal', 1)
    const naiveId = setupNaiveStore(a)
    const b = makeState('normal', 1)
    const greatId = setupGreatStore(b)
    const same = { intent: 1, messageMatch: 1 }
    const naive = conversionParts(a, a.store.products.find(p => p.id === naiveId)!, same, { noise: false }).cvr
    const great = conversionParts(b, b.store.products.find(p => p.id === greatId)!, same, { noise: false }).cvr
    expect(great / naive).toBeGreaterThan(1.6)
  })
})

describe('orders & money', () => {
  it('captures revenue, fees and pays the supplier through DSerz', () => {
    const s = makeState('normal', 99)
    const id = setupGreatStore(s)
    const cardBefore = s.finance.card.balance
    // same day only (no payout yet): 07:00 → 23:00
    const events = [] as ReturnType<typeof storeProcessTraffic>
    for (let i = 0; i < 16; i++) {
      s.time.hour++
      const ev = storeProcessTraffic(s, adPackets(id, 3000, s.time.hour % 24, EXPERT.intent, EXPERT.messageMatch, 'ad_A'))
      events.push(...ev)
      storeTickHour(s)
    }
    const orders = s.store.orders
    expect(orders.length).toBeGreaterThan(20)
    for (const o of orders) {
      expect(o.total).toBeCloseTo(o.subtotal - o.discount + o.shippingCharged + o.upsell, 2)
      expect(o.fees).toBeGreaterThan(0)
      expect(o.supplierOrderedHour).not.toBeNull()
      expect(o.customer.name).toMatch(/\w+ \w+/)
      expect(o.customer.email).toMatch(/@/)
      expect(o.source).toBe('fadbook')
      expect(o.adId).toBe('ad_A')
    }
    const revenue = orders.reduce((a, o) => a + o.total, 0)
    const fees = orders.reduce((a, o) => a + o.fees, 0)
    expect(s.store.pendingBalance).toBeCloseTo(revenue - fees, 1)
    expect(s.finance.pnl[dayOf(s.time.hour)].revenue).toBeCloseTo(revenue, 1)
    // supplier paid on the card (cost incl. import duty + shipping)
    const supplier = orders.reduce((a, o) => a + (o.supplierCost ?? 0), 0)
    expect(s.finance.card.balance - cardBefore).toBeGreaterThanOrEqual(supplier - 0.05)
    expect(s.finance.ledger.some(l => l.category === 'cogs' && /DSerz/.test(l.memo))).toBe(true)
    // per-ad conversions add up to the orders from that ad
    expect(events.reduce((a, e) => a + e.purchases, 0)).toBe(orders.length)
    expect(events.reduce((a, e) => a + e.revenue, 0)).toBeCloseTo(revenue, 1)
    // sale toasts batched: at most one per hour
    const sales = s.notifications.filter(n => n.kind === 'sale')
    expect(new Set(sales.map(n => n.hour)).size).toBe(sales.length)
    expect(sales.length).toBeLessThanOrEqual(16)
  })

  it('without DSerz, dropship orders wait for a manual Fulfill', () => {
    const s = makeState('normal', 7)
    createStore(s, { name: 'Fur Free Co' })
    const id = importProduct(s, WINNER.id)
    setProductStatus(s, id, 'active')
    runHours(s, 14, h => adPackets(id, 4000, h, 1.2, 1.1))
    const waiting = s.store.orders.filter(awaitingSupplier)
    expect(waiting.length).toBeGreaterThan(0)
    expect(waiting.length).toBe(s.store.orders.filter(o => !o.cancelled && o.financial === 'paid').length)
    const card = s.finance.card.balance
    expect(fulfillOrder(s, waiting[0].id)).toBe(true)
    expect(s.finance.card.balance).toBeGreaterThan(card)
    expect(waiting[0].supplierOrderedHour).not.toBeNull()
    expect(waiting[0].tracking).toMatch(/^LX\d+CN$/)
    expect(s.coach.queue.some(t => /DSerz/.test(t.text))).toBe(true)
  })

  it('generates organic traffic only once a product is live', () => {
    const s = makeState('normal', 3)
    createStore(s, { name: 'Fur Free Co' })
    const id = importProduct(s, WINNER.id)
    expect(storeOrganicTraffic(s)).toEqual([])
    setProductStatus(s, id, 'active')
    let sessions = 0
    for (let i = 0; i < 24; i++) {
      s.time.hour++
      for (const p of storeOrganicTraffic(s)) sessions += p.sessions
    }
    expect(sessions).toBeGreaterThan(25)
    expect(sessions).toBeLessThan(80)
  })

  it('unpaid baseline traffic (bots, spy tools) almost never buys, even on a great page', () => {
    const s = makeState('normal', 11)
    setupGreatStore(s)
    runHours(s, 24 * 30, () => storeOrganicTraffic(s))
    const r = storeRange(s, { from: 0, to: dayOf(s.time.hour) })
    expect(r.sessions).toBeGreaterThan(600)
    // brand searches grow with the customer base, so a handful of stray orders is fine; a living is not
    expect(r.orders).toBeLessThanOrEqual(12)
  })
})
