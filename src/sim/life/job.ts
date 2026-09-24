// McDoodle's: schedule generation, auto-commute, lateness/no-shows/strikes, payroll & pay stubs,
// call-outs, promotions, quitting, getting fired and begging for the job back. SPEC §3 "Job".
import type { Activity, GameState, JobRank, JobSchedule, PayStub, Shift } from '../../core/types'
import { receive } from '../../core/money'
import { notify } from '../../core/notify'
import { pushModal, registerModalHandler } from '../../core/modals'
import { formatDate, hourOfDay, weekday, weekdayName } from '../../core/time'
import { uid } from '../../core/ids'
import { chance, clamp, randInt } from '../../core/rng'
import { JOB_RANKS, JOB_RULES, JOB_SCHEDULES, MANAGER, PAYROLL, PAYROLL_SENDER } from '../../data/job'
import { ACTIVITY_DEFS } from '../../data/activities'
import { autopilotOn, clock, ensureLife, firstName, hourLabel, nowHour, round2, send, today, usd } from './util'
import { interruptActivity } from './activities'
import { roomImage } from '../../core/assets'

const DARNELL = { from: MANAGER.name, fromEmail: MANAGER.email, tag: 'job' as const, site: 'mcdoodles' as const }
const sign = '— Darnell\nGeneral Manager, McDoodle\'s #4471'

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------
export const shiftStartAbs = (sh: Shift) => sh.day * 24 + sh.startHour
export const currentShift = (s: GameState): Shift | null => s.job.shifts.find(sh => sh.status === 'in_progress') ?? null
export const pendingShift = (s: GameState): Shift | null =>
  s.job.shifts.find(sh => sh.status === 'scheduled' && sh.pendingSince !== undefined) ?? null

/** Next shift that hasn't started yet (or is waiting for you to clock in). */
export function nextShift(s: GameState): Shift | null {
  const now = nowHour(s)
  let best: Shift | null = null
  for (const sh of s.job.shifts) {
    if (sh.status !== 'scheduled') continue
    if (sh.pendingSince === undefined && shiftStartAbs(sh) < now) continue
    if (!best || shiftStartAbs(sh) < shiftStartAbs(best)) best = sh
  }
  return best
}
/** Minutes from now until the next shift starts (0 if one is waiting), or null. */
export function minutesUntilNextShift(s: GameState): number | null {
  const sh = nextShift(s)
  if (!sh) return null
  if (sh.pendingSince !== undefined) return 0
  return (shiftStartAbs(sh) - nowHour(s)) * 60
}
export function upcomingShifts(s: GameState, days = 14): Shift[] {
  const t = today(s)
  return s.job.shifts.filter(sh => sh.day >= t && sh.day < t + days).sort((a, b) => shiftStartAbs(a) - shiftStartAbs(b))
}
export function callOutsRemaining(s: GameState): number {
  const t = today(s)
  const used = (s.job.callOutDays ?? []).filter(d => t - d < 30).length
  return Math.max(0, JOB_RULES.freeCallOuts - used)
}
export function isPayday(day: number): boolean {
  return day >= PAYROLL.firstPayday && (day - PAYROLL.firstPayday) % PAYROLL.cycleDays === 0
}
export function nextPayday(s: GameState): number {
  let d = Math.max(today(s), PAYROLL.firstPayday)
  while (!isPayday(d)) d++
  return d
}
/** Gross pay earned but not yet paid (hours × rate). */
export function unpaidGross(s: GameState): number {
  return round2(s.job.shifts.reduce((a, sh) => a + (!sh.paid && sh.hoursWorked ? sh.hoursWorked * (sh.rate ?? s.job.hourlyWage) : 0), 0))
}
export interface PromotionProgress { next: JobRank | null; title: string | null; shifts: number; shiftsNeeded: number; reliability: number; reliabilityNeeded: number; ready: boolean }
export function promotionProgress(s: GameState): PromotionProgress {
  const j = s.job
  const next: JobRank | null = j.rank === 'crew' ? 'shift_lead' : j.rank === 'shift_lead' ? 'manager' : null
  if (!next) return { next: null, title: null, shifts: j.shiftsWorked, shiftsNeeded: 0, reliability: j.reliability, reliabilityNeeded: 0, ready: false }
  const r = JOB_RANKS[next]
  return {
    next, title: r.title, shifts: j.shiftsWorked, shiftsNeeded: r.shiftsRequired, reliability: j.reliability,
    reliabilityNeeded: r.reliabilityRequired, ready: j.employed && j.shiftsWorked >= r.shiftsRequired && j.reliability >= r.reliabilityRequired,
  }
}

