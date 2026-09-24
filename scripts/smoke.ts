// ============================================================================
// Headless balance smoke test: two scripted players run 150 in-game days on
// Normal using only the public sim APIs + tickHour on a fresh createNewGame.
//
//   npx tsx scripts/smoke.ts            (default seed; also `npm run smoke`)
//   npx tsx scripts/smoke.ts 12345      (custom seed; both players share it)
//   npx tsx scripts/smoke.ts 12345 90   (custom seed and day count)
// Env: SMOKE_DIFFICULTY=chill|realistic  other difficulty (robustness run)
//      SMOKE_PICK=<catalogId>            force the competent player's product
//      SMOKE_DEBUG=COMPETENT|NOVICE      one diagnostic line per day for that player
//      SMOKE_EVENTS=1                    count warning/critical notifications
//      SMOKE_RECON=1                     P&L vs balance-sheet reconciliation
//
// Built-in integration checks: a read-only API sweep on a deep-frozen day-60 state
// (UI selectors must never write), and a JSON save round-trip at day 90.
//
// COMPETENT: picks a product from public signals (rising orders, few advertisers,
// big Amazin price gap), builds a real product page, prices ~0.9x the Amazin
// anchor, films/briefs 4 fitting creatives, runs a $40/day CBO broad campaign
// and manages it daily like a media buyer.
// NOVICE: random product, supplier copy and default price, one supplier-edit
// creative, $50/day broad, doubles the budget after any sale, never refreshes,
// never answers tickets.
//
// Hidden fields (archetype, perceivedValue, best hooks…) are never used for
// decisions; they are printed at the end only as a diagnostic.
// ============================================================================
import type {
  AngleId, BeatId, Creative, Difficulty, FormatId, GameModal, GameState, HookId, Niche, PageSection, ProductDef,
} from '../src/core/types'
import { createNewGame } from '../src/core/newGame'
import { tickHour } from '../src/sim'
import { resolveModal } from '../src/core/modals'
import { dayOf, hourOfDay } from '../src/core/time'
import { netWorth } from '../src/core/money'
import { DIFFICULTY as DIFFICULTY_DEFS } from '../src/core/difficulty'
import * as store from '../src/sim/store'
import * as market from '../src/sim/market'
import * as ads from '../src/sim/ads'
import * as life from '../src/sim/life'
import * as finance from '../src/sim/finance'
import * as events from '../src/sim/events'
import { freeze } from 'immer'
import { FORMATS, FORMAT_LIST, SUPPLIER_EDIT_FORMATS } from '../src/data/creativeTaxonomy'

const SEED = Number(process.argv[2] ?? 20260302) || 20260302
const DAYS = Math.max(10, Number(process.argv[3] ?? 150) || 150)
const PRINT_EVERY = 15
/** Normal by default; SMOKE_DIFFICULTY=chill|realistic for a quick robustness run on the other modes. */
const DIFFICULTY: Difficulty = (['chill', 'normal', 'realistic'] as const).find(x => x === process.env.SMOKE_DIFFICULTY) ?? 'normal'

// ---------------------------------------------------------------------------
// small utils (the scripts' own RNG — never touches the game's RNG stream)
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`
const pad = (v: string, n: number) => v.padStart(n)
const cap = (t: string) => t.replace(/(^|\s|-)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())
const round99 = (x: number) => Math.max(0.99, Math.round(x) - 0.01)
const today = (s: GameState) => dayOf(s.time.hour)
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Business profit for one day of the P&L (what the business made, before personal income/spend). */
function dayProfit(s: GameState, day: number): number {
  const p = s.finance.pnl[day]
  return p ? finance.businessProfit(p) : 0
}
function wagesFor(s: GameState, from: number, to: number): number {
  let w = 0
  for (let d = from; d <= to; d++) w += s.finance.pnl[d]?.personalIncome ?? 0
  return w
}

// ---------------------------------------------------------------------------
// Bot plumbing
// ---------------------------------------------------------------------------
interface DayRow { day: number; revenue: number; adSpend: number; orders: number; sessions: number; profit: number }
interface Bot {
  name: string
  s: GameState
  rows: DayRow[]
  notes: string[]
  eventLog: string[]
  setup(): void
  hourly(): void
  daily(): void
  pickChoice(m: GameModal): string
  summary(): string[]
}

function resolveModals(bot: Bot) {
  let guard = 0
  while (bot.s.events.modals.length && guard++ < 20) {
    const m = bot.s.events.modals[0]
    const choice = bot.pickChoice(m)
    resolveModal(bot.s, m.id, choice)
  }
}

function recordDay(bot: Bot, day: number) {
  const s = bot.s
  const snap = s.history.find(h => h.day === day)
  const a = s.store.analytics.daily[day]
  bot.rows.push({
    day,
    revenue: snap?.revenue ?? 0,
    adSpend: snap?.adSpend ?? 0,
    orders: a?.orders ?? snap?.orders ?? 0,
    sessions: a?.sessions ?? 0,
    profit: dayProfit(s, day),
  })
}

function periodLine(bot: Bot, fromDay: number, toDay: number): string {
  const rows = bot.rows.filter(r => r.day >= fromDay && r.day <= toDay)
  const sum = (k: keyof DayRow) => rows.reduce((a, r) => a + (r[k] as number), 0)
  const rev = sum('revenue'), spend = sum('adSpend'), orders = sum('orders'), sessions = sum('sessions')
  const s = bot.s
  return [
    `day ${pad(String(toDay + 1), 3)}`,
    `cash ${pad(usd(s.finance.cash), 8)}`,
    `NW ${pad(usd(netWorth(s)), 8)}`,
    `rev ${pad(usd(rev), 8)}`,
    `ads ${pad(usd(spend), 8)}`,
    `orders ${pad(String(orders), 5)}`,
    `ROAS ${spend > 0 ? (rev / spend).toFixed(2) : ' n/a'}`,
    `CVR ${sessions > 0 ? pct(orders / sessions) : 'n/a'}`,
    `profit ${pad(usd(sum('profit')), 8)}`,
  ].join(' | ')
}

function pickByPreference(m: GameModal, prefs: string[]): string {
  for (const p of prefs) if (m.choices.some(c => c.id === p)) return p
  return m.choices[0]?.id ?? 'ok'
}

// ---------------------------------------------------------------------------
// Copywriting helpers for the competent player (built only from public info:
// product name, specs, AliExprez "buyers mention" keywords and buyer Q&A)
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
  return out.length >= 3 ? out : def.keywords
}

function proTitle(def: ProductDef): string {
  const kws = benefitKeywords(def)
  const base = def.name.replace(/\s*\([^)]*\)/g, '').trim()
  let t = `${base}: ${cap(kws[0])} & ${cap(kws[1] ?? kws[0])}`
  if (t.length > 70) t = `${base}: ${cap(kws[0])}`
  if (t.length > 70) t = base.slice(0, 68)
  return t
}

function proDescription(def: ProductDef, window: [number, number]): string {
  const kws = benefitKeywords(def)
  const k = (i: number) => kws[i % kws.length]
  const short = def.name.replace(/\s*\([^)]*\)/g, '').toLowerCase()
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
    `<p>Take it out of the box, follow the quick-start card, and you're done in minutes. Clean it with a quick wipe and it's ready for next time.</p>`,
    `<p>Every order ships free with tracking and arrives in ${window[0]}–${window[1]} days. Try it risk-free for 30 days: if you don't love it, our money-back guarantee has you covered.</p>`,
  ].join('')
}

