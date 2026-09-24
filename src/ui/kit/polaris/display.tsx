// Polaris display components: Badge, Tag, Banner, Thumbnail, Avatar, ProgressBar,
// Skeletons, EmptyState, DropZone, Pagination.
import { type CSSProperties, type ReactNode } from 'react'
import {
  ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Image as ImageIcon, Info, OctagonAlert, TriangleAlert, User, X,
} from 'lucide-react'
import { cx, initials, tileColor } from '../common/utils'
import { ImageWithFallback } from '../common/ImageWithFallback'
import { EmptyArt, type EmptyArtKind } from '../common/EmptyArt'
import { Button } from './Button'
import { renderIcon, type IconSource, type PAction } from './shared'
import './polaris.css'

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
export type BadgeTone =
  | 'neutral' | 'info' | 'success' | 'attention' | 'warning' | 'critical' | 'new' | 'magic' | 'read-only' | 'enabled'
  | 'info-strong' | 'success-strong' | 'attention-strong' | 'warning-strong' | 'critical-strong'
export type BadgeProgress = 'incomplete' | 'partiallyComplete' | 'complete'

export interface BadgeProps {
  children?: ReactNode
  /** color; omitted = default gray */
  tone?: BadgeTone
  /**
   * status circle before the label, like order badges:
   * Paid (complete) · Payment pending (partiallyComplete) · Unfulfilled (incomplete)
   */
  progress?: BadgeProgress
  icon?: IconSource
  size?: 'medium' | 'large'
  className?: string
  title?: string
}

function ProgressGlyph({ progress }: { progress: BadgeProgress }) {
  // 16px Polaris-style status circles
  if (progress === 'complete') {
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="5" fill="currentColor" />
      </svg>
    )
  }
  if (progress === 'partiallyComplete') {
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 5.6a4.4 4.4 0 0 1 0 8.8z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />
    </svg>
  )
}

