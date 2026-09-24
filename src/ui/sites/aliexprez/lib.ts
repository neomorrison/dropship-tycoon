// AliExprez — pure helpers: routing, niche metadata, search & sort, deterministic
// review generation, delivery/tracking math. No React, no state writes.
// Everything shown to the player is derived from PUBLIC data (listing, specs,
// supplier copy). Hidden economics (archetype, baseDemand, perceivedValue, best
// hooks…) are never read here.
import type { LucideIcon } from 'lucide-react'
import {
  Baby, Backpack, Car, CookingPot, Dumbbell, Headphones, HeartPulse, PawPrint, Sofa, Sparkles, Tent, ToyBrick,
} from 'lucide-react'
import type { Niche, ProductDef, SampleOrder } from '../../../core/types'
import type { PublicListing } from '../../../sim/market'
import { formatDate } from '../../../core/time'

// ---------------------------------------------------------------------------
// Deterministic hashing (pure, stable across renders and saves)
// ---------------------------------------------------------------------------
export function hash32(...parts: (string | number)[]): number {
  const str = parts.join('¦')
  let h = 0x9e3779b9
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  h ^= h >>> 15
  return h >>> 0
}
/** uniform [0, 1) */
export const hrand = (...parts: (string | number)[]) => hash32(...parts) / 4294967296
export const hpick = <T,>(arr: readonly T[], ...parts: (string | number)[]): T => arr[Math.floor(hrand(...parts) * arr.length)]
export const hint = (lo: number, hi: number, ...parts: (string | number)[]) => lo + Math.floor(hrand(...parts) * (hi - lo + 1))

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
export type AxPage = 'home' | 'search' | 'new' | 'item' | 'orders' | 'business' | 'wishlist'
export interface AxRoute {
  page: AxPage
  /** item id or business/orders sub-tab */
  id?: string
  sub?: string
  q: URLSearchParams
}
export function parseRoute(path: string): AxRoute {
  const [rawPath, rawQuery = ''] = (path || '').split('?')
  const q = new URLSearchParams(rawQuery)
  const seg = rawPath.split('/').filter(Boolean)
  const [a, b, c] = seg
  switch (a) {
    case 'item': return b ? { page: 'item', id: b, sub: c, q } : { page: 'home', q }
    case 'search': return { page: 'search', q }
    case 'category': {
      if (b) q.set('cat', b)
      return { page: 'search', q }
    }
    case 'new': return { page: 'new', q }
    case 'orders': return { page: 'orders', sub: b, q }
    case 'business': return { page: 'business', sub: b, q }
    case 'wishlist':
    case 'favorites': return { page: 'wishlist', q }
    default: return { page: 'home', q }
  }
}
/** Build "search?q=..&cat=.." (drops empty params). */
export function withQuery(base: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    q.set(k, v === true ? '1' : String(v))
  }
  const qs = q.toString()
  return qs ? `${base}?${qs}` : base
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export interface NicheMeta { id: Niche; label: string; short: string; icon: LucideIcon; tint: string }
export const NICHES: NicheMeta[] = [
  { id: 'home', label: 'Home & Garden', short: 'Home', icon: Sofa, tint: '#fff1e8' },
  { id: 'kitchen', label: 'Kitchen & Dining', short: 'Kitchen', icon: CookingPot, tint: '#fff6e0' },
  { id: 'pet', label: 'Pet Products', short: 'Pets', icon: PawPrint, tint: '#eef7ff' },
  { id: 'beauty', label: 'Beauty & Health', short: 'Beauty', icon: Sparkles, tint: '#fdeef5' },
  { id: 'wellness', label: 'Health Care', short: 'Wellness', icon: HeartPulse, tint: '#eefaf3' },
  { id: 'fitness', label: 'Sports & Fitness', short: 'Fitness', icon: Dumbbell, tint: '#f1f0ff' },
  { id: 'gadgets', label: 'Consumer Electronics', short: 'Electronics', icon: Headphones, tint: '#eef3fb' },
  { id: 'car', label: 'Automobiles & Accessories', short: 'Car', icon: Car, tint: '#f2f4f6' },
  { id: 'baby', label: 'Mother & Baby', short: 'Baby', icon: Baby, tint: '#fff4f0' },
  { id: 'kids', label: 'Toys & Hobbies', short: 'Toys', icon: ToyBrick, tint: '#fffbe6' },
  { id: 'fashion', label: 'Bags & Accessories', short: 'Bags', icon: Backpack, tint: '#f6f1ec' },
  { id: 'outdoor', label: 'Outdoor & Garden', short: 'Outdoor', icon: Tent, tint: '#eef8ee' },
]
export const NICHE_BY_ID = Object.fromEntries(NICHES.map(n => [n.id, n])) as Record<Niche, NicheMeta>
export const isNiche = (x: string | null | undefined): x is Niche => !!x && x in NICHE_BY_ID