// ---------------------------------------------------------------------------
// schedule
// ---------------------------------------------------------------------------
/** Keep 14 days of shifts posted; prune history older than 60 days. */
export function ensureSchedule(s: GameState): void {
  const j = s.job
  const t = today(s)
  j.shifts = j.shifts.filter(sh => sh.day >= t - 60)
  if (!j.employed || j.schedule === 'none') return
  const def = JOB_SCHEDULES[j.schedule]
  const from = Math.max(t, Number(s.flags['job.scheduleFrom'] ?? 0))
  for (let d = from; d < t + 14; d++) {
    if (!def.days.includes(weekday(d))) continue
    if (j.shifts.some(sh => sh.day === d)) continue
    if (d === t && def.startHour <= clock(s)) continue
    j.shifts.push({ day: d, startHour: def.startHour, hours: def.hours, status: 'scheduled' })
  }
  j.shifts.sort((a, b) => shiftStartAbs(a) - shiftStartAbs(b))
}

function dropFutureShifts(s: GameState, fromDay: number) {
  s.job.shifts = s.job.shifts.filter(sh => !(sh.status === 'scheduled' && sh.day >= fromDay))
}

export function setSchedule(s: GameState, schedule: JobSchedule): void {
  ensureLife(s)
  const j = s.job
  if (!j.employed) { notify(s, { kind: 'warning', title: 'You don\'t work at McDoodle\'s right now', body: 'Ask Darnell for your job back first.', site: 'mcdoodles' }); return }
  if (schedule === 'none') { notify(s, { kind: 'warning', title: 'Can\'t drop all your shifts', body: 'If you want out, quit the job instead.', site: 'mcdoodles' }); return }
  if (schedule === j.schedule) return
  if (!JOB_RANKS[j.rank].schedules.includes(schedule)) {
    notify(s, { kind: 'warning', title: 'Managers work full-time', body: 'Your role is full-time only (Mon–Fri, 7 AM–3 PM).', site: 'mcdoodles' })
    return
  }
  const last = s.flags['job.scheduleChangedDay']
  if (typeof last === 'number' && today(s) - last < JOB_RULES.scheduleChangeCooldownDays) {
    notify(s, { kind: 'warning', title: 'Darnell said no', body: `"You just changed your availability. Give it a week." You can ask again on ${formatDate(last + JOB_RULES.scheduleChangeCooldownDays, 'md')}.`, site: 'mcdoodles' })
    return
  }
  applySchedule(s, schedule, JOB_RULES.scheduleNoticeDays)
  s.flags['job.scheduleChangedDay'] = today(s)
  const def = JOB_SCHEDULES[schedule]
  const eff = today(s) + JOB_RULES.scheduleNoticeDays
  send(s, {
    ...DARNELL, path: 'schedule',
    subject: `Availability change: ${def.label}`,
    body: [
      `Hey ${firstName(s)},`,
      '',
      `Got your availability change. Starting ${formatDate(eff, 'long')} you're on ${def.label.toLowerCase()}: ${def.description}.`,
      'Anything already posted before then stays as-is — the schedule is locked three days out, no exceptions, not even for me.',
      '',
      sign,
    ].join('\n'),
  })
  notify(s, { kind: 'info', title: `Schedule changed to ${def.label}`, body: `Starts ${formatDate(eff, 'md')} · ${def.description}`, site: 'mcdoodles', path: 'schedule' })
}

function applySchedule(s: GameState, schedule: JobSchedule, noticeDays: number) {
  const from = today(s) + noticeDays
  s.job.schedule = schedule
  dropFutureShifts(s, from)
  s.flags['job.scheduleFrom'] = from
  ensureSchedule(s)
}

// ---------------------------------------------------------------------------
// hourly: shift starts, no-shows
// ---------------------------------------------------------------------------
/** Called at the top of each hour after the minute simulation. */
export function jobHourEvents(s: GameState): void {
  const now = nowHour(s)
  const pend = pendingShift(s)
  if (pend && now - (pend.pendingSince ?? now) >= JOB_RULES.missAfterMin / 60) missShift(s, pend, 'no_show')
  if (!s.job.employed) return
  const t = today(s)
  const h = clock(s)
  const sh = s.job.shifts.find(x => x.day === t && x.startHour === h && x.status === 'scheduled' && x.pendingSince === undefined)
  if (sh) beginShift(s, sh)
}

