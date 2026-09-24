// Toasts (bottom-right, Shopify-style dark pills with sales batching) and the bell dropdown.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, Info, Megaphone, ShoppingBag, X, OctagonAlert, BarChart3, CheckCheck } from 'lucide-react'
import type { GameNotification, SiteId } from '../../core/types'
import { act, useGS } from '../../core/store'
import { openSite, useUI } from '../../core/ui'
import { money } from '../../core/format'
import { formatDate, dayOf } from '../../core/time'
import { sfx } from '../audio'
import { useShell, pushToast, pushSales, dismissToast, type ShellToast, type ToastKind } from './shellStore'
import { relHours, useDismiss } from './common'

const KIND_ICON: Record<ToastKind, typeof Bell> = {
  sale: ShoppingBag,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: OctagonAlert,
  coach: Megaphone,
  recap: BarChart3,
  system: CheckCircle2,
}

function markRead(ids: string[]) {
  if (!ids.length) return
  const set = new Set(ids)
  act(s => {
    for (const n of s.notifications) if (set.has(n.id)) n.read = true
  })
}

function follow(site?: SiteId, path?: string) {
  if (site) openSite(site, path ?? '')
}

// ---------------------------------------------------------------------------
// Feed watcher: turns new game notifications into toasts (+ sounds)
// ---------------------------------------------------------------------------
export function useNotificationFeed() {
  const notifs = useGS(s => s.notifications)
  const saveId = useGS(s => s.meta.saveId)
  const seen = useRef<Set<string> | null>(null)
  const seenFor = useRef(saveId)
  useEffect(() => {
    if (!seen.current || seenFor.current !== saveId) {
      seenFor.current = saveId
      // first render after load: everything that already exists is history, not news
      seen.current = new Set(notifs.map(n => n.id))
      return
    }
    const known = seen.current
    const fresh: GameNotification[] = []
    for (const n of notifs) if (!known.has(n.id)) fresh.push(n)
    if (!fresh.length) return
    // keep the seen-set bounded to what still exists
    const next = new Set<string>()
    for (const n of notifs) next.add(n.id)
    seen.current = next

    const unread = fresh.filter(n => !n.read)
    const sales = unread.filter(n => n.kind === 'sale')
    const others = unread.filter(n => n.kind !== 'sale' && n.kind !== 'coach')
    if (sales.length) {
      pushSales(sales)
      sfx.chaChing()
    }
    // collapse floods of the same kind (e.g. 12 support tickets in one tick)
    const shown = others.slice(-3)
    for (const n of shown) {
      pushToast({ kind: n.kind, title: n.title, body: n.body, site: n.site, path: n.path, notifIds: [n.id], amount: n.amount ?? 0, ttl: n.kind === 'critical' ? 9000 : n.kind === 'warning' ? 7000 : 5200 })
    }
    if (others.length > shown.length) {
      pushToast({ kind: 'info', title: `${others.length - shown.length} more notifications`, body: 'Open the bell to catch up.', notifIds: others.slice(0, -3).map(n => n.id) })
    }
    if (others.some(n => n.kind === 'critical')) sfx.error()
    else if (others.length && !sales.length) sfx.ping()
  }, [notifs, saveId])
}