// ---------------------------------------------------------------------------
// Money & labels
// ---------------------------------------------------------------------------
/** AliExprez price style: "US $6.49" */
export const usd = (n: number) => `US $${(Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const splitPrice = (n: number) => {
  const [whole, cents] = (Math.round(n * 100) / 100).toFixed(2).split('.')
  return { whole: Number(whole).toLocaleString('en-US'), cents }
}
export const compactCount = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString('en-US'))

// ---------------------------------------------------------------------------
// Search & sort
// ---------------------------------------------------------------------------
export interface Row { p: ProductDef; l: PublicListing }
export type SortKey = 'best' | 'orders' | 'newest' | 'price_asc' | 'price_desc'
export const SORTS: { id: SortKey; label: string }[] = [
  { id: 'best', label: 'Best match' },
  { id: 'orders', label: 'Orders' },
  { id: 'newest', label: 'Newest' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'price_desc', label: 'Price: high to low' },
]
export const isSort = (x: string | null): x is SortKey => !!x && SORTS.some(s => s.id === x)

const tokens = (q: string) => q.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(t => t.length > 1)

/** Text relevance: 0 = no match. Every query token must hit somewhere. */
export function relevance(p: ProductDef, q: string): number {
  const toks = tokens(q)
  if (!toks.length) return 1
  const name = p.name.toLowerCase()
  const title = p.supplierTitle.toLowerCase()
  const cat = `${NICHE_BY_ID[p.niche].label} ${p.niche}`.toLowerCase()
  const kw = p.keywords.join(' ').toLowerCase()
  let score = 0
  for (const t of toks) {
    const stem = t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t
    let hit = 0
    if (name.includes(stem)) hit += 3
    if (title.includes(stem)) hit += 2
    if (cat.includes(stem)) hit += 1.5
    if (kw.includes(stem)) hit += 1
    if (!hit) return 0
    score += hit
  }
  return score
}

export interface SearchOpts { q?: string; cat?: Niche | null; sort?: SortKey; choice?: boolean; stars4?: boolean; fast?: boolean; day: number }
export function searchRows(rows: Row[], o: SearchOpts): Row[] {
  const q = (o.q ?? '').trim()
  const scored = rows
    .filter(r => (!o.cat || r.p.niche === o.cat) && (!o.choice || r.l.choice) && (!o.stars4 || r.l.rating >= 4.5) && (!o.fast || r.l.shipDays[1] <= 16))
    .map(r => ({ r, rel: q ? relevance(r.p, q) : 1 }))
    .filter(x => x.rel > 0)
  const sort = o.sort ?? 'best'
  const best = (x: { r: Row; rel: number }) =>
    x.rel * 4 + Math.log10(x.r.l.orders30d + 10) + (x.r.l.choice ? 0.35 : 0) + (x.r.l.rating - 4.5) + hrand(x.r.p.id, 'bm', o.day) * 0.9
  scored.sort((a, b) => {
    switch (sort) {
      case 'orders': return b.r.l.orders30d - a.r.l.orders30d
      case 'newest': return b.r.p.releaseDay - a.r.p.releaseDay || b.r.l.orders30d - a.r.l.orders30d
      case 'price_asc': return a.r.l.price - b.r.l.price
      case 'price_desc': return b.r.l.price - a.r.l.price
      default: return best(b) - best(a)
    }
  })
  return scored.map(x => x.r)
}

/** "Pet Hair Remover Roller" — readable short product noun for review text. */
export function productNoun(p: ProductDef): string {
  const base = p.name.replace(/\(.*?\)/g, '').replace(/\b(portable|electric|reusable|automatic|cordless|mini|smart|adjustable|handheld|rechargeable|crystal clear|usb)\b/gi, '').replace(/\s+/g, ' ').trim()
  const words = base.split(' ')
  return (words.length > 3 ? words.slice(-2) : words).join(' ').toLowerCase()
}

// ---------------------------------------------------------------------------
// Delivery & tracking
// ---------------------------------------------------------------------------
export function deliveryRange(today: number, shipDays: [number, number], extraDays = 0): { from: number; to: number; label: string } {
  const from = today + shipDays[0] + Math.max(0, Math.round(extraDays))
  const to = today + shipDays[1] + Math.max(0, Math.round(extraDays))
  return { from, to, label: `${formatDate(from, 'md')} – ${formatDate(to, 'md')}` }
}

/** AliExprez Standard-style tracking number, stable per order id. */
export function trackingNo(id: string): string {
  const digits = String(hash32(id, 'trk')).padStart(10, '0') + String(hash32(id, 'trk2') % 10_000).padStart(4, '0')
  return `LP00${digits.slice(0, 12)}`
}

export const SAMPLE_STEPS = ['Order placed', 'Shipped', 'In transit', 'Arrived in the US', 'Out for delivery', 'Delivered'] as const
export interface SampleStage { step: number; label: string; detail: string; dates: (number | null)[] }
/** Tracking stage for a sample order on `today` (courier delivers ~1 PM on arriveDay). */
export function sampleStage(smp: SampleOrder, today: number, hubCity: string): SampleStage {
  const total = Math.max(2, smp.arriveDay - smp.orderedDay)
  const shipped = smp.orderedDay + Math.min(2, total - 1)
  const transit = shipped + 1
  const customs = Math.max(transit, smp.arriveDay - 3)
  const out = smp.arriveDay
  const dates: (number | null)[] = [smp.orderedDay, shipped, transit, customs, out, smp.received ? smp.arriveDay : null]
  let step = 0
  if (smp.received) step = 5
  else if (today >= out) step = 4
  else if (today >= customs) step = 3
  else if (today >= transit) step = 2
  else if (today >= shipped) step = 1
  const detail = [
    'The seller is preparing your package.',
    `Departed from the sorting center in ${hubCity}.`,
    'Handed over to the airline — international transit.',
    'Import customs cleared, duty paid. Handed to the US carrier.',
    'Out for delivery with the local courier today.',
    'Delivered to your mailbox.',
  ][step]
  return { step, label: SAMPLE_STEPS[step], detail, dates }
}

// ---------------------------------------------------------------------------
// Reviews — generated deterministically from the product id + public rating.
// The complaint share is a function of the PUBLIC rating only, so what the
// reviews say is exactly as informative as the star average (which the market
// derives from the hidden defect rate).
// ---------------------------------------------------------------------------
export interface GenReview {
  id: string
  name: string
  country: string
  day: number
  stars: 1 | 2 | 3 | 4 | 5
  variant: string
  text: string
  photos: number
  helpful: number
  /** reviewer marked the purchase as "additional feedback after N days" */
  followUp?: string
}

/** Share of 1–2★ reviews implied by an average rating. */
export function complaintShareFor(rating: number): number {
  return Math.max(0.008, Math.min(0.55, (4.86 - rating) * 0.29))
}

/** [1★..5★] shares that average to `rating` with the implied complaint share. */
export function starDistribution(rating: number): [number, number, number, number, number] {
  const low = complaintShareFor(rating)
  let p1 = low * 0.62
  let p2 = low * 0.38
  let p3 = Math.min(0.2, 0.025 + low * 0.35)
  const rest = 1 - p1 - p2 - p3
  // 5p5 + 4p4 = target with p4 + p5 = rest
  const lowSum = 3 * p3 + 2 * p2 + p1
  let p5 = rating - lowSum - 4 * rest
  p5 = Math.max(rest * 0.35, Math.min(rest * 0.97, p5))
  let p4 = rest - p5
  const sum = p1 + p2 + p3 + p4 + p5
  p1 /= sum; p2 /= sum; p3 /= sum; p4 /= sum; p5 /= sum
  return [p1, p2, p3, p4, p5]
}

const COUNTRIES: [string, number][] = [['US', 44], ['FR', 8], ['ES', 8], ['BR', 7], ['PL', 6], ['KR', 5], ['NL', 4], ['IL', 4], ['DE', 4], ['CL', 3], ['UA', 3], ['UK', 4]]
const COUNTRY_TOTAL = COUNTRIES.reduce((a, [, w]) => a + w, 0)
const pickCountry = (...parts: (string | number)[]) => {
  let u = hrand(...parts) * COUNTRY_TOTAL
  for (const [c, w] of COUNTRIES) { if ((u -= w) < 0) return c }
  return 'US'
}
const LETTERS = 'ABCDEFGHIJKLMNOPRSTVWYZ'
const maskedName = (...parts: (string | number)[]) =>
  `${LETTERS[Math.floor(hrand(...parts, 'a') * LETTERS.length)]}***${LETTERS[Math.floor(hrand(...parts, 'b') * LETTERS.length)].toLowerCase()}`

const POS_GENERIC = [
  'Arrived in {days} days, everything works exactly like in the video. Very happy.',
  'Good quality for the price. Packed well, nothing damaged.',
  'Second time ordering, the first one was a gift. Recommend this seller!',
  'Matches the description 100%. Fast delivery to {region}.',
  'Better than I expected for this price. The {noun} feels solid.',
  'Ordered the {variant} — color is true to the photos.',
  'Works great. The seller answered my questions quickly.',
  'Excellent! Already ordered one more for my sister.',
  'Everything ok, thank you seller.',
  'Great value. Honestly as good as the ones sold in stores for 3x the price.',
  'Nice product, came with instructions in English too.',
  'Took a while to arrive but it was worth the wait.',
]
const POS_NICHE: Record<Niche, string[]> = {
  pet: ['My dog was scared at first, now he doesn\'t care at all.', 'Two cats in the house and this actually helps a lot.'],
  beauty: ['Using it every evening for two weeks, I really like it.', 'Feels gentle on my skin, nice little routine.'],
  home: ['Makes the room look so much cozier.', 'Installed it in 5 minutes, no tools needed.'],
  kitchen: ['Use it daily in my kitchen, easy to wash.', 'My husband stole it for his grilling 😂'],
  fitness: ['Using it after workouts, does the job.', 'Compact enough to take to the gym.'],
  wellness: ['I sleep better since I started using it.', 'Very comfortable, I use it every night.'],
  car: ['Fits my Corolla perfectly.', 'Keeps the car so much cleaner, should have bought earlier.'],
  gadgets: ['Connected to my phone right away, battery is decent.', 'Cute and it actually works, my kids love it.'],
  baby: ['My baby didn\'t even wake up, lifesaver.', 'Gentle and quiet, exactly what a tired mom needs.'],
  kids: ['My 4 year old plays with it every day.', 'Kept my kids busy for hours, good quality.'],
  fashion: ['Lots of space and looks more expensive than it is.', 'Stylish and practical, got compliments.'],
  outdoor: ['Looks beautiful in the garden at night.', 'Survived a few rainy nights no problem.'],
}
const MID = [
  'It\'s ok. Smaller than I thought from the pictures.',
  'Works, but the plastic feels a bit cheap.',
  'Took almost a month to arrive, product itself is fine.',
  'Does the job. Instructions only in Chinese.',
  'Average quality, you get what you pay for.',
  'Color slightly different from the photo, otherwise fine.',
]
const NEG_GENERIC = [
  'Arrived broken. Seller asked me to open a dispute.',
  'Nothing like the video. Waste of money.',
  'Very cheap material, cracked the first week.',
  'Stopped working after two weeks. Do not buy.',
  'Package took 40 days and the item was damaged.',
  'Doesn\'t work like advertised. Very disappointed.',
]
const NEG_POWERED = ['Battery dies after a few uses and won\'t charge anymore.', 'Worked for 3 days then nothing. Charging light doesn\'t turn on.']
const FOLLOW_UPS = ['Still working fine after a month.', 'After 3 weeks — still happy with it.', 'Update: the second one I ordered is also good.']
const FOLLOW_UPS_NEG = ['Update: seller refused a refund.', 'Update: now it doesn\'t turn on at all.']

const REGIONS = ['Texas', 'Florida', 'California', 'Ohio', 'Georgia', 'New York', 'Arizona', 'Michigan', 'Oregon', 'Illinois']

export const isPowered = (p: ProductDef) =>
  Object.entries(p.specs).some(([k, v]) => /battery|power|charging|output|input|voltage/i.test(k) && !/no battery/i.test(v))

/** Deterministic review sample for the Reviews tab (rotates weekly as new reviews come in). */
export function generateReviews(p: ProductDef, rating: number, today: number, count = 60): GenReview[] {
  const week = Math.floor(today / 7)
  const anchor = week * 7
  const dist = starDistribution(rating)
  const cdf = dist.map((_, i) => dist.slice(0, i + 1).reduce((a, b) => a + b, 0))
  const noun = productNoun(p)
  const variants = p.variants.length ? p.variants : [{ name: 'Color', values: ['Default'] }]
  const powered = isPowered(p)
  const out: GenReview[] = []
  for (let i = 0; i < count; i++) {
    const key = [p.id, week, i] as const
    const u = hrand(...key, 'stars')
    const stars = (cdf.findIndex(c => u < c) + 1 || 5) as GenReview['stars']
    const vName = variants.map(v => `${v.name}: ${hpick(v.values, ...key, v.name)}`).join(' · ')
    const firstVariant = hpick(variants[0].values, ...key, variants[0].name)
    let text: string
    if (stars >= 4) {
      const pool = hrand(...key, 'nichepool') < 0.35 ? POS_NICHE[p.niche] : POS_GENERIC
      text = hpick(pool, ...key, 'pos')
    } else if (stars === 3) {
      text = hpick(MID, ...key, 'mid')
    } else {
      const pool = powered && hrand(...key, 'pw') < 0.45 ? NEG_POWERED : NEG_GENERIC
      text = hpick(pool, ...key, 'neg')
    }
    text = text
      .replace('{days}', String(hint(p.shipDays[0] + 3, p.shipDays[1] + 6, ...key, 'd')))
      .replace('{region}', hpick(REGIONS, ...key, 'rg'))
      .replace('{noun}', noun)
      .replace('{variant}', firstVariant.toLowerCase())
    const photos = stars >= 4 ? (hrand(...key, 'ph') < 0.28 ? hint(1, 3, ...key, 'phn') : 0) : stars <= 2 && hrand(...key, 'phb') < 0.4 ? 1 : 0
    const followUp = hrand(...key, 'fu') < 0.08 ? hpick(stars >= 4 ? FOLLOW_UPS : FOLLOW_UPS_NEG, ...key, 'fut') : undefined
    out.push({
      id: `${p.id}-${week}-${i}`,
      name: maskedName(...key),
      country: pickCountry(...key, 'c'),
      day: anchor - Math.floor(i * 1.6 + hrand(...key, 'age') * 3),
      stars,
      variant: vName,
      text,
      photos,
      helpful: Math.floor(hrand(...key, 'help') ** 3 * 40),
      followUp,
    })
  }
  return out
}

/** "Buyers mention" chips: product benefit words + generic ones, with counts implied by the rating. */
export function reviewTags(p: ProductDef, reviews: number, rating: number): { label: string; count: number; negative?: boolean }[] {
  const low = complaintShareFor(rating)
  const pos = p.keywords.slice(0, 12).filter((_, i) => hrand(p.id, 'kwsel', i) < 0.55).slice(0, 4)
  const tags: { label: string; count: number; negative?: boolean }[] = [
    { label: 'Good quality', count: Math.round(reviews * (0.18 - low * 0.25) * (0.9 + 0.2 * hrand(p.id, 't1'))) },
    { label: 'Fast delivery', count: Math.round(reviews * 0.11 * (0.8 + 0.4 * hrand(p.id, 't2'))) },
    { label: 'As described', count: Math.round(reviews * (0.14 - low * 0.2) * (0.9 + 0.2 * hrand(p.id, 't3'))) },
    ...pos.map((k, i) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), count: Math.round(reviews * (0.02 + 0.06 * hrand(p.id, 'kwc', i))) })),
    { label: isPowered(p) ? 'Stopped working' : 'Broke quickly', count: Math.round(reviews * low * 0.55), negative: true },
    { label: 'Poor quality', count: Math.round(reviews * low * 0.4), negative: true },
  ]
  return tags.filter(t => t.count > 0)
}

const ANSWERS = [
  'Dear friend, yes it can. If any problem please contact us, we will solve for you 😊',
  'Hello, thank you for your question. It is normal, please rest assured.',
  'Dear customer, please see the description and pictures, all information is there. Thank you!',
  'Hi dear, yes. Many customer buy and feedback is very good.',
  'Dear, we have strict quality control before shipping. Any problem we give refund or resend.',
]
/** Buyer Q&A: real buyer objections with the supplier's (unhelpful) answers — review mining for the page FAQ. */
export function buyerQuestions(p: ProductDef, today: number): { q: string; a: string; name: string; day: number; helpful: number }[] {
  const n = Math.min(p.objections.length, 4)
  return p.objections.slice(0, n).map((q, i) => ({
    q,
    a: hpick(ANSWERS, p.id, 'ans', i),
    name: maskedName(p.id, 'qa', i),
    day: today - 3 - Math.floor(hrand(p.id, 'qad', i) * 90),
    helpful: Math.floor(hrand(p.id, 'qah', i) * 30),
  }))
}

/** Short spec callouts for infographic images. */
export function specCallouts(p: ProductDef, max = 3): { k: string; v: string }[] {
  return Object.entries(p.specs)
    .filter(([k]) => !/origin|brand|certification/i.test(k))
    .slice(0, max)
    .map(([k, v]) => ({ k, v }))
}
export function sizeSpec(p: ProductDef): string | null {
  const e = Object.entries(p.specs).find(([k]) => /size|dimension|length|capacity/i.test(k))
  return e ? e[1] : null
}
/** Seller hub city for tracking copy (parsed from the supplier store name). */
export function hubCity(supplierName: string): string {
  return supplierName.split(' ')[0] || 'Shenzhen'
}
