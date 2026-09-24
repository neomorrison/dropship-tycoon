// Polaris Page (title bar with back arrow, badges, actions), Tabs, ContextualSaveBar.
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Ellipsis, TriangleAlert } from 'lucide-react'
import { cx } from '../common/utils'
import { useElementWidth } from '../common/hooks'
import { Button } from './Button'
import { ActionList, Popover, Tooltip, type ActionListItem } from './overlays'
import { Icon } from './primitives'
import type { PAction } from './shared'
import './polaris.css'
import './forms.css'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export interface PageProps {
  title?: ReactNode
  /** badge(s) next to the title, e.g. <Badge tone="success">Active</Badge> */
  titleMetadata?: ReactNode
  subtitle?: ReactNode
  /** back arrow button left of the title (e.g. back to Products) */
  backAction?: { content?: string; onAction: () => void }
  primaryAction?: PAction
  /**
   * secondary actions render as tertiary buttons; when there are more than
   * `maxVisibleSecondary` (default 3) the rest collapse into "More actions".
   */
  secondaryActions?: PAction[]
  /** grouped dropdown actions, e.g. [{ title: 'More actions', actions: […] }] */
  actionGroups?: { title: string; actions: PAction[] }[]
  maxVisibleSecondary?: number
  /** ‹ › record pagination (order detail) */
  pagination?: { hasPrevious?: boolean; hasNext?: boolean; onPrevious?: () => void; onNext?: () => void }
  /** remove the 998px max width (analytics, reports) */
  fullWidth?: boolean
  /** 662px column (settings, onboarding) */
  narrowWidth?: boolean
  children?: ReactNode
  className?: string
}

const toItems = (acts: PAction[]): ActionListItem[] =>
  acts.map(a => ({ content: a.content, onAction: a.onAction, icon: a.icon, destructive: a.destructive, disabled: a.disabled, helpText: a.helpText }))

function ActionMenu({ title, actions, iconOnly }: { title: string; actions: PAction[]; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      active={open}
      onClose={() => setOpen(false)}
      preferredAlignment="right"
      activator={
        iconOnly ? (
          <Button variant="tertiary" icon={Ellipsis} accessibilityLabel={title} pressed={open} onClick={() => setOpen(o => !o)} />
        ) : (
          <Button variant="tertiary" disclosure={open ? 'up' : 'down'} onClick={() => setOpen(o => !o)}>
            {title}
          </Button>
        )
      }
    >
      <ActionList items={toItems(actions)} onActionAnyItem={() => setOpen(false)} />
    </Popover>
  )
}

/**
 * Admin page frame: back arrow, 20px bold title, metadata badges, secondary actions and a
 * dark primary action; children stack with 16px gaps (use Layout inside for columns).
 */
