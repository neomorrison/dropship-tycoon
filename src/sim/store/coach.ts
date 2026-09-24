// Coach Kev tips about store problems (the events module owns the coach itself;
// these are the store-specific diagnostics, deduped via coachTip ids/cooldowns).
import type { GameState } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { pct } from '../../core/format'
import { hourOfDay } from '../../core/time'
import { coachTip } from '../../core/notify'
import { storeRange } from './analytics'
import { awaitingSupplier, chargebackRatio } from './ops'
import { hasApp, PAYMENT_LABELS, today } from './util'

export function storeCoachTick(s: GameState) {
  const st = s.store
  if (!st.created) return
  const h = hourOfDay(s.time.hour)
  if (h !== 10 && h !== 19) return
  const day = today(s)
  const live = st.products.filter(p => p.status === 'active')
  const runningAds = s.ads?.ads?.some(a => a.status === 'active' && st.products.some(p => p.id === a.storeProductId)) ?? false

  if (live.length && !hasApp(s, 'dserz')) {
    const waiting = st.orders.filter(awaitingSupplier).filter(o => o.fulfilledBy !== '3pl').length
    coachTip(s, 'store_no_dserz', waiting
      ? `${waiting} order${waiting === 1 ? ' is' : 's are'} sitting unfulfilled. Without DSerz nothing gets sent to the supplier until you click Fulfill. Install DSerz (free) so orders are placed automatically.`
      : 'Your product is live but DSerz isn\'t installed. When orders come in, they\'ll wait for you to fulfill them by hand. Install it from the App Store (free).',
    { app: 'shopifly', essential: true, cooldownHours: 48 })
  }
  if ((live.length || runningAds) && !st.pixel.fadbook.installed && !st.pixel.tiktak.installed) {
    coachTip(s, 'store_no_pixel', 'No ad pixel on your store. Install the Fadbook & Instaglam (or TikTak) channel app so the ad platforms can see purchases. Without pixel data they can\'t optimize for buyers, and you\'ll pay for clicks from people who never buy.', { app: 'shopifly', essential: true, cooldownHours: 72 })
  }
  const pol = st.policies
  const missing = (['refund', 'shipping', 'privacy', 'terms'] as const).filter(k => pol[k].trim().length < 80)
  if (live.length && missing.length >= 2) {
    coachTip(s, 'store_no_policies', `Your store has no ${missing.join(', ')} polic${missing.length === 1 ? 'y' : 'ies'}. Shoppers look for them before trusting a new store, and processors ask for them in disputes. Settings → Policies → "Create from template" takes a minute.`, { app: 'shopifly', cooldownHours: 24 * 5 })
  }
  const copied = live.find(p => (p.grade?.copy?.titleSimilarity ?? 0) > 0.5)
  if (copied) {
    coachTip(s, 'store_copied_title', `"${copied.title.slice(0, 50)}…" is still the supplier's AliExprez title. Shoppers can smell a dropshipper a mile away. Give it a real product name plus one benefit, 25–70 characters.`, { app: 'shopifly', essential: true, cooldownHours: 72 })
  }
  const slow = live.find(p => (p.grade?.loadTime ?? 0) > 3.2)
  if (slow) {
    coachTip(s, 'store_slow_page', `Your product page takes ${slow.grade!.loadTime.toFixed(1)}s to load. Every second past ~2.5s loses around 10% of buyers. Uninstall apps you don't really use.`, { app: 'shopifly', cooldownHours: 24 * 5 })
  }
  const liar = live.find(p => p.grade?.shippingLie)
  if (liar) {
    coachTip(s, 'store_shipping_lie', 'Your page promises faster delivery than your supplier can do. It might squeeze out a few extra sales, but late orders become "item not received" chargebacks, and those can freeze your payouts.', { app: 'shopifly', cooldownHours: 24 * 4 })
  }
  // funnel diagnosis over the last 3 days
  const r = storeRange(s, { from: day - 3, to: day - 1 })
  if (r.sessions >= 300) {
    const cvr = r.converted / r.sessions
    const atc = r.atc / r.sessions
    if (cvr < 0.01 && atc >= BENCHMARKS.store.atcRate.avg) {
      const why = !st.shipping.freeShipping && (st.shipping.freeOver == null) ? 'you charge shipping at checkout' : !st.payments.paypal ? `there's no ${PAYMENT_LABELS.paypal} option` : 'something at checkout scares them off'
      coachTip(s, 'store_checkout_leak', `People add to cart (${pct(atc, 1)} ATC rate) but only ${pct(cvr, 2)} buy. That's a checkout problem, and my guess is ${why}. Surprise costs at checkout are the #1 reason carts get abandoned.`, { app: 'shopifly', cooldownHours: 24 * 4 })
    } else if (cvr < BENCHMARKS.store.cvr.bad && atc < BENCHMARKS.store.atcRate.bad) {
      coachTip(s, 'store_page_not_converting', `${r.sessions.toLocaleString('en-US')} sessions, ${pct(cvr, 2)} conversion. Visitors aren't even adding to cart, so the product page isn't convincing them. Check the Page grade: reviews, price vs what it's worth, and copy that sells outcomes.`, { app: 'shopifly', cooldownHours: 24 * 4 })
    }
  }
  const open = st.tickets.filter(t => t.status !== 'solved')
  const dueSoon = open.filter(t => t.status === 'open' && t.dueHour - s.time.hour <= 12).length
  if (open.length >= 5 || dueSoon) {
    coachTip(s, 'store_open_tickets', `${open.length} customer message${open.length === 1 ? '' : 's'} waiting${dueSoon ? ` (${dueSoon} escalate within 12h)` : ''}. Unanswered customers call their bank. Do a Customer support session or hire a VA on UpWorx.`, { app: 'shopifly', cooldownHours: 24 })
  }
  const ratio = chargebackRatio(s)
  if (ratio > 0.005 && st.chargebacks.filter(c => c.openedDay > day - 30).length >= 2) {
    coachTip(s, 'store_cb_ratio', `Your chargeback rate is ${pct(ratio)} of orders (30 days). Stay under 0.75%. Above 1% Shopifly holds a reserve and your ad accounts get flagged. Refund unhappy customers before they dispute, and don't over-promise shipping.`, { app: 'shopifly', cooldownHours: 24 * 5 })
  }
  if (st.plan === 'trial' && st.trialEndsDay != null && st.trialEndsDay - day === 3) {
    coachTip(s, 'store_trial_ending', 'Your $1 Shopifly offer ends in 3 days. After that it\'s $39/month on your card. Budget for it.', { app: 'bank', cooldownHours: 24 * 10 })
  }
}
