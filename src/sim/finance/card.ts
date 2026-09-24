// Chaise Sapphire credit card: monthly statements, interest, minimum payments, autopay, late fees,
// penalty APR (and its cure), freezing, and credit-limit increases. SPEC §4.
import type { CardStatement, GameState } from '../../core/types'
import { chargeCardForced, payCard } from '../../core/money'
import { notify, mail } from '../../core/notify'
import { dateOfDay, daysInMonth, domOf, formatDate } from '../../core/time'
import { BENCHMARKS } from '../../data/benchmarks'
import { recentIncome } from './pnl'

export const CARD_RULES = {
  penaltyApr: 0.2999,
  lateFee: BENCHMARKS.life.creditCard.lateFee,
  minPaymentPct: BENCHMARKS.life.creditCard.minPaymentPct,
  minPaymentFloor: 35,
  graceDays: 25,
  /** consecutive on-time payments that restore the regular APR (CARD Act: 6 months) */
  penaltyCureStreak: 6,
  latesToFreeze: 2,
  onTimeForIncrease: 3,
  increaseCooldownDays: 90,
}

const CHAISE = { from: 'Chaise Bank', fromEmail: 'no-reply@alerts.chaise.com', tag: 'bank' as const, site: 'bank' as const }
const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
const pctStr = (x: number) => (x * 100).toFixed(2) + '%'

export function ensureCard(s: GameState): void {
  const c = s.finance.card
  c.statements ??= []
  c.paidSinceStatement ??= 0
  c.pastDue ??= 0
  c.onTimeStreak ??= 0
  c.carriedBalance ??= false
  c.baseApr ??= c.apr
  if (c.lastIncreaseDay === undefined) c.lastIncreaseDay = null
}

export const openStatement = (s: GameState): CardStatement | undefined => {
  const st = s.finance.card.statements ?? []
  return st[st.length - 1]
}

/** Amount still needed to make this statement's minimum / full payment. */
export function cardDueStatus(s: GameState): { minRemaining: number; fullRemaining: number; dueDay: number | null } {
  ensureCard(s)
  const c = s.finance.card
  const paid = c.paidSinceStatement ?? 0
  return {
    minRemaining: r2(Math.max(0, c.minDue - paid)),
    fullRemaining: r2(Math.max(0, Math.min(c.statementBalance - paid, c.balance))),
    dueDay: c.dueDay,
  }
}

function statementDomFor(day: number, dom: number) {
  const d = dateOfDay(day)
  return Math.min(dom, daysInMonth(d.getUTCFullYear(), d.getUTCMonth()))
}

