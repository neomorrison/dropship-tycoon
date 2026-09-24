import { describe, expect, it } from 'vitest'
import type { GameState, Order } from '../../../core/types'
import { BENCHMARKS } from '../../../data/benchmarks'
import { dayOf } from '../../../core/time'
import {
  allProducts, bulkQuote, completeResearch, findProduct, fulfillmentFor, getProduct, marketHistory, placeBulkOrder,
  productAppeal, publicListing, researchInsights, setFulfillmentMode, spyData, subscribeSpyTool, takeInventory,
  toggleFavorite, orderSample, marketCompetitionMult,
} from '..'
import { spyDataUnchecked } from '../listing'
import { dutyPctFor } from '../sourcing'
import { advanceDays, advanceTo, makeState } from './fixture'

function isStrong(s: GameState, id: string): boolean {
  const p = getProduct(id)
  const a = productAppeal(s, id)
  if (p.archetype === 'winner' || p.archetype === 'highticket') return a >= 0.6
  if (p.archetype === 'emerging') return s.catalog.market[id].trendIndex >= 0.75
  return false
}

function fakeOrder(s: GameState, id: number, catalogId: string, total: number, dayOffset = 0): Order {
  const hour = s.time.hour - dayOffset * 24
  return {
    id, hour, storeProductId: `sp_${catalogId}`, catalogId, qty: 1, subtotal: total, discount: 0, shippingCharged: 0, total, upsell: 0,
    source: 'fadbook', device: 'mobile', customer: { name: 'A B', email: 'a@b.c', city: 'Austin', region: 'TX', returning: false },
    financial: 'paid', fulfillment: 'unfulfilled', fulfilledBy: 'dropship', shipDay: null, deliverDay: dayOf(hour) + 20, deliveredDay: null,
    promisedMaxDays: null, cogs: 8, shippingCost: 2, fees: 1.2, refunded: 0, defective: false,
  }
}

