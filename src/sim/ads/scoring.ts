// HIDDEN creative skill model. This is where e-commerce knowledge pays off: the right format,
// hook and angle for the product, a tight script structure and a sharp on-screen hook decide
// hook rate, CTR and CPM. Nothing here is shown to the player directly; they see results
// (metrics) and, after enough impressions, skill-gated diagnostic tips.
import type {
  AngleId, BeatId, Creative, CreativeScores, FormatId, GameState, HookId, Platform, ProductDef,
} from '../../core/types'
import { clamp } from '../../core/rng'
import { ANGLES, FORMATS, HOOKS, STILL_FORMATS, angleName, formatName, hookName } from '../../data/creativeTaxonomy'
import { BENCHMARKS } from '../../data/benchmarks'
import { fmtInt, fmtPct, productDef, skillLevel, tokens } from './shared'
import { deriveMetrics, emptyStats, addStats } from './metrics'

/** Impressions a creative needs before diagnostic tips unlock. */
export const TIPS_MIN_IMPRESSIONS = 1000

// ---------------------------------------------------------------------------
// Product traits inferred from the (hidden) product definition
// ---------------------------------------------------------------------------
const TACTILE_NICHES = new Set(['kitchen', 'beauty', 'home', 'gadgets'])
const TRANSFORM_NICHES = new Set(['home', 'car', 'beauty', 'pet'])
const ASPIRATIONAL_NICHES = new Set(['home', 'beauty', 'fashion', 'fitness', 'wellness'])

/** 0..1 how visible a before/after change is */
function transformation(p: ProductDef): number {
  if (p.bestHooks.includes('before_after') || p.bestFormats.includes('before_after_video')) return 1
  if (TRANSFORM_NICHES.has(p.niche) && p.problemSolving >= 0.6) return 0.6
  if (p.problemSolving >= 0.75) return 0.45
  return 0.2
}
/** 0..1 satisfying sound/texture to lead with */
function tactile(p: ProductDef): number {
  if (p.bestHooks.includes('asmr') || p.bestFormats.includes('asmr_unboxing')) return 1
  if (TACTILE_NICHES.has(p.niche) && p.wow >= 0.6) return 0.65
  return 0.35
}
const variantCount = (p: ProductDef) => p.variants.reduce((a, v) => Math.max(a, v.values.length), 0)

// ---------------------------------------------------------------------------
// Fit heuristics (1.0 when it's one of the product's proven choices)
// ---------------------------------------------------------------------------
export function formatFit(p: ProductDef, f: FormatId): number {
  if (p.bestFormats.includes(f)) return 1
  let v: number
  switch (f) {
    case 'demo_video': v = 0.5 + 0.35 * Math.max(p.wow, p.problemSolving); break
    case 'ugc_testimonial': v = 0.6 + 0.15 * (1 - p.impulse) + 0.1 * p.problemSolving; break
    case 'green_screen': v = 0.52 + 0.18 * p.problemSolving; break
    case 'slideshow': v = 0.42 + 0.25 * p.giftable + 0.1 * p.impulse; break
    case 'static_image': v = 0.55 - 0.3 * p.wow + 0.1 * p.impulse; break
    case 'carousel': v = 0.42 + (variantCount(p) >= 3 ? 0.12 : 0) + 0.1 * p.giftable; break
    case 'before_after_video': v = 0.2 + 0.65 * transformation(p); break
    case 'asmr_unboxing': v = 0.25 + 0.6 * tactile(p); break
    case 'founder_story': v = 0.3 + 0.4 * p.brandable; break
    case 'supplier_edit': v = 0.32 + 0.25 * p.wow; break
    case 'skit': v = 0.38 + 0.4 * p.problemSolving * (0.5 + 0.5 * p.impulse); break
    default: v = 0.5
  }
  return clamp(v, 0.1, 0.9)
}

