// Coach Kev: onboarding checklist (essential tips), daily diagnostics against BENCHMARKS,
// cash-crunch / CNY / dispute / ticket warnings, and on-demand askCoach() analysis.
// All analysis is a PURE read of state; only coachTickHour/coachDayRollover queue tips.
import type { GameState, Platform, SiteId, StoreProduct, TrafficSource } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { hourOfDay, monthOf, formatDate } from '../../core/time'
import { coachTip } from '../../core/notify'
import { cardAvailable } from '../../core/money'
import { money, pct } from '../../core/format'
import { deriveMetrics, platformStats, statsFor } from '../ads'
import { breakEven } from '../store'
import { findProduct, fulfillmentFor, marketHistory, publicListing, recentSales } from '../market'
import { upcomingCny } from './calendar'
import { today } from './util'

export interface Insight {
  id: string
  /** 0–100, higher = more urgent */
  priority: number
  text: string
  app?: SiteId
  path?: string
  essential?: boolean
}

const md = (d: number) => formatDate(d, 'md')
const f1 = (x: number) => (Math.round(x * 10) / 10).toString()
const pc = (x: number, d = 1) => pct(x, d)
const plat = (p: Platform) => (p === 'fadbook' ? 'Fadbook' : 'TikTak')
const adsetWord = (p: Platform) => (p === 'fadbook' ? 'ad set' : 'ad group')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function breakEvenFor(s: GameState, sp: StoreProduct): { cpa: number; roas: number; landed: number; margin: number } {
  const be = breakEven(s, sp.id)
  if (be.breakEvenCpa > 0 && Number.isFinite(be.breakEvenCpa)) return { cpa: be.breakEvenCpa, roas: be.breakEvenRoas, landed: be.landedCost, margin: be.margin }
  const f = fulfillmentFor(s, sp.catalogId)
  const fees = sp.price * BENCHMARKS.fees.plans.basic.cardPct + BENCHMARKS.fees.plans.basic.cardFixed
  const landed = f.unitCost + f.shipCost
  const margin = sp.price - landed - fees
  return { cpa: Math.max(0, margin), roas: margin > 0 ? sp.price / margin : Infinity, landed, margin }
}

interface StoreAgg { sessions: number; atc: number; checkout: number; converted: number; orders: number; sales: number; salesBySource: Partial<Record<TrafficSource, number>>; ordersBySource: Partial<Record<TrafficSource, number>> }
function storeAgg(s: GameState, from: number, to: number): StoreAgg {
  const out: StoreAgg = { sessions: 0, atc: 0, checkout: 0, converted: 0, orders: 0, sales: 0, salesBySource: {}, ordersBySource: {} }
  for (let d = Math.max(0, from); d <= to; d++) {
    const sd = s.store.analytics?.daily?.[d]
    if (!sd) continue
    out.sessions += sd.sessions
    out.atc += sd.atc
    out.checkout += sd.checkout
    out.converted += sd.converted
    out.orders += sd.orders
    out.sales += sd.totalSales
    for (const [k, v] of Object.entries(sd.salesBySource ?? {})) out.salesBySource[k as TrafficSource] = (out.salesBySource[k as TrafficSource] ?? 0) + (v ?? 0)
    for (const [k, v] of Object.entries(sd.ordersBySource ?? {})) out.ordersBySource[k as TrafficSource] = (out.ordersBySource[k as TrafficSource] ?? 0) + (v ?? 0)
  }
  return out
}

const tokens = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2))
function jaccard(a: string, b: string): number {
  const A = tokens(a)
  const B = tokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}
const hasApp = (s: GameState, id: string) => s.store.apps.some(a => a.appId === id)
const hasPixel = (s: GameState) => s.store.pixel?.fadbook?.installed || s.store.pixel?.tiktak?.installed || hasApp(s, 'fadbook-channel') || hasApp(s, 'tiktak-channel')
const readyCreatives = (s: GameState, catalogId: string) => s.creatives.creatives.filter(c => c.catalogId === catalogId && c.status === 'ready').length

