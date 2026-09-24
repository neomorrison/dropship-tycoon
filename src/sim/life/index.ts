// ============================================================================
// LIFE MODULE — needs, activities/time budget, McDoodle's job, apartments,
// gear, skills/XP, staff (hiring & salaries).
// OWNER: sim-life-finance agent. PUBLIC API; keep every export & signature.
// Implementation lives in the sibling files; this file wires and re-exports.
// ============================================================================
import type {
  Activity, ActivityKind, GameState, GearState, HomeState, JobSchedule, JobState, PlayerState,
  SkillId, SkillState, StaffState,
} from '../../core/types'
import { dayOf } from '../../core/time'
import { grantXp as grantXpImpl, xpForLevel as xpForLevelImpl } from './skills'
import {
  activityDefs as activityDefsImpl, canDoActivity as canDoImpl, cancelActivity as cancelImpl, clearQueue as clearQueueImpl,
  enqueueActivity as enqueueImpl, lifeRunHour,
} from './activities'
import { productivity as productivityImpl, needsDayRollover } from './needs'
import {
  askForJobBack as askImpl, callOutSick as callOutImpl, jobDayRollover, jobOnNewGame, quitJob as quitImpl, setSchedule as setScheduleImpl,
} from './job'
import { moveApartment as moveImpl } from './home'
import { buyGear as buyGearImpl, equipGear as equipImpl } from './gear'
import {
  configureStaff as configureImpl, fireStaff as fireImpl, hireStaff as hireImpl, refreshCandidates as refreshImpl,
  staffDayRollover as staffDayImpl, staffTickHour as staffTickImpl,
} from './staff'
import { ensureLife, send, firstName } from './util'
import type { ActivityDef as ActivityDefT } from './types'

export function createPlayerState(name: string): PlayerState {
  return { name, energy: 85, hunger: 70, mood: 60, location: 'home', activity: null, queue: [], burnoutDays: 0, sickDays: 0, lastSleepHour: 0, awakeHours: 0 }
}
export function createJobState(): JobState {
  return { employed: true, rank: 'crew', hourlyWage: 16, schedule: 'part', shifts: [], shiftsWorked: 0, reliability: 80, strikes: 0, hoursUnpaid: 0, lastPayDay: 0, quitDay: null, firedDay: null, timesRehired: 0 }
}
export function createHomeState(): HomeState { return { tier: 0, rentMonthly: 0, movedInDay: 0, rentDueDay: 30, missedRent: 0 } }
export function createGearState(): GearState { return { owned: ['phone-cracked', 'laptop-old'], equipped: { phone: 'phone-cracked', computer: 'laptop-old' } } }
export function createSkillsState(): Record<SkillId, SkillState> {
  return { research: { level: 1, xp: 0 }, copywriting: { level: 1, xp: 0 }, creative: { level: 1, xp: 0 }, media_buying: { level: 1, xp: 0 }, operations: { level: 1, xp: 0 } }
}
export function createStaffState(): StaffState { return { members: [], candidates: [], lastRefreshDay: -1 } }

/** One-time setup after the full state exists (schedule first shifts, bills, etc.). */
export function lifeOnNewGame(s: GameState): void {
  ensureLife(s)
  if (s.flags.autopilot === undefined) s.flags.autopilot = s.meta.difficulty !== 'realistic'
  s.player.lastSleepHour = s.time.hour
  s.player.awakeHours = 0
  s.player.lastSocialDay = dayOf(s.time.hour)
  s.home.rentDueDay = dayOf(s.time.hour) + 30
  jobOnNewGame(s)
  refreshImpl(s)
  send(s, {
    from: 'Mom', fromEmail: 'linda.homebase@inboxly.com', tag: 'misc', subject: 'Leftovers + a reminder',
    body: [
      `Morning ${firstName(s)}!`,
      '',
      'Dad and I left for work. There\'s lasagna in the fridge — that\'s dinner, not breakfast.',
      '',
      'Darnell called the house phone AGAIN to confirm your shift Tuesday. Please give him your cell number. Also, you said you\'d "look into that online store thing" this week. I\'m not nagging. I\'m encouraging, loudly.',
      '',
      'Don\'t forget to eat, sleep, and see actual humans occasionally.',
      '',
      'Love you,',
      'Mom',
    ].join('\n'),
  })
}

