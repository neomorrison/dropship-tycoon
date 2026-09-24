// Analytics › Custom reports: pick a dimension (day, campaign, ad group, ad, video) and metrics,
// see a chart and a sortable table with totals.
import { useMemo, useState } from 'react'
import { Columns3 } from 'lucide-react'
import { formatDate } from '../../../../core/time'
import { addStats, emptyStats } from '../../../../sim/ads'
import { AmButton, AmCheckbox, AmDateRangePicker, AmMenu, AmSegmented, AmSelect, AmTable, MetricCell, type AmColumn } from '../../../kit/adsmanager'
import { BarChart, LineChartCard, CHART_COLORS } from '../../../kit/charts'
import { Panel, PageHead, useAccount, useGame, useToday, useTt } from '../common'
import { useStoredRange } from '../uiState'
import { METRICS, accountData, dailySeries, type Bundle, type MetricId } from '../data'

type Dim = 'day' | 'campaign' | 'adset' | 'ad' | 'video'
interface ReportRow { key: string; label: string; sub?: string; sort: number | string; b: Bundle }

const DIMS: { value: Dim; label: string }[] = [
  { value: 'day', label: 'Day' }, { value: 'campaign', label: 'Campaign' }, { value: 'adset', label: 'Ad group' }, { value: 'ad', label: 'Ad' }, { value: 'video', label: 'Video' },
]
const DEFAULT_METRICS: MetricId[] = ['cost', 'impressions', 'cpm', 'clicks', 'ctr', 'cpc', 'conversions', 'cpa', 'roas']
const METRIC_GROUPS = ['Basic data', 'Engagement', 'Video play', 'Conversion'] as const

