// Public, read-only views of the market: the AliExprez listing and Mineo ad-spy data.
// Everything here is a pure function of state (deterministic hash noise, no RNG draws)
// so UIs can call it every render. Public numbers are CORRELATED with hidden truth:
// demand → orders, defects → rating/complaints, saturation → advertisers & ad age.
import type { GameState, HookId, Niche, Platform, ProductDef } from '../../core/types'
import { dayOf } from '../../core/time'
import { hookName, formatName } from '../../data/creativeTaxonomy'
import { findProduct } from './catalog'
import { hlognormal, hpick, hrand } from './noise'
import { dropshipDays, dutyPctFor, spyToolActive, supplierPriceMult } from './sourcing'
import { trendCurve } from './trend'

const r2 = (x: number) => Math.round(x * 100) / 100

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
const CITIES = ['Shenzhen', 'Yiwu', 'Guangzhou', 'Dongguan', 'Ningbo', 'Hangzhou', 'Xiamen', 'Foshan', 'Jinhua', 'Shantou', 'Zhongshan', 'Wenzhou']
const MIDDLES = ['Youpin', 'Xinrui', 'Jiayi', 'Meijia', 'Lucky Home', 'Topseller', 'Sunshine', 'Hongda', 'Kaixin', 'Baiyi', 'Weiyi', 'Leyou', 'Huaxin', 'Mingda', 'Joyful Life', 'Golden Star', 'Aoyue', 'Fuxing']
const SUFFIX: Record<Niche, string[]> = {
  pet: ['Pet Supplies Store', 'Pet Life Store'], beauty: ['Beauty Official Store', 'Beauty Tools Store'],
  home: ['Home Life Store', 'Smart Home Store'], kitchen: ['Kitchenware Store', 'Kitchen Gadget Store'],
  fitness: ['Sports Store', 'Fitness Equipment Store'], wellness: ['Health Care Store', 'Massager Official Store'],
  car: ['Auto Accessories Store', 'Car Life Store'], gadgets: ['Electronic Store', 'Digital Official Store'],
  baby: ['Baby Care Store', 'Mom & Baby Store'], kids: ['Toys Store', 'Kids Toy Official Store'],
  fashion: ['Bags Store', 'Accessories Store'], outdoor: ['Outdoor Store', 'Garden Lighting Store'],
}
export function supplierName(p: ProductDef): string {
  return `${hpick(CITIES, p.id, 'city')} ${hpick(MIDDLES, p.id, 'mid')} ${hpick(SUFFIX[p.niche], p.id, 'suf')}`
}

const STORE_A: Record<Niche, string[]> = {
  pet: ['Paw', 'Furry', 'Woof', 'Pawsome', 'Kitty', 'Happy Tails'], beauty: ['Glow', 'Luxe', 'Bloom', 'Velvet', 'Lumi', 'Dewy'],
  home: ['Nest', 'Tidy', 'Cozy', 'Haven', 'Casa', 'Homely'], kitchen: ['Chef', 'Kitchen', 'Savor', 'Crumb', 'Prep', 'Zest'],
  fitness: ['Core', 'Flex', 'Pulse', 'Iron', 'Stride', 'Peak'], wellness: ['Zen', 'Calm', 'Vita', 'Restful', 'Nimbus', 'Ease'],
  car: ['Auto', 'Drive', 'Road', 'Cruise', 'Gear', 'Motor'], gadgets: ['Nova', 'Pixel', 'Volt', 'Techy', 'Orbit', 'Byte'],
  baby: ['Tiny', 'Little', 'Snug', 'Bitty', 'Cuddle', 'Sprout'], kids: ['Play', 'Wonder', 'Bright', 'Kiddo', 'Tot', 'Giggle'],
  fashion: ['Urban', 'Nomad', 'Slate', 'Carry', 'Mode', 'Luna'], outdoor: ['Wild', 'Trail', 'Sunny', 'Yard', 'Glade', 'Firefly'],
}
const STORE_B = ['Goods', 'Co', 'Store', 'Shop', 'Life', 'Labs', 'Supply', 'Daily', 'HQ', 'Finds', 'Market', 'Club', 'Hub', 'Direct']
export function advertiserName(p: ProductDef, ...salt: (string | number)[]): string {
  return `${hpick(STORE_A[p.niche], p.id, 'sa', ...salt)}${hrand(p.id, 'sp', ...salt) < 0.35 ? '' : ' '}${hpick(STORE_B, p.id, 'sb', ...salt)}`
}

