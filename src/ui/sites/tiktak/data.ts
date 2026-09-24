// Data layer for the TikTak Ads Manager UI: account resolution, per-entity range stats,
// daily series, and the TikTak metric catalogue (names exactly as TikTok Ads Manager shows them).
import type {
  Ad, AdAccount, AdDayStats, AdLevel, AdSet, Campaign, Creative, Day, GameState, StoreProduct,
} from '../../../core/types'
import type { DateRange } from '../../../core/time'
import { formatDate } from '../../../core/time'
import { emptyStats, addStats, deliveryLabel, learningProgress, type DeliveryLabel } from '../../../sim/ads'
import { breakEven } from '../../../sim/store'
import { amFmt } from '../../kit/adsmanager'
import type { ChartFormat } from '../../kit/charts'

export const PLATFORM = 'tiktak' as const

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export function tiktakAccounts(s: GameState): AdAccount[] {
  return s.ads.accounts.filter(a => a.platform === PLATFORM)
}

/** The account the UI shows: the player's pick, else a working own account, else anything. */
export function pickAccount(s: GameState, preferred: string | null): AdAccount | null {
  const accs = tiktakAccounts(s)
  if (!accs.length) return null
  return (
    accs.find(a => a.id === preferred) ??
    accs.find(a => a.status === 'active' && a.rentedFeePct == null) ??
    accs.find(a => a.status === 'active') ??
    accs.find(a => a.status === 'payment_failed') ??
    accs[0]
  )
}

export const accountDisplayId = (a: AdAccount) => a.displayId ?? a.id