// ---------------------------------------------------------------------------
// Toast stack
// ---------------------------------------------------------------------------
export function Toasts() {
  const toasts = useShell(s => s.toasts)
  // a decision modal covers the screen: hold the countdown so nothing expires unseen
  const held = useGS(s => s.events.modals.length > 0)
  const heldRef = useRef(held)
  heldRef.current = held
  const [hovered, setHovered] = useState<string | null>(null)
  const hoveredRef = useRef<string | null>(null)
  hoveredRef.current = hovered

  // expire toasts (hover pauses the one under the cursor)
  useEffect(() => {
    if (!toasts.length) return
    const TICK = 250
    const t = window.setInterval(() => {
      const now = Date.now()
      const cur = useShell.getState().toasts
      if (heldRef.current) {
        useShell.getState().set({ toasts: cur.map(x => ({ ...x, heldMs: x.heldMs + TICK })) })
        return
      }
      const keep = cur.filter(x => x.id === hoveredRef.current || now - x.updatedAt - x.heldMs < x.ttl)
      if (keep.length !== cur.length) useShell.getState().set({ toasts: keep })
    }, TICK)
    return () => window.clearInterval(t)
  }, [toasts.length])

  if (!toasts.length) return null
  return (
    <div className={clsx('sh-toasts', held && 'is-held')} aria-live="polite">
      {toasts.map(t => (
        <ToastView
          key={t.id}
          t={t}
          onHover={h => {
            setHovered(h ? t.id : null)
            // leaving restarts the countdown so the toast doesn't vanish under the cursor's exit
            if (!h) {
              const st = useShell.getState()
              st.set({ toasts: st.toasts.map(x => (x.id === t.id ? { ...x, updatedAt: Date.now(), heldMs: 0 } : x)) })
            }
          }}
        />
      ))}
    </div>
  )
}