function beginShift(s: GameState, sh: Shift) {
  const p = s.player
  const a = p.activity
  if (!a) return clockIn(s, sh, 0)
  if (a.kind === 'work_shift') return
  const forced = a.kind === 'sleep' && !!a.payload?.forced
  if (a.kind === 'sleep' && !forced && autopilotOn(s)) {
    // alarm: well-rested players get up; exhausted ones may hit snooze
    const wakeP = clamp(p.energy / 35, 0.25, 1)
    if (chance(s, wakeP)) {
      wake(s)
      notify(s, { kind: 'info', title: '⏰ Alarm — up for work', body: `Shift starts ${hourLabel(sh.startHour)}. Autopilot got you out of bed.`, site: 'mcdoodles' })
      return clockIn(s, sh, 0)
    }
    const snooze = randInt(s, 15, 75)
    a.durationMin = Math.max(a.durationMin, a.durationMin - a.remainingMin + snooze)
    a.remainingMin = snooze
    a.payload = { ...(a.payload ?? {}), snoozed: true }
    sh.pendingSince = nowHour(s)
    notify(s, { kind: 'warning', title: 'You hit snooze… 😴', body: `Your ${hourLabel(sh.startHour)} shift already started. Too exhausted to get up — you'll be late.`, site: 'mcdoodles' })
    return
  }
  const def = ACTIVITY_DEFS[a.kind]
  if (a.kind !== 'sleep' && def.interruptible !== false) {
    interruptActivity(s, a)
    return clockIn(s, sh, 0)
  }
  sh.pendingSince = nowHour(s)
  const what = a.kind === 'sleep' ? (forced ? 'passed out' : 'asleep') : `busy (${a.label.toLowerCase()})`
  notify(s, {
    kind: 'critical', title: 'Your shift started!',
    body: `McDoodle's shift at ${hourLabel(sh.startHour)} — you're still ${what}. Clock in within the hour or it's a no-show (strike).`,
    site: 'mcdoodles',
  })
}

function wake(s: GameState) {
  const p = s.player
  p.activity = null
  p.awakeHours = 0
  p.lastSleepHour = nowHour(s)
}

/** Player became free while a shift was waiting: clock in late. `minutesInto` = minutes into the simulated hour. */
export function tryStartPendingShift(s: GameState, minutesInto: number): boolean {
  const sh = pendingShift(s)
  if (!sh || s.player.activity) return false
  const late = (nowHour(s) - 1 - (sh.pendingSince ?? nowHour(s))) * 60 + minutesInto
  if (late >= JOB_RULES.missAfterMin) { missShift(s, sh, 'no_show'); return false }
  clockIn(s, sh, Math.max(1, late))
  return true
}

/** Player cancelled whatever blocked them between ticks: go now (≈15 min into the hour). */
export function clockInPendingNow(s: GameState): boolean {
  const sh = pendingShift(s)
  if (!sh || s.player.activity) return false
  const late = (nowHour(s) - (sh.pendingSince ?? nowHour(s))) * 60 + 15
  if (late >= JOB_RULES.missAfterMin) { missShift(s, sh, 'no_show'); return false }
  clockIn(s, sh, late)
  return true
}

function clockIn(s: GameState, sh: Shift, lateMin: number) {
  const j = s.job
  const p = s.player
  const total = sh.hours * 60
  sh.status = 'in_progress'
  sh.lateMin = Math.round(lateMin)
  sh.rate = j.hourlyWage
  delete sh.pendingSince
  p.activity = {
    id: uid(s, 'act'), kind: 'work_shift', label: `Shift at McDoodle's · ${JOB_RANKS[j.rank].title}`,
    durationMin: total, remainingMin: Math.max(0, total - lateMin), startedHour: nowHour(s),
    payload: { shiftDay: sh.day, startHour: sh.startHour, lateMin: Math.round(lateMin) },
  }
  p.location = 'work'
  if (lateMin > 5) tardy(s, sh, Math.round(lateMin))
}

function tardy(s: GameState, sh: Shift, lateMin: number) {
  const j = s.job
  j.lateCount = (j.lateCount ?? 0) + 1
  j.reliability = clamp(j.reliability + (lateMin > JOB_RULES.veryLateMin ? JOB_RULES.reliability.veryLate : JOB_RULES.reliability.late), 0, 100)
  if (j.lateCount % JOB_RULES.tardiesPerStrike === 0) {
    addStrike(s, `${JOB_RULES.tardiesPerStrike} late clock-ins`, `You clocked in ${lateMin} minutes late today. That's late number ${j.lateCount}, and every third one is a strike.`)
  } else {
    notify(s, { kind: 'warning', title: `Clocked in ${lateMin} min late`, body: `Reliability ${Math.round(j.reliability)}. Every ${JOB_RULES.tardiesPerStrike}rd late clock-in is a strike.`, site: 'mcdoodles' })
  }
}

/** Shift activity finished normally. */
export function completeShift(s: GameState, a: Activity) {
  const j = s.job
  const sh = findShiftFor(s, a)
  const lateMin = Number(a.payload?.lateMin ?? 0)
  const worked = round2(Math.max(0, a.durationMin - lateMin - Math.max(0, a.remainingMin)) / 60)
  if (sh) {
    sh.status = 'worked'
    sh.hoursWorked = worked
    sh.rate ??= j.hourlyWage
  }
  j.shiftsWorked += 1
  j.hoursUnpaid = round2(j.hoursUnpaid + worked)
  if (!lateMin) j.reliability = clamp(j.reliability + JOB_RULES.reliability.onTime, 0, 100)
  s.player.location = 'home'
}

