// Reports: the report library (search + categories) and each report (range, chart, table, totals).
import { useMemo, useState, type ReactNode } from 'react'
import { FileChartColumn } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { Chargeback, Device, GameState, StoreProduct, TrafficSource } from '../../../../core/types'
import { getGS, useGSShallow } from '../../../../core/store'
import { dayOf, formatDate, type DateRange } from '../../../../core/time'
import { STATE_NAMES } from '../../../../data/customers'
import { sourceLabel } from '../../../../sim/store'
import { businessProfit, rangePnl } from '../../../../sim/finance'
import {
  Badge, Banner, BlockStack, Card, DataTable, EmptyState, IndexFilters, IndexTable, InlineStack, Link, Page, PolarisProvider, Text,
} from '../../../kit/polaris'
import { BarChart, DonutChart, LineChartCard, type BarDatum } from '../../../kit/charts'
import { formatRange } from '../../../kit/common'
import { aggregate, formatMetric, metricOf, METRICS, seriesPoints, withRates, zeroToEmpty, type MetricKey } from '../core/analytics'
import { adSpendByProduct, ordersInRange } from '../core/orders'
import { useSfRange } from '../core/rangeState'
import { RangeControls, useToday } from '../core/ui'
import { pct2, usd } from '../core/format'
import { REPORTS, reportDef, type ReportCategory, type ReportId } from '../core/reportsCatalog'

const CATEGORIES: ('All' | ReportCategory)[] = ['All', 'Sales', 'Acquisition', 'Behavior', 'Customers', 'Profit margin', 'Finances']
const SOURCES: TrafficSource[] = ['fadbook', 'tiktak', 'tiktak_organic', 'influencer', 'organic', 'direct', 'email']
const DEVICES: Device[] = ['mobile', 'desktop', 'tablet']
const DEVICE_LABEL: Record<Device, string> = { mobile: 'Mobile', desktop: 'Desktop', tablet: 'Tablet' }

export default function Reports(props: ShopiflyPageProps) {
  const id = props.params[0]
  if (id) return <ReportView {...props} id={id} />
  return <ReportList {...props} />
}

function ReportList({ navigate }: ShopiflyPageProps) {
  const [tab, setTab] = useState(0)
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const cat = CATEGORIES[tab]
    const ql = q.trim().toLowerCase()
    return REPORTS.filter(r => (cat === 'All' || r.category === cat) && (!ql || r.name.toLowerCase().includes(ql) || r.description.toLowerCase().includes(ql)))
  }, [tab, q])
  return (
    <PolarisProvider>
      <Page title="Reports" backAction={{ content: 'Analytics', onAction: () => navigate('analytics') }} fullWidth>
        <Card padding="0">
          <IndexFilters tabs={CATEGORIES.map(c => ({ id: c, content: c }))} selected={tab} onSelect={setTab} queryValue={q} onQueryChange={setQ} queryPlaceholder="Searching all reports" />
          <IndexTable
            rows={rows}
            rowKey={r => r.id}
            selectable={false}
            resourceName={{ singular: 'report', plural: 'reports' }}
            onRowClick={r => navigate(`analytics/reports/${r.id}`)}
            emptyState={<EmptyState heading="No reports found" image="search" compact>Try a different search term.</EmptyState>}
            columns={[
              {
                id: 'name', title: 'Name', sortValue: r => r.name,
                render: r => (
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <span className="sf-report-icon"><FileChartColumn size={16} strokeWidth={1.8} /></span>
                    <BlockStack gap="0">
                      <Text as="span" fontWeight="semibold">{r.name}</Text>
                      <Text as="span" variant="bodySm" tone="subdued">{r.description}</Text>
                    </BlockStack>
                  </InlineStack>
                ),
              },
              { id: 'cat', title: 'Category', sortValue: r => r.category, nowrap: true, render: r => r.category },
              { id: 'by', title: 'Created by', nowrap: true, render: () => 'Shopifly' },
            ]}
          />
        </Card>
      </Page>
    </PolarisProvider>
  )
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------
interface Table {
  types: ('text' | 'numeric')[]
  headings: string[]
  rows: (string | number)[][]
  totals?: (string | number)[]
  sortable?: boolean[]
  sortIndex?: number
}
interface Built {
  chart?: { kind: 'line'; metric: MetricKey } | { kind: 'bar'; data: BarDatum[]; format: 'money' | 'number' } | { kind: 'donut'; data: { label: string; value: number }[]; format: 'money0' | 'number'; center: string }
  table: Table
  note?: ReactNode
}

