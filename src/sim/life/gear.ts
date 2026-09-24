// Gear: buying on Amazin, equipping, and the gear-derived multipliers other modules read.
import type { AccountRef, FormatId, GameState, GearSlot } from '../../core/types'
import { pay } from '../../core/money'
import { notify } from '../../core/notify'
import { GEAR, gearDef, type GearDef } from '../../data/gear'
import { FORMATS } from '../../data/creativeTaxonomy'
import { apartment, usd } from './util'
import { skillLevel } from './skills'

const equippedDef = (s: GameState, slot: GearSlot): GearDef | undefined => {
  const id = s.gear.equipped[slot]
  return id ? gearDef(id) : undefined
}

export function buyGear(s: GameState, gearId: string, opts: { payWith?: AccountRef } = {}): { ok: boolean; reason?: string } {
  const g = gearDef(gearId)
  if (!g) return { ok: false, reason: 'That item is no longer available.' }
  if (s.gear.owned.includes(gearId)) return { ok: false, reason: 'You already own this.' }
  if (g.starter || g.price <= 0) return { ok: false, reason: 'Not sold on Amazin.' }
  const acct = pay(s, g.price, {
    category: 'gear', memo: `Amazin.com — ${g.name}`, business: false, prefer: opts.payWith ?? 'bank',
  })
  if (!acct) {
    notify(s, { kind: 'warning', title: 'Payment declined', body: `${g.name} costs ${usd(g.price)} — not enough in checking or on your card.`, site: 'bank', path: '' })
    return { ok: false, reason: `Not enough money: ${usd(g.price)} needed.` }
  }
  s.gear.owned.push(gearId)
  const cur = equippedDef(s, g.slot)
  if (!cur || gearScore(g) > gearScore(cur)) s.gear.equipped[g.slot] = gearId
  notify(s, {
    kind: 'success', title: `Order placed: ${g.name}`,
    body: `${usd(g.price)} charged to your ${acct === 'card' ? 'Chaise Sapphire card' : 'checking account'}. ${s.gear.equipped[g.slot] === gearId ? 'Delivered and set up.' : 'Delivered — equip it on Amazin → Your gear.'}`,
    site: 'amazin', path: 'owned', amount: g.price,
  })
  return { ok: true }
}

/** rough "better than" ordering inside a slot */
function gearScore(g: GearDef): number {
  if (g.slot === 'computer') return 2 - (g.productivity ?? 1.25)
  return g.filmQuality + (g.talkingBonus ?? 0) + g.price / 1e6
}

export function equipGear(s: GameState, gearId: string): void {
  const g = gearDef(gearId)
  if (!g || !s.gear.owned.includes(gearId)) return
  s.gear.equipped[g.slot] = gearId
}
export function unequipGear(s: GameState, slot: GearSlot): void {
  if (slot === 'phone' || slot === 'computer') return // you always have a phone and a computer
  delete s.gear.equipped[slot]
}

/** Multiplier on business-task durations from the equipped computer (old laptop 1.25, pro 1.0, workstation 0.85). */
export function computerProductivity(s: GameState): number {
  return equippedDef(s, 'computer')?.productivity ?? 1.25
}

/**
 * Self-shot creative quality bonus from equipped GEAR only.
 * Capture device = better of phone and camera (they don't stack) + lighting + lav mic (talking formats) + workstation edit bonus.
 */
export function filmQualityBonus(s: GameState, format?: FormatId): number {
  const phone = equippedDef(s, 'phone')?.filmQuality ?? 0
  const camera = equippedDef(s, 'camera')?.filmQuality ?? 0
  const lighting = equippedDef(s, 'lighting')?.filmQuality ?? 0
  const audio = equippedDef(s, 'audio')
  const talking = format ? !!FORMATS[format]?.talking : false
  const mic = talking ? audio?.talkingBonus ?? 0 : 0
  const edit = equippedDef(s, 'computer')?.editBonus ?? 0
  return Math.max(phone, camera) + lighting + mic + edit
}

/** Filming time multiplier (Pear Phone 17 Pro: 0.9). Productivity is applied separately. */
export function filmTimeMult(s: GameState): number {
  return equippedDef(s, 'phone')?.filmTimeMult ?? 1
}

/** Supplier-footage edit bonus (only the computer matters). */
export const editQualityBonus = (s: GameState) => equippedDef(s, 'computer')?.editBonus ?? 0

export interface SelfShotBreakdown {
  base: number
  gear: number
  skill: number
  apartment: number
  mood: number
  burnout: number
  total: number
}
/**
 * Full self-shot quality model (SPEC §7 "self"): 0.3 + gear + 0.03 × creative level + apartment filming bonus
 * − 0.1 if mood < 30 − 0.15 while burned out, capped at 0.9. Exposed so CreatorHub can preview it.
 */
export function selfShotQuality(s: GameState, format?: FormatId): SelfShotBreakdown {
  const base = 0.3
  const gear = filmQualityBonus(s, format)
  const skill = 0.03 * skillLevel(s, 'creative')
  const apt = apartment(s).filmingBonus
  const mood = s.player.mood < 30 ? -0.1 : 0
  const burnout = s.player.burnoutDays > 0 ? -0.15 : 0
  const total = Math.max(0.05, Math.min(0.9, base + gear + skill + apt + mood + burnout))
  return { base, gear, skill, apartment: apt, mood, burnout, total }
}

export const ownsGear = (s: GameState, id: string) => s.gear.owned.includes(id)
export const gearCatalog = () => GEAR
