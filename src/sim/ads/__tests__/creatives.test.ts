import { describe, expect, it } from 'vitest'
import type { Creative } from '../../../core/types'
import {
  completeCreative, creativeInsights, orderCreative, refreshCreators, scoreCreative, validateCreativeBrief, agencyQuote,
  expectedCreativeQuality,
} from '..'
import { getProduct } from '../../market'
import { FORMATS, HOOKS, ANGLES, BEATS } from '../../../data/creativeTaxonomy'
import { CREATOR_PROFILES } from '../../../data/creators'
import { COACH_PORTRAIT } from '../../../core/assets'
import { adsTickHour } from '../delivery'
import { creativeTips, hookTextAnalysis } from '../scoring'
import { CATALOG_ID, makeCreative, makeGame, strongCreative, weakCreative } from './helpers'
import { allProducts } from '../../market'
import { FORMAT_LIST, HOOK_LIST, ANGLE_LIST } from '../../../data/creativeTaxonomy'
import { agencyHookText } from '../creatives'

const brief = (over: Partial<Parameters<typeof orderCreative>[1]> = {}) => ({
  catalogId: CATALOG_ID, name: '', format: 'demo_video' as const, hook: 'problem_callout' as const, angle: 'pain_point' as const,
  beats: ['hook', 'problem', 'demo', 'cta'] as ('hook' | 'problem' | 'demo' | 'cta')[], hookText: 'Tired of pet hair on your couch?', script: '',
  producer: 'ugc' as const, creatorId: null as string | null, ...over,
})

describe('creative taxonomy', () => {
  it('has player-facing copy for every format, hook, angle and beat', () => {
    for (const table of [FORMATS, HOOKS, ANGLES, BEATS]) {
      for (const item of Object.values(table)) {
        expect(item.name.length).toBeGreaterThan(2)
        expect(item.short.length).toBeGreaterThan(8)
        expect(item.description.length).toBeGreaterThan(20)
        expect(item.examples.length).toBeGreaterThan(0)
      }
    }
    expect(Object.keys(FORMATS)).toHaveLength(11)
    expect(Object.keys(HOOKS)).toHaveLength(13)
    expect(Object.keys(ANGLES)).toHaveLength(12)
    expect(Object.keys(BEATS)).toHaveLength(12)
  })
})

describe('creator marketplace', () => {
  it('lists 8–12 creators with real portraits and refreshes weekly', () => {
    const { s } = makeGame({ seed: 3 })
    const first = s.creatives.creators
    expect(first.length).toBeGreaterThanOrEqual(8)
    expect(first.length).toBeLessThanOrEqual(12)
    for (const c of first) {
      expect(c.portrait).toMatch(/^p(0[1-9]|1[0-8])$/)
      expect(c.portrait).not.toBe(COACH_PORTRAIT)
      expect(c.pricePerVideo).toBeGreaterThanOrEqual(150)
      expect(c.pricePerVideo).toBeLessThanOrEqual(400)
      expect(c.quality[0]).toBeLessThan(c.quality[1])
      expect(c.niches.length).toBeGreaterThan(0)
    }
    expect(new Set(first.map(c => c.id)).size).toBe(first.length)
    expect(CREATOR_PROFILES.length).toBeGreaterThanOrEqual(12)
    s.time.hour += 24 * 7
    refreshCreators(s)
    expect(s.creatives.lastCreatorRefreshDay).toBe(Math.floor(s.time.hour / 24))
  })
})

