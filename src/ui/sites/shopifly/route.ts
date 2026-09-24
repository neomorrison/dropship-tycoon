import type { SiteProps } from '../types'

export interface ShopiflyPageProps extends SiteProps {
  /** path segments after the page key, e.g. "products/sp_3" -> ["sp_3"] */
  params: string[]
}

/** Page keys → the sidebar item they highlight */
export type ShopiflyNav =
  | 'home' | 'orders' | 'products' | 'customers' | 'analytics' | 'marketing' | 'discounts'
  | 'finances' | 'online-store' | 'apps' | 'settings' | 'inbox' | 'disputes' | 'content'

/**
 * Admin paths (site-internal routes) — for deep links from other sites, mail and notifications:
 *   ''                          Home
 *   'orders' · 'orders/<id>'    Orders list · order detail (id = order number, e.g. 1042)
 *   'products' · 'products/<spId>'
 *   'customers' · 'customers/<email>'
 *   'content/files'
 *   'analytics' · 'analytics/reports' · 'analytics/reports/<reportId>' · 'analytics/live'
 *   'finances' · 'finances/payouts' · 'finances/payouts/<payoutId>' · 'finances/transactions'
 *   'finances/billing' · 'finances/capital'
 *   'disputes' · 'disputes/<chargebackId>'
 *   'inbox' · 'inbox/<ticketId>'
 *   'marketing' · 'marketing/attribution' · 'marketing/automations'
 *   'discounts' · 'online-store' · 'online-store/editor/…' · 'apps' · 'apps/<appId>' · 'settings/…'
 */
export const SHOPIFLY_PATHS = {
  home: '',
  orders: 'orders',
  order: (id: number) => `orders/${id}`,
  customers: 'customers',
  files: 'content/files',
  analytics: 'analytics',
  reports: 'analytics/reports',
  report: (id: string) => `analytics/reports/${id}`,
  live: 'analytics/live',
  finances: 'finances',
  payouts: 'finances/payouts',
  payout: (id: string) => `finances/payouts/${id}`,
  transactions: 'finances/transactions',
  billing: 'finances/billing',
  capital: 'finances/capital',
  disputes: 'disputes',
  dispute: (id: string) => `disputes/${id}`,
  inbox: 'inbox',
  ticket: (id: string) => `inbox/${id}`,
  marketing: 'marketing',
  attribution: 'marketing/attribution',
  automations: 'marketing/automations',
} as const
