// Mineo — ad-spy SaaS (dark purple). OWNER: ui-sourcing.
// Routes: '' | 'ads[?q=]' trending ads · 'products[?q=]' · 'product/<catalogId>' · 'watchlist' · 'billing'
import { memo, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Bookmark, CreditCard, Crown, Flame, Lock, Package, Search } from 'lucide-react'
import type { SiteProps } from '../types'
import { useGS } from '../../../core/store'
import { formatDate } from '../../../core/time'
import { cx, initials } from '../../kit/common'
import { useSpyActive } from './data'
import AdsFeed from './AdsFeed'
import Products from './Products'
import ProductPage from './ProductPage'
import Billing from './Billing'
import Paywall from './Paywall'
import './mineo.css'

type Section = 'ads' | 'products' | 'watchlist' | 'billing'
function parse(path: string): { section: Section; id?: string; q: string } {
  const [raw, qs = ''] = (path || '').split('?')
  const q = new URLSearchParams(qs).get('q') ?? ''
  const [a, b] = raw.split('/').filter(Boolean)
  if (a === 'product' && b) return { section: 'products', id: b, q }
  if (a === 'products') return { section: 'products', q }
  if (a === 'watchlist') return { section: 'watchlist', q }
  if (a === 'billing' || a === 'account') return { section: 'billing', q }
  return { section: 'ads', q }
}

const NAV: { id: Section; label: string; icon: typeof Flame; path: string }[] = [
  { id: 'ads', label: 'Trending ads', icon: Flame, path: 'ads' },
  { id: 'products', label: 'Products', icon: Package, path: 'products' },
  { id: 'watchlist', label: 'Watchlist', icon: Bookmark, path: 'watchlist' },
  { id: 'billing', label: 'Plan & billing', icon: CreditCard, path: 'billing' },
]

function Logo() {
  return (
    <span className="mi-logo">
      <span className="mi-logo-mark">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M4 18V7l5 6 3-4 3 4 5-6v11" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="mi-logo-word">mineo</span>
    </span>
  )
}

function Mineo({ path, navigate, compact }: SiteProps) {
  const route = useMemo(() => parse(path), [path])
  const active = useSpyActive()
  const until = useGS(s => s.catalog.spyToolUntilDay)
  const autoRenew = useGS(s => !!s.catalog.spyToolAutoRenew)
  const name = useGS(s => s.player.name || s.meta.playerName)
  const watchCount = useGS(s => s.catalog.favorites.length)
  const [q, setQ] = useState('')
  const body = useRef<HTMLDivElement>(null)
  // Mineo scrolls its own body (sidebar stays fixed): land at the top of each new page
  useLayoutEffect(() => { if (body.current) body.current.scrollTop = 0 }, [path])

  const search = (e: FormEvent) => {
    e.preventDefault()
    const t = q.trim()
    navigate(t ? `products?q=${encodeURIComponent(t)}` : 'products')
    setQ('')
  }

  let page
  if (route.section === 'billing') page = <Billing />
  else if (!active) page = <Paywall productId={route.id} />
  else if (route.id) page = <ProductPage key={route.id} id={route.id} navigate={navigate} />
  else if (route.section === 'products') page = <Products key={`p:${route.q}`} navigate={navigate} initialQuery={route.q} />
  else if (route.section === 'watchlist') page = <Products key="watch" navigate={navigate} initialQuery="" watchlist />
  else page = <AdsFeed key={`a:${route.q}`} navigate={navigate} initialQuery={route.q} />

  return (
    <div className={cx('mi-root', compact && 'mi-compact')}>
      <div className="mi-frame">
        <aside className="mi-side">
          <button type="button" className="mi-side-logo" onClick={() => navigate('')} aria-label="Mineo home"><Logo /></button>
          <nav className="mi-nav" aria-label="Mineo">
            {NAV.map(n => (
              <button key={n.id} type="button" className={cx('mi-nav-item', route.section === n.id && 'on')} onClick={() => navigate(n.path)}>
                <n.icon size={17} />
                <span>{n.label}</span>
                {!active && n.id !== 'billing' && <Lock size={12} className="mi-nav-lock" />}
                {active && n.id === 'watchlist' && watchCount > 0 && <em>{watchCount}</em>}
              </button>
            ))}
          </nav>
          <div className="mi-side-plan">
            {active ? (
              <>
                <span className="mi-pro"><Crown size={12} /> PRO</span>
                <span>{autoRenew ? 'Renews' : 'Access until'} {until !== null ? formatDate(until, 'md') : ''}</span>
              </>
            ) : (
              <>
                <span className="mi-free">FREE</span>
                <button type="button" className="mi-btn mi-btn-primary mi-btn-sm" onClick={() => navigate('ads')}>Upgrade</button>
              </>
            )}
          </div>
        </aside>
        <div className="mi-body" ref={body}>
          <header className="mi-top">
            <form className="mi-top-search" onSubmit={search} role="search">
              <Search size={15} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search any product…" aria-label="Search products" disabled={!active} />
            </form>
            <span className="mi-updated"><i /> Library updated daily</span>
            <span className="mi-user">{initials(name || 'You')}</span>
          </header>
          <main className="mi-main">{page}</main>
        </div>
      </div>
    </div>
  )
}

// memo: the browser shell re-renders open tabs on every game tick (see AliExprez)
export default memo(Mineo)
