// Ads Manager overlays: dropdown menu, modal dialog, right-side edit drawer.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { usePauseWhileMounted } from '../../../core/ui'
import { cx } from '../common/utils'
import { Floating, Portal, type FloatingPlacement } from '../common/Floating'
import { useLayer } from '../common/hooks'
import { renderIcon, type IconSource } from '../common/icon'
import { amThemeClass, useAmTheme, type AmTheme } from './theme'
import { AmTooltip } from './controls'
import './adsmanager.css'

// ---------------------------------------------------------------------------
// AmMenu
// ---------------------------------------------------------------------------
export interface AmMenuItem {
  id: string
  label: ReactNode
  description?: ReactNode
  icon?: IconSource
  /** show a check mark (radio-like menus) */
  checked?: boolean
  danger?: boolean
  disabled?: boolean
  /** tooltip explaining why an item is disabled (e.g. "Unlocks at Media buying level 3") */
  disabledReason?: ReactNode
  /** right-aligned hint text */
  suffix?: ReactNode
  onSelect?: () => void
}
export interface AmMenuSection {
  title?: ReactNode
  items: AmMenuItem[]
}
export interface AmMenuProps {
  /** the clickable element that opens the menu (usually an AmButton with `caret`) */
  trigger: ReactNode
  items?: AmMenuItem[]
  sections?: AmMenuSection[]
  /** custom content instead of items (filters, forms) */
  children?: ReactNode
  header?: ReactNode
  footer?: ReactNode
  placement?: FloatingPlacement
  /** min menu width in px */
  width?: number
  /** reserve a check column so labels align (radio menus) */
  checkable?: boolean
  closeOnSelect?: boolean
  /** controlled open state */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  /** no max-width / max-height caps (date pickers, wide filter panels) */
  fluid?: boolean
  theme?: AmTheme
}
/**
 * Dropdown menu anchored to a trigger.
 *   <AmMenu trigger={<AmButton caret>Reports</AmButton>} items={[{ id:'x', label:'Export table', onSelect }]} />
 */
export function AmMenu({
  trigger, items, sections, children, header, footer, placement = 'bottom-start', width, checkable, closeOnSelect = true, open: openProp,
  onOpenChange, disabled, fluid, theme,
}: AmMenuProps) {
  const t = useAmTheme(theme)
  const anchor = useRef<HTMLSpanElement>(null)
  const [inner, setInner] = useState(false)
  const open = openProp ?? inner
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setInner(v)
    onOpenChange?.(v)
  }
  const all: AmMenuSection[] = [...(items?.length ? [{ items }] : []), ...(sections ?? [])]
  const hasCheck = checkable ?? all.some(s => s.items.some(i => i.checked !== undefined))
  return (
    <>
      <span
        ref={anchor}
        style={{ display: 'inline-flex' }}
        onClick={() => {
          if (!disabled) setOpen(!open)
        }}
      >
        {trigger}
      </span>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} placement={placement} className={amThemeClass(t)}>
        <div className={cx('am-menu', fluid && 'am-menu-fluid')} role="menu" style={{ minWidth: width }}>
          {header && <div className="am-menu-header">{header}</div>}
          <div className="am-menu-scroll">
            {children}
            {all.map((sec, si) => (
              <div key={si} className="am-menu-section">
                {sec.title && <div className="am-menu-title">{sec.title}</div>}
                {sec.items.map(it => {
                  const btn = (
                    <button
                      key={it.id}
                      type="button"
                      role={hasCheck ? 'menuitemradio' : 'menuitem'}
                      aria-checked={hasCheck ? !!it.checked : undefined}
                      disabled={it.disabled}
                      className={cx('am-menu-item', it.checked && 'am-menu-item-on', it.danger && 'am-menu-item-danger')}
                      onClick={() => {
                        it.onSelect?.()
                        if (closeOnSelect) setOpen(false)
                      }}
                    >
                      {hasCheck && <span className="am-menu-item-check">{it.checked && <Check size={16} strokeWidth={2.5} />}</span>}
                      {it.icon && <span className="am-menu-item-icon">{renderIcon(it.icon, 16, 2)}</span>}
                      <span className="am-menu-item-text">
                        <span>{it.label}</span>
                        {it.description && <span className="am-menu-item-desc">{it.description}</span>}
                      </span>
                      {it.suffix && <span className="am-menu-item-suffix">{it.suffix}</span>}
                    </button>
                  )
                  return it.disabled && it.disabledReason ? (
                    <AmTooltip key={it.id} content={it.disabledReason} placement="right" block theme={t}>{btn}</AmTooltip>
                  ) : (
                    btn
                  )
                })}
              </div>
            ))}
          </div>
          {footer && <div className="am-menu-footer">{footer}</div>}
        </div>
      </Floating>
    </>
  )
}

