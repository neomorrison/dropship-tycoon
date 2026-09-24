// Random daily events with conditions, cooldowns and DIFFICULTY.dramaMult, plus the hourly
// triggers they schedule (life popups at a sensible hour, outage start/end notices, influencer posts).
import type { ActiveEvent, GameState, Platform } from '../../core/types'
import { FRIENDS, LIFE_EXPENSES, MOM_TASKS, PLATFORM_LABEL, RANDOM_EVENTS, SENDERS, type RandomEventDef } from '../../data/events'
import { DIFFICULTY } from '../../core/difficulty'
import { dayOf, dayOfDate, formatDate, hourOfDay, monthOf, weekday, yearOf } from '../../core/time'
import { chance, clamp, pick, randInt, randRange, shuffle } from '../../core/rng'
import { receive } from '../../core/money'
import { coachTip, mail, notify } from '../../core/notify'
import { pushModal } from '../../core/modals'
import { money, num } from '../../core/format'
import { findProduct, recentSales, saturationOf, supplierName } from '../market'
import { hrand } from '../market/noise'
import { salesOnDay } from '../market/dynamics'
import { dataNum, dataStr, findEvent, markFired, onCooldown, playerAvailable, startEvent, today } from './util'
import { influencerOfferModal } from './modals'

const MAX_RANDOM_PER_DAY = 2

// ---------------------------------------------------------------------------
// Conditions → context for firing
// ---------------------------------------------------------------------------
type Ctx = Record<string, unknown>
type Cond = (s: GameState, day: number) => Ctx | null

const activeStoreProducts = (s: GameState) => s.store.products.filter(p => p.status === 'active')
const hasLiveAds = (s: GameState, platform?: Platform) =>
  s.ads.ads.some(a => a.status === 'active' && a.review === 'approved' && (!platform || a.platform === platform))

