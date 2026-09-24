// Game-screen side effects: keyboard shortcuts, save-on-hide, midnight recap, level-up chimes.
import { useEffect, useRef } from 'react'
import { useGame, useGS } from '../../core/store'
import { useUI, setSpeed, togglePause } from '../../core/ui'
import { saveGame } from '../../core/save'
import { dayOf, formatDate } from '../../core/time'
import { money } from '../../core/format'
import { sfx } from '../audio'
import { isTypingTarget } from './common'
import { setComputerOpen } from './actions'
import { buildRecap } from './recap'
import { addRecap, pushToast, useShell, useShellPrefs } from './shellStore'

/** Space = pause, 1/2/3 = speed 1×/2×/4×, Esc = close the computer. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // overlays, menus and kit popovers handle Esc first (capture phase + preventDefault)
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const u = useUI.getState()
      if (e.key === 'Escape') {
        if (u.overlay) {
          u.set({ overlay: null })
          e.preventDefault()
        } else if (u.computerOpen) {
          setComputerOpen(false)
          e.preventDefault()
        }
        return
      }
      if (isTypingTarget(e.target)) return
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        togglePause()
        sfx.click()
        return
      }
      const speed = e.key === '1' ? 1 : e.key === '2' ? 2 : e.key === '3' ? 4 : 0
      if (speed) {
        e.preventDefault()
        setSpeed(speed)
        sfx.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Best-effort save when the tab is hidden or the page is being unloaded. */
export function useSaveOnHide() {
  useEffect(() => {
    let last = 0
    const save = () => {
      const s = useGame.getState().state
      if (!s || Date.now() - last < 1500) return
      last = Date.now()
      void saveGame(useUI.getState().slot, s).catch(e => console.warn('save on hide failed', e))
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', save)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', save)
    }
  }, [])
}

/** At each in-game midnight: build the recap and (optionally) toast it. */
export function useMidnightRecap() {
  const day = useGS(s => dayOf(s.time.hour))
  const saveId = useGS(s => s.meta.saveId)
  const prev = useRef<{ day: number; saveId: string } | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = { day, saveId }
    if (!p || p.saveId !== saveId) {
      // fresh load: seed yesterday's report quietly so the overlay has something to show
      useShell.getState().set({ recaps: [], reportDay: null })
      const s = useGame.getState().state
      if (s && day > 0) addRecap(buildRecap(s, day - 1))
      return
    }
    if (day <= p.day) return
    const s = useGame.getState().state
    if (!s) return
    const r = buildRecap(s, day - 1)
    addRecap(r)
    if (!useShellPrefs.getState().recapToasts) return
    const date = formatDate(r.day, 'medium').replace(/, \d{4}$/, '')
    const title = r.hasBusiness ? `${date} · profit ${money(r.profit, { sign: true })}` : `${date} wrapped`
    const bits: string[] = []
    if (r.hasBusiness) {
      bits.push(`${r.orders} order${r.orders === 1 ? '' : 's'}`)
      bits.push(`${money(r.revenue, { cents: false })} sales`)
      if (r.adSpend > 0) bits.push(`ROAS ${r.roas.toFixed(2)}`)
    } else {
      if (r.wage > 0) bits.push(`Paycheck ${money(r.wage)}`)
      bits.push(`Checking ${money(r.cashEnd, { cents: false })}`)
    }
    // one recap toast at a time (fast-forwarding through nights shouldn't stack them)
    const st = useShell.getState()
    st.set({ toasts: st.toasts.filter(t => t.kind !== 'recap') })
    pushToast({ kind: 'recap', title, body: `${bits.join(' · ')} · tap for the full report`, action: 'daily_report', day: r.day, ttl: 8000 })
  }, [day, saveId])
}

/** Chime on skill level-ups and new milestones (the sim posts its own notifications). */
export function useProgressChimes() {
  const skills = useGS(s => s.skills)
  const milestones = useGS(s => s.milestones)
  const saveId = useGS(s => s.meta.saveId)
  const prev = useRef<{ levels: number; ms: number; saveId: string } | null>(null)
  useEffect(() => {
    const levels = Object.values(skills).reduce((a, k) => a + (k?.level ?? 0), 0)
    const ms = Object.keys(milestones).length
    const p = prev.current
    prev.current = { levels, ms, saveId }
    if (!p || p.saveId !== saveId) return
    if (levels > p.levels || ms > p.ms) sfx.levelUp()
  }, [skills, milestones, saveId])
}
