import { describe, expect, it, vi } from 'vitest'

vi.mock('../../market', async () => (await import('./mocks')).marketMock)
vi.mock('../../finance', async () => (await import('./mocks')).financeMock)
vi.mock('../../life', async () => (await import('./mocks')).lifeMock)

import { dayOf, hourOfDay } from '../../../core/time'
import { BENCHMARKS } from '../../../data/benchmarks'
import {
  breakEven, chargebackRatio, generatePolicy, installApp, refundOrder, resolveTickets, respondChargeback, storeSeries,
  submitChargeback, updateStoreSettings,
} from '../index'
import { adPackets, makeState, runHours, setupGreatStore, setupNaiveStore } from './fixtures'
import type { GameState } from '../../../core/types'

function sellFor(s: GameState, id: string, hours: number, perDay = 2500) {
  runHours(s, hours, h => adPackets(id, perDay, h, 1.1, 1.05))
}

describe('refunds', () => {
  it('refunds come out of the Shopifly balance and show as returns', () => {
    const s = makeState('normal', 31)
    const id = setupGreatStore(s)
    sellFor(s, id, 10)
    const o = s.store.orders[0]
    const bal = s.store.pendingBalance
    const day = dayOf(s.time.hour)
    expect(refundOrder(s, o.id)).toBe(true)
    expect(o.financial).toBe('refunded')
    expect(s.store.pendingBalance).toBeCloseTo(bal - o.total, 2)
    expect(s.store.analytics.daily[day].returns).toBeCloseTo(o.total, 2)
    expect(s.finance.pnl[day].refunds).toBeCloseTo(o.total, 2)
    expect(refundOrder(s, o.id)).toBe(false)
  })
})

describe('chargebacks', () => {
  it('opens, deducts amount + fee, takes evidence and gets decided', () => {
    const s = makeState('normal', 41)
    const id = setupGreatStore(s)
    sellFor(s, id, 12)
    const o = s.store.orders[0]
    const bal = s.store.pendingBalance
    runHours(s, 24 * 16) // delivered (8–14 days) before the customer disputes
    expect(o.fulfillment).toBe('delivered')
    o.cbDay = dayOf(s.time.hour) + 1
    runHours(s, 48)
    const cb = s.store.chargebacks.find(c => c.orderId === o.id)!
    expect(cb).toBeDefined()
    expect(cb.status).toBe('needs_response')
    expect(o.financial).toBe('disputed')
    expect(cb.respondByDay - cb.openedDay).toBe(BENCHMARKS.chargebacks.respondWithinDays)
    expect(s.notifications.some(n => n.kind === 'critical' && /Chargeback/.test(n.title))).toBe(true)
    expect(s.inbox.some(m => /chargeback/i.test(m.subject))).toBe(true)
    // balance hit (a payout may have been cut at midnight in between: compare the day's P&L instead)
    expect(s.finance.pnl[cb.openedDay].chargebacks).toBeGreaterThanOrEqual(cb.amount + BENCHMARKS.chargebacks.feePerDispute - 0.01)
    expect(cb.fee).toBe(BENCHMARKS.chargebacks.feePerDispute)
    expect(bal).toBeGreaterThan(0)
    respondChargeback(s, cb.id, 'self')
    submitChargeback(s, cb.id, 'self')
    expect(cb.status).toBe('submitted')
    // tracking + proof of delivery + policies + honest page
    expect(cb.evidence).toBeGreaterThan(0.6)
    expect(cb.evidenceItems?.length).toBeGreaterThan(3)
    expect(s.skills.operations.xp).toBeGreaterThanOrEqual(20)
    runHours(s, (cb.decideDay! - dayOf(s.time.hour) + 1) * 24)
    expect(['won', 'lost']).toContain(cb.status)
    expect(['chargeback_won', 'chargeback_lost']).toContain(o.financial)
  })

  it('ChargeFlo responds automatically; unanswered disputes are lost at the deadline', () => {
    const s = makeState('normal', 43)
    const id = setupGreatStore(s)
    sellFor(s, id, 12)
    const [a, b] = s.store.orders
    a.cbDay = dayOf(s.time.hour) + 1
    runHours(s, 48)
    const cbA = s.store.chargebacks.find(c => c.orderId === a.id)!
    runHours(s, (BENCHMARKS.chargebacks.respondWithinDays + 2) * 24)
    expect(cbA.status).toBe('lost')
    installApp(s, 'chargeflo')
    b.cbDay = dayOf(s.time.hour) + 1
    runHours(s, 48)
    const cbB = s.store.chargebacks.find(c => c.orderId === b.id)!
    expect(cbB.status).toBe('submitted')
    expect(cbB.handledBy).toBe('app')
    expect(chargebackRatio(s)).toBeGreaterThan(0)
  })
})

describe('support tickets', () => {
  it('customers write in, unanswered tickets escalate, and support work solves them', () => {
    const s = makeState('normal', 51)
    const id = setupNaiveStore(s) // no delivery promise on the page → more "where is my order?"
    // two weeks of steady sales, nobody answering
    runHours(s, 24 * 18, h => adPackets(id, 1500, h, 1.2, 1.05))
    const all = s.store.tickets
    expect(all.length).toBeGreaterThan(3)
    for (const t of all) {
      expect(t.subject.length).toBeGreaterThan(5)
      expect(t.body.length).toBeGreaterThan(20)
      expect(t.body).not.toMatch(/\{(first|order|product|days|promise)\}/)
    }
    expect(all.some(t => t.status === 'escalated')).toBe(true)
    const open = all.filter(t => t.status !== 'solved').length
    const xp = s.skills.operations.xp
    const solved = resolveTickets(s, 50)
    expect(solved).toBe(Math.min(50, open))
    expect(s.skills.operations.xp).toBeGreaterThan(xp)
    expect(s.store.tickets.filter(t => t.status !== 'solved').length).toBe(open - solved)
  })
})

describe('queries & templates', () => {
  it('break-even uses landed cost incl. duty and fees', () => {
    const s = makeState('normal', 61)
    const id = setupGreatStore(s)
    const be = breakEven(s, id)
    expect(be.landedCost).toBeCloseTo(8.45 + 2.5, 2)
    expect(be.margin).toBeGreaterThan(15)
    expect(be.breakEvenCpa).toBe(be.margin)
    expect(be.breakEvenRoas).toBeCloseTo(31.49 / be.margin, 1)
  })

  it('series are hourly for short ranges and daily otherwise', () => {
    const s = makeState('normal', 62)
    const id = setupGreatStore(s)
    sellFor(s, id, 60)
    const today = dayOf(s.time.hour)
    const hourly = storeSeries(s, 'orders', { from: today, to: today })
    expect(hourly.length).toBe(hourOfDay(s.time.hour) + 1)
    const daily = storeSeries(s, 'totalSales', { from: today - 3, to: today })
    expect(daily.length).toBe(4)
    expect(daily.some(p => p.value > 0)).toBe(true)
  })

  it('policy templates mention the store and an honest delivery window', () => {
    const s = makeState('normal', 63)
    setupGreatStore(s)
    const ship = generatePolicy(s, 'shipping')
    expect(ship).toMatch(/8–14 days/)
    expect(generatePolicy(s, 'refund')).toMatch(/Fur Free Co/)
    updateStoreSettings(s, { policies: { ...s.store.policies, refund: generatePolicy(s, 'refund') } })
    expect(s.store.policies.refund.length).toBeGreaterThan(200)
  })
})
