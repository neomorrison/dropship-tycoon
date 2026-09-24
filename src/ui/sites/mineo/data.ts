// Mineo — data hooks & helpers. All numbers come from market.spyData (accurate ad-library
// data) and the public AliExprez listing. Mineo reports facts; interpreting them is the skill.
import { useMemo } from 'react'
import type { Niche, Platform, ProductDef } from '../../../core/types'
import { getGS, useGS } from '../../../core/store'
import { dayOf } from '../../../core/time'
import { findProduct, publicListing, spyData, type PublicListing, type SpyAd, type SpyData } from '../../../sim/market'
import { formatName } from '../../../data/creativeTaxonomy'

export const useToday = () => useGS(s => dayOf(s.time.hour))

/** Mineo Pro is active today (mirrors market.spyToolActive, reactive). */
export function useSpyActive(): boolean {
  const on = useGS(s => s.catalog.unlocks.spyTool)
  const until = useGS(s => s.catalog.spyToolUntilDay)
  const day = useToday()
  return on && until !== null && day <= until
}

export interface SpyRow { p: ProductDef; d: SpyData; l: PublicListing | null }

/** Spy data for every tracked product (recomputed daily; empty without a subscription). */
export function useSpyRows(): SpyRow[] {
  const market = useGS(s => s.catalog.market)
  const available = useGS(s => s.catalog.available)
  const active = useSpyActive()
  const day = useToday()
  return useMemo(() => {
    if (!active) return []
    const s = getGS()
    const out: SpyRow[] = []
    for (const id of available) {
      const p = findProduct(id)
      const d = p ? spyData(s, id) : null
      if (p && d) out.push({ p, d, l: publicListing(s, id) })
    }
    return out
  }, [market, available, active, day])
}

export function useSpyRow(id: string): SpyRow | null {
  const market = useGS(s => s.catalog.market[id])
  const isAvail = useGS(s => s.catalog.available.includes(id))
  const active = useSpyActive()
  const day = useToday()
  return useMemo(() => {
    const p = findProduct(id)
    if (!active || !p || !isAvail) return null
    const s = getGS()
    const d = spyData(s, id)
    return d ? { p, d, l: publicListing(s, id) } : null
  }, [id, market, isAvail, active, day])
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------
export interface FeedAd extends SpyAd {
  key: string
  catalogId: string
  product: ProductDef
  niche: Niche
  /** likes + comments + shares per day live (engagement velocity) */
  velocity: number
  engagement: number
}
export function feedFrom(rows: SpyRow[]): FeedAd[] {
  const out: FeedAd[] = []
  for (const { p, d } of rows) {
    d.topAds.forEach((a, i) => {
      const engagement = a.likes + a.comments * 3 + a.shares * 4
      out.push({ ...a, key: `${p.id}:${i}`, catalogId: p.id, product: p, niche: p.niche, engagement, velocity: engagement / Math.max(3, a.daysRunning) })
    })
  }
  return out
}

const STILL = new Set([formatName('static_image'), formatName('carousel')])
export const isVideoFormat = (format?: string) => !format || !STILL.has(format)
export function previewPlatform(a: Pick<SpyAd, 'platform' | 'format'>): 'tiktak' | 'fadbook-reels' | 'fadbook-feed' {
  if (a.platform === 'tiktak') return 'tiktak'
  return isVideoFormat(a.format) ? 'fadbook-reels' : 'fadbook-feed'
}

// ---------------------------------------------------------------------------
// Copy for previews (deterministic per ad)
// ---------------------------------------------------------------------------
function h(str: string): number {
  let x = 2166136261
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619) }
  return (x >>> 0) / 4294967296
}
const pick = <T,>(arr: readonly T[], key: string) => arr[Math.floor(h(key) * arr.length)]

const CAPTION_TAIL = ['Free US shipping today only 🇺🇸', 'Link in bio before it sells out again', '30-day money-back guarantee ✅', 'Restocked — limited units', 'Use code SAVE15 at checkout', 'Ships from our US warehouse 📦']
const SCRIPT_MID = [
  'Honestly didn’t expect it to work this well.',
  'I’ve tried the cheap ones. This is different.',
  'Took me two seconds to figure out.',
  'My family keeps stealing it from me.',
  'Watch what happens when I turn it on.',
  'This is the part nobody shows you.',
]
const SCRIPT_END = ['Link’s in my bio.', 'Grab one before they sell out.', 'Trust me on this one.', 'You can thank me later.']

export function productLabel(p: ProductDef): string {
  return p.name.replace(/\(.*?\)/g, '').trim()
}
export function adCaption(a: FeedAd | (SpyAd & { catalogId: string; product: ProductDef })): string {
  const price = a.price ? ` Now $${a.price.toFixed(2)}.` : ''
  return `${a.hookText ?? productLabel(a.product)}${price} ${pick(CAPTION_TAIL, `${a.catalogId}${a.advertiser}cap`)}`
}
export function adScript(a: { hookText?: string; catalogId: string; advertiser: string }): string {
  return `${a.hookText ?? ''} ${pick(SCRIPT_MID, `${a.catalogId}${a.advertiser}mid`)} ${pick(SCRIPT_END, `${a.catalogId}${a.advertiser}end`)}`.trim()
}
export const advertiserDomain = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function socialCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(Math.round(n))
}
/** "5d ago", "3 mo ago", "2.4 yr ago" */
export function agoLabel(days: number): string {
  if (days < 60) return `${days}d ago`
  if (days < 365) return `${Math.round(days / 30.4)} mo ago`
  return `${(days / 365).toFixed(1)} yr ago`
}
export const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const PLATFORM_NAME: Record<Platform, string> = { fadbook: 'Fadbook', tiktak: 'TikTak' }
export const TREND_LABEL: Record<SpyData['engagementTrend'], string> = { rising: 'Rising', flat: 'Stable', falling: 'Falling' }
