// Small shared helpers for the life module (no side effects beyond defaulting optional fields).
import type { GameState, MailMessage } from '../../core/types'
import { dayOf, hourOfDay } from '../../core/time'
import { mail } from '../../core/notify'
import { apartmentDef, type ApartmentDef } from '../../data/apartments'

export const nowHour = (s: GameState) => s.time.hour
export const today = (s: GameState) => dayOf(s.time.hour)
export const clock = (s: GameState) => hourOfDay(s.time.hour)
export const firstName = (s: GameState) => (s.player.name || s.meta.playerName || 'there').trim().split(/\s+/)[0] || 'there'
export const apartment = (s: GameState): ApartmentDef => apartmentDef(s.home.tier)
export const autopilotOn = (s: GameState) => s.flags.autopilot !== false && s.flags.autopilot !== 0

export const usd = (n: number, cents = true) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
export const round2 = (n: number) => Math.round(n * 100) / 100

/** 12h clock label for a local hour: 7 → "7:00 AM" */
export function hourLabel(h: number): string {
  const hh = ((h % 24) + 24) % 24
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:00 ${hh < 12 ? 'AM' : 'PM'}`
}

/** Fill optional life fields so old saves and fresh states behave the same. Cheap; call freely. */
export function ensureLife(s: GameState): void {
  const p = s.player
  p.gymBuffUntil ??= 0
  p.lowMoodDays ??= 0
  p.lowEnergyDays ??= 0
  p.lastSocialDay ??= today(s)
  p.today ??= { moodSum: 0, hours: 0, lowEnergyHours: 0 }
  p.queue ??= []
  const j = s.job
  j.payStubs ??= []
  j.callOutDays ??= []
  if (j.lastStrikeDay === undefined) j.lastStrikeDay = null
  j.lateCount ??= 0
  if (j.promotionDeclinedDay === undefined) j.promotionDeclinedDay = null
  const h = s.home
  h.deposit ??= 0
  h.onTimeRentStreak ??= 0
  s.staff.members ??= []
  s.staff.candidates ??= []
}

export type MailInput = Omit<MailMessage, 'id' | 'hour' | 'read'>
export const send = (s: GameState, m: MailInput) => mail(s, m)
