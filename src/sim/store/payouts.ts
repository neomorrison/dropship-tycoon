// Shopifly Payments payouts: daily payouts after the settlement delay, first-payout delay,
// risk-review holds on sales spikes (decision modal), chargeback reserve, Shopifly Capital
// withholding, negative balances.
import type { GameState, Payout } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { DIFFICULTY } from '../../core/difficulty'
import { chance, randInt } from '../../core/rng'
import { addBusinessDays, dayOf, formatDate, hourOfDay } from '../../core/time'
import { pay, receive } from '../../core/money'
import { coachTip, mail, notify } from '../../core/notify'
import { pushModal, registerModalHandler } from '../../core/modals'
import { money, pct } from '../../core/format'
import { uid } from '../../core/ids'
import { chargebackRatio } from './ops'
import { r2, today } from './util'

const emptyBreakdown = () => ({ gross: 0, fees: 0, refunds: 0, adjustments: 0 })

/** 00:00 — yesterday's captured balance becomes a payout. */
export function createDailyPayout(s: GameState, day: number) {
  const st = s.store
  if (!st.created) return
  const dif = DIFFICULTY[s.meta.difficulty]
  releaseHolds(s, day)
  if (dif.payoutHolds) spikeCheck(s, day)
  const bal = r2(st.pendingBalance)
  if (bal < 0) {
    handleNegative(s, bal)
    return
  }
  if (bal < 1) return
  const bb = st.balanceBreakdown ?? { ...emptyBreakdown(), gross: bal }
  const salesDay = day - 1
  const id = uid(s, 'po')
  const first = !st.payouts.some(p => (p.kind ?? 'sales') === 'sales')
  let amount = bal
  let adjustments = bb.adjustments
  let reserveWithheld = 0
  const notes: string[] = []
  const h = st.hold
  if (h?.active && h.reservePct > 0 && day <= h.untilDay) {
    reserveWithheld = r2(amount * h.reservePct)
    amount -= reserveWithheld
    adjustments -= reserveWithheld
    ;(st.reserves ??= []).push({ id: uid(s, 'rsv'), amount: reserveWithheld, releaseDay: day + 30 })
    notes.push(`${Math.round(h.reservePct * 100)}% reserve held until ${formatDate(day + 30, 'md')}`)
  }
  let capitalWithheld = 0
  for (const loan of s.finance.loans) {
    if (loan.lender !== 'shopifly_capital' || loan.remaining <= 0 || amount <= 0) continue
    if (loan.withheldPayoutIds?.includes(id)) continue
    const w = r2(Math.min(loan.remaining, amount * loan.withholdPct))
    loan.remaining = r2(loan.remaining - w)
    loan.repaid = r2((loan.repaid ?? 0) + w)
    ;(loan.withheldPayoutIds ??= []).push(id)
    if (loan.withheldPayoutIds.length > 400) loan.withheldPayoutIds.splice(0, loan.withheldPayoutIds.length - 400)
    amount -= w
    capitalWithheld += w
    adjustments -= w
  }
  if (capitalWithheld > 0) notes.push(`${money(capitalWithheld)} Shopifly Capital repayment`)
  let arrive = addBusinessDays(salesDay, dif.payoutDays) + (first ? BENCHMARKS.fees.firstPayoutDelayDays : 0)
  if (first) notes.push('First payout: new-store settlement delay')
  const paused = !!(h?.paused && (h.pauseUntilDay ?? 0) >= day)
  if (paused) {
    arrive = Math.max(arrive, addBusinessDays(h!.pauseUntilDay ?? day, 1))
    notes.push(`On hold for risk review until ${formatDate(h!.pauseUntilDay ?? day, 'md')}`)
  }
  const payout: Payout = {
    id, amount: r2(Math.max(0, amount)), createdDay: salesDay, arriveDay: arrive,
    status: amount <= 0 ? 'paid' : paused ? 'held' : 'pending',
    gross: r2(bb.gross), fees: r2(bb.fees), refunds: r2(bb.refunds), adjustments: r2(adjustments),
    kind: 'sales', note: notes.join(' · ') || undefined,
    capitalWithheld: capitalWithheld ? r2(capitalWithheld) : undefined, reserveWithheld: reserveWithheld || undefined,
  }
  st.payouts.push(payout)
  st.pendingBalance = 0
  st.balanceBreakdown = emptyBreakdown()
  if (st.payouts.length > 400) st.payouts.splice(0, st.payouts.length - 400)
  if (first) {
    mail(s, {
      from: 'Shopifly Payments', fromEmail: 'payments@shopifly.com', tag: 'shopifly', site: 'shopifly', path: 'finances',
      subject: 'Your first payout is on its way',
      body: `Congratulations on your first sales! Your first payout of ${money(payout.amount)} is scheduled to arrive on ${formatDate(arrive, 'long')}.\n\nFirst payouts take longer while we verify new stores. After this, payouts arrive ${dif.payoutDays} business day${dif.payoutDays === 1 ? '' : 's'} after each sale day.\n\nNote: your ad platforms bill your card long before these payouts land. Plan your cash flow.`,
    })
  }
}

