// Deterministic review content for the storefront reviews widget. The store module only
// tracks aggregates (count / average / photo count / source); the widget renders a
// believable sample whose star mix matches the average. Imported reviews read like
// translated marketplace feedback; organic ones like real customers.
import type { ProductDef, StoreProduct } from '../../../core/types'
import { FIRST_NAMES, LAST_NAMES, US_CITIES } from '../../../data/customers'

export interface ReviewItem {
  id: string
  name: string
  location: string
  stars: number
  title: string
  body: string
  daysAgo: number
  verified: boolean
  photo: boolean
  variant?: string
}

function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length]

/** Share of 1..5 star reviews for an average rating (index 0 unused). */
export function starShares(avg: number): number[] {
  const R = Math.min(5, Math.max(1, avg || 0))
  if (R >= 4.97) return [0, 0, 0, 0, 0.02, 0.98]
  // very high averages come from filtered imports: no 1–3★ reviews at all
  const low = R >= 4.85 ? 0 : Math.min(0.6, Math.max(0.01, (5 - R) * 0.22))
  const high = 1 - low
  const lowMean = 1 * 0.5 + 2 * 0.25 + 3 * 0.25
  const highMean = Math.min(5, Math.max(4, (R - low * lowMean) / high))
  const p5 = (highMean - 4) * high
  const p4 = high - p5
  return [0, low * 0.5, low * 0.25, low * 0.25, p4, p5]
}

/** Integer counts per star that add up to `count`. */
export function starCounts(count: number, avg: number): number[] {
  const sh = starShares(avg)
  const raw = sh.map(x => x * count)
  const out = raw.map(Math.floor)
  let left = count - out.reduce((a, b) => a + b, 0)
  const order = raw.map((x, i) => ({ i, f: x - Math.floor(x) })).filter(x => x.i > 0).sort((a, b) => b.f - a.f)
  for (const o of order) {
    if (left <= 0) break
    out[o.i]++
    left--
  }
  return out
}

function shortName(def: ProductDef | null, p: StoreProduct): string {
  const n = (def?.name ?? p.title).replace(/\(.*?\)/g, '').trim()
  const words = n.split(/\s+/)
  return (words.length > 3 ? words.slice(-2) : words).join(' ').toLowerCase()
}

const ORGANIC: Record<number, { t: string[]; b: string[] }> = {
  5: {
    t: ['Obsessed!', 'Exactly what I needed', 'Worth every penny', 'Game changer', 'Love it', 'Better than expected', 'Buying another one', 'So glad I ordered'],
    b: [
      'I was skeptical after seeing it online but the {name} really does what it says. {Kw} was the big one for me.',
      'Bought this for myself and ended up ordering a second one as a gift. Super easy to use.',
      'Honestly one of the best purchases I\'ve made this year. The quality feels solid and it works great.',
      'Took a little while to arrive but it was well packaged and works perfectly. {Kw}, exactly as described.',
      'My husband laughed when I ordered it, now he uses it more than I do.',
      'Does exactly what the video showed. Customer service answered my question within a day too.',
      'I\'ve tried cheaper versions before and this one is noticeably better made. Highly recommend.',
    ],
  },
  4: {
    t: ['Really good', 'Works well', 'Happy with it', 'Pretty great', 'Good buy'],
    b: [
      'Works well, just took a bit longer to ship than I hoped. Would still buy again.',
      'Good quality for the price. Took me a couple of tries to get the hang of it.',
      'Does the job. Slightly smaller than I pictured but it works great.',
      'Really like it. Only wish it came in more colors.',
      'Solid product, packaging was a little beat up but everything inside was fine.',
    ],
  },
  3: {
    t: ['It\'s okay', 'Decent', 'Mixed feelings'],
    b: [
      'It works, but not quite as well as the ads make it look. Fine for the price.',
      'Shipping took almost three weeks. Product is okay.',
      'Does what it says but feels a bit cheap in the hand.',
    ],
  },
  2: {
    t: ['Disappointed', 'Not great'],
    b: ['Stopped working properly after a couple of weeks. Contacted support, waiting to hear back.', 'Took forever to arrive and it\'s not the quality I expected.'],
  },
  1: {
    t: ['Didn\'t work for me', 'Would not recommend'],
    b: ['Arrived broken. Asked for a refund.', 'Nothing like the video. Very flimsy.'],
  },
}
const IMPORTED: Record<number, { t: string[]; b: string[] }> = {
  5: {
    t: ['Very good', 'Excellent', 'Perfect', 'Recommend', 'Good quality'],
    b: [
      'Arrived fast, well packed. The {name} works very well. Recommend this seller!',
      'Very good product, same as description. Thank you!',
      'Good quality for the price, fast delivery. I am happy.',
      'Everything is perfect, it came complete and works. 5 stars.',
      'Excellent, my family love it. Will buy again from this store.',
      'Product arrived in 12 days. Good quality, recommend.',
    ],
  },
  4: {
    t: ['Good', 'All ok', 'Satisfied'],
    b: ['Good product, delivery was a little long. Works fine.', 'Corresponds to the description. Packaging could be better.', 'All ok, not yet tested for long time.'],
  },
  3: { t: ['Normal', 'Average'], b: ['Normal quality, as for the price.', 'Delivery very long. Product is average.'] },
  2: { t: ['Not so good'], b: ['Quality is not good as in photo.', 'Came with a scratch. Seller did not answer.'] },
  1: { t: ['Bad'], b: ['Did not work.', 'Package arrived empty and damaged.'] },
}

