// ============================================================================
// DEV ONLY — a scripted "competent player" that drives the real public sim APIs
// (ported from scripts/smoke.ts COMPETENT). src/dev/scenarios.ts uses it to build
// realistic mid-game states for QA. Never imported by production code.
//
// It only makes decisions from public signals (AliExprez listing, Mineo spy data,
// Ads Manager metrics, Shopifly analytics), just like a player would.
// ============================================================================
import type {
  AngleId, BeatId, Creative, FormatId, GameModal, GameState, HookId, Niche, PageSection, Platform, ProductDef,
} from '../core/types'
import { resolveModal } from '../core/modals'
import { productImage } from '../core/assets'
import { dayOf, hourOfDay } from '../core/time'
import { tickHour } from '../sim'
import * as store from '../sim/store'
import * as market from '../sim/market'
import * as ads from '../sim/ads'
import * as life from '../sim/life'
import * as finance from '../sim/finance'
import { FORMATS, FORMAT_LIST } from '../data/creativeTaxonomy'
import { copywriterRewrite } from '../ui/sites/shopifly/merch/copywriter'

// ---------------------------------------------------------------------------
// small utils
// ---------------------------------------------------------------------------
const cap = (t: string) => t.replace(/(^|\s|-)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())
const round99 = (x: number) => Math.max(0.99, Math.round(x) - 0.01)
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
export const today = (s: GameState) => dayOf(s.time.hour)

export function dayProfit(s: GameState, day: number): number {
  const p = s.finance.pnl[day]
  return p ? finance.businessProfit(p) : 0
}
function wagesFor(s: GameState, from: number, to: number): number {
  let w = 0
  for (let d = from; d <= to; d++) w += s.finance.pnl[d]?.personalIncome ?? 0
  return w
}

// ---------------------------------------------------------------------------
// Copywriting helpers (only public info: name, keywords, buyer objections)
// ---------------------------------------------------------------------------
const NICHE_ANGLES: Record<Niche, AngleId[]> = {
  pet: ['pet_love', 'pain_point', 'convenience'],
  beauty: ['self_care', 'aspirational', 'social_proof'],
  home: ['pain_point', 'convenience', 'time_saving'],
  kitchen: ['time_saving', 'convenience', 'pain_point'],
  fitness: ['aspirational', 'convenience', 'social_proof'],
  wellness: ['self_care', 'pain_point', 'social_proof'],
  car: ['convenience', 'pain_point', 'time_saving'],
  gadgets: ['curiosity', 'convenience', 'social_proof'],
  baby: ['parenting', 'convenience', 'pain_point'],
  kids: ['parenting', 'gift', 'curiosity'],
  fashion: ['aspirational', 'social_proof', 'gift'],
  outdoor: ['aspirational', 'convenience', 'gift'],
}

function nameWords(def: ProductDef): Set<string> {
  return new Set(def.name.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))
}
/** Buyer-language keywords that don't just repeat the product name. */
function benefitKeywords(def: ProductDef): string[] {
  const nw = nameWords(def)
  const out = def.keywords.filter(k => !k.toLowerCase().split(/\s+/).every(w => nw.has(w)))
  const list = out.length >= 3 ? out : def.keywords
  return list.length ? list : [def.name.toLowerCase()]
}
const shortName = (def: ProductDef) => def.name.replace(/\s*\([^)]*\)/g, '').trim()

export function proTitle(def: ProductDef): string {
  const kws = benefitKeywords(def)
  const base = shortName(def)
  let t = `${base}: ${cap(kws[0])} & ${cap(kws[1] ?? kws[0])}`
  if (t.length > 70) t = `${base}: ${cap(kws[0])}`
  if (t.length > 70) t = base.slice(0, 68)
  return t
}

export function proDescription(def: ProductDef, window: [number, number]): string {
  const kws = benefitKeywords(def)
  const k = (i: number) => kws[i % kws.length]
  const short = shortName(def).toLowerCase()
  const bullets = [
    `<li><strong>${cap(k(0))}:</strong> made so you get results in seconds, with no hassle and no mess.</li>`,
    `<li><strong>${cap(k(1))}:</strong> simple to use every day, so your routine finally feels effortless.</li>`,
    `<li><strong>${cap(k(2))}:</strong> durable and built to last, which saves you money over cheap copies.</li>`,
    `<li><strong>${cap(k(3))}:</strong> compact and easy to store, so it's ready whenever you need it.</li>`,
    `<li><strong>${cap(k(4))}:</strong> gentle, safe and quiet. You'll love how easy it is.</li>`,
  ]
  return [
    `<p>Tired of doing it the hard way? The ${short} makes ${k(0)} and ${k(1)} easy, so you can finally enjoy the result without the stress.</p>`,
    '<h3>Why you\'ll love it</h3>',
    `<ul>${bullets.join('')}</ul>`,
    '<h3>How it works</h3>',
    '<p>Take it out of the box, follow the quick-start card, and you\'re done in minutes. Clean it with a quick wipe and it\'s ready for next time.</p>',
    `<p>Every order ships free with tracking and arrives in ${window[0]}–${window[1]} days. Try it risk-free for 30 days: if you don't love it, our money-back guarantee has you covered.</p>`,
  ].join('')
}

