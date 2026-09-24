// Static catalog lookups (pure). Data lives in src/data/products.ts.
import type { ProductDef } from '../../core/types'
import { PRODUCTS, PRODUCT_BY_ID } from '../../data/products'

export function getProduct(catalogId: string): ProductDef {
  const p = PRODUCT_BY_ID[catalogId]
  if (!p) throw new Error(`Unknown product ${catalogId}`)
  return p
}
/** Like getProduct but returns undefined for unknown ids (safe in UI code). */
export function findProduct(catalogId: string): ProductDef | undefined {
  return PRODUCT_BY_ID[catalogId]
}
export function allProducts(): ProductDef[] {
  return PRODUCTS
}
