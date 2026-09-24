// Scheduled calendar events: Chinese New Year supplier warnings & shutdown, BFCM, gifting holidays,
// Amazin Mega Deal Days, back-to-school, Christmas shipping cutoffs, the January lull.
import type { GameState } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { SENDERS } from '../../data/events'
import { formatDate, monthOf, yearOf, domOf } from '../../core/time'
import { coachTip, mail, notify } from '../../core/notify'
import { num } from '../../core/format'
import { findProduct, recentSales, supplierName } from '../market'
import {
  backToSchool, bfcmRange, christmasDay, cnyDropshipDelay, fathersDay, megaDealDays, mothersDay, upcomingCny, valentinesDay,
  type CnyWindow,
} from './calendar'
import { findEvent, once, startEvent } from './util'

const md = (d: number) => formatDate(d, 'md')

/** Ensure a window event exists while `day` is inside [start, end]; returns true when it was just created. */
function windowEvent(s: GameState, day: number, kind: string, title: string, start: number, end: number, data?: Record<string, unknown>): boolean {
  if (day < start || day > end) return false
  if (findEvent(s, kind, e => e.startDay === start)) return false
  startEvent(s, { kind, title, startDay: start, endDay: end, data })
  return true
}

export function scheduleCalendar(s: GameState, day: number): void {
  scheduleCny(s, day)
  const y = yearOf(day)
  scheduleRetail(s, day, y)
}

// ---------------------------------------------------------------------------
// Chinese New Year
// ---------------------------------------------------------------------------
function hasSupplierRelationship(s: GameState): boolean {
  return s.store.products.length > 0 || s.catalog.samples.length > 0 || s.catalog.bulkOrders.length > 0
}

/** Your best-selling catalog product over the last 30 days (for personalised supplier mail). */
function topProduct(s: GameState): string | null {
  let best: string | null = null
  let bestRev = 0
  for (const id of Object.keys(s.catalog.sales ?? {})) {
    const r = recentSales(s, id, 30).revenue
    if (r > bestRev) {
      bestRev = r
      best = id
    }
  }
  return best ?? s.store.products[0]?.catalogId ?? null
}

function scheduleCny(s: GameState, day: number) {
  const w = upcomingCny(day)
  if (!w) return
  const delay = cnyDropshipDelay(s.meta.seed, w.year)
  // Warning mails at T−42/−28/−14/−7 (only the most recent due one if the player loads late).
  if (day <= w.shutdownStart && hasSupplierRelationship(s)) {
    const due = [...BENCHMARKS.cny.warnDaysBefore].sort((a, b) => a - b).find(t => day >= w.day - t)
    if (due !== undefined) {
      const key = `cny_warn_${w.year}_${due}`
      if (s.events.cooldowns[key] === undefined) {
        for (const t of BENCHMARKS.cny.warnDaysBefore) if (t >= due) s.events.cooldowns[`cny_warn_${w.year}_${t}`] = day
        sendCnyWarning(s, w, due, delay)
      }
    }
  }
  if (windowEvent(s, day, 'cny_shutdown', `Chinese New Year ${w.year}: factories closed`, w.shutdownStart, w.shutdownEnd, { year: w.year, dropshipDelay: delay })) {
    notify(s, {
      kind: 'warning', title: 'Chinese New Year: suppliers are closed',
      body: `Factories and AliExprez sellers are dark until ${md(w.shutdownEnd)}. New dropship orders ship ${delay}+ days late — update the delivery promise on your product pages or expect "where is my order?" tickets.`,
      site: 'shopifly', path: 'products',
    })
  }
  windowEvent(s, day, 'cny_backlog', 'Post-holiday supplier backlog', w.shutdownEnd + 1, w.backlogEnd, { year: w.year, dropshipDelay: delay })
}

