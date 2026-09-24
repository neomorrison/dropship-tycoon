// "Rewrite with copywriter": what a hired copywriter (UpWorx staff) produces for a product
// page. Output quality follows copywriterQuality(s) (0.55–1): better writers answer more
// buyer objections, write tighter structure and add a "how it works" block. The copy is
// deterministic per product + revision so re-rolling gives a fresh take.
import type { Niche, ProductDef } from '../../../../core/types'
import type { FaqItem } from '../../../../data/sections'
import { slugHandle } from './draft'

export interface CopyRewrite {
  title: string
  descriptionHtml: string
  faq: FaqItem[]
  seo: { title: string; description: string; handle: string }
  /** objections this draft answers (for the editor's summary toast) */
  answered: number
  total: number
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
function shuffle<T>(r: () => number, arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)
const titleCase = (t: string) =>
  t.split(/\s+/).map(w => (/^[A-Z0-9-]{2,}$/.test(w) ? w : w.length <= 2 && /^(to|of|in|on|a|an|or|at)$/i.test(w) ? w.toLowerCase() : cap(w))).join(' ')

/** words copywriters avoid: medical/absolute claims and marketplace spam */
const RISKY = /\b(cure|heal|clinical|fda|doctor|miracle|detox|weight\s*loss|lose\s*weight|guaranteed|100%|permanent|upgrade|hot\s*sale|free\s*shipping|high[\s-]*quality|wholesale|brand\s*new)\b/i

const HOOKS: Record<Niche, string[]> = {
  pet: [
    'You love your pet. You don\'t love the mess, the hassle or the stress that comes with it. The {name} makes everyday pet care simple, so you can spend more time enjoying them.',
    'If you share your home with a furry best friend, you know the struggle. The {name} takes one of your least favorite chores and makes it quick and easy.',
  ],
  beauty: [
    'Your routine should feel like a treat, not a chore. The {name} brings a salon-level result to your bathroom counter in minutes, with no appointment and no stress.',
    'You deserve to feel confident in your skin. The {name} makes your self-care routine simple, gentle and something you\'ll actually look forward to.',
  ],
  home: [
    'Your home should work for you, not the other way around. The {name} takes a daily annoyance off your list, so you can relax and enjoy your space.',
    'Small upgrades make the biggest difference at home. The {name} is the easy fix you\'ll wonder how you ever lived without.',
  ],
  kitchen: [
    'Cooking should be the fun part of your day. The {name} saves you time and mess, so you can enjoy the food, not the cleanup.',
    'You don\'t need a bigger kitchen, you need smarter tools. The {name} makes everyday prep quick, clean and simple.',
  ],
  fitness: [
    'Getting fit shouldn\'t need a gym membership or a lot of your time. The {name} fits into your day, so you stay consistent and actually enjoy the progress.',
    'Your workouts work harder when your gear does too. The {name} makes training simple, comfortable and easy to stick with.',
  ],
  wellness: [
    'You carry a lot every day. The {name} gives you a few calm minutes of relief whenever you need them, at home or on the go.',
    'Feeling your best shouldn\'t be complicated. The {name} makes it easy to relax, unwind and take care of yourself.',
  ],
  car: [
    'You spend hours in your car, so it should work for you. The {name} makes every drive a little easier, safer and less stressful.',
    'A small change that makes every trip better. The {name} keeps your car organized and your focus on the road.',
  ],
  gadgets: [
    'Some gadgets end up in a drawer. This isn\'t one of them. The {name} solves a real everyday problem, and you\'ll use it every single day.',
    'You want tech that just works. The {name} is simple to set up, easy to use and genuinely useful from day one.',
  ],
  baby: [
    'Parenting is hard enough. The {name} takes one worry off your plate, so you can focus on the moments that matter.',
    'Your little one deserves safe, gentle care, and you deserve a little peace of mind. The {name} makes it easy.',
  ],
  kids: [
    'Screen-free fun that keeps them busy and you smiling. The {name} is the kind of gift kids actually play with long after the box is gone.',
    'Looking for something your kids will love and you can feel good about? The {name} makes playtime creative, simple and fun.',
  ],
  fashion: [
    'Style and everyday comfort shouldn\'t be a trade-off. The {name} keeps you looking sharp and your essentials within reach.',
    'The piece you\'ll reach for every day. The {name} looks great, feels comfortable and makes your day a little easier.',
  ],
  outdoor: [
    'Make your outdoor space somewhere you actually want to be. The {name} is easy to set up and ready to enjoy in minutes.',
    'Get outside more, worry less. The {name} is built for real life outdoors and simple enough to use anywhere.',
  ],
}

const BULLET_TEMPLATES = [
  '{Kw}: get it done in seconds, not minutes, with no hassle.',
  '{Kw}: simple enough to use every day, so you actually will.',
  '{Kw}: designed to save you time, money and stress.',
  '{Kw}: gentle, safe and easy on everything it touches.',
  '{Kw}: compact and lightweight, so you can take it anywhere.',
  '{Kw}: built to last, so you never have to buy another one.',
  '{Kw}: you\'ll notice the difference from the very first use.',
  '{Kw}: quick to clean and ready to go again whenever you are.',
]

type Topic = 'shipping' | 'works' | 'safety' | 'fit' | 'returns' | 'clean' | 'battery' | 'noise' | 'quality' | 'value' | 'ease' | 'general'
function topicOf(q: string): Topic {
  const t = q.toLowerCase()
  if (/ship|deliver|arriv|how long until|when will/.test(t)) return 'shipping'
  if (/refund|return|money back|guarantee|don't like|do not like/.test(t)) return 'returns'
  if (/safe|damage|scratch|hurt|toxic|burn|irritat|sensitive|harm|pain/.test(t)) return 'safety'
  if (/size|fit|big|small|dimension|compatible|measure|tall|large/.test(t)) return 'fit'
  if (/clean|wash|empty|dishwasher|hygien|refill/.test(t)) return 'clean'
  if (/battery|charge|charging|cordless|power|last on/.test(t)) return 'battery'
  if (/loud|noise|noisy|quiet/.test(t)) return 'noise'
  if (/quality|break|durable|flimsy|cheap|last\b|sturdy/.test(t)) return 'quality'
  if (/price|worth|expensive|better than|compared|vs\.?|instead/.test(t)) return 'value'
  if (/install|setup|set up|assemble|hard|difficult|how do i|how to|use it/.test(t)) return 'ease'
  if (/work|effective|result|legit|scam|really/.test(t)) return 'works'
  return 'general'
}

function answerFor(topic: Topic, q: string, def: ProductDef, name: string, win: [number, number] | null, freeShip: boolean): string {
  const spec = (k: RegExp) => Object.entries(def.specs).find(([key]) => k.test(key))?.[1]
  const size = spec(/size|dimension/i)
  const material = spec(/material/i)
  const battery = spec(/battery|capacity|charg/i)
  const shipWin = win ? `${win[0]}–${win[1]} days` : 'about two to three weeks'
  const noun = name.toLowerCase()
  switch (topic) {
    case 'shipping':
      return `Every order ships${freeShip ? ' free' : ''} with tracking and usually arrives in ${shipWin}. You'll get your tracking link by email as soon as it's on the way.`
    case 'returns':
      return 'Yes. You\'re covered by our 30-day money-back guarantee. If you\'re not happy, email us and we\'ll make it right with a refund or a replacement.'
    case 'safety':
      return `The ${noun} is designed to be gentle and safe for everyday use${material ? ` (${material})` : ''}. Follow the included instructions and it won't damage what it touches. If anything isn't right, our guarantee has you covered.`
    case 'fit':
      return size
        ? `It measures ${size}, which fits most everyday uses. Not sure? Email us before you order and we'll help you check, and returns are free within 30 days.`
        : 'It\'s designed to fit most everyday uses. Not sure? Email us a quick question before you order, and returns are easy within 30 days.'
    case 'clean':
      return 'Cleaning takes seconds: a quick rinse or wipe and it\'s ready to use again. No refills or special supplies needed.'
    case 'battery':
      return battery
        ? `It's rechargeable (${battery}) and one charge covers many uses. A USB cable is included.`
        : 'It\'s built for everyday use and easy to power up. Everything you need to get started is in the box.'
    case 'noise':
      return 'It\'s designed to run quietly, so you can use it any time without disturbing anyone.'
    case 'quality':
      return `It's made to last${material ? ` from ${material}` : ''} and tested before it ships. If it ever falls short, our 30-day guarantee protects you.`
    case 'value':
      return `Most people find the ${noun} pays for itself: it does the job better, lasts longer and saves you time. Try it risk-free for 30 days.`
    case 'ease':
      return 'It\'s ready to use in minutes with no tools and no complicated setup. Simple step-by-step instructions are included.'
    case 'works':
      return `Yes. The ${noun} was designed for exactly this. Give it a real try, and if it doesn't work for you, you get your money back.`
    default:
      return `Great question. The ${noun} is designed to make this simple for you. If you have any other questions, our support team replies within 24 hours.`
  }
}

function cleanName(def: ProductDef): string {
  return def.name.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Rewrite a product page. `quality` 0..1 (copywriterQuality), `revision` re-rolls wording,
 * `window` is the honest delivery window, `freeShip` whether the store ships free.
 */
export function copywriterRewrite(def: ProductDef, opts: { quality: number; revision: number; window: [number, number] | null; freeShip: boolean }): CopyRewrite {
  const q = Math.max(0, Math.min(1, opts.quality))
  const r = rng(`${def.id}:copy:${opts.revision}`)
  const name = cleanName(def)
  const nameWords = new Set(name.toLowerCase().split(/\W+/))
  const kws = def.keywords
    .map(k => k.trim())
    .filter(k => k && !RISKY.test(k) && !k.toLowerCase().split(/\W+/).every(w => !w || nameWords.has(w)))
  const kwOrder = shuffle(r, kws)

  // ---- title: "<Name>: <Benefit> & <Benefit>" within 25–70 characters ----
  const phrases = kwOrder.filter(k => /[\s-]/.test(k) && k.length <= 24 && !/^(at|for|in|on|with|to)\b|gift|stuffer|love it|\d/i.test(k))
  const adjectives = kwOrder.filter(k => !/[\s-]/.test(k) && !/ly$/i.test(k) && /(able|free|proof|less|ing|ed|ful)$|^(quiet|portable|cordless|compact|gentle|soft|safe|reusable|washable|waterproof|rechargeable|wireless|foldable|durable|silent|precise|healthy|fresh|warm|cozy)$/i.test(k))
  const fits = (t: string) => t.length <= 70
  let title = name
  const two = (a?: string, b?: string) => (a && b ? `${name}: ${titleCase(a)} & ${titleCase(b)}` : '')
  const one = (a?: string) => (a ? `${name}: ${titleCase(a)}` : '')
  const candidates = [
    q >= 0.72 ? two(phrases[0], phrases[1]) : '',
    one(phrases[0]),
    two(adjectives[0], adjectives[1]),
    one(adjectives[0]),
  ].filter(t => t && fits(t))
  if (candidates.length) title = candidates[0]
  if (title.length > 70) title = name.slice(0, 70)
  if (title.length < 25) title = `${title}${title === name ? ':' : ' for'} ${pick(r, ['Made for Everyday Life', 'Your Home Essential', 'Easy Everyday Use'])}`.slice(0, 70)

  // ---- objections answered (better writers cover more) ----
  const coverShare = Math.max(0.4, Math.min(1, (q - 0.5) * 2.4))
  const nAnswer = Math.max(1, Math.round(def.objections.length * coverShare))
  const answered = def.objections.slice(0, nAnswer)

  // ---- description ----
  const hook = pick(r, HOOKS[def.niche] ?? HOOKS.home).replace('{name}', name)
  const nBullets = q >= 0.85 ? 5 : q >= 0.7 ? 4 : 3
  const templates = shuffle(r, BULLET_TEMPLATES)
  const bulletKws = [...phrases, ...adjectives, ...kwOrder.filter(k => /[\s-]/.test(k) && !phrases.includes(k))].filter((k, i, a) => a.indexOf(k) === i)
  const bullets = bulletKws.slice(0, nBullets).map((k, i) => {
    const t = templates[i % templates.length]
    const [head, ...rest] = t.replace('{Kw}', cap(k)).split(': ')
    return `<li><strong>${esc(head)}:</strong> ${esc(rest.join(': '))}</li>`
  })
  const FILLERS: [string, string][] = [
    ['Easy to use', 'simple from the very first use, no learning curve.'],
    ['Made to last', 'built for everyday life, so you never have to replace it.'],
    ['Saves you time', 'get it done in minutes and get on with your day.'],
    ['Mess-free', 'no hassle, no clean-up stress.'],
    ['Loved by customers', 'the kind of little upgrade people tell their friends about.'],
  ]
  for (const [head, text] of shuffle(r, FILLERS)) {
    if (bullets.length >= Math.max(3, nBullets)) break
    bullets.push(`<li><strong>${esc(head)}:</strong> ${esc(text)}</li>`)
  }
  const parts: string[] = []
  parts.push(`<p>${esc(hook)}</p>`)
  parts.push(`<h3>Why you'll love it</h3>`)
  parts.push(`<ul>${bullets.join('')}</ul>`)
  if (q >= 0.8) {
    parts.push('<h3>How it works</h3>')
    parts.push(`<p>${esc(`Take it out of the box and you're ready to go in minutes. Use it whenever you need it, clean it in seconds, and enjoy the results every day.`)}</p>`)
  }
  if (q >= 0.66 && answered.length) {
    const qa = answered.slice(0, q >= 0.9 ? 3 : 2).map(o => {
      const a = answerFor(topicOf(o), o, def, name, opts.window, opts.freeShip)
      return `<p><strong>${esc(o)}</strong> ${esc(a)}</p>`
    })
    parts.push('<h3>Your questions, answered</h3>', ...qa)
  }
  const shipText = opts.window
    ? `Every order ships${opts.freeShip ? ' free' : ''} with tracking and arrives in ${opts.window[0]}–${opts.window[1]} days.`
    : `Every order ships${opts.freeShip ? ' free' : ''} with tracking.`
  if (q >= 0.62) {
    parts.push('<h3>Shipping &amp; guarantee</h3>')
    parts.push(`<p>${esc(`${shipText} Try it for 30 days: if you don't love it, we'll refund you. No questions asked.`)}</p>`)
  } else {
    parts.push(`<p>${esc(shipText)}</p>`)
  }
  const descriptionHtml = parts.join('')

  // ---- FAQ ----
  const faq: FaqItem[] = answered.map(o => ({ q: o.endsWith('?') ? o : `${o}?`, a: answerFor(topicOf(o), o, def, name, opts.window, opts.freeShip) }))
  if (!answered.some(o => topicOf(o) === 'shipping')) {
    faq.push({ q: 'How long does shipping take?', a: answerFor('shipping', '', def, name, opts.window, opts.freeShip) })
  }
  if (q >= 0.7 && !answered.some(o => topicOf(o) === 'returns')) {
    faq.push({ q: 'What if I don\'t like it?', a: answerFor('returns', '', def, name, opts.window, opts.freeShip) })
  }

  const metaDesc = `${hook.split('. ')[0].replace(/\.$/, '')}. ${shipText}`.slice(0, 158)
  return {
    title,
    descriptionHtml,
    faq,
    seo: { title: title.slice(0, 70), description: metaDesc, handle: slugHandle(name) },
    answered: answered.length,
    total: def.objections.length,
  }
}
