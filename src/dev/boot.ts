// ============================================================================
// DEV ONLY — scenario boot + window.__dt handle for QA scripts.
// Imported dynamically from src/main.tsx behind `import.meta.env.DEV`, so it is
// tree-shaken out of production builds.
//
// URL params (all optional):
//   ?scenario=fresh|store|ads|scaled|crisis   build that state and jump straight into the game
//   &slot=<n>      save slot the autosave writes to (default 9: a scratch slot the title screen never lists)
//   &seed=<n>      RNG seed (default 20260302)
//   &speed=0|1|2|4 clock speed after loading (default 0 = paused, so the state stays put while you look)
//   &site=<siteId>&path=<route>   open the computer on that site/route right away
//
// Scripts (Playwright) use window.__dt — see scripts/e2e/README.md.
// ============================================================================
import type { ActivityKind, GameState, SiteId } from '../core/types'
import { act, useGame } from '../core/store'
import { closeTab, openSite, useUI, type Speed } from '../core/ui'
import { resolveModal } from '../core/modals'
import { dayOf, hourOfDay } from '../core/time'
import { tickHour } from '../sim'
import { cancelActivity, enqueueActivity } from '../sim/life'
import { SITES } from '../ui/sites/registry'
import { DEFAULT_SEED, SCENARIO_INFO, SCENARIO_NAMES, buildScenario, isScenarioName, scenarioChecks, type ScenarioName } from './scenarios'

export const SCRATCH_SLOT = 9

export interface LoadOptions {
  slot?: number
  seed?: number
  speed?: Speed
  site?: SiteId
  path?: string
}

export interface ScenarioInfo {
  name: ScenarioName
  seed: number
  buildMs: number
  day: number
  hour: number
  /** scenario promises the build didn't meet (see scenarioChecks); empty = all good */
  warnings: string[]
}

export interface DevHandle {
  useGame: typeof useGame
  useUI: typeof useUI
  act: typeof act
  openSite: typeof openSite
  buildScenario: typeof buildScenario
  /** build + load a scenario in place (no page reload); returns what was loaded */
  loadScenario: (name: string, opts?: LoadOptions) => ScenarioInfo
  scenarios: readonly string[]
  scenarioInfo: Record<string, string>
  sites: SiteId[]
  /** the scenario loaded by this page (null = none) */
  scenario: ScenarioInfo | null
  /** set when ?scenario= failed to build (the title screen shows instead) */
  scenarioError: string | null
  /** current game state (read-only snapshot) */
  state: () => GameState | null
  /** simulate N in-game hours right now (through act → tickHour) */
  tick: (hours?: number) => void
  /** resolve every pending decision modal with its first (or the given) choice */
  resolveModals: (choiceId?: string) => number
  /** close every browser tab (and optionally the computer) */
  closeTabs: (closeComputer?: boolean) => void
  setSpeed: (speed: Speed) => void
  /** drop whatever the player is doing and start `kind` now (optional duration in minutes); returns the id */
  startActivity: (kind: ActivityKind, opts?: { durationMin?: number }) => string | null
  /** 3D room QA: the director's view (beat, room, transition, crowd) or null when the room is 2D */
  scene3d: () => unknown
  /** 3D room QA: animate the room at this speed while the sim clock stays paused (null = follow the game) */
  roomSpeed: (speed: number | null) => void
}

declare global {
  interface Window {
    __dt?: DevHandle
  }
}

const SITE_IDS = SITES.map(s => s.id)

