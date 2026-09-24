// Small CreatorHub building blocks (class prefix ch-).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx, EmptyArt, ImageWithFallback, type EmptyArtKind } from '../../kit/common'
import { portrait } from '../../../core/assets'
import type { StatusTone } from './helpers'

export function Badge({ tone = 'subdued', children, dot, className }: { tone?: StatusTone | 'warning'; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('ch-badge', `ch-badge-${tone}`, className)}>
      {dot && <i className="ch-badge-dot" aria-hidden />}
      {children}
    </span>
  )
}

export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return <span className={cx('ch-chip', className)} title={title}>{children}</span>
}

export interface SegOption<T extends string> { value: T; label: ReactNode; count?: number; title?: string }
export function Segmented<T extends string>({ options, value, onChange, size = 'md', ariaLabel, className }: {
  options: SegOption<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={cx('ch-seg', size === 'sm' && 'ch-seg-sm', className)} role="tablist" aria-label={ariaLabel}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          title={o.title}
          className={cx('ch-seg-btn', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="ch-seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Horizontal 0–100 meter with an expected band. */
export function QualityMeter({ lo, hi, label = 'Expected footage quality' }: { lo: number; hi: number; label?: string }) {
  const a = Math.round(Math.max(0, Math.min(1, lo)) * 100)
  const b = Math.round(Math.max(0, Math.min(1, hi)) * 100)
  return (
    <div className="ch-meter">
      <div className="ch-meter-head">
        <span>{label}</span>
        <b>{a === b ? a : `${a}–${b}`}<small>/100</small></b>
      </div>
      <div className="ch-meter-track" aria-hidden>
        <span className="ch-meter-fill" style={{ width: `${b}%` }} />
        <span className="ch-meter-band" style={{ left: `${a}%`, width: `${Math.max(1.5, b - a)}%` }} />
        {[25, 50, 75].map(t => <i key={t} style={{ left: `${t}%` }} />)}
      </div>
      <div className="ch-meter-scale" aria-hidden><span>Rough</span><span>Basic</span><span>Clean</span><span>Studio</span></div>
    </div>
  )
}

export function Portrait({ id, name, size = 40, ring }: { id?: string; name: string; size?: number; ring?: boolean }) {
  return (
    <ImageWithFallback
      src={id ? portrait(id) : null}
      alt={name}
      fallbackLabel={name}
      width={size}
      height={size}
      radius={size}
      className={cx('ch-portrait', ring && 'ch-portrait-ring')}
    />
  )
}

export function EmptyBlock({ art = 'creative', title, body, actions, compact }: { art?: EmptyArtKind; title: string; body?: ReactNode; actions?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('ch-empty', compact && 'ch-empty-compact')}>
      <EmptyArt kind={art} size={compact ? 110 : 150} accent="#ff7a00" />
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {actions && <div className="ch-empty-actions">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, title }: { label: string; value: ReactNode; sub?: ReactNode; title?: string }) {
  return (
    <div className="ch-stat" title={title}>
      <span className="ch-stat-label">{label}</span>
      <span className="ch-stat-value">{value}</span>
      {sub && <span className="ch-stat-sub">{sub}</span>}
    </div>
  )
}

/** Button that asks for a second click before doing something costly or destructive. */
export function ConfirmButton({ children, confirmLabel, onConfirm, className, disabled, tone = 'primary', icon, dismissLabel = 'Cancel' }: {
  children: ReactNode
  confirmLabel: ReactNode
  /** label of the button that backs out of the confirmation */
  dismissLabel?: string
  onConfirm: () => void
  className?: string
  disabled?: boolean
  tone?: 'primary' | 'danger' | 'secondary'
  icon?: ReactNode
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (disabled) setArmed(false)
  }, [disabled])
  if (armed) {
    return (
      <span className={cx('ch-confirm', className)}>
        <button type="button" className={cx('ch-btn', tone === 'danger' ? 'ch-btn-danger' : 'ch-btn-primary', 'ch-btn-grow')} onClick={() => { setArmed(false); onConfirm() }}>
          {confirmLabel}
        </button>
        <button type="button" className="ch-btn ch-btn-ghost" onClick={() => setArmed(false)}>{dismissLabel}</button>
      </span>
    )
  }
  return (
    <button
      type="button"
      className={cx('ch-btn', tone === 'danger' ? 'ch-btn-danger-outline' : tone === 'secondary' ? 'ch-btn-secondary' : 'ch-btn-primary', className)}
      disabled={disabled}
      onClick={() => {
        setArmed(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setArmed(false), 8000)
      }}
    >
      {icon}
      {children}
    </button>
  )
}

export function SectionCard({ title, subtitle, actions, children, className, id }: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section className={cx('ch-card', className)} id={id}>
      {(title || actions) && (
        <header className="ch-card-head">
          <div>
            {title && <h3 className="ch-card-title">{title}</h3>}
            {subtitle && <p className="ch-card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="ch-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
