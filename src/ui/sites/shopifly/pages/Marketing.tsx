// Marketing: overview (metrics, top channels with cost & ROAS, pixels, email), attribution by ad
// (Shopifly orders vs platform-reported purchases), and Klavio automations.
import { useMemo } from 'react'
import { Mail, Radio } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { Ad, Platform, TrafficSource } from '../../../../core/types'
import { getGS, useGSShallow } from '../../../../core/store'
import { openSite } from '../../../../core/ui'
import { klavioPrice } from '../../../../data/apps'
import { sourceLabel } from '../../../../sim/store'
import {
  Badge, Banner, BlockStack, Button, Card, DataTable, EmptyState, InlineGrid, InlineStack, Link, Page, PolarisProvider, Text,
} from '../../../kit/polaris'
import { formatRange } from '../../../kit/common'
import { aggregate, sparkValues } from '../core/analytics'
import { adSpendByPlatform, ordersInRange } from '../core/orders'
import { useSfRange } from '../core/rangeState'
import { MetricTile, RangeControls, TableCard, useToday } from '../core/ui'
import { int, pct2, usd } from '../core/format'

const CHANNELS: TrafficSource[] = ['fadbook', 'tiktak', 'tiktak_organic', 'influencer', 'email', 'organic', 'direct']
const MARKETING: TrafficSource[] = ['fadbook', 'tiktak', 'tiktak_organic', 'influencer', 'email']
const TABS = [
  { id: '', content: 'Overview' },
  { id: 'attribution', content: 'Attribution' },
  { id: 'automations', content: 'Automations' },
]

const roas = (sales: number, cost: number) => (cost > 0 ? `${(sales / cost).toFixed(2)}` : '—')

function adRangeStats(ad: Ad, from: number, to: number) {
  let spend = 0
  let purchases = 0
  let value = 0
  for (let d = Math.max(0, from); d <= to; d++) {
    const st = ad.stats[d]
    if (!st) continue
    spend += st.spend
    purchases += st.purchases
    value += st.purchaseValue
  }
  return { spend, purchases, value }
}

