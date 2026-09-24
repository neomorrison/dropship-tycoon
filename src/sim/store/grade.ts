// Page grader — the CRO skill check. gradePage() is pure: it reads state, never mutates.
// Weighted factors (SPEC §6) → score → cvrMult = 0.45 + 0.9·(score/100)^1.3,
// plus trust, honesty, load time, AOV multiplier and player-facing tips.
import type { GameState, PageGrade, PageGradeFactor, ProductDef, SectionId, StoreProduct } from '../../core/types'
import { sectionDef, sectionSettings } from '../../data/sections'
import { appDef } from '../../data/apps'
import { themeDef } from '../../data/themes'
import { money } from '../../core/format'
import { clamp } from '../../core/rng'
import {
  analyzeDescription, findSpam, objectionCovered, parsePromisedDays, stripHtml, titleContainment, titleSimilarity, words,
  contentSet, stem, isBenefitWord,
} from './text'
import { APP_SIM, defOf, fulfillment, hasApp, PAYMENT_LABELS, planFees, r2, sectionOf, sectionOn } from './util'

export const FACTOR_WEIGHTS = {
  title: 8, description: 16, media: 12, price: 14, compare_at: 4, social_proof: 12, trust: 10, offer: 8,
  urgency: 4, speed: 6, mobile: 4, shipping: 6, faq: 4, design: 6, variants: 2,
} as const
export type FactorKey = keyof typeof FACTOR_WEIGHTS
const LABELS: Record<FactorKey, string> = {
  title: 'Title', description: 'Description', media: 'Media', price: 'Price', compare_at: 'Compare-at price',
  social_proof: 'Social proof', trust: 'Trust', offer: 'Offer', urgency: 'Urgency', speed: 'Page speed',
  mobile: 'Mobile experience', shipping: 'Shipping promise', faq: 'FAQ', design: 'Design', variants: 'Variants',
}

export const cvrMultFromScore = (score: number) => 0.45 + 0.9 * Math.pow(clamp(score, 0, 100) / 100, 1.3)

// ---------------------------------------------------------------------------
// Section availability
// ---------------------------------------------------------------------------
export function hasUgcFor(s: GameState, p: StoreProduct): boolean {
  if (p.media.some(m => m.kind === 'ugc_photo')) return true
  const cs = s.creatives?.creatives ?? []
  return cs.some(c => c.catalogId === p.catalogId && c.status === 'ready' && (c.producer === 'ugc' || c.producer === 'self' || c.producer === 'staff'))
}

/** Can this section be used on this product page right now? */
export function sectionAvailability(s: GameState, p: StoreProduct | null, id: SectionId): { ok: boolean; reason?: string } {
  const def = sectionDef(id)
  const req = def.requires
  if (!req) return { ok: true }
  if (req.apps?.some(a => hasApp(s, a))) return { ok: true }
  if (req.themes?.includes(s.store.theme.id)) return { ok: true }
  if (req.ugc) {
    if (p && hasUgcFor(s, p)) return { ok: true }
    return { ok: false, reason: def.requirementText }
  }
  return { ok: false, reason: def.requirementText }
}
/** Section is enabled AND its requirement is met (a locked section renders nothing). */
export function sectionActive(s: GameState, p: StoreProduct, id: SectionId): boolean {
  return sectionOn(p, id) && sectionAvailability(s, p, id).ok
}

/** Sticky add-to-cart via section, theme built-in, or Vitalz. */
export function hasStickyAtc(s: GameState, p: StoreProduct): boolean {
  return sectionOn(p, 'sticky_atc') || !!themeDef(s.store.theme.id).builtIn.stickyAtc
}
export function hasTrustBadges(s: GameState, p: StoreProduct): boolean {
  return sectionActive(s, p, 'trust_badges') || !!themeDef(s.store.theme.id).builtIn.trustBadges
}
export function hasBundles(s: GameState, p: StoreProduct): boolean {
  return sectionActive(s, p, 'bundle_offer')
}

// ---------------------------------------------------------------------------
// Load time
// ---------------------------------------------------------------------------
/** Product-page load time (s): theme + app scripts + heavy sections + extra media − speed optimizer. */
export function effectiveLoadTime(s: GameState, p: StoreProduct): number {
  const th = themeDef(s.store.theme.id)
  let t = th.loadTime
  for (const a of s.store.apps) {
    const d = appDef(a.appId)
    if (d && d.loadTime > 0) t += d.loadTime
  }
  for (const sec of p.sections) if (sec.enabled && sectionAvailability(s, p, sec.id).ok) t += sectionDef(sec.id).loadCost
  t += Math.max(0, p.media.length - 8) * 0.05
  t += p.media.filter(m => m.kind === 'video').length * 0.05
  if (hasApp(s, 'swiftspeed')) t -= APP_SIM.swiftspeed
  if (s.staff?.members?.some(m => m.role === 'designer')) t -= 0.1
  return r2(Math.max(0.9, t))
}

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------
/** Price after the best active automatic discount (what the shopper actually sees at checkout). */
export function effectivePrice(s: GameState, p: StoreProduct): number {
  let best = p.price
  for (const d of s.store.discounts) {
    if (!d.active || !d.automatic) continue
    if (d.kind === 'percent') best = Math.min(best, p.price * (1 - clamp(d.value, 0, 90) / 100))
    else if (d.kind === 'fixed') best = Math.min(best, Math.max(0, p.price - d.value))
  }
  return r2(best)
}

