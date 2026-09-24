// Test fixtures for the ads module. Other modules may still be stubs, so everything the ads sim
// needs (store, product page, pixel, creatives) is constructed directly.
import type {
  ConversionEvent, Creative, Difficulty, FormatId, GameState, HookId, AngleId, BeatId, CreativeProducer, StoreProduct, TrafficPacket,
} from '../../../core/types'
import { createNewGame } from '../../../core/newGame'
import { binomial, rand } from '../../../core/rng'
import { productImage } from '../../../core/assets'
import { getProduct } from '../../market'
import { FORMATS } from '../../../data/creativeTaxonomy'
import { adsDayRollover, adsRecordConversions, adsTickHour, scoreCreative } from '..'
import { agencyHookText } from '../creatives'
import { formatFit, hookFit, angleFit } from '../scoring'
import { dayOf, hourOfDay } from '../../../core/time'

export const CATALOG_ID = 'pet-hair-roller'

export function makeGame(opts: { seed?: number; difficulty?: Difficulty; pixel?: boolean; catalogId?: string } = {}): { s: GameState; sp: StoreProduct } {
  const s = createNewGame({ playerName: 'Tester', difficulty: opts.difficulty ?? 'normal', seed: opts.seed ?? 1234 })
  const catalogId = opts.catalogId ?? CATALOG_ID
  const p = getProduct(catalogId)
  s.store.created = true
  s.store.name = 'Fur Free Home'
  s.store.createdDay = 0
  if (opts.pixel !== false) {
    s.store.apps.push({ appId: 'fadbook-channel', installedDay: 0, planIdx: 0 })
    s.store.apps.push({ appId: 'tiktak-channel', installedDay: 0, planIdx: 0 })
    s.store.pixel.fadbook.installed = true
    s.store.pixel.tiktak.installed = true
  }
  s.finance.cash = 100_000
  s.finance.card.limit = 100_000
  s.catalog.samplesOwned.push(catalogId)
  const price = Math.round(p.perceivedValue * 0.9) - 0.01
  const sp: StoreProduct = {
    id: 'sp_test', catalogId, status: 'active', title: `${p.name} – Lifts Pet Hair in Seconds`,
    descriptionHtml: '<p>Test page</p>', media: [], price, compareAtPrice: null, costPerItem: p.cogs + p.shipCost,
    variants: [], trackInventory: false, weightKg: p.weightKg, seo: { title: '', description: '', handle: 'test' },
    productType: '', vendor: 'Fur Free Home', tags: [], sections: [], reviews: { count: 40, avg: 4.6, photos: 8, source: 'imported' },
    promisedDays: [10, 20], createdDay: 0, publishedDay: 0,
    grade: { score: 78, cvrMult: 1.1, aovMult: 1.05, trust: 0.7, loadTime: 2.1, honesty: 0.95, factors: [], gradedHour: 0 },
  }
  s.store.products.push(sp)
  return { s, sp }
}

let seq = 0
export function makeCreative(s: GameState, spec: {
  catalogId?: string; format: FormatId; hook: HookId; angle: AngleId; beats: BeatId[]; hookText: string; script?: string
  quality: number; producer?: CreativeProducer; shared?: boolean
}): Creative {
  const catalogId = spec.catalogId ?? CATALOG_ID
  const c: Creative = {
    id: `cr_test_${++seq}`, catalogId, name: `Test creative ${seq}`, format: spec.format, hook: spec.hook, angle: spec.angle,
    beats: spec.beats, hookText: spec.hookText, script: spec.script ?? '', producer: spec.producer ?? 'ugc', creatorId: null,
    quality: spec.quality, status: 'ready', orderedHour: s.time.hour, readyHour: s.time.hour, cost: 0, isVideo: FORMATS[spec.format].video,
    durationSec: FORMATS[spec.format].video ? 24 : 0, scores: null, thumb: productImage(catalogId), shared: !!spec.shared, style: 'native',
  }
  c.scores = scoreCreative(s, c)
  s.creatives.creatives.push(c)
  return c
}

/** A creative a knowledgeable player would brief: proven format/hook/angle, tight beats, sharp hook text. */
export function strongCreative(s: GameState, catalogId = CATALOG_ID): Creative {
  const p = getProduct(catalogId)
  const hook = p.bestHooks[0]
  return makeCreative(s, {
    catalogId,
    format: p.bestFormats[0], hook, angle: p.bestAngles[0],
    beats: ['hook', 'problem', 'demo', 'social_proof', 'offer', 'cta'],
    hookText: agencyHookText(p, hook, 0),
    script: `You know that feeling when ${p.keywords.slice(0, 2).join(' and ')}? Watch this. ${p.keywords.slice(2, 4).join(', ')}. Over 10,000 happy customers. Tap Shop Now to get yours today.`,
    quality: 0.85, producer: 'ugc',
  })
}

/** What a random clicker makes: the worst-fitting options, spammy text, supplier footage. */
export function weakCreative(s: GameState, catalogId = CATALOG_ID): Creative {
  const p = getProduct(catalogId)
  const fmts: FormatId[] = ['supplier_edit', 'static_image', 'slideshow', 'carousel']
  const format = fmts.filter(f => !p.bestFormats.includes(f)).sort((a, b) => formatFit(p, a) - formatFit(p, b))[0]
  const hooks = (Object.keys({ problem_callout: 1, pov: 1, tiktak_made_me_buy: 1, before_after: 1, asmr: 1, shock_stat: 1, unboxing: 1, us_vs_them: 1, testimonial: 1, gift_idea: 1, life_hack: 1, controversial: 1, question: 1 }) as HookId[])
    .filter(h => !p.bestHooks.includes(h)).sort((a, b) => hookFit(p, a, format) - hookFit(p, b, format))
  const angles = (['pain_point', 'convenience', 'gift', 'social_proof', 'savings', 'aspirational', 'curiosity', 'health', 'time_saving', 'pet_love', 'parenting', 'self_care'] as AngleId[])
    .filter(a => !p.bestAngles.includes(a)).sort((a, b) => angleFit(p, a) - angleFit(p, b))
  return makeCreative(s, {
    catalogId, format, hook: hooks[0], angle: angles[0], beats: ['benefits', 'offer'],
    hookText: 'BEST PRODUCT BUY NOW!!!', quality: 0.25, producer: 'supplier_edit', shared: true,
  })
}

/** Stand-in for the store funnel: converts packets into ConversionEvents. */
export function convert(s: GameState, packets: TrafficPacket[], price: number, baseCvr = 0.024): ConversionEvent[] {
  const out: ConversionEvent[] = []
  for (const pk of packets) {
    if (!pk.adId) continue
    const cvr = Math.min(0.25, baseCvr * pk.intent * pk.messageMatch)
    const purchases = binomial(s, pk.sessions, cvr)
    const atc = purchases + binomial(s, pk.sessions - purchases, cvr * 2.2)
    const checkouts = purchases + binomial(s, atc - purchases, 0.35)
    out.push({ adId: pk.adId, atc, checkouts, purchases, revenue: purchases * price * (rand(s) < 0.15 ? 1.8 : 1) })
  }
  return out
}

/** Advance the clock like sim/index.ts does (ads + our funnel stand-in only). */
export function runHours(s: GameState, hours: number, price: number, onHour?: (s: GameState) => void) {
  for (let i = 0; i < hours; i++) {
    s.time.hour += 1
    if (hourOfDay(s.time.hour) === 0) adsDayRollover(s, dayOf(s.time.hour))
    const packets = adsTickHour(s)
    adsRecordConversions(s, convert(s, packets, price))
    onHour?.(s)
  }
}
