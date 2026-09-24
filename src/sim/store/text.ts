// Heuristic copy analysis for the page grader: word counts, bullets, headings,
// benefit vs feature vocabulary, "you" language, supplier-copy similarity
// (token Jaccard + 3-word shingles), spam/claim phrases, objection coverage.
// Pure functions, no game state.
import type { CopyMetrics, ProductDef } from '../../core/types'

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does doing for from had has have he her his how i if in into is it its ' +
    'just me more most my no not of on or our out over own she so some such than that the their them then there these they ' +
    'this those through to too under up very was we were what when where which while who why will with would you your yours ' +
    'yourself about after again all also am any because before being below between both each few further here itself let ' +
    'many much must off once only other same should until upon us via whom get got really one'
  ).split(' '),
)

/** Question/filler words ignored when matching objections. */
const OBJECTION_FILLER = new Set([
  'really', 'actually', 'does', 'do', 'will', 'can', 'is', 'it', 'work', 'works', 'my', 'long', 'much', 'many', 'way',
  "doesn't", "don't", "isn't", "won't", "can't", "it's", "i'm", "i'll", 'take', 'takes', 'get', 'gets', 'come', 'comes',
  'make', 'makes', 'need', 'needs', 'use', 'using', 'used', 'happen', 'happens', 'thing', 'item', 'product', 'buy', 'order',
])

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