describe('market simulation', () => {
  it('about 1 in 6–8 available products is strong on a random day', () => {
    const fractions: number[] = []
    for (const seed of [11, 22]) {
      const s = makeState({ seed })
      advanceDays(s, 400, day => {
        if (day % 9 !== 0) return
        const strong = s.catalog.available.filter(id => isStrong(s, id)).length
        fractions.push(strong / s.catalog.available.length)
      })
    }
    const avg = fractions.reduce((a, b) => a + b, 0) / fractions.length
    expect(avg).toBeGreaterThanOrEqual(1 / 8.5)
    expect(avg).toBeLessThanOrEqual(1 / 5.5)
  })

  it('productAppeal stays within 0.05–1.7 across 400 days for all products (every difficulty)', () => {
    for (const difficulty of ['chill', 'normal', 'realistic'] as const) {
      const s = makeState({ difficulty, seed: 7 })
      let lo = Infinity
      let hi = -Infinity
      advanceDays(s, 400, () => {
        for (const p of allProducts()) {
          const a = productAppeal(s, p.id)
          lo = Math.min(lo, a)
          hi = Math.max(hi, a)
        }
      })
      expect(lo).toBeGreaterThanOrEqual(0.05)
      expect(hi).toBeLessThanOrEqual(1.7)
    }
  })

  it('releases products over time and emerging products emerge within ~200 days', () => {
    const s = makeState()
    expect(s.catalog.available.length).toBe(25)
    advanceTo(s, 200)
    expect(s.catalog.available.length).toBe(63)
    for (const p of allProducts().filter(x => x.archetype === 'emerging')) {
      expect(p.trend.emergeDay).toBeLessThanOrEqual(200)
      // at peak an emerging product is a real opportunity
      const t = makeState()
      advanceTo(t, p.trend.peakDay)
      expect(t.catalog.market[p.id].trendIndex, p.id).toBeGreaterThan(0.85)
    }
  })

  it('saturated products keep many competitors; duds shed them; competition raises CPM', () => {
    const s = makeState({ seed: 3 })
    advanceDays(s, 120)
    const m = s.catalog.market
    expect(m['portable-blender'].competitors).toBeGreaterThan(40)
    expect(m['oil-sprayer'].competitors).toBeLessThan(30)
    expect(marketCompetitionMult(s, 'portable-blender')).toBeGreaterThan(marketCompetitionMult(s, 'heatless-curler'))
    expect(marketCompetitionMult(s, 'portable-blender')).toBeLessThanOrEqual(1.45)
    expect(s.events.modifiers.competitionMult['portable-blender']).toBeCloseTo(marketCompetitionMult(s, 'portable-blender'), 2)
    expect(marketHistory(s, 'portable-blender').length).toBeGreaterThan(20)
  })

  it('public listing reflects hidden defects and demand', () => {
    const s = makeState()
    const trap = publicListing(s, 'blackhead-vacuum')!
    const winner = publicListing(s, 'pet-hair-roller')!
    expect(trap.rating).toBeLessThan(winner.rating)
    expect(trap.price).toBeCloseTo(getProduct('blackhead-vacuum').cogs, 2)
    expect(trap.originalPrice).toBeGreaterThan(trap.price)
    expect(winner.shipDays[0]).toBeGreaterThanOrEqual(getProduct('pet-hair-roller').shipDays[0] + 2)
    expect(publicListing(s, 'red-light-wand')).toBeNull() // not released yet
    const sat = publicListing(s, 'portable-blender')!
    expect(sat.orders30d).toBeGreaterThan(winner.orders30d)
  })

  it('spy data requires Mineo and its most engaging ads use hooks that fit the product', () => {
    const s = makeState()
    expect(spyData(s, 'pet-hair-roller')).toBeNull()
    expect(subscribeSpyTool(s)).toBe(true)
    const d = spyData(s, 'pet-hair-roller')!
    expect(d).not.toBeNull()
    expect(d.topAds.length).toBeGreaterThanOrEqual(2)
    const p = getProduct('pet-hair-roller')
    expect(p.bestHooks).toContain(d.topAds[0].hookId)
    // saturated: many, old ads; emerging: few, recent
    const sat = spyDataUnchecked(s, 'veggie-chopper')!
    const t = makeState()
    advanceTo(t, 40)
    const emerging = spyDataUnchecked(t, 'heatless-curler')!
    expect(sat.activeAds).toBeGreaterThan(emerging.activeAds)
    expect(sat.firstSeenDaysAgo).toBeGreaterThan(emerging.firstSeenDaysAgo)
  })

  it('research insights deepen with research level', () => {
    const s = makeState()
    const id = 'spin-scrubber'
    const l0 = researchInsights(s, id)
    completeResearch(s, id)
    const l1 = researchInsights(s, id)
    completeResearch(s, id)
    completeResearch(s, id)
    const l3 = researchInsights(s, id)
    expect(l0.length).toBe(1)
    expect(l1.length).toBeGreaterThan(l0.length)
    expect(l3.length).toBeGreaterThan(l1.length)
    expect(s.catalog.research[id]).toBe(3)
    expect(l3.join(' ')).toMatch(/willing to pay/)
  })

  it('fulfillmentFor includes import duty and customs days', () => {
    const s = makeState()
    for (const p of allProducts()) {
      const f = fulfillmentFor(s, p.id)
      expect(f.mode).toBe('dropship')
      expect(f.duty!).toBeGreaterThan(0)
      expect(f.unitCost).toBeCloseTo(p.cogs * (1 + dutyPctFor(p)), 1)
      expect(dutyPctFor(p)).toBeGreaterThanOrEqual(BENCHMARKS.shipping.chinaDutyPct[0])
      expect(dutyPctFor(p)).toBeLessThanOrEqual(BENCHMARKS.shipping.chinaDutyPct[1])
      expect(f.shipDays[0]).toBe(p.shipDays[0] + BENCHMARKS.shipping.customsExtraDays[0])
      expect(f.shipDays[1]).toBe(p.shipDays[1] + BENCHMARKS.shipping.customsExtraDays[1])
    }
  })

  it('samples are paid and arrive', () => {
    const s = makeState()
    const cash = s.finance.cash + (s.finance.card.limit - s.finance.card.balance)
    expect(orderSample(s, 'dog-paw-cleaner')).toBe(false) // not released yet
    expect(orderSample(s, 'pet-hair-roller')).toBe(true)
    expect(s.finance.cash + (s.finance.card.limit - s.finance.card.balance)).toBeLessThan(cash)
    advanceDays(s, 40)
    expect(s.catalog.samplesOwned).toContain('pet-hair-roller')
    toggleFavorite(s, 'pet-hair-roller')
    expect(s.catalog.favorites).toContain('pet-hair-roller')
    toggleFavorite(s, 'pet-hair-roller')
    expect(s.catalog.favorites).not.toContain('pet-hair-roller')
  })

  it('100 store orders unlock the agent (mail from Lily); bulk stock lands at the 3PL with duty paid', () => {
    const s = makeState()
    const id = 'pet-hair-roller'
    for (let i = 0; i < 110; i++) s.store.orders.push(fakeOrder(s, 1001 + i, id, 29.99))
    advanceDays(s, 1)
    expect(s.catalog.unlocks.agent).toBe(true)
    expect(s.catalog.unlocks.threePL).toBe(true)
    expect(s.inbox.some(m => /SourcePro/.test(m.from))).toBe(true)
    const q = bulkQuote(s, id, 100, 'sea', 'bulk')
    expect(q.ok).toBe(false) // below MOQ
    const p = findProduct(id)!
    const ok = bulkQuote(s, id, p.moq, 'air', 'bulk')
    expect(ok.ok).toBe(true)
    expect(ok.duty).toBeCloseTo(ok.goods * dutyPctFor(p), 1)
    s.finance.cash = 50_000
    expect(placeBulkOrder(s, id, p.moq, 'air', 'bulk')).toBe(true)
    advanceDays(s, 40)
    expect(s.catalog.inventory[id].units).toBe(p.moq)
    expect(s.catalog.sourcing[id].mode).toBe('bulk')
    const f = fulfillmentFor(s, id)
    expect(f.mode).toBe('bulk')
    expect(f.shipDays).toEqual(BENCHMARKS.shipping.usWarehouse3pl)
    expect(f.unitCost).toBeGreaterThan(p.bulkCogs) // landed incl. freight & duty
    expect(takeInventory(s, id, 1)).toBe(true)
    expect(s.catalog.inventory[id].units).toBe(p.moq - 1)
    s.catalog.inventory[id].units = 0
    expect(takeInventory(s, id, 1)).toBe(false)
    const fb = fulfillmentFor(s, id)
    expect(fb.inStock).toBe(false)
    expect(fb.mode).toBe('dropship')
    setFulfillmentMode(s, id, 'agent')
    expect(fulfillmentFor(s, id).mode).toBe('agent')
    expect(fulfillmentFor(s, id).shipCost).toBeGreaterThanOrEqual(4.5)
  })

  it('bulk orders placed before Chinese New Year are delayed by the factory closure', () => {
    const s = makeState()
    s.catalog.unlocks.agent = s.catalog.unlocks.threePL = true
    const normal = bulkQuote(s, 'pet-hair-roller', 500, 'sea', 'bulk')
    const t = makeState()
    t.catalog.unlocks.agent = t.catalog.unlocks.threePL = true
    advanceTo(t, 330) // a few days before the CNY 2027 closure (day 334)
    const cny = bulkQuote(t, 'pet-hair-roller', 500, 'sea', 'bulk')
    expect(cny.expectedShipDay - 330).toBeGreaterThan(normal.expectedShipDay - 0 + 14)
  })
})
