// Internal helpers shared by the ads sub-modules (not part of the public API unless re-exported).
import type {
  Ad, AdAccount, AdDayStats, AdSet, Campaign, Creative, GameState, Platform, ProductDef, StoreProduct,
} from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { dayOf } from '../../core/time'
import { getProduct } from '../market'
import { addStats, emptyStats } from './metrics'

export const PLATFORM_NAME: Record<Platform, string> = { fadbook: 'Fadbook', tiktak: 'TikTak' }
export const ADSET_WORD: Record<Platform, string> = { fadbook: 'ad set', tiktak: 'ad group' }
export const CHANNEL_APP: Record<Platform, string> = { fadbook: 'fadbook-channel', tiktak: 'tiktak-channel' }
export const PNL_KEY = { fadbook: 'adSpendFadbook', tiktak: 'adSpendTiktak' } as const
export const MAIL_FROM: Record<Platform, { from: string; fromEmail: string }> = {
  fadbook: { from: 'Fadbook for Business', fromEmail: 'noreply@business.fadbook.com' },
  tiktak: { from: 'TikTak for Business', fromEmail: 'no-reply@ads.tiktak.com' },
}

/** Deep-link paths used in ads notifications/mail (site = 'fadbook' | 'tiktak' | 'studio'). UIs should route these. */
export const ADS_PATHS = {
  /** fadbook/tiktak: billing & payment activity ("Pay now") */
  billing: 'billing',
  /** fadbook/tiktak: account status, disapprovals, appeal button */
  accountQuality: 'account_quality',
  /** fadbook/tiktak: automated rules + rule log */
  rules: 'rules',
  /** tiktak: organic posts (views, Spark button) */
  organicPosts: 'assets/posts',
  /** studio: creative library */
  library: 'library',
} as const

/** Stats kept per day before folding into `lifetime`. */
export const STATS_RETENTION_DAYS = 120
/** Rolling window for frequency / fatigue. */
export const FREQ_WINDOW_DAYS = 7

export const bench = (p: Platform) => BENCHMARKS[p]
export const today = (s: GameState) => dayOf(s.time.hour)

export function productDef(catalogId: string): ProductDef | null {
  try {
    return getProduct(catalogId)
  } catch {
    return null
  }
}

export const findAccount = (s: GameState, id: string): AdAccount | undefined => s.ads.accounts.find(a => a.id === id)
export const findCampaign = (s: GameState, id: string): Campaign | undefined => s.ads.campaigns.find(c => c.id === id)
export const findAdSet = (s: GameState, id: string): AdSet | undefined => s.ads.adSets.find(a => a.id === id)
export const findAd = (s: GameState, id: string): Ad | undefined => s.ads.ads.find(a => a.id === id)
export const findCreative = (s: GameState, id: string): Creative | undefined => s.creatives.creatives.find(c => c.id === id)
export const findStoreProduct = (s: GameState, id: string): StoreProduct | undefined => s.store.products.find(p => p.id === id)

export const liveStatus = (st: { status: string }) => st.status !== 'deleted'

/** Pixel connected for a platform: the channel app installs it. */
export function hasPixel(s: GameState, p: Platform): boolean {
  const px = s.store.pixel?.[p]
  if (px?.installed) return true
  return s.store.apps.some(a => a.appId === CHANNEL_APP[p])
}
export const pixelPurchases = (s: GameState, p: Platform) => s.store.pixel?.[p]?.purchases ?? 0

/** Policy crackdown multiplier on product claim risk (events module sets modifiers.claimRiskMult). */
export function claimRiskMult(s: GameState): number {
  const m = s.events.modifiers.claimRiskMult
  if (m != null && m > 0) return m
  const day = dayOf(s.time.hour)
  return s.events.active.some(e => e.kind === 'policy_crackdown' && day >= e.startDay && day <= e.endDay) ? 1.5 : 1
}

