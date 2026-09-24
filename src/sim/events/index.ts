// ============================================================================
// EVENTS MODULE — scheduled & random events (market dynamics, CNY, BFCM,
// viral/organic, influencers, platform drama, chargeback waves), decision
// modals, modifiers, Coach Kev tips, milestones.
// OWNER: sim-market-events agent. PUBLIC API; keep every export & signature.
// ============================================================================
import type { CoachState, EventsState, GameState, Modifiers } from '../../core/types'

export const neutralModifiers = (): Modifiers => ({
  cpmMult: { fadbook: 1, tiktak: 1 }, ctrMult: { fadbook: 1, tiktak: 1 }, cvrMult: 1,
  attributionMult: { fadbook: 1, tiktak: 1 }, dropshipDelayDays: 0, supplierDelayDays: 0, organicBoost: {}, competitionMult: {},
})
export function createEventsState(): EventsState { return { active: [], log: [], cooldowns: {}, modals: [], modifiers: neutralModifiers() } }
export function createCoachState(): CoachState { return { enabled: true, shown: {}, queue: [] } }
export function eventsOnNewGame(_s: GameState): void {}

/** Recompute s.events.modifiers from active events; roll hourly events (viral spikes...). */
export function eventsTickHour(_s: GameState): void {}
/** Schedule/expire events, roll daily random events, CNY warnings, BFCM, etc. */
export function eventsDayRollover(_s: GameState, _day: number): void {}
/** Register handlers for the modal kinds this module creates (called once at import). */
export function registerEventModalHandlers(): void {}
/** Called when the influencer_outreach activity completes. */
export function influencerOutreach(_s: GameState, _storeProductId: string): void {}

// ---- coach ----
export function coachTickHour(_s: GameState): void {}
export function coachDayRollover(_s: GameState, _day: number): void {}
export function dismissCoachTip(_s: GameState, _id: string): void {}
/** On-demand analysis ("Ask Coach Kev"): returns tips about current business state. */
export function askCoach(_s: GameState): string[] { return [] }

// ---- milestones ----
export interface MilestoneDef { id: string; title: string; description: string; icon: string }
export function milestoneDefs(): MilestoneDef[] { return [] }
export function checkMilestones(_s: GameState): void {}
