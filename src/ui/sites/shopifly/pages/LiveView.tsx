// Live View: real-time metrics column + dark dot globe with visitors and recent orders.
import { useMemo } from 'react'
import { Rotate3d } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import { getGS, useGSShallow } from '../../../../core/store'
import { dayOf, formatDate, hourOfDay } from '../../../../core/time'
import { US_CITIES, STATE_NAMES, findCity } from '../../../../data/customers'
import { BlockStack, Card, InlineStack, Page, PolarisProvider, Text, Tooltip } from '../../../kit/polaris'
import { Sparkline } from '../../../kit/charts'
import { aggregate } from '../core/analytics'
import { Globe, type GlobeMarker } from '../core/Globe'
import { BarList, MetricTitle, ProductCell, useNow } from '../core/ui'
import { clock, int, pct2, usd } from '../core/format'
import { productImage } from '../../../../core/assets'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TOTAL_POP = US_CITIES.reduce((a, c) => a + c.pop, 0)
/** Visitors placed in cities weighted by population, stable within the hour. */
function visitorMarkers(count: number, hour: number, seed: number): GlobeMarker[] {
  const rnd = mulberry32(seed * 131 + hour * 7919)
  const out: GlobeMarker[] = []
  for (let i = 0; i < count; i++) {
    let x = rnd() * TOTAL_POP
    let c = US_CITIES[0]
    for (const city of US_CITIES) {
      x -= city.pop
      if (x <= 0) { c = city; break }
    }
    // jitter so several visitors in one metro don't stack
    out.push({ key: `v${hour}-${i}`, lon: c.lon + (rnd() - 0.5) * 1.6, lat: c.lat + (rnd() - 0.5) * 1.1, kind: 'visitor', label: `${c.city}, ${c.state}` })
  }
  return out
}

