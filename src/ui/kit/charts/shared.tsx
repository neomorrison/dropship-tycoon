// Chart kit shared bits: value formats, the Shopify analytics colors, a validated
// categorical palette, and the hover tooltip bubble used by every chart.
import type { ReactNode } from 'react'
import './charts.css'

/** How to format values on axes, tooltips and labels. */
export type ChartFormat = 'money' | 'money0' | 'number' | 'percent' | 'percent1' | 'decimal' | 'roas' | ((v: number) => string)

/** Shopify analytics look: current period solid blue, comparison dashed light blue. */
export const CHART_COLORS = {
  current: '#2c6ecb',
  comparison: '#9ec3f2',
  grid: '#ebebeb',
  axis: '#616161',
  muted: '#b5b5b5',
  track: '#f1f1f1',
  good: '#29845a',
  warning: '#e8a200',
  critical: '#e51c00',
  /** TikTak teal / Fadbook blue for Ads Manager charts */
  tiktak: '#00b2b4',
  fadbook: '#0866ff',
} as const

/**
 * Categorical series colors in a FIXED order (validated with the dataviz palette checker:
 * adjacent CVD ΔE ≥ 9.1, normal-vision ΔE ≥ 19.6 on white). Assign by entity, never by rank;
 * a 9th category folds into "Other". Aqua/yellow/magenta sit under 3:1 contrast, so charts
 * using them always show a legend with values.
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] as const

const fin = (v: number) => Number.isFinite(v)

/** Full-precision formatting for tooltips and labels. */
export function formatValue(v: number | null | undefined, fmt: ChartFormat = 'number'): string {
  if (v === null || v === undefined || !fin(v)) return '—'
  if (typeof fmt === 'function') return fmt(v)
  switch (fmt) {
    case 'money': return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'money0': return `${v < 0 ? '-' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`
    case 'percent': return `${(v * 100).toFixed(2)}%`
    case 'percent1': return `${(v * 100).toFixed(1)}%`
    case 'decimal': return v.toFixed(2)
    case 'roas': return `${v.toFixed(2)}x`
    default: return Math.round(v).toLocaleString('en-US')
  }
}

/** Compact axis ticks: $0, $500, $1.2K, 1.5M, 2.5%. */
export function formatAxis(v: number, fmt: ChartFormat = 'number'): string {
  if (!fin(v)) return ''
  if (typeof fmt === 'function') return fmt(v)
  const a = Math.abs(v)
  const short = (n: number) => (a >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : `${+n.toFixed(a < 10 && a % 1 ? 1 : 0)}`)
  switch (fmt) {
    case 'money':
    case 'money0': return `${v < 0 ? '-' : ''}$${short(Math.abs(v))}`
    case 'percent':
    case 'percent1': return `${+(v * 100).toFixed(a < 0.1 ? 1 : 0)}%`
    case 'decimal':
    case 'roas': return v.toFixed(1)
    default: return `${v < 0 ? '-' : ''}${short(Math.abs(v))}`
  }
}

/** Percent change with direction; null when there is no baseline. */
export function percentChange(cur: number, prev: number | null | undefined): { pct: number; dir: 'up' | 'down' | 'flat' } | null {
  if (prev === null || prev === undefined || !fin(prev) || prev === 0 || !fin(cur)) return null
  const pct = (cur - prev) / Math.abs(prev)
  return { pct, dir: Math.abs(pct) < 0.005 ? 'flat' : pct > 0 ? 'up' : 'down' }
}

export interface TipRow {
  color: string
  dashed?: boolean
  label: ReactNode
  value: ReactNode
}
/** Tooltip bubble: header + rows with a line/swatch key (text stays in text colors). */
export function ChartTip({ title, rows, footer }: { title?: ReactNode; rows: TipRow[]; footer?: ReactNode }) {
  return (
    <div className="kc-tip">
      {title && <div className="kc-tip-title">{title}</div>}
      {rows.map((r, i) => (
        <div key={i} className="kc-tip-row">
          <span className={r.dashed ? 'kc-key kc-key-dashed' : 'kc-key'} style={{ color: r.color }} />
          <span className="kc-tip-label">{r.label}</span>
          <span className="kc-tip-value">{r.value}</span>
        </div>
      ))}
      {footer && <div className="kc-tip-foot">{footer}</div>}
    </div>
  )
}

/** Legend item: short line key (solid/dashed) or square swatch + text. */
export function LegendItem({ color, label, dashed, swatch }: { color: string; label: ReactNode; dashed?: boolean; swatch?: boolean }) {
  return (
    <span className="kc-legend-item">
      <span className={swatch ? 'kc-swatch' : dashed ? 'kc-key kc-key-dashed' : 'kc-key'} style={{ color, background: swatch ? color : undefined }} />
      <span>{label}</span>
    </span>
  )
}
