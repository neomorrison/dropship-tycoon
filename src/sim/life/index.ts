// ============================================================================
// LIFE MODULE — needs, activities/time budget, McDoodle's job, apartments,
// gear, skills/XP, staff (hiring & salaries).
// OWNER: sim-life-finance agent. PUBLIC API; keep every export & signature.
// ============================================================================
import type {
  Activity, ActivityKind, GameState, GearState, HomeState, JobSchedule, JobState, PlayerState,
  SkillId, SkillState, StaffState,
} from '../../core/types'

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
export function lifeOnNewGame(_s: GameState): void {}

// ---- lifecycle ----
/** Needs decay, activity progress/completion, shift start/end, sleep. */
export function lifeTickHour(_s: GameState): void {}
export function lifeDayRollover(_s: GameState, _day: number): void {}
/** Staff salaries, morale, candidate refresh, staff automation (VA tickets, media buyer rules, creator output). */
export function staffDayRollover(_s: GameState, _day: number): void {}
export function staffTickHour(_s: GameState): void {}

// ---- activities ----
export interface ActivityDef {
  kind: ActivityKind
  label: string
  /** minutes */
  duration: number
  /** per-hour deltas while doing it */
  energy: number
  hunger: number
  mood: number
  cost: number
  /** can only be done at home (needs the computer / camera) */
  atHome: boolean
  skill?: SkillId
  xp?: number
  description: string
}
export function activityDefs(): Record<ActivityKind, ActivityDef> { return {} as Record<ActivityKind, ActivityDef> }
export function canDoActivity(_s: GameState, _kind: ActivityKind): { ok: boolean; reason?: string } { return { ok: true } }
/** Adds an activity to the queue (or starts it if idle). Returns id or null (with notification) if not allowed. */
export function enqueueActivity(
  _s: GameState,
  _kind: ActivityKind,
  _opts?: { payload?: Activity['payload']; label?: string; durationMin?: number; front?: boolean },
): string | null { return null }
export function cancelActivity(_s: GameState, _activityId: string): void {}
export function clearQueue(_s: GameState): void {}
/** Multiplier on task durations from energy/burnout/computer gear (1 = normal, >1 slower). */
export function productivity(_s: GameState): number { return 1 }

// ---- job ----
export function setSchedule(_s: GameState, _schedule: JobSchedule): void {}
export function callOutSick(_s: GameState): void {}
export function quitJob(_s: GameState): void {}
/** Beg for your job back after quitting/firing (humiliation modal, lower rank). */
export function askForJobBack(_s: GameState): boolean { return false }

// ---- home / gear ----
export function moveApartment(_s: GameState, _tier: number): { ok: boolean; reason?: string } { return { ok: false, reason: 'Not implemented' } }
export function buyGear(_s: GameState, _gearId: string): { ok: boolean; reason?: string } { return { ok: false, reason: 'Not implemented' } }
export function equipGear(_s: GameState, _gearId: string): void {}

// ---- skills ----
export function grantXp(_s: GameState, _skill: SkillId, _xp: number): void {}
export function xpForLevel(level: number): number { return Math.round(100 * Math.pow(level, 1.6)) }

// ---- staff ----
export function hireStaff(_s: GameState, _candidateId: string): { ok: boolean; reason?: string } { return { ok: false, reason: 'Not implemented' } }
export function fireStaff(_s: GameState, _staffId: string): void {}
export function configureStaff(_s: GameState, _staffId: string, _config: Record<string, string | number | boolean>): void {}
export function refreshCandidates(_s: GameState): void {}