export function skillLevel(s: GameState, id: keyof GameState['skills']): number {
  return s.skills?.[id]?.level ?? 1
}

/** Stats bucket for an ad on a day (created on demand). */
export function dayStats(ad: Ad, day: number): AdDayStats {
  return (ad.stats[day] ??= emptyStats())
}

/** Totals across retained days + folded lifetime. */
export function adTotals(ad: Ad): AdDayStats {
  const out = addStats(emptyStats(), ad.lifetime)
  for (const st of Object.values(ad.stats)) addStats(out, st)
  return out
}

/** Sum of stats for an ad over [from, to] (inclusive days, retained window only). */
export function adRange(ad: Ad, from: number, to: number): AdDayStats {
  const out = emptyStats()
  for (let d = Math.max(0, from); d <= to; d++) {
    const st = ad.stats[d]
    if (st) addStats(out, st)
  }
  return out
}

export function adsInAdSet(s: GameState, adSetId: string): Ad[] {
  return s.ads.ads.filter(a => a.adSetId === adSetId && a.status !== 'deleted')
}
export function adSetsInCampaign(s: GameState, campaignId: string): AdSet[] {
  return s.ads.adSets.filter(a => a.campaignId === campaignId && a.status !== 'deleted')
}

/** Current daily budget driving an ad set's learning comparison (CBO → campaign budget). */
export function budgetBasis(s: GameState, set: AdSet): number {
  const camp = findCampaign(s, set.campaignId)
  if (camp?.budgetMode === 'cbo') return camp.dailyBudget ?? 0
  return set.dailyBudget ?? 0
}

export function spendLimitOf(acc: AdAccount): number {
  const ladder = bench(acc.platform).spendLimitLadder
  return ladder[Math.min(ladder.length - 1, Math.max(0, acc.spendLimitTier))]
}
export function billingThresholdOf(acc: AdAccount): number {
  const t = bench(acc.platform).billingThresholds
  return t[Math.min(t.length - 1, Math.max(0, acc.billingTier))]
}

/** Case-insensitive word tokens (letters/digits), for copy heuristics. */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).map(t => t.replace(/'/g, ''))
}

export const fmtMoney = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 === 0 && n >= 100 ? 0 : 2, maximumFractionDigits: 2 })
export const fmtPct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')

/** Audience share of US ad audiences by age (Fadbook/TikTak skew young). Index = age bucket start. */
const AGE_BUCKETS: { from: number; to: number; share: Record<Platform, number> }[] = [
  { from: 18, to: 24, share: { fadbook: 0.15, tiktak: 0.3 } },
  { from: 25, to: 34, share: { fadbook: 0.24, tiktak: 0.3 } },
  { from: 35, to: 44, share: { fadbook: 0.2, tiktak: 0.18 } },
  { from: 45, to: 54, share: { fadbook: 0.15, tiktak: 0.11 } },
  { from: 55, to: 64, share: { fadbook: 0.13, tiktak: 0.07 } },
  { from: 65, to: 80, share: { fadbook: 0.13, tiktak: 0.04 } },
]
/** Share of a platform's adult audience inside [ageMin, ageMax] (65 means 65+). */
export function ageShare(p: Platform, ageMin: number, ageMax: number): number {
  const hi = ageMax >= 65 ? 80 : ageMax
  let sh = 0
  for (const b of AGE_BUCKETS) {
    const lo = Math.max(b.from, ageMin)
    const up = Math.min(b.to, hi)
    if (up < lo) continue
    sh += b.share[p] * ((up - lo + 1) / (b.to - b.from + 1))
  }
  return Math.max(0.01, Math.min(1, sh))
}
export const genderShare = (p: Platform, g: 'all' | 'female' | 'male') =>
  g === 'all' ? 1 : g === 'female' ? (p === 'tiktak' ? 0.55 : 0.53) : (p === 'tiktak' ? 0.45 : 0.47)
