// ============================================================================
// FINANCE MODULE — bank & credit card, recurring bills (rent, plan, apps, staff),
// card statements/interest/late fees, Shopifly Capital, taxes, net worth history.
// Core money movement lives in core/money.ts (pay/receive/payCard) — use it.
// OWNER: sim-life-finance agent. PUBLIC API; keep every export & signature.
// ============================================================================
import type { Difficulty, FinanceState, GameState, RecurringBill } from '../../core/types'
import { DIFFICULTY } from '../../core/difficulty'

export function createFinanceState(d: Difficulty): FinanceState {
  const def = DIFFICULTY[d]
  return {
    cash: def.startingCash,
    card: { limit: def.cardLimit, balance: 0, apr: 0.2799, statementDom: 25, statementBalance: 0, minDue: 0, dueDay: null, autopay: 'min', lateCount: 0, frozen: false },
    loans: [], ledger: [], bills: [], pnl: {},
    taxes: { ytdBusinessProfit: 0, paidYtd: 0, nextDueDay: 44, lastEstimate: 0 },
  }
}
export function financeOnNewGame(_s: GameState): void {}
export function financeTickHour(_s: GameState): void {}
/** Bills due, card statement/interest/late fees, taxes, capital withholding, history snapshot. */
export function financeDayRollover(_s: GameState, _day: number): void {}

export function payCardBalance(_s: GameState, _amount: number): number { return 0 }
export function setAutopay(_s: GameState, _mode: 'none' | 'min' | 'full'): void {}
export function requestCreditIncrease(_s: GameState): { ok: boolean; newLimit?: number; reason?: string } { return { ok: false, reason: 'Not implemented' } }
export function upsertBill(_s: GameState, _bill: RecurringBill): void {}
export function removeBillByRef(_s: GameState, _ref: string): void {}
/** Current Shopifly Capital offer based on sales history, or null. */
export function capitalOffer(_s: GameState): { amount: number; fee: number; withholdPct: number } | null { return null }
export function acceptCapital(_s: GameState): boolean { return false }
