// ============================================================================
// MARKET MODULE — product catalog economics (data/products.ts), trends,
// seasonality, saturation & competitors, AliExprez listings, Mineo spy data,
// product research, samples, sourcing agent, bulk/3PL, private label.
// OWNER: sim-market-events agent. PUBLIC API; keep every export & signature.
// Implementation lives in the sibling files; this file is the contract.
// ============================================================================
import type { CatalogState, FulfillmentMode, GameState, ProductDef } from '../../core/types'
import { dayOf } from '../../core/time'
import * as catalog from './catalog'
import * as dyn from './dynamics'
import * as listing from './listing'
import * as research from './research'
import * as sourcing from './sourcing'
import * as trend from './trend'

export type { PublicListing, SpyData, SpyAd } from './listing'
export type { BulkQuote, Fulfillment } from './sourcing'

// ---- lifecycle (called by core/newGame and sim/index.ts) ----
export function createCatalogState(s: GameState): CatalogState {
  return dyn.createCatalogState(s)
}
export function marketOnNewGame(s: GameState): void {
  dyn.marketOnNewGame(s)
}
/** Trends, saturation, competitors, new product releases, sample/bulk arrivals. */
export function marketDayRollover(s: GameState, day: number): void {
  dyn.marketDayRollover(s, day)
}
export function marketTickHour(s: GameState): void {
  dyn.marketTickHour(s)
}

// ---- catalog queries (pure) ----
export function getProduct(catalogId: string): ProductDef {
  return catalog.getProduct(catalogId)
}
export function allProducts(): ProductDef[] {
  return catalog.allProducts()
}
/** Current hidden demand multiplier for a product (trend × season × saturation × difficulty), ~0..1.6 */
export function productAppeal(s: GameState, catalogId: string): number {
  return trend.productAppeal(s, catalogId)
}
export function publicListing(s: GameState, catalogId: string): listing.PublicListing | null {
  return listing.publicListing(s, catalogId)
}
/** Requires Mineo subscription. */
export function spyData(s: GameState, catalogId: string): listing.SpyData | null {
  return listing.spyData(s, catalogId)
}
/** Player-facing research notes (more/better with research depth + skill). */
export function researchInsights(s: GameState, catalogId: string): string[] {
  return research.researchInsights(s, catalogId)
}
/** Fulfillment currently used for a product (unit cost includes import duty). */
export function fulfillmentFor(s: GameState, catalogId: string): sourcing.Fulfillment {
  return sourcing.fulfillmentFor(s, catalogId)
}

// ---- actions ----
export function toggleFavorite(s: GameState, catalogId: string): void {
  const f = s.catalog.favorites
  const i = f.indexOf(catalogId)
  if (i >= 0) f.splice(i, 1)
  else if (catalog.findProduct(catalogId)) f.push(catalogId)
}
export function orderSample(s: GameState, catalogId: string): boolean {
  return sourcing.orderSample(s, catalogId)
}
/** Enqueue a product_research activity. */
export function startResearch(s: GameState, catalogId: string): void {
  research.startResearch(s, catalogId)
}
/** Activity completion. */
export function completeResearch(s: GameState, catalogId: string): void {
  research.completeResearch(s, catalogId)
}
export function subscribeSpyTool(s: GameState): boolean {
  return sourcing.subscribeSpyTool(s)
}
export function requestAgentQuote(s: GameState, catalogId: string): number | null {
  return sourcing.requestAgentQuote(s, catalogId)
}
export function placeBulkOrder(s: GameState, catalogId: string, qty: number, method: 'sea' | 'air', kind: 'bulk' | 'private_label', brandName?: string): boolean {
  return sourcing.placeBulkOrder(s, catalogId, qty, method, kind, brandName)
}
export function setFulfillmentMode(s: GameState, catalogId: string, mode: FulfillmentMode): void {
  sourcing.setFulfillmentMode(s, catalogId, mode)
}
/** Consume one unit of 3PL inventory for an order; false if out of stock. */
export function takeInventory(s: GameState, catalogId: string, qty: number): boolean {
  return sourcing.takeInventory(s, catalogId, qty)
}

