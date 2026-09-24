// Reporting model for the Fadbook Ads Manager: per-ad range stats rolled up to ad sets and
// campaigns, day/week/month breakdowns, and helpers to read ad-account state. Only
// platform-REPORTED numbers are used (never the hidden truePurchases / trueRevenue).
import type { Ad, AdAccount, AdDayStats, AdLevel, AdSet, Campaign, Creative, GameState, StoreProduct } from '../../../core/types'
import { addStats, emptyStats } from '../../../sim/ads'
import { dateOfDay, formatDate, monthName, type DateRange } from '../../../core/time'

export type Entity = Campaign | AdSet | Ad
export type ResultKind = 'purchase' | 'atc' | 'mixed' | 'none'

/** One table row (an entity, or a breakdown slice of one). */
export interface Row {
  key: string
  level: AdLevel
  id: string
  name: string
  entity: Entity
  st: AdDayStats
  /** estimated total seconds watched by 3-second plays (average play time) */
  playSec: number
  /** impressions served by video ads (hook rate denominator) */
  vidImps: number
  /** landing store products under this row */
  products: string[]
  resultKind: ResultKind
  /** breakdown slice label ("Mar 4, 2026", "Week of …") */
  slice?: string
  sliceSort?: number
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------
/** Ad stats over an inclusive day range (folded lifetime counts when the range starts at day 0). */
export function adRangeStats(ad: Ad, r: DateRange): AdDayStats {
  const out = emptyStats()
  let oldest = Infinity
  for (const k in ad.stats) {
    const d = Number(k)
    if (d < oldest) oldest = d
    if (d >= r.from && d <= r.to) addStats(out, ad.stats[d])
  }
  if (r.from <= 0 && r.from < oldest) addStats(out, ad.lifetime)
  return out
}

/** Average-play-time model from 3s plays and quartile completions (seconds watched in total). */
export function playSeconds(st: AdDayStats, durationSec: number): number {
  const plays = st.videoViewsShort
  const D = durationSec
  if (!plays || !(D > 0)) return 0
  const early = Math.max(0, plays - st.v25) * Math.min(D, (3 + 0.25 * D) / 2)
  const q1 = Math.max(0, st.v25 - st.v50) * 0.375 * D
  const q2 = Math.max(0, st.v50 - st.v75) * 0.625 * D
  const q3 = Math.max(0, st.v75 - st.v100) * 0.875 * D
  return early + q1 + q2 + q3 + st.v100 * D
}

interface AdAgg { st: AdDayStats; playSec: number; vidImps: number }
function aggOf(ad: Ad, st: AdDayStats, creatives: Map<string, Creative>): AdAgg {
  const cr = creatives.get(ad.creativeId)
  const video = !!cr?.isVideo
  return { st, playSec: video ? playSeconds(st, cr!.durationSec) : 0, vidImps: video ? st.impressions : 0 }
}

// ---------------------------------------------------------------------------
// Account-scoped entity lists
// ---------------------------------------------------------------------------
export interface AccountData {
  campaigns: Campaign[]
  adSets: AdSet[]
  ads: Ad[]
  campaignById: Map<string, Campaign>
  adSetById: Map<string, AdSet>
  creatives: Map<string, Creative>
  products: Map<string, StoreProduct>
}

export function accountData(s: GameState, accountId: string | null): AccountData {
  const campaigns = s.ads.campaigns.filter(c => c.platform === 'fadbook' && c.accountId === accountId && c.status !== 'deleted')
  const ids = new Set(campaigns.map(c => c.id))
  const adSets = s.ads.adSets.filter(a => ids.has(a.campaignId) && a.status !== 'deleted')
  const setIds = new Set(adSets.map(a => a.id))
  const ads = s.ads.ads.filter(a => setIds.has(a.adSetId) && a.status !== 'deleted')
  return {
    campaigns,
    adSets,
    ads,
    campaignById: new Map(campaigns.map(c => [c.id, c])),
    adSetById: new Map(adSets.map(a => [a.id, a])),
    creatives: new Map(s.creatives.creatives.map(c => [c.id, c])),
    products: new Map(s.store.products.map(p => [p.id, p])),
  }
}

function kindOfSets(sets: AdSet[]): ResultKind {
  const live = sets.filter(x => x.status !== 'deleted')
  if (!live.length) return 'none'
  const k = new Set(live.map(x => (x.optimization === 'add_to_cart' ? 'atc' : 'purchase')))
  return k.size > 1 ? 'mixed' : (k.values().next().value as ResultKind)
}

/** Build rows for every entity at every level over a range. */
export function buildRows(d: AccountData, r: DateRange): Record<AdLevel, Row[]> {
  const perAd = new Map<string, AdAgg>()
  for (const ad of d.ads) perAd.set(ad.id, aggOf(ad, adRangeStats(ad, r), d.creatives))
  return rollUp(d, perAd)
}

function rollUp(d: AccountData, perAd: Map<string, AdAgg>, slice?: { label: string; sort: number; keySuffix: string }): Record<AdLevel, Row[]> {
  const setAgg = new Map<string, { st: AdDayStats; playSec: number; vidImps: number; products: Set<string> }>()
  const campAgg = new Map<string, { st: AdDayStats; playSec: number; vidImps: number; products: Set<string> }>()
  const bucket = (m: typeof setAgg, id: string) => {
    let b = m.get(id)
    if (!b) m.set(id, (b = { st: emptyStats(), playSec: 0, vidImps: 0, products: new Set() }))
    return b
  }
  for (const set of d.adSets) bucket(setAgg, set.id)
  for (const c of d.campaigns) bucket(campAgg, c.id)
  const adRows: Row[] = []
  for (const ad of d.ads) {
    const a = perAd.get(ad.id)
    if (!a) continue
    const set = d.adSetById.get(ad.adSetId)
    for (const b of [bucket(setAgg, ad.adSetId), bucket(campAgg, ad.campaignId)]) {
      addStats(b.st, a.st)
      b.playSec += a.playSec
      b.vidImps += a.vidImps
      b.products.add(ad.storeProductId)
    }
    adRows.push({
      key: slice ? `${ad.id}:${slice.keySuffix}` : ad.id, level: 'ad', id: ad.id, name: ad.name, entity: ad, st: a.st, playSec: a.playSec,
      vidImps: a.vidImps, products: [ad.storeProductId], resultKind: set ? kindOfSets([set]) : 'purchase',
      slice: slice?.label, sliceSort: slice?.sort,
    })
  }
  const setRows: Row[] = d.adSets.map(set => {
    const b = setAgg.get(set.id)!
    return {
      key: slice ? `${set.id}:${slice.keySuffix}` : set.id, level: 'adset' as const, id: set.id, name: set.name, entity: set, st: b.st,
      playSec: b.playSec, vidImps: b.vidImps, products: [...b.products], resultKind: kindOfSets([set]), slice: slice?.label, sliceSort: slice?.sort,
    }
  })
  const campRows: Row[] = d.campaigns.map(c => {
    const b = campAgg.get(c.id)!
    return {
      key: slice ? `${c.id}:${slice.keySuffix}` : c.id, level: 'campaign' as const, id: c.id, name: c.name, entity: c, st: b.st,
      playSec: b.playSec, vidImps: b.vidImps, products: [...b.products], resultKind: kindOfSets(d.adSets.filter(x => x.campaignId === c.id)),
      slice: slice?.label, sliceSort: slice?.sort,
    }
  })
  return { campaign: campRows, adset: setRows, ad: adRows }
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------
export interface Slice { from: number; to: number; label: string; sort: number; key: string }

export function slicesFor(r: DateRange, kind: 'day' | 'week' | 'month', firstDataDay: number): Slice[] {
  const from = Math.max(r.from, firstDataDay, 0)
  const out: Slice[] = []
  if (from > r.to) return out
  if (kind === 'day') {
    for (let d = r.to; d >= from; d--) out.push({ from: d, to: d, label: formatDate(d, 'short'), sort: d, key: `d${d}` })
    return out
  }
  if (kind === 'week') {
    // weeks start Monday (game weekday 0)
    let end = r.to
    while (end >= from) {
      const start = Math.max(from, end - (((end % 7) + 7) % 7))
      out.push({ from: start, to: end, label: start === end ? formatDate(start, 'short') : `${formatDate(start, 'md')} – ${formatDate(end, 'short')}`, sort: start, key: `w${start}` })
      end = start - 1
    }
    return out
  }
  let end = r.to
  while (end >= from) {
    const dt = dateOfDay(end)
    const first = end - (dt.getUTCDate() - 1)
    const start = Math.max(from, first)
    out.push({ from: start, to: end, label: `${monthName(dt.getUTCMonth(), true)} ${dt.getUTCFullYear()}`, sort: start, key: `m${start}` })
    end = start - 1
  }
  return out
}

/** Breakdown sub-rows for every entity: Map<entityId, Row[]> (newest slice first). */
export function breakdownRows(d: AccountData, r: DateRange, kind: 'day' | 'week' | 'month', level: AdLevel): Map<string, Row[]> {
  const firstDay = d.campaigns.reduce((m, c) => Math.min(m, Math.floor(c.createdHour / 24)), Infinity)
  const slices = slicesFor(r, kind, Number.isFinite(firstDay) ? firstDay : r.from)
  const out = new Map<string, Row[]>()
  // days older than the stats retention window only survive as per-ad lifetime totals: show them
  // as one summary slice so the breakdown still adds up to the parent row
  const folded = r.from <= 0 && d.ads.some(ad => ad.lifetime.impressions > 0 || ad.lifetime.spend > 0)
  if (folded) {
    let oldest = Infinity
    for (const ad of d.ads) for (const k in ad.stats) oldest = Math.min(oldest, Number(k))
    slices.push({ from: -1, to: -1, label: Number.isFinite(oldest) ? `Before ${formatDate(oldest, 'short')}` : 'Earlier', sort: -1, key: 'lifetime' })
  }
  for (const sl of slices) {
    const perAd = new Map<string, AdAgg>()
    for (const ad of d.ads) perAd.set(ad.id, aggOf(ad, sl.key === 'lifetime' ? ad.lifetime : adRangeStats(ad, { from: sl.from, to: sl.to }), d.creatives))
    const rows = rollUp(d, perAd, { label: sl.label, sort: sl.sort, keySuffix: sl.key })[level]
    for (const row of rows) {
      if (row.st.impressions <= 0 && row.st.spend <= 0) continue
      const list = out.get(row.id) ?? []
      list.push(row)
      out.set(row.id, list)
    }
  }
  return out
}

/** Daily series for a set of entities (charts). */
export function dailySeries(d: AccountData, level: AdLevel, ids: string[] | null, r: DateRange): { day: number; st: AdDayStats; playSec: number; vidImps: number }[] {
  const want = ids ? new Set(ids) : null
  const ads = d.ads.filter(ad => {
    if (!want) return true
    if (level === 'ad') return want.has(ad.id)
    if (level === 'adset') return want.has(ad.adSetId)
    return want.has(ad.campaignId)
  })
  const firstDay = Math.max(0, r.from)
  const out: { day: number; st: AdDayStats; playSec: number; vidImps: number }[] = []
  for (let day = firstDay; day <= r.to; day++) {
    const st = emptyStats()
    let playSec = 0
    let vidImps = 0
    for (const ad of ads) {
      const x = ad.stats[day]
      if (!x) continue
      addStats(st, x)
      const cr = d.creatives.get(ad.creativeId)
      if (cr?.isVideo) {
        playSec += playSeconds(x, cr.durationSec)
        vidImps += x.impressions
      }
    }
    out.push({ day, st, playSec, vidImps })
  }
  return out
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export const fbAccounts = (s: GameState): AdAccount[] => s.ads.accounts.filter(a => a.platform === 'fadbook')

/** The account to show: the remembered one if it still exists, else the best working one. */
export function pickAccount(list: AdAccount[], wanted: string | null): AdAccount | null {
  if (!list.length) return null
  const hit = wanted ? list.find(a => a.id === wanted) : undefined
  if (hit) return hit
  return list.find(a => a.status === 'active') ?? list.find(a => a.status === 'payment_failed') ?? list[list.length - 1]
}

export function accountStatusLabel(a: AdAccount): { label: string; tone: 'green' | 'red' | 'yellow' | 'neutral' } {
  switch (a.status) {
    case 'active': return { label: 'Active', tone: 'green' }
    case 'payment_failed': return { label: 'Payment failed', tone: 'red' }
    case 'restricted': return { label: 'Restricted', tone: 'red' }
    case 'disabled': return { label: 'Disabled', tone: 'red' }
    case 'in_review': return { label: 'In review', tone: 'yellow' }
  }
}

export const displayId = (a: AdAccount) => a.displayId ?? a.id

/** Stable 18-digit Ads Manager-style id for a campaign / ad set / ad ("120214…"). */
export function entityNumericId(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0
  let out = '1202'
  let x = h
  while (out.length < 18) {
    x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0
    out += String(x % 10)
  }
  return out
}

/** Store domain used in ad URLs. */
export function storeDomain(s: GameState): string {
  return s.store.customDomain || s.store.subdomain || 'your-store.myshopifly.com'
}
export function productUrl(s: GameState, p: StoreProduct | undefined): string {
  if (!p) return ''
  const handle = p.seo?.handle || p.id
  return `https://${storeDomain(s)}/products/${handle}`
}

/** Which kind of result an entity optimizes for (drives "Results" labels). */
export function resultLabels(kind: ResultKind): { results: string; per: string; short: string } {
  if (kind === 'atc') return { results: 'Website adds to cart', per: 'Per add to cart', short: 'adds to cart' }
  if (kind === 'mixed') return { results: 'Multiple conversions', per: 'Multiple conversions', short: 'results' }
  return { results: 'Website purchases', per: 'Per purchase', short: 'purchases' }
}
export function resultsOf(row: { st: AdDayStats; resultKind: ResultKind }): number | null {
  if (row.resultKind === 'mixed') return null
  return row.resultKind === 'atc' ? row.st.atc : row.st.purchases
}
