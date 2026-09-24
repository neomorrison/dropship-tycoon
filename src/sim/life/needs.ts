// Needs model (energy / hunger / mood), productivity, burnout and sickness. SPEC §3.
import type { ActivityKind, GameState } from '../../core/types'
import { clamp, randInt } from '../../core/rng'
import { cardAvailable } from '../../core/money'
import { notify } from '../../core/notify'
import { ACTIVITY_DEFS, IDLE_NEEDS } from '../../data/activities'
import { apartment, firstName, nowHour, send, today } from './util'
import { computerProductivity } from './gear'

export const NEEDS = {
  moodDriftPerHour: 0.03,
  tiredEnergy: 20,
  tiredProductivity: 1.35,
  starvingHunger: 15,
  starvingMoodPerHour: -3,
  starvingEnergyPerHour: -2,
  burnoutMoodThreshold: 25,
  burnoutTriggerDays: 3,
  burnoutDays: 5,
  burnoutProductivity: 1.5,
  burnoutMoodCap: 50,
  sickTriggerDays: 3,
  sickLowEnergyHours: 6,
  sickProductivity: 1.25,
  sickRegenMult: 0.8,
  sickDecayMult: 1.25,
  gymRegenBonus: 0.05,
  gymBuffHours: 72,
  sleepDeprivedAfterHours: 18,
}

export interface MoodFactor { label: string; value: number }

/** Mood baseline and its breakdown (HUD tooltip / Academy). */
export function moodFactors(s: GameState): MoodFactor[] {
  const out: MoodFactor[] = []
  const apt = apartment(s)
  out.push({ label: apt.name, value: apt.moodBase })
  const c = s.finance.card
  const util = c.limit > 0 ? c.balance / c.limit : 0
  if (s.finance.cash < 200 || util > 0.9) out.push({ label: s.finance.cash < 200 ? 'Money stress: under $200 in checking' : 'Money stress: card over 90% used', value: -12 })
  const last = s.history[s.history.length - 1]
  if (last && last.profit > 0 && last.day === today(s) - 1) out.push({ label: 'Profitable day yesterday', value: 5 })
  const recentMilestone = Object.values(s.milestones ?? {}).some(d => today(s) - d <= 7)
  if (recentMilestone) out.push({ label: 'Milestone this week', value: 8 })
  const lonely = Math.min(10, Math.max(0, today(s) - (s.player.lastSocialDay ?? today(s))))
  if (lonely > 0) out.push({ label: `${lonely} day${lonely === 1 ? '' : 's'} since seeing friends`, value: -lonely })
  if (s.player.sickDays > 0) out.push({ label: 'Sick', value: -8 })
  if (s.player.burnoutDays > 0) out.push({ label: 'Burned out', value: -6 })
  return out
}
export function moodBaseline(s: GameState): number {
  return clamp(moodFactors(s).reduce((a, f) => a + f.value, 0), 5, 95)
}

/** Duration multiplier for business tasks: computer × tired × burnout × sick (1 = normal, >1 slower). */
export function productivity(s: GameState): number {
  const p = s.player
  let m = computerProductivity(s)
  if (p.energy < NEEDS.tiredEnergy) m *= NEEDS.tiredProductivity
  if (p.burnoutDays > 0) m *= NEEDS.burnoutProductivity
  if (p.sickDays > 0) m *= NEEDS.sickProductivity
  return Math.round(m * 1000) / 1000
}

/** Energy regained per hour of sleep right now. */
export function sleepRegenPerHour(s: GameState, kind: 'sleep' | 'nap' = 'sleep'): number {
  const p = s.player
  let r = kind === 'sleep' ? ACTIVITY_DEFS.sleep.energy * apartment(s).sleepQuality : ACTIVITY_DEFS.nap.energy
  if ((p.gymBuffUntil ?? 0) > nowHour(s)) r *= 1 + NEEDS.gymRegenBonus
  if (p.sickDays > 0) r *= NEEDS.sickRegenMult
  return r
}

/** Apply `minutes` worth of needs change for the given activity (null = idle). */
export function applyNeeds(s: GameState, kind: ActivityKind | null, minutes: number): void {
  if (minutes <= 0) return
  const p = s.player
  const f = minutes / 60
  const def = kind ? ACTIVITY_DEFS[kind] : null
  let dE: number, dH: number, dM: number
  let drift = false
  const asleep = kind === 'sleep' || kind === 'nap'
  if (!def) {
    dE = IDLE_NEEDS.energy; dH = IDLE_NEEDS.hunger; dM = 0; drift = true
  } else if (kind === 'sleep' || kind === 'nap') {
    dE = sleepRegenPerHour(s, kind); dH = def.hunger; dM = def.mood
  } else {
    dE = def.energy; dH = def.hunger; dM = def.mood
    if (def.group === 'life') drift = true
    if (kind === 'film_creative' && p.mood > 50) dM += 1
  }
  if (!asleep) {
    if (p.sickDays > 0) { if (dE < 0) dE *= NEEDS.sickDecayMult; dM -= 1 }
    if (p.awakeHours > NEEDS.sleepDeprivedAfterHours) dE -= 1.5
  }
  if (p.hunger < NEEDS.starvingHunger) { dM += NEEDS.starvingMoodPerHour; dE += NEEDS.starvingEnergyPerHour }

  p.energy = clamp(p.energy + dE * f, 0, 100)
  p.hunger = clamp(p.hunger + dH * f, 0, 100)
  let mood = p.mood + dM * f
  if (drift) mood += (moodBaseline(s) - mood) * (1 - Math.pow(1 - NEEDS.moodDriftPerHour, f))
  p.mood = clamp(mood, 0, p.burnoutDays > 0 ? NEEDS.burnoutMoodCap : 100)
  if (!asleep) p.awakeHours += f
  // day statistics (burnout / sickness triggers)
  const t = (p.today ??= { moodSum: 0, hours: 0, lowEnergyHours: 0 })
  t.moodSum += p.mood * f
  t.hours += f
  if (!asleep && p.energy < NEEDS.tiredEnergy) t.lowEnergyHours += f
}