const CONDITIONS: Record<string, Cond> = {
  competitor_copy: (s, day) => {
    for (const id of Object.keys(s.catalog.sales ?? {})) {
      if (onCooldown(s, `copy:${id}`, 30)) continue
      if ([1, 2, 3].every(k => salesOnDay(s, id, day - k) >= 1000)) return { catalogId: id }
    }
    return null
  },
  supplier_price_hike: s => {
    const ids = Object.keys(s.catalog.sales ?? {}).filter(id => {
      const mode = s.catalog.sourcing[id]?.mode ?? 'dropship'
      return (mode === 'dropship' || mode === 'agent') && recentSales(s, id, 7).units > 0 && !findEvent(s, 'supplier_price_hike', e => e.data?.catalogId === id)
    })
    return ids.length ? { catalogId: pick(s, ids) } : null
  },
  trend_collapse: (s, day) => {
    for (const id of Object.keys(s.catalog.sales ?? {})) {
      const p = findProduct(id)
      if (!p || s.events.cooldowns[`collapse:${id}`] !== undefined) continue
      const pastPeak = day - p.trend.peakDay
      const eligible = (p.trend.kind === 'fad' && pastPeak >= 5) || (p.trend.kind === 'rising' && pastPeak >= 60)
      if (eligible && recentSales(s, id, 14).orders > 0) return { catalogId: id }
    }
    return null
  },
  influencer_offer: s => {
    const cands = activeStoreProducts(s).filter(sp => recentSales(s, sp.catalogId, 7).orders >= 5)
    return cands.length ? { storeProductId: pick(s, cands).id } : null
  },
  feature_post: (s, day) => {
    const gifting = s.events.active.some(e => ['valentines', 'mothers_day', 'fathers_day', 'bfcm', 'xmas_cutoff', 'back_to_school'].includes(e.kind) && day >= e.startDay && day <= e.endDay)
      || [10, 11].includes(monthOf(day))
    if (!gifting) return null
    const cands = activeStoreProducts(s).filter(sp => (findProduct(sp.catalogId)?.giftable ?? 0) >= 0.5 && (sp.grade?.score ?? 0) >= 65)
    return cands.length ? { storeProductId: pick(s, cands).id } : null
  },
  creator_stole_ad: (s, day) => {
    const byCreative: Record<string, number> = {}
    for (const ad of s.ads.ads) {
      if (ad.status !== 'active') continue
      for (let d = day - 7; d < day; d++) byCreative[ad.creativeId] = (byCreative[ad.creativeId] ?? 0) + (ad.stats[d]?.impressions ?? 0)
    }
    const top = Object.entries(byCreative).filter(([id, imps]) => imps >= 20_000 && s.creatives.creatives.find(c => c.id === id)?.isVideo).sort((a, b) => b[1] - a[1])[0]
    return top ? { creativeId: top[0] } : null
  },
  tracking_outage: s => (hasLiveAds(s) ? {} : null),
  platform_outage: s => {
    const plats = (['fadbook', 'tiktak'] as Platform[]).filter(p => hasLiveAds(s, p))
    if (!plats.length) return null
    return { platform: plats.includes('fadbook') && (plats.length === 1 || chance(s, 0.65)) ? 'fadbook' : plats[plats.length - 1] }
  },
  policy_crackdown: s => (hasLiveAds(s) ? {} : null),
  chargeback_wave: (s, day) => {
    const recent = s.store.orders.some(o => o.total >= 60 && dayOf(o.hour) >= day - 14)
    return recent ? {} : null
  },
  payout_review: s => {
    if (s.store.hold || !s.store.created || !DIFFICULTY[s.meta.difficulty].payoutHolds) return null
    let week = 0
    for (const id of Object.keys(s.catalog.sales ?? {})) week += recentSales(s, id, 7).revenue
    return week >= 1500 ? {} : null
  },
  mom_help: s => (s.home.tier === 0 ? {} : null),
  roommate_party: (s, day) => (s.home.tier === 1 && (weekday(day) === 4 || weekday(day) === 5) ? {} : null),
  friend_birthday: () => ({}),
  phone_breaks: () => ({}),
  car_breaks: () => ({}),
}

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------
type Fire = (s: GameState, day: number, ctx: Ctx, def: RandomEventDef) => void

