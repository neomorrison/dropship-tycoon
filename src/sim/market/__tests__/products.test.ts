import { describe, expect, it } from 'vitest'
import { PRODUCT_LIST } from '../../../data/productList'
import { PRODUCTS, PRODUCT_BY_ID } from '../../../data/products'
import { BENCHMARKS } from '../../../data/benchmarks'
import { dutyPctFor } from '../sourcing'

const ARCHETYPE_RATIO: Record<string, [number, number]> = {
  // perceived value / landed cost (incl. 2026 import duty) — SPEC §5 bands, slightly widened for duty
  winner: [3.3, 6.5], highticket: [3.5, 8.5], seasonal: [2.8, 5.5], emerging: [3, 6.5],
  solid: [2.3, 4.2], saturated: [2.3, 4.2], dud: [1.4, 2.6], trap: [3.8, 6.5],
}

describe('product catalog data', () => {
  it('has economics for all 63 ids in productList', () => {
    expect(PRODUCT_LIST.length).toBe(63)
    expect(PRODUCTS.length).toBe(63)
    for (const l of PRODUCT_LIST) {
      const p = PRODUCT_BY_ID[l.id]
      expect(p, l.id).toBeDefined()
      expect(p.name).toBe(l.name)
      expect(p.niche).toBe(l.niche)
      expect(p.archetype).toBe(l.archetype)
    }
  })

  it('every product has complete, sane fields', () => {
    const unit = (x: number) => x >= 0 && x <= 1
    for (const p of PRODUCTS) {
      const ctx = p.id
      expect(p.supplierTitle.length, ctx).toBeGreaterThanOrEqual(80)
      expect(p.supplierTitle).not.toBe(p.name)
      expect(p.supplierDescription.split('\n').length, ctx).toBeGreaterThanOrEqual(4)
      expect(Object.keys(p.specs).length, ctx).toBeGreaterThanOrEqual(3)
      expect(p.variants.length, ctx).toBeGreaterThanOrEqual(1)
      for (const v of p.variants) expect(v.values.length, ctx).toBeGreaterThanOrEqual(1)
      expect(p.cogs, ctx).toBeGreaterThanOrEqual(0.5)
      expect(p.cogs, ctx).toBeLessThanOrEqual(45)
      expect(p.shipCost, ctx).toBeGreaterThanOrEqual(0)
      expect(p.shipCost, ctx).toBeLessThanOrEqual(8)
      expect(p.shipDays[0], ctx).toBeLessThan(p.shipDays[1])
      expect(p.weightKg, ctx).toBeGreaterThan(0)
      expect(p.bulkCogs / p.cogs, ctx).toBeGreaterThanOrEqual(0.6)
      expect(p.bulkCogs / p.cogs, ctx).toBeLessThanOrEqual(0.75)
      expect(p.moq, ctx).toBeGreaterThanOrEqual(100)
      expect(p.moq, ctx).toBeLessThanOrEqual(500)
      expect(p.privateLabelCogs / p.bulkCogs, ctx).toBeCloseTo(1.15, 1)
      expect(p.privateLabelMoq, ctx).toBeGreaterThanOrEqual(500)
      expect(p.privateLabelMoq, ctx).toBeLessThanOrEqual(1000)
      if (p.amazonPrice !== null) expect(p.amazonPrice, ctx).toBeGreaterThan(p.cogs)
      for (const k of ['baseDemand', 'wow', 'problemSolving', 'impulse', 'giftable', 'repeatRate', 'defectRate', 'claimRisk', 'brandable', 'startSaturation'] as const) expect(unit(p[k]), `${ctx}.${k}`).toBe(true)
      expect(p.audience.ageMin, ctx).toBeLessThan(p.audience.ageMax)
      expect(unit(p.platformFit.fadbook) && unit(p.platformFit.tiktak), ctx).toBe(true)
      for (const k of ['bestFormats', 'bestHooks', 'bestAngles'] as const) {
        expect(p[k].length, `${ctx}.${k}`).toBeGreaterThanOrEqual(2)
        expect(p[k].length, `${ctx}.${k}`).toBeLessThanOrEqual(4)
        expect(new Set(p[k]).size, `${ctx}.${k} unique`).toBe(p[k].length)
      }
      expect(p.seasonality.length, ctx).toBe(12)
      for (const v of p.seasonality) expect(v > 0 && v < 2.5, ctx).toBe(true)
      expect(p.keywords.length, ctx).toBeGreaterThanOrEqual(10)
      expect(p.keywords.length, ctx).toBeLessThanOrEqual(16)
      expect(p.objections.length, ctx).toBeGreaterThanOrEqual(4)
      expect(p.objections.length, ctx).toBeLessThanOrEqual(6)
      expect(p.publicSignals.ordersBase, ctx).toBeGreaterThan(0)
      expect(p.publicSignals.rating, ctx).toBeGreaterThanOrEqual(4.3)
      expect(p.publicSignals.rating, ctx).toBeLessThanOrEqual(4.9)
      expect(p.scaleCeiling, ctx).toBeGreaterThanOrEqual(150)
      expect(p.scaleCeiling, ctx).toBeLessThanOrEqual(5000)
      expect(p.startSaturation, ctx).toBeCloseTo(1 - Math.exp(-p.startCompetitors / 45), 2)
    }
  })

  it('uses parody names only in player-visible supplier copy', () => {
    const banned = /\b(amazon|aliexpress|tiktok|facebook|instagram|shopify|iphone|samsung|apple|ios|android|youtube|costco|walmart|magsafe)\b/i
    for (const p of PRODUCTS) {
      expect(banned.test(p.supplierTitle), p.id).toBe(false)
      expect(banned.test(p.supplierDescription), p.id).toBe(false)
      for (const v of Object.values(p.specs)) expect(banned.test(v), p.id).toBe(false)
    }
  })

  it('perceived value vs landed cost matches the archetype bands', () => {
    for (const p of PRODUCTS) {
      const landed = p.cogs * (1 + dutyPctFor(p)) + p.shipCost
      const ratio = p.perceivedValue / landed
      const [lo, hi] = ARCHETYPE_RATIO[p.archetype]
      expect(ratio, `${p.id} ratio ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(lo)
      expect(ratio, `${p.id} ratio ${ratio.toFixed(2)}`).toBeLessThanOrEqual(hi)
    }
  })

  it('hidden archetypes follow the SPEC table', () => {
    for (const p of PRODUCTS) {
      const ctx = p.id
      switch (p.archetype) {
        case 'winner': expect(p.baseDemand, ctx).toBeGreaterThanOrEqual(0.8); expect(p.defectRate, ctx).toBeLessThanOrEqual(0.07); break
        case 'highticket': expect(p.perceivedValue, ctx).toBeGreaterThanOrEqual(80); expect(p.perceivedValue, ctx).toBeLessThanOrEqual(200); break
        case 'seasonal': expect(Math.max(...p.seasonality), ctx).toBeGreaterThanOrEqual(1.6); expect(Math.min(...p.seasonality), ctx).toBeLessThanOrEqual(0.45); break
        case 'emerging': expect(['rising', 'fad']).toContain(p.trend.kind); expect(p.trend.emergeDay).toBeGreaterThanOrEqual(10); expect(p.trend.emergeDay).toBeLessThanOrEqual(150); expect(p.trend.peakDay - p.trend.emergeDay).toBeGreaterThanOrEqual(40); expect(p.trend.peakDay - p.trend.emergeDay).toBeLessThanOrEqual(120); break
        case 'saturated': expect(p.startSaturation, ctx).toBeGreaterThanOrEqual(0.6); expect(p.startCompetitors, ctx).toBeGreaterThanOrEqual(30); break
        case 'dud': expect(p.baseDemand, ctx).toBeLessThanOrEqual(0.4); expect(p.scaleCeiling, ctx).toBeLessThanOrEqual(200); break
        case 'trap': expect(p.defectRate >= 0.2 || p.claimRisk >= 0.6, ctx).toBe(true); break
        default: break
      }
    }
  })

  it('releases ~25 products at day 0 and the rest within ~200 days, at most 3 per week', () => {
    const day0 = PRODUCTS.filter(p => p.releaseDay === 0).length
    expect(day0).toBeGreaterThanOrEqual(22)
    expect(day0).toBeLessThanOrEqual(28)
    const later = PRODUCTS.filter(p => p.releaseDay > 0)
    for (const p of later) expect(p.releaseDay, p.id).toBeLessThanOrEqual(200)
    const perWeek: Record<number, number> = {}
    for (const p of later) perWeek[Math.floor(p.releaseDay / 7)] = (perWeek[Math.floor(p.releaseDay / 7)] ?? 0) + 1
    for (const n of Object.values(perWeek)) expect(n).toBeLessThanOrEqual(3)
    // emerging products are listed before they peak
    for (const p of PRODUCTS.filter(x => x.archetype === 'emerging')) expect(p.releaseDay, p.id).toBeLessThan(p.trend.peakDay)
  })

  it('public signals correlate with hidden truth', () => {
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const shown = (p: (typeof PRODUCTS)[number]) => p.publicSignals.rating - 1.2 * p.defectRate
    const by = (a: string) => PRODUCTS.filter(p => p.archetype === a)
    // traps look great but their visible rating is dragged down by defects
    expect(Math.max(...by('trap').filter(p => p.defectRate >= 0.2).map(shown))).toBeLessThan(avg(by('winner').map(shown)))
    // saturated products have far more competitors than winners
    expect(avg(by('saturated').map(p => p.startCompetitors))).toBeGreaterThan(3 * avg(by('winner').map(p => p.startCompetitors)))
    // duds: the Amazin anchor leaves no room for a markup
    const anchor = (p: (typeof PRODUCTS)[number]) => (p.amazonPrice ?? 0) / (p.cogs * (1 + dutyPctFor(p)) + p.shipCost)
    expect(avg(by('dud').map(anchor))).toBeLessThan(2.6)
    expect(avg(by('winner').map(anchor))).toBeGreaterThan(3)
    // Choice-line items ship in the AliExprez Choice window once customs is added
    for (const p of PRODUCTS.filter(x => x.publicSignals.choice)) expect(p.shipDays[1] + BENCHMARKS.shipping.customsExtraDays[1]).toBeLessThanOrEqual(BENCHMARKS.shipping.aliChoice[1] + 2)
  })
})