/** Delivery window the page promises: explicit field, else shipping section, else description text. */
export function effectivePromise(p: StoreProduct): [number, number] | null {
  if (p.promisedDays) return p.promisedDays
  const sec = sectionOf(p, 'shipping_info')
  if (sec?.enabled) {
    const st = sectionSettings('shipping_info', sec.settings)
    if (st.minDays && st.maxDays && st.maxDays >= st.minDays) return [st.minDays, st.maxDays]
    const fromText = parsePromisedDays(st.text ?? '')
    if (fromText) return fromText
  }
  return parsePromisedDays(stripHtml(p.descriptionHtml))
}

/** Real delivery window for new orders (fulfillment route + CNY/backlog delays). */
export function realDeliveryWindow(s: GameState, catalogId: string): [number, number] {
  const f = fulfillment(s, catalogId)
  const extra = f.mode === 'dropship' || f.mode === 'agent' ? Math.max(0, s.events?.modifiers?.dropshipDelayDays ?? 0) : 0
  return [f.shipDays[0] + extra, f.shipDays[1] + extra]
}

// ---------------------------------------------------------------------------
// Grader
// ---------------------------------------------------------------------------
interface FR { score: number; tip: string; details: string[] }
const fr = (score: number, tip: string, details: string[] = []): FR => ({ score: clamp(Math.round(score), 0, 100), tip, details })

const FALLBACK_DEF: ProductDef = {
  id: '_unknown', name: 'Product', niche: 'home', archetype: 'solid', supplierTitle: '', supplierDescription: '', specs: {},
  variants: [], cogs: 10, shipCost: 3, shipDays: [15, 30], weightKg: 0.3, bulkCogs: 7, moq: 100, privateLabelCogs: 8,
  privateLabelMoq: 500, perceivedValue: 30, amazonPrice: null, baseDemand: 0.5, wow: 0.5, problemSolving: 0.5, impulse: 0.5,
  giftable: 0.3, repeatRate: 0, audience: { gender: 'all', ageMin: 18, ageMax: 65 }, platformFit: { fadbook: 0.7, tiktak: 0.7 },
  bestFormats: [], bestHooks: [], bestAngles: [], seasonality: Array(12).fill(1),
  trend: { kind: 'evergreen', emergeDay: 0, peakDay: 0, halfLifeDays: 9999 }, startSaturation: 0.2, startCompetitors: 5,
  defectRate: 0.05, claimRisk: 0, scaleCeiling: 500, keywords: [], objections: [],
  publicSignals: { ordersBase: 1000, rating: 4.5, reviews: 100, supplierYears: 3, choice: false }, releaseDay: 0, brandable: 0.5,
}