/** End a shift early (passed out / quit / fired). Pays hours worked. */
export function abortShift(s: GameState, reason: 'passed_out' | 'quit' | 'fired') {
  const p = s.player
  const a = p.activity
  if (!a || a.kind !== 'work_shift') return
  const j = s.job
  const sh = findShiftFor(s, a)
  const lateMin = Number(a.payload?.lateMin ?? 0)
  const worked = round2(Math.max(0, a.durationMin - lateMin - a.remainingMin) / 60)
  if (sh) {
    sh.hoursWorked = worked
    sh.rate ??= j.hourlyWage
    sh.status = worked >= 0.25 ? 'worked' : 'missed'
  }
  if (worked >= (a.durationMin / 60) / 2) j.shiftsWorked += 1
  j.hoursUnpaid = round2(j.hoursUnpaid + worked)
  p.activity = null
  p.location = 'home'
  if (reason === 'passed_out') {
    j.reliability = clamp(j.reliability + JOB_RULES.reliability.missed, 0, 100)
    addStrike(s, 'Collapsed on shift', `You passed out in the middle of ${restaurantMoment(s)}. Tanya had to call your mom. I need people who show up rested — ${worked.toFixed(1)} hours worked today.`)
  }
}

/** "the lunch rush" / "the dinner rush" …: what the restaurant is like right now (flavor text). */
function restaurantMoment(s: GameState): string {
  const h = hourOfDay(s.time.hour)
  if (h >= 6 && h < 10) return 'the breakfast rush'
  if (h >= 11 && h < 14) return 'the lunch rush'
  if (h >= 17 && h < 20) return 'the dinner rush'
  if (h >= 22 || h < 6) return 'the late-night drive-thru shift'
  return 'a slow stretch between rushes'
}

function findShiftFor(s: GameState, a: Activity): Shift | undefined {
  const d = Number(a.payload?.shiftDay)
  const h = Number(a.payload?.startHour)
  return s.job.shifts.find(sh => sh.day === d && sh.startHour === h && (sh.status === 'in_progress' || sh.status === 'scheduled'))
}

export function missShift(s: GameState, sh: Shift, why: 'no_show' | 'passed_out') {
  const j = s.job
  sh.status = 'missed'
  delete sh.pendingSince
  j.reliability = clamp(j.reliability + JOB_RULES.reliability.missed, 0, 100)
  const detail = why === 'passed_out'
    ? `You didn't show for your ${hourLabel(sh.startHour)} shift ${weekdayName(sh.day, true)}. Your mom says you were out cold. I get it, but the fryers don't run themselves.`
    : `You were on the schedule ${weekdayName(sh.day, true)} at ${hourLabel(sh.startHour)}. No call, no text, nothing. We ran the drive-thru short-handed for ${sh.hours} hours.`
  addStrike(s, 'No-show', detail)
}

/** Add a strike (with Darnell's email). 3 strikes = fired. */
export function addStrike(s: GameState, reason: string, detail: string) {
  const j = s.job
  if (!j.employed) return
  j.strikes += 1
  j.lastStrikeDay = today(s)
  if (j.strikes >= JOB_RULES.strikesToFire) { fireFromJob(s, reason, detail); return }
  notify(s, { kind: 'critical', title: `Strike ${j.strikes} of ${JOB_RULES.strikesToFire}: ${reason}`, body: `Reliability ${Math.round(j.reliability)}. Three strikes and you're out.`, site: 'mcdoodles' })
  send(s, {
    ...DARNELL, subject: `Strike ${j.strikes} — ${reason}`,
    body: [
      `${firstName(s)},`,
      '',
      detail,
      '',
      `That's strike ${j.strikes} of ${JOB_RULES.strikesToFire}. ${j.strikes === JOB_RULES.strikesToFire - 1 ? 'One more and I have to let you go. I don\'t want to, so don\'t make me.' : 'Strikes come off after 60 clean days. Let\'s get there.'}`,
      '',
      sign,
    ].join('\n'),
  })
}

function fireFromJob(s: GameState, reason: string, detail: string) {
  const j = s.job
  if (s.player.activity?.kind === 'work_shift') abortShift(s, 'fired')
  j.employed = false
  j.firedDay = today(s)
  j.schedule = 'none'
  dropFutureShifts(s, today(s))
  const owed = unpaidGross(s)
  pushModal(s, {
    kind: 'job_fired', title: 'You\'re fired.',
    image: roomImage('mcdoodles'),
    body: `Darnell calls you into the office that smells like fryer oil. "${reason}. That's three strikes. I'm sorry, ${firstName(s)} — turn in your visor."\n\nYour last paycheck${owed > 0 ? ` (${usd(owed)} gross)` : ''} arrives on the next payday. From here on, rent and bills come out of the business.`,
    choices: [{ id: 'ok', label: 'Clean out my locker', tone: 'default' }],
  })
  notify(s, { kind: 'critical', title: 'Fired from McDoodle\'s', body: `${reason}. Final pay on ${formatDate(nextPayday(s), 'md')}.`, site: 'mcdoodles' })
  send(s, {
    ...DARNELL, subject: 'Separation notice',
    body: [
      `${firstName(s)},`,
      '',
      detail,
      '',
      `That makes three strikes, so your employment with McDoodle's #4471 ends today. Your final paycheck for hours already worked will be direct-deposited on ${formatDate(nextPayday(s), 'long')}, with a pay stub like always.`,
      '',
      'For what it\'s worth, you were good on the register. Figure out whatever you\'ve got going on.',
      '',
      sign,
    ].join('\n'),
  })
  send(s, {
    from: 'Mom', fromEmail: 'linda.homebase@inboxly.com', tag: 'misc', subject: 'Darnell called the house',
    body: [
      'Sweetie,',
      '',
      'Darnell called the landline looking for you. I heard. I\'m not mad — okay, I\'m a little mad — but mostly I\'m worried about how you\'re going to pay for things.',
      '',
      'If this online store is the plan, then make it a real plan. Dad says to write down every dollar in and out. He\'s annoying but he\'s right.',
      '',
      'Love you,',
      'Mom',
    ].join('\n'),
  })
}

