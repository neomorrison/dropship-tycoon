// Storefront overlays (cart drawer, size guide) pinned to the visible part of whatever
// scrolls the storefront: the in-game browser tab or the Theme Editor preview pane.
// A zero-height sticky anchor at the top of .st-root holds a backdrop sized to the
// scroll container, so overlays never escape the store into the rest of the game UI.
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type ShowOverlay = (node: ReactNode | null) => void
export const OverlayCtx = createContext<ShowOverlay | null>(null)

/** Show a dialog in the storefront overlay layer (null closes it). */
export const useStoreOverlay = () => useContext(OverlayCtx)

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null
  while (p) {
    const st = getComputedStyle(p)
    if (/(auto|scroll|overlay)/.test(st.overflowY)) return p
    p = p.parentElement
  }
  return null
}

export function OverlayHost({ content, onClose }: { content: ReactNode | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(640)
  useLayoutEffect(() => {
    const sp = scrollParent(ref.current)
    const update = () => setHeight(sp ? sp.clientHeight : window.innerHeight)
    update()
    if (!sp || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(sp)
    return () => ro.disconnect()
  }, [content != null])
  return (
    <div ref={ref} className="st-overlay-anchor">
      {content != null && (
        <div className="st-drawer-backdrop" style={{ height }} onClick={onClose}>
          <div className="st-overlay-content" onClick={e => e.stopPropagation()}>{content}</div>
        </div>
      )}
    </div>
  )
}
