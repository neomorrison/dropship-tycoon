// Shopifly admin chrome: near-black top bar (logo, centered search, alerts, store menu),
// grey sidebar navigation with counts / sales channels / installed apps / Settings,
// and the #f1f1f1 page canvas. Below ~860px (or in the phone frame) the sidebar becomes
// a hamburger drawer, like the real admin on small screens.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Bell, ChartNoAxesColumn, ChevronRight, CircleAlert, Eye, FileText, House, Inbox, Landmark, LayoutGrid, Menu,
  MessageCircle, Package, Percent, Search, Settings, Store, Tag, Target, User, X,
} from 'lucide-react'
import type { ShopiflyNav } from './route'
import type { GameNotification } from '../../../core/types'
import { act, getGS, useGS, useGSShallow } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { appDef } from '../../../data/apps'
import { PLAN_LABEL } from '../../../sim/store'
import { Floating, cx, tileColor, useElementWidth } from '../../kit/common'
import { needsFulfillment } from './core/orders'
import { ShopiflyBag, ShopiflyLogo } from './core/Logo'
import { HIT_GROUP_LABEL, searchAdmin, type SearchHit } from './core/search'
import { timeAgo } from './core/format'
import './shopifly.css'

// ---------------------------------------------------------------------------
// Top-bar slot: lets a page put a contextual save bar over the top bar, like Shopify.
//   <TopBarPortal><ContextualSaveBar placement="overlay" … /></TopBarPortal>
// ---------------------------------------------------------------------------
const TopBarSlotCtx = createContext<HTMLElement | null>(null)

/** Render children over the admin top bar (for `ContextualSaveBar placement="overlay"`). */
export function TopBarPortal({ children }: { children: ReactNode }) {
  const el = useContext(TopBarSlotCtx)
  if (!el) return <>{children}</>
  return createPortal(children, el)
}

// ---------------------------------------------------------------------------
// Navigation model
// ---------------------------------------------------------------------------
interface NavLeaf { label: string; path: string; badge?: number; match?: (path: string) => boolean }
interface NavEntry extends NavLeaf { key: ShopiflyNav; icon: typeof House; sub?: NavLeaf[] }

const first = (path: string) => path.split('/').filter(Boolean)[0] ?? ''
const startsWith = (prefix: string) => (p: string) => p === prefix || p.startsWith(`${prefix}/`)

