// ============================================================================
// SIMULATION ORCHESTRATOR — one call = one in-game hour. Mutates an immer draft.
// Order matters: rollover → events (modifiers) → life → ads → store → finance → coach.
// ============================================================================
import type { GameState } from '../core/types'
import { dayOf, hourOfDay } from '../core/time'
import { netWorth, pnlFor } from '../core/money'
import { adsDayRollover, adsRecordConversions, adsTickHour } from './ads'
import { storeDayRollover, storeOrganicTraffic, storeProcessTraffic, storeTickHour } from './store'
import { lifeDayRollover, lifeTickHour, staffDayRollover, staffTickHour } from './life'
import { financeDayRollover, financeTickHour } from './finance'
import { marketDayRollover, marketTickHour } from './market'
import { checkMilestones, coachDayRollover, coachTickHour, eventsDayRollover, eventsTickHour } from './events'

export function tickHour(s: GameState): void {
  s.time.hour += 1
  if (hourOfDay(s.time.hour) === 0) dayRollover(s, dayOf(s.time.hour))

  eventsTickHour(s)
  marketTickHour(s)
  lifeTickHour(s)
  staffTickHour(s)

  const packets = adsTickHour(s)
  for (const p of storeOrganicTraffic(s)) packets.push(p)
  const conversions = storeProcessTraffic(s, packets)
  adsRecordConversions(s, conversions)

  storeTickHour(s)
  financeTickHour(s)
  coachTickHour(s)
}

function dayRollover(s: GameState, day: number): void {
  snapshot(s, day - 1)
  marketDayRollover(s, day)
  adsDayRollover(s, day)
  storeDayRollover(s, day)
  financeDayRollover(s, day)
  lifeDayRollover(s, day)
  staffDayRollover(s, day)
  eventsDayRollover(s, day)
  coachDayRollover(s, day)
  checkMilestones(s)
}

function snapshot(s: GameState, day: number): void {
  if (day < 0) return
  const p = pnlFor(s, day)
  const adSpend = p.adSpendFadbook + p.adSpendTiktak
  const profit = p.revenue - p.refunds - p.chargebacks - p.cogs - p.shipping - adSpend - p.paymentFees - p.apps - p.creatives - p.staff - p.otherBusiness
  const orders = s.store.analytics.daily[day]?.orders ?? 0
  s.history.push({ day, cash: s.finance.cash, netWorth: netWorth(s), revenue: p.revenue, adSpend, profit, orders })
}
