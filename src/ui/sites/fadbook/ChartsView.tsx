// Charts for campaigns / ad sets / ads: daily metric lines (one per entity when comparing a few),
// metric tiles to switch the chart, break-even reference lines from the store, and the delivery funnel.
import { useMemo, useState } from 'react'
import type { AdLevel, GameState } from '../../../core/types'
import { formatDate, type DateRange } from '../../../core/time'
import { breakEven } from '../../../sim/store'
import { AmCard, AmSelect, InfoTip, amFmt } from '../../kit/adsmanager'
import { CHART_COLORS, FunnelBars, SERIES_COLORS, TrendChart, type ChartFormat } from '../../kit/charts'
import { dailySeries, resultLabels, type AccountData, type Row } from './data'
import { METRIC_BY_ID, totalsRow, type StatRow } from './metrics'

export const CHART_METRICS: { id: string; label: string; format: ChartFormat }[] = [
  { id: 'results', label: 'Results', format: 'number' },
  { id: 'cpr', label: 'Cost per result', format: 'money' },
  { id: 'spend', label: 'Amount spent', format: 'money' },
  { id: 'roas', label: 'Purchase ROAS', format: 'decimal' },
  { id: 'cpm', label: 'CPM', format: 'money' },
  { id: 'ctr_link', label: 'CTR (link)', format: 'percent' },
  { id: 'cpc_link', label: 'CPC (link)', format: 'money' },
  { id: 'frequency', label: 'Frequency', format: 'decimal' },
  { id: 'hook_rate', label: 'Hook rate', format: 'percent' },
  { id: 'hold_rate', label: 'Hold rate', format: 'percent' },
  { id: 'impressions', label: 'Impressions', format: 'number' },
  { id: 'reach', label: 'Reach', format: 'number' },
  { id: 'atc', label: 'Adds to cart', format: 'number' },
  { id: 'purchases', label: 'Purchases', format: 'number' },
  { id: 'cpa', label: 'Cost per purchase', format: 'money' },
]

/** First day with any delivery under these rows (charts skip the empty days before launch). */
function firstDataDay(d: AccountData, level: AdLevel, rows: Row[]): number {
  const ids = new Set(rows.map(r => r.id))
  let first = Infinity
  for (const ad of d.ads) {
    const key = level === 'ad' ? ad.id : level === 'adset' ? ad.adSetId : ad.campaignId
    if (!ids.has(key)) continue
    for (const k in ad.stats) first = Math.min(first, Number(k))
    if (ad.lifetime.impressions > 0) first = 0
  }
  return first
}

export interface ChartsViewProps {
  s: GameState
  d: AccountData
  level: AdLevel
  /** rows in scope (selected rows, or every visible row) */
  rows: Row[]
  range: DateRange
  /** compact layout (drawer / phone) */
  narrow?: boolean
  defaultMetric?: string
}