function faqFor(def: ProductDef, window: [number, number]): { q: string; a: string }[] {
  // the in-game copywriter's topic-aware answers (a competent player writes real answers, not templates)
  return copywriterRewrite(def, { quality: 1, revision: 0, window, freeShip: true }).faq.slice(0, 7)
}
const BENEFIT_LINES = ['Works from the very first use.', 'Saves you time every day.', 'Built to last, backed by our 30-day guarantee.', "An easy upgrade you'll use daily."]

export function proSections(def: ProductDef, window: [number, number]): PageSection[] {
  const kws = benefitKeywords(def)
  return [
    { id: 'shipping_info', enabled: true, settings: { minDays: window[0], maxDays: window[1], text: 'Free tracked shipping on every order.' } },
    { id: 'benefits_icons', enabled: true, settings: { items: kws.slice(0, 4).map((k, i) => ({ icon: ['Sparkles', 'Clock', 'ShieldCheck', 'Heart'][i], title: cap(k), text: BENEFIT_LINES[i] })) } },
    { id: 'how_it_works', enabled: true, settings: { steps: [{ title: 'Unbox', text: 'Follow the quick-start card.' }, { title: 'Use', text: `Get ${kws[0]} in minutes.` }, { title: 'Enjoy', text: 'Wipe clean and store it anywhere.' }] } },
    { id: 'reviews', enabled: true, settings: { layout: 'grid', showPhotos: true } },
    { id: 'guarantee', enabled: true, settings: { days: 30, text: 'Love it or get your money back. No questions asked.' } },
    { id: 'trust_badges', enabled: true, settings: { badges: ['secure_checkout', 'money_back', 'free_returns'] } },
    { id: 'sticky_atc', enabled: true, settings: { showPrice: true } },
    { id: 'faq', enabled: true, settings: { items: faqFor(def, window) } },
  ]
}

function beatsForHook(h: HookId): BeatId[] {
  if (h === 'unboxing' || h === 'asmr') return ['hook', 'unboxing', 'demo', 'benefits', 'social_proof', 'offer', 'cta']
  if (h === 'before_after') return ['hook', 'problem', 'demo', 'comparison', 'social_proof', 'offer', 'cta']
  if (h === 'testimonial') return ['hook', 'testimonial', 'problem', 'demo', 'benefits', 'offer', 'cta']
  if (h === 'us_vs_them') return ['hook', 'comparison', 'demo', 'benefits', 'social_proof', 'offer', 'cta']
  return ['hook', 'problem', 'agitate', 'demo', 'benefits', 'social_proof', 'offer', 'cta']
}

function scriptFor(def: ProductDef): string {
  const kws = benefitKeywords(def)
  return `You know that feeling when ${kws[0]} is a daily fight? Watch this. ${cap(kws[1] ?? kws[0])}, ${kws[2] ?? kws[0]} and ${kws[3] ?? kws[1] ?? kws[0]} in one go. `
    + 'It\'s so easy I use it every day. Over 1,000 happy customers already switched. Free shipping and a 30-day money-back guarantee. Tap Shop Now to get yours today.'
}

// ---------------------------------------------------------------------------
// Product research (public signals only)
// ---------------------------------------------------------------------------
export interface CandidateScore { id: string; score: number; gap: number; growth: number; advertisers: number; rating: number; orders: number }

