// What the people in the 3D room should be doing, as pure functions (no three.js, unit tested).
//
// The sim runs fast (1.25 s per in-game hour at 1×), so a 30-minute meal is over before anyone could walk to
// the stove. The room therefore plays "beats": each activity the sim starts becomes a beat that stays on
// screen for a minimum stage time (HOLD) even after the sim has moved on, so the player visibly cooks, eats,
// sleeps. A newer activity takes over after YIELD seconds; the latest one always wins (stale beats are dropped).
import type { ActivityKind, GearState, PlayerLook, StaffMember } from '../../../core/types'
import type { ActorTask, GearItem, Mood } from '../../../three/types'

export type BeatKind = ActivityKind | 'idle' | 'computer'

export interface SimSnapshot {
  activityId: string | null
  kind: ActivityKind | null
  /** 0..1 progress of the sim activity */
  progress: number
  location: 'home' | 'work' | 'out'
  /** the computer overlay is open (no activity: the player sits at the desk) */
  computerOpen: boolean
}

export interface Beat {
  key: string
  kind: BeatKind
  atWork: boolean
  out: boolean
  /** stage seconds (real seconds × game speed) since the beat started */
  elapsed: number
  /** the sim is still running this activity */
  simActive: boolean
  simProgress: number
}

/** Minimum stage seconds a beat stays on screen (at 1× a stage second is a real second). */
export const HOLD: Record<BeatKind, number> = {
  idle: 0,
  computer: 0,
  sleep: 10,
  nap: 8,
  relax: 9,
  eat_home: 15,
  eat_takeout: 15,
  shower: 6,
  gym: 6,
  socialize: 6,
  work_shift: 6,
  product_research: 8,
  customer_support: 8,
  fight_chargeback: 8,
  appeal_ad_account: 8,
  post_organic: 8,
  influencer_outreach: 8,
  edit_supplier_video: 8,
  study: 9,
  film_creative: 10,
}
/** a newer activity replaces the current beat after this many stage seconds */
export const YIELD = 2.5

export const COMPUTER_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'product_research', 'customer_support', 'fight_chargeback', 'appeal_ad_account', 'post_organic', 'influencer_outreach', 'edit_supplier_video', 'study',
])
export const LEAVE_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>(['shower', 'gym', 'socialize', 'work_shift'])

function beatKey(s: SimSnapshot): string {
  if (s.activityId && s.kind) return `act:${s.activityId}`
  return s.computerOpen && s.location !== 'work' ? 'computer' : 'idle'
}

function newBeat(s: SimSnapshot, elapsed = 0): Beat {
  const kind: BeatKind = s.activityId && s.kind ? s.kind : s.computerOpen && s.location !== 'work' ? 'computer' : 'idle'
  return { key: beatKey(s), kind, atWork: s.location === 'work', out: s.location === 'out', elapsed, simActive: kind !== 'idle' && kind !== 'computer', simProgress: s.progress }
}

/** Progress 0..1 of a beat: sim progress for long activities, stage time for short ones. */
export function beatProgress(b: Beat): number {
  const hold = HOLD[b.kind]
  if (!hold) return b.simActive ? b.simProgress : 1
  const t = Math.min(1, b.elapsed / hold)
  return b.simActive ? Math.min(b.simProgress, t) : t
}

/** The beat timeline: feed it the sim every frame, read `current`. */
export class BeatTimeline {
  current: Beat | null = null
  pending: Beat | null = null

  update(s: SimSnapshot, dtStage: number): Beat {
    const key = beatKey(s)
    if (!this.current) {
      // loading mid-activity: start the beat where the sim is
      const b = newBeat(s)
      b.elapsed = HOLD[b.kind] * Math.max(0, Math.min(1, s.progress))
      this.current = b
      return b
    }
    const cur = this.current
    cur.elapsed += Math.max(0, dtStage)
    if (cur.key === key) {
      this.pending = null
      cur.simActive = cur.kind !== 'idle' && cur.kind !== 'computer'
      cur.simProgress = s.progress
      cur.atWork = s.location === 'work'
      cur.out = s.location === 'out'
      return cur
    }
    // the sim moved on
    if (cur.simActive) {
      cur.simActive = false
      cur.simProgress = 1
    }
    if (!this.pending || this.pending.key !== key) this.pending = newBeat(s)
    else {
      this.pending.simProgress = s.progress
      this.pending.atWork = s.location === 'work'
      this.pending.out = s.location === 'out'
    }
    const next = this.pending
    const hold = HOLD[cur.kind]
    const enough = next.kind === 'idle' ? cur.elapsed >= hold : cur.elapsed >= Math.min(hold, YIELD)
    if (enough) {
      this.current = next
      this.pending = null
    }
    return this.current
  }