function faqFor(def: ProductDef, window: [number, number]): { q: string; a: string }[] {
  const items = def.objections.slice(0, 6).map(o => {
    const topic = o.replace(/\?$/, '').replace(/^(does|do|is|will|can|how|what|are)\s+/i, '')
    return { q: o, a: `Good question. ${cap(topic)}: yes. We tested it for exactly this, and our 30-day money-back guarantee covers you if it isn't right for you.` }
  })
  if (!items.some(i => /ship|deliver|arriv/i.test(i.q))) {
    items.push({ q: 'How long does shipping take?', a: `Orders arrive in ${window[0]}–${window[1]} days with free tracked shipping.` })
  }
  return items
}

function proSections(def: ProductDef, window: [number, number]): PageSection[] {
  const kws = benefitKeywords(def)
  return [
    { id: 'shipping_info', enabled: true, settings: { minDays: window[0], maxDays: window[1], text: 'Free tracked shipping on every order.' } },
    { id: 'benefits_icons', enabled: true, settings: { items: kws.slice(0, 4).map((k, i) => ({ icon: ['Sparkles', 'Clock', 'ShieldCheck', 'Heart'][i], title: cap(k), text: `${cap(k)}, every time.` })) } },
    { id: 'how_it_works', enabled: true, settings: { steps: [{ title: 'Unbox', text: 'Everything you need is in the box.' }, { title: 'Use', text: `Get ${kws[0]} in minutes.` }, { title: 'Enjoy', text: 'Wipe clean and store it anywhere.' }] } },
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
    + `It's so easy I use it every day. Over 1,000 happy customers already switched. Free shipping and a 30-day money-back guarantee. Tap Shop Now to get yours today.`
}

// ---------------------------------------------------------------------------
// COMPETENT PLAYER
// ---------------------------------------------------------------------------
interface CandidateScore { id: string; score: number; gap: number; growth: number; advertisers: number; rating: number; orders: number }

function scoreCandidates(s: GameState): CandidateScore[] {
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
    // price point: a $15–25 CPA on paid social needs a $30–90 ticket to leave margin
    score += anchor >= 30 && anchor <= 90 ? 1 : anchor < 20 ? -1.5 : anchor > 120 ? -0.5 : 0
    if (gap < 2.5) score -= 3 // no room for ad costs
    if (L.rating < 4.4) score -= 2 // complaints = refunds and chargebacks
    if (L.shipDays[1] > 25) score -= 0.2 // slow shipping = WISMO tickets and disputes
    out.push({ id, score, gap, growth, advertisers, rating: L.rating, orders: L.orders30d })
  }
  return out.sort((a, b) => b.score - a.score)
}

function formatIdByName(name?: string): FormatId | null {
  if (!name) return null
  return FORMAT_LIST.find(f => f.name === name)?.id ?? null
}

