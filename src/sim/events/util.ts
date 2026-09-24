// Small helpers shared by the events sub-modules.
import type { ActiveEvent, GameState, Modifiers } from '../../core/types'
import { dayOf } from '../../core/time'
import { uid } from '../../core/ids'

const LOG_CAP = 200

export const today = (s: GameState) => dayOf(s.time.hour)

export const neutralModifiers = (): Modifiers => ({
  cpmMult: { fadbook: 1, tiktak: 1 }, ctrMult: { fadbook: 1, tiktak: 1 }, cvrMult: 1,
  attributionMult: { fadbook: 1, tiktak: 1 }, dropshipDelayDays: 0, supplierDelayDays: 0, organicBoost: {}, competitionMult: {},
})

/** Event kinds that are internal scheduling records, not player-facing events. */
export const INTERNAL_EVENT_KINDS = ['life_trigger']

export function startEvent(s: GameState, e: Omit<ActiveEvent, 'id'>, log = true): ActiveEvent {
  const ev: ActiveEvent = { ...e, id: uid(s, 'ev') }
  if (INTERNAL_EVENT_KINDS.includes(e.kind)) ev.data = { ...(ev.data ?? {}), internal: true }
  s.events.active.push(ev)
  if (log) {
    s.events.log.push({ day: e.startDay, kind: e.kind, title: e.title })
    if (s.events.log.length > LOG_CAP) s.events.log.splice(0, s.events.log.length - LOG_CAP)
  }
  return ev
}

export function findEvent(s: GameState, kind: string, pred?: (e: ActiveEvent) => boolean): ActiveEvent | undefined {
  return s.events.active.find(e => e.kind === kind && (!pred || pred(e)))
}

/** True if `key` fired less than `days` days ago. */
export function onCooldown(s: GameState, key: string, days: number): boolean {
  const last = s.events.cooldowns[key]
  return last !== undefined && today(s) - last < days
}
export function markFired(s: GameState, key: string, day = today(s)) {
  s.events.cooldowns[key] = day
}
/** One-shot keys (e.g. "cny_warn_2027_42"): returns true the first time only. */
export function once(s: GameState, key: string): boolean {
  if (s.events.cooldowns[key] !== undefined) return false
  s.events.cooldowns[key] = today(s)
  return true
}

export const round99 = (x: number) => Math.max(0.99, Math.floor(x) + 0.99)
export const r2 = (x: number) => Math.round(x * 100) / 100
export const dataNum = (e: ActiveEvent, k: string, d = 0) => (typeof e.data?.[k] === 'number' ? (e.data[k] as number) : d)
export const dataStr = (e: ActiveEvent, k: string, d = '') => (typeof e.data?.[k] === 'string' ? (e.data[k] as string) : d)

/** Player is at home, awake and not busy with a shift — can take a decision popup / life interruption. */
export function playerAvailable(s: GameState): boolean {
  const a = s.player.activity
  return s.player.location === 'home' && a?.kind !== 'sleep' && a?.kind !== 'work_shift'
}
