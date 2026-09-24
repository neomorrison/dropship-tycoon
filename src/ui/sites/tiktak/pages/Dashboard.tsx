// Dashboard: account overview, KPI cards with period-over-period change, trend chart,
// learning-phase and review status, top campaigns.
import { useMemo } from 'react'
import { CreditCard, Plus } from 'lucide-react'
import { previousRange, formatDate } from '../../../../core/time'
import { accountSpendLimit, learningProgress, nextBillingThreshold, deliveryLabel } from '../../../../sim/ads'
import { AmButton, AmDateRangePicker, AmTable, AmNameCell, MetricCell, StatusCell, amFmt, type AmColumn } from '../../../kit/adsmanager'
import { LineChartCard, CHART_COLORS } from '../../../kit/charts'
import { cx } from '../../../kit/common'
import { AccountBanners, Delta, EmptyBlock, Panel, PageHead, Pill, useAccount, useGame, useToday, useTt } from '../common'
import { useStoredRange, useTtUi } from '../uiState'
import {
  DASH_METRICS, METRICS, accountData, accountStatusText, breakEvenFor, dailySeries, landingProductOf, type Bundle, type MetricId,
} from '../data'

interface TopRow { id: string; name: string; b: Bundle; label: ReturnType<typeof deliveryLabel> }

