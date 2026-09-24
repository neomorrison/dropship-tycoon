// Recurring bills engine: weekly / monthly / yearly charges with retries, arrears and per-ref handlers.
import type { GameState, LedgerCategory, RecurringBill } from '../../core/types'
import { pay } from '../../core/money'
import { notify, mail } from '../../core/notify'
import { dayOfDate, dateOfDay, daysInMonth, formatDate } from '../../core/time'

export interface BillPaidInfo { amount: number; day: number; wasLate: boolean }
export interface BillFailedInfo { amount: number; day: number; daysFailed: number; newlyDue: number }
export interface BillHandler {
  onPaid?: (s: GameState, bill: RecurringBill, info: BillPaidInfo) => void
  /** return true to suppress the default decline notice */
  onFailed?: (s: GameState, bill: RecurringBill, info: BillFailedInfo) => boolean | void
}

const handlers: { prefix: string; h: BillHandler }[] = []
/** Modules react to their bills (rent → eviction, staff → quits, apps → suspension). Register at import time. */
export function registerBillHandler(refPrefix: string, h: BillHandler): void {
  const i = handlers.findIndex(x => x.prefix === refPrefix)
  if (i >= 0) handlers[i] = { prefix: refPrefix, h }
  else handlers.push({ prefix: refPrefix, h })
  handlers.sort((a, b) => b.prefix.length - a.prefix.length)
}
const handlerFor = (ref?: string) => (ref ? handlers.find(x => ref.startsWith(x.prefix))?.h : undefined)

/** these can't go on the credit card */
const BANK_ONLY: LedgerCategory[] = ['rent', 'tax']

export function upsertBill(s: GameState, bill: RecurringBill): void {
  const bills = s.finance.bills
  const i = bills.findIndex(b => b.id === bill.id || (!!bill.ref && b.ref === bill.ref))
  const withDom: RecurringBill = { ...bill, dom: bill.dom ?? (bill.cadence === 'weekly' ? undefined : dateOfDay(bill.nextDueDay).getUTCDate()) }
  if (i >= 0) bills[i] = { ...bills[i], ...withDom, id: bills[i].id }
  else bills.push(withDom)
}
export function removeBillByRef(s: GameState, ref: string): void {
  s.finance.bills = s.finance.bills.filter(b => b.ref !== ref)
}

/** Day of the next occurrence after `day` for a bill's cadence. */
export function advanceDue(bill: RecurringBill, day: number): number {
  if (bill.cadence === 'weekly') return day + 7
  const d = dateOfDay(day)
  const dom = bill.dom ?? d.getUTCDate()
  const y = d.getUTCFullYear() + (bill.cadence === 'yearly' ? 1 : 0)
  const m = d.getUTCMonth() + (bill.cadence === 'monthly' ? 1 : 0)
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return dayOfDate(yy, mm, Math.min(dom, daysInMonth(yy, mm)))
}
/** First day ≥ `from` falling on day-of-month `dom` (clamped to month length). */
export function nextDomOnOrAfter(from: number, dom: number): number {
  const d = dateOfDay(from)
  let y = d.getUTCFullYear(), m = d.getUTCMonth()
  for (let i = 0; i < 3; i++) {
    const cand = dayOfDate(y, m, Math.min(dom, daysInMonth(y, m)))
    if (cand >= from) return cand
    m++
    if (m > 11) { m = 0; y++ }
  }
  return from
}

/** Monthly-equivalent cost of all bills (budgeting). */
export function monthlyBurn(s: GameState, filter: (b: RecurringBill) => boolean = () => true): number {
  return s.finance.bills.filter(filter).reduce((a, b) => a + (b.cadence === 'weekly' ? b.amount * 52 / 12 : b.cadence === 'yearly' ? b.amount / 12 : b.amount), 0)
}
/** Bills due within the next `days` days (incl. arrears), soonest first. */
export function billsDueWithin(s: GameState, today: number, days: number): { bill: RecurringBill; day: number; amount: number }[] {
  const out: { bill: RecurringBill; day: number; amount: number }[] = []
  for (const b of s.finance.bills) {
    if ((b.arrears ?? 0) > 0) out.push({ bill: b, day: today, amount: b.arrears ?? 0 })
    let d = b.nextDueDay
    let guard = 0
    while (d < today + days && guard++ < 60) {
      if (d >= today) out.push({ bill: b, day: d, amount: b.amount })
      d = advanceDue(b, d)
    }
  }
  return out.sort((a, b) => a.day - b.day)
}

/** Charge everything due today (and retry arrears). Called by financeDayRollover. */
export function processBills(s: GameState, day: number): void {
  for (const bill of [...s.finance.bills]) {
    if (!s.finance.bills.includes(bill)) continue // a handler removed it
    let newlyDue = 0
    let guard = 0
    while (bill.nextDueDay <= day && guard++ < 36) {
      newlyDue += bill.amount
      bill.nextDueDay = advanceDue(bill, bill.nextDueDay)
    }
    const owed = Math.round(((bill.arrears ?? 0) + newlyDue) * 100) / 100
    if (owed <= 0) continue
    const wasLate = !!bill.failedSince || (bill.arrears ?? 0) > 0
    const acct = pay(s, owed, {
      category: bill.category, memo: wasLate ? `${bill.name} (past due)` : bill.name, business: bill.business,
      prefer: bill.payWith, strict: BANK_ONLY.includes(bill.category),
      // business subscriptions (plan, Mineo, domain renewals) book to the same P&L line as their first charge
      ...(bill.business && bill.category === 'subscription' ? { pnl: 'apps' as const } : {}),
    })
    const h = handlerFor(bill.ref)
    if (acct) {
      bill.arrears = 0
      bill.failedSince = null
      bill.lastPaidDay = day
      h?.onPaid?.(s, bill, { amount: owed, day, wasLate })
      continue
    }
    bill.arrears = owed
    if (bill.failedSince === null || bill.failedSince === undefined) bill.failedSince = day
    const daysFailed = day - bill.failedSince
    const handled = h?.onFailed?.(s, bill, { amount: owed, day, daysFailed, newlyDue })
    if (!handled && (daysFailed === 0 || newlyDue > 0 || daysFailed % 7 === 0)) defaultDecline(s, bill, owed, daysFailed)
  }
}

function defaultDecline(s: GameState, bill: RecurringBill, owed: number, daysFailed: number) {
  const where = bill.payWith === 'card' ? 'your Chaise Sapphire card (and checking as backup)' : 'your Chaise checking account'
  notify(s, {
    kind: 'critical', title: `Payment failed: ${bill.name}`,
    body: `$${owed.toFixed(2)} couldn't be charged to ${where}. We'll retry daily${daysFailed ? ` — ${daysFailed} days overdue` : ''}.`,
    site: 'bank', path: 'bills',
  })
  if (daysFailed === 0) {
    mail(s, {
      from: 'Chaise Bank', fromEmail: 'no-reply@alerts.chaise.com', tag: 'bank', site: 'bank', path: 'bills',
      subject: `Declined: ${bill.name}`,
      body: `A scheduled payment of $${owed.toFixed(2)} to ${bill.name} was declined on ${formatDate(bill.failedSince ?? 0, 'long')} because of insufficient available funds.\n\nThe merchant may retry the charge. To avoid service interruptions and late fees, add funds to checking or pay down your card.\n\nChaise Bank Alerts — you're receiving this because payment alerts are on.`,
    })
  }
}
