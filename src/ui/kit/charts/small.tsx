// Tiny SVG charts that render in table cells and metric pills without recharts:
// Sparkline and GaugeRing (score ring for the page grade).
import { useId, type ReactNode } from 'react'
import { cx } from '../common/utils'
import { CHART_COLORS } from './shared'
import './charts.css'

export interface SparklineProps {
  /** values in order (nulls are skipped) */
  data: (number | null | undefined)[]
  width?: number
  height?: number
  /** line color (default Shopify blue) */
  color?: string
  /** soft fill under the line (default true) */
  area?: boolean
  /** dot on the last point (default true) */
  endDot?: boolean
  /** dashed comparison line drawn behind */
  compare?: (number | null | undefined)[]
  compareColor?: string
  /** include 0 in the y-range (default true, so small numbers don't look dramatic) */
  zeroBaseline?: boolean
  ariaLabel?: string
  className?: string
}
/** Minimal trend line for metric pills and table cells. */
export function Sparkline({
  data, width = 80, height = 28, color = CHART_COLORS.current, area = true, endDot = true, compare, compareColor = CHART_COLORS.comparison,
  zeroBaseline = true, ariaLabel, className,
}: SparklineProps) {
  const gid = `kc-sp${useId().replace(/:/g, '')}`
  const vals = [...data, ...(compare ?? [])].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const pad = 3
  if (!vals.length) {
    return (
      <svg className={cx('kc-spark', className)} width={width} height={height} role="img" aria-label={ariaLabel ?? 'No data'}>
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke={CHART_COLORS.grid} strokeWidth={2} strokeLinecap="round" />
      </svg>
    )
  }
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (zeroBaseline) lo = Math.min(0, lo)
  if (hi === lo) hi = lo + 1
  const n = Math.max(data.length, compare?.length ?? 0)
  const x = (i: number) => pad + (n <= 1 ? (width - 2 * pad) / 2 : (i * (width - 2 * pad)) / (n - 1))
  const y = (v: number) => height - pad - ((v - lo) / (hi - lo)) * (height - 2 * pad)
  const path = (arr: (number | null | undefined)[]) => {
    let d = ''
    let pen = false
    arr.forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const line = path(data)
  const lastIdx = data.map((v, i) => (typeof v === 'number' && Number.isFinite(v) ? i : -1)).filter(i => i >= 0).pop()
  const firstIdx = data.findIndex(v => typeof v === 'number' && Number.isFinite(v))
  const areaPath =
    area && lastIdx !== undefined && firstIdx >= 0 ? `${line}L${x(lastIdx).toFixed(1)},${height - pad}L${x(firstIdx).toFixed(1)},${height - pad}Z` : ''
  return (
    <svg className={cx('kc-spark', className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel ?? 'Trend'}>
      {area && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {compare && <path d={path(compare)} fill="none" stroke={compareColor} strokeWidth={1.5} strokeDasharray="3 3" strokeLinecap="round" />}
      {areaPath && <path d={areaPath} fill={`url(#${gid})`} stroke="none" />}
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {endDot && lastIdx !== undefined && (
        <circle cx={x(lastIdx)} cy={y(data[lastIdx] as number)} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
      )}
    </svg>
  )
}

export interface GaugeRingProps {
  /** 0–100 */
  value: number
  /** px (default 88) */
  size?: number
  thickness?: number
  /** big center text (default the rounded value) */
  label?: ReactNode
  /** small text under the label, e.g. "/ 100" or "Page grade" */
  sublabel?: ReactNode
  /** explicit color; default by thresholds (critical < 50 ≤ warning < 70 ≤ good) */
  color?: string
  /** thresholds for the automatic color [warningFrom, goodFrom] */
  thresholds?: [number, number]
  ariaLabel?: string
}
/** Circular score meter (page grade, account quality). Color is never the only signal: the number is always shown. */
export function GaugeRing({ value, size = 88, thickness = 8, label, sublabel, color, thresholds = [50, 70], ariaLabel }: GaugeRingProps) {
  const v = Math.max(0, Math.min(100, value))
  const auto = v >= thresholds[1] ? CHART_COLORS.good : v >= thresholds[0] ? CHART_COLORS.warning : CHART_COLORS.critical
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="kc-ring" style={{ width: size, height: size }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={ariaLabel ?? 'Score'}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CHART_COLORS.track} strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? auto}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="kc-ring-center">
        <b style={{ fontSize: Math.round(size * 0.26) }}>{label ?? Math.round(v)}</b>
        {sublabel && <span style={{ fontSize: Math.max(10, Math.round(size * 0.12)) }}>{sublabel}</span>}
      </span>
    </span>
  )
}
