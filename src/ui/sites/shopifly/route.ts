import type { SiteProps } from '../types'

export interface ShopiflyPageProps extends SiteProps {
  /** path segments after the page key, e.g. "products/sp_3" -> ["sp_3"] */
  params: string[]
}

/** Page keys → the sidebar item they highlight */
export type ShopiflyNav =
  | 'home' | 'orders' | 'products' | 'customers' | 'analytics' | 'marketing' | 'discounts'
  | 'finances' | 'online-store' | 'apps' | 'settings' | 'inbox' | 'disputes'
