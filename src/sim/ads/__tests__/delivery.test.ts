import { describe, expect, it } from 'vitest'
import type { GameState, Platform } from '../../../core/types'
import {
  createAd, createAdSet, createCampaign, deriveMetrics, deliveryLabel, openAdAccount, sumStats, updateAdSet,
} from '..'
import { findAd, adTotals } from '../shared'
import { makeGame, runHours, strongCreative, weakCreative } from './helpers'

function launch(s: GameState, platform: Platform, creativeId: string, spId: string, budget: number, name: string) {
  const campaignId = createCampaign(s, { platform, name: `${name} campaign`, budgetMode: 'abo' })!
  const adSetId = createAdSet(s, { campaignId, name: `${name} ad set`, dailyBudget: budget, targeting: { type: 'broad' } })!
  const primaryText = platform === 'tiktak'
    ? 'Pet hair on everything? This roller lifts it off in seconds 🐾'
    : 'Pet hair on everything? This roller lifts it off your couch in seconds. Over 10,000 happy customers. Free shipping.'
  const adId = createAd(s, { adSetId, name, creativeId, storeProductId: spId, primaryText, headline: 'Pet hair gone in one swipe', cta: 'shop_now' })!
  const ad = findAd(s, adId)!
  ad.review = 'approved' // skip the random policy review in tests
  ad.reviewDoneHour = s.time.hour
  return { campaignId, adSetId, adId }
}

function sevenDayRun(seed: number, platform: Platform = 'fadbook') {
  const { s, sp } = makeGame({ seed })
  const acc = openAdAccount(s, platform)
  expect(acc).toBeTruthy()
  const strong = strongCreative(s)
  const weak = weakCreative(s)
  const budget = platform === 'tiktak' ? 25 : 20
  const a = launch(s, platform, strong.id, sp.id, budget, 'Strong')
  const b = launch(s, platform, weak.id, sp.id, budget, 'Weak')
  runHours(s, 24 * 7, sp.price)
  const st = sumStats(Object.values(findAd(s, a.adId)!.stats))
  const wt = sumStats(Object.values(findAd(s, b.adId)!.stats))
  return { s, sp, strong, weak, a, b, st, wt }
}

