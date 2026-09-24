// Pure view helpers for CreatorHub (no state writes). Everything the player sees here is
// production info (cost, timing, footage quality) or real delivery data; the hidden creative
// fit scores are never read.
import type {
  Ad, AdDayStats, Creative, FormatId, GameState, Niche, OrganicPost, StoreProduct,
} from '../../../core/types'
import { produce } from 'immer'
import { dayOf, formatDate, hourOfDay, rangeLastN, rangeLifetime } from '../../../core/time'
import { FORMATS } from '../../../data/creativeTaxonomy'
import { creatorProfile } from '../../../data/creators'
import { findProduct } from '../../../sim/market'
import { addStats, emptyStats, statsFor, deliveryLabel, type DeliveryLabel } from '../../../sim/ads'

/**
 * Run a sim query that may normalize state as a side effect (e.g. life's canDoActivity fills optional
 * fields) against a throwaway immer draft, so it never writes to the frozen store. Return plain values only.
 */
export function sandboxed<T>(s: GameState, fn: (draft: GameState) => T): T {
  let out: T | undefined
  produce(s, d => { out = fn(d as GameState) })
  return out as T
}

export const NICHE_LABEL: Record<Niche, string> = {
  pet: 'Pets', beauty: 'Beauty', home: 'Home', kitchen: 'Kitchen', fitness: 'Fitness', wellness: 'Wellness',
  car: 'Car', gadgets: 'Gadgets', baby: 'Baby', kids: 'Kids', fashion: 'Fashion', outdoor: 'Outdoor',
}

export const AGENCY_NAME = 'Northlight Creative Studio'

// ---------------------------------------------------------------------------
// Products & samples
// ---------------------------------------------------------------------------
export function briefableProducts(products: StoreProduct[]): StoreProduct[] {
  const order = { active: 0, draft: 1, archived: 2 }
  return products.filter(p => p.status !== 'archived').sort((a, b) => order[a.status] - order[b.status] || b.createdDay - a.createdDay)
}

export function productName(s: GameState, catalogId: string): string {
  const sp = s.store.products.find(p => p.catalogId === catalogId && p.status !== 'archived') ?? s.store.products.find(p => p.catalogId === catalogId)
  return sp?.title || findProduct(catalogId)?.name || catalogId
}

export type SampleKind = 'stock' | 'owned' | 'transit' | 'none'
export interface SampleStatus {
  kind: SampleKind
  /** chip label */
  label: string
  /** one-line explanation */
  detail: string
  arriveDay?: number
  units?: number
}

export function sampleStatus(s: GameState, catalogId: string): SampleStatus {
  const today = dayOf(s.time.hour)
  const units = s.catalog.inventory[catalogId]?.units ?? 0
  const owned = s.catalog.samplesOwned.includes(catalogId)
  if (owned && units > 0) {
    return { kind: 'owned', label: 'Sample in hand', detail: `You have a sample at home and ${units.toLocaleString('en-US')} units at your 3PL.`, units }
  }
  if (owned) return { kind: 'owned', label: 'Sample in hand', detail: 'The sample is at your place, ready to film or send to a creator.' }
  if (units > 0) {
    return { kind: 'stock', label: `${units.toLocaleString('en-US')} at 3PL`, detail: `No sample at home, but your 3PL can ship one of your ${units.toLocaleString('en-US')} units to a creator (about 3 days).`, units }
  }
  const pending = s.catalog.samples.filter(x => x.catalogId === catalogId && !x.received).sort((a, b) => a.arriveDay - b.arriveDay)[0]
  if (pending) {
    const d = Math.max(0, pending.arriveDay - today)
    return {
      kind: 'transit',
      label: d <= 0 ? 'Sample arriving today' : `Sample in ${d} day${d === 1 ? '' : 's'}`,
      detail: `Your sample is on its way and should arrive ${formatDate(pending.arriveDay, 'medium')}.`,
      arriveDay: pending.arriveDay,
    }
  }
  return { kind: 'none', label: 'No sample', detail: 'You don\'t have this product in hand yet.' }
}