const FIRE: Record<string, Fire> = {
  competitor_copy: (s, day, ctx, def) => {
    const id = String(ctx.catalogId)
    const p = findProduct(id)
    const m = s.catalog.market[id]
    if (!p || !m) return
    markFired(s, `copy:${id}`, day)
    const privateLabel = s.catalog.sourcing[id]?.mode === 'private_label'
    const added = Math.max(2, Math.round(randInt(s, 5, 15) * (privateLabel ? 0.5 : 1)))
    m.competitors += added
    m.saturation = Math.round(saturationOf(m.competitors) * 1000) / 1000
    const rev = Math.round(([1, 2, 3].reduce((a, k) => a + salesOnDay(s, id, day - k), 0) / 3))
    const ev = startEvent(s, { kind: 'competitor_copy', title: `Copycats on ${p.name}`, startDay: day, endDay: day + def.durationDays - 1, data: { catalogId: id, added, response: '' } })
    pushModal(s, {
      kind: 'competitor_copy',
      title: `${added} stores just copied your ${p.name}`,
      body: [
        `Your ${p.name} has been doing about ${money(rev, { cents: false })}/day. People with spy tools noticed.`,
        '',
        `${added} new stores are now running ads with your angle${privateLabel ? '' : ' — a couple even lifted your product photos'}. For the next month, expect the auction to get more expensive (roughly +15% CPM) while they test.`,
        ...(privateLabel ? [`Your ${s.catalog.sourcing[id]?.brandName ?? 'brand'} packaging makes you harder to copy exactly, so fewer jumped in.`] : []),
        '',
        'How do you respond?',
      ].join('\n'),
      choices: [
        { id: 'match', label: 'Match their price (−10%)', hint: 'Stay competitive on price. Every order earns less.' },
        { id: 'refresh', label: 'Out-create them', hint: 'Ship fresh creatives and a stronger offer this week (you do the work).' },
        { id: 'ignore', label: 'Ignore it', hint: 'Ride it out.' },
      ],
      data: { eventId: ev.id, catalogId: id },
    })
  },
  supplier_price_hike: (s, day, ctx, def) => {
    const id = String(ctx.catalogId)
    const p = findProduct(id)
    if (!p) return
    const pct = 0.08
    startEvent(s, { kind: 'supplier_price_hike', title: `Supplier price +8%: ${p.name}`, startDay: day, endDay: day + def.durationDays - 1, data: { catalogId: id, pct } })
    const agent = s.catalog.sourcing[id]?.mode === 'agent'
    const name = agent ? 'Lily Chen · SourcePro' : supplierName(id)
    mail(s, {
      from: name, fromEmail: agent ? 'lily@sourcepro-agent.com' : `service@${id.replace(/[^a-z]/g, '')}.aliexprez.com`, tag: 'supplier', site: 'aliexprez', path: `item/${id}`,
      subject: agent ? `Price update from the factory — ${p.name}` : `【Price Adjustment】${p.name}`,
      body: agent
        ? `Hi,\n\nBad news from the factory: raw material costs went up and they are raising the price of the ${p.name} by about 8% for the next two months. I pushed back but this is the best I could get.\n\nYour unit cost goes from ${money(p.bulkCogs * 1.12)} to about ${money(p.bulkCogs * 1.12 * (1 + pct))}. Please check your margins.\n\nLily`
        : `Dear friend,\n\nBecause the raw material and labor cost increase, from today the price of this item adjust about 8% (US $${p.cogs.toFixed(2)} → US $${(p.cogs * (1 + pct)).toFixed(2)}).\n\nThank you for your understanding and support. We will keep the good quality and fast shipping.\n\n${name}`,
    })
    notify(s, { kind: 'warning', title: `Supplier raised the price of ${p.name} ~8%`, body: 'Your cost per order is higher for ~2 months. Re-check your break-even CPA.', site: 'aliexprez', path: `item/${id}` })
  },
  trend_collapse: (s, day, ctx, def) => {
    const id = String(ctx.catalogId)
    const p = findProduct(id)
    const m = s.catalog.market[id]
    if (!p || !m) return
    markFired(s, `collapse:${id}`, day)
    startEvent(s, { kind: 'trend_collapse', title: `Trend collapse: ${p.name}`, startDay: day, endDay: day + def.durationDays - 1, data: { catalogId: id, mult: 0.55 } })
    m.competitors = Math.round(m.competitors * 0.8)
    m.saturation = Math.round(saturationOf(m.competitors) * 1000) / 1000
    notify(s, {
      kind: 'warning', title: `${p.name}: the trend is collapsing`,
      body: 'Search interest and engagement dropped hard this week — the hype cycle is over. Expect falling CTR and conversion; cut spend to what stays profitable.',
      site: 'mineo', path: `product/${id}`,
    })
  },
  influencer_offer: (s, _day, ctx) => {
    const sp = s.store.products.find(x => x.id === ctx.storeProductId)
    if (sp) influencerOfferModal(s, sp, true)
  },
  feature_post: (s, day, ctx, def) => {
    const sp = s.store.products.find(x => x.id === ctx.storeProductId)
    const p = sp ? findProduct(sp.catalogId) : undefined
    if (!sp || !p) return
    const sessions = Math.round(randRange(s, 150, 900) * (0.6 + 0.6 * p.giftable))
    const blog = pick(s, ['The Gift Scout', 'Deal Digger Daily', 'Cozy Buys Weekly', 'Gadget Gift Guide', 'The Budget Gifter'])
    startEvent(s, { kind: 'feature_post', title: `${blog} featured ${sp.title || p.name}`, startDay: day, endDay: day + def.durationDays, data: { storeProductId: sp.id, sessions, startHour: s.time.hour + 9, halfLifeHours: 14, posted: 1, source: blog } })
    notify(s, { kind: 'success', title: `Featured in "${blog}"`, body: `A gift-guide blog linked your ${p.name}. Expect a wave of free visitors over the next two days.`, site: 'shopifly', path: 'analytics' })
  },
  creator_stole_ad: (s, day, ctx, def) => {
    const c = s.creatives.creatives.find(x => x.id === ctx.creativeId)
    if (!c) return
    startEvent(s, { kind: 'creator_stole_ad', title: `Ad ripped off: ${c.name}`, startDay: day, endDay: day + def.durationDays - 1, data: { creativeId: c.id, creativeName: c.name } })
    const p = findProduct(c.catalogId)
    mail(s, {
      from: 'Brianna T.', fromEmail: 'bri.t.shops@inboxly.com', tag: 'customer', site: 'studio',
      subject: 'Is someone copying your video??',
      body: `Hi! I bought the ${p?.name ?? 'product'} from you last month (love it). Just saw the EXACT same video on another store's page, same voiceover and everything, selling it cheaper. Thought you should know!\n\n— Bri`,
    })
    notify(s, { kind: 'warning', title: `Another store is running your "${c.name}" video`, body: 'Audiences now see it from two advertisers — it will fatigue faster (≈30%). Plan a refresh.', site: 'studio' })
  },
  tracking_outage: (s, day) => {
    const both = chance(s, 0.4)
    const platforms: Platform[] = both ? ['fadbook', 'tiktak'] : [chance(s, 0.7) ? 'fadbook' : 'tiktak']
    const mult = Math.round(randRange(s, 0.55, 0.7) * 100) / 100
    const len = randInt(s, 3, 5)
    startEvent(s, { kind: 'tracking_outage', title: 'PearOS 26.1 privacy update: tracking degraded', startDay: day, endDay: day + len - 1, data: { platforms, mult } })
    for (const p of platforms) {
      mail(s, {
        ...(p === 'fadbook' ? SENDERS.fadbook : SENDERS.tiktak), tag: 'platform', site: p,
        subject: 'Known issue: conversion reporting delays',
        body: `We're aware of an issue affecting conversion reporting for some advertisers following the PearOS 26.1 privacy update. Reported purchases in Ads Manager may be lower than actual results for the next several days.\n\nYour campaigns continue to deliver and optimize normally. We recommend avoiding significant changes to campaigns while we work on a fix.\n\n— ${PLATFORM_LABEL[p]} Ads Support`,
      })
    }
    coachTip(s, `tracking_outage_${day}`, `Tracking outage: ${platforms.map(p => PLATFORM_LABEL[p]).join(' & ')} will under-report purchases for a few days (a phone OS privacy update). Judge your ads by REAL Shopifly orders and MER, not the Ads Manager ROAS — don't kill winners in a panic.`, { app: 'shopifly', cooldownHours: 24 * 30 })
  },
  platform_outage: (s, day, ctx) => {
    const platform = (ctx.platform as Platform) ?? 'fadbook'
    const startHour = day * 24 + randInt(s, 9, 18)
    startEvent(s, { kind: 'platform_outage', title: `${PLATFORM_LABEL[platform]} ads outage`, startDay: day, endDay: day, data: { platform, startHour, endHour: startHour + 6 } })
  },
  policy_crackdown: (s, day, _ctx, def) => {
    const platform: Platform = chance(s, 0.6) ? 'fadbook' : 'tiktak'
    startEvent(s, { kind: 'policy_crackdown', title: `${PLATFORM_LABEL[platform]} policy crackdown`, startDay: day, endDay: day + def.durationDays - 1, data: { platform } })
    mail(s, {
      ...(platform === 'fadbook' ? SENDERS.fadbook : SENDERS.tiktak), tag: 'platform', site: platform,
      subject: 'Policy update: stricter review for health and beauty claims',
      body: `To protect people from misleading claims, we're temporarily increasing enforcement of our advertising policies on health, wellness and beauty products — especially "before and after" imagery and claims about medical or physical results.\n\nAds that don't comply may be rejected, and repeated violations can restrict your ad account.\n\n— ${PLATFORM_LABEL[platform]} Advertising Policy Team`,
    })
  },
  chargeback_wave: (s, day, _ctx, def) => {
    startEvent(s, { kind: 'chargeback_wave', title: 'Friendly-fraud wave on high-ticket orders', startDay: day, endDay: day + def.durationDays - 1, data: { mult: 2, minOrder: 60 } })
    const hasApp = s.store.apps.some(a => a.appId === 'chargeflo')
    mail(s, {
      ...(hasApp ? SENDERS.chargeflo : SENDERS.shopiflyPayments), tag: hasApp ? 'misc' : 'shopifly', site: 'shopifly', path: 'disputes',
      subject: hasApp ? 'Fraud alert: spike in "item not received" disputes' : 'Risk notice: rising dispute activity on higher-value orders',
      body: `We're seeing an unusual spike in friendly-fraud disputes on orders over $60 across many stores over the past few days — mostly "item not received" and "unrecognized" claims filed after delivery.\n\nWhat helps: tracking uploaded on every order, clear shipping and refund policies, and fast answers to customer emails. ${hasApp ? 'ChargeFlo will respond to new disputes automatically.' : 'Respond to every dispute before its deadline.'}\n\n— ${hasApp ? 'ChargeFlo' : 'Shopifly Payments Risk Team'}`,
    })
  },
  payout_review: (s, day) => {
    const len = randInt(s, 3, 6)
    // Uses the store's pause semantics: payouts stay 'held' until pauseUntilDay, then the store releases them.
    s.store.hold = { active: true, reason: 'Routine account review — verify your business details', untilDay: day + len, reservePct: 0, paused: true, pauseUntilDay: day + len, kind: 'review' }
    startEvent(s, { kind: 'payout_review', title: 'Payouts paused for review', startDay: day, endDay: day + len - 1, data: { hold: 1 } })
    mail(s, {
      ...SENDERS.shopiflyPayments, tag: 'shopifly', site: 'shopifly', path: 'finances',
      subject: 'Action needed: your payouts are paused for a routine review',
      body: `Hi,\n\nAs part of a routine review of accounts with growing sales volume, we've temporarily paused payouts from your Shopifly Payments balance. This is not a penalty — sales keep processing normally.\n\nWe expect to finish the review by ${formatDate(day + len, 'long')}. Your balance will be paid out once it's complete.\n\nIn the meantime, make sure you can cover ad bills and supplier payments from your bank account or card.\n\n— Shopifly Payments`,
    })
    notify(s, { kind: 'critical', title: 'Shopifly payouts paused (routine review)', body: `No payouts until about ${formatDate(day + len, 'md')}. Plan your cash for ad bills.`, site: 'shopifly', path: 'finances' })
  },
  mom_help: (s, day) => {
    startEvent(s, { kind: 'life_trigger', title: 'Mom needs help', startDay: day, endDay: day, data: { action: 'mom_help', hour: randInt(s, 10, 19), task: pick(s, MOM_TASKS) } }, false)
  },
  roommate_party: (s, day) => {
    startEvent(s, { kind: 'life_trigger', title: 'Roommate party', startDay: day, endDay: day, data: { action: 'roommate_party', hour: 23 } })
  },
  friend_birthday: (s, day) => {
    startEvent(s, { kind: 'life_trigger', title: "Friend's birthday", startDay: day, endDay: day, data: { action: 'friend_birthday', hour: randInt(s, 17, 19), friend: pick(s, FRIENDS) } }, false)
  },
  phone_breaks: (s, day) => {
    const def = LIFE_EXPENSES.phone
    startEvent(s, { kind: 'life_trigger', title: def.title, startDay: day, endDay: day, data: { action: 'life_expense', item: 'phone', cost: randInt(s, def.cost[0], def.cost[1]), hour: randInt(s, 9, 20) } })
  },
  car_breaks: (s, day) => {
    const def = LIFE_EXPENSES.car
    startEvent(s, { kind: 'life_trigger', title: def.title, startDay: day, endDay: day, data: { action: 'life_expense', item: 'car', cost: randInt(s, def.cost[0], def.cost[1]), hour: randInt(s, 7, 10) } })
  },
}

