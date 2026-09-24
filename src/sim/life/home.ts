// Apartments: qualification, moving (deposit + movers), rent via the bills engine, late rent → eviction.
import type { GameState, RecurringBill } from '../../core/types'
import { cardAvailable, pay, receive } from '../../core/money'
import { notify } from '../../core/notify'
import { pushModal, registerModalHandler } from '../../core/modals'
import { uid } from '../../core/ids'
import { daysInMonth, dateOfDay, firstOfNextMonth, formatDate } from '../../core/time'
import { randRange } from '../../core/rng'
import { roomImage } from '../../core/assets'
import { APARTMENTS, HOUSING_RULES, apartmentDef } from '../../data/apartments'
import { recentIncome } from '../finance/pnl'
import { registerBillHandler, removeBillByRef, upsertBill } from '../finance/bills'
import { ensureLife, firstName, round2, send, today, usd } from './util'

const MOM = { from: 'Mom', fromEmail: 'linda.homebase@inboxly.com', tag: 'misc' as const }
const landlordOf = (tier: number) => {
  const a = apartmentDef(tier)
  return { from: a.landlord.name, fromEmail: a.landlord.email, tag: 'landlord' as const, site: 'zillo' as const, signoff: a.landlord.signoff }
}

export interface Eligibility {
  ok: boolean
  reason?: string
  income30: number
  needIncome: number
  cash: number
  needCash: number
  deposit: number
  movers: number
  proratedRent: number
  /** deposit back from your current place (estimate, before cleaning) */
  depositRefund: number
  moveInCost: number
}

export function income30(s: GameState) { return recentIncome(s, today(s), 30) }

export function apartmentEligibility(s: GameState, tier: number): Eligibility {
  ensureLife(s)
  const apt = APARTMENTS[tier]
  const inc = income30(s).total
  const cash = s.finance.cash
  const base: Eligibility = { ok: false, income30: inc, needIncome: 0, cash, needCash: 0, deposit: 0, movers: 0, proratedRent: 0, depositRefund: s.home.deposit ?? 0, moveInCost: 0 }
  if (!apt) return { ...base, reason: 'That listing no longer exists.' }
  const t = today(s)
  const deposit = apt.rent * HOUSING_RULES.depositMonths
  const movers = tier > 0 ? HOUSING_RULES.moversPerTier * tier : 0
  const dim = daysInMonth(dateOfDay(t).getUTCFullYear(), dateOfDay(t).getUTCMonth())
  const proratedRent = round2(apt.rent * ((firstOfNextMonth(t) - t) / dim))
  const needIncome = apt.rent * HOUSING_RULES.incomeMultiple
  const needCash = apt.rent * HOUSING_RULES.cashMultiple
  const e: Eligibility = { ...base, needIncome, needCash, deposit, movers, proratedRent, moveInCost: round2(deposit + proratedRent + movers) }
  if (tier === s.home.tier) return { ...e, reason: 'You already live here.' }
  if (tier > 0 && inc < needIncome && cash < needCash) {
    return { ...e, reason: `The landlord wants 30-day income of ${usd(needIncome, false)} (you: ${usd(inc, false)}) or ${usd(needCash, false)} in the bank (you: ${usd(cash, false)}).` }
  }
  const rentBill = s.finance.bills.find(b => b.ref === 'rent')
  if (tier > 0 && (rentBill?.arrears ?? 0) > 0) return { ...e, reason: 'Pay your past-due rent first — every landlord runs a rental history check.' }
  const refund = s.home.deposit ?? 0
  if (cash + refund < deposit + proratedRent) return { ...e, reason: `You need ${usd(deposit + proratedRent)} in checking for the deposit and first month (landlords don't take credit cards).` }
  if (cash + refund - deposit - proratedRent + cardAvailable(s) < movers) return { ...e, reason: `You can't cover the movers (${usd(movers, false)}).` }
  return { ...e, ok: true }
}