function handleNegative(s: GameState, bal: number) {
  const st = s.store
  let debt = -bal
  // net against payouts that haven't arrived yet
  for (let i = st.payouts.length - 1; i >= 0 && debt > 0.005; i--) {
    const p = st.payouts[i]
    if (p.status === 'paid' || p.amount <= 0) continue
    const take = Math.min(p.amount, debt)
    p.amount = r2(p.amount - take)
    p.adjustments = r2(p.adjustments - take)
    p.note = [p.note, `${money(take)} deducted for refunds/chargebacks`].filter(Boolean).join(' · ')
    debt -= take
  }
  if (debt > 0.01) {
    // Shopifly debits the linked bank account when the balance stays negative
    if (pay(s, r2(debt), { category: 'refund', memo: 'Shopifly Payments: negative balance debit', business: true, prefer: 'bank', pnl: null })) {
      notify(s, { kind: 'warning', title: `Shopifly debited ${money(debt)} from your bank`, body: 'Refunds and chargebacks exceeded your sales, so the negative balance was collected from your bank account.', site: 'shopifly', path: 'finances' })
      debt = 0
    }
  }
  st.pendingBalance = -r2(debt)
  st.balanceBreakdown = { ...emptyBreakdown(), adjustments: -r2(debt) }
}

function releaseHolds(s: GameState, day: number) {
  const st = s.store
  const dif = DIFFICULTY[s.meta.difficulty]
  const h = st.hold
  if (h?.paused && (h.pauseUntilDay ?? 0) < day) {
    h.paused = false
    let n = 0
    for (const p of st.payouts) {
      if (p.status !== 'held') continue
      p.status = 'pending'
      p.arriveDay = Math.max(p.arriveDay, addBusinessDays(day, 1))
      p.note = [p.note, 'Released after review'].filter(Boolean).join(' · ')
      n++
    }
    notify(s, { kind: 'success', title: 'Payout review complete', body: n ? `${n} held payout${n === 1 ? '' : 's'} released and on the way to your bank.` : 'Payouts are back on the normal schedule.', site: 'shopifly', path: 'finances' })
  }
  if (h && h.reservePct > 0 && day > h.untilDay) h.reservePct = 0
  if (h && !h.paused && h.reservePct <= 0) st.hold = null
  else if (h) {
    h.active = true
    h.kind = h.paused && h.reservePct > 0 ? 'review_reserve' : h.paused ? 'review' : 'reserve'
  }
  const due = (st.reserves ?? []).filter(r => r.releaseDay <= day)
  if (due.length) {
    st.reserves = (st.reserves ?? []).filter(r => r.releaseDay > day)
    const amt = r2(due.reduce((a, r) => a + r.amount, 0))
    if (amt > 0) {
      st.payouts.push({
        id: uid(s, 'po'), amount: amt, createdDay: day, arriveDay: addBusinessDays(day, dif.payoutDays), status: 'pending',
        gross: 0, fees: 0, refunds: 0, adjustments: amt, kind: 'reserve_release', note: 'Chargeback reserve released',
      })
    }
  }
}

