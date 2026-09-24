// Line charts: TrendChart (plain, multi-series, one y-axis) and LineChartCard
// (Shopify analytics card: title, big value, delta, current vs comparison lines).
import { useRef, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from 'recharts'
import { cx } from '../common/utils'
import { Floating } from '../common/Floating'
import { useElementWidth } from '../common/hooks'
import { CHART_COLORS, ChartTip, LegendItem, SERIES_COLORS, formatAxis, formatValue, percentChange, type ChartFormat } from './shared'
import './charts.css'

type Datum = Record<string, unknown>

export interface TrendSeries {
  /** data key holding this series' values */
  key: string
  /** legend / tooltip label */
  label: ReactNode
  color?: string
  /** dashed line (comparison periods, targets) */
  dashed?: boolean
  /** 10% wash under the line */
  area?: boolean
  /** data key with a per-point label for the tooltip row (e.g. the comparison date) */
  labelKey?: string
  /** override the chart format for this series in tooltips */
  format?: ChartFormat
}
export interface TrendChartProps {
  data: Datum[]
  series: TrendSeries[]
  /** x-axis key (default 'label') */
  xKey?: string
  /** value format for axis + tooltip (default 'number') */
  format?: ChartFormat
  height?: number
  /** horizontal guides, e.g. break-even ROAS or target CPA */
  referenceLines?: { value: number; label: string; color?: string }[]
  /** tooltip header from the hovered datum (default: the x label) */
  tooltipTitle?: (d: Datum) => ReactNode
  /** show the legend (default: when there are 2+ series) */
  legend?: boolean
  /** force the y-axis to start at 0 (default true) */
  zeroBaseline?: boolean
  emptyText?: ReactNode
  loading?: boolean
  className?: string
}

function isEmpty(data: Datum[], series: TrendSeries[]) {
  return !data.length || data.every(d => series.every(s => d[s.key] === null || d[s.key] === undefined))
}

/** 1 / 2 / 2.5 / 5 × 10ⁿ step at or above `raw`. */
function niceStep(raw: number): number {
  const exp = Math.floor(Math.log10(raw))
  const base = 10 ** exp
  const f = raw / base
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * base
}

/** Ticks from 0 to a round maximum (about 4 steps); null when values go negative. */
function zeroBasedTicks(data: Datum[], series: TrendSeries[], format: ChartFormat, refs?: { value: number }[]): number[] | null {
  let max = 0
  for (const d of data) {
    for (const s of series) {
      const v = d[s.key]
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      if (v < 0) return null
      if (v > max) max = v
    }
  }
  for (const r of refs ?? []) if (Number.isFinite(r.value)) max = Math.max(max, r.value)
  if (max <= 0) return null
  let step = niceStep(max / 4)
  // whole-number metrics (orders, sessions) never get fractional steps
  if ((format === 'number' || format === 'money0') && step < 1) step = 1
  const n = Math.max(1, Math.ceil(max / step - 1e-9))
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6)
}

/**
 * Evenly spaced x labels (every 2 hours, every 6th day…) instead of recharts' "preserveStartEnd",
 * which pins the first and last label and leaves an uneven step in between (12 am, 3 am, 5 am…).
 * Returns recharts' `interval` (labels skipped between two shown ones).
 */
function evenTickInterval(data: Datum[], xKey: string, width: number): number | 'preserveStartEnd' {
  const n = data.length
  if (!width || n <= 2) return 'preserveStartEnd'
  let longest = 0
  for (const d of data) longest = Math.max(longest, String(d[xKey] ?? '').length)
  const labelW = longest * 5.6 + 14
  const room = Math.max(2, Math.floor(Math.max(60, width - 56) / labelW))
  for (const k of [1, 2, 3, 4, 6, 7, 12, 14, 24, 30, 48, 60, 90, 120, 180, 365]) if (Math.ceil(n / k) <= room) return k - 1
  return Math.ceil(n / room) - 1
}

function Skeleton() {
  return (
    <div className="kc-skeleton" aria-hidden>
      {[40, 55, 35, 70, 60, 80, 65, 90, 72, 85].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}
    </div>
  )
}

/**
 * Plain line chart with a crosshair tooltip. One y-axis only: plot metrics with different units
 * as separate charts (small multiples).
 */