export function moveApartment(s: GameState, tier: number): { ok: boolean; reason?: string } {
  ensureLife(s)
  const e = apartmentEligibility(s, tier)
  if (!e.ok) return { ok: false, reason: e.reason }
  const t = today(s)
  const oldTier = s.home.tier
  const old = apartmentDef(oldTier)
  const apt = apartmentDef(tier)
  // 1) move out: deposit back minus cleaning and unpaid rent
  const rentBill = s.finance.bills.find(b => b.ref === 'rent')
  const arrears = rentBill?.arrears ?? 0
  if (oldTier > 0 && (s.home.deposit ?? 0) > 0) {
    const dep = s.home.deposit ?? 0
    const cleaning = round2(dep * randRange(s, HOUSING_RULES.cleaningFeePct[0], HOUSING_RULES.cleaningFeePct[1]))
    const back = round2(Math.max(0, dep - cleaning - arrears))
    if (back > 0) receive(s, back, { category: 'rent', memo: `Security deposit refund — ${old.name}`, business: false, pnl: null })
    const ll = landlordOf(oldTier)
    send(s, {
      ...ll, subject: 'Your security deposit',
      body: `Hi ${firstName(s)},\n\nThanks for being a resident. Here's your move-out statement:\n\nSecurity deposit: ${usd(dep)}\nCleaning & repairs: −${usd(cleaning)}${arrears > 0 ? `\nUnpaid rent: −${usd(arrears)}` : ''}\nRefunded to your account: ${usd(back)}\n\n${ll.signoff}`,
    })
  }
  removeBillByRef(s, 'rent')
  s.flags['rent.cycleFailDay'] = -1
  // 2) move in
  if (tier > 0) {
    const paid = pay(s, e.deposit + e.proratedRent, { category: 'rent', memo: `Deposit + first month (prorated) — ${apt.name}`, business: false, prefer: 'bank', strict: true })
    if (!paid) return { ok: false, reason: 'The deposit payment bounced.' }
    if (e.movers > 0) pay(s, e.movers, { category: 'moving', memo: `Two Guys & A Van Movers — ${apt.name}`, business: false, prefer: 'bank' })
    const next = firstOfNextMonth(t)
    const bill: RecurringBill = {
      id: uid(s, 'bill'), name: `Rent — ${apt.name}`, amount: apt.rent, cadence: 'monthly', nextDueDay: next,
      payWith: 'bank', category: 'rent', business: false, ref: 'rent', dom: 1,
    }
    upsertBill(s, bill)
    s.home.rentDueDay = next
  } else {
    s.home.rentDueDay = t + 30
  }
  s.home.tier = tier
  s.home.rentMonthly = apt.rent
  s.home.movedInDay = t
  s.home.missedRent = 0
  s.home.deposit = tier > 0 ? e.deposit : 0
  s.home.onTimeRentStreak = 0
  s.player.mood = Math.min(100, s.player.mood + (tier > oldTier ? 12 : -6))

  notify(s, {
    kind: tier > oldTier ? 'success' : 'info', title: `Moved in: ${apt.name}`,
    body: tier > 0 ? `Rent ${usd(apt.rent, false)}/mo from your checking on the 1st. Paid today: ${usd(e.deposit + e.proratedRent + e.movers)}.` : 'Back in the basement. Rent-free.',
    site: 'zillo', path: '',
  })
  if (tier > 0) {
    const ll = landlordOf(tier)
    send(s, {
      ...ll, subject: `Welcome home — lease for ${apt.name}`,
      body: [
        `Hi ${firstName(s)},`,
        '',
        `Welcome to your new place! Your keys are ready. Lease summary:`,
        `• Monthly rent: ${usd(apt.rent)} — due on the 1st, auto-debited from checking`,
        `• Security deposit on file: ${usd(e.deposit)}`,
        `• Prorated rent for the rest of ${formatDate(t, 'md').split(' ')[0]}: ${usd(e.proratedRent)}`,
        `• Grace period: ${HOUSING_RULES.graceDays} days. After that there's a late fee of ${usd(Math.max(HOUSING_RULES.lateFeeFlat, apt.rent * HOUSING_RULES.lateFeePct))}, and ${HOUSING_RULES.missedToEvict} missed payments end the lease.`,
        '',
        ll.signoff,
      ].join('\n'),
    })
  }
  if (oldTier === 0 && tier > 0) {
    send(s, { ...MOM, subject: 'The basement is so quiet', body: `I walked past your room and cried a little, then I turned it into a craft room. KIDDING. It's still yours if you need it.\n\nCall your mother. Eat vegetables. Don't put rent on a credit card.\n\nLove,\nMom` })
  } else if (tier === 0 && oldTier > 0) {
    send(s, { ...MOM, subject: 'Your room is ready', body: `Dad moved the treadmill out. Clean sheets are on the bed. No rent, but you're doing dishes.\n\nLove,\nMom` })
  }
  return { ok: true }
}

function lateFee(tier: number) {
  const apt = apartmentDef(tier)
  return round2(Math.max(HOUSING_RULES.lateFeeFlat, apt.rent * HOUSING_RULES.lateFeePct))
}