export function hookFit(p: ProductDef, h: HookId, f?: FormatId): number {
  let v: number
  if (p.bestHooks.includes(h)) v = 1
  else {
    switch (h) {
      case 'problem_callout': v = 0.3 + 0.55 * p.problemSolving; break
      case 'pov': v = 0.5 + 0.2 * p.impulse + 0.1 * p.wow; break
      case 'tiktak_made_me_buy': v = 0.35 + 0.35 * p.wow + 0.15 * p.impulse; break
      case 'before_after': v = 0.2 + 0.65 * transformation(p); break
      case 'asmr': v = 0.25 + 0.6 * tactile(p); break
      case 'shock_stat': v = 0.35 + 0.35 * p.problemSolving; break
      case 'unboxing': v = 0.35 + 0.25 * p.wow + 0.2 * p.giftable; break
      case 'us_vs_them': v = 0.4 + 0.3 * p.problemSolving + (p.amazonPrice && p.amazonPrice > p.cogs * 4 ? 0.08 : 0); break
      case 'testimonial': v = 0.5 + 0.2 * (1 - p.impulse) + 0.1 * p.problemSolving; break
      case 'gift_idea': v = p.giftable > 0.5 ? 0.35 + 0.5 * p.giftable : 0.12 + 0.2 * p.giftable; break
      case 'life_hack': v = 0.3 + 0.5 * p.problemSolving * Math.sqrt(p.wow); break
      case 'controversial': v = 0.35 + 0.1 * p.wow; break
      case 'question': v = 0.45 + 0.25 * p.problemSolving; break
      default: v = 0.5
    }
    v = Math.min(0.9, v)
  }
  // hook ↔ format coherence
  if (f) {
    const still = STILL_FORMATS.includes(f)
    if (still && (h === 'asmr' || h === 'unboxing')) v -= 0.15 // no sound/motion in a still
    if ((h === 'before_after' && f === 'before_after_video') || ((h === 'asmr' || h === 'unboxing') && f === 'asmr_unboxing')
      || (h === 'testimonial' && f === 'ugc_testimonial') || ((h === 'problem_callout' || h === 'life_hack') && f === 'demo_video')) v += 0.05
  }
  return clamp(v, 0.05, 1)
}

export function angleFit(p: ProductDef, a: AngleId): number {
  if (p.bestAngles.includes(a)) return 1
  let v: number
  switch (a) {
    case 'pain_point': v = 0.25 + 0.6 * p.problemSolving; break
    case 'convenience': v = 0.4 + 0.35 * p.problemSolving; break
    case 'gift': v = p.giftable > 0.5 ? 0.4 + 0.45 * p.giftable : 0.12 + 0.2 * p.giftable; break
    case 'social_proof': v = 0.55 + (p.publicSignals.reviews > 1000 ? 0.1 : 0); break
    case 'savings': v = p.amazonPrice && p.amazonPrice >= p.perceivedValue * 0.9 ? 0.55 : 0.45; break
    case 'aspirational': v = ASPIRATIONAL_NICHES.has(p.niche) ? 0.55 + 0.2 * p.wow : 0.3; break
    case 'curiosity': v = 0.35 + 0.4 * p.wow; break
    case 'health': v = p.niche === 'wellness' || p.niche === 'fitness' ? 0.65 : p.niche === 'beauty' ? 0.45 : 0.2; break
    case 'time_saving': v = 0.3 + 0.45 * p.problemSolving; break
    case 'pet_love': v = p.niche === 'pet' ? 0.85 : 0.08; break
    case 'parenting': v = p.niche === 'baby' || p.niche === 'kids' ? 0.85 : 0.12; break
    case 'self_care': v = p.niche === 'beauty' || p.niche === 'wellness' ? 0.8 : p.niche === 'home' || p.niche === 'fitness' ? 0.45 : 0.2; break
    default: v = 0.5
  }
  return clamp(v, 0.05, 0.9)
}

const COHERENT: Partial<Record<HookId, AngleId[]>> = {
  problem_callout: ['pain_point', 'time_saving', 'convenience', 'health'],
  gift_idea: ['gift'],
  testimonial: ['social_proof'],
  before_after: ['pain_point', 'self_care', 'health'],
  us_vs_them: ['savings', 'convenience'],
  tiktak_made_me_buy: ['social_proof', 'curiosity'],
  asmr: ['self_care', 'aspirational', 'curiosity'],
  life_hack: ['time_saving', 'convenience', 'savings'],
  pov: ['aspirational', 'pet_love', 'parenting', 'self_care', 'gift'],
  unboxing: ['gift', 'curiosity'],
  shock_stat: ['pain_point', 'health', 'savings'],
  question: ['pain_point', 'curiosity'],
  controversial: ['savings', 'curiosity'],
}
const coherence = (h: HookId, a: AngleId) => (COHERENT[h]?.includes(a) ? 0.05 : 0)

