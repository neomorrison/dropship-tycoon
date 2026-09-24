// Pure queries for the Ads Manager UIs (Fadbook / TikTak), CreatorHub and the coach.
import type { AdLevel, AdSet, GameState, Platform, Targeting } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { INTERESTS, interestSize, type InterestDef } from '../../data/interests'
import { adDeliverable, baseCpm, estimateAudienceSize, platformPaused } from './delivery'
import {
  adSetsInCampaign, adsInAdSet, bench, billingThresholdOf, findAccount, findAd, findAdSet, findCampaign, findCreative,
  findStoreProduct, hasPixel, spendLimitOf,
} from './shared'
import { TIPS_MIN_IMPRESSIONS, creativeImpressions, creativeTips } from './scoring'

export type DeliveryTone = 'success' | 'info' | 'attention' | 'warning' | 'critical' | 'subdued'
export interface DeliveryLabel { label: string; tone: DeliveryTone; detail?: string }

const off = (p: Platform, what?: 'campaign' | 'adset'): DeliveryLabel =>
  p === 'tiktak'
    ? { label: 'Inactive', tone: 'subdued', detail: what === 'campaign' ? 'Campaign is turned off' : what === 'adset' ? 'Ad group is turned off' : undefined }
    : what === 'campaign' ? { label: 'Campaign off', tone: 'subdued' } : what === 'adset' ? { label: 'Ad set off', tone: 'subdued' } : { label: 'Off', tone: 'subdued' }
const notDelivering = (detail: string): DeliveryLabel => ({ label: 'Not delivering', tone: 'warning', detail })

function accountLabel(s: GameState, accountId: string): DeliveryLabel | null {
  const acc = findAccount(s, accountId)
  if (!acc) return notDelivering('Ad account not found')
  if (acc.status === 'restricted' || acc.status === 'disabled') {
    return acc.platform === 'tiktak'
      ? { label: 'Not delivering', tone: 'critical', detail: `Ad account suspended. ${acc.statusReason ?? ''}`.trim() }
      : { label: 'Account disabled', tone: 'critical', detail: acc.statusReason }
  }
  if (acc.status === 'payment_failed') return { label: 'Not delivering', tone: 'critical', detail: 'Payment failed. Pay your balance in Billing to resume.' }
  if (platformPaused(s, acc.platform)) return notDelivering('Delivery issue on the platform. Ads resume automatically.')
  const limit = spendLimitOf(acc)
  if (Number.isFinite(limit) && acc.todaySpend >= limit - 0.01) return notDelivering('Account spending limit reached for today')
  return null
}

function learningLabel(set: AdSet): DeliveryLabel {
  if (set.learning.state === 'learning') return { label: 'Learning', tone: 'info', detail: 'Delivery is still optimizing. Avoid significant edits.' }
  if (set.learning.state === 'learning_limited') return { label: 'Learning limited', tone: 'attention', detail: 'Not getting enough conversions to exit learning.' }
  return { label: 'Active', tone: 'success' }
}

function audienceTooSmall(s: GameState, set: AdSet): boolean {
  const t = set.targeting
  if (t.type !== 'lookalike' && t.type !== 'retargeting') return false
  const a = s.ads.audiences.find(x => x.id === t.audienceId)
  return !a || a.size < 100
}