/** Plain text from limited HTML (p, ul, ol, li, strong, em, h3, br). Block ends become newlines. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-6]|div|ul|ol)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim()
}

export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) ?? []
}

/** Tiny English stemmer (good enough for matching benefit words and objections). */
export function stem(w: string): string {
  let x = w.toLowerCase().replace(/['’]s$/, '')
  if (x.length > 5 && x.endsWith('ies')) x = x.slice(0, -3) + 'y'
  else if (x.length > 5 && x.endsWith('ing')) x = x.slice(0, -3)
  else if (x.length > 4 && x.endsWith('ed')) x = x.slice(0, -2)
  else if (x.length > 4 && x.endsWith('ly')) x = x.slice(0, -2)
  else if (x.length > 4 && /(ches|shes|sses|xes|zes)$/.test(x)) x = x.slice(0, -2)
  else if (x.length > 3 && x.endsWith('s') && !x.endsWith('ss') && !x.endsWith('us')) x = x.slice(0, -1)
  if (x.length > 4 && x.endsWith('e')) x = x.slice(0, -1)
  return x
}

/** Content-token set (stopwords removed, stemmed). */
export function contentSet(text: string): Set<string> {
  const out = new Set<string>()
  for (const w of words(text)) if (!STOPWORDS.has(w) && w.length > 1) out.add(stem(w))
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}
/** |a ∩ b| / |a| */
export function containment(a: Set<string>, b: Set<string>): number {
  if (!a.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / a.size
}

export function shingles(tokens: string[], n = 3): Set<string> {
  const out = new Set<string>()
  if (tokens.length < n) {
    if (tokens.length) out.add(tokens.join(' '))
    return out
  }
  for (let i = 0; i + n <= tokens.length; i++) out.add(tokens.slice(i, i + n).join(' '))
  return out
}

// ---- vocabularies ----
/** Generic benefit/outcome vocabulary (stems). Product keywords are added per product. */
const BENEFIT_WORDS = [
  'easy', 'easily', 'effortless', 'save', 'saves', 'finally', 'never', 'comfortable', 'comfort', 'instantly', 'instant', 'safe',
  'gentle', 'quiet', 'portable', 'love', 'enjoy', 'relax', 'perfect', 'protect', 'fast', 'quick', 'simple', 'clean', 'fresh',
  'soft', 'durable', 'reusable', 'washable', 'confidence', 'confident', 'stress', 'peace', 'healthy', 'beautiful', 'cozy',
  'hassle', 'mess', 'smooth', 'secure', 'lightweight', 'compact', 'convenient', 'results', 'glow', 'calm', 'happy', 'fun',
  'relief', 'spotless', 'brighter', 'anywhere', 'everyday', 'seconds', 'minutes', 'premium', 'sturdy', 'non-toxic', 'bpa-free',
  'cordless', 'rechargeable', 'hands-free', 'painless', 'effortlessly', 'tangle', 'stylish', 'versatile', 'long-lasting',
  'lasting', 'upgrade', 'transform', 'enjoying', 'guaranteed', 'worry', 'time', 'energy', 'money',
]
const BENEFIT_STEMS = new Set(BENEFIT_WORDS.map(stem))
export const isBenefitWord = (w: string) => BENEFIT_STEMS.has(stem(w))

/** Spec-sheet/feature-only vocabulary typical of supplier copy. */
const FEATURE_WORDS = new Set(
  [
    'material', 'abs', 'pp', 'pvc', 'specification', 'specifications', 'package', 'include', 'includes', 'included', 'size',
    'weight', 'voltage', 'battery', 'capacity', 'mah', 'cm', 'mm', 'kg', 'dimension', 'dimensions', 'color', 'colour', 'model',
    'item', 'type', 'note', 'manual', 'measurement', 'error', 'difference', 'pcs', 'pc', 'power', 'input', 'output', 'rated',
    'frequency', 'hz', 'watt', 'certification', 'origin', 'mainland', 'brand', 'name', 'feature', 'features', 'quantity',
  ].map(stem),
)

/** Supplier/spam tells. [regex, label] */
const SPAM_PATTERNS: [RegExp, string][] = [
  [/\b(?:20\d\d\s*new|new\s*20\d\d)\b/i, '"2026 New"'],
  [/\bhot\s*sale\b/i, '"Hot Sale"'],
  [/\bfree\s*shipping\b/i, '"Free Shipping"'],
  [/\bhigh[\s-]*quality\b/i, '"High Quality"'],
  [/\b(?:drop\s*ship(?:ping)?|dropship(?:ping)?)\b/i, '"Dropshipping"'],
  [/\bwholesale\b/i, '"Wholesale"'],
  [/\bbest\s*(?:price|seller)\b/i, '"Best price/seller"'],
  [/\b(?:100%\s*)?brand\s*new\b/i, '"Brand new"'],
  [/\bdear\s*(?:customer|friend|buyer)s?\b/i, '"Dear customer"'],
  [/\bplease\s*allow\b/i, '"Please allow…"'],
  [/\bmanual\s*measurement\b/i, '"Manual measurement"'],
  [/\bcolou?r\s*difference\b/i, '"Color difference"'],
  [/\bpackage\s*includ(?:e|es|ed|ing)\b/i, '"Package include"'],
  [/\bfactory\b/i, '"Factory"'],
  [/\b\d+\s*(?:pcs|pc)\b/i, '"pcs"'],
  [/\bupgraded?\b/i, '"Upgraded"'],
]
/** Only these count against a title (descriptions may say "upgrade"/"free shipping" legitimately). */
export const TITLE_ONLY_SPAM = new Set(['"Free Shipping"', '"Upgraded"', '"High Quality"', '"Best price/seller"'])

const CLAIM_PATTERNS: [RegExp, string][] = [
  [/\bcures?\b/i, 'cure'],
  [/\bheals?\b/i, 'heal'],
  [/\bclinically[\s-]*proven\b/i, 'clinically proven'],
  [/\bfda[\s-]*(?:approved|cleared)\b/i, 'FDA approved'],
  [/\bdoctors?[\s-]*recommended\b/i, 'doctor recommended'],
  [/\bguaranteed\s*results\b/i, 'guaranteed results'],
  [/\bmiracle\b/i, 'miracle'],
  [/\b(?:lose\s*weight|weight\s*loss)\b/i, 'weight loss'],
  [/\bdetox(?:ify|es)?\b/i, 'detox'],
  [/\breverses?\s*(?:aging|ageing|hair\s*loss)\b/i, 'reverses aging'],
  [/\bpermanent(?:ly)?\s*(?:results|removes?|hair\s*removal)\b/i, 'permanent results'],
  [/\b100%\s*effective\b/i, '100% effective'],
]

export function findSpam(text: string, titleMode = false): string[] {
  const out: string[] = []
  for (const [re, label] of SPAM_PATTERNS) {
    if (!titleMode && TITLE_ONLY_SPAM.has(label)) continue
    if (re.test(text)) out.push(label)
  }
  return out
}
export function findClaims(text: string): string[] {
  return CLAIM_PATTERNS.filter(([re]) => re.test(text)).map(([, l]) => l)
}

// ---- supplier similarity ----
const supplierCache = new Map<string, { titleSet: Set<string>; allShingles: Set<string>; allSet: Set<string>; titleNorm: string }>()
function supplierIndex(def: ProductDef) {
  let c = supplierCache.get(def.id)
  if (!c) {
    const all = `${def.supplierTitle}\n${def.supplierDescription}`
    c = {
      titleSet: contentSet(def.supplierTitle),
      allShingles: shingles(words(all), 3),
      allSet: contentSet(all),
      titleNorm: words(def.supplierTitle).join(' '),
    }
    supplierCache.set(def.id, c)
  }
  return c
}

/** 0..1: how much a title is the supplier's keyword-stuffed title. */
export function titleSimilarity(title: string, def: ProductDef): number {
  const idx = supplierIndex(def)
  const t = contentSet(title)
  let sim = jaccard(t, idx.titleSet)
  const norm = words(title).join(' ')
  if (norm.length >= 20 && idx.titleNorm.includes(norm)) sim = Math.max(sim, 0.8)
  return sim
}
/** Share of the title's words taken from the supplier title (keyword-list detector). */
export function titleContainment(title: string, def: ProductDef): number {
  return containment(contentSet(title), supplierIndex(def).titleSet)
}

/** 0..1: how much of the description is supplier copy (3-word shingle containment, token overlap). */
export function descriptionSimilarity(text: string, def: ProductDef): number {
  const idx = supplierIndex(def)
  const toks = words(text)
  if (toks.length < 3) return 0
  const sh = shingles(toks, 3)
  const shingleC = containment(sh, idx.allShingles)
  const tokJ = jaccard(contentSet(text), idx.allSet)
  return Math.max(shingleC, tokJ * 0.8)
}

// ---- objections ----
const OBJECTION_TOPICS: { trigger: string[]; evidence: string[] }[] = [
  { trigger: ['ship', 'shipping', 'deliver', 'delivery', 'arrive', 'arrival', 'fast', 'when'], evidence: ['ship', 'deliver', 'arriv', 'track', 'dispatch', 'business day', 'days'] },
  { trigger: ['work', 'works', 'effective', 'result', 'results', 'legit', 'scam', 'gimmick'], evidence: ['work', 'result', 'proven', 'tested', 'guarantee', 'money-back', 'money back', 'review'] },
  { trigger: ['safe', 'safety', 'harm', 'hurt', 'damage', 'scratch', 'toxic', 'burn', 'irritat', 'sensitive'], evidence: ['safe', 'gentle', 'harmless', 'non-toxic', 'bpa', 'scratch', 'damage', 'sensitive', 'tested'] },
  { trigger: ['size', 'fit', 'fits', 'big', 'small', 'dimensions', 'compatible'], evidence: ['size', 'fit', 'inch', 'cm', 'measure', 'universal', 'compatible', 'dimension'] },
  { trigger: ['return', 'refund', 'money', 'guarantee', 'risk'], evidence: ['guarantee', 'refund', 'return', 'money-back', 'money back', 'risk-free', 'risk free'] },
  { trigger: ['clean', 'wash', 'washing', 'dishwasher', 'hygiene', 'hygienic'], evidence: ['clean', 'wash', 'rinse', 'dishwasher', 'wipe'] },
  { trigger: ['battery', 'charge', 'charging', 'cordless', 'power', 'last'], evidence: ['battery', 'charge', 'usb', 'hour', 'rechargeable', 'cordless'] },
  { trigger: ['loud', 'noise', 'noisy', 'quiet'], evidence: ['quiet', 'noise', 'silent', 'db', 'whisper'] },
  { trigger: ['quality', 'break', 'breaks', 'durable', 'cheap', 'flimsy', 'last'], evidence: ['durable', 'sturdy', 'quality', 'last', 'built', 'solid', 'warranty'] },
  { trigger: ['price', 'worth', 'expensive', 'cost'], evidence: ['worth', 'value', 'save', 'price', 'instead of', 'replace'] },
  { trigger: ['use', 'install', 'setup', 'assemble', 'complicated', 'hard', 'difficult'], evidence: ['easy', 'simple', 'minute', 'second', 'step', 'no tools', 'install'] },
  { trigger: ['pet', 'dog', 'cat', 'fur', 'hair'], evidence: ['pet', 'dog', 'cat', 'fur', 'hair'] },
]

/** Does `text` answer this buyer objection? */
export function objectionCovered(objection: string, text: string): boolean {
  const lower = text.toLowerCase()
  const ow = words(objection)
  const owStems = new Set(ow.map(stem))
  const topics = OBJECTION_TOPICS.filter(t => t.trigger.some(tr => owStems.has(stem(tr)) || ow.includes(tr)))
  // a topic matched by generic words only ("work") must also show the objection's specific nouns
  for (const t of topics) {
    if (t.evidence.some(e => lower.includes(e))) {
      const specific = ow.filter(w => !STOPWORDS.has(w) && !OBJECTION_FILLER.has(w) && !t.trigger.includes(w) && w.length > 3)
      if (!specific.length) return true
      const textSet = contentSet(text)
      if (specific.some(w => textSet.has(stem(w)))) return true
    }
  }
  const key = [...owStems].filter(w => !STOPWORDS.has(w) && !OBJECTION_FILLER.has(w) && w.length > 2)
  if (!key.length) return false
  const textSet = contentSet(text)
  const hit = key.filter(k => textSet.has(k)).length
  return hit / key.length >= 0.5
}

// ---- promised delivery parsing ----
/** Finds "7–12 business days" style delivery promises. Returns calendar days. */
export function parsePromisedDays(text: string): [number, number] | null {
  const re = /(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*(business|working)?\s*days?/gi
  let m: RegExpExecArray | null
  const lower = text.toLowerCase()
  while ((m = re.exec(text))) {
    const start = Math.max(0, m.index - 80)
    const ctx = lower.slice(start, m.index + m[0].length + 40)
    if (!/(ship|deliver|arriv|door|dispatch|transit)/.test(ctx)) continue
    let a = Number(m[1])
    let b = Number(m[2])
    if (!(a > 0 && b >= a && b <= 90)) continue
    if (m[3]) {
      a = Math.round(a * 1.4)
      b = Math.round(b * 1.4)
    }
    return [a, b]
  }
  return null
}

// ---- full description analysis ----
export interface DescriptionAnalysis extends Omit<CopyMetrics, 'titleSimilarity' | 'objections'> {
  text: string
}

export function analyzeDescription(html: string, def: ProductDef | null): DescriptionAnalysis {
  const text = stripHtml(html)
  const toks = words(text)
  const bullets = (html.match(/<li[\s>]/gi) ?? []).length
  const headings = (html.match(/<h[1-6][\s>]/gi) ?? []).length
  const pBlocks = html.match(/<p[\s>][\s\S]*?<\/p>/gi) ?? []
  const paraWords = pBlocks.map(b => words(stripHtml(b)).length).filter(n => n > 0)
  let paragraphs = paraWords.length
  let avgParagraphWords = paragraphs ? paraWords.reduce((a, b) => a + b, 0) / paragraphs : 0
  if (!paragraphs && toks.length) {
    // no <p> blocks: count blank-line/br separated chunks of the non-list text
    const chunks = stripHtml(html.replace(/<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>/gi, '')).split(/\n+/).map(c => words(c).length).filter(n => n > 0)
    paragraphs = chunks.length
    avgParagraphWords = paragraphs ? chunks.reduce((a, b) => a + b, 0) / paragraphs : 0
  }
  const youCount = toks.filter(w => w === 'you' || w === 'your' || w === "you're" || w === 'yours' || w === 'yourself').length
  const lower = text.toLowerCase()

  const benefit = new Set<string>()
  const stems = toks.map(stem)
  stems.forEach((st, i) => {
    if (BENEFIT_STEMS.has(st)) benefit.add(toks[i])
  })
  const keywordHits: string[] = []
  for (const kw of def?.keywords ?? []) {
    const k = kw.toLowerCase().trim()
    if (!k) continue
    const kWords = words(k)
    const hit = kWords.length > 1 ? lower.includes(k) || kWords.every(w => stems.includes(stem(w))) : stems.includes(stem(k))
    if (hit) {
      keywordHits.push(kw)
      benefit.add(k)
    }
  }
  const featureWords = stems.filter(st => FEATURE_WORDS.has(st)).length

  return {
    text,
    words: toks.length,
    bullets,
    headings,
    paragraphs,
    avgParagraphWords: Math.round(avgParagraphWords * 10) / 10,
    youCount,
    benefitWords: [...benefit],
    keywordHits,
    featureWords,
    supplierSimilarity: def ? descriptionSimilarity(text, def) : 0,
    mentionsGuarantee: /(money[\s-]*back|guarantee|risk[\s-]*free|\b\d+[\s-]*day returns?\b|full refund|free returns?)/i.test(text),
    mentionsShipping: /(ship|deliver|arriv|tracking|dispatch)/i.test(text),
    spamTerms: findSpam(text),
    claimTerms: findClaims(text),
  }
}