function spikeCheck(s: GameState, day: number) {
  const st = s.store
  const y = st.analytics.daily[day - 1]?.totalSales ?? 0
  if (y <= 2000) return
  let sum = 0
  for (let d = day - 8; d <= day - 2; d++) sum += st.analytics.daily[d]?.totalSales ?? 0
  const avg = sum / 7
  if (y <= 5 * avg) return
  if (st.hold?.paused) return
  const until = day + randInt(s, 7, 10) - 1
  const reservePct = st.hold?.reservePct ?? 0
  st.hold = {
    active: true, reason: `Sales jumped to ${money(y)} in a day (7-day average ${money(avg)}). Shopifly is reviewing your account.`,
    untilDay: Math.max(st.hold?.untilDay ?? 0, until), reservePct, paused: true, pauseUntilDay: until, kind: reservePct > 0 ? 'review_reserve' : 'review',
  }
  for (const p of st.payouts) if (p.status === 'pending') p.status = 'held'
  pushModal(s, {
    kind: 'store_payout_hold',
    title: 'Shopifly paused your payouts',
    body:
      `Your sales yesterday (${money(y)}) were far above your recent average (${money(avg)}/day). To protect customers, Shopifly Payments is holding your payouts ` +
      `for a risk review until ${formatDate(until, 'long')}.\n\nYour ads and supplier bills keep charging your card in the meantime. Showing that you can fulfill ` +
      `(supplier invoices and tracking numbers) can speed things up.`,
    choices: [
      { id: 'verify', label: 'Send supplier invoices & tracking', tone: 'primary', hint: 'Faster if your orders are actually shipping' },
      { id: 'wait', label: 'Wait for the review', tone: 'default' },
    ],
    data: { untilDay: until },
  })
  mail(s, {
    from: 'Shopifly Payments', fromEmail: 'risk@shopifly.com', tag: 'shopifly', site: 'shopifly', path: 'finances',
    subject: 'Your payouts are on hold while we review your account',
    body: `We noticed an unusual increase in sales volume on ${st.name}. Payouts are paused until ${formatDate(until, 'long')} while our risk team reviews your store.\n\nYou can keep selling. Captured funds will be paid out once the review is complete. Make sure orders are being fulfilled with tracking.`,
  })
  coachTip(s, 'store_payout_hold', 'Payout hold! This is the classic scaling trap: your card keeps paying for ads and suppliers while Shopifly holds your money. Slow your budget increases until the hold lifts and keep enough card limit free.', { app: 'bank', essential: true, cooldownHours: 24 * 14 })
}

registerModalHandler('store_payout_hold', (s, _m, choice) => {
  if (choice !== 'verify') return
  const st = s.store
  const h = st.hold
  if (!h?.paused) return
  const day = today(s)
  const recent = st.orders.filter(o => dayOf(o.hour) >= day - 14)
  const shipped = recent.length ? recent.filter(o => o.supplierOrderedHour != null || o.cancelled).length / recent.length : 0
  if (chance(s, 0.3 + 0.6 * shipped)) {
    h.pauseUntilDay = Math.min(h.pauseUntilDay ?? day, day + 2)
    notify(s, { kind: 'success', title: 'Review sped up', body: `Your documents checked out. Payouts resume after ${formatDate(h.pauseUntilDay, 'md')}.`, site: 'shopifly', path: 'finances' })
  } else {
    notify(s, { kind: 'info', title: 'Documents received', body: `Too many orders are still unfulfilled for a quick approval. The review continues until ${formatDate(h.pauseUntilDay ?? day, 'md')}.`, site: 'shopifly', path: 'finances' })
  }
})