export const hasProductInHand = (st: SampleStatus) => st.kind === 'owned' || st.kind === 'stock'

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
/** Finished cut length (mirrors the production model: beats × seconds-per-beat, clamped per format). */
export function briefDurationSec(format: FormatId | null, beats: number): number {
  if (!format) return 0
  const f = FORMATS[format]
  if (!f?.video) return 0
  return Math.round(Math.min(f.durationRange[1], Math.max(f.durationRange[0], beats * f.secondsPerBeat)))
}

export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}
export function fmtClip(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export function fmtHourAbs(hour: number): string {
  const h = hourOfDay(hour)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${formatDate(dayOf(hour), 'md')}, ${h12} ${h < 12 ? 'AM' : 'PM'}`
}
export function fmtDayRange(a: number, b: number): string {
  if (a === b) return formatDate(a, 'md')
  return `${formatDate(a, 'md')} – ${formatDate(b, 'md')}`
}

/** Minutes until a newly queued activity would start (current activity + queue). */
export function queueWaitMinutes(s: GameState): number {
  const cur = s.player.activity
  let m = cur ? Math.max(0, cur.remainingMin) : 0
  for (const q of s.player.queue) m += Math.max(0, q.remainingMin ?? q.durationMin)
  return m
}

/** Position of a self-shoot / edit in the activity queue. */
export function activityEta(s: GameState, creativeId: string): { running: boolean; startsInMin: number; leftMin: number } | null {
  const cur = s.player.activity
  if (cur?.payload?.creativeId === creativeId) return { running: true, startsInMin: 0, leftMin: Math.max(0, cur.remainingMin) }
  let wait = cur ? Math.max(0, cur.remainingMin) : 0
  for (const q of s.player.queue) {
    const len = Math.max(0, q.remainingMin ?? q.durationMin)
    if (q.payload?.creativeId === creativeId) return { running: false, startsInMin: wait, leftMin: wait + len }
    wait += len
  }
  return null
}

export type StatusTone = 'success' | 'info' | 'accent' | 'critical' | 'subdued'
export interface CreativeEta {
  badge: string
  tone: StatusTone
  /** short line under the badge */
  text: string
  /** in-game hours until delivery, when known */
  hoursLeft?: number
}

export function creativeEta(s: GameState, c: Creative): CreativeEta {
  const hour = s.time.hour
  switch (c.status) {
    case 'ready':
      return { badge: 'Ready', tone: 'success', text: c.readyHour != null ? `Delivered ${formatDate(dayOf(c.readyHour), 'md')}` : 'In your library' }
    case 'failed':
      return { badge: c.failReason === 'Cancelled.' ? 'Cancelled' : 'Not delivered', tone: 'critical', text: c.failReason ?? 'Production stopped.' }
    case 'waiting_sample': {
      const arrive = c.sampleArriveHour ?? hour
      const left = Math.max(0, arrive - hour)
      const who = firstName(producerDisplay(s, c).name)
      return {
        badge: 'Product shipping', tone: 'info',
        text: left <= 0 ? `Arriving at ${who}'s today` : `Reaches ${who} ${formatDate(dayOf(arrive), 'md')} · video due ${c.readyHour != null ? formatDate(dayOf(c.readyHour), 'md') : 'after'}`,
        hoursLeft: c.readyHour != null ? Math.max(0, c.readyHour - hour) : undefined,
      }
    }
    case 'in_production': {
      if (c.producer === 'self' || c.producer === 'supplier_edit') {
        const verb = c.producer === 'self' ? 'Filming' : 'Editing'
        const eta = activityEta(s, c.id)
        if (!eta) return { badge: verb, tone: 'accent', text: 'Waiting to start' }
        if (eta.running) return { badge: `${verb} now`, tone: 'accent', text: `${fmtMinutes(eta.leftMin)} left`, hoursLeft: eta.leftMin / 60 }
        return { badge: 'Queued', tone: 'accent', text: `Starts in ~${fmtMinutes(eta.startsInMin)} · done in ~${fmtMinutes(eta.leftMin)}`, hoursLeft: eta.leftMin / 60 }
      }
      const left = c.readyHour != null ? Math.max(0, c.readyHour - hour) : undefined
      const verb = c.producer === 'agency' ? 'In the studio' : 'Filming'
      return {
        badge: verb, tone: 'accent',
        text: c.readyHour != null ? `Due ${formatDate(dayOf(c.readyHour), 'md')}` : 'In production',
        hoursLeft: left,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Producers
// ---------------------------------------------------------------------------
export interface ProducerDisplay { name: string; sub: string; portrait?: string }
export const firstName = (n: string) => n.split(' ')[0] || n

export function producerDisplay(s: GameState, c: Pick<Creative, 'producer' | 'creatorId'>): ProducerDisplay {
  switch (c.producer) {
    case 'self': return { name: 'You', sub: 'Filmed at home' }
    case 'supplier_edit': return { name: 'You', sub: 'Supplier footage edit' }
    case 'agency': return { name: AGENCY_NAME, sub: 'Agency pack' }
    case 'ugc': {
      const live = s.creatives.creators.find(x => x.id === c.creatorId)
      const prof = creatorProfile(c.creatorId ?? '')
      const name = live?.name ?? prof?.name ?? 'UGC creator'
      return { name, sub: live?.handle ?? prof?.handle ?? 'UGC creator', portrait: live?.portrait ?? prof?.portrait }
    }
    case 'staff': {
      const m = s.staff.members.find(x => x.id === c.creatorId)
      return { name: m?.name ?? 'Your in-house creator', sub: 'In-house creator', portrait: m?.portrait }
    }
  }
}

/** What a viewer would notice about the footage itself (visible production value, not ad fit). */
export function qualityWord(q: number): string {
  if (q >= 0.82) return 'Studio-grade'
  if (q >= 0.68) return 'Sharp'
  if (q >= 0.52) return 'Clean'
  if (q >= 0.38) return 'Basic'
  return 'Rough'
}

// ---------------------------------------------------------------------------
// Performance (real delivery data only)
// ---------------------------------------------------------------------------
export interface CreativePerf {
  ads: Ad[]
  liveAds: Ad[]
  totals: AdDayStats
  last7: AdDayStats
  posts: OrganicPost[]
  organicViews: number
  /** paid impressions + organic views (the tips gate counts both) */
  exposure: number
  platforms: ('fadbook' | 'tiktak')[]
}

const LIVE_LABELS = new Set(['Active', 'Learning', 'Learning limited'])
export const isLive = (d: DeliveryLabel) => LIVE_LABELS.has(d.label)

export function creativePerf(s: GameState, creativeId: string): CreativePerf {
  const today = dayOf(s.time.hour)
  const life = rangeLifetime(today)
  const week = rangeLastN(today, 7)
  const ads = s.ads.ads.filter(a => a.creativeId === creativeId && a.status !== 'deleted')
  const allAds = s.ads.ads.filter(a => a.creativeId === creativeId)
  const totals = emptyStats()
  const last7 = emptyStats()
  for (const ad of allAds) {
    addStats(totals, statsFor(s, 'ad', ad.id, life))
    addStats(last7, statsFor(s, 'ad', ad.id, week))
  }
  const liveAds = ads.filter(a => isLive(deliveryLabel(s, 'ad', a.id)))
  const posts = s.ads.organicPosts.filter(p => p.creativeId === creativeId)
  const organicViews = posts.reduce((a, p) => a + p.views, 0)
  const platforms = [...new Set(allAds.map(a => a.platform))]
  return { ads, liveAds, totals, last7, posts, organicViews, exposure: totals.impressions + organicViews, platforms }
}
