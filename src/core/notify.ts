// Notifications (toasts / bell), mail, and coach tips. Sim modules call these.
import type { GameNotification, GameState, MailMessage, SiteId } from './types'
import { uid } from './ids'
import { DIFFICULTY } from './difficulty'

const NOTIF_CAP = 300
const MAIL_CAP = 400

export function notify(s: GameState, n: Omit<GameNotification, 'id' | 'hour' | 'read'>): string {
  const id = uid(s, 'n')
  s.notifications.push({ ...n, id, hour: s.time.hour, read: false })
  if (s.notifications.length > NOTIF_CAP) s.notifications.splice(0, s.notifications.length - NOTIF_CAP)
  return id
}

export function mail(s: GameState, m: Omit<MailMessage, 'id' | 'hour' | 'read'>): string {
  const id = uid(s, 'm')
  s.inbox.push({ ...m, id, hour: s.time.hour, read: false })
  if (s.inbox.length > MAIL_CAP) s.inbox.splice(0, s.inbox.length - MAIL_CAP)
  return id
}

/**
 * Queue a coach tip. `id` dedupes: the same tip won't repeat within `cooldownHours`
 * (default: once per game). `essential` tips show even on 'on_request' difficulty.
 */
export function coachTip(
  s: GameState,
  id: string,
  text: string,
  o: { app?: SiteId; path?: string; cooldownHours?: number; essential?: boolean; requested?: boolean } = {},
): boolean {
  if (!s.coach.enabled && !o.requested) return false
  const freq = DIFFICULTY[s.meta.difficulty].coach
  if (freq === 'on_request' && !o.essential && !o.requested) return false
  const last = s.coach.shown[id]
  const cd = o.cooldownHours ?? Infinity
  if (last !== undefined && s.time.hour - last < cd) return false
  if (freq === 'some' && !o.essential && !o.requested && s.coach.queue.length >= 2) return false
  s.coach.shown[id] = s.time.hour
  s.coach.queue.push({ id, text, hour: s.time.hour, app: o.app, ...(o.app && o.path ? { path: o.path } : {}) })
  if (s.coach.queue.length > 6) s.coach.queue.splice(0, s.coach.queue.length - 6)
  return true
}
