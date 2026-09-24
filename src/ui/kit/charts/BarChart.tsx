// Bar charts: vertical columns (recharts) for time/category series, and Shopify's
// horizontal "label · bar · value" lists (sessions by device, top products…).
import type { ReactNode } from 'react'
import {
  Bar, BarChart as RBarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from 'recharts'
import { cx } from '../common/utils'
import { CHART_COLORS, ChartTip, LegendItem, formatAxis, formatValue, type ChartFormat } from './shared'
import './charts.css'

export interface BarDatum {
  label: string
  value: number
  /** comparison-period value (second, lighter bar / thin marker) */
  compare?: number | null
  /** per-bar color (categorical identity); default: `color` prop */
  color?: string
  /** secondary text under the value in horizontal lists */
  sublabel?: ReactNode
}
export interface BarChartProps {
  data: BarDatum[]
  format?: ChartFormat
  /** 'vertical' columns (default) or 'horizontal' labelled rows */
  orientation?: 'vertical' | 'horizontal'
  color?: string
  compareColor?: string
  /** vertical chart height (default 220) */
  height?: number
  /** legend labels when compare values exist */
  currentLabel?: ReactNode
  compareLabel?: ReactNode
  /** value labels on the bar ends (vertical: default when ≤ 12 bars) */
  showValues?: boolean
  /** horizontal: keep the top N rows and fold the rest into "Other" */
  maxItems?: number
  /** horizontal: show each row's share of the total under its value */
  showShare?: boolean
  emptyText?: ReactNode
  onBarClick?: (d: BarDatum) => void
  className?: string
}

function foldOther(data: BarDatum[], max?: number): BarDatum[] {
  if (!max || data.length <= max) return data
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const keep = sorted.slice(0, max - 1)
  const rest = sorted.slice(max - 1)
  return [...keep, { label: `Other (${rest.length})`, value: rest.reduce((s, d) => s + d.value, 0), color: CHART_COLORS.muted }]
}

/** Column or horizontal bar chart. Bars are ≤ 24px thick with 4px rounded ends. */
export function BarChart({
  data, format = 'number', orientation = 'vertical', color = CHART_COLORS.current, compareColor = CHART_COLORS.comparison, height = 220,
  currentLabel = 'Current period', compareLabel = 'Previous period', showValues, maxItems, showShare, emptyText, onBarClick, className,
}: BarChartProps) {
  const hasCompare = data.some(d => d.compare !== undefined && d.compare !== null)
  const empty = !data.length || data.every(d => !d.value && !d.compare)

  if (orientation === 'horizontal') {
    const rows = foldOther(data, maxItems)
    const max = Math.max(1e-9, ...rows.map(d => Math.max(d.value, d.compare ?? 0)))
    const total = rows.reduce((s, d) => s + d.value, 0)
    return (
      <div className={cx('kc-root', className)}>
        {empty ? (
          <div className="kc-legend" style={{ justifyContent: 'center', padding: '24px 0' }}>{emptyText ?? 'No data for this date range'}</div>
        ) : (
          <div className="kc-hbars" role="list">
            {rows.map(d => (
              <div
                key={d.label}
                className="kc-hbar"
                role="listitem"
                onClick={onBarClick ? () => onBarClick(d) : undefined}
                style={onBarClick ? { cursor: 'pointer' } : undefined}
                title={`${d.label}: ${formatValue(d.value, format)}${hasCompare && d.compare !== undefined && d.compare !== null ? ` (was ${formatValue(d.compare, format)})` : ''}`}
              >
                <span className="kc-hbar-label">{d.label}</span>
                <span className="kc-hbar-track">
                  <span className="kc-hbar-fill" style={{ width: `${Math.max(d.value > 0 ? 1.5 : 0, (d.value / max) * 100)}%`, background: d.color ?? color }} />
                  {hasCompare && d.compare !== undefined && d.compare !== null && (
                    <span className="kc-hbar-cmp" style={{ width: `${(d.compare / max) * 100}%`, background: compareColor }} />
                  )}
                </span>
                <span className="kc-hbar-value">
                  {formatValue(d.value, format)}
                  {(d.sublabel || showShare) && <small>{d.sublabel ?? `${total ? ((d.value / total) * 100).toFixed(1) : '0.0'}%`}</small>}
                </span>
              </div>
            ))}
          </div>
        )}
        {hasCompare && !empty && (
          <div className="kc-legend">
            <LegendItem color={color} label={currentLabel} swatch />
            <LegendItem color={compareColor} label={compareLabel} />
          </div>
        )}
      </div>
    )
  }

  const labelsOn = showValues ?? data.length <= 12
  const renderTip = (p: TooltipContentProps) => {
    if (!p.active || !p.payload?.length) return null
    const d = p.payload[0]?.payload as BarDatum | undefined
    if (!d) return null
    return (
      <ChartTip
        title={d.label}
        rows={[
          { color: d.color ?? color, label: hasCompare ? currentLabel : 'Value', value: formatValue(d.value, format) },
          ...(hasCompare ? [{ color: compareColor, label: compareLabel, value: formatValue(d.compare ?? null, format) }] : []),
        ]}
      />
    )
  }
  return (
    <div className={cx('kc-root', className)}>
      <div className="kc-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height }}>
          <RBarChart data={data} margin={{ top: labelsOn ? 20 : 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} tick={{ fontSize: 11, fill: CHART_COLORS.axis }} interval="preserveStartEnd" minTickGap={12} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickFormatter={(v: number) => formatAxis(v, format)} width="auto" />
            {!empty && <Tooltip content={renderTip} cursor={{ fill: 'rgba(0,0,0,0.04)' }} isAnimationActive={false} wrapperStyle={{ zIndex: 5, outline: 'none' }} />}
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
              onClick={onBarClick ? (entry: { payload?: BarDatum }) => entry.payload && onBarClick(entry.payload) : undefined}
              cursor={onBarClick ? 'pointer' : undefined}
            >
              {data.map((d, i) => <Cell key={i} fill={d.color ?? color} />)}
              {labelsOn && (
                <LabelList dataKey="value" position="top" offset={6} fontSize={11} fill="#303030" formatter={(v: unknown) => (typeof v === 'number' ? formatAxis(v, format) : '')} />
              )}
            </Bar>
            {hasCompare && <Bar dataKey="compare" radius={[4, 4, 0, 0]} maxBarSize={24} fill={compareColor} isAnimationActive={false} />}
          </RBarChart>
        </ResponsiveContainer>
        {empty && <div className="kc-empty">{emptyText ?? 'No data for this date range'}</div>}
      </div>
      {hasCompare && !empty && (
        <div className="kc-legend">
          <LegendItem color={color} label={currentLabel} swatch />
          <LegendItem color={compareColor} label={compareLabel} swatch />
        </div>
      )}
    </div>
  )
}
