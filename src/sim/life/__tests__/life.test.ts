import { describe, expect, it } from 'vitest'
import type { GameState } from '../../../core/types'
import { createNewGame } from '../../../core/newGame'
import { dayOf, dayOfDate, hourOfDay } from '../../../core/time'
import { resolveModal } from '../../../core/modals'
import { emptyPnl, pay } from '../../../core/money'
import {
  buyGear, filmQualityBonus, hireStaff, lifeDayRollover, lifeTickHour, moveApartment, quitJob, staffDayRollover, staffTickHour,
  enqueueActivity, askForJobBack, callOutSick, setSchedule,
} from '../index'
import { financeDayRollover, financeTickHour, setAutopay, payCardBalance, taxEstimate } from '../../finance'

function newGame(difficulty: GameState['meta']['difficulty'] = 'normal', seed = 12345): GameState {
  return createNewGame({ playerName: 'Jordan Test', difficulty, seed })
}

/** Headless hour loop that mirrors sim/index.ts for the life & finance modules only. */
function advance(s: GameState, hours: number, each?: (s: GameState) => void) {
  for (let i = 0; i < hours; i++) {
    s.time.hour += 1
    if (hourOfDay(s.time.hour) === 0) {
      const d = dayOf(s.time.hour)
      financeDayRollover(s, d)
      lifeDayRollover(s, d)
      staffDayRollover(s, d)
    }
    lifeTickHour(s)
    staffTickHour(s)
    financeTickHour(s)
    each?.(s)
  }
}
/** advance until the given absolute hour */
const advanceTo = (s: GameState, hour: number, each?: (s: GameState) => void) => advance(s, hour - s.time.hour, each)

describe('life: autopilot needs & McDoodle\'s shifts', () => {
  it('keeps energy/hunger sane and works every scheduled shift for 14 days', () => {
    const s = newGame()
    expect(s.flags.autopilot).toBe(true)
    const scheduled = s.job.shifts.filter(sh => sh.day < 14).map(sh => sh.day)
    expect(scheduled).toEqual([1, 3, 5, 8, 10, 12]) // part-time: Tue / Thu / Sat
    let minEnergy = 100, minHunger = 100, eSum = 0, hSum = 0, n = 0, passedOut = false
    const atWork: number[] = []
    advance(s, 14 * 24, st => {
      const p = st.player
      minEnergy = Math.min(minEnergy, p.energy)
      minHunger = Math.min(minHunger, p.hunger)
      eSum += p.energy; hSum += p.hunger; n++
      if (p.activity?.payload?.forced) passedOut = true
      if (p.location === 'work') atWork.push(st.time.hour)
      expect(p.energy).toBeGreaterThanOrEqual(0)
      expect(p.energy).toBeLessThanOrEqual(100)
      expect(p.hunger).toBeGreaterThanOrEqual(0)
      expect(p.hunger).toBeLessThanOrEqual(100)
    })
    expect(passedOut).toBe(false)
    expect(minEnergy).toBeGreaterThan(5)
    expect(minHunger).toBeGreaterThan(10)
    expect(eSum / n).toBeGreaterThan(40)
    expect(hSum / n).toBeGreaterThan(35)
    const worked = s.job.shifts.filter(sh => sh.day < 14)
    expect(worked.map(sh => sh.status)).toEqual(Array(6).fill('worked'))
    expect(worked.every(sh => (sh.hoursWorked ?? 0) === 7)).toBe(true)
    expect(s.job.shiftsWorked).toBe(6)
    expect(s.job.strikes).toBe(0)
    // auto-commute: at work during shift hours only (11:00–18:00)
    expect(atWork.length).toBe(6 * 7)
    for (const h of atWork) expect(hourOfDay(h)).toBeGreaterThanOrEqual(11)
    for (const h of atWork) expect(hourOfDay(h)).toBeLessThan(18)
    // schedule stays posted 14 days ahead
    expect(Math.max(...s.job.shifts.map(sh => sh.day))).toBeGreaterThanOrEqual(dayOf(s.time.hour) + 10)
    // sleeps at night
    expect(s.player.burnoutDays).toBe(0)
  })

  it('without autopilot a neglected player passes out and misses a shift (strike)', () => {
    const s = newGame('realistic')
    expect(s.flags.autopilot).toBe(false)
    let passedOut = false
    advance(s, 4 * 24, st => { if (st.player.activity?.payload?.forced) passedOut = true })
    expect(passedOut).toBe(true)
    expect(s.job.shifts.some(sh => sh.status === 'missed')).toBe(true)
    expect(s.job.strikes).toBeGreaterThanOrEqual(1)
  })

  it('queued business tasks run, scale with the old laptop, and grant XP', () => {
    const s = newGame()
    const id = enqueueActivity(s, 'study', { payload: { skill: 'research' } })
    expect(id).toBeTruthy()
    expect(s.player.activity?.kind).toBe('study')
    expect(s.player.activity?.durationMin).toBe(120) // study is not productivity-scaled
    const r = enqueueActivity(s, 'product_research', { payload: { catalogId: 'pet-hair-roller' } })
    expect(r).toBeTruthy()
    expect(s.player.queue[0].durationMin).toBe(75) // 60 min × 1.25 (old laptop)
    advance(s, 4)
    expect(s.skills.research.xp + (s.skills.research.level - 1) * 100).toBeGreaterThanOrEqual(100)
    expect(s.skills.research.level).toBe(2) // 60 + 40 = 100 XP → level 2
  })
})