export default function LiveView({ navigate, compact }: ShopiflyPageProps) {
  const now = useNow()
  const today = dayOf(now)
  const { live, daily, hourly, orders, products, seed } = useGSShallow(s => ({
    live: s.store.liveVisitors, daily: s.store.analytics.daily, hourly: s.store.analytics.hourly, orders: s.store.orders,
    products: s.store.products, seed: s.meta.seed,
  }))

  const v = useMemo(() => {
    const s = getGS()
    const todayAgg = aggregate(s, { from: today, to: today })
    const yAgg = aggregate(s, { from: today - 1, to: today - 1 })
    const cur = hourly[now]
    const hoursSoFar = Array.from({ length: hourOfDay(now) + 1 }, (_, h) => today * 24 + h)
    const salesSpark = hoursSoFar.map(h => hourly[h]?.sales ?? 0)
    const sessSpark = hoursSoFar.map(h => hourly[h]?.sessions ?? 0)
    const ordSpark = hoursSoFar.map(h => hourly[h]?.orders ?? 0)
    // recent orders (last 12 hours) for the globe
    const recent: GlobeMarker[] = []
    for (let i = orders.length - 1; i >= 0; i--) {
      const o = orders[i]
      if (o.hour < now - 12) break
      const c = findCity(o.customer.city, o.customer.region)
      if (!c) continue
      recent.push({ key: `o${o.id}`, lon: c.lon, lat: c.lat, kind: 'order', fresh: o.hour >= now - 1, label: `#${o.id} · ${usd(o.total)} · ${c.city}, ${c.state}` })
    }
    const visitors = visitorMarkers(Math.min(90, live), now, seed)
    // visitors by state (from the live markers) for "Sessions by location"
    const byState = new Map<string, number>()
    for (const m of visitors) {
      const st = (m.label ?? '').split(', ')[1] ?? ''
      byState.set(st, (byState.get(st) ?? 0) + 1)
    }
    const todayOrders = orders.filter(o => dayOf(o.hour) === today)
    const newCust = todayOrders.filter(o => !o.customer.returning).length
    const topProducts = Object.entries(todayAgg.byProduct)
      .map(([id, x]) => {
        const p = products.find(pp => pp.id === id)
        return { id, title: p?.title ?? 'Deleted product', src: p?.media[0]?.src || (p ? productImage(p.catalogId) : ''), ...x }
      })
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 4)
    return {
      todayAgg, yAgg, salesSpark, sessSpark, ordSpark,
      activeCarts: cur?.atc ?? 0, checkingOut: cur?.checkout ?? 0, purchased: cur?.orders ?? 0,
      markers: [...visitors, ...recent],
      recentCount: recent.length,
      byState: [...byState.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      newCust, returningCust: todayOrders.length - newCust,
      topProducts,
    }
  }, [daily, hourly, orders, products, live, now, today, seed]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = v.todayAgg
  return (
    <PolarisProvider>
      <Page
        title="Live View"
        titleMetadata={<span className="sf-live-badge"><span className="sf-live-dot is-live" />Live</span>}
        subtitle={`Updated ${clock(now)} · store time`}
        backAction={{ content: 'Analytics', onAction: () => navigate('analytics') }}
        fullWidth
      >
        <div className={`sf-liveview${compact ? ' sf-liveview-compact' : ''}`}>
          <div className="sf-live-col">
            <Card>
              <BlockStack gap="100">
                <MetricTitle tip="Visitors active on your online store in the last few minutes.">Visitors right now</MetricTitle>
                <div className="sf-live-big">{int(live)}</div>
                <Text as="p" variant="bodySm" tone="subdued">{int(t.sessions)} sessions today</Text>
              </BlockStack>
            </Card>
            <div className="sf-live-pair">
              <Card>
                <BlockStack gap="050">
                  <MetricTitle tip="Total sales today (store time).">Total sales</MetricTitle>
                  <span className="sf-live-num">{usd(t.totalSales)}</span>
                  <Sparkline data={v.salesSpark} width={120} height={26} />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="050">
                  <MetricTitle tip="Online store sessions today.">Sessions</MetricTitle>
                  <span className="sf-live-num">{int(t.sessions)}</span>
                  <Sparkline data={v.sessSpark} width={120} height={26} />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="050">
                  <MetricTitle tip="Orders placed today.">Orders</MetricTitle>
                  <span className="sf-live-num">{int(t.orders)}</span>
                  <Sparkline data={v.ordSpark} width={120} height={26} />
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="050">
                  <MetricTitle tip="Sessions today that ended in an order.">Conversion rate</MetricTitle>
                  <span className="sf-live-num">{pct2(t.conversionRate)}</span>
                  <Text as="span" variant="bodySm" tone="subdued">Yesterday {pct2(v.yAgg.conversionRate)}</Text>
                </BlockStack>
              </Card>
            </div>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" gap="200">
                  <MetricTitle tip="Sessions in the current hour that added to cart, reached checkout or placed an order.">Customer behavior</MetricTitle>
                  <Text as="span" variant="bodySm" tone="subdued">This hour</Text>
                </InlineStack>
                <div className="sf-live-behavior">
                  <div><span>{int(v.activeCarts)}</span><Text as="span" variant="bodySm" tone="subdued">Active carts</Text></div>
                  <div><span>{int(v.checkingOut)}</span><Text as="span" variant="bodySm" tone="subdued">Checking out</Text></div>
                  <div><span>{int(v.purchased)}</span><Text as="span" variant="bodySm" tone="subdued">Purchased</Text></div>
                </div>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <MetricTitle tip="Where visitors on your store right now are browsing from.">Sessions by location</MetricTitle>
                <BarList rows={v.byState.map(([st, n]) => ({ key: st, label: STATE_NAMES[st] ?? st, value: n }))} format={int} empty="No visitors right now" />
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <MetricTitle tip="Customers who ordered today for the first time vs. customers who ordered before.">New vs returning customers</MetricTitle>
                <InlineStack gap="400">
                  <BlockStack gap="0"><span className="sf-live-num">{v.newCust}</span><Text as="span" variant="bodySm" tone="subdued">New</Text></BlockStack>
                  <BlockStack gap="0"><span className="sf-live-num">{v.returningCust}</span><Text as="span" variant="bodySm" tone="subdued">Returning</Text></BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <MetricTitle tip="Product pages with the most sessions today.">Top products</MetricTitle>
                {v.topProducts.length === 0 ? (
                  <Text as="p" tone="subdued">No product views yet today</Text>
                ) : v.topProducts.map(p => (
                  <InlineStack key={p.id} align="space-between" blockAlign="center" gap="200" wrap={false}>
                    <ProductCell src={p.src} title={p.title} sub={`${int(p.sessions)} sessions · ${int(p.orders)} orders`} size="extraSmall" />
                  </InlineStack>
                ))}
              </BlockStack>
            </Card>
          </div>

          <div className="sf-live-globe-card">
            <div className="sf-live-globe-head">
              <div className="sf-live-legend">
                <span><i className="sf-legend-visitor" /> Visitors right now</span>
                <span><i className="sf-legend-order" /> Orders (last 12 hours)</span>
              </div>
              <Tooltip content="Drag the globe to rotate it">
                <span className="sf-live-hint"><Rotate3d size={14} /></span>
              </Tooltip>
            </div>
            <div className="sf-live-globe-wrap">
              <Globe markers={v.markers} size={compact ? 320 : 540} />
            </div>
            <div className="sf-live-globe-foot">
              <span>{int(live)} visitor{live === 1 ? '' : 's'} · {v.recentCount} order{v.recentCount === 1 ? '' : 's'} in the last 12 hours</span>
              <span>{formatDate(today, 'long')}</span>
            </div>
          </div>
        </div>
      </Page>
    </PolarisProvider>
  )
}
