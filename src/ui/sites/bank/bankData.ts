// Chaise Bank derived data: labels, alerts, cash-flow projection. Read-only helpers.
import type { Day, GameState, LedgerCategory } from '../../../core/types'
import { BENCHMARKS } from '../../../data/benchmarks'
import { PAYROLL } from '../../../data/job'
import { DIFFICULTY } from '../../../core/difficulty'
import { addBusinessDays, formatDate } from '../../../core/time'
import { billsDueWithin, cardSummary, taxEstimate } from '../../../sim/finance'
import { nextPayday } from '../../../sim/life'
import { hash01, safe, simRead, todayOf, usd } from './lifeCommon'

export const CATEGORY_LABEL: Record<LedgerCategory, string> = {
  wage: 'Paycheck', payout: 'Shopifly payout', ad_spend: 'Advertising', cogs: 'Product cost', shipping: 'Shipping',
  apps: 'Apps & software', subscription: 'Subscriptions', rent: 'Rent & housing', food: 'Food & dining', gear: 'Shopping',
  staff: 'Contractors', creative: 'Creative services', samples: 'Samples', inventory: 'Inventory', fees: 'Fees',
  refund: 'Refunds', chargeback: 'Chargebacks', interest: 'Interest', tax: 'Taxes', loan: 'Loans', transfer: 'Transfers',
  fun: 'Entertainment', moving: 'Moving', misc: 'Other',
}
export const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL) as LedgerCategory[]

/** Stable last-4 digits for the player's accounts. */
export function acctLast4(s: GameState, which: 'bank' | 'card'): string {
  return String(1000 + Math.floor(hash01(`${s.meta.saveId}:${which}`) * 8999))
}
export const acctName = (s: GameState, which: 'bank' | 'card') =>
  which === 'bank' ? `TOTAL CHECKING (...${acctLast4(s, 'bank')})` : `SAPPHIRE CARD (...${acctLast4(s, 'card')})`

export type EmptyCard = ReturnType<typeof cardSummary>
export function cardInfo(s: GameState): EmptyCard {
  return simRead(s, cardSummary, {
    limit: s.finance.card.limit, balance: s.finance.card.balance, available: Math.max(0, s.finance.card.limit - s.finance.card.balance),
    utilization: s.finance.card.limit ? s.finance.card.balance / s.finance.card.limit : 0, apr: s.finance.card.apr, baseApr: s.finance.card.apr,
    penalty: false, statementBalance: s.finance.card.statementBalance, minDue: s.finance.card.minDue, dueDay: s.finance.card.dueDay,
    minRemaining: s.finance.card.minDue, fullRemaining: s.finance.card.statementBalance, pastDue: 0, autopay: s.finance.card.autopay,
    frozen: s.finance.card.frozen, lateCount: s.finance.card.lateCount, onTimeStreak: 0, statements: [],
  })
}

export function taxInfo(s: GameState) {
  const today = todayOf(s)
  return simRead(s, st => taxEstimate(st, today), {
    dueDay: s.finance.taxes.nextDueDay, label: 'Next quarter', ytdProfit: s.finance.taxes.ytdBusinessProfit, estimate: 0,
    pending: 0, owed: 0, penalties: 0, autopay: false, enabled: DIFFICULTY[s.meta.difficulty].taxes,
  })
}

/** McDoodle's: the next paycheck covers unpaid hours through the Sunday before payday (payroll lag); later hours roll over. */
export function nextPaycheck(s: GameState) {
  const today = todayOf(s)
  const payday = safe(() => nextPayday(s), today)
  const periodEnd = payday - PAYROLL.periodLagDays
  const keep = 1 - PAYROLL.socialSecurity - PAYROLL.medicare - PAYROLL.federal
  let hours = 0
  let gross = 0
  let laterHours = 0
  let laterGross = 0
  for (const sh of s.job.shifts) {
    const h = sh.hoursWorked ?? 0
    if (sh.paid || h <= 0) continue
    const g = h * (sh.rate ?? s.job.hourlyWage)
    if (sh.day <= periodEnd) { hours += h; gross += g } else { laterHours += h; laterGross += g }
  }
  return { payday, periodEnd, hours, gross, net: gross * keep, laterHours, laterGross, laterNet: laterGross * keep, keep }
}

export interface BankAlert { tone: 'critical' | 'warning' | 'info'; title: string; body: string; path: string }
export function alertsFor(s: GameState): BankAlert[] {
  const out: BankAlert[] = []
  const c = cardInfo(s)
  const today = todayOf(s)
  if (c.frozen) out.push({ tone: 'critical', title: 'Your Sapphire card is frozen', body: `Two late payments froze the card. Pay the past-due amount${c.pastDue ? ` (${usd(c.pastDue)})` : ''} to unfreeze it — ad platforms and suppliers can't charge it until then.`, path: 'card' })
  else if (c.pastDue > 0) out.push({ tone: 'critical', title: `Card payment past due: ${usd(c.pastDue)}`, body: 'A late payment adds a $35 fee and a 29.99% penalty APR. A second one freezes the card.', path: 'card' })
  if (!c.frozen && c.utilization >= 0.9) out.push({ tone: 'warning', title: `Card ${Math.round(c.utilization * 100)}% used`, body: `Only ${usd(c.available)} of credit left. The next ad-billing or supplier charge may decline.`, path: 'card' })
  for (const b of s.finance.bills) {
    if ((b.arrears ?? 0) > 0) out.push({ tone: 'critical', title: `${b.name}: ${usd(b.arrears ?? 0)} past due`, body: `We retry this payment daily from ${b.payWith === 'bank' ? 'checking' : 'your card'}. Make sure the money is there.`, path: 'bills' })
  }
  const t = taxInfo(s)
  if (t.enabled && t.owed > 0) out.push({ tone: 'critical', title: `Estimated tax past due: ${usd(t.owed)}`, body: 'Unpaid estimated tax grows 5% per month in penalties.', path: 'taxes' })
  if (c.dueDay !== null && c.autopay === 'none' && c.minRemaining > 0 && c.dueDay - today <= 5 && c.dueDay >= today) {
    out.push({ tone: 'warning', title: `Card payment due ${formatDate(c.dueDay, 'md')}`, body: `Autopay is off. Pay at least the ${usd(c.minRemaining)} minimum to avoid a late fee.`, path: 'card' })
  }
  if (s.finance.cash < 100) out.push({ tone: 'warning', title: `Low balance: ${usd(s.finance.cash)}`, body: 'Bills and autopay drafts from checking may be declined.', path: 'activity/bank' })
  return out
}

