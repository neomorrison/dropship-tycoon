// Decision modals owned by the events module + influencer offers/outreach.
import type { GameModal, GameState, Platform, ProductDef, StoreProduct } from '../../core/types'
import { INFLUENCERS, LIFE_EXPENSES, PLATFORM_LABEL } from '../../data/events'
import { registerModalHandler, pushModal } from '../../core/modals'
import { pay } from '../../core/money'
import { coachTip, notify } from '../../core/notify'
import { chance, clamp, lognormal, pick, randInt, randRange } from '../../core/rng'
import { compact, money } from '../../core/format'
import { findProduct, fulfillmentFor, productAppeal, sampleCost } from '../market'
import { updateProduct } from '../store'
import { enqueueActivity } from '../life'
import { round99, startEvent, today } from './util'

// ---------------------------------------------------------------------------
// Influencers
// ---------------------------------------------------------------------------
/** How well a creator's post will land for this product (hidden). */
function influencerFit(p: ProductDef, nicheMatch: boolean, platform: Platform): number {
  return clamp(0.2 + 0.5 * p.wow + 0.25 * p.platformFit[platform] + 0.1 * p.impulse + (nicheMatch ? 0.15 : -0.15), 0.1, 1.2)
}

export function influencerOfferModal(s: GameState, sp: StoreProduct, inbound: boolean): void {
  const p = findProduct(sp.catalogId)
  if (!p) return
  const matches = INFLUENCERS.filter(i => i.niches.includes(p.niche))
  const nicheMatch = matches.length > 0 && chance(s, 0.8)
  const inf = pick(s, nicheMatch ? matches : INFLUENCERS)
  const matched = inf.niches.includes(p.niche)
  const followers = Math.round(randRange(s, inf.followers[0], inf.followers[1]) / 1000) * 1000
  const avgViews = Math.round((followers * randRange(s, 0.15, 0.45)) / 100) * 100
  const fee = clamp(Math.round((followers * randRange(s, 0.0028, 0.0055)) / 50) * 50, 300, 2000)
  const giftCost = sampleCost(s, p.id)
  const pro = inf.pronoun
  const title = sp.title || p.name
  pushModal(s, {
    kind: 'influencer_offer',
    title: inbound ? `${inf.handle} wants to feature your product` : `${inf.handle} replied to your DM`,
    body: [
      `${inf.name} · ${compact(followers)} followers on ${PLATFORM_LABEL[inf.platform]} · usually ~${compact(avgViews)} views per video`,
      '',
      `"${inf.pitch}"`,
      '',
      `Rate for one dedicated video about "${title}" with your link: ${money(fee, { cents: false })}.`,
      `Or send a free unit (${money(giftCost)} with shipping) and ${pro === 'they' ? 'they' : pro} ${pro === 'they' ? 'might post if they love it' : 'might post if ' + pro + ' loves it'} — no guarantee.`,
      '',
      'Worth asking yourself: does this product look amazing on camera, and does this audience match your buyer?',
    ].join('\n'),
    choices: [
      { id: 'pay', label: `Pay ${money(fee, { cents: false })} for a post`, hint: 'Guaranteed post in 2–5 days. Results vary a lot.' },
      { id: 'gift', label: `Send a free unit (${money(giftCost)})`, hint: 'Cheap, but many creators never post.' },
      { id: 'decline', label: 'Decline', hint: 'Keep the money for ads.' },
    ],
    data: { storeProductId: sp.id, catalogId: p.id, handle: inf.handle, name: inf.name, followers, avgViews, fee, giftCost, platform: inf.platform, nicheMatch: matched ? 1 : 0 },
  })
}