// ---------------------------------------------------------------------------
// call out / quit / rehire
// ---------------------------------------------------------------------------
export function callOutSick(s: GameState): void {
  ensureLife(s)
  const j = s.job
  if (!j.employed) { notify(s, { kind: 'info', title: 'No job to call out of', site: 'mcdoodles' }); return }
  if (currentShift(s)) { notify(s, { kind: 'warning', title: 'You\'re already on the clock', body: 'Tough it out — the shift ends soon.', site: 'mcdoodles' }); return }
  const now = nowHour(s)
  const target = pendingShift(s) ?? j.shifts.find(sh => sh.status === 'scheduled' && shiftStartAbs(sh) >= now && shiftStartAbs(sh) - now <= 24)
  if (!target) { notify(s, { kind: 'info', title: 'Nothing to call out of', body: 'You can only call out of a shift in the next 24 hours.', site: 'mcdoodles' }); return }
  const excused = s.player.sickDays > 0
  const free = callOutsRemaining(s) > 0
  target.status = 'called_out'
  delete target.pendingSince
  ;(j.callOutDays ??= []).push(today(s))
  const when = `${weekdayName(target.day, true)} ${hourLabel(target.startHour)}`
  if (excused) {
    notify(s, { kind: 'info', title: 'Called out sick (excused)', body: `${when} shift covered. You're genuinely sick — no strike.`, site: 'mcdoodles' })
    send(s, { ...DARNELL, subject: 'Re: can\'t make it', body: `Feel better. Tanya's covering your ${when} shift. Bring a doctor's note next time you're in and we're square.\n\n${sign}` })
    return
  }
  if (free) {
    j.reliability = clamp(j.reliability + JOB_RULES.reliability.calloutFree, 0, 100)
    const left = callOutsRemaining(s)
    notify(s, { kind: 'info', title: 'Called out sick', body: `${when} shift covered. ${left} free call-out${left === 1 ? '' : 's'} left this month.`, site: 'mcdoodles' })
    send(s, { ...DARNELL, subject: 'Re: can\'t make it', body: `Okay. I'll find someone for ${when}. Heads up: that's ${JOB_RULES.freeCallOuts - left} this month — after ${JOB_RULES.freeCallOuts} in 30 days, call-outs count as strikes.\n\n${sign}` })
    return
  }
  j.reliability = clamp(j.reliability + JOB_RULES.reliability.calloutStrike, 0, 100)
  addStrike(s, 'Too many call-outs', `That's your third call-out in 30 days (${when}). I believe you're "sick." I also believe I've seen your store's ads on my phone at 2 PM on a Tuesday.`)
}

export function quitJob(s: GameState): void {
  const j = s.job
  if (!j.employed) { notify(s, { kind: 'info', title: 'You already left McDoodle\'s', site: 'mcdoodles' }); return }
  if (s.events.modals.some(m => m.kind === 'job_quit_confirm')) return
  const weekly = JOB_SCHEDULES[j.schedule].weeklyHours * j.hourlyWage * (1 - (PAYROLL.socialSecurity + PAYROLL.medicare + PAYROLL.federal))
  pushModal(s, {
    kind: 'job_quit_confirm', title: 'Quit McDoodle\'s?',
    image: roomImage('mcdoodles'),
    body: `You'd give up about ${usd(weekly, false)}/week after taxes — the money that currently covers your bills when the store doesn't. Most dropshippers quit too early and end up financing ads on a 28% credit card.\n\nQuitting is immediate. Unpaid hours still arrive on the next payday.`,
    choices: [
      { id: 'quit', label: 'Hand in my visor', tone: 'critical' },
      { id: 'stay', label: 'Never mind, I\'ll stay', tone: 'primary' },
    ],
  })
}

