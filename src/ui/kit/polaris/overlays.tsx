// Polaris overlays: Modal, Popover, ActionList, Tooltip.
import {
  useCallback, useEffect, useId, useRef, useState,
  type KeyboardEvent, type ReactNode,
} from 'react'
import { Check, X } from 'lucide-react'
import { usePauseWhileMounted } from '../../../core/ui'
import { cx } from '../common/utils'
import { Floating, Portal, type FloatingPlacement } from '../common/Floating'
import { useLayer } from '../common/hooks'
import { Button } from './Button'
import { Badge, type BadgeTone } from './display'
import { Icon, Spinner } from './primitives'
import type { IconSource, PAction } from './shared'
import './polaris.css'
import './overlays.css'

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** hide the header bar (close with Esc / backdrop) */
  titleHidden?: boolean
  children?: ReactNode
  primaryAction?: PAction
  /** rendered left of the primary action (Cancel etc.) */
  secondaryActions?: PAction[]
  /** extra content on the left side of the footer (e.g. "Learn more" link, summary) */
  footer?: ReactNode
  size?: 'small' | 'medium' | 'large' | 'fullScreen'
  /** wrap children in one padded Modal.Section */
  sectioned?: boolean
  /** show a spinner instead of the body */
  loading?: boolean
  /** skip the entry animation */
  instant?: boolean
  /** click on the dark backdrop closes the modal (default true) */
  closeOnBackdrop?: boolean
  /** pause the game clock while open (editors/decisions) */
  pauseGame?: boolean
  /**
   * render inside the nearest positioned ancestor instead of a full-viewport portal
   * (e.g. to keep a modal inside the in-game browser window)
   */
  inline?: boolean
}

function PauseWhile({ id }: { id: string }) {
  usePauseWhileMounted(id)
  return null
}