export function scoreCandidates(s: GameState): CandidateScore[] {
  const out: CandidateScore[] = []
  for (const id of s.catalog.available) {
    const def = market.findProduct(id)
    const L = market.publicListing(s, id)
    if (!def || !L) continue
    const spy = market.spyData(s, id)
    const landed = market.landedCost(s, id)
    const anchor = def.amazonPrice ?? spy?.competitorPrice ?? 0
    const gap = landed > 0 ? anchor / landed : 0
    const hist = market.marketHistory(s, id)
    const last = hist[hist.length - 1]
    const prev = hist.find(h => h.day >= (last?.day ?? 0) - 14) ?? hist[0]
    const growth = last && prev && prev.orders30d > 0 ? last.orders30d / prev.orders30d : L.trend === 'up' ? 1.2 : 1
    const advertisers = spy?.advertisers ?? 20
    let score = 1.6 * Math.log(Math.max(0.1, gap))
      + 1.2 * clamp(growth - 1, -0.6, 1.2)
      - 0.03 * advertisers
      + 0.25 * Math.log10(Math.max(10, L.orders30d))
      + 2.0 * (L.rating - 4.5)
      + (spy?.engagementTrend === 'rising' ? 0.35 : spy?.engagementTrend === 'falling' ? -0.35 : 0)
      + (L.shipDays[1] <= 16 ? 0.2 : 0)
    score += anchor >= 30 && anchor <= 90 ? 1 : anchor < 20 ? -1.5 : anchor > 120 ? -0.5 : 0
    if (gap < 2.5) score -= 3
    if (L.rating < 4.4) score -= 2
    if (L.shipDays[1] > 25) score -= 0.2
    out.push({ id, score, gap, growth, advertisers, rating: L.rating, orders: L.orders30d })
  }
  return out.sort((a, b) => b.score - a.score)
}

function formatIdByName(name?: string): FormatId | null {
  if (!name) return null
  return FORMAT_LIST.find(f => f.name === name)?.id ?? null
}

// ---------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------
export interface PlayerOptions {
  storeName: string
  /** ad platforms to run (accounts are opened in setup) */
  platforms: Platform[]
  /** Fadbook CBO budget ceiling while scaling */
  maxBudget: number
  /** TikTak ad group daily budget */
  tiktakBudget: number
  /** order a Mineo subscription at setup; cancel it on this day (null = keep it) */
  cancelSpyDay: number | null
  /** the AliExprez sample arrives on day 2 (instead of 1–3 weeks) so creatives can start early */
  fastSample: boolean
  /** quit McDoodle's once the business reliably out-earns the job */
  quitJob: boolean
  /** work the support inbox every N days (1 = daily; higher = sloppy support → escalations, chargebacks) */
  supportEvery: number
}

export interface PlayerToggles {
  /** hourly: work the support inbox */
  answerTickets: boolean
  /** hourly: fight every chargeback */
  respondDisputes: boolean
  /** daily: pay the card down with spare cash */
  payDownCard: boolean
  /** daily: kill / scale / refresh ads */
  manageAds: boolean
  /** appeal bans and move to a backup account */
  recoverAccounts: boolean
  /** launch campaigns / add ads as creatives become ready */
  launchAds: boolean
  /** brief self-shot + UGC creatives once the sample is in hand */
  orderCreatives: boolean
}

export const DEFAULT_OPTIONS: PlayerOptions = {
  storeName: 'Northwind Goods',
  platforms: ['fadbook'],
  maxBudget: 400,
  tiktakBudget: 30,
  cancelSpyDay: 25,
  fastSample: true,
  quitJob: true,
  supportEvery: 1,
}

export interface PlayerIds {
  spId: string
  spId2: string
  catalogId: string
  catalogId2: string
  campaignId: string
  adSetId: string
  ttCampaignId: string
  ttAdGroupId: string
  creatives: string[]
}

export class Player {
  readonly s: GameState
  readonly o: PlayerOptions
  readonly t: PlayerToggles = { answerTickets: true, respondDisputes: true, payDownCard: true, manageAds: true, recoverAccounts: true, launchAds: true, orderCreatives: true }
  readonly ids: PlayerIds = { spId: '', spId2: '', catalogId: '', catalogId2: '', campaignId: '', adSetId: '', ttCampaignId: '', ttAdGroupId: '', creatives: [] }
  readonly notes: string[] = []
  private adByCreative: Record<string, string> = {}
  private ttAdByCreative: Record<string, string> = {}
  private briefsDone = 0
  private ugcOrdered = false
  private pendingRefresh: string[] = []
  private swaps: string[] = []
  private rereviewed: string[] = []
  private lastScaleDay = -99
  private mediaSynced = 0
  private hooks: HookId[] = []
  private formats: FormatId[] = []
  /** extra per-day callback (scenario-specific actions) */
  onDaily: ((d: number) => void) | null = null

  constructor(s: GameState, o: Partial<PlayerOptions> = {}) {
    this.s = s
    this.o = { ...DEFAULT_OPTIONS, ...o }
  }

