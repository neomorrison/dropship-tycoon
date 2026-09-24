// ============================================================================
// FINANCE MODULE — bank & credit card, recurring bills (rent, plan, apps, staff),
// card statements/interest/late fees, Shopifly Capital, taxes, net worth history.
// Core money movement lives in core/money.ts (pay/receive/payCard) — use it.
// OWNER: sim-life-finance agent. PUBLIC API; keep every export & signature.
// ============================================================================
import type { Difficulty, FinanceState, GameState, RecurringBill } from '../../core/types'
import { DIFFICULTY } from '../../core/difficulty'
import { dayOf, formatDate } from '../../core/time'
import { notify, mail } from '../../core/notify'
import { uid } from '../../core/ids'
import { BENCHMARKS } from '../../data/benchmarks'
import { nextDomOnOrAfter, processBills, removeBillByRef as removeBillImpl, upsertBill as upsertBillImpl } from './bills'
import {
  cardDayRollover, ensureCard, payCardBalance as payCardImpl, requestCreditIncrease as creditIncreaseImpl, setAutopay as setAutopayImpl,
} from './card'
import { ensureTaxes, nextTaxDue, taxesDayRollover } from './taxes'
import { acceptCapital as acceptCapitalImpl, capitalDayRollover, capitalOffer as capitalOfferImpl } from './capital'

export function createFinanceState(d: Difficulty): FinanceState {
  const def = DIFFICULTY[d]
  return {
    cash: def.startingCash,
    card: { limit: def.cardLimit, balance: 0, apr: 0.2799, statementDom: 25, statementBalance: 0, minDue: 0, dueDay: null, autopay: 'min', lateCount: 0, frozen: false },
    loans: [], ledger: [], bills: [], pnl: {},
    taxes: { ytdBusinessProfit: 0, paidYtd: 0, nextDueDay: 44, lastEstimate: 0 },
  }
}

const CHAISE = { from: 'Chaise Bank', fromEmail: 'no-reply@alerts.chaise.com', tag: 'bank' as const, site: 'bank' as const }

export function financeOnNewGame(s: GameState): void {
  const today = dayOf(s.time.hour)
  const c = s.finance.card
  c.apr = BENCHMARKS.life.creditCard.apr
  ensureCard(s)
  ensureTaxes(s)
  s.finance.taxes.nextDueDay = nextTaxDue(today).day
  s.finance.capitalOfferMailDay ??= null
  s.finance.lowBalanceWarnDay ??= null
  const personal: Omit<RecurringBill, 'id'>[] = [
    { name: 'Veritone Wireless — Unlimited Basic', amount: 45, cadence: 'monthly', nextDueDay: nextDomOnOrAfter(today + 1, 18), payWith: 'bank', category: 'subscription', business: false, ref: 'phone', dom: 18 },
    { name: 'IronWorks Gym — Classic membership', amount: 15, cadence: 'monthly', nextDueDay: nextDomOnOrAfter(today + 1, 9), payWith: 'bank', category: 'subscription', business: false, ref: 'gym', dom: 9 },
  ]
  for (const b of personal) upsertBillImpl(s, { ...b, id: uid(s, 'bill') })
  mail(s, {
    ...CHAISE, path: 'card', subject: 'Welcome to your Chaise Sapphire card',
    body: [
      `Your Chaise Sapphire Visa is active.`,
      '',
      `Credit limit: $${c.limit.toLocaleString('en-US')}`,
      `Purchase APR: ${(c.apr * 100).toFixed(2)}% (variable)`,
      `Statement closes on the ${c.statementDom}th of each month; payment is due 25 days later.`,
      `Autopay: minimum payment from checking (change it anytime).`,
      '',
      'Pay your full statement balance by the due date and you pay no interest. Pay only the minimum and interest is charged on everything, including new purchases.',
      `Late payments cost $${BENCHMARKS.life.creditCard.lateFee} and trigger a 29.99% penalty APR.`,
      '',
      'Chaise Bank — banking that works as hard as you do.',
    ].join('\n'),
  })
}

export function financeTickHour(s: GameState): void {
  const c = s.finance.card
  if (c.limit <= 0) return
  const h = s.time.hour % 24
  if (h !== 12) return
  // midday utilization alert, at most once every 3 days
  const util = c.balance / c.limit
  const last = Number(s.flags['fin.utilWarnDay'] ?? -99)
  const today = dayOf(s.time.hour)
  if (util >= 0.9 && today - last >= 3) {
    s.flags['fin.utilWarnDay'] = today
    notify(s, { kind: 'warning', title: `Card ${Math.round(util * 100)}% used`, body: `Only $${Math.max(0, c.limit - c.balance).toFixed(2)} left. Ad and supplier charges will start failing.`, site: 'bank', path: 'card' })
  }
}

/** Bills due, card statement/interest/late fees, taxes, capital withholding, history snapshot. */
export function financeDayRollover(s: GameState, day: number): void {
  ensureCard(s)
  ensureTaxes(s)
  processBills(s, day)
  cardDayRollover(s, day)
  taxesDayRollover(s, day)
  capitalDayRollover(s, day)
  // low-balance alert
  const last = s.finance.lowBalanceWarnDay
  if (s.finance.cash < 100 && (last === null || last === undefined || day - last >= 7)) {
    s.finance.lowBalanceWarnDay = day
    mail(s, { ...CHAISE, path: '', subject: 'Low balance alert', body: `Your checking balance is $${s.finance.cash.toFixed(2)} as of ${formatDate(day, 'long')}.\n\nUpcoming automatic payments (rent, bills, card autopay) may be declined. Returned payments can lead to fees from the merchant.` })
  }
}

export function payCardBalance(s: GameState, amount: number): number { return payCardImpl(s, amount) }
export function setAutopay(s: GameState, mode: 'none' | 'min' | 'full'): void { setAutopayImpl(s, mode) }
export function requestCreditIncrease(s: GameState): { ok: boolean; newLimit?: number; reason?: string } {
  return creditIncreaseImpl(s, dayOf(s.time.hour))
}
export function upsertBill(s: GameState, bill: RecurringBill): void { upsertBillImpl(s, bill) }
export function removeBillByRef(s: GameState, ref: string): void { removeBillImpl(s, ref) }
/** Current Shopifly Capital offer based on sales history, or null. `fee` is in dollars. */
export function capitalOffer(s: GameState): { amount: number; fee: number; withholdPct: number; feePct?: number; total?: number; avgDaily?: number } | null {
  return capitalOfferImpl(s)
}
export function acceptCapital(s: GameState): boolean { return acceptCapitalImpl(s) }

// ---- additional exports ----
export { registerBillHandler, billsDueWithin, monthlyBurn, advanceDue, nextDomOnOrAfter, type BillHandler, type BillPaidInfo, type BillFailedInfo } from './bills'
export { cardSummary, cardDueStatus, creditIncreaseEligibility, CARD_RULES } from './card'
export { taxEstimate, taxDueDates, nextTaxDue, setTaxAutopay, TAX_RULES } from './taxes'
export { capitalWithhold, activeCapital, CAPITAL_RULES, type CapitalOffer } from './capital'
export { businessProfit, rangePnl, recentIncome } from './pnl'
import { payTaxes as payTaxesImpl } from './taxes'
/** Pay estimated taxes from checking (past-due first). Omit amount to pay everything outstanding. */
export function payTaxes(s: GameState, amount?: number): number { return payTaxesImpl(s, dayOf(s.time.hour), amount) }