export function closeStatement(s: GameState, day: number): void {
  ensureCard(s)
  const c = s.finance.card
  const prev = openStatement(s)
  let interest = 0
  if (c.carriedBalance && c.balance > 0) {
    interest = r2(c.balance * c.apr / 12)
    chargeCardForced(s, interest, { category: 'interest', memo: `Interest charge on purchases (${pctStr(c.apr)} APR)`, business: false })
  }
  const fees = prev?.status === 'late' ? CARD_RULES.lateFee : 0
  const bal = r2(Math.max(0, c.balance))
  const base = Math.max(CARD_RULES.minPaymentFloor, bal * CARD_RULES.minPaymentPct + interest + fees)
  const minDue = bal <= 0 ? 0 : r2(Math.min(bal, base + (c.pastDue ?? 0)))
  c.statementBalance = bal
  c.minDue = minDue
  c.dueDay = day + CARD_RULES.graceDays
  c.paidSinceStatement = 0
  const st: CardStatement = { closeDay: day, balance: bal, minDue, dueDay: c.dueDay, interest, fees, paid: 0, status: bal <= 0 ? 'paid_full' : 'open' }
  c.statements!.push(st)
  if (c.statements!.length > 24) c.statements!.splice(0, c.statements!.length - 24)
  if (bal <= 0) return
  notify(s, { kind: 'info', title: 'Card statement ready', body: `Balance ${usd(bal)} · minimum ${usd(minDue)} due ${formatDate(c.dueDay, 'md')}.`, site: 'bank', path: 'card' })
  mail(s, {
    ...CHAISE, path: 'card', subject: `Your Chaise Sapphire statement is ready`,
    body: [
      `Statement closing date: ${formatDate(day, 'long')}`,
      '',
      `New balance: ${usd(bal)}`,
      `Minimum payment due: ${usd(minDue)}${(c.pastDue ?? 0) > 0 ? ` (includes ${usd(c.pastDue ?? 0)} past due)` : ''}`,
      `Payment due date: ${formatDate(c.dueDay, 'long')}`,
      interest > 0 ? `Interest charged this period: ${usd(interest)} at ${pctStr(c.apr)} APR` : 'Interest charged this period: $0.00',
      `Autopay: ${c.autopay === 'none' ? 'OFF' : c.autopay === 'min' ? 'minimum payment' : 'statement balance'}`,
      '',
      'Minimum Payment Warning: if you make only the minimum payment each period, you will pay more in interest and it will take you longer to pay off your balance. Pay the full statement balance by the due date to avoid interest on new purchases.',
      '',
      'Chaise Bank, N.A. Member FDIC-ish.',
    ].join('\n'),
  })
}

export function processDueDate(s: GameState, day: number): void {
  ensureCard(s)
  const c = s.finance.card
  const st = openStatement(s)
  const needMin = c.minDue
  const needFull = c.statementBalance
  if (needMin <= 0 && needFull <= 0) { c.dueDay = null; c.carriedBalance = false; c.pastDue = 0; return }
  let paid = c.paidSinceStatement ?? 0
  if (c.autopay !== 'none') {
    const target = c.autopay === 'full' ? needFull : needMin
    const want = r2(Math.min(Math.max(0, target - paid), c.balance))
    if (want > 0) {
      if (s.finance.cash >= want) {
        const amt = payCard(s, want)
        paid += amt
        c.paidSinceStatement = paid
        c.pastDue = Math.max(0, (c.pastDue ?? 0) - amt)
        notify(s, { kind: 'info', title: 'Card autopay', body: `${usd(amt)} paid to your Chaise Sapphire card from checking.`, site: 'bank', path: 'card' })
      } else {
        notify(s, { kind: 'critical', title: 'Card autopay failed', body: `${usd(want)} autopay was returned — checking only has ${usd(s.finance.cash)}.`, site: 'bank', path: 'card' })
        mail(s, { ...CHAISE, path: 'card', subject: 'Your automatic payment was returned', body: `We tried to collect your ${c.autopay === 'full' ? 'statement balance' : 'minimum payment'} of ${usd(want)} from checking, but there weren't enough funds. Your payment is now late.\n\nMake a payment today in Chaise Bank → Credit card to limit fees and protect your account.` })
      }
    }
  }
  if (st) st.paid = r2(paid)
  if (paid + 0.005 >= needMin) {
    c.onTimeStreak = (c.onTimeStreak ?? 0) + 1
    c.pastDue = 0
    c.carriedBalance = paid + 0.005 < needFull
    if (st) st.status = paid + 0.005 >= needFull ? 'paid_full' : 'paid_min'
    if (c.apr > (c.baseApr ?? c.apr) && (c.onTimeStreak ?? 0) >= CARD_RULES.penaltyCureStreak) {
      c.apr = c.baseApr ?? c.apr
      mail(s, { ...CHAISE, path: 'card', subject: 'Good news: your APR is back to normal', body: `Thanks for ${CARD_RULES.penaltyCureStreak} on-time payments in a row. Your purchase APR has been restored to ${pctStr(c.apr)} starting this billing cycle.` })
    }
    return
  }
  // late
  chargeCardForced(s, CARD_RULES.lateFee, { category: 'fees', memo: 'Late payment fee', business: false, pnl: 'personalSpend' })
  c.lateCount += 1
  c.onTimeStreak = 0
  c.pastDue = r2(Math.max(0, needMin - paid))
  c.carriedBalance = true
  const hadPenalty = c.apr >= CARD_RULES.penaltyApr
  c.apr = Math.max(c.apr, CARD_RULES.penaltyApr)
  if (st) st.status = 'late'
  const freeze = c.lateCount >= CARD_RULES.latesToFreeze && !c.frozen
  if (freeze) c.frozen = true
  notify(s, {
    kind: 'critical', title: freeze ? 'Card frozen ❄️' : 'Card payment late',
    body: freeze
      ? `Second late payment — your Chaise Sapphire is frozen until you pay the full statement balance. Ads and suppliers billed to it will fail.`
      : `Missed the ${usd(needMin)} minimum. $${CARD_RULES.lateFee} fee, penalty APR ${pctStr(CARD_RULES.penaltyApr)}.`,
    site: 'bank', path: 'card',
  })
  mail(s, {
    ...CHAISE, path: 'card', subject: freeze ? 'Important: your card has been suspended' : 'Your payment is past due',
    body: [
      `We didn't receive your minimum payment of ${usd(needMin)} by ${formatDate(day, 'long')}.`,
      '',
      `• Late fee charged: ${usd(CARD_RULES.lateFee)}`,
      hadPenalty ? `• Your penalty APR of ${pctStr(CARD_RULES.penaltyApr)} remains in effect.` : `• Your purchase APR has increased to the penalty APR of ${pctStr(CARD_RULES.penaltyApr)}. It returns to normal after ${CARD_RULES.penaltyCureStreak} consecutive on-time payments.`,
      `• Past-due amount: ${usd(c.pastDue ?? 0)} (added to your next minimum payment)`,
      freeze ? `• Because this is your ${c.lateCount === 2 ? 'second' : `${c.lateCount}th`} late payment, your card is suspended for new purchases until your statement balance is paid in full.` : '',
      '',
      'Pay now in Chaise Bank → Credit card.',
    ].filter(Boolean).join('\n'),
  })
}

