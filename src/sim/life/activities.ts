// Activity queue + the hourly minute-budget simulation (needs, completions, shifts, autopilot, passing out).
import type { Activity, ActivityKind, GameState, SkillId } from '../../core/types'
import { pay, cardAvailable } from '../../core/money'
import { notify } from '../../core/notify'
import { uid } from '../../core/ids'
import { hourOfDay, weekdayName } from '../../core/time'
import { ACTIVITY_DEFS } from '../../data/activities'
import { onActivityComplete } from '../hooks'
import type { ActivityDef } from './types'
import { autopilotOn, clock, ensureLife, hourLabel, nowHour, today, usd } from './util'
import { applyNeeds, productivity, sleepRegenPerHour } from './needs'
import { filmTimeMult } from './gear'
import { grantXp, SKILL_IDS, SKILL_INFO, ticketsPerSupportSession } from './skills'
import {
  abortShift, clockInPendingNow, completeShift, jobHourEvents, minutesUntilNextShift, nextShift, pendingShift, shiftStartAbs, tryStartPendingShift,
} from './job'

const MAX_QUEUE = 10
/** business tasks that act on something: payload keys they need and where the player picks the target */
const REQUIRED_PAYLOAD: Partial<Record<ActivityKind, { keys: string[]; hint: string }>> = {
  product_research: { keys: ['catalogId'], hint: 'Pick a product on AliExprez and click Research.' },
  film_creative: { keys: ['creativeId'], hint: 'Write a brief in CreatorHub first.' },
  edit_supplier_video: { keys: ['creativeId'], hint: 'Write a brief in CreatorHub first.' },
  fight_chargeback: { keys: ['chargebackId'], hint: 'Open the dispute in Shopifly → Disputes.' },
  appeal_ad_account: { keys: ['accountId'], hint: 'Start the appeal from Account quality in Ads Manager.' },
  post_organic: { keys: ['creativeId', 'storeProductId'], hint: 'Pick a video and product in TikTak.' },
  influencer_outreach: { keys: ['storeProductId'], hint: 'Choose a product in Shopifly → Marketing.' },
}
const XP_GRANTED_ELSEWHERE: ActivityKind[] = ['product_research', 'customer_support', 'fight_chargeback']
const SLEEP_MAX_MIN = 600

export function activityDefs(): Record<ActivityKind, ActivityDef> { return ACTIVITY_DEFS }

// ---------------------------------------------------------------------------
// durations
// ---------------------------------------------------------------------------
/** Real duration (minutes) of an activity started now, after productivity/gear. */
export function activityDuration(s: GameState, kind: ActivityKind): number {
  const def = ACTIVITY_DEFS[kind]
  let m = def.duration
  if (def.scalesWithProductivity) m *= productivity(s)
  if (kind === 'film_creative') m *= filmTimeMult(s)
  return Math.max(5, Math.round(m / 5) * 5)
}