function daysOf(r: DateRange, today: number): number[] {
  const out: number[] = []
  for (let d = Math.min(r.to, today); d >= Math.max(0, r.from); d--) out.push(d)
  return out
}

function build(s: GameState, id: ReportId, range: DateRange, products: StoreProduct[]): Built {
  const today = dayOf(s.time.hour)
  const agg = aggregate(s, range)
  const daily = (d: number) => withRates(s.store.analytics.daily[d] ?? aggregate(s, null))
  const days = daysOf(range, today)
  const title = (spId: string) => products.find(p => p.id === spId)?.title ?? 'Deleted product'
  switch (id) {
    case 'sales-over-time':
      return {
        chart: { kind: 'line', metric: 'totalSales' },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric'],
          headings: ['Day', 'Orders', 'Gross sales', 'Discounts', 'Returns', 'Net sales', 'Shipping', 'Taxes', 'Total sales'],
          rows: days.map(d => { const x = daily(d); return [formatDate(d, 'short'), x.orders, usd(x.grossSales), usd(-x.discounts), usd(-x.returns), usd(x.netSales), usd(x.shipping), usd(x.taxes), usd(x.totalSales)] }),
          totals: ['', agg.orders, usd(agg.grossSales), usd(-agg.discounts), usd(-agg.returns), usd(agg.netSales), usd(agg.shipping), usd(agg.taxes), usd(agg.totalSales)],
        },
      }
    case 'orders-over-time':
      return {
        chart: { kind: 'line', metric: 'orders' },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric'],
          headings: ['Day', 'Orders', 'Items ordered', 'Items per order'],
          rows: days.map(d => { const x = daily(d); return [formatDate(d, 'short'), x.orders, x.units, x.orders ? (x.units / x.orders).toFixed(2) : '0.00'] }),
          totals: ['', agg.orders, agg.units, agg.orders ? (agg.units / agg.orders).toFixed(2) : '0.00'],
        },
      }
    case 'aov-over-time':
      return {
        chart: { kind: 'line', metric: 'aov' },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric', 'numeric'],
          headings: ['Day', 'Orders', 'Gross sales', 'Discounts', 'Average order value'],
          rows: days.map(d => { const x = daily(d); return [formatDate(d, 'short'), x.orders, usd(x.grossSales), usd(-x.discounts), usd(x.aov)] }),
          totals: ['', agg.orders, usd(agg.grossSales), usd(-agg.discounts), usd(agg.aov)],
        },
      }
    case 'sessions-over-time':
      return {
        chart: { kind: 'line', metric: 'sessions' },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric', 'numeric'],
          headings: ['Day', 'Sessions', 'Mobile', 'Desktop', 'Tablet'],
          rows: days.map(d => { const x = daily(d); return [formatDate(d, 'short'), x.sessions, x.sessionsByDevice.mobile, x.sessionsByDevice.desktop, x.sessionsByDevice.tablet] }),
          totals: ['', agg.sessions, agg.sessionsByDevice.mobile, agg.sessionsByDevice.desktop, agg.sessionsByDevice.tablet],
        },
      }
    case 'conversion-over-time':
      return {
        chart: { kind: 'line', metric: 'conversionRate' },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric'],
          headings: ['Day', 'Sessions', 'Added to cart', 'Reached checkout', 'Sessions converted', 'Conversion rate'],
          rows: days.map(d => { const x = daily(d); return [formatDate(d, 'short'), x.sessions, x.atc, x.checkout, x.converted, pct2(x.conversionRate)] }),
          totals: ['', agg.sessions, agg.atc, agg.checkout, agg.converted, pct2(agg.conversionRate)],
        },
      }
    case 'returning-customers':
      return {
        chart: { kind: 'line', metric: 'returningRate' },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric'],
          headings: ['Day', 'New customers', 'Returning customers', 'Returning customer rate'],
          rows: days.map(d => { const x = daily(d); return [formatDate(d, 'short'), x.newCustomers, x.returningCustomers, pct2(x.returningRate)] }),
          totals: ['', agg.newCustomers, agg.returningCustomers, pct2(agg.returningRate)],
        },
      }
    case 'sales-by-product': {
      const rows = Object.entries(agg.byProduct).sort((a, b) => b[1].sales - a[1].sales)
      return {
        chart: { kind: 'bar', format: 'money', data: rows.slice(0, 8).map(([k, x]) => ({ label: title(k).slice(0, 36), value: Math.round(x.sales * 100) / 100 })) },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric'],
          headings: ['Product', 'Units sold', 'Orders', 'Total sales'],
          rows: rows.map(([k, x]) => [title(k), x.units, x.orders, usd(x.sales)]),
          totals: ['', rows.reduce((a, [, x]) => a + x.units, 0), rows.reduce((a, [, x]) => a + x.orders, 0), usd(rows.reduce((a, [, x]) => a + x.sales, 0))],
          sortIndex: 3,
        },
      }
    }
    case 'product-conversion': {
      const rows = Object.entries(agg.byProduct).filter(([, x]) => x.sessions > 0).sort((a, b) => b[1].sessions - a[1].sessions)
      const t = rows.reduce((a, [, x]) => ({ s: a.s + x.sessions, c: a.c + x.atc, o: a.o + x.orders, u: a.u + x.units }), { s: 0, c: 0, o: 0, u: 0 })
      return {
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric'],
          headings: ['Product', 'Sessions', 'Added to cart', 'Add-to-cart rate', 'Orders', 'Conversion rate'],
          rows: rows.map(([k, x]) => [title(k), x.sessions, x.atc, pct2(x.sessions ? x.atc / x.sessions : 0), x.orders, pct2(x.sessions ? x.orders / x.sessions : 0)]),
          totals: ['', t.s, t.c, pct2(t.s ? t.c / t.s : 0), t.o, pct2(t.s ? t.o / t.s : 0)],
          sortIndex: 1,
        },
        note: 'Sessions are counted on the product page a visitor landed on.',
      }
    }
    case 'sales-by-channel': {
      const rows = SOURCES.map(k => ({ k, s: agg.sessionsBySource[k] ?? 0, o: agg.ordersBySource[k] ?? 0, v: agg.salesBySource[k] ?? 0 })).filter(x => x.s || x.o)
      return {
        chart: { kind: 'donut', format: 'money0', center: 'Total sales', data: rows.filter(x => x.v > 0).map(x => ({ label: sourceLabel(x.k), value: Math.round(x.v) })) },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric'],
          headings: ['Referring channel', 'Sessions', 'Orders', 'Conversion rate', 'Total sales', 'Average order value'],
          rows: rows.map(x => [sourceLabel(x.k), x.s, x.o, pct2(x.s ? x.o / x.s : 0), usd(x.v), usd(x.o ? x.v / x.o : 0)]),
          totals: ['', agg.sessions, agg.orders, pct2(agg.conversionRate), usd(agg.totalSales), usd(agg.orders ? agg.totalSales / agg.orders : 0)],
          sortIndex: 4,
        },
        note: 'Sales are credited to the channel of the session that placed the order (last click). Ad platforms count conversions differently.',
      }
    }
    case 'sessions-by-source': {
      const rows = SOURCES.map(k => ({ k, n: agg.sessionsBySource[k] ?? 0 })).filter(x => x.n > 0).sort((a, b) => b.n - a.n)
      return {
        chart: { kind: 'bar', format: 'number', data: rows.map(x => ({ label: sourceLabel(x.k), value: x.n })) },
        table: {
          types: ['text', 'numeric', 'numeric'],
          headings: ['Referrer', 'Sessions', '% of sessions'],
          rows: rows.map(x => [sourceLabel(x.k), x.n, pct2(agg.sessions ? x.n / agg.sessions : 0, 1)]),
          totals: ['', agg.sessions, '100.0%'],
          sortIndex: 1,
        },
      }
    }
    case 'sessions-by-device': {
      const ords = ordersInRange(s.store.orders, range.from, range.to)
      const byDev = (d: Device) => ords.filter(o => o.device === d).length
      return {
        chart: { kind: 'donut', format: 'number', center: 'Sessions', data: DEVICES.map(d => ({ label: DEVICE_LABEL[d], value: agg.sessionsByDevice[d] })) },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric', 'numeric'],
          headings: ['Device type', 'Sessions', '% of sessions', 'Orders', 'Conversion rate'],
          rows: DEVICES.map(d => [DEVICE_LABEL[d], agg.sessionsByDevice[d], pct2(agg.sessions ? agg.sessionsByDevice[d] / agg.sessions : 0, 1), byDev(d), pct2(agg.sessionsByDevice[d] ? byDev(d) / agg.sessionsByDevice[d] : 0)]),
          totals: ['', agg.sessions, '100.0%', ords.length, pct2(agg.sessions ? ords.length / agg.sessions : 0)],
        },
      }
    }
    case 'orders-by-location': {
      const m = new Map<string, { o: number; v: number }>()
      for (const o of ordersInRange(s.store.orders, range.from, range.to)) {
        const x = m.get(o.customer.region) ?? { o: 0, v: 0 }
        x.o++
        x.v += o.total
        m.set(o.customer.region, x)
      }
      const rows = [...m.entries()].sort((a, b) => b[1].v - a[1].v)
      const t = rows.reduce((a, [, x]) => ({ o: a.o + x.o, v: a.v + x.v }), { o: 0, v: 0 })
      return {
        chart: { kind: 'bar', format: 'number', data: rows.slice(0, 10).map(([k, x]) => ({ label: STATE_NAMES[k] ?? k, value: x.o })) },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric'],
          headings: ['State', 'Orders', 'Total sales', 'Average order value'],
          rows: rows.map(([k, x]) => [STATE_NAMES[k] ?? k, x.o, usd(x.v), usd(x.o ? x.v / x.o : 0)]),
          totals: ['', t.o, usd(t.v), usd(t.o ? t.v / t.o : 0)],
          sortIndex: 2,
        },
      }
    }
    case 'profit-by-product': {
      const ords = ordersInRange(s.store.orders, range.from, range.to)
      const cbByOrder = new Map<number, Chargeback>()
      for (const c of s.store.chargebacks) cbByOrder.set(c.orderId, c)
      const spend = adSpendByProduct(s, range.from, range.to)
      type Row = { units: number; net: number; cogs: number; ship: number; fees: number; cb: number; ads: number }
      const m = new Map<string, Row>()
      const row = (k: string) => {
        let x = m.get(k)
        if (!x) m.set(k, (x = { units: 0, net: 0, cogs: 0, ship: 0, fees: 0, cb: 0, ads: 0 }))
        return x
      }
      for (const o of ords) {
        const x = row(o.storeProductId)
        x.units += o.qty
        x.net += o.total - o.refunded
        if (!o.cancelled) {
          x.cogs += o.cogs
          x.ship += o.shippingCost
        }
        x.fees += o.fees
        const c = cbByOrder.get(o.id)
        if (c && c.status !== 'won') x.cb += (c.status === 'lost' || c.status === 'accepted' ? c.amount : 0) + (c.fee ?? 15)
      }
      for (const [k, v] of Object.entries(spend)) row(k).ads += v
      const rows = [...m.entries()].map(([k, x]) => ({ k, ...x, profit: x.net - x.cogs - x.ship - x.fees - x.cb - x.ads })).sort((a, b) => b.profit - a.profit)
      const t = rows.reduce((a, x) => ({ units: a.units + x.units, net: a.net + x.net, cogs: a.cogs + x.cogs, ship: a.ship + x.ship, fees: a.fees + x.fees, cb: a.cb + x.cb, ads: a.ads + x.ads, profit: a.profit + x.profit }), { units: 0, net: 0, cogs: 0, ship: 0, fees: 0, cb: 0, ads: 0, profit: 0 })
      return {
        chart: { kind: 'bar', format: 'money', data: rows.slice(0, 8).map(x => ({ label: title(x.k).slice(0, 36), value: Math.round(x.profit * 100) / 100 })) },
        table: {
          types: ['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric'],
          headings: ['Product', 'Units', 'Net sales', 'Product cost', 'Shipping cost', 'Transaction fees', 'Chargebacks', 'Ad spend', 'Profit', 'Margin'],
          rows: rows.map(x => [title(x.k), x.units, usd(x.net), usd(-x.cogs), usd(-x.ship), usd(-x.fees), usd(-x.cb), usd(-x.ads), usd(x.profit), pct2(x.net ? x.profit / x.net : 0, 1)]),
          totals: ['', t.units, usd(t.net), usd(-t.cogs), usd(-t.ship), usd(-t.fees), usd(-t.cb), usd(-t.ads), usd(t.profit), pct2(t.net ? t.profit / t.net : 0, 1)],
          sortIndex: 8,
        },
        note: 'Costs come from each order (supplier price, import duty and shipping). Ad spend comes from your connected Fadbook and TikTak ad accounts. App, staff and creative costs are in the Finance summary.',
      }
    }
    case 'finance-summary': {
      const p = rangePnl(s, range.from, range.to)
      const profit = businessProfit(p)
      const line = (label: string, v: number): (string | number)[] => [label, usd(v)]
      return {
        table: {
          types: ['text', 'numeric'],
          headings: ['', formatRange(range)],
          rows: [
            ['Sales', ''],
            line('Gross sales', agg.grossSales),
            line('Discounts', -agg.discounts),
            line('Returns', -agg.returns),
            line('Net sales', agg.netSales),
            line('Shipping charges', agg.shipping),
            line('Taxes', agg.taxes),
            line('Total sales', agg.totalSales),
            ['Payments', ''],
            line('Transaction fees', -p.paymentFees),
            line('Chargebacks (incl. dispute fees)', -p.chargebacks),
            ['Costs', ''],
            line('Product costs', -p.cogs),
            line('Shipping costs', -p.shipping),
            line('Fadbook ads', -p.adSpendFadbook),
            line('TikTak ads', -p.adSpendTiktak),
            line('Apps & Shopifly plan', -p.apps),
            line('Creatives', -p.creatives),
            line('Staff', -p.staff),
            line('Other business costs', -p.otherBusiness),
          ],
          totals: ['Net profit', usd(profit)],
          sortable: [false, false],
        },
        note: p.inventory > 0 ? `Inventory purchases of ${usd(p.inventory)} are held as stock and expensed as product cost when units sell.` : undefined,
      }
    }
  }
}

