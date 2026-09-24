// Pure helpers for ads reporting — shared by Fadbook/TikTak UIs, rules, and the coach.
import type { AdDayStats, AdLevel, GameState, Platform } from '../../core/types'
import type { DateRange } from '../../core/time'
import { safeDiv } from '../../core/format'

export const emptyStats = (): AdDayStats => ({
  spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, lpv: 0, videoViewsShort: 0, videoViewsLong: 0,
  v25: 0, v50: 0, v75: 0, v100: 0, atc: 0, checkouts: 0, purchases: 0, purchaseValue: 0, truePurchases: 0,
  trueRevenue: 0, likes: 0, comments: 0, shares: 0,
})

export function addStats(into: AdDayStats, x: AdDayStats): AdDayStats {
  for (const k of Object.keys(into) as (keyof AdDayStats)[]) into[k] += x[k] || 0
  return into
}
export const sumStats = (list: AdDayStats[]) => list.reduce((a, x) => addStats(a, x), emptyStats())

/** Ad ids under an entity */
export function adIdsUnder(s: GameState, level: AdLevel, id: string): string[] {
  if (level === 'ad') return [id]
  if (level === 'adset') return s.ads.ads.filter(a => a.adSetId === id).map(a => a.id)
  return s.ads.ads.filter(a => a.campaignId === id).map(a => a.id)
}

/** Aggregate stats for an entity over a date range (reach is approximated). */
export function statsFor(s: GameState, level: AdLevel, id: string, range: DateRange): AdDayStats {
  const out = emptyStats()
  const ids = new Set(adIdsUnder(s, level, id))
  for (const ad of s.ads.ads) {
    if (!ids.has(ad.id)) continue
    const days = Object.keys(ad.stats).map(Number)
    const oldest = days.length ? Math.min(...days) : Infinity
    // lifetime folded stats count only for ranges reaching before the retained window
    if (range.from < oldest && range.from <= 0) addStats(out, ad.lifetime)
    for (const d of days) if (d >= range.from && d <= range.to) addStats(out, ad.stats[d])
  }
  return out
}

/** Stats across a whole platform (all accounts) for a range. */
export function platformStats(s: GameState, platform: Platform, range: DateRange): AdDayStats {
  const out = emptyStats()
  for (const ad of s.ads.ads) {
    if (ad.platform !== platform) continue
    for (const [d, st] of Object.entries(ad.stats)) {
      const day = Number(d)
      if (day >= range.from && day <= range.to) addStats(out, st)
    }
  }
  return out
}

export interface DerivedAdMetrics {
  cpm: number
  ctrAll: number
  ctrLink: number
  cpc: number
  cpcLink: number
  costPerLpv: number
  frequency: number
  /** Fadbook: 3s plays / impressions; TikTak: 2s views / impressions */
  hookRate: number
  /** Fadbook: ThruPlays / 3s plays; TikTak: 6s views / 2s views */
  holdRate: number
  /** TikTak native: 6s views / impressions */
  view6sRate: number
  atcRate: number
  /** purchases / landing page views */
  cvr: number
  cpa: number
  costPerAtc: number
  roas: number
  aov: number
  engagementRate: number
}

export function deriveMetrics(st: AdDayStats): DerivedAdMetrics {
  return {
    cpm: safeDiv(st.spend, st.impressions) * 1000,
    ctrAll: safeDiv(st.clicks, st.impressions),
    ctrLink: safeDiv(st.linkClicks, st.impressions),
    cpc: safeDiv(st.spend, st.clicks),
    cpcLink: safeDiv(st.spend, st.linkClicks),
    costPerLpv: safeDiv(st.spend, st.lpv),
    frequency: safeDiv(st.impressions, st.reach),
    hookRate: safeDiv(st.videoViewsShort, st.impressions),
    holdRate: safeDiv(st.videoViewsLong, st.videoViewsShort),
    view6sRate: safeDiv(st.videoViewsLong, st.impressions),
    atcRate: safeDiv(st.atc, st.lpv),
    cvr: safeDiv(st.purchases, st.lpv),
    cpa: safeDiv(st.spend, st.purchases),
    costPerAtc: safeDiv(st.spend, st.atc),
    roas: safeDiv(st.purchaseValue, st.spend),
    aov: safeDiv(st.purchaseValue, st.purchases),
    engagementRate: safeDiv(st.likes + st.comments + st.shares, st.impressions),
  }
}
