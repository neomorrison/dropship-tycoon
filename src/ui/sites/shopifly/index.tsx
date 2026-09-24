// Shopifly Admin — router. OWNER: ui-shopifly-core agent (frame + core pages).
// Pages under pages/ are split between two agents; see SPEC.md §UI ownership.
import { lazy, Suspense, type ComponentType } from 'react'
import type { SiteProps } from '../types'
import type { ShopiflyNav, ShopiflyPageProps } from './route'
import AdminFrame from './AdminFrame'
import { useGS } from '../../../core/store'

const P = (f: () => Promise<{ default: ComponentType<ShopiflyPageProps> }>) => lazy(f)
const Onboarding = P(() => import('./pages/Onboarding'))
const Home = P(() => import('./pages/Home'))
const Orders = P(() => import('./pages/Orders'))
const OrderDetail = P(() => import('./pages/OrderDetail'))
const Customers = P(() => import('./pages/Customers'))
const Analytics = P(() => import('./pages/Analytics'))
const Reports = P(() => import('./pages/Reports'))
const LiveView = P(() => import('./pages/LiveView'))
const Finances = P(() => import('./pages/Finances'))
const Disputes = P(() => import('./pages/Disputes'))
const Inbox = P(() => import('./pages/Inbox'))
const Marketing = P(() => import('./pages/Marketing'))
const Products = P(() => import('./pages/Products'))
const ProductEditor = P(() => import('./pages/ProductEditor'))
const OnlineStore = P(() => import('./pages/OnlineStore'))
const ThemeEditor = P(() => import('./pages/ThemeEditor'))
const Apps = P(() => import('./pages/Apps'))
const AppDetail = P(() => import('./pages/AppDetail'))
const Discounts = P(() => import('./pages/Discounts'))
const Settings = P(() => import('./pages/Settings'))

function resolve(path: string): { C: ComponentType<ShopiflyPageProps>; params: string[] } {
  const seg = path.split('/').filter(Boolean)
  const [a, b, ...rest] = seg
  switch (a) {
    case undefined: return { C: Home, params: [] }
    case 'orders': return b ? { C: OrderDetail, params: [b, ...rest] } : { C: Orders, params: [] }
    case 'products': return b ? { C: ProductEditor, params: [b, ...rest] } : { C: Products, params: [] }
    case 'customers': return { C: Customers, params: seg.slice(1) }
    case 'analytics':
      if (b === 'reports') return { C: Reports, params: rest }
      if (b === 'live') return { C: LiveView, params: rest }
      return { C: Analytics, params: seg.slice(1) }
    case 'finances': return { C: Finances, params: seg.slice(1) }
    case 'disputes': return { C: Disputes, params: seg.slice(1) }
    case 'inbox': return { C: Inbox, params: seg.slice(1) }
    case 'marketing': return { C: Marketing, params: seg.slice(1) }
    case 'discounts': return { C: Discounts, params: seg.slice(1) }
    case 'online-store': return b === 'editor' ? { C: ThemeEditor, params: rest } : { C: OnlineStore, params: seg.slice(1) }
    case 'apps': return b ? { C: AppDetail, params: [b, ...rest] } : { C: Apps, params: [] }
    case 'settings': return { C: Settings, params: seg.slice(1) }
    default: return { C: Home, params: [] }
  }
}

/** sidebar item to highlight for a path */
export function navFor(path: string): ShopiflyNav {
  const a = path.split('/').filter(Boolean)[0] ?? 'home'
  return (['orders', 'products', 'customers', 'analytics', 'marketing', 'discounts', 'finances', 'online-store', 'apps', 'settings', 'inbox', 'disputes'].includes(a) ? a : 'home') as ShopiflyNav
}

export default function ShopiflyAdmin(props: SiteProps) {
  const created = useGS(s => s.store.created)
  if (!created) {
    return (
      <Suspense fallback={null}>
        <Onboarding {...props} params={[]} />
      </Suspense>
    )
  }
  const { C, params } = resolve(props.path)
  return (
    <AdminFrame nav={navFor(props.path)} navigate={props.navigate} compact={props.compact}>
      <Suspense fallback={null}>
        <C {...props} params={params} />
      </Suspense>
    </AdminFrame>
  )
}