function onInfluencerChoice(s: GameState, modal: GameModal, choice: string) {
  const d = modal.data ?? {}
  if (choice === 'decline') return
  const sp = s.store.products.find(x => x.id === d.storeProductId)
  const p = sp ? findProduct(sp.catalogId) : undefined
  if (!sp || !p) return
  const handle = String(d.handle)
  const platform = (d.platform as Platform) ?? 'tiktak'
  const gift = choice === 'gift'
  const cost = gift ? Number(d.giftCost) : Number(d.fee)
  const acct = pay(s, cost, gift
    ? { category: 'samples', memo: `Free product for ${handle}`, business: true }
    : { category: 'creative', memo: `Sponsored post — ${handle}`, business: true })
  if (!acct) {
    notify(s, { kind: 'critical', title: 'Payment declined', body: `Couldn't pay ${money(cost)} — the deal with ${handle} fell through.`, site: 'bank' })
    return
  }
  const fit = influencerFit(p, !!d.nicheMatch, platform)
  const willPost = gift ? chance(s, clamp(0.25 + 0.45 * fit, 0.2, 0.7)) : true
  let views = Number(d.avgViews) * lognormal(s, 0.55) * (0.55 + 0.7 * fit)
  if (chance(s, gift ? 0.3 : 0.2)) views *= 0.3 // the algorithm didn't push it
  const appeal = clamp(productAppeal(s, p.id), 0.2, 1.3)
  const linkRate = (0.003 + 0.011 * fit * appeal) * (gift ? 0.75 : 1)
  const sessions = Math.round(views * linkRate)
  const day = today(s)
  const f = fulfillmentFor(s, p.id)
  const delayDays = gift ? randInt(s, f.shipDays[0], f.shipDays[1]) + randInt(s, 1, 3) : randInt(s, 2, 5)
  const startHour = (day + delayDays) * 24 + randInt(s, 11, 20)
  startEvent(s, {
    kind: 'influencer_post', title: `${handle} ${gift ? 'gifted' : 'sponsored'} post`, startDay: day, endDay: day + delayDays + 4,
    data: { storeProductId: sp.id, catalogId: p.id, handle, sessions, views: Math.round(views), startHour, halfLifeHours: 16, willPost: willPost ? 1 : 0, posted: 0, paid: cost },
  })
  notify(s, {
    kind: 'info',
    title: gift ? `Free unit on its way to ${handle}` : `Deal booked with ${handle}`,
    body: gift ? `It should reach ${d.name} in about ${delayDays} days. Fingers crossed.` : `The video goes live in about ${delayDays} days. Make sure your product page is active and your stock can handle a spike.`,
    site: 'shopifly', path: `products/${sp.id}`,
  })
}

