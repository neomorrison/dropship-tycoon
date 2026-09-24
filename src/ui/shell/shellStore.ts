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
  set: (p: Partial<Omit<ShellStore, 'set'>>) => void
}

export const useShell = create<ShellStore>()(set => ({
  toasts: [],
  recaps: [],
  reportDay: null,
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

/** Add sales to the live sales toast (or start a new one). Returns true when a new toast was created. */
export function pushSales(sales: GameNotification[]): boolean {
  if (!sales.length) return false
  const now = Date.now()
  const st = useShell.getState()
  const total = sales.reduce((a, n) => a + (n.amount ?? 0), 0)
  const latest = sales[sales.length - 1]
  const live = [...st.toasts].reverse().find(t => t.kind === 'sale' && now - t.updatedAt < SALE_MERGE_MS)
  if (live) {
    const merged: ShellToast = {
      ...live,
      count: live.count + sales.length,
      amount: live.amount + total,
      notifIds: [...live.notifIds, ...sales.map(n => n.id)],
      body: latest.body || latest.title,
      site: latest.site ?? live.site,
      path: live.count + sales.length > 1 ? 'orders' : latest.path ?? live.path,
      updatedAt: now,
      heldMs: 0,
    }
    st.set({ toasts: st.toasts.map(t => (t.id === live.id ? merged : t)) })
    return false
  }
  pushToast({
    kind: 'sale',
    title: latest.title,
    body: latest.body,
    site: latest.site ?? 'shopifly',
    path: sales.length > 1 ? 'orders' : latest.path ?? 'orders',
    count: sales.length,
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
interface ShellPrefs { recapToasts: boolean; coachCollapsed: boolean }
const DEFAULT_PREFS: ShellPrefs = { recapToasts: true, coachCollapsed: false }

function readPrefs(): ShellPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ShellPrefs>) } : DEFAULT_PREFS
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
      const { recapToasts, coachCollapsed } = { ...prefsSnapshot(), ...p }
      localStorage.setItem(PREF_KEY, JSON.stringify({ recapToasts, coachCollapsed }))
    } catch {
      /* storage unavailable: preference lasts for this session only */
    }
  },
}))
const prefsSnapshot = (): ShellPrefs => {
  const { recapToasts, coachCollapsed } = useShellPrefs.getState()
  return { recapToasts, coachCollapsed }
}