const VARIANT_WORDS = (p: StoreProduct) => p.variants.flatMap(v => v.values).filter(Boolean)

/** First `n` reviews to display for a product (stable across renders). */
export function sampleReviews(p: StoreProduct, def: ProductDef | null, n: number, page = 0): ReviewItem[] {
  const { count, avg, photos, source } = p.reviews
  if (count <= 0) return []
  const counts = starCounts(count, avg)
  // interleave stars so the list isn't sorted by rating (most recent first)
  const pool: number[] = []
  const r0 = rng(`${p.id}:stars`)
  const left = [...counts]
  const total = Math.min(count, (page + 1) * n + 40)
  for (let i = 0; i < total; i++) {
    const remaining = left.reduce((a, b) => a + b, 0)
    if (remaining <= 0) break
    let x = r0() * remaining
    let star = 5
    for (let k = 5; k >= 1; k--) {
      if (x < left[k]) { star = k; break }
      x -= left[k]
    }
    left[star]--
    pool.push(star)
  }
  const kws = (def?.keywords ?? []).filter(k => !/[%°]/.test(k))
  const name = shortName(def, p)
  const variants = VARIANT_WORDS(p)
  const photoShare = count ? photos / count : 0
  const out: ReviewItem[] = []
  for (let i = page * n; i < Math.min(pool.length, (page + 1) * n); i++) {
    const r = rng(`${p.id}:rev:${i}`)
    const stars = pool[i]
    const imported = source === 'imported' && r() < 0.8
    const bank = (imported ? IMPORTED : ORGANIC)[stars]
    const kw = kws.length ? pick(r, kws) : 'quality'
    const body = pick(r, bank.b).replace('{name}', name).replace('{Kw}', kw.charAt(0).toUpperCase() + kw.slice(1))
    const first = pick(r, FIRST_NAMES)
    const last = pick(r, LAST_NAMES)
    const city = pick(r, US_CITIES)
    out.push({
      id: `${p.id}-r${i}`,
      name: imported ? `${first.charAt(0)}***${first.charAt(first.length - 1)}` : `${first} ${last.charAt(0)}.`,
      location: imported ? 'United States' : `${city.city}, ${city.state}`,
      stars,
      title: pick(r, bank.t),
      body,
      daysAgo: Math.floor(i * 2.3 + r() * 6),
      verified: true,
      photo: r() < photoShare * 1.1 && stars >= 4,
      variant: variants.length ? pick(r, variants) : undefined,
    })
  }
  return out
}