export function rollRandomEvents(s: GameState, day: number): void {
  const drama = DIFFICULTY[s.meta.difficulty].dramaMult
  const order = shuffle(s, RANDOM_EVENTS.slice())
  let fired = 0
  for (const def of order) {
    if (fired >= MAX_RANDOM_PER_DAY) break
    if (onCooldown(s, def.kind, def.cooldownDays)) continue
    const cond = CONDITIONS[def.kind]
    const ctx = cond ? cond(s, day) : {}
    if (!ctx) continue
    const p = def.chancePerDay * (def.negative ? drama : 1)
    if (!chance(s, p)) continue
    const fire = FIRE[def.kind]
    if (!fire) continue
    fire(s, day, ctx, def)
    markFired(s, def.kind, day)
    fired++
  }
}

// ---------------------------------------------------------------------------
// Deterministic life events
// ---------------------------------------------------------------------------
export function dailyLifeEvents(s: GameState, day: number): void {
  // Sickness after 3+ days of running on empty (skip if the life module already handled it).
  if ((s.player.lowEnergyDays ?? 0) >= 3 && s.player.sickDays <= 0 && !onCooldown(s, 'sickness', 10)) {
    s.player.sickDays = randInt(s, 2, 4)
    s.player.mood = clamp(s.player.mood - 10, 0, 100)
    s.player.lowEnergyDays = 0
    markFired(s, 'sickness', day)
    startEvent(s, { kind: 'sick', title: 'Sick', startDay: day, endDay: day + s.player.sickDays - 1 })
    notify(s, { kind: 'critical', title: "You're sick", body: `Three days running on fumes caught up with you. You'll feel awful for ${s.player.sickDays} days — everything takes longer. Sleep more.` })
    coachTip(s, `sick_${day}`, 'Burnout is a business risk too. Tired founders make expensive mistakes — schedule sleep like you schedule ad checks.', { cooldownHours: 24 * 10 })
  }
  // Birthday money from Grandma (once a year on the player's birthday).
  const bday = 1 + Math.floor(hrand(s.meta.seed, 'birthday') * 364)
  const y = yearOf(day)
  const jan1 = dayOfDate(y, 0, 1)
  if (day - jan1 + 1 === bday && s.events.cooldowns[`bday_${y}`] === undefined) {
    markFired(s, `bday_${y}`, day)
    receive(s, 100, { category: 'misc', memo: 'Birthday card from Grandma', business: false, pnl: 'personalIncome' })
    s.player.mood = clamp(s.player.mood + 10, 0, 100)
    mail(s, {
      ...SENDERS.grandma, tag: 'misc',
      subject: 'Happy birthday sweetheart!!',
      body: `Happy birthday to my favorite grandchild (don't tell your cousins)!\n\nI put a little something in your account. Buy yourself something nice and not just more of those internet things.\n\nYour mother says you're starting a business. I'm very proud of you. Eat a vegetable.\n\nLove,\nGrandma`,
    })
    notify(s, { kind: 'success', title: 'Happy birthday! 🎂', body: 'Grandma sent $100.', amount: 100, site: 'bank' })
  }
  // Federal tax refund on last year's W-2 wages (once each April).
  const refundDay = dayOfDate(y, 3, 8) + Math.floor(hrand(s.meta.seed, 'refund', y) * 12)
  if (day === refundDay && s.events.cooldowns[`taxrefund_${y}`] === undefined) {
    markFired(s, `taxrefund_${y}`, day)
    const amt = randInt(s, 320, 880)
    receive(s, amt, { category: 'misc', memo: 'IRS TREAS 310 TAX REF', business: false, pnl: 'personalIncome' })
    mail(s, { ...SENDERS.bank, tag: 'bank', site: 'bank', subject: `Direct deposit received: ${money(amt)}`, body: `A direct deposit of ${money(amt)} from IRS TREAS 310 TAX REF was posted to your checking account.\n\nThis is an automated alert from Chaise Bank.` })
    notify(s, { kind: 'success', title: 'Tax refund landed', body: `${money(amt)} from last year's McDoodle's withholding.`, amount: amt, site: 'bank' })
  }
}