export function accountStatusText(a: AdAccount): { label: string; tone: 'success' | 'warning' | 'critical' | 'info' } {
  switch (a.status) {
    case 'active': return { label: 'Active', tone: 'success' }
    case 'payment_failed': return { label: 'Payment failed', tone: 'critical' }
    case 'restricted': return { label: 'Suspended', tone: 'critical' }
    case 'disabled': return { label: 'Permanently suspended', tone: 'critical' }
    case 'in_review': return { label: 'In review', tone: 'info' }
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
/** Sum an ad's stats over a range (folded lifetime counts when the range reaches before the retained days). */
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

/** Optimization events for an ad (its ad group's event: Complete payment or Add to cart). */
export function conversionsOf(st: AdDayStats, set: AdSet | undefined): number {
  return set?.optimization === 'add_to_cart' ? st.atc : st.purchases
}

export interface Bundle {
  stats: AdDayStats
  /** optimization events (TikTok "Conversions") */
  conv: number
}
const emptyBundle = (): Bundle => ({ stats: emptyStats(), conv: 0 })
const addBundle = (a: Bundle, b: Bundle) => {
  addStats(a.stats, b.stats)
  a.conv += b.conv
  return a
}

export interface AccountData {
  campaigns: Campaign[]
  adSets: AdSet[]
  ads: Ad[]
  byCampaign: Map<string, Bundle>
  byAdSet: Map<string, Bundle>
  byAd: Map<string, Bundle>
  total: Bundle
}

/** Everything under one ad account with range stats rolled up per level. */
export function accountData(s: GameState, accountId: string | null, r: DateRange): AccountData {
  const campaigns = s.ads.campaigns.filter(c => c.platform === PLATFORM && c.accountId === accountId)
  const cIds = new Set(campaigns.map(c => c.id))
  const adSets = s.ads.adSets.filter(a => cIds.has(a.campaignId))
  const setById = new Map(adSets.map(a => [a.id, a]))
  const ads = s.ads.ads.filter(a => cIds.has(a.campaignId))
  const byCampaign = new Map<string, Bundle>()
  const byAdSet = new Map<string, Bundle>()
  const byAd = new Map<string, Bundle>()
  const total = emptyBundle()
  for (const c of campaigns) byCampaign.set(c.id, emptyBundle())
  for (const a of adSets) byAdSet.set(a.id, emptyBundle())
  for (const ad of ads) {
    const st = adRangeStats(ad, r)
    const b: Bundle = { stats: st, conv: conversionsOf(st, setById.get(ad.adSetId)) }
    byAd.set(ad.id, b)
    const sb = byAdSet.get(ad.adSetId)
    if (sb) addBundle(sb, b)
    const cb = byCampaign.get(ad.campaignId)
    if (cb) addBundle(cb, b)
    // money spent on since-deleted ads still counts toward the account's totals
    addBundle(total, b)
  }
  return { campaigns, adSets, ads, byCampaign, byAdSet, byAd, total }
}

/** Daily bundles for a set of ads over a range (one entry per day, zeros included). */
export function dailySeries(s: GameState, ads: Ad[], r: DateRange): { day: Day; b: Bundle }[] {
  const setById = new Map(s.ads.adSets.map(a => [a.id, a]))
  const out: { day: Day; b: Bundle }[] = []
  const idx = new Map<Day, Bundle>()
  for (let d = Math.max(0, r.from); d <= r.to; d++) {
    const b = emptyBundle()
    idx.set(d, b)
    out.push({ day: d, b })
  }
  for (const ad of ads) {
    const set = setById.get(ad.adSetId)
    for (const k in ad.stats) {
      const d = Number(k)
      const b = idx.get(d)
      if (!b) continue
      const st = ad.stats[d]
      addStats(b.stats, st)
      b.conv += conversionsOf(st, set)
    }
  }
  return out
}

/** Ads under an entity */
export function adsUnder(data: AccountData, level: AdLevel, id: string): Ad[] {
  if (level === 'ad') return data.ads.filter(a => a.id === id)
  if (level === 'adset') return data.ads.filter(a => a.adSetId === id)
  return data.ads.filter(a => a.campaignId === id)
}

// ---------------------------------------------------------------------------
// Break-even (the player's own store numbers)
// ---------------------------------------------------------------------------
/** Landing product of an entity: the product its (live) ads point at most often. */
export function landingProductOf(ads: Ad[]): string | null {
  const count = new Map<string, number>()
  for (const a of ads) if (a.status !== 'deleted') count.set(a.storeProductId, (count.get(a.storeProductId) ?? 0) + 1)
  let best: string | null = null
  let n = 0
  for (const [k, v] of count) if (v > n) { best = k; n = v }
  return best
}

export interface BreakEvenInfo { cpa: number; roas: number; product: StoreProduct }
export function breakEvenFor(s: GameState, storeProductId: string | null): BreakEvenInfo | null {
  if (!storeProductId) return null
  const product = s.store.products.find(p => p.id === storeProductId)
  if (!product) return null
  const be = breakEven(s, storeProductId)
  if (!(be.breakEvenCpa > 0) || !Number.isFinite(be.breakEvenRoas)) return null
  return { cpa: be.breakEvenCpa, roas: be.breakEvenRoas, product }
}

// ---------------------------------------------------------------------------
// Metric catalogue
// ---------------------------------------------------------------------------
export type MetricId =
  | 'cost' | 'cpc' | 'cpm' | 'impressions' | 'clicks' | 'ctr' | 'conversions' | 'cpa' | 'cvr' | 'v2s' | 'v6s' | 'roas'
  | 'frequency' | 'reach' | 'clicksAll' | 'ctrAll' | 'cpcAll' | 'lpv' | 'atc' | 'cpatc' | 'checkouts' | 'cpcheckout'
  | 'purchases' | 'cppurchase' | 'value' | 'aov' | 'v25' | 'v50' | 'v75' | 'v100' | 'likes' | 'comments' | 'shares'

export interface MetricDef {
  id: MetricId
  label: string
  category: 'Basic data' | 'Engagement' | 'Video play' | 'Conversion' | 'Attribution'
  description: string
  value: (b: Bundle) => number | null
  format: (n: number | null) => string
  chart: ChartFormat
  /** lower is better (costs) */
  invert?: boolean
  /** summed (counts, costs) vs. ratio of sums */
  additive?: boolean
}

const r = (a: number, b: number) => (b ? a / b : null)
const money = (n: number | null) => amFmt.money(n)
const int = (n: number | null) => amFmt.int(n)
const pct = (n: number | null) => amFmt.pct(n)
const dec = (n: number | null) => amFmt.roas(n)

export const METRICS: Record<MetricId, MetricDef> = {
  cost: { id: 'cost', label: 'Cost', category: 'Basic data', description: 'The estimated total amount of money you\'ve spent on your campaign, ad group or ad during its schedule.', value: b => b.stats.spend, format: money, chart: 'money', invert: true, additive: true },
  cpc: { id: 'cpc', label: 'CPC (destination)', category: 'Basic data', description: 'The average cost of each click to a specified destination. Cost ÷ Clicks (destination).', value: b => r(b.stats.spend, b.stats.linkClicks), format: money, chart: 'money', invert: true },
  cpm: { id: 'cpm', label: 'CPM', category: 'Basic data', description: 'The average amount of money you\'ve spent per 1,000 impressions.', value: b => (b.stats.impressions ? (b.stats.spend / b.stats.impressions) * 1000 : null), format: money, chart: 'money', invert: true },
  impressions: { id: 'impressions', label: 'Impressions', category: 'Basic data', description: 'The number of times your ads were shown.', value: b => b.stats.impressions, format: int, chart: 'number', additive: true },
  clicks: { id: 'clicks', label: 'Clicks (destination)', category: 'Basic data', description: 'The number of clicks from your ads to a specified destination (your product page).', value: b => b.stats.linkClicks, format: int, chart: 'number', additive: true },
  ctr: { id: 'ctr', label: 'CTR (destination)', category: 'Basic data', description: 'The percentage of times people saw your ad and clicked through to the destination. Clicks (destination) ÷ Impressions.', value: b => r(b.stats.linkClicks, b.stats.impressions), format: pct, chart: 'percent' },
  conversions: { id: 'conversions', label: 'Conversions', category: 'Basic data', description: 'The number of times your ad resulted in the optimization event you selected (Complete payment or Add to cart).', value: b => b.conv, format: int, chart: 'number', additive: true },
  cpa: { id: 'cpa', label: 'Cost per conversion', category: 'Basic data', description: 'The average amount of money you\'ve spent on a conversion. Cost ÷ Conversions.', value: b => r(b.stats.spend, b.conv), format: money, chart: 'money', invert: true },
  cvr: { id: 'cvr', label: 'Conversion rate', category: 'Basic data', description: 'The percentage of results you received out of all the destination clicks on your ads. Conversions ÷ Clicks (destination).', value: b => r(b.conv, b.stats.linkClicks), format: pct, chart: 'percent' },
  v2s: { id: 'v2s', label: 'Video views at 2s', category: 'Video play', description: 'The number of times your video played for at least 2 seconds, or completely if it\'s shorter. Replays aren\'t counted.', value: b => b.stats.videoViewsShort, format: int, chart: 'number', additive: true },
  v6s: { id: 'v6s', label: 'Video views at 6s', category: 'Video play', description: 'The number of times your video played for at least 6 seconds, or completely if it\'s shorter. Replays aren\'t counted.', value: b => b.stats.videoViewsLong, format: int, chart: 'number', additive: true },
  roas: { id: 'roas', label: 'Total complete payment ROAS', category: 'Conversion', description: 'Total complete payment value ÷ Cost. Reported by the TikTak Pixel, so it includes view-through purchases and can differ from your store\'s numbers.', value: b => r(b.stats.purchaseValue, b.stats.spend), format: dec, chart: 'decimal' },
  frequency: { id: 'frequency', label: 'Frequency', category: 'Basic data', description: 'The average number of times each person saw your ad in the selected time range. Impressions ÷ Reach.', value: b => r(b.stats.impressions, b.stats.reach), format: n => amFmt.freq(n), chart: 'decimal' },
  reach: { id: 'reach', label: 'Reach', category: 'Basic data', description: 'The number of unique users who saw your ads at least once (estimated).', value: b => b.stats.reach, format: int, chart: 'number', additive: true },
  clicksAll: { id: 'clicksAll', label: 'Clicks (all)', category: 'Engagement', description: 'All clicks on your ad: destination clicks plus profile visits, likes, comments and shares.', value: b => b.stats.clicks, format: int, chart: 'number', additive: true },
  ctrAll: { id: 'ctrAll', label: 'CTR (all)', category: 'Engagement', description: 'Clicks (all) ÷ Impressions.', value: b => r(b.stats.clicks, b.stats.impressions), format: pct, chart: 'percent' },
  cpcAll: { id: 'cpcAll', label: 'CPC (all)', category: 'Engagement', description: 'Cost ÷ Clicks (all).', value: b => r(b.stats.spend, b.stats.clicks), format: money, chart: 'money', invert: true },
  lpv: { id: 'lpv', label: 'Landing page views', category: 'Conversion', description: 'The number of times your landing page loaded after a click on your ad (TikTak Pixel).', value: b => b.stats.lpv, format: int, chart: 'number', additive: true },
  atc: { id: 'atc', label: 'Add to cart', category: 'Conversion', description: 'The number of add-to-cart events attributed to your ads (TikTak Pixel).', value: b => b.stats.atc, format: int, chart: 'number', additive: true },
  cpatc: { id: 'cpatc', label: 'Cost per add to cart', category: 'Conversion', description: 'Cost ÷ Add to cart.', value: b => r(b.stats.spend, b.stats.atc), format: money, chart: 'money', invert: true },
  checkouts: { id: 'checkouts', label: 'Initiate checkout', category: 'Conversion', description: 'The number of checkout starts attributed to your ads (TikTak Pixel).', value: b => b.stats.checkouts, format: int, chart: 'number', additive: true },
  cpcheckout: { id: 'cpcheckout', label: 'Cost per initiate checkout', category: 'Conversion', description: 'Cost ÷ Initiate checkout.', value: b => r(b.stats.spend, b.stats.checkouts), format: money, chart: 'money', invert: true },
  purchases: { id: 'purchases', label: 'Complete payment', category: 'Conversion', description: 'The number of completed payments attributed to your ads (TikTak Pixel, 7-day click / 1-day view).', value: b => b.stats.purchases, format: int, chart: 'number', additive: true },
  cppurchase: { id: 'cppurchase', label: 'Cost per complete payment', category: 'Conversion', description: 'Cost ÷ Complete payment.', value: b => r(b.stats.spend, b.stats.purchases), format: money, chart: 'money', invert: true },
  value: { id: 'value', label: 'Total complete payment', category: 'Conversion', description: 'Total value of completed payments attributed to your ads.', value: b => b.stats.purchaseValue, format: money, chart: 'money', additive: true },
  aov: { id: 'aov', label: 'Value per complete payment', category: 'Conversion', description: 'Total complete payment ÷ Complete payment.', value: b => r(b.stats.purchaseValue, b.stats.purchases), format: money, chart: 'money' },
  v25: { id: 'v25', label: 'Video views at 25%', category: 'Video play', description: 'The number of times your video played at 25% of its length.', value: b => b.stats.v25, format: int, chart: 'number', additive: true },
  v50: { id: 'v50', label: 'Video views at 50%', category: 'Video play', description: 'The number of times your video played at 50% of its length.', value: b => b.stats.v50, format: int, chart: 'number', additive: true },
  v75: { id: 'v75', label: 'Video views at 75%', category: 'Video play', description: 'The number of times your video played at 75% of its length.', value: b => b.stats.v75, format: int, chart: 'number', additive: true },
  v100: { id: 'v100', label: 'Video views at 100%', category: 'Video play', description: 'The number of times your video played to the end.', value: b => b.stats.v100, format: int, chart: 'number', additive: true },
  likes: { id: 'likes', label: 'Paid likes', category: 'Engagement', description: 'Likes on your ad while it was promoted.', value: b => b.stats.likes, format: int, chart: 'number', additive: true },
  comments: { id: 'comments', label: 'Paid comments', category: 'Engagement', description: 'Comments on your ad while it was promoted.', value: b => b.stats.comments, format: int, chart: 'number', additive: true },
  shares: { id: 'shares', label: 'Paid shares', category: 'Engagement', description: 'Shares of your ad while it was promoted.', value: b => b.stats.shares, format: int, chart: 'number', additive: true },
}

export const DEFAULT_COLUMNS: MetricId[] = ['cost', 'cpc', 'cpm', 'impressions', 'clicks', 'ctr', 'conversions', 'cpa', 'cvr', 'v2s', 'v6s', 'roas', 'frequency']

/** Metric ids the dashboard can chart (TikTok's overview cards). */
export const DASH_METRICS: MetricId[] = ['cost', 'cpm', 'cpc', 'impressions', 'clicks', 'ctr', 'conversions', 'cpa', 'roas']

export function metricValueText(id: MetricId, b: Bundle): string {
  const m = METRICS[id]
  return m.format(m.value(b))
}

// ---------------------------------------------------------------------------
// Rows for the Campaign page
// ---------------------------------------------------------------------------
export interface EntityRow {
  key: string
  level: AdLevel
  id: string
  name: string
  campaign: Campaign
  adSet?: AdSet
  ad?: Ad
  status: Campaign['status']
  delivery: DeliveryLabel
  learning: { conversions: number; needed: number } | null
  b: Bundle
  /** daily breakdown row */
  day?: Day
  productId: string | null
}

export function buildRows(s: GameState, data: AccountData, level: AdLevel): EntityRow[] {
  if (level === 'campaign') {
    return data.campaigns.map(c => {
      const ads = data.ads.filter(a => a.campaignId === c.id)
      return {
        key: c.id, level, id: c.id, name: c.name, campaign: c, status: c.status, delivery: deliveryLabel(s, 'campaign', c.id),
        learning: campaignLearning(s, data, c), b: data.byCampaign.get(c.id) ?? emptyBundle(), productId: landingProductOf(ads),
      }
    })
  }
  if (level === 'adset') {
    return data.adSets.map(set => {
      const c = data.campaigns.find(x => x.id === set.campaignId)!
      const lp = learningProgress(s, set.id)
      const ads = data.ads.filter(a => a.adSetId === set.id)
      return {
        key: set.id, level, id: set.id, name: set.name, campaign: c, adSet: set, status: set.status, delivery: deliveryLabel(s, 'adset', set.id),
        learning: lp && lp.state !== 'active' ? { conversions: lp.conversions, needed: lp.needed } : null,
        b: data.byAdSet.get(set.id) ?? emptyBundle(), productId: landingProductOf(ads),
      }
    })
  }
  return data.ads.map(ad => {
    const c = data.campaigns.find(x => x.id === ad.campaignId)!
    const set = data.adSets.find(x => x.id === ad.adSetId)
    return {
      key: ad.id, level, id: ad.id, name: ad.name, campaign: c, adSet: set, ad, status: ad.status, delivery: deliveryLabel(s, 'ad', ad.id),
      learning: null, b: data.byAd.get(ad.id) ?? emptyBundle(), productId: ad.storeProductId,
    }
  })
}

function campaignLearning(s: GameState, data: AccountData, c: Campaign): { conversions: number; needed: number } | null {
  const sets = data.adSets.filter(x => x.campaignId === c.id && x.status === 'active')
  const learning = sets.map(x => learningProgress(s, x.id)).filter(lp => lp && lp.state !== 'active')
  if (!learning.length) return null
  const best = learning.sort((a, b) => b!.conversions / b!.needed - a!.conversions / a!.needed)[0]!
  return { conversions: best.conversions, needed: best.needed }
}

/** Daily breakdown rows for an entity row. */
export function breakdownRows(s: GameState, data: AccountData, row: EntityRow, r: DateRange): EntityRow[] {
  const series = dailySeries(s, adsUnder(data, row.level, row.id), r)
  return series
    .filter(x => x.b.stats.impressions > 0 || x.b.stats.spend > 0)
    .reverse()
    .map(x => ({ ...row, key: `${row.key}::${x.day}`, b: x.b, day: x.day, name: formatDate(x.day, 'iso') }))
}

/** Video play checkpoints in watch-time order for a video of `durationSec` (2s/6s views vs quartiles). */
export function retentionSteps(st: AdDayStats, durationSec: number): { label: string; v: number }[] {
  const d = durationSec > 0 ? durationSec : 15
  const steps = [
    { label: 'Video views at 2s', v: st.videoViewsShort, t: Math.min(2, d) },
    { label: 'Video views at 6s', v: st.videoViewsLong, t: Math.min(6, d) },
    { label: 'Video views at 25%', v: st.v25, t: d * 0.25 },
    { label: 'Video views at 50%', v: st.v50, t: d * 0.5 },
    { label: 'Video views at 75%', v: st.v75, t: d * 0.75 },
    { label: 'Video views at 100%', v: st.v100, t: d },
  ]
  return [{ label: 'Impressions', v: st.impressions }, ...steps.sort((a, b) => a.t - b.t).map(({ label, v }) => ({ label, v }))]
}

// ---------------------------------------------------------------------------
// Misc labels
// ---------------------------------------------------------------------------
export const CTA_LABEL: Record<Ad['cta'], string> = { shop_now: 'Shop now', order_now: 'Order now', learn_more: 'Learn more', get_offer: 'Get offer' }
export const TT_CTAS: Ad['cta'][] = ['shop_now', 'order_now', 'learn_more']

export function bidLabel(c: Campaign): string {
  return c.bidStrategy === 'cost_cap' ? `Cost cap · ${amFmt.money(c.costCap)}` : 'Lowest cost'
}
export function optimizationLabel(set: AdSet): string {
  return set.optimization === 'add_to_cart' ? 'Add to cart' : 'Complete payment'
}

export function storeDomain(s: GameState): string {
  return s.store.customDomain || s.store.subdomain || 'your-store.myshopifly.com'
}
export function productUrl(s: GameState, p: StoreProduct): string {
  return `https://${storeDomain(s)}/products/${p.seo?.handle || p.id}`
}

export function creativeFormatLabel(c: Creative): string {
  return c.isVideo ? `Video · ${Math.round(c.durationSec)}s` : c.format === 'carousel' ? 'Carousel' : 'Image'
}

export function identityName(s: GameState): string {
  return s.store.name || s.meta.playerName || 'My Store'
}

/** TikTok-style long numeric id for an entity (stable, derived from the internal id). */
export function entityDisplayId(id: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x1b873593
  for (const ch of id) {
    h1 = Math.imul(h1 ^ ch.charCodeAt(0), 16777619) >>> 0
    h2 = Math.imul(h2 ^ ch.charCodeAt(0), 2246822507) >>> 0
  }
  return `17${String(h1).padStart(10, '0').slice(0, 9)}${String(h2).padStart(10, '0').slice(0, 8)}`
}

/** Stable pseudo-random last-4 digits for payment methods (derived from the save id). */
export function last4(seed: string, salt: string): string {
  let h = 2166136261
  for (const ch of seed + salt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return String(1000 + (Math.abs(h) % 9000))
}
