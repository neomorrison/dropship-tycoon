// UI-only state (not saved with the game): speed, pause locks, computer/browser tabs, overlays.
import { create } from 'zustand'
import { useEffect } from 'react'
import type { SiteId } from './types'

export type Speed = 0 | 1 | 2 | 4
export interface BrowserTab { id: string; site: SiteId; path: string; back: string[]; forward: string[] }
export type Overlay = null | 'settings' | 'daily_report' | 'saves' | 'help'

interface UIStore {
  screen: 'title' | 'game'
  slot: number
  speed: Speed
  /** speed to restore when unpausing */
  lastSpeed: Exclude<Speed, 0>
  /** components that force-pause the clock while mounted (editors, modals) */
  pauseLocks: string[]
  computerOpen: boolean
  /** phone-sized browser when away from home */
  tabs: BrowserTab[]
  activeTab: string | null
  overlay: Overlay
  muted: boolean
  musicOn: boolean
  volume: number
  /** fraction of the current hour elapsed (for smooth clock) */
  hourFrac: number
  set: (p: Partial<UIStore>) => void
}

let tabSeq = 0
export const useUI = create<UIStore>()(set => ({
  screen: 'title',
  slot: 0,
  speed: 1,
  lastSpeed: 1,
  pauseLocks: [],
  computerOpen: false,
  tabs: [],
  activeTab: null,
  overlay: null,
  muted: false,
  musicOn: true,
  volume: 0.6,
  hourFrac: 0,
  set: p => set(p),
}))

export const ui = () => useUI.getState()

export function setSpeed(speed: Speed) {
  const st = ui()
  st.set(speed === 0 ? { speed: 0 } : { speed, lastSpeed: speed })
}
export function togglePause() {
  const st = ui()
  setSpeed(st.speed === 0 ? st.lastSpeed : 0)
}

// ---- unsaved-changes guards --------------------------------------------------
// A page with a dirty form (product editor, theme editor, settings…) registers a guard for its tab
// while it's visible; browser-chrome navigation (back/forward/reload/URL bar/close) and deep links
// that would replace that page go through it, so the page can ask "Leave page with unsaved changes?".
type LeaveGuard = (go: () => void) => void
const leaveGuards = new Map<string, LeaveGuard[]>()
/** Register a leave guard for a tab; returns the unregister function. */
export function registerLeaveGuard(tabId: string, guard: LeaveGuard): () => void {
  const list = leaveGuards.get(tabId) ?? []
  list.push(guard)
  leaveGuards.set(tabId, list)
  return () => {
    const l = leaveGuards.get(tabId)
    if (!l) return
    const i = l.lastIndexOf(guard)
    if (i >= 0) l.splice(i, 1)
    if (!l.length) leaveGuards.delete(tabId)
  }
}
/** Run a navigation that would leave this tab's page, through its unsaved-changes prompt if it has one. */
export function guardTabNav(tabId: string, go: () => void): void {
  const l = leaveGuards.get(tabId)
  const g = l?.[l.length - 1]
  if (g) g(go)
  else go()
}

/** Open a site in the in-game browser (reuses an existing tab for that site). */
export function openSite(site: SiteId, path = '', opts: { newTab?: boolean } = {}) {
  const st = ui()
  const existing = !opts.newTab && st.tabs.find(t => t.site === site)
  if (existing) {
    const go = () => {
      const cur = ui()
      const tabs = cur.tabs.map(t => (t.id === existing.id ? { ...t, back: path !== t.path ? [...t.back, t.path] : t.back, forward: [], path } : t))
      cur.set({ tabs, activeTab: existing.id, computerOpen: true })
    }
    if (path !== existing.path && leaveGuards.has(existing.id)) {
      // show the page first so its "unsaved changes" prompt is visible, then ask
      st.set({ activeTab: existing.id, computerOpen: true })
      guardTabNav(existing.id, go)
      return
    }
    go()
    return
  }
  // tabs restored from a previous session (core/session) keep their ids: never reuse one
  let id = `tab${++tabSeq}`
  while (st.tabs.some(t => t.id === id)) id = `tab${++tabSeq}`
  st.set({ tabs: [...st.tabs, { id, site, path, back: [], forward: [] }], activeTab: id, computerOpen: true })
}
export function navigateTab(tabId: string, path: string) {
  const st = ui()
  st.set({ tabs: st.tabs.map(t => (t.id === tabId && t.path !== path ? { ...t, back: [...t.back, t.path], forward: [], path } : t)) })
}
export function tabBack(tabId: string) {
  const st = ui()
  st.set({
    tabs: st.tabs.map(t => {
      if (t.id !== tabId || !t.back.length) return t
      const back = t.back.slice(0, -1)
      return { ...t, back, forward: [t.path, ...t.forward], path: t.back[t.back.length - 1] }
    }),
  })
}
export function tabForward(tabId: string) {
  const st = ui()
  st.set({
    tabs: st.tabs.map(t => {
      if (t.id !== tabId || !t.forward.length) return t
      const [next, ...forward] = t.forward
      return { ...t, back: [...t.back, t.path], forward, path: next }
    }),
  })
}
export function closeTab(tabId: string) {
  const st = ui()
  const idx = st.tabs.findIndex(t => t.id === tabId)
  const tabs = st.tabs.filter(t => t.id !== tabId)
  const activeTab = st.activeTab === tabId ? (tabs[Math.max(0, idx - 1)]?.id ?? null) : st.activeTab
  st.set({ tabs, activeTab })
}

/** Force-pause the game clock while the calling component is mounted (editors, decision modals). */
export function usePauseWhileMounted(key: string, active = true) {
  useEffect(() => {
    if (!active) return
    const st = ui()
    st.set({ pauseLocks: [...st.pauseLocks, key] })
    return () => {
      const cur = ui()
      const i = cur.pauseLocks.indexOf(key)
      if (i >= 0) cur.set({ pauseLocks: [...cur.pauseLocks.slice(0, i), ...cur.pauseLocks.slice(i + 1)] })
    }
  }, [key, active])
}