describe('ordering creatives', () => {
  it('refuses to film without the product in hand', () => {
    const { s } = makeGame()
    s.catalog.samplesOwned = []
    expect(validateCreativeBrief(s, brief({ producer: 'self' }))).toMatch(/sample/i)
    const before = s.notifications.length
    expect(orderCreative(s, brief({ producer: 'self' }))).toBeNull()
    expect(s.notifications.length).toBe(before + 1)
  })

  it('limits supplier edits to formats that can be cut from supplier footage', () => {
    const { s } = makeGame()
    expect(validateCreativeBrief(s, brief({ producer: 'supplier_edit', format: 'ugc_testimonial' }))).toMatch(/supplier/i)
    expect(validateCreativeBrief(s, brief({ producer: 'supplier_edit', format: 'slideshow' }))).toBeNull()
  })

  it('UGC: charges via pay(), waits for the product to ship, then delivers', () => {
    const { s } = makeGame({ seed: 21 })
    const creator = s.creatives.creators[0]
    const cash0 = s.finance.cash
    const card0 = s.finance.card.balance
    const id = orderCreative(s, brief({ creatorId: creator.id }))!
    expect(id).toBeTruthy()
    const c = s.creatives.creatives.find(x => x.id === id)!
    expect(c.status).toBe('waiting_sample')
    expect(s.finance.cash + (s.finance.card.limit - s.finance.card.balance)).toBeLessThan(cash0 + (s.finance.card.limit - card0))
    expect(s.finance.ledger.some(l => l.category === 'creative' && l.amount === -creator.pricePerVideo)).toBe(true)
    const p = getProduct(CATALOG_ID)
    for (let h = 0; h < (p.shipDays[1] + creator.deliveryDays[1] + 3) * 24; h++) {
      s.time.hour++
      adsTickHour(s)
      if (c.status === 'ready') break
    }
    expect(c.status).toBe('ready')
    expect(c.scores).toBeTruthy()
    expect(c.quality).toBeGreaterThanOrEqual(creator.quality[0] - 0.01)
    expect(s.notifications.some(n => n.title.startsWith('Creative ready'))).toBe(true)
  })

  it('agency packs deliver three polished variations', () => {
    const { s } = makeGame({ seed: 8 })
    const quote = agencyQuote(s, CATALOG_ID)
    expect(quote.price).toBeGreaterThanOrEqual(1500)
    expect(quote.price).toBeLessThanOrEqual(3500)
    const id = orderCreative(s, brief({ producer: 'agency', hookText: '' }))!
    const pack = s.creatives.creatives.filter(c => c.packId && c.packId === s.creatives.creatives.find(x => x.id === id)!.packId)
    expect(pack).toHaveLength(3)
    expect(pack.every(c => c.style === 'polished' && c.quality >= 0.8)).toBe(true)
    expect(pack.filter(c => c.hookText.length > 0).length).toBe(2)
    expect(expectedCreativeQuality(s, 'agency', 'demo_video')[0]).toBe(0.8)
  })

  it('self-shot quality comes from gear, skill and apartment', () => {
    const { s } = makeGame()
    const c: Creative = makeCreative(s, { format: 'ugc_testimonial', hook: 'testimonial', angle: 'social_proof', beats: ['hook', 'demo', 'cta'], hookText: 'I was skeptical', quality: 0, producer: 'self' })
    c.status = 'in_production'
    s.gear.equipped = { phone: 'phone-cracked', computer: 'laptop-old' }
    completeCreative(s, c.id)
    const base = c.quality
    const c2: Creative = makeCreative(s, { format: 'ugc_testimonial', hook: 'testimonial', angle: 'social_proof', beats: ['hook', 'demo', 'cta'], hookText: 'I was skeptical', quality: 0, producer: 'self' })
    c2.status = 'in_production'
    s.gear.equipped = { phone: 'phone-pro', lighting: 'softbox-kit', audio: 'lav-mic', computer: 'laptop-old' }
    completeCreative(s, c2.id)
    expect(c2.quality).toBeGreaterThan(base + 0.15)
    expect(c2.quality).toBeLessThanOrEqual(0.9)
  })
})