function makeCompetent(seed: number): Bot {
  const s = createNewGame({ playerName: 'Casey Pro', difficulty: DIFFICULTY, seed })
  const st = {
    spId: '', catalogId: '', campaignId: '', adSetId: '',
    creatives: [] as string[], // ordered creative ids
    adByCreative: {} as Record<string, string>,
    usedHooks: [] as HookId[],
    usedFormats: [] as FormatId[],
    briefsDone: 0,
    ugcOrdered: false,
    launched: -1,
    quitDay: -1,
    pendingRefresh: [] as string[], // creative ids ordered for a refresh
    swaps: [] as string[], // refresh ads waiting for review before they replace a tired ad
    rereviewed: [] as string[],
    lastScaleDay: -99,
    killed: 0,
    scaled: 0,
    cuts: 0,
    refreshes: 0,
    mediaSynced: 0,
    hooks: [] as HookId[],
    formats: [] as FormatId[],
  }
  const bot: Bot = {
    name: 'COMPETENT',
    s,
    rows: [],
    notes: [],
    eventLog: [],
    setup() {
      store.createStore(s, { name: 'Northwind Goods' })
      for (const app of ['dserz', 'fadbook-channel', 'judgyme', 'trustbadgz']) store.installApp(s, app)
      market.subscribeSpyTool(s) // Mineo: see advertisers, ad age and the hooks competitors run
      const ranked = scoreCandidates(s)
      const forced = process.env.SMOKE_PICK ? ranked.find(c => c.id === process.env.SMOKE_PICK) : undefined
      const pick = forced ?? ranked[0]
      st.catalogId = pick.id
      const def = market.getProduct(pick.id)
      bot.notes.push(`picked ${def.name} (gap ${pick.gap.toFixed(2)}x, orders ${pick.orders}, growth ${pick.growth.toFixed(2)}, advertisers ${pick.advertisers}, rating ${pick.rating})`)
      bot.notes.push(`runner-ups: ${ranked.slice(1, 4).map(c => `${market.getProduct(c.id).name} (${c.score.toFixed(2)})`).join(', ')}`)
      market.startResearch(s, pick.id)
      market.orderSample(s, pick.id)
      st.spId = store.importProduct(s, pick.id)
      // page
      const win = store.realDeliveryWindow(s, pick.id)
      const promise: [number, number] = [win[0], win[1] + 2]
      const anchor = def.amazonPrice ?? market.spyData(s, pick.id)?.competitorPrice ?? def.cogs * 4
      const price = round99(anchor * 0.9)
      const media = Array.from({ length: 6 }, (_, i) => ({ id: `m_sup_${i}`, kind: 'supplier' as const, src: '', alt: `${def.name} — view ${i + 1}`, variant: i }))
      store.updateProduct(s, st.spId, {
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
      store.importReviews(s, st.spId, 60, 4)
      store.setProductStatus(s, st.spId, 'active')
      // policies, payments, domain
      const policies = { ...s.store.policies }
      for (const k of ['refund', 'shipping', 'privacy', 'terms'] as const) policies[k] = store.generatePolicy(s, k)
      policies.contact = 'support@northwindgoods.com · Mon–Fri 9am–5pm PT · replies within 24 hours'
      store.updateStoreSettings(s, { policies, payments: { ...s.store.payments, paypal: true } })
      const q = store.domainQuote(s, 'northwindgoods.com')
      if (q.ok) store.buyDomain(s, q.domain)
      ads.openAdAccount(s, 'fadbook')
      finance.setAutopay(s, 'full')
      // what the top competitor ads use (Mineo), in order of engagement
      const spy = market.spyData(s, pick.id)
      for (const a of spy?.topAds ?? []) {
        if (a.hookId && !st.hooks.includes(a.hookId)) st.hooks.push(a.hookId)
        const f = formatIdByName(a.format)
        if (f && !st.formats.includes(f) && FORMATS[f].producers.includes('self')) st.formats.push(f)
      }
      if (!st.formats.length) st.formats.push('demo_video', 'ugc_testimonial')
      if (!st.hooks.length) st.hooks.push('problem_callout', 'pov', 'testimonial')
      const sp = s.store.products.find(p => p.id === st.spId)!
      bot.notes.push(`page grade ${sp.grade?.score.toFixed(1)} at ${usd(sp.price)} (anchor ${usd(anchor)}), break-even ROAS ${store.breakEven(s, st.spId).breakEvenRoas}`)
    },
    hourly() {
      const h = hourOfDay(s.time.hour)
      // brief creatives as soon as the sample is in hand
      if (st.briefsDone < 3 && s.catalog.samplesOwned.includes(st.catalogId) && !s.player.queue.some(a => a.kind === 'film_creative')) {
        const i = st.briefsDone
        orderBrief(i, 'self')
      }
      if (!st.ugcOrdered && s.catalog.samplesOwned.includes(st.catalogId)) {
        const def = market.getProduct(st.catalogId)
        const creators = s.creatives.creators
          .filter(c => c.pricePerVideo <= 320)
          .sort((a, b) => score(b) - score(a))
        function score(c: typeof creators[number]) { return (c.niches.includes(def.niche) ? 1 : 0) + c.rating - 4 + (c.quality[0] + c.quality[1]) / 2 - c.pricePerVideo / 600 }
        if (creators[0]) {
          const id = orderBrief(3, 'ugc', creators[0].id)
          if (id) st.ugcOrdered = true
        }
      }
      // launch / extend the campaign as creatives become ready (any hour — like checking notifications)
      if (h >= 7 && h <= 22) launchOrExtend()
      // support: work the queue in the evening (and whenever it gets long)
      const open = store.openTicketCount(s)
      const queued = [s.player.activity, ...s.player.queue].some(a => a?.kind === 'customer_support')
      if (!queued && open > 0 && (h === 19 || open >= 8)) life.enqueueActivity(s, 'customer_support')
      // disputes: always respond
      for (const cb of s.store.chargebacks) {
        if (cb.status !== 'needs_response') continue
        const q = [s.player.activity, ...s.player.queue].some(a => a?.payload?.chargebackId === cb.id)
        if (!q) store.respondChargeback(s, cb.id, 'self')
      }
    },
    daily() {
      const d = today(s)
      manageAds(d)
      syncMedia()
      // pay the card down with spare cash (keep a buffer for bills)
      const spare = s.finance.cash - 350
      if (spare > 50 && s.finance.card.balance > 0) finance.payCardBalance(s, Math.min(spare, s.finance.card.balance))
      // quit McDoodle's once the business reliably out-earns the job 2:1
      if (s.job.employed && d >= 21) {
        let profit = 0
        for (let x = d - 14; x < d; x++) profit += dayProfit(s, x)
        const wages = Math.max(1, wagesFor(s, d - 28, d - 1) / 2)
        if (profit > 2 * wages && profit > 800) {
          life.quitJobNow(s)
          st.quitDay = d
          bot.notes.push(`quit McDoodle's on day ${d + 1} (14-day profit ${usd(profit)} vs wages ${usd(wages)})`)
        }
      }
      // Mineo is only needed for research: stop the subscription after the first month
      if (d === 25 && market.spyToolActive(s)) market.cancelSpyTool(s)
    },
    pickChoice(m) {
      return pickByPreference(m, ['appeal', 'verify', 'refresh', 'decline', 'help', 'go', 'pay', 'stay', 'accept', 'ok'])
    },
    summary() {
      return [
        `ads killed ${st.killed}, budget scale-ups ${st.scaled}, cuts ${st.cuts}, creative refreshes ${st.refreshes}, launched day ${st.launched + 1}, quit job ${st.quitDay >= 0 ? `day ${st.quitDay + 1}` : 'no'}`,
        ...adReport(s),
      ]
    },
  }

  function orderBrief(i: number, producer: 'self' | 'ugc', creatorId?: string): string | null {
    const def = market.getProduct(st.catalogId)
    const hooks = st.hooks
    const hook = hooks[i % hooks.length]
    let format: FormatId = st.formats[i % st.formats.length]
    if (!FORMATS[format].producers.includes(producer)) format = producer === 'ugc' ? 'ugc_testimonial' : 'demo_video'
    if (producer === 'ugc' && FORMATS.ugc_testimonial.producers.includes('ugc')) format = st.formats.find(f => FORMATS[f].talking) ?? 'ugc_testimonial'
    const angles = NICHE_ANGLES[def.niche]
    const angle = angles[i % angles.length]
    const hookText = market.hookTextFor(def, hook, i)
    const id = ads.orderCreative(s, {
      catalogId: st.catalogId, name: '', format, hook, angle, beats: beatsForHook(hook), hookText, script: scriptFor(def), producer, creatorId: creatorId ?? null,
    })
    if (id) {
      st.creatives.push(id)
      st.briefsDone += producer === 'self' ? 1 : 0
      if (!st.usedHooks.includes(hook)) st.usedHooks.push(hook)
    }
    return id
  }

  function adCopy(def: ProductDef) {
    const kws = benefitKeywords(def)
    const short = def.name.replace(/\s*\([^)]*\)/g, '')
    return {
      primaryText: `Still fighting with ${kws[0]}? The ${short.toLowerCase()} gives you ${kws[1] ?? kws[0]} and ${kws[2] ?? kws[0]} in seconds, so your day gets easier. ⭐ Rated 4.7 by 1,000+ happy customers. Free shipping + 30-day money-back guarantee.`,
      headline: `${cap(kws[0])}, Finally Easy`.slice(0, 60),
    }
  }

  function launchOrExtend() {
    const ready = st.creatives.map(id => s.creatives.creatives.find(c => c.id === id)).filter((c): c is Creative => !!c && c.status === 'ready')
    const def = market.getProduct(st.catalogId)
    if (!st.campaignId) {
      if (ready.length < 2 && !(ready.length >= 1 && today(s) > 30)) return
      const cid = ads.createCampaign(s, { platform: 'fadbook', name: `${def.name} | CBO | Broad`, budgetMode: 'cbo', dailyBudget: 40 })
      if (!cid) return
      const setId = ads.createAdSet(s, { campaignId: cid, name: 'Broad US', targeting: { type: 'broad' } })
      if (!setId) return
      st.campaignId = cid
      st.adSetId = setId
      st.launched = today(s)
    }
    const copy = adCopy(def)
    for (const c of ready) {
      if (st.adByCreative[c.id]) continue
      const adId = ads.createAd(s, { adSetId: st.adSetId, name: c.name, creativeId: c.id, storeProductId: st.spId, ...copy, cta: 'shop_now' })
      if (adId) {
        st.adByCreative[c.id] = adId
        // a refresh replaces the most fatigued ad once the new one has passed review
        const ri = st.pendingRefresh.indexOf(c.id)
        if (ri >= 0) {
          st.pendingRefresh.splice(ri, 1)
          st.swaps.push(adId)
        }
      }
    }
  }

  /** Swap refreshed ads in (after approval); re-request review once on a rejection. */
  function handleSwaps() {
    for (const adId of [...st.swaps]) {
      const ad = s.ads.ads.find(a => a.id === adId)
      if (!ad || ad.status !== 'active') { st.swaps.splice(st.swaps.indexOf(adId), 1); continue }
      if (ad.review === 'rejected') {
        if (!st.rereviewed.includes(adId)) { st.rereviewed.push(adId); ads.requestAdReview(s, adId) }
        else { ads.setEntityStatus(s, 'ad', adId, 'paused'); st.swaps.splice(st.swaps.indexOf(adId), 1) }
        continue
      }
      if (ad.review !== 'approved') continue
      st.swaps.splice(st.swaps.indexOf(adId), 1)
      const others = liveAds().filter(a => a.id !== adId)
      const tired = others.map(a => ({ a, f: tiredness(a.id) })).sort((x, y) => y.f - x.f)[0]
      if (tired && tired.f >= 1) ads.setEntityStatus(s, 'ad', tired.a.id, 'paused')
      else if (others.length >= 5) {
        // keep the ad set lean: too many ads split a small budget so thin that none exits learning
        const worst = others.map(a => { const x = ads.adTotals(a); return { a, r: x.spend > 0 ? x.purchaseValue / x.spend : 0 } }).sort((x, y) => x.r - y.r)[0]
        if (worst) ads.setEntityStatus(s, 'ad', worst.a.id, 'paused')
      }
    }
  }

  /** Ads that can actually deliver (on, and approved by review). */
  function liveAds() {
    return s.ads.ads.filter(a => a.adSetId === st.adSetId && a.status === 'active' && a.review === 'approved')
  }
  function freq7(adId: string): number {
    const ad = s.ads.ads.find(a => a.id === adId)
    if (!ad) return 0
    let imps = 0, reach = 0
    for (let d = today(s) - 7; d < today(s); d++) { imps += ad.stats[d]?.impressions ?? 0; reach += ad.stats[d]?.reach ?? 0 }
    return reach > 0 ? imps / reach : 0
  }

  /** ≥ 1 = fatigued: 7-day frequency over 3, or link CTR down 25%+ from the ad's first week */
  function tiredness(adId: string): number {
    const decay = ctrDecay(adId)
    return Math.max(freq7(adId) / 3, decay > 0 ? 0.75 / decay : 0)
  }
  /** link CTR of the last 5 days ÷ the ad's first 7 delivery days (1 = no decay) */
  function ctrDecay(adId: string): number {
    const ad = s.ads.ads.find(a => a.id === adId)
    if (!ad) return 1
    const days = Object.keys(ad.stats).map(Number).filter(x => (ad.stats[x]?.impressions ?? 0) > 0).sort((a, b) => a - b)
    if (days.length < 14) return 1
    const ctr = (list: number[]) => {
      let imps = 0, clicks = 0
      for (const x of list) { imps += ad.stats[x].impressions; clicks += ad.stats[x].linkClicks }
      return imps > 0 ? clicks / imps : 0
    }
    const imps = (list: number[]) => list.reduce((a, x) => a + ad.stats[x].impressions, 0)
    if (imps(days.slice(0, 7)) < 3000 || imps(days.slice(-5)) < 3000) return 1 // too little data to call it
    const first = ctr(days.slice(0, 7))
    return first > 0 ? ctr(days.slice(-5)) / first : 1
  }

  /** Account banned and the appeal failed → open a backup account and rebuild the campaign there. */
  function recoverAccount() {
    const camp = s.ads.campaigns.find(c => c.id === st.campaignId)
    const acc = camp && s.ads.accounts.find(a => a.id === camp.accountId)
    if (!camp || !acc || (acc.status !== 'restricted' && acc.status !== 'disabled')) return
    if (!acc.appealDenied && (acc.appeal || acc.status === 'restricted')) return // wait for the appeal
    if (!acc.appealDenied && !acc.appeal) { ads.startAppeal(s, acc.id); return }
    const working = s.ads.accounts.find(a => a.platform === 'fadbook' && a.status === 'active')
      ?? s.ads.accounts.find(a => a.id === (ads.openAccountBlocker(s, 'fadbook') ? ads.openAdAccount(s, 'fadbook', { rented: true }) : ads.openAdAccount(s, 'fadbook')))
    if (!working) return
    const copy = ads.copyCampaignToAccount(s, camp.id, working.id)
    if (!copy) return
    st.campaignId = copy
    st.adSetId = s.ads.adSets.find(x => x.campaignId === copy && x.status !== 'deleted')?.id ?? ''
    st.adByCreative = {}
    for (const ad of s.ads.ads.filter(a => a.adSetId === st.adSetId)) st.adByCreative[ad.creativeId] = ad.id
    const nb = s.ads.campaigns.find(c => c.id === copy)
    if (nb?.dailyBudget && nb.dailyBudget > 250) ads.updateCampaign(s, copy, { dailyBudget: 250 }) // new account = low limit, relearn
    bot.notes.push(`day ${today(s) + 1}: ${acc.status} ad account, appeal denied → moved the campaign to "${working.name}"`)
  }

  function manageAds(d: number) {
    if (!st.campaignId) return
    recoverAccount()
    handleSwaps()
    const camp = s.ads.campaigns.find(c => c.id === st.campaignId)
    if (!camp || camp.status === 'deleted') return
    const be = store.breakEven(s, st.spId)
    // 1) kill losers: spent > 2x break-even CPA with no reported purchases, or a proven money-loser
    for (const ad of liveAds()) {
      const t = ads.adTotals(ad)
      if (liveAds().length <= 1 || d - dayOf(ad.createdHour) < 2) continue
      const noSales = t.spend > 2 * be.breakEvenCpa && t.purchases === 0
      const loser = t.spend > 6 * be.breakEvenCpa && t.purchaseValue / t.spend < 0.8 * be.breakEvenRoas
      if (noSales || loser) {
        ads.setEntityStatus(s, 'ad', ad.id, 'paused')
        st.killed++
      }
    }
    // 2) scale winners: blended ROAS (Shopifly sales ÷ ad spend, last 3 days) above 1.3x break-even
    const last3 = { from: d - 3, to: d - 1 }
    let rev = 0, spend = 0
    for (let x = last3.from; x <= last3.to; x++) {
      rev += s.store.analytics.daily[x]?.totalSales ?? 0
      const p = s.finance.pnl[x]
      spend += (p?.adSpendFadbook ?? 0) + (p?.adSpendTiktak ?? 0)
    }
    const roas3 = spend > 0 ? rev / spend : 0
    const budget = camp.dailyBudget ?? 40
    const headroom = s.finance.cash + Math.max(0, s.finance.card.limit - s.finance.card.balance)
    if (spend > budget * 1.5 && roas3 > 1.3 * be.breakEvenRoas && d - st.lastScaleDay >= 1 && headroom > budget * 6) {
      ads.updateCampaign(s, camp.id, { dailyBudget: Math.round(budget * 1.2) })
      st.lastScaleDay = d
      st.scaled++
    } else if (spend > budget * 1.5 && roas3 < 1.05 * be.breakEvenRoas && budget > 40 && d - st.lastScaleDay >= 2) {
      // below break-even at this spend level: step back down to where it was profitable
      ads.updateCampaign(s, camp.id, { dailyBudget: Math.max(40, Math.round(budget * (roas3 < 0.8 * be.breakEvenRoas ? 0.7 : 0.8))) })
      st.lastScaleDay = d
      st.cuts++
    }
    // 3) creative refresh: 7-day frequency above 3 (or link CTR down 25%+ from its first week, the
    //    other classic fatigue signal) → brief a new angle/hook, swap it in when ready
    const tired = liveAds().filter(a => tiredness(a.id) >= 1)
    const live = liveAds().length
    const needFresh = (tired.length > 0 && live <= 5) || live < 2
    const inFlight = st.pendingRefresh.filter(id => s.creatives.creatives.find(c => c.id === id)?.status !== 'failed').length + st.swaps.length
    if (needFresh && inFlight === 0 && s.catalog.samplesOwned.includes(st.catalogId) && !s.player.queue.some(a => a.kind === 'film_creative')) {
      const def = market.getProduct(st.catalogId)
      const i = st.creatives.length
      // rotate hooks/formats that competitors prove work, and new angles
      const hook = st.hooks[i % st.hooks.length]
      const angles = NICHE_ANGLES[def.niche]
      const fmt = st.formats[(i + 1) % st.formats.length]
      const id = ads.orderCreative(s, {
        catalogId: st.catalogId, name: '', format: FORMATS[fmt].producers.includes('self') ? fmt : 'demo_video', hook, angle: angles[(i + 1) % angles.length],
        beats: beatsForHook(hook), hookText: market.hookTextFor(def, hook, i + 7), script: scriptFor(def), producer: 'self',
      })
      if (id) { st.creatives.push(id); st.pendingRefresh.push(id); st.refreshes++ }
    }
    // 4) budget sanity if the account can't bill: pay the ad balance
    for (const acc of s.ads.accounts) if (acc.status === 'payment_failed') ads.payAdBalance(s, acc.id)
  }

  /** Put finished creatives on the page gallery (demo video + UGC photos), like the editor's "your content" picker. */
  function syncMedia() {
    const sp = s.store.products.find(p => p.id === st.spId)
    if (!sp) return
    const ready = s.creatives.creatives.filter(c => c.catalogId === st.catalogId && c.status === 'ready')
    if (ready.length <= st.mediaSynced) return
    st.mediaSynced = ready.length
    const own = ready.slice(0, 3).map((c, i) => ({ id: `m_cr_${c.id}`, kind: (c.isVideo && i === 0 ? 'video' : i === 1 ? 'ugc_photo' : 'lifestyle') as 'video' | 'ugc_photo' | 'lifestyle', src: c.thumb, alt: c.name }))
    const supplier = sp.media.filter(m => m.kind === 'supplier').slice(0, 8 - own.length)
    store.updateProduct(s, sp.id, { media: [...supplier, ...own] })
  }

  return bot
}

// ---------------------------------------------------------------------------
// NOVICE PLAYER
// ---------------------------------------------------------------------------
function makeNovice(seed: number): Bot {
  const s = createNewGame({ playerName: 'Riley Rookie', difficulty: DIFFICULTY, seed })
  const rnd = mulberry32(seed ^ 0x5eed)
  const pickOne = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
  const st = { spId: '', catalogId: '', creativeId: '', campaignId: '', doubled: 0, launched: -1 }
  const bot: Bot = {
    name: 'NOVICE',
    s,
    rows: [],
    notes: [],
    eventLog: [],
    setup() {
      store.createStore(s, { name: 'Trendy Deals Hub' })
      store.installApp(s, 'dserz') // the AliExprez "Add to Shopifly (DSerz)" button
      st.catalogId = pickOne(s.catalog.available)
      st.spId = store.importProduct(s, st.catalogId)
      store.setProductStatus(s, st.spId, 'active')
      ads.openAdAccount(s, 'fadbook')
      const def = market.getProduct(st.catalogId)
      const format = pickOne(SUPPLIER_EDIT_FORMATS)
      const hook = pickOne(['problem_callout', 'pov', 'tiktak_made_me_buy', 'before_after', 'asmr', 'shock_stat', 'unboxing', 'us_vs_them', 'testimonial', 'gift_idea', 'life_hack', 'controversial', 'question'] as HookId[])
      const angle = pickOne(['pain_point', 'convenience', 'gift', 'social_proof', 'savings', 'aspirational', 'curiosity', 'health', 'time_saving', 'pet_love', 'parenting', 'self_care'] as AngleId[])
      st.creativeId = ads.orderCreative(s, {
        catalogId: st.catalogId, name: 'Ad 1', format, hook, angle, beats: ['hook', 'benefits', 'cta'],
        hookText: `HOT SALE ${def.name.toUpperCase()} 🔥🔥`, script: '', producer: 'supplier_edit',
      }) ?? ''
      const sp = s.store.products.find(p => p.id === st.spId)!
      bot.notes.push(`picked ${def.name} at the default ${usd(sp.price)}, page grade ${sp.grade?.score.toFixed(1)}, break-even ROAS ${store.breakEven(s, st.spId).breakEvenRoas}`)
    },
    hourly() {
      if (st.campaignId) return
      const c = s.creatives.creatives.find(x => x.id === st.creativeId)
      if (!c || c.status !== 'ready') return
      const def = market.getProduct(st.catalogId)
      const cid = ads.createCampaign(s, { platform: 'fadbook', name: 'Campaign 1', budgetMode: 'cbo', dailyBudget: 50 })
      if (!cid) return
      const set = ads.createAdSet(s, { campaignId: cid, name: 'Ad set 1', targeting: { type: 'broad' } })
      if (!set) return
      ads.createAd(s, { adSetId: set, name: 'Ad 1', creativeId: c.id, storeProductId: st.spId, primaryText: `${def.supplierTitle} BUY NOW!!!`, headline: def.name })
      st.campaignId = cid
      st.launched = today(s)
    },
    daily() {
      if (!st.campaignId) return
      const y = today(s) - 1
      const orders = s.store.analytics.daily[y]?.orders ?? 0
      const camp = s.ads.campaigns.find(c => c.id === st.campaignId)
      if (camp && orders > 0 && camp.dailyBudget) {
        ads.updateCampaign(s, camp.id, { dailyBudget: camp.dailyBudget * 2 })
        st.doubled++
      }
    },
    pickChoice(m) {
      return m.choices[0]?.id ?? 'ok'
    },
    summary() {
      const camp = s.ads.campaigns.find(c => c.id === st.campaignId)
      return [`budget doubled ${st.doubled}x (now ${usd(camp?.dailyBudget ?? 0)}/day), launched day ${st.launched + 1}`, ...adReport(s)]
    },
  }
  return bot
}

/** Per-ad lifetime diagnostics (what Ads Manager + Shopifly attribution show). */
function adReport(s: GameState): string[] {
  return s.ads.ads.map(ad => {
    const c = s.creatives.creatives.find(x => x.id === ad.creativeId)
    const t = ads.adTotals(ad)
    const m = ads.deriveMetrics(t)
    const trueRoas = t.spend > 0 ? t.trueRevenue / t.spend : 0
    return `ad ${ad.status.padEnd(6)} ${c ? `${c.producer}/${c.format}/${c.hook} q${c.quality.toFixed(2)} pow${c.scores?.power.fadbook.toFixed(2)}` : '?'}`
      + ` | spend ${usd(t.spend)} CPM ${m.cpm.toFixed(1)} CTR ${pct(m.ctrLink)} hook ${pct(m.hookRate, 0)} LPV ${t.lpv} buys ${t.truePurchases}`
      + ` CVR ${t.lpv ? pct(t.truePurchases / t.lpv) : '-'} ROAS ${trueRoas.toFixed(2)} (rep ${m.roas.toFixed(2)})`
  })
}

// ---------------------------------------------------------------------------
// Read-only API check: every query the UIs call during render must work on the
// frozen (immer) store state. Runs once on a deep-frozen copy of a live game.
// ---------------------------------------------------------------------------
function purityCheck(live: GameState): string[] {
  const s = freeze(structuredClone(live), true)
  const d = today(s)
  const sp = s.store.products[0]
  const ad = s.ads.ads[0]
  const set = s.ads.adSets[0]
  const cr = s.creatives.creatives.find(c => c.status === 'ready')
  const cb = s.store.chargebacks[0]
  const range = { from: d - 7, to: d - 1 }
  const checks: [string, () => unknown][] = [
    ['store.gradePage', () => sp && store.gradePage(s, sp)],
    ['store.breakEven', () => sp && store.breakEven(s, sp.id)],
    ['store.storeRange', () => store.storeRange(s, range)],
    ['store.storeSeries', () => store.storeSeries(s, 'totalSales', range)],
    ['store.effectiveLoadTime', () => sp && store.effectiveLoadTime(s, sp)],
    ['store.sectionAvailability', () => sp && store.sectionAvailability(s, sp, 'ugc_gallery')],
    ['store.realDeliveryWindow', () => sp && store.realDeliveryWindow(s, sp.catalogId)],
    ['store.chargebackRatio', () => store.chargebackRatio(s)],
    ['store.chargebackEvidencePreview', () => cb && store.chargebackEvidencePreview(s, cb.id)],
    ['store.generatePolicy', () => store.generatePolicy(s, 'shipping')],
    ['store.domainQuote', () => store.domainQuote(s, 'example-store.com')],
    ['ads.deliveryLabel', () => ad && ads.deliveryLabel(s, 'ad', ad.id)],
    ['ads.effectiveBudget', () => set && ads.effectiveBudget(s, 'adset', set.id)],
    ['ads.statsFor', () => set && ads.statsFor(s, 'adset', set.id, range)],
    ['ads.learningProgress', () => set && ads.learningProgress(s, set.id)],
    ['ads.wouldResetLearning', () => set && ads.wouldResetLearning(s, 'campaign', set.campaignId, 999)],
    ['ads.estimateDailyResults', () => ads.estimateDailyResults(s, 'fadbook', ads.DEFAULT_TARGETING, 50)],
    ['ads.creativeInsights', () => cr && ads.creativeInsights(s, cr.id)],
    ['ads.expectedCreativeQuality', () => ads.expectedCreativeQuality(s, 'self', 'demo_video')],
    ['ads.productionMinutes', () => ads.productionMinutes(s, 'self')],
    ['ads.openAccountBlocker', () => ads.openAccountBlocker(s, 'tiktak')],
    ['ads.organicPostBlocker', () => cr && sp && ads.organicPostBlocker(s, cr.id, sp.id)],
    ['ads.accountSpendLimit', () => s.ads.accounts[0] && ads.accountSpendLimit(s, s.ads.accounts[0].id)],
    ['ads.validateCreativeBrief', () => sp && ads.validateCreativeBrief(s, { catalogId: sp.catalogId, name: '', format: 'demo_video', hook: 'pov', angle: 'convenience', beats: ['hook'], hookText: 'x', script: '', producer: 'self' })],
    ['market.publicListing', () => sp && market.publicListing(s, sp.catalogId)],
    ['market.spyData', () => sp && market.spyData(s, sp.catalogId)],
    ['market.researchInsights', () => sp && market.researchInsights(s, sp.catalogId)],
    ['market.fulfillmentFor', () => sp && market.fulfillmentFor(s, sp.catalogId)],
    ['market.bulkQuote', () => sp && market.bulkQuote(s, sp.catalogId, 500, 'sea', 'bulk')],
    ['market.productAppeal', () => sp && market.productAppeal(s, sp.catalogId)],
    ['life.canDoActivity', () => life.canDoActivity(s, 'product_research')],
    ['life.activityDuration', () => life.activityDuration(s, 'film_creative')],
    ['life.apartmentEligibility', () => life.apartmentEligibility(s, 2)],
    ['life.promotionProgress', () => life.promotionProgress(s)],
    ['life.upcomingShifts', () => life.upcomingShifts(s)],
    ['life.moodFactors', () => life.moodFactors(s)],
    ['life.needsWarnings', () => life.needsWarnings(s)],
    ['life.selfShotQuality', () => life.selfShotQuality(s, 'demo_video')],
    ['life.income30', () => life.income30(s)],
    ['finance.cardSummary', () => finance.cardSummary(s)],
    ['finance.cardDueStatus', () => finance.cardDueStatus(s)],
    ['finance.taxEstimate', () => finance.taxEstimate(s, d)],
    ['finance.capitalOffer', () => finance.capitalOffer(s)],
    ['finance.creditIncreaseEligibility', () => finance.creditIncreaseEligibility(s, d)],
    ['finance.billsDueWithin', () => finance.billsDueWithin(s, d, 14)],
    ['events.analyzeBusiness', () => events.analyzeBusiness(s)],
    ['events.askCoach', () => events.askCoach(s)],
    ['events.onboardingInsight', () => events.onboardingInsight(s)],
    ['netWorth', () => netWorth(s)],
  ]
  const bad: string[] = []
  for (const [name, f] of checks) {
    try { f() } catch (e) { bad.push(`${name}: ${(e as Error).message.split('\n')[0]}`) }
  }
  return bad.length ? bad : [`all ${checks.length} queries OK`]
}

// ---------------------------------------------------------------------------
// Save round-trip: saves are JSON, which silently turns NaN/Infinity into null.
// Find any non-finite numbers in the live state, then keep simulating a
// JSON-restored copy for a few days to prove a loaded save still runs.
// ---------------------------------------------------------------------------
function saveRoundTrip(live: GameState): string {
  const bad: string[] = []
  const walk = (v: unknown, path: string) => {
    if (bad.length >= 5) return
    if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(`${path}=${v}`) }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`)
  }
  walk(live, 's')
  const copy = JSON.parse(JSON.stringify(live)) as GameState
  try {
    for (let i = 0; i < 24 * 5; i++) tickHour(copy)
  } catch (e) {
    return `LOADED SAVE CRASHED: ${(e as Error).message}`
  }
  return bad.length ? `NON-FINITE NUMBERS in state (lost on save): ${bad.join(', ')}` : 'save round-trip: JSON-restored copy simulated 5 more days cleanly'
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function run(bot: Bot) {
  const s = bot.s
  const t0 = Date.now()
  let seenSeq = ''
  const capture = () => {
    for (let i = s.notifications.length - 1; i >= 0; i--) {
      const n = s.notifications[i]
      if (n.id === seenSeq) break
      if (n.kind === 'critical' || n.kind === 'warning') bot.eventLog.push(`[${n.kind}] ${n.title.replace(/[\d$,.]+/g, '#')}`)
    }
    seenSeq = s.notifications[s.notifications.length - 1]?.id ?? seenSeq
  }
  bot.setup()
  resolveModals(bot)
  const endHour = s.time.hour + DAYS * 24
  let nextPrint = PRINT_EVERY
  while (s.time.hour < endHour) {
    tickHour(s)
    if (process.env.SMOKE_EVENTS) capture()
    resolveModals(bot)
    const h = hourOfDay(s.time.hour)
    const d = today(s)
    if (h === 0 && d > 0) {
      recordDay(bot, d - 1)
      if (process.env.SMOKE_DEBUG === bot.name) debugDay(bot, d - 1)
      if (d >= nextPrint) {
        console.log(`  [${bot.name.padEnd(9)}] ${periodLine(bot, d - PRINT_EVERY, d - 1)}`)
        nextPrint += PRINT_EVERY
      }
    }
    bot.hourly()
    if (h === 9) bot.daily()
    if (h === 12 && d === 90) bot.notes.push(saveRoundTrip(s))
    if (h === 12 && d === 60) {
      const res = purityCheck(s)
      const ok = res.length === 1 && res[0].endsWith('queries OK')
      bot.notes.push(ok ? `read-only API check on frozen day-60 state: ${res[0]}` : `READ-ONLY API VIOLATIONS on frozen state: ${res.join(' | ')}`)
    }
    resolveModals(bot)
  }
  return Date.now() - t0
}

function debugDay(bot: Bot, day: number) {
  const s = bot.s
  const a = s.store.analytics.daily[day]
  const camp = s.ads.campaigns[0]
  const acc = s.ads.accounts[0]
  const set = s.ads.adSets[0]
  const liveAds = s.ads.ads.filter(x => x.status === 'active')
  const spend = s.ads.ads.reduce((t, x) => t + (x.stats[day]?.spend ?? 0), 0)
  const trueRev = s.ads.ads.reduce((t, x) => t + (x.stats[day]?.trueRevenue ?? 0), 0)
  const src = Object.entries(a?.ordersBySource ?? {}).map(([k, v]) => `${k}:${v}`).join(' ')
  const ses = Object.entries(a?.sessionsBySource ?? {}).map(([k, v]) => `${k}:${Math.round(v as number)}`).join(' ')
  console.log(`    d${day + 1} budget ${camp?.dailyBudget ?? '-'} spend ${spend.toFixed(0)} adRev ${trueRev.toFixed(0)} acct ${acc?.status}/${acc ? Math.round(acc.quality) : '-'} learn ${set?.learning.state ?? '-'} live ${liveAds.map(x => `${x.review}${x.frequency ? ':' + x.frequency.toFixed(1) : ''}`).join(',')} | orders ${a?.orders ?? 0} [${src}] sess [${ses}] | cash ${s.finance.cash.toFixed(0)} card ${s.finance.card.balance.toFixed(0)}/${s.finance.card.limit} act ${s.player.activity?.kind ?? '-'} q${s.player.queue.length}`)
}

/** Where the money went (diagnostic): P&L totals vs. the balance-sheet change. */
function reconcile(bot: Bot): string[] {
  const s = bot.s
  const r = finance.rangePnl(s, 0, today(s))
  const biz = finance.businessProfit(r)
  const taxes = (s.finance.taxes.payments ?? []).reduce((a, x) => a + (x as { amount?: number }).amount! || 0, 0)
  const pendingPayouts = s.store.payouts.filter(p => p.status !== 'paid').reduce((a, p) => a + p.amount, 0)
  const reserves = (s.store.reserves ?? []).reduce((a: number, x: { amount?: number }) => a + (x.amount ?? 0), 0)
  const unbilled = s.ads.accounts.reduce((a, acc) => a + acc.unbilled, 0)
  // estimated taxes are paid from checking as personal spend, so they are already inside personalSpend
  const expected = DIFFICULTY_DEFS[DIFFICULTY].startingCash + biz + r.personalIncome - r.personalSpend - r.inventory
  return [
    `P&L: revenue ${usd(r.revenue)} refunds ${usd(r.refunds)} chargebacks ${usd(r.chargebacks)} cogs ${usd(r.cogs)} shipping ${usd(r.shipping)} ads ${usd(r.adSpendFadbook + r.adSpendTiktak)} fees ${usd(r.paymentFees)} apps ${usd(r.apps)} creatives ${usd(r.creatives)} staff ${usd(r.staff)} other ${usd(r.otherBusiness)} inventory ${usd(r.inventory)}`,
    `personal: income ${usd(r.personalIncome)} spend ${usd(r.personalSpend)} taxes paid ${usd(taxes)} (owed ${usd(s.finance.taxes.owed ?? 0)})`,
    `balance sheet: cash ${usd(s.finance.cash)} card ${usd(s.finance.card.balance)} store balance ${usd(s.store.pendingBalance)} payouts pending ${usd(pendingPayouts)} reserves ${usd(reserves)} unbilled ads ${usd(unbilled)} loans ${usd(s.finance.loans.reduce((a, l) => a + l.remaining, 0))}`,
    `net worth ${usd(netWorth(s))} vs start + P&L ${usd(expected)} (gap ${usd(netWorth(s) - expected)}, unbilled ad spend is not in the P&L yet)`,
  ]
}

function finalStats(bot: Bot) {
  const s = bot.s
  const sum = (k: keyof DayRow) => bot.rows.reduce((a, r) => a + (r[k] as number), 0)
  const rev = sum('revenue'), spend = sum('adSpend'), orders = sum('orders'), sessions = sum('sessions'), profit = sum('profit')
  const sp = s.store.products[0]
  const acc = s.ads.accounts[0]
  const wages = wagesFor(s, 0, DAYS)
  return {
    cash: s.finance.cash,
    card: s.finance.card.balance,
    netWorth: netWorth(s),
    revenue: rev,
    adSpend: spend,
    orders,
    roas: spend > 0 ? rev / spend : 0,
    // platform-reported purchase value lands with a delay but is credited to the delivery day, so read it from the ads
    reportedRoas: (() => {
      let v = 0, sp = 0
      for (const ad of s.ads.ads) { const x = ads.adTotals(ad); v += x.purchaseValue; sp += x.spend }
      return sp > 0 ? v / sp : 0
    })(),
    cvr: sessions > 0 ? orders / sessions : 0,
    profit,
    wages,
    grade: sp?.grade?.score ?? 0,
    price: sp?.price ?? 0,
    disputes: s.store.chargebacks.length,
    cbRatio: store.chargebackRatio(s, 30),
    openTickets: store.openTicketCount(s),
    account: acc ? `${acc.status} (quality ${Math.round(acc.quality)})` : 'none',
    creatives: s.creatives.creatives.filter(c => c.status === 'ready').length,
    best30: Math.max(0, ...bot.rows.slice(-30).map(r => r.revenue)),
    last30Rev: bot.rows.slice(-30).reduce((a, r) => a + r.revenue, 0),
    last30Profit: bot.rows.slice(-30).reduce((a, r) => a + r.profit, 0),
    skills: (['research', 'copywriting', 'creative', 'media_buying', 'operations'] as const).map(k => `${k.slice(0, 2)}${s.skills[k].level}`).join(' '),
    hidden: (() => { const d = sp ? market.findProduct(sp.catalogId) : undefined; return d ? `${d.archetype}, perceived ${usd(d.perceivedValue)}` : 'n/a' })(),
  }
}

function main() {
  console.log(`Dropship Tycoon smoke test — seed ${SEED}, ${DAYS} days, ${DIFFICULTY[0].toUpperCase()}${DIFFICULTY.slice(1)}\n`)
  const bots = [makeCompetent(SEED), makeNovice(SEED)]
  const times: number[] = []
  for (const bot of bots) {
    console.log(`${bot.name}`)
    times.push(run(bot))
    for (const n of bot.notes) console.log(`  · ${n}`)
    for (const n of bot.summary()) console.log(`  · ${n}`)
    if (process.env.SMOKE_RECON) for (const n of reconcile(bot)) console.log(`  $ ${n}`)
    if (process.env.SMOKE_EVENTS) {
      const counts = new Map<string, number>()
      for (const n of bot.eventLog) counts.set(n, (counts.get(n) ?? 0) + 1)
      for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ! ${v}x ${k}`)
    }
    console.log('')
  }
  const [a, b] = bots.map(finalStats)
  const rows: [string, (x: typeof a) => string][] = [
    ['Cash', x => usd(x.cash)],
    ['Card balance', x => usd(x.card)],
    ['Net worth', x => usd(x.netWorth)],
    ['Revenue (Shopifly)', x => usd(x.revenue)],
    ['Ad spend', x => usd(x.adSpend)],
    ['Orders', x => String(x.orders)],
    ['ROAS (Shopifly)', x => x.roas.toFixed(2)],
    ['ROAS (Fadbook-reported)', x => x.reportedRoas.toFixed(2)],
    ['Store CVR', x => pct(x.cvr)],
    ['Business profit', x => usd(x.profit)],
    ['Wages earned', x => usd(x.wages)],
    ['Last-30-day revenue', x => usd(x.last30Rev)],
    ['Last-30-day profit', x => usd(x.last30Profit)],
    ['Page grade / price', x => `${x.grade.toFixed(1)} / ${usd(x.price)}`],
    ['Chargebacks (30d ratio)', x => `${x.disputes} (${pct(x.cbRatio)})`],
    ['Open tickets', x => String(x.openTickets)],
    ['Ad account', x => x.account],
    ['Ready creatives', x => String(x.creatives)],
    ['Skills (re co cr me op)', x => x.skills],
    ['(hidden) product truth', x => x.hidden],
  ]
  console.log(`FINAL after ${DAYS} days`)
  console.log(`  ${''.padEnd(26)}${'COMPETENT'.padStart(28)}${'NOVICE'.padStart(28)}`)
  for (const [label, f] of rows) console.log(`  ${label.padEnd(26)}${f(a).padStart(28)}${f(b).padStart(28)}`)
  console.log(`\n  sim time: competent ${(times[0] / 1000).toFixed(1)}s, novice ${(times[1] / 1000).toFixed(1)}s`)
  const verdict = a.netWorth > b.netWorth ? 'competent player ahead' : 'NOVICE AHEAD (balance problem)'
  console.log(`  verdict: ${verdict} by ${usd(Math.abs(a.netWorth - b.netWorth))} net worth`)
}

main()
