// McDoodle's day job: schedules, ranks, payroll and HR rules.
// OWNER: sim-life-finance. Wages/withholding come from BENCHMARKS.life (see docs/BENCHMARKS.md §11).
import type { JobRank, JobSchedule } from '../core/types'
import { BENCHMARKS } from './benchmarks'

export interface ScheduleDef {
  id: JobSchedule
  label: string
  /** weekdays worked, 0 = Monday … 6 = Sunday */
  days: number[]
  /** local clock hour the shift starts */
  startHour: number
  hours: number
  weeklyHours: number
  /** "Tue, Thu & Sat · 11:00 AM – 6:00 PM" */
  description: string
  pitch: string
}

export const JOB_SCHEDULES: Record<JobSchedule, ScheduleDef> = {
  part: {
    id: 'part', label: 'Part-time', days: [1, 3, 5], startHour: 11, hours: 7, weeklyHours: 21,
    description: 'Tue, Thu & Sat · 11:00 AM – 6:00 PM',
    pitch: 'Lunch and dinner rush three days a week. Leaves four full days for the business.',
  },
  full: {
    id: 'full', label: 'Full-time', days: [0, 1, 2, 3, 4], startHour: 7, hours: 8, weeklyHours: 40,
    description: 'Mon – Fri · 7:00 AM – 3:00 PM',
    pitch: 'Breakfast shift, 40 hours. Steady money, but your store only gets evenings and weekends.',
  },
  weekends: {
    id: 'weekends', label: 'Weekends only', days: [5, 6], startHour: 10, hours: 8, weeklyHours: 16,
    description: 'Sat & Sun · 10:00 AM – 6:00 PM',
    pitch: 'Two long days. Weekdays are yours — when suppliers and ad reps are actually awake.',
  },
  none: {
    id: 'none', label: 'Not employed', days: [], startHour: 0, hours: 0, weeklyHours: 0,
    description: 'No shifts',
    pitch: 'Full-time founder. No safety net.',
  },
}

export interface RankDef {
  id: JobRank
  title: string
  wage: number
  /** total shifts worked needed to be promoted INTO this rank */
  shiftsRequired: number
  /** reliability needed to be promoted INTO this rank */
  reliabilityRequired: number
  /** schedules the rank may pick */
  schedules: JobSchedule[]
  perks: string[]
}

export const JOB_RANKS: Record<JobRank, RankDef> = {
  crew: {
    id: 'crew', title: 'Crew Member', wage: BENCHMARKS.life.wages.crew, shiftsRequired: 0, reliabilityRequired: 0,
    schedules: ['part', 'full', 'weekends'],
    perks: ['Free crew meal every shift', '50% off food on your days off'],
  },
  shift_lead: {
    id: 'shift_lead', title: 'Shift Lead', wage: BENCHMARKS.life.wages.shiftLead, shiftsRequired: 40, reliabilityRequired: 75,
    schedules: ['part', 'full', 'weekends'],
    perks: ['Run the floor during your shift', 'Keys to the building (and the ice cream machine)'],
  },
  manager: {
    id: 'manager', title: 'Manager', wage: BENCHMARKS.life.wages.manager, shiftsRequired: 120, reliabilityRequired: 85,
    schedules: ['full'],
    perks: ['Salary-track position, full-time only', 'Quarterly bonus eligibility (lol)'],
  },
}
export const RANK_ORDER: JobRank[] = ['crew', 'shift_lead', 'manager']

/** Employee withholding. Total = BENCHMARKS.life.payrollTaxRate (12%): FICA 7.65% + federal income tax. */
export const PAYROLL = {
  socialSecurity: 0.062,
  medicare: 0.0145,
  federal: +(BENCHMARKS.life.payrollTaxRate - 0.062 - 0.0145).toFixed(4),
  /** first biweekly payday: Friday, March 13 2026 (day 11) */
  firstPayday: 11,
  cycleDays: 14,
  /** a pay period ends the Sunday before payday (5 days of payroll processing) */
  periodLagDays: 5,
}

export const JOB_RULES = {
  strikesToFire: 3,
  /** one strike falls off after this many clean days */
  strikeExpiryDays: 60,
  /** call-outs allowed per rolling 30 days before they count as strikes */
  freeCallOuts: 2,
  /** a shift you haven't clocked into after this many minutes is a no-show */
  missAfterMin: 60,
  /** every Nth late clock-in becomes a strike */
  tardiesPerStrike: 3,
  /** minutes late that count as "very late" */
  veryLateMin: 30,
  /** days after being fired before Darnell will even talk to you */
  rehireCooldownDays: 14,
  maxRehires: 2,
  rehireReliability: 60,
  /** schedule changes take effect this many days out (the posted schedule is locked) */
  scheduleNoticeDays: 3,
  /** minimum days between availability changes */
  scheduleChangeCooldownDays: 7,
  /** free crew meal at the midpoint of a 6h+ shift */
  crewMealHunger: 35,
  /** days a declined promotion waits before being offered again */
  promotionReofferDays: 30,
  reliability: { onTime: 0.6, late: -3, veryLate: -6, missed: -12, calloutFree: -1, calloutStrike: -5, sickExcused: 0 },
}

export const MANAGER = {
  name: 'Darnell Hayes',
  first: 'Darnell',
  email: 'darnell.hayes@mcdoodles-crew.com',
  title: "General Manager · McDoodle's #4471",
  portrait: 'p06',
  store: "McDoodle's #4471 — Harbor Blvd",
}

export const PAYROLL_SENDER = { name: "McDoodle's Crew Payroll", email: 'payroll@mcdoodles-crew.com' }