export default function Analytics() {
  const s = useGame()
  const today = useToday()
  const { compact } = useTt()
  const { account } = useAccount()
  const acc = account!
  const [range, setRange] = useStoredRange('analytics', today, 'last7')
  const r = range.range
  const [dim, setDim] = useState<Dim>('day')
  const [metrics, setMetrics] = useState<MetricId[]>(DEFAULT_METRICS)
  const [chartMetric, setChartMetric] = useState<MetricId>('cost')
  const data = useMemo(() => accountData(s, acc.id, r), [s.ads, acc.id, r.from, r.to])

  const rows: ReportRow[] = useMemo(() => {
    if (dim === 'day') {
      return dailySeries(s, data.ads, r).map(x => ({ key: String(x.day), label: formatDate(x.day, 'iso'), sub: formatDate(x.day, 'medium').split(',')[0], sort: x.day, b: x.b }))
    }
    if (dim === 'campaign') return data.campaigns.map(c => ({ key: c.id, label: c.name, sub: c.status === 'deleted' ? 'Deleted' : undefined, sort: c.name, b: data.byCampaign.get(c.id)! }))
    if (dim === 'adset') return data.adSets.map(x => ({ key: x.id, label: x.name, sub: data.campaigns.find(c => c.id === x.campaignId)?.name, sort: x.name, b: data.byAdSet.get(x.id)! }))
    if (dim === 'ad') return data.ads.map(a => ({ key: a.id, label: a.name, sub: data.adSets.find(x => x.id === a.adSetId)?.name, sort: a.name, b: data.byAd.get(a.id)! }))
    const byCreative = new Map<string, Bundle>()
    for (const a of data.ads) {
      const b = byCreative.get(a.creativeId) ?? { stats: emptyStats(), conv: 0 }
      const ab = data.byAd.get(a.id)!
      addStats(b.stats, ab.stats)
      b.conv += ab.conv
      byCreative.set(a.creativeId, b)
    }
    return [...byCreative.entries()].map(([id, b]) => {
      const c = s.creatives.creatives.find(x => x.id === id)
      return { key: id, label: c?.name ?? 'Deleted video', sub: c ? `${Math.round(c.durationSec)}s · ${c.isVideo ? 'Video' : 'Image'}` : undefined, sort: c?.name ?? '', b }
    })
  }, [dim, data, s.creatives.creatives, r.from, r.to])
  const shown = dim === 'day' ? rows : rows.filter(x => x.b.stats.impressions > 0 || x.b.stats.spend > 0)
  const total = useMemo(() => {
    const b: Bundle = { stats: emptyStats(), conv: 0 }
    for (const x of shown) { addStats(b.stats, x.b.stats); b.conv += x.b.conv }
    return b
  }, [shown])

  const cm = METRICS[metrics.includes(chartMetric) ? chartMetric : metrics[0] ?? 'cost']
  const cols: AmColumn<ReportRow>[] = [
    {
      id: 'dim', header: DIMS.find(d => d.value === dim)!.label, width: dim === 'day' ? 150 : 260, sticky: true, sortValue: x => x.sort,
      render: x => <div className="tt-col" style={{ gap: 1, minWidth: 0 }}><span className="am-cell-clip" style={{ fontWeight: 500 }}>{x.label}</span>{x.sub && <span className="tt-faint tt-small am-cell-clip">{x.sub}</span>}</div>,
    },
    ...metrics.map((id): AmColumn<ReportRow> => {
      const m = METRICS[id]
      return {
        id, header: m.label, headerTip: m.description, align: 'right', width: Math.max(112, Math.min(240, m.label.length * 7.4 + 58)),
        sortValue: x => m.value(x.b), render: x => <MetricCell value={m.format(m.value(x.b))} />, total: () => <MetricCell value={m.format(m.value(total))} />,
      }
    }),
  ]

  const metricPicker = (
    <AmMenu
      width={300}
      placement="bottom-end"
      closeOnSelect={false}
      trigger={<AmButton icon={Columns3} caret>Metrics ({metrics.length})</AmButton>}
    >
      <div className="tt-col" style={{ gap: 10, padding: '6px 8px', maxHeight: 360, overflow: 'auto' }}>
        {METRIC_GROUPS.map(g => (
          <div key={g} className="tt-col" style={{ gap: 6 }}>
            <span className="tt-faint tt-small" style={{ fontWeight: 600 }}>{g}</span>
            {Object.values(METRICS).filter(m => m.category === g).map(m => (
              <AmCheckbox
                key={m.id}
                checked={metrics.includes(m.id)}
                label={m.label}
                onChange={on => setMetrics(cur => (on ? [...cur, m.id].slice(0, 14) : cur.filter(x => x !== m.id)))}
              />
            ))}
          </div>
        ))}
      </div>
    </AmMenu>
  )

  return (
    <div className="tt-page">
      <PageHead title="Custom report" crumbs={[{ label: 'Analytics' }, { label: 'Custom reports' }]} actions={<AmDateRangePicker value={range} onChange={setRange} today={today} size={compact ? 'sm' : 'md'} />} />
      <Panel>
        <div className="tt-row" style={{ gap: 12 }}>
          <span className="tt-muted tt-small">Dimension</span>
          <AmSegmented value={dim} onChange={setDim} options={DIMS} ariaLabel="Dimension" />
          <div className="tt-spacer" />
          {metricPicker}
        </div>
      </Panel>
      <Panel
        title="Trend"
        actions={<AmSelect value={cm.id} onChange={v => setChartMetric(v)} options={metrics.map(id => ({ value: id, label: METRICS[id].label }))} width={240} size="sm" />}
      >
        {dim === 'day' ? (
          <LineChartCard
            bare
            title={cm.label}
            titleTip={cm.description}
            value={cm.value(total) ?? '—'}
            format={cm.chart}
            data={rows.map(x => ({ label: formatDate(Number(x.key), 'md'), value: cm.value(x.b) }))}
            color={CHART_COLORS.tiktak}
            height={compact ? 180 : 240}
            emptyText="No data for this date range."
          />
        ) : shown.length ? (
          <BarChart
            orientation="horizontal"
            data={[...shown].sort((a, b) => (cm.value(b.b) ?? -Infinity) - (cm.value(a.b) ?? -Infinity)).slice(0, 10).map(x => ({ label: x.label, value: cm.value(x.b) ?? 0 }))}
            format={cm.chart}
            color={CHART_COLORS.tiktak}
            maxItems={10}
          />
        ) : (
          <span className="tt-muted tt-small">No delivery in this date range.</span>
        )}
      </Panel>
      <Panel title="Data" pad={false}>
        <div style={{ padding: '12px 16px 16px' }}>
          <AmTable
            rows={shown}
            columns={cols}
            rowKey={x => x.key}
            selectable={false}
            entityName={dim === 'day' ? { singular: 'day', plural: 'days' } : dim === 'video' ? { singular: 'video', plural: 'videos' } : dim === 'adset' ? { singular: 'ad group', plural: 'ad groups' } : { singular: dim, plural: `${dim}s` }}
            defaultSort={dim === 'day' ? { columnId: 'dim', direction: 'desc' } : { columnId: 'cost', direction: 'desc' }}
            maxHeight={520}
          />
        </div>
      </Panel>
    </div>
  )
}