/** Quit immediately (UIs that already confirmed with their own dialog). */
export function quitJobNow(s: GameState): void {
  ensureLife(s)
  const j = s.job
  if (!j.employed) return
  if (s.player.activity?.kind === 'work_shift') abortShift(s, 'quit')
  const p = pendingShift(s)
  if (p) delete p.pendingSince
  j.employed = false
  j.quitDay = today(s)
  j.schedule = 'none'
  dropFutureShifts(s, today(s))
  s.player.mood = Math.min(100, s.player.mood + 10)
  notify(s, { kind: 'success', title: 'You quit McDoodle\'s 🫡', body: `No more shifts. Final pay (${usd(unpaidGross(s))} gross) lands ${formatDate(nextPayday(s), 'md')}. The business is your job now.`, site: 'mcdoodles' })
  send(s, {
    ...DARNELL, subject: 'Re: two weeks\' notice (lol)',
    body: [
      `${firstName(s)},`,
      '',
      'Most people give two weeks. You gave me a text. Fine.',
      `Your last check for hours already worked goes out ${formatDate(nextPayday(s), 'long')}, same as always.`,
      '',
      'Honestly? Go build your thing. If it doesn\'t work out… we\'re always hiring. We are literally always hiring.',
      '',
      sign,
    ].join('\n'),
  })
  send(s, {
    from: 'Mom', fromEmail: 'linda.homebase@inboxly.com', tag: 'misc', subject: 'You QUIT?',
    body: [
      'Honey.',
      '',
      'Your father read me your text out loud twice. I support you. I also need you to tell me you have a plan for your phone bill, your card, and food that isn\'t my leftovers.',
      '',
      'Proud of you for being brave. Please also be smart.',
      '',
      'Love,',
      'Mom',
    ].join('\n'),
  })
}

/** Beg for the job back (humiliation modal). Returns false if Darnell won't consider it. */
export function askForJobBack(s: GameState): boolean {
  ensureLife(s)
  const j = s.job
  if (j.employed) { notify(s, { kind: 'info', title: 'You still work here', site: 'mcdoodles' }); return false }
  if (j.timesRehired >= JOB_RULES.maxRehires) {
    notify(s, { kind: 'critical', title: 'Darnell won\'t take you back', body: '"I\'ve rehired you twice. I can\'t do it a third time. Good luck, genuinely."', site: 'mcdoodles' })
    return false
  }
  if (j.firedDay !== null && today(s) - j.firedDay < JOB_RULES.rehireCooldownDays) {
    notify(s, { kind: 'warning', title: 'Too soon', body: `Darnell isn't ready to talk. Try again after ${formatDate(j.firedDay + JOB_RULES.rehireCooldownDays, 'md')}.`, site: 'mcdoodles' })
    return false
  }
  if (s.events.modals.some(m => m.kind === 'job_rehire')) return true
  const why = j.firedDay !== null ? 'three strikes' : 'that dramatic exit'
  pushModal(s, {
    kind: 'job_rehire', title: 'Back at the counter',
    image: roomImage('mcdoodles'),
    body: `You walk in during ${restaurantMoment(s)}. The new kid on register recognizes you from your ${j.quitDay !== null ? 'goodbye TikTak' : 'last shift'}. Darnell looks at you for a long time.\n\n"After ${why}? …Fine. Part-time crew, back to $${JOB_RANKS.crew.wage.toFixed(2)}. Your reliability starts at ${JOB_RULES.rehireReliability}, and you're mopping the lobby first. Deal?"`,
    choices: [
      { id: 'accept', label: '"Thank you, Darnell. It won\'t happen again."', tone: 'primary' },
      { id: 'leave', label: 'Keep your dignity and walk out', tone: 'default' },
    ],
  })
  return true
}

function rehire(s: GameState) {
  const j = s.job
  j.employed = true
  j.rank = 'crew'
  j.hourlyWage = JOB_RANKS.crew.wage
  j.reliability = JOB_RULES.rehireReliability
  j.strikes = 0
  j.lastStrikeDay = null
  j.lateCount = 0
  j.timesRehired += 1
  j.quitDay = null
  j.firedDay = null
  j.promotionDeclinedDay = null
  s.player.mood = Math.max(0, s.player.mood - 8)
  applySchedule(s, 'part', 1)
  const first = nextShift(s)
  notify(s, { kind: 'info', title: 'Rehired at McDoodle\'s', body: `Part-time crew, $${JOB_RANKS.crew.wage}/h.${first ? ` First shift ${weekdayName(first.day)} ${hourLabel(first.startHour)}.` : ''}`, site: 'mcdoodles', path: 'schedule' })
  send(s, {
    ...DARNELL, path: 'schedule', subject: 'Welcome back (don\'t make it weird)',
    body: [
      `${firstName(s)},`,
      '',
      `You're back on the schedule: ${JOB_SCHEDULES.part.description}.${first ? ` First shift is ${formatDate(first.day, 'long')}.` : ''}`,
      'Clean slate on strikes. Reliability starts at 60, so earn it back. Your old locker is taken; you get the one by the freezer.',
      '',
      sign,
    ].join('\n'),
  })
  send(s, {
    from: 'Mom', fromEmail: 'linda.homebase@inboxly.com', tag: 'misc', subject: 'Proud of you',
    body: 'Going back took guts. Swallowing your pride is a grown-up skill. Keep working on your store in the evenings — steady money buys you time.\n\nLove,\nMom',
  })
}