  // ---- setup: store, apps, product research, product pages ----------------
  setupStore(apps: string[] = ['dserz', 'fadbook-channel', 'tiktak-channel', 'judgyme', 'trustbadgz']) {
    const s = this.s
    store.createStore(s, { name: this.o.storeName })
    for (const app of apps) store.installApp(s, app)
    if (this.o.cancelSpyDay !== 0) market.subscribeSpyTool(s)
    const ranked = scoreCandidates(s)
    const pick = ranked[0]
    const runner = ranked.find(c => c.id !== pick.id)
    this.ids.catalogId = pick.id
    const def = market.getProduct(pick.id)
    this.notes.push(`picked ${def.name} (gap ${pick.gap.toFixed(2)}x, orders ${pick.orders}, advertisers ${pick.advertisers})`)
    market.toggleFavorite(s, pick.id)
    if (runner) market.toggleFavorite(s, runner.id)
    market.startResearch(s, pick.id)
    market.orderSample(s, pick.id)
    if (this.o.fastSample) {
      const smp = s.catalog.samples.find(x => x.catalogId === pick.id && !x.received)
      if (smp) smp.arriveDay = Math.min(smp.arriveDay, today(s) + 2)
    }
    this.ids.spId = store.importProduct(s, pick.id)
    const win = store.realDeliveryWindow(s, pick.id)
    const promise: [number, number] = [win[0], win[1] + 2]
    const anchor = def.amazonPrice ?? market.spyData(s, pick.id)?.competitorPrice ?? def.cogs * 4
    const price = round99(anchor * 0.9)
    const media = Array.from({ length: 6 }, (_, i) => ({ id: `m_sup_${i}`, kind: 'supplier' as const, src: productImage(def.id), alt: `${def.name} — view ${i + 1}`, variant: i }))
    store.updateProduct(s, this.ids.spId, {
      title: proTitle(def),
      descriptionHtml: proDescription(def, promise),
      price,
      compareAtPrice: round99(Math.max(anchor * 1.15, price / 0.75)),
      media,
      sections: proSections(def, promise),
      promisedDays: promise,
      productType: cap(def.niche),
      tags: [def.niche, 'bestseller'],
    })
    store.importReviews(s, this.ids.spId, 60, 4)
    store.setProductStatus(s, this.ids.spId, 'active')
    // a second product, imported as-is (supplier copy, draft): what a new player often leaves lying around
    if (runner) {
      this.ids.catalogId2 = runner.id
      this.ids.spId2 = store.importProduct(s, runner.id)
    }
    // policies, payments, domain
    const policies = { ...s.store.policies }
    for (const k of ['refund', 'shipping', 'privacy', 'terms'] as const) policies[k] = store.generatePolicy(s, k)
    policies.contact = `support@${this.o.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com · Mon–Fri 9am–5pm PT · replies within 24 hours`
    store.updateStoreSettings(s, { policies, payments: { ...s.store.payments, paypal: true } })
    const q = store.domainQuote(s, `${this.o.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.com`)
    if (q.ok) store.buyDomain(s, q.domain)
    // what the top competitor ads use (Mineo), in order of engagement
    const spy = market.spyData(s, pick.id)
    for (const a of spy?.topAds ?? []) {
      if (a.hookId && !this.hooks.includes(a.hookId)) this.hooks.push(a.hookId)
      const f = formatIdByName(a.format)
      if (f && !this.formats.includes(f) && FORMATS[f].producers.includes('self')) this.formats.push(f)
    }
    if (!this.formats.length) this.formats.push('demo_video', 'ugc_testimonial')
    if (!this.hooks.length) this.hooks.push('problem_callout', 'pov', 'testimonial')
  }

  setupAds() {
    const s = this.s
    for (const p of this.o.platforms) ads.openAdAccount(s, p)
    finance.setAutopay(s, 'full')
  }

  // ---- loop ----------------------------------------------------------------
  pickChoice(m: GameModal): string {
    const prefs = ['appeal', 'verify', 'refresh', 'decline', 'help', 'go', 'pay', 'stay', 'accept', 'ok', 'later']
    for (const p of prefs) if (m.choices.some(c => c.id === p)) return p
    return m.choices[0]?.id ?? 'ok'
  }

  resolveModals() {
    const s = this.s
    let guard = 0
    while (s.events.modals.length && guard++ < 30) {
      const m = s.events.modals[0]
      resolveModal(s, m.id, this.pickChoice(m))
    }
    // a handler without registration would leave the modal in place: drop it rather than loop
    if (s.events.modals.length) s.events.modals.splice(0)
  }

