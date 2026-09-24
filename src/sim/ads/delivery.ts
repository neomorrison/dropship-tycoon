// The delivery model: budgets → auctions (CPM) → impressions/reach/frequency → clicks/video → LPV
// → TrafficPacket for the store. One call per in-game hour.
import type {
  Ad, AdAccount, AdSet, Campaign, Creative, GameState, Platform, ProductDef, StoreProduct, Targeting, TrafficPacket,
} from '../../core/types'
import { binomial, clamp, lognormal, poisson, randRange, stochRound } from '../../core/rng'
import { dayOf, hourOfDay, isBfcm, isLateDec, monthOf, weekday, domOf } from '../../core/time'
import { DIFFICULTY } from '../../core/difficulty'
import { BENCHMARKS } from '../../data/benchmarks'
import { STILL_FORMATS } from '../../data/creativeTaxonomy'
import { findInterest, interestSize, TIKTAK_REACH_RATIO } from '../../data/interests'
import { productAppeal } from '../market'
import { grantXp } from '../life'
import { accrueSpend } from './accounts'
import { processReviews } from './structure'
import { creativesTickHour } from './creatives'
import { releaseReports } from './attribution'
import { organicTickHour } from './organic'
import { runRules } from './rules'
import {
  FREQ_WINDOW_DAYS, adRange, ageShare, bench, dayStats, findCreative, findStoreProduct,
  genderShare, hasPixel, pixelPurchases, productDef, spendLimitOf, tokens,
} from './shared'
import { scoreCreative } from './scoring'

const trafficByHour = BENCHMARKS.seasonality.trafficByHour
const MB_XP_CAP = 60
/** soft ceiling for link CTR (retargeting and viral creatives approach it, never exceed it) */
const CTR_CEIL = 0.045

// ---------------------------------------------------------------------------
// Audience model
// ---------------------------------------------------------------------------
const BROAD_US = BENCHMARKS.fadbook.audienceSizeUS.broad
export const broadSize = (p: Platform) => (p === 'fadbook' ? BROAD_US : Math.round(BROAD_US * TIKTAK_REACH_RATIO))

export function estimateAudienceSize(s: GameState, platform: Platform, t: Targeting): number {
  const demo = ageShare(platform, t.ageMin, t.ageMax) * genderShare(platform, t.gender)
  const geo = t.geo === 'T1' ? 1.35 : 1
  const broad = broadSize(platform)
  switch (t.type) {
    case 'broad': return Math.round(broad * demo * geo)
    case 'interest': {
      if (!t.interests.length) return Math.round(broad * demo * geo)
      let miss = 1
      for (const name of t.interests) {
        const def = findInterest(name)
        const size = def ? interestSize(def, platform) : Math.round(1_500_000 * (platform === 'tiktak' ? TIKTAK_REACH_RATIO : 1))
        miss *= 1 - Math.min(0.95, size / broad)
      }
      return Math.round(broad * (1 - miss) * demo * geo)
    }
    case 'lookalike': {
      const a = s.ads.audiences.find(x => x.id === t.audienceId)
      return Math.round((a?.size ?? 0) * Math.sqrt(demo) * geo)
    }
    case 'retargeting': {
      const a = s.ads.audiences.find(x => x.id === t.audienceId)
      return Math.round((a?.size ?? 0) * Math.pow(demo, 0.3))
    }
  }
}

interface AudienceFit { ctr: number; demo: number; match: number }
/** How well the targeting matches the product's buyers (hidden). */
export function audienceFit(s: GameState, p: ProductDef, platform: Platform, t: Targeting): AudienceFit {
  const a = p.audience
  const lo = Math.max(a.ageMin, t.ageMin)
  const hi = Math.min(a.ageMax, t.ageMax)
  const insideShare = Math.max(0, hi - lo) / Math.max(5, t.ageMax - t.ageMin)
  let demo = insideShare
  if (a.gender !== 'all') {
    if (t.gender === 'all') demo *= 0.8
    else if (t.gender !== a.gender) demo *= 0.35
  }
  if (t.type === 'broad') demo = Math.max(demo, 0.8 + 0.2 * Math.min(1, pixelPurchases(s, platform) / 300))
  demo = clamp(0.6 + 0.4 * demo, 0.3, 1)
  let match = 0.5
  let ctr = 1
  if (t.type === 'interest' && t.interests.length) {
    const scores = t.interests.map((n): number => {
      const d = findInterest(n)
      if (!d) return 0
      if (d.niches.includes(p.niche)) return 1
      return d.shopper ? 0.5 : 0
    })
    const max = Math.max(...scores)
    const mean = scores.reduce((x, y) => x + y, 0) / scores.length
    match = 0.6 * max + 0.4 * mean
    ctr = 0.8 + 0.28 * match
  } else if (t.type === 'lookalike') { ctr = 1.04; match = 0.8 }
  else if (t.type === 'retargeting') { ctr = 1.08; match = 1 }
  ctr *= 0.9 + 0.1 * demo
  return { ctr, demo, match }
}

