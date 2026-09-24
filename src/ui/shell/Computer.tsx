// Computer overlay: a Chrome-like browser window at home, a phone when away (or on narrow
// screens). Every tab renders its site inside Suspense + its own error boundary, and hidden
// tabs are parked in <Activity mode="hidden"> so they keep their state without re-rendering.
import { Activity, Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ErrorInfo, type FormEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, BatteryMedium, Bookmark, ChevronLeft, ChevronRight, House, Lock, Plus, RotateCw, Search, Signal, Star, Wifi, X, Layers, Maximize2, Minimize2 } from 'lucide-react'
import type { SiteId } from '../../core/types'
import { useGS } from '../../core/store'
import { useUI, closeTab, navigateTab, openSite, tabBack, tabForward, type BrowserTab } from '../../core/ui'
import { formatClock, formatDate, dayOf, hourOfDay } from '../../core/time'
import { SITES, SITE_COMPONENTS, siteDef } from '../sites/registry'
import { sfx } from '../audio'
import { SiteChip, useViewportWidth, PHONE_BREAKPOINT } from './common'
import { setComputerOpen } from './actions'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const shortName = (id: SiteId) => siteDef(id).name.replace(' Ads Manager', ' Ads').replace(' Admin', '')

function useStoreDomain(): string {
  const custom = useGS(s => s.store.customDomain)
  const sub = useGS(s => s.store.subdomain)
  return custom || sub || 'your-store.myshopifly.com'
}
function domainOf(site: SiteId, storeDomain: string) {
  return site === 'storefront' ? storeDomain : siteDef(site).domain
}
function urlOf(tab: BrowserTab, storeDomain: string) {
  const p = tab.path.replace(/^\/+/, '')
  return `https://${domainOf(tab.site, storeDomain)}/${p}`
}

/** Resolve typed text to a site + path (exact domain, base domain, then name match). */
function parseAddress(input: string, storeDomain: string, storeCreated: boolean): { site: SiteId; path: string } | null {
  const v = input.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  if (!v) return null
  const slash = v.indexOf('/')
  const host = (slash < 0 ? v : v.slice(0, slash)).toLowerCase()
  const path = slash < 0 ? '' : v.slice(slash + 1)
  const candidates = SITES.filter(s => s.id !== 'storefront' || storeCreated)
  const base = (d: string) => d.toLowerCase().split('.').slice(-2).join('.')
  for (const s of candidates) {
    const d = domainOf(s.id, storeDomain).toLowerCase()
    if (host === d || host === base(d)) return { site: s.id, path }
  }
  const q = v.toLowerCase()
  const byName = candidates.find(s => s.name.toLowerCase().includes(q) || s.domain.toLowerCase().includes(q) || s.id.includes(q))
  return byName ? { site: byName.id, path: '' } : null
}