  /** Fast-forward without any business routine (life autopilot only) until `endHour`. */
  idleUntil(endHour: number) {
    const s = this.s
    this.resolveModals()
    while (s.time.hour < endHour) {
      tickHour(s)
      this.resolveModals()
    }
  }

  /** Simulate hour by hour (with the player's hourly/daily routine) until `endHour`. */
  runUntil(endHour: number) {
    const s = this.s
    this.resolveModals()
    while (s.time.hour < endHour) {
      tickHour(s)
      this.resolveModals()
      const h = hourOfDay(s.time.hour)
      this.hourly()
      if (h === 9) {
        this.daily()
        this.onDaily?.(today(s))
      }
      this.resolveModals()
    }
  }

  hourly() {
    const s = this.s
    const h = hourOfDay(s.time.hour)
    const { catalogId } = this.ids
    if (!catalogId) return
    // brief creatives as soon as the sample is in hand
    if (this.t.orderCreatives && this.briefsDone < 3 && s.catalog.samplesOwned.includes(catalogId) && !s.player.queue.some(a => a.kind === 'film_creative')) {
      this.orderBrief(this.briefsDone, 'self')
    }
    if (this.t.orderCreatives && !this.ugcOrdered && s.catalog.samplesOwned.includes(catalogId)) {
      const def = market.getProduct(catalogId)
      const score = (c: GameState['creatives']['creators'][number]) =>
        (c.niches.includes(def.niche) ? 1 : 0) + c.rating - 4 + (c.quality[0] + c.quality[1]) / 2 - c.pricePerVideo / 600
      const creators = s.creatives.creators.filter(c => c.pricePerVideo <= 320).sort((a, b) => score(b) - score(a))
      if (creators[0]) {
        const id = this.orderBrief(3, 'ugc', creators[0].id)
        if (id) this.ugcOrdered = true
      }
    }
    if (this.t.launchAds && h >= 7 && h <= 22) this.launchOrExtend()
    if (this.t.answerTickets) {
      const open = store.openTicketCount(s)
      const queued = [s.player.activity, ...s.player.queue].some(a => a?.kind === 'customer_support')
      const every = Math.max(1, this.o.supportEvery)
      if (!queued && open > 0 && ((h === 19 && today(s) % every === 0) || open >= 8 * every)) life.enqueueActivity(s, 'customer_support')
    }
    if (this.t.respondDisputes) {
      for (const cb of s.store.chargebacks) {
        if (cb.status !== 'needs_response') continue
        const q = [s.player.activity, ...s.player.queue].some(a => a?.payload?.chargebackId === cb.id)
        if (!q) store.respondChargeback(s, cb.id, 'self')
      }
    }
  }

  daily() {
    const s = this.s
    const d = today(s)
    if (this.t.manageAds) this.manageAds(d)
    this.syncMedia()
    if (this.t.payDownCard) {
      const spare = s.finance.cash - 350
      if (spare > 50 && s.finance.card.balance > 0) finance.payCardBalance(s, Math.min(spare, s.finance.card.balance))
    }
    if (this.o.quitJob && s.job.employed && d >= 21) {
      let profit = 0
      for (let x = d - 14; x < d; x++) profit += dayProfit(s, x)
      const wages = Math.max(1, wagesFor(s, d - 28, d - 1) / 2)
      if (profit > 2 * wages && profit > 800) {
        life.quitJobNow(s)
        this.notes.push(`quit McDoodle's on day ${d + 1}`)
      }
    }
    if (this.o.cancelSpyDay != null && d === this.o.cancelSpyDay && market.spyToolActive(s)) market.cancelSpyTool(s)
  }

  // ---- creatives -----------------------------------------------------------
  private orderBrief(i: number, producer: 'self' | 'ugc', creatorId?: string): string | null {
    const s = this.s
    const def = market.getProduct(this.ids.catalogId)
    const hook = this.hooks[i % this.hooks.length]
    let format: FormatId = this.formats[i % this.formats.length]
    if (!FORMATS[format].producers.includes(producer)) format = producer === 'ugc' ? 'ugc_testimonial' : 'demo_video'
    if (producer === 'ugc') format = this.formats.find(f => FORMATS[f].talking && FORMATS[f].producers.includes('ugc')) ?? 'ugc_testimonial'
    const angles = NICHE_ANGLES[def.niche]
    const angle = angles[i % angles.length]
    const id = ads.orderCreative(s, {
      catalogId: this.ids.catalogId, name: '', format, hook, angle, beats: beatsForHook(hook), hookText: market.hookTextFor(def, hook, i),
      script: scriptFor(def), producer, creatorId: creatorId ?? null,
    })
    if (id) {
      this.ids.creatives.push(id)
      if (producer === 'self') this.briefsDone++
    }
    return id
  }

