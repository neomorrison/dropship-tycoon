// Shopifly Capital: merchant cash advance offered after 60 days of sales averaging ≥ $300/day.
// Amount ≈ 15 × average daily revenue, flat fee 10–13%, repaid by withholding 12–17% of each payout.
import type { GameState, Loan } from '../../core/types'
import { pay, receive } from '../../core/money'
import { notify, mail } from '../../core/notify'
import { uid } from '../../core/ids'
import { formatDate } from '../../core/time'

export const CAPITAL_RULES = {
  minSalesDays: 60,
  minAvgDaily: 300,
  amountMultiple: 15,
  feePct: [0.1, 0.13] as [number, number],
  withholdPct: [0.12, 0.17] as [number, number],
  maxAmount: 2_000_000,
  offerMailEveryDays: 30,
}
const CAP = { from: 'Shopifly Capital', fromEmail: 'capital@shopifly.com', tag: 'shopifly' as const, site: 'shopifly' as const }
const usd = (n: number, cents = true) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
const r2 = (n: number) => Math.round(n * 100) / 100

export interface CapitalOffer {
  amount: number
  /** flat fee in dollars */
  fee: number
  withholdPct: number
  feePct: number
  /** amount + fee */
  total: number
  avgDaily: number
}

/** deterministic 0..1 from seed + key (queries must not advance the RNG) */
function hash01(seed: number, key: number): number {
  let h = (seed ^ Math.imul(key + 0x9e3779b9, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const activeCapital = (s: GameState): Loan | undefined => s.finance.loans.find(l => l.lender === 'shopifly_capital' && l.remaining > 0.005)

export function capitalOffer(s: GameState): CapitalOffer | null {
  if (!s.store?.created) return null
  if (activeCapital(s)) return null
  const today = Math.floor(s.time.hour / 24)
  const daily = s.store.analytics?.daily ?? {}
  let firstSale = Infinity
  for (const [d, sd] of Object.entries(daily)) if ((sd?.orders ?? 0) > 0) firstSale = Math.min(firstSale, Number(d))
  if (!Number.isFinite(firstSale) || today - firstSale < CAPITAL_RULES.minSalesDays) return null
  let rev = 0
  for (let d = today - CAPITAL_RULES.minSalesDays; d < today; d++) rev += daily[d]?.totalSales ?? s.finance.pnl[d]?.revenue ?? 0
  const avg = rev / CAPITAL_RULES.minSalesDays
  if (avg < CAPITAL_RULES.minAvgDaily) return null
  const amount = Math.min(CAPITAL_RULES.maxAmount, Math.round((avg * CAPITAL_RULES.amountMultiple) / 500) * 500)
  if (amount < 1000) return null
  const period = Math.floor(today / 30)
  const f = CAPITAL_RULES.feePct[0] + (CAPITAL_RULES.feePct[1] - CAPITAL_RULES.feePct[0]) * hash01(s.meta.seed, period * 2 + 1)
  const w = CAPITAL_RULES.withholdPct[0] + (CAPITAL_RULES.withholdPct[1] - CAPITAL_RULES.withholdPct[0]) * hash01(s.meta.seed, period * 2 + 2)
  const feePct = Math.round(f * 1000) / 1000
  const withholdPct = Math.round(w * 200) / 200
  const fee = r2(amount * feePct)
  return { amount, fee, withholdPct, feePct, total: r2(amount + fee), avgDaily: r2(avg) }
}

export function acceptCapital(s: GameState): boolean {
  const o = capitalOffer(s)
  if (!o) return false
  const today = Math.floor(s.time.hour / 24)
  const loan: Loan = {
    id: uid(s, 'loan'), lender: 'shopifly_capital', principal: o.amount, remaining: o.total, withholdPct: o.withholdPct, takenDay: today,
    feePct: o.feePct, withheldPayoutIds: [], repaid: 0,
  }
  s.finance.loans.push(loan)
  receive(s, o.amount, { category: 'loan', memo: 'Shopifly Capital — funds deposited', business: true, pnl: null })
  notify(s, { kind: 'success', title: 'Shopifly Capital funded', body: `${usd(o.amount, false)} deposited. ${Math.round(o.withholdPct * 100)}% of each payout goes to repayment until ${usd(o.total)} is repaid.`, site: 'shopifly', path: 'finances', amount: o.amount })
  mail(s, {
    ...CAP, path: 'finances', subject: 'Your Shopifly Capital funds are on the way',
    body: `You accepted a Shopifly Capital offer.\n\nFunding: ${usd(o.amount)}\nFixed fee: ${usd(o.fee)} (${(o.feePct * 100).toFixed(1)}%)\nTotal to repay: ${usd(o.total)}\nRepayment: ${(o.withholdPct * 100).toFixed(1)}% of each Shopifly payout, automatically.\n\nNo interest, no due date — you repay faster when you sell more, slower when you sell less. The fee is the same either way.`,
  })
  return true
}

/**
 * Store module: call when creating a payout. Returns the amount to withhold from it (0 if no capital),
 * and books the repayment. Idempotent per payout id.
 */
export function capitalWithhold(s: GameState, payoutId: string, grossAmount: number): number {
  const loan = activeCapital(s)
  if (!loan || !(grossAmount > 0)) return 0
  loan.withheldPayoutIds ??= []
  if (loan.withheldPayoutIds.includes(payoutId)) return 0
  const w = r2(Math.min(loan.remaining, grossAmount * loan.withholdPct))
  applyRepayment(s, loan, w, payoutId)
  return w
}

function applyRepayment(s: GameState, loan: Loan, amount: number, payoutId: string) {
  loan.withheldPayoutIds ??= []
  loan.withheldPayoutIds.push(payoutId)
  if (loan.withheldPayoutIds.length > 400) loan.withheldPayoutIds.splice(0, loan.withheldPayoutIds.length - 400)
  loan.remaining = r2(Math.max(0, loan.remaining - amount))
  loan.repaid = r2((loan.repaid ?? 0) + amount)
  if (loan.remaining <= 0.005) loan.remaining = 0 // confirmation email goes out in capitalDayRollover
}

/**
 * Daily bookkeeping. Payouts the store paid out without withholding (adjustments ≥ 0) are repaid from
 * checking here, so the loan is never skipped. Also sends the offer email.
 */
export function capitalDayRollover(s: GameState, day: number): void {
  const loan = activeCapital(s)
  if (loan) {
    loan.withheldPayoutIds ??= []
    for (const p of s.store?.payouts ?? []) {
      if (loan.remaining <= 0.005) break
      // the store withholds at payout creation and records the id; anything unrecorded is repaid from checking
      if (p.status !== 'paid' || p.createdDay < loan.takenDay || loan.withheldPayoutIds.includes(p.id)) continue
      const w = r2(Math.min(loan.remaining, p.amount * loan.withholdPct))
      if (w <= 0) { loan.withheldPayoutIds.push(p.id); continue }
      const ok = pay(s, w, { category: 'loan', memo: `Shopifly Capital repayment (payout ${p.id})`, business: true, prefer: 'bank', strict: true, pnl: null })
      if (!ok) break
      applyRepayment(s, loan, w, p.id)
    }
  }
  // loans the store's payout withholding paid off: send the confirmation once
  for (const l of s.finance.loans) {
    const key = `cap.repaidMail.${l.id}`
    if (l.lender !== 'shopifly_capital' || l.remaining > 0.005 || s.flags[key]) continue
    s.flags[key] = true
    notify(s, { kind: 'success', title: 'Shopifly Capital repaid 🎉', body: `You've repaid ${usd(l.repaid ?? l.principal)}.`, site: 'shopifly', path: 'finances' })
    mail(s, { ...CAP, path: 'finances', subject: 'Your Shopifly Capital is fully repaid', body: `Congratulations — your ${usd(l.principal, false)} financing is fully repaid (${usd(l.repaid ?? 0)} including the fee). Payouts are no longer withheld.` })
  }
  const offer = capitalOffer(s)
  const last = s.finance.capitalOfferMailDay
  if (offer && (last === null || last === undefined || day - last >= CAPITAL_RULES.offerMailEveryDays)) {
    s.finance.capitalOfferMailDay = day
    notify(s, { kind: 'info', title: `You're pre-approved for ${usd(offer.amount, false)}`, body: 'Shopifly Capital — no credit check, repaid from sales.', site: 'shopifly', path: 'finances' })
    mail(s, {
      ...CAP, path: 'finances', subject: `You're eligible for ${usd(offer.amount, false)} in Shopifly Capital`,
      body: `Based on your sales (about ${usd(offer.avgDaily, false)}/day over the last 60 days), you're pre-qualified:\n\nFunding: ${usd(offer.amount)}\nFixed fee: ${usd(offer.fee)}\nRepayment: ${(offer.withholdPct * 100).toFixed(1)}% of each payout until ${usd(offer.total)} is repaid.\n\nThis offer is valid until ${formatDate(day + 30, 'long')}. Think about what the money is for: inventory for a proven winner is a good use; ad spend on an unproven product is how stores die.`,
    })
  }
}