/** Status pill. `<Badge tone="success" progress="complete">Paid</Badge>` */
export function Badge({ children, tone, progress, icon, size = 'medium', className, title }: BadgeProps) {
  const hasIcon = !!progress || !!icon
  return (
    <span
      className={cx('p-badge', tone && `p-badge-${tone}`, size === 'large' && 'p-badge-large', hasIcon && 'p-badge-withicon', className)}
      title={title}
    >
      {progress && <span className="p-badge-icon"><ProgressGlyph progress={progress} /></span>}
      {!progress && icon && <span className="p-badge-icon">{renderIcon(icon, 14, 2)}</span>}
      {children !== undefined && <span className="p-badge-text">{children}</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------
export interface TagProps {
  children: ReactNode
  /** shows an × button */
  onRemove?: () => void
  onClick?: () => void
  disabled?: boolean
  accessibilityLabel?: string
}
/** Removable tag chip (product tags, filters). */
export function Tag({ children, onRemove, onClick, disabled, accessibilityLabel }: TagProps) {
  return (
    <span className={cx('p-tag', !onRemove && 'p-tag-plain', onClick && 'p-tag-click')} onClick={disabled ? undefined : onClick}>
      <span className="p-tag-text">{children}</span>
      {onRemove && !disabled && (
        <button
          type="button"
          className="p-tag-remove"
          aria-label={accessibilityLabel ?? `Remove ${typeof children === 'string' ? children : 'tag'}`}
          onClick={e => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
export type BannerTone = 'info' | 'success' | 'warning' | 'critical'
export interface BannerProps {
  /** with a title: page-level banner with a bold colored header band; without: compact tinted notice */
  title?: ReactNode
  tone?: BannerTone
  children?: ReactNode
  action?: PAction
  secondaryAction?: PAction
  onDismiss?: () => void
  /** override the tone icon */
  icon?: IconSource
  /** tighter padding for use inside cards / forms */
  inline?: boolean
  className?: string
}
const BANNER_ICON: Record<BannerTone, IconSource> = {
  info: Info, success: CircleCheck, warning: TriangleAlert, critical: OctagonAlert,
}
/** Status message. `<Banner tone="warning" title="Your payouts are on hold">…</Banner>` */
export function Banner({ title, tone = 'info', children, action, secondaryAction, onDismiss, icon, inline, className }: BannerProps) {
  const ico = <span className="p-banner-icon">{renderIcon(icon ?? BANNER_ICON[tone], 18, 2)}</span>
  const actions = (action || secondaryAction) && (
    <div className="p-banner-actions">
      {action && (
        <Button onClick={action.onAction} disabled={action.disabled} loading={action.loading} icon={action.icon} tone={action.destructive ? 'critical' : undefined}>
          {action.content}
        </Button>
      )}
      {secondaryAction && (
        <Button variant="tertiary" onClick={secondaryAction.onAction} disabled={secondaryAction.disabled} icon={secondaryAction.icon}>
          {secondaryAction.content}
        </Button>
      )}
    </div>
  )
  const dismiss = onDismiss && (
    <span className="p-banner-dismiss">
      <Button variant="tertiary" size="slim" icon={X} accessibilityLabel="Dismiss notification" onClick={onDismiss} />
    </span>
  )
  const role = tone === 'critical' || tone === 'warning' ? 'alert' : 'status'
  if (title) {
    return (
      <div className={cx('p-banner', 'p-banner-titled', `p-banner-${tone}`, className)} role={role}>
        <div className="p-banner-head">
          {ico}
          <h2 className="p-banner-title">{title}</h2>
          {dismiss}
        </div>
        {(children || actions) && (
          <div className="p-banner-content">
            {children && <div className="p-banner-body">{children}</div>}
            {actions}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className={cx('p-banner', `p-banner-${tone}`, inline && 'p-banner-inline', className)} role={role}>
      {ico}
      <div className="p-banner-content">
        {children && <div className="p-banner-body">{children}</div>}
        {actions}
      </div>
      {dismiss}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------
export interface ThumbnailProps {
  /** image URL (e.g. productImage(id)), or a lucide icon for placeholder thumbnails */
  source?: string | IconSource | null
  alt: string
  size?: 'extraSmall' | 'small' | 'medium' | 'large'
  /** image fit (default cover) */
  fit?: 'cover' | 'contain'
  /** small count bubble (e.g. "+3" media) */
  count?: number
  className?: string
}
/** Bordered square product image with fallback tile. */
export function Thumbnail({ source, alt, size = 'small', fit = 'cover', count, className }: ThumbnailProps) {
  const isUrl = typeof source === 'string' || source === null || source === undefined
  return (
    <span className={cx('p-thumb', `p-thumb-${size}`, !isUrl && 'p-thumb-icon', className)} title={alt}>
      {isUrl ? (
        source ? <ImageWithFallback src={source} alt={alt} fit={fit} /> : (
          <span className="p-thumb-icon" style={{ width: '100%', height: '100%', display: 'flex' }}>
            {renderIcon(ImageIcon, size === 'extraSmall' ? 14 : size === 'small' ? 18 : 24)}
          </span>
        )
      ) : (
        renderIcon(source as IconSource, size === 'extraSmall' ? 14 : size === 'small' ? 18 : 24)
      )}
      {count !== undefined && count > 0 && <span className="p-thumb-count">+{count}</span>}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
export interface AvatarProps {
  /** person/store name (drives initials + stable color) */
  name?: string
  /** explicit initials (default: from name) */
  initials?: string
  /** image URL (e.g. portrait('p07')); falls back to initials on error */
  source?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
  /** generic person glyph instead of initials */
  customer?: boolean
  shape?: 'round' | 'square'
  className?: string
  style?: CSSProperties
}
/** Initials / photo avatar with deterministic color. */
export function Avatar({ name = '', initials: ini, source, size = 'md', customer, shape = 'round', className, style }: AvatarProps) {
  const c = tileColor(name || ini || '?')
  const label = ini ?? initials(name)
  return (
    <span
      className={cx('p-avatar', `p-avatar-${size}`, shape === 'square' && 'p-avatar-square', className)}
      style={{ background: c.bg, color: c.fg, ...style }}
      role="img"
      aria-label={name || 'Avatar'}
    >
      {source ? (
        <AvatarImg src={source} fallback={customer ? <User size="60%" strokeWidth={2} /> : label} />
      ) : customer ? (
        <User size="60%" strokeWidth={2} aria-hidden />
      ) : (
        label
      )}
    </span>
  )
}
function AvatarImg({ src, fallback }: { src: string; fallback: ReactNode }) {
  return (
    <ImageWithFallback
      src={src}
      alt=""
      fallbackLabel={typeof fallback === 'string' ? fallback : '?'}
      style={{ width: '100%', height: '100%', background: 'transparent' }}
    />
  )
}

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------
export interface ProgressBarProps {
  /** 0–100 */
  progress: number
  size?: 'small' | 'medium' | 'large'
  /** 'primary' (dark, default) · 'highlight' (blue) · 'success' · 'critical' · 'warning' */
  tone?: 'primary' | 'highlight' | 'success' | 'critical' | 'warning'
  animated?: boolean
  ariaLabel?: string
  className?: string
}
/** Horizontal progress meter. */
export function ProgressBar({ progress, size = 'medium', tone = 'primary', animated = true, ariaLabel, className }: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, progress))
  return (
    <div
      className={cx('p-progress', `p-progress-${size}`, tone !== 'primary' && `p-progress-${tone}`, !animated && 'p-progress-static', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={ariaLabel}
    >
      <div className="p-progress-fill" style={{ width: `${v}%` }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------
/** Shimmering text lines placeholder. */
export function SkeletonBodyText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="p-skel-body" aria-hidden>
      {Array.from({ length: lines }, (_, i) => <div key={i} className="p-skel p-skel-line" />)}
    </div>
  )
}
/** Shimmering heading placeholder. */
export function SkeletonDisplayText({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }) {
  return <div className={cx('p-skel', 'p-skel-display', size !== 'medium' && `p-skel-display-${size}`)} aria-hidden />
}
/** Shimmering square (thumbnail) placeholder. */
export function SkeletonThumbnail({ size = 'medium' }: { size?: 'extraSmall' | 'small' | 'medium' | 'large' }) {
  const px = size === 'extraSmall' ? 24 : size === 'small' ? 40 : size === 'medium' ? 60 : 80
  return <div className="p-skel p-skel-thumb" style={{ width: px, height: px }} aria-hidden />
}
/** Shimmering tab row placeholder. */
export function SkeletonTabs({ count = 3 }: { count?: number }) {
  return (
    <div className="p-skel-tabs" aria-hidden>
      {Array.from({ length: count }, (_, i) => <div key={i} className="p-skel p-skel-tab" />)}
    </div>
  )
}
export interface SkeletonPageProps {
  /** show a real title instead of a shimmer bar */
  title?: string
  primaryAction?: boolean
  backAction?: boolean
  /** add a 1/3 sidebar column */
  withSidebar?: boolean
  fullWidth?: boolean
  children?: ReactNode
}
/** Full loading page in the admin's layout (title bar + cards). */
export function SkeletonPage({ title, primaryAction, backAction, withSidebar = true, fullWidth, children }: SkeletonPageProps) {
  return (
    <div className={cx('p-page', fullWidth && 'p-page-full')} aria-busy="true" aria-label="Loading">
      <div className="p-page-header">
        {backAction && <div className="p-skel" style={{ width: 28, height: 28, borderRadius: 8 }} />}
        <div className="p-page-titlewrap">
          {title ? <h1 className="p-page-title">{title}</h1> : <div className="p-skel p-skel-page-title" />}
        </div>
        {primaryAction && <div className="p-skel" style={{ width: 96, height: 28, borderRadius: 8 }} />}
      </div>
      {children ?? (
        <div className="p-layout">
          <div className="p-layout-section">
            {[0, 1].map(i => (
              <div key={i} className="p-card" style={{ padding: 16 }}>
                <div className="p-skel-body">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={i ? 4 : 3} />
                </div>
              </div>
            ))}
          </div>
          {withSidebar && (
            <div className="p-layout-section p-layout-section-oneThird">
              <div className="p-card" style={{ padding: 16 }}>
                <SkeletonBodyText lines={2} />
              </div>
              <div className="p-card" style={{ padding: 16 }}>
                <SkeletonBodyText lines={4} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
export interface EmptyStateProps {
  heading?: ReactNode
  children?: ReactNode
  /** image URL, or a built-in EmptyArt illustration kind (default 'generic') */
  image?: string | EmptyArtKind
  action?: PAction
  secondaryAction?: PAction
  footerContent?: ReactNode
  /** less padding (inside cards / tables) */
  compact?: boolean
  className?: string
}
const ART_KINDS: EmptyArtKind[] = ['orders', 'products', 'search', 'chart', 'inbox', 'ads', 'customers', 'creative', 'generic']
/** Centered illustration + message + actions for empty lists. */
export function EmptyState({ heading, children, image = 'generic', action, secondaryAction, footerContent, compact, className }: EmptyStateProps) {
  const isArt = (ART_KINDS as string[]).includes(image)
  return (
    <div className={cx('p-empty', compact && 'p-empty-compact', className)}>
      <div className="p-empty-image">
        {isArt ? <EmptyArt kind={image as EmptyArtKind} size={compact ? 120 : 180} /> : <img src={image} alt="" />}
      </div>
      {(heading || children) && (
        <div className="p-empty-text">
          {heading && <h2 className="p-empty-heading">{heading}</h2>}
          {children && <div className="p-empty-body">{children}</div>}
        </div>
      )}
      {(action || secondaryAction) && (
        <div className="p-empty-actions">
          {secondaryAction && (
            <Button onClick={secondaryAction.onAction} disabled={secondaryAction.disabled} icon={secondaryAction.icon}>
              {secondaryAction.content}
            </Button>
          )}
          {action && (
            <Button variant="primary" onClick={action.onAction} disabled={action.disabled} loading={action.loading} icon={action.icon}>
              {action.content}
            </Button>
          )}
        </div>
      )}
      {footerContent && <div className="p-empty-footer">{footerContent}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DropZone (visual only — in-game media comes from galleries, not files)
// ---------------------------------------------------------------------------
export interface DropZoneProps {
  /** primary button label (default "Add media") */
  actionLabel?: string
  /** secondary plain link label (e.g. "Add from supplier") */
  secondaryLabel?: string
  hint?: ReactNode
  onClick?: () => void
  onSecondary?: () => void
  disabled?: boolean
  minHeight?: number
  children?: ReactNode
}
/** Dashed "Add media" target used in the product editor's Media card. */
export function DropZone({ actionLabel = 'Add media', secondaryLabel, hint, onClick, onSecondary, disabled, minHeight, children }: DropZoneProps) {
  return (
    <div
      className={cx('p-dropzone', disabled && 'p-dropzone-disabled')}
      style={{ minHeight }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      {children ?? (
        <>
          <div className="p-dropzone-actions">
            <Button size="slim" onClick={e => { e.stopPropagation(); onClick?.() }}>{actionLabel}</Button>
            {secondaryLabel && (
              <Button variant="plain" onClick={e => { e.stopPropagation(); (onSecondary ?? onClick)?.() }}>{secondaryLabel}</Button>
            )}
          </div>
          {hint && <div className="p-dropzone-hint">{hint}</div>}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export interface PaginationProps {
  hasPrevious?: boolean
  hasNext?: boolean
  onPrevious?: () => void
  onNext?: () => void
  /** e.g. "1–50 of 213" */
  label?: ReactNode
}
/** Previous / next arrow pair (optionally with a label between). */
export function Pagination({ hasPrevious, hasNext, onPrevious, onNext, label }: PaginationProps) {
  return (
    <nav className={cx('p-pagination', label !== undefined && 'p-pagination-labelled')} aria-label="Pagination">
      <Button icon={ChevronLeft} accessibilityLabel="Previous" disabled={!hasPrevious} onClick={onPrevious} size="slim" />
      {label !== undefined && <span className="p-pagination-label">{label}</span>}
      <Button icon={ChevronRight} accessibilityLabel="Next" disabled={!hasNext} onClick={onNext} size="slim" />
    </nav>
  )
}

/** Inline field-error line (red, with alert icon) — shared by form controls. */
export function InlineError({ message, id }: { message: ReactNode; id?: string }) {
  return (
    <div className="p-field-error" id={id}>
      <CircleAlert size={16} strokeWidth={2} aria-hidden />
      <span>{message}</span>
    </div>
  )
}