  /** Put finished creatives on the page gallery, like the editor's "your content" picker. */
  private syncMedia() {
    const s = this.s
    const sp = s.store.products.find(p => p.id === this.ids.spId)
    if (!sp) return
    const ready = s.creatives.creatives.filter(c => c.catalogId === this.ids.catalogId && c.status === 'ready')
    if (ready.length <= this.mediaSynced) return
    this.mediaSynced = ready.length
    const own = ready.slice(0, 3).map((c, i) => ({ id: `m_cr_${c.id}`, kind: (c.isVideo && i === 0 ? 'video' : i === 1 ? 'ugc_photo' : 'lifestyle') as 'video' | 'ugc_photo' | 'lifestyle', src: c.thumb, alt: c.name }))
    const supplier = sp.media.filter(m => m.kind === 'supplier').slice(0, 8 - own.length)
    store.updateProduct(s, sp.id, { media: [...supplier, ...own] })
  }

  // ---- ads -----------------------------------------------------------------
  private adCopy(def: ProductDef) {
    const kws = benefitKeywords(def)
    const short = shortName(def)
    return {
      primaryText: `Still fighting with ${kws[0]}? The ${short.toLowerCase()} gives you ${kws[1] ?? kws[0]} and ${kws[2] ?? kws[0]} in seconds, so your day gets easier. ⭐ Rated 4.7 by 1,000+ happy customers. Free shipping + 30-day money-back guarantee.`,
      headline: `${cap(kws[0])}, Finally Easy`.slice(0, 60),
      tiktakText: `${cap(kws[0])} in seconds. Free shipping + 30-day guarantee`.slice(0, 100),
    }
  }

  private readyCreatives(): Creative[] {
    const s = this.s
    return this.ids.creatives.map(id => s.creatives.creatives.find(c => c.id === id)).filter((c): c is Creative => !!c && c.status === 'ready')
  }

  launchOrExtend() {
    const s = this.s
    const ready = this.readyCreatives()
    const def = market.getProduct(this.ids.catalogId)
    const copy = this.adCopy(def)
    if (this.o.platforms.includes('fadbook') && s.ads.accounts.some(a => a.platform === 'fadbook')) {
      if (!this.ids.campaignId && (ready.length >= 2 || (ready.length >= 1 && today(s) > 30))) {
        const cid = ads.createCampaign(s, { platform: 'fadbook', name: `${shortName(def)} | CBO | Broad`, budgetMode: 'cbo', dailyBudget: 40 })
        const setId = cid ? ads.createAdSet(s, { campaignId: cid, name: 'Broad US 18-65+', targeting: { type: 'broad' } }) : null
        if (cid && setId) {
          this.ids.campaignId = cid
          this.ids.adSetId = setId
        }
      }
      if (this.ids.adSetId) {
        for (const c of ready) {
          if (this.adByCreative[c.id]) continue
          const adId = ads.createAd(s, { adSetId: this.ids.adSetId, name: c.name, creativeId: c.id, storeProductId: this.ids.spId, primaryText: copy.primaryText, headline: copy.headline, cta: 'shop_now' })
          if (adId) {
            this.adByCreative[c.id] = adId
            const ri = this.pendingRefresh.indexOf(c.id)
            if (ri >= 0) {
              this.pendingRefresh.splice(ri, 1)
              this.swaps.push(adId)
            }
          }
        }
      }
    }
    if (this.o.platforms.includes('tiktak') && s.ads.accounts.some(a => a.platform === 'tiktak' && a.status === 'active')) {
      const videos = ready.filter(c => c.isVideo)
      if (!this.ids.ttCampaignId && videos.length >= 2) {
        const cid = ads.createCampaign(s, { platform: 'tiktak', name: `${shortName(def)} | Sales | ABO`, budgetMode: 'abo' })
        const gid = cid ? ads.createAdSet(s, { campaignId: cid, name: 'Ad group 1 · Broad US', dailyBudget: this.o.tiktakBudget, targeting: { type: 'broad' } }) : null
        if (cid && gid) {
          this.ids.ttCampaignId = cid
          this.ids.ttAdGroupId = gid
        }
      }
      if (this.ids.ttAdGroupId) {
        for (const c of videos) {
          if (this.ttAdByCreative[c.id]) continue
          const adId = ads.createAd(s, { adSetId: this.ids.ttAdGroupId, name: c.name, creativeId: c.id, storeProductId: this.ids.spId, primaryText: copy.tiktakText, headline: '', cta: 'shop_now' })
          if (adId) this.ttAdByCreative[c.id] = adId
        }
      }
    }
  }