  /** The player took over (clicked the floor): end a beat the sim already finished, right now. */
  release(): Beat | null {
    const cur = this.current
    if (!cur || cur.simActive || cur.kind === 'idle') return cur
    if (this.pending && this.pending.kind !== 'idle') return cur
    this.current = { key: 'idle', kind: 'idle', atWork: cur.atWork, out: cur.out, elapsed: 0, simActive: false, simProgress: 0 }
    this.pending = null
    return this.current
  }
}

// ---------------------------------------------------------------------------
// the player's pose for a beat
// ---------------------------------------------------------------------------
export interface PlayerOverride {
  kind: 'goto' | 'fry'
  point?: { x: number; z: number }
}

export interface Pose {
  task: ActorTask
  /** prop in the right hand */
  hold: string | null
}

export interface PoseContext {
  /** the room has a couch (a_couch_sit) */
  couch: boolean
  override?: PlayerOverride | null
}

export function playerPose(b: Beat, ctx: PoseContext): Pose {
  const p = beatProgress(b)
  if (b.atWork) {
    if (b.kind === 'work_shift' || b.kind === 'idle') {
      if (ctx.override?.kind === 'fry') return { task: { kind: 'use', at: 'fryer_stand', anim: 'cook' }, hold: null }
      return { task: { kind: 'use', at: 'counter_stand', anim: 'register' }, hold: null }
    }
  }
  if (b.out) return { task: { kind: 'leave' }, hold: null }
  switch (b.kind) {
    case 'idle':
      if (ctx.override?.kind === 'goto' && ctx.override.point) return { task: { kind: 'goto', point: ctx.override.point }, hold: null }
      return { task: { kind: 'wander' }, hold: null }
    case 'computer':
      return { task: { kind: 'sit', at: 'computer_sit', anim: 'sit_type' }, hold: null }
    case 'sleep':
    case 'nap':
      return { task: { kind: 'lie', at: 'bed_lie' }, hold: null }
    case 'relax':
      return { task: { kind: 'sit', at: ctx.couch ? 'couch_sit' : 'bed_sit', anim: 'sit_idle' }, hold: 'phone' }
    case 'eat_home':
      return p < 0.6 ? { task: { kind: 'use', at: 'stove_stand', anim: 'cook' }, hold: 'spatula' } : { task: { kind: 'sit', at: 'eat_sit', anim: 'eat_sit' }, hold: 'plate' }
    case 'eat_takeout':
      return p < 0.5 ? { task: { kind: 'idle', at: 'door_stand', anim: 'phone' }, hold: 'phone' } : { task: { kind: 'sit', at: 'eat_sit', anim: 'eat_sit' }, hold: 'takeout_bag' }
    case 'film_creative':
      return { task: { kind: 'use', at: 'film_stand', anim: 'film' }, hold: 'phone' }
    case 'study':
      // chin in hand, reading the course (switching clips would make them stand up and sit again)
      return { task: { kind: 'sit', at: 'computer_sit', anim: 'sit_think' }, hold: null }
    default:
      if (COMPUTER_KINDS.has(b.kind)) return { task: { kind: 'sit', at: 'computer_sit', anim: 'sit_type' }, hold: null }
      if (LEAVE_KINDS.has(b.kind)) return { task: { kind: 'leave' }, hold: null }
      return { task: { kind: 'wander' }, hold: null }
  }
}

/** Stable key of a task (same key = same task, no re-plan). */
export function taskKeyOf(t: ActorTask): string {
  switch (t.kind) {
    case 'idle': return `idle:${t.at ?? ''}:${t.anim ?? ''}`
    case 'sit': return `sit:${t.at}:${t.anim ?? ''}`
    case 'lie': return `lie:${t.at}`
    case 'use': return `use:${t.at}:${t.anim}`
    case 'goto': return `goto:${t.point.x.toFixed(2)}:${t.point.z.toFixed(2)}`
    case 'leave': return `leave:${t.at ?? ''}`
    default: return t.kind
  }
}

/** True when a task keeps the person in the room (not leaving, not hidden). */
export const visibleTask = (t: ActorTask | null) => !!t && t.kind !== 'leave' && t.kind !== 'hidden'

// ---------------------------------------------------------------------------
// needs, mood, looks
// ---------------------------------------------------------------------------
export type Thought = 'hungry' | 'exhausted' | 'stressed'
export const THOUGHT: Record<Thought, { emoji: string; label: string; spot: 'fridge' | 'bed' | 'couch' }> = {
  hungry: { emoji: '🍔', label: 'Hungry', spot: 'fridge' },
  exhausted: { emoji: '🛏️', label: 'Exhausted', spot: 'bed' },
  stressed: { emoji: '😣', label: 'Stressed', spot: 'couch' },
}