export function ChartsView({ s, d, level, rows, range, narrow, defaultMetric = 'results' }: ChartsViewProps) {
  const [metric, setMetric] = useState(defaultMetric)
  const def = METRIC_BY_ID.get(metric)!
  const fmtDef = CHART_METRICS.find(m => m.id === metric)!
  const start = Math.max(range.from, Math.min(range.to, firstDataDay(d, level, rows)))
  const chartRange = { from: start, to: range.to }
  const compare = rows.length > 1 && rows.length <= 6
  const total: StatRow = useMemo(() => totalsRow(rows), [rows])

  const data = useMemo(() => {
    const ids = rows.map(r => r.id)
    const agg = dailySeries(d, level, ids, chartRange)
    const per = compare ? rows.map(r => ({ row: r, series: dailySeries(d, level, [r.id], chartRange) })) : []
    return agg.map((p, i) => {
      const point: Record<string, unknown> = { label: formatDate(p.day, 'md'), day: p.day }
      const aggRow: StatRow = { st: p.st, playSec: p.playSec, vidImps: p.vidImps, products: total.products, resultKind: total.resultKind }
      point.all = def.value?.(aggRow, s) ?? null
      for (const { row, series } of per) {
        const q = series[i]
        point[row.id] = def.value?.({ st: q.st, playSec: q.playSec, vidImps: q.vidImps, products: row.products, resultKind: row.resultKind }, s) ?? null
      }
      return point
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, d, level, chartRange.from, chartRange.to, metric, s])

  const product = total.products.length === 1 ? total.products[0] : null
  const be = product ? breakEven(s, product) : null
  const refLines: { value: number; label: string; color?: string }[] = []
  if (be && be.margin > 0) {
    if (metric === 'roas' && Number.isFinite(be.breakEvenRoas)) refLines.push({ value: be.breakEvenRoas, label: `Break-even ROAS ${be.breakEvenRoas.toFixed(2)}`, color: CHART_COLORS.critical })
    if ((metric === 'cpa' || (metric === 'cpr' && total.resultKind === 'purchase')) && be.breakEvenCpa > 0) {
      refLines.push({ value: be.breakEvenCpa, label: `Break-even CPA ${amFmt.money(be.breakEvenCpa)}`, color: CHART_COLORS.critical })
    }
  }

  const series = compare
    ? rows.map((r, i) => ({ key: r.id, label: r.name, color: SERIES_COLORS[i % SERIES_COLORS.length] }))
    : [{ key: 'all', label: fmtDef.label, color: CHART_COLORS.fadbook, area: true }]

  const tiles = ['results', 'cpr', 'spend', 'roas', 'cpm', 'ctr_link', 'frequency', 'hook_rate']
  const st = total.st
  const funnel = [
    { label: 'Impressions', value: st.impressions },
    { label: 'Link clicks', value: st.linkClicks },
    { label: 'Landing page views', value: st.lpv },
    { label: 'Adds to cart', value: st.atc },
    { label: 'Checkouts initiated', value: st.checkouts },
    { label: 'Purchases', value: st.purchases },
  ]
  const levelWord = level === 'campaign' ? 'campaign' : level === 'adset' ? 'ad set' : 'ad'
  const scopeText = rows.length === 0
    ? `No ${levelWord}s in view`
    : rows.length === 1 ? rows[0].name : `${rows.length} ${levelWord}s`

  return (
    <div className={`fb-charts${narrow ? ' fb-charts-narrow' : ''}`}>
      <div className="fb-tiles" role="tablist" aria-label="Chart metric">
        {tiles.map(id => {
          const m = METRIC_BY_ID.get(id)!
          const v = m.value?.(total, s) ?? null
          const on = id === metric
          return (
            <button key={id} type="button" role="tab" aria-selected={on} className={`fb-tile${on ? ' fb-tile-on' : ''}`} onClick={() => setMetric(id)}>
              <span className="fb-tile-label">{CHART_METRICS.find(c => c.id === id)?.label ?? m.label}</span>
              <span className="fb-tile-value">{(m.format ?? amFmt.int)(v)}</span>
              {id === 'results' && <span className="fb-tile-sub">{resultLabels(total.resultKind).results}</span>}
            </button>
          )
        })}
      </div>
      <AmCard
        title={<span>{fmtDef.label} <span className="fb-muted">· {scopeText}</span></span>}
        titleTip={def.description}
        actions={
          <AmSelect
            size="sm"
            value={metric}
            onChange={setMetric}
            width={190}
            ariaLabel="Metric"
            options={CHART_METRICS.map(m => ({ value: m.id, label: m.label }))}
          />
        }
      >
        {rows.length === 0 ? (
          <div className="fb-empty-chart">Select {levelWord}s or change the date range to see charts.</div>
        ) : (
          <TrendChart
            data={data}
            series={series}
            format={fmtDef.format}
            height={narrow ? 200 : 260}
            referenceLines={refLines}
            legend={compare}
            emptyText="No delivery in this date range."
          />
        )}
        {refLines.length > 0 && (
          <p className="fb-chart-note">
            Break-even comes from your Shopifly price, landed cost and payment fees for this product. Reported purchases can run above what your
            store actually received, so check Shopifly before scaling.
          </p>
        )}
      </AmCard>
      <AmCard title={<span>Delivery funnel <InfoTip content="Where people drop off between seeing your ad and buying. Reported conversions follow your attribution setting (7-day click or 1-day view)." /></span>}>
        {st.impressions > 0 ? <FunnelBars steps={funnel} variant={narrow ? 'rows' : 'columns'} /> : <div className="fb-empty-chart">No impressions in this date range.</div>}
      </AmCard>
    </div>
  )
}
