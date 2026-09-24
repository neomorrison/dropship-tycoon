// Portal-based floating layer (popovers, menus, tooltips). Rendered into
// document.body with fixed positioning so it is never clipped by scroll
// containers (tables, cards, the in-game browser window).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useLayer } from './hooks'
import './common.css'

export type FloatingPlacement =
  | 'bottom-start' | 'bottom' | 'bottom-end'
  | 'top-start' | 'top' | 'top-end'
  | 'right-start' | 'right' | 'left-start' | 'left'

export interface FloatingProps {
  /** element the layer is positioned against */
  anchor: RefObject<HTMLElement | null>
  open: boolean
  /** called on outside click / Escape (omit for non-dismissable layers like hover tooltips) */
  onClose?: () => void
  placement?: FloatingPlacement
  /** gap between anchor and layer in px (default 4) */
  offset?: number
  /** force min-width = anchor width */
  matchWidth?: boolean
  className?: string
  style?: CSSProperties
  /** z-index (default 5200: above kit modals & drawers) */
  zIndex?: number
  /** register as an Escape layer and close on outside click (default true when onClose is set) */
  dismissable?: boolean
  children: ReactNode
  role?: string
  /** pointer events pass through (tooltips) */
  passive?: boolean
}

interface Pos { top: number; left: number; placement: FloatingPlacement }

const MARGIN = 8

function compute(anchor: DOMRect, el: { width: number; height: number }, placement: FloatingPlacement, offset: number): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let [side, align] = placement.split('-') as [string, string | undefined]
  // flip vertically / horizontally if not enough space
  if (side === 'bottom' && anchor.bottom + offset + el.height > vh - MARGIN && anchor.top - offset - el.height > MARGIN) side = 'top'
  else if (side === 'top' && anchor.top - offset - el.height < MARGIN && anchor.bottom + offset + el.height < vh - MARGIN) side = 'bottom'
  if (side === 'right' && anchor.right + offset + el.width > vw - MARGIN && anchor.left - offset - el.width > MARGIN) side = 'left'
  else if (side === 'left' && anchor.left - offset - el.width < MARGIN) side = 'right'

  let top = 0
  let left = 0
  if (side === 'bottom' || side === 'top') {
    top = side === 'bottom' ? anchor.bottom + offset : anchor.top - offset - el.height
    if (align === 'start') left = anchor.left
    else if (align === 'end') left = anchor.right - el.width
    else left = anchor.left + anchor.width / 2 - el.width / 2
  } else {
    left = side === 'right' ? anchor.right + offset : anchor.left - offset - el.width
    if (align === 'start') top = anchor.top
    else top = anchor.top + anchor.height / 2 - el.height / 2
  }
  left = Math.max(MARGIN, Math.min(left, vw - el.width - MARGIN))
  top = Math.max(MARGIN, Math.min(top, vh - el.height - MARGIN))
  return { top, left, placement: (align ? `${side}-${align}` : side) as FloatingPlacement }
}

/** Low-level positioned layer. Kits build Popover / Menu / Tooltip on top of this. */
export function Floating({
  anchor, open, onClose, placement = 'bottom-start', offset = 4, matchWidth, className, style, zIndex = 5200,
  dismissable, children, role, passive,
}: FloatingProps) {
  const ref = useRef<HTMLDivElement>(null)
  const insideRef = useRef(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const [minW, setMinW] = useState<number | undefined>(undefined)
  const canDismiss = (dismissable ?? !!onClose) && !!onClose

  const update = useCallback(() => {
    const a = anchor.current
    const el = ref.current
    if (!a || !el) return
    const r = a.getBoundingClientRect()
    if (matchWidth) setMinW(r.width)
    setPos(compute(r, { width: el.offsetWidth, height: el.offsetHeight }, placement, offset))
  }, [anchor, placement, offset, matchWidth])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    update()
    // second pass after content (fonts/images) settles
    const raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [open, update])

  useEffect(() => {
    if (!open) return
    const onScroll = () => update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(() => update())
      ro.observe(ref.current)
    }
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      ro?.disconnect()
    }
  }, [open, update])

  // outside click: React events bubble through portals, so clicks inside nested
  // floating layers mark insideRef before this native listener runs.
  useEffect(() => {
    if (!open || !canDismiss) return
    const onDown = (e: PointerEvent) => {
      if (insideRef.current) {
        insideRef.current = false
        return
      }
      const t = e.target as Node | null
      if (t && (anchor.current?.contains(t) || ref.current?.contains(t))) return
      onClose?.()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, canDismiss, anchor, onClose])

  useLayer(open && canDismiss, onClose)

  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={ref}
      role={role}
      className={`kx-floating${passive ? ' kx-floating-passive' : ''}${className ? ` ${className}` : ''}`}
      data-placement={pos?.placement ?? placement}
      onPointerDown={() => {
        insideRef.current = true
      }}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        zIndex,
        minWidth: minW,
        // opacity (not visibility) while measuring, so autoFocus inside the layer still works
        opacity: pos ? undefined : 0,
        pointerEvents: pos ? undefined : 'none',
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Render children into document.body (modals, drawers). */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