describe('hidden creative scoring', () => {
  it('rewards product-fit choices, structure and a sharp hook', () => {
    const { s } = makeGame()
    const strong = strongCreative(s)
    const weak = weakCreative(s)
    expect(strong.scores!.power.fadbook).toBeGreaterThan(1.8)
    expect(weak.scores!.power.fadbook).toBeLessThan(0.8)
    expect(strong.scores!.fit).toBeGreaterThan(weak.scores!.fit + 0.4)
    expect(strong.scores!.hook).toBeGreaterThan(weak.scores!.hook)
  })

  it('for every catalog product, an informed brief clearly out-powers random choices', () => {
    const { s } = makeGame()
    const mk = (catalogId: string, f: Creative['format'], h: Creative['hook'], a: Creative['angle'], beats: Creative['beats'], hookText: string, quality: number, producer: Creative['producer']): Creative => ({
      id: 'probe', catalogId, name: 'probe', format: f, hook: h, angle: a, beats, hookText, script: '', producer, creatorId: null, quality,
      status: 'ready', orderedHour: 0, readyHour: 0, cost: 0, isVideo: true, durationSec: 20, scores: null, thumb: '', shared: false,
    })
    let strongSum = 0
    let randomSum = 0
    for (const p of allProducts()) {
      const strong = scoreCreative(s, mk(p.id, p.bestFormats[0], p.bestHooks[0], p.bestAngles[0], ['hook', 'problem', 'demo', 'social_proof', 'offer', 'cta'], agencyHookText(p, p.bestHooks[0], 0), 0.8, 'ugc')).power.fadbook
      let sum = 0
      let n = 0
      for (const f of FORMAT_LIST) for (const h of HOOK_LIST) for (const a of ANGLE_LIST) {
        if (!f.producers.includes('self')) continue
        sum += scoreCreative(s, mk(p.id, f.id, h.id, a.id, ['hook', 'demo', 'benefits', 'cta'], 'You need this in your life', 0.4, 'self')).power.fadbook
        n++
      }
      expect(strong).toBeGreaterThan(1.7)
      expect(strong).toBeGreaterThan((sum / n) * 1.3)
      strongSum += strong
      randomSum += sum / n
    }
    const count = allProducts().length
    expect(strongSum / count).toBeGreaterThan(2)
    expect(randomSum / count).toBeLessThan(1.6)
  })

  it('scores hook text like a copywriter would', () => {
    const p = getProduct(CATALOG_ID)
    const good = hookTextAnalysis(p, 'problem_callout', 'Tired of pet hair all over your couch?').score
    const spam = hookTextAnalysis(p, 'problem_callout', 'BEST PRODUCT BUY NOW SALE!!!').score
    const empty = hookTextAnalysis(p, 'problem_callout', '').score
    expect(good).toBeGreaterThan(0.75)
    expect(spam).toBeLessThan(0.3)
    expect(empty).toBeLessThan(0.2)
  })

  it('native feel matters by platform: statics are weak on TikTak', () => {
    const { s } = makeGame()
    const still = makeCreative(s, { format: 'static_image', hook: 'problem_callout', angle: 'pain_point', beats: ['hook', 'benefits', 'offer', 'cta'], hookText: 'Tired of pet hair everywhere?', quality: 0.6, producer: 'self' })
    expect(still.scores!.power.tiktak).toBeLessThan(still.scores!.power.fadbook * 0.7)
  })

  it('reveals tips only after 1,000 impressions, more specific with skill', () => {
    const { s } = makeGame()
    const c = weakCreative(s)
    expect(scoreCreative(s, c).tips).toEqual([])
    s.ads.ads.push({
      id: 'ad_x', adSetId: 'x', campaignId: 'x', platform: 'fadbook', name: 'x', status: 'active', creativeId: c.id, storeProductId: 'sp_test',
      primaryText: '', headline: '', cta: 'shop_now', review: 'approved', createdHour: 0, frequency: 1,
      stats: { 0: { spend: 30, impressions: 2500, reach: 2300, clicks: 20, linkClicks: 10, lpv: 8, videoViewsShort: 0, videoViewsLong: 0, v25: 0, v50: 0, v75: 0, v100: 0, atc: 0, checkouts: 0, purchases: 0, purchaseValue: 0, truePurchases: 0, trueRevenue: 0, likes: 1, comments: 0, shares: 0 } },
      lifetime: { spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, lpv: 0, videoViewsShort: 0, videoViewsLong: 0, v25: 0, v50: 0, v75: 0, v100: 0, atc: 0, checkouts: 0, purchases: 0, purchaseValue: 0, truePurchases: 0, trueRevenue: 0, likes: 0, comments: 0, shares: 0 },
    })
    s.skills.creative.level = 1
    s.skills.media_buying.level = 1
    const novice = creativeInsights(s, c.id)
    s.skills.creative.level = 9
    const expert = creativeTips(s, c, c.scores!)
    expect(novice.length).toBeGreaterThan(0)
    expect(expert.length).toBeGreaterThan(novice.length)
    expect(expert.join(' ').length).toBeGreaterThan(novice.join(' ').length)
    // expert tips name the concrete problem (the hook type), novice tips stay vague
    expect(expert.join(' ')).toContain(HOOKS[c.hook].name)
    expect(novice.join(' ')).not.toContain(HOOKS[c.hook].name)
  })
})