// ---------------------------------------------------------------------------
// cash-flow projection (next N days)
// ---------------------------------------------------------------------------
export interface FlowItem {
  day: Day
  label: string
  detail?: string
  amount: number
  /** which account it hits */
  account: 'bank' | 'card'
  kind: 'payout' | 'paycheck' | 'bill' | 'card_payment' | 'tax' | 'ads'
  estimate?: boolean
  held?: boolean
}

export function cashFlow(s: GameState, days = 14): FlowItem[] {
  const today = todayOf(s)
  const end = today + days
  const out: FlowItem[] = []
  // Shopifly payouts in flight (a risk review pauses every payout until it ends)
  const hold = s.store?.hold
  const paused = !!hold?.paused && (hold.pauseUntilDay ?? Infinity) >= today
  for (const p of s.store?.payouts ?? []) {
    if (p.status === 'paid') continue
    if (paused && p.status === 'pending') {
      out.push({ day: Math.max(today, p.arriveDay), label: 'Shopifly payout (paused)', detail: `All payouts paused for review${hold?.pauseUntilDay !== undefined ? ` until ${formatDate(hold.pauseUntilDay, 'md')}` : ''}`, amount: p.amount, account: 'bank', kind: 'payout', held: true })
      continue
    }
    if (p.status === 'held') {
      out.push({ day: Math.max(today, p.arriveDay), label: 'Shopifly payout (on hold)', detail: p.note ?? 'Held by Shopifly risk review', amount: p.amount, account: 'bank', kind: 'payout', held: true })
      continue
    }
    if (p.arriveDay < end) out.push({ day: Math.max(today, p.arriveDay), label: 'Shopifly payout', detail: `Sales from ${formatDate(p.createdDay - 1, 'md')}`, amount: p.amount, account: 'bank', kind: 'payout' })
  }
  if (s.store?.created && (s.store.pendingBalance ?? 0) > 0.5 && !s.store.hold?.paused) {
    const arrive = addBusinessDays(today + 1, DIFFICULTY[s.meta.difficulty].payoutDays)
    if (arrive < end) out.push({ day: arrive, label: 'Shopifly payout (today’s sales)', detail: 'Unsettled balance, paid out after midnight', amount: s.store.pendingBalance, account: 'bank', kind: 'payout', estimate: true })
  }
  // McDoodle's paycheck (hours already worked in the current pay period)
  const pc = nextPaycheck(s)
  if (pc.gross > 0 && pc.payday < end) {
    out.push({ day: pc.payday, label: "McDoodle's paycheck", detail: `Direct deposit for ${pc.hours.toFixed(1)} h worked through ${formatDate(pc.periodEnd, 'md')}`, amount: pc.net, account: 'bank', kind: 'paycheck', estimate: true })
  }
  // recurring bills
  const bills = safe(() => billsDueWithin(s, today, days), [])
  for (const b of bills) {
    out.push({ day: b.day, label: b.bill.name, detail: (b.bill.arrears ?? 0) > 0 && b.day === today ? 'Past due — retried daily' : undefined, amount: -b.amount, account: b.bill.payWith, kind: 'bill' })
  }
  // card autopay
  const c = cardInfo(s)
  if (c.dueDay !== null && c.dueDay >= today && c.dueDay < end && c.autopay !== 'none') {
    const amt = c.autopay === 'min' ? c.minRemaining : c.fullRemaining
    if (amt > 0) out.push({ day: c.dueDay, label: `Card autopay (${c.autopay === 'min' ? 'minimum' : 'statement balance'})`, amount: -amt, account: 'bank', kind: 'card_payment' })
  }
  // estimated taxes
  const t = taxInfo(s)
  if (t.enabled && t.autopay && t.dueDay >= today && t.dueDay < end) {
    const amt = (t.pending || t.estimate) + t.owed
    if (amt > 0) out.push({ day: t.dueDay, label: `Estimated tax ${t.label}`, amount: -amt, account: 'bank', kind: 'tax', estimate: !t.pending })
  }
  // ad billing (charged when unbilled spend hits the threshold)
  for (const acc of s.ads?.accounts ?? []) {
    if (acc.unbilled <= 0.5 || acc.status === 'disabled') continue
    const ladder = BENCHMARKS[acc.platform].billingThresholds
    const th = ladder[Math.min(ladder.length - 1, acc.billingTier)]
    out.push({
      day: today, label: `${acc.platform === 'fadbook' ? 'Fadbook' : 'TikTak'} ads — unbilled spend`,
      detail: `Charged to your ${acc.payWith === 'bank' ? 'checking' : 'card'} when it reaches ${usd(th, false)} (or on the 1st)`,
      amount: -acc.unbilled, account: acc.payWith, kind: 'ads', estimate: true,
    })
  }
  return out.sort((a, b) => a.day - b.day || b.amount - a.amount)
}
