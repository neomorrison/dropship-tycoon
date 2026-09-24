// Overlay host for the life sites' dialogs. Renders into the browser tab's viewport (the non-scrolling
// parent of .sh-tabview) so a dialog covers exactly the visible page, in the desktop browser and in the
// phone frame alike. Registers with the kit layer stack so Escape closes the dialog, not the computer.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLayer } from '../../kit/common'
import { usePauseWhileMounted } from '../../../core/ui'

export interface SiteLayerProps {
  /** wrapper class; include the site root class (e.g. "bk-layer") so the site's CSS variables apply */
  className: string
  onClose: () => void
  /** pause key while the dialog is open (player is making a decision) */
  pauseKey?: string
  children: ReactNode
}

export function SiteLayer({ className, onClose, pauseKey, children }: SiteLayerProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const tab = anchor.current?.closest('.sh-tabview') as HTMLElement | null
    setHost(tab?.parentElement ?? document.body)
    return () => setHost(null)
  }, [])
  useLayer(true, onClose)
  usePauseWhileMounted(pauseKey ?? 'life-site-dialog', !!pauseKey)
  const fixed = host === document.body
  return (
    <>
      <span ref={anchor} style={{ display: 'none' }} />
      {host &&
        createPortal(
          <div
            className={className}
            style={{ position: fixed ? 'fixed' : 'absolute', inset: 0, zIndex: 40 }}
            onMouseDown={e => {
              if (e.target === e.currentTarget) onClose()
            }}
          >
            {children}
          </div>,
          host,
        )}
    </>
  )
}