// ---------------------------------------------------------------------------
// AmModal
// ---------------------------------------------------------------------------
export interface AmModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  /** footer buttons (right side) */
  footer?: ReactNode
  /** footer left side (hints, "Save as preset") */
  footerLeft?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** body without padding */
  flush?: boolean
  closeOnScrim?: boolean
  /** render inside the nearest positioned ancestor instead of a portal */
  inline?: boolean
  /** pause the game clock while open */
  pauseGame?: boolean
  theme?: AmTheme
}
function Pause({ id }: { id: string }) {
  usePauseWhileMounted(id)
  return null
}
/** Centered dialog (objective picker, customize columns, confirmations). */
export function AmModal({
  open, onClose, title, subtitle, children, footer, footerLeft, size = 'md', flush, closeOnScrim = true, inline, pauseGame, theme,
}: AmModalProps) {
  const t = useAmTheme(theme)
  const ref = useRef<HTMLDivElement>(null)
  useLayer(open, onClose)
  useEffect(() => {
    if (open) ref.current?.focus({ preventScroll: true })
  }, [open])
  if (!open) return null
  const node = (
    <div
      className={cx(amThemeClass(t), 'am-scrim', inline && 'am-scrim-inline')}
      onMouseDown={e => {
        if (closeOnScrim && e.target === e.currentTarget) onClose()
      }}
    >
      {pauseGame && <Pause id="am-modal" />}
      <div ref={ref} className={cx('am-modal', size !== 'md' && `am-modal-${size}`)} role="dialog" aria-modal="true" tabIndex={-1}>
        {(title || subtitle) && (
          <div className="am-modal-head">
            <div className="am-modal-titles">
              {title && <h2 className="am-modal-title">{title}</h2>}
              {subtitle && <span className="am-modal-sub">{subtitle}</span>}
            </div>
            <button type="button" className="am-x" aria-label="Close" onClick={onClose}><X size={18} strokeWidth={2} /></button>
          </div>
        )}
        <div className={cx('am-modal-body', flush && 'am-modal-body-flush')}>{children}</div>
        {(footer || footerLeft) && (
          <div className="am-modal-foot">
            <div className="am-modal-foot-left">{footerLeft}</div>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
  return inline ? node : <Portal>{node}</Portal>
}

// ---------------------------------------------------------------------------
// SideDrawer
// ---------------------------------------------------------------------------
export interface SideDrawerProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  /** buttons next to the close button (e.g. View charts) */
  headerActions?: ReactNode
  /** optional tab strip under the header */
  tabs?: { id: string; label: ReactNode }[]
  activeTab?: string
  onTabChange?: (id: string) => void
  children?: ReactNode
  /** sticky footer (Close / Publish) */
  footer?: ReactNode
  footerLeft?: ReactNode
  /** px (default 560, capped to the viewport) */
  width?: number
  /** white body instead of the canvas-gray section background */
  plain?: boolean
  /** dim the page behind (default true) */
  scrim?: boolean
  /** position inside the nearest positioned ancestor (the in-game browser) instead of the viewport */
  inline?: boolean
  pauseGame?: boolean
  theme?: AmTheme
}
/** Right-side edit panel (campaign / ad set / ad editing). */
export function SideDrawer({
  open, onClose, title, subtitle, headerActions, tabs, activeTab, onTabChange, children, footer, footerLeft, width = 560, plain,
  scrim = true, inline, pauseGame, theme,
}: SideDrawerProps) {
  const t = useAmTheme(theme)
  const ref = useRef<HTMLDivElement>(null)
  useLayer(open, onClose)
  useEffect(() => {
    if (open) ref.current?.focus({ preventScroll: true })
  }, [open])
  if (!open) return null
  const node = (
    <div className={amThemeClass(t)} style={{ display: 'contents' }}>
      {pauseGame && <Pause id="am-drawer" />}
      {scrim && <div className={cx('am-drawer-scrim', inline && 'am-drawer-scrim-inline')} onMouseDown={onClose} />}
      <aside
        ref={ref}
        className={cx('am-drawer', inline && 'am-drawer-inline')}
        style={{ width: `min(${width}px, 100%)` }}
        role="dialog"
        aria-modal={scrim}
        tabIndex={-1}
      >
        <div className="am-drawer-head">
          <div className="am-drawer-titles">
            {title && <h2 className="am-drawer-title">{title}</h2>}
            {subtitle && <span className="am-drawer-sub">{subtitle}</span>}
          </div>
          <div className="am-drawer-actions">
            {headerActions}
            <button type="button" className="am-x" aria-label="Close" onClick={onClose}><X size={18} strokeWidth={2} /></button>
          </div>
        </div>
        {tabs && tabs.length > 0 && (
          <div className="am-drawer-tabs" role="tablist">
            {tabs.map(tb => (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={tb.id === activeTab}
                className={cx('am-drawer-tab', tb.id === activeTab && 'am-drawer-tab-on')}
                onClick={() => onTabChange?.(tb.id)}
              >
                {tb.label}
              </button>
            ))}
          </div>
        )}
        <div className={cx('am-drawer-body', plain && 'am-drawer-body-plain')}>{children}</div>
        {(footer || footerLeft) && (
          <div className="am-drawer-foot">
            <div className="am-drawer-foot-left">{footerLeft}</div>
            {footer}
          </div>
        )}
      </aside>
    </div>
  )
  return inline ? node : <Portal>{node}</Portal>
}
