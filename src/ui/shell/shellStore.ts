// Shell-only UI state that isn't part of core/ui: toasts, the latest daily recap and
// a few per-browser preferences. Nothing here is saved with the game.
import { create } from 'zustand'
import type { GameNotification, SiteId } from '../../core/types'
import type { DayRecap } from './recap'

export type ToastKind = GameNotification['kind'] | 'recap' | 'system'

export interface ShellToast {
  id: string
  kind: ToastKind
  title: string
  body?: string
  site?: SiteId
  path?: string
  /** game notifications this toast represents (marked read on click) */
  notifIds: string[]
  /** sales batching */
  count: number
  amount: number
  createdAt: number
  updatedAt: number
  /** ms after updatedAt before auto-dismiss */
  ttl: number
  /** time spent on hold (decision modal open) that doesn't count toward ttl */
  heldMs: number
  /** custom click action (recap, system) */
  action?: 'daily_report'
  /** in-game day a recap toast refers to */
  day?: number
}

interface ShellStore {
  toasts: ShellToast[]
  /** recent midnight recaps, oldest first */
  recaps: DayRecap[]
  /** day shown in the daily report overlay (null = latest) */
  reportDay: number | null
  /** Coach Kev popup open while the computer/phone is up (Kev docks in the browser toolbar there) */
  coachOpen: boolean
  /** room bubble stepped aside (to the face) because the player reached for something under it */
  coachTucked: boolean
  set: (p: Partial<Omit<ShellStore, 'set'>>) => void
}

export const useShell = create<ShellStore>()(set => ({
  toasts: [],
  recaps: [],
  reportDay: null,
  coachOpen: false,
  coachTucked: false,
  set: p => set(p),
}))

const MAX_RECAPS = 14
export function addRecap(r: DayRecap) {
  const st = useShell.getState()
  const list = [...st.recaps.filter(x => x.day !== r.day), r].sort((a, b) => a.day - b.day)
  st.set({ recaps: list.slice(-MAX_RECAPS) })
}

const MAX_TOASTS = 4
/** window during which new sales merge into the visible sales toast */
const SALE_MERGE_MS = 4000
let toastSeq = 0

export function pushToast(t: Omit<ShellToast, 'id' | 'createdAt' | 'updatedAt' | 'count' | 'amount' | 'notifIds' | 'ttl' | 'heldMs'> & Partial<Pick<ShellToast, 'count' | 'amount' | 'notifIds' | 'ttl'>>): string {
  const now = Date.now()
  const id = `toast${++toastSeq}`
  const toast: ShellToast = { count: 1, amount: 0, notifIds: [], ttl: 5200, ...t, id, createdAt: now, updatedAt: now, heldMs: 0 }
  const cur = useShell.getState().toasts
  const next = [...cur, toast]
  useShell.getState().set({ toasts: next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next })
  return id
}

/** Orders a sale notification stands for: the store batches each hour into one ("7 new orders"). */
function ordersIn(n: GameNotification): number {
  const m = /^(\d+)\s+new orders?\b/i.exec(n.title)
  return m ? Math.max(1, Number(m[1])) : 1
}
/** Latest order number mentioned by a sale notification ("New order #1577" / "… latest #1581"). */
function latestOrderNo(n: GameNotification): string | null {
  const all = `${n.title} ${n.body ?? ''}`.match(/#\d+/g)
  return all ? all[all.length - 1] : null
}

/** Add sales to the live sales toast (or start a new one). Returns true when a new toast was created. */
export function pushSales(sales: GameNotification[]): boolean {
  if (!sales.length) return false
  const now = Date.now()
  const st = useShell.getState()
  const total = sales.reduce((a, n) => a + (n.amount ?? 0), 0)
  const orders = sales.reduce((a, n) => a + ordersIn(n), 0)
  const latest = sales[sales.length - 1]
  const live = [...st.toasts].reverse().find(t => t.kind === 'sale' && now - t.updatedAt < SALE_MERGE_MS)
  if (live) {
    const no = latestOrderNo(latest)
    const merged: ShellToast = {
      ...live,
      count: live.count + orders,
      amount: live.amount + total,
      notifIds: [...live.notifIds, ...sales.map(n => n.id)],
      // the per-hour body ("$305.94 in sales this hour") is wrong once hours merge
      body: no ? `Latest order ${no}` : latest.body || latest.title,
      site: latest.site ?? live.site,
      path: 'orders',
      updatedAt: now,
      heldMs: 0,
    }
    st.set({ toasts: st.toasts.map(t => (t.id === live.id ? merged : t)) })
    return false
  }
  const no = sales.length > 1 ? latestOrderNo(latest) : null
  pushToast({
    kind: 'sale',
    title: latest.title,
    body: sales.length > 1 && no ? `Latest order ${no}` : latest.body,
    site: latest.site ?? 'shopifly',
    path: orders > 1 ? 'orders' : latest.path ?? 'orders',
    count: orders,
    amount: total,
    notifIds: sales.map(n => n.id),
    ttl: 4600,
  })
  return true
}

export function dismissToast(id: string) {
  const st = useShell.getState()
  st.set({ toasts: st.toasts.filter(t => t.id !== id) })
}

// ---------------------------------------------------------------------------
// Per-browser preferences (localStorage, best effort)
// ---------------------------------------------------------------------------
const PREF_KEY = 'dropship-tycoon:shell'
export type GraphicsPref = 'auto' | 'high' | 'low'
interface ShellPrefs {
  recapToasts: boolean
  coachCollapsed: boolean
  /** live 3D room (falls back to the painted room when off or when WebGL can't run) */
  room3d: boolean
  graphics: GraphicsPref
}
const DEFAULT_PREFS: ShellPrefs = { recapToasts: true, coachCollapsed: false, room3d: true, graphics: 'auto' }
const PREF_KEYS = Object.keys(DEFAULT_PREFS) as (keyof ShellPrefs)[]

function readPrefs(): ShellPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    const p = raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ShellPrefs>) } : DEFAULT_PREFS
    if (p.graphics !== 'auto' && p.graphics !== 'high' && p.graphics !== 'low') p.graphics = 'auto'
    return p
  } catch {
    return DEFAULT_PREFS
  }
}

interface PrefStore extends ShellPrefs { set: (p: Partial<ShellPrefs>) => void }
export const useShellPrefs = create<PrefStore>()(set => ({
  ...readPrefs(),
  set: p => {
    set(p)
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefsSnapshot()))
    } catch {
      /* storage unavailable: preference lasts for this session only */
    }
  },
}))
const prefsSnapshot = (): ShellPrefs => {
  const st = useShellPrefs.getState()
  const out = {} as Record<keyof ShellPrefs, unknown>
  for (const k of PREF_KEYS) out[k] = st[k]
  return out as ShellPrefs
}

/** If Kev's room bubble covers `el` (a hotspot or its menu), tuck him down to his face + badge. */
export function tuckCoachIfCovering(el: Element | null) {
  if (el) tuckCoachIfCoveringBox(el.getBoundingClientRect())
}
/** Same, for a viewport box (a 3D object's projected rect). */
export function tuckCoachIfCoveringBox(a: { left: number; top: number; right: number; bottom: number }) {
  const k = document.querySelector('.sh-coach')
  if (!k) return
  const b = k.getBoundingClientRect()
  if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) useShell.getState().set({ coachTucked: true })
}