function promote(s: GameState, rank: JobRank) {
  const j = s.job
  const r = JOB_RANKS[rank]
  const old = j.hourlyWage
  j.rank = rank
  j.hourlyWage = r.wage
  if (!r.schedules.includes(j.schedule)) applySchedule(s, r.schedules[0], 1)
  notify(s, { kind: 'success', title: `Promoted to ${r.title}! 🎉`, body: `$${old.toFixed(2)} → $${r.wage.toFixed(2)}/h, starting this shift.`, site: 'mcdoodles' })
  send(s, {
    ...DARNELL, subject: `Congrats — ${r.title}`,
    body: [
      `${firstName(s)},`,
      '',
      `${j.shiftsWorked} shifts, reliability ${Math.round(j.reliability)}. You show up and you don't panic when the drive-thru line wraps around the building. You're now a ${r.title} at $${r.wage.toFixed(2)}/hour.`,
      rank === 'shift_lead' ? 'You get keys, you count drawers at close, and yes, you\'re now the person who has to fix the ice cream machine.' : 'Welcome to management. The schedule is yours to build now. I\'m sorry in advance.',
      '',
      sign,
    ].join('\n'),
  })
  send(s, { from: 'Mom', fromEmail: 'linda.homebase@inboxly.com', tag: 'misc', subject: 'A PROMOTION!', body: `Dad already told the neighbors. ${r.title}! Put the raise toward your card, not more gadgets.\n\nSo proud,\nMom` })
}

// ---------------------------------------------------------------------------
// daily: payroll, promotions, strike expiry
// ---------------------------------------------------------------------------
export function jobDayRollover(s: GameState, day: number): void {
  ensureLife(s)
  const j = s.job
  ensureSchedule(s)
  if (isPayday(day)) runPayroll(s, day)
  // strike expiry
  if (j.strikes > 0 && j.lastStrikeDay !== null && j.lastStrikeDay !== undefined && day - j.lastStrikeDay >= JOB_RULES.strikeExpiryDays) {
    j.strikes -= 1
    j.lastStrikeDay = day
    notify(s, { kind: 'success', title: 'A strike came off your record', body: `${j.strikes} strike${j.strikes === 1 ? '' : 's'} left at McDoodle's.`, site: 'mcdoodles' })
  }
  j.callOutDays = (j.callOutDays ?? []).filter(d => day - d < 60)
  if (!j.employed) return
  // promotions
  if (j.rank === 'crew' && j.shiftsWorked >= JOB_RANKS.shift_lead.shiftsRequired && j.reliability >= JOB_RANKS.shift_lead.reliabilityRequired) {
    promote(s, 'shift_lead')
  } else if (
    j.rank === 'shift_lead' && j.shiftsWorked >= JOB_RANKS.manager.shiftsRequired && j.reliability >= JOB_RANKS.manager.reliabilityRequired &&
    (j.promotionDeclinedDay === null || j.promotionDeclinedDay === undefined || day - j.promotionDeclinedDay >= JOB_RULES.promotionReofferDays)
  ) {
    j.promotionDeclinedDay = day // marks "offered"; cleared on accept
    pushModal(s, {
      kind: 'job_promotion_offer', title: 'Darnell wants you in management',
      image: roomImage('mcdoodles'),
      body: `"Corporate approved another manager slot and I want it to be you. $${JOB_RANKS.manager.wage.toFixed(2)} an hour — but it's full-time, Monday to Friday, 7 to 3. No more picking your days."\n\nThat's about ${usd(JOB_RANKS.manager.wage * 40 * 0.88, false)}/week after taxes, and 40 hours your store won't get.`,
      choices: [
        { id: 'accept', label: `Accept — $${JOB_RANKS.manager.wage}/h, full-time`, tone: 'primary' },
        { id: 'decline', label: 'Decline — keep my schedule', tone: 'default' },
      ],
    })
  }
}