function evict(s: GameState) {
  const oldTier = s.home.tier
  const old = apartmentDef(oldTier)
  const ll = landlordOf(oldTier)
  const bill = s.finance.bills.find(b => b.ref === 'rent')
  const owed = bill?.arrears ?? 0
  const dep = s.home.deposit ?? 0
  removeBillByRef(s, 'rent')
  s.home.tier = 0
  s.home.rentMonthly = 0
  s.home.movedInDay = today(s)
  s.home.rentDueDay = today(s) + 30
  s.home.missedRent = 0
  s.home.deposit = 0
  s.home.onTimeRentStreak = 0
  s.flags['rent.cycleFailDay'] = -1
  s.player.mood = Math.max(0, s.player.mood - 20)
  pushModal(s, {
    kind: 'home_evicted', title: 'Evicted',
    image: roomImage(0),
    body: `After ${HOUSING_RULES.missedToEvict} missed rent payments, ${old.landlord.name} ended your lease at ${old.name}. Your ${usd(dep, false)} deposit went toward the ${usd(owed, false)} you owed.\n\nMom picked you up in the minivan. You're back in the basement.`,
    choices: [{ id: 'ok', label: 'Carry my boxes downstairs', tone: 'default' }],
  })
  notify(s, { kind: 'critical', title: `Evicted from ${old.name}`, body: 'Back to your parents\' basement.', site: 'zillo' })
  send(s, {
    ...ll, subject: 'Notice of lease termination',
    body: `${firstName(s)},\n\nRent for ${old.name} has now been missed ${HOUSING_RULES.missedToEvict} times. Per the lease, your tenancy is terminated effective today. Your security deposit of ${usd(dep)} has been applied to the outstanding balance of ${usd(owed)}${owed > dep ? '; the remainder has been written off' : ''}.\n\nPlease return all keys to the office.\n\n${ll.signoff}`,
  })
  send(s, { ...MOM, subject: 'We\'re coming to get you', body: `Dad's bringing the minivan and the good tape. Nobody's mad. Well, Dad's a little mad about the minivan.\n\nYour room is ready.\n\nLove,\nMom` })
}

// ---- rent handlers (bills engine) ----
registerBillHandler('rent', {
  onPaid: (s, bill, info) => {
    s.home.rentDueDay = bill.nextDueDay
    const ll = landlordOf(s.home.tier)
    if (info.wasLate) {
      s.home.onTimeRentStreak = 0
      notify(s, { kind: 'info', title: 'Past-due rent paid', body: `${usd(info.amount)} to ${ll.from}.`, site: 'bank', path: 'bills' })
      send(s, { ...ll, subject: 'Payment received', body: `Hi ${firstName(s)},\n\nWe received ${usd(info.amount)} for your past-due rent. Your account is current. Please make sure next month's payment clears on the 1st.\n\n${ll.signoff}` })
      return
    }
    s.home.onTimeRentStreak = (s.home.onTimeRentStreak ?? 0) + 1
    if (s.home.missedRent > 0 && (s.home.onTimeRentStreak ?? 0) >= HOUSING_RULES.forgiveAfterOnTime) {
      s.home.missedRent -= 1
      s.home.onTimeRentStreak = 0
      send(s, { ...ll, subject: 'Your rental record', body: `Hi ${firstName(s)},\n\n${HOUSING_RULES.forgiveAfterOnTime} on-time payments in a row — we've cleared one late mark from your file. Thank you.\n\n${ll.signoff}` })
    }
  },
  onFailed: (s, bill, info) => {
    const ll = landlordOf(s.home.tier)
    const apt = apartmentDef(s.home.tier)
    if (info.newlyDue > 0) {
      s.flags['rent.cycleFailDay'] = info.day
      notify(s, { kind: 'critical', title: 'Rent payment bounced', body: `${usd(info.amount)} due to ${ll.from}. You have ${HOUSING_RULES.graceDays} days before it counts as missed.`, site: 'bank', path: 'bills' })
      send(s, {
        ...ll, subject: 'Rent payment returned — insufficient funds',
        body: `Hi ${firstName(s)},\n\nYour rent payment of ${usd(info.amount)} for ${apt.name} was returned by your bank (NSF). Please make sure funds are available — we'll re-attempt the debit daily.\n\nIf it isn't paid within ${HOUSING_RULES.graceDays} days, a late fee of ${usd(lateFee(s.home.tier))} applies and it's recorded as a missed payment.\n\n${ll.signoff}`,
      })
      return true
    }
    const cycleStart = Number(s.flags['rent.cycleFailDay'] ?? info.day)
    if (info.day - cycleStart === HOUSING_RULES.graceDays) {
      const fee = lateFee(s.home.tier)
      bill.arrears = round2((bill.arrears ?? 0) + fee)
      s.home.missedRent += 1
      s.home.onTimeRentStreak = 0
      if (s.home.missedRent >= HOUSING_RULES.missedToEvict) { evict(s); return true }
      notify(s, { kind: 'critical', title: `Rent missed (${s.home.missedRent}/${HOUSING_RULES.missedToEvict})`, body: `Late fee ${usd(fee)} added. One more missed month and you're evicted.`, site: 'bank', path: 'bills' })
      send(s, {
        ...ll, subject: 'NOTICE: Rent past due',
        body: `${firstName(s)},\n\nRent for ${apt.name} is now ${HOUSING_RULES.graceDays} days past due. A late fee of ${usd(fee)} has been added; you now owe ${usd(bill.arrears)}.\n\nThis is missed payment ${s.home.missedRent} of ${HOUSING_RULES.missedToEvict}. Under the lease, a second missed payment is grounds for termination.\n\n${ll.signoff}`,
      })
    }
    return true
  },
})

registerModalHandler('home_evicted', () => {})