// ---------------------------------------------------------------------------
// Hourly triggers
// ---------------------------------------------------------------------------
export function hourlyTriggers(s: GameState): void {
  const hour = s.time.hour
  const hod = hourOfDay(hour)
  const day = today(s)
  for (const e of s.events.active) {
    if (e.kind === 'life_trigger') lifeTrigger(s, e, hod, day)
    else if (e.kind === 'platform_outage') outageNotices(s, e, hour)
    else if (e.kind === 'influencer_post') influencerPostTick(s, e, hour)
  }
}

function lifeTrigger(s: GameState, e: ActiveEvent, hod: number, day: number) {
  const d = (e.data ??= {})
  if (d.done || day !== e.startDay || hod < dataNum(e, 'hour')) return
  const action = dataStr(e, 'action')
  if (action === 'roommate_party') {
    d.done = 1
    if (s.player.location !== 'home') return
    s.player.energy = clamp(s.player.energy - 20, 0, 100)
    s.player.mood = clamp(s.player.mood + (s.player.activity?.kind === 'sleep' ? -4 : 2), 0, 100)
    notify(s, { kind: 'warning', title: 'Your roommate is throwing a party', body: 'Bass through the walls until 3 AM. You will be tired tomorrow (−20 energy).' })
    return
  }
  // Popups wait until you're home and awake (give up at 10 PM).
  if (!playerAvailable(s)) {
    if (hod >= 22) d.done = 1
    return
  }
  d.done = 1
  if (action === 'mom_help') {
    const task = dataStr(e, 'task', 'help around the house')
    pushModal(s, {
      kind: 'mom_help', title: 'Mom needs a hand',
      body: `"Honey, can you come upstairs? I need you to ${task}. It'll only take a few hours."\n\nYou live here rent-free…`,
      choices: [
        { id: 'help', label: 'Help her (3 hours)', hint: 'Family time. Business waits.', tone: 'primary' },
        { id: 'decline', label: '"Can\'t, I\'m working"', hint: 'Keep working. Guilt trip incoming.' },
      ],
      data: { task },
    })
  } else if (action === 'friend_birthday') {
    const friend = dataStr(e, 'friend', 'Jordan')
    pushModal(s, {
      kind: 'friend_birthday', title: `It's ${friend}'s birthday`,
      body: `${friend}: "yo it's my bday!! we're getting food and going out tonight, you HAVE to come. you've been a ghost since you started that store lol"`,
      choices: [
        { id: 'go', label: 'Go out tonight (~$35)', hint: 'Big mood boost, costs the evening.', tone: 'primary' },
        { id: 'skip', label: 'Skip it', hint: '"Sorry, slammed with work." Your friends notice.' },
      ],
      data: { friend },
    })
  } else if (action === 'life_expense') {
    const item = dataStr(e, 'item', 'phone') as 'phone' | 'car'
    const def = LIFE_EXPENSES[item]
    const cost = dataNum(e, 'cost', 200)
    const retry = dataNum(e, 'retry')
    pushModal(s, {
      kind: 'life_expense', title: retry ? `${def.title} (still)` : def.title,
      body: (retry ? 'You put it off, and it got worse. ' : '') + def.body.replace('{cost}', money(cost, { cents: false })),
      choices: [
        { id: 'pay', label: def.payLabel.replace('{cost}', money(cost, { cents: false })), tone: 'primary' },
        { id: 'defer', label: retry ? 'Keep living with it' : def.deferLabel, hint: 'Saves money now. Costs you in mood.' },
      ],
      data: { item, cost, retry },
    })
  }
}

