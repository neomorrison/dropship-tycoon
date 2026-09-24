// ============================================================================
// Headless balance smoke test: two scripted players run 150 in-game days using
// only the public sim APIs + tickHour on a fresh createNewGame.
//
//   npx tsx scripts/smoke.ts            (default seed; also `npm run smoke`)
//   npx tsx scripts/smoke.ts 12345      (custom seed; both players share it)
//   npx tsx scripts/smoke.ts 12345 90   (custom seed and day count)
//
// Multi-seed balance sweep (one summary table per difficulty, SPEC §10 targets):
//   npx tsx scripts/smoke.ts --seeds 20                      seeds 1..20 on Normal
//   npx tsx scripts/smoke.ts --seeds 20 --difficulty all     chill + normal + realistic
//   npx tsx scripts/smoke.ts --seeds 101-130 --difficulty realistic
//   npx tsx scripts/smoke.ts --seeds 3,7,11 --days 90 --runs  (also one line per run)
// Flags: --seeds N | a-b | a,b,c   --difficulty chill|normal|realistic|all   --days N
//        --pick <catalogId>  force the competent player's product
//        --aov auto|on|off   competent AOV levers (bundle_offer + ReKonvert): auto = only for tickets < $40
//        --runs              print one line per seed in multi-seed mode
//        --top N             competent picks its #((seed-1) mod N) candidate (default 3 in sweeps, 1 otherwise)
//        --products N        competent runs at most N products (default 4; 1 = the old single-product player)
//        --novice-pixel off  novice skips the "Add Fadbook & Instaglam" setup step (no pixel)
//        --novice-pick popular  novice picks from AliExprez Bestsellers (weighted by 30-day orders) instead of uniformly
//        --only novice|competent  simulate just one player (faster tuning; the other's columns read 0)
// Env: SMOKE_DIFFICULTY=chill|realistic  other difficulty (same as --difficulty)
//      SMOKE_PICK=<catalogId>            same as --pick
//      SMOKE_DEBUG=COMPETENT|NOVICE      one diagnostic line per day for that player
//      SMOKE_EVENTS=1                    count warning/critical notifications
//      SMOKE_RECON=1                     P&L vs balance-sheet reconciliation
//      SMOKE_BAN=COMPETENT|NOVICE        daily account-restriction hazard + its drivers (when elevated)
//      SMOKE_PRODUCTS=1                  with SMOKE_DEBUG: one line per product every 5 days instead
//
// Built-in integration checks: a read-only API sweep on a deep-frozen day-60 state
// (UI selectors must never write), and a JSON save round-trip at day 90.
//
// COMPETENT: picks a product from public signals (rising orders, few advertisers,
// big Amazin price gap), builds a real product page (plus quantity breaks and a
// post-purchase upsell on tickets under $40), prices ~0.9x the Amazin anchor,
// films/briefs 4 fitting creatives, runs a $40/day CBO broad campaign and manages
// it daily like a media buyer: kills losers, scales ≤20% above 1.3x break-even ROAS
// only when cash flow can carry it, refreshes creatives on frequency/CTR decay and
// answers copycat waves with new creatives. From day ~55 it adds a product every
// ~30 days (up to 4), moves to the sourcing agent and US 3PL stock once volume
// allows, pays ads from checking, keeps a weekend cash buffer, raises its card limit.
// NOVICE: random product, supplier copy and default import price, one supplier-edit
// creative, $50/day broad, doubles the budget after any sale, never refreshes,
// never answers tickets. Does follow the on-screen setup checklists (DSerz + the
// Fadbook channel app, i.e. the pixel) and re-submits / replaces a rejected ad.
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
// diagnostics only (never used for bot decisions): the daily account-restriction hazard
import { accountBanRisk } from '../src/sim/ads/accounts'

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const ARGV = process.argv.slice(2)
function flag(name: string): string | undefined {
  const i = ARGV.indexOf(`--${name}`)
  if (i < 0) return undefined
  const v = ARGV[i + 1]
  return v == null || v.startsWith('--') ? '' : v
}
const POSITIONAL = ARGV.filter((a, i) => !a.startsWith('--') && !(i > 0 && ARGV[i - 1].startsWith('--') && ARGV[i - 1] !== '--runs'))
const SEED = Number(POSITIONAL[0] ?? 20260302) || 20260302
const DAYS = Math.max(10, Number(flag('days') ?? POSITIONAL[1] ?? 150) || 150)
const PRINT_EVERY = 15
const DIFFS = ['chill', 'normal', 'realistic'] as const
const diffArg = flag('difficulty') ?? process.env.SMOKE_DIFFICULTY ?? 'normal'
const DIFFICULTIES: Difficulty[] = diffArg === 'all' ? [...DIFFS] : [DIFFS.find(x => x === diffArg) ?? 'normal']
/** Difficulty of the run in progress (set per run in multi-seed mode). */
let DIFFICULTY: Difficulty = DIFFICULTIES[0]
const PICK = flag('pick') || process.env.SMOKE_PICK || undefined
const AOV = (['on', 'off', 'auto'] as const).find(x => x === flag('aov')) ?? 'auto'
/** novice follows the Shopifly/Fadbook setup checklists and connects the pixel (--novice-pixel off = strawman without it) */
const NOVICE_PIXEL = flag('novice-pixel') !== 'off'
/** --novice-pick popular: the novice clicks AliExprez "Bestsellers" (pick weighted by public 30-day orders) instead of a uniform pick */
const NOVICE_POPULAR = flag('novice-pick') === 'popular'
function parseSeeds(v: string | undefined): number[] | null {
  if (v == null || v === '') return null
  if (/^\d+$/.test(v) && Number(v) <= 500) return Array.from({ length: Number(v) }, (_, i) => i + 1)
  const range = v.match(/^(\d+)-(\d+)$/)
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])]
    return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
  }
  return v.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0)
}
const SEEDS = parseSeeds(flag('seeds'))
const MULTI = !!SEEDS && (SEEDS.length > 1 || DIFFICULTIES.length > 1)
const SHOW_RUNS = ARGV.includes('--runs')
/** --only novice|competent: simulate one player only (faster tuning loops; the other's rows read as zero) */
const ONLY = flag('only') === 'novice' || flag('only') === 'competent' ? flag('only') : undefined
/** competent player's product = candidate #((seed-1) mod TOP) of its ranking (skilled players differ on the final call) */
const TOP = Math.max(1, Number(flag('top') ?? (MULTI ? 3 : 1)) || 1)
/** how many products the competent player will run at most (it adds one every ~30 days from day 55) */
const MAX_PRODUCTS = Math.max(1, Number(flag('products') ?? 4) || 4)

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
interface DayRow {
  day: number; revenue: number; adSpend: number; orders: number; sessions: number; profit: number
  /** ad spend actually delivered that day (adSpend above is what the platforms billed) */
  spend: number
  /** 7-day frequency of that day's top-spending ad (what Ads Manager shows in the Frequency column) */
  topFreq: number
  /** that ad's spend that day */
  topSpend: number
  /** daily restriction probability of the ad accounts that delivered yesterday (diagnostic) */
  banHazard: number
  linkClicks: number
  impressions: number
  /** ad-attributed truth (what Shopifly's UTM report would show per ad): landing page views, purchases, revenue */
  lpv: number
  adPurchases: number
  adRevenue: number
}
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
  let spend = 0, linkClicks = 0, impressions = 0, topSpend = 0, topFreq = 0, lpv = 0, adPurchases = 0, adRevenue = 0
  for (const ad of s.ads.ads) {
    const st = ad.stats[day]
    if (!st) continue
    spend += st.spend
    linkClicks += st.linkClicks
    impressions += st.impressions
    lpv += st.lpv
    adPurchases += st.truePurchases
    adRevenue += st.trueRevenue
    if (st.spend > topSpend) {
      topSpend = st.spend
      let imps = 0, reach = 0
      for (let d = day - 6; d <= day; d++) { imps += ad.stats[d]?.impressions ?? 0; reach += ad.stats[d]?.reach ?? 0 }
      topFreq = reach > 0 ? imps / reach : 0
    }
  }
  let keep = 1
  for (const acc of s.ads.accounts) {
    if (acc.status !== 'active' || !(acc.yesterdaySpend && acc.yesterdaySpend > 0)) continue
    const r = accountBanRisk(s, acc)
    keep *= 1 - Math.min(0.5, r.p)
    if (process.env.SMOKE_BAN === bot.name && r.p > 0.0006) console.log(`    ban d${day + 1} p ${(r.p * 1000).toFixed(2)}‰ ${r.dominant} claim ${r.claim.toFixed(2)} cb ${pct(r.chargebackRatio)} honesty ${r.minHonesty.toFixed(2)} q ${Math.round(acc.quality)} failed ${acc.failedPayments ?? 0} age ${day - acc.createdDay}`)
  }
  bot.rows.push({
    day,
    revenue: snap?.revenue ?? 0,
    adSpend: snap?.adSpend ?? 0,
    orders: a?.orders ?? snap?.orders ?? 0,
    sessions: a?.sessions ?? 0,
    profit: dayProfit(s, day),
    spend, topFreq, topSpend, banHazard: 1 - keep, linkClicks, impressions, lpv, adPurchases, adRevenue,
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

/** One product the competent player runs: its page, creatives and Fadbook campaign. */
interface Line {
  spId: string
  catalogId: string
  campaignId: string
  adSetId: string
  creatives: string[] // ordered creative ids
  adByCreative: Record<string, string>
  pendingRefresh: string[] // creative ids ordered for a refresh
  swaps: string[] // refresh ads waiting for review before they replace a tired ad
  rereviewed: string[]
  hooks: HookId[]
  formats: FormatId[]
  briefsDone: number
  ugcOrdered: boolean
  launched: number
  addedDay: number
  lastScaleDay: number
  mediaSynced: number
  killed: number
  scaled: number
  cuts: number
  refreshes: number
  bulkOrders: number
  agent: boolean
}

function makeCompetent(seed: number): Bot {
  const s = createNewGame({ playerName: 'Casey Pro', difficulty: DIFFICULTY, seed })
  const lines: Line[] = []
  const st = { quitDay: -1, lastLaunchDay: -99, bankBilling: false, creditRaises: 0, lowWater: {} as Record<number, number> }
  /** money that can pay the next ad bill: checking + free card limit − ad spend not billed yet */
  const liquidity = () => s.finance.cash + Math.max(0, s.finance.card.limit - s.finance.card.balance) - s.ads.accounts.reduce((a, x) => a + x.unbilled, 0)
  /** lowest liquidity seen over the last `n` days (weekends without payouts are what break accounts) */
  const lowWater = (n: number) => { let m = Infinity; for (let x = today(s) - n; x <= today(s); x++) if (st.lowWater[x] != null) m = Math.min(m, st.lowWater[x]); return m }
  const totalBudget = () => lines.reduce((a, l) => a + (s.ads.campaigns.find(c => c.id === l.campaignId && c.status === 'active')?.dailyBudget ?? 0), 0)
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
      // policies, payments, domain
      const policies = { ...s.store.policies }
      for (const k of ['refund', 'shipping', 'privacy', 'terms'] as const) policies[k] = store.generatePolicy(s, k)
      policies.contact = 'support@northwindgoods.com · Mon–Fri 9am–5pm PT · replies within 24 hours'
      store.updateStoreSettings(s, { policies, payments: { ...s.store.payments, paypal: true } })
      const q = store.domainQuote(s, 'northwindgoods.com')
      if (q.ok) store.buyDomain(s, q.domain)
      ads.openAdAccount(s, 'fadbook')
      finance.setAutopay(s, 'full')
      const ranked = scoreCandidates(s)
      const forced = PICK ? ranked.find(c => c.id === PICK) : undefined
      const pick = forced ?? ranked[Math.min(ranked.length - 1, (Math.max(1, seed) - 1) % TOP)]
      bot.notes.push(`runner-ups: ${ranked.filter(c => c.id !== pick.id).slice(0, 3).map(c => `${market.getProduct(c.id).name} (${c.score.toFixed(2)})`).join(', ')}`)
      launchLine(pick)
    },
    hourly() {
      const h = hourOfDay(s.time.hour)
      const d0 = today(s)
      st.lowWater[d0] = Math.min(st.lowWater[d0] ?? Infinity, liquidity())
      delete st.lowWater[d0 - 15]
      // a failed ad charge: pay it as soon as the payout lands (checking notifications, not once a day)
      for (const acc of s.ads.accounts) if (acc.status === 'payment_failed' && s.finance.cash > acc.unbilled) ads.payAdBalance(s, acc.id)
      for (const line of lines) {
        // brief creatives as soon as the sample is in hand (one filming job queued at a time)
        if (line.briefsDone < 3 && s.catalog.samplesOwned.includes(line.catalogId) && !s.player.queue.some(a => a.kind === 'film_creative')) orderBrief(line, line.briefsDone, 'self')
        if (!line.ugcOrdered && s.catalog.samplesOwned.includes(line.catalogId)) {
          const def = market.getProduct(line.catalogId)
          const score = (c: GameState['creatives']['creators'][number]) => (c.niches.includes(def.niche) ? 1 : 0) + c.rating - 4 + (c.quality[0] + c.quality[1]) / 2 - c.pricePerVideo / 600
          const creators = s.creatives.creators.filter(c => c.pricePerVideo <= 320).sort((a, b) => score(b) - score(a))
          if (creators[0] && orderBrief(line, 3, 'ugc', creators[0].id)) line.ugcOrdered = true
        }
        // launch / extend the campaign as creatives become ready (any hour — like checking notifications)
        if (h >= 7 && h <= 22) launchOrExtend(line)
      }
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
      for (const line of lines) {
        manageAds(line, d)
        syncMedia(line)
        sourcingStep(line, d)
      }
      expand(d)
      cashStep(d)
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
      // Mineo is only needed for research: cancel it ~3 weeks after the last product launch
      if (market.spyToolActive(s) && d - st.lastLaunchDay >= 22) market.cancelSpyTool(s)
    },
    pickChoice(m) {
      return pickByPreference(m, ['appeal', 'verify', 'refresh', 'decline', 'help', 'go', 'pay', 'stay', 'accept', 'ok'])
    },
    summary() {
      const out = lines.map(l => {
        const def = market.getProduct(l.catalogId)
        const inv = s.catalog.inventory[l.catalogId]?.units ?? 0
        return `${def.name}: added day ${l.addedDay + 1}, ads launched day ${l.launched + 1}, killed ${l.killed}, scale-ups ${l.scaled}, cuts ${l.cuts}, refreshes ${l.refreshes}, fulfillment ${s.catalog.sourcing[l.catalogId]?.mode ?? 'dropship'}${l.bulkOrders ? ` (${l.bulkOrders} bulk orders, ${inv} units on hand)` : ''}`
      })
      out.push(`quit job ${st.quitDay >= 0 ? `day ${st.quitDay + 1}` : 'no'}, ad bills from checking: ${st.bankBilling ? 'yes' : 'no'}, credit-limit raises ${st.creditRaises} (limit ${usd(s.finance.card.limit)})`)
      return [...out, ...adReport(s)]
    },
  }

  // -------------------------------------------------------------------------
  // Product lines
  // -------------------------------------------------------------------------
  function launchLine(pick: CandidateScore) {
    const d = today(s)
    const def = market.getProduct(pick.id)
    bot.notes.push(`day ${d + 1}: picked ${def.name} (gap ${pick.gap.toFixed(2)}x, orders ${pick.orders}, growth ${pick.growth.toFixed(2)}, advertisers ${pick.advertisers}, rating ${pick.rating})`)
    market.startResearch(s, pick.id)
    market.orderSample(s, pick.id)
    const spId = store.importProduct(s, pick.id)
    const win = store.realDeliveryWindow(s, pick.id)
    const promise: [number, number] = [win[0], win[1] + 2]
    const anchor = def.amazonPrice ?? market.spyData(s, pick.id)?.competitorPrice ?? def.cogs * 4
    const price = round99(anchor * 0.9)
    const media = Array.from({ length: 6 }, (_, i) => ({ id: `m_sup_${pick.id}_${i}`, kind: 'supplier' as const, src: '', alt: `${def.name} — view ${i + 1}`, variant: i }))
    const sections = proSections(def, promise)
    // low tickets need AOV levers: quantity breaks (Bundlr) + a post-purchase upsell (ReKonvert)
    const aov = AOV === 'on' || (AOV === 'auto' && price < 40)
    if (aov) {
      for (const app of ['bundlr', 'rekonvert']) if (!s.store.apps.some(a => a.appId === app)) store.installApp(s, app)
      sections.push({
        id: 'bundle_offer', enabled: true,
        settings: { tiers: [{ qty: 1, discountPct: 0, label: 'Buy 1' }, { qty: 2, discountPct: 10, label: 'Buy 2, save 10%', badge: 'Most popular' }, { qty: 3, discountPct: 15, label: 'Buy 3, save 15%', badge: 'Best value' }] },
      })
    }
    store.updateProduct(s, spId, {
      title: proTitle(def),
      descriptionHtml: proDescription(def, promise),
      price,
      compareAtPrice: round99(Math.max(anchor * 1.15, price / 0.75)),
      media,
      sections,
      promisedDays: promise,
      productType: cap(def.niche),
      tags: [def.niche, 'bestseller'],
    })
    store.importReviews(s, spId, 60, 4)
    store.setProductStatus(s, spId, 'active')
    // what the top competitor ads use (Mineo), in order of engagement
    const hooks: HookId[] = []
    const formats: FormatId[] = []
    for (const a of market.spyData(s, pick.id)?.topAds ?? []) {
      if (a.hookId && !hooks.includes(a.hookId)) hooks.push(a.hookId)
      const f = formatIdByName(a.format)
      if (f && !formats.includes(f) && FORMATS[f].producers.includes('self')) formats.push(f)
    }
    if (!formats.length) formats.push('demo_video', 'ugc_testimonial')
    if (!hooks.length) hooks.push('problem_callout', 'pov', 'testimonial')
    lines.push({
      spId, catalogId: pick.id, campaignId: '', adSetId: '', creatives: [], adByCreative: {}, pendingRefresh: [], swaps: [], rereviewed: [],
      hooks, formats, briefsDone: 0, ugcOrdered: false, launched: -1, addedDay: d, lastScaleDay: -99, mediaSynced: 0,
      killed: 0, scaled: 0, cuts: 0, refreshes: 0, bulkOrders: 0, agent: false,
    })
    st.lastLaunchDay = d
    const sp = s.store.products.find(p => p.id === spId)!
    bot.notes.push(`  page grade ${sp.grade?.score.toFixed(1)} at ${usd(sp.price)} (anchor ${usd(anchor)}), break-even ROAS ${store.breakEven(s, spId).breakEvenRoas}${aov ? ', AOV levers: Bundlr quantity breaks (2 = -10%, 3 = -15%) + ReKonvert upsell' : ''}`)
  }

  /** Months 2–6: add the next product once the first one pays and cash allows (products burn out as copycats pile in). */
  function expand(d: number) {
    if (lines.length >= MAX_PRODUCTS || d < 55 || d - st.lastLaunchDay < 30) return
    let profit14 = 0
    for (let x = d - 14; x < d; x++) profit14 += dayProfit(s, x)
    if (profit14 <= 500 || lowWater(7) < 2500 + 2 * totalBudget()) return
    if (!market.spyToolActive(s)) { market.subscribeSpyTool(s); return } // research with Mineo first, pick tomorrow
    const taken = new Set(lines.map(l => l.catalogId))
    const next = scoreCandidates(s).find(c => !taken.has(c.id) && c.gap >= 2.5)
    if (next) launchLine(next)
  }

  /** Agent after 100 orders (if cheaper), US 3PL stock once a product sells steadily and cash allows. */
  function sourcingStep(line: Line, d: number) {
    const u = s.catalog.unlocks
    const src = s.catalog.sourcing[line.catalogId]?.mode ?? 'dropship'
    if (u.agent && !line.agent && src === 'dropship') {
      line.agent = true
      const quote = market.requestAgentQuote(s, line.catalogId)
      const now = market.landedCost(s, line.catalogId)
      const def = market.getProduct(line.catalogId)
      if (quote != null && quote * (1 + market.dutyPct(line.catalogId)) + 4.5 + 2.5 * Math.max(0, def.weightKg - 0.5) <= now * 1.05) market.setFulfillmentMode(s, line.catalogId, 'agent')
    }
    if (u.threePL && d >= 50) {
      const perDay = market.recentSales(s, line.catalogId, 7).units / 7
      const inv = s.catalog.inventory[line.catalogId]?.units ?? 0
      const pending = s.catalog.bulkOrders.filter(o => o.catalogId === line.catalogId && o.status !== 'received')
      const incoming = pending.reduce((a, o) => a + o.qty, 0)
      const cover = perDay > 0 ? (inv + incoming) / perDay : Infinity
      const def = market.getProduct(line.catalogId)
      // sea freight for ~60 days of sales whenever stock + stock on the water covers < 50 days (dropship/agent
      // keeps shipping meanwhile); a small air top-up only if the shelf would run dry before the boat lands
      let order: { qty: number; method: 'sea' | 'air' } | null = null
      if (perDay >= 12 && cover < 50) order = { qty: Math.max(def.moq, Math.round((perDay * 60) / 50) * 50), method: 'sea' }
      else if (perDay >= 12 && inv > 0 && inv / perDay < 12 && !pending.some(o => o.arriveDay - d <= 12)) order = { qty: Math.max(def.moq, Math.round((perDay * 20) / 50) * 50), method: 'air' }
      if (order) {
        const q = market.bulkQuote(s, line.catalogId, order.qty, order.method, 'bulk')
        // stock only with checking money that isn't needed for the next week of ad bills
        const adBudget = lines.reduce((a, l) => a + (s.ads.campaigns.find(c => c.id === l.campaignId)?.dailyBudget ?? 0), 0)
        if (q.ok && s.finance.cash - q.total > 7 * adBudget + 1000 && market.placeBulkOrder(s, line.catalogId, order.qty, order.method, 'bulk')) {
          line.bulkOrders++
          bot.notes.push(`day ${d + 1}: bulk order ${order.qty} × ${def.name} by ${order.method} (${usd(q.total)}, ${usd(q.landedUnit)}/unit landed, ~${Math.round(perDay)} units/day)`)
        }
      }
    }
    // keep the delivery promise honest with the route actually used (3PL stock, agent, or fallback to AliExprez)
    const sp = s.store.products.find(p => p.id === line.spId)
    if (sp) {
      const win = store.realDeliveryWindow(s, line.catalogId)
      const want: [number, number] = [win[0], win[1] + 2]
      if (!sp.promisedDays || sp.promisedDays[0] !== want[0] || sp.promisedDays[1] !== want[1]) {
        const sec = sp.sections.map(x => x.id === 'shipping_info' ? { ...x, settings: { ...x.settings, minDays: want[0], maxDays: want[1] } } : x)
        store.updateProduct(s, sp.id, { promisedDays: want, sections: sec })
      }
    }
  }

  /** Cash management: pay ads from checking once it can carry them, keep a buffer for bills, raise the card limit. */
  function cashStep(d: number) {
    const adBudget = lines.reduce((a, l) => a + (s.ads.campaigns.find(c => c.id === l.campaignId)?.dailyBudget ?? 0), 0)
    if (!st.bankBilling && s.finance.cash > Math.max(2500, 2 * adBudget)) {
      for (const acc of s.ads.accounts) acc.payWith = 'bank' // Fadbook Billing → payment method (what the UI does)
      st.bankBilling = true
    }
    // pay the card down with spare cash, keeping ~1.5 days of ad spend in checking
    const spare = s.finance.cash - Math.max(350, 1.5 * adBudget)
    if (spare > 50 && s.finance.card.balance > 0) finance.payCardBalance(s, Math.min(spare, s.finance.card.balance))
    if (finance.creditIncreaseEligibility(s, d).ok && finance.requestCreditIncrease(s).ok) st.creditRaises++
    // budget sanity if an account can't bill: pay the ad balance
    for (const acc of s.ads.accounts) if (acc.status === 'payment_failed') ads.payAdBalance(s, acc.id)
  }

  // -------------------------------------------------------------------------
  // Creatives & campaign
  // -------------------------------------------------------------------------
  function orderBrief(line: Line, i: number, producer: 'self' | 'ugc', creatorId?: string): string | null {
    const def = market.getProduct(line.catalogId)
    const hook = line.hooks[i % line.hooks.length]
    let format: FormatId = line.formats[i % line.formats.length]
    if (!FORMATS[format].producers.includes(producer)) format = producer === 'ugc' ? 'ugc_testimonial' : 'demo_video'
    if (producer === 'ugc' && FORMATS.ugc_testimonial.producers.includes('ugc')) format = line.formats.find(f => FORMATS[f].talking) ?? 'ugc_testimonial'
    const angles = NICHE_ANGLES[def.niche]
    const angle = angles[i % angles.length]
    const hookText = market.hookTextFor(def, hook, i)
    const id = ads.orderCreative(s, {
      catalogId: line.catalogId, name: '', format, hook, angle, beats: beatsForHook(hook), hookText, script: scriptFor(def), producer, creatorId: creatorId ?? null,
    })
    if (id) {
      line.creatives.push(id)
      line.briefsDone += producer === 'self' ? 1 : 0
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

  function launchOrExtend(line: Line) {
    const ready = line.creatives.map(id => s.creatives.creatives.find(c => c.id === id)).filter((c): c is Creative => !!c && c.status === 'ready')
    const def = market.getProduct(line.catalogId)
    if (!line.campaignId) {
      if (ready.length < 2 && !(ready.length >= 1 && today(s) - line.addedDay > 30)) return
      const cid = ads.createCampaign(s, { platform: 'fadbook', name: `${def.name} | CBO | Broad`, budgetMode: 'cbo', dailyBudget: 40 })
      if (!cid) return
      const setId = ads.createAdSet(s, { campaignId: cid, name: 'Broad US', targeting: { type: 'broad' } })
      if (!setId) return
      line.campaignId = cid
      line.adSetId = setId
      line.launched = today(s)
    }
    const copy = adCopy(def)
    for (const c of ready) {
      if (line.adByCreative[c.id]) continue
      const adId = ads.createAd(s, { adSetId: line.adSetId, name: c.name, creativeId: c.id, storeProductId: line.spId, ...copy, cta: 'shop_now' })
      if (adId) {
        line.adByCreative[c.id] = adId
        // a refresh replaces the most fatigued ad once the new one has passed review
        const ri = line.pendingRefresh.indexOf(c.id)
        if (ri >= 0) {
          line.pendingRefresh.splice(ri, 1)
          line.swaps.push(adId)
        }
      }
    }
  }

  /** Swap refreshed ads in (after approval); re-request review once on a rejection. */
  function handleSwaps(line: Line) {
    for (const adId of [...line.swaps]) {
      const ad = s.ads.ads.find(a => a.id === adId)
      if (!ad || ad.status !== 'active') { line.swaps.splice(line.swaps.indexOf(adId), 1); continue }
      if (ad.review === 'rejected') {
        if (!line.rereviewed.includes(adId)) { line.rereviewed.push(adId); ads.requestAdReview(s, adId) }
        else { ads.setEntityStatus(s, 'ad', adId, 'paused'); line.swaps.splice(line.swaps.indexOf(adId), 1) }
        continue
      }
      if (ad.review !== 'approved') continue
      line.swaps.splice(line.swaps.indexOf(adId), 1)
      const others = liveAds(line).filter(a => a.id !== adId)
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
  function liveAds(line: Line) {
    return s.ads.ads.filter(a => a.adSetId === line.adSetId && a.status === 'active' && a.review === 'approved')
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

  /** Account banned and the appeal failed → open a backup account and rebuild the campaigns there. */
  function recoverAccount(line: Line) {
    const camp = s.ads.campaigns.find(c => c.id === line.campaignId)
    const acc = camp && s.ads.accounts.find(a => a.id === camp.accountId)
    if (!camp || !acc || (acc.status !== 'restricted' && acc.status !== 'disabled')) return
    if (!acc.appealDenied && (acc.appeal || acc.status === 'restricted')) return // wait for the appeal
    if (!acc.appealDenied && !acc.appeal) { ads.startAppeal(s, acc.id); return }
    const working = s.ads.accounts.find(a => a.platform === 'fadbook' && a.status === 'active')
      ?? s.ads.accounts.find(a => a.id === (ads.openAccountBlocker(s, 'fadbook') ? ads.openAdAccount(s, 'fadbook', { rented: true }) : ads.openAdAccount(s, 'fadbook')))
    if (!working) return
    if (st.bankBilling) working.payWith = 'bank'
    const copy = ads.copyCampaignToAccount(s, camp.id, working.id)
    if (!copy) return
    line.campaignId = copy
    line.adSetId = s.ads.adSets.find(x => x.campaignId === copy && x.status !== 'deleted')?.id ?? ''
    line.adByCreative = {}
    for (const ad of s.ads.ads.filter(a => a.adSetId === line.adSetId)) line.adByCreative[ad.creativeId] = ad.id
    const nb = s.ads.campaigns.find(c => c.id === copy)
    if (nb?.dailyBudget && nb.dailyBudget > 250) ads.updateCampaign(s, copy, { dailyBudget: 250 }) // new account = low limit, relearn
    bot.notes.push(`day ${today(s) + 1}: ${acc.status} ad account, appeal denied → moved "${camp.name}" to "${working.name}"`)
  }

  function manageAds(line: Line, d: number) {
    if (!line.campaignId) return
    recoverAccount(line)
    handleSwaps(line)
    const camp = s.ads.campaigns.find(c => c.id === line.campaignId)
    if (!camp || camp.status === 'deleted') return
    const be = store.breakEven(s, line.spId)
    // 1) kill losers: spent > 2x break-even CPA with no reported purchases, or a proven money-loser
    for (const ad of liveAds(line)) {
      const t = ads.adTotals(ad)
      if (liveAds(line).length <= 1 || d - dayOf(ad.createdHour) < 2) continue
      const noSales = t.spend > 2 * be.breakEvenCpa && t.purchases === 0
      const loser = t.spend > 6 * be.breakEvenCpa && t.purchaseValue / t.spend < 0.8 * be.breakEvenRoas
      if (noSales || loser) {
        ads.setEntityStatus(s, 'ad', ad.id, 'paused')
        line.killed++
      }
    }
    // 2) scale winners: blended ROAS (this product's Shopifly sales ÷ Ads Manager spend) above 1.3x break-even.
    //    Window: last 3 days, stretched up to 7 until it holds ~12 orders (don't steer on 4 sales).
    //    Spend is what Ads Manager shows as delivered, not the card charges (those land in lumps).
    let rev = 0, spend = 0, orders = 0, days = 0
    for (let x = d - 1; x >= d - 7; x--) {
      const bp = s.store.analytics.daily[x]?.byProduct?.[line.spId]
      rev += lines.length === 1 ? s.store.analytics.daily[x]?.totalSales ?? 0 : bp?.sales ?? 0
      orders += lines.length === 1 ? s.store.analytics.daily[x]?.orders ?? 0 : bp?.orders ?? 0
      spend += ads.statsFor(s, 'campaign', camp.id, { from: x, to: x }).spend
      days++
      if (days >= 3 && orders >= 12) break
    }
    const roas = spend > 0 ? rev / spend : 0
    const budget = camp.dailyBudget ?? 40
    // cash discipline: only add budget the bank can carry through a payout-less weekend (lowest liquidity of the
    // last 7 days ≥ 1.5 days of total ad budget) and never right after a failed ad charge
    const failedRecently = s.ads.accounts.some(a => a.lastFailedPaymentDay != null && d - a.lastFailedPaymentDay <= 7)
    const cashOk = lowWater(7) > 1.5 * (totalBudget() + 0.2 * budget) && !failedRecently
    if (spend > budget * 0.5 * days && roas > 1.3 * be.breakEvenRoas && d - line.lastScaleDay >= 1 && cashOk) {
      ads.updateCampaign(s, camp.id, { dailyBudget: Math.floor(budget * 1.2) }) // ≤ 20%: no learning reset
      line.lastScaleDay = d
      line.scaled++
    } else if (budget > 40 && d - line.lastScaleDay >= 2 && (failedRecently && lowWater(3) < 0.5 * totalBudget())) {
      // ad bills are bouncing: step back 20% until cash flow catches up
      ads.updateCampaign(s, camp.id, { dailyBudget: Math.max(40, Math.round(budget * 0.8)) })
      line.lastScaleDay = d
      line.cuts++
    } else if (spend > budget * 0.5 * days && roas < 1.05 * be.breakEvenRoas && budget > 40 && d - line.lastScaleDay >= 2) {
      // below break-even at this spend level: step back down to where it was profitable
      ads.updateCampaign(s, camp.id, { dailyBudget: Math.max(40, Math.round(budget * (roas < 0.8 * be.breakEvenRoas ? 0.7 : 0.8))) })
      line.lastScaleDay = d
      line.cuts++
    }
    // 3) creative refresh: 7-day frequency above 3 (or link CTR down 25%+ from its first week, the
    //    other classic fatigue signal) → brief a new angle/hook, swap it in when ready
    const tired = liveAds(line).filter(a => tiredness(a.id) >= 1)
    const live = liveAds(line).length
    // copycat wave answered with "Out-create them": ship 2 new creatives this week
    const wave = s.events.active.find(e => e.kind === 'competitor_copy' && e.data?.catalogId === line.catalogId && e.data?.response === 'refresh' && d - e.startDay <= 7)
    const owed = wave ? 2 - s.creatives.creatives.filter(c => c.catalogId === line.catalogId && c.orderedHour >= wave.startDay * 24 && c.status !== 'failed').length : 0
    const needFresh = (tired.length > 0 && live <= 5) || live < 2 || owed > 0
    const inFlight = line.pendingRefresh.filter(id => s.creatives.creatives.find(c => c.id === id)?.status === 'in_production' || s.creatives.creatives.find(c => c.id === id)?.status === 'waiting_sample').length + line.swaps.length
    if (needFresh && (inFlight === 0 || (owed > 0 && inFlight < 2)) && s.catalog.samplesOwned.includes(line.catalogId) && !s.player.queue.some(a => a.kind === 'film_creative')) {
      const def = market.getProduct(line.catalogId)
      const i = line.creatives.length
      // rotate hooks/formats that competitors prove work, and new angles
      const hook = line.hooks[i % line.hooks.length]
      const angles = NICHE_ANGLES[def.niche]
      const fmt = line.formats[(i + 1) % line.formats.length]
      const id = ads.orderCreative(s, {
        catalogId: line.catalogId, name: '', format: FORMATS[fmt].producers.includes('self') ? fmt : 'demo_video', hook, angle: angles[(i + 1) % angles.length],
        beats: beatsForHook(hook), hookText: market.hookTextFor(def, hook, i + 7), script: scriptFor(def), producer: 'self',
      })
      if (id) { line.creatives.push(id); line.pendingRefresh.push(id); line.refreshes++ }
    }
  }

  /** Put finished creatives on the page gallery (demo video + UGC photos), like the editor's "your content" picker. */
  function syncMedia(line: Line) {
    const sp = s.store.products.find(p => p.id === line.spId)
    if (!sp) return
    const ready = s.creatives.creatives.filter(c => c.catalogId === line.catalogId && c.status === 'ready')
    if (ready.length <= line.mediaSynced) return
    line.mediaSynced = ready.length
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
  const st = { spId: '', catalogId: '', creativeId: '', campaignId: '', adSetId: '', adId: '', doubled: 0, launched: -1, rereviewed: false, remade: 0 }
  const HOOKS = ['problem_callout', 'pov', 'tiktak_made_me_buy', 'before_after', 'asmr', 'shock_stat', 'unboxing', 'us_vs_them', 'testimonial', 'gift_idea', 'life_hack', 'controversial', 'question'] as HookId[]
  const ANGLES = ['pain_point', 'convenience', 'gift', 'social_proof', 'savings', 'aspirational', 'curiosity', 'health', 'time_saving', 'pet_love', 'parenting', 'self_care'] as AngleId[]
  function orderSupplierEdit(name: string): string {
    const def = market.getProduct(st.catalogId)
    return ads.orderCreative(s, {
      catalogId: st.catalogId, name, format: pickOne(SUPPLIER_EDIT_FORMATS), hook: pickOne(HOOKS), angle: pickOne(ANGLES), beats: ['hook', 'benefits', 'cta'],
      hookText: `HOT SALE ${def.name.toUpperCase()} 🔥🔥`, script: '', producer: 'supplier_edit',
    }) ?? ''
  }
  const bot: Bot = {
    name: 'NOVICE',
    s,
    rows: [],
    notes: [],
    eventLog: [],
    setup() {
      store.createStore(s, { name: 'Trendy Deals Hub' })
      store.installApp(s, 'dserz') // the AliExprez "Add to Shopifly (DSerz)" button
      if (NOVICE_PIXEL) store.installApp(s, 'fadbook-channel') // Shopifly home setup guide: "Add Fadbook & Instaglam"
      if (NOVICE_POPULAR) {
        // what a beginner sees first: the Bestsellers row, i.e. a pick weighted by public 30-day orders
        const w = s.catalog.available.map(id => market.publicListing(s, id)?.orders30d ?? 0)
        let r = rnd() * w.reduce((a, b) => a + b, 0)
        st.catalogId = s.catalog.available.find((_, i) => (r -= w[i]) <= 0) ?? pickOne(s.catalog.available)
      } else st.catalogId = pickOne(s.catalog.available)
      st.spId = store.importProduct(s, st.catalogId)
      store.setProductStatus(s, st.spId, 'active')
      ads.openAdAccount(s, 'fadbook')
      const def = market.getProduct(st.catalogId)
      st.creativeId = orderSupplierEdit('Ad 1')
      const sp = s.store.products.find(p => p.id === st.spId)!
      bot.notes.push(`picked ${def.name} at the default ${usd(sp.price)}, page grade ${sp.grade?.score.toFixed(1)}, break-even ROAS ${store.breakEven(s, st.spId).breakEvenRoas}`)
    },
    hourly() {
      const def = market.getProduct(st.catalogId)
      if (st.campaignId) {
        // the one ad got rejected: ask for a review once, then make another supplier edit (even a beginner sees the red "Rejected")
        const ad = s.ads.ads.find(a => a.id === st.adId)
        if (ad?.review === 'rejected' && ad.status === 'active') {
          if (!st.rereviewed) { st.rereviewed = true; ads.requestAdReview(s, ad.id) }
          else if (st.remade < 2 && !s.creatives.creatives.some(c => c.id === st.creativeId && c.status !== 'ready')) {
            ads.setEntityStatus(s, 'ad', ad.id, 'paused')
            st.remade++
            st.rereviewed = false
            st.creativeId = orderSupplierEdit(`Ad ${st.remade + 1}`)
            st.adId = ''
          }
        }
        if (!st.adId) {
          const c = s.creatives.creatives.find(x => x.id === st.creativeId)
          if (c?.status === 'ready') st.adId = ads.createAd(s, { adSetId: st.adSetId, name: c.name, creativeId: c.id, storeProductId: st.spId, primaryText: `${def.supplierTitle} BUY NOW!!!`, headline: def.name }) ?? ''
        }
        return
      }
      const c = s.creatives.creatives.find(x => x.id === st.creativeId)
      if (!c || c.status !== 'ready') return
      const cid = ads.createCampaign(s, { platform: 'fadbook', name: 'Campaign 1', budgetMode: 'cbo', dailyBudget: 50 })
      if (!cid) return
      const set = ads.createAdSet(s, { campaignId: cid, name: 'Ad set 1', targeting: { type: 'broad' } })
      if (!set) return
      st.adId = ads.createAd(s, { adSetId: set, name: 'Ad 1', creativeId: c.id, storeProductId: st.spId, primaryText: `${def.supplierTitle} BUY NOW!!!`, headline: def.name }) ?? ''
      st.campaignId = cid
      st.adSetId = set
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
        if (!MULTI) console.log(`  [${bot.name.padEnd(9)}] ${periodLine(bot, d - PRINT_EVERY, d - 1)}`)
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
  if (process.env.SMOKE_PRODUCTS) {
    // one line per product: revenue, budget, competitors, appeal, fulfillment
    const a = s.store.analytics.daily[day]
    const parts = s.store.products.map(sp => {
      const bp = a?.byProduct?.[sp.id]
      const camp = s.ads.campaigns.find(c => c.status === 'active' && s.ads.ads.some(ad => ad.campaignId === c.id && ad.storeProductId === sp.id))
      return `${sp.title.slice(0, 14)} $${Math.round(bp?.sales ?? 0)} b${camp?.dailyBudget ?? '-'} c${s.catalog.market[sp.catalogId]?.competitors} a${market.productAppeal(s, sp.catalogId).toFixed(2)} ${s.catalog.sourcing[sp.catalogId]?.mode ?? 'dropship'}/${s.catalog.inventory[sp.catalogId]?.units ?? 0}`
    })
    if (day % 5 === 0) console.log(`    d${day + 1} cash ${Math.round(s.finance.cash)} card ${Math.round(s.finance.card.balance)}/${s.finance.card.limit} reserve ${s.store.hold?.reservePct ?? 0} | ${parts.join(' | ')}`)
    return
  }
  const a = s.store.analytics.daily[day]
  const camp = s.ads.campaigns[0]
  const acc = s.ads.accounts[0]
  const set = s.ads.adSets[0]
  const liveAds = s.ads.ads.filter(x => x.status === 'active')
  const spend = s.ads.ads.reduce((t, x) => t + (x.stats[day]?.spend ?? 0), 0)
  const trueRev = s.ads.ads.reduce((t, x) => t + (x.stats[day]?.trueRevenue ?? 0), 0)
  const src = Object.entries(a?.ordersBySource ?? {}).map(([k, v]) => `${k}:${v}`).join(' ')
  const ses = Object.entries(a?.sessionsBySource ?? {}).map(([k, v]) => `${k}:${Math.round(v as number)}`).join(' ')
  const cat = s.store.products[0]?.catalogId ?? ''
  const mk = s.catalog.market[cat]
  const adsTxt = liveAds.map(x => {
    const st = x.stats[day]
    return `${x.review === 'approved' ? '' : x.review + ':'}f${x.frequency?.toFixed(1) ?? '-'}/ctr${st && st.impressions ? (100 * st.linkClicks / st.impressions).toFixed(2) : '-'}/$${st ? st.spend.toFixed(0) : 0}`
  }).join(',')
  console.log(`    d${day + 1} budget ${camp?.dailyBudget ?? '-'} spend ${spend.toFixed(0)} adRev ${trueRev.toFixed(0)} acct ${acc?.status}/${acc ? Math.round(acc.quality) : '-'} learn ${set?.learning.state ?? '-'} live ${adsTxt} | orders ${a?.orders ?? 0} [${src}] sess [${ses}] | cash ${s.finance.cash.toFixed(0)} card ${s.finance.card.balance.toFixed(0)}/${s.finance.card.limit} appeal ${market.productAppeal(s, cat).toFixed(2)} comp ${mk?.competitors ?? '-'} hold ${s.store.hold?.reservePct ?? 0} act ${s.player.activity?.kind ?? '-'} q${s.player.queue.length}`)
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

// ---------------------------------------------------------------------------
// Multi-seed metrics (SPEC §10 balance targets)
// ---------------------------------------------------------------------------
interface RunMetrics {
  seed: number
  // novice
  nRoas90: number; nRoas: number; nLost90: boolean; nLost: boolean; nCtr: number; nCpc: number; nCvr: number; nPrice: number; nArch: string; nSpend: number
  /** novice paid funnel (ad-attributed truth, days 1-90): CPM, LPV → purchase CVR, AOV, ad-only ROAS, spend */
  nCpm: number; nPaidCvr: number; nAov: number; nAdRoas90: number; nSpend90: number
  // competent
  cProfit45: number; cProfit60: number; cProfit90: number; cProfit: number
  cRev90: number; cRev120: number; cRev150: number; cRevPeak: number; cProfitDay90: number
  cRoas: number; cNw: number; cFreq90: number; cFreqMax: number; cFreqAt1k: number; cFreqTop500: number; cBanP: number; cBans: number; cArch: string; cName: string; cPrice: number
}

const sumRows = (rows: DayRow[], k: keyof DayRow, from: number, to: number) =>
  rows.filter(r => r.day >= from && r.day <= to).reduce((a, r) => a + (r[k] as number), 0)
/** 7-day average of a row field ending at `day` (inclusive). */
const avg7 = (rows: DayRow[], k: keyof DayRow, day: number) => sumRows(rows, k, day - 6, day) / 7

function runMetrics(seed: number, comp: Bot, nov: Bot): RunMetrics {
  const c = comp.rows, n = nov.rows
  const last = DAYS - 1
  const d90 = Math.min(89, last)
  const nSpend90 = sumRows(n, 'spend', 0, d90), nSpend = sumRows(n, 'spend', 0, last)
  const nClicks = sumRows(n, 'linkClicks', 0, last), nImps = sumRows(n, 'impressions', 0, last)
  const nSessions = sumRows(n, 'sessions', 0, last), nOrders = sumRows(n, 'orders', 0, last)
  const nsp = nov.s.store.products[0], csp = comp.s.store.products[0]
  const nd = nsp ? market.findProduct(nsp.catalogId) : undefined
  const cd = csp ? market.findProduct(csp.catalogId) : undefined
  let peak = 0
  for (let d = 6; d <= last; d++) peak = Math.max(peak, avg7(c, 'revenue', d))
  // frequency of the top ad on days it spent real money ($100+/day)
  const scaled = c.filter(r => r.topSpend >= 100)
  let keep = 1
  for (const r of c) keep *= 1 - r.banHazard
  return {
    seed,
    nRoas90: nSpend90 > 0 ? sumRows(n, 'revenue', 0, d90) / nSpend90 : 0,
    nRoas: nSpend > 0 ? sumRows(n, 'revenue', 0, last) / nSpend : 0,
    nLost90: sumRows(n, 'profit', 0, d90) < 0,
    nLost: sumRows(n, 'profit', 0, last) < 0,
    nCtr: nImps > 0 ? nClicks / nImps : 0,
    nCpc: nClicks > 0 ? nSpend / nClicks : 0,
    nCvr: nSessions > 0 ? nOrders / nSessions : 0,
    nPrice: nsp?.price ?? 0,
    nArch: nd?.archetype ?? '-',
    nSpend,
    nCpm: sumRows(n, 'impressions', 0, d90) > 0 ? (1000 * nSpend90) / sumRows(n, 'impressions', 0, d90) : 0,
    nPaidCvr: sumRows(n, 'lpv', 0, d90) > 0 ? sumRows(n, 'adPurchases', 0, d90) / sumRows(n, 'lpv', 0, d90) : 0,
    nAov: sumRows(n, 'adPurchases', 0, d90) > 0 ? sumRows(n, 'adRevenue', 0, d90) / sumRows(n, 'adPurchases', 0, d90) : 0,
    nAdRoas90: nSpend90 > 0 ? sumRows(n, 'adRevenue', 0, d90) / nSpend90 : 0,
    nSpend90,
    cProfit45: sumRows(c, 'profit', 0, Math.min(44, last)),
    cProfit60: sumRows(c, 'profit', 0, Math.min(59, last)),
    cProfit90: sumRows(c, 'profit', 0, d90),
    cProfit: sumRows(c, 'profit', 0, last),
    cRev90: avg7(c, 'revenue', d90),
    cRev120: avg7(c, 'revenue', Math.min(119, last)),
    cRev150: avg7(c, 'revenue', last),
    cRevPeak: peak,
    cProfitDay90: avg7(c, 'profit', d90),
    cRoas: (() => { const sp = sumRows(c, 'spend', 0, last); return sp > 0 ? sumRows(c, 'revenue', 0, last) / sp : 0 })(),
    cNw: netWorth(comp.s),
    cFreq90: c.find(r => r.day === d90)?.topFreq ?? 0,
    cFreqMax: Math.max(0, ...scaled.map(r => r.topFreq)),
    cFreqAt1k: quantile(c.filter(r => r.spend >= 1000).map(r => r.topFreq), 0.5),
    cFreqTop500: quantile(c.filter(r => r.topSpend >= 500).map(r => r.topFreq), 0.5),
    cBanP: 1 - keep,
    cBans: Object.values(comp.s.ads.bans ?? {}).reduce((a, x) => a + (x ?? 0), 0),
    cArch: cd?.archetype ?? '-',
    cName: cd?.name ?? '-',
    cPrice: csp?.price ?? 0,
  }
}

function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0
  const v = [...xs].sort((a, b) => a - b)
  const i = (v.length - 1) * q
  const lo = Math.floor(i), hi = Math.ceil(i)
  return v[lo] + (v[hi] - v[lo]) * (i - lo)
}
const share = (xs: boolean[]) => (xs.length ? `${Math.round((100 * xs.filter(Boolean).length) / xs.length)}%` : '-')
function spread(xs: number[], f: (x: number) => string) {
  return `${f(quantile(xs, 0.5))} [${f(quantile(xs, 0.1))} – ${f(quantile(xs, 0.9))}]`
}

function summaryTable(diff: Difficulty, runs: RunMetrics[]) {
  const col = <K extends keyof RunMetrics>(k: K) => runs.map(r => r[k])
  const num = (k: keyof RunMetrics) => col(k) as number[]
  const f2 = (x: number) => x.toFixed(2)
  const lines: [string, string, string][] = [
    ['NOVICE ROAS, days 1-90 (Shopifly ÷ spend)', spread(num('nRoas90'), f2), '0.4-1.0 (task: 0.3-0.9)'],
    [`NOVICE ROAS, days 1-${DAYS}`, spread(num('nRoas'), f2), ''],
    ['NOVICE lost money by day 90', share(col('nLost90')), '>= 85%'],
    [`NOVICE lost money by day ${DAYS}`, share(col('nLost')), ''],
    ['NOVICE link CTR / CPC', `${spread(num('nCtr'), x => pct(x))} / ${spread(num('nCpc'), x => `$${x.toFixed(2)}`)}`, '0.5-0.8% / $1.5-3'],
    ['NOVICE store CVR (all sessions)', spread(num('nCvr'), x => pct(x)), ''],
    ['NOVICE CPM / paid CVR (LPV → buy), d1-90', `${spread(num('nCpm'), x => `$${x.toFixed(1)}`)} / ${spread(num('nPaidCvr'), x => pct(x))}`, '$12-20 / 0.6-1.5% (bad store)'],
    ['NOVICE ad-only ROAS / AOV, d1-90', `${spread(num('nAdRoas90'), f2)} / ${spread(num('nAov'), usd)}`, ''],
    ['NOVICE ad spend, days 1-90', spread(num('nSpend90'), usd), ''],
    ['NOVICE price', spread(num('nPrice'), x => usd(x)), ''],
    ['COMPETENT profitable by day 45 (cum.)', share(runs.map(r => r.cProfit45 > 0)), '>= 70% (Normal)'],
    ['COMPETENT profitable by day 60 (cum.)', share(runs.map(r => r.cProfit60 > 0)), ''],
    [`COMPETENT profitable by day ${DAYS} (cum.)`, share(runs.map(r => r.cProfit > 0)), '>= 60% (Realistic)'],
    ['COMPETENT revenue/day @ day 90 (7d avg)', spread(num('cRev90'), usd), '$500-2,000 (task: $1-3k)'],
    ['COMPETENT revenue/day @ day 120', spread(num('cRev120'), usd), ''],
    [`COMPETENT revenue/day @ day ${DAYS}`, spread(num('cRev150'), usd), 'higher by months 4-6'],
    ['COMPETENT peak 7d revenue/day', spread(num('cRevPeak'), usd), ''],
    ['COMPETENT profit/day @ day 90', spread(num('cProfitDay90'), usd), ''],
    [`COMPETENT business profit, ${DAYS} days`, spread(num('cProfit'), usd), ''],
    ['COMPETENT ROAS (Shopifly ÷ spend)', spread(num('cRoas'), f2), ''],
    [`COMPETENT net worth @ day ${DAYS}`, spread(num('cNw'), usd), ''],
    ['COMPETENT top-ad 7d freq @ day 90', spread(num('cFreq90'), f2), ''],
    ['COMPETENT top-ad 7d freq, days spend ≥ $1k', spread(num('cFreqAt1k'), f2), '~1.8-3 at $1-5k/day'],
    ['COMPETENT top-ad 7d freq, that ad ≥ $500/day', spread(num('cFreqTop500'), f2), ''],
    ['COMPETENT max top-ad 7d freq ($100+/day)', spread(num('cFreqMax'), f2), 'frequency > 3 rule reachable'],
    [`COMPETENT P(restricted) over ${DAYS}d, model`, `${spread(num('cBanP'), x => pct(x, 1))}`, '3-5% clean (Normal)'],
    ['COMPETENT accounts actually banned', `${share(runs.map(r => r.cBans > 0))} of runs`, ''],
  ]
  console.log(`\n=== ${diff.toUpperCase()} — ${runs.length} seeds (${runs[0]?.seed}…${runs[runs.length - 1]?.seed}), ${DAYS} days${PICK ? `, pick ${PICK}` : ''}${AOV !== 'auto' ? `, aov ${AOV}` : ''} ===`)
  console.log(`  ${'metric'.padEnd(44)}${'median [p10 – p90] / share'.padEnd(40)}target`)
  for (const [a, b, t] of lines) console.log(`  ${a.padEnd(44)}${b.padEnd(40)}${t}`)
  const byArch = new Map<string, number[]>()
  for (const r of runs) byArch.set(r.nArch, [...(byArch.get(r.nArch) ?? []), r.nRoas90])
  if (ONLY !== 'competent') console.log(`  novice ROAS d1-90 by product archetype (median, n): ${[...byArch].sort((a, b) => quantile(b[1], 0.5) - quantile(a[1], 0.5)).map(([k, v]) => `${k} ${quantile(v, 0.5).toFixed(2)} (${v.length})`).join(', ')}`)
  const arch = new Map<string, number>()
  for (const r of runs) arch.set(r.cArch, (arch.get(r.cArch) ?? 0) + 1)
  console.log(`  competent picks by archetype: ${[...arch].map(([k, v]) => `${k} ${v}`).join(', ')}`)
}

function runLine(r: RunMetrics): string {
  return `  seed ${String(r.seed).padStart(9)} | NOV ${r.nArch.padEnd(10)} ${usd(r.nPrice).padStart(4)} ROAS ${r.nRoas90.toFixed(2)} CTR ${pct(r.nCtr)} CPC $${r.nCpc.toFixed(2)} CPM $${r.nCpm.toFixed(0)} paidCVR ${pct(r.nPaidCvr)} adROAS ${r.nAdRoas90.toFixed(2)} spent ${usd(r.nSpend90)} profit? ${r.nLost ? 'lost' : 'WON '}`
    + ` | COMP ${r.cName.slice(0, 22).padEnd(22)} ${usd(r.cPrice).padStart(4)} p45 ${usd(r.cProfit45).padStart(7)} rev/d90 ${usd(r.cRev90).padStart(6)} d150 ${usd(r.cRev150).padStart(6)} profit ${usd(r.cProfit).padStart(8)} ROAS ${r.cRoas.toFixed(2)} f90 ${r.cFreq90.toFixed(2)} fmax ${r.cFreqMax.toFixed(2)} ban ${pct(r.cBanP, 1)}${r.cBans ? ` BANNED×${r.cBans}` : ''}`
}

function multiMain() {
  console.log(`Dropship Tycoon balance sweep — ${SEEDS!.length} seeds × ${DIFFICULTIES.join('/')}, ${DAYS} days\n`)
  const t0 = Date.now()
  const all: [Difficulty, RunMetrics[]][] = []
  for (const diff of DIFFICULTIES) {
    DIFFICULTY = diff
    const runs: RunMetrics[] = []
    for (const seed of SEEDS!) {
      const comp = makeCompetent(seed)
      const nov = makeNovice(seed)
      if (ONLY !== 'novice') run(comp)
      if (ONLY !== 'competent') run(nov)
      const m = runMetrics(seed, comp, nov)
      runs.push(m)
      if (SHOW_RUNS) console.log(`${diff.slice(0, 4)}${runLine(m)}`)
    }
    all.push([diff, runs])
  }
  for (const [diff, runs] of all) summaryTable(diff, runs)
  console.log(`\n  wall time ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}

function main() {
  console.log(`Dropship Tycoon smoke test — seed ${SEEDS?.[0] ?? SEED}, ${DAYS} days, ${DIFFICULTY[0].toUpperCase()}${DIFFICULTY.slice(1)}\n`)
  const seed = SEEDS?.[0] ?? SEED
  const bots = [makeCompetent(seed), makeNovice(seed)]
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

if (MULTI) multiMain()
else main()
