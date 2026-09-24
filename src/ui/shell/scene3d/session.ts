// 3D availability for the shell: WebGL check (without importing three.js, so the 3D code can stay in
// its own lazy chunk), the per-session "3D failed, use the painted rooms" switch, and render quality.
import { create } from 'zustand'
import { asset } from '../../../core/assets'
import { useShellPrefs, type GraphicsPref } from '../shellStore'

let glOk: boolean | null = null
/** true when a WebGL context can be created (cached; false outside a browser) */
export function canWebGL(): boolean {
  if (glOk !== null) return glOk
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return (glOk = false)
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
    glOk = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    glOk = false
  }
  return glOk
}

interface Session3D {
  /** a stage failed this session (GLB load, lost context): every 3D view uses its 2D art until reload */
  failed: boolean
}
export const use3dSession = create<Session3D>()(() => ({ failed: false }))

export function mark3dFailed(err: unknown) {
  if (use3dSession.getState().failed) return
  console.warn('[3d] using the painted rooms for this session', err)
  use3dSession.setState({ failed: true })
}

/** WebGL works and nothing failed yet (the look editor and title diorama need only this). */
export function use3dPossible(): boolean {
  const failed = use3dSession(s => s.failed)
  return !failed && canWebGL()
}

/** The live 3D room is on (setting) and possible. */
export function use3dRoom(): boolean {
  const on = useShellPrefs(p => p.room3d)
  return use3dPossible() && on
}

/** Auto = low on small screens and on high-DPR touch phones. */
export function resolveQuality(pref: GraphicsPref): 'low' | 'high' {
  if (pref !== 'auto') return pref
  if (typeof window === 'undefined') return 'high'
  const w = window.innerWidth || 1280
  const h = window.innerHeight || 800
  const dpr = window.devicePixelRatio || 1
  let coarse = false
  try {
    coarse = window.matchMedia('(pointer: coarse)').matches
  } catch {
    /* old browsers */
  }
  if (Math.min(w, h) < 560) return 'low'
  if (coarse && dpr >= 2 && Math.max(w, h) < 1100) return 'low'
  return 'high'
}

export function useStageQuality(): 'low' | 'high' {
  const pref = useShellPrefs(p => p.graphics)
  return resolveQuality(pref)
}

/** '3d/tier0.glb' → the served asset URL (Vite base path aware) */
export const stageUrl = (path: string) => asset(path)