/** Called when the influencer_outreach activity completes. */
export function influencerOutreach(s: GameState, storeProductId: string): void {
  const sp = s.store.products.find(x => x.id === storeProductId)
  const p = sp ? findProduct(sp.catalogId) : undefined
  if (!sp || !p) return
  if (sp.status !== 'active') {
    notify(s, { kind: 'warning', title: 'No replies', body: "Creators clicked your link and found an inactive page. Publish the product before pitching.", site: 'shopifly', path: `products/${sp.id}` })
    return
  }
  const grade = (sp.grade?.score ?? 50) / 100
  const pReply = clamp(0.25 + 0.45 * p.wow + 0.2 * grade, 0.2, 0.85)
  if (chance(s, pReply)) {
    influencerOfferModal(s, sp, false)
    return
  }
  notify(s, {
    kind: 'info', title: 'No replies from creators yet',
    body: `You pitched ${randInt(s, 12, 20)} creators about "${sp.title || p.name}". Nobody bit — big creators get hundreds of DMs a week. Products that demo well on camera (and a polished product page) get far more replies.`,
  })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
function onCompetitorCopy(s: GameState, modal: GameModal, choice: string) {
  const id = String(modal.data?.catalogId ?? '')
  const ev = s.events.active.find(e => e.id === modal.data?.eventId)
  if (ev) (ev.data ??= {}).response = choice
  const p = findProduct(id)
  if (!p) return
  if (choice === 'match') {
    const sps = s.store.products.filter(x => x.catalogId === id && x.status !== 'archived')
    for (const sp of sps) {
      const next = round99(sp.price * 0.9)
      updateProduct(s, sp.id, { price: next })
      if (sp.price !== next) sp.price = next
    }
    notify(s, { kind: 'info', title: `Price cut 10% on ${p.name}`, body: 'Conversion holds up against the copycats, but every order now earns less. Re-check your break-even CPA.', site: 'shopifly', path: sps[0] ? `products/${sps[0].id}` : 'products' })
  } else if (choice === 'refresh') {
    if (ev) ev.data!.refreshSince = s.time.hour
    coachTip(s, `copycat_refresh_${id}_${today(s)}`, `Out-creating copycats on ${p.name}: ship at least 2 NEW creatives this week — new hooks and angles, not a re-cut of the old video. Fresh creative keeps your costs below theirs while they fight over the old angle.`, { app: 'studio', cooldownHours: 24 })
  }
}

function onMomHelp(s: GameState, modal: GameModal, choice: string) {
  const task = String(modal.data?.task ?? 'help around the house')
  if (choice === 'help') {
    enqueueActivity(s, 'relax', { label: `Helping Mom ${task}`, durationMin: 180, front: true })
    s.player.mood = clamp(s.player.mood + 3, 0, 100)
  } else {
    s.player.mood = clamp(s.player.mood - 8, 0, 100)
    notify(s, { kind: 'info', title: 'Mom sighs loudly upstairs', body: '"Fine. I\'ll do it myself." (−8 mood)' })
  }
}

function onFriendBirthday(s: GameState, modal: GameModal, choice: string) {
  const friend = String(modal.data?.friend ?? 'your friend')
  if (choice === 'go') enqueueActivity(s, 'socialize', { label: `${friend}'s birthday`, front: true })
  else {
    s.player.mood = clamp(s.player.mood - 10, 0, 100)
    notify(s, { kind: 'info', title: `You skipped ${friend}'s birthday`, body: 'The group chat posts photos all night. (−10 mood)' })
  }
}

function onLifeExpense(s: GameState, modal: GameModal, choice: string) {
  const item = (modal.data?.item === 'car' ? 'car' : 'phone') as 'phone' | 'car'
  const def = LIFE_EXPENSES[item]
  const cost = Number(modal.data?.cost ?? 200)
  const retry = Number(modal.data?.retry ?? 0)
  const day = today(s)
  if (choice === 'pay') {
    const acct = pay(s, cost, { category: 'misc', memo: item === 'phone' ? 'Phone screen repair' : 'Auto repair — alternator', business: false })
    if (acct) {
      notify(s, { kind: 'info', title: item === 'phone' ? 'Phone fixed' : 'Car fixed', body: `${money(cost)} charged to your ${acct === 'card' ? 'card' : 'checking account'}.`, site: 'bank' })
      return
    }
    notify(s, { kind: 'critical', title: 'Card declined at the repair shop', body: `You couldn't cover ${money(cost)}. You'll have to deal with it later.`, site: 'bank' })
  }
  s.player.mood = clamp(s.player.mood + (retry ? def.deferMood - 4 : def.deferMood), 0, 100)
  if (!retry) {
    startEvent(s, {
      kind: 'life_trigger', title: def.title, startDay: day + 7, endDay: day + 7,
      data: { action: 'life_expense', item, cost: Math.round(cost * 1.15), retry: 1, hour: 10 },
    }, false)
  } else {
    notify(s, { kind: 'info', title: item === 'phone' ? 'You live with the cracked screen' : 'You keep taking the bus', body: `It is annoying every single day. (${def.deferMood - 4} mood)` })
  }
}

let registered = false
/** Register handlers for the modal kinds this module creates (called once at import). */
export function registerEventModalHandlers(): void {
  if (registered) return
  registered = true
  registerModalHandler('competitor_copy', onCompetitorCopy)
  registerModalHandler('influencer_offer', onInfluencerChoice)
  registerModalHandler('mom_help', onMomHelp)
  registerModalHandler('friend_birthday', onFriendBirthday)
  registerModalHandler('life_expense', onLifeExpense)
}

