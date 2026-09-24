import { describe, expect, it } from 'vitest'
import type { GameState } from '../../../core/types'
import {
  adsDayRollover, adsRecordConversions, adsTickHour, createAd, createAdSet, createAudience, createCampaign, deleteRule,
  deliveryLabel, duplicateEntity, effectiveBudget, estimateAudienceSize, openAdAccount, postOrganic, searchInterests,
  setEntityStatus, sparkPost, updateAd, updateCampaign, upsertRule, validateCampaignInput, validateAdSetInput, wouldResetLearning,
  DEFAULT_TARGETING, sumStats,
} from '..'
import { INTERESTS } from '../../../data/interests'
import { findAd, adTotals } from '../shared'
import { makeGame, runHours, strongCreative, weakCreative } from './helpers'

function abo(s: GameState, budget: number, creativeId: string, platform: 'fadbook' | 'tiktak' = 'fadbook') {
  const campaignId = createCampaign(s, { platform, name: 'C', budgetMode: 'abo' })!
  const adSetId = createAdSet(s, { campaignId, name: 'S', dailyBudget: budget })!
  const adId = createAd(s, { adSetId, name: 'A', creativeId, storeProductId: 'sp_test', primaryText: 'Pet hair everywhere? One swipe.', headline: 'Gone' })!
  findAd(s, adId)!.review = 'approved'
  return { campaignId, adSetId, adId }
}