// ---- lifecycle ----
/** Needs decay, activity progress/completion, shift start/end, sleep. */
export function lifeTickHour(s: GameState): void { lifeRunHour(s) }
export function lifeDayRollover(s: GameState, day: number): void {
  ensureLife(s)
  needsDayRollover(s)
  jobDayRollover(s, day)
  // (media-buying XP from ad spend is granted by the ads module as spend accrues)
}
/** Staff salaries, morale, candidate refresh, staff automation (VA tickets, media buyer rules, creator output). */
export function staffDayRollover(s: GameState, day: number): void { staffDayImpl(s, day) }
export function staffTickHour(s: GameState): void { staffTickImpl(s) }

// ---- activities ----
export type ActivityDef = ActivityDefT
export function activityDefs(): Record<ActivityKind, ActivityDef> { return activityDefsImpl() }
export function canDoActivity(s: GameState, kind: ActivityKind): { ok: boolean; reason?: string } { return canDoImpl(s, kind) }
/** Adds an activity to the queue (or starts it if idle). Returns id or null (with notification) if not allowed. */
export function enqueueActivity(
  s: GameState,
  kind: ActivityKind,
  opts?: { payload?: Activity['payload']; label?: string; durationMin?: number; front?: boolean },
): string | null { return enqueueImpl(s, kind, opts) }
export function cancelActivity(s: GameState, activityId: string): void { cancelImpl(s, activityId) }
export function clearQueue(s: GameState): void { clearQueueImpl(s) }
/** Multiplier on task durations from energy/burnout/computer gear (1 = normal, >1 slower). */
export function productivity(s: GameState): number { return productivityImpl(s) }

// ---- job ----
export function setSchedule(s: GameState, schedule: JobSchedule): void { setScheduleImpl(s, schedule) }
export function callOutSick(s: GameState): void { callOutImpl(s) }
/** Opens a confirmation modal; quitting happens when the player confirms (see quitJobNow). */
export function quitJob(s: GameState): void { quitImpl(s) }
/** Beg for your job back after quitting/firing (humiliation modal, lower rank). */
export function askForJobBack(s: GameState): boolean { return askImpl(s) }

// ---- home / gear ----
export function moveApartment(s: GameState, tier: number): { ok: boolean; reason?: string } { return moveImpl(s, tier) }
export function buyGear(s: GameState, gearId: string, opts?: { payWith?: 'bank' | 'card' }): { ok: boolean; reason?: string } { return buyGearImpl(s, gearId, opts) }
export function equipGear(s: GameState, gearId: string): void { equipImpl(s, gearId) }

// ---- skills ----
export function grantXp(s: GameState, skill: SkillId, xp: number): void { grantXpImpl(s, skill, xp) }
export function xpForLevel(level: number): number { return xpForLevelImpl(level) }

// ---- staff ----
export function hireStaff(s: GameState, candidateId: string): { ok: boolean; reason?: string } { return hireImpl(s, candidateId) }
export function fireStaff(s: GameState, staffId: string): void { fireImpl(s, staffId) }
export function configureStaff(s: GameState, staffId: string, config: Record<string, string | number | boolean>): void { configureImpl(s, staffId, config) }
export function refreshCandidates(s: GameState): void { refreshImpl(s) }

// ---- additional exports (UIs & other modules) ----
export { setAutopilot, isAutopilot } from './autopilot'
export { activityDuration, autopilotChoice, estimatedWakeHour, startNextActivity } from './activities'
export { moodBaseline, moodFactors, makeSick, needsWarnings, sleepRegenPerHour, NEEDS, type MoodFactor } from './needs'
export {
  currentShift, pendingShift, nextShift, upcomingShifts, minutesUntilNextShift, callOutsRemaining, promotionProgress,
  nextPayday, isPayday, unpaidGross, quitJobNow, ensureSchedule, shiftStartAbs, type PromotionProgress,
} from './job'
export { apartmentEligibility, income30, type Eligibility } from './home'
export {
  computerProductivity, filmQualityBonus, filmTimeMult, editQualityBonus, selfShotQuality, ownsGear, unequipGear, gearCatalog,
  type SelfShotBreakdown,
} from './gear'
export { SKILL_INFO, SKILL_IDS, MAX_SKILL_LEVEL, skillLevel, skillProgress, hasSkillLevel, ticketsPerSupportSession, disputeEvidenceBonus, type SkillInfo } from './skills'
export {
  designerBonus, designerLoadTimeCut, hasCopywriter, copywriterSkill, copywriterQuality, opsBulkDiscountPct, staffByRole,
  weeklyPayroll, vaDailyCapacity, ugcWeeklyQuota, ugcQuality,
} from './staff'