function runPayroll(s: GameState, day: number) {
  const j = s.job
  const periodEnd = day - PAYROLL.periodLagDays
  const periodStart = periodEnd - PAYROLL.cycleDays + 1
  const due = j.shifts.filter(sh => !sh.paid && (sh.hoursWorked ?? 0) > 0 && sh.day <= periodEnd)
  j.lastPayDay = day
  if (!due.length) return
  const hours = round2(due.reduce((a, sh) => a + (sh.hoursWorked ?? 0), 0))
  const gross = round2(due.reduce((a, sh) => a + (sh.hoursWorked ?? 0) * (sh.rate ?? j.hourlyWage), 0))
  const socialSecurity = round2(gross * PAYROLL.socialSecurity)
  const medicare = round2(gross * PAYROLL.medicare)
  const federal = round2(gross * PAYROLL.federal)
  const net = round2(gross - socialSecurity - medicare - federal)
  receive(s, net, { category: 'wage', memo: 'MCDOODLES #4471 PAYROLL — DIRECT DEP', business: false })
  for (const sh of due) sh.paid = true
  j.hoursUnpaid = Math.max(0, round2(j.hoursUnpaid - hours))
  const stub: PayStub = { id: uid(s, 'stub'), payDay: day, periodStart, periodEnd, hours, rate: round2(gross / hours), gross, socialSecurity, medicare, federal, net }
  ;(j.payStubs ??= []).push(stub)
  if (j.payStubs.length > 26) j.payStubs.splice(0, j.payStubs.length - 26)
  const first = j.payStubs.length === 1
  notify(s, { kind: 'success', title: 'Payday 💵', body: `McDoodle's deposited ${usd(net)} for ${hours} hours.`, amount: net, site: 'bank', path: '' })
  const stubText = [
    `PAY STUB — ${MANAGER.store}`,
    `Pay date: ${formatDate(day, 'short')}   Period: ${formatDate(periodStart, 'md')} – ${formatDate(periodEnd, 'md')}`,
    `Hours: ${hours.toFixed(2)} @ $${stub.rate.toFixed(2)}          Gross: ${usd(gross)}`,
    `Social Security (6.2%):  −${usd(socialSecurity)}`,
    `Medicare (1.45%):        −${usd(medicare)}`,
    `Federal withholding:     −${usd(federal)}`,
    `NET PAY (direct deposit): ${usd(net)}`,
  ].join('\n')
  if (j.employed) {
    send(s, {
      ...DARNELL, path: 'pay', subject: `Pay stub — ${formatDate(day, 'md')}`,
      body: [
        `${firstName(s)},`,
        '',
        first ? 'Your first check! Direct deposit hits your Chaise account today. Stub below — check the hours, payroll has been known to "forget" a Saturday.' : 'Paycheck\'s in. Stub below.',
        '',
        stubText,
        '',
        sign,
      ].join('\n'),
    })
  } else {
    send(s, {
      from: PAYROLL_SENDER.name, fromEmail: PAYROLL_SENDER.email, tag: 'job', site: 'mcdoodles', path: 'pay', subject: 'Final pay statement',
      body: `This is your final pay statement from ${MANAGER.store}. Funds were deposited to your account on file.\n\n${stubText}\n\nThank you for your service.`,
    })
  }
  if (first) {
    send(s, { from: 'Mom', fromEmail: 'linda.homebase@inboxly.com', tag: 'misc', subject: 'First paycheck!!', body: `Dad says put 20% away before you touch the rest. I say buy yourself one nice lunch. Do both.\n\nLove,\nMom` })
  }
}

// ---------------------------------------------------------------------------
// onboarding
// ---------------------------------------------------------------------------
export function jobOnNewGame(s: GameState) {
  ensureLife(s)
  s.job.lastPayDay = PAYROLL.firstPayday - PAYROLL.cycleDays
  ensureSchedule(s)
  const def = JOB_SCHEDULES[s.job.schedule]
  const first = nextShift(s)
  send(s, {
    ...DARNELL, path: 'schedule', subject: 'Your schedule + a reminder',
    body: [
      `Morning ${firstName(s)},`,
      '',
      `You're on ${def.label.toLowerCase()} crew: ${def.description}, $${s.job.hourlyWage.toFixed(2)}/hour.${first ? ` Next shift: ${formatDate(first.day, 'long')} at ${hourLabel(first.startHour)}.` : ''}`,
      '',
      'House rules, same as always:',
      '• Clock in on time. Every third late clock-in is a strike.',
      '• No-call no-show = strike. Three strikes and I have to let you go.',
      `• Need a day? Call out at least a few hours ahead. ${JOB_RULES.freeCallOuts} per 30 days, no questions asked.`,
      '• Payday is every other Friday, direct deposit. First one is Friday the 13th. Spooky.',
      '',
      'The full 14-day schedule is on the Crew portal.',
      '',
      sign,
    ].join('\n'),
  })
}

// ---------------------------------------------------------------------------
// modal handlers
// ---------------------------------------------------------------------------
registerModalHandler('job_quit_confirm', (s, _m, choice) => { if (choice === 'quit') quitJobNow(s) })
registerModalHandler('job_fired', () => {})
registerModalHandler('job_rehire', (s, _m, choice) => {
  if (choice === 'accept') rehire(s)
  else notify(s, { kind: 'info', title: 'You walked out', body: 'Your dignity is intact. Your checking account is not.' })
})
registerModalHandler('job_promotion_offer', (s, _m, choice) => {
  if (choice === 'accept') {
    s.job.promotionDeclinedDay = null
    promote(s, 'manager')
  } else {
    s.job.promotionDeclinedDay = today(s)
    notify(s, { kind: 'info', title: 'Promotion declined', body: `Darnell nods. "Offer stands. Ask me again in a month."`, site: 'mcdoodles' })
  }
})