describe('structure & validation', () => {
  it('enforces TikTak minimum budgets and media-buying skill gates', () => {
    const { s } = makeGame()
    openAdAccount(s, 'tiktak')
    openAdAccount(s, 'fadbook')
    expect(validateCampaignInput(s, { platform: 'tiktak', name: 'x', budgetMode: 'cbo', dailyBudget: 30 })).toMatch(/\$50/)
    const c = createCampaign(s, { platform: 'tiktak', name: 'x', budgetMode: 'abo' })!
    expect(validateAdSetInput(s, { campaignId: c, name: 'g', dailyBudget: 15 })).toMatch(/\$20/)
    expect(createAdSet(s, { campaignId: c, name: 'g', dailyBudget: 15 })).toBeNull()
    expect(createAdSet(s, { campaignId: c, name: 'g', dailyBudget: 20 })).toBeTruthy()
    s.skills.media_buying.level = 1
    expect(validateCampaignInput(s, { platform: 'fadbook', name: 'asc', kind: 'advantage', budgetMode: 'cbo', dailyBudget: 50 })).toMatch(/level 2/)
    expect(validateCampaignInput(s, { platform: 'fadbook', name: 'cc', budgetMode: 'cbo', dailyBudget: 50, bidStrategy: 'cost_cap', costCap: 20 })).toMatch(/level 3/)
    s.skills.media_buying.level = 3
    expect(validateCampaignInput(s, { platform: 'fadbook', name: 'cc', budgetMode: 'cbo', dailyBudget: 50, bidStrategy: 'cost_cap', costCap: 20 })).toBeNull()
    expect(validateCampaignInput(s, { platform: 'fadbook', name: 'x', budgetMode: 'cbo', dailyBudget: 2 })).toMatch(/\$5/)
  })

  it('warns about a missing pixel; without it traffic is low-intent and learning never completes', () => {
    const { s, sp } = makeGame({ pixel: false, seed: 31 })
    openAdAccount(s, 'fadbook')
    const cr = strongCreative(s)
    const before = s.notifications.length
    const x = abo(s, 50, cr.id)
    expect(s.notifications.slice(before).some(n => n.title === 'No pixel events')).toBe(true)
    let intents: number[] = []
    for (let i = 0; i < 24 * 5; i++) {
      s.time.hour++
      if (s.time.hour % 24 === 0) adsDayRollover(s, s.time.hour / 24)
      const packets = adsTickHour(s)
      intents = intents.concat(packets.map(p => p.intent))
      adsRecordConversions(s, packets.filter(p => p.adId).map(p => ({ adId: p.adId!, atc: 3, checkouts: 2, purchases: 1, revenue: sp.price })))
    }
    const t = adTotals(findAd(s, x.adId)!)
    expect(t.truePurchases).toBeGreaterThan(0)
    expect(t.purchases).toBe(0) // the platform sees nothing
    expect(Math.max(...intents)).toBeLessThan(0.75)
    expect(s.ads.adSets[0].learning.window.every(v => v === 0)).toBe(true)
  })

  it('new ads start in review and get approved or rejected within hours', () => {
    const { s } = makeGame({ seed: 17 })
    openAdAccount(s, 'fadbook')
    const cr = strongCreative(s)
    const c = createCampaign(s, { platform: 'fadbook', name: 'C', budgetMode: 'abo' })!
    const set = createAdSet(s, { campaignId: c, name: 'S', dailyBudget: 20 })!
    const id = createAd(s, { adSetId: set, name: 'A', creativeId: cr.id, storeProductId: 'sp_test', primaryText: 'Pet hair gone in one swipe', headline: 'Gone' })!
    expect(deliveryLabel(s, 'ad', id).label).toBe('In review')
    for (let i = 0; i < 7; i++) { s.time.hour++; adsTickHour(s) }
    expect(['approved', 'rejected']).toContain(findAd(s, id)!.review)
  })

  it('risky claims get rejected far more often than clean copy', () => {
    const { s } = makeGame({ seed: 18, difficulty: 'realistic' })
    openAdAccount(s, 'fadbook')
    const cr = strongCreative(s)
    const c = createCampaign(s, { platform: 'fadbook', name: 'C', budgetMode: 'abo' })!
    const set = createAdSet(s, { campaignId: c, name: 'S', dailyBudget: 20 })!
    let clean = 0
    let risky = 0
    for (let i = 0; i < 25; i++) {
      const a = createAd(s, { adSetId: set, name: `c${i}`, creativeId: cr.id, storeProductId: 'sp_test', primaryText: 'Lifts pet hair off the couch in one swipe.', headline: 'Pet hair, gone' })!
      const b = createAd(s, { adSetId: set, name: `r${i}`, creativeId: cr.id, storeProductId: 'sp_test', primaryText: 'Guaranteed to cure your anxiety and your acne overnight. 100% miracle results.', headline: 'Miracle cure' })!
      findAd(s, a)!.reviewDoneHour = s.time.hour + 1
      findAd(s, b)!.reviewDoneHour = s.time.hour + 1
    }
    s.time.hour += 1
    adsTickHour(s)
    for (const ad of s.ads.ads) if (ad.review === 'rejected') ad.name.startsWith('r') ? risky++ : clean++
    expect(risky).toBeGreaterThan(clean + 8)
    expect(s.ads.ads.find(a => a.review === 'rejected' && a.name.startsWith('r'))!.rejectReason).toMatch(/Personal attributes|Unrealistic/)
  })

  it('duplicates, cascades deletes and reports effective budgets', () => {
    const { s } = makeGame()
    openAdAccount(s, 'fadbook')
    const cr = strongCreative(s)
    const x = abo(s, 40, cr.id)
    const dupSet = duplicateEntity(s, 'adset', x.adSetId)!
    expect(s.ads.ads.filter(a => a.adSetId === dupSet)).toHaveLength(1)
    expect(effectiveBudget(s, 'campaign', x.campaignId)).toBe(80)
    const dupCamp = duplicateEntity(s, 'campaign', x.campaignId)!
    expect(s.ads.adSets.filter(a => a.campaignId === dupCamp)).toHaveLength(2)
    setEntityStatus(s, 'campaign', dupCamp, 'deleted')
    expect(s.ads.ads.filter(a => a.campaignId === dupCamp).every(a => a.status === 'deleted')).toBe(true)
    expect(deliveryLabel(s, 'campaign', dupCamp).label).toBe('Deleted')
  })

  it('CBO shifts budget toward the ad set with the better creative', () => {
    const { s, sp } = makeGame({ seed: 41 })
    openAdAccount(s, 'fadbook')
    s.ads.accounts[0].spendLimitTier = 3
    const good = strongCreative(s)
    const bad = weakCreative(s)
    const c = createCampaign(s, { platform: 'fadbook', name: 'CBO', budgetMode: 'cbo', dailyBudget: 100 })!
    const s1 = createAdSet(s, { campaignId: c, name: 'Good' })!
    const s2 = createAdSet(s, { campaignId: c, name: 'Bad' })!
    findAd(s, createAd(s, { adSetId: s1, name: 'g', creativeId: good.id, storeProductId: 'sp_test', primaryText: 'Pet hair everywhere? One swipe.', headline: 'Gone' })!)!.review = 'approved'
    findAd(s, createAd(s, { adSetId: s2, name: 'b', creativeId: bad.id, storeProductId: 'sp_test', primaryText: 'Buy now', headline: '' })!)!.review = 'approved'
    runHours(s, 24 * 4, sp.price)
    const spend = (id: string) => sumStats(s.ads.ads.filter(a => a.adSetId === id).flatMap(a => Object.values(a.stats))).spend
    expect(spend(s1)).toBeGreaterThan(spend(s2) * 2)
    expect(spend(s2)).toBeGreaterThan(0) // exploration floor
    expect(effectiveBudget(s, 'adset', s1)).toBeGreaterThan(effectiveBudget(s, 'adset', s2))
  })

  it('CBO budget changes are checked against learning on every child ad set', () => {
    const { s, sp } = makeGame({ seed: 44 })
    openAdAccount(s, 'fadbook')
    const cr = strongCreative(s)
    const c = createCampaign(s, { platform: 'fadbook', name: 'CBO', budgetMode: 'cbo', dailyBudget: 40 })!
    const set = createAdSet(s, { campaignId: c, name: 'S' })!
    findAd(s, createAd(s, { adSetId: set, name: 'a', creativeId: cr.id, storeProductId: 'sp_test', primaryText: 'Pet hair everywhere? One swipe.', headline: 'Gone' })!)!.review = 'approved'
    runHours(s, 48, sp.price)
    expect(wouldResetLearning(s, 'campaign', c, 46)).toBe(false)
    expect(wouldResetLearning(s, 'campaign', c, 60)).toBe(true)
    updateCampaign(s, c, { dailyBudget: 130 }) // > 3× jump
    const st = s.ads.adSets.find(a => a.id === set)!
    expect(st.learning.resetHour).toBe(s.time.hour)
    expect(s.ads.accounts[0].budgetJumpDay).toBe(Math.floor(s.time.hour / 24))
  })

  it('swapping an ad creative re-reviews it and resets learning', () => {
    const { s, sp } = makeGame({ seed: 45 })
    openAdAccount(s, 'fadbook')
    const cr = strongCreative(s)
    const cr2 = strongCreative(s)
    const x = abo(s, 30, cr.id)
    runHours(s, 30, sp.price)
    updateAd(s, x.adId, { creativeId: cr2.id })
    expect(findAd(s, x.adId)!.review).toBe('in_review')
    expect(s.ads.adSets[0].learning.resetHour).toBe(s.time.hour)
  })
})

