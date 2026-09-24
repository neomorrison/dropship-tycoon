// Creative production: briefs → producers (self / supplier edit / UGC creator / agency / staff),
// the weekly creator marketplace, and completion (quality + hidden scoring).
import type { Creative, CreativeProducer, CreativeState, FormatId, GameState, HookId, ProductDef, UgcCreator } from '../../core/types'
import type { CreativeBrief } from './inputs'
import { clamp, randInt, randRange, shuffle, weightedPick } from '../../core/rng'
import { dayOf, weekday } from '../../core/time'
import { pay } from '../../core/money'
import { notify } from '../../core/notify'
import { productImage } from '../../core/assets'
import { FORMATS, SUPPLIER_EDIT_FORMATS, formatName, hookName } from '../../data/creativeTaxonomy'
import { BENCHMARKS } from '../../data/benchmarks'
import { CREATOR_LISTINGS_PER_WEEK, CREATOR_PROFILES, CREATOR_TIERS, creatorProfile } from '../../data/creators'
import { uid } from '../../core/ids'
import { enqueueActivity, productivity } from '../life'
import { takeInventory } from '../market'
import { findCreative, fmtMoney, productDef, skillLevel, today } from './shared'
import { scoreCreative } from './scoring'

// ---------------------------------------------------------------------------
// Gear & apartment effects on self-shot footage (SPEC §3)
// ---------------------------------------------------------------------------
const GEAR_FILM_BONUS: Record<string, number> = {
  'phone-pro': 0.12, 'ring-light': 0.05, 'softbox-kit': 0.1, 'mirrorless-camera': 0.12, workstation: 0.03,
}
const TALKING_GEAR_BONUS: Record<string, number> = { 'lav-mic': 0.04 }
const APARTMENT_FILMING_BONUS = [0, 0, 0.03, 0.06, 0.08, 0.1]

const SELF_FILM_MINUTES = 180
const SUPPLIER_EDIT_MINUTES = Math.round(BENCHMARKS.creatives.supplierEditHours * 60)

function equippedIds(s: GameState): string[] {
  return Object.values(s.gear?.equipped ?? {}).filter((x): x is string => !!x)
}

/** Quality a self-shot creative would have right now (before noise). */
export function selfShotQuality(s: GameState, format: FormatId): number {
  let q = 0.3 + 0.03 * skillLevel(s, 'creative')
  for (const g of equippedIds(s)) {
    q += GEAR_FILM_BONUS[g] ?? 0
    if (FORMATS[format]?.talking) q += TALKING_GEAR_BONUS[g] ?? 0
  }
  q += APARTMENT_FILMING_BONUS[s.home?.tier ?? 0] ?? 0
  if (s.player.mood < 30) q -= 0.1
  if (s.player.burnoutDays > 0) q -= 0.15
  return clamp(q, 0.1, 0.9)
}
export function supplierEditQuality(s: GameState): number {
  return Math.min(0.5, 0.25 + 0.02 * skillLevel(s, 'creative'))
}

/** Quality band the player can expect from a producer (for the brief UI). */
export function expectedCreativeQuality(s: GameState, producer: CreativeProducer, format: FormatId, creatorId?: string | null): [number, number] {
  switch (producer) {
    case 'self': { const q = selfShotQuality(s, format); return [Math.max(0.1, q - 0.04), Math.min(0.9, q + 0.04)] }
    case 'supplier_edit': { const q = supplierEditQuality(s); return [q - 0.03, q + 0.02] }
    case 'ugc': {
      const c = s.creatives.creators.find(x => x.id === creatorId)
      return c ? [c.quality[0], c.quality[1]] : [0.45, 0.9]
    }
    case 'agency': return [0.8, 0.95]
    case 'staff': {
      const m = s.staff.members.find(x => x.id === creatorId) ?? s.staff.members.find(x => x.role === 'ugc_creator')
      const q = m ? Math.min(0.9, 0.45 + 0.05 * m.skill) : 0.5
      return [q - 0.05, q + 0.05]
    }
  }
}

