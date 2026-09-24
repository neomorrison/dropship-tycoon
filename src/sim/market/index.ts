// ============================================================================
// MARKET MODULE — product catalog economics (data/products.ts), trends,
// seasonality, saturation & competitors, AliExprez listings, Mineo spy data,
// product research, samples, sourcing agent, bulk/3PL, private label.
// OWNER: sim-market-events agent. PUBLIC API; keep every export & signature.
// ============================================================================
import type { CatalogState, FulfillmentMode, GameState, ProductDef } from '../../core/types'

export function createCatalogState(_s: GameState): CatalogState {
  return { available: [], market: {}, favorites: [], samples: [], samplesOwned: [], bulkOrders: [], inventory: {}, sourcing: {}, unlocks: { agent: false, threePL: false, privateLabel: false, spyTool: false }, spyToolUntilDay: null, research: {} }
}
export function marketOnNewGame(_s: GameState): void {}
/** Trends, saturation, competitors, new product releases, sample/bulk arrivals. */
export function marketDayRollover(_s: GameState, _day: number): void {}
export function marketTickHour(_s: GameState): void {}

// ---- catalog queries (pure) ----
export function getProduct(_catalogId: string): ProductDef { throw new Error('market.getProduct not implemented') }
export function allProducts(): ProductDef[] { return [] }
/** Current hidden demand multiplier for a product (trend × season × saturation × difficulty), ~0..1.6 */
export function productAppeal(_s: GameState, _catalogId: string): number { return 1 }
export interface PublicListing {
  price: number
  originalPrice: number
  orders30d: number
  soldLabel: string
  rating: number
  reviews: number
  shipDays: [number, number]
  shipCost: number
  choice: boolean
  supplierName: string
  supplierYears: number
  badges: string[]
}
export function publicListing(_s: GameState, _catalogId: string): PublicListing | null { return null }
export interface SpyData {
  activeAds: number
  advertisers: number
  firstSeenDaysAgo: number
  avgLikes: number
  engagementTrend: 'rising' | 'flat' | 'falling'
  competitorPrice: number
  topAds: { advertiser: string; platform: 'fadbook' | 'tiktak'; likes: number; comments: number; shares: number; daysRunning: number; hook: string }[]
}
/** Requires Mineo subscription. */
export function spyData(_s: GameState, _catalogId: string): SpyData | null { return null }
/** Player-facing research notes (more/better with research depth + skill). */
export function researchInsights(_s: GameState, _catalogId: string): string[] { return [] }
/** Fulfillment currently used for a product. */
export function fulfillmentFor(_s: GameState, _catalogId: string): { mode: FulfillmentMode; unitCost: number; shipCost: number; shipDays: [number, number]; inStock: boolean } {
  return { mode: 'dropship', unitCost: 0, shipCost: 0, shipDays: [12, 20], inStock: true }
}

// ---- actions ----
export function toggleFavorite(_s: GameState, _catalogId: string): void {}
export function orderSample(_s: GameState, _catalogId: string): boolean { return false }
/** Enqueue a product_research activity. */
export function startResearch(_s: GameState, _catalogId: string): void {}
/** Activity completion. */
export function completeResearch(_s: GameState, _catalogId: string): void {}
export function subscribeSpyTool(_s: GameState): boolean { return false }
export function requestAgentQuote(_s: GameState, _catalogId: string): number | null { return null }
export function placeBulkOrder(_s: GameState, _catalogId: string, _qty: number, _method: 'sea' | 'air', _kind: 'bulk' | 'private_label', _brandName?: string): boolean { return false }
export function setFulfillmentMode(_s: GameState, _catalogId: string, _mode: FulfillmentMode): void {}
/** Consume one unit of 3PL inventory for an order; false if out of stock. */
export function takeInventory(_s: GameState, _catalogId: string, _qty: number): boolean { return false }