export default function Marketing({ params, navigate }: ShopiflyPageProps) {
  const tab = Math.max(0, TABS.findIndex(t => t.id === (params[0] ?? '')))
  const today = useToday()
  const r = useSfRange('marketing', today)
  const { daily, hourly, orders, ads, pixel, apps, subscribers, pnl } = useGSShallow(s => ({
    daily: s.store.analytics.daily, hourly: s.store.analytics.hourly, orders: s.store.orders, ads: s.ads.ads,
    pixel: s.store.pixel, apps: s.store.apps, subscribers: s.store.emailSubscribers, pnl: s.finance.pnl,
  }))
  const hasApp = (id: string) => apps.some(a => a.appId === id)

  const v = useMemo(() => {
    const s = getGS()
    const cur = aggregate(s, r.range)
    const prev = r.cmp ? aggregate(s, r.cmp) : null
    const spend = adSpendByPlatform(s, r.range.from, r.range.to)
    const prevSpend = r.cmp ? adSpendByPlatform(s, r.cmp.from, r.cmp.to) : null
    const mk = (a: typeof cur) => MARKETING.reduce((o, k) => ({ sales: o.sales + (a.salesBySource[k] ?? 0), orders: o.orders + (a.ordersBySource[k] ?? 0), sessions: o.sessions + (a.sessionsBySource[k] ?? 0) }), { sales: 0, orders: 0, sessions: 0 })
    const inRange = ordersInRange(orders, r.range.from, r.range.to)
    // channel rows credit each order's total when it was placed, so the totals row sums the same
    // figures (refunds issued later are not taken back out of a channel)
    const srcSales = Object.values(cur.salesBySource).reduce<number>((a, x) => a + (x ?? 0), 0)
    return { s, cur, prev, spend, prevSpend, mkt: mk(cur), prevMkt: prev ? mk(prev) : null, inRange, srcSales }
  }, [daily, hourly, orders, ads, pnl, r.range, r.cmp]) // eslint-disable-line react-hooks/exhaustive-deps

  const cost = (k: TrafficSource) => (k === 'fadbook' ? v.spend.fadbook : k === 'tiktak' ? v.spend.tiktak : 0)
  const totalCost = v.spend.fadbook + v.spend.tiktak

  return (
    <PolarisProvider>
      {/* like the admin, Attribution and Automations are separate pages under Marketing in the sidebar */}
      <Page
        title={tab === 0 ? 'Marketing' : TABS[tab].content}
        subtitle={tab === 1 ? 'Orders and sales matched to each ad, next to what the ad platforms report' : tab === 2 ? 'Email flows that run on their own' : undefined}
        backAction={tab === 0 ? undefined : { content: 'Marketing', onAction: () => navigate('marketing') }}
        fullWidth
      >
        {tab !== 2 && (
          <InlineStack align="space-between" blockAlign="center" gap="200">
            <RangeControls r={r} today={today} />
          </InlineStack>
        )}

        {tab === 0 && (
          <>
            <Card padding="0">
              <div className="sf-analytics-top sf-analytics-top-5">
                <MetricTile metric="sessions" title="Online store sessions" value={v.cur.sessions} prev={v.prev?.sessions} spark={sparkValues(v.s, 'sessions', r.range)} />
                <MetricTile title="Sales attributed to marketing" tip="Total sales from sessions that came from ads, organic social, creators and email." value={v.mkt.sales} display={usd(v.mkt.sales)} prev={v.prevMkt?.sales} />
                <MetricTile title="Orders attributed to marketing" tip="Orders from sessions that came from ads, organic social, creators and email." value={v.mkt.orders} prev={v.prevMkt?.orders} />
                <MetricTile metric="conversionRate" value={v.cur.conversionRate} prev={v.prev?.conversionRate} />
                <MetricTile title="Ad spend" tip="Spend on connected Fadbook and TikTak ad accounts." value={totalCost} display={usd(totalCost)} prev={v.prevSpend ? v.prevSpend.fadbook + v.prevSpend.tiktak : undefined} invert />
              </div>
            </Card>

            <TableCard title="Top marketing channels">
              <DataTable
                columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                headings={['Channel', 'Sessions', 'Orders', 'Conversion rate', 'Sales', 'AOV', 'Cost', 'ROAS', 'Cost per order']}
                rows={CHANNELS.filter(k => (v.cur.sessionsBySource[k] ?? 0) > 0 || (v.cur.ordersBySource[k] ?? 0) > 0 || cost(k) > 0).map(k => {
                  const ses = v.cur.sessionsBySource[k] ?? 0
                  const ord = v.cur.ordersBySource[k] ?? 0
                  const sal = v.cur.salesBySource[k] ?? 0
                  const c = cost(k)
                  return [sourceLabel(k), int(ses), int(ord), pct2(ses ? ord / ses : 0), usd(sal), ord ? usd(sal / ord) : '—', c ? usd(c) : '—', roas(sal, c), c && ord ? usd(c / ord) : '—']
                })}
                totals={['', int(v.cur.sessions), int(v.cur.orders), pct2(v.cur.conversionRate), usd(v.srcSales), v.cur.orders ? usd(v.srcSales / v.cur.orders) : '—', totalCost ? usd(totalCost) : '—', roas(v.srcSales, totalCost), totalCost && v.cur.orders ? usd(totalCost / v.cur.orders) : '—']}
                sortable={[false, true, true, true, true, true, true, true, true]}
                initialSortColumnIndex={4}
              />
              <div className="sf-pad sf-pad-top0">
                <Text as="p" variant="bodySm" tone="subdued">
                  Sales are credited to the channel of the session that placed the order (last click), over {formatRange(r.range)}. Ad platforms count their own conversions with view-through and longer windows, so their numbers are usually higher.
                </Text>
              </div>
            </TableCard>

            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <Card title="Sales channels and pixels">
                <BlockStack gap="300">
                  {(['fadbook', 'tiktak'] as Platform[]).map(p => {
                    const px = pixel[p]
                    const appId = p === 'fadbook' ? 'fadbook-channel' : 'tiktak-channel'
                    return (
                      <div key={p} className="sf-pixel-row">
                        <span className={`sf-pixel-logo sf-pixel-${p}`}>{p === 'fadbook' ? 'f' : '♪'}</span>
                        <div className="sf-pixel-text">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" fontWeight="semibold">{p === 'fadbook' ? 'Fadbook & Instaglam' : 'TikTak'}</Text>
                            {px.installed ? <Badge tone="success">Pixel connected</Badge> : <Badge>Not connected</Badge>}
                          </InlineStack>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {px.installed ? `${int(px.views)} page views · ${int(px.atc)} add to carts · ${int(px.purchases)} purchases sent` : 'Install the sales channel to add the pixel. Without it, ads can\'t optimize for purchases.'}
                          </Text>
                        </div>
                        {px.installed
                          ? <Button size="slim" onClick={() => openSite(p, '')}>Open Ads Manager</Button>
                          : <Button size="slim" onClick={() => navigate(`apps/${appId}`)}>Connect</Button>}
                      </div>
                    )
                  })}
                </BlockStack>
              </Card>
              <Card title="Email marketing" actions={<Link onClick={() => navigate('marketing/automations')}>View automations</Link>}>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center"><Mail size={16} /><Text as="span" variant="headingLg">{int(subscribers)}</Text><Text as="span" tone="subdued">subscribers</Text></InlineStack>
                  <Text as="p" tone="subdued">
                    {hasApp('klavio')
                      ? `Klavio sends your abandoned checkout and repeat-purchase emails. ${int(v.cur.ordersBySource.email ?? 0)} email orders in this date range.`
                      : 'Customers who tick "Email me with news and offers" at checkout join your list. Install an email app to send them automated flows.'}
                  </Text>
                  {!hasApp('klavio') && <div><Button onClick={() => navigate('apps/klavio')}>Explore Klavio</Button></div>}
                </BlockStack>
              </Card>
            </InlineGrid>
          </>
        )}

        {tab === 1 && <Attribution ads={ads} rangeFrom={r.range.from} rangeTo={r.range.to} inRange={v.inRange} navigate={navigate} />}
        {tab === 2 && <Automations installed={hasApp('klavio')} subscribers={subscribers} navigate={navigate} />}
      </Page>
    </PolarisProvider>
  )
}