function ToastView({ t, onHover }: { t: ShellToast; onHover: (h: boolean) => void }) {
  const Icon = KIND_ICON[t.kind] ?? Info
  const clickable = !!t.site || !!t.action
  const onClick = () => {
    markRead(t.notifIds)
    if (t.action === 'daily_report') {
      useShell.getState().set({ reportDay: t.day ?? null })
      useUI.getState().set({ overlay: 'daily_report' })
    }
    else follow(t.site, t.path)
    dismissToast(t.id)
    sfx.click()
  }
  const isSale = t.kind === 'sale'
  const title = isSale ? (t.count > 1 ? `${t.count} new orders` : t.title || 'New order') : t.title
  return (
    <div
      className={clsx('sh-toast', `is-${t.kind}`, clickable && 'is-clickable')}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      role={clickable ? 'button' : 'status'}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={e => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <span className="sh-toast-icon" key={`i${t.updatedAt}`}>
        <Icon size={16} strokeWidth={2.3} />
      </span>
      <span className="sh-toast-text">
        <span className="sh-toast-title">
          {title}
          {isSale && t.amount > 0 && <span className="sh-toast-amount">· {money(t.amount)}</span>}
        </span>
        {t.body && <span className="sh-toast-body">{t.body}</span>}
      </span>
      {clickable && <ChevronRight size={15} className="sh-toast-go" />}
      <button
        type="button"
        className="sh-toast-x"
        aria-label="Dismiss"
        onClick={e => {
          e.stopPropagation()
          dismissToast(t.id)
        }}
      >
        <X size={13} />
      </button>
      <span className="sh-toast-timer" style={{ animationDuration: `${t.ttl}ms` }} key={`t${t.updatedAt}`} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bell dropdown
// ---------------------------------------------------------------------------
type BellFilter = 'all' | 'alerts' | 'sales'

export function NotificationBell() {
  const notifs = useGS(s => s.notifications)
  const hour = useGS(s => s.time.hour)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<BellFilter>('all')
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, [btnRef, panelRef])

  const { unreadAlerts, unreadSales } = useMemo(() => {
    let a = 0
    let s = 0
    for (const n of notifs) {
      if (n.read) continue
      if (n.kind === 'sale') s++
      else a++
    }
    return { unreadAlerts: a, unreadSales: s }
  }, [notifs])

  const list = useMemo(() => {
    const out: GameNotification[] = []
    for (let i = notifs.length - 1; i >= 0 && out.length < 80; i--) {
      const n = notifs[i]
      if (filter === 'sales' && n.kind !== 'sale') continue
      if (filter === 'alerts' && n.kind === 'sale') continue
      out.push(n)
    }
    return out
  }, [notifs, filter])

  const groups = useMemo(() => {
    const g: { day: number; items: GameNotification[] }[] = []
    for (const n of list) {
      const d = dayOf(n.hour)
      const last = g[g.length - 1]
      if (last && last.day === d) last.items.push(n)
      else g.push({ day: d, items: [n] })
    }
    return g
  }, [list])

  const markAll = () => {
    act(s => {
      for (const n of s.notifications) {
        if (filter === 'sales' && n.kind !== 'sale') continue
        if (filter === 'alerts' && n.kind === 'sale') continue
        n.read = true
      }
    })
    sfx.click()
  }
  const today = dayOf(hour)

  return (
    <div className="sh-bell-wrap">
      <button
        ref={btnRef}
        type="button"
        className={clsx('sh-hud-icon', open && 'is-active')}
        onClick={() => {
          setOpen(o => !o)
          sfx.click()
        }}
        aria-label="Notifications"
        aria-expanded={open}
        title="Notifications"
      >
        <Bell size={18} strokeWidth={2.2} className={clsx(unreadAlerts > 0 && 'sh-bell-ring')} key={unreadAlerts} />
        {unreadAlerts > 0 ? <span className="sh-badge">{unreadAlerts > 99 ? '99+' : unreadAlerts}</span> : unreadSales > 0 ? <span className="sh-badge-dot" title={`${unreadSales} new orders`} /> : null}
      </button>
      {open && (
        <div ref={panelRef} className="sh-bell" role="dialog" aria-label="Notifications">
          <div className="sh-bell-head">
            <b>Notifications</b>
            <button type="button" className="sh-link-btn" onClick={markAll} disabled={filter === 'all' ? unreadAlerts + unreadSales === 0 : filter === 'sales' ? unreadSales === 0 : unreadAlerts === 0}>
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <div className="sh-seg" role="tablist">
            {(['all', 'alerts', 'sales'] as BellFilter[]).map(f => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={clsx('sh-seg-btn', filter === f && 'is-active')} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'alerts' ? 'Alerts' : 'Sales'}
                {f === 'alerts' && unreadAlerts > 0 && <span className="sh-seg-count">{unreadAlerts}</span>}
                {f === 'sales' && unreadSales > 0 && <span className="sh-seg-count is-mint">{unreadSales}</span>}
              </button>
            ))}
          </div>
          <div className="sh-bell-list">
            {groups.length === 0 && (
              <div className="sh-bell-empty">
                <span>🔔</span>
                <b>You're all caught up</b>
                <small>{filter === 'sales' ? 'Orders show up here the moment they land.' : 'Alerts about your store, ads, bank and job appear here.'}</small>
              </div>
            )}
            {groups.map(g => (
              <div key={g.day} className="sh-bell-group">
                <div className="sh-bell-day">{g.day === today ? 'Today' : g.day === today - 1 ? 'Yesterday' : formatDate(g.day, 'medium').replace(/, \d{4}$/, '')}</div>
                {g.items.map(n => {
                  const Icon = KIND_ICON[n.kind] ?? Info
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={clsx('sh-bell-item', `is-${n.kind}`, !n.read && 'is-unread', n.site && 'has-link')}
                      onClick={() => {
                        markRead([n.id])
                        if (n.site) {
                          follow(n.site, n.path)
                          setOpen(false)
                        }
                      }}
                    >
                      <span className="sh-bell-icon">
                        <Icon size={15} strokeWidth={2.3} />
                      </span>
                      <span className="sh-bell-text">
                        <span className="sh-bell-title">
                          {n.title}
                          {n.kind === 'sale' && n.amount ? <em> {money(n.amount)}</em> : null}
                        </span>
                        {n.body && <span className="sh-bell-body">{n.body}</span>}
                        <span className="sh-bell-time">{relHours(hour, n.hour)}</span>
                      </span>
                      {!n.read && <span className="sh-bell-dot" aria-label="unread" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
