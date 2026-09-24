import { describe, expect, it } from 'vitest'
import { createAd, createAdSet, createAudience, createCampaign, openAdAccount, sumStats, deriveMetrics } from '..'
import { findAd } from '../shared'
import { makeGame, runHours, strongCreative } from './helpers'

describe('bidding, Advantage+ and audiences', () => {
  it('Advantage+ campaigns force broad targeting and a campaign budget', () => {
    const { s } = makeGame()
    openAdAccount(s, 'fadbook')
    s.skills.media_buying.level = 2
    const c = createCampaign(s, { platform: 'fadbook', name: 'ASC', kind: 'advantage', budgetMode: 'abo', dailyBudget: 60 })!
    const camp = s.ads.campaigns.find(x => x.id === c)!
    expect(camp.budgetMode).toBe('cbo')
    const set = createAdSet(s, { campaignId: c, name: 'All', targeting: { type: 'interest', interests: ['Dogs'], ageMin: 25, ageMax: 40 } })!
    const t = s.ads.adSets.find(x => x.id === set)!.targeting
    expect(t.type).toBe('broad')
    expect(t.interests).toEqual([])
  })

  it('a cost cap far below the achievable CPA throttles delivery', () => {
    const run = (cap: number | null) => {
      const { s, sp } = makeGame({ seed: 77 })
      openAdAccount(s, 'fadbook')
      s.skills.media_buying.level = 3
      const cr = strongCreative(s)
      const c = createCampaign(s, { platform: 'fadbook', name: 'C', budgetMode: 'cbo', dailyBudget: 45, bidStrategy: cap ? 'cost_cap' : 'lowest_cost', costCap: cap })!
      const set = createAdSet(s, { campaignId: c, name: 'S' })!
      findAd(s, createAd(s, { adSetId: set, name: 'A', creativeId: cr.id, storeProductId: sp.id, primaryText: 'Pet hair everywhere? One swipe.', headline: 'Gone' })!)!.review = 'approved'
      runHours(s, 24 * 4, sp.price)
      return sumStats(s.ads.ads.flatMap(a => Object.values(a.stats))).spend
    }
    const open = run(null)
    const capped = run(2)
    expect(capped).toBeLessThan(open * 0.3)
  })

  it('retargeting converts warm traffic but can only spend what a small audience absorbs', () => {
    const { s, sp } = makeGame({ seed: 81 })
    openAdAccount(s, 'fadbook')
    s.ads.accounts[0].spendLimitTier = 3
    const day = Math.floor(s.time.hour / 24)
    for (let d = day - 30; d <= day; d++) (s.store.analytics.daily as Record<number, { sessions: number }>)[d] = { sessions: 60 } as never
    const aud = createAudience(s, 'fadbook', 'retargeting', 30)!
    const cr = strongCreative(s)
    const c = createCampaign(s, { platform: 'fadbook', name: 'RT', budgetMode: 'abo' })!
    const set = createAdSet(s, { campaignId: c, name: 'Visitors 30d', dailyBudget: 300, targeting: { type: 'retargeting', audienceId: aud } })!
    findAd(s, createAd(s, { adSetId: set, name: 'A', creativeId: cr.id, storeProductId: sp.id, primaryText: 'Still thinking about it? Free shipping today.', headline: 'Come back' })!)!.review = 'approved'
    runHours(s, 48, sp.price)
    const st = sumStats(s.ads.ads.flatMap(a => Object.values(a.stats)))
    const m = deriveMetrics(st)
    expect(st.spend).toBeLessThan(300) // 2 days × $300 budget, mostly unspendable
    expect(m.cpm).toBeGreaterThan(20)
    expect(m.ctrLink).toBeGreaterThan(0.02)
    expect(s.ads.ads[0].frequency).toBeGreaterThan(1.5)
  })
})