function Attribution({ ads, rangeFrom, rangeTo, inRange, navigate }: {
  ads: Ad[]; rangeFrom: number; rangeTo: number; inRange: ReturnType<typeof ordersInRange>; navigate: (p: string) => void
}) {
  const rows = useMemo(() => {
    const byAd = new Map<string, { orders: number; sales: number }>()
    for (const o of inRange) {
      if (!o.adId) continue
      const x = byAd.get(o.adId) ?? { orders: 0, sales: 0 }
      x.orders++
      x.sales += o.total
      byAd.set(o.adId, x)
    }
    return ads
      .map(ad => ({ ad, ...adRangeStats(ad, rangeFrom, rangeTo), shop: byAd.get(ad.id) ?? { orders: 0, sales: 0 } }))
      .filter(x => x.spend > 0 || x.shop.orders > 0)
      .sort((a, b) => b.spend - a.spend)
  }, [ads, rangeFrom, rangeTo, inRange])
  const unknown = inRange.filter(o => o.adId && !ads.some(a => a.id === o.adId)).length

  if (!rows.length) {
    return (
      <Card>
        <EmptyState heading="No ad activity in this date range" image="ads" action={{ content: 'Open Fadbook Ads Manager', onAction: () => openSite('fadbook', '') }} secondaryAction={{ content: 'Open TikTak Ads Manager', onAction: () => openSite('tiktak', '') }}>
          When your ads send visitors to the store, Shopifly matches each order to the ad that brought the shopper in.
        </EmptyState>
      </Card>
    )
  }
  const tot = rows.reduce((a, x) => ({ spend: a.spend + x.spend, orders: a.orders + x.shop.orders, sales: a.sales + x.shop.sales, rep: a.rep + x.purchases, repv: a.repv + x.value }), { spend: 0, orders: 0, sales: 0, rep: 0, repv: 0 })
  return (
    <>
      <Banner tone="info" title="Two sources of truth">
        Orders, sales and ROAS are real Shopifly orders placed by visitors who arrived from each ad (last click). "Platform purchases" is what the ad platform reports, including view-through conversions and delayed matches.
      </Banner>
      <Card padding="0">
        <DataTable
          columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
          headings={['Ad', 'Platform', 'Spend', 'Orders', 'Sales', 'ROAS', 'Cost per order', 'Platform purchases', 'Platform ROAS']}
          truncate
          rows={rows.map(x => [
            <span key="n" title={x.ad.name}>{x.ad.name}</span>,
            x.ad.platform === 'fadbook' ? 'Fadbook' : 'TikTak',
            usd(x.spend),
            int(x.shop.orders),
            usd(x.shop.sales),
            roas(x.shop.sales, x.spend),
            x.shop.orders ? usd(x.spend / x.shop.orders) : '—',
            int(x.purchases),
            roas(x.value, x.spend),
          ])}
          totals={['', '', usd(tot.spend), int(tot.orders), usd(tot.sales), roas(tot.sales, tot.spend), tot.orders ? usd(tot.spend / tot.orders) : '—', int(tot.rep), roas(tot.repv, tot.spend)]}
          sortable={[false, false, true, true, true, true, true, true, true]}
          initialSortColumnIndex={2}
        />
      </Card>
      {unknown > 0 && <Text as="p" variant="bodySm" tone="subdued">{unknown} order{unknown === 1 ? '' : 's'} came from ads that were deleted.</Text>}
      <InlineStack gap="200">
        <Button onClick={() => navigate('analytics/reports/sales-by-channel')}>Sales by channel report</Button>
        <Button onClick={() => navigate('analytics/reports/profit-by-product')}>Profit by product</Button>
      </InlineStack>
    </>
  )
}