export function Page({
  title, titleMetadata, subtitle, backAction, primaryAction, secondaryActions = [], actionGroups = [], maxVisibleSecondary = 3,
  pagination, fullWidth, narrowWidth, children, className,
}: PageProps) {
  // measured, not media-queried: sites render inside the in-game browser window / phone frame
  const [pageRef, pageWidth] = useElementWidth<HTMLDivElement>()
  const compact = pageWidth > 0 && pageWidth < 640
  const visible = compact ? [] : secondaryActions.slice(0, maxVisibleSecondary)
  const overflow = compact ? [...secondaryActions, ...actionGroups.flatMap(g => g.actions)] : secondaryActions.slice(maxVisibleSecondary)
  const groups = compact ? [] : actionGroups
  const hasHeader = Boolean(title || backAction || primaryAction || secondaryActions.length || actionGroups.length)
  return (
    <div ref={pageRef} className={cx('p-page', fullWidth && 'p-page-full', narrowWidth && 'p-page-narrow', compact && 'p-page-compact', className)}>
      {hasHeader && (
        <div className="p-page-header">
          {backAction && (
            <span className="p-page-back">
              <Tooltip content={backAction.content ?? 'Back'} preferredPosition="below">
                <Button variant="tertiary" icon={ArrowLeft} accessibilityLabel={backAction.content ?? 'Back'} onClick={backAction.onAction} />
              </Tooltip>
            </span>
          )}
          <div className="p-page-titlewrap">
            <div className="p-page-titlerow">
              {title && <h1 className="p-page-title">{title}</h1>}
              {titleMetadata}
            </div>
            {subtitle && <div className="p-page-subtitle">{subtitle}</div>}
          </div>
          <div className="p-page-actions">
            {(visible.length > 0 || overflow.length > 0 || groups.length > 0) && (
              <div className="p-page-secondary">
                {visible.map((a, i) => {
                  const btn = (
                    <Button
                      key={a.id ?? i}
                      variant="tertiary"
                      icon={a.icon}
                      disabled={a.disabled}
                      loading={a.loading}
                      tone={a.destructive ? 'critical' : undefined}
                      onClick={a.onAction}
                      accessibilityLabel={a.accessibilityLabel}
                    >
                      {a.content}
                    </Button>
                  )
                  return a.helpText ? <Tooltip key={a.id ?? i} content={a.helpText}>{btn}</Tooltip> : btn
                })}
                {groups.map(g => <ActionMenu key={g.title} title={g.title} actions={g.actions} />)}
                {overflow.length > 0 && <ActionMenu title="More actions" actions={overflow} iconOnly={compact} />}
              </div>
            )}
            {pagination && (
              <div className="p-page-pagination">
                <Button icon={ChevronLeft} size="slim" accessibilityLabel="Previous" disabled={!pagination.hasPrevious} onClick={pagination.onPrevious} />
                <Button icon={ChevronRight} size="slim" accessibilityLabel="Next" disabled={!pagination.hasNext} onClick={pagination.onNext} />
              </div>
            )}
            {primaryAction && (
              <Button
                variant="primary"
                tone={primaryAction.destructive ? 'critical' : undefined}
                icon={primaryAction.icon}
                disabled={primaryAction.disabled}
                loading={primaryAction.loading}
                onClick={primaryAction.onAction}
              >
                {primaryAction.content}
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="p-page-body">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export interface TabDescriptor {
  id: string
  content: ReactNode
  /** count bubble, e.g. unfulfilled orders */
  badge?: ReactNode
  disabled?: boolean
  accessibilityLabel?: string
}
export interface TabsProps {
  tabs: TabDescriptor[]
  /** index of the selected tab */
  selected: number
  onSelect: (index: number) => void
  /** stretch tabs to equal widths */
  fitted?: boolean
  /** 'pill' (default, admin index-filter look) or 'underline' (classic) */
  variant?: 'pill' | 'underline'
  /** bottom border under the tab row */
  bordered?: boolean
  /** panel content rendered below */
  children?: ReactNode
  className?: string
}
/** Tab row. `<Tabs tabs={[{id:'all',content:'All'}]} selected={i} onSelect={setI} />` */
export function Tabs({ tabs, selected, onSelect, fitted, variant = 'pill', bordered, children, className }: TabsProps) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    let i = selected
    for (let n = 0; n < tabs.length; n++) {
      i = (i + dir + tabs.length) % tabs.length
      if (!tabs[i].disabled) break
    }
    onSelect(i)
  }
  return (
    <div className={cx('p-tabs', fitted && 'p-tabs-fitted', variant === 'underline' && 'p-tabs-underline', className)}>
      <div className={cx('p-tabs-list', (bordered ?? variant === 'underline') && 'p-tabs-list-bordered')} role="tablist" onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`p-tab-${t.id}`}
            aria-selected={i === selected}
            aria-label={t.accessibilityLabel}
            tabIndex={i === selected ? 0 : -1}
            disabled={t.disabled}
            className={cx('p-tab', i === selected && 'p-tab-selected')}
            onClick={() => onSelect(i)}
          >
            {t.content}
            {t.badge !== undefined && t.badge !== null && <span className="p-tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      {children !== undefined && (
        <div className="p-tabs-panel" role="tabpanel" aria-labelledby={tabs[selected] ? `p-tab-${tabs[selected].id}` : undefined}>
          {children}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ContextualSaveBar
// ---------------------------------------------------------------------------
export interface ContextualSaveBarProps {
  /** show/hide (renders nothing when false) */
  visible?: boolean
  /** e.g. "Unsaved product" / "Unsaved changes" */
  message?: ReactNode
  saveAction: { onAction: () => void; content?: string; loading?: boolean; disabled?: boolean }
  discardAction: { onAction: () => void; content?: string; disabled?: boolean }
  /**
   * 'sticky' (default): sticks to the top of the scrolling admin content.
   * 'overlay': absolute over the nearest positioned ancestor's top edge — put it in the
   *   admin top bar container (position: relative) to replace it, like Shopify.
   * 'fixed': top of the viewport. 'inline': a rounded bar in normal flow.
   */
  placement?: 'sticky' | 'overlay' | 'fixed' | 'inline'
}
/** Dark "Unsaved changes — Discard / Save" bar shown while a form is dirty. */
export function ContextualSaveBar({ visible = true, message = 'Unsaved changes', saveAction, discardAction, placement = 'sticky' }: ContextualSaveBarProps) {
  if (!visible) return null
  return (
    <div className={cx('p-csb', `p-csb-${placement}`)} role="region" aria-label="Unsaved changes">
      <div className="p-csb-msg">
        <Icon source={TriangleAlert} tone="inherit" size={20} />
        <span>{message}</span>
      </div>
      <div className="p-csb-actions">
        <Button className="p-btn-csb-discard" onClick={discardAction.onAction} disabled={discardAction.disabled}>
          {discardAction.content ?? 'Discard'}
        </Button>
        <Button className="p-btn-csb-save" onClick={saveAction.onAction} loading={saveAction.loading} disabled={saveAction.disabled}>
          {saveAction.content ?? 'Save'}
        </Button>
      </div>
    </div>
  )
}
