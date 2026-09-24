// Derived view-model for the brief builder: what's missing, what each producer costs and how
// long it takes. Pure (reads GameState only). Validation messages are written for the player.
import type { CreativeProducer, GameState, ProductDef, StaffMember, StoreProduct, UgcCreator } from '../../../../core/types'
import { dayOf } from '../../../../core/time'
import { cardAvailable } from '../../../../core/money'
import { money } from '../../../../core/format'
import { FORMATS, SUPPLIER_EDIT_FORMATS, formatName, PRODUCER_INFO } from '../../../../data/creativeTaxonomy'
import { findProduct } from '../../../../sim/market'
import {
  agencyQuote, expectedCreativeQuality, productionMinutes, validateCreativeBrief, type CreativeBrief,
} from '../../../../sim/ads'
import { canDoActivity } from '../../../../sim/life'
import type { BriefDraft } from '../draft'
import { HOOK_TEXT_MAX, SCRIPT_MAX } from '../draft'
import { fmtDayRange, fmtMinutes, hasProductInHand, queueWaitMinutes, sampleStatus, sandboxed, type SampleStatus } from '../helpers'

export type StepId = 'product' | 'format' | 'hook' | 'angle' | 'script' | 'producer'
export interface Issue { step: StepId; text: string }

export interface ProducerOption {
  id: CreativeProducer
  name: string
  short: string
  /** blocking reason for the current brief (still selectable so the player can read about it) */
  blocked: string | null
  costLabel: string
  timeLabel: string
  /** money charged now */
  cost: number
  quality: [number, number] | null
  /** estimated delivery window (days) */
  readyDays: [number, number] | null
  /** estimated delivery hour for in-house work (self / supplier edit) */
  readyHour: number | null
  /** production minutes of the player's own time */
  minutes: number
  waitMinutes: number
}

export interface BriefModel {
  storeReady: boolean
  products: StoreProduct[]
  sp: StoreProduct | null
  catalogId: string | null
  pdef: ProductDef | null
  sample: SampleStatus | null
  brandName: string
  domain: string
  freeShipping: boolean
  producers: ProducerOption[]
  selected: ProducerOption | null
  creator: UgcCreator | null
  staffMember: StaffMember | null
  ugcCreators: UgcCreator[]
  ugcStaff: StaffMember[]
  issues: Issue[]
  /** complete brief when every required field is filled */
  brief: CreativeBrief | null
  submitLabel: string
  confirmLabel: string
  needsConfirm: boolean
  autoName: string
}

const canAfford = (s: GameState, amt: number) => s.finance.cash >= amt || cardAvailable(s) >= amt

function handMessage(sample: SampleStatus | null, who: 'self' | 'ugc' | 'staff'): string | null {
  if (!sample || hasProductInHand(sample)) return null
  const lead = who === 'self' ? 'You need the product in hand to film it.' : who === 'ugc' ? 'Creators film the real product, and you send them a unit.' : 'Your in-house creator needs the real product.'
  if (sample.kind === 'transit') return `${lead} Your sample is still on its way (${sample.label.toLowerCase()}).`
  return `${lead} Order a sample on AliExprez first, or stock units at a 3PL.`
}

function formatBlock(format: BriefDraft['format'], producer: CreativeProducer): string | null {
  if (!format) return null
  const f = FORMATS[format]
  if (producer === 'supplier_edit' && !SUPPLIER_EDIT_FORMATS.includes(format)) {
    const names = SUPPLIER_EDIT_FORMATS.map(x => (x === 'supplier_edit' ? 'supplier edit' : formatName(x).toLowerCase()))
    return `Supplier footage can only be cut into a ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}.`
  }
  if (!f.producers.includes(producer)) {
    const who = producer === 'ugc' ? 'Creators on the marketplace don\'t' : producer === 'self' ? 'You can\'t' : producer === 'staff' ? 'Your in-house creator doesn\'t' : producer === 'agency' ? 'The agency doesn\'t' : 'This producer can\'t'
    return `${who} make ${/^[aeiou]/i.test(f.name) ? 'an' : 'a'} ${f.name.toLowerCase()}.`
  }
  return null
}