function sendCnyWarning(s: GameState, w: CnyWindow, t: number, delay: number) {
  const top = topProduct(s)
  const p = top ? findProduct(top) : undefined
  const lastProd = w.shutdownStart - 10
  if (s.catalog.unlocks.agent) {
    const perDay = top ? recentSales(s, top, 14).units / 14 : 0
    const cover = Math.ceil(perDay * (w.backlogEnd - w.shutdownStart + 14))
    mail(s, {
      from: 'Lily Chen · SourcePro', fromEmail: 'lily@sourcepro-agent.com', tag: 'supplier', site: 'aliexprez', path: 'business',
      subject: t <= 7 ? `Last call before Spring Festival — we close ${md(w.shutdownStart)}` : `Chinese New Year planning: factories close ${md(w.shutdownStart)}–${md(w.shutdownEnd)}`,
      body: [
        'Hi!',
        '',
        `Friendly reminder: Chinese New Year is ${formatDate(w.day, 'long')}. Factories stop around ${md(w.shutdownStart)} and most reopen ${md(w.shutdownEnd)}, then it takes 1–2 more weeks to get back to full speed (some workers don't come back after the holiday).`,
        '',
        `During that time AliExprez and agent orders ship ${delay}+ days late.`,
        p && perDay > 0
          ? `You sell about ${perDay.toFixed(1)} units/day of the ${p.name}. To cover the closure plus the restart you'd want roughly ${num(cover)} units in your US warehouse.`
          : 'If you have a steady seller, now is the time to stock it in a US warehouse.',
        '',
        timingLine(w, t),
        '',
        'Let me know and I will book production slots before they fill up.',
        '',
        'Lily',
      ].join('\n'),
    })
  } else {
    const name = p ? supplierName(p.id) : 'Your AliExprez supplier'
    mail(s, {
      from: name, fromEmail: `service@${(p?.id ?? 'store').replace(/[^a-z]/g, '')}.aliexprez.com`, tag: 'supplier', site: 'aliexprez',
      subject: t <= 7 ? `【Final Notice】Spring Festival holiday from ${md(w.shutdownStart)}` : `【Holiday Notice】Chinese New Year holiday ${md(w.shutdownStart)} – ${md(w.shutdownEnd)}`,
      body: [
        'Dear valued customer,',
        '',
        'Thank you for your support all the year!',
        '',
        `Please kindly noted our factory will be closed for Chinese Spring Festival holiday from ${md(w.shutdownStart)} to ${md(w.shutdownEnd)}. During holiday you can still place order but we will ship after we come back. Logistic company also stop working, so delivery will be delay about ${delay}-${delay + 7} days.`,
        '',
        t > 7
          ? 'We suggest you prepare stock in advance, and tell your customer the shipping time will be longer.'
          : 'This is final notice. Orders after this week will ship after the holiday.',
        '',
        'Wish you happy new year and prosperous business!',
        '',
        name,
      ].join('\n'),
    })
  }
  if (t >= 28) {
    coachTip(s, `cny_plan_${w.year}`, `Chinese New Year ${w.year}: suppliers close ${md(w.shutdownStart)}–${md(w.shutdownEnd)}. AliExprez orders will ship ${delay}+ days late. Either stock a US warehouse (production must start by ~${md(lastProd)}) or lengthen your delivery promise before the closure.`, { app: 'aliexprez', cooldownHours: 24 * 20 })
  }
}

function timingLine(w: CnyWindow, t: number): string {
  const lastProd = w.shutdownStart - 10
  if (t >= 42) return `Timing: sea-freight orders placed in the next few days still leave the factory before the closure. Air freight works if you order by about ${md(lastProd)}.`
  if (t >= 28) return `Sea freight ordered now would land in the middle of the closure. Air freight still works if production starts by about ${md(lastProd)}.`
  return 'It is too late for new production before the closure — anything ordered now ships after the holiday.'
}