/** Unfreeze once the past-due amount and the statement balance are paid. */
export function checkUnfreeze(s: GameState): void {
  const c = s.finance.card
  if (!c.frozen) return
  if ((c.pastDue ?? 0) > 0.005) return
  if ((c.paidSinceStatement ?? 0) + 0.005 < c.statementBalance && c.balance > 0.005) return
  c.frozen = false
  c.lateCount = Math.min(c.lateCount, CARD_RULES.latesToFreeze - 1)
  notify(s, { kind: 'success', title: 'Card unfrozen', body: 'Your Chaise Sapphire works again. One more late payment freezes it.', site: 'bank', path: 'card' })
  mail(s, { ...CHAISE, path: 'card', subject: 'Your card is active again', body: 'Thank you for your payment. Your Chaise Sapphire card is reactivated for purchases. Another late payment will suspend it again.' })
}

export function cardDayRollover(s: GameState, day: number): void {
  ensureCard(s)
  const c = s.finance.card
  if (domOf(day) === statementDomFor(day, c.statementDom)) closeStatement(s, day)
  if (c.dueDay !== null && day >= c.dueDay) {
    processDueDate(s, day)
    c.dueDay = null
  }
  checkUnfreeze(s)
}

export function payCardBalance(s: GameState, amount: number): number {
  ensureCard(s)
  const c = s.finance.card
  const amt = payCard(s, amount)
  if (amt <= 0) return 0
  c.paidSinceStatement = r2((c.paidSinceStatement ?? 0) + amt)
  c.pastDue = r2(Math.max(0, (c.pastDue ?? 0) - amt))
  const st = openStatement(s)
  if (st && st.status !== 'late') {
    st.paid = r2(st.paid + amt)
    if (st.paid + 0.005 >= st.balance) st.status = 'paid_full'
  }
  checkUnfreeze(s)
  notify(s, { kind: 'success', title: 'Card payment sent', body: `${usd(amt)} from checking to your Chaise Sapphire.`, site: 'bank', path: 'card' })
  return amt
}

