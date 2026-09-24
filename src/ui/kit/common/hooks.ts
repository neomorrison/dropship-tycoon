// Shared React hooks for the kits: controllable state, outside clicks, and an
// Escape-key layer stack so only the top-most overlay closes on Esc.
import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react'

/**
 * State that can be controlled (value + onChange) or uncontrolled (defaultValue).
 * Returns [value, setValue] where setValue always calls onChange.
 */
export function useControllableState<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [inner, setInner] = useState<T>(defaultValue)
  const controlled = value !== undefined
  const current = controlled ? (value as T) : inner
  const set = useCallback(
    (v: T) => {
      if (!controlled) setInner(v)
      onChange?.(v)
    },
    [controlled, onChange],
  )
  return [current, set]
}

// ---------------------------------------------------------------------------
// Layer stack (Escape handling for modals, drawers, popovers)
// ---------------------------------------------------------------------------
const layerStack: number[] = []
let layerSeq = 0
let listening = false
const escHandlers = new Map<number, () => void>()

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !layerStack.length) return
  const top = layerStack[layerStack.length - 1]
  const fn = escHandlers.get(top)
  if (fn) {
    e.stopPropagation()
    e.preventDefault()
    fn()
  }
}

/**
 * Register an overlay layer while `active`. Escape invokes `onEscape` only for the
 * top-most active layer (a popover inside a modal closes first, then the modal).
 */
export function useLayer(active: boolean, onEscape?: () => void) {
  const cb = useRef(onEscape)
  cb.current = onEscape
  useEffect(() => {
    if (!active) return
    const id = ++layerSeq
    layerStack.push(id)
    escHandlers.set(id, () => cb.current?.())
    if (!listening && typeof document !== 'undefined') {
      document.addEventListener('keydown', onKeyDown, true)
      listening = true
    }
    return () => {
      const i = layerStack.indexOf(id)
      if (i >= 0) layerStack.splice(i, 1)
      escHandlers.delete(id)
    }
  }, [active])
}

/** Is any kit overlay (modal/drawer/popover) currently open? Useful for shell hotkeys. */
export const kitLayerOpen = () => layerStack.length > 0

/** Re-render every `ms` milliseconds while `active` (for live countdowns / clocks). */
export function useInterval(fn: () => void, ms: number, active = true) {
  const cb = useRef(fn)
  cb.current = fn
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => cb.current(), ms)
    return () => clearInterval(t)
  }, [ms, active])
}

/** Track hover on an element without re-rendering children on every mouse move. */
export function useHover<T extends HTMLElement>(): [RefCallback<T>, boolean] {
  const [hover, setHover] = useState(false)
  const nodeRef = useRef<T | null>(null)
  const enter = useCallback(() => setHover(true), [])
  const leave = useCallback(() => setHover(false), [])
  const ref = useCallback(
    (node: T | null) => {
      if (nodeRef.current) {
        nodeRef.current.removeEventListener('mouseenter', enter)
        nodeRef.current.removeEventListener('mouseleave', leave)
      }
      nodeRef.current = node
      if (node) {
        node.addEventListener('mouseenter', enter)
        node.addEventListener('mouseleave', leave)
      }
    },
    [enter, leave],
  )
  return [ref, hover]
}

/**
 * Observe an element's content width (for container-responsive layouts inside the
 * in-game browser window, where viewport media queries are misleading).
 */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const ref = useCallback((node: T | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!node) return
    setWidth(node.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w !== undefined) setWidth(Math.round(w))
    })
    ro.observe(node)
    roRef.current = ro
  }, [])
  return [ref, width]
}