export function buildBriefModel(s: GameState, d: BriefDraft, products: StoreProduct[]): BriefModel {
  const today = dayOf(s.time.hour)
  const hour = s.time.hour
  const sp = products.find(p => p.id === d.storeProductId) ?? null
  const catalogId = sp?.catalogId ?? null
  const pdef = catalogId ? findProduct(catalogId) ?? null : null
  const sample = catalogId ? sampleStatus(s, catalogId) : null
  const brandName = s.store.theme?.logoText || s.store.name || 'Your Store'
  const domain = s.store.customDomain || s.store.subdomain || 'yourstore.myshopifly.com'

  const ugcCreators = s.creatives.creators
  const ugcStaff = s.staff.members.filter(m => m.role === 'ugc_creator')
  const creator = d.producer === 'ugc' ? ugcCreators.find(c => c.id === d.creatorId) ?? null : null
  const staffMember = ugcStaff.find(m => m.id === d.creatorId) ?? ugcStaff[0] ?? null
  const wait = queueWaitMinutes(s)
  const qFormat = d.format ?? 'demo_video'

  // ---- producers ----
  const producers: ProducerOption[] = []
  {
    const minutes = productionMinutes(s, 'self')
    const can = sandboxed(s, d => ({ ...canDoActivity(d, 'film_creative') }))
    const blocked = formatBlock(d.format, 'self') ?? handMessage(sample, 'self') ?? (can.ok ? null : can.reason ?? 'You can\'t start filming right now.')
    producers.push({
      id: 'self', name: PRODUCER_INFO.self.name, short: PRODUCER_INFO.self.short, blocked,
      cost: 0, costLabel: 'Free', timeLabel: `~${fmtMinutes(minutes)} of your time`,
      quality: expectedCreativeQuality(s, 'self', qFormat), readyDays: null, readyHour: hour + Math.ceil((wait + minutes) / 60),
      minutes, waitMinutes: wait,
    })
  }
  {
    const minutes = productionMinutes(s, 'supplier_edit')
    const can = sandboxed(s, d => ({ ...canDoActivity(d, 'edit_supplier_video') }))
    const blocked = formatBlock(d.format, 'supplier_edit') ?? (can.ok ? null : can.reason ?? 'You can\'t start editing right now.')
    producers.push({
      id: 'supplier_edit', name: PRODUCER_INFO.supplier_edit.name, short: PRODUCER_INFO.supplier_edit.short, blocked,
      cost: 0, costLabel: 'Free', timeLabel: `~${fmtMinutes(minutes)} of your time`,
      quality: expectedCreativeQuality(s, 'supplier_edit', qFormat), readyDays: null, readyHour: hour + Math.ceil((wait + minutes) / 60),
      minutes, waitMinutes: wait,
    })
  }
  {
    const prices = ugcCreators.map(c => c.pricePerVideo)
    const inStock = sample?.kind === 'stock' || (sample?.units ?? 0) > 0
    const unitCost = pdef && !inStock ? +(pdef.cogs + pdef.shipCost).toFixed(2) : 0
    const delay = Math.max(0, Math.round(s.events.modifiers.dropshipDelayDays || 0))
    const ship: [number, number] = inStock ? [3, 3] : pdef ? [pdef.shipDays[0] + delay, pdef.shipDays[1] + delay] : [7, 20]
    let blocked = formatBlock(d.format, 'ugc') ?? handMessage(sample, 'ugc')
    let cost = 0
    let readyDays: [number, number] | null = null
    let costLabel = prices.length ? `${money(Math.min(...prices), { cents: false })}–${money(Math.max(...prices), { cents: false })} / video` : 'No creators listed'
    let timeLabel = 'Shipping + 3–8 days'
    if (!ugcCreators.length) blocked = blocked ?? 'No creators are listed this week. New profiles arrive Monday.'
    if (creator) {
      cost = creator.pricePerVideo + unitCost
      costLabel = unitCost > 0 ? `${money(cost)} incl. unit` : money(cost, { cents: false })
      readyDays = [today + ship[0] + creator.deliveryDays[0], today + ship[1] + creator.deliveryDays[1]]
      timeLabel = `Ready ${fmtDayRange(readyDays[0], readyDays[1])}`
      if (!blocked && !canAfford(s, cost)) blocked = `You can't cover ${money(cost)} right now (checking ${money(s.finance.cash)}, card available ${money(cardAvailable(s))}).`
    } else if (!blocked) {
      blocked = 'Pick a creator below.'
    }
    producers.push({
      id: 'ugc', name: PRODUCER_INFO.ugc.name, short: PRODUCER_INFO.ugc.short, blocked, cost, costLabel, timeLabel,
      quality: null, readyDays, readyHour: null, minutes: 0, waitMinutes: 0,
    })
  }
  {
    const q = catalogId ? agencyQuote(s, catalogId) : null
    let blocked = formatBlock(d.format, 'agency')
    if (!blocked && q && !canAfford(s, q.price)) blocked = `The pack costs ${money(q.price, { cents: false })}, which you can't cover right now (checking ${money(s.finance.cash)}, card available ${money(cardAvailable(s))}).`
    producers.push({
      id: 'agency', name: PRODUCER_INFO.agency.name, short: PRODUCER_INFO.agency.short, blocked,
      cost: q?.price ?? 0,
      costLabel: q ? `${money(q.price, { cents: false })} for 3` : '$1,500–$3,500 for 3',
      timeLabel: q ? `${q.days[0]}–${q.days[1]} days` : '7–14 days',
      quality: expectedCreativeQuality(s, 'agency', qFormat),
      readyDays: q ? [today + q.days[0], today + q.days[1] + 1] : null, readyHour: null, minutes: 0, waitMinutes: 0,
    })
  }
  if (ugcStaff.length) {
    const blocked = formatBlock(d.format, 'staff') ?? handMessage(sample, 'staff')
    producers.push({
      id: 'staff', name: PRODUCER_INFO.staff.name, short: PRODUCER_INFO.staff.short, blocked,
      cost: 0, costLabel: 'Included in salary', timeLabel: '1–2 days',
      quality: expectedCreativeQuality(s, 'staff', qFormat, staffMember?.id), readyDays: [today + 1, today + 2], readyHour: null, minutes: 0, waitMinutes: 0,
    })
  }
  const selected = producers.find(p => p.id === d.producer) ?? null

  // ---- issues (in step order) ----
  const issues: Issue[] = []
  if (!s.store.created) issues.push({ step: 'product', text: 'Set up your Shopifly store and add a product first.' })
  else if (!products.length) issues.push({ step: 'product', text: 'Import a product into your store first.' })
  else if (!sp) issues.push({ step: 'product', text: 'Pick the product this creative is for.' })
  if (!d.format) issues.push({ step: 'format', text: 'Pick a format.' })
  if (!d.hook) issues.push({ step: 'hook', text: 'Pick a hook for the first seconds.' })
  if (!d.angle) issues.push({ step: 'angle', text: 'Pick the angle the ad sells.' })
  if (!d.beats.length) issues.push({ step: 'script', text: 'Add at least one script beat.' })
  if (d.hookText.length > HOOK_TEXT_MAX) issues.push({ step: 'script', text: `Shorten the on-screen hook text to ${HOOK_TEXT_MAX} characters.` })
  if (d.script.length > SCRIPT_MAX) issues.push({ step: 'script', text: `The script is over ${SCRIPT_MAX.toLocaleString('en-US')} characters.` })
  if (!selected) issues.push({ step: 'producer', text: 'Choose who makes it.' })
  else if (selected.blocked) issues.push({ step: 'producer', text: selected.blocked })

  const autoName = autoCreativeName(s, d, catalogId)
  let brief: CreativeBrief | null = null
  if (catalogId && d.format && d.hook && d.angle && d.producer) {
    brief = {
      catalogId,
      name: d.name.trim() || autoName,
      format: d.format,
      hook: d.hook,
      angle: d.angle,
      beats: d.beats.map(b => b.id),
      hookText: d.hookText,
      script: d.script,
      producer: d.producer,
      creatorId: d.producer === 'ugc' ? d.creatorId : d.producer === 'staff' ? staffMember?.id ?? null : null,
    }
    // authoritative check from the sim (covers anything the UI rules above missed)
    if (!issues.length) {
      const err = validateCreativeBrief(s, brief)
      if (err) issues.push({ step: 'producer', text: err })
    }
  }

  let submitLabel = 'Create creative'
  let confirmLabel = 'Confirm'
  const needsConfirm = !!selected && selected.cost > 0
  switch (d.producer) {
    case 'self': submitLabel = 'Start filming'; break
    case 'supplier_edit': submitLabel = 'Start editing'; break
    case 'ugc':
      submitLabel = creator ? `Send brief to ${creator.name.split(' ')[0]}` : 'Send brief'
      confirmLabel = `Pay ${money(selected?.cost ?? 0)} & send`
      break
    case 'agency':
      submitLabel = `Order agency pack`
      confirmLabel = `Pay ${money(selected?.cost ?? 0, { cents: false })} & order`
      break
    case 'staff': submitLabel = staffMember ? `Assign to ${staffMember.name.split(' ')[0]}` : 'Assign'; break
  }

  return {
    storeReady: s.store.created, products, sp, catalogId, pdef, sample, brandName, domain, freeShipping: !!s.store.shipping?.freeShipping, producers, selected, creator, staffMember,
    ugcCreators, ugcStaff, issues, brief, submitLabel, confirmLabel, needsConfirm, autoName,
  }
}

function autoCreativeName(s: GameState, d: BriefDraft, catalogId: string | null): string {
  if (!d.format || !d.hook) return 'Untitled creative'
  const n = catalogId ? s.creatives.creatives.filter(c => c.catalogId === catalogId).length + 1 : 1
  const hookShort: Record<string, string> = {
    problem_callout: 'Problem', pov: 'POV', tiktak_made_me_buy: 'Made me buy', before_after: 'Before-after', asmr: 'ASMR',
    shock_stat: 'Stat', unboxing: 'Unboxing', us_vs_them: 'Us vs them', testimonial: 'Quote', gift_idea: 'Gift',
    life_hack: 'Hack', controversial: 'Hot take', question: 'Question',
  }
  return `${hookShort[d.hook] ?? d.hook} · ${formatName(d.format)} v${n}`
}

