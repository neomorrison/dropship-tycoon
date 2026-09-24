import { describe, expect, it, vi } from 'vitest'

vi.mock('../../market', async () => (await import('./mocks')).marketMock)
vi.mock('../../finance', async () => (await import('./mocks')).financeMock)
vi.mock('../../life', async () => (await import('./mocks')).lifeMock)

import { addBusinessDays, dayOf, hourOfDay } from '../../../core/time'
import { DIFFICULTY } from '../../../core/difficulty'
import { BENCHMARKS } from '../../../data/benchmarks'
import { resolveModal } from '../../../core/modals'
import type { GameState } from '../../../core/types'
import { adPackets, makeState, runHours, setupGreatStore } from './fixtures'

/** Run until the given day/hour (absolute). */
function runUntil(s: GameState, day: number, hour: number) {
  const target = day * 24 + hour
  if (target > s.time.hour) runHours(s, target - s.time.hour)
}

describe('payouts', () => {
  it('a payout arrives after the configured business days (first one +7 days)', () => {
    const s = makeState('normal', 5)
    const id = setupGreatStore(s)
    const d0 = dayOf(s.time.hour)
    // sales for the rest of day d0
    const sales = makeSales(s, id, d0)
    expect(sales).toBeGreaterThan(0)
    expect(sales).toBeLessThan(2000)
    const captured = s.store.pendingBalance
    runHours(s, 1) // midnight → payout for d0
    const p1 = s.store.payouts.find(p => p.createdDay === d0)!
    expect(p1).toBeDefined()
    expect(p1.amount).toBeCloseTo(captured, 2)
    expect(p1.gross).toBeGreaterThan(p1.amount)
    const expectedArrive = addBusinessDays(d0, DIFFICULTY.normal.payoutDays) + BENCHMARKS.fees.firstPayoutDelayDays
    expect(p1.arriveDay).toBe(expectedArrive)
    expect(p1.status).toBe('pending')
    // not before 6 AM on the arrival day
    runUntil(s, expectedArrive, 5)
    expect(p1.status === 'pending' || s.store.payouts.find(p => p.id === p1.id)!.status === 'pending').toBe(true)
    const cash = s.finance.cash
    const amount = s.store.payouts.find(p => p.id === p1.id)!.amount
    runUntil(s, expectedArrive, 6)
    const after = s.store.payouts.find(p => p.id === p1.id)!
    expect(after.status).toBe('paid')
    expect(s.finance.cash - cash).toBeCloseTo(amount, 2)
    expect(s.finance.ledger.some(l => l.category === 'payout' && l.amount === amount)).toBe(true)

    // later payouts follow the normal schedule (no first-payout delay)
    const d1 = dayOf(s.time.hour)
    makeSales(s, id, d1)
    runUntil(s, d1 + 1, 0)
    const p2 = s.store.payouts.find(p => p.createdDay === d1 && p.kind === 'sales')!
    expect(p2.arriveDay).toBe(addBusinessDays(d1, DIFFICULTY.normal.payoutDays))
  })

  it('Chill pays out the next business day', () => {
    const s = makeState('chill', 8)
    const id = setupGreatStore(s)
    const d0 = dayOf(s.time.hour)
    makeSales(s, id, d0)
    runHours(s, 24 - hourOfDay(s.time.hour))
    const p = s.store.payouts[0]
    expect(p.arriveDay).toBe(addBusinessDays(d0, 1) + BENCHMARKS.fees.firstPayoutDelayDays)
  })

  it('withholds Shopifly Capital repayments from payouts', () => {
    const s = makeState('normal', 11)
    const id = setupGreatStore(s)
    s.finance.loans.push({ id: 'loan_1', lender: 'shopifly_capital', principal: 5000, remaining: 5000, withholdPct: 0.15, takenDay: 0 })
    const d0 = dayOf(s.time.hour)
    makeSales(s, id, d0)
    const captured = s.store.pendingBalance
    runHours(s, 24 - hourOfDay(s.time.hour))
    const p = s.store.payouts[0]
    expect(p.capitalWithheld).toBeCloseTo(captured * 0.15, 1)
    expect(p.amount).toBeCloseTo(captured * 0.85, 1)
    expect(s.finance.loans[0].remaining).toBeCloseTo(5000 - captured * 0.15, 1)
    expect(s.finance.loans[0].withheldPayoutIds).toContain(p.id)
  })

  it('holds payouts after a sudden sales spike and asks the player via a modal', () => {
    const s = makeState('normal', 21)
    const id = setupGreatStore(s)
    const d0 = dayOf(s.time.hour)
    // a huge first day (no history) → risk review
    for (let h = hourOfDay(s.time.hour); h < 23; h++) runHours(s, 1, hh => adPackets(id, 60000, hh, 1.2, 1.1))
    expect(s.store.analytics.daily[d0].totalSales).toBeGreaterThan(2000)
    runHours(s, 1)
    expect(s.store.hold?.paused).toBe(true)
    expect(s.store.payouts[0].status).toBe('held')
    const modal = s.events.modals.find(m => m.kind === 'store_payout_hold')!
    expect(modal).toBeDefined()
    resolveModal(s, modal.id, 'verify')
    expect(s.events.modals.length).toBe(0)
    // eventually released and paid
    runUntil(s, (s.store.hold?.pauseUntilDay ?? d0) + 12, 8)
    expect(s.store.hold?.paused ?? false).toBe(false)
    expect(s.store.payouts[0].status).toBe('paid')
  })
})

/** Push high-intent paid traffic for the rest of the current day. Returns sales captured. */
function makeSales(s: GameState, id: string, day: number, perDay = 700): number {
  // stays under the $2,000/day spike-review line for a new store
  const before = s.store.analytics.daily[day]?.totalSales ?? 0
  while (hourOfDay(s.time.hour) < 23) runHours(s, 1, h => adPackets(id, perDay, h, 1.2, 1.1))
  return (s.store.analytics.daily[day]?.totalSales ?? 0) - before
}