function Automations({ installed, subscribers, navigate }: { installed: boolean; subscribers: number; navigate: (p: string) => void }) {
  const today = useToday()
  const { daily, orders } = useGSShallow(s => ({ daily: s.store.analytics.daily, orders: s.store.orders }))
  const stats = useMemo(() => {
    const from = today - 29
    let abandoned = 0
    for (let d = from; d <= today; d++) {
      const x = daily[d]
      if (x) abandoned += Math.max(0, x.checkout - x.converted)
    }
    const recovered = orders.filter(o => o.recovered && Math.floor(o.hour / 24) >= from)
    const repeat = orders.filter(o => o.source === 'email' && !o.recovered && Math.floor(o.hour / 24) >= from)
    return {
      abandoned,
      recOrders: recovered.length, recSales: recovered.reduce((a, o) => a + o.total, 0),
      repOrders: repeat.length, repSales: repeat.reduce((a, o) => a + o.total, 0),
    }
  }, [daily, orders, today])
  if (!installed) {
    return (
      <Card>
        <EmptyState heading="Automate your email marketing" image="inbox" action={{ content: 'Get Klavio', onAction: () => navigate('apps/klavio') }}>
          Send abandoned checkout reminders, post-purchase follow-ups and replenishment emails automatically. You have {int(subscribers)} subscriber{subscribers === 1 ? '' : 's'} ready to email.
        </EmptyState>
      </Card>
    )
  }
  const price = klavioPrice(subscribers)
  return (
    <>
      <Card padding="0">
        <div className="sf-analytics-top sf-analytics-top-3">
        <MetricTile title="Subscribers" tip="Contacts who agreed to receive marketing email." value={subscribers} />
        <MetricTile title="Revenue from flows, 30 days" tip="Orders placed from Klavio emails in the last 30 days." value={stats.recSales + stats.repSales} display={usd(stats.recSales + stats.repSales)} />
        <MetricTile title="Klavio plan" tip="Klavio is priced by the number of contacts." value={price} display={price ? `${usd(price, false)}/mo` : 'Free'} />
        </div>
      </Card>
      <TableCard title="Flows">
        <DataTable
          columnContentTypes={['text', 'text', 'text', 'numeric', 'numeric', 'numeric']}
          headings={['Flow', 'Trigger', 'Status', 'Recipients (30d)', 'Orders (30d)', 'Revenue (30d)']}
          rows={[
            [<span key="a" className="sf-flow"><Radio size={14} /> Abandoned checkout</span>, 'Checkout started, no order', <Badge key="s1" tone="success">Live</Badge>, int(stats.abandoned), int(stats.recOrders), usd(stats.recSales)],
            [<span key="b" className="sf-flow"><Radio size={14} /> Replenishment &amp; win-back</span>, 'Past customer due to reorder', <Badge key="s2" tone="success">Live</Badge>, '—', int(stats.repOrders), usd(stats.repSales)],
            [<span key="c" className="sf-flow"><Radio size={14} /> Welcome series</span>, 'Joined your list', <Badge key="s3" tone="success">Live</Badge>, int(subscribers), '—', '—'],
          ]}
        />
      </TableCard>
      <Text as="p" variant="bodySm" tone="subdued">
        Abandoned checkout recipients are shoppers who reached checkout without paying. Replenishment emails only bring back customers for products people reorder.
      </Text>
    </>
  )
}