/** Minutes the self-film / supplier-edit activity will take. */
export function productionMinutes(s: GameState, producer: CreativeProducer): number {
  const prod = safeProductivity(s)
  if (producer === 'self') {
    const phonePro = equippedIds(s).includes('phone-pro') ? 0.9 : 1
    return Math.round(SELF_FILM_MINUTES * prod * phonePro)
  }
  if (producer === 'supplier_edit') return Math.round(SUPPLIER_EDIT_MINUTES * prod)
  return 0
}
function safeProductivity(s: GameState): number {
  const p = productivity(s)
  return Number.isFinite(p) && p > 0 ? p : 1
}

// ---------------------------------------------------------------------------
// Agency quotes & copy
// ---------------------------------------------------------------------------
function hashFrac(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10007) / 10007
}
/** Price & turnaround the agency quotes this week for a product (stable within a week). */
export function agencyQuote(s: GameState, catalogId: string): { price: number; days: [number, number] } {
  const [lo, hi] = BENCHMARKS.creatives.agencyCost3Pack
  const week = Math.floor(today(s) / 7)
  const f = hashFrac(`${catalogId}:${week}`)
  const price = Math.round((lo + (hi - lo) * f) / 50) * 50
  return { price, days: [...BENCHMARKS.creatives.agencyDeliveryDays] as [number, number] }
}

const CONNECTORS = new Set(['&', 'and', 'with', 'for', 'of', 'the', 'a', 'to', 'in'])
/** Short, natural product reference for ad copy ("pet hair remover roller" → "hair remover roller"). */
export function shortName(p: ProductDef): string {
  let base = p.name.replace(/\([^)]*\)/g, ' ').split(/\s+(?:with|for)\s+/i)[0]
  let words = base.split(/\s+/).filter(Boolean)
  if (words.length > 4) words = words.slice(-3)
  while (words.length > 1 && CONNECTORS.has(words[0].toLowerCase())) words = words.slice(1)
  base = words.map(w => (/^[A-Z0-9-]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ')
  return base
}
const isPlural = (n: string) => /[^s]s$/i.test(n.split(' ').slice(-1)[0] ?? '')
const withArticle = (n: string) => (isPlural(n) ? n : `${/^[aeiou]/i.test(n) && !/^(u[sn]i|one)/i.test(n) ? 'an' : 'a'} ${n}`)
// {n} = short product name, {an} = with article ("an ice roller")
const AGENCY_HOOKS: Record<HookId, [string, string]> = {
  problem_callout: ['Tired of doing it the hard way? Try the {n}', 'If you hate this daily hassle, watch the {n}'],
  pov: ['POV: you finally found the fix: {an}', 'POV: your {n} arrived and you get it now'],
  tiktak_made_me_buy: ['TikTak made me buy this {n}. Worth it?', 'Testing the viral {n} so you don\'t have to'],
  before_after: ['Before vs after one use of the {n}', 'Wait for the after: {n} test'],
  asmr: ['Sound on 🔊 your new favorite {n} sound', 'The most satisfying {n} sound you will hear today'],
  shock_stat: ['The {n} 40,000 people swear by (and why)', 'You lose 40 minutes a week without {an}'],
  unboxing: ['It finally came: unboxing the {n}', 'What I ordered vs what I got: {n}'],
  us_vs_them: ['The $80 version vs the {n}: you decide', 'Why I switched to {an} for good'],
  testimonial: ['"I was skeptical, but my {n} won me over"', '"Why didn\'t anyone tell me about the {n} sooner?"'],
  gift_idea: ['Gift idea for the person who has everything: {an}', 'The gift your people will actually use: {an}'],
  life_hack: ['The {n} hack nobody told you about', 'Save this: the {n} trick you need'],
  controversial: ['Unpopular opinion: you don\'t need anything but {an}', 'Nobody wants to hear this, but you need {an}'],
  question: ['Do you still struggle without {an}?', 'Why does nobody talk about the {n}?'],
}
export function agencyHookText(p: ProductDef, hook: HookId, variant: 0 | 1): string {
  const n = shortName(p)
  return AGENCY_HOOKS[hook][variant].replace('{an}', withArticle(n)).replace('{n}', n)
}

// ---------------------------------------------------------------------------
// Creator marketplace
// ---------------------------------------------------------------------------
function makeCreator(s: GameState, profileId: string, expiresDay: number): UgcCreator | null {
  const prof = creatorProfile(profileId)
  if (!prof) return null
  const tierKey = weightedPick(s, prof.tiers, t => CREATOR_TIERS[t].weight)
  const t = CREATOR_TIERS[tierKey]
  const qMid = randRange(s, t.quality[0] + 0.04, t.quality[1] - 0.04)
  const quality: [number, number] = [+(Math.max(t.quality[0], qMid - 0.06)).toFixed(2), +(Math.min(t.quality[1], qMid + 0.06)).toFixed(2)]
  const d0 = randInt(s, t.deliveryDays[0], t.deliveryDays[1] - 1)
  return {
    id: prof.id,
    name: prof.name,
    portrait: prof.portrait,
    tier: tierKey,
    pricePerVideo: Math.round(randRange(s, t.price[0], t.price[1]) / 5) * 5,
    deliveryDays: [d0, d0 + randInt(s, 1, 2)],
    quality,
    niches: [...prof.niches],
    rating: +randRange(s, t.rating[0], t.rating[1]).toFixed(1),
    jobs: randInt(s, t.jobs[0], t.jobs[1]),
    style: prof.style,
    handle: prof.handle,
    bio: prof.bio,
    location: prof.location,
    expiresDay,
  }
}

export function createCreativeState(s: GameState): CreativeState {
  const day = dayOf(s.time.hour)
  // the first marketplace is rolled with the new game's RNG
  return { creatives: [], creators: rollCreators(s, day), lastCreatorRefreshDay: day }
}

function rollCreators(s: GameState, day: number): UgcCreator[] {
  const n = randInt(s, CREATOR_LISTINGS_PER_WEEK[0], CREATOR_LISTINGS_PER_WEEK[1])
  const ids = shuffle(s, CREATOR_PROFILES.map(p => p.id)).slice(0, n)
  const expires = day + 7
  const list = ids.map(id => makeCreator(s, id, expires)).filter((c): c is UgcCreator => !!c)
  const tierOrder = { star: 0, pro: 1, newbie: 2 }
  return list.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.rating - a.rating)
}

