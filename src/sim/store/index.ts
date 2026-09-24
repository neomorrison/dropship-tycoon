// ============================================================================
// STORE MODULE — Shopifly: products & page grading (CRO), funnel & orders,
// fulfillment, tickets, refunds, chargebacks, payouts, apps, analytics.
// OWNER: sim-store agent. PUBLIC API; keep every export & signature.
// Implementation lives in: grade.ts (CRO grader), text.ts (copy analysis),
// funnel.ts (traffic/CVR/orders), ops.ts (fulfillment/tickets/refunds/disputes),
// payouts.ts (payouts/holds), setup.ts (store/apps/themes/products), analytics.ts, coach.ts.
// ============================================================================
import type { GameState, StoreState, TrafficSource } from '../../core/types'
import { binomial, randRange, weightedPick } from '../../core/rng'
import { BENCHMARKS } from '../../data/benchmarks'
import { pruneAnalytics } from './analytics'
import { storeCoachTick } from './coach'
import { chargebackMonitor, createDailyPayout, settlePayouts } from './payouts'
import { chargebacksDaily, escalateTickets, orderEventsHour, processFulfillmentQueue, pruneOps, reviewsDaily } from './ops'
import { planDaily, regradeAll } from './setup'
import { APP_SIM, hasApp } from './util'

export function createStoreState(): StoreState {
  return {
    created: false, name: '', subdomain: '', customDomain: null, plan: 'trial', trialEndsDay: null, createdDay: null,
    theme: { id: 'dawnish', primaryColor: '#121212', font: 'Inter', logoText: '' },
    policies: { refund: '', shipping: '', privacy: '', terms: '', contact: '' },
    payments: { paypal: false, shopPay: true, bnpl: false },
    shipping: { freeShipping: true, flatRate: 4.99, freeOver: null },
    products: [], apps: [], discounts: [], orders: [], orderSeq: 1001, customers: { total: 0, returning: 0 },
    emailSubscribers: 0, tickets: [], chargebacks: [], payouts: [], pendingBalance: 0, hold: null,
    analytics: { daily: {}, hourly: {} },
    pixel: { fadbook: { installed: false, purchases: 0, atc: 0, views: 0 }, tiktak: { installed: false, purchases: 0, atc: 0, views: 0 } },
    liveVisitors: 0, repeatPipeline: [],
  }
}

// ---- traffic & conversion (funnel.ts) ----
/** Organic/direct/email/influencer/viral traffic for this hour. */
export { storeOrganicTraffic } from './funnel'
/** Convert traffic → sessions/ATC/checkout/orders; create orders; return per-ad conversions. */
export { storeProcessTraffic } from './funnel'
/** HIDDEN model internals (balance bots/tests only — never show to players). */
export { conversionParts, priceFactor, absPriceBase } from './funnel'

/** Fulfillment, deliveries, tickets, refunds, chargeback decisions, live visitors. */
export function storeTickHour(s: GameState): void {
  if (!s.store.created) return
  processFulfillmentQueue(s)
  orderEventsHour(s)
  escalateTickets(s)
  settlePayouts(s)
  storeCoachTick(s)
  delete s.store.analytics.hourly[s.time.hour - 73]
}

/** Payouts, holds, app billing, review accrual, analytics pruning. */
export function storeDayRollover(s: GameState, day: number): void {
  const st = s.store
  if (!st.created) return
  planDaily(s, day)
  scheduleRecoveries(s, day)
  createDailyPayout(s, day)
  chargebacksDaily(s, day)
  chargebackMonitor(s, day)
  reviewsDaily(s, day)
  regradeAll(s)
  st.repeatPipeline = st.repeatPipeline.filter(x => x.day >= day)
  pruneAnalytics(s, day)
  pruneOps(s, day)
}

/** Klavio: win back 6–9% of yesterday's abandoned checkouts as email orders today. */
function scheduleRecoveries(s: GameState, day: number) {
  const st = s.store
  const ab = st.abandoned
  if (!ab || ab.day !== day - 1) return
  st.abandoned = { day, byProduct: {} }
  if (!hasApp(s, 'klavio')) return
  const hours = Array.from({ length: 24 }, (_, h) => h).filter(h => h >= 7)
  for (const [spId, n] of Object.entries(ab.byProduct)) {
    const k = binomial(s, n, randRange(s, APP_SIM.klavioRecovery[0], APP_SIM.klavioRecovery[1]))
    for (let i = 0; i < k; i++) {
      const h = weightedPick(s, hours, x => BENCHMARKS.seasonality.trafficByHour[x])
      const hour = day * 24 + h
      const rec = (st.recovery ??= [])
      const ex = rec.find(r => r.storeProductId === spId && r.hour === hour)
      if (ex) ex.count++
      else rec.push({ storeProductId: spId, hour, count: 1 })
    }
  }
}

// ---- setup & settings (setup.ts) ----
export { createStore, updateStoreSettings, generatePolicy, buyDomain, changePlan } from './setup'
/** Domain availability & price check (no purchase). */
export { domainQuote } from './setup'
/** Theme library: premium themes are bought once, then published. */
export { buyTheme, publishTheme, canUseTheme } from './setup'

// ---- products (setup.ts / grade.ts) ----
/** Import from AliExprez → draft StoreProduct using supplier title/description/photos. Returns id. */
export { importProduct } from './setup'
/** Patch a product and regrade its page. */
export { updateProduct, setProductStatus, deleteProduct, sanitizeHtml } from './setup'
/** CRO grader — the heart of page-building skill. Pure. */
export { gradePage, cvrMultFromScore, FACTOR_WEIGHTS } from './grade'
/** Page helpers for the editor/storefront. */
export {
  sectionAvailability, sectionActive, hasStickyAtc, hasTrustBadges, hasBundles, effectiveLoadTime, effectivePrice,
  effectivePromise, realDeliveryWindow,
} from './grade'
/** Requires a reviews app. Imports supplier reviews (count, min stars). */
export { importReviews } from './setup'

// ---- apps ----
export { installApp, uninstallApp } from './setup'

// ---- discounts ----
export { upsertDiscount, deleteDiscount } from './setup'

// ---- orders / support / disputes (ops.ts) ----
export { refundOrder, answerTicket } from './ops'
/** Activity completion: work through up to `count` open tickets. Returns solved count. */
export { resolveTickets } from './ops'
/** 'self' enqueues the fight_chargeback activity; 'accept' concedes immediately. */
export { respondChargeback } from './ops'
/** Activity/app completion: submit evidence. */
export { submitChargeback } from './ops'
/** Manual fulfillment (no DSerz): place & pay the supplier order. */
export { fulfillOrder, fulfillOrders, awaitingSupplier } from './ops'
/** Disputes ÷ orders over the last N days (default 30). Ads read this for account risk. */
export { chargebackRatio, chargebackEvidencePreview, openTicketCount, ordersToFulfill } from './ops'
export { REPLY_TEMPLATES, DISPUTE_REASON_TEXT } from './templates'

// ---- queries (pure) ----
export { emptyStoreDay, storeRange, storeSeries, breakEven } from './analytics'
export type { StoreMetric } from './analytics'
export { planFees as storePlanFees, PLAN_LABEL, PAYMENT_LABELS, lifetimeOrders } from './util'

export function sourceLabel(src: TrafficSource): string {
  return ({ fadbook: 'Fadbook', tiktak: 'TikTak', tiktak_organic: 'TikTak (organic)', influencer: 'Influencer', organic: 'Search', direct: 'Direct', email: 'Klavio email' } as const)[src]
}