function greeting(h: number) {
  if (h < 5) return 'Up late'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ---------------------------------------------------------------------------
// Error boundary (one per tab)
// ---------------------------------------------------------------------------
interface EBProps { site: SiteId; resetKey: string; onReload: () => void; onClose: () => void; children: ReactNode }
interface EBState { error: Error | null; key: string }
class SiteErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null, key: this.props.resetKey }
  static getDerivedStateFromError(error: unknown): Partial<EBState> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
  static getDerivedStateFromProps(props: EBProps, state: EBState): Partial<EBState> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[browser] ${this.props.site} crashed`, error, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    const d = siteDef(this.props.site)
    return (
      <div className="sh-crash">
        <div className="sh-crash-face" aria-hidden>
          <SiteChip site={this.props.site} size={40} />
          <span>:(</span>
        </div>
        <h2>Aw, snap!</h2>
        <p>Something went wrong while displaying {d.name}. Your game is fine; only this tab stopped.</p>
        <div className="sh-crash-btns">
          <button type="button" className="sh-btn sh-btn-primary sh-btn-sm" onClick={this.props.onReload}>
            <RotateCw size={14} /> Reload
          </button>
          <button type="button" className="sh-btn sh-btn-ghost sh-btn-sm" onClick={this.props.onClose}>
            Close tab
          </button>
        </div>
        <details className="sh-crash-details">
          <summary>Error details</summary>
          <code>{this.state.error.message || String(this.state.error)}</code>
        </details>
      </div>
    )
  }
}

function SiteLoading({ site }: { site: SiteId }) {
  return (
    <div className="sh-site-loading" role="status" aria-label={`Loading ${siteDef(site).name}`}>
      <div className="sh-site-loading-bar" />
      <SiteChip site={site} size={34} className="sh-site-loading-chip" />
      <span>{siteDef(site).domain}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab content
// ---------------------------------------------------------------------------
function TabView({ tab, compact, reload, onReload }: { tab: BrowserTab; compact: boolean; reload: number; onReload: () => void }) {
  const Site = SITE_COMPONENTS[tab.site]
  const navigate = useCallback((p: string) => navigateTab(tab.id, p), [tab.id])
  const close = useCallback(() => closeTab(tab.id), [tab.id])
  const ref = useRef<HTMLDivElement>(null)
  const lastPath = useRef(tab.path)
  useLayoutEffect(() => {
    // a navigation lands at the top of the new page, like a real browser
    // (effects also re-run when a hidden tab is revealed: keep its scroll position then)
    if (lastPath.current === tab.path) return
    lastPath.current = tab.path
    if (ref.current) ref.current.scrollTop = 0
  }, [tab.path])
  return (
    <div ref={ref} className="sh-tabview" data-site={tab.site}>
      <SiteErrorBoundary key={`${tab.id}:${reload}`} site={tab.site} resetKey={tab.path} onReload={onReload} onClose={close}>
        <Suspense fallback={<SiteLoading site={tab.site} />}>
          {Site ? <Site tabId={tab.id} path={tab.path} navigate={navigate} compact={compact} /> : null}
        </Suspense>
      </SiteErrorBoundary>
    </div>
  )
}

function TabViews({ tabs, activeId, compact, reloads, reload }: { tabs: BrowserTab[]; activeId: string | null; compact: boolean; reloads: Record<string, number>; reload: (id: string) => void }) {
  return (
    <>
      {tabs.map(t => (
        <Activity key={t.id} mode={t.id === activeId ? 'visible' : 'hidden'}>
          <TabView tab={t} compact={compact} reload={reloads[t.id] ?? 0} onReload={() => reload(t.id)} />
        </Activity>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared start page (desktop "New Tab" and phone home screen)
// ---------------------------------------------------------------------------
function useLauncherSites() {
  const storeCreated = useGS(s => s.store.created)
  return useMemo(() => SITES.filter(s => s.bookmark || (s.id === 'storefront' && storeCreated)), [storeCreated])
}

function NewTabPage({ onOpen }: { onOpen: (site: SiteId, path?: string) => void }) {
  const name = useGS(s => s.player.name || s.meta.playerName)
  const hour = useGS(s => s.time.hour)
  const storeCreated = useGS(s => s.store.created)
  const storeDomain = useStoreDomain()
  const sites = useLauncherSites()
  const [q, setQ] = useState('')
  const [miss, setMiss] = useState(false)
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return sites
    return sites.filter(s => s.name.toLowerCase().includes(t) || s.domain.includes(t) || s.description.toLowerCase().includes(t))
  }, [q, sites])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const hit = parseAddress(q, storeDomain, storeCreated) ?? (filtered[0] ? { site: filtered[0].id, path: '' } : null)
    if (hit) onOpen(hit.site, hit.path)
    else {
      setMiss(true)
      sfx.error()
      window.setTimeout(() => setMiss(false), 2200)
    }
  }
  return (
    <div className="sh-newtab">
      <div className="sh-newtab-hello">
        {greeting(hourOfDay(hour))}, {name}
      </div>
      <div className="sh-newtab-sub">
        {formatDate(dayOf(hour), 'long')} · {formatClock(hour)}
      </div>
      <form className={clsx('sh-newtab-search', miss && 'is-miss')} onSubmit={submit}>
        <Search size={18} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your apps or type a URL" aria-label="Search or type a URL" autoFocus />
        {miss && <span className="sh-newtab-miss">This site can’t be reached</span>}
      </form>
      <div className="sh-newtab-grid">
        {filtered.map(s => (
          <button key={s.id} type="button" className="sh-newtab-tile" onClick={() => onOpen(s.id)} title={s.description}>
            <SiteChip site={s.id} size={44} />
            <span className="sh-newtab-name">{s.id === 'storefront' ? 'Your store' : shortName(s.id)}</span>
            <span className="sh-newtab-desc">{s.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PhoneHome({ onOpen }: { onOpen: (site: SiteId) => void }) {
  const sites = useLauncherSites()
  const dock: SiteId[] = ['shopifly', 'fadbook', 'tiktak', 'mail']
  const grid = sites.filter(s => !dock.includes(s.id))
  return (
    <div className="sh-phome">
      <div className="sh-phome-grid">
        {grid.map(s => (
          <button key={s.id} type="button" className="sh-phome-app" onClick={() => onOpen(s.id)}>
            <SiteChip site={s.id} size={54} className="sh-phome-icon" />
            <span>{s.id === 'storefront' ? 'My Store' : shortName(s.id).replace(' Ads', '')}</span>
          </button>
        ))}
      </div>
      <div className="sh-phome-dock">
        {dock.map(id => (
          <button key={id} type="button" className="sh-phome-app" onClick={() => onOpen(id)} aria-label={shortName(id)}>
            <SiteChip site={id} size={54} className="sh-phome-icon" />
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function Computer() {
  const open = useUI(u => u.computerOpen)
  const location = useGS(s => s.player.location)
  const vw = useViewportWidth()
  const narrow = vw < PHONE_BREAKPOINT
  const phone = location !== 'home' || narrow

  // mount lazily on first open, then keep it alive (hidden) so tabs keep their state
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  // brief closing animation before hiding
  const [visible, setVisible] = useState(open)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (open) {
      setVisible(true)
      setClosing(false)
      return
    }
    if (!visible) return
    setClosing(true)
    const t = window.setTimeout(() => {
      setVisible(false)
      setClosing(false)
    }, 170)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!mounted) return null
  return (
    <Activity mode={visible ? 'visible' : 'hidden'}>
      <div className={clsx('sh-computer', phone ? 'is-phone' : 'is-desktop', narrow && 'is-narrow', closing && 'is-closing')}>
        <div className="sh-computer-backdrop" />
        {phone ? <PhoneBrowser location={location} fullBleed={narrow} /> : <DesktopBrowser />}
      </div>
    </Activity>
  )
}

/** State shared by both browser frames. */
function useBrowserModel() {
  const tabs = useUI(u => u.tabs)
  const activeTab = useUI(u => u.activeTab)
  const [reloads, setReloads] = useState<Record<string, number>>({})
  const [startPage, setStartPage] = useState(false)
  const active = tabs.find(t => t.id === activeTab) ?? null
  // any navigation from anywhere (bookmarks, toasts, coach, sites) produces a new tab
  // object or a different active tab: that leaves the start page
  const [prevActive, setPrevActive] = useState(active)
  if (prevActive !== active) {
    setPrevActive(active)
    if (startPage) setStartPage(false)
  }
  const showStart = startPage || !active
  const reload = useCallback((id: string) => {
    setReloads(r => ({ ...r, [id]: (r[id] ?? 0) + 1 }))
    sfx.click()
  }, [])
  const openFromStart = useCallback((site: SiteId, path = '') => {
    setStartPage(false)
    openSite(site, path, { newTab: true })
    sfx.click()
  }, [])
  const select = useCallback((id: string) => {
    setStartPage(false)
    useUI.getState().set({ activeTab: id })
  }, [])
  const close = useCallback((id: string) => {
    closeTab(id)
    sfx.click()
  }, [])
  return { tabs, active, activeTab, reloads, reload, showStart, setStartPage, openFromStart, select, close }
}

// ---------------------------------------------------------------------------
// Desktop browser
// ---------------------------------------------------------------------------
function DesktopBrowser() {
  const m = useBrowserModel()
  const [maxed, setMaxed] = useState(false)
  const storeCreated = useGS(s => s.store.created)
  const storeDomain = useStoreDomain()
  const bookmarks = useMemo(() => SITES.filter(s => s.bookmark || (s.id === 'storefront' && storeCreated)), [storeCreated])
  const active = m.showStart ? null : m.active
  const loadKey = active ? `${active.id}:${active.path}:${m.reloads[active.id] ?? 0}` : 'start'

  return (
    <div className={clsx('sh-window', maxed && 'is-maxed')} role="dialog" aria-label="Web browser">
      <div className="sh-tabstrip">
        <div className="sh-traffic">
          <button type="button" className="is-close" onClick={() => setComputerOpen(false)} title="Close (Esc)" aria-label="Close computer">
            <X size={8} strokeWidth={3.5} />
          </button>
          <button type="button" className="is-min" onClick={() => setComputerOpen(false)} title="Minimize" aria-label="Minimize">
            <span />
          </button>
          <button type="button" className="is-zoom" onClick={() => setMaxed(v => !v)} title={maxed ? 'Restore' : 'Zoom'} aria-label="Zoom">
            {maxed ? <Minimize2 size={7} strokeWidth={3.5} /> : <Maximize2 size={7} strokeWidth={3.5} />}
          </button>
        </div>
        <div className="sh-tabs" role="tablist">
          {m.tabs.map(t => {
            const isActive = !m.showStart && t.id === m.activeTab
            return (
              <div
                key={t.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                className={clsx('sh-tab', isActive && 'is-active')}
                onClick={() => m.select(t.id)}
                onAuxClick={e => {
                  if (e.button === 1) m.close(t.id)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') m.select(t.id)
                }}
                title={`${siteDef(t.site).name}\n${urlOf(t, storeDomain)}`}
              >
                <SiteChip site={t.site} size={16} />
                <span className="sh-tab-title">{t.site === 'storefront' ? 'Your store' : siteDef(t.site).name}</span>
                <button
                  type="button"
                  className="sh-tab-x"
                  aria-label="Close tab"
                  onClick={e => {
                    e.stopPropagation()
                    m.close(t.id)
                  }}
                >
                  <X size={12} strokeWidth={2.6} />
                </button>
              </div>
            )
          })}
          {m.showStart && (
            <div role="tab" aria-selected className="sh-tab is-active is-start">
              <span className="sh-tab-newglyph">
                <Star size={11} strokeWidth={2.6} />
              </span>
              <span className="sh-tab-title">New Tab</span>
              {m.tabs.length > 0 && (
                <button type="button" className="sh-tab-x" aria-label="Close tab" onClick={() => m.setStartPage(false)}>
                  <X size={12} strokeWidth={2.6} />
                </button>
              )}
            </div>
          )}
          <button type="button" className="sh-tab-new" onClick={() => m.setStartPage(true)} title="New tab" aria-label="New tab">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <Toolbar active={active} storeDomain={storeDomain} storeCreated={storeCreated} onReload={() => active && m.reload(active.id)} loadKey={loadKey} />

      <div className="sh-bookmarks">
        {bookmarks.map(b => (
          <button key={b.id} type="button" className="sh-bookmark" onClick={() => openSite(b.id)} title={`${b.name} — ${b.description}`}>
            <SiteChip site={b.id} size={14} />
            <span>{b.id === 'storefront' ? 'Your store' : shortName(b.id)}</span>
          </button>
        ))}
      </div>

      <div className="sh-viewport">
        <TabViews tabs={m.tabs} activeId={m.showStart ? null : m.activeTab} compact={false} reloads={m.reloads} reload={m.reload} />
        {m.showStart && <NewTabPage onOpen={m.openFromStart} />}
      </div>
    </div>
  )
}

function Toolbar({ active, storeDomain, storeCreated, onReload, loadKey }: { active: BrowserTab | null; storeDomain: string; storeCreated: boolean; onReload: () => void; loadKey: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [miss, setMiss] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const url = active ? urlOf(active, storeDomain) : ''
  const shown = active ? url.replace(/^https:\/\//, '').replace(/\/$/, '') : ''
  const host = active ? domainOf(active.site, storeDomain) : ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const hit = parseAddress(draft ?? '', storeDomain, storeCreated)
    if (!hit) {
      setMiss((draft ?? '').replace(/^https?:\/\//, '').split('/')[0] || 'that address')
      sfx.error()
      window.setTimeout(() => setMiss(null), 2400)
      return
    }
    if (active && hit.site === active.site) navigateTab(active.id, hit.path)
    else openSite(hit.site, hit.path)
    setDraft(null)
    inputRef.current?.blur()
  }

  return (
    <div className="sh-toolbar">
      <button type="button" className="sh-nav-btn" disabled={!active?.back.length} onClick={() => active && tabBack(active.id)} aria-label="Back" title="Back">
        <ArrowLeft size={16} />
      </button>
      <button type="button" className="sh-nav-btn" disabled={!active?.forward.length} onClick={() => active && tabForward(active.id)} aria-label="Forward" title="Forward">
        <ArrowRight size={16} />
      </button>
      <button type="button" className="sh-nav-btn" disabled={!active} onClick={onReload} aria-label="Reload" title="Reload">
        <RotateCw size={15} />
      </button>
      <form className={clsx('sh-omnibox', draft !== null && 'is-editing', miss && 'is-miss')} onSubmit={submit}>
        {active ? <Lock size={13} className="sh-omni-lock" /> : <Search size={13} className="sh-omni-lock" />}
        {draft === null && active ? (
          <button type="button" className="sh-omni-display" onClick={() => {
            setDraft(url)
            window.setTimeout(() => inputRef.current?.select(), 0)
          }}>
            <span className="sh-omni-host">{host}</span>
            <span className="sh-omni-path">{shown.slice(host.length)}</span>
          </button>
        ) : (
          <input
            ref={inputRef}
            className="sh-omni-input"
            value={draft ?? ''}
            placeholder="Search your apps or type a URL"
            onChange={e => setDraft(e.target.value)}
            onFocus={() => draft === null && setDraft(active ? url : '')}
            onBlur={() => window.setTimeout(() => setDraft(null), 120)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setDraft(null)
                inputRef.current?.blur()
              }
            }}
            aria-label="Address bar"
            spellCheck={false}
            autoFocus={draft !== null}
          />
        )}
        <Bookmark size={14} className="sh-omni-star" />
        {miss && <span className="sh-omni-miss">This site can’t be reached: {miss}</span>}
      </form>
      <span className="sh-loadbar" key={loadKey} aria-hidden />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Phone browser
// ---------------------------------------------------------------------------
function PhoneBrowser({ location, fullBleed }: { location: 'home' | 'work' | 'out'; fullBleed: boolean }) {
  const m = useBrowserModel()
  const hour = useGS(s => s.time.hour)
  const step = useUI(u => Math.floor(u.hourFrac * 6))
  const activityKind = useGS(s => s.player.activity?.kind)
  const storeDomain = useStoreDomain()
  const [switcher, setSwitcher] = useState(false)
  const active = m.showStart ? null : m.active
  const clock = formatClock(hour, step / 6).replace(/ (AM|PM)$/, '')

  const banner =
    location === 'work'
      ? { emoji: '🍟', text: "On shift at McDoodle's. Sneaking a look at your phone; heavy work waits until you're home." }
      : location === 'out'
        ? { emoji: activityKind === 'gym' ? '🏋️' : activityKind === 'socialize' ? '🍻' : '🚶', text: "You're out. Phone only; the computer's at home." }
        : null

  const goHome = () => {
    setSwitcher(false)
    m.setStartPage(true)
    sfx.click()
  }

  return (
    <div className={clsx('sh-phone-wrap', fullBleed && 'is-full')}>
      {banner && (
        <div className="sh-phone-banner">
          <span>{banner.emoji}</span>
          {banner.text}
        </div>
      )}
      <div className="sh-phone" role="dialog" aria-label="Phone">
        <div className="sh-phone-screen">
          <div className="sh-phone-status">
            <span className="sh-phone-time">{clock}</span>
            <span className="sh-phone-island" />
            <span className="sh-phone-icons">
              <Signal size={13} strokeWidth={2.6} />
              <Wifi size={13} strokeWidth={2.6} />
              <BatteryMedium size={17} strokeWidth={2.2} />
            </span>
          </div>

          <div className="sh-phone-content">
            <TabViews tabs={m.tabs} activeId={m.showStart ? null : m.activeTab} compact reloads={m.reloads} reload={m.reload} />
            {m.showStart && <PhoneHome onOpen={id => m.openFromStart(id)} />}
            {switcher && (
              <div className="sh-phone-switcher">
                <div className="sh-phone-switcher-head">
                  <b>{m.tabs.length} {m.tabs.length === 1 ? 'Tab' : 'Tabs'}</b>
                  <button type="button" className="sh-link-btn" onClick={() => setSwitcher(false)}>
                    Done
                  </button>
                </div>
                <div className="sh-phone-cards">
                  {m.tabs.map(t => (
                    <div key={t.id} className={clsx('sh-phone-card', t.id === m.activeTab && !m.showStart && 'is-active')}>
                      <button
                        type="button"
                        className="sh-phone-card-main"
                        onClick={() => {
                          m.select(t.id)
                          setSwitcher(false)
                        }}
                      >
                        <SiteChip site={t.site} size={30} />
                        <span>
                          <b>{t.site === 'storefront' ? 'Your store' : shortName(t.site)}</b>
                          <small>{urlOf(t, storeDomain).replace(/^https:\/\//, '')}</small>
                        </span>
                      </button>
                      <button type="button" className="sh-icon-btn is-sm" aria-label="Close tab" onClick={() => m.close(t.id)}>
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  {!m.tabs.length && <div className="sh-phone-empty">No open tabs</div>}
                </div>
                <button type="button" className="sh-btn sh-btn-soft sh-btn-sm" onClick={goHome}>
                  <Plus size={14} /> New tab
                </button>
              </div>
            )}
          </div>

          {active && (
            <div className="sh-phone-url">
              <SiteChip site={active.site} size={14} />
              <span className="sh-phone-url-text">
                <Lock size={10} /> {domainOf(active.site, storeDomain)}
              </span>
              <button type="button" className="sh-phone-url-btn" onClick={() => m.reload(active.id)} aria-label="Reload">
                <RotateCw size={13} />
              </button>
            </div>
          )}
          <div className="sh-phone-toolbar">
            <button type="button" disabled={!active?.back.length} onClick={() => active && tabBack(active.id)} aria-label="Back">
              <ChevronLeft size={22} />
            </button>
            <button type="button" disabled={!active?.forward.length} onClick={() => active && tabForward(active.id)} aria-label="Forward">
              <ChevronRight size={22} />
            </button>
            <button type="button" onClick={goHome} aria-label="Home screen" className={clsx(m.showStart && !switcher && 'is-on')}>
              <House size={19} />
            </button>
            <button type="button" onClick={() => setSwitcher(v => !v)} aria-label="Tabs" className={clsx('sh-phone-tabsbtn', switcher && 'is-on')}>
              <Layers size={19} />
              {m.tabs.length > 0 && <span>{m.tabs.length}</span>}
            </button>
            <button type="button" onClick={() => setComputerOpen(false)} aria-label="Put phone away">
              <X size={20} />
            </button>
          </div>
          <div className="sh-phone-homebar" />
        </div>
      </div>
      {!fullBleed && (
        <button type="button" className="sh-phone-away" onClick={() => setComputerOpen(false)}>
          Put phone away <kbd>Esc</kbd>
        </button>
      )}
    </div>
  )
}
