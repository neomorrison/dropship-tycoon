// Demand curves: trend (evergreen / rising / fad / declining) × seasonality × gifting holidays,
// then saturation and difficulty → productAppeal (SPEC §5 "Market dynamics").
import type { ActiveEvent, GameState, ProductDef } from '../../core/types'
import { dateOfDay, daysInMonth, dayOf } from '../../core/time'
import { DIFFICULTY } from '../../core/difficulty'
import { clamp } from '../../core/rng'
import { giftBump } from '../events/calendar'
import { findProduct } from './catalog'

const K = 8
const sig = (x: number) => 1 / (1 + Math.exp(-x))
const S0 = sig(-K / 2)
const S1 = sig(K / 2)
/** logistic S-curve normalized to 0 at t=0 and 1 at t=1 */
const sCurve = (t: number) => (sig(K * (clamp(t, 0, 1) - 0.5)) - S0) / (S1 - S0)

/** Trend component only (no seasonality). */
export function trendCurve(p: ProductDef, day: number): number {
  const t = p.trend
  switch (t.kind) {
    case 'evergreen':
      return 1
    case 'declining':
      return 0.3 + 0.5 * Math.pow(0.5, Math.max(0, day) / Math.max(1, t.halfLifeDays))
    case 'rising':
    case 'fad': {
      const floor = t.kind === 'fad' ? 0.15 : 0.35
      if (day <= t.emergeDay) return 0.35
      if (day < t.peakDay) return 0.35 + 0.65 * sCurve((day - t.emergeDay) / Math.max(1, t.peakDay - t.emergeDay))
      return floor + (1 - floor) * Math.pow(0.5, (day - t.peakDay) / Math.max(1, t.halfLifeDays))
    }
  }
}

/** Monthly seasonality, linearly interpolated between mid-month anchors (no overnight jumps). */
export function seasonalityAt(p: ProductDef, day: number): number {
  const d = dateOfDay(day)
  const m = d.getUTCMonth()
  const n = daysInMonth(d.getUTCFullYear(), m)
  const pos = (d.getUTCDate() - 0.5) / n
  const s = p.seasonality
  if (pos < 0.5) return s[(m + 11) % 12] + (s[m] - s[(m + 11) % 12]) * (pos + 0.5)
  return s[m] + (s[(m + 1) % 12] - s[m]) * (pos - 0.5)
}

/** Smooth ceiling: identity below `knee`, asymptotic to `max` above it. */
export function softCap(x: number, knee: number, max: number): number {
  if (x <= knee) return x
  const span = max - knee
  return knee + span * (1 - Math.exp(-(x - knee) / span))
}

const cache = new Map<string, number>()
/** Demand multiplier from trend × season × gifting holidays (before saturation). ≈0.1 … 2.0 */
export function trendIndexAt(p: ProductDef, day: number): number {
  const key = `${p.id}:${day}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const season = seasonalityAt(p, day)
  // Seasonality arrays already contain part of the gifting peak; only the excess gift pull stacks.
  const gift = 1 + (giftBump(day, p.giftable, p.audience.gender) - 1) / Math.max(1, season)
  const v = softCap(trendCurve(p, day) * season * gift, 1.35, 2)
  if (cache.size > 20_000) cache.clear()
  cache.set(key, v)
  return v
}

export const saturationOf = (competitors: number) => 1 - Math.exp(-Math.max(0, competitors) / 45)
/** CPM pressure from other stores advertising the same product (SPEC: 1 + 0.004 × competitors, cap 1.45). */
export const competitionMultFor = (competitors: number) => Math.min(1.45, 1 + 0.004 * Math.max(0, competitors))

/** Demand shocks from events (e.g. a fad collapsing). */
export function trendShock(s: GameState, catalogId: string): number {
  let m = 1
  for (const e of s.events?.active ?? []) if (e.kind === 'trend_collapse' && eventCatalog(e) === catalogId) m *= Number(e.data?.mult ?? 0.55)
  return m
}
const eventCatalog = (e: ActiveEvent) => (e.data?.catalogId as string | undefined) ?? ''

/**
 * Hidden demand for a product right now: demandMult × baseDemand × trendIndex × (1 − 0.55 × saturation).
 * Always within 0.05 … 1.7 (soft-capped).
 */
export function productAppeal(s: GameState, catalogId: string): number {
  const p = findProduct(catalogId)
  if (!p) return 0.05
  const day = dayOf(s.time.hour)
  const sat = s.catalog?.market?.[catalogId]?.saturation ?? p.startSaturation
  const raw = DIFFICULTY[s.meta.difficulty].demandMult * p.baseDemand * trendIndexAt(p, day) * (1 - 0.55 * sat) * trendShock(s, catalogId)
  return clamp(softCap(raw, 1.25, 1.7), 0.05, 1.7)
}