export function gradePage(s: GameState, p: StoreProduct): PageGrade {
  const d = defOf(p.catalogId) ?? FALLBACK_DEF
  const th = themeDef(s.store.theme.id)
  const st = s.store
  const desc = analyzeDescription(p.descriptionHtml, d)
  const tSim = d.supplierTitle ? titleSimilarity(p.title, d) : 0
  let honesty = 1
  const honestyNotes: string[] = []

  // FAQ text is part of how objections get answered
  const faqSec = sectionOf(p, 'faq')
  const faqItems = faqSec?.enabled ? sectionSettings('faq', faqSec.settings).items.filter(i => i.q.trim() && i.a.trim()) : []
  const faqText = faqItems.map(i => `${i.q} ${i.a}`).join('\n')
  const objections = d.objections.map(o => ({ text: o, covered: objectionCovered(o, `${desc.text}\n${faqText}`) }))

  const f: Record<FactorKey, FR> = {} as Record<FactorKey, FR>

  // ---- title ----
  {
    const title = p.title.trim()
    const det: string[] = []
    if (!title) f.title = fr(0, 'Your product has no title. Write a short, benefit-led name like "Pet Hair Remover Roller: Lifts Fur in One Swipe".', ['Title is empty'])
    else {
      let sc = 100
      const len = title.length
      const spam = findSpam(title, true)
      if (spam.length) {
        sc -= Math.min(50, 25 * spam.length)
        det.push(`Spam words: ${spam.join(', ')}`)
      }
      const letters = title.replace(/[^A-Za-z]/g, '')
      if (letters.length >= 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) {
        sc -= 30
        det.push('Written in ALL CAPS')
      }
      if (len < 15) { sc -= 35; det.push(`Only ${len} characters, too vague`) }
      else if (len < 25) { sc -= 12; det.push(`${len} characters, a little short (25–70 is ideal)`) }
      else if (len > 90) { sc -= 35; det.push(`${len} characters, far too long (25–70 is ideal)`) }
      else if (len > 70) { sc -= 15; det.push(`${len} characters, too long (25–70 is ideal)`) }
      const tset = contentSet(title)
      const nameSet = contentSet(d.name)
      const hasNoun = [...tset].some(w => nameSet.has(w))
      const kwStems = new Set(d.keywords.flatMap(k => words(k).map(stem)))
      const benefitHit = [...tset].some(w => kwStems.has(w) && !nameSet.has(w)) || words(title).some(w => isBenefitWord(w))
      if (!hasNoun && !benefitHit) { sc -= 25; det.push('Says neither what it is nor what it does') }
      else if (!benefitHit) { sc -= 10; det.push('Names the product but no benefit or outcome') }
      const contain = d.supplierTitle ? titleContainment(title, d) : 0
      if (tSim <= 0.5 && contain >= 0.9 && tset.size >= 6) { sc -= 20; det.push('Reads like a list of supplier keywords') }
      if (tSim > 0.5) {
        sc = Math.min(sc, 15 - Math.round((tSim - 0.5) * 20))
        det.unshift(`${Math.round(tSim * 100)}% the same as the supplier's AliExprez title`)
      }
      const tip = tSim > 0.5
        ? 'This is the supplier\'s keyword-stuffed AliExprez title. Shoppers recognize it instantly and it screams "dropshipped". Write your own: product name + main benefit, 25–70 characters, no "2026 New / Hot Sale".'
        : sc >= 85 ? 'Clear, benefit-led title. Nice.'
        : spam.length ? 'Remove the marketplace spam words. They make a store look like a reseller and hurt trust.'
        : len > 70 ? 'Trim the title to 25–70 characters. Lead with what it is, then the main benefit.'
        : 'Make the title say what it is and why it\'s better, e.g. "Cordless Spin Scrubber: Scrub Tiles Without Kneeling".'
      f.title = fr(sc, tip, det)
    }
  }

  // ---- description ----
  {
    const det: string[] = []
    let sc = 0
    const w = desc.words
    if (w >= 80 && w <= 400) sc += 20
    else if ((w >= 50 && w < 80) || (w > 400 && w <= 600)) sc += 12
    else if (w > 600) sc += 7
    else if (w >= 20) sc += 6
    if (w < 80) det.push(`${w} words, too thin (aim for 80–400)`)
    else if (w > 400) det.push(`${w} words, too long for mobile shoppers (aim for 80–400)`)
    if (desc.bullets >= 3 && desc.bullets <= 7) sc += 15
    else if (desc.bullets > 0 && desc.bullets < 3) { sc += 8; det.push(`Only ${desc.bullets} bullet point${desc.bullets === 1 ? '' : 's'} (3–7 is ideal)`) }
    else if (desc.bullets > 7 && desc.bullets <= 10) { sc += 8; det.push(`${desc.bullets} bullets, too many to scan (3–7)`) }
    else if (desc.bullets > 10) { sc += 4; det.push(`${desc.bullets} bullets reads like a spec sheet`) }
    else det.push('No bullet points: skimmers can\'t find the benefits')
    const nb = desc.benefitWords.length
    sc += nb >= 6 ? 15 : nb >= 4 ? 11 : nb >= 2 ? 6 : nb === 1 ? 3 : 0
    if (nb < 4) det.push(`Few benefit words (${nb}); it describes features, not outcomes`)
    if (desc.featureWords > Math.max(4, nb * 2)) { sc -= 5; det.push('Spec-sheet heavy (materials, sizes, "package includes")') }
    sc += desc.youCount >= 3 ? 10 : desc.youCount >= 1 ? 5 : 0
    if (desc.youCount < 3) det.push(desc.youCount ? 'Talk to the shopper more ("you", "your")' : 'Never addresses the shopper ("you", "your")')
    if (desc.paragraphs > 0) {
      if (desc.avgParagraphWords <= 45) sc += 8
      else if (desc.avgParagraphWords <= 70) { sc += 4; det.push('Paragraphs are long, so break them up') }
      else det.push('Wall of text: use short paragraphs')
    }
    if (desc.headings >= 2) sc += 8
    else if (desc.headings === 1) sc += 6
    else if (w >= 80) det.push('No headings to guide the eye')
    if (desc.mentionsGuarantee) sc += 8
    else det.push('No guarantee or return promise mentioned')
    if (desc.mentionsShipping) sc += 6
    else det.push('Doesn\'t say how shipping works')
    const covered = objections.filter(o => o.covered).length
    if (objections.length) {
      sc += 12 * (covered / objections.length)
      if (covered < objections.length) det.push(`Answers ${covered}/${objections.length} common buyer objections`)
    } else sc += 6
    if (desc.spamTerms.length) {
      sc -= Math.min(15, 4 * desc.spamTerms.length)
      det.push(`Supplier phrases: ${desc.spamTerms.slice(0, 4).join(', ')}`)
    }
    if (desc.claimTerms.length) {
      sc -= 10
      honesty -= 0.1
      honestyNotes.push('Medical/absolute claims in the description')
      det.push(`Risky claims: ${desc.claimTerms.join(', ')} (ads get rejected, customers dispute)`)
    }
    const sim = desc.supplierSimilarity
    if (sim >= 0.5) { sc = Math.min(sc, 12 - Math.round((sim - 0.5) * 16)); det.unshift(`${Math.round(sim * 100)}% copied from the supplier listing`) }
    else if (sim >= 0.25) { sc -= 25; det.unshift(`${Math.round(sim * 100)}% overlaps the supplier listing`) }
    else if (sim >= 0.12) { sc -= 10; det.unshift('Some sentences lifted from the supplier listing') }
    const tip = w === 0
      ? 'Empty description. Write ~150 words: a hook paragraph about the problem it solves, 3–7 benefit bullets, a short "how it works", and your guarantee and shipping promise.'
      : sim >= 0.5 ? 'This is the supplier\'s spec dump pasted in. Nobody buys from "Package Include: 1 x…". Rewrite it around the shopper: the problem, the outcome, 3–7 benefit bullets, and answers to their doubts.'
      : sc >= 80 ? 'Strong copy: scannable, benefit-led and it handles objections.'
      : w < 80 ? 'Too thin to sell. Expand to 80–400 words with benefit bullets and a guarantee.'
      : nb < 4 ? 'Lead with outcomes, not specs. Say what the shopper gets (saves time, no mess, finally…), and use "you".'
      : covered < objections.length ? 'Answer the doubts that stop people buying (does it work, is it safe, how long is shipping, what if I don\'t like it).'
      : 'Tighten the structure: short paragraphs, 3–7 bullets, an H3 heading or two, and mention the guarantee and shipping.'
    f.description = fr(sc, tip, det)
  }

  // ---- media ----
  {
    const n = p.media.length
    const kinds = { supplier: 0, lifestyle: 0, ugc_photo: 0, video: 0, gif: 0 }
    for (const m of p.media) kinds[m.kind]++
    const det: string[] = []
    let base = n === 0 ? 0 : n === 1 ? 20 : n === 2 ? 40 : n === 3 ? 60 : n === 4 ? 75 : n <= 8 ? 90 : n <= 12 ? 86 : 78
    const real = kinds.lifestyle + kinds.ugc_photo
    if (real >= 2) base += 10
    else if (real === 1) base += 6
    if (kinds.video + kinds.gif > 0) base += 8
    if (n > 0 && real === 0 && kinds.video + kinds.gif === 0) { base -= 12; det.push('Only supplier stock photos (the same ones every competitor uses)') }
    if (n < 5) det.push(`${n} image${n === 1 ? '' : 's'} (5–8 is ideal)`)
    if (n > 12) det.push(`${n} images slow the page and bury the best ones`)
    if (!real) det.push('No lifestyle or customer photos')
    if (!(kinds.video + kinds.gif)) det.push('No video or GIF showing it in action')
    const tip = n === 0 ? 'No images. Add 5–8: a clear hero shot, the product in use, close-ups and a demo GIF or video.'
      : base >= 85 ? 'Great gallery: enough angles plus real-life shots.'
      : n < 5 ? 'Add more images (5–8). Shoppers can\'t touch the product, so the gallery has to show it from every angle and in use.'
      : !real ? 'Swap some supplier photos for lifestyle or customer (UGC) shots. Real people using it build belief.'
      : 'Add a short demo video or GIF. Seeing it work beats any sentence.'
    f.media = fr(base, tip, det)
  }

  // ---- price ----
  const effPrice = effectivePrice(s, p)
  const ful = fulfillment(s, p.catalogId)
  const fees = planFees(s)
  {
    const det: string[] = []
    const pv = Math.max(1, d.perceivedValue)
    const r = effPrice / pv
    let sc: number
    if (effPrice <= 0) sc = 0
    else if (r < 0.45) sc = 25
    else if (r < 0.6) sc = 45 + (r - 0.45) / 0.15 * 25
    else if (r < 0.75) sc = 70 + (r - 0.6) / 0.15 * 30
    else if (r <= 1.0) sc = 100
    else if (r <= 1.15) sc = 100 - (r - 1) / 0.15 * 30
    else if (r <= 1.3) sc = 70 - (r - 1.15) / 0.15 * 30
    else sc = Math.max(8, 40 - (r - 1.3) * 60)
    const market = s.catalog?.market?.[p.catalogId]
    const anchor = d.amazonPrice ?? (market?.competitorPrice && market.competitorPrice > 0 ? market.competitorPrice : null)
    const anchorName = d.amazonPrice ? 'on Amazin' : 'from competitors'
    if (d.amazonPrice && effPrice > d.amazonPrice * 1.15) { sc -= 10; det.push(`${money(effPrice)} is well above the ${money(d.amazonPrice)} Amazin listing shoppers will find`) }
    const landed = ful.unitCost + ful.shipCost + (effPrice * fees.cardPct + fees.cardFixed)
    const margin = effPrice - landed
    det.push(`Margin at ${money(effPrice)}: ${money(margin)} (${effPrice > 0 ? Math.round((margin / effPrice) * 100) : 0}%) after product, shipping, duty and fees`)
    if (margin > 0) det.push(`Break-even ROAS ${(effPrice / margin).toFixed(2)}`)
    const cheapMsg = anchor ? `Similar items sell for about ${money(anchor)} ${anchorName}.` : 'Check what competitors and Amazin charge.'
    const tip = effPrice <= 0 ? 'Set a price.'
      : r < 0.45 ? `This price is so low it reads as cheap junk, and it leaves no margin to pay for ads. ${cheapMsg} Price close to (just under) what shoppers expect to pay; aim for a 3–4× markup on landed cost.`
      : r < 0.75 ? `You\'re leaving money on the table. ${cheapMsg} A price a bit under the going rate still converts well and funds your ads.`
      : r <= 1.0 ? 'Priced right: just under what shoppers expect to pay.'
      : r <= 1.3 ? `A bit expensive for what shoppers think it\'s worth. ${cheapMsg} Every step above the going rate costs conversions.`
      : `Overpriced. Shoppers will compare and bounce. ${cheapMsg}`
    if (margin <= effPrice * 0.4 && effPrice > 0) det.unshift('Margin under 40%: paid ads will struggle to be profitable')
    f.price = fr(sc, tip, det)
  }

  // ---- compare-at ----
  let fakeDiscount = false
  {
    const cap = p.compareAtPrice
    let sc: number
    let tip: string
    const det: string[] = []
    if (!cap) { sc = 60; tip = 'No compare-at price. An honest "was" price (15–50% off) shows the value of the deal.' }
    else if (cap <= p.price) { sc = 40; tip = 'Compare-at price must be higher than the price, or it shows no discount.'; det.push('Compare-at ≤ price') }
    else {
      const off = 1 - p.price / cap
      det.push(`${Math.round(off * 100)}% off`)
      if (off >= 0.15 && off <= 0.5) { sc = 100; tip = 'Believable discount.' }
      else if (off < 0.05) { sc = 55; tip = 'A discount this small isn\'t worth showing.' }
      else if (off < 0.15) { sc = 75; tip = 'Small discount. 15–50% off reads as a real deal.' }
      else if (off <= 0.7) { sc = 60; tip = 'Discounts above 50% start to look inflated.' }
      else { sc = 15; fakeDiscount = true; tip = 'A 70%+ "discount" is an obvious fake anchor. It hurts trust and is exactly what regulators and card networks flag.' }
    }
    f.compare_at = fr(sc, tip, det)
  }
  if (fakeDiscount) { honesty -= 0.1; honestyNotes.push('Fake 70%+ compare-at discount') }

  // ---- social proof ----
  {
    const det: string[] = []
    const reviewsOn = sectionActive(s, p, 'reviews')
    const ugcOn = sectionActive(s, p, 'ugc_gallery')
    const { count, avg, photos } = p.reviews
    let sc: number
    let tip: string
    if (!reviewsOn) {
      sc = ugcOn ? 25 : 0
      tip = sectionOn(p, 'reviews')
        ? 'The reviews section is on but no reviews app is installed, so nothing shows. Install Judgy.me or Lookz.'
        : 'No reviews on the page. Strangers won\'t buy from an unknown store without them. Install a reviews app, import 30–80 real supplier reviews (4★+), and turn on the reviews section.'
      det.push('Reviews section off')
    } else {
      if (count <= 0) sc = 0
      else if (count < 10) sc = 25 + count * 4
      else if (count < 50) sc = 70 + (count - 10) * 0.45
      else sc = 90 + Math.min(10, (count - 50) / 40)
      if (count > 0) {
        if (avg >= 4.95) { sc -= 20; det.push('A perfect 5.0 looks fake') }
        else if (avg < 4.0) { sc -= 30; det.push(`${avg.toFixed(1)}★ average scares buyers off`) }
        else if (avg < 4.3) { sc -= 10; det.push(`${avg.toFixed(1)}★ is a bit low`) }
        if (photos >= 5) sc += 8
        else det.push('Few photo reviews')
      }
      if (ugcOn) sc += 5
      det.unshift(`${count} review${count === 1 ? '' : 's'}${count ? `, ${avg.toFixed(1)}★` : ''}`)
      tip = count === 0 ? 'The reviews widget shows "No reviews yet", which is worse than nothing. Import supplier reviews or wait for customer reviews before turning it on.'
        : avg >= 4.95 ? 'All 5-star reviews look filtered or fake. A 4.5–4.8 average with a few honest 3–4★ reviews is more believable.'
        : count < 10 ? 'A handful of reviews barely registers. 30+ is where social proof starts to work.'
        : count < 50 ? 'Decent social proof. 50+ reviews with photos is the gold standard.'
        : photos < 5 ? 'Plenty of reviews. Photo reviews would make them even more convincing.'
        : 'Strong social proof.'
    }
    f.social_proof = fr(sc, tip, det)
  }

  // ---- trust ----
  const policyOk = (t: string) => t.trim().length >= 80
  {
    const det: string[] = []
    let sc = 0
    const pol = st.policies
    const missingPol: string[] = []
    for (const k of ['refund', 'shipping', 'privacy', 'terms'] as const) {
      if (policyOk(pol[k])) sc += 10
      else missingPol.push(k)
    }
    if (pol.contact.trim().length >= 20) sc += 10
    else missingPol.push('contact')
    if (missingPol.length) det.push(`Missing policies: ${missingPol.join(', ')}`)
    if (st.customDomain) sc += 15
    else det.push('Still on a .myshopifly.com address')
    if (hasTrustBadges(s, p)) sc += 10
    else det.push('No trust badges near the buy button')
    const g = sectionOf(p, 'guarantee')
    if (g?.enabled && sectionSettings('guarantee', g.settings).days >= 14) sc += 10
    else det.push('No guarantee section')
    if (st.payments.paypal) sc += 10
    else det.push(`No ${PAYMENT_LABELS.paypal} at checkout`)
    const fn = sectionOf(p, 'founder_note')
    if (fn?.enabled && sectionSettings('founder_note', fn.settings).text.trim().length >= 40) sc += 5
    const tip = sc >= 85 ? 'The store looks legitimate: policies, domain, guarantee and familiar payment options.'
      : missingPol.length >= 3 ? 'No store policies. That is a huge red flag for shoppers (and for payment processors). Generate refund, shipping, privacy and terms policies and add contact details in Settings → Policies.'
      : !st.customDomain ? 'A "yourstore.myshopifly.com" address looks temporary. Buy a .com domain.'
      : `Add the missing trust signals: guarantee section, trust badges, ${PAYMENT_LABELS.paypal} at checkout.`
    f.trust = fr(sc, tip, det)
  }

  // ---- offer ----
  let aovMult = 1
  {
    const det: string[] = []
    let sc = 0
    if (hasBundles(s, p)) {
      const tiers = sectionSettings('bundle_offer', sectionOf(p, 'bundle_offer')?.settings).tiers
      const multi = tiers.filter(t => t.qty >= 2)
      const sane = multi.length > 0 && multi.every(t => t.discountPct >= 5 && t.discountPct <= 25)
      sc += multi.length ? 45 : 20
      aovMult += multi.length ? (sane ? 0.2 : 0.12) : 0
      if (!sane && multi.length) det.push('Bundle discounts outside 5–25% (too small to matter or margin-killing)')
    } else det.push('No quantity breaks / bundles')
    const freeShip = st.shipping.freeShipping || (st.shipping.freeOver != null && st.shipping.freeOver <= p.price)
    if (freeShip) sc += 25
    else if (st.shipping.freeOver != null) {
      sc += 15
      if (st.shipping.freeOver <= p.price * 2.5) aovMult += 0.04
      if (sectionActive(s, p, 'free_shipping_bar')) sc += 10
    } else det.push('Charges shipping on every order')
    if (hasApp(s, 'rekonvert')) { sc += 20; aovMult += 0.06 }
    else det.push('No post-purchase upsell')
    if (st.discounts.some(x => x.active && x.automatic)) sc += 10
    const tip = sc >= 80 ? 'Strong offer: bundles and free shipping raise order value so you can afford more per customer.'
      : !freeShip && st.shipping.freeOver == null ? 'Shipping fees at checkout are the #1 reason carts get abandoned. Offer free shipping (build it into the price).'
      : !hasBundles(s, p) ? 'Add quantity breaks ("Buy 2, save 10%"). A higher order value lets you outbid competitors on ads.'
      : 'Add a post-purchase upsell to lift order value without touching conversion.'
    f.offer = fr(sc, tip, det)
  }

  // ---- urgency ----
  {
    const cd = sectionActive(s, p, 'countdown')
    const sc2 = sectionActive(s, p, 'stock_scarcity')
    if (cd && sc2) {
      honesty -= 0.1
      honestyNotes.push('Countdown timer + low-stock alert together')
      f.urgency = fr(70, 'A countdown AND "only 7 left" on a dropshipped item is fake urgency that savvy shoppers spot. Keep one at most.', ['Both urgency widgets on'])
    } else if (cd || sc2) f.urgency = fr(100, 'A single urgency cue nudges undecided shoppers.', [])
    else f.urgency = fr(40, 'Optional: one honest urgency cue (a real sale end date) can help. Don\'t stack them.', ['No urgency cue'])
  }

  // ---- speed ----
  const loadTime = effectiveLoadTime(s, p)
  {
    const sc = loadTime <= 2.5 ? 100 : 100 - (loadTime - 2.5) * 40
    const heavy = s.store.apps.map(a => appDef(a.appId)).filter(a => a && a.loadTime >= 0.2).map(a => a!.name.split(/[:\-–]/)[0].trim())
    const det = [`Loads in ${loadTime.toFixed(1)}s on mobile`]
    if (heavy.length) det.push(`Heavy scripts: ${heavy.join(', ')}`)
    if (th.loadTime >= 2.5) det.push(`${th.name} theme is heavy (${th.loadTime}s)`)
    const tip = loadTime <= 2.5 ? 'Fast page.'
      : `Every second past ~2.5s loses roughly 10% of buyers. Remove apps you don't need${heavy.length ? ` (${heavy.slice(0, 3).join(', ')})` : ''}, keep images under 8, or add a speed optimizer.`
    f.speed = fr(sc, tip, det)
  }

  // ---- mobile ----
  {
    const det: string[] = []
    let sc = 0
    const sticky = hasStickyAtc(s, p)
    if (sticky) sc += 60
    else det.push('No sticky add-to-cart')
    const n = p.sections.filter(x => x.enabled).length
    sc += n <= 10 ? 40 : n <= 13 ? 20 : 0
    if (n > 10) det.push(`${n} sections: a very long scroll on phones`)
    if (hasApp(s, 'spinwheel')) { sc -= 15; det.push('Spin-to-win popup covers the page on phones') }
    if (hasApp(s, 'salespop')) { sc -= 5; det.push('Sales popups cover the buy button') }
    const tip = sc >= 90 ? 'Good mobile experience.' : !sticky ? 'About 80% of your ad traffic is on phones. Turn on a sticky add-to-cart so the button is always within thumb reach.' : 'Cut sections and popups that make phone shoppers scroll or dismiss things before buying.'
    f.mobile = fr(sc, tip, det)
  }

  // ---- shipping promise ----
  const promise = effectivePromise(p)
  const [realMin, realMax] = realDeliveryWindow(s, p.catalogId)
  let shippingLie = false
  {
    const det: string[] = [`Your orders really take ${realMin}–${realMax} days`]
    let sc: number
    let tip: string
    if (!promise) {
      sc = 25
      tip = `No delivery estimate on the page. Customers who don't know when it arrives flood you with "where is my order?" emails. Add a shipping section with an honest window (${realMin}–${realMax} days).`
      det.push('No delivery window shown')
    } else {
      const [pMin, pMax] = promise
      det.push(`Page promises ${pMin}–${pMax} days`)
      if (pMax < realMax - 1) {
        shippingLie = true
        const severe = pMax < realMin
        honesty -= severe ? 0.35 : 0.2
        honestyNotes.push('Promises faster delivery than you can do')
        sc = severe ? 10 : 25
        tip = `You promise ${pMin}–${pMax} days but orders take ${realMin}–${realMax}. It may lift sales a little today, but late orders turn into "item not received" chargebacks, refunds and a payout hold. Promise what you can deliver, or switch to faster fulfillment.`
      } else if (pMax > realMax + 10) {
        sc = 75
        tip = 'Your promise is much slower than reality. Honest, but you could show a tighter window.'
      } else {
        sc = realMax > 20 ? 72 : realMax > 12 ? 88 : 100
        tip = realMax > 20 ? 'Honest, but a 3–4 week wait costs sales. Choice-badge suppliers, an agent or US stock would let you promise faster.' : 'Clear, honest delivery window.'
      }
    }
    f.shipping = fr(sc, tip, det)
  }

  // ---- faq ----
  {
    const det: string[] = []
    let sc: number
    const faqCovered = d.objections.filter(o => objectionCovered(o, faqText)).length
    if (!faqItems.length) { sc = 0; det.push('No FAQ section') }
    else if (faqItems.length < 3) sc = 20 + 10 * faqItems.length
    else sc = 50
    if (faqItems.length && d.objections.length) sc += 50 * (faqCovered / d.objections.length)
    else if (faqItems.length >= 3) sc += 30
    if (faqItems.length && d.objections.length && faqCovered < d.objections.length) det.push(`FAQ answers ${faqCovered}/${d.objections.length} common objections`)
    const tip = !faqItems.length ? 'Add an FAQ with 3–6 questions that answer real buyer doubts (does it work, is it safe, sizing, shipping time, returns).'
      : sc >= 85 ? 'Your FAQ answers the questions that block purchases.'
      : 'Rewrite your FAQ around real objections: what would make someone hesitate to buy this?'
    f.faq = fr(sc, tip, det)
  }

  // ---- design ----
  {
    const det: string[] = [`${th.name} theme`]
    let sc = th.design
    const designers = s.staff?.members?.filter(m => m.role === 'designer') ?? []
    const designerPts = Math.min(20, designers.reduce((a, m) => a + m.skill * 2, 0))
    if (designerPts) { sc += designerPts; det.push(`Designer on staff +${designerPts}`) }
    if (hasApp(s, 'pagefli')) { sc += APP_SIM.pagefliDesign; det.push('PageFli layout') }
    const bi = sectionOf(p, 'benefits_icons')
    if (bi?.enabled && sectionSettings('benefits_icons', bi.settings).items.filter(i => i.title.trim()).length >= 3) sc += 4
    const hw = sectionOf(p, 'how_it_works')
    if (hw?.enabled && sectionSettings('how_it_works', hw.settings).steps.filter(i => i.title.trim()).length >= 3) sc += 3
    const tip = sc >= 80 ? 'Polished, professional look.' : 'The page looks generic. A conversion-focused theme, benefit icons, a "how it works" strip, or a designer make it feel like a real brand.'
    f.design = fr(sc, tip, det)
  }

  // ---- variants ----
  {
    const supplierVals = new Set(d.variants.flatMap(v => v.values.map(x => x.toLowerCase().trim())))
    const supplierHas = d.variants.some(v => v.values.length > 1)
    const vals = p.variants.flatMap(v => v.values.map(x => x.trim())).filter(Boolean)
    let sc: number
    let tip: string
    const det: string[] = []
    if (!supplierHas) {
      sc = vals.length ? 60 : 100
      tip = vals.length ? 'The supplier doesn\'t offer these options. Customers will order variants you can\'t ship.' : 'Single-variant product. Nothing to choose.'
    } else if (!vals.length) {
      sc = 55
      tip = 'The supplier offers options (color/size) but your page doesn\'t let shoppers choose.'
      det.push('No variant picker')
    } else {
      sc = 100
      const unknown = vals.filter(v => !supplierVals.has(v.toLowerCase()) && ![...supplierVals].some(sv => sv.includes(v.toLowerCase()) || v.toLowerCase().includes(sv)))
      const chinglish = vals.filter(v => /\b(style|type|upgrade|model|pcs?|\d+\s*cm|set\s*[a-z0-9])\b/i.test(v))
      if (unknown.length > vals.length / 2) { sc = 65; det.push('Options don\'t match what the supplier sells') }
      if (chinglish.length) { sc = Math.min(sc, 80); det.push(`Supplier-style option names: ${chinglish.slice(0, 3).join(', ')}`) }
      if (vals.length > 12) { sc = Math.min(sc, 75); det.push(`${vals.length} options is overwhelming`) }
      tip = sc >= 95 ? 'Clear variant choices.' : 'Rename options in plain English ("Charcoal Gray", "Large 12″") and only list what the supplier really stocks.'
    }
    f.variants = fr(sc, tip, det)
  }

  // ---- aggregate ----
  let wsum = 0
  let total = 0
  const factors: PageGradeFactor[] = (Object.keys(FACTOR_WEIGHTS) as FactorKey[]).map(k => {
    const w = FACTOR_WEIGHTS[k]
    wsum += w
    total += w * f[k].score
    return {
      key: k, label: LABELS[k], score: f[k].score, weight: w, tip: f[k].tip,
      status: f[k].score >= 75 ? 'good' : f[k].score >= 45 ? 'warn' : 'bad',
      details: f[k].details,
    }
  })
  const score = Math.round((total / wsum) * 10) / 10

  // other honesty hits
  if (sectionActive(s, p, 'as_seen_on')) { honesty -= 0.05; honestyNotes.push('"As seen on" press logos without real press') }
  if (hasApp(s, 'salespop') && (s.store.apps.find(a => a.appId === 'salespop')?.planIdx ?? 0) >= 1) { honesty -= 0.05; honestyNotes.push('Sample (fake) purchase popups') }

  const titleCopied = tSim > 0.5
  const descCopied = desc.supplierSimilarity >= 0.5
  const trust = clamp(
    0.5 * (f.trust.score / 100) + 0.3 * (f.social_proof.score / 100) + 0.1 * (f.design.score / 100) + (fakeDiscount ? 0 : 0.1)
      - (titleCopied ? 0.08 : 0) - (descCopied ? 0.08 : 0) - (desc.claimTerms.length ? 0.05 : 0),
    0, 1,
  )

  const copy = {
    words: desc.words, bullets: desc.bullets, headings: desc.headings, paragraphs: desc.paragraphs,
    avgParagraphWords: desc.avgParagraphWords, youCount: desc.youCount, benefitWords: desc.benefitWords,
    keywordHits: desc.keywordHits, featureWords: desc.featureWords, supplierSimilarity: Math.round(desc.supplierSimilarity * 100) / 100,
    titleSimilarity: Math.round(tSim * 100) / 100, mentionsGuarantee: desc.mentionsGuarantee, mentionsShipping: desc.mentionsShipping,
    spamTerms: desc.spamTerms, claimTerms: desc.claimTerms, objections,
  }
  if (honestyNotes.length) {
    const tf = factors.find(x => x.key === 'trust')
    if (tf) tf.details = [...(tf.details ?? []), ...honestyNotes.map(n => `Honesty: ${n}`)]
  }

  return {
    score,
    cvrMult: Math.round(cvrMultFromScore(score) * 1000) / 1000,
    aovMult: Math.round(aovMult * 100) / 100,
    trust: Math.round(trust * 100) / 100,
    loadTime,
    honesty: Math.round(clamp(honesty, 0, 1) * 100) / 100,
    factors,
    gradedHour: s.time.hour,
    copy,
    shippingLie,
  }
}