function ReportView({ id, navigate }: ShopiflyPageProps & { id: string }) {
  const today = useToday()
  const r = useSfRange('analytics', today)
  const def = reportDef(id)
  const { daily, hourly, orders, products, ads } = useGSShallow(s => ({
    daily: s.store.analytics.daily, hourly: s.store.analytics.hourly, orders: s.store.orders, products: s.store.products, ads: s.ads.ads,
  }))
  const data = useMemo(() => {
    if (!def) return null
    const s = getGS()
    const built = build(s, def.id, r.range, products)
    const chart = built.chart?.kind === 'line'
      ? {
          points: zeroToEmpty(seriesPoints(s, built.chart.metric, r.range, r.cmp)),
          value: metricOf(aggregate(s, r.range), built.chart.metric),
          prev: r.cmp ? metricOf(aggregate(s, r.cmp), built.chart.metric) : null,
        }
      : null
    return { built, chart }
  }, [def, daily, hourly, orders, products, ads, r.range, r.cmp]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!def || !data) {
    return (
      <PolarisProvider>
        <Page title="Report not found" backAction={{ content: 'Reports', onAction: () => navigate('analytics/reports') }}>
          <Card><EmptyState heading="This report doesn't exist" image="chart" action={{ content: 'View all reports', onAction: () => navigate('analytics/reports') }} /></Card>
        </Page>
      </PolarisProvider>
    )
  }
  const { built, chart } = data
  const c = built.chart
  return (
    <PolarisProvider>
      <Page title={def.name} subtitle={def.description} backAction={{ content: 'Reports', onAction: () => navigate('analytics/reports') }} fullWidth>
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <RangeControls r={r} today={today} compare={c?.kind === 'line'} />
          <Badge>{def.category}</Badge>
        </InlineStack>
        {c?.kind === 'line' && chart && (
          <LineChartCard
            title={METRICS[c.metric].label}
            titleTip={METRICS[c.metric].tip}
            value={formatMetric(c.metric, chart.value)}
            comparisonValue={chart.prev}
            invertDelta={METRICS[c.metric].invert}
            data={chart.points}
            format={METRICS[c.metric].format}
            currentLabel={formatRange(r.range)}
            compareLabel={r.cmp ? formatRange(r.cmp) : undefined}
            height={240}
            emptyText="No data for this date range"
          />
        )}
        {c?.kind === 'bar' && (
          <Card>
            <BarChart orientation="horizontal" data={c.data} format={c.format} showValues emptyText="No data for this date range" />
          </Card>
        )}
        {c?.kind === 'donut' && (
          <Card>
            <DonutChart data={c.data} format={c.format} centerLabel={c.center} emptyText="No data for this date range" />
          </Card>
        )}
        {built.note && <Banner tone="info">{built.note}</Banner>}
        <Card padding="0">
          {built.table.rows.length === 0 ? (
            <EmptyState heading="No data for this date range" image="chart" compact>Try a longer date range.</EmptyState>
          ) : (
            <DataTable
              columnContentTypes={built.table.types}
              headings={built.table.headings}
              rows={built.table.rows}
              totals={built.table.totals}
              totalsName={def.id === 'finance-summary' ? 'Net profit' : 'Totals'}
              showTotalsInFooter={def.id === 'finance-summary'}
              sortable={built.table.sortable ?? built.table.types.map((_, i) => i > 0 || def.id !== 'finance-summary')}
              initialSortColumnIndex={built.table.sortIndex}
              stickyHeader
              hoverable
              truncate={def.id !== 'finance-summary'}
            />
          )}
        </Card>
        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
          Showing {formatRange(r.range)}{def.category === 'Profit margin' ? ' · ' : ''}
          {def.category === 'Profit margin' && <Link onClick={() => navigate('analytics/reports/finance-summary')}>Open finance summary</Link>}
        </Text>
      </Page>
    </PolarisProvider>
  )
}