const FILLER = /\b(portable|electric|reusable|automatic|cordless|mini|smart|adjustable|handheld|rechargeable|crystal clear|multi|professional)\b/gi
/** "Reusable Pet Hair Remover Roller" → "pet hair remover roller" */
export function shortName(p: ProductDef): string {
  return p.name.replace(/\(.*?\)/g, '').replace(FILLER, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// AliExprez listing
// ---------------------------------------------------------------------------
export interface PublicListing {
  price: number
  originalPrice: number
  orders30d: number
  soldLabel: string
  rating: number
  reviews: number
  shipDays: [number, number]
  shipCost: number
  choice: boolean
  supplierName: string
  supplierYears: number
  badges: string[]
  // ---- optional extras (sim-market-events) ----
  /** strikethrough discount shown on the card, 0..1 */
  discountPct?: number
  /** estimated lifetime units sold */
  sold?: number
  /** order trend arrow — shown when research skill ≥ 3, otherwise null */
  trend?: 'up' | 'flat' | 'down' | null
  /** store "positive feedback" percentage (97.8 etc.) */
  storePositivePct?: number
  storeFollowers?: number
  /** released within the last 14 days */
  newArrival?: boolean
  /** import duty rate the buyer (you) pays on this item, 0..1 */
  dutyPct?: number
}

function soldLabel(n: number): string {
  if (n >= 100_000) return '100,000+ sold'
  if (n >= 50_000) return '50,000+ sold'
  if (n >= 10_000) return '10,000+ sold'
  if (n >= 5_000) return '5,000+ sold'
  if (n >= 1_000) return '1,000+ sold'
  if (n >= 500) return '500+ sold'
  if (n >= 100) return '100+ sold'
  return `${Math.max(0, Math.round(n))} sold`
}

export function publicListing(s: GameState, catalogId: string): PublicListing | null {
  const p = findProduct(catalogId)
  const m = s.catalog.market[catalogId]
  if (!p || !m || !s.catalog.available.includes(catalogId)) return null
  const day = dayOf(s.time.hour)
  const price = r2(p.cogs * supplierPriceMult(s, catalogId))
  const disc = 0.42 + 0.3 * hrand(p.id, 'disc', Math.floor(day / 7))
  const sold = Math.round(m.reviews * (5.5 + 2 * hrand(p.id, 'soldmult')))
  const growth = m.trendIndex14 > 0 ? m.trendIndex / m.trendIndex14 - 1 : 0
  const researchSkill = s.skills?.research?.level ?? 1
  const ds = dropshipDays(p)
  const badges: string[] = []
  if (p.publicSignals.choice) badges.push('Choice')
  if (day - p.releaseDay < 14 && p.releaseDay > 0) badges.push('New arrival')
  if (m.orders30d >= 20_000) badges.push('Bestseller')
  else if (growth > 0.3 && m.orders30d >= 800) badges.push('Hot')
  if (m.rating >= 4.7 && m.reviews >= 1000) badges.push('Top rated')
  if (ds[1] <= 14) badges.push('Fast delivery')
  if (p.publicSignals.supplierYears >= 7) badges.push('Trusted store')
  const defectSignal = Math.min(0.35, p.defectRate)
  return {
    price,
    originalPrice: r2(price / (1 - disc)),
    orders30d: Math.round(m.orders30d),
    soldLabel: soldLabel(sold),
    rating: Math.round(m.rating * 10) / 10,
    reviews: Math.round(m.reviews),
    shipDays: ds,
    shipCost: p.shipCost,
    choice: p.publicSignals.choice,
    supplierName: supplierName(p),
    supplierYears: p.publicSignals.supplierYears,
    badges,
    discountPct: Math.round(disc * 100) / 100,
    sold,
    trend: researchSkill >= 3 ? (growth > 0.12 ? 'up' : growth < -0.12 ? 'down' : 'flat') : null,
    storePositivePct: Math.round((98.6 - defectSignal * 14 - (8 - Math.min(8, p.publicSignals.supplierYears)) * 0.15 + hrand(p.id, 'fb') * 0.8) * 10) / 10,
    storeFollowers: Math.round((800 + p.publicSignals.reviews * 1.8 + p.publicSignals.supplierYears * 900) * (0.8 + 0.4 * hrand(p.id, 'fol'))),
    newArrival: p.releaseDay > 0 && day - p.releaseDay < 14,
    dutyPct: dutyPctFor(p),
  }
}

// ---------------------------------------------------------------------------
// Mineo spy data
// ---------------------------------------------------------------------------
export interface SpyAd {
  advertiser: string
  platform: 'fadbook' | 'tiktak'
  likes: number
  comments: number
  shares: number
  daysRunning: number
  /** hook type display name, e.g. "Before / after reveal" */
  hook: string
  // ---- optional extras ----
  hookId?: HookId
  /** creative format display name */
  format?: string
  /** on-screen hook text of the ad */
  hookText?: string
  /** price the advertiser charges */
  price?: number
}
export interface SpyData {
  activeAds: number
  advertisers: number
  firstSeenDaysAgo: number
  avgLikes: number
  engagementTrend: 'rising' | 'flat' | 'falling'
  competitorPrice: number
  topAds: SpyAd[]
  // ---- optional extras ----
  /** daily ad counts for the last 30 days (oldest first) for the "ads over time" chart */
  adsHistory?: { day: number; ads: number }[]
  /** share of active ads running on TikTak (0..1) */
  tiktakShare?: number
}

const ALL_HOOKS: HookId[] = ['problem_callout', 'pov', 'tiktak_made_me_buy', 'before_after', 'asmr', 'shock_stat', 'unboxing', 'us_vs_them', 'testimonial', 'gift_idea', 'life_hack', 'controversial', 'question']

/** On-screen hook line a competitor would plausibly run. */
export function hookTextFor(p: ProductDef, hook: HookId, salt: string | number = 0): string {
  const n = shortName(p)
  const anchor = p.amazonPrice ? `$${Math.round(p.amazonPrice)}` : 'the expensive one'
  const lines: Record<HookId, string[]> = {
    problem_callout: [`If you're still dealing with this, watch 👀`, `Stop doing it the hard way.`, `This was ruining my week until…`],
    pov: [`POV: you finally found a ${n} that actually works`, `POV: you stopped overthinking it and got the ${n}`],
    tiktak_made_me_buy: [`TikTak made me buy it and I'm not mad`, `The ${n} everyone keeps asking about`],
    before_after: [`Before vs. after 😳`, `Day 1 vs. day 7 with this ${n}`],
    asmr: [`the sound 🔊`, `most satisfying thing you'll see today`],
    shock_stat: [`I didn't believe it until I tried it`, `Why is nobody talking about this ${n}?`],
    unboxing: [`Unboxing the viral ${n} 📦`, `It finally came!!`],
    us_vs_them: [`${anchor} version vs. this one`, `Save your money — watch this first`],
    testimonial: [`"I use it every single day"`, `Okay I need to talk about this ${n}`],
    gift_idea: [`The gift they'll actually use 🎁`, `Gift idea for the person who has everything`],
    life_hack: [`The ${n} hack nobody told you about`, `You've been doing this the hard way`],
    controversial: [`Unpopular opinion: you don't need anything else`, `Nobody wants to admit this works`],
    question: [`Why didn't anyone tell me about this sooner?`, `Would you try this?`],
  }
  return hpick(lines[hook], p.id, 'ht', hook, salt)
}

/** Days before `day` that ads for this product were first seen. */
function firstSeenDaysAgo(p: ProductDef, day: number): number {
  const t = p.trend
  let first: number
  if (t.kind === 'rising' || t.kind === 'fad') first = t.emergeDay - 12
  else if (t.kind === 'declining') first = t.emergeDay
  else {
    const age = Math.round(45 + p.startCompetitors * 8 + hrand(p.id, 'age') * 90)
    first = p.releaseDay === 0 ? -age : p.releaseDay - Math.min(age, 10 + p.startCompetitors * 4)
  }
  return Math.max(1, day - first)
}

function adsAt(s: GameState, p: ProductDef, competitors: number, ti: number, day: number): number {
  const perAdvertiser = 1.6 + 2.2 * Math.min(1.3, ti)
  return Math.max(0, Math.round(competitors * perAdvertiser * hlognormal(0.08, p.id, 'ads', day, s.meta.seed)))
}

/** Requires an active Mineo subscription. */
export function spyData(s: GameState, catalogId: string): SpyData | null {
  if (!spyToolActive(s)) return null
  return spyDataUnchecked(s, catalogId)
}

/** Spy data regardless of subscription (used by tests and the coach's public-signal reasoning). */
export function spyDataUnchecked(s: GameState, catalogId: string): SpyData | null {
  const p = findProduct(catalogId)
  const m = s.catalog.market[catalogId]
  if (!p || !m || !s.catalog.available.includes(catalogId)) return null
  const day = dayOf(s.time.hour)
  const seed = s.meta.seed
  const youAdvertise = s.ads?.ads?.some(a => a.status === 'active' && s.store.products.find(sp => sp.id === a.storeProductId)?.catalogId === catalogId) ?? false
  const advertisers = Math.max(0, Math.round(m.competitors * (0.9 + 0.2 * hrand(p.id, 'adv', Math.floor(day / 3), seed)))) + (youAdvertise ? 1 : 0)
  const activeAds = adsAt(s, p, advertisers, m.trendIndex, day)
  const sat = m.saturation
  const wow2 = p.wow * p.wow
  const avgLikes = Math.round((250 + 14_000 * wow2) * Math.min(1.6, m.trendIndex) * (1 - 0.5 * sat) * hlognormal(0.12, p.id, 'likes', day, seed))
  const ratio = m.trendIndex14 > 0 ? m.trendIndex / m.trendIndex14 : 1
  const engagementTrend: SpyData['engagementTrend'] = ratio > 1.08 && sat < 0.7 ? 'rising' : ratio < 0.92 || (sat > 0.6 && ratio < 1.1) ? 'falling' : 'flat'
  const tiktakShare = p.platformFit.tiktak / (p.platformFit.tiktak + p.platformFit.fadbook)
  const seen = firstSeenDaysAgo(p, day)
  const nTop = activeAds === 0 ? 0 : Math.min(6, Math.max(2, Math.round(2 + activeAds / 25)))
  const rankMult = [3.6, 2.3, 1.6, 1.15, 0.85, 0.65]
  const topAds: SpyAd[] = []
  for (let i = 0; i < nTop; i++) {
    // The most engaging ads use the hooks that genuinely fit the product; the rest are a mixed bag.
    const hook: HookId = i < 2 || hrand(p.id, 'hk?', i, seed) < 0.45 ? p.bestHooks[(i + Math.floor(hrand(p.id, 'hk0', seed) * p.bestHooks.length)) % p.bestHooks.length] : hpick(ALL_HOOKS, p.id, 'hk', i, seed)
    const bestHook = p.bestHooks.includes(hook)
    const format = bestHook && hrand(p.id, 'fm?', i, seed) < 0.7 ? hpick(p.bestFormats, p.id, 'fm', i, seed) : hpick(['ugc_testimonial', 'demo_video', 'slideshow', 'supplier_edit', 'static_image'] as const, p.id, 'fmx', i, seed)
    const platform: Platform = hrand(p.id, 'pf', i, seed) < tiktakShare ? 'tiktak' : 'fadbook'
    const likes = Math.round(avgLikes * rankMult[i] * (bestHook ? 1 : 0.6) * hlognormal(0.25, p.id, 'tl', i, Math.floor(day / 2), seed) * (platform === 'tiktak' ? 1.3 : 0.8))
    const maxRun = Math.max(3, Math.min(seen, 420))
    const daysRunning = Math.max(1, Math.round(maxRun * (0.25 + 0.75 * hrand(p.id, 'run', i, seed))))
    topAds.push({
      advertiser: advertiserName(p, i, Math.floor(seed % 97)),
      platform,
      likes,
      comments: Math.round(likes * (0.018 + 0.035 * hrand(p.id, 'cm', i, seed))),
      shares: Math.round(likes * (0.03 + 0.09 * hrand(p.id, 'sh', i, seed)) * (platform === 'tiktak' ? 1.6 : 1)),
      daysRunning,
      hook: hookName(hook),
      hookId: hook,
      format: formatName(format),
      hookText: hookTextFor(p, hook, i),
      price: Math.max(r2(m.competitorPrice), Math.floor(m.competitorPrice * (1 + 0.35 * hrand(p.id, 'pr', i, seed))) + 0.99),
    })
  }
  topAds.sort((a, b) => b.likes - a.likes)
  const adsHistory: { day: number; ads: number }[] = []
  const hist = m.hist ?? []
  for (let d = day - 29; d <= day; d++) {
    // competitor counts are sampled every 2 days in m.hist; interpolate from the nearest sample
    let comp = m.competitors
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i][0] <= d) { comp = hist[i][2]; break }
    const ti = hist.find(h => h[0] >= d)?.[3]
    const tIdx = ti !== undefined ? ti / 100 : m.trendIndex
    adsHistory.push({ day: d, ads: d < day - seen ? 0 : adsAt(s, p, comp, tIdx, d) })
  }
  return {
    activeAds,
    advertisers,
    firstSeenDaysAgo: activeAds === 0 ? 0 : seen,
    avgLikes,
    engagementTrend,
    competitorPrice: m.competitorPrice,
    topAds,
    adsHistory,
    tiktakShare: Math.round(tiktakShare * 100) / 100,
  }
}

/** Trend-only curve value, exposed for charts (e.g. "search interest" sparkline). */
export const trendOnly = (p: ProductDef, day: number) => trendCurve(p, day)