function remainingQueueMinutes(s: GameState): number {
  const p = s.player
  return (p.activity ? Math.max(0, p.activity.remainingMin) : 0) + p.queue.reduce((a, q) => a + q.remainingMin, 0)
}
const inWindow = (w: [number, number] | undefined, h: number) => !w || (w[0] <= w[1] ? h >= w[0] && h < w[1] : h >= w[0] || h < w[1])

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------
export function canDoActivity(s: GameState, kind: ActivityKind): { ok: boolean; reason?: string } {
  ensureLife(s)
  const p = s.player
  const def = ACTIVITY_DEFS[kind]
  if (!def) return { ok: false, reason: 'Unknown activity.' }
  if (p.activity?.kind === 'sleep' && p.activity.payload?.forced) return { ok: false, reason: 'You\'re passed out.' }
  if (kind === 'work_shift') {
    if (!s.job.employed) return { ok: false, reason: 'You don\'t work at McDoodle\'s right now.' }
    if (pendingShift(s)) return { ok: true }
    if (p.activity?.kind === 'work_shift') return { ok: false, reason: 'You\'re already on shift.' }
    const nx = nextShift(s)
    return { ok: false, reason: nx ? `You head to work automatically — next shift ${weekdayName(nx.day)} ${hourLabel(nx.startHour)}.` : 'No shifts scheduled.' }
  }
  if (p.queue.length >= MAX_QUEUE) return { ok: false, reason: 'Your to-do queue is full.' }
  if (p.sickDays > 0 && (kind === 'gym' || kind === 'socialize')) return { ok: false, reason: 'You\'re sick — rest up first.' }
  if ((kind === 'sleep' || kind === 'nap') && !p.activity && p.queue.length === 0 && p.energy >= (kind === 'sleep' ? 95 : 90)) {
    return { ok: false, reason: 'You\'re not tired.' }
  }
  if (kind === 'sleep' && (p.activity?.kind === 'sleep' || p.queue.some(q => q.kind === 'sleep'))) return { ok: false, reason: 'Sleep is already planned.' }
  if (def.window) {
    const startH = hourOfDay(nowHour(s) + Math.floor(remainingQueueMinutes(s) / 60))
    if (!inWindow(def.window, startH)) return { ok: false, reason: `Your friends are only free ${hourLabel(def.window[0])}–${hourLabel(def.window[1])}.` }
  }
  if (def.cost > 0 && !(kind === 'eat_home' && s.home.tier === 0)) {
    if (s.finance.cash + cardAvailable(s) < def.cost) return { ok: false, reason: `You can't afford it (${usd(def.cost)}).` }
  }
  if (kind === 'customer_support') {
    if (!s.store?.created) return { ok: false, reason: 'You don\'t have a store yet.' }
    const open = s.store.tickets.filter(t => t.status !== 'solved').length
    if (open === 0) return { ok: false, reason: 'Inbox zero — no open tickets.' }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// queue management
// ---------------------------------------------------------------------------
function lowestSkill(s: GameState): SkillId {
  return [...SKILL_IDS].sort((a, b) => (s.skills[a]?.level ?? 1) - (s.skills[b]?.level ?? 1))[0]
}

function makeActivity(s: GameState, kind: ActivityKind, opts: { payload?: Activity['payload']; label?: string; durationMin?: number }): Activity {
  const def = ACTIVITY_DEFS[kind]
  const payload = { ...(opts.payload ?? {}) }
  let label = opts.label ?? def.label
  if (kind === 'study') {
    const skill = (SKILL_IDS as string[]).includes(String(payload.skill)) ? (payload.skill as SkillId) : lowestSkill(s)
    payload.skill = skill
    if (!opts.label) label = `Study: ${SKILL_INFO[skill].label}`
  }
  const durationMin = opts.durationMin && opts.durationMin > 0 ? Math.round(opts.durationMin) : activityDuration(s, kind)
  return { id: uid(s, 'act'), kind, label, durationMin, remainingMin: durationMin, payload }
}

/**
 * Adds an activity to the queue (or starts it if idle). Returns id or null (with notification) if not allowed.
 * `durationMin`, when given, is used as-is (the caller already applied productivity/gear).
 */
export function enqueueActivity(
  s: GameState,
  kind: ActivityKind,
  opts: { payload?: Activity['payload']; label?: string; durationMin?: number; front?: boolean } = {},
): string | null {
  ensureLife(s)
  const chk = canDoActivity(s, kind)
  if (!chk.ok) {
    notify(s, { kind: 'warning', title: `Can't do that: ${ACTIVITY_DEFS[kind]?.label ?? kind}`, body: chk.reason })
    return null
  }
  const p = s.player
  const req = REQUIRED_PAYLOAD[kind]
  if (req && req.keys.some(k => opts.payload?.[k] === undefined || opts.payload?.[k] === '')) {
    notify(s, { kind: 'info', title: `${ACTIVITY_DEFS[kind].label}: choose a target`, body: req.hint })
    return null
  }
  if (kind === 'work_shift') {
    // "Go to shift" while a shift is waiting: drop what you're doing and go (late)
    if (p.activity && p.activity.kind !== 'work_shift') {
      const cur = p.activity
      if (cur.kind === 'sleep') { p.awakeHours = 0; p.lastSleepHour = nowHour(s) }
      p.activity = null
    }
    return clockInPendingNow(s) ? p.activity?.id ?? null : null
  }
  const a = makeActivity(s, kind, opts)
  const idle = !p.activity && !pendingShift(s)
  if (idle) {
    if (!startActivity(s, a)) return null
  } else if (opts.front) p.queue.unshift(a)
  else p.queue.push(a)
  // heads-up if a non-interruptible task will run into a shift
  const def = ACTIVITY_DEFS[kind]
  const nx = nextShift(s)
  if (def.interruptible === false && nx && s.job.employed) {
    const endsAt = nowHour(s) + remainingQueueMinutes(s) / 60
    const startsAt = shiftStartAbs(nx)
    if (endsAt > startsAt && startsAt >= nowHour(s)) {
      notify(s, { kind: 'warning', title: 'This runs into your shift', body: `${a.label} won't be done before your ${hourLabel(nx.startHour)} McDoodle's shift — you'll be late, or miss it.`, site: 'mcdoodles' })
    }
  }
  if (p.location === 'work' && def.atHome) {
    notify(s, { kind: 'info', title: `Queued: ${a.label}`, body: 'Starts when you get home from your shift.' })
  }
  return a.id
}

export function cancelActivity(s: GameState, activityId: string): void {
  ensureLife(s)
  const p = s.player
  const qi = p.queue.findIndex(q => q.id === activityId)
  if (qi >= 0) {
    // dropped shoots/edits are failed by the ads module's orphan check
    p.queue.splice(qi, 1)
    return
  }
  const a = p.activity
  if (!a || a.id !== activityId) return
  if (a.kind === 'work_shift') {
    notify(s, { kind: 'warning', title: 'You can\'t just walk out', body: 'Call out before a shift, or quit the job.', site: 'mcdoodles' })
    return
  }
  if (a.kind === 'sleep' && a.payload?.forced) {
    notify(s, { kind: 'warning', title: 'You\'re passed out', body: 'Your body is not taking requests right now.' })
    return
  }
  if (a.kind === 'sleep' || a.kind === 'nap') { p.awakeHours = a.kind === 'sleep' ? 0 : p.awakeHours; p.lastSleepHour = nowHour(s) }
  p.activity = null
  p.location = 'home'
  if (!clockInPendingNow(s)) startNextActivity(s, { autopilot: false })
}

export function clearQueue(s: GameState): void {
  s.player.queue = []
}

/** A starting shift interrupts this activity. Resumable work goes back to the front of the queue. */
export function interruptActivity(s: GameState, a: Activity): void {
  const p = s.player
  const def = ACTIVITY_DEFS[a.kind]
  p.activity = null
  p.location = 'home'
  if (def.resumable && a.remainingMin > 5) {
    p.queue.unshift({ ...a, label: a.label.replace(/ \(paused\)$/, '') })
    notify(s, { kind: 'info', title: `Paused: ${a.label}`, body: `${Math.round(a.remainingMin)} min left — it resumes after your shift.` })
  } else if (a.kind === 'nap' || a.kind === 'sleep') {
    p.lastSleepHour = nowHour(s)
  }
}

// ---------------------------------------------------------------------------
// start / finish
// ---------------------------------------------------------------------------
function startActivity(s: GameState, a: Activity): boolean {
  const p = s.player
  const def = ACTIVITY_DEFS[a.kind]
  if (def.window && !inWindow(def.window, clock(s))) {
    notify(s, { kind: 'info', title: `Skipped: ${a.label}`, body: `Only possible ${hourLabel(def.window[0])}–${hourLabel(def.window[1])}.` })
    return false
  }
  if (p.sickDays > 0 && (a.kind === 'gym' || a.kind === 'socialize')) {
    notify(s, { kind: 'info', title: `Skipped: ${a.label}`, body: 'You\'re sick.' })
    return false
  }
  if (def.cost > 0 && a.startedHour === undefined) {
    const acct = pay(s, def.cost, { category: def.costCategory ?? 'misc', memo: def.costMemo ?? def.label, business: false, prefer: 'bank' })
    if (!acct) {
      if (a.kind === 'eat_home' && s.home.tier === 0) {
        a.label = 'Raid Mom\'s fridge'
      } else {
        notify(s, { kind: 'warning', title: `Can't afford: ${a.label}`, body: `${usd(def.cost)} needed — your checking and card are both tapped out.`, site: 'bank' })
        return false
      }
    }
  }
  if (a.kind === 'sleep') {
    a.durationMin = Math.max(a.durationMin, ACTIVITY_DEFS.sleep.duration)
    a.remainingMin = a.durationMin
  }
  a.startedHour ??= nowHour(s)
  p.activity = a
  p.location = def.location === 'out' ? 'out' : 'home'
  return true
}

function finishActivity(s: GameState, a: Activity): void {
  const p = s.player
  p.activity = null
  const def = ACTIVITY_DEFS[a.kind]
  if (a.kind === 'work_shift') { completeShift(s, a); return }
  p.location = 'home'
  switch (a.kind) {
    case 'sleep':
    case 'nap':
      if (a.kind === 'sleep') p.awakeHours = 0
      else p.awakeHours = Math.max(0, p.awakeHours - 3)
      p.lastSleepHour = nowHour(s)
      if (a.payload?.forced) notify(s, { kind: 'info', title: 'You came to', body: 'Ten hours gone. Eat something before you do anything else.' })
      return
    case 'gym':
      p.gymBuffUntil = nowHour(s) + 72
      return
    case 'socialize':
      p.lastSocialDay = today(s)
      return
    default:
      break
  }
  if (def.group !== 'business') return
  // business effects are routed through hooks
  if (a.kind === 'customer_support') a.payload = { ...(a.payload ?? {}), count: Number(a.payload?.count ?? ticketsPerSupportSession(s)) }
  onActivityComplete(s, a)
  // XP the owning module doesn't grant itself (research → market, tickets & disputes → store, ad spend → ads)
  if (XP_GRANTED_ELSEWHERE.includes(a.kind)) return
  if (a.kind === 'study') {
    const skill = String(a.payload?.skill ?? 'research') as SkillId
    grantXp(s, skill, def.xp ?? 60)
    notify(s, { kind: 'success', title: `Studied ${SKILL_INFO[skill]?.label ?? skill}`, body: `+${def.xp ?? 60} XP`, site: 'academy', path: 'skills' })
    return
  }
  if (def.skill && def.xp) grantXp(s, def.skill, def.xp)
}

// ---------------------------------------------------------------------------
// autopilot
// ---------------------------------------------------------------------------
function affordable(s: GameState, cost: number) {
  return s.finance.cash + cardAvailable(s) >= cost
}
function eatChoice(s: GameState): ActivityKind | null {
  if (s.home.tier === 0 || affordable(s, ACTIVITY_DEFS.eat_home.cost)) return 'eat_home'
  if (affordable(s, ACTIVITY_DEFS.eat_takeout.cost)) return 'eat_takeout'
  return null
}

/** What autopilot does when idle (null = stay idle). */
export function autopilotChoice(s: GameState): ActivityKind | null {
  const p = s.player
  const h = clock(s)
  const toShift = s.job.employed ? minutesUntilNextShift(s) : null
  const shiftSoon = (m: number) => toShift !== null && toShift <= m
  if (p.hunger < 25 || (shiftSoon(90) && p.hunger < 55)) { const e = eatChoice(s); if (e) return e }
  if (p.energy < 12) return shiftSoon(150) ? 'nap' : 'sleep'
  if (h >= 23 || h < 2) return shiftSoon(240) && p.energy > 40 ? null : 'sleep'
  if (h >= 21 && p.energy < 30) return 'sleep' // early night instead of a late nap
  if (h >= 2 && h < 6 && p.energy < 70 && !shiftSoon(120)) return 'sleep'
  if (p.energy < 25 && !shiftSoon(60) && h >= 6 && h < 20) return 'nap'
  // keep mood from sliding into burnout: unwind for an hour when it gets low
  if (p.mood < 30 && !shiftSoon(60) && h >= 7 && h < 23) return 'relax'
  return null
}

/** Start the next queued activity (critical needs first when autopilot is on). */
export function startNextActivity(s: GameState, o: { autopilot?: boolean } = {}): boolean {
  const p = s.player
  if (p.activity || pendingShift(s)) return false
  const auto = o.autopilot !== false && autopilotOn(s)
  if (auto) {
    let critical: ActivityKind | null = null
    if (p.energy < 10) critical = minutesUntilNextShift(s) !== null && (minutesUntilNextShift(s) ?? 999) <= 120 ? 'nap' : 'sleep'
    else if (p.hunger < 20) critical = eatChoice(s)
    if (critical && !p.queue.some(q => q.kind === critical)) {
      if (startActivity(s, makeActivity(s, critical, {}))) return true
    }
  }
  while (p.queue.length) {
    const a = p.queue.shift()!
    if (startActivity(s, a)) return true
  }
  if (!auto) return false
  const pick = autopilotChoice(s)
  if (!pick) return false
  if ((pick === 'sleep' && p.energy >= 95) || (pick === 'nap' && p.energy >= 90)) return false
  return startActivity(s, makeActivity(s, pick, {}))
}

// ---------------------------------------------------------------------------
// passing out
// ---------------------------------------------------------------------------
function passOut(s: GameState): void {
  const p = s.player
  const a = p.activity
  if (a?.kind === 'work_shift') abortShift(s, 'passed_out')
  else if (a) {
    const def = ACTIVITY_DEFS[a.kind]
    if (def.resumable && a.remainingMin > 5) p.queue.unshift(a)
  }
  p.activity = { id: uid(s, 'act'), kind: 'sleep', label: 'Passed out', durationMin: SLEEP_MAX_MIN, remainingMin: SLEEP_MAX_MIN, startedHour: nowHour(s), payload: { forced: true } }
  p.location = 'home'
  p.mood = Math.max(0, p.mood - 10)
  notify(s, { kind: 'critical', title: 'You passed out 😵', body: 'Energy hit zero. You\'re out for about 10 hours — shifts, tasks, everything waits.' })
}

// ---------------------------------------------------------------------------
// the hour
// ---------------------------------------------------------------------------
function sleepElapsed(a: Activity) { return a.durationMin - a.remainingMin }
function sleepShouldEnd(s: GameState, a: Activity): boolean {
  const el = sleepElapsed(a)
  if (a.payload?.forced || a.payload?.snoozed) return a.remainingMin <= 0.01
  const e = s.player.energy
  return el >= SLEEP_MAX_MIN - 0.01 || (e >= 99.5 && el >= 420) || (el >= 480 && e >= 85)
}

/** Simulate the hour that just ended ([now − 1h, now)), then handle top-of-hour events. */
export function lifeRunHour(s: GameState): void {
  ensureLife(s)
  const p = s.player
  if (p.location === 'work' && p.activity?.kind !== 'work_shift') p.location = 'home'
  let budget = 60
  let guard = 0
  while (budget > 0.01 && guard++ < 60) {
    const minutesInto = 60 - budget
    if (!p.activity) {
      if (tryStartPendingShift(s, minutesInto)) continue
      if (!pendingShift(s) && startNextActivity(s)) continue
      applyNeeds(s, null, budget)
      budget = 0
      if (p.energy <= 0) passOut(s)
      break
    }
    const a = p.activity
    let step = Math.min(budget, Math.max(0, a.remainingMin))
    if (a.kind === 'sleep') {
      // planned 8h; if still not rested, extend in 30-min steps up to 10h
      if (a.remainingMin <= 0.01 && !a.payload?.forced && !a.payload?.snoozed && a.durationMin < SLEEP_MAX_MIN) {
        const ext = Math.min(30, SLEEP_MAX_MIN - a.durationMin)
        a.durationMin += ext
        a.remainingMin += ext
      }
      step = Math.min(budget, 15, Math.max(0, a.remainingMin))
    }
    if (a.kind === 'work_shift' && !a.payload?.meal) {
      // free crew meal at the midpoint of a 6h+ shift
      const half = a.durationMin / 2
      if (a.durationMin >= 360 && a.remainingMin - step <= half) {
        p.hunger = Math.min(100, p.hunger + 35)
        a.payload = { ...(a.payload ?? {}), meal: true }
      }
    }
    if (step <= 0) step = Math.min(budget, 1)
    applyNeeds(s, a.kind, step)
    a.remainingMin -= step
    budget -= step
    if (p.energy <= 0 && a.kind !== 'sleep' && a.kind !== 'nap') { passOut(s); continue }
    const done = a.kind === 'sleep' ? sleepShouldEnd(s, a) : a.remainingMin <= 0.01
    if (done) finishActivity(s, a)
  }
  jobHourEvents(s)
  if (!p.activity) startNextActivity(s)
}

/** Sleep helper for UIs: expected wake time estimate (absolute hour). */
export function estimatedWakeHour(s: GameState): number | null {
  const a = s.player.activity
  if (!a || a.kind !== 'sleep') return null
  if (a.payload?.forced || a.payload?.snoozed) return nowHour(s) + a.remainingMin / 60
  const rate = sleepRegenPerHour(s)
  const toFull = rate > 0 ? ((100 - s.player.energy) / rate) * 60 : SLEEP_MAX_MIN
  const el = sleepElapsed(a)
  const end = Math.min(SLEEP_MAX_MIN, Math.max(420, el + toFull))
  return nowHour(s) + Math.max(0, end - el) / 60
}