export function deliveryLabel(s: GameState, level: AdLevel, id: string): DeliveryLabel {
  if (level === 'ad') {
    const ad = findAd(s, id)
    if (!ad || ad.status === 'deleted') return { label: 'Deleted', tone: 'subdued' }
    const set = findAdSet(s, ad.adSetId)
    const camp = findCampaign(s, ad.campaignId)
    if (!set || !camp) return notDelivering('Parent ad set not found')
    const accL = accountLabel(s, camp.accountId)
    if (accL && accL.tone === 'critical') return accL
    if (ad.status === 'paused') return off(ad.platform)
    if (set.status !== 'active') return off(ad.platform, 'adset')
    if (camp.status !== 'active') return off(ad.platform, 'campaign')
    if (ad.review === 'in_review') return { label: 'In review', tone: 'info', detail: 'Ads are usually reviewed within 24 hours.' }
    if (ad.review === 'rejected') return { label: 'Rejected', tone: 'critical', detail: ad.rejectReason }
    const cr = findCreative(s, ad.creativeId)
    if (!cr || cr.status !== 'ready') return notDelivering('The creative isn\'t ready')
    const sp = findStoreProduct(s, ad.storeProductId)
    if (!sp || sp.status !== 'active') return notDelivering('Landing page product isn\'t active in Shopifly')
    if (audienceTooSmall(s, set)) return notDelivering('Audience too small')
    if (accL) return accL
    return learningLabel(set)
  }
  if (level === 'adset') {
    const set = findAdSet(s, id)
    if (!set || set.status === 'deleted') return { label: 'Deleted', tone: 'subdued' }
    const camp = findCampaign(s, set.campaignId)
    if (!camp) return notDelivering('Campaign not found')
    const accL = accountLabel(s, camp.accountId)
    if (accL && accL.tone === 'critical') return accL
    if (set.status === 'paused') return off(set.platform)
    if (camp.status !== 'active') return off(set.platform, 'campaign')
    const ads = adsInAdSet(s, set.id).filter(a => a.status === 'active')
    if (!ads.length) return notDelivering('No active ads')
    if (!ads.some(a => adDeliverable(s, a))) {
      if (ads.some(a => a.review === 'in_review')) return { label: 'In review', tone: 'info' }
      if (ads.every(a => a.review === 'rejected')) return { label: 'Rejected', tone: 'critical', detail: 'All ads were rejected' }
      return notDelivering('No deliverable ads (check creatives and landing pages)')
    }
    if (audienceTooSmall(s, set)) return notDelivering('Audience too small (under 100 people)')
    if (accL) return accL
    return learningLabel(set)
  }
  const camp = findCampaign(s, id)
  if (!camp || camp.status === 'deleted') return { label: 'Deleted', tone: 'subdued' }
  const accL = accountLabel(s, camp.accountId)
  if (accL && accL.tone === 'critical') return accL
  if (camp.status === 'paused') return off(camp.platform)
  const sets = adSetsInCampaign(s, camp.id).filter(x => x.status === 'active')
  if (!sets.length) return notDelivering(`No active ${camp.platform === 'tiktak' ? 'ad groups' : 'ad sets'}`)
  const labels = sets.map(x => deliveryLabel(s, 'adset', x.id))
  if (accL && labels.some(l => l.tone === 'success' || l.tone === 'info' || l.tone === 'attention')) return accL
  for (const want of ['Active', 'Learning', 'Learning limited', 'In review']) {
    const hit = labels.find(l => l.label === want)
    if (hit) return hit
  }
  return labels[0] ?? notDelivering('Nothing to deliver')
}

/** Effective daily budget for an entity (CBO campaign budget or sum of ad set budgets). */
export function effectiveBudget(s: GameState, level: AdLevel, id: string): number {
  if (level === 'campaign') {
    const c = findCampaign(s, id)
    if (!c || c.status === 'deleted') return 0
    if (c.budgetMode === 'cbo') return c.dailyBudget ?? 0
    return adSetsInCampaign(s, id).filter(x => x.status === 'active').reduce((a, x) => a + (x.dailyBudget ?? 0), 0)
  }
  if (level === 'adset') {
    const set = findAdSet(s, id)
    const c = set && findCampaign(s, set.campaignId)
    if (!set || !c || set.status === 'deleted') return 0
    if (c.budgetMode === 'abo') return set.dailyBudget ?? 0
    const n = Math.max(1, adSetsInCampaign(s, c.id).filter(x => x.status === 'active').length)
    return (c.dailyBudget ?? 0) * (set.allocShare ?? 1 / n)
  }
  const ad = findAd(s, id)
  if (!ad || ad.status === 'deleted') return 0
  const n = Math.max(1, adsInAdSet(s, ad.adSetId).filter(a => a.status === 'active').length)
  return effectiveBudget(s, 'adset', ad.adSetId) * (ad.allocShare ?? 1 / n)
}

export { estimateAudienceSize }

/** Audience gauge like Ads Manager's ("Your audience is broad"). */
export function audienceDefinition(size: number): 'specific' | 'defined' | 'broad' {
  if (size < 1_000_000) return 'specific'
  if (size < 20_000_000) return 'defined'
  return 'broad'
}