describe('ads delivery model', () => {
  it('produces realistic Fadbook metrics over 7 days', () => {
    const { s, st, wt, strong, weak } = sevenDayRun(42)
    for (const x of [st, wt]) {
      const m = deriveMetrics(x)
      expect(x.spend).toBeGreaterThan(50)
      expect(m.cpm).toBeGreaterThan(6)
      expect(m.cpm).toBeLessThan(40)
      // the "weak" fixture is the worst-fitting brief on shared supplier footage; ~0.25–0.45% link CTR is realistic for it
      expect(m.ctrLink).toBeGreaterThan(0.002)
      expect(m.ctrLink).toBeLessThan(0.04)
      expect(x.reach).toBeGreaterThan(0)
      expect(x.lpv).toBeLessThanOrEqual(x.linkClicks)
      expect(x.clicks).toBeGreaterThanOrEqual(x.linkClicks)
    }
    if (strong.isVideo) {
      const hr = deriveMetrics(st).hookRate
      expect(hr).toBeGreaterThan(0.1)
      expect(hr).toBeLessThan(0.6)
    }
    if (weak.isVideo) {
      const hr = deriveMetrics(wt).hookRate
      expect(hr).toBeGreaterThan(0.1)
      expect(hr).toBeLessThan(0.6)
    }
    // account billing happened through pay()
    const acc = s.ads.accounts[0]
    expect(acc.lifetimeSpend).toBeGreaterThan(100)
    expect((acc.billingHistory ?? []).some(b => b.status === 'paid')).toBe(true)
    const pnlSpend = Object.values(s.finance.pnl).reduce((a, p) => a + p.adSpendFadbook, 0)
    expect(pnlSpend + acc.unbilled).toBeCloseTo(acc.lifetimeSpend, 0)
  })

  it('a strong creative clearly beats a weak one on CTR and CPM', () => {
    let wins = 0
    for (const seed of [1, 2, 3, 4, 5]) {
      const { st, wt } = sevenDayRun(seed)
      const ms = deriveMetrics(st)
      const mw = deriveMetrics(wt)
      expect(ms.ctrLink).toBeGreaterThan(mw.ctrLink * 1.5)
      expect(ms.cpm).toBeLessThan(mw.cpm)
      if (ms.cpa > 0 && (mw.cpa === 0 || ms.cpa < mw.cpa)) wins++
    }
    expect(wins).toBeGreaterThanOrEqual(4)
  })

  it('works on TikTak with its own video metrics', () => {
    const { st, strong } = sevenDayRun(7, 'tiktak')
    const m = deriveMetrics(st)
    // quartiles follow the same retention curve as the 2 s / 6 s views
    expect(st.v25).toBeGreaterThanOrEqual(st.v50)
    expect(st.v50).toBeGreaterThanOrEqual(st.v75)
    expect(st.v75).toBeGreaterThanOrEqual(st.v100)
    if (strong.durationSec >= 12) expect(st.v50).toBeLessThanOrEqual(st.videoViewsLong)
    expect(m.cpm).toBeGreaterThan(4)
    expect(m.cpm).toBeLessThan(35)
    expect(m.hookRate).toBeGreaterThan(0.1)
    expect(m.hookRate).toBeLessThan(0.7)
    expect(m.view6sRate).toBeLessThan(m.hookRate)
  })

  it('Fadbook reports at least as many purchases as really happened (on average)', () => {
    let reported = 0
    let truth = 0
    for (const seed of [11, 12, 13]) {
      const { s, a, b } = sevenDayRun(seed)
      runHours(s, 72, 30) // let delayed reports land
      for (const id of [a.adId, b.adId]) {
        const t = adTotals(findAd(s, id)!)
        reported += t.purchases
        truth += t.truePurchases
      }
    }
    expect(truth).toBeGreaterThan(5)
    expect(reported).toBeGreaterThanOrEqual(truth)
  })

  it('learning resets after a >20% Fadbook budget jump but not after a gentle +15%', () => {
    const { s, sp } = makeGame({ seed: 99 })
    openAdAccount(s, 'fadbook')
    const cr = strongCreative(s)
    const x = launch(s, 'fadbook', cr.id, sp.id, 40, 'Scale test')
    runHours(s, 24 * 3, sp.price)
    const set = s.ads.adSets.find(a => a.id === x.adSetId)!
    const resetBefore = set.learning.resetHour
    updateAdSet(s, set.id, { dailyBudget: 46 }) // +15%
    expect(set.learning.resetHour).toBe(resetBefore)
    runHours(s, 30, sp.price)
    updateAdSet(s, set.id, { dailyBudget: 46 * 1.5 }) // +50%
    expect(set.learning.resetHour).toBe(s.time.hour)
    expect(set.learning.state).toBe('learning')
    expect(set.learning.window.every(v => v === 0)).toBe(true)
    expect(deliveryLabel(s, 'adset', set.id).label).toBe('Learning')
  })

  it('stops delivering when the account payment fails and resumes after paying', () => {
    const { s, sp } = makeGame({ seed: 5 })
    const accId = openAdAccount(s, 'fadbook')!
    const cr = strongCreative(s)
    launch(s, 'fadbook', cr.id, sp.id, 40, 'Billing test')
    s.finance.cash = 0
    s.finance.card.limit = 10
    runHours(s, 24, sp.price)
    const acc = s.ads.accounts.find(a => a.id === accId)!
    expect(acc.status).toBe('payment_failed')
    const spendAtFail = acc.lifetimeSpend
    runHours(s, 24, sp.price)
    expect(acc.lifetimeSpend).toBeCloseTo(spendAtFail, 5)
    s.finance.cash = 5000
    const ok = (async () => (await import('..')).payAdBalance(s, accId))()
    return ok.then(paid => {
      expect(paid).toBe(true)
      expect(acc.status).toBe('active')
    })
  })
})