export function loadScenario(name: string, opts: LoadOptions = {}): ScenarioInfo {
  if (!isScenarioName(name)) throw new Error(`Unknown scenario "${name}". Use one of: ${SCENARIO_NAMES.join(', ')}`)
  const seed = opts.seed ?? DEFAULT_SEED
  const t0 = performance.now()
  const s = buildScenario(name, { seed })
  // a distinct save id per scenario resets the shell's per-save effects (toast feed, daily recap)
  s.meta.saveId = `dev_${name}_${seed.toString(36)}`
  const buildMs = Math.round(performance.now() - t0)
  useGame.getState().load(s)
  const speed = opts.speed ?? 0
  useUI.getState().set({
    screen: 'game',
    slot: opts.slot ?? SCRATCH_SLOT,
    speed,
    lastSpeed: speed === 0 ? 1 : speed,
    computerOpen: false,
    tabs: [],
    activeTab: null,
    overlay: null,
    hourFrac: 0,
  })
  if (opts.site && SITE_IDS.includes(opts.site)) openSite(opts.site, opts.path ?? '')
  const info: ScenarioInfo = { name, seed, buildMs, day: dayOf(s.time.hour), hour: hourOfDay(s.time.hour), warnings: scenarioChecks(name, s) }
  if (window.__dt) window.__dt.scenario = info
  console.info(`[dev] scenario "${name}" (seed ${seed}) built in ${buildMs} ms: day ${info.day + 1}, ${String(info.hour).padStart(2, '0')}:00`)
  if (info.warnings.length) console.warn(`[dev] scenario "${name}" is missing: ${info.warnings.join('; ')}`)
  return info
}

function installHandle(): DevHandle {
  const handle: DevHandle = {
    useGame,
    useUI,
    act,
    openSite,
    buildScenario,
    loadScenario,
    scenarios: SCENARIO_NAMES,
    scenarioInfo: SCENARIO_INFO,
    sites: SITE_IDS,
    scenario: window.__dt?.scenario ?? null,
    scenarioError: null,
    state: () => useGame.getState().state,
    tick: (hours = 1) => {
      act(s => {
        for (let i = 0; i < hours; i++) tickHour(s)
      })
    },
    resolveModals: choiceId => {
      let n = 0
      act(s => {
        while (s.events.modals.length && n < 50) {
          const m = s.events.modals[0]
          const choice = choiceId && m.choices.some(c => c.id === choiceId) ? choiceId : m.choices[0]?.id ?? 'ok'
          resolveModal(s, m.id, choice)
          n++
        }
      })
      return n
    },
    closeTabs: (closeComputer = false) => {
      for (const t of useUI.getState().tabs) closeTab(t.id)
      if (closeComputer) useUI.getState().set({ computerOpen: false })
    },
    setSpeed: speed => useUI.getState().set(speed === 0 ? { speed: 0 } : { speed, lastSpeed: speed }),
    startActivity: (kind, opts) => {
      let id: string | null = null
      act(s => {
        s.player.queue = []
        const cur = s.player.activity
        if (cur) {
          if (cur.kind === 'work_shift' || cur.payload?.forced) {
            s.player.activity = null
            s.player.location = 'home'
          } else cancelActivity(s, cur.id)
        }
        if (s.player.activity) {
          s.player.activity = null
          s.player.location = 'home'
        }
        s.player.queue = []
        id = enqueueActivity(s, kind, opts)
        if (!id) {
          // activities that need a target (a product, a creative...) are forced in directly for QA
          const min = opts?.durationMin ?? 60
          id = `qa_${kind}_${s.seq++}`
          s.player.activity = { id, kind, label: kind, durationMin: min, remainingMin: min, startedHour: s.time.hour }
          s.player.location = kind === 'gym' || kind === 'socialize' ? 'out' : 'home'
        }
      })
      return id
    },
    scene3d: () => (window as unknown as { __scene3d?: { debug(): unknown } }).__scene3d?.debug() ?? null,
    roomSpeed: speed => {
      const g = globalThis as { __dtStageSpeed?: number }
      if (speed === null) delete g.__dtStageSpeed
      else g.__dtStageSpeed = speed
    },
  }
  window.__dt = handle
  return handle
}

/** Called once from main.tsx (dev only) before the first render. */
export async function devBoot(): Promise<void> {
  const handle = installHandle()
  const q = new URLSearchParams(window.location.search)
  const name = q.get('scenario')
  if (!name) return
  const num = (k: string) => {
    const v = q.get(k)
    return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined
  }
  const speed = num('speed')
  try {
    loadScenario(name, {
      slot: num('slot'),
      seed: num('seed'),
      speed: speed === 1 || speed === 2 || speed === 4 ? speed : 0,
      site: (q.get('site') as SiteId | null) ?? undefined,
      path: q.get('path') ?? undefined,
    })
  } catch (e) {
    handle.scenarioError = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
    console.error(`[dev] scenario "${name}" failed to build`, e)
  }
}