export function TrendChart({
  data, series, xKey = 'label', format = 'number', height = 220, referenceLines, tooltipTitle, legend, zeroBaseline = true, emptyText,
  loading, className,
}: TrendChartProps) {
  const empty = isEmpty(data, series)
  // an all-zero series would otherwise get recharts' arbitrary 0–4 axis (0–400% for rates)
  const allZero = !empty && data.every(d => series.every(s => !d[s.key]))
  const pctLike = format === 'percent' || format === 'percent1'
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }))
  const showLegend = legend ?? series.length >= 2
  // round axis steps ($0, $500, $1K, $1.5K) like the admin, instead of recharts' 0/450/900/1350
  const niceTicks = !empty && !allZero && zeroBaseline ? zeroBasedTicks(data, series, format, referenceLines) : null
  const [wrapRef, wrapW] = useElementWidth<HTMLDivElement>()
  const xInterval = evenTickInterval(data, xKey, wrapW)
  const renderTip = (p: TooltipContentProps) => {
    if (!p.active || !p.payload?.length) return null
    const d = p.payload[0]?.payload as Datum | undefined
    if (!d) return null
    return (
      <ChartTip
        title={tooltipTitle ? tooltipTitle(d) : String(d[xKey] ?? '')}
        rows={colored
          .filter(s => d[s.key] !== undefined)
          .map(s => ({
            color: s.color,
            dashed: s.dashed,
            label: s.labelKey && d[s.labelKey] ? String(d[s.labelKey]) : s.label,
            value: formatValue(d[s.key] as number | null, s.format ?? format),
          }))}
      />
    )
  }
  return (
    <div className={cx('kc-root', className)}>
      <div ref={wrapRef} className="kc-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height }}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeWidth={1} />
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
              interval={xInterval}
              minTickGap={xInterval === 'preserveStartEnd' ? 28 : 4}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
              tickFormatter={(v: number) => formatAxis(v, format)}
              width="auto"
              domain={allZero ? [0, pctLike ? 0.01 : 10] : niceTicks ? [0, niceTicks[niceTicks.length - 1]] : zeroBaseline ? [0, 'auto'] : ['auto', 'auto']}
              ticks={allZero ? (pctLike ? [0, 0.005, 0.01] : [0, 5, 10]) : niceTicks ?? undefined}
              allowDecimals={format === 'percent' || format === 'percent1' || format === 'decimal' || format === 'roas'}
            />
            {!empty && (
              <Tooltip
                content={renderTip}
                cursor={{ stroke: CHART_COLORS.muted, strokeWidth: 1 }}
                isAnimationActive={false}
                wrapperStyle={{ zIndex: 5, outline: 'none' }}
              />
            )}
            {referenceLines?.map(r => (
              <ReferenceLine
                key={r.label}
                y={r.value}
                stroke={r.color ?? CHART_COLORS.axis}
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: r.label, position: 'insideTopRight', fontSize: 11, fill: CHART_COLORS.axis }}
              />
            ))}
            {colored.filter(s => s.area).map(s => (
              <Area key={`${s.key}-area`} dataKey={s.key} stroke="none" fill={s.color} fillOpacity={0.1} isAnimationActive={false} connectNulls legendType="none" activeDot={false} />
            ))}
            {colored.map(s => (
              <Line
                key={s.key}
                dataKey={s.key}
                type="monotone"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, fill: s.color, stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        {loading ? <Skeleton /> : empty && <div className="kc-empty">{emptyText ?? 'No data for this date range'}</div>}
      </div>
      {showLegend && !empty && (
        <div className="kc-legend">
          {colored.map(s => <LegendItem key={s.key} color={s.color} dashed={s.dashed} label={s.label} />)}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LineChartCard
// ---------------------------------------------------------------------------
export interface LineChartPoint {
  /** x label, e.g. "Mar 5" */
  label: string
  value: number | null
  /** comparison-period value at the same position */
  compare?: number | null
  /** comparison date label for the tooltip, e.g. "Feb 3" */
  compareLabel?: string
}
export interface LineChartCardProps {
  title: ReactNode
  /** metric definition shown on hover over the dotted-underlined title */
  titleTip?: ReactNode
  /** headline value; numbers are formatted with `format` (default: sum of data values) */
  value?: ReactNode | number
  /** comparison total for the delta badge (default: sum of compare values when present) */
  comparisonValue?: number | null
  /** true when a decrease is good (costs, CPA, refund rate) */
  invertDelta?: boolean
  data: LineChartPoint[]
  format?: ChartFormat
  /** legend label for the current series, e.g. "Mar 1–30, 2026" */
  currentLabel?: ReactNode
  /** legend label for the comparison series */
  compareLabel?: ReactNode
  height?: number
  /** right side of the header (e.g. "View report" link) */
  action?: ReactNode
  /** soft area under the current line */
  area?: boolean
  /** override colors (Ads Manager themes) */
  color?: string
  compareColor?: string
  referenceLines?: TrendChartProps['referenceLines']
  footer?: ReactNode
  emptyText?: ReactNode
  loading?: boolean
  /** render without the card surface (inside another card) */
  bare?: boolean
  className?: string
}

/** Hover definition bubble for card titles. */
function TitleTip({ children, tip }: { children: ReactNode; tip?: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  if (!tip) return <>{children}</>
  return (
    <>
      <span ref={anchor} className="kc-title-tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} tabIndex={0} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        {children}
      </span>
      <Floating anchor={anchor} open={open} placement="top-start" offset={6} passive>
        <div className="kc-tip" style={{ maxWidth: 300, fontSize: 12 }}>{tip}</div>
      </Floating>
    </>
  )
}

/** Delta badge: ↗ 12% (green when good), ↘ 8% (red when bad). */
export function DeltaBadge({ cur, prev, invert }: { cur: number; prev: number | null | undefined; invert?: boolean }) {
  const ch = percentChange(cur, prev)
  if (!ch) return <span className="kc-delta kc-delta-flat">—</span>
  const good = ch.dir === 'flat' ? null : (ch.dir === 'up') !== !!invert
  const Icon = ch.dir === 'up' ? ArrowUpRight : ch.dir === 'down' ? ArrowDownRight : ArrowRight
  return (
    <span className={cx('kc-delta', good === null ? 'kc-delta-flat' : good ? 'kc-delta-good' : 'kc-delta-bad')}>
      <Icon size={14} strokeWidth={2.2} aria-hidden />
      {Math.round(Math.abs(ch.pct) * 100).toLocaleString('en-US')}%
    </span>
  )
}

/**
 * Shopify analytics card:
 *   <LineChartCard title="Total sales" format="money" data={days} currentLabel="Mar 1–30, 2026" compareLabel="Jan 30–Feb 28, 2026" />
 */
export function LineChartCard({
  title, titleTip, value, comparisonValue, invertDelta, data, format = 'number', currentLabel = 'Current period', compareLabel = 'Previous period',
  height = 200, action, area, color = CHART_COLORS.current, compareColor = CHART_COLORS.comparison, referenceLines, footer, emptyText, loading,
  bare, className,
}: LineChartCardProps) {
  const hasCompare = data.some(d => d.compare !== undefined && d.compare !== null)
  const sum = (k: 'value' | 'compare') => data.reduce((s, d) => s + (typeof d[k] === 'number' && Number.isFinite(d[k]) ? (d[k] as number) : 0), 0)
  const headline = value === undefined ? sum('value') : value
  const cmpTotal = comparisonValue !== undefined ? comparisonValue : hasCompare ? sum('compare') : null
  const series: TrendSeries[] = [
    { key: 'value', label: currentLabel, color, area, labelKey: hasCompare ? 'label' : undefined },
    ...(hasCompare ? [{ key: 'compare', label: compareLabel, color: compareColor, dashed: true, labelKey: 'compareLabel' } as TrendSeries] : []),
  ]
  return (
    <div className={cx('kc-root', !bare && 'kc-card', className)}>
      <div className="kc-head">
        <h3 className="kc-title"><TitleTip tip={titleTip}>{title}</TitleTip></h3>
        {action && <div className="kc-action">{action}</div>}
      </div>
      <div className="kc-value-row">
        <span className="kc-value">{typeof headline === 'number' ? formatValue(headline, format) : headline}</span>
        {typeof headline === 'number' && cmpTotal !== null && <DeltaBadge cur={headline} prev={cmpTotal} invert={invertDelta} />}
      </div>
      <TrendChart
        data={data as unknown as Datum[]}
        series={series}
        format={format}
        height={height}
        referenceLines={referenceLines}
        tooltipTitle={hasCompare && typeof title === 'string' ? () => title : undefined}
        legend={hasCompare}
        emptyText={emptyText}
        loading={loading}
      />
      {footer && <div className="kc-footer">{footer}</div>}
    </div>
  )
}
