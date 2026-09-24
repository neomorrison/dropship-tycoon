// ============================================================================
// MARKET MODULE — product catalog economics (data/products.ts), trends,
// seasonality, saturation & competitors, AliExprez listings, Mineo spy data,
// product research, samples, sourcing agent, bulk/3PL, private label.
// OWNER: sim-market-events agent. PUBLIC API; keep every export & signature.
// ============================================================================
import type { CatalogState, FulfillmentMode, GameState, ProductDef } from '../../core/types'
import { PRODUCT_LIST } from '../../data/productList'

// TEMPORARY fallback catalog so other modules can run before data/products.ts exists.
// sim-market-events replaces this with the authored PRODUCTS data.
const ARCH: Record<string, Partial<ProductDef>> = {
  winner: { baseDemand: 0.88, wow: 0.75, perceivedValue: 39.99, cogs: 7, defectRate: 0.05, scaleCeiling: 3000 },
  highticket: { baseDemand: 0.78, wow: 0.75, perceivedValue: 149, cogs: 28, defectRate: 0.06, scaleCeiling: 2500 },
  seasonal: { baseDemand: 0.8, wow: 0.75, perceivedValue: 44.99, cogs: 9, defectRate: 0.05, scaleCeiling: 2500 },
  emerging: { baseDemand: 0.82, wow: 0.7, perceivedValue: 34.99, cogs: 6, defectRate: 0.05, scaleCeiling: 2000 },
  solid: { baseDemand: 0.62, wow: 0.5, perceivedValue: 29.99, cogs: 8, defectRate: 0.05, scaleCeiling: 800 },
  saturated: { baseDemand: 0.75, wow: 0.55, perceivedValue: 27.99, cogs: 7, defectRate: 0.06, scaleCeiling: 900, startSaturation: 0.7, startCompetitors: 55 },
  dud: { baseDemand: 0.32, wow: 0.3, perceivedValue: 14.99, cogs: 4, defectRate: 0.05, scaleCeiling: 150 },
  trap: { baseDemand: 0.8, wow: 0.8, perceivedValue: 39.99, cogs: 8, defectRate: 0.28, scaleCeiling: 1500 },
}
const FALLBACK: ProductDef[] = PRODUCT_LIST.map((l, i) => {
  const a = ARCH[l.archetype]
  const cogs = a.cogs ?? 8
  return {
    id: l.id, name: l.name, niche: l.niche, archetype: l.archetype,
    supplierTitle: `2026 New Hot Sale ${l.name} Portable Upgraded High Quality Free Shipping`,
    supplierDescription: `Product Name: ${l.name}\nMaterial: ABS\nPackage Include: 1 x ${l.name}\nNote: Please allow 1-3cm error due to manual measurement.`,
    specs: { Material: 'ABS' }, variants: [{ name: 'Color', values: ['Black', 'White'] }],
    cogs, shipCost: 3.5, shipDays: [15, 30], weightKg: 0.4, bulkCogs: cogs * 0.68, moq: 200,
    privateLabelCogs: cogs * 0.8, privateLabelMoq: 500, perceivedValue: a.perceivedValue ?? 29.99,
    amazonPrice: (a.perceivedValue ?? 29.99) * 0.95, baseDemand: a.baseDemand ?? 0.5, wow: a.wow ?? 0.5,
    problemSolving: 0.6, impulse: 0.6, giftable: 0.4, repeatRate: 0.05,
    audience: { gender: 'all', ageMin: 25, ageMax: 54 }, platformFit: { fadbook: 0.7, tiktak: 0.7 },
    bestFormats: ['demo_video', 'ugc_testimonial'], bestHooks: ['problem_callout', 'pov'], bestAngles: ['pain_point', 'convenience'],
    seasonality: Array(12).fill(1), trend: { kind: 'evergreen', emergeDay: 0, peakDay: 0, halfLifeDays: 9999 },
    startSaturation: a.startSaturation ?? 0.2, startCompetitors: a.startCompetitors ?? 8, defectRate: a.defectRate ?? 0.05,
    claimRisk: 0.1, scaleCeiling: a.scaleCeiling ?? 800, keywords: ['easy', 'finally', 'save time'], objections: ['Does it work?', 'Shipping time?'],
    publicSignals: { ordersBase: 5000, rating: 4.6, reviews: 1200, supplierYears: 4, choice: i % 3 === 0 }, releaseDay: 0, brandable: 0.5,
  }
})

export function createCatalogState(_s: GameState): CatalogState {
  return { available: [], market: {}, favorites: [], samples: [], samplesOwned: [], bulkOrders: [], inventory: {}, sourcing: {}, unlocks: { agent: false, threePL: false, privateLabel: false, spyTool: false }, spyToolUntilDay: null, research: {} }
}
export function marketOnNewGame(_s: GameState): void {}
/** Trends, saturation, competitors, new product releases, sample/bulk arrivals. */
export function marketDayRollover(_s: GameState, _day: number): void {}
export function marketTickHour(_s: GameState): void {}

// ---- catalog queries (pure) ----
export function getProduct(catalogId: string): ProductDef {
  const p = FALLBACK.find(x => x.id === catalogId)
  if (!p) throw new Error(`Unknown product ${catalogId}`)
  return p
}
export function allProducts(): ProductDef[] { return FALLBACK }
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
