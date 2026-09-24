// Balance guards for the tuning pass (see scripts/smoke.ts --seeds/--difficulty for the full sweep):
// clean accounts rarely get restricted, risky behavior does; reach/frequency builds realistically
// with spend; diminishing returns bend instead of exploding.
import { describe, expect, it } from 'vitest'
import { openAdAccount } from '..'
import { accountBanRisk } from '../accounts'
import type { Creative } from '../../../core/types'
import { fatigueFactor, pocketSize, scaleCeilingNow, scalePressure } from '../delivery'
import { getProduct } from '../../market'
import { DEFAULT_TARGETING } from '../structure'
import { makeGame } from './helpers'

/** P(restricted at least once) over `days` at a constant daily hazard. */
const overDays = (p: number, days: number) => 1 - Math.pow(1 - p, days)

describe('ban risk follows behavior', () => {
  it('a clean, aged account on Normal sits near 3–5% over 150 days', () => {
    const { s } = makeGame({ seed: 21 })
    const id = openAdAccount(s, 'fadbook')
    const acc = s.ads.accounts.find(a => a.id === id)!
    acc.createdDay = -60 // aged
    acc.quality = 75
    const p = accountBanRisk(s, acc).p
    expect(overDays(p, 150)).toBeGreaterThan(0.025)
    expect(overDays(p, 150)).toBeLessThan(0.06)
  })

  it('failed payments, budget spikes and low quality multiply the risk', () => {
    const { s } = makeGame({ seed: 22 })
    const id = openAdAccount(s, 'fadbook')
    const acc = s.ads.accounts.find(a => a.id === id)!
    acc.createdDay = -60
    acc.quality = 75
    const clean = accountBanRisk(s, acc).p
    const risky = accountBanRisk(s, { ...acc, failedPayments: 3, budgetJumpDay: Math.floor(s.time.hour / 24), quality: 35 }).p
    expect(risky / clean).toBeGreaterThan(25)
    expect(overDays(risky, 30)).toBeGreaterThan(0.2)
  })
})

describe('reach & frequency', () => {
  it('the likely-buyer pocket widens slowly with budget, so 7-day frequency climbs at scale', () => {
    const size = 200_000_000
    const small = pocketSize(DEFAULT_TARGETING, size, 1, 50)
    const big = pocketSize(DEFAULT_TARGETING, size, 1, 3000)
    expect(big).toBeGreaterThan(small)
    expect(big / small).toBeLessThan(3)
    // 7-day frequency of an ad spending d/day at a ~$16 CPM against that pocket (same curve as delivery)
    const freq = (d: number, setSpend: number) => {
      const imps = (d / 16) * 1000 * 7
      const pool = pocketSize(DEFAULT_TARGETING, size, 1, setSpend)
      return (imps * 1.06) / (pool * (1 - Math.exp(-imps / pool)))
    }
    expect(freq(25, 50)).toBeLessThan(1.3) // testing budgets: ~1.1
    expect(freq(750, 3000)).toBeGreaterThan(1.8) // one of 3–4 ads in a $3k/day ad set
    expect(freq(750, 3000)).toBeLessThan(3.2)
    expect(freq(1500, 3000)).toBeGreaterThan(3) // one creative carrying half of it: the "frequency > 3" refresh signal
  })
})

describe('diminishing returns', () => {
  it('CPA pressure is gentle at test budgets, tracks a ~0.7 spend elasticity while scaling, and bends past the ceiling', () => {
    expect(scalePressure(0.05)).toBeLessThan(1.05)
    expect(scalePressure(0.1)).toBeLessThan(1.15)
    // 10x budget across the normal scaling range: CPA ~2x (revenue ∝ spend^0.6–0.8)
    const tenX = scalePressure(0.5) / scalePressure(0.05)
    expect(tenX).toBeGreaterThan(Math.pow(10, 0.2))
    expect(tenX).toBeLessThan(Math.pow(10, 0.4))
    expect(scalePressure(1)).toBeGreaterThan(3)
    expect(scalePressure(1)).toBeLessThanOrEqual(5)
    const r2 = scalePressure(2), r5 = scalePressure(5)
    expect(r5 / r2).toBeLessThan(2) // bends: 2.5x more overspend is not 2.5x worse
  })
})

describe('creative fatigue is a frequency knee', () => {
  const cr = (quality: number, shared = false) => ({ quality, shared } as Creative)
  it('an average creative barely tires below 2 and clearly tires past 3 (the refresh signal)', () => {
    const f = (x: number) => fatigueFactor('fadbook', cr(0.6), x, 0)
    expect(f(1)).toBe(1)
    expect(f(1.5)).toBeGreaterThan(0.94)
    expect(f(2)).toBeGreaterThan(0.85)
    expect(f(2.5)).toBeLessThan(0.9)
    expect(f(3)).toBeLessThan(0.8)
    expect(f(3)).toBeGreaterThan(0.6)
    expect(f(4)).toBeLessThan(0.6)
  })
  it('shared supplier footage and TikTak tire sooner; age adds on top', () => {
    const own = fatigueFactor('fadbook', cr(0.3), 2, 0)
    const shared = fatigueFactor('fadbook', cr(0.3, true), 2, 0)
    expect(shared).toBeLessThan(own)
    expect(fatigueFactor('tiktak', cr(0.6), 2, 0)).toBeLessThan(fatigueFactor('fadbook', cr(0.6), 2, 0))
    expect(fatigueFactor('fadbook', cr(0.6), 1, 40)).toBeCloseTo(1 - 0.006 * 40, 5)
  })
})

describe('scale ceiling', () => {
  it("uses the authored ceiling at launch-day demand (a dud's low demand is not counted twice)", () => {
    const dud = getProduct('dog-lick-mat')
    const launch = dud.baseDemand * (1 - 0.55 * dud.startSaturation)
    expect(scaleCeilingNow(dud, launch)).toBeCloseTo(dud.scaleCeiling, 5)
    const win = getProduct('pet-hair-roller')
    const winLaunch = win.baseDemand * (1 - 0.55 * win.startSaturation)
    expect(scaleCeilingNow(win, winLaunch)).toBeCloseTo(win.scaleCeiling, 5)
    // copycats / a fading trend shrink it; a seasonal peak can lift it (capped)
    expect(scaleCeilingNow(win, winLaunch * 0.6)).toBeCloseTo(win.scaleCeiling * 0.6, 5)
    expect(scaleCeilingNow(win, winLaunch * 3)).toBeCloseTo(win.scaleCeiling * 1.6, 5)
  })
})
