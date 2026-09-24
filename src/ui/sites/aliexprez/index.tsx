// AliExprez — AliExpress-style supplier marketplace. OWNER: ui-sourcing.
// Routes: '' home · 'search?q=&cat=&sort=' · 'category/<niche>' · 'new' · 'wishlist'
//         'item/<catalogId>[/reviews|/research|/description]' · 'orders[/store]' · 'business[/bulk|/inventory|/private-label]'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Boxes, ChevronDown, Factory, Heart, Lock, Package, Search, Truck } from 'lucide-react'
import type { SiteProps } from '../types'
import { useGS } from '../../../core/store'
import { cx, initials } from '../../kit/common'
import { NICHES, parseRoute, withQuery } from './lib'
import HomePage from './HomePage'
import SearchPage from './SearchPage'
import ItemPage from './ItemPage'
import OrdersPage from './OrdersPage'
import BusinessPage from './BusinessPage'
import './aliexprez.css'

export interface AxPageProps { navigate: (path: string) => void; compact: boolean }

function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ax-logo" onClick={onClick} aria-label="AliExprez home">
      <span className="ax-logo-word">Ali<b>Exprez</b></span>
    </button>
  )
}

function Header({ path, navigate }: { path: string; navigate: (p: string) => void }) {
  const route = useMemo(() => parseRoute(path), [path])
  const routeQ = route.page === 'search' ? route.q.get('q') ?? '' : ''
  const [q, setQ] = useState(routeQ)
  useEffect(() => setQ(routeQ), [routeQ])
  const favCount = useGS(s => s.catalog.favorites.length)
  const samples = useGS(s => s.catalog.samples)
  const inTransit = useMemo(() => samples.filter(x => !x.received).length, [samples])
  const agent = useGS(s => s.catalog.unlocks.agent)
  const name = useGS(s => s.player.name || s.meta.playerName)
  const storeCreated = useGS(s => s.store.created)
  const apps = useGS(s => s.store.apps)
  const dserz = useMemo(() => apps.some(a => a.appId === 'dserz'), [apps])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(withQuery('search', { q: q.trim() }))
  }
  const first = (name || 'there').split(' ')[0]
  return (
    <header className="ax-header">
      <div className="ax-topbar">
        <div className="ax-wrap ax-topbar-in">
          <span>Welcome to AliExprez, {first}!</span>
          <span className="ax-topbar-right">
            <span className={cx('ax-dserz', dserz && 'ax-dserz-on')} title={dserz ? 'Supplier orders are placed automatically for your Shopifly store' : 'Install DSerz in the Shopifly App Store to auto-fulfill orders'}>
              <i /> DSerz {storeCreated ? (dserz ? 'connected' : 'not installed') : '· no store yet'}
            </span>
            <span className="ax-topbar-sep" />
            <span>Ship to <b>US</b> / English / USD</span>
          </span>
        </div>
      </div>
      <div className="ax-wrap ax-mainbar">
        <Logo onClick={() => navigate('')} />
        <form className="ax-search" onSubmit={submit} role="search">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="pet hair remover, posture corrector, led mask…" aria-label="Search AliExprez" />
          <button type="submit" aria-label="Search"><Search size={20} strokeWidth={2.4} /></button>
        </form>
        <nav className="ax-actions" aria-label="Account">
          <button type="button" className="ax-action" onClick={() => navigate('wishlist')}>
            <span className="ax-action-icon"><Heart size={22} />{favCount > 0 && <em>{favCount}</em>}</span>
            <span className="ax-action-label">Wishlist</span>
          </button>
          <button type="button" className="ax-action" onClick={() => navigate('orders')}>
            <span className="ax-action-icon"><Package size={22} />{inTransit > 0 && <em>{inTransit}</em>}</span>
            <span className="ax-action-label">Orders</span>
          </button>
          <button type="button" className="ax-action" onClick={() => navigate('business')}>
            <span className="ax-action-icon"><Factory size={22} />{!agent && <Lock size={11} className="ax-action-lock" />}</span>
            <span className="ax-action-label">Business</span>
          </button>
          <span className="ax-avatar" title={name}>{initials(name || 'You')}</span>
        </nav>
      </div>
      <div className="ax-catbar">
        <div className="ax-wrap ax-catbar-in">
          <button type="button" className="ax-allcats" onClick={() => navigate('search')}><Boxes size={16} /> All categories <ChevronDown size={14} /></button>
          <div className="ax-catlinks">
            <button type="button" className="ax-catlink ax-catlink-hot" onClick={() => navigate(withQuery('search', { sort: 'orders' }))}>SuperDeals</button>
            <button type="button" className="ax-catlink" onClick={() => navigate('new')}>New arrivals</button>
            <button type="button" className="ax-catlink" onClick={() => navigate(withQuery('search', { choice: true }))}>Choice</button>
            {NICHES.slice(0, 8).map(n => (
              <button key={n.id} type="button" className="ax-catlink" onClick={() => navigate(`category/${n.id}`)}>{n.short}</button>
            ))}
            <button type="button" className="ax-catlink" onClick={() => navigate('business')}><Truck size={14} /> Dropshipping center</button>
          </div>
        </div>
      </div>
    </header>
  )
}

