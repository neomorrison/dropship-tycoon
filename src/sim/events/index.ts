// ============================================================================
// EVENTS MODULE — scheduled & random events (market dynamics, CNY, BFCM,
// viral/organic, influencers, platform drama, chargeback waves), decision
// modals, modifiers, Coach Kev tips, milestones.
// OWNER: sim-market-events agent. PUBLIC API; keep every export & signature.
// Implementation lives in the sibling files; this file is the contract.
// ============================================================================
import type { CoachState, EventsState, GameState } from '../../core/types'
import { SENDERS } from '../../data/events'
import { coachTip, mail } from '../../core/notify'
import * as coach from './coach'
import * as ms from './milestones'
import * as modals from './modals'
import { recomputeModifiers } from './modifiers'
import { dailyLifeEvents, hourlyTriggers, onEventExpire, rollRandomEvents } from './random'
import { scheduleCalendar } from './scheduled'
import { neutralModifiers as neutral, today } from './util'

export const neutralModifiers = neutral
export function createEventsState(): EventsState { return { active: [], log: [], cooldowns: {}, modals: [], modifiers: neutralModifiers() } }
export function createCoachState(): CoachState { return { enabled: true, shown: {}, queue: [] } }

export function eventsOnNewGame(s: GameState): void {
  const day = today(s)
  scheduleCalendar(s, day)
  recomputeModifiers(s)
  mail(s, {
    ...SENDERS.coach, tag: 'coach', site: 'academy',
    subject: 'Welcome to the grind — Kev here',
    body: [
      `Hey ${s.meta.playerName || 'there'},`,
      '',
      "I'm Kev. I went from flipping burgers to running stores that do seven figures, and I'll be in your corner.",
      '',
      'The game plan:',
      '1. Open a Shopifly store ($1/month for the first 3 months).',
      '2. Find ONE product on AliExprez with real demand and room for margin (Amazin price ≥ 3× your landed cost).',
      '3. Build a product page that sells — never copy the supplier title or description.',
      '4. Make 3+ ad creatives with different hooks, test at $30–50/day, and judge by REAL orders in Shopifly.',
      '5. Scale winners slowly, kill losers fast, and never let your credit card surprise you.',
      '',
      'Keep your McDoodle\'s shifts until the store pays the bills. Ask me anything in the Ecom Academy.',
      '',
      '— Kev',
    ].join('\n'),
  })
  const onb = coach.onboardingInsight(s)
  if (onb) coachTip(s, onb.id, onb.text, { app: onb.app, essential: true, cooldownHours: 30 })
}

/** Recompute s.events.modifiers from active events; roll hourly events (viral spikes...). */
export function eventsTickHour(s: GameState): void {
  hourlyTriggers(s)
  recomputeModifiers(s)
}

/** Schedule/expire events, roll daily random events, CNY warnings, BFCM, etc. */
export function eventsDayRollover(s: GameState, day: number): void {
  const keep = []
  for (const e of s.events.active) {
    if (e.endDay < day) onEventExpire(s, e)
    else keep.push(e)
  }
  s.events.active = keep
  scheduleCalendar(s, day)
  dailyLifeEvents(s, day)
  rollRandomEvents(s, day)
  recomputeModifiers(s)
}

/** Register handlers for the modal kinds this module creates (called once at import). */
export function registerEventModalHandlers(): void {
  modals.registerEventModalHandlers()
}
/** Called when the influencer_outreach activity completes. */
export function influencerOutreach(s: GameState, storeProductId: string): void {
  modals.influencerOutreach(s, storeProductId)
}

// ---- coach ----
export function coachTickHour(s: GameState): void {
  coach.coachTickHour(s)
  ms.checkMilestonesLight(s)
}
export function coachDayRollover(s: GameState, day: number): void {
  coach.coachDayRollover(s, day)
}
export function dismissCoachTip(s: GameState, id: string): void {
  coach.dismissCoachTip(s, id)
}
/** On-demand analysis ("Ask Coach Kev"): returns tips about current business state. */
export function askCoach(s: GameState): string[] {
  return coach.askCoach(s)
}

// ---- milestones ----
export type MilestoneDef = ms.MilestoneDef
export function milestoneDefs(): MilestoneDef[] { return ms.milestoneDefs() }
export function checkMilestones(s: GameState): void { ms.checkMilestones(s) }

// ============================================================================
// Additional exports (additive)
// ============================================================================
export type { Insight } from './coach'
/** Structured coach insights (priority, deep link) for UIs that want more than askCoach() strings. */
export const analyzeBusiness = coach.analyzeBusiness
/** Current onboarding step as an insight (null when onboarding is complete). */
export const onboardingInsight = coach.onboardingInsight
/** Break-even CPA/ROAS for a store product (store's breakEven with a landed-cost fallback). */
export const breakEvenFor = coach.breakEvenFor
/** Show an influencer offer popup for a store product (e.g. from a UI "pitch creators" flow). */
export const influencerOfferModal = modals.influencerOfferModal
export { cnyWindow, cnyWindowAt, upcomingCny, productionDoneDay, mothersDay, fathersDay, valentinesDay, megaDealDays, backToSchool, giftBump } from './calendar'
export type { CnyWindow } from './calendar'
export { copycatPressure } from './modifiers'
/** Player-facing active events (excludes internal scheduling records). Derive in useMemo, not in a selector. */
export function visibleEvents(s: GameState) {
  return s.events.active.filter(e => !e.data?.internal)
}

registerEventModalHandlers()