// ============================================================================
// Additional exports (additive)
// ============================================================================
/** Safe lookup (undefined for unknown ids). */
export const findProduct = catalog.findProduct
/** Is the product listed on AliExprez right now? */
export const isAvailable = (s: GameState, catalogId: string) => s.catalog.available.includes(catalogId)
/** Demand multiplier (trend × season × gifting, before saturation) for any day — charts & forecasts. */
export const trendIndexAt = trend.trendIndexAt
export const seasonalityAt = trend.seasonalityAt
export const saturationOf = trend.saturationOf
/** CPM multiplier from competitors for a product (also written into s.events.modifiers.competitionMult). */
export function marketCompetitionMult(s: GameState, catalogId: string): number {
  const m = s.catalog.market[catalogId]
  return trend.competitionMultFor(m ? m.competitors : (catalog.findProduct(catalogId)?.startCompetitors ?? 0))
}
export const competitionMultFor = trend.competitionMultFor
/** Import duty rate (0.23–0.40) for a product. */
export function dutyPct(catalogId: string): number {
  const p = catalog.findProduct(catalogId)
  return p ? sourcing.dutyPctFor(p) : 0
}
/** Delivery window for AliExprez dropship incl. customs. */
export function dropshipDays(catalogId: string): [number, number] {
  const p = catalog.findProduct(catalogId)
  return p ? sourcing.dropshipDays(p) : [15, 30]
}
/** Landed cost per order (unit incl. duty + shipping) with current fulfillment. */
export const landedCost = sourcing.landedCost
/** Price the next sample would cost (item + shipping + duty). */
export function sampleCost(s: GameState, catalogId: string): number {
  const p = catalog.findProduct(catalogId)
  return p ? sourcing.sampleCost(s, p) : 0
}
/** Pure preview of a bulk / private-label order (cost breakdown, MOQ check, ETA incl. CNY). */
export const bulkQuote = sourcing.bulkQuote
export const spyToolActive = sourcing.spyToolActive
export const cancelSpyTool = sourcing.cancelSpyTool
export const MINEO_MONTHLY = sourcing.MINEO_MONTHLY
export const supplierPriceMult = sourcing.supplierPriceMult
export const supplierName = (catalogId: string) => {
  const p = catalog.findProduct(catalogId)
  return p ? listing.supplierName(p) : ''
}
/** Plausible competitor hook line for a product (for previews / examples). */
export const hookTextFor = listing.hookTextFor
/** Your store's sales of a product over the last N days (counted from store orders). */
export const recentSales = dyn.recentSales
export const lifetimeStoreOrders = dyn.lifetimeStoreOrders
export const AGENT_UNLOCK_ORDERS = dyn.AGENT_UNLOCK_ORDERS
export const PRIVATE_LABEL_UNLOCK_ORDERS = dyn.PRIVATE_LABEL_UNLOCK_ORDERS
export const MAX_RESEARCH = research.MAX_RESEARCH
/** Chart-ready market history (every 2 days, ~90 days): public orders, advertisers, demand index. */
export function marketHistory(s: GameState, catalogId: string): { day: number; orders30d: number; competitors: number; trendIndex: number }[] {
  const h = s.catalog.market[catalogId]?.hist ?? []
  return h.map(([day, orders30d, competitors, ti]) => ({ day, orders30d, competitors, trendIndex: ti / 100 }))
}
/** Days until a product releases on AliExprez (≤ 0 = available). */
export function daysUntilRelease(s: GameState, catalogId: string): number {
  const p = catalog.findProduct(catalogId)
  return p ? p.releaseDay - dayOf(s.time.hour) : Infinity
}