/** Centered dialog with gray header, scrollable body and action footer. */
export function Modal({
  open, onClose, title, titleHidden, children, primaryAction, secondaryActions, footer, size = 'medium', sectioned, loading,
  instant, closeOnBackdrop = true, pauseGame, inline,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = `p-modal-title${useId().replace(/:/g, '')}`
  useLayer(open, onClose)
  useEffect(() => {
    if (open) dialogRef.current?.focus({ preventScroll: true })
  }, [open])
  if (!open) return null
  const hasFooter = !!(primaryAction || secondaryActions?.length || footer)
  const body = (
    <div
      className={cx('p-layer', 'p-modal-backdrop', inline && 'p-modal-backdrop-inline')}
      onMouseDown={e => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      {pauseGame && <PauseWhile id={`modal-${titleId}`} />}
      <div
        ref={dialogRef}
        className={cx('p-modal', size !== 'medium' && `p-modal-${size}`, instant && 'p-modal-instant')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {!titleHidden && (
          <div className="p-modal-head">
            <h2 className="p-modal-title" id={titleId}>{title}</h2>
            <Button variant="tertiary" icon={X} accessibilityLabel="Close" onClick={onClose} />
          </div>
        )}
        <div className="p-modal-body">
          {loading ? (
            <div className="p-modal-loading"><Spinner size="large" /></div>
          ) : sectioned ? (
            <div className="p-modal-section">{children}</div>
          ) : (
            children
          )}
        </div>
        {hasFooter && (
          <div className="p-modal-foot">
            {footer && <div className="p-modal-foot-left">{footer}</div>}
            <div className="p-modal-foot-actions">
              {secondaryActions?.map((a, i) => (
                <Button
                  key={a.id ?? i}
                  onClick={a.onAction}
                  disabled={a.disabled}
                  loading={a.loading}
                  icon={a.icon}
                  tone={a.destructive ? 'critical' : undefined}
                >
                  {a.content}
                </Button>
              ))}
              {primaryAction && (
                <Button
                  variant="primary"
                  tone={primaryAction.destructive ? 'critical' : undefined}
                  onClick={primaryAction.onAction}
                  disabled={primaryAction.disabled}
                  loading={primaryAction.loading}
                  icon={primaryAction.icon}
                >
                  {primaryAction.content}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
  return inline ? body : <Portal>{body}</Portal>
}
export interface ModalSectionProps {
  children?: ReactNode
  flush?: boolean
  subdued?: boolean
}
function ModalSection({ children, flush, subdued }: ModalSectionProps) {
  return <div className={cx('p-modal-section', flush && 'p-modal-section-flush', subdued && 'p-modal-section-subdued')}>{children}</div>
}
Modal.Section = ModalSection

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------
export interface PopoverProps {
  /** open state (controlled) */
  active: boolean
  /** the element that toggles the popover (usually a Button with `disclosure`) */
  activator: ReactNode
  onClose: () => void
  children?: ReactNode
  /** horizontal alignment relative to the activator (default left) */
  preferredAlignment?: 'left' | 'center' | 'right'
  /** vertical side (default below; flips automatically) */
  preferredPosition?: 'below' | 'above'
  /** popover at least as wide as the activator */
  fullWidth?: boolean
  /** activator wrapper spans the full width */
  activatorFullWidth?: boolean
  /** pad the content (12px) */
  sectioned?: boolean
  /** allow wide content (no 480px cap) */
  fluidContent?: boolean
  /** scroll cap for long lists (default 420px) */
  maxHeight?: number
  minWidth?: number
  zIndex?: number
}
/**
 * Floating panel anchored to an activator (portal; never clipped by tables or cards).
 *
 *   <Popover active={open} onClose={() => setOpen(false)}
 *     activator={<Button disclosure onClick={() => setOpen(o => !o)}>More actions</Button>}>
 *     <ActionList items={[…]} onActionAnyItem={() => setOpen(false)} />
 *   </Popover>
 */
export function Popover({
  active, activator, onClose, children, preferredAlignment = 'left', preferredPosition = 'below', fullWidth, activatorFullWidth,
  sectioned, fluidContent, maxHeight = 420, minWidth, zIndex,
}: PopoverProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const side = preferredPosition === 'above' ? 'top' : 'bottom'
  const align = preferredAlignment === 'left' ? '-start' : preferredAlignment === 'right' ? '-end' : ''
  return (
    <>
      <span ref={anchor} className={cx('p-popover-activator', activatorFullWidth && 'p-popover-activator-full')}>
        {activator}
      </span>
      <Floating
        anchor={anchor}
        open={active}
        onClose={onClose}
        placement={`${side}${align}` as FloatingPlacement}
        matchWidth={fullWidth}
        className="p-layer"
        zIndex={zIndex}
      >
        <div
          className={cx('p-popover', sectioned && 'p-popover-sectioned', fluidContent && 'p-popover-fluid')}
          style={{ minWidth }}
          role="dialog"
        >
          <div className="p-popover-scroll" style={{ maxHeight }}>{children}</div>
        </div>
      </Floating>
    </>
  )
}
function PopoverSection({ children }: { children?: ReactNode }) {
  return <div className="p-popover-section">{children}</div>
}
Popover.Section = PopoverSection

// ---------------------------------------------------------------------------
// ActionList
// ---------------------------------------------------------------------------
export interface ActionListItem {
  content: ReactNode
  onAction?: () => void
  icon?: IconSource
  /** custom leading node (e.g. Thumbnail/Avatar) */
  prefix?: ReactNode
  suffix?: ReactNode
  helpText?: ReactNode
  badge?: { content: ReactNode; tone?: BadgeTone }
  destructive?: boolean
  disabled?: boolean
  /** highlighted as the current choice */
  active?: boolean
  /** show a check mark column (selection menus); `active` items get the check */
  checkable?: boolean
  id?: string
  accessibilityLabel?: string
}
export interface ActionListSection {
  title?: string
  items: ActionListItem[]
}
export interface ActionListProps {
  items?: ActionListItem[]
  sections?: ActionListSection[]
  /** called after any item's action — typically closes the parent popover */
  onActionAnyItem?: () => void
}
/** Menu of actions (inside a Popover). Arrow keys move between items. */
export function ActionList({ items, sections, onActionAnyItem }: ActionListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const all: ActionListSection[] = [...(items?.length ? [{ items }] : []), ...(sections ?? [])]
  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const btns = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button.p-action:not(:disabled)') ?? [])
    if (!btns.length) return
    e.preventDefault()
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length
    btns[next].focus()
  }, [])
  return (
    <div className="p-actionlist" ref={listRef} role="menu" onKeyDown={onKey}>
      {all.map((sec, si) => (
        <div key={si} className="p-actionlist-section">
          {sec.title && <div className="p-actionlist-title">{sec.title}</div>}
          <ul className="p-actionlist-items">
            {sec.items.map((it, ii) => (
              <li key={it.id ?? ii} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={cx('p-action', it.destructive && 'p-action-destructive', it.active && 'p-action-active')}
                  disabled={it.disabled}
                  aria-label={it.accessibilityLabel}
                  aria-checked={it.checkable ? !!it.active : undefined}
                  onClick={() => {
                    it.onAction?.()
                    onActionAnyItem?.()
                  }}
                >
                  {it.checkable && <span className="p-action-check">{it.active && <Check size={16} strokeWidth={2} />}</span>}
                  {it.prefix && <span className="p-action-prefix">{it.prefix}</span>}
                  {!it.prefix && it.icon && <Icon source={it.icon} tone={it.destructive ? 'critical' : 'base'} />}
                  <span className="p-action-text">
                    <span className="p-action-content">{it.content}</span>
                    {it.helpText && <span className="p-action-help">{it.helpText}</span>}
                  </span>
                  {it.badge && <Badge tone={it.badge.tone}>{it.badge.content}</Badge>}
                  {it.suffix && <span className="p-action-suffix">{it.suffix}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  preferredPosition?: 'above' | 'below' | 'left' | 'right'
  /** wider bubble for definitions (320px) */
  width?: 'default' | 'wide'
  /** extra padding for multi-line help */
  padding?: 'default' | 'loose'
  /** dotted underline on the activator (analytics metric titles) */
  hasUnderline?: boolean
  /** ms before showing (default 250) */
  hoverDelay?: number
  /** force open (for demos) */
  active?: boolean
  /** activator as block-level flex */
  block?: boolean
  zIndex?: number
}
/** Hover/focus tooltip (white bubble, Polaris 12 style). */
export function Tooltip({
  content, children, preferredPosition = 'above', width = 'default', padding = 'default', hasUnderline, hoverDelay = 250, active,
  block, zIndex = 5400,
}: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  const show = () => {
    clear()
    timer.current = setTimeout(() => setOpen(true), hoverDelay)
  }
  const hide = () => {
    clear()
    setOpen(false)
  }
  const placement: FloatingPlacement =
    preferredPosition === 'below' ? 'bottom' : preferredPosition === 'left' ? 'left' : preferredPosition === 'right' ? 'right' : 'top'
  if (content === null || content === undefined || content === '') return <>{children}</>
  return (
    <>
      <span
        ref={anchor}
        className={cx('p-tooltip-activator', block && 'p-tooltip-activator-block', hasUnderline && 'p-tooltip-dotted')}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      <Floating anchor={anchor} open={active ?? open} placement={placement} offset={6} className="p-layer" passive zIndex={zIndex}>
        <div className={cx('p-tooltip', width === 'wide' && 'p-tooltip-wide', padding === 'loose' && 'p-tooltip-padded')} role="tooltip">
          {content}
        </div>
      </Floating>
    </>
  )
}