/** Make the player sick for `days` (events can call this too). */
export function makeSick(s: GameState, days: number, reason = 'You\'re run down'): void {
  const p = s.player
  const was = p.sickDays > 0
  p.sickDays = Math.max(p.sickDays, Math.round(days))
  p.lowEnergyDays = 0
  if (was) return
  notify(s, {
    kind: 'warning', title: 'You\'re sick 🤒',
    body: `${reason}. For ${p.sickDays} days: slower work, less restful sleep, no gym or going out. Calling out of shifts is excused while you're sick.`,
    site: 'mcdoodles', path: '',
  })
  send(s, {
    from: 'Mom', fromEmail: 'linda.homebase@inboxly.com', tag: 'misc',
    subject: 'Soup is on the stove',
    body: [
      `${firstName(s)}, honey,`,
      '',
      'You sounded awful on the phone. You\'ve been running on fumes for days — that laptop can wait. Drink water, sleep, and call Darnell if you can\'t make your shift. Nobody wants you coughing on the fries.',
      '',
      'There\'s chicken soup in the big pot. Heat it, don\'t microwave the pot.',
      '',
      'Love you,',
      'Mom',
    ].join('\n'),
  })
}

/** Midnight evaluation of yesterday's needs: burnout & sickness triggers and countdowns. */
export function needsDayRollover(s: GameState): void {
  const p = s.player
  const t = p.today ?? { moodSum: 0, hours: 0, lowEnergyHours: 0 }
  const avgMood = t.hours > 0 ? t.moodSum / t.hours : p.mood

  // ---- burnout ----
  if (p.burnoutDays > 0) {
    p.burnoutDays -= 1
    if (p.burnoutDays === 0) {
      p.lowMoodDays = 0
      notify(s, { kind: 'success', title: 'You\'re feeling like yourself again', body: 'Burnout has passed. Protect your mood: sleep, eat, see friends.' })
    }
  } else {
    p.lowMoodDays = avgMood < NEEDS.burnoutMoodThreshold ? (p.lowMoodDays ?? 0) + 1 : 0
    if ((p.lowMoodDays ?? 0) >= NEEDS.burnoutTriggerDays) startBurnout(s)
  }

  // ---- sickness ----
  if (p.sickDays > 0) {
    p.sickDays -= 1
    if (p.sickDays === 0) notify(s, { kind: 'success', title: 'You\'re over it', body: 'Fever\'s gone. Back to full speed.' })
  } else {
    p.lowEnergyDays = t.lowEnergyHours >= NEEDS.sickLowEnergyHours ? (p.lowEnergyDays ?? 0) + 1 : 0
    if ((p.lowEnergyDays ?? 0) >= NEEDS.sickTriggerDays) makeSick(s, randInt(s, 2, 4), 'Three days running on empty caught up with you')
  }
  p.today = { moodSum: 0, hours: 0, lowEnergyHours: 0 }
}

function startBurnout(s: GameState) {
  const p = s.player
  p.burnoutDays = NEEDS.burnoutDays
  p.lowMoodDays = 0
  p.mood = Math.min(p.mood, NEEDS.burnoutMoodCap)
  notify(s, {
    kind: 'critical', title: 'Burnout 🔥',
    body: 'Three days of low mood. For 5 days: tasks take 50% longer, self-shot creatives look worse (−0.15), and mood can\'t go above 50. Rest, socialize, eat properly.',
  })
  send(s, {
    from: 'Mom', fromEmail: 'linda.homebase@inboxly.com', tag: 'misc',
    subject: 'Are you okay?',
    body: [
      `Hi sweetheart,`,
      '',
      'Dad says you haven\'t come upstairs for dinner in days and the light under your door is on at 3 in the morning. I know the business matters to you. So do you.',
      '',
      'Take a real day off. Call your friends. Go outside. The ads will still be there.',
      '',
      'Love you more than any website,',
      'Mom',
    ].join('\n'),
  })
}

/** Player-facing warnings about needs (side panel). */
export function needsWarnings(s: GameState): string[] {
  const p = s.player
  const w: string[] = []
  if (p.energy < 12) w.push('Exhausted — you\'ll pass out at 0 energy and lose ~10 hours.')
  else if (p.energy < NEEDS.tiredEnergy) w.push('Tired — business tasks take 35% longer.')
  if (p.hunger < NEEDS.starvingHunger) w.push('Starving — mood and energy are draining fast.')
  if (p.burnoutDays > 0) w.push(`Burned out for ${p.burnoutDays} more day${p.burnoutDays === 1 ? '' : 's'}.`)
  else if ((p.lowMoodDays ?? 0) >= 1) w.push(`Low mood ${p.lowMoodDays} day${p.lowMoodDays === 1 ? '' : 's'} in a row — 3 means burnout.`)
  if (p.sickDays > 0) w.push(`Sick for ${p.sickDays} more day${p.sickDays === 1 ? '' : 's'}.`)
  const util = s.finance.card.limit > 0 ? s.finance.card.balance / s.finance.card.limit : 0
  if (util > 0.9 || cardAvailable(s) <= 0) w.push('Card nearly maxed — money stress is dragging your mood.')
  return w
}