// ---------------------------------------------------------------------------
// Script structure
// ---------------------------------------------------------------------------
export interface BeatIssue { key: string; text: string }
export function beatsAnalysis(p: ProductDef, c: Pick<Creative, 'beats' | 'format' | 'hook' | 'angle'>): { score: number; issues: BeatIssue[] } {
  const b: BeatId[] = c.beats
  const issues: BeatIssue[] = []
  if (!b.length) return { score: 0.1, issues: [{ key: 'empty', text: 'Add script beats: hook, then the body, then a call to action.' }] }
  const still = STILL_FORMATS.includes(c.format)
  let v = 0.3
  if (b[0] === 'hook') v += 0.15
  else { v -= 0.1; issues.push({ key: 'hook_first', text: 'Open with the hook beat. Anything else first gets scrolled past.' }) }
  const last = b[b.length - 1]
  if (last === 'cta') v += 0.15
  else if (b.includes('cta')) { v += 0.05; issues.push({ key: 'cta_last', text: 'Move the call to action to the end, after the offer.' }) }
  else { v -= 0.1; issues.push({ key: 'no_cta', text: 'There is no call to action. Finish by telling viewers exactly what to do.' }) }
  const needDemo = p.wow > 0.5 || p.problemSolving > 0.5
  if (b.includes('demo')) v += needDemo ? 0.12 : 0.05
  else if (needDemo) {
    v -= still ? 0.04 : 0.1
    issues.push({ key: 'no_demo', text: 'Show the product working. There is no demo beat, and this product sells on seeing it in action.' })
  }
  if (b.includes('social_proof') || b.includes('testimonial')) v += 0.1
  else issues.push({ key: 'no_proof', text: 'Add social proof (reviews, a testimonial or a sales number) so viewers trust it.' })
  const iOffer = b.indexOf('offer')
  const iCta = b.lastIndexOf('cta')
  if (iOffer >= 0 && iCta > iOffer) v += 0.08
  else if (iOffer >= 0 && iCta >= 0 && iCta < iOffer) issues.push({ key: 'offer_order', text: 'Put the offer before the call to action, not after it.' })
  const [lo, hi] = still ? [2, 5] : [4, 7]
  if (b.length >= lo && b.length <= hi) v += 0.1
  else if (b.length < lo - (still ? 0 : 1)) { v -= 0.15; issues.push({ key: 'too_short', text: `Too few beats to tell a story. ${still ? '2–5 panels' : '4–7 beats'} is the sweet spot.` }) }
  else if (b.length > hi + 1) { v -= 0.1; issues.push({ key: 'too_long', text: `Too many beats: attention drops off. Trim to ${still ? '2–5 panels' : '4–7 beats'}.` }) }
  if (c.angle === 'pain_point' || c.hook === 'problem_callout') {
    const ip = b.indexOf('problem')
    const idm = b.indexOf('demo')
    if (ip >= 0 && (idm < 0 || idm > ip)) v += 0.08
    else if (ip < 0) { v -= 0.05; issues.push({ key: 'no_problem', text: 'A problem-led story needs a problem beat before the demo.' }) }
    else issues.push({ key: 'problem_order', text: 'Show the problem before the demo, not after.' })
  }
  const dupes = b.length - new Set(b).size
  if (dupes > 0) { v -= 0.05 * dupes; issues.push({ key: 'dupes', text: 'Some beats repeat. Each beat should move the story forward.' }) }
  if (b.includes('urgency') && !b.includes('offer')) { v -= 0.04; issues.push({ key: 'urgency_no_offer', text: 'Urgency without an offer feels pushy. Give them a reason (the deal) first.' }) }
  if (b.includes('agitate') && (!b.includes('problem') || b.indexOf('agitate') < b.indexOf('problem'))) v -= 0.05
  if (b.includes('benefits')) v += 0.04
  if (b.includes('unboxing') && (c.format === 'asmr_unboxing' || c.hook === 'unboxing')) v += 0.03
  return { score: clamp(v, 0, 1), issues }
}

// ---------------------------------------------------------------------------
// On-screen hook text & script copy
// ---------------------------------------------------------------------------
const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'this', 'that', 'from', 'into', 'more', 'less', 'than', 'are', 'its', 'our', 'not', 'all', 'any', 'can', 'will'])
const PAIN_WORDS = new Set([
  'tired', 'hate', 'stop', 'finally', 'struggle', 'struggling', 'mess', 'messy', 'pain', 'annoying', 'never', 'again',
  'waste', 'wasting', 'sick', 'ruined', 'stuck', 'broken', 'smell', 'stains', 'stain', 'clutter', 'sore', 'gross', 'dirty',
  'sweaty', 'frizz', 'hurts', 'ugh', 'nightmare', 'embarrassing', 'fix', 'problem', 'without', 'everywhere', 'forever',
  'worst', 'hard', 'impossible', 'fur', 'hair', 'tangled', 'cold', 'hot', 'lost', 'late', 'noisy', 'sleep', 'back',
])
const GENERIC_PHRASES = ['buy now', 'best product', 'shop now', 'click here', 'limited time', 'order now', 'amazing product', 'must have', 'must-have', 'best seller', 'hot sale', 'free shipping', 'check this out', 'link in bio', 'dont miss', "don't miss"]
const GENERIC_TOKENS = new Set(['sale', 'discount', 'cheap', 'deal', 'offer', 'promo'])