  private liveAds() {
    return this.s.ads.ads.filter(a => a.adSetId === this.ids.adSetId && a.status === 'active' && a.review === 'approved')
  }
  private freq7(adId: string): number {
    const s = this.s
    const ad = s.ads.ads.find(a => a.id === adId)
    if (!ad) return 0
    let imps = 0, reach = 0
    for (let d = today(s) - 7; d < today(s); d++) { imps += ad.stats[d]?.impressions ?? 0; reach += ad.stats[d]?.reach ?? 0 }
    return reach > 0 ? imps / reach : 0
  }
  private ctrDecay(adId: string): number {
    const ad = this.s.ads.ads.find(a => a.id === adId)
    if (!ad) return 1
    const days = Object.keys(ad.stats).map(Number).filter(x => (ad.stats[x]?.impressions ?? 0) > 0).sort((a, b) => a - b)
    if (days.length < 14) return 1
    const ctr = (list: number[]) => {
      let imps = 0, clicks = 0
      for (const x of list) { imps += ad.stats[x].impressions; clicks += ad.stats[x].linkClicks }
      return imps > 0 ? clicks / imps : 0
    }
    const imps = (list: number[]) => list.reduce((a, x) => a + ad.stats[x].impressions, 0)
    if (imps(days.slice(0, 7)) < 3000 || imps(days.slice(-5)) < 3000) return 1
    const first = ctr(days.slice(0, 7))
    return first > 0 ? ctr(days.slice(-5)) / first : 1
  }
  private tiredness(adId: string): number {
    const decay = this.ctrDecay(adId)
    return Math.max(this.freq7(adId) / 3, decay > 0 ? 0.75 / decay : 0)
  }

  private handleSwaps() {
    const s = this.s
    for (const adId of [...this.swaps]) {
      const ad = s.ads.ads.find(a => a.id === adId)
      if (!ad || ad.status !== 'active') { this.swaps.splice(this.swaps.indexOf(adId), 1); continue }
      if (ad.review === 'rejected') {
        if (!this.rereviewed.includes(adId)) { this.rereviewed.push(adId); ads.requestAdReview(s, adId) }
        else { ads.setEntityStatus(s, 'ad', adId, 'paused'); this.swaps.splice(this.swaps.indexOf(adId), 1) }
        continue
      }
      if (ad.review !== 'approved') continue
      this.swaps.splice(this.swaps.indexOf(adId), 1)
      const others = this.liveAds().filter(a => a.id !== adId)
      const tired = others.map(a => ({ a, f: this.tiredness(a.id) })).sort((x, y) => y.f - x.f)[0]
      if (tired && tired.f >= 1) ads.setEntityStatus(s, 'ad', tired.a.id, 'paused')
      else if (others.length >= 5) {
        const worst = others.map(a => { const x = ads.adTotals(a); return { a, r: x.spend > 0 ? x.purchaseValue / x.spend : 0 } }).sort((x, y) => x.r - y.r)[0]
        if (worst) ads.setEntityStatus(s, 'ad', worst.a.id, 'paused')
      }
    }
  }

  /** Account banned → appeal; appeal denied → backup (or agency) account with a copy of the campaign. */
  private recoverAccount(platform: Platform) {
    const s = this.s
    const fb = platform === 'fadbook'
    const camp = s.ads.campaigns.find(c => c.id === (fb ? this.ids.campaignId : this.ids.ttCampaignId))
    const acc = camp && s.ads.accounts.find(a => a.id === camp.accountId)
    if (!camp || !acc || (acc.status !== 'restricted' && acc.status !== 'disabled')) return
    if (!acc.appealDenied) {
      if (!acc.appeal) ads.startAppeal(s, acc.id)
      return
    }
    let working = s.ads.accounts.find(a => a.platform === platform && a.status === 'active')
    if (!working) {
      const id = ads.openAccountBlocker(s, platform) ? ads.openAdAccount(s, platform, { rented: true }) : ads.openAdAccount(s, platform)
      working = s.ads.accounts.find(a => a.id === id)
    }
    if (!working) return
    const copy = ads.copyCampaignToAccount(s, camp.id, working.id)
    if (!copy) return
    const setId = s.ads.adSets.find(x => x.campaignId === copy && x.status !== 'deleted')?.id ?? ''
    const map: Record<string, string> = {}
    for (const ad of s.ads.ads.filter(a => a.adSetId === setId)) map[ad.creativeId] = ad.id
    if (fb) {
      this.ids.campaignId = copy
      this.ids.adSetId = setId
      this.adByCreative = map
      const nb = s.ads.campaigns.find(c => c.id === copy)
      if (nb?.dailyBudget && nb.dailyBudget > 250) ads.updateCampaign(s, copy, { dailyBudget: 250 })
    } else {
      this.ids.ttCampaignId = copy
      this.ids.ttAdGroupId = setId
      this.ttAdByCreative = map
    }
  }