function audienceCpmMult(t: Targeting, size: number): number {
  let m = t.type === 'interest' ? 1.12 : t.type === 'lookalike' ? 1.1 : t.type === 'retargeting' ? 2.2 : 1
  if (t.type === 'interest' && size < 5_000_000) m *= 1 + 0.12 * (5_000_000 - size) / 5_000_000
  if (t.ageMax - t.ageMin < 20) m *= 1.1
  if (t.gender !== 'all') m *= 1.05
  if (t.geo === 'T1') m *= 0.88
  return m
}

/** Spend capacity relative to the product's scale ceiling. */
function capacity(t: Targeting, size: number, s: GameState): number {
  switch (t.type) {
    case 'broad': return 1
    case 'interest': return 0.35 * clamp(Math.sqrt(size / 8_000_000), 0.5, 1.6)
    case 'lookalike': {
      const a = s.ads.audiences.find(x => x.id === t.audienceId)
      return 0.6 * clamp(Math.sqrt((a?.param ?? 1) / 3), 0.6, 1.4)
    }
    case 'retargeting': return 0.05 * clamp(Math.sqrt(size / 20_000), 0.3, 3)
  }
}

/** People with real propensity for this product inside the targeting (frequency builds against this pool). */
function pocketSize(t: Targeting, size: number, appeal: number): number {
  const share = t.type === 'broad' ? 0.004 : t.type === 'interest' ? 0.06 : t.type === 'lookalike' ? 0.05 : 0.9
  return Math.max(300, size * share * (0.6 + 0.5 * Math.min(1.4, appeal)))
}
const REPEAT = 1.06
const reachFn = (imps: number, pool: number) => (pool * (1 - Math.exp(-imps / pool))) / REPEAT

const PLACEMENT: Record<Targeting['placements'], { cpm: number; ctr: number; hook: number }> = {
  advantage: { cpm: 1, ctr: 1, hook: 1 },
  feeds: { cpm: 1.12, ctr: 1.06, hook: 0.95 },
  reels_stories: { cpm: 0.82, ctr: 0.88, hook: 1.08 },
}

// ---------------------------------------------------------------------------
// Market-wide CPM
// ---------------------------------------------------------------------------
export function baseCpm(s: GameState, p: Platform, day = dayOf(s.time.hour)): number {
  const seas = BENCHMARKS.seasonality
  let month: number = seas.cpmByMonth[monthOf(day)]
  if (isBfcm(day)) month = seas.bfcmCpmMult
  else if (isLateDec(day)) month = seas.cpmByMonth[11] * seas.lateDecCpmMult
  return bench(p).cpmBase * DIFFICULTY[s.meta.difficulty].cpmMult * month * seas.cpmByWeekday[weekday(day)] * (s.events.modifiers.cpmMult?.[p] ?? 1)
}

// ---------------------------------------------------------------------------
// Ad copy (primary text / headline) — small, skill-based CTR effect
// ---------------------------------------------------------------------------
export function adCopyScore(p: ProductDef, ad: Pick<Ad, 'primaryText' | 'headline' | 'platform'>): number {
  const text = ad.primaryText.trim()
  const head = ad.headline.trim()
  const toks = tokens(`${text} ${head}`)
  const pw = new Set<string>()
  for (const src of [p.name, ...p.keywords]) for (const t of tokens(src)) if (t.length > 3) pw.add(t)
  let v = 0.35
  const len = text.length
  if (ad.platform === 'tiktak') { if (len >= 12 && len <= 100) v += 0.15 }
  else if (len >= 60 && len <= 500) v += 0.15
  else if (len < 20) v -= 0.1
  else if (len > 1200) v -= 0.1
  if (toks.some(t => pw.has(t))) v += 0.15
  if (toks.some(t => t === 'you' || t === 'your')) v += 0.07
  if (/\d[\d,.]*\+?\s*(reviews|customers|sold|happy|five-star|5-star|people)|rated|★/i.test(text)) v += 0.08
  if (/(free shipping|guarantee|% off|bundle|buy \d|risk-free|money back)/i.test(text)) v += 0.08
  const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length
  if (emoji >= 1 && emoji <= 4) v += 0.04
  else if (emoji > 8) v -= 0.05
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (letters.length > 20 && text.replace(/[^A-Z]/g, '').length / letters.length > 0.6) v -= 0.15
  if (ad.platform === 'fadbook') {
    const hw = head.split(/\s+/).filter(Boolean).length
    if (hw >= 2 && hw <= 8) v += 0.08
    else if (!hw) v -= 0.05
  }
  return clamp(v, 0, 1)
}