function outageNotices(s: GameState, e: ActiveEvent, hour: number) {
  const d = (e.data ??= {})
  const platform = dataStr(e, 'platform', 'fadbook') as Platform
  const label = PLATFORM_LABEL[platform]
  if (!d.started && hour >= dataNum(e, 'startHour')) {
    d.started = 1
    notify(s, { kind: 'critical', title: `${label} Ads: delivery issue`, body: `${label} is investigating an issue preventing ads from delivering. Your campaigns are not spending right now. Don't duplicate or edit campaigns — it will resolve.`, site: platform })
  }
  if (!d.ended && hour >= dataNum(e, 'endHour')) {
    d.ended = 1
    notify(s, { kind: 'info', title: `${label} Ads: issue resolved`, body: 'Delivery is back to normal.', site: platform })
    mail(s, {
      ...(platform === 'fadbook' ? SENDERS.fadbook : SENDERS.tiktak), tag: 'platform', site: platform,
      subject: 'Resolved: ad delivery issue',
      body: `Earlier today some advertisers experienced an issue that prevented ads from delivering for about 6 hours. The issue has been resolved and delivery has resumed. You were not charged for the affected period.\n\nWe apologize for the inconvenience.\n\n— ${label} Ads Support`,
    })
  }
}

function influencerPostTick(s: GameState, e: ActiveEvent, hour: number) {
  const d = (e.data ??= {})
  if (d.posted || d.ghost) return
  if (hour < dataNum(e, 'startHour')) return
  const handle = dataStr(e, 'handle', 'the creator')
  if (dataNum(e, 'willPost') !== 1) {
    d.ghost = 1
    notify(s, { kind: 'warning', title: `${handle} never posted`, body: 'The free product was delivered, but no post. Gifting without a contract is a gamble.', site: 'shopifly', path: 'analytics' })
    return
  }
  d.posted = 1
  const views = dataNum(e, 'views')
  const sp = s.store.products.find(x => x.id === dataStr(e, 'storeProductId'))
  const live = sp?.status === 'active'
  notify(s, {
    kind: live ? 'success' : 'warning',
    title: `${handle} posted about your ${sp?.title || 'product'}`,
    body: live
      ? `${num(Math.round(views * 0.35))} views in the first hours and climbing. Watch "Influencer" traffic in your analytics.`
      : 'Your product page is not active — every click from the post is landing on a dead page!',
    site: 'shopifly', path: 'analytics',
  })
}

/** Cleanup and end-of-life notices for expiring events. */
export function onEventExpire(s: GameState, e: ActiveEvent): void {
  // payout_review: the store module releases paused payouts itself when pauseUntilDay passes.
  if (e.kind === 'tracking_outage') {
    notify(s, { kind: 'info', title: 'Conversion tracking recovered', body: 'Ads Manager purchase reporting is back to normal (numbers for the affected days may catch up).', site: 'fadbook' })
  }
  if (e.kind === 'influencer_post' && e.data?.posted) {
    const handle = dataStr(e, 'handle', 'The creator')
    notify(s, { kind: 'info', title: `${handle}'s post has run its course`, body: 'Compare the "Influencer" sessions and orders in Shopifly Analytics against what you paid.', site: 'shopifly', path: 'analytics' })
  }
}