describe('life: job payroll & HR', () => {
  it('pays biweekly on Fridays with a pay stub email', () => {
    const s = newGame()
    const cash0 = s.finance.cash
    advance(s, 28 * 24)
    const stubs = s.job.payStubs ?? []
    expect(stubs.map(p => p.payDay)).toEqual([11, 25])
    expect(stubs[0].hours).toBe(21)
    expect(stubs[0].gross).toBeCloseTo(336, 2)
    expect(stubs[0].net).toBeCloseTo(336 * 0.88, 1)
    expect(stubs[1].hours).toBe(42)
    const wageTx = s.finance.ledger.filter(l => l.category === 'wage')
    expect(wageTx.length).toBe(2)
    expect(wageTx[0].amount).toBeCloseTo(stubs[0].net, 2)
    expect(s.inbox.filter(m => m.subject.startsWith('Pay stub')).length).toBe(2)
    expect(s.finance.cash).toBeGreaterThan(cash0) // wages outpace groceries + phone + gym
  })

  it('quitting (after the confirmation modal) stops all shifts', () => {
    const s = newGame()
    advance(s, 2 * 24)
    quitJob(s)
    const modal = s.events.modals.find(m => m.kind === 'job_quit_confirm')
    expect(modal).toBeTruthy()
    expect(s.job.employed).toBe(true) // not until confirmed
    resolveModal(s, modal!.id, 'quit')
    expect(s.job.employed).toBe(false)
    expect(s.job.schedule).toBe('none')
    expect(s.job.shifts.some(sh => sh.status === 'scheduled')).toBe(false)
    const quitDay = dayOf(s.time.hour)
    let wentToWork = false
    advance(s, 10 * 24, st => { if (st.player.location === 'work') wentToWork = true })
    expect(wentToWork).toBe(false)
    expect(s.job.shifts.filter(sh => sh.day >= quitDay).length).toBe(0)
    // final paycheck still arrives on day 11
    expect((s.job.payStubs ?? []).length).toBe(1)
    // humiliation modal to get the job back
    expect(askForJobBack(s)).toBe(true)
    const rehire = s.events.modals.find(m => m.kind === 'job_rehire')!
    resolveModal(s, rehire.id, 'accept')
    expect(s.job.employed).toBe(true)
    expect(s.job.reliability).toBe(60)
    expect(s.job.shifts.some(sh => sh.status === 'scheduled')).toBe(true)
  })

  it('call-outs: 2 free per 30 days, then a strike; schedule changes respect notice', () => {
    const s = newGame()
    advanceTo(s, 1 * 24 + 8) // Tue 8 AM, shift at 11
    callOutSick(s)
    expect(s.job.shifts.find(sh => sh.day === 1)!.status).toBe('called_out')
    advanceTo(s, 3 * 24 + 8)
    callOutSick(s)
    expect(s.job.strikes).toBe(0)
    advanceTo(s, 5 * 24 + 8)
    callOutSick(s)
    expect(s.job.strikes).toBe(1)
    setSchedule(s, 'full')
    const d = dayOf(s.time.hour)
    const future = s.job.shifts.filter(sh => sh.day >= d + 3 && sh.status === 'scheduled')
    expect(future.every(sh => sh.startHour === 7 && sh.hours === 8)).toBe(true)
  })
})