/** Weekly marketplace refresh (8–12 creators). */
export function refreshCreators(s: GameState): void {
  const day = today(s)
  s.creatives.creators = rollCreators(s, day)
  s.creatives.lastCreatorRefreshDay = day
}

/** Called daily: refresh on Mondays or if a week has passed. */
export function creatorsDayRollover(s: GameState, day: number): void {
  const last = s.creatives.lastCreatorRefreshDay ?? -1
  if (day - last >= 7 || (weekday(day) === 0 && day !== last && day - last >= 3)) refreshCreators(s)
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------
function hasProductInHand(s: GameState, catalogId: string): { sample: boolean; stock: boolean } {
  return {
    sample: s.catalog.samplesOwned.includes(catalogId),
    stock: (s.catalog.inventory[catalogId]?.units ?? 0) > 0,
  }
}

/** Validation without side effects: returns a player-facing error or null. */
export function validateCreativeBrief(s: GameState, b: CreativeBrief): string | null {
  const p = productDef(b.catalogId)
  if (!p) return 'Pick a product for this creative.'
  const fmt = FORMATS[b.format]
  if (!fmt) return 'Pick a format.'
  if (!b.beats.length) return 'Add at least one script beat (start with the hook).'
  if (b.beats.length > 12) return 'That\'s too many beats. Keep the script under 12 beats.'
  if (b.hookText.length > 120) return 'On-screen hook text must be 120 characters or fewer.'
  if (b.script.length > 3000) return 'The script is too long (3,000 characters max).'
  if (b.producer === 'supplier_edit' && !SUPPLIER_EDIT_FORMATS.includes(b.format)) {
    return 'Supplier footage can only be cut into a supplier edit, slideshow, static image or carousel.'
  }
  if (!fmt.producers.includes(b.producer)) {
    const who = b.producer === 'ugc' ? 'UGC creators' : b.producer === 'self' ? 'You' : b.producer === 'staff' ? 'Your in-house creator' : b.producer === 'agency' ? 'The agency' : 'This producer'
    return `${who} can't make a "${fmt.name}" creative.`
  }
  const hand = hasProductInHand(s, b.catalogId)
  if ((b.producer === 'self' || b.producer === 'ugc' || b.producer === 'staff') && !hand.sample && !hand.stock) {
    return b.producer === 'self'
      ? 'You need the product in hand to film it. Order a sample on AliExprez (or stock it at your 3PL) first.'
      : 'The creator needs to see the real product. Buy a sample first (or stock units at your 3PL) so you know what you\'re sending.'
  }
  if (b.producer === 'ugc') {
    const c = s.creatives.creators.find(x => x.id === b.creatorId)
    if (!c) return 'Pick a creator from this week\'s marketplace.'
    const unit = hand.stock ? 0 : p.cogs + p.shipCost
    if (!canAfford(s, c.pricePerVideo + unit)) return `You can't cover ${fmtMoney(c.pricePerVideo + unit)} for this creator right now.`
  }
  if (b.producer === 'agency' && !canAfford(s, agencyQuote(s, b.catalogId).price)) {
    return `The agency pack costs ${fmtMoney(agencyQuote(s, b.catalogId).price)}, which you can't cover right now.`
  }
  if (b.producer === 'staff' && !s.staff.members.some(m => m.role === 'ugc_creator' && (!b.creatorId || m.id === b.creatorId))) {
    return 'Hire a UGC creator on UpWorx first.'
  }
  return null
}
function canAfford(s: GameState, amt: number): boolean {
  const card = s.finance.card.frozen ? 0 : Math.max(0, s.finance.card.limit - s.finance.card.balance)
  return s.finance.cash >= amt || card >= amt
}

function baseCreative(s: GameState, b: CreativeBrief, over: Partial<Creative> = {}): Creative {
  const fmt = FORMATS[b.format]
  const n = s.creatives.creatives.filter(c => c.catalogId === b.catalogId).length + 1
  return {
    id: uid(s, 'cr'),
    catalogId: b.catalogId,
    name: b.name.trim() || `${hookName(b.hook)} · ${formatName(b.format)} v${n}`,
    format: b.format,
    hook: b.hook,
    angle: b.angle,
    beats: [...b.beats],
    hookText: b.hookText.trim(),
    script: b.script.trim(),
    producer: b.producer,
    creatorId: b.creatorId ?? null,
    quality: 0,
    status: 'in_production',
    orderedHour: s.time.hour,
    readyHour: null,
    cost: 0,
    isVideo: fmt.video,
    durationSec: durationFor(b.format, b.beats.length),
    scores: null,
    thumb: productImage(b.catalogId),
    shared: false,
    style: 'native',
    ...over,
  }
}
function durationFor(format: FormatId, beats: number): number {
  const f = FORMATS[format]
  if (!f.video) return 0
  return Math.round(clamp(beats * f.secondsPerBeat, f.durationRange[0], f.durationRange[1]))
}

/** Validates (sample in hand? money?), charges, creates the creative and schedules production. */
export function orderCreative(s: GameState, b: CreativeBrief): string | null {
  const err = validateCreativeBrief(s, b)
  if (err) {
    notify(s, { kind: 'warning', title: 'Can\'t start this creative', body: err, site: 'studio' })
    return null
  }
  const p = productDef(b.catalogId)!
  const hour = s.time.hour

  switch (b.producer) {
    case 'self':
    case 'supplier_edit': {
      const c = baseCreative(s, b, b.producer === 'supplier_edit' ? { shared: true, style: 'polished' } : {})
      s.creatives.creatives.push(c)
      const kind = b.producer === 'self' ? 'film_creative' : 'edit_supplier_video'
      const label = b.producer === 'self' ? `Film "${c.name}"` : `Edit supplier video: "${c.name}"`
      const act = enqueueActivity(s, kind, { payload: { creativeId: c.id }, label, durationMin: productionMinutes(s, b.producer) })
      if (!act) {
        s.creatives.creatives = s.creatives.creatives.filter(x => x.id !== c.id)
        return null
      }
      return c.id
    }
    case 'ugc': {
      const cr = s.creatives.creators.find(x => x.id === b.creatorId)!
      const hand = hasProductInHand(s, b.catalogId)
      let arriveHour: number
      let unitCost = 0
      if (hand.stock && takeInventory(s, b.catalogId, 1)) {
        arriveHour = hour + 3 * 24
      } else {
        unitCost = +(p.cogs + p.shipCost).toFixed(2)
        const extra = s.events.modifiers.dropshipDelayDays ?? 0
        arriveHour = hour + (randInt(s, p.shipDays[0], p.shipDays[1]) + extra) * 24
      }
      const paid = pay(s, cr.pricePerVideo, { category: 'creative', memo: `CreatorHub: ${cr.name} (${cr.handle ?? 'UGC video'})`, business: true })
      if (!paid) {
        notify(s, { kind: 'warning', title: 'Payment declined', body: `CreatorHub couldn't charge ${fmtMoney(cr.pricePerVideo)} for ${cr.name}.`, site: 'studio' })
        return null
      }
      if (unitCost > 0) pay(s, unitCost, { category: 'samples', memo: `AliExprez: unit shipped to ${cr.name}`, business: true })
      const nicheMatch = cr.niches.includes(p.niche)
      const creatorDays = randInt(s, cr.deliveryDays[0], cr.deliveryDays[1])
      const c = baseCreative(s, b, {
        status: 'waiting_sample',
        creatorId: cr.id,
        cost: cr.pricePerVideo + unitCost,
        quality: clamp(randRange(s, cr.quality[0], cr.quality[1]) + (nicheMatch ? 0.05 : 0), 0.1, 0.95),
        sampleArriveHour: arriveHour,
        readyHour: (dayOf(arriveHour) + creatorDays) * 24 + randInt(s, 10, 19),
        style: cr.style,
      })
      s.creatives.creatives.push(c)
      const arriveDays = Math.round((arriveHour - hour) / 24)
      notify(s, {
        kind: 'info', title: `Brief sent to ${cr.name}`,
        body: `${hand.stock ? 'Your 3PL ships a unit' : 'A unit ships from the supplier'} (~${arriveDays} day${arriveDays === 1 ? '' : 's'}), then ${cr.name.split(' ')[0]} needs ${creatorDays} days to film and edit.`,
        site: 'studio', path: 'library',
      })
      return c.id
    }
    case 'agency': {
      const q = agencyQuote(s, b.catalogId)
      const paid = pay(s, q.price, { category: 'creative', memo: `Northlight Creative Studio: 3-video pack (${p.name})`, business: true })
      if (!paid) {
        notify(s, { kind: 'warning', title: 'Payment declined', body: `The agency couldn't charge ${fmtMoney(q.price)}.`, site: 'studio' })
        return null
      }
      const days = randInt(s, q.days[0], q.days[1])
      const packId = uid(s, 'pack')
      const ready = (dayOf(hour) + days) * 24 + randInt(s, 10, 17)
      const ids: string[] = []
      for (let v = 0; v < 3; v++) {
        const hookText = v === 0 ? b.hookText : agencyHookText(p, b.hook, (v - 1) as 0 | 1)
        const c = baseCreative(s, { ...b, hookText, name: `${b.name.trim() || `${hookName(b.hook)} · ${formatName(b.format)}`} (agency v${v + 1})` }, {
          status: 'in_production', cost: +(q.price / 3).toFixed(2), quality: +randRange(s, 0.8, 0.95).toFixed(3),
          readyHour: ready + (v === 2 ? 24 : 0), packId, style: 'polished',
        })
        s.creatives.creatives.push(c)
        ids.push(c.id)
      }
      notify(s, { kind: 'info', title: 'Agency pack ordered', body: `Northlight Creative Studio will deliver 3 variations in about ${days} days.`, site: 'studio', path: 'library' })
      return ids[0]
    }
    case 'staff': {
      const m = s.staff.members.find(x => x.role === 'ugc_creator' && (!b.creatorId || x.id === b.creatorId))!
      const c = baseCreative(s, b, {
        creatorId: m.id,
        quality: clamp(0.45 + 0.05 * m.skill + randRange(s, -0.04, 0.04), 0.2, 0.9),
        readyHour: hour + randInt(s, 20, 44),
        style: 'native',
      })
      s.creatives.creatives.push(c)
      return c.id
    }
  }
  return null
}

/** Activity completion for self-shot / supplier edits (and timed producers when their readyHour passes). */
export function completeCreative(s: GameState, creativeId: string): void {
  const c = findCreative(s, creativeId)
  if (!c || c.status === 'ready') return
  if (c.producer === 'self') c.quality = clamp(selfShotQuality(s, c.format) + randRange(s, -0.04, 0.04), 0.1, 0.9)
  else if (c.producer === 'supplier_edit') c.quality = clamp(supplierEditQuality(s) + randRange(s, -0.03, 0.02), 0.1, 0.5)
  c.status = 'ready'
  c.failReason = undefined
  c.readyHour = s.time.hour
  c.isVideo = FORMATS[c.format].video
  c.durationSec = durationFor(c.format, c.beats.length)
  c.scores = scoreCreative(s, c)
  const who = c.producer === 'ugc' ? (s.creatives.creators.find(x => x.id === c.creatorId)?.name ?? creatorProfile(c.creatorId ?? '')?.name ?? 'Your creator')
    : c.producer === 'agency' ? 'Northlight Creative Studio' : c.producer === 'staff' ? (s.staff.members.find(m => m.id === c.creatorId)?.name ?? 'Your creator') : null
  notify(s, {
    kind: 'success',
    title: `Creative ready: ${c.name}`,
    body: who ? `${who} delivered your ${formatName(c.format).toLowerCase()}. Launch it from Ads Manager.` : `Your ${formatName(c.format).toLowerCase()} is in the library.`,
    site: 'studio', path: 'library',
  })
}

/** Hourly: UGC samples arriving, timed deliveries, orphaned self-shoots. */
export function creativesTickHour(s: GameState): void {
  const hour = s.time.hour
  for (const c of s.creatives.creatives) {
    if (c.status === 'waiting_sample' && c.sampleArriveHour != null && hour >= c.sampleArriveHour) {
      c.status = 'in_production'
      const who = s.creatives.creators.find(x => x.id === c.creatorId)?.name ?? creatorProfile(c.creatorId ?? '')?.name ?? 'Your creator'
      notify(s, { kind: 'info', title: `${who} received your product`, body: `Filming "${c.name}" now.`, site: 'studio', path: 'library' })
      continue
    }
    if (c.status === 'in_production' && (c.producer === 'ugc' || c.producer === 'agency' || c.producer === 'staff') && c.readyHour != null && hour >= c.readyHour) {
      completeCreative(s, c.id)
      continue
    }
    if (c.status === 'in_production' && (c.producer === 'self' || c.producer === 'supplier_edit') && hour - c.orderedHour >= 2) {
      const pending = [s.player.activity, ...s.player.queue].some(a => a?.payload?.creativeId === c.id)
      if (!pending) {
        c.status = 'failed'
        c.failReason = c.producer === 'self' ? 'The shoot was cancelled before it finished.' : 'The edit was cancelled before it finished.'
        notify(s, { kind: 'info', title: `${c.producer === 'self' ? 'Shoot' : 'Edit'} cancelled: ${c.name}`, body: 'Re-brief it in CreatorHub whenever you\'re ready.', site: 'studio', path: 'library' })
      }
    }
  }
}

/** Cancel a creative that hasn't been delivered yet (no refund once a creator/agency is paid). */
export function cancelCreative(s: GameState, creativeId: string): void {
  const c = findCreative(s, creativeId)
  if (!c || c.status === 'ready') return
  c.status = 'failed'
  c.failReason = 'Cancelled.'
}
