// Hourly recompute of s.events.modifiers from the calendar (CNY), active events and market competition.
import type { ActiveEvent, GameState, Modifiers, Platform } from '../../core/types'
import { marketCompetitionMult } from '../market'
import { cnyDropshipDelay, cnyWindowAt } from './calendar'
import { dataNum, dataStr, neutralModifiers, today } from './util'

const round3 = (x: number) => Math.round(x * 1000) / 1000

export function recomputeModifiers(s: GameState): void {
  const m = neutralModifiers()
  const day = today(s)
  const hour = s.time.hour
  for (const id of s.catalog.available) {
    const c = marketCompetitionMult(s, id)
    if (c > 1.0005) m.competitionMult[id] = round3(c)
  }
  // Chinese New Year from the calendar itself (robust even if an event record is missing).
  const w = cnyWindowAt(day)
  if (w) {
    const delay = cnyDropshipDelay(s.meta.seed, w.year)
    if (w.phase === 'shutdown') {
      m.dropshipDelayDays = Math.max(m.dropshipDelayDays, delay)
      m.supplierDelayDays = Math.max(m.supplierDelayDays, 21)
    } else {
      const left = (w.backlogEnd - day) / Math.max(1, w.backlogEnd - w.shutdownEnd)
      m.dropshipDelayDays = Math.max(m.dropshipDelayDays, Math.round(2 + delay * 0.5 * left))
      m.supplierDelayDays = Math.max(m.supplierDelayDays, 7)
    }
  }
  for (const e of s.events.active) if (day >= e.startDay && day <= e.endDay) applyEffect(s, e, m, hour)
  s.events.modifiers = m
}

function applyEffect(s: GameState, e: ActiveEvent, m: Modifiers, hour: number) {
  switch (e.kind) {
    case 'prime_day':
      m.cvrMult *= 0.95
      break
    case 'tracking_outage': {
      const plats = (e.data?.platforms as Platform[] | undefined) ?? ['fadbook', 'tiktak']
      const mult = dataNum(e, 'mult', 0.65)
      for (const p of plats) m.attributionMult[p] = round3(m.attributionMult[p] * mult)
      break
    }
    case 'platform_outage': {
      const p = dataStr(e, 'platform', 'fadbook') as Platform
      if (hour >= dataNum(e, 'startHour') && hour < dataNum(e, 'endHour')) (m.deliveryPaused ??= {})[p] = true
      break
    }
    case 'policy_crackdown':
      m.claimRiskMult = round3((m.claimRiskMult ?? 1) * 1.5)
      break
    case 'chargeback_wave':
      m.chargebackMult = round3((m.chargebackMult ?? 1) * dataNum(e, 'mult', 2))
      m.chargebackMinOrder = Math.min(m.chargebackMinOrder ?? Infinity, dataNum(e, 'minOrder', 60))
      break
    case 'competitor_copy': {
      const id = dataStr(e, 'catalogId')
      if (!id) break
      m.competitionMult[id] = round3((m.competitionMult[id] ?? 1) * copycatPressure(s, e))
      break
    }
    case 'creator_stole_ad': {
      const cid = dataStr(e, 'creativeId')
      if (cid) (m.creativeFatigueMult ??= {})[cid] = 1.3
      break
    }
    case 'influencer_post':
    case 'feature_post': {
      const sp = dataStr(e, 'storeProductId')
      const start = dataNum(e, 'startHour')
      if (!sp || !dataNum(e, 'posted') || hour < start) break
      const total = dataNum(e, 'sessions')
      const hl = dataNum(e, 'halfLifeHours', 18)
      const t = hour - start
      // Exponential decay summing to `total` sessions; the store applies the time-of-day curve itself.
      const add = total * (1 - Math.pow(0.5, 1 / hl)) * Math.pow(0.5, t / hl)
      if (add > 0.02) m.organicBoost[sp] = Math.round(((m.organicBoost[sp] ?? 0) + add) * 100) / 100
      break
    }
    default:
      break
  }
}

/** CPM pressure from a copycat wave, softened by how the player responded. */
export function copycatPressure(s: GameState, e: ActiveEvent): number {
  const response = dataStr(e, 'response')
  if (response === 'match') return 1.05
  if (response === 'refresh') {
    const id = dataStr(e, 'catalogId')
    const since = dataNum(e, 'refreshSince', e.startDay * 24)
    const fresh = s.creatives.creatives.filter(c => c.catalogId === id && c.orderedHour >= since && c.status !== 'failed').length
    return fresh >= 2 ? 1.04 : 1.15
  }
  return 1.15
}
