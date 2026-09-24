// Donut (share of total) and FunnelBars (Shopify's conversion funnel:
// Sessions → Added to cart → Reached checkout → Sessions converted).
import { useState, type ReactNode } from 'react'
import { Cell, Pie, PieChart, Tooltip, type TooltipContentProps } from 'recharts'
import { cx } from '../common/utils'
import { CHART_COLORS, ChartTip, SERIES_COLORS, formatValue, type ChartFormat } from './shared'
import './charts.css'

export interface DonutDatum {
  label: string
  value: number
  /** fixed identity color; default follows SERIES_COLORS by position (keep input order stable) */
  color?: string
}
export interface DonutChartProps {
  data: DonutDatum[]
  format?: ChartFormat
  /** px diameter (default 160) */
  size?: number
  /** ring thickness in px (default 22) */
  thickness?: number
  /** center value (default: the total) */
  centerValue?: ReactNode
  /** small text under the center value (e.g. "Sessions") */
  centerLabel?: ReactNode
  legend?: 'right' | 'bottom' | 'none'
  /** fold slices beyond this count into "Other" (default 6) */
  maxSlices?: number
  emptyText?: ReactNode
  className?: string
}
/** Share-of-total donut with a legend listing value and percentage for every slice. */
export function DonutChart({
  data, format = 'number', size = 160, thickness = 22, centerValue, centerLabel, legend = 'right', maxSlices = 6, emptyText, className,
}: DonutChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const colored = data.map((d, i) => ({ ...d, color: d.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }))
  let slices = colored
  if (colored.length > maxSlices) {
    const keep = colored.slice(0, maxSlices - 1)
    const rest = colored.slice(maxSlices - 1)
    slices = [...keep, { label: `Other (${rest.length})`, value: rest.reduce((s, d) => s + d.value, 0), color: CHART_COLORS.muted }]
  }
  const total = slices.reduce((s, d) => s + Math.max(0, d.value), 0)
  const empty = total <= 0
  const renderTip = (p: TooltipContentProps) => {
    if (!p.active || !p.payload?.length) return null
    const d = p.payload[0]?.payload as DonutDatum | undefined
    if (!d) return null
    return (
      <ChartTip
        rows={[{ color: d.color ?? CHART_COLORS.current, label: d.label, value: formatValue(d.value, format) }]}
        footer={`${((d.value / total) * 100).toFixed(1)}% of total`}
      />
    )
  }
  return (
    <div className={cx('kc-root', 'kc-donut', legend === 'bottom' && 'kc-donut-bottom', className)}>
      <div className="kc-donut-plot" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          {empty ? (
            <Pie data={[{ value: 1 }]} dataKey="value" innerRadius={size / 2 - thickness} outerRadius={size / 2} stroke="none" fill={CHART_COLORS.track} isAnimationActive={false} />
          ) : (
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={size / 2 - thickness}
              outerRadius={size / 2}
              startAngle={90}
              endAngle={-270}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
              onMouseEnter={(_: unknown, i: number) => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {slices.map((d, i) => <Cell key={d.label} fill={d.color} fillOpacity={hover === null || hover === i ? 1 : 0.35} />)}
            </Pie>
          )}
          {!empty && <Tooltip content={renderTip} isAnimationActive={false} wrapperStyle={{ zIndex: 5, outline: 'none' }} />}
        </PieChart>
        <div className="kc-donut-center">
          <b>{centerValue ?? (empty ? '—' : formatValue(total, format))}</b>
          {centerLabel && <span>{centerLabel}</span>}
        </div>
      </div>
      {legend !== 'none' && (
        empty ? (
          <div className="kc-donut-legend" style={{ color: '#616161' }}>{emptyText ?? 'No data for this date range'}</div>
        ) : (
          <ul className="kc-donut-legend">
            {slices.map((d, i) => (
              <li key={d.label} className={cx(hover !== null && hover !== i && 'kc-dim')} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <span className="kc-swatch" style={{ background: d.color }} />
                <span>{d.label}</span>
                <span className="kc-num">{formatValue(d.value, format)}</span>
                <span className="kc-pct">{((Math.max(0, d.value) / total) * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FunnelBars
// ---------------------------------------------------------------------------
export interface FunnelStep {
  label: string
  value: number
  /** previous-period value for the delta line */
  compare?: number | null
}
export interface FunnelBarsProps {
  steps: FunnelStep[]
  /** 'columns' (Shopify conversion chart, default) or 'rows' (compact list) */
  variant?: 'columns' | 'rows'
  /** count format (default number) */
  format?: ChartFormat
  /** bar height for columns (default 160) */
  height?: number
  color?: string
  className?: string
}
/**
 * Conversion funnel. Each step shows its rate vs. the first step, its count, and the
 * step-to-step conversion ("63.2% of previous").
 */
export function FunnelBars({ steps, variant = 'columns', format = 'number', height = 160, color = CHART_COLORS.current, className }: FunnelBarsProps) {
  const top = steps[0]?.value ?? 0
  const rate = (v: number) => (top > 0 ? v / top : 0)
  if (variant === 'rows') {
    return (
      <div className={cx('kc-root', 'kc-frows', className)}>
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : null
          return (
            <div key={s.label} className="kc-frow">
              <span className="kc-frow-label">
                {s.label}
                {prev !== null && <small>{prev > 0 ? `${((s.value / prev) * 100).toFixed(1)}% of previous step` : 'No previous-step traffic'}</small>}
              </span>
              <span className="kc-frow-num">{formatValue(s.value, format)}</span>
              <span className="kc-frow-pct">{i === 0 ? '100%' : `${(rate(s.value) * 100).toFixed(2)}%`}</span>
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className={cx('kc-root', 'kc-funnel', className)} style={{ gridTemplateColumns: `repeat(${Math.max(1, steps.length)}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const r = rate(s.value)
        const prev = i > 0 ? steps[i - 1].value : null
        const cmpRate = s.compare !== undefined && s.compare !== null && steps[0]?.compare ? s.compare / (steps[0].compare as number) : null
        return (
          <div key={s.label} className="kc-fcol" title={`${s.label}: ${formatValue(s.value, format)}`}>
            <div className="kc-fhead">
              <span className="kc-flabel">{s.label}</span>
              <span className="kc-fpct">{i === 0 ? '100%' : `${(r * 100).toFixed(r < 0.1 ? 2 : 1)}%`}</span>
              <span className="kc-fcount">{formatValue(s.value, format)}{cmpRate !== null && i > 0 ? ` · was ${(cmpRate * 100).toFixed(1)}%` : ''}</span>
            </div>
            <div className="kc-fbar" style={{ height }}>
              <div className="kc-fbar-fill" style={{ height: `${top > 0 ? Math.max(s.value > 0 ? 1 : 0, r * 100) : 0}%`, background: color }} />
            </div>
            <span className="kc-fstep">{prev !== null ? <><b>{prev > 0 ? `${((s.value / prev) * 100).toFixed(1)}%` : '—'}</b> of previous</> : 'Entry'}</span>
          </div>
        )
      })}
    </div>
  )
}