/** Ads Manager's right-pane estimate (market benchmarks only; never uses hidden creative data). */
export function estimateDailyResults(s: GameState, platform: Platform, t: Targeting, dailyBudget: number): {
  audienceSize: number; definition: 'specific' | 'defined' | 'broad'; reach: [number, number]; linkClicks: [number, number]; conversions: [number, number] | null
} {
  const size = estimateAudienceSize(s, platform, t)
  const typeMult = t.type === 'interest' ? 1.12 : t.type === 'lookalike' ? 1.1 : t.type === 'retargeting' ? 2.2 : 1
  const cpm = baseCpm(s, platform) * typeMult * 1.12
  const imps = Math.min((Math.max(0, dailyBudget) / cpm) * 1000, size * 1.2)
  const reach = imps / 1.12
  const B = bench(platform)
  const clicks = imps * B.ctrLink.avg * (t.type === 'retargeting' ? 1.8 : 1)
  const lpv = clicks * B.lpvRate
  const r = (x: number, lo: number, hi: number): [number, number] => [Math.round(x * lo), Math.round(x * hi)]
  let linkClicks = r(clicks, 0.55, 1.6)
  let conversions = hasPixel(s, platform) ? r(lpv, 0.006, 0.03) : null
  // like the real estimators, lean on the account's own recent results once there's enough data
  const budget = Math.max(0, dailyBudget)
  const h = recentPlatformStats(s, platform, 14)
  const blend = (bench: [number, number], expected: number, w: number): [number, number] => {
    const lo = Math.round((1 - w) * bench[0] + w * expected * 0.65)
    return [lo, Math.max(lo, Math.round((1 - w) * bench[1] + w * expected * 1.35))]
  }
  if (budget > 0 && h.spend > 0 && h.linkClicks >= 100) linkClicks = blend(linkClicks, budget * h.linkClicks / h.spend, Math.min(1, h.linkClicks / 500))
  if (conversions && budget > 0 && h.spend > 0 && h.purchases >= 10) conversions = blend(conversions, budget * h.purchases / h.spend, Math.min(1, h.purchases / 50))
  return {
    audienceSize: size,
    definition: audienceDefinition(size),
    reach: r(reach, 0.7, 1.3),
    linkClicks,
    conversions,
  }
}

/** Spend, link clicks and reported purchases on a platform over the last `days` full days. */
function recentPlatformStats(s: GameState, platform: Platform, days: number): { spend: number; linkClicks: number; purchases: number } {
  const today = Math.floor(s.time.hour / 24)
  const out = { spend: 0, linkClicks: 0, purchases: 0 }
  for (const ad of s.ads.ads) {
    if (ad.platform !== platform) continue
    for (let d = today - days; d < today; d++) {
      const st = ad.stats[d]
      if (!st) continue
      out.spend += st.spend
      out.linkClicks += st.linkClicks
      out.purchases += st.purchases
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Interests
// ---------------------------------------------------------------------------
export interface InterestHit { id: string; name: string; path: string; kind: InterestDef['kind']; size: number }

export function searchInterestsDetailed(query: string, platform: Platform, limit = 25): InterestHit[] {
  const q = query.trim().toLowerCase()
  const pool = INTERESTS.filter(i => i.platforms.includes(platform))
  let ranked: InterestDef[]
  if (!q) ranked = [...pool].sort((a, b) => b.size - a.size)
  else {
    const scored: [InterestDef, number][] = []
    for (const i of pool) {
      const n = i.name.toLowerCase()
      let sc = -1
      if (n === q) sc = 0
      else if (n.startsWith(q)) sc = 1
      else if (n.split(/[\s(/-]+/).some(w => w.startsWith(q))) sc = 2
      else if (n.includes(q)) sc = 3
      else if (i.path.toLowerCase().includes(q)) sc = 4
      if (sc >= 0) scored.push([i, sc])
    }
    ranked = scored.sort((a, b) => a[1] - b[1] || b[0].size - a[0].size).map(x => x[0])
  }
  return ranked.slice(0, limit).map(i => ({ id: i.id, name: i.name, path: i.path, kind: i.kind, size: interestSize(i, platform) }))
}

/** Interest suggestions for the targeting search box. */
export function searchInterests(query: string, platform: Platform): { name: string; size: number }[] {
  return searchInterestsDetailed(query, platform).map(({ name, size }) => ({ name, size }))
}

// ---------------------------------------------------------------------------
// Accounts & creatives
// ---------------------------------------------------------------------------
export function accountSpendLimit(s: GameState, accountId: string): number {
  const acc = findAccount(s, accountId)
  return acc ? spendLimitOf(acc) : 0
}
export function nextBillingThreshold(s: GameState, accountId: string): number {
  const acc = findAccount(s, accountId)
  return acc ? billingThresholdOf(acc) : 0
}

/** Diagnostic tips for a creative (empty until it has 1,000+ impressions). */
export function creativeInsights(s: GameState, creativeId: string): string[] {
  const c = findCreative(s, creativeId)
  if (!c || c.status !== 'ready') return []
  if (creativeImpressions(s, creativeId) < TIPS_MIN_IMPRESSIONS) return []
  return creativeTips(s, c, c.scores ?? undefined)
}

/** Ads using a creative (for "Used in N ads"). */
export function adsUsingCreative(s: GameState, creativeId: string): string[] {
  return s.ads.ads.filter(a => a.creativeId === creativeId && a.status !== 'deleted').map(a => a.id)
}

export const learningConversionsNeeded = (p: Platform) => BENCHMARKS[p].learningConversions