// ---------------------------------------------------------------------------
// Creative fatigue
// ---------------------------------------------------------------------------
export function fatigueFactor(p: Platform, cr: Creative, freq: number, daysRunning: number, extra = 1): number {
  const B = bench(p)
  const F0 = (B.fatigueFrequency * (0.8 + 0.4 * cr.quality) * (cr.shared ? 0.7 : 1)) / Math.max(0.5, (cr.fatigueBoost ?? 1) * extra)
  const g = (f: number) => 1 / (1 + Math.pow(Math.max(0, f) / F0, 2.2))
  const ff = Math.min(1, g(Math.max(1, freq)) / g(1))
  const age = Math.max(0.55, 1 - (p === 'fadbook' ? 0.006 : 0.012) * Math.max(0, daysRunning))
  return ff * age
}

function sevenDay(ad: Ad, day: number): { imps: number; reach: number } {
  let imps = 0
  let reach = 0
  for (let d = day - FREQ_WINDOW_DAYS + 1; d <= day; d++) {
    const st = ad.stats[d]
    if (st) { imps += st.impressions; reach += st.reach }
  }
  return { imps, reach }
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------
export function platformPaused(s: GameState, p: Platform): boolean {
  if (s.events.modifiers.deliveryPaused?.[p]) return true
  const hour = s.time.hour
  const day = dayOf(hour)
  // fallback when modifiers haven't been recomputed yet this hour
  return s.events.active.some(e => {
    if (e.kind !== 'platform_outage') return false
    const plat = e.data?.platform
    if (plat && plat !== p) return false
    const from = typeof e.data?.startHour === 'number' ? (e.data.startHour as number) : null
    const to = typeof e.data?.endHour === 'number' ? (e.data.endHour as number) : typeof e.data?.untilHour === 'number' ? (e.data.untilHour as number) : null
    if (from != null && to != null) return hour >= from && hour < to
    return day >= e.startDay && day <= e.endDay
  })
}

export function adDeliverable(s: GameState, ad: Ad, idx?: Pick<TickIndex, 'creatives' | 'products'>): boolean {
  if (ad.status !== 'active' || ad.review !== 'approved') return false
  const cr = idx ? idx.creatives.get(ad.creativeId) : findCreative(s, ad.creativeId)
  if (!cr || cr.status !== 'ready') return false
  const sp = idx ? idx.products.get(ad.storeProductId) : findStoreProduct(s, ad.storeProductId)
  return !!sp && sp.status === 'active'
}

// ---------------------------------------------------------------------------
// Hour tick
// ---------------------------------------------------------------------------
interface AdQuote {
  ad: Ad
  cr: Creative
  pd: ProductDef
  sp: StoreProduct
  power: number
  fat: number
  cpm: number
  ctr: number
  intent: number
  weight: number
}
interface SetPlan { acc: AdAccount; camp: Campaign; set: AdSet; ads: Ad[]; daily: number; share: number }

/** Deliver ads for the current hour; returns landing-page traffic for the store to convert. */
export function adsTickHour(s: GameState): TrafficPacket[] {
  const h = hourOfDay(s.time.hour)
  creativesTickHour(s)
  processReviews(s)
  releaseReports(s)
  if (h === 9) runRules(s)

  const packets: TrafficPacket[] = []
  let spentThisHour = 0
  let idx: TickIndex | null = null
  for (const acc of s.ads.accounts) {
    if (acc.status !== 'active' || platformPaused(s, acc.platform)) continue
    idx ??= buildIndex(s)
    spentThisHour += deliverAccount(s, acc, packets, idx)
  }
  organicTickHour(s, packets)
  if (spentThisHour > 0) mediaBuyingXp(s, spentThisHour)
  return packets
}

/** Per-tick lookup tables: one pass over the (immer draft) arrays instead of repeated find/filter scans. */
interface TickIndex {
  creatives: Map<string, Creative>
  products: Map<string, StoreProduct>
  adsBySet: Map<string, Ad[]>
  setsByCampaign: Map<string, AdSet[]>
  /** earliest delivery hour per platform:creative (creative age for fatigue) */
  firstHour: Map<string, number>
}
function buildIndex(s: GameState): TickIndex {
  const creatives = new Map<string, Creative>()
  for (const c of s.creatives.creatives) creatives.set(c.id, c)
  const products = new Map<string, StoreProduct>()
  for (const p of s.store.products) products.set(p.id, p)
  const adsBySet = new Map<string, Ad[]>()
  const firstHour = new Map<string, number>()
  for (const ad of s.ads.ads) {
    if (ad.firstDeliveryHour != null) {
      const k = `${ad.platform}:${ad.creativeId}`
      const cur = firstHour.get(k)
      if (cur == null || ad.firstDeliveryHour < cur) firstHour.set(k, ad.firstDeliveryHour)
    }
    if (ad.status === 'deleted') continue
    const list = adsBySet.get(ad.adSetId)
    if (list) list.push(ad)
    else adsBySet.set(ad.adSetId, [ad])
  }
  const setsByCampaign = new Map<string, AdSet[]>()
  for (const set of s.ads.adSets) {
    if (set.status === 'deleted') continue
    const list = setsByCampaign.get(set.campaignId)
    if (list) list.push(set)
    else setsByCampaign.set(set.campaignId, [set])
  }
  return { creatives, products, adsBySet, setsByCampaign, firstHour }
}

function mediaBuyingXp(s: GameState, spend: number) {
  const day = dayOf(s.time.hour)
  const x = (s.ads.mbXp ??= { day, granted: 0, carry: 0 })
  if (x.day !== day) { x.day = day; x.granted = 0 }
  x.carry += spend
  const xp = Math.min(Math.floor(x.carry / 10), MB_XP_CAP - x.granted)
  x.carry -= Math.floor(x.carry / 10) * 10
  if (xp > 0) {
    x.granted += xp
    grantXp(s, 'media_buying', xp)
  }
}

function deliverAccount(s: GameState, acc: AdAccount, packets: TrafficPacket[], idx: TickIndex): number {
  const plans: SetPlan[] = []
  for (const camp of s.ads.campaigns) {
    if (camp.accountId !== acc.id || camp.status !== 'active') continue
    const sets = (idx.setsByCampaign.get(camp.id) ?? [])
      .filter(set => set.status === 'active')
      .map(set => ({ set, ads: (idx.adsBySet.get(set.id) ?? []).filter(a => adDeliverable(s, a, idx)) }))
      .filter(x => x.ads.length > 0 && audienceReady(s, x.set))
    if (!sets.length) continue
    if (camp.budgetMode === 'cbo') {
      const shares = cboShares(s, sets.map(x => x.set), idx)
      for (const x of sets) {
        const share = shares.get(x.set.id) ?? 0
        x.set.allocShare = share
        plans.push({ acc, camp, set: x.set, ads: x.ads, daily: (camp.dailyBudget ?? 0) * share, share })
      }
    } else {
      for (const x of sets) plans.push({ acc, camp, set: x.set, ads: x.ads, daily: x.set.dailyBudget ?? 0, share: 1 })
    }
  }
  if (!plans.length) return 0
  const h = hourOfDay(s.time.hour)
  // daily spend limit: the account can't exceed its ladder tier
  const limit = spendLimitOf(acc)
  const plannedDaily = plans.reduce((a, p) => a + p.daily, 0)
  const dailyScale = Number.isFinite(limit) && plannedDaily > limit ? limit / plannedDaily : 1
  const hourBudget = plans.reduce((a, p) => a + p.daily * dailyScale * trafficByHour[h], 0)
  const remaining = Number.isFinite(limit) ? Math.max(0, limit - acc.todaySpend) : Infinity
  const hourScale = hourBudget > remaining ? remaining / hourBudget : 1
  const productSpend = new Map<string, number>()
  for (const p of plans) {
    const cid = p.ads[0] ? idx.creatives.get(p.ads[0].creativeId)?.catalogId ?? '' : ''
    productSpend.set(cid, (productSpend.get(cid) ?? 0) + p.daily * dailyScale)
  }
  let spent = 0
  for (const p of plans) {
    if (acc.status !== 'active') break
    const hourSpend = p.daily * dailyScale * trafficByHour[h] * hourScale * lognormal(s, 0.1)
    spent += deliverAdSet(s, p, hourSpend, p.daily * dailyScale, productSpend, packets, idx)
  }
  return spent
}

function audienceReady(s: GameState, set: AdSet): boolean {
  const t = set.targeting
  if (t.type === 'lookalike' || t.type === 'retargeting') {
    const a = s.ads.audiences.find(x => x.id === t.audienceId)
    return !!a && a.size >= 100
  }
  return true
}

function cboShares(s: GameState, sets: AdSet[], idx: TickIndex): Map<string, number> {
  const day = dayOf(s.time.hour)
  const info = sets.map(set => {
    let spend = 0
    let value = 0
    let pow = 0
    let n = 0
    const setAds = idx.adsBySet.get(set.id) ?? []
    for (const ad of setAds) {
      const st = adRange(ad, day - 3, day)
      spend += st.spend
      value += st.purchaseValue
      if (!adDeliverable(s, ad, idx)) continue
      const cr = idx.creatives.get(ad.creativeId)
      if (!cr?.scores) continue
      const days = daysRunning(s, ad, idx.firstHour)
      pow += cr.scores.power[set.platform] * fatigueFactor(set.platform, cr, ad.frequency, days, s.events.modifiers.creativeFatigueMult?.[cr.id] ?? 1)
      n++
    }
    const pd = n ? productDef(idx.creatives.get(setAds[0].creativeId)?.catalogId ?? '') : null
    const fit = pd ? audienceFit(s, pd, set.platform, set.targeting) : null
    const aud = set.targeting.type === 'retargeting' ? 1.6 : set.targeting.type === 'lookalike' ? 1.1 : 1
    return { set, roas: spend >= 20 ? value / spend : null, pow: (n ? pow / n : 0.5) * (fit ? fit.ctr : 1) * aud }
  })
  const withRoas = info.filter(i => i.roas != null)
  const meanRoas = withRoas.length ? withRoas.reduce((a, i) => a + (i.roas ?? 0), 0) / withRoas.length : 0
  const meanPow = info.reduce((a, i) => a + i.pow, 0) / info.length || 1
  const weights = info.map(i => {
    const powIdx = i.pow / meanPow
    const idx = i.roas != null && meanRoas > 0 ? 0.6 * (i.roas / meanRoas) + 0.4 * powIdx : powIdx
    return Math.pow(Math.max(0.05, idx), 2)
  })
  const total = weights.reduce((a, w) => a + w, 0)
  const n = sets.length
  const out = new Map<string, number>()
  info.forEach((i, k) => out.set(i.set.id, 0.15 / n + 0.85 * (weights[k] / total)))
  return out
}

function daysRunning(s: GameState, ad: Ad, firstHour: Map<string, number>): number {
  const first = firstHour.get(`${ad.platform}:${ad.creativeId}`) ?? ad.firstDeliveryHour
  return first == null ? 0 : (s.time.hour - first) / 24
}

function giftSeason(day: number): number {
  const m = monthOf(day)
  if (m === 10 || (m === 11 && domOf(day) < 20)) return 1
  if (m === 9) return 0.4
  if (m === 1 && domOf(day) <= 14) return 0.5
  return 0
}

function deliverAdSet(
  s: GameState, plan: SetPlan, hourSpend: number, dailySpend: number, productSpend: Map<string, number>,
  packets: TrafficPacket[], idx: TickIndex,
): number {
  const { acc, camp, set, ads } = plan
  const p = set.platform
  const B = bench(p)
  const hour = s.time.hour
  const day = dayOf(hour)
  const noise = DIFFICULTY[s.meta.difficulty].noiseMult
  const t = set.targeting
  const size = Math.max(1, estimateAudienceSize(s, p, t))
  const pixel = hasPixel(s, p)
  const place = PLACEMENT[t.placements] ?? PLACEMENT.advantage
  const learnCpm = set.learning.state === 'learning' ? 1.12 : set.learning.state === 'learning_limited' ? 1.2 : 1
  const learnIntent = set.learning.state === 'active' ? 1.08 : 0.95
  const qualityCpm = acc.quality < 50 ? 1.15 : 1

  // ---- quote each ad ----
  const quotes: AdQuote[] = []
  for (const ad of ads) {
    const cr = idx.creatives.get(ad.creativeId)!
    const pd = productDef(cr.catalogId)
    const sp = idx.products.get(ad.storeProductId)
    if (!pd || !sp) continue
    if (!cr.scores) cr.scores = scoreCreative(s, cr)
    // daily auction noise
    if (!ad.noise || ad.noise.day !== day) ad.noise = { day, cpm: lognormal(s, 0.12 * noise), ctr: lognormal(s, 0.15 * noise) }
    const still = STILL_FORMATS.includes(cr.format)
    let power = cr.scores.power[p]
    if (still && t.type === 'retargeting' && p === 'fadbook') power /= 0.85 // statics work fine warm
    if (ad.sparkPostId) {
      const post = s.ads.organicPosts.find(x => x.id === ad.sparkPostId)
      power *= 1.08 + Math.min(0.1, Math.log10(1 + (post?.likes ?? 0)) / 50)
    }
    const fat = fatigueFactor(p, cr, ad.frequency, daysRunning(s, ad, idx.firstHour), s.events.modifiers.creativeFatigueMult?.[cr.id] ?? 1)
    const appeal = safeAppeal(s, pd.id)
    const fit = audienceFit(s, pd, p, t)
    // scale pressure: this ad set (only what its audience can absorb) + half of the other spend on the product
    const ceiling = Math.max(20, pd.scaleCeiling * Math.max(0.05, appeal))
    const other = Math.max(0, (productSpend.get(pd.id) ?? 0) - dailySpend)
    const absorbable = (size * 1.2 * baseCpm(s, p, day) * audienceCpmMult(t, size)) / 1000
    const eff = Math.min(dailySpend, absorbable)
    const own = t.type === 'retargeting' ? (0.5 * eff) / Math.max(1, absorbable) : eff / (ceiling * capacity(t, size, s))
    const ratio = own + (0.5 * other) / ceiling
    const scaleMult = 1 + 0.6 * Math.pow(Math.max(0, ratio), 1.4)
    const engagementMult = clamp(1.3 - 0.3 * power * Math.sqrt(fat), 0.7, 1.35)
    const competition = s.events.modifiers.competitionMult?.[pd.id] ?? 1
    let cpm = baseCpm(s, p, day) * audienceCpmMult(t, size) * place.cpm * engagementMult * scaleMult * competition
      * learnCpm * qualityCpm * ad.noise.cpm * lognormal(s, 0.05 * noise)
    if (camp.kind === 'advantage') cpm *= 0.96
    if (set.optimization === 'add_to_cart') cpm *= 0.95
    if (!pixel) cpm *= 0.92
    cpm = clamp(cpm, 1.5, 250)

    const gift = pd.giftable > 0.5 ? 1 + 0.1 * giftSeason(day) : 1
    const saturation = s.catalog.market?.[pd.id]?.saturation ?? 0
    const copy = adCopyScore(pd, ad)
    const copyMult = p === 'fadbook' ? 0.88 + 0.24 * copy : 0.94 + 0.12 * copy
    // above-average power compounds (power^1.3) so great creatives pull away; a soft ceiling keeps elite ads near 3–4%
    let ctr = B.ctrLink.avg * 0.72 * (power >= 1 ? Math.pow(power, 1.3) : power) * (0.75 + 0.6 * pd.wow) * fit.ctr * fat * gift * (t.type === 'retargeting' ? 1.8 : 1)
      * (s.events.modifiers.ctrMult?.[p] ?? 1) * (0.75 + 0.35 * (pd.platformFit?.[p] ?? 0.7)) * copyMult * place.ctr
      * (1 - 0.2 * saturation) * (pixel ? 1 : 1.08) * (ad.cta === 'learn_more' ? 0.95 : 1)
      * (still && t.placements === 'reels_stories' ? 0.7 : 1) * ad.noise.ctr * lognormal(s, 0.05 * noise)
    ctr = clamp(CTR_CEIL * Math.tanh(ctr / CTR_CEIL), 0.0008, 0.06)

    // traffic quality for the store
    const pp = pixelPurchases(s, p)
    let audIntent = 1
    if (t.type === 'retargeting') audIntent = 2.6
    else if (t.type === 'lookalike') audIntent = 1.1 * (0.92 + 0.12 * Math.min(1, pp / 1000))
    else if (t.type === 'interest') audIntent = 0.95 + 0.1 * fit.match
    else audIntent = 0.9 + 0.2 * Math.min(1, pp / 300)
    const hookIntent = ['controversial', 'shock_stat', 'question'].includes(cr.hook) || cr.angle === 'curiosity' ? 0.88
      : cr.hook === 'problem_callout' || cr.format === 'demo_video' || cr.format === 'before_after_video' ? 1.05 : 1
    let intent = (p === 'tiktak' ? BENCHMARKS.tiktak.cvrMultiplier : 1) * audIntent * learnIntent * (t.geo === 'T1' ? 0.9 : 1)
      * hookIntent * (camp.bidStrategy === 'cost_cap' ? 1.1 : 1) * (pixel ? 1 : 0.7) * (0.75 + 0.25 * fit.demo)
      * (set.optimization === 'add_to_cart' ? 0.88 : 1) * (ad.cta === 'learn_more' ? 0.95 : 1)
    if (camp.kind === 'advantage') intent *= pixel ? 0.95 + 0.2 * Math.min(1, pp / 300) : 0.9
    // gift-angled traffic buys more in season
    if (cr.angle === 'gift' && pd.giftable > 0.5) intent *= 1 + 0.08 * giftSeason(day)
    const newness = ad.firstDeliveryHour == null || hour - ad.firstDeliveryHour < 48 ? 2 : 1
    const weight = Math.pow(Math.max(0.05, power * fat), 2.5) * newness
    quotes.push({ ad, cr, pd, sp, power, fat, cpm, ctr, intent, weight })
  }
  if (!quotes.length) return 0

  // ---- bid strategy throttle (cost cap) ----
  let spendHour = hourSpend
  if (camp.bidStrategy === 'cost_cap' && camp.costCap) {
    const pred = predictedCpa(set, ads, quotes, day)
    spendHour *= clamp(Math.pow(camp.costCap / pred, 3), 0.05, 1)
  }
  // ---- small audiences can only absorb so many impressions ----
  const hSh = trafficByHour[hourOfDay(hour)]
  const avgCpm = quotes.reduce((a, q) => a + q.cpm, 0) / quotes.length
  const maxImpsHour = size * 1.2 * hSh
  spendHour = Math.min(spendHour, (maxImpsHour * avgCpm) / 1000)

  const wTotal = quotes.reduce((a, q) => a + q.weight, 0)
  const n = quotes.length
  const pool = pocketSize(t, size, safeAppeal(s, quotes[0].pd.id))
  let spent = 0
  for (const q of quotes) {
    const share = 0.1 / n + 0.9 * (q.weight / wTotal)
    q.ad.allocShare = share
    const adSpend = spendHour * share
    if (adSpend <= 0.0005) continue
    spent += deliverAd(s, acc, set, q, adSpend, pool, packets)
    if (acc.status !== 'active') break
  }
  return spent
}

function safeAppeal(s: GameState, catalogId: string): number {
  const a = productAppeal(s, catalogId)
  return Number.isFinite(a) && a > 0 ? a : 0.5
}

function predictedCpa(set: AdSet, ads: Ad[], quotes: AdQuote[], day: number): number {
  let spend = 0
  let purchases = 0
  for (const ad of ads) {
    const st = adRange(ad, day - 6, day)
    spend += st.spend
    purchases += st.purchases
  }
  const q = quotes.reduce((a, x) => (x.weight > a.weight ? x : a), quotes[0])
  const lpv = bench(set.platform).lpvRate
  const modelCpa = q.cpm / (1000 * q.ctr * lpv * 0.022 * Math.max(0.2, q.intent))
  return (spend + 3 * modelCpa) / (purchases + 3)
}

function deliverAd(s: GameState, acc: AdAccount, set: AdSet, q: AdQuote, adSpend: number, pool: number, packets: TrafficPacket[]): number {
  const { ad, cr, pd, sp } = q
  const p = set.platform
  const B = bench(p)
  const hour = s.time.hour
  const day = dayOf(hour)
  const imps = stochRound(s, (adSpend / q.cpm) * 1000)
  if (imps <= 0) return 0
  const st = dayStats(ad, day)
  const place = PLACEMENT[set.targeting.placements] ?? PLACEMENT.advantage

  // reach & frequency: keep the stored 7-day reach equal to the modeled unique reach of the window
  const w = sevenDay(ad, day)
  const reachInc = Math.max(0, Math.min(imps, Math.round(reachFn(w.imps + imps, pool) - w.reach)))

  // clicks
  const linkClicks = binomial(s, imps, q.ctr)
  const allMult = p === 'fadbook' ? randRange(s, 1.6, 2.2) : randRange(s, 1.3, 1.6)
  const clicks = Math.max(linkClicks, Math.round(linkClicks * allMult + poisson(s, imps * 0.0015)))

  // video
  let short = 0
  let long = 0
  let v25 = 0
  let v50 = 0
  let v75 = 0
  let v100 = 0
  if (cr.isVideo && cr.scores) {
    const baseHook = p === 'fadbook' ? BENCHMARKS.fadbook.hookRate.avg : BENCHMARKS.tiktak.view2sRate.avg
    const hookRate = clamp(baseHook * (0.55 + 0.9 * cr.scores.hook) * Math.pow(q.fat, 0.3) * place.hook * lognormal(s, 0.06), 0.03, 0.8)
    short = binomial(s, imps, hookRate)
    const body = cr.scores.body
    const hold = p === 'fadbook'
      ? clamp(BENCHMARKS.fadbook.holdRate.avg * (0.5 + body), 0.02, 0.7)
      : clamp(0.5 * (0.6 + 0.8 * body), 0.1, 0.9)
    long = binomial(s, short, hold)
    // Quartile views follow one retention curve through the two measured points, so they stay
    // consistent with them: Fadbook 3 s plays → ThruPlays (15 s, or completion on shorter cuts),
    // TikTak 2 s views → 6 s views. Past the second point the drop-off slows (committed viewers).
    if (short > 0) {
      const dur = Math.max(6, cr.durationSec || 15)
      const t0 = p === 'fadbook' ? 3 : 2
      const t1 = p === 'fadbook' ? Math.min(15, dur) : 6
      const r = clamp(long / short, 0.01, 1)
      const lambda = -Math.log(r) / Math.max(1, t1 - t0)
      const later = lambda * clamp(0.6 - 0.3 * body, 0.25, 0.6)
      const alive = (t: number) =>
        t <= t0 ? Math.min(imps / short, Math.exp(lambda * (t0 - t)))
          : t <= t1 ? Math.exp(-lambda * (t - t0))
            : r * Math.exp(-later * (t - t1))
      v25 = Math.min(imps, Math.round(short * alive(0.25 * dur)))
      v50 = Math.min(v25, Math.round(short * alive(0.5 * dur)))
      v75 = Math.min(v50, Math.round(short * alive(0.75 * dur)))
      v100 = Math.min(v75, Math.round(short * alive(dur)))
    }
  }

  // landing page views
  const load = sp.grade?.loadTime ?? 2.2
  const lpv = binomial(s, linkClicks, clamp(B.lpvRate * clamp(1 - 0.05 * Math.max(0, load - 2), 0.75, 1), 0.3, 0.98))

  // engagement
  const engBase = p === 'fadbook' ? 0.0035 : 0.012
  const engRate = engBase * Math.pow(q.power, 1.2) * (0.6 + 0.8 * pd.wow) * q.fat
  const likes = poisson(s, imps * engRate)
  const comments = poisson(s, likes * 0.06 * (cr.hook === 'controversial' ? 2.5 : 1) * (cr.hook === 'question' ? 1.5 : 1))
  const shares = poisson(s, likes * 0.09 * (0.5 + pd.wow))

  st.spend += adSpend
  st.impressions += imps
  st.reach += reachInc
  st.clicks += clicks
  st.linkClicks += linkClicks
  st.lpv += lpv
  st.videoViewsShort += short
  st.videoViewsLong += long
  st.v25 += v25
  st.v50 += v50
  st.v75 += v75
  st.v100 += v100
  st.likes += likes
  st.comments += comments
  st.shares += shares
  ad.firstDeliveryHour ??= hour
  set.impressions += imps
  set.reach += reachInc
  const reach7 = w.reach + reachInc
  ad.frequency = reach7 > 0 ? (w.imps + imps) / reach7 : 1

  if (ad.sparkPostId) {
    const post = s.ads.organicPosts.find(x => x.id === ad.sparkPostId)
    if (post) {
      post.views += short || Math.round(imps * 0.3)
      post.likes += likes
      post.shares += shares
      post.comments = (post.comments ?? 0) + comments
    }
  }

  accrueSpend(s, acc, adSpend)

  if (lpv > 0) {
    const fit = cr.scores?.fit ?? 0.5
    packets.push({
      source: p,
      platform: p,
      adId: ad.id,
      storeProductId: ad.storeProductId,
      sessions: lpv,
      intent: clamp(q.intent, 0.2, 4),
      messageMatch: clamp(0.9 + 0.2 * fit, 0.85, 1.15),
    })
  }
  return adSpend
}