// ---------------------------------------------------------------------------
// Onboarding checklist
// ---------------------------------------------------------------------------
export function onboardingInsight(s: GameState): Insight | null {
  const st = s.store
  if (!st.created) return { id: 'onb_store', priority: 100, essential: true, app: 'shopifly', text: "Welcome to the hustle! Step 1: open Shopifly on your computer and start the $1/month trial. Pick a brandable name — not \"BestDealz4U\". Shoppers buy from stores that look real." }
  if (!st.products.length) return { id: 'onb_product', priority: 100, essential: true, app: 'aliexprez', text: 'Step 2: find ONE product on AliExprez. What winners look like: orders climbing over the last two weeks, an Amazin price at least 3× your landed cost (item + shipping + ~30% import duty), and a rating of 4.6+. Spend an hour researching before you commit.' }
  if (!hasApp(s, 'dserz')) return { id: 'onb_dserz', priority: 100, essential: true, app: 'shopifly', path: 'apps', text: 'Step 3: install DSerz from the Shopifly App Store. Without it, every order sits there until you click "Fulfill" by hand — and late orders turn into refunds.' }
  const sp = st.products.find(x => x.status !== 'archived') ?? st.products[0]
  const p = findProduct(sp.catalogId)
  if (p && (sp.title.trim() === p.supplierTitle.trim() || jaccard(sp.title, p.supplierTitle) > 0.5)) {
    return { id: 'onb_title', priority: 100, essential: true, app: 'shopifly', path: `products/${sp.id}`, text: `Step 4: rewrite your product page. Your title is still the supplier's keyword soup ("${p.supplierTitle.slice(0, 40)}…"). Use a short benefit-led title, 5–8 images, 3–7 benefit bullets, an FAQ that answers real objections, and an honest delivery window.` }
  }
  if (p) {
    const be = breakEvenFor(s, sp)
    if (be.landed > 0 && sp.price < be.landed * 2.3) {
      return { id: 'onb_price', priority: 100, essential: true, app: 'shopifly', path: `products/${sp.id}`, text: `Your price (${money(sp.price)}) is only ${f1(sp.price / be.landed)}× your landed cost of ${money(be.landed)}. That leaves ${money(Math.max(0, be.cpa))} to acquire a customer — almost impossible with paid ads. Most winners sell at 3–4× landed, near what shoppers see on Amazin.` }
    }
  }
  const pol = st.policies
  if (!pol.refund || !pol.shipping || !pol.privacy || !pol.terms) {
    return { id: 'onb_policies', priority: 100, essential: true, app: 'shopifly', path: 'settings/policies', text: 'Add your refund, shipping, privacy and terms policies (Settings → Policies → "Create from template"). Missing policies kill trust and lose you chargeback disputes.' }
  }
  if (sp.status !== 'active') return { id: 'onb_publish', priority: 100, essential: true, app: 'shopifly', path: `products/${sp.id}`, text: `Your product "${sp.title}" is still a draft. When the page grade is 75+, set it to Active so ads have somewhere to send people.` }
  if (!hasPixel(s)) return { id: 'onb_pixel', priority: 100, essential: true, app: 'shopifly', path: 'apps', text: 'Install the Fadbook & Instaglam channel (or the TikTak channel) app — it adds the pixel. Without purchase data, the ad algorithm has no idea who your buyers are.' }
  const cat = sp.catalogId
  if (readyCreatives(s, cat) < 3 && !s.ads.campaigns.length) return { id: 'onb_creatives', priority: 100, essential: true, app: 'studio', text: `Make at least 3 creatives with DIFFERENT hooks before you launch (you have ${readyCreatives(s, cat)}). Only ~1 in 12–25 ads becomes a winner, so you need shots on goal. No sample yet? Edit supplier footage — or order a sample and film it yourself.` }
  if (!s.ads.campaigns.length) return { id: 'onb_ads', priority: 100, essential: true, app: 'fadbook', text: `Launch a test: one campaign at $30–50/day, broad targeting, 3+ ads, optimizing for purchases. Then leave it alone for 2–3 days. Kill an ad only after it spends ~2× your break-even CPA with no sale.` }
  if (s.finance.card.balance > 0 && s.finance.card.autopay !== 'full') return { id: 'onb_card', priority: 100, essential: true, app: 'bank', path: 'card', text: `Ad platforms bill your Chaise card every time you hit a spending threshold. Set autopay to the FULL statement balance in Chaise Bank — minimum payments rack up ~${Math.round(s.finance.card.apr * 100)}% APR interest, and a declined ad payment stops your ads.` }
  return null
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
export function analyzeBusiness(s: GameState): Insight[] {
  const out: Insight[] = []
  const day = today(s)
  const month = monthOf(day)
  const r3 = { from: day - 3, to: day - 1 }

  // ---- ad accounts ----
  for (const acc of s.ads.accounts) {
    if (acc.status === 'payment_failed') out.push({ id: `acct_pay_${acc.id}`, priority: 98, app: acc.platform, text: `Your ${plat(acc.platform)} payment failed — ALL delivery on that account is stopped. Free up card room (or switch the payment method) and pay the balance now.` })
    else if (acc.status === 'restricted' || acc.status === 'disabled') out.push({ id: `acct_ban_${acc.id}`, priority: 92, app: acc.platform, text: `Your ${plat(acc.platform)} ad account is ${acc.status}. Appeal it (30 min) and avoid health claims and before/after creatives while you wait.` })
  }

  // ---- per-ad diagnostics ----
  const cpmMonth = BENCHMARKS.seasonality.cpmByMonth[month]
  for (const ad of s.ads.ads) {
    if (ad.status !== 'active') continue
    const st = statsFor(s, 'ad', ad.id, r3)
    if (st.impressions < 800) continue
    const dm = deriveMetrics(st)
    const B = BENCHMARKS[ad.platform]
    const sp = s.store.products.find(x => x.id === ad.storeProductId)
    const cr = s.creatives.creatives.find(c => c.id === ad.creativeId)
    const name = `"${ad.name}"`
    if (sp) {
      const be = breakEvenFor(s, sp)
      if (be.cpa > 0) {
        const real = st.truePurchases
        const cpa = real > 0 ? st.spend / real : Infinity
        if (real === 0 && st.spend >= 2 * be.cpa) {
          out.push({ id: `kill_${ad.id}`, priority: 85, app: ad.platform, text: `Ad ${name} spent ${money(st.spend)} in 3 days with zero real sales — that's ${f1(st.spend / be.cpa)}× your break-even CPA of ${money(be.cpa)}. Kill it and move the budget to a new hook.` })
          continue
        }
        if (real > 0 && cpa > 1.5 * be.cpa && st.spend >= 2 * be.cpa) {
          out.push({ id: `cpa_${ad.id}`, priority: 80, app: ad.platform, text: `Ad ${name}: real CPA ${money(cpa)} vs break-even ${money(be.cpa)} (${real} Shopifly orders on ${money(st.spend)} spend). It loses money on every sale — pause it or fix the page.` })
        } else if (real >= 3 && cpa <= 0.8 * be.cpa) {
          const step = ad.platform === 'fadbook' ? '~20% per day' : 'up to 30% every 48 hours'
          out.push({ id: `scale_${ad.id}`, priority: 72, app: ad.platform, text: `Ad ${name} is a winner: real CPA ${money(cpa)} vs break-even ${money(be.cpa)} (${real} orders in 3 days). Scale its ${adsetWord(ad.platform)} ${step} — bigger jumps reset learning. Or duplicate it into a new ${adsetWord(ad.platform)}.` })
        }
      }
    }
    if (st.impressions >= 3000 && dm.ctrLink < B.ctrLink.bad) {
      out.push({ id: `ctr_${ad.id}`, priority: 62, app: ad.platform, text: `Ad ${name} link CTR is ${pc(dm.ctrLink, 2)} on ${Math.round(st.impressions).toLocaleString('en-US')} impressions (weak below ${pc(B.ctrLink.bad)}, average ${pc(B.ctrLink.avg)}). People scroll past — test a new hook type or opening shot, not a new audience.` })
    }
    if (cr?.isVideo && st.impressions >= 2000) {
      if (ad.platform === 'fadbook') {
        const fb = BENCHMARKS.fadbook
        if (dm.hookRate < fb.hookRate.bad) out.push({ id: `hook_${ad.id}`, priority: 58, app: 'studio', text: `Ad ${name} hook rate is ${pc(dm.hookRate)} (under ${pc(fb.hookRate.bad)} = the first 3 seconds don't stop the scroll; ${pc(fb.hookRate.good)}+ is good). Re-cut the opening: show the result or the problem in frame one.` })
        else if (dm.holdRate < fb.holdRate.bad) out.push({ id: `hold_${ad.id}`, priority: 52, app: 'studio', text: `Ad ${name} hooks people (${pc(dm.hookRate)}) but only ${pc(dm.holdRate)} keep watching to 15s (bad < ${pc(fb.holdRate.bad)}). Tighten the middle: demo sooner, cut the intro, add social proof.` })
      } else {
        const tt = BENCHMARKS.tiktak
        if (dm.hookRate < tt.view2sRate.bad) out.push({ id: `hook_${ad.id}`, priority: 58, app: 'studio', text: `Ad ${name} 2-second view rate is ${pc(dm.hookRate)} (weak below ${pc(tt.view2sRate.bad)}; ${pc(tt.view2sRate.good)}+ is good on TikTak). The opener isn't native enough — try a POV or a creator talking to camera.` })
        else if (dm.view6sRate < tt.view6sRate.bad) out.push({ id: `hold_${ad.id}`, priority: 52, app: 'studio', text: `Ad ${name} loses people after the hook: 6-second views ${pc(dm.view6sRate)} (bad < ${pc(tt.view6sRate.bad)}). Get to the demo faster.` })
      }
    }
    const fat = B.fatigueFrequency
    if (ad.frequency > fat + 0.5) {
      out.push({ id: `freq_${ad.id}`, priority: 60, app: 'studio', text: `Ad ${name} frequency is ${f1(ad.frequency)} (fatigue starts ≈${f1(fat)} on ${plat(ad.platform)}). The same people keep seeing it — CTR will slide and CPA will climb. Launch 2–3 fresh creatives for this product.` })
    }
    const normalCpm = B.cpmBase * cpmMonth
    if (st.impressions >= 3000 && dm.cpm > 2 * normalCpm) {
      const comp = sp ? s.catalog.market[sp.catalogId]?.competitors ?? 0 : 0
      out.push({ id: `cpm_${ad.id}`, priority: 50, app: ad.platform, text: `Ad ${name} is paying ${money(dm.cpm)} CPM — about ${f1(dm.cpm / normalCpm)}× normal for ${formatDate(day, 'md').split(' ')[0]}. Usual causes: a narrow audience, low engagement (weak creative), or a crowded product (${comp} stores advertising it).` })
    }
  }

  // ---- learning resets ----
  for (const as of s.ads.adSets) {
    if (as.status !== 'active') continue
    const changed = as.lastBudgetChangeHour
    if (changed !== undefined && s.time.hour - as.learning.resetHour < 24 && Math.abs(as.learning.resetHour - changed) <= 1) {
      const lim = BENCHMARKS[as.platform].significantBudgetChange
      out.push({ id: `learn_${as.id}_${as.learning.resetHour}`, priority: 55, app: as.platform, text: `You changed the budget on ${adsetWord(as.platform)} "${as.name}" by more than ${pc(lim, 0)} — that restarted the learning phase (costs usually jump for a few days). Scale in ≤${pc(lim, 0)} steps, or duplicate the ${adsetWord(as.platform)} instead.` })
    }
  }

  // ---- tracking vs reality (7 days) ----
  const r7 = { from: day - 7, to: day - 1 }
  const store7 = storeAgg(s, r7.from, r7.to)
  let spend7 = 0
  for (const p of ['fadbook', 'tiktak'] as Platform[]) {
    const ps = platformStats(s, p, r7)
    spend7 += ps.spend
    if (ps.truePurchases >= 5 && ps.purchases / ps.truePurchases >= 1.3) {
      out.push({ id: `attrib_${p}_${Math.floor(day / 7)}`, priority: 45, app: 'shopifly', path: 'analytics', text: `${plat(p)} reports ${Math.round(ps.purchases)} purchases this week, but Shopifly only has ${ps.truePurchases} real orders from those ads (${f1(ps.purchases / ps.truePurchases)}× over-reporting from view-through attribution). Budget off Shopifly numbers.` })
    }
  }
  if (spend7 >= 150) {
    const mer = store7.sales / spend7
    const actives = s.store.products.filter(x => x.status === 'active')
    const beRoas = actives.length ? Math.min(...actives.map(x => breakEvenFor(s, x).roas)) : 2
    out.push({
      id: `mer_${Math.floor(day / 7)}`, priority: mer < beRoas ? 70 : 35, app: 'shopifly', path: 'analytics',
      text: `Last 7 days: ${money(store7.sales)} revenue on ${money(spend7)} ad spend = MER ${f1(mer)} (break-even ≈ ${Number.isFinite(beRoas) ? f1(beRoas) : '—'}). ${mer < beRoas ? 'Overall you are losing money on ads — cut the worst ads before scaling anything.' : 'The business is buying customers profitably — scale what works, carefully.'}`,
    })
  }

  // ---- store funnel (3 days) ----
  const st3 = storeAgg(s, r3.from, r3.to)
  const SB = BENCHMARKS.store
  if (st3.sessions >= 250) {
    const atcRate = st3.atc / st3.sessions
    const cvr = st3.converted / st3.sessions
    const top = topTrafficProduct(s, r3.from, r3.to)
    const worst = top?.grade?.factors?.slice().sort((a, b) => a.score * a.weight - b.score * b.weight)[0]
    if (atcRate < SB.atcRate.bad) {
      out.push({ id: `atc_${day}`, priority: 66, app: 'shopifly', path: top ? `products/${top.id}` : 'products', text: `Only ${pc(atcRate)} of ${st3.sessions.toLocaleString('en-US')} visitors added to cart in 3 days (average ${pc(SB.atcRate.avg)}, good ${pc(SB.atcRate.good)}). The page, price or trust is failing${worst ? ` — biggest gap: ${worst.label} (${Math.round(worst.score)}/100). ${worst.tip}` : '.'}` })
    } else if (st3.atc > 0 && st3.converted / st3.atc < 0.22) {
      out.push({ id: `checkout_${day}`, priority: 64, app: 'shopifly', path: 'settings', text: `People add to cart (${pc(atcRate)}) but only ${pc(st3.converted / st3.atc, 0)} of them buy. That's a checkout problem: surprise shipping costs, a delivery promise that scares them, or missing payment options (Shopifly Pay/PayPel).` })
    } else if (cvr < SB.cvr.bad) {
      out.push({ id: `cvr_${day}`, priority: 60, app: 'shopifly', path: 'analytics', text: `Store conversion rate is ${pc(cvr, 2)} over ${st3.sessions.toLocaleString('en-US')} sessions (store average ${pc(SB.cvr.avg)}, top 20% ${pc(SB.cvr.good)}). Fix the page before buying more traffic.` })
    }
  }

  // ---- product pages & pricing ----
  for (const sp of s.store.products) {
    if (sp.status !== 'active') continue
    const p = findProduct(sp.catalogId)
    if (!p) continue
    const be = breakEvenFor(s, sp)
    const f = fulfillmentFor(s, sp.catalogId)
    if (be.landed > 0 && sp.price / be.landed < 2.3) {
      out.push({ id: `price_${sp.id}`, priority: 68, app: 'shopifly', path: `products/${sp.id}`, text: `"${sp.title}" sells at only ${f1(sp.price / be.landed)}× landed cost (${money(be.landed)}). Break-even ROAS is ${Number.isFinite(be.roas) ? f1(be.roas) : '∞'} — very hard on cold traffic. Test a higher price or a 2-pack bundle.` })
    }
    if (p.amazonPrice && sp.price > p.amazonPrice * 1.35) {
      out.push({ id: `anchor_${sp.id}`, priority: 56, app: 'shopifly', path: `products/${sp.id}`, text: `"${sp.title}" is ${money(sp.price)}, but shoppers can find it on Amazin for about ${money(p.amazonPrice)}. Much above ~1.3× the anchor, conversion falls off a cliff — or your page must clearly justify the premium.` })
    }
    if (!sp.promisedDays) {
      out.push({ id: `promise_${sp.id}`, priority: 54, app: 'shopifly', path: `products/${sp.id}`, text: `"${sp.title}" doesn't state a delivery window. Real delivery right now is ${f.shipDays[0]}–${f.shipDays[1]} days. Say so on the page — surprise waits become "where is my order?" tickets and chargebacks.` })
    } else if (sp.promisedDays[1] < f.shipDays[1] - 2) {
      out.push({ id: `honesty_${sp.id}`, priority: 82, app: 'shopifly', path: `products/${sp.id}`, text: `"${sp.title}" promises ${sp.promisedDays[0]}–${sp.promisedDays[1]} days, but orders really take ${f.shipDays[0]}–${f.shipDays[1]}${s.events.modifiers.dropshipDelayDays ? ` (+${s.events.modifiers.dropshipDelayDays} right now)` : ''}. Late orders trigger WISMO tickets and ~3× the chargebacks. Promise what you can deliver.` })
    }
    const g = sp.grade?.score
    if (g !== undefined && g < 60) {
      const worst = sp.grade?.factors?.slice().sort((a, b) => a.score * a.weight - b.score * b.weight)[0]
      out.push({ id: `grade_${sp.id}`, priority: 57, app: 'shopifly', path: `products/${sp.id}`, text: `"${sp.title}" page grade is ${Math.round(g)}/100 (it multiplies your conversion rate by ~${f1(sp.grade?.cvrMult ?? 1)}). ${worst ? `Start with ${worst.label}: ${worst.tip}` : 'Improve title, images, description and reviews.'}` })
    }
    const running = s.ads.ads.some(a => a.status === 'active' && a.storeProductId === sp.id)
    if (running && readyCreatives(s, sp.catalogId) < 3) {
      out.push({ id: `fewcreatives_${sp.id}`, priority: 48, app: 'studio', text: `You're advertising "${sp.title}" with fewer than 3 creatives. Winners are rare (~4–8% of ads) and every ad fatigues — keep 3–5 live and add 2 new ones a week.` })
    }
    const inv = s.catalog.inventory[sp.catalogId]
    if ((f.configuredMode === 'bulk' || f.configuredMode === 'private_label') && !f.inStock && (inv?.units ?? 0) <= 0) {
      out.push({ id: `stockout_${sp.catalogId}`, priority: 88, app: 'aliexprez', path: 'business', text: `"${sp.title}" is out of stock at your 3PL — orders are falling back to ${f.shipDays[0]}–${f.shipDays[1]}-day AliExprez shipping while your page promises fast delivery. Reorder (air freight if urgent) or update the delivery promise now.` })
    }
  }

  // ---- operations ----
  const openTickets = s.store.tickets.filter(t => t.status === 'open')
  if (openTickets.length) {
    const soonest = Math.min(...openTickets.map(t => t.dueHour)) - s.time.hour
    if (openTickets.length >= 5 || soonest <= 8) {
      out.push({ id: `tickets_${day}`, priority: soonest <= 8 ? 84 : 65, app: 'shopifly', path: 'inbox', text: `${openTickets.length} support ticket${openTickets.length > 1 ? 's' : ''} waiting (oldest due in ${Math.max(0, Math.round(soonest))}h). Unanswered tickets escalate into refunds and chargebacks — work through the queue (1h ≈ 12 tickets) or hire a VA.` })
    }
  }
  const unfulfilled = s.store.orders.filter(o => o.fulfillment === 'unfulfilled' && o.fulfilledBy === 'dropship' && s.time.hour - o.hour >= 24).length
  if (unfulfilled > 0 && !hasApp(s, 'dserz')) {
    out.push({ id: `unfulfilled_${day}`, priority: 86, app: 'shopifly', path: 'orders', text: `${unfulfilled} order${unfulfilled > 1 ? 's are' : ' is'} over a day old and still unfulfilled. Install DSerz to auto-fulfill — every day of delay adds to delivery time and "where is my order?" tickets.` })
  }
  const needsResp = s.store.chargebacks.filter(c => c.status === 'needs_response')
  if (needsResp.length) {
    const soon = Math.min(...needsResp.map(c => c.respondByDay)) - day
    out.push({ id: `disputes_${day}`, priority: soon <= 2 ? 93 : 74, app: 'shopifly', path: 'disputes', text: `${needsResp.length} chargeback${needsResp.length > 1 ? 's need' : ' needs'} a response (next deadline in ${Math.max(0, soon)} day${soon === 1 ? '' : 's'}). Miss it and you lose automatically — submit tracking, delivery proof and your policies.` })
  }
  const orders30 = storeAgg(s, day - 30, day - 1).orders
  const disputes30 = s.store.chargebacks.filter(c => c.openedDay >= day - 30).length
  if (orders30 >= 40 && disputes30 > 0) {
    const ratio = disputes30 / orders30
    const CB = BENCHMARKS.chargebacks
    if (ratio >= CB.warnRatio * 0.8) {
      out.push({ id: `cbratio_${Math.floor(day / 3)}`, priority: ratio >= CB.thresholdRatio ? 95 : 76, app: 'shopifly', path: 'disputes', text: `Chargeback ratio is ${pc(ratio, 2)} (${disputes30} disputes / ${orders30} orders in 30 days). Above ${pc(CB.warnRatio, 2)} processors flag you; above ${pc(CB.thresholdRatio, 0)} payouts get held. Refund unhappy customers before they call their bank and stop over-promising delivery.` })
    }
  }

  // ---- cash ----
  const card = s.finance.card
  const util = card.limit > 0 ? card.balance / card.limit : 0
  const pendingPayouts = s.store.payouts.filter(p => p.status !== 'paid')
  const pendingAmt = pendingPayouts.reduce((a, p) => a + p.amount, 0)
  if (util >= 0.8) {
    const nextPayout = pendingPayouts.length ? Math.min(...pendingPayouts.map(p => p.arriveDay)) : null
    const payNow = Math.max(0, Math.min(s.finance.cash - 150, card.balance - card.limit * 0.5))
    out.push({
      id: `card_${day}`, priority: util >= 0.95 ? 90 : 78, app: 'bank',
      text: `Your card is at ${pc(util, 0)} of its limit (${money(card.balance)} / ${money(card.limit)}; ${money(cardAvailable(s))} left). The next ad bill could decline and stop delivery.${pendingAmt > 0 ? ` ${money(pendingAmt)} in Shopifly payouts is on the way${nextPayout !== null ? ` (next lands ${md(nextPayout)})` : ''}.` : ''}${payNow >= 50 ? ` Pay ~${money(payNow)} toward the card now.` : ' Slow down spend until payouts land.'}`,
    })
  }
  if (s.home.rentMonthly > 0 && s.home.rentDueDay - day <= 5 && s.home.rentDueDay >= day && s.finance.cash < s.home.rentMonthly) {
    out.push({ id: `rent_${s.home.rentDueDay}`, priority: 83, app: 'bank', text: `Rent (${money(s.home.rentMonthly)}) is due ${md(s.home.rentDueDay)} and you only have ${money(s.finance.cash)} in checking. Rent can't go on the card — keep enough cash back from ad spend.` })
  }

  // ---- Chinese New Year ----
  const w = upcomingCny(day)
  if (w && w.shutdownStart - day <= 45 && w.shutdownStart - day >= 0) {
    const sellers = Object.keys(s.catalog.sales ?? {}).filter(id => {
      const mode = s.catalog.sourcing[id]?.mode ?? 'dropship'
      return (mode === 'dropship' || mode === 'agent') && recentSales(s, id, 14).units > 0
    })
    if (sellers.length) {
      const id = sellers.sort((a, b) => recentSales(s, b, 14).units - recentSales(s, a, 14).units)[0]
      const p = findProduct(id)
      const perDay = recentSales(s, id, 14).units / 14
      const units = Math.ceil(perDay * (w.backlogEnd - w.shutdownStart + 10))
      out.push({
        id: `cny_${w.year}_${Math.floor(day / 7)}`, priority: 67, app: 'aliexprez', path: 'business',
        text: `Chinese New Year: factories close ${md(w.shutdownStart)}–${md(w.shutdownEnd)}. ${p?.name ?? 'Your best seller'} sells ~${f1(perDay)}/day — to ride out the closure you'd need ~${units} units in a US warehouse${s.catalog.unlocks.threePL ? '' : ' (bulk orders unlock with a sourcing agent)'}. Otherwise lengthen your delivery promise by 2–3 weeks from ${md(w.shutdownStart)}.`,
      })
    }
  }

  // ---- needs ----
  const pl = s.player
  if (pl.energy < 18 && pl.activity?.kind !== 'sleep') out.push({ id: `tired_${day}`, priority: 44, text: `Energy ${Math.round(pl.energy)}/100. Everything takes ~35% longer when you're this tired, and at 0 you pass out (missing shifts). Sleep.` })
  if (pl.hunger < 18) out.push({ id: `hungry_${day}`, priority: 43, text: `Hunger ${Math.round(pl.hunger)}/100 — you're draining energy and mood every hour. Eat something (home food is $5).` })
  return out
}

function topTrafficProduct(s: GameState, from: number, to: number): StoreProduct | undefined {
  const sessions: Record<string, number> = {}
  for (let d = Math.max(0, from); d <= to; d++) {
    const bp = s.store.analytics?.daily?.[d]?.byProduct
    if (!bp) continue
    for (const [k, v] of Object.entries(bp)) sessions[k] = (sessions[k] ?? 0) + v.sessions
  }
  const best = Object.entries(sessions).sort((a, b) => b[1] - a[1])[0]
  if (!best) return s.store.products.find(p => p.status === 'active')
  return s.store.products.find(p => p.id === best[0] || p.catalogId === best[0])
}

// ---------------------------------------------------------------------------
// Stage guidance (fills askCoach when there's little data)
// ---------------------------------------------------------------------------
function stageTips(s: GameState): string[] {
  const tips: string[] = []
  const day = today(s)
  const onb = onboardingInsight(s)
  if (onb) tips.push(onb.text)
  if (!s.store.products.length) {
    // Public-signal screen: rising orders, strong Amazin anchor vs landed cost, good rating.
    const scored = s.catalog.available.map(id => {
      const p = findProduct(id)
      const l = publicListing(s, id)
      const h = marketHistory(s, id)
      if (!p || !l) return null
      const past = h.find(x => x.day >= day - 15)?.orders30d ?? l.orders30d
      const growth = past > 0 ? l.orders30d / past - 1 : 0
      const f = fulfillmentFor(s, id)
      const landed = f.unitCost + f.shipCost
      const anchor = p.amazonPrice ? p.amazonPrice / landed : 0
      const score = growth * 1.5 + Math.min(anchor, 5) / 3 + (l.rating - 4.4)
      return { p, l, growth, landed, anchor, score }
    }).filter((x): x is NonNullable<typeof x> => !!x && x.anchor >= 2.8 && x.l.rating >= 4.5).sort((a, b) => b.score - a.score).slice(0, 2)
    for (const c of scored) {
      tips.push(`Worth an hour of research: ${c.p.name} — ${Math.abs(c.growth) < 0.02 ? 'orders steady' : `orders ${c.growth > 0 ? 'up' : 'down'} ${Math.abs(Math.round(c.growth * 100))}%`} over two weeks, rated ${c.l.rating.toFixed(1)}★, Amazin price ${money(c.p.amazonPrice ?? 0)} vs ~${money(c.landed)} landed (${f1(c.anchor)}×). Check how many stores already advertise it before committing.`)
    }
  }
  const avail = s.finance.cash + cardAvailable(s)
  const testDays = Math.floor(avail / 40)
  tips.push(`Runway check: ${money(s.finance.cash)} cash + ${money(cardAvailable(s))} card room ≈ ${testDays} days of testing at $40/day. Plan for 2–3 product tests, not one — most products fail, and you need money left for the one that works.`)
  const [w0, w1] = BENCHMARKS.creatives.winnerRate
  tips.push(`Creative math: only ${pc(w0, 0)}–${pc(w1, 0)} of ads become winners, and each one fatigues within weeks. Growing stores ship 6–7 new creatives a week. Brief new hooks, not new colors of the same video.`)
  tips.push(`Cash flow: Shopifly pays out ${BENCHMARKS.fees.payoutBusinessDays} business days after a sale (a week for your first payout), while ad bills hit your card at every threshold. Keep at least a week of ad spend in reserve.`)
  tips.push(`Rules of thumb: link CTR ≥ ${pc(BENCHMARKS.fadbook.ctrLink.avg)} on Fadbook, hook rate ≥ ${pc(BENCHMARKS.fadbook.hookRate.avg, 0)}, store conversion ${pc(BENCHMARKS.store.cvr.avg)} is average and ${pc(BENCHMARKS.store.cvr.good)}+ is good. Kill an ad after ~2× break-even CPA with no sale; scale winners ~20% a day.`)
  return tips
}

/** On-demand analysis ("Ask Coach Kev"): 3–6 concrete, numbers-based tips. Pure. */
export function askCoach(s: GameState): string[] {
  const seen = new Set<string>()
  const ranked = analyzeBusiness(s).sort((a, b) => b.priority - a.priority)
  const out: string[] = []
  const onb = onboardingInsight(s)
  if (onb) {
    out.push(onb.text)
    seen.add(onb.text)
  }
  for (const i of ranked) {
    if (out.length >= 6) break
    if (seen.has(i.text)) continue
    seen.add(i.text)
    out.push(i.text)
  }
  if (out.length < 3) {
    for (const t of stageTips(s)) {
      if (seen.has(t)) continue
      seen.add(t)
      out.push(t)
      if (out.length >= 4) break
    }
  }
  return out.slice(0, 6)
}

// ---------------------------------------------------------------------------
// Tick hooks
// ---------------------------------------------------------------------------
/**
 * Other modules raise some diagnostics themselves (sim/ads/coach.ts, sim/store/coach.ts). Kev still
 * explains those on demand (askCoach), but doesn't push duplicates proactively.
 */
const COVERED_ELSEWHERE = ['ctr_', 'hook_', 'hold_', 'freq_', 'cpa_', 'kill_', 'learn_', 'acct_pay_', 'atc_', 'checkout_', 'cvr_', 'honesty_', 'tickets_', 'cbratio_']
/** Onboarding steps that other modules also nudge about (their tip ids). */
const ONBOARDING_EQUIVALENTS: Record<string, string[]> = {
  onb_dserz: ['store_no_dserz', 'store_no_dserz_import', 'store_created', 'store_dserz_removed'],
  onb_title: ['store_copied_title'],
  onb_pixel: ['store_no_pixel', 'ads_no_pixel_fadbook', 'ads_no_pixel_tiktak', 'ads_pixel_missing_fadbook', 'ads_pixel_missing_tiktak'],
  onb_policies: ['store_no_policies'],
}
function recentlyCovered(s: GameState, ids: string[] | undefined, hours: number): boolean {
  if (!ids) return false
  return ids.some(id => {
    const at = s.coach.shown[id]
    return (at !== undefined && s.time.hour - at < hours) || s.coach.queue.some(q => q.id === id)
  })
}

/** coachTip that never stacks duplicates of a tip still waiting in the bubble queue. */
function queueTip(s: GameState, id: string, text: string, o: Parameters<typeof coachTip>[3]): boolean {
  if (s.coach.queue.some(q => q.id === id)) return false
  return coachTip(s, id, text, o)
}

export function coachTickHour(s: GameState): void {
  const hod = hourOfDay(s.time.hour)
  const onb = onboardingInsight(s)
  // Drop onboarding bubbles for steps the player has already completed.
  const stale = (id: string) => id.startsWith('onb_') && id !== onb?.id
  if (s.coach.queue.some(q => stale(q.id))) s.coach.queue = s.coach.queue.filter(q => !stale(q.id))
  if (hod < 8 || hod > 22 || hod % 2 !== 0) return
  if (s.player.activity?.kind === 'sleep') return
  if (!onb || recentlyCovered(s, ONBOARDING_EQUIVALENTS[onb.id], 30)) return
  queueTip(s, onb.id, onb.text, { app: onb.app, path: onb.path, essential: true, cooldownHours: 30 })
}

export function coachDayRollover(s: GameState, _day: number): void {
  const ranked = analyzeBusiness(s)
    .filter(i => i.priority >= 40 && !COVERED_ELSEWHERE.some(pre => i.id.startsWith(pre)))
    .sort((a, b) => b.priority - a.priority)
  let queued = 0
  for (const i of ranked) {
    if (queued >= 2) break
    if (queueTip(s, i.id, i.text, { app: i.app, path: i.path, cooldownHours: i.priority >= 90 ? 24 : 72 })) queued++
  }
}

export function dismissCoachTip(s: GameState, id: string): void {
  s.coach.queue = s.coach.queue.filter(q => q.id !== id)
}
