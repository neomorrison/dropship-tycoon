// Admin top-bar search: orders, products, customers and admin pages.
import type { GameState } from '../../../../core/types'
import { appDef } from '../../../../data/apps'
import { customerId } from './orders'

export interface SearchHit {
  kind: 'order' | 'product' | 'customer' | 'page' | 'app'
  key: string
  title: string
  subtitle?: string
  path: string
  thumb?: string
}

/** Admin pages reachable from search (Shopify indexes its own settings pages the same way). */
export const ADMIN_PAGES: { title: string; path: string; keywords: string }[] = [
  { title: 'Home', path: '', keywords: 'dashboard setup guide' },
  { title: 'Orders', path: 'orders', keywords: 'sales fulfill unfulfilled' },
  { title: 'Products', path: 'products', keywords: 'catalog items inventory' },
  { title: 'Customers', path: 'customers', keywords: 'buyers clients' },
  { title: 'Files', path: 'content/files', keywords: 'content media images photos' },
  { title: 'Finance', path: 'finances', keywords: 'balance money' },
  { title: 'Payouts', path: 'finances/payouts', keywords: 'bank deposit payments' },
  { title: 'Transactions', path: 'finances/transactions', keywords: 'fees charges' },
  { title: 'Billing', path: 'finances/billing', keywords: 'bills invoices plan apps subscription' },
  { title: 'Shopifly Capital', path: 'finances/capital', keywords: 'loan funding financing' },
  { title: 'Chargebacks', path: 'disputes', keywords: 'disputes chargeback bank' },
  { title: 'Analytics', path: 'analytics', keywords: 'dashboard metrics stats' },
  { title: 'Reports', path: 'analytics/reports', keywords: 'profit sales sessions conversion' },
  { title: 'Live View', path: 'analytics/live', keywords: 'realtime visitors globe' },
  { title: 'Marketing', path: 'marketing', keywords: 'campaigns channels roas' },
  { title: 'Marketing attribution', path: 'marketing/attribution', keywords: 'utm source channel' },
  { title: 'Automations', path: 'marketing/automations', keywords: 'email flows klavio abandoned' },
  { title: 'Discounts', path: 'discounts', keywords: 'codes coupons sale' },
  { title: 'Online Store', path: 'online-store', keywords: 'themes storefront domain' },
  { title: 'Inbox', path: 'inbox', keywords: 'support tickets messages chat' },
  { title: 'Apps', path: 'apps', keywords: 'app store install' },
  { title: 'Settings', path: 'settings', keywords: 'general preferences' },
  { title: 'Plan', path: 'settings/plan', keywords: 'subscription pricing upgrade' },
  { title: 'Payments', path: 'settings/payments', keywords: 'paypel klarno checkout' },
  { title: 'Shipping and delivery', path: 'settings/shipping', keywords: 'rates free shipping' },
  { title: 'Policies', path: 'settings/policies', keywords: 'refund privacy terms' },
  { title: 'Domains', path: 'settings/domains', keywords: 'url custom domain' },
]

const norm = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/** Up to `limit` hits per group, best first. */
export function searchAdmin(s: GameState, query: string, limit = 5): SearchHit[] {
  const q = norm(query.trim())
  if (!q) return []
  const hits: SearchHit[] = []

  // orders: "#1042", "1042", or customer name/email
  const num = q.replace(/^#/, '')
  const orders: SearchHit[] = []
  for (let i = s.store.orders.length - 1; i >= 0 && orders.length < limit; i--) {
    const o = s.store.orders[i]
    const byNum = /^\d+$/.test(num) && String(o.id).startsWith(num)
    const byName = !/^\d+$/.test(num) && (norm(o.customer.name).includes(q) || norm(o.customer.email).includes(q))
    if (byNum || byName) orders.push({ kind: 'order', key: `o${o.id}`, title: `#${o.id}`, subtitle: `${o.customer.name} · $${o.total.toFixed(2)}`, path: `orders/${o.id}` })
  }
  hits.push(...orders)

  // products
  let pc = 0
  for (const p of s.store.products) {
    if (pc >= limit) break
    if (norm(p.title).includes(q) || p.tags.some(t => norm(t).includes(q)) || norm(p.productType).includes(q)) {
      hits.push({ kind: 'product', key: `p${p.id}`, title: p.title, subtitle: p.status === 'active' ? 'Active' : p.status === 'draft' ? 'Draft' : 'Archived', path: `products/${p.id}`, thumb: p.media[0]?.src })
      pc++
    }
  }

  // customers (unique by email)
  const seen = new Set<string>()
  let cc = 0
  for (let i = s.store.orders.length - 1; i >= 0 && cc < limit; i--) {
    const c = s.store.orders[i].customer
    const key = c.email.toLowerCase()
    if (seen.has(key)) continue
    if (norm(c.name).includes(q) || key.includes(q)) {
      seen.add(key)
      hits.push({ kind: 'customer', key: `c${key}`, title: c.name, subtitle: `${c.email} · ${c.city}, ${c.region}`, path: `customers/${customerId(key)}` })
      cc++
    }
  }

  // installed apps
  for (const ia of s.store.apps) {
    const d = appDef(ia.appId)
    if (d && norm(d.name).includes(q)) hits.push({ kind: 'app', key: `a${d.id}`, title: d.name, subtitle: d.developer, path: `apps/${d.id}` })
  }

  // admin pages
  let pg = 0
  for (const p of ADMIN_PAGES) {
    if (pg >= limit) break
    if (norm(p.title).includes(q) || p.keywords.includes(q)) {
      hits.push({ kind: 'page', key: `g${p.path}`, title: p.title, subtitle: 'Admin page', path: p.path })
      pg++
    }
  }
  return hits
}

export const HIT_GROUP_LABEL: Record<SearchHit['kind'], string> = {
  order: 'Orders', product: 'Products', customer: 'Customers', app: 'Apps', page: 'Pages',
}