function Footer({ navigate }: { navigate: (p: string) => void }) {
  return (
    <footer className="ax-footer">
      <div className="ax-wrap">
        <div className="ax-footer-cols">
          <div>
            <h4>Help</h4>
            <button type="button" onClick={() => navigate('orders')}>Track your order</button>
            <button type="button" onClick={() => navigate('orders')}>Buyer protection</button>
            <button type="button" onClick={() => navigate('wishlist')}>Wishlist</button>
          </div>
          <div>
            <h4>Dropshipping</h4>
            <button type="button" onClick={() => navigate('business')}>DSerz &amp; sourcing agents</button>
            <button type="button" onClick={() => navigate('business/bulk')}>Bulk orders to a US 3PL</button>
            <button type="button" onClick={() => navigate('business/private-label')}>Private label</button>
          </div>
          <div>
            <h4>Browse</h4>
            <button type="button" onClick={() => navigate('new')}>New arrivals</button>
            <button type="button" onClick={() => navigate(withQuery('search', { sort: 'orders' }))}>Bestsellers</button>
            <button type="button" onClick={() => navigate(withQuery('search', { choice: true }))}>Choice items</button>
          </div>
        </div>
        <p className="ax-footer-legal">© 2010–2026 AliExprez.com. All rights reserved. Import duties on US orders are estimated at checkout (US de minimis exemption suspended).</p>
      </div>
    </footer>
  )
}

export default function AliExprez({ path, navigate, compact }: SiteProps) {
  const route = useMemo(() => parseRoute(path), [path])
  let page
  switch (route.page) {
    case 'item': page = <ItemPage key={route.id} id={route.id!} tab={route.sub} navigate={navigate} compact={compact} />; break
    case 'search': page = <SearchPage mode="search" q={route.q} navigate={navigate} compact={compact} />; break
    case 'new': page = <SearchPage mode="new" q={route.q} navigate={navigate} compact={compact} />; break
    case 'wishlist': page = <SearchPage mode="wishlist" q={route.q} navigate={navigate} compact={compact} />; break
    case 'orders': page = <OrdersPage tab={route.sub} navigate={navigate} compact={compact} />; break
    case 'business': page = <BusinessPage tab={route.sub} q={route.q} navigate={navigate} compact={compact} />; break
    default: page = <HomePage navigate={navigate} compact={compact} />
  }
  return (
    <div className={cx('ax-root', compact && 'ax-compact')}>
      <Header path={path} navigate={navigate} />
      <main className="ax-main">{page}</main>
      <Footer navigate={navigate} />
    </div>
  )
}
