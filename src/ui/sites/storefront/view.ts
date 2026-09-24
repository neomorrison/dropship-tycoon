// Read-only view models for the storefront: everything the st- components need,
// derived from game state with the store module's public helpers. The Theme Editor
// passes a state with draft overrides (unsaved sections / theme settings) through
// `withOverrides`, so the preview renders exactly what the live store would.
import type { Creative, GameState, ProductDef, SectionId, StoreProduct, StoreState } from '../../../core/types'
import {
  effectivePrice, effectivePromise, hasBundles, hasStickyAtc, hasTrustBadges, realDeliveryWindow, sectionActive,
} from '../../../sim/store'
import { getProduct } from '../../../sim/market'
import { themeDef } from '../../../data/themes'
import { dayOf } from '../../../core/time'
import { money } from '../../../core/format'
import { themeTokens, type StoreThemeTokens } from './theme'

export interface StoreView {
  created: boolean
  name: string
  logoText: string
  domain: string
  announcement: string
  theme: StoreThemeTokens
  policies: StoreState['policies']
  shipping: StoreState['shipping']
  payments: StoreState['payments']
  /** products visible to shoppers (status active) */
  products: StoreProduct[]
  day: number
  supportEmail: string
  /** installed reviews app (drives the reviews widget look) */
  reviewsApp: 'judgyme' | 'lookz' | 'vitalz' | null
}

export interface ProductModel {
  product: StoreProduct
  def: ProductDef | null
  /** sections that are enabled AND unlocked (what actually renders) */
  active: Set<SectionId>
  /** enabled sections hidden because their app/theme requirement is missing */
  locked: SectionId[]
  sticky: boolean
  /** trust badges come from the theme, not a section */
  trustBuiltIn: boolean
  trustBadges: boolean
  bundles: boolean
  /** price after automatic discounts */
  price: number
  promise: [number, number] | null
  realWindow: [number, number]
  /** ready creatives of this product (UGC gallery / lifestyle media) */
  creatives: Creative[]
}

export function catalogDef(catalogId: string): ProductDef | null {
  try {
    return getProduct(catalogId)
  } catch {
    return null
  }
}

/** Default announcement: free-shipping message, else a welcome line. */
export function autoAnnouncement(st: StoreState): string {
  if (st.shipping.freeShipping) return 'Free shipping on all orders'
  if (st.shipping.freeOver != null) return `Free shipping on orders over ${money(st.shipping.freeOver, { cents: st.shipping.freeOver % 1 !== 0 })}`
  return `Welcome to ${st.name || 'our store'}`
}

export function buildStoreView(s: GameState): StoreView {
  const st = s.store
  const domain = st.customDomain ?? st.subdomain
  const app = (['lookz', 'judgyme', 'vitalz'] as const).find(id => st.apps.some(a => a.appId === id)) ?? null
  return {
    created: st.created,
    name: st.name,
    logoText: st.theme.logoText || st.name,
    domain,
    announcement: st.theme.announcement ?? autoAnnouncement(st),
    theme: themeTokens(st.theme, st.theme.id),
    policies: st.policies,
    shipping: st.shipping,
    payments: st.payments,
    products: st.products.filter(p => p.status === 'active'),
    day: dayOf(s.time.hour),
    supportEmail: `support@${domain || 'store.myshopifly.com'}`,
    reviewsApp: app,
  }
}

export function buildProductModel(s: GameState, p: StoreProduct): ProductModel {
  const active = new Set<SectionId>()
  const locked: SectionId[] = []
  for (const sec of p.sections) {
    if (!sec.enabled) continue
    if (sectionActive(s, p, sec.id)) active.add(sec.id)
    else locked.push(sec.id)
  }
  const th = themeDef(s.store.theme.id)
  const trustBuiltIn = !!th.builtIn.trustBadges && !active.has('trust_badges')
  return {
    product: p,
    def: catalogDef(p.catalogId),
    active,
    locked,
    sticky: hasStickyAtc(s, p),
    trustBuiltIn,
    trustBadges: hasTrustBadges(s, p),
    bundles: hasBundles(s, p),
    price: effectivePrice(s, p),
    promise: effectivePromise(p),
    realWindow: realDeliveryWindow(s, p.catalogId),
    creatives: (s.creatives?.creatives ?? []).filter(c => c.catalogId === p.catalogId && c.status === 'ready'),
  }
}

/**
 * A shallow copy of the game state with draft edits applied (for previews and live grading).
 * Pure: never mutates `s`.
 */
export function withOverrides(
  s: GameState,
  o: { product?: StoreProduct; theme?: Partial<StoreState['theme']>; themeId?: string },
): GameState {
  if (!o.product && !o.theme && !o.themeId) return s
  const theme = { ...s.store.theme, ...(o.theme ?? {}), ...(o.themeId ? { id: o.themeId } : {}) }
  const products = o.product ? s.store.products.map(p => (p.id === o.product!.id ? o.product! : p)) : s.store.products
  return { ...s, store: { ...s.store, theme, products } }
}
