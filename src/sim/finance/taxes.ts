// Quarterly estimated taxes on business profit (Normal/Realistic). SPEC §4 "Taxes".
// Estimate = 25% × YTD business profit − paid; due Apr 15 / Jun 15 / Sep 15 / Jan 15; reminder 14 days ahead;
// unpaid → 5% per month penalty.
import type { GameState } from '../../core/types'
import { pay } from '../../core/money'
import { notify, mail } from '../../core/notify'
import { DIFFICULTY } from '../../core/difficulty'
import { dayOfDate, formatDate, yearOf } from '../../core/time'
import { BENCHMARKS } from '../../data/benchmarks'
import { businessProfit } from './pnl'

export const TAX_RULES = {
  rate: BENCHMARKS.life.businessTaxRate,
  reminderDays: 14,
  penaltyPerMonth: 0.05,
}
const IRS = { from: 'Uncle Sam · Infernal Revenue Service', fromEmail: 'estimated-taxes@infernalrevenue.gov', tag: 'bank' as const, site: 'bank' as const }
const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100

/** Estimated-payment due dates for tax year `y`: [Apr 15, Jun 15, Sep 15, Jan 15 (y+1)]. */
export function taxDueDates(y: number): { day: number; label: string; year: number }[] {
  return [
    { day: dayOfDate(y, 3, 15), label: `Q1 ${y}`, year: y },
    { day: dayOfDate(y, 5, 15), label: `Q2 ${y}`, year: y },
    { day: dayOfDate(y, 8, 15), label: `Q3 ${y}`, year: y },
    { day: dayOfDate(y + 1, 0, 15), label: `Q4 ${y}`, year: y },
  ]
}
export function nextTaxDue(fromDay: number): { day: number; label: string; year: number } {
  const y = yearOf(fromDay)
  return [...taxDueDates(y - 1), ...taxDueDates(y), ...taxDueDates(y + 1)].find(d => d.day >= fromDay)!
}

export function ensureTaxes(s: GameState): void {
  const t = s.finance.taxes
  t.year ??= yearOf(Math.max(0, Math.floor(s.time.hour / 24)))
  t.owed ??= 0
  if (t.owedSinceDay === undefined) t.owedSinceDay = null
  t.penalties ??= 0
  t.priorYearProfit ??= 0
  t.priorYearPaid ??= 0
  t.autopay ??= s.meta.difficulty !== 'realistic'
  t.payments ??= []
  t.pending ??= 0
}

/** Estimate for the next due date (what the reminder email quotes). */
export function taxEstimate(s: GameState, today: number) {
  ensureTaxes(s)
  const t = s.finance.taxes
  const due = nextTaxDue(today)
  const priorYear = due.year < (t.year ?? due.year)
  const profit = priorYear ? t.priorYearProfit ?? 0 : t.ytdBusinessProfit
  const paid = priorYear ? t.priorYearPaid ?? 0 : t.paidYtd
  const estimate = r2(Math.max(0, TAX_RULES.rate * profit - paid))
  return { dueDay: due.day, label: due.label, ytdProfit: r2(t.ytdBusinessProfit), estimate, pending: r2(t.pending ?? 0), owed: r2(t.owed ?? 0), penalties: r2(t.penalties ?? 0), autopay: !!t.autopay, enabled: DIFFICULTY[s.meta.difficulty].taxes }
}

function recordPayment(s: GameState, amount: number, label: string, day: number) {
  const t = s.finance.taxes
  t.payments!.push({ day, amount: r2(amount), label })
  if (t.payments!.length > 40) t.payments!.splice(0, t.payments!.length - 40)
}

/** Pay estimated tax from checking: past-due first, then the upcoming estimate. Returns amount paid. */
export function payTaxes(s: GameState, today: number, amount?: number): number {
  ensureTaxes(s)
  const t = s.finance.taxes
  const outstanding = r2((t.owed ?? 0) + (t.pending ?? 0))
  const want = r2(Math.min(amount ?? outstanding, outstanding))
  if (want <= 0) return 0
  if (!pay(s, want, { category: 'tax', memo: 'IRS USATAXPYMT — estimated tax (EFTPS)', business: false, prefer: 'bank', strict: true })) {
    notify(s, { kind: 'warning', title: 'Tax payment failed', body: `Not enough in checking for ${usd(want)}.`, site: 'bank', path: 'taxes' })
    return 0
  }
  let left = want
  const toOwed = Math.min(left, t.owed ?? 0)
  t.owed = r2((t.owed ?? 0) - toOwed)
  left -= toOwed
  t.pending = r2(Math.max(0, (t.pending ?? 0) - left))
  if ((t.owed ?? 0) <= 0.005) { t.owed = 0; t.owedSinceDay = null }
  const due = nextTaxDue(today)
  if (due.year < (t.year ?? due.year)) t.priorYearPaid = r2((t.priorYearPaid ?? 0) + want)
  else t.paidYtd = r2(t.paidYtd + want)
  recordPayment(s, want, toOwed > 0 ? 'Past-due estimated tax' : `Estimated tax ${due.label}`, today)
  notify(s, { kind: 'success', title: 'Estimated tax paid', body: `${usd(want)} to the Infernal Revenue Service.`, site: 'bank', path: 'taxes' })
  return want
}

export function setTaxAutopay(s: GameState, on: boolean): void {
  ensureTaxes(s)
  s.finance.taxes.autopay = on
}