describe('finance: card statements & autopay', () => {
  it('closes a statement on the 25th and autopays the minimum on the due date', () => {
    const s = newGame()
    expect(pay(s, 600, { category: 'ad_spend', memo: 'Fadbook ads', business: true, prefer: 'card', pnl: 'adSpendFadbook' })).toBe('card')
    const close = dayOfDate(2026, 2, 25)
    advanceTo(s, close * 24 + 1)
    const c = s.finance.card
    expect(c.statementBalance).toBeCloseTo(600, 2)
    expect(c.minDue).toBe(35)
    expect(c.dueDay).toBe(close + 25)
    expect(s.inbox.some(m => m.subject.includes('statement is ready'))).toBe(true)
    advanceTo(s, (close + 25) * 24 + 1)
    expect(c.balance).toBeCloseTo(565, 2)
    expect(c.lateCount).toBe(0)
    expect(c.onTimeStreak).toBe(1)
    expect(c.carriedBalance).toBe(true)
    expect(c.statements!.at(-1)!.status).toBe('paid_min')
    // next close charges interest because the balance was carried
    const close2 = dayOfDate(2026, 3, 25)
    advanceTo(s, close2 * 24 + 1)
    expect(c.statements!.at(-1)!.interest).toBeCloseTo(565 * 0.2799 / 12, 2)
  })

  it('autopay in full avoids interest; no autopay → late fee, penalty APR, freeze after 2 lates', () => {
    const full = newGame()
    setAutopay(full, 'full')
    pay(full, 400, { category: 'cogs', memo: 'Supplier', business: true, prefer: 'card' })
    advanceTo(full, dayOfDate(2026, 3, 26) * 24)
    expect(full.finance.card.balance).toBeCloseTo(0, 2)
    expect(full.finance.card.statements!.every(st => st.interest === 0)).toBe(true)

    const late = newGame()
    setAutopay(late, 'none')
    pay(late, 400, { category: 'cogs', memo: 'Supplier', business: true, prefer: 'card' })
    const due1 = dayOfDate(2026, 2, 25) + 25
    advanceTo(late, (due1 + 1) * 24)
    const c = late.finance.card
    expect(c.lateCount).toBe(1)
    expect(c.apr).toBeCloseTo(0.2999, 4)
    expect(c.balance).toBeCloseTo(435, 2)
    expect(c.frozen).toBe(false)
    const due2 = dayOfDate(2026, 3, 25) + 25
    advanceTo(late, (due2 + 1) * 24)
    expect(c.lateCount).toBe(2)
    expect(c.frozen).toBe(true)
    // paying the full statement unfreezes
    payCardBalance(late, c.statementBalance + (c.pastDue ?? 0))
    expect(c.frozen).toBe(false)
  })

  it('recurring bills: phone bill is charged monthly from checking', () => {
    const s = newGame()
    const phone = s.finance.bills.find(b => b.ref === 'phone')!
    expect(phone.amount).toBe(45)
    const first = phone.nextDueDay
    advanceTo(s, (first + 1) * 24)
    expect(s.finance.ledger.some(l => l.memo.startsWith('Veritone') && l.amount === -45 && l.account === 'bank')).toBe(true)
    expect(phone.nextDueDay).toBeGreaterThan(first + 27)
  })

  it('quarterly estimated taxes are reminded and auto-paid on Normal', () => {
    const s = newGame()
    s.finance.pnl[3] = { ...emptyPnl(), revenue: 4000, cogs: 1000 }
    const due = dayOfDate(2026, 3, 15)
    advanceTo(s, (due - 13) * 24)
    expect(s.inbox.some(m => m.subject.startsWith('Estimated tax reminder'))).toBe(true)
    expect(taxEstimate(s, dayOf(s.time.hour)).pending).toBeCloseTo(750, 2)
    advanceTo(s, (due + 1) * 24)
    expect(s.finance.taxes.paidYtd).toBeCloseTo(750, 2)
    expect(s.finance.ledger.some(l => l.category === 'tax' && l.amount === -750)).toBe(true)
  })
})