  private manageAds(d: number) {
    const s = this.s
    if (this.t.recoverAccounts) for (const p of this.o.platforms) this.recoverAccount(p)
    if (!this.ids.campaignId) return
    this.handleSwaps()
    const camp = s.ads.campaigns.find(c => c.id === this.ids.campaignId)
    if (!camp || camp.status === 'deleted') return
    const be = store.breakEven(s, this.ids.spId)
    // 1) kill losers
    for (const ad of this.liveAds()) {
      const t = ads.adTotals(ad)
      if (this.liveAds().length <= 1 || d - dayOf(ad.createdHour) < 2) continue
      const noSales = t.spend > 2 * be.breakEvenCpa && t.purchases === 0
      const loser = t.spend > 6 * be.breakEvenCpa && t.purchaseValue / t.spend < 0.8 * be.breakEvenRoas
      if (noSales || loser) ads.setEntityStatus(s, 'ad', ad.id, 'paused')
    }
    // 2) scale winners (blended ROAS over the last 3 days), step back when below break-even
    let rev = 0, spend = 0
    for (let x = d - 3; x <= d - 1; x++) {
      rev += s.store.analytics.daily[x]?.totalSales ?? 0
      const p = s.finance.pnl[x]
      spend += (p?.adSpendFadbook ?? 0) + (p?.adSpendTiktak ?? 0)
    }
    const roas3 = spend > 0 ? rev / spend : 0
    const budget = camp.dailyBudget ?? 40
    const headroom = s.finance.cash + Math.max(0, s.finance.card.limit - s.finance.card.balance)
    if (spend > budget * 1.5 && roas3 > 1.3 * be.breakEvenRoas && d - this.lastScaleDay >= 1 && headroom > budget * 6 && budget < this.o.maxBudget) {
      ads.updateCampaign(s, camp.id, { dailyBudget: Math.min(this.o.maxBudget, Math.round(budget * 1.2)) })
      this.lastScaleDay = d
    } else if (spend > budget * 1.5 && roas3 < 1.05 * be.breakEvenRoas && budget > 40 && d - this.lastScaleDay >= 2) {
      ads.updateCampaign(s, camp.id, { dailyBudget: Math.max(40, Math.round(budget * (roas3 < 0.8 * be.breakEvenRoas ? 0.7 : 0.8))) })
      this.lastScaleDay = d
    }
    // 3) creative refresh on fatigue
    const tired = this.liveAds().filter(a => this.tiredness(a.id) >= 1)
    const live = this.liveAds().length
    const needFresh = (tired.length > 0 && live <= 5) || live < 2
    const inFlight = this.pendingRefresh.filter(id => s.creatives.creatives.find(c => c.id === id)?.status !== 'failed').length + this.swaps.length
    if (needFresh && inFlight === 0 && s.catalog.samplesOwned.includes(this.ids.catalogId) && !s.player.queue.some(a => a.kind === 'film_creative')) {
      const def = market.getProduct(this.ids.catalogId)
      const i = this.ids.creatives.length
      const hook = this.hooks[i % this.hooks.length]
      const angles = NICHE_ANGLES[def.niche]
      const fmt = this.formats[(i + 1) % this.formats.length]
      const id = ads.orderCreative(s, {
        catalogId: this.ids.catalogId, name: '', format: FORMATS[fmt].producers.includes('self') ? fmt : 'demo_video', hook, angle: angles[(i + 1) % angles.length],
        beats: beatsForHook(hook), hookText: market.hookTextFor(def, hook, i + 7), script: scriptFor(def), producer: 'self',
      })
      if (id) { this.ids.creatives.push(id); this.pendingRefresh.push(id) }
    }
    // 4) an account that can't bill: pay the ad balance
    for (const acc of s.ads.accounts) if (acc.status === 'payment_failed') ads.payAdBalance(s, acc.id)
  }
}