// ---------------------------------------------------------------------------
// Retail calendar
// ---------------------------------------------------------------------------
function scheduleRetail(s: GameState, day: number, y: number) {
  const store = s.store.created
  const shopMail = (key: string, subject: string, body: string, path = 'marketing') => {
    if (!store || !once(s, key)) return
    mail(s, { ...SENDERS.shopifly, tag: 'shopifly', site: 'shopifly', path, subject, body })
  }

  // ---- Valentine's Day ----
  const vd = valentinesDay(y)
  if (day >= vd - 20 && day <= vd - 6) {
    shopMail(`vday_mail_${y}`, "Valentine's Day is coming — are your gift products ready?",
      `Valentine's shoppers start searching around ${md(vd - 13)}. Giftable products see a lift in the two weeks before ${md(vd)}.\n\n• Lead with a gift angle in your creatives\n• Add a clear "order by" date to your page — with 15–30 day AliExprez shipping, orders after early February won't arrive in time\n• Consider a bundle ("his & hers", 2-pack)\n\n— The Shopifly Team`)
  }
  windowEvent(s, day, 'valentines', "Valentine's gift season", vd - 13, vd)

  // ---- Mother's Day ----
  const mom = mothersDay(y)
  if (day >= mom - 20 && day <= mom - 10) {
    shopMail(`mday_mail_${y}`, `Mother's Day is ${md(mom)} — two weeks of gift demand`,
      `Mother's Day gift shopping peaks in the two weeks before ${md(mom)}. Products that feel like self-care, home comfort or a thoughtful upgrade do best.\n\nCheck your shipping promise: if it can't arrive by ${md(mom)}, say so clearly — late gifts become refunds and chargebacks.\n\n— The Shopifly Team`)
  }
  windowEvent(s, day, 'mothers_day', "Mother's Day gift season", mom - 14, mom)

  // ---- Father's Day ----
  const dad = fathersDay(y)
  if (day >= dad - 18 && day <= dad - 8) {
    shopMail(`fday_mail_${y}`, `Father's Day is ${md(dad)}`,
      `Dads are famously hard to shop for, which makes "the gift he'll actually use" one of the best-converting angles of the year. Gadgets, grilling/bar accessories, car gear and wallets lead the category.\n\n— The Shopifly Team`)
  }
  windowEvent(s, day, 'fathers_day', "Father's Day gift season", dad - 12, dad)

  // ---- Amazin Mega Deal Days (CVR −5% for 2 days) ----
  const [mdd0, mdd1] = megaDealDays(y)
  if (day >= mdd0 - 7 && day < mdd0) {
    shopMail(`mdd_mail_${y}`, `Heads up: Amazin Mega Deal Days ${md(mdd0)}–${md(mdd1)}`,
      `During Amazin's two-day sale, shoppers compare everything against discounted Amazin listings. Stores typically see conversion rates dip ~5% on those days.\n\nDon't panic-cut prices across the board — make sure your page explains why yours is worth it (guarantee, bundle, faster support).\n\n— The Shopifly Team`, 'analytics')
  }
  windowEvent(s, day, 'prime_day', 'Amazin Mega Deal Days', mdd0, mdd1)

  // ---- Back to school ----
  const [bts0, bts1] = backToSchool(y)
  if (day >= bts0 - 5 && day <= bts0) {
    shopMail(`bts_mail_${y}`, 'Back-to-school season starts now',
      `From late July through Labor Day, parents and students shop for bags, study gear, gadgets and organization. Angle your creatives around "ready for the new school year".\n\n— The Shopifly Team`)
  }
  windowEvent(s, day, 'back_to_school', 'Back-to-school season', bts0, bts1)

  // ---- BFCM ----
  const [bf0, bf1] = bfcmRange(y)
  if (day >= bf0 - 16 && day <= bf0 - 7) {
    shopMail(`bfcm_mail_${y}`, `BFCM ${y} is ${bf0 - day} days away — your prep checklist`,
      [
        `Black Friday / Cyber Monday runs ${md(bf0)}–${md(bf1)}. It's the biggest shopping weekend of the year — and the most expensive to advertise in.`,
        '',
        `• Ad costs: expect CPMs around ${BENCHMARKS.seasonality.bfcmCpmMult}× normal during BFCM week. Your offer has to be strong enough to beat that.`,
        '• Offer: a real discount or bundle beats "free shipping". Set it up in Discounts before the weekend.',
        '• Stock & shipping: will your supplier keep up? Update delivery promises honestly.',
        '• Support: order volume spikes — so do "where is my order?" tickets.',
        '• Cash: ad bills hit your card before payouts land. Make sure your limit can handle it.',
        '',
        '— The Shopifly Team',
      ].join('\n'), 'discounts')
    if (store) coachTip(s, `bfcm_prep_${y}`, `BFCM is ${md(bf0)}–${md(bf1)}. CPMs run ~${BENCHMARKS.seasonality.bfcmCpmMult}× normal, conversion rates rise too. Prepare a real offer (discount or bundle) now, check your card limit covers bigger ad bills, and warn customers about shipping times.`, { app: 'shopifly', cooldownHours: 24 * 20 })
  }
  if (windowEvent(s, day, 'bfcm', `Black Friday / Cyber Monday ${y}`, bf0, bf1) && store) {
    notify(s, { kind: 'info', title: 'Black Friday weekend is live', body: 'Ad auctions are crowded (CPMs ~60% higher) and shoppers are ready to buy. Watch your CPA hour by hour.', site: 'shopifly', path: 'analytics' })
  }

  // ---- Christmas shipping cutoffs ----
  const xmas = christmasDay(y)
  if (day >= xmas - 19 && day <= xmas - 12) {
    const [l, h] = BENCHMARKS.shipping.aliStandard
    shopMail(`xmas_mail_${y}`, 'Holiday shipping cutoffs: what arrives before Christmas?',
      [
        `Christmas is ${formatDate(xmas, 'long')}. Working backwards from typical delivery times:`,
        '',
        `• AliExprez Standard (${l}–${h} days): the cutoff has already passed for most orders`,
        `• AliExprez Choice (${BENCHMARKS.shipping.aliChoice.join('–')} days): order by about ${md(xmas - 14)}`,
        `• US warehouse / 3PL (${BENCHMARKS.shipping.usWarehouse3pl.join('–')} days): order by about ${md(xmas - 6)}`,
        '',
        'Add an "order by" notice to your pages. Gifts that arrive after the 25th are the #1 source of December refunds and "item not received" chargebacks.',
        '',
        '— The Shopifly Team',
      ].join('\n'), 'products')
  }
  windowEvent(s, day, 'xmas_cutoff', 'Christmas shipping cutoffs', xmas - 12, xmas)

  // ---- January lull ("Q5") ----
  if (monthOf(day) === 0 && domOf(day) >= 2 && domOf(day) <= 6 && store) {
    coachTip(s, `q5_${y}`, `January is the cheapest month to advertise (CPMs ~${Math.round((1 - BENCHMARKS.seasonality.cpmByMonth[0]) * 100)}% below average), but conversion rates dip too as shoppers recover from the holidays. Great time to test new products and creatives cheaply.`, { app: 'fadbook', cooldownHours: 24 * 300 })
  }
}