const HOOK_TEXT_PATTERNS: Record<HookId, RegExp> = {
  problem_callout: /(tired|stop|hate|struggl|sick of|if you|still|anyone else)/i,
  pov: /^\s*pov\b/i,
  tiktak_made_me_buy: /(tiktak|viral|made me buy|everyone|testing)/i,
  before_after: /(before|after|day \d|\bvs\b)/i,
  asmr: /(sound|satisf|asmr|🔊|listen)/i,
  shock_stat: /\d/,
  unboxing: /(unbox|came|arrived|package|finally here|what i ordered)/i,
  us_vs_them: /(\bvs\.?\b|versus|instead of|switched|compared)/i,
  testimonial: /(["“”]|\bi\b|\bmy\b|\bme\b)/i,
  gift_idea: /(gift|present|stocking|for (your|my|him|her|mom|dad))/i,
  life_hack: /(hack|trick|nobody told|save this|secret|genius)/i,
  controversial: /(unpopular|opinion|nobody|hate me|scam|overrated|say it)/i,
  question: /\?/,
}

function productWords(p: ProductDef): Set<string> {
  const out = new Set<string>()
  for (const src of [p.name, ...p.keywords]) for (const t of tokens(src)) if (t.length > 2 && !STOP.has(t)) out.add(t)
  return out
}

export interface HookTextAnalysis { score: number; issues: string[] }
export function hookTextAnalysis(p: ProductDef, hook: HookId, raw: string): HookTextAnalysis {
  const text = raw.trim()
  const issues: string[] = []
  if (!text) return { score: 0.12, issues: ['empty'] }
  const words = text.split(/\s+/).filter(Boolean)
  const n = words.length
  let v = 0.2
  if (n >= 3 && n <= 12) v += 0.25
  else if (n <= 2) { v += 0.05; issues.push('short') }
  else if (n <= 18) { v += 0.1; issues.push('long') }
  else issues.push('long')
  const lower = text.toLowerCase()
  const toks = tokens(text)
  let personal = 0
  if (toks.some(t => t === 'you' || t === 'your' || t === 'youre' || t === 'yours')) personal += 0.08
  if (/\bpov\b/i.test(text)) personal += 0.08
  if (text.includes('?')) personal += 0.06
  if (/\d/.test(text)) personal += 0.06
  if (personal === 0) issues.push('impersonal')
  v += Math.min(0.2, personal)
  const pw = productWords(p)
  const hasKw = toks.some(t => pw.has(t))
  const hasPain = toks.some(t => PAIN_WORDS.has(t))
  if (hasKw || hasPain) v += 0.2
  else issues.push('irrelevant')
  if (hasKw && hasPain) v += 0.05
  if (GENERIC_PHRASES.some(g => lower.includes(g)) || toks.some(t => GENERIC_TOKENS.has(t))) { v -= 0.25; issues.push('generic') }
  const letters = text.replace(/[^A-Za-z]/g, '')
  const upper = text.replace(/[^A-Z]/g, '').length
  if (letters.length >= 8 && upper / letters.length > 0.7) { v -= 0.15; issues.push('caps') }
  const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length
  if (emoji >= 4) { v -= 0.05; issues.push('emoji') }
  if ((text.match(/!/g) ?? []).length >= 3) { v -= 0.05; issues.push('exclaim') }
  if (HOOK_TEXT_PATTERNS[hook].test(text)) v += 0.1
  else issues.push('off_type')
  return { score: clamp(v, 0, 1), issues }
}

const CTA_WORDS = ['tap', 'shop', 'order', 'link', 'grab', 'get yours', 'click', 'today', 'try it', 'head to']
export function scriptAnalysis(p: ProductDef, raw: string): { bonus: number; ctaWords: boolean; benefits: number; objections: number } {
  const sc = raw.trim()
  if (!sc) return { bonus: 0, ctaWords: false, benefits: 0, objections: 0 }
  const toks = new Set(tokens(sc))
  const lower = sc.toLowerCase()
  let benefits = 0
  for (const k of p.keywords) {
    const kt = tokens(k).filter(t => t.length > 2 && !STOP.has(t))
    if (kt.length && kt.every(t => toks.has(t))) benefits++
  }
  let objections = 0
  for (const o of p.objections) {
    const ot = tokens(o).filter(t => t.length > 3 && !STOP.has(t) && !['does', 'what', 'will', 'how', 'long', 'much', 'this', 'there', 'have', 'they', 'about', 'really'].includes(t))
    if (ot.some(t => toks.has(t))) objections++
  }
  const ctaWords = CTA_WORDS.some(w => lower.includes(w))
  const wc = sc.split(/\s+/).length
  let bonus = Math.min(3, benefits) * 0.02 + Math.min(2, objections) * 0.03 + (ctaWords ? 0.03 : 0)
  if (wc >= 25 && wc <= 150) bonus += 0.02
  else if (wc > 250) bonus -= 0.03
  return { bonus: clamp(bonus, -0.03, 0.15), ctaWords, benefits, objections }
}

// ---------------------------------------------------------------------------
// The score
// ---------------------------------------------------------------------------
export interface ScoreBreakdown {
  formatFit: number
  hookFit: number
  angleFit: number
  beats: number
  hookText: number
  quality: number
  script: number
  ctaScore: number
  native: Record<Platform, number>
}

function nativeMult(c: Creative): Record<Platform, number> {
  const still = c.format === 'static_image' || c.format === 'carousel'
  const ugcLike = c.producer === 'ugc' || c.producer === 'staff' || c.format === 'ugc_testimonial'
  const polished = c.producer === 'agency' || c.style === 'polished'
  let tt = 1
  let fb = 1
  if (still) {
    tt *= 0.5
    fb *= 0.85
  } else {
    if (ugcLike || ['green_screen', 'slideshow', 'skit'].includes(c.format) || c.hook === 'pov') tt *= 1.15
    if (polished) tt *= c.producer === 'agency' ? 0.8 : 0.9
    if (ugcLike && !polished) fb *= 1.05
  }
  return { fadbook: fb, tiktak: tt }
}

export function scoreBreakdown(p: ProductDef, c: Creative): ScoreBreakdown {
  const ff = formatFit(p, c.format)
  const hf = hookFit(p, c.hook, c.format)
  const af = angleFit(p, c.angle)
  const beats = beatsAnalysis(p, c).score
  const ht = hookTextAnalysis(p, c.hook, c.hookText).score
  const sa = scriptAnalysis(p, c.script)
  const b = c.beats
  let cta = 0.25
  if (b[b.length - 1] === 'cta') cta += 0.3
  else if (b.includes('cta')) cta += 0.15
  if (b.includes('offer')) cta += 0.15
  if (b.includes('urgency') && b.includes('offer')) cta += 0.05
  if (sa.ctaWords) cta += 0.1
  if (b.includes('social_proof') || b.includes('testimonial')) cta += 0.05
  return {
    formatFit: ff, hookFit: hf, angleFit: af, beats, hookText: ht, quality: clamp(c.quality, 0, 1),
    script: sa.bonus, ctaScore: clamp(cta, 0, 1), native: nativeMult(c),
  }
}

/** Hidden creative scoring. Pure: reads state (for impressions / skill-gated tips), never mutates. */
export function scoreCreative(s: GameState, c: Creative): CreativeScores {
  const p = productDef(c.catalogId)
  if (!p) return { hook: 0.3, body: 0.3, cta: 0.3, fit: 0.3, power: { fadbook: 0.8, tiktak: 0.8 }, tips: [] }
  const k = scoreBreakdown(p, c)
  const hook = clamp(0.45 * k.hookFit + 0.3 * k.hookText + 0.25 * k.quality, 0, 1)
  const body = clamp(0.4 * k.formatFit + 0.35 * k.beats + 0.25 * k.quality + k.script, 0, 1)
  const cta = k.ctaScore
  const fit = clamp((k.formatFit + k.hookFit + k.angleFit) / 3 + coherence(c.hook, c.angle), 0, 1)
  const composite = 0.35 * hook + 0.25 * body + 0.1 * cta + 0.3 * fit
  const wowF = 0.85 + 0.3 * p.wow
  // Composite → power, calibrated so an uninformed "average" brief (composite ≈ 0.45) lands at ≈ 1.0,
  // a well-researched one (≈ 0.85) at ≈ 2.1+, and a careless one (≈ 0.25) near 0.45 (SPEC §7 targets).
  const base = Math.max(0.3, 2.75 * composite - 0.24)
  const power = {
    fadbook: Math.max(0.25, base * k.native.fadbook * wowF),
    tiktak: Math.max(0.25, base * k.native.tiktak * wowF),
  }
  const scores: CreativeScores = { hook, body, cta, fit, power, tips: [] }
  if (creativeImpressions(s, c.id) >= TIPS_MIN_IMPRESSIONS) scores.tips = creativeTips(s, c, scores)
  return scores
}

// ---------------------------------------------------------------------------
// Performance lookups & tips
// ---------------------------------------------------------------------------
export function creativeImpressions(s: GameState, creativeId: string): number {
  let n = 0
  for (const ad of s.ads.ads) {
    if (ad.creativeId !== creativeId) continue
    n += ad.lifetime.impressions
    for (const st of Object.values(ad.stats)) n += st.impressions
  }
  for (const post of s.ads.organicPosts) if (post.creativeId === creativeId) n += post.views
  return n
}

export function creativeTotals(s: GameState, creativeId: string) {
  const out = emptyStats()
  const platforms = new Set<Platform>()
  for (const ad of s.ads.ads) {
    if (ad.creativeId !== creativeId) continue
    platforms.add(ad.platform)
    addStats(out, ad.lifetime)
    for (const st of Object.values(ad.stats)) addStats(out, st)
  }
  return { stats: out, platforms: [...platforms] }
}

function hookReason(p: ProductDef, h: HookId): string {
  switch (h) {
    case 'gift_idea': return p.giftable <= 0.5 ? 'most buyers get this for themselves, not as a present' : 'the gift framing is fine, but it isn\'t what makes people stop'
    case 'before_after': return transformation(p) < 0.5 ? 'there is no dramatic, visible change to reveal' : 'the change is real but not striking enough to lead with'
    case 'asmr': return tactile(p) < 0.5 ? 'it has no satisfying sound or texture to open on' : 'the sound alone doesn\'t explain why anyone needs it'
    case 'problem_callout': return p.problemSolving < 0.5 ? 'it doesn\'t fix a problem people feel strongly about' : 'the problem you call out isn\'t the one buyers care most about'
    case 'shock_stat': return 'a statistic feels like a lecture for an impulse product like this'
    case 'unboxing': return p.wow < 0.55 ? 'the box and the product itself aren\'t exciting to look at' : 'the unboxing delays the payoff viewers came for'
    case 'controversial': return 'a hot take attracts arguers rather than buyers and it can hurt account quality'
    case 'life_hack': return 'it isn\'t really a "trick": the use is obvious, so the hook oversells it'
    case 'tiktak_made_me_buy': return p.wow < 0.6 ? 'it doesn\'t look viral-worthy at first glance' : 'the viral framing is overused for this kind of product'
    case 'us_vs_them': return 'viewers don\'t have a strong "old way" to compare it against'
    case 'testimonial': return 'a quote alone doesn\'t show what the product does fast enough'
    case 'pov': return 'the scenario isn\'t one this product\'s buyers recognize themselves in'
    case 'question': return 'the question is easy to answer "no" to and scroll on'
  }
}
function formatReason(p: ProductDef, f: FormatId): string {
  switch (f) {
    case 'static_image': case 'carousel': return p.wow >= 0.55 ? 'a still can\'t show what makes it impressive; it needs motion' : 'stills are easy to scroll past cold'
    case 'supplier_edit': return 'the supplier footage looks like every other store\'s ad for it'
    case 'before_after_video': return 'there isn\'t a big enough visible change to carry the video'
    case 'asmr_unboxing': return 'there is little satisfying sound or texture to build on'
    case 'founder_story': return 'buyers don\'t care who is behind a product like this; they want to see it work'
    case 'slideshow': return 'photos can\'t show it in action'
    case 'skit': return 'the joke takes too long to get to the product'
    case 'green_screen': return 'reacting to a screenshot is weaker than showing the product'
    case 'ugc_testimonial': return 'talking about it is weaker than showing it'
    case 'demo_video': return 'a plain demo undersells the emotional reason people buy'
  }
}
function angleReason(p: ProductDef, a: AngleId): string {
  switch (a) {
    case 'pet_love': return p.niche === 'pet' ? 'pet owners here respond more to solving a concrete hassle' : 'it isn\'t a pet product'
    case 'parenting': return p.niche === 'baby' || p.niche === 'kids' ? 'parents here respond more to a concrete benefit' : 'it isn\'t a product parents shop for as parents'
    case 'gift': return p.giftable <= 0.5 ? 'people rarely buy this as a present' : 'the gift angle only peaks around holidays'
    case 'health': return 'health framing is policy-sensitive and not why people buy this'
    case 'self_care': return 'this isn\'t an indulgence purchase'
    case 'aspirational': return 'buyers want the result, not a lifestyle'
    case 'pain_point': return p.problemSolving < 0.5 ? 'it doesn\'t solve a painful problem' : 'the pain you lead with isn\'t the main one'
    case 'savings': return 'price isn\'t the main reason anyone buys it'
    case 'curiosity': return 'withholding the reveal wastes the product\'s best asset: seeing it'
    case 'convenience': case 'time_saving': return 'the time or effort saved is too small to be the headline'
    case 'social_proof': return 'crowd proof works better as a supporting beat than as the whole message'
  }
}

/** Skill-gated diagnostic tips (only meaningful once the creative has real impressions). */
export function creativeTips(s: GameState, c: Creative, scores?: CreativeScores): string[] {
  const p = productDef(c.catalogId)
  if (!p) return []
  const lvl = Math.max(skillLevel(s, 'creative'), skillLevel(s, 'media_buying'))
  const k = scoreBreakdown(p, c)
  const sc = scores ?? { hook: 0, body: 0, cta: 0, fit: 0 }
  const tips: string[] = []
  const { stats, platforms } = creativeTotals(s, c.id)
  const m = deriveMetrics(stats)
  const plat: Platform = platforms[0] ?? 'fadbook'
  const B = BENCHMARKS[plat]

  // 1) What the numbers say (visible to everyone; skill adds the benchmark comparison)
  if (stats.impressions > 0) {
    const parts: string[] = []
    const ctrBand = B.ctrLink
    const hookBand = plat === 'fadbook' ? BENCHMARKS.fadbook.hookRate : BENCHMARKS.tiktak.view2sRate
    if (c.isVideo) parts.push(`${plat === 'fadbook' ? 'hook rate' : '2s view rate'} ${fmtPct(m.hookRate, 1)}${lvl >= 3 ? ` (benchmark ~${fmtPct(hookBand.avg, 0)})` : ''}`)
    parts.push(`link CTR ${fmtPct(m.ctrLink)}${lvl >= 3 ? ` (benchmark ~${fmtPct(ctrBand.avg, 1)})` : ''}`)
    if (c.isVideo && stats.videoViewsShort > 200) parts.push(`${plat === 'fadbook' ? 'hold rate' : '6s/2s'} ${fmtPct(m.holdRate, 1)}`)
    tips.push(`After ${fmtInt(stats.impressions)} impressions: ${parts.join(', ')}.`)
  }

  // 2) Diagnosis: biggest gaps first, weighted by how much they move the power score
  const gaps: { key: string; loss: number }[] = [
    { key: 'hookFit', loss: 0.35 * 0.45 * (1 - k.hookFit) + 0.3 * (1 - k.hookFit) / 3 },
    { key: 'hookText', loss: 0.35 * 0.3 * (1 - k.hookText) },
    { key: 'quality', loss: (0.35 * 0.25 + 0.25 * 0.25) * (1 - k.quality) },
    { key: 'formatFit', loss: 0.25 * 0.4 * (1 - k.formatFit) + 0.3 * (1 - k.formatFit) / 3 },
    { key: 'beats', loss: 0.25 * 0.35 * (1 - k.beats) },
    { key: 'angleFit', loss: 0.3 * (1 - k.angleFit) / 3 },
    { key: 'cta', loss: 0.1 * (1 - k.ctaScore) },
  ].filter(g => g.loss > 0.02).sort((a, b) => b.loss - a.loss)

  const maxTips = lvl >= 6 ? 3 : lvl >= 3 ? 2 : 1
  // the stop rate already beats the benchmark: a hook-fit gap then costs buyers, not thumb-stops
  const hookBench = plat === 'fadbook' ? BENCHMARKS.fadbook.hookRate : BENCHMARKS.tiktak.view2sRate
  const hookLooksFine = c.isVideo && stats.impressions >= 1000 && m.hookRate >= hookBench.avg
  for (const g of gaps.slice(0, maxTips)) {
    const t = gapTip(g.key, lvl, p, c, k, hookLooksFine)
    if (t) tips.push(t)
  }
  if (!gaps.length || (sc.hook > 0.75 && sc.fit > 0.8)) {
    tips.push(lvl >= 3
      ? 'This creative is strong. Scale it gently and make 2–3 variations of the same hook before it fatigues.'
      : 'This one is working. Keep it running and make more like it.')
  }
  if (c.shared && lvl >= 3) tips.push('Other stores run the same supplier footage, so this ad will tire out faster than original content.')
  return tips
}

function gapTip(key: string, lvl: number, p: ProductDef, c: Creative, k: ScoreBreakdown, hookLooksFine = false): string | null {
  const hn = hookName(c.hook)
  const fn = formatName(c.format)
  const an = angleName(c.angle)
  switch (key) {
    case 'hookFit': {
      if (hookLooksFine) {
        if (lvl <= 2) return 'The opening stops people, but maybe not the ones who buy. Test another opening.'
        if (lvl <= 5) return `The "${hn}" opener stops the scroll, but it may be stopping the wrong people: clicks and buyers lag behind. Keep the body and test a different hook type.`
      }
      if (lvl <= 2) return 'People scroll past in the first seconds. The opening may not suit this product.'
      if (lvl <= 5) return `The "${hn}" opener isn't resonating with this product's buyers. Keep the body and test a different hook type.`
      let t = `The "${hn}" hook is a weak match here: ${hookReason(p, c.hook)}. Keep the body, swap the first 3 seconds.`
      if (lvl >= 8) {
        const best = p.bestHooks.find(h => h !== c.hook)
        if (best) t += ` Winning ads in this category tend to open with a "${HOOKS[best].name}" style hook.`
      }
      return t
    }
    case 'hookText': {
      const a = hookTextAnalysis(p, c.hook, c.hookText)
      if (lvl <= 2) return 'The on-screen text could work harder.'
      if (a.issues.includes('empty')) return 'There is no on-screen hook text. Most people watch muted: add 3–12 words that call out the viewer or the problem.'
      const fixes: string[] = []
      if (a.issues.includes('generic')) fixes.push('drop salesy words like "sale" or "buy now"')
      if (a.issues.includes('caps')) fixes.push('stop shouting in all caps')
      if (a.issues.includes('long')) fixes.push('cut it to 12 words or fewer')
      if (a.issues.includes('short')) fixes.push('say a bit more (3–12 words)')
      if (lvl >= 6 && a.issues.includes('irrelevant')) fixes.push('name the problem or the product so the right people stop')
      if (lvl >= 6 && a.issues.includes('impersonal')) fixes.push('speak to the viewer ("you", a question, or a number)')
      if (lvl >= 6 && a.issues.includes('off_type')) fixes.push(`make the text match the "${hn}" style (e.g. "${HOOKS[c.hook].textPatterns[0]}")`)
      if (!fixes.length) return lvl >= 6 ? 'The hook text is fine, but not scroll-stopping. Test two sharper variations.' : null
      return `Hook text: ${fixes.slice(0, lvl >= 6 ? 3 : 2).join('; ')}.`
    }
    case 'quality': {
      if (lvl <= 2) return 'The video looks rough.'
      if (c.producer === 'supplier_edit') return 'Re-cut supplier footage caps how good this can look. Film your own or hire a creator.'
      return lvl >= 6
        ? `Production quality (${Math.round(k.quality * 100)}/100) is holding it back. Better light (ring light or softbox), a newer phone camera and clean audio, or a pro UGC creator, would lift hook and hold.`
        : 'Production quality is holding it back: better lighting, camera or audio (or a creator) would help.'
    }
    case 'formatFit': {
      if (lvl <= 2) return 'The format may not be the best way to show this product.'
      if (lvl <= 5) return `"${fn}" isn't the strongest format for this product. Try one that shows it being used.`
      return `"${fn}" is a weak fit: ${formatReason(p, c.format)}.`
    }
    case 'beats': {
      const iss = beatsAnalysis(p, c).issues
      if (lvl <= 2) return 'Viewers drop off before the end. The story structure needs work.'
      if (!iss.length) return null
      return `Script: ${iss.slice(0, lvl >= 6 ? 3 : 1).map(i => i.text.replace(/\.$/, '')).join('. ')}.`
    }
    case 'angleFit': {
      if (lvl <= 2) return 'The message may not match why people buy this.'
      if (lvl <= 5) return `The "${an}" angle isn't what motivates buyers of this product.`
      return `The "${an}" angle misses: ${angleReason(p, c.angle)}. ${ANGLES[c.angle] ? 'Lead with the outcome buyers actually want.' : ''}`.trim()
    }
    case 'cta': {
      if (lvl <= 2) return 'It\'s not clear what viewers should do next.'
      return 'Weak close: end with the offer and an explicit call to action ("Tap Shop Now to get yours").'
    }
  }
  return null
}

/** Formats available per producer (for UI validation & briefs). */
export function formatAllowed(format: FormatId, producer: Creative['producer']): boolean {
  const def = FORMATS[format]
  if (!def) return false
  return def.producers.includes(producer)
}