/** The most urgent low need, if any. */
export function needsThought(energy: number, hunger: number, mood: number): Thought | null {
  if (energy < 20) return 'exhausted'
  if (hunger < 25) return 'hungry'
  if (mood < 25) return 'stressed'
  return null
}

export function actorMood(energy: number, mood: number, happyBoost: boolean): Mood {
  if (energy < 25) return 'tired'
  if (mood < 30) return 'stressed'
  if (mood > 70 || happyBoost) return 'happy'
  return 'neutral'
}

const HATS = new Set(['cap', 'cap_back', 'beanie', 'flatcap', 'headphones', 'visor'])
/** The player's look in a McDoodle's uniform (red uniform top, yellow visor). */
export function uniformLook(look: PlayerLook): PlayerLook {
  const acc = (look.acc ?? []).filter(a => !HATS.has(a))
  return { ...look, topStyle: 'uniform', top: '#d8352a', bottom: '#2b2d33', acc: [...acc, 'visor'], accColor: '#f5c342' }
}

// ---------------------------------------------------------------------------
// the player's stuff
// ---------------------------------------------------------------------------
const GEAR_SLOT: Record<string, 'phone' | 'lighting' | 'camera' | 'computer' | 'audio'> = {
  'phone-cracked': 'phone', 'phone-pro': 'phone', 'ring-light': 'lighting', 'softbox-kit': 'lighting', 'mirrorless-camera': 'camera',
  'laptop-old': 'computer', 'laptop-pro': 'computer', 'workstation': 'computer', 'lav-mic': 'audio',
}
const BEST: Record<string, string[]> = {
  phone: ['phone-pro', 'phone-cracked'],
  computer: ['workstation', 'laptop-pro', 'laptop-old'],
  camera: ['mirrorless-camera'],
  audio: ['lav-mic'],
}
/**
 * Gear shown in the room: the equipped (else best owned) phone, computer, camera and mic, plus every owned
 * light (ring light and softboxes stand on their own floor spots). Unknown ids are skipped.
 */
export function gearItems(g: GearState | null | undefined): GearItem[] {
  if (!g) return []
  const owned = new Set(g.owned ?? [])
  const out: string[] = []
  for (const slot of ['computer', 'phone', 'camera', 'audio'] as const) {
    const eq = g.equipped?.[slot]
    const pick = eq && owned.has(eq) && GEAR_SLOT[eq] === slot ? eq : BEST[slot].find(id => owned.has(id))
    if (pick) out.push(pick)
  }
  for (const id of ['ring-light', 'softbox-kit']) if (owned.has(id)) out.push(id)
  return out.map(id => ({ id }))
}

/** staff desks per home tier (docs/3D.md §5) */
export const TIER_DESKS = [0, 1, 2, 3, 5, 7]

/** Staff work weekdays 9:00 to 18:00 at their desks. */
export function staffOnDuty(dayIndex: number, hourOfDay: number): boolean {
  const wd = ((dayIndex % 7) + 7) % 7
  return wd < 5 && hourOfDay >= 9 && hourOfDay < 18
}

/** Who sits at which staff desk: hires in order, up to the tier's desks. */
export function staffSeats(members: readonly StaffMember[], tier: number): StaffMember[] {
  const n = TIER_DESKS[Math.max(0, Math.min(5, Math.round(tier)))] ?? 0
  return members.slice(0, n)
}

/** rooms with a couch to relax on (the others use the bed edge) */
export const COUCH_ROOMS = new Set(['tier0', 'tier2', 'tier3', 'tier4', 'tier5'])

/** clickable objects of each 3D room (interactive groups), in label order */
export const ROOM_SPOTS: Record<string, string[]> = {
  tier0: ['bed', 'computer', 'fridge', 'door', 'couch', 'tv'],
  tier1: ['bed', 'computer', 'fridge', 'door'],
  tier2: ['bed', 'computer', 'fridge', 'door', 'couch'],
  tier3: ['bed', 'computer', 'fridge', 'door', 'couch'],
  tier4: ['bed', 'computer', 'fridge', 'door', 'garage', 'couch'],
  tier5: ['bed', 'computer', 'fridge', 'door', 'couch', 'tv'],
  mcdoodles: ['counter', 'fryer', 'exit'],
}

export const roomFor = (tier: number, atWork: boolean) => (atWork ? 'mcdoodles' : `tier${Math.max(0, Math.min(5, Math.round(tier)))}`)

// ---------------------------------------------------------------------------
// McDoodle's
// ---------------------------------------------------------------------------
/** lunch 11-14 and dinner 17-20 */
export const isRush = (h: number) => (h >= 11 && h < 14) || (h >= 17 && h < 20)
/** mean stage seconds between customers at an hour of the day */
export function customerInterval(h: number): number {
  if (isRush(h)) return 2.6
  if (h >= 7 && h < 22) return 7
  return 16
}
