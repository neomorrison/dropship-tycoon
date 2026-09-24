// Session persistence: frequent autosave + seamless resume after a page reload
// (browser refresh, crash recovery, or a dev-server hot reload). The active slot and
// browser tabs live in sessionStorage, so closing the tab still returns to the title screen.
import { useEffect, useState } from 'react'
import { useGame } from './store'
import { useUI, type BrowserTab, type Speed } from './ui'
import { loadGame, saveGame } from './save'

const KEY = 'dt.session'
const AUTOSAVE_MS = 8000

interface SessionInfo {
  slot: number
  tabs: BrowserTab[]
  activeTab: string | null
  computerOpen: boolean
  speed: Speed
  lastSpeed: Exclude<Speed, 0>
}

function read(): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SessionInfo) : null
  } catch {
    return null
  }
}
function write(info: SessionInfo | null) {
  try {
    if (info) sessionStorage.setItem(KEY, JSON.stringify(info))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* storage unavailable (private mode) — resume just won't happen */
  }
}

let lastSaved: unknown = null
let saving = false
async function saveNow() {
  const st = useGame.getState().state
  const ui = useUI.getState()
  if (!st || ui.screen !== 'game' || saving || st === lastSaved) return
  saving = true
  try {
    await saveGame(ui.slot, st)
    lastSaved = st
  } catch (e) {
    console.warn('[session] autosave failed', e)
  } finally {
    saving = false
  }
}

/**
 * Mount once in <App/>. Returns true while a previous session is being restored
 * (render a splash instead of the title screen to avoid a flash).
 */
export function useSessionPersistence(): boolean {
  const [resuming, setResuming] = useState(() => read() !== null && useGame.getState().state === null)

  // Resume after reload
  useEffect(() => {
    if (!resuming) return
    const info = read()
    let cancelled = false
    ;(async () => {
      try {
        const st = info ? await loadGame(info.slot) : null
        if (cancelled) return
        if (st && info) {
          lastSaved = st
          useGame.getState().load(st)
          useUI.getState().set({
            screen: 'game',
            slot: info.slot,
            tabs: info.tabs ?? [],
            activeTab: info.activeTab ?? null,
            computerOpen: !!info.computerOpen,
            speed: info.speed ?? 1,
            lastSpeed: info.lastSpeed ?? 1,
          })
        } else {
          write(null)
        }
      } catch (e) {
        console.warn('[session] resume failed', e)
        write(null)
      } finally {
        if (!cancelled) setResuming(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resuming])

  // Track the active session (slot + browser tabs) in sessionStorage
  useEffect(() => {
    if (resuming) return
    const sync = () => {
      const ui = useUI.getState()
      const inGame = ui.screen === 'game' && useGame.getState().state !== null
      write(inGame ? { slot: ui.slot, tabs: ui.tabs, activeTab: ui.activeTab, computerOpen: ui.computerOpen, speed: ui.speed, lastSpeed: ui.lastSpeed } : null)
    }
    sync()
    const unsubUI = useUI.subscribe((a, b) => {
      if (a.screen !== b.screen || a.slot !== b.slot || a.tabs !== b.tabs || a.activeTab !== b.activeTab || a.computerOpen !== b.computerOpen || a.speed !== b.speed) sync()
    })
    const unsubGame = useGame.subscribe((a, b) => {
      if ((a.state === null) !== (b.state === null)) sync()
    })
    return () => {
      unsubUI()
      unsubGame()
    }
  }, [resuming])

  // Frequent autosave + save when the page is hidden/unloaded
  useEffect(() => {
    if (resuming) return
    const id = window.setInterval(saveNow, AUTOSAVE_MS)
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saveNow()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', saveNow)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', saveNow)
    }
  }, [resuming])

  return resuming
}