export function taxesDayRollover(s: GameState, day: number): void {
  ensureTaxes(s)
  const t = s.finance.taxes
  // 1) book yesterday's business profit into the right tax year
  const y = day - 1
  if (y >= 0) {
    const yr = yearOf(y)
    if (yr !== t.year) {
      t.priorYearProfit = r2(t.ytdBusinessProfit)
      t.priorYearPaid = r2(t.paidYtd)
      t.ytdBusinessProfit = 0
      t.paidYtd = 0
      t.year = yr
    }
    t.ytdBusinessProfit = r2(t.ytdBusinessProfit + businessProfit(s.finance.pnl[y]))
  }
  if (!DIFFICULTY[s.meta.difficulty].taxes) return
  const hasBusiness = !!s.store?.created || t.ytdBusinessProfit !== 0
  const due = nextTaxDue(day)
  t.nextDueDay = due.day

  // 2) reminder 14 days ahead: lock in the estimate
  if (day === due.day - TAX_RULES.reminderDays) {
    const est = taxEstimate(s, day)
    t.lastEstimate = est.estimate
    t.pending = est.estimate
    if (hasBusiness) {
      mail(s, {
        ...IRS, path: 'taxes', subject: `Estimated tax reminder — ${due.label} due ${formatDate(due.day, 'md')}`,
        body: est.estimate > 0
          ? [
            `Hello, entrepreneur.`,
            '',
            `Congratulations on your profits. We noticed. Your ${due.label} estimated payment is due ${formatDate(due.day, 'long')}.`,
            '',
            `Business profit ${due.year < (t.year ?? due.year) ? `for ${due.year}` : 'year-to-date'}: ${usd(est.ytdProfit)}`,
            `Estimated tax (${Math.round(TAX_RULES.rate * 100)}% incl. self-employment tax), less payments made: ${usd(est.estimate)}`,
            '',
            t.autopay ? 'You\'re enrolled in scheduled payments: we\'ll debit your checking account on the due date. Please keep the funds available.' : 'Pay in Chaise Bank → Taxes before the due date. Late payments accrue a 5% penalty per month.',
            '',
            'Warmly (legally required to say that),',
            'Uncle Sam',
          ].join('\n')
          : est.ytdProfit < 0
            ? `Hello.\n\nYour business shows a loss of ${usd(-est.ytdProfit)} so far this year, so no estimated payment is due for ${due.label}. We'll check back next quarter. We always check back.\n\nUncle Sam`
            : `Hello.\n\nBased on your business profit so far (${usd(est.ytdProfit)}), no estimated payment is due for ${due.label}. Don't get used to it.\n\nUncle Sam`,
      })
    }
  }

  // 3) due date
  if (day === due.day && (t.pending ?? 0) > 0) {
    const amount = r2(t.pending ?? 0)
    let paid = false
    if (t.autopay) {
      paid = !!pay(s, amount, { category: 'tax', memo: `IRS USATAXPYMT — ${due.label} estimated tax`, business: false, prefer: 'bank', strict: true })
      if (paid) {
        if (due.year < (t.year ?? due.year)) t.priorYearPaid = r2((t.priorYearPaid ?? 0) + amount)
        else t.paidYtd = r2(t.paidYtd + amount)
        recordPayment(s, amount, `Estimated tax ${due.label}`, day)
        t.pending = 0
        notify(s, { kind: 'info', title: `Estimated tax paid (${due.label})`, body: `${usd(amount)} debited from checking.`, site: 'bank', path: 'taxes' })
        mail(s, { ...IRS, path: 'taxes', subject: `Payment received — ${due.label}`, body: `We received your estimated tax payment of ${usd(amount)}. Thank you for funding roads, bridges and at least one very expensive stapler.\n\nUncle Sam` })
      }
    }
    if (!paid) {
      t.owed = r2((t.owed ?? 0) + amount)
      t.pending = 0
      if (t.owedSinceDay === null || t.owedSinceDay === undefined) t.owedSinceDay = day
      notify(s, { kind: 'critical', title: `Estimated tax unpaid (${due.label})`, body: `${usd(amount)} is now past due — 5% penalty per month until paid.`, site: 'bank', path: 'taxes' })
      mail(s, {
        ...IRS, path: 'taxes', subject: 'Notice: estimated tax payment not received',
        body: `Our records show no payment for your ${due.label} estimated tax of ${usd(amount)}, which was due ${formatDate(day, 'long')}.\n\nA penalty of 5% of the unpaid amount will be added every month until it's paid. Pay in Chaise Bank → Taxes.\n\nWe'll be in touch. We're always in touch.\nUncle Sam`,
      })
    }
  }

  // 4) monthly penalty on anything past due
  if ((t.owed ?? 0) > 0 && t.owedSinceDay !== null && t.owedSinceDay !== undefined && day > t.owedSinceDay && (day - t.owedSinceDay) % 30 === 0) {
    const pen = r2((t.owed ?? 0) * TAX_RULES.penaltyPerMonth)
    t.owed = r2((t.owed ?? 0) + pen)
    t.penalties = r2((t.penalties ?? 0) + pen)
    notify(s, { kind: 'warning', title: 'Tax penalty added', body: `${usd(pen)} penalty. You now owe ${usd(t.owed ?? 0)}.`, site: 'bank', path: 'taxes' })
    mail(s, { ...IRS, path: 'taxes', subject: 'Penalty assessed on unpaid estimated tax', body: `A failure-to-pay penalty of ${usd(pen)} has been added. Balance due: ${usd(t.owed ?? 0)}.\n\nUncle Sam` })
  }
}
