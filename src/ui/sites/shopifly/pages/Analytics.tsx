// Analytics dashboard: date range + compare, top metrics bar, and the Shopify card grid
// (sales, breakdown, sessions, conversion funnel, AOV, orders, device, social source, products,
// returning customers, marketing attribution, landing pages, locations).
import { useMemo, type ReactNode } from 'react'
import type { ShopiflyPageProps } from '../route'
import type { GameState, TrafficSource } from '../../../../core/types'
import { getGS, useGSShallow } from '../../../../core/store'
import { dayOf } from '../../../../core/time'
import { sourceLabel } from '../../../../sim/store'
import { Card, InlineGrid, InlineStack, Link, Page, PolarisProvider, Text } from '../../../kit/polaris'
import { DeltaBadge, LineChartCard } from '../../../kit/charts'
import { formatRange } from '../../../kit/common'
import { aggregate, dailyValues, formatMetric, metricOf, seriesPoints, zeroToEmpty, type Agg, type MetricKey, METRICS } from '../core/analytics'
import { useSfRange } from '../core/rangeState'
import { BarList, MetricTile, MetricTitle, ProductCell, RangeControls, useNow, useToday } from '../core/ui'
import { ordersInRange } from '../core/orders'
import { clock, int, pct2, usd } from '../core/format'
import type { ReportId } from '../core/reportsCatalog'
import { STATE_NAMES } from '../../../../data/customers'
import { productImage } from '../../../../core/assets'

const SOCIAL: TrafficSource[] = ['fadbook', 'tiktak', 'tiktak_organic', 'influencer']
const ALL_SOURCES: TrafficSource[] = ['fadbook', 'tiktak', 'tiktak_organic', 'influencer', 'organic', 'direct', 'email']

/** Shopify-style analytics card: dotted title, headline value + delta, body, "View report" link. */
function ACard({ title, tip, value, prev, invert, children, report, navigate }: {
  title: string
  tip?: string
  value?: ReactNode
  prev?: { cur: number; prev: number | null } | null
  invert?: boolean
  children: ReactNode
  report?: ReportId
  navigate: (p: string) => void
}) {
  return (
    <Card>
      <div className="sf-acard">
        <div className="sf-acard-head">
          <MetricTitle tip={tip} size="md">{title}</MetricTitle>
          {report && <Link onClick={() => navigate(`analytics/reports/${report}`)}>View report</Link>}
        </div>
        {value !== undefined && (
          <div className="sf-acard-value">
            <span>{value}</span>
            {prev && prev.prev !== null && <DeltaBadge cur={prev.cur} prev={prev.prev} invert={invert} />}
          </div>
        )}
        <div className="sf-acard-body">{children}</div>
      </div>
    </Card>
  )
}

function ChartCard({ metric, title, s, r, report, navigate, cur, prev }: {
  metric: MetricKey
  title?: string
  s: GameState
  r: ReturnType<typeof useSfRange>
  report: ReportId
  navigate: (p: string) => void
  cur: Agg
  prev: Agg | null
}) {
  const def = METRICS[metric]
  return (
    <LineChartCard
      title={title ?? def.label}
      titleTip={def.tip}
      value={formatMetric(metric, metricOf(cur, metric))}
      comparisonValue={prev ? metricOf(prev, metric) : null}
      invertDelta={def.invert}
      data={zeroToEmpty(seriesPoints(s, metric, r.range, r.cmp))}
      format={def.format}
      currentLabel={formatRange(r.range)}
      compareLabel={r.cmp ? formatRange(r.cmp) : undefined}
      height={170}
      emptyText="No data for this date range"
      action={<Link onClick={() => navigate(`analytics/reports/${report}`)}>View report</Link>}
    />
  )
}