describe('audiences & targeting', () => {
  it('has a large realistic interest catalog with sensible search', () => {
    expect(INTERESTS.length).toBeGreaterThanOrEqual(150)
    expect(new Set(INTERESTS.map(i => i.id)).size).toBe(INTERESTS.length)
    const dogs = searchInterests('dog', 'fadbook')
    expect(dogs.length).toBeGreaterThan(3)
    expect(dogs[0].name.toLowerCase().startsWith('dog')).toBe(true)
    expect(searchInterests('', 'tiktak').length).toBeGreaterThan(10)
    expect(searchInterests('dog owners', 'tiktak').some(i => i.name === 'Dog owners')).toBe(false) // Fadbook-only behavior
    const tt = searchInterests('Dogs', 'tiktak')[0]
    const fb = searchInterests('Dogs', 'fadbook')[0]
    expect(tt.size).toBeLessThan(fb.size)
  })

  it('estimates audience sizes like Ads Manager', () => {
    const { s } = makeGame()
    const broad = estimateAudienceSize(s, 'fadbook', DEFAULT_TARGETING)
    expect(broad).toBeGreaterThan(200_000_000)
    expect(broad).toBeLessThan(300_000_000)
    const women = estimateAudienceSize(s, 'fadbook', { ...DEFAULT_TARGETING, gender: 'female', ageMin: 25, ageMax: 44 })
    expect(women).toBeLessThan(broad * 0.4)
    const pets = estimateAudienceSize(s, 'fadbook', { ...DEFAULT_TARGETING, type: 'interest', interests: ['Dog grooming', 'French Bulldog'] })
    expect(pets).toBeGreaterThan(5_000_000)
    expect(pets).toBeLessThan(9_000_000)
    expect(estimateAudienceSize(s, 'tiktak', DEFAULT_TARGETING)).toBeLessThan(broad)
  })

  it('lookalikes need 100 pixel purchasers; retargeting is sized from store sessions', () => {
    const { s } = makeGame()
    s.store.pixel.fadbook.purchases = 40
    expect(createAudience(s, 'fadbook', 'lookalike', 1)).toBeNull()
    s.store.pixel.fadbook.purchases = 140
    const lal = createAudience(s, 'fadbook', 'lookalike', 3)!
    expect(s.ads.audiences.find(a => a.id === lal)!.size).toBeGreaterThan(6_000_000)
    const day = Math.floor(s.time.hour / 24)
    for (let d = day - 10; d <= day; d++) (s.store.analytics.daily as Record<number, { sessions: number }>)[d] = { sessions: 800 } as never
    const rt = createAudience(s, 'fadbook', 'retargeting', 30)!
    const size = s.ads.audiences.find(a => a.id === rt)!.size
    expect(size).toBeGreaterThan(3000)
    expect(size).toBeLessThan(8800)
  })
})