function navActive(path: string): ShopiflyNav {
  const a = first(path)
  const keys: ShopiflyNav[] = ['orders', 'products', 'customers', 'content', 'analytics', 'marketing', 'discounts', 'finances', 'online-store', 'apps', 'settings', 'inbox', 'disputes']
  return (keys as string[]).includes(a) ? (a as ShopiflyNav) : 'home'
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
export interface AdminFrameProps {
  /** sidebar item to highlight (derived from `path` when omitted) */
  nav?: ShopiflyNav
  /** current admin path (drives sub-navigation highlight and scroll reset) */
  path?: string
  navigate: (path: string) => void
  compact: boolean
  children: ReactNode
}

export default function AdminFrame({ nav, path = '', navigate, compact, children }: AdminFrameProps) {
  const [rootRef, width] = useElementWidth<HTMLDivElement>()
  const drawerMode = compact || (width > 0 && width < 860)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const active = nav ?? navActive(path)

  // a navigation lands at the top of the new page and closes the drawer
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
    setDrawerOpen(false)
  }, [path])
  useEffect(() => {
    if (!drawerMode) setDrawerOpen(false)
  }, [drawerMode])

  const go = useCallback((p: string) => {
    navigate(p)
    setDrawerOpen(false)
  }, [navigate])

  return (
    <TopBarSlotCtx.Provider value={slot}>
      <div ref={rootRef} className={cx('sf-frame', drawerMode && 'sf-frame-drawer', compact && 'sf-frame-compact')}>
        <header className="sf-topbar">
          <div className="sf-topbar-left">
            {drawerMode && (
              <button type="button" className="sf-topbar-icon" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
                <Menu size={20} strokeWidth={1.9} />
              </button>
            )}
            <button type="button" className="sf-topbar-home" onClick={() => go('')} aria-label="Shopifly home">
              {compact ? <ShopiflyBag size={26} /> : <ShopiflyLogo size={28} />}
            </button>
          </div>
          <AdminSearch navigate={go} compact={drawerMode} />
          <div className="sf-topbar-right">
            <AlertsButton navigate={go} />
            <StoreMenu navigate={go} compact={drawerMode} />
          </div>
          {/* contextual save bars portal here and cover the top bar */}
          <div ref={setSlot} className="sf-topbar-slot" />
        </header>
        <div className="sf-body">
          {drawerMode && drawerOpen && <div className="sf-scrim" onClick={() => setDrawerOpen(false)} aria-hidden />}
          <nav className={cx('sf-nav', drawerMode && 'sf-nav-drawer', drawerOpen && 'sf-nav-open')} aria-label="Main navigation">
            {drawerMode && (
              <div className="sf-nav-drawer-head">
                <ShopiflyLogo size={24} tone="dark" />
                <button type="button" className="sf-nav-close" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}>
                  <X size={18} />
                </button>
              </div>
            )}
            <SidebarNav active={active} path={path} navigate={go} />
          </nav>
          <main ref={mainRef} className="sf-main">
            {children}
          </main>
        </div>
      </div>
    </TopBarSlotCtx.Provider>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function SidebarNav({ active, path, navigate }: { active: ShopiflyNav; path: string; navigate: (p: string) => void }) {
  const { orders, tickets, chargebacks, apps } = useGSShallow(s => ({
    orders: s.store.orders, tickets: s.store.tickets, chargebacks: s.store.chargebacks, apps: s.store.apps,
  }))
  const now = useGS(s => s.time.hour)
  const hasDserz = apps.some(a => a.appId === 'dserz')
  // with DSerz, new orders are placed on its next hourly run: count only the ones that need you
  const toFulfill = useMemo(() => orders.reduce((n, o) => n + (needsFulfillment(o) && (!hasDserz || now - o.hour >= 2) ? 1 : 0), 0), [orders, hasDserz, now])
  const openTickets = useMemo(() => tickets.reduce((n, t) => n + (t.status !== 'solved' ? 1 : 0), 0), [tickets])
  const disputesDue = useMemo(() => chargebacks.reduce((n, c) => n + (c.status === 'needs_response' ? 1 : 0), 0), [chargebacks])
  const hasFadbook = apps.some(a => a.appId === 'fadbook-channel')
  const hasTiktak = apps.some(a => a.appId === 'tiktak-channel')
  const appList = useMemo(
    () => apps.filter(a => a.appId !== 'fadbook-channel' && a.appId !== 'tiktak-channel').map(a => appDef(a.appId)).filter(Boolean),
    [apps],
  )

  const main: NavEntry[] = [
    { key: 'home', label: 'Home', icon: House, path: '' },
    { key: 'orders', label: 'Orders', icon: Inbox, path: 'orders', badge: toFulfill },
    { key: 'products', label: 'Products', icon: Tag, path: 'products' },
    { key: 'customers', label: 'Customers', icon: User, path: 'customers' },
    { key: 'content', label: 'Content', icon: FileText, path: 'content/files', sub: [{ label: 'Files', path: 'content/files', match: startsWith('content') }] },
    {
      key: 'finances', label: 'Finance', icon: Landmark, path: 'finances',
      sub: [
        { label: 'Payouts', path: 'finances/payouts', match: startsWith('finances/payouts') },
        { label: 'Transactions', path: 'finances/transactions', match: startsWith('finances/transactions') },
        { label: 'Chargebacks', path: 'disputes', badge: disputesDue, match: startsWith('disputes') },
        { label: 'Billing', path: 'finances/billing', match: startsWith('finances/billing') },
        { label: 'Capital', path: 'finances/capital', match: startsWith('finances/capital') },
      ],
    },
    {
      key: 'analytics', label: 'Analytics', icon: ChartNoAxesColumn, path: 'analytics',
      sub: [
        { label: 'Reports', path: 'analytics/reports', match: startsWith('analytics/reports') },
        { label: 'Live View', path: 'analytics/live', match: startsWith('analytics/live') },
      ],
    },
    {
      key: 'marketing', label: 'Marketing', icon: Target, path: 'marketing',
      sub: [
        { label: 'Attribution', path: 'marketing/attribution', match: startsWith('marketing/attribution') },
        { label: 'Automations', path: 'marketing/automations', match: startsWith('marketing/automations') },
      ],
    },
    { key: 'discounts', label: 'Discounts', icon: Percent, path: 'discounts' },
  ]
  // Chargebacks live under Finance
  const sectionOf = (k: ShopiflyNav): ShopiflyNav => (k === 'disputes' ? 'finances' : k)
  const cur = sectionOf(active)

  return (
    <div className="sf-nav-inner">
      <ul className="sf-nav-list">
        {main.map(item => {
          const isSection = cur === item.key
          const subActive = item.sub?.find(x => x.match?.(path))
          const itemActive = isSection && !subActive
          return (
            <li key={item.key}>
              <NavButton icon={item.icon} label={item.label} badge={item.badge} active={itemActive} section={isSection} onClick={() => navigate(item.path)} />
              {item.sub && isSection && (
                <ul className="sf-nav-sub">
                  {item.sub.map(sub => (
                    <li key={sub.path}>
                      <button type="button" className={cx('sf-nav-subitem', sub === subActive && 'is-active')} onClick={() => navigate(sub.path)}>
                        <span>{sub.label}</span>
                        {!!sub.badge && <span className="sf-nav-count sf-nav-count-alert">{sub.badge}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <div className="sf-nav-group">
        <button type="button" className="sf-nav-heading" onClick={() => navigate('online-store')}>
          <span>Sales channels</span>
          <ChevronRight size={14} strokeWidth={2} />
        </button>
        <ul className="sf-nav-list">
          <li className="sf-nav-with-trailing">
            <NavButton icon={Store} label="Online Store" active={cur === 'online-store'} section={cur === 'online-store'} onClick={() => navigate('online-store')} />
            <button type="button" className="sf-nav-trailing" aria-label="View your online store" title="View your online store" onClick={() => openSite('storefront', '')}>
              <Eye size={16} strokeWidth={1.9} />
            </button>
          </li>
          <li>
            <NavButton icon={MessageCircle} label="Inbox" badge={openTickets} active={cur === 'inbox'} section={cur === 'inbox'} onClick={() => navigate('inbox')} />
          </li>
          {hasFadbook && (
            <li>
              <NavButton glyph={{ text: 'f', bg: '#0866ff' }} label="Fadbook & Instaglam" onClick={() => openSite('fadbook', '')} external />
            </li>
          )}
          {hasTiktak && (
            <li>
              <NavButton glyph={{ text: '♪', bg: '#111' }} label="TikTak" onClick={() => openSite('tiktak', '')} external />
            </li>
          )}
        </ul>
      </div>

      <div className="sf-nav-group">
        <button type="button" className="sf-nav-heading" onClick={() => navigate('apps')}>
          <span>Apps</span>
          <ChevronRight size={14} strokeWidth={2} />
        </button>
        <ul className="sf-nav-list">
          {appList.length === 0 && (
            <li>
              <NavButton icon={LayoutGrid} label="Add apps" active={cur === 'apps' && path === 'apps'} onClick={() => navigate('apps')} muted />
            </li>
          )}
          {appList.map(d => d && (
            <li key={d.id}>
              <NavButton
                glyph={{ text: d.icon.glyph, bg: d.icon.bg, fg: d.icon.fg }}
                label={d.name.split(/\s[–—-]\s|:\s/)[0]}
                active={path === `apps/${d.id}` || path.startsWith(`apps/${d.id}/`)}
                onClick={() => navigate(`apps/${d.id}`)}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="sf-nav-spacer" />
      <ul className="sf-nav-list sf-nav-bottom">
        <li>
          <NavButton icon={Settings} label="Settings" active={cur === 'settings'} section={cur === 'settings'} onClick={() => navigate('settings')} />
        </li>
      </ul>
    </div>
  )
}

function NavButton({ icon: I, glyph, label, badge, active, section, onClick, external, muted }: {
  icon?: typeof House
  glyph?: { text: string; bg: string; fg?: string }
  label: string
  badge?: number
  active?: boolean
  /** the item's section is open (bold label even while a sub-item is selected) */
  section?: boolean
  onClick: () => void
  external?: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      className={cx('sf-nav-item', active && 'is-active', section && 'is-section', muted && 'is-muted')}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="sf-nav-icon">
        {I ? <I size={18} strokeWidth={section ? 2.1 : 1.8} /> : glyph ? (
          <span className="sf-nav-glyph" aria-hidden style={{ background: glyph.bg, color: glyph.fg ?? '#fff' }}>{glyph.text}</span>
        ) : <Package size={18} />}
      </span>
      <span className="sf-nav-label">{label}</span>
      {!!badge && <span className="sf-nav-count">{badge > 99 ? '99+' : badge}</span>}
      {external && <ChevronRight size={14} className="sf-nav-ext" aria-hidden />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function AdminSearch({ navigate, compact }: { navigate: (p: string) => void; compact: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [sel, setSel] = useState(0)
  const hits = useMemo(() => (open && q.trim() ? searchAdmin(getGS(), q) : []), [q, open])
  useEffect(() => setSel(0), [q])

  // ⌘K / Ctrl+K focuses the search (only while this admin is on screen)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const box = boxRef.current
        if (!box || box.offsetParent === null) return
        e.preventDefault()
        setExpanded(true)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pick = (h: SearchHit) => {
    navigate(h.path)
    setOpen(false)
    setQ('')
    setExpanded(false)
    inputRef.current?.blur()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel(i => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && hits[sel]) {
      e.preventDefault()
      pick(hits[sel])
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
      setExpanded(false)
      inputRef.current?.blur()
    }
  }

  const groups = useMemo(() => {
    const g: { kind: SearchHit['kind']; items: { h: SearchHit; i: number }[] }[] = []
    hits.forEach((h, i) => {
      let grp = g.find(x => x.kind === h.kind)
      if (!grp) g.push((grp = { kind: h.kind, items: [] }))
      grp.items.push({ h, i })
    })
    return g
  }, [hits])

  if (compact && !expanded) {
    return (
      <div className="sf-search-slot sf-search-slot-compact" ref={boxRef}>
        <button type="button" className="sf-topbar-icon" aria-label="Search" onClick={() => { setExpanded(true); requestAnimationFrame(() => inputRef.current?.focus()) }}>
          <Search size={18} strokeWidth={1.9} />
        </button>
      </div>
    )
  }
  return (
    <div className={cx('sf-search-slot', compact && 'sf-search-slot-expanded')}>
      <div ref={boxRef} className={cx('sf-search', open && 'sf-search-focused')}>
        <Search size={16} strokeWidth={2} className="sf-search-icon" aria-hidden />
        <input
          ref={inputRef}
          className="sf-search-input"
          placeholder="Search"
          value={q}
          onChange={e => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            if (compact && !q) setExpanded(false)
          }}
          onKeyDown={onKeyDown}
          aria-label="Search"
          spellCheck={false}
        />
        {!compact && !q && <span className="sf-search-kbd"><kbd>⌘</kbd><kbd>K</kbd></span>}
        {q && (
          <button type="button" className="sf-search-clear" aria-label="Clear search" onClick={() => { setQ(''); inputRef.current?.focus() }}>
            <X size={14} />
          </button>
        )}
      </div>
      <Floating anchor={boxRef} open={open && q.trim().length > 0} onClose={() => setOpen(false)} placement="bottom-start" matchWidth offset={6} className="p-layer">
        <div className="sf-search-pop" role="listbox" style={{ width: Math.max(300, boxRef.current?.getBoundingClientRect().width ?? 480) }}>
          {hits.length === 0 ? (
            <div className="sf-search-none">
              <Search size={20} strokeWidth={1.8} />
              <div>No results for “{q.trim()}”</div>
              <div className="sf-search-none-sub">Try an order number (#1024), a customer name, or a product.</div>
            </div>
          ) : groups.map(g => (
            <div key={g.kind} className="sf-search-group">
              <div className="sf-search-group-title">{HIT_GROUP_LABEL[g.kind]}</div>
              {g.items.map(({ h, i }) => (
                <button
                  key={h.key}
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  className={cx('sf-search-hit', i === sel && 'is-selected')}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => pick(h)}
                >
                  <span className="sf-search-hit-icon">
                    {h.thumb ? <img src={h.thumb} alt="" onError={e => ((e.target as HTMLImageElement).style.visibility = 'hidden')} /> : HIT_ICON[h.kind]}
                  </span>
                  <span className="sf-search-hit-text">
                    <span className="sf-search-hit-title">{h.title}</span>
                    {h.subtitle && <span className="sf-search-hit-sub">{h.subtitle}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Floating>
    </div>
  )
}

const HIT_ICON: Record<SearchHit['kind'], ReactNode> = {
  order: <Inbox size={16} />,
  product: <Tag size={16} />,
  customer: <User size={16} />,
  app: <LayoutGrid size={16} />,
  page: <FileText size={16} />,
}

// ---------------------------------------------------------------------------
// Alerts (store notifications)
// ---------------------------------------------------------------------------
function AlertsButton({ navigate }: { navigate: (p: string) => void }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const notifications = useGS(s => s.notifications)
  const now = useGS(s => s.time.hour)
  const list = useMemo(() => {
    const out: GameNotification[] = []
    for (let i = notifications.length - 1; i >= 0 && out.length < 12; i--) {
      const n = notifications[i]
      if (n.site === 'shopifly' && n.kind !== 'sale' && n.kind !== 'coach') out.push(n)
    }
    return out
  }, [notifications])
  const unread = list.filter(n => !n.read).length
  const openItem = (n: GameNotification) => {
    act(s => {
      const x = s.notifications.find(y => y.id === n.id)
      if (x) x.read = true
    })
    setOpen(false)
    if (n.site === 'shopifly' || !n.site) navigate(n.path ?? '')
    else openSite(n.site, n.path ?? '')
  }
  const markAll = () =>
    act(s => {
      for (const n of s.notifications) if (n.site === 'shopifly') n.read = true
    })
  return (
    <>
      <button ref={anchor} type="button" className={cx('sf-topbar-icon', open && 'is-pressed')} aria-label="Alerts" onClick={() => setOpen(o => !o)}>
        <Bell size={18} strokeWidth={1.9} />
        {unread > 0 && <span className="sf-bell-dot" aria-hidden />}
      </button>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} placement="bottom-end" offset={8} className="p-layer">
        <div className="sf-alerts">
          <div className="sf-alerts-head">
            <span>Alerts</span>
            {unread > 0 && <button type="button" className="sf-link-btn" onClick={markAll}>Mark all as read</button>}
          </div>
          {list.length === 0 ? (
            <div className="sf-alerts-empty">
              <Bell size={22} strokeWidth={1.6} />
              <div>You're all caught up</div>
              <span>Store alerts about orders, payouts and disputes show up here.</span>
            </div>
          ) : (
            <div className="sf-alerts-list">
              {list.map(n => (
                <button key={n.id} type="button" className={cx('sf-alert', !n.read && 'is-unread')} onClick={() => openItem(n)}>
                  <span className={cx('sf-alert-icon', `sf-alert-${n.kind}`)}><CircleAlert size={14} strokeWidth={2.2} /></span>
                  <span className="sf-alert-text">
                    <span className="sf-alert-title">{n.title}</span>
                    {n.body && <span className="sf-alert-body">{n.body}</span>}
                    <span className="sf-alert-time">{timeAgo(n.hour, now)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Floating>
    </>
  )
}

// ---------------------------------------------------------------------------
// Store menu
// ---------------------------------------------------------------------------
function StoreMenu({ navigate, compact }: { navigate: (p: string) => void; compact: boolean }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const { name, domain, custom, plan, player } = useGSShallow(s => ({
    name: s.store.name, domain: s.store.subdomain, custom: s.store.customDomain, plan: s.store.plan, player: s.player.name,
  }))
  const color = tileColor(name || 'Store')
  const ini = (name || 'S').split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'S'
  const item = (label: string, onClick: () => void, sub?: string) => (
    <button type="button" className="sf-menu-item" onClick={() => { setOpen(false); onClick() }}>
      <span>{label}</span>
      {sub && <span className="sf-menu-sub">{sub}</span>}
    </button>
  )
  return (
    <>
      <button ref={anchor} type="button" className={cx('sf-store-btn', open && 'is-pressed')} onClick={() => setOpen(o => !o)} aria-label="Store menu">
        {!compact && <span className="sf-store-name">{name}</span>}
        <span className="sf-store-avatar" style={{ background: color.bg, color: color.fg }}>{ini}</span>
      </button>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} placement="bottom-end" offset={8} className="p-layer">
        <div className="sf-menu">
          <div className="sf-menu-store">
            <span className="sf-store-avatar sf-store-avatar-lg" style={{ background: color.bg, color: color.fg }}>{ini}</span>
            <span className="sf-menu-store-text">
              <span className="sf-menu-store-name">{name}</span>
              <span className="sf-menu-store-domain">{custom ?? domain}</span>
            </span>
          </div>
          <div className="sf-menu-sep" />
          {item('View your store', () => openSite('storefront', ''))}
          {item('Online Store', () => navigate('online-store'))}
          {item('Plan', () => navigate('settings/plan'), PLAN_LABEL[plan])}
          {item('Billing', () => navigate('finances/billing'))}
          {item('Settings', () => navigate('settings'))}
          <div className="sf-menu-sep" />
          <div className="sf-menu-foot">
            <span className="sf-menu-foot-name">{player}</span>
            <span className="sf-menu-foot-role">Store owner</span>
          </div>
        </div>
      </Floating>
    </>
  )
}