export default function Analytics({ navigate }: ShopiflyPageProps) {
  const today = useToday()
  const now = useNow()
  const r = useSfRange('analytics', today)
  const { daily, hourly, orders, products } = useGSShallow(s => ({
    daily: s.store.analytics.daily, hourly: s.store.analytics.hourly, orders: s.store.orders, products: s.store.products,
  }))

  const v = useMemo(() => {
    const s = getGS()
    const cur = aggregate(s, r.range)
    const prev = r.cmp ? aggregate(s, r.cmp) : null
    const inRange = ordersInRange(orders, r.range.from, r.range.to)
    const fulfilledIn = (from: number, to: number) => orders.filter(o => o.shipDay != null && o.fulfillment !== 'unfulfilled' && o.shipDay >= from && o.shipDay <= to).length
    const byState = new Map<string, { orders: number; sales: number }>()
    for (const o of inRange) {
      const x = byState.get(o.customer.region) ?? { orders: 0, sales: 0 }
      x.orders++
      x.sales += o.total
      byState.set(o.customer.region, x)
    }
    // spark series: at least 7 days even for single-day ranges
    const sparkRange = { from: Math.min(r.range.from, r.range.to - 6), to: r.range.to }
    const fulfilledSpark: number[] = []
    for (let d = sparkRange.from; d <= sparkRange.to; d++) fulfilledSpark.push(fulfilledIn(d, d))
    return {
      s, cur, prev, inRange,
      fulfilled: fulfilledIn(r.range.from, r.range.to),
      prevFulfilled: r.cmp ? fulfilledIn(r.cmp.from, r.cmp.to) : null,
      byState: [...byState.entries()].sort((a, b) => b[1].sales - a[1].sales),
      spark: {
        grossSales: dailyValues(s, 'grossSales', sparkRange),
        returningRate: dailyValues(s, 'returningRate', sparkRange),
        orders: dailyValues(s, 'orders', sparkRange),
        fulfilled: fulfilledSpark,
      },
    }
  }, [daily, hourly, orders, r.range, r.cmp]) // eslint-disable-line react-hooks/exhaustive-deps

  const { s, cur, prev } = v
  const pv = (k: MetricKey) => ({ cur: metricOf(cur, k), prev: prev ? metricOf(prev, k) : null })

  const productRows = useMemo(() => {
    return Object.entries(cur.byProduct)
      .map(([id, x]) => {
        const p = products.find(pp => pp.id === id)
        return { id, title: p?.title ?? 'Deleted product', src: p?.media[0]?.src ?? (p ? productImage(p.catalogId) : ''), ...x }
      })
      .sort((a, b) => b.units - a.units)
  }, [cur.byProduct, products])

  const socialSessions = SOCIAL.map(k => ({ key: k, label: sourceLabel(k), value: cur.sessionsBySource[k] ?? 0 })).filter(x => x.value > 0)
  const socialSales = SOCIAL.map(k => ({ key: k, label: sourceLabel(k), value: cur.salesBySource[k] ?? 0 })).filter(x => x.value > 0)
  const allSessions = ALL_SOURCES.map(k => ({ key: k, label: sourceLabel(k), value: cur.sessionsBySource[k] ?? 0 })).filter(x => x.value > 0).sort((a, b) => b.value - a.value)
  const marketing = ALL_SOURCES.map(k => ({ k, sales: cur.salesBySource[k] ?? 0, orders: cur.ordersBySource[k] ?? 0, sessions: cur.sessionsBySource[k] ?? 0 }))
    .filter(x => x.sessions > 0 || x.orders > 0)
    .sort((a, b) => b.sales - a.sales)
  const devices = [
    { key: 'mobile', label: 'Mobile', value: cur.sessionsByDevice.mobile },
    { key: 'desktop', label: 'Desktop', value: cur.sessionsByDevice.desktop },
    { key: 'tablet', label: 'Tablet', value: cur.sessionsByDevice.tablet },
  ]
  const devTotal = devices.reduce((a, d) => a + d.value, 0)

  return (
    <PolarisProvider>
      <Page
        title="Analytics"
        subtitle={`Last refreshed: ${clock(now)}`}
        fullWidth
      >
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <RangeControls r={r} today={today} />
          <Link onClick={() => navigate('analytics/reports')}>View all reports</Link>
        </InlineStack>

        <Card padding="0">
          <div className="sf-analytics-top">
            <MetricTile metric="grossSales" value={cur.grossSales} prev={prev ? prev.grossSales : undefined} spark={v.spark.grossSales} />
            <MetricTile metric="returningRate" value={cur.returningRate} prev={prev ? prev.returningRate : undefined} spark={v.spark.returningRate} />
            <MetricTile title="Orders fulfilled" tip="Orders handed to the carrier in this date range." value={v.fulfilled} prev={v.prevFulfilled ?? undefined} spark={v.spark.fulfilled} />
            <MetricTile metric="orders" value={cur.orders} prev={prev ? prev.orders : undefined} spark={v.spark.orders} />
          </div>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <ChartCard metric="totalSales" s={s} r={r} cur={cur} prev={prev} report="sales-over-time" navigate={navigate} />

          <ACard title="Total sales breakdown" tip="How total sales were made up in this date range." navigate={navigate} report="sales-over-time">
            <div className="sf-breakdown">
              {([
                ['Gross sales', cur.grossSales, prev?.grossSales, false],
                ['Discounts', -cur.discounts, prev ? -prev.discounts : null, false],
                ['Returns', -cur.returns, prev ? -prev.returns : null, false],
                ['Net sales', cur.netSales, prev?.netSales, true],
                ['Shipping charges', cur.shipping, prev?.shipping, false],
                ['Taxes', cur.taxes, prev?.taxes, false],
                ['Total sales', cur.totalSales, prev?.totalSales, true],
              ] as [string, number, number | null | undefined, boolean][]).map(([label, val, p, strong]) => (
                <div key={label} className={`sf-breakdown-row${strong ? ' is-strong' : ''}`}>
                  <span>{label}</span>
                  <span className="sf-breakdown-val">{usd(val)}</span>
                  <span className="sf-breakdown-delta">{p !== undefined && p !== null ? <DeltaBadge cur={val} prev={p} /> : null}</span>
                </div>
              ))}
            </div>
          </ACard>

          <ChartCard metric="sessions" title="Online store sessions" s={s} r={r} cur={cur} prev={prev} report="sessions-over-time" navigate={navigate} />

          <ACard
            title="Online store conversion rate"
            tip="Percentage of sessions that resulted in an order, and how far visitors got."
            value={pct2(cur.conversionRate)}
            prev={pv('conversionRate')}
            report="conversion-over-time"
            navigate={navigate}
          >
            <div className="sf-funnel-list">
              {([
                ['Added to cart', cur.atc, prev?.atc],
                ['Reached checkout', cur.checkout, prev?.checkout],
                ['Sessions converted', cur.converted, prev?.converted],
              ] as [string, number, number | undefined][]).map(([label, n, p]) => (
                <div key={label} className="sf-funnel-row">
                  <div>
                    <Text as="p" fontWeight="medium">{label}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{int(n)} session{n === 1 ? '' : 's'}</Text>
                  </div>
                  <div className="sf-funnel-right">
                    <Text as="span" fontWeight="semibold">{pct2(cur.sessions ? n / cur.sessions : 0)}</Text>
                    {p !== undefined && prev && <DeltaBadge cur={cur.sessions ? n / cur.sessions : 0} prev={prev.sessions ? p / prev.sessions : 0} />}
                  </div>
                </div>
              ))}
            </div>
          </ACard>

          <ChartCard metric="aov" s={s} r={r} cur={cur} prev={prev} report="aov-over-time" navigate={navigate} />
          <ChartCard metric="orders" title="Total orders" s={s} r={r} cur={cur} prev={prev} report="orders-over-time" navigate={navigate} />

          <ACard title="Sessions by device type" tip="Online store sessions by the visitor's device." navigate={navigate} report="sessions-by-device">
            <BarList
              rows={devices.map(d => ({ key: d.key, label: d.label, value: d.value, sub: devTotal ? `${pct2(d.value / devTotal, 1)} of sessions` : undefined }))}
              format={int}
            />
          </ACard>

          <ACard title="Sessions by social source" tip="Sessions that came from social media sites, paid or organic." navigate={navigate} report="sessions-by-source">
            <BarList rows={socialSessions} format={int} empty="No sessions from social media in this date range" />
          </ACard>

          <ACard title="Total sales by social source" tip="Total sales from sessions that started on a social media site." navigate={navigate} report="sales-by-channel">
            <BarList rows={socialSales} format={x => usd(x)} empty="No sales from social media in this date range" />
          </ACard>

          <ACard title="Total sales by product" tip="Products ranked by units sold." navigate={navigate} report="sales-by-product">
            {productRows.length === 0 ? (
              <div className="sf-empty-chart">No sales in this date range</div>
            ) : (
              <div className="sf-toplist">
                {productRows.slice(0, 5).map(p => (
                  <div key={p.id} className="sf-toplist-row">
                    <ProductCell src={p.src} title={p.title} sub={`${int(p.units)} unit${p.units === 1 ? '' : 's'} · ${int(p.orders)} order${p.orders === 1 ? '' : 's'}`} size="extraSmall" />
                    <Text as="span" numeric fontWeight="medium">{usd(p.sales)}</Text>
                  </div>
                ))}
              </div>
            )}
          </ACard>

          <ChartCard metric="returningRate" s={s} r={r} cur={cur} prev={prev} report="returning-customers" navigate={navigate} />

          <ACard title="Sales attributed to marketing" tip="Orders and sales from sessions that arrived from each channel (last click)." navigate={navigate} report="sales-by-channel">
            {marketing.length === 0 ? (
              <div className="sf-empty-chart">No marketing activity in this date range</div>
            ) : (
              <table className="sf-mini-table">
                <thead><tr><th>Channel</th><th>Sessions</th><th>Orders</th><th>Sales</th></tr></thead>
                <tbody>
                  {marketing.map(m => (
                    <tr key={m.k}><td>{sourceLabel(m.k)}</td><td>{int(m.sessions)}</td><td>{int(m.orders)}</td><td>{usd(m.sales)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </ACard>

          <ACard title="Sessions by referrer" tip="Where visitors came from before landing on your online store." navigate={navigate} report="sessions-by-source">
            <BarList rows={allSessions} format={int} />
          </ACard>

          <ACard title="Top landing pages" tip="Product pages ranked by sessions, with how many of those sessions converted." navigate={navigate} report="product-conversion">
            {productRows.filter(p => p.sessions > 0).length === 0 ? (
              <div className="sf-empty-chart">No sessions in this date range</div>
            ) : (
              <table className="sf-mini-table">
                <thead><tr><th>Page</th><th>Sessions</th><th>Conv. rate</th></tr></thead>
                <tbody>
                  {[...productRows].filter(p => p.sessions > 0).sort((a, b) => b.sessions - a.sessions).slice(0, 6).map(p => (
                    <tr key={p.id}>
                      <td title={p.title}>/products/{products.find(x => x.id === p.id)?.seo.handle || p.id}</td>
                      <td>{int(p.sessions)}</td>
                      <td>{pct2(p.sessions ? p.orders / p.sessions : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ACard>

          <ACard title="Orders by location" tip="Orders placed in this date range by the customer's shipping state." navigate={navigate} report="orders-by-location">
            <BarList
              rows={v.byState.slice(0, 6).map(([st, x]) => ({ key: st, label: STATE_NAMES[st] ?? st, value: x.orders, sub: usd(x.sales) }))}
              format={int}
              empty="No orders in this date range"
            />
          </ACard>
        </InlineGrid>
        {dayOf(now) === r.range.to && (
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">Today's data is updated every hour.</Text>
        )}
      </Page>
    </PolarisProvider>
  )
}