describe('life: gear, apartments, staff', () => {
  it('buying gear charges money, equips it and is reflected in film quality', () => {
    const s = newGame()
    const cash = s.finance.cash
    expect(filmQualityBonus(s)).toBe(0)
    expect(buyGear(s, 'ring-light')).toEqual({ ok: true })
    expect(s.finance.cash).toBeCloseTo(cash - 39, 2)
    expect(s.gear.owned).toContain('ring-light')
    expect(s.gear.equipped.lighting).toBe('ring-light')
    expect(filmQualityBonus(s)).toBeCloseTo(0.05, 5)
    expect(buyGear(s, 'ring-light').ok).toBe(false)
    const card0 = s.finance.card.balance
    expect(buyGear(s, 'workstation').ok).toBe(false) // $3,499 > checking and > card limit
    expect(s.finance.card.balance).toBe(card0)
    expect(buyGear(s, 'phone-pro', { payWith: 'card' }).ok).toBe(true)
    expect(s.finance.card.balance).toBeCloseTo(card0 + 1099, 2)
    expect(filmQualityBonus(s)).toBeCloseTo(0.17, 5)
  })

  it('moving charges deposit + movers; missed rent twice gets you evicted', () => {
    const s = newGame()
    expect(moveApartment(s, 1).ok).toBe(false) // no income, not enough cash
    s.finance.cash = 8000
    const r = moveApartment(s, 1)
    expect(r.ok).toBe(true)
    expect(s.home.tier).toBe(1)
    expect(s.home.deposit).toBe(950)
    const rent = s.finance.bills.find(b => b.ref === 'rent')!
    expect(rent.amount).toBe(950)
    expect(rent.nextDueDay).toBe(dayOfDate(2026, 3, 1))
    s.finance.cash = 0
    s.flags.autopilot = true
    advanceTo(s, dayOfDate(2026, 4, 12) * 24)
    expect(s.home.tier).toBe(0)
    expect(s.finance.bills.some(b => b.ref === 'rent')).toBe(false)
    expect(s.events.modals.some(m => m.kind === 'home_evicted')).toBe(true)
  })

  it('hiring from UpWorx creates a weekly salary bill paid from checking', () => {
    const s = newGame()
    expect(s.staff.candidates.length).toBeGreaterThanOrEqual(5)
    const c = s.staff.candidates.find(x => x.role === 'va')!
    expect(c.portrait).toMatch(/^p(0[1-9]|1[0-8])$/)
    expect(c.bio.length).toBeGreaterThan(60)
    expect(hireStaff(s, c.id).ok).toBe(true)
    const bill = s.finance.bills.find(b => b.ref === `staff:${c.id}`)!
    expect(bill.cadence).toBe('weekly')
    advance(s, 8 * 24)
    expect(s.finance.ledger.some(l => l.category === 'staff' && l.amount < 0)).toBe(true)
    expect(s.staff.members.length).toBe(1)
    expect(s.staff.members[0].unpaidDays).toBe(0)
  })
})