/** Hourly: payouts land in the bank from 6 AM on their arrival day. */
export function settlePayouts(s: GameState) {
  const now = s.time.hour
  const day = dayOf(now)
  if (hourOfDay(now) < 6) return
  let total = 0
  let n = 0
  for (const p of s.store.payouts) {
    if (p.status !== 'pending' || p.arriveDay > day) continue
    p.status = 'paid'
    if (p.amount > 0) {
      receive(s, p.amount, { category: 'payout', memo: p.kind === 'reserve_release' ? 'Shopifly Payments: reserve release' : `Shopifly Payments payout (${formatDate(p.createdDay, 'md')} sales)`, business: true, pnl: null })
      total += p.amount
      n++
    }
  }
  if (n) notify(s, { kind: 'success', title: `Payout deposited: ${money(total)}`, body: n > 1 ? `${n} Shopifly payouts arrived in your Chaise checking account.` : 'Arrived in your Chaise checking account.', site: 'bank', path: '', amount: total })
}

/** Daily: dispute-ratio warnings and the 25% reserve above 1%. */
export function chargebackMonitor(s: GameState, day: number) {
  const st = s.store
  const dif = DIFFICULTY[s.meta.difficulty]
  const ratio = chargebackRatio(s)
  const disputes = st.chargebacks.filter(c => c.openedDay > day - 30).length
  const { warnRatio, thresholdRatio } = BENCHMARKS.chargebacks
  if (ratio > warnRatio && disputes >= 2 && (st.cbWarnDay == null || day - st.cbWarnDay >= 14)) {
    st.cbWarnDay = day
    mail(s, {
      from: 'Shopifly Payments', fromEmail: 'risk@shopifly.com', tag: 'shopifly', site: 'shopifly', path: 'disputes',
      subject: 'Your dispute rate is above the industry threshold',
      body: `Over the last 30 days, ${pct(ratio)} of your orders were disputed (${disputes} chargebacks). Card networks consider anything above ${pct(warnRatio)} excessive.\n\nIf it goes above ${pct(thresholdRatio)}, we will hold a reserve on your payouts. Common causes: slow or missing deliveries, products that don't match the listing, and unanswered customer emails.`,
    })
    notify(s, { kind: 'warning', title: `Dispute rate ${pct(ratio)}: warning`, body: 'Above 0.75% of orders. Fix shipping promises and answer customers.', site: 'shopifly', path: 'disputes' })
  }
  if (ratio > thresholdRatio && disputes >= 3 && dif.payoutHolds && !(st.hold && st.hold.reservePct > 0)) {
    st.hold = {
      active: true,
      reason: `Dispute rate ${pct(ratio)} over the last 30 days (above ${pct(thresholdRatio)}). A 25% reserve is held from each payout for 30 days.`,
      untilDay: day + 30, reservePct: 0.25, paused: st.hold?.paused, pauseUntilDay: st.hold?.pauseUntilDay,
      kind: st.hold?.paused ? 'review_reserve' : 'reserve',
    }
    mail(s, {
      from: 'Shopifly Payments', fromEmail: 'risk@shopifly.com', tag: 'shopifly', site: 'shopifly', path: 'finances',
      subject: 'A reserve has been placed on your payouts',
      body: `Because your dispute rate reached ${pct(ratio)}, 25% of each payout will be held in reserve for 30 days. Held funds are released automatically.\n\nHigh dispute rates can also affect your advertising accounts.`,
    })
    notify(s, { kind: 'critical', title: 'Payout reserve: 25% held for 30 days', body: `Dispute rate ${pct(ratio)}.`, site: 'shopifly', path: 'finances' })
    coachTip(s, 'store_cb_reserve', 'Your chargeback rate crossed 1%. Shopifly now keeps 25% of your payouts and ad platforms get nervous too. Usual causes: promising faster shipping than you deliver, defective products, and ignored customer emails.', { app: 'shopifly', essential: true, cooldownHours: 24 * 30 })
  }
}
