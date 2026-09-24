// Ads Manager cell renderers: delivery status, metrics with sub-labels, inline
// budget editing (with the platforms' real learning-reset and minimum-budget rules),
// plus the number formatters both Ads Managers use.
import { useRef, useState, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { BENCHMARKS } from '../../../data/benchmarks'
import { cx } from '../common/utils'
import { Floating } from '../common/Floating'
import { amThemeClass, useAmTheme, type AmTheme } from './theme'
import { AmButton, AmField, AmInput, AmTooltip } from './controls'
import './adsmanager.css'

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const DASH = '—'
const fin = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)
/** Number formatting exactly as the Ads Managers show it. Every helper returns "—" for missing values. */
export const amFmt = {
  /** $1,234.56 */
  money: (n: number | null | undefined) => (fin(n) ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : DASH),
  /** $1,235 */
  money0: (n: number | null | undefined) => (fin(n) ? `$${Math.round(n).toLocaleString('en-US')}` : DASH),
  /** 12,345 */
  int: (n: number | null | undefined) => (fin(n) ? Math.round(n).toLocaleString('en-US') : DASH),
  /** 0.0123 → 1.23% */
  pct: (n: number | null | undefined, digits = 2) => (fin(n) ? `${(n * 100).toFixed(digits)}%` : DASH),
  /** ROAS "2.31" (Fadbook shows purchase ROAS as a bare ratio) */
  roas: (n: number | null | undefined) => (fin(n) ? n.toFixed(2) : DASH),
  /** frequency "1.84" */
  freq: (n: number | null | undefined) => (fin(n) ? n.toFixed(2) : DASH),
  /** seconds "0:07" */
  secs: (n: number | null | undefined) => (fin(n) ? `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}` : DASH),
  /** ratio a/b with a formatter, dash when b is 0 */
  ratio: (a: number, b: number, f: (x: number) => string) => (b ? f(a / b) : DASH),
  /** 1.2K / 3.4M */
  compact: (n: number | null | undefined) => {
    if (!fin(n)) return DASH
    const a = Math.abs(n)
    if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`
    return Math.round(n).toLocaleString('en-US')
  },
  dash: DASH,
}

// ---------------------------------------------------------------------------
// StatusCell
// ---------------------------------------------------------------------------
export type DeliveryTone = 'active' | 'learning' | 'limited' | 'warning' | 'review' | 'error' | 'off' | 'inactive' | 'completed'

/** Map a delivery label ("Learning limited", "In review", "Not delivering"…) to a tone. */
export function deliveryTone(label: string): DeliveryTone {
  const l = label.toLowerCase()
  if (l.includes('limited')) return 'limited'
  if (l.includes('learning')) return 'learning'
  if (l.includes('review') || l.includes('processing') || l.includes('pending')) return 'review'
  if (l.includes('reject') || l.includes('disapproved') || l.includes('disabled') || l.includes('error') || l.includes('suspend')) return 'error'
  if (l.includes('not delivering') || l.includes('budget') || l.includes('payment')) return 'warning'
  if (l.includes('complete') || l.includes('ended')) return 'completed'
  if (l === 'off' || l.includes('paused') || l.includes(' off')) return 'off'
  if (l.includes('inactive') || l.includes('deleted')) return 'inactive'
  if (l.includes('active') || l.includes('delivering') || l.includes('enabled')) return 'active'
  return 'inactive'
}

export interface StatusCellProps {
  /** e.g. "Active", "Learning", "Learning limited", "Off", "In review", "Rejected", "Not delivering" */
  label: ReactNode
  /** dot style; derived from `label` when it is a string */
  tone?: DeliveryTone
  /** small gray second line ("Ad set off", "12 of 50 conversions") */
  detail?: ReactNode
  /** learning progress 0–1 → tiny bar under the label */
  progress?: number
  /** hover explanation */
  tooltip?: ReactNode
}
/** Delivery column cell: colored dot + label (+ detail / learning progress). */
export function StatusCell({ label, tone, detail, progress, tooltip }: StatusCellProps) {
  const tn = tone ?? (typeof label === 'string' ? deliveryTone(label) : 'inactive')
  const body = (
    <span className={cx('am-status', `am-status-${tn}`)}>
      <span className="am-status-dot" aria-hidden />
      <span className="am-status-text">
        <span className="am-status-label">{label}</span>
        {detail && <span className="am-status-detail">{detail}</span>}
        {progress !== undefined && (
          <span className="am-status-bar" aria-hidden><span style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }} /></span>
        )}
      </span>
    </span>
  )
  return tooltip ? <AmTooltip content={tooltip}>{body}</AmTooltip> : body
}

// ---------------------------------------------------------------------------
// MetricCell
// ---------------------------------------------------------------------------
export interface MetricCellProps {
  /** formatted value (use amFmt) */
  value: ReactNode
  /** gray second line: "Website purchases", "Per purchase", "Accounts Center accounts" */
  sub?: ReactNode
  /** color the value (only for derived judgments the player asked for, e.g. vs break-even) */
  tone?: 'good' | 'bad'
  /** gray out (zero / not enough data) */
  muted?: boolean
  align?: 'left' | 'right'
  tooltip?: ReactNode
}
/** Numeric cell with optional sub-label (the Ads Manager "Results / Website purchases" style). */
export function MetricCell({ value, sub, tone, muted, align = 'right', tooltip }: MetricCellProps) {
  const isDash = value === DASH || value === '' || value === null || value === undefined
  const body = (
    <span className={cx('am-metric', align === 'left' && 'am-metric-left', (muted || isDash) && 'am-metric-muted', tone && `am-metric-${tone}`)}>
      <span className="am-metric-value">{isDash ? DASH : value}</span>
      {sub && <span className="am-metric-sub">{sub}</span>}
    </span>
  )
  return tooltip ? <AmTooltip content={tooltip}>{body}</AmTooltip> : body
}

// ---------------------------------------------------------------------------
// BudgetCell
// ---------------------------------------------------------------------------
export interface BudgetCellProps {
  /** current budget in USD (null when the entity uses its parent's budget) */
  amount: number | null
  period?: 'daily' | 'lifetime'
  /** shows "Using campaign budget" / "Using ad set budget" instead of an amount */
  usingParent?: 'campaign' | 'ad set' | 'ad group'
  /** entity level, used for TikTak's minimums ($50 campaign / $20 ad group) */
  level?: 'campaign' | 'adset'
  /** allow inline editing (click the amount) */
  editable?: boolean
  /** called with the new amount after the player confirms */
  onChange?: (amount: number) => void
  /** override the minimum budget (defaults come from BENCHMARKS) */
  minBudget?: number
  /** override the "significant edit" threshold (Fadbook 20%, TikTak 30%) */
  learningResetThreshold?: number
  /** show the learning-reset warning only when the entity is past/in learning (default true) */
  warnLearning?: boolean
  /** disable editing with a reason tooltip */
  lockedReason?: ReactNode
  theme?: AmTheme
}
/** Minimum daily budget per platform/level, from the benchmarks file. */
export function minDailyBudget(theme: AmTheme, level: 'campaign' | 'adset' = 'adset'): number {
  if (theme === 'tiktak') return level === 'campaign' ? BENCHMARKS.tiktak.minCampaignDailyBudget : BENCHMARKS.tiktak.minAdGroupDailyBudget
  return BENCHMARKS.fadbook.minDailyBudgetConversion
}
/** Relative budget change that resets learning on each platform. */
export function learningResetThreshold(theme: AmTheme): number {
  return theme === 'tiktak' ? BENCHMARKS.tiktak.significantBudgetChange : BENCHMARKS.fadbook.significantBudgetChange
}
/**
 * Evaluate a proposed budget edit: returns an error (below minimum), or a warning when the change is
 * large enough to reset learning. Exported so create/edit forms can reuse the same rules.
 */
export function checkBudgetEdit(
  theme: AmTheme, current: number | null, next: number, opts: { level?: 'campaign' | 'adset'; minBudget?: number; threshold?: number } = {},
): { error?: string; warning?: string; change: number | null } {
  const min = opts.minBudget ?? minDailyBudget(theme, opts.level)
  const thr = opts.threshold ?? learningResetThreshold(theme)
  if (!Number.isFinite(next) || next <= 0) return { error: 'Enter a budget amount.', change: null }
  if (next < min) {
    const where = theme === 'tiktak' ? (opts.level === 'campaign' ? 'campaign' : 'ad group') : 'ad set'
    return { error: `The minimum daily budget for this ${where} is $${min.toFixed(2)}.`, change: null }
  }
  const change = current ? (next - current) / current : null
  if (change !== null && Math.abs(change) > thr) {
    const pct = Math.round(Math.abs(change) * 100)
    return {
      change,
      warning:
        theme === 'tiktak'
          ? `Changing the budget by ${pct}% (more than ${Math.round(thr * 100)}%) may send this ad group back into the learning phase.`
          : `This is a significant edit (${pct}%). Edits over ${Math.round(thr * 100)}% can reset the learning phase and make performance unstable.`,
    }
  }
  return { change }
}

/** Budget column: "$50.00 / Daily" with a click-to-edit popover that warns like the real platforms. */
export function BudgetCell({
  amount, period = 'daily', usingParent, level = 'adset', editable, onChange, minBudget, learningResetThreshold: thr, warnLearning = true,
  lockedReason, theme,
}: BudgetCellProps) {
  const t = useAmTheme(theme)
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  if (usingParent || amount === null) {
    return (
      <span className="am-budget">
        <span className="am-budget-parent">{usingParent ? `Using ${usingParent} budget` : amFmt.dash}</span>
      </span>
    )
  }
  const next = parseFloat(draft)
  const check = checkBudgetEdit(t, amount, next, { level, minBudget, threshold: thr })
  const periodLabel = period === 'daily' ? 'Daily' : 'Lifetime'
  const canEdit = editable && !lockedReason && !!onChange
  const save = () => {
    if (check.error) return
    onChange?.(Math.round(next * 100) / 100)
    setOpen(false)
  }
  const btn = (
    <button
      ref={anchor}
      type="button"
      className="am-budget-btn"
      disabled={!canEdit}
      style={!canEdit ? { cursor: 'default', borderColor: 'transparent', background: 'transparent' } : undefined}
      onClick={e => {
        e.stopPropagation()
        if (!canEdit) return
        setDraft(amount.toFixed(2))
        setOpen(true)
      }}
    >
      {canEdit && <Pencil size={12} strokeWidth={2} />}
      {amFmt.money(amount)}
    </button>
  )
  return (
    <span className="am-budget" onClick={e => e.stopPropagation()}>
      {lockedReason ? <AmTooltip content={lockedReason}>{btn}</AmTooltip> : btn}
      <span className="am-budget-period">{periodLabel}</span>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} placement="bottom-end" className={amThemeClass(t)}>
        <div className="am-menu am-budget-pop" role="dialog" aria-label="Edit budget">
          <span className="am-budget-pop-title">{periodLabel} budget</span>
          <AmField
            error={draft ? check.error : undefined}
            warning={warnLearning ? check.warning : undefined}
            help={`Minimum ${amFmt.money(minBudget ?? minDailyBudget(t, level))} per day`}
          >
            <AmInput value={draft} onChange={setDraft} type="currency" prefix="$" suffix="USD" autoFocus selectOnFocus onEnter={save} ariaLabel="Budget" />
          </AmField>
          {check.change !== null && Number.isFinite(next) && next !== amount && (
            <span className={cx('am-budget-delta', check.change > 0 ? 'am-budget-delta-up' : 'am-budget-delta-down')}>
              {check.change > 0 ? '+' : '−'}
              {Math.abs(check.change * 100).toFixed(0)}% vs. current {amFmt.money(amount)}
            </span>
          )}
          <div className="am-budget-pop-actions">
            <AmButton size="sm" onClick={() => setOpen(false)}>Cancel</AmButton>
            <AmButton size="sm" variant="primary" disabled={!!check.error || next === amount} onClick={save}>Save</AmButton>
          </div>
        </div>
      </Floating>
    </span>
  )
}
