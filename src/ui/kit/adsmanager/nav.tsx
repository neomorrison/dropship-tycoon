// Ads Manager navigation pieces: create-flow Stepper, Campaigns/Ad sets/Ads
// EntityTabs with selection chips, and the audience-definition gauge.
import { Fragment, type ReactNode } from 'react'
import { Check, CircleAlert, Folder, LayoutGrid, RectangleHorizontal, TriangleAlert, X } from 'lucide-react'
import { BENCHMARKS } from '../../../data/benchmarks'
import { cx } from '../common/utils'
import { renderIcon, type IconSource } from '../common/icon'
import { useAmTheme, type AmTheme } from './theme'
import './adsmanager.css'

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------
export type StepStatus = 'upcoming' | 'current' | 'complete' | 'error' | 'warning'
export interface StepDef {
  id: string
  label: ReactNode
  description?: ReactNode
  /** default: derived from `current` (before = complete, after = upcoming) */
  status?: StepStatus
  icon?: IconSource
  /** indentation level for tree-like create flows (Campaign › Ad set › Ad) */
  level?: number
  disabled?: boolean
  /** trailing node (error count badge…) */
  badge?: ReactNode
}
export interface StepperProps {
  steps: StepDef[]
  /** id of the current step */
  current: string
  onStepClick?: (id: string) => void
  /** 'vertical' (Fadbook left tree) or 'horizontal' (TikTak top progress) */
  orientation?: 'vertical' | 'horizontal'
  theme?: AmTheme
}
/** Create-flow navigation with per-step completion / error states. */
export function Stepper({ steps, current, onStepClick, orientation = 'vertical', theme }: StepperProps) {
  useAmTheme(theme)
  const curIdx = Math.max(0, steps.findIndex(s => s.id === current))
  return (
    <nav className={cx('am-steps', orientation === 'horizontal' && 'am-steps-h')} aria-label="Steps">
      {steps.map((s, i) => {
        const status: StepStatus = s.status ?? (i < curIdx ? 'complete' : i === curIdx ? 'current' : 'upcoming')
        const isCurrent = s.id === current
        const icon =
          status === 'complete' && !s.icon ? <Check size={14} strokeWidth={3} />
            : status === 'error' ? <CircleAlert size={14} strokeWidth={2.5} />
              : status === 'warning' ? <TriangleAlert size={14} strokeWidth={2.5} />
                : s.icon ? renderIcon(s.icon, 14, 2)
                  : i + 1
        return (
          <Fragment key={s.id}>
            {orientation === 'horizontal' && i > 0 && <span className={cx('am-step-line', i <= curIdx && 'am-step-line-done')} aria-hidden />}
            <button
              type="button"
              className={cx('am-step', `am-step-${status}`, isCurrent && 'am-step-current')}
              aria-current={isCurrent ? 'step' : undefined}
              disabled={s.disabled || !onStepClick}
              style={orientation === 'vertical' && s.level ? { paddingLeft: 10 + s.level * 18 } : undefined}
              onClick={() => onStepClick?.(s.id)}
            >
              <span className="am-step-icon">{icon}</span>
              <span className="am-step-text">
                <span className="am-step-label">{s.label}</span>
                {s.description && orientation === 'vertical' && <span className="am-step-desc">{s.description}</span>}
              </span>
              {s.badge && <span className="am-step-badge">{s.badge}</span>}
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// EntityTabs
// ---------------------------------------------------------------------------
export type EntityLevel = 'campaign' | 'adset' | 'ad'
export interface EntityTabDef {
  id: EntityLevel | string
  label: ReactNode
  icon?: IconSource
  /** "1 selected" chip (Fadbook) / teal count chip (TikTak) */
  selectedCount?: number
  onClearSelection?: () => void
  /** total rows (TikTak shows it after the label) */
  count?: number
}
export interface EntityTabsProps {
  tabs: EntityTabDef[]
  active: string
  onChange: (id: string) => void
  theme?: AmTheme
}
const LEVEL_ICON: Record<EntityLevel, IconSource> = { campaign: Folder, adset: LayoutGrid, ad: RectangleHorizontal }

/** Default tab labels per platform: Campaigns / Ad sets / Ads vs Campaign / Ad group / Ad. */
export function entityTabLabels(theme: AmTheme): Record<EntityLevel, string> {
  return theme === 'tiktak' ? { campaign: 'Campaign', adset: 'Ad group', ad: 'Ad' } : { campaign: 'Campaigns', adset: 'Ad sets', ad: 'Ads' }
}

/** Campaigns / Ad sets / Ads switcher with selection chips. Put an `<AmTable attachedTop>` right below. */
export function EntityTabs({ tabs, active, onChange, theme }: EntityTabsProps) {
  const t = useAmTheme(theme)
  return (
    <div className="am-etabs" role="tablist">
      {tabs.map(tb => {
        const on = tb.id === active
        const icon = tb.icon ?? LEVEL_ICON[tb.id as EntityLevel]
        return (
          <button key={tb.id} type="button" role="tab" aria-selected={on} className={cx('am-etab', on && 'am-etab-on')} onClick={() => onChange(tb.id)}>
            {icon && t === 'fadbook' && <span className="am-etab-icon">{renderIcon(icon, 18, 2)}</span>}
            <span className="am-etab-label">{tb.label}</span>
            {tb.count !== undefined && t === 'tiktak' && !tb.selectedCount && <span className="am-etab-count">({tb.count})</span>}
            {!!tb.selectedCount && (
              <span className="am-etab-chip">
                {tb.selectedCount}<span className="am-etab-chip-word"> selected</span>
                {tb.onClearSelection && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Clear selection"
                    onClick={e => {
                      e.stopPropagation()
                      tb.onClearSelection?.()
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        tb.onClearSelection?.()
                      }
                    }}
                    style={{ display: 'inline-flex', padding: 1, borderRadius: '50%', cursor: 'pointer' }}
                  >
                    <X size={12} strokeWidth={2.5} />
                  </span>
                )}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AudienceGauge
// ---------------------------------------------------------------------------
export interface AudienceGaugeProps {
  /** estimated audience size range [low, high] in people */
  estimate: [number, number]
  /** override the needle position 0 (specific) … 1 (broad); default from the estimate on a log scale */
  position?: number
  /** extra line under the gauge (e.g. "Advantage+ audience may reach beyond your selections") */
  note?: ReactNode
  theme?: AmTheme
}
const fmtPeople = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`
  return String(Math.round(n))
}
/**
 * Where an audience sits between "too specific" and "broad": log scale from 100K people to the full
 * US ad audience (BENCHMARKS.fadbook.audienceSizeUS.broad).
 */
export function audiencePosition(people: number): number {
  const lo = Math.log10(100_000)
  const hi = Math.log10(BENCHMARKS.fadbook.audienceSizeUS.broad)
  return Math.max(0, Math.min(1, (Math.log10(Math.max(1, people)) - lo) / (hi - lo)))
}
/** "Your audience is broad/defined/specific" meter (semicircle on Fadbook, bar on TikTak). */
export function AudienceGauge({ estimate, position, note, theme }: AudienceGaugeProps) {
  const t = useAmTheme(theme)
  const mid = Math.sqrt(Math.max(1, estimate[0]) * Math.max(1, estimate[1]))
  const pos = position ?? audiencePosition(mid)
  const verdict =
    pos < 0.25 ? { title: 'Your audience selection is fairly specific.', tone: '#e41e3f', word: 'Specific' }
      : pos < 0.72 ? { title: 'Your audience selection is well defined.', tone: '#31a24c', word: 'Defined' }
        : { title: 'Your audience selection is fairly broad.', tone: '#31a24c', word: 'Broad' }
  const sizeLine = (
    <span className="am-gauge-size">
      Estimated audience size: <strong>{fmtPeople(estimate[0])} – {fmtPeople(estimate[1])}</strong>
    </span>
  )
  if (t === 'tiktak') {
    return (
      <div className="am-gauge">
        <span className="am-gauge-title">Audience size: {verdict.word}</span>
        <div className="am-gauge-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos * 100)}>
          <span className="am-gauge-bar-knob" style={{ left: `${pos * 100}%` }} />
        </div>
        <div className="am-gauge-bar-labels"><span>Narrow</span><span>Broad</span></div>
        {sizeLine}
        {note && <span className="am-gauge-desc">{note}</span>}
      </div>
    )
  }
  // semicircle: angle from 180° (left, specific) to 0° (right, broad)
  const W = 180
  const R = 70
  const cx0 = W / 2
  const cy0 = 84
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [cx0 + R * Math.cos((a * Math.PI) / 180), cy0 - R * Math.sin((a * Math.PI) / 180)]
    const [x0, y0] = p(a0)
    const [x1, y1] = p(a1)
    return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`
  }
  const ang = 180 - pos * 180
  const nx = cx0 + (R - 14) * Math.cos((ang * Math.PI) / 180)
  const ny = cy0 - (R - 14) * Math.sin((ang * Math.PI) / 180)
  return (
    <div className="am-gauge">
      <span className="am-gauge-title">Audience definition</span>
      <svg className="am-gauge-svg" width={W} height={96} viewBox={`0 0 ${W} 96`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos * 100)}>
        <path d={arc(180, 135)} stroke="#e41e3f" strokeWidth="12" fill="none" />
        <path d={arc(133, 47)} stroke="#31a24c" strokeWidth="12" fill="none" />
        <path d={arc(45, 0)} stroke="#f7b928" strokeWidth="12" fill="none" />
        <line x1={cx0} y1={cy0} x2={nx} y2={ny} stroke="#1c2b33" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx0} cy={cy0} r="6" fill="#1c2b33" />
      </svg>
      <div className="am-gauge-scale"><span>Specific</span><span>Broad</span></div>
      <span className="am-gauge-desc" style={{ color: verdict.tone === '#e41e3f' ? '#c4122f' : undefined }}>{verdict.title}</span>
      {sizeLine}
      {note && <span className="am-gauge-desc">{note}</span>}
    </div>
  )
}