describe('organic, rules and housekeeping', () => {
  it('organic TikTak posts get views and send link-in-bio sessions; posts can be Spark-boosted', () => {
    const { s } = makeGame({ seed: 51 })
    const cr = strongCreative(s)
    postOrganic(s, cr.id, 'sp_test')
    const post = s.ads.organicPosts[0]
    let sessions = 0
    for (let i = 0; i < 48; i++) {
      s.time.hour++
      sessions += adsTickHour(s).filter(p => p.source === 'tiktak_organic').reduce((a, p) => a + p.sessions, 0)
    }
    expect(post.views).toBeGreaterThan(50)
    expect(post.likes).toBeGreaterThan(0)
    expect(sessions).toBeGreaterThanOrEqual(0)
    openAdAccount(s, 'tiktak')
    const c = createCampaign(s, { platform: 'tiktak', name: 'Spark', budgetMode: 'abo' })!
    const g = createAdSet(s, { campaignId: c, name: 'G', dailyBudget: 20 })!
    const adId = sparkPost(s, post.id, g)!
    expect(findAd(s, adId)!.sparkPostId).toBe(post.id)
    expect(post.sparked).toBe(true)
  })

  it('automated rules need media buying L4 and run at 9 AM', () => {
    const { s, sp } = makeGame({ seed: 61 })
    openAdAccount(s, 'fadbook')
    const bad = weakCreative(s)
    const x = abo(s, 40, bad.id)
    const rule = { id: '', platform: 'fadbook' as const, name: 'Kill losers', enabled: true, scope: 'ad' as const, metric: 'ctr' as const, op: '<' as const, value: 1.5, minSpend: 5, action: 'pause' as const, actionPct: 0 }
    s.skills.media_buying.level = 2
    upsertRule(s, rule)
    expect(s.ads.rules).toHaveLength(0)
    s.skills.media_buying.level = 4
    upsertRule(s, rule)
    expect(s.ads.rules).toHaveLength(1)
    runHours(s, 24 * 2 + 4, sp.price)
    expect(findAd(s, x.adId)!.status).toBe('paused')
    expect((s.ads.ruleLog ?? []).length).toBeGreaterThan(0)
    deleteRule(s, s.ads.rules[0].id)
    expect(s.ads.rules).toHaveLength(0)
  })

  it('prunes daily stats older than 120 days into lifetime without losing totals', () => {
    const { s, sp } = makeGame({ seed: 71 })
    openAdAccount(s, 'fadbook')
    const cr = strongCreative(s)
    const x = abo(s, 20, cr.id)
    runHours(s, 24 * 3, sp.price)
    const ad = findAd(s, x.adId)!
    const before = adTotals(ad).impressions
    const day = Math.floor(s.time.hour / 24)
    adsDayRollover(s, day + 125)
    expect(Object.keys(ad.stats)).toHaveLength(0)
    expect(ad.lifetime.impressions).toBe(before)
  })
})
