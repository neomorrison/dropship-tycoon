// ============================================================================
// STORE MODULE — Shopifly: products & page grading (CRO), funnel & orders,
// fulfillment, tickets, refunds, chargebacks, payouts, apps, analytics.
// OWNER: sim-store agent. PUBLIC API; keep every export & signature.
// ============================================================================
import type {
  ConversionEvent, Discount, GameState, PageGrade, PlanId, StoreDay, StoreProduct, StoreState,
  TrafficPacket, TrafficSource,
} from '../../core/types'
import type { DateRange } from '../../core/time'

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
/** Organic/direct/email/influencer/viral traffic for this hour. */
export function storeOrganicTraffic(_s: GameState): TrafficPacket[] { return [] }
/** Convert traffic → sessions/ATC/checkout/orders; create orders; return per-ad conversions. */
export function storeProcessTraffic(_s: GameState, _packets: TrafficPacket[]): ConversionEvent[] { return [] }
/** Fulfillment, deliveries, tickets, refunds, chargeback decisions, live visitors. */
export function storeTickHour(_s: GameState): void {}
/** Payouts, holds, app billing, review accrual, analytics pruning. */
export function storeDayRollover(_s: GameState, _day: number): void {}

// ---- setup & settings ----
export function createStore(_s: GameState, _input: { name: string }): void {}
export function updateStoreSettings(_s: GameState, _patch: Partial<Pick<StoreState, 'name' | 'theme' | 'policies' | 'payments' | 'shipping'>>): void {}
export function generatePolicy(_s: GameState, _kind: keyof StoreState['policies']): string { return '' }
export function buyDomain(_s: GameState, _domain: string): boolean { return false }
export function changePlan(_s: GameState, _plan: PlanId): void {}

// ---- products ----
/** Import from AliExprez → draft StoreProduct using supplier title/description/photos. Returns id. */
export function importProduct(_s: GameState, _catalogId: string): string { return '' }
/** Patch a product and regrade its page. */
export function updateProduct(_s: GameState, _id: string, _patch: Partial<StoreProduct>): void {}
export function setProductStatus(_s: GameState, _id: string, _status: StoreProduct['status']): void {}
export function deleteProduct(_s: GameState, _id: string): void {}
/** CRO grader — the heart of page-building skill. Pure. */
export function gradePage(_s: GameState, _p: StoreProduct): PageGrade {
  return { score: 50, cvrMult: 1, aovMult: 1, trust: 0.5, loadTime: 2, honesty: 1, factors: [], gradedHour: 0 }
}
/** Requires a reviews app. Imports supplier reviews (count, min stars). */
export function importReviews(_s: GameState, _storeProductId: string, _count: number, _minStars: number): boolean { return false }

// ---- apps ----
export function installApp(_s: GameState, _appId: string, _planIdx?: number): boolean { return false }
export function uninstallApp(_s: GameState, _appId: string): void {}

// ---- discounts ----
export function upsertDiscount(_s: GameState, _d: Discount): void {}
export function deleteDiscount(_s: GameState, _id: string): void {}

// ---- orders / support / disputes ----
export function refundOrder(_s: GameState, _orderId: number, _amount?: number): void {}
export function answerTicket(_s: GameState, _ticketId: string, _resolution: 'answered' | 'refunded' | 'replacement' | 'partial_refund'): void {}
/** Activity completion: work through up to `count` open tickets. Returns solved count. */
export function resolveTickets(_s: GameState, _count: number): number { return 0 }
/** 'self' enqueues the fight_chargeback activity; 'accept' concedes immediately. */
export function respondChargeback(_s: GameState, _id: string, _how: 'self' | 'accept'): void {}
/** Activity/app completion: submit evidence. */
export function submitChargeback(_s: GameState, _id: string, _by: 'self' | 'app'): void {}

// ---- queries (pure) ----
export function emptyStoreDay(): StoreDay {
  return {
    sessions: 0, sessionsBySource: {}, sessionsByDevice: { mobile: 0, desktop: 0, tablet: 0 }, atc: 0, checkout: 0,
    converted: 0, orders: 0, units: 0, grossSales: 0, discounts: 0, returns: 0, netSales: 0, shipping: 0, taxes: 0,
    totalSales: 0, newCustomers: 0, returningCustomers: 0, ordersBySource: {}, salesBySource: {}, byProduct: {}, cogs: 0, fees: 0,
  }
}
/** Sum StoreDay over a range. */
export function storeRange(_s: GameState, _range: DateRange): StoreDay { return emptyStoreDay() }
export type StoreMetric = 'totalSales' | 'netSales' | 'orders' | 'sessions' | 'conversionRate' | 'aov' | 'atcRate' | 'returningRate'
/** Chart series: hourly buckets for ≤2-day ranges, else daily. */
export function storeSeries(_s: GameState, _metric: StoreMetric, _range: DateRange): { t: number; label: string; value: number }[] { return [] }
export function breakEven(_s: GameState, _storeProductId: string): { landedCost: number; fees: number; margin: number; breakEvenCpa: number; breakEvenRoas: number } {
  return { landedCost: 0, fees: 0, margin: 0, breakEvenCpa: 0, breakEvenRoas: 0 }
}
export function sourceLabel(src: TrafficSource): string {
  return ({ fadbook: 'Fadbook', tiktak: 'TikTak', tiktak_organic: 'TikTak (organic)', influencer: 'Influencer', organic: 'Search', direct: 'Direct', email: 'Klavio email' } as const)[src]
}
