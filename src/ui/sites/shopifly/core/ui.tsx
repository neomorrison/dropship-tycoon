// Shared building blocks for the Shopifly admin pages (sf- classes in ../shopifly.css).
import type { ReactNode } from 'react'
import type { Day, Hour } from '../../../../core/types'
import { useGS } from '../../../../core/store'
import { dayOf } from '../../../../core/time'
import { Badge, Card, ComparisonPicker, DateRangePicker, InlineStack, Text, Thumbnail, Tooltip } from '../../../kit/polaris'
import { DeltaBadge, Sparkline, CHART_COLORS } from '../../../kit/charts'
import { cx } from '../../../kit/common'
import type { StatusBadge } from './orders'
import { SF_PRESETS, type SfRange } from './rangeState'
import { METRICS, formatMetric, type MetricKey } from './analytics'

/** Current in-game day (re-renders once per day). */
export const useToday = (): Day => useGS(s => dayOf(s.time.hour))
/** Current absolute hour (re-renders every tick). */
export const useNow = (): Hour => useGS(s => s.time.hour)

/** Dotted-underline metric title with a definition tooltip (Shopify analytics style). */
export function MetricTitle({ children, tip, size = 'sm' }: { children: ReactNode; tip?: ReactNode; size?: 'sm' | 'md' }) {
  const title = <span className={cx('sf-metric-title', size === 'md' && 'sf-metric-title-md')}>{children}</span>
  if (!tip) return title
  return (
    <Tooltip content={tip} hasUnderline width="wide">
      {title}
    </Tooltip>
  )
}

/** Date range + "Compare to" controls used at the top of analytics screens. */
export function RangeControls({ r, today, compare = true, size = 'medium' }: { r: SfRange; today: Day; compare?: boolean; size?: 'slim' | 'medium' }) {
  return (
    <InlineStack gap="200" blockAlign="center">
      <DateRangePicker value={r.value} onChange={r.setValue} today={today} presets={SF_PRESETS} size={size} />
      {compare && <ComparisonPicker value={r.compare} onChange={r.setCompare} range={r.range} size={size} />}
    </InlineStack>
  )
}

export interface MetricTileProps {
  metric?: MetricKey
  title?: ReactNode
  tip?: ReactNode
  value: number
  /** formatted override for the headline */
  display?: ReactNode
  prev?: number | null
  invert?: boolean
  spark?: number[]
  sparkCompare?: number[]
  active?: boolean
  onClick?: () => void
  className?: string
}

/** Metric pill: dotted-underline title, big value, delta vs the comparison period, sparkline. */
export function MetricTile({ metric, title, tip, value, display, prev, invert, spark, sparkCompare, active, onClick, className }: MetricTileProps) {
  const def = metric ? METRICS[metric] : undefined
  const body = (
    <>
      <MetricTitle tip={tip ?? def?.tip}>{title ?? def?.label}</MetricTitle>
      <div className="sf-tile-row">
        <span className="sf-tile-value">{display ?? (metric ? formatMetric(metric, value) : value)}</span>
        {prev !== undefined && prev !== null && <DeltaBadge cur={value} prev={prev} invert={invert ?? def?.invert} />}
        {prev === null && <span className="sf-tile-dash">—</span>}
      </div>
      {spark && spark.length > 1 && (
        <div className="sf-tile-spark">
          <Sparkline data={spark} compare={sparkCompare} width={96} height={28} color={CHART_COLORS.current} />
        </div>
      )}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={cx('sf-tile', 'sf-tile-button', active && 'sf-tile-active', className)} onClick={onClick} aria-pressed={active}>
        {body}
      </button>
    )
  }
  return <div className={cx('sf-tile', className)}>{body}</div>
}

/** Order status badge (payment or fulfillment). */
export function StatusBadgeView({ b }: { b: StatusBadge }) {
  return <Badge tone={b.tone} progress={b.progress}>{b.label}</Badge>
}

/** Product thumbnail + title cell. */
export function ProductCell({ src, title, sub, size = 'small' }: { src: string; title: ReactNode; sub?: ReactNode; size?: 'extraSmall' | 'small' | 'medium' }) {
  return (
    <div className="sf-product-cell">
      <Thumbnail source={src} alt={typeof title === 'string' ? title : 'Product'} size={size} />
      <div className="sf-product-cell-text">
        <Text as="span" fontWeight="medium" truncate>{title}</Text>
        {sub && <Text as="span" variant="bodySm" tone="subdued" truncate>{sub}</Text>}
      </div>
    </div>
  )
}

/** Key/value line used in summary cards ("Subtotal ........ $39.99"). */
export function SummaryLine({ label, sub, value, strong, tone }: { label: ReactNode; sub?: ReactNode; value: ReactNode; strong?: boolean; tone?: 'subdued' | 'critical' | 'success' }) {
  return (
    <div className={cx('sf-sum-line', strong && 'sf-sum-strong')}>
      <span className="sf-sum-label">{label}</span>
      <span className="sf-sum-sub">{sub}</span>
      <span className={cx('sf-sum-value', tone && `sf-tone-${tone}`)}>{value}</span>
    </div>
  )
}

/** Horizontal bar list with values (Shopify analytics "by source/device/product" cards). */
export function BarList({ rows, format, empty = 'No data for this date range' }: {
  rows: { label: ReactNode; value: number; sub?: ReactNode; key?: string }[]
  format: (v: number) => string
  empty?: ReactNode
}) {
  const max = Math.max(0, ...rows.map(r => r.value))
  if (!rows.length || max <= 0) return <div className="sf-empty-chart">{empty}</div>
  return (
    <div className="sf-barlist">
      {rows.map((r, i) => (
        <div className="sf-barlist-row" key={r.key ?? i}>
          <div className="sf-barlist-head">
            <span className="sf-barlist-label">{r.label}</span>
            <span className="sf-barlist-value">{format(r.value)}</span>
          </div>
          <div className="sf-barlist-track">
            <div className="sf-barlist-fill" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
          </div>
          {r.sub && <div className="sf-barlist-sub">{r.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/** Small uppercase-ish section label inside cards. */
export function CardHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="sf-card-heading">
      <Text as="h2" variant="headingSm">{children}</Text>
      {action && <div>{action}</div>}
    </div>
  )
}

/** Clickable row inside a card list (Home "things to do", setup guide items…). */
export function RowButton({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" className={cx('sf-row-button', className)} onClick={onClick}>
      {children}
    </button>
  )
}

/** Card with a padded title row and flush (unpadded) content: tables, lists. */
export function TableCard({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card padding="0">
      <div className="sf-tcard-head">
        {typeof title === 'string' ? <Text as="h2" variant="headingSm">{title}</Text> : title}
        {actions && <div className="sf-tcard-actions">{actions}</div>}
      </div>
      {children}
    </Card>
  )
}