export default function Dashboard() {
  const s = useGame()
  const today = useToday()
  const { navigate, compact } = useTt()
  const { account } = useAccount()
  const acc = account!
  const [range, setRange] = useStoredRange('dashboard', today, 'last7')
  const metricSel = useTtUi(st => st.dashMetrics)
  const setUi = useTtUi(st => st.set)
  const metric: MetricId = (metricSel[0] as MetricId) in METRICS ? (metricSel[0] as MetricId) : 'cost'
  const r = range.range
  const prev = previousRange(r)

  const ads = s.ads
  const data = useMemo(() => accountData(s, acc.id, r), [ads, acc.id, r.from, r.to])
  const prevData = useMemo(() => accountData(s, acc.id, prev), [ads, acc.id, prev.from, prev.to])
  const series = useMemo(() => dailySeries(s, data.ads, r), [ads, data.ads, r.from, r.to])
  const prevSeries = useMemo(() => dailySeries(s, data.ads, prev), [ads, data.ads, prev.from, prev.to])
  const todayData = useMemo(() => accountData(s, acc.id, { from: today, to: today }), [ads, acc.id, today])

  const m = METRICS[metric]
  const mainProduct = landingProductOf(data.ads.filter(a => (data.byAd.get(a.id)?.stats.spend ?? 0) > 0)) ?? landingProductOf(data.ads)
  const be = breakEvenFor(s, mainProduct)
  const refLines = be && metric === 'roas'
    ? [{ value: be.roas, label: `Break-even ROAS ${be.roas.toFixed(2)}`, color: CHART_COLORS.critical }]
    : be && metric === 'cpa'
      ? [{ value: be.cpa, label: `Break-even CPA ${amFmt.money(be.cpa)}`, color: CHART_COLORS.critical }]
      : undefined
  const chartData = series.map((x, i) => {
    const p = prevSeries[i]
    return { label: formatDate(x.day, 'md'), value: m.value(x.b), compare: p ? m.value(p.b) : null, compareLabel: p ? formatDate(p.day, 'md') : undefined }
  })

  const topRows: TopRow[] = useMemo(() => data.campaigns
    .filter(c => c.status !== 'deleted')
    .map(c => ({ id: c.id, name: c.name, b: data.byCampaign.get(c.id)!, label: deliveryLabel(s, 'campaign', c.id) }))
    .sort((a, b) => b.b.stats.spend - a.b.stats.spend)
    .slice(0, 8), [data, s])

  const learning = data.adSets
    .filter(x => x.status === 'active')
    .map(x => ({ set: x, lp: learningProgress(s, x.id) }))
    .filter(x => x.lp && x.lp.state !== 'active')
  const review = data.ads.filter(a => a.status !== 'deleted' && (a.review === 'in_review' || a.review === 'rejected'))

  const limit = accountSpendLimit(s, acc.id)
  const threshold = nextBillingThreshold(s, acc.id)
  const st = accountStatusText(acc)

  const topCols: AmColumn<TopRow>[] = [
    { id: 'name', header: 'Campaign name', width: compact ? 170 : 260, sticky: true, render: r2 => <AmNameCell name={r2.name} onClick={() => { setUi({ selected: { campaign: [r2.id], adset: [], ad: [] }, level: 'adset' }); navigate('campaign/adgroup') }} /> },
    { id: 'status', header: 'Status', width: 140, render: r2 => <StatusCell label={r2.label.label} detail={r2.label.label === 'Not delivering' ? r2.label.detail : undefined} /> },
    { id: 'cost', header: 'Cost', align: 'right', width: 110, sortValue: r2 => r2.b.stats.spend, render: r2 => <MetricCell value={amFmt.money(r2.b.stats.spend)} /> },
    { id: 'conv', header: 'Conversions', align: 'right', width: 110, sortValue: r2 => r2.b.conv, render: r2 => <MetricCell value={amFmt.int(r2.b.conv)} /> },
    { id: 'cpa', header: 'Cost per conversion', align: 'right', width: 150, render: r2 => <MetricCell value={amFmt.ratio(r2.b.stats.spend, r2.b.conv, amFmt.money)} /> },
    { id: 'roas', header: 'Total complete payment ROAS', align: 'right', width: 200, render: r2 => <MetricCell value={amFmt.ratio(r2.b.stats.purchaseValue, r2.b.stats.spend, amFmt.roas)} /> },
  ]

  return (
    <div className="tt-page">
      <PageHead
        title="Dashboard"
        actions={<AmDateRangePicker value={range} onChange={setRange} today={today} size={compact ? 'sm' : 'md'} />}
      />
      <AccountBanners s={s} account={acc} />

      <div className="tt-grid2">
        <div className="tt-col" style={{ gap: 16 }}>
          <Panel title="Overview" actions={prev.to >= 0 ? <span className="tt-faint tt-small">vs. {prev.from === prev.to ? formatDate(Math.max(0, prev.from), 'md') : `${formatDate(Math.max(0, prev.from), 'md')} – ${formatDate(prev.to, 'md')}`}</span> : <span className="tt-faint tt-small">No earlier period to compare</span>}>
            <div className="tt-col" style={{ gap: 14 }}>
              <div className="tt-kpis">
                {DASH_METRICS.map(id => {
                  const md = METRICS[id]
                  const cur = md.value(data.total)
                  const pv = md.value(prevData.total)
                  const on = id === metric
                  return (
                    <button key={id} type="button" className={cx('tt-kpi', on && 'tt-kpi-on')} style={{ ['--tt-kpi-color' as string]: CHART_COLORS.tiktak }} onClick={() => setUi({ dashMetrics: [id] })} aria-pressed={on}>
                      <span className="tt-kpi-label">{md.label}</span>
                      <span className="tt-kpi-value">{md.format(cur)}</span>
                      <span className="tt-kpi-foot"><Delta cur={cur} prev={pv} invert={md.invert} /><span>vs. previous</span></span>
                    </button>
                  )
                })}
              </div>
              <LineChartCard
                bare
                title={m.label}
                titleTip={m.description}
                value={m.value(data.total) ?? amFmt.dash}
                comparisonValue={m.value(prevData.total)}
                invertDelta={m.invert}
                format={m.chart}
                data={chartData}
                color={CHART_COLORS.tiktak}
                currentLabel={`${formatDate(r.from, 'md')} – ${formatDate(r.to, 'md')}`}
                compareLabel={`${formatDate(prev.from, 'md')} – ${formatDate(prev.to, 'md')}`}
                referenceLines={refLines}
                height={compact ? 180 : 230}
                emptyText="No data for this date range yet."
                footer={be && (metric === 'roas' || metric === 'cpa') ? <span className="tt-faint tt-small">Break-even from your Shopifly costs for “{be.product.title}”.</span> : undefined}
              />
            </div>
          </Panel>

          <Panel title="Campaign performance" pad={false} actions={<AmButton size="sm" variant="link" onClick={() => navigate('campaign')}>View all</AmButton>}>
            {topRows.length === 0 ? (
              <EmptyBlock
                title="No campaigns yet"
                body="Create a Web conversions campaign to put your product videos in front of shoppers on the For You feed."
                action={<AmButton variant="primary" icon={Plus} onClick={() => navigate('campaign/create')}>Create campaign</AmButton>}
              />
            ) : (
              <div style={{ padding: '12px 16px 16px' }}>
                <AmTable rows={topRows} columns={topCols} rowKey={x => x.id} selectable={false} totals={false} maxHeight={360} defaultSort={{ columnId: 'cost', direction: 'desc' }} />
              </div>
            )}
          </Panel>
        </div>

        <div className="tt-col" style={{ gap: 16 }}>
          <Panel title="Account" actions={<Pill tone={st.tone === 'success' ? 'success' : st.tone === 'info' ? 'info' : 'critical'} dot>{st.label}</Pill>}>
            <div className="tt-col" style={{ gap: 12 }}>
              <div className="tt-grid-half" style={{ gap: 10 }}>
                <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Today&apos;s cost</span><span className="tt-kpi-value">{amFmt.money(todayData.total.stats.spend)}</span><span className="tt-kpi-foot">{amFmt.int(todayData.total.conv)} conversions</span></div>
                <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Daily spending limit</span><span className="tt-kpi-value">{Number.isFinite(limit) ? amFmt.money0(limit) : 'No limit'}</span><span className="tt-kpi-foot">Account level</span></div>
              </div>
              <div className="tt-col" style={{ gap: 6 }}>
                <div className="tt-row" style={{ justifyContent: 'space-between' }}>
                  <span className="tt-muted tt-small">Unbilled balance</span>
                  <span className="tt-strong tt-num">{amFmt.money(acc.unbilled)} <span className="tt-faint" style={{ fontWeight: 400 }}>/ {amFmt.money0(threshold)} threshold</span></span>
                </div>
                <div className={cx('tt-progress', acc.status === 'payment_failed' && 'tt-progress-crit')}><span style={{ width: `${Math.min(100, (acc.unbilled / Math.max(1, threshold)) * 100)}%` }} /></div>
                <span className="tt-faint tt-small">You&apos;re charged automatically when your balance reaches the billing threshold, and on the 1st of each month.</span>
              </div>
              <AmButton size="sm" icon={CreditCard} onClick={() => navigate('billing')}>Payment</AmButton>
            </div>
          </Panel>

          <Panel title="Learning phase">
            {learning.length === 0 ? (
              <span className="tt-muted tt-small">No ad groups are in the learning phase. Stable delivery: avoid big budget and targeting edits.</span>
            ) : (
              <div className="tt-list">
                {learning.slice(0, 6).map(({ set, lp }) => (
                  <div key={set.id} className="tt-list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <div className="tt-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                      <span className="tt-list-title">{set.name}</span>
                      <Pill tone={lp!.state === 'learning_limited' ? 'warning' : 'info'}>{lp!.state === 'learning_limited' ? 'Learning limited' : 'Learning'}</Pill>
                    </div>
                    <div className={cx('tt-progress', lp!.state === 'learning_limited' && 'tt-progress-warn')}><span style={{ width: `${Math.min(100, (lp!.conversions / lp!.needed) * 100)}%` }} /></div>
                    <span className="tt-faint tt-small">
                      {lp!.hasPixel ? `${lp!.conversions} of ${lp!.needed} conversions in the last 7 days` : 'No pixel events: can\'t exit learning'}
                      {lp!.state === 'learning' && lp!.hasPixel ? ` · ${lp!.daysLeft} day${lp!.daysLeft === 1 ? '' : 's'} left` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Ad review" actions={review.length > 0 ? <AmButton size="sm" variant="link" onClick={() => { setUi({ level: 'ad', statusFilter: 'all_but_deleted' }); navigate('campaign/ad') }}>Manage ads</AmButton> : undefined}>
            {review.length === 0 ? (
              <span className="tt-muted tt-small">No ads are in review or rejected.</span>
            ) : (
              <div className="tt-list">
                {review.slice(0, 6).map(a => (
                  <div key={a.id} className="tt-list-item">
                    <div className="tt-list-main">
                      <span className="tt-list-title">{a.name}</span>
                      <span className="tt-list-sub" title={a.rejectReason}>{a.review === 'rejected' ? a.rejectReason ?? 'Not approved' : 'Usually reviewed within 24 hours'}</span>
                    </div>
                    <Pill tone={a.review === 'rejected' ? 'critical' : 'info'}>{a.review === 'rejected' ? 'Rejected' : 'In review'}</Pill>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