export function setAutopay(s: GameState, mode: 'none' | 'min' | 'full'): void {
  ensureCard(s)
  s.finance.card.autopay = mode
  notify(s, {
    kind: 'info', title: `Autopay: ${mode === 'none' ? 'off' : mode === 'min' ? 'minimum payment' : 'statement balance'}`,
    body: mode === 'none' ? 'Remember to pay manually before the due date.' : mode === 'min' ? 'You\'ll never be late, but you\'ll pay interest on the rest.' : 'No interest as long as checking can cover it on the due date.',
    site: 'bank', path: 'card',
  })
}

export function creditIncreaseEligibility(s: GameState, today: number): { ok: boolean; reason?: string } {
  ensureCard(s)
  const c = s.finance.card
  if (c.frozen) return { ok: false, reason: 'Your card is frozen.' }
  if ((c.onTimeStreak ?? 0) < CARD_RULES.onTimeForIncrease) return { ok: false, reason: `Chaise needs ${CARD_RULES.onTimeForIncrease} on-time statement payments in a row (you have ${c.onTimeStreak ?? 0}).` }
  if (c.lastIncreaseDay !== null && c.lastIncreaseDay !== undefined && today - c.lastIncreaseDay < CARD_RULES.increaseCooldownDays) {
    return { ok: false, reason: `You can request another increase on ${formatDate(c.lastIncreaseDay + CARD_RULES.increaseCooldownDays, 'md')}.` }
  }
  return { ok: true }
}

export function requestCreditIncrease(s: GameState, today: number): { ok: boolean; newLimit?: number; reason?: string } {
  const e = creditIncreaseEligibility(s, today)
  if (!e.ok) return e
  const c = s.finance.card
  const inc = recentIncome(s, today, 60)
  const earnings = inc.revenue + inc.wages
  const factor = 1.5 + 0.5 * Math.min(1, Math.max(0, earnings / Math.max(1, c.limit * 6)))
  const newLimit = Math.round((c.limit * factor) / 100) * 100
  const old = c.limit
  c.limit = newLimit
  c.lastIncreaseDay = today
  notify(s, { kind: 'success', title: 'Credit limit increased', body: `${usd(old)} → ${usd(newLimit)}`, site: 'bank', path: 'card', amount: newLimit - old })
  mail(s, { ...CHAISE, path: 'card', subject: 'Your credit limit increase is approved', body: `Good news — based on your payment history and 60-day income of ${usd(earnings)}, your Chaise Sapphire credit limit is now ${usd(newLimit)} (was ${usd(old)}).\n\nA higher limit is not more money. Interest is ${pctStr(c.apr)} APR on anything you don't pay off by the due date.` })
  return { ok: true, newLimit }
}

export function cardSummary(s: GameState) {
  ensureCard(s)
  const c = s.finance.card
  const d = cardDueStatus(s)
  return {
    limit: c.limit, balance: r2(c.balance), available: c.frozen ? 0 : r2(Math.max(0, c.limit - c.balance)),
    utilization: c.limit > 0 ? c.balance / c.limit : 0, apr: c.apr, baseApr: c.baseApr ?? c.apr, penalty: c.apr > (c.baseApr ?? c.apr),
    statementBalance: c.statementBalance, minDue: c.minDue, dueDay: c.dueDay, minRemaining: d.minRemaining, fullRemaining: d.fullRemaining,
    pastDue: c.pastDue ?? 0, autopay: c.autopay, frozen: c.frozen, lateCount: c.lateCount, onTimeStreak: c.onTimeStreak ?? 0,
    statements: c.statements ?? [],
  }
}