describe('staff: media buyer 9 AM rules', () => {
  it('pauses a loser past 2× break-even CPA and scales a winner 15–20%', async () => {
    const { createStore, importProduct, updateProduct, setProductStatus, breakEven } = await import('../../store')
    const { openAdAccount, createCampaign, createAdSet, createAd, orderCreative, completeCreative, emptyStats } = await import('../../ads')
    const { staffTickHour: tick } = await import('../index')
    const s = newGame()
    createStore(s, { name: 'Cozy Paws' })
    const sp = importProduct(s, 'pet-hair-roller')
    updateProduct(s, sp, { price: 24.99 })
    setProductStatus(s, sp, 'active')
    const acct = openAdAccount(s, 'fadbook')!
    const camp = createCampaign(s, { platform: 'fadbook', accountId: acct, name: 'Prospecting', budgetMode: 'abo' })!
    const loserSet = createAdSet(s, { campaignId: camp, name: 'Loser', dailyBudget: 50 })!
    const winnerSet = createAdSet(s, { campaignId: camp, name: 'Winner', dailyBudget: 50 })!
    const cr = orderCreative(s, { catalogId: 'pet-hair-roller', name: 'Edit', format: 'supplier_edit', hook: 'problem_callout', angle: 'pain_point', beats: ['hook', 'demo', 'cta'], hookText: 'Tired of pet hair?', script: '', producer: 'supplier_edit' })!
    completeCreative(s, cr)
    const mk = (adSetId: string) => createAd(s, { adSetId, name: 'Ad', creativeId: cr, storeProductId: sp, primaryText: 'Fur gone in one roll.', headline: 'Pet hair, gone' })!
    const loser = mk(loserSet)
    const winner = mk(winnerSet)
    s.staff.members.push({
      id: 'staff_mb', name: 'Carmen Ruiz', role: 'media_buyer', skill: 10, salaryWeekly: 2400, hiredDay: 0, portrait: 'p03', morale: 80,
      config: { platform: 'both', autoKill: true, autoScale: true, duplicateWinners: false, launchCreatives: false, maxDailyBudget: 1000 },
    })
    // jump to 9 AM two days later with three days of stats
    const t = dayOf(s.time.hour) + 2
    s.time.hour = t * 24 + 9
    const be = breakEven(s, sp)
    expect(be.breakEvenCpa).toBeGreaterThan(0)
    for (const set of s.ads.adSets) set.learning.state = 'active'
    const day = (spend: number, value: number) => {
      const st = emptyStats()
      st.spend = spend; st.impressions = 4000; st.reach = 3500; st.linkClicks = 40
      st.purchases = st.truePurchases = Math.round(value / 24.99)
      st.purchaseValue = st.trueRevenue = value
      return st
    }
    const adL = s.ads.ads.find(a => a.id === loser)!
    const adW = s.ads.ads.find(a => a.id === winner)!
    for (const d of [t - 2, t - 1]) {
      adL.stats[d] = day(be.breakEvenCpa * 1.5, be.breakEvenCpa * 1.5 * be.breakEvenRoas * 0.3)
      adW.stats[d] = day(be.breakEvenCpa * 1.5, be.breakEvenCpa * 1.5 * be.breakEvenRoas * 2)
    }
    tick(s)
    expect(adL.status).toBe('paused')
    expect(adW.status).toBe('active')
    const wBudget = s.ads.adSets.find(a => a.id === winnerSet)!.dailyBudget!
    expect(wBudget).toBeGreaterThanOrEqual(57)
    expect(wBudget).toBeLessThanOrEqual(60)
    expect(s.ads.adSets.find(a => a.id === loserSet)!.dailyBudget).toBe(50)
    expect(s.staff.members[0].lastReport).toMatch(/paused 1, scaled 1/)
  })
})
