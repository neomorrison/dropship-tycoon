// Home: range + live visitors, metrics bar with chart, setup guide, things to do, tips.
import { useMemo, useState } from 'react'
import {
  Check, ChevronDown, ChevronUp, CircleDollarSign, Clock, Ellipsis, Gavel, MessageCircle, PackageCheck,
  ShieldAlert, Sparkles, Truck,
} from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { GameState } from '../../../../core/types'
import { act, getGS, useGS, useGSShallow } from '../../../../core/store'
import { openSite } from '../../../../core/ui'
import { formatDate, hourOfDay } from '../../../../core/time'
import { getProduct } from '../../../../sim/market'
import { PLAN_LABEL } from '../../../../sim/store'
import {
  ActionList, Badge, Banner, BlockStack, Button, Card, InlineStack, Popover, PolarisProvider, ProgressBar, Text,
} from '../../../kit/polaris'
import { LineChartCard } from '../../../kit/charts'
import { cx, formatRange } from '../../../kit/common'
import { aggregate, aggregateToHour, formatMetric, metricOf, seriesPoints, sparkValues, zeroToEmpty, type MetricKey } from '../core/analytics'
import { useSfRange } from '../core/rangeState'
import { MetricTile, RangeControls, useNow, useToday } from '../core/ui'
import { needsFulfillment } from '../core/orders'
import { usd } from '../core/format'

const HOME_METRICS: MetricKey[] = ['sessions', 'totalSales', 'orders', 'conversionRate']

export default function Home({ navigate }: ShopiflyPageProps) {
  const today = useToday()
  const r = useSfRange('home', today)
  const [metric, setMetric] = useState<MetricKey>('totalSales')
  // re-render when analytics change (every tick with traffic)
  const { daily, hourly, live, name } = useGSShallow(s => ({
    daily: s.store.analytics.daily, hourly: s.store.analytics.hourly, live: s.store.liveVisitors, name: s.store.name,
  }))
  const data = useMemo(() => {
    const state = getGS()
    const cur = aggregate(state, r.range)
    // a range that ends today is still in progress: compare with the same point of the previous period
    const prev = !r.cmp ? null : r.range.to === today ? aggregateToHour(state, r.cmp, hourOfDay(state.time.hour)) : aggregate(state, r.cmp)
    const spark: Record<string, number[]> = {}
    for (const k of HOME_METRICS) spark[k] = sparkValues(state, k, r.range)
    const points = zeroToEmpty(seriesPoints(state, metric, r.range, r.cmp))
    return { cur, prev, spark, points }
    // daily/hourly are the inputs; getGS() reads the same snapshot
  }, [daily, hourly, r.range, r.cmp, metric, today]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PolarisProvider>
      {/* Home has no page title; the kit Page renders a stray "0" header when title and actions are all empty */}
      <div className="p-page sf-home"><div className="p-page-body">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <InlineStack gap="200" blockAlign="center">
            <RangeControls r={r} today={today} compare={false} size="slim" />
            <ChannelPicker />
          </InlineStack>
          <button type="button" className="sf-live-pill" onClick={() => navigate('analytics/live')}>
            <span className={cx('sf-live-dot', live > 0 && 'is-live')} />
            {live} live visitor{live === 1 ? '' : 's'}
          </button>
        </InlineStack>

        <Card padding="0">
          <div className="sf-home-tiles">
            {HOME_METRICS.map(k => (
              <MetricTile
                key={k}
                metric={k}
                value={metricOf(data.cur, k)}
                prev={data.prev ? metricOf(data.prev, k) : undefined}
                spark={data.spark[k]}
                active={metric === k}
                onClick={() => setMetric(k)}
              />
            ))}
          </div>
          <div className="sf-home-chart">
            <LineChartCard
              bare
              title={HOME_TITLES[metric]}
              value={formatMetric(metric, metricOf(data.cur, metric))}
              data={data.points}
              format={metric === 'conversionRate' ? 'percent' : metric === 'totalSales' ? 'money' : 'number'}
              currentLabel={formatRange(r.range)}
              compareLabel={r.cmp ? formatRange(r.cmp) : undefined}
              height={180}
              emptyText="No data for this date range"
            />
          </div>
        </Card>

        <SetupGuide navigate={navigate} storeName={name} />
        <ThingsToDo navigate={navigate} />
        <Tips navigate={navigate} />
      </div></div>
    </PolarisProvider>
  )
}

/** "All channels" filter. Every sale in the game comes through the Online Store channel. */
function ChannelPicker() {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<'All channels' | 'Online Store'>('All channels')
  return (
    <Popover
      active={open}
      onClose={() => setOpen(false)}
      activator={<Button size="slim" disclosure pressed={open} onClick={() => setOpen(o => !o)}>{channel}</Button>}
    >
      <ActionList
        onActionAnyItem={() => setOpen(false)}
        items={[
          { content: 'All channels', active: channel === 'All channels', onAction: () => setChannel('All channels') },
          { content: 'Online Store', active: channel === 'Online Store', helpText: 'Every order comes from your online store', onAction: () => setChannel('Online Store') },
        ]}
      />
    </Popover>
  )
}

const HOME_TITLES: Record<MetricKey, string> = {
  sessions: 'Sessions over time', totalSales: 'Total sales over time', orders: 'Orders over time', conversionRate: 'Conversion rate over time',
  grossSales: 'Gross sales', netSales: 'Net sales', units: 'Items', aov: 'Average order value', returningRate: 'Returning customer rate',
  atcRate: 'Added to cart', checkoutRate: 'Reached checkout', discounts: 'Discounts', returns: 'Returns',
}

// ---------------------------------------------------------------------------
// Setup guide
// ---------------------------------------------------------------------------
interface GuideStep {
  id: string
  title: string
  body: string
  done: boolean
  action: { label: string; run: () => void }
  secondary?: { label: string; run: () => void }
}

function pageCustomized(s: GameState): boolean {
  return s.store.products.some(p => {
    const c = p.grade?.copy
    if (c) return c.titleSimilarity < 0.5 && c.supplierSimilarity < 0.5
    try {
      return p.title.trim().toLowerCase() !== getProduct(p.catalogId).supplierTitle.trim().toLowerCase()
    } catch {
      return false
    }
  })
}

function SetupGuide({ navigate, storeName }: { navigate: (p: string) => void; storeName: string }) {
  const { products, apps, policies, pixel, customDomain, dismissed } = useGSShallow(s => ({
    products: s.store.products, apps: s.store.apps, policies: s.store.policies, pixel: s.store.pixel,
    customDomain: s.store.customDomain, dismissed: s.flags['sf.setupGuideDismissed'] === true,
  }))
  const customized = useGS(pageCustomized)
  const [collapsed, setCollapsed] = useState(false)
  const [menu, setMenu] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const first = products[0]
  const steps: GuideStep[] = [
    {
      id: 'product', title: 'Add your first product', done: products.length > 0,
      body: 'Find a product on AliExprez and import it with DSerz. The import copies the supplier\'s title, photos and description into a draft you can edit.',
      action: { label: 'Find products on AliExprez', run: () => openSite('aliexprez', '') },
      secondary: { label: 'Go to products', run: () => navigate('products') },
    },
    {
      id: 'page', title: 'Customize your product page', done: customized,
      body: 'Write your own title and description, add photos and set your price. Shoppers recognize copy-pasted supplier listings.',
      action: { label: first ? 'Edit product' : 'Go to products', run: () => navigate(first ? `products/${first.id}` : 'products') },
    },
    {
      id: 'fulfill', title: 'Install a fulfillment app', done: apps.some(a => a.appId === 'dserz'),
      body: 'Without a fulfillment app, every dropship order waits in Unfulfilled until you place the supplier order yourself.',
      action: { label: 'Install DSerz', run: () => navigate('apps/dserz') },
      secondary: { label: 'Browse apps', run: () => navigate('apps') },
    },
    {
      id: 'policies', title: 'Add store policies',
      done: !!(policies.refund.trim() && policies.shipping.trim() && policies.privacy.trim() && policies.terms.trim()),
      body: 'Add refund, shipping, privacy and terms of service pages. Customers look for them before they buy, and banks ask for them in disputes.',
      action: { label: 'Add policies', run: () => navigate('settings/policies') },
    },
    {
      id: 'channel', title: 'Connect a sales channel', done: pixel.fadbook.installed || pixel.tiktak.installed,
      body: 'Install the Fadbook & Instaglam or TikTak sales channel. It adds the pixel that reports purchases back to the ad platform.',
      action: { label: 'Add Fadbook & Instaglam', run: () => navigate('apps/fadbook-channel') },
      secondary: { label: 'Add TikTak', run: () => navigate('apps/tiktak-channel') },
    },
    {
      id: 'active', title: 'Make a product available', done: products.some(p => p.status === 'active'),
      body: 'Draft products aren\'t visible on your online store. Set the product status to Active when the page is ready.',
      action: { label: 'Go to products', run: () => navigate('products') },
    },
    {
      id: 'domain', title: 'Add a custom domain', done: !!customDomain,
      body: 'A domain like yourbrand.com looks more trustworthy than a myshopifly.com address.',
      action: { label: 'Add domain', run: () => navigate('settings/domains') },
    },
  ]
  const done = steps.filter(x => x.done).length
  if (dismissed || done === steps.length) return null
  const current = openId ?? steps.find(x => !x.done)?.id ?? steps[0].id

  return (
    <Card padding="0">
      <div className="sf-guide-head">
        <div className="sf-guide-head-text">
          <Text as="h2" variant="headingMd">Setup guide</Text>
          <Text as="p" tone="subdued">Use this personalized guide to get {storeName || 'your store'} up and running.</Text>
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodySm" tone="subdued">{done} / {steps.length} completed</Text>
            <div className="sf-guide-progress"><ProgressBar progress={(done / steps.length) * 100} size="small" /></div>
          </InlineStack>
        </div>
        <InlineStack gap="100" wrap={false}>
          <Popover
            active={menu}
            onClose={() => setMenu(false)}
            preferredAlignment="right"
            activator={<Button variant="tertiary" icon={Ellipsis} accessibilityLabel="More actions" onClick={() => setMenu(m => !m)} />}
          >
            <ActionList
              onActionAnyItem={() => setMenu(false)}
              items={[{ content: 'Dismiss guide', onAction: () => act(s => { s.flags['sf.setupGuideDismissed'] = true }) }]}
            />
          </Popover>
          <Button variant="tertiary" icon={collapsed ? ChevronDown : ChevronUp} accessibilityLabel={collapsed ? 'Expand' : 'Collapse'} onClick={() => setCollapsed(c => !c)} />
        </InlineStack>
      </div>
      {!collapsed && (
        <div className="sf-guide-list">
          {steps.map(st => {
            const open = st.id === current
            return (
              <div key={st.id} className={cx('sf-guide-item', open && 'is-open', st.done && 'is-done')}>
                <button type="button" className="sf-guide-row" onClick={() => setOpenId(st.id)} aria-expanded={open}>
                  <span className={cx('sf-guide-check', st.done && 'is-done')}>{st.done && <Check size={12} strokeWidth={3} />}</span>
                  <span className="sf-guide-title">{st.title}</span>
                </button>
                {open && (
                  <div className="sf-guide-body">
                    <Text as="p" tone="subdued">{st.body}</Text>
                    <InlineStack gap="200">
                      <Button variant={st.done ? 'secondary' : 'primary'} onClick={st.action.run}>{st.action.label}</Button>
                      {st.secondary && <Button variant="tertiary" onClick={st.secondary.run}>{st.secondary.label}</Button>}
                    </InlineStack>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Things to do
// ---------------------------------------------------------------------------
function ThingsToDo({ navigate }: { navigate: (p: string) => void }) {
  const today = useToday()
  const now = useNow()
  const { orders, tickets, chargebacks, payouts, hold, plan, trialEnds, pending, dserz } = useGSShallow(s => ({
    orders: s.store.orders, tickets: s.store.tickets, chargebacks: s.store.chargebacks, payouts: s.store.payouts,
    hold: s.store.hold, plan: s.store.plan, trialEnds: s.store.trialEndsDay, pending: s.store.pendingBalance,
    dserz: s.store.apps.some(a => a.appId === 'dserz'),
  }))
  const items = useMemo(() => {
    const out: { key: string; icon: typeof Truck; tone?: 'critical' | 'warning'; title: string; sub: string; path: string }[] = []
    const cb = chargebacks.filter(c => c.status === 'needs_response')
    if (cb.length) {
      const soonest = Math.min(...cb.map(c => c.respondByDay))
      out.push({ key: 'cb', icon: Gavel, tone: 'critical', title: `${cb.length} chargeback${cb.length === 1 ? ' needs' : 's need'} a response`, sub: `${soonest <= today ? 'Respond today' : soonest === today + 1 ? 'Respond by tomorrow' : `Respond by ${formatDate(soonest, 'md')}`} or the dispute is lost`, path: 'disputes' })
    }
    const escalated = tickets.filter(t => t.status === 'escalated').length
    const open = tickets.filter(t => t.status === 'open').length
    if (escalated) out.push({ key: 'esc', icon: ShieldAlert, tone: 'critical', title: `${escalated} overdue customer message${escalated === 1 ? '' : 's'}`, sub: 'Customers waited more than 48 hours for a reply', path: 'inbox/overdue' })
    if (open) out.push({ key: 'open', icon: MessageCircle, title: `${open} customer message${open === 1 ? '' : 's'} to answer`, sub: 'Reply within 48 hours', path: 'inbox' })
    // with DSerz, orders are placed within the hour: only flag ones that are stuck (supplier charge failed)
    const unf = orders.filter(o => needsFulfillment(o) && (!dserz || now - o.hour >= 2))
    if (unf.length) {
      out.push({
        key: 'unf', icon: Truck, tone: unf.some(o => today - Math.floor(o.hour / 24) >= 2) ? 'warning' : undefined,
        title: `${unf.length} order${unf.length === 1 ? '' : 's'} to fulfill`,
        sub: dserz ? 'DSerz couldn\'t pay the supplier. Check your card balance.' : 'Place the supplier order for each one, or install DSerz to automate it',
        path: 'orders',
      })
    }
    const next = payouts.filter(p => p.status === 'pending').sort((a, b) => a.arriveDay - b.arriveDay)[0]
    if (next) out.push({ key: 'po', icon: CircleDollarSign, title: `${usd(next.amount)} payout ${next.arriveDay <= today ? 'arriving today' : `arriving ${formatDate(next.arriveDay, 'md')}`}`, sub: 'Shopifly Payments → Chaise checking', path: `finances/payouts/${next.id}` })
    else if (pending > 0) out.push({ key: 'bal', icon: CircleDollarSign, title: `${usd(pending)} in your Shopifly balance`, sub: 'Paid out after tonight\'s settlement', path: 'finances' })
    const held = payouts.filter(p => p.status === 'held')
    if (hold?.active || held.length) out.push({ key: 'hold', icon: Clock, tone: 'warning', title: held.length ? `${held.length} payout${held.length === 1 ? '' : 's'} on hold` : 'Payout reserve active', sub: hold?.reason ?? 'Payouts are paused for review', path: 'finances' })
    if (plan === 'trial' && trialEnds != null && trialEnds - today <= 14 && trialEnds >= today) {
      out.push({ key: 'trial', icon: Sparkles, title: `Your $1/month offer ends ${trialEnds === today ? 'today' : formatDate(trialEnds, 'md')}`, sub: `Then ${PLAN_LABEL.basic} at $39/month`, path: 'settings/plan' })
    }
    return out
  }, [orders, tickets, chargebacks, payouts, hold, plan, trialEnds, pending, today, dserz, now])

  return (
    <Card title="Things to do">
      {items.length === 0 ? (
        <div className="sf-todo-empty">
          <PackageCheck size={22} strokeWidth={1.7} />
          <div>
            <Text as="p" fontWeight="semibold">You're all caught up</Text>
            <Text as="p" tone="subdued">Orders to fulfill, customer messages and disputes will appear here.</Text>
          </div>
        </div>
      ) : (
        <div className="sf-todo-list">
          {items.map(it => (
            <button key={it.key} type="button" className={cx('sf-todo', it.tone && `sf-todo-${it.tone}`)} onClick={() => navigate(it.path)}>
              <span className="sf-todo-icon"><it.icon size={16} strokeWidth={2} /></span>
              <span className="sf-todo-text">
                <span className="sf-todo-title">{it.title}</span>
                <span className="sf-todo-sub">{it.sub}</span>
              </span>
              <span className="sf-todo-chev">›</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tips (Shopifly editorial cards, chosen from the store's state)
// ---------------------------------------------------------------------------
function Tips({ navigate }: { navigate: (p: string) => void }) {
  const { apps, orders, products, custom } = useGSShallow(s => ({
    apps: s.store.apps, orders: s.store.orders.length, products: s.store.products.length, custom: s.store.customDomain,
  }))
  const has = (id: string) => apps.some(a => a.appId === id)
  const tips: { key: string; badge: string; title: string; body: string; cta: string; run: () => void }[] = []
  if (products > 0 && !has('judgyme') && !has('lookz') && !has('vitalz')) {
    tips.push({ key: 'reviews', badge: 'Trust', title: 'Show what customers think', body: 'Most shoppers read reviews before buying from a store they don\'t know. A reviews app adds a reviews section to your product page.', cta: 'Browse review apps', run: () => navigate('apps') })
  }
  if (orders >= 20 && !has('klavio')) {
    tips.push({ key: 'email', badge: 'Email', title: 'Win back abandoned checkouts', body: 'More than half of the shoppers who reach checkout leave without paying. An email flow reminds them the next day.', cta: 'Explore email apps', run: () => navigate('apps/klavio') })
  }
  if (orders >= 5 && !has('trackwise') && !has('gorgeous')) {
    tips.push({ key: 'track', badge: 'Support', title: '"Where is my order?"', body: 'Order-status questions are the most common support ticket for stores shipping from overseas. A tracking page answers them before they are asked.', cta: 'See tracking apps', run: () => navigate('apps/trackwise') })
  }
  if (!custom && products > 0) {
    tips.push({ key: 'domain', badge: 'Brand', title: 'Get a domain that\'s yours', body: 'Your store address shows up in ads, checkout and every email. A .com costs about $14 a year.', cta: 'Buy a domain', run: () => navigate('settings/domains') })
  }
  tips.push({ key: 'analytics', badge: 'Analytics', title: 'Know your numbers', body: 'Your conversion rate, average order value and cost per purchase decide whether ads can be profitable. Check Analytics before you raise a budget.', cta: 'View analytics', run: () => navigate('analytics') })
  const show = tips.slice(0, 2)
  return (
    <div className="sf-tips">
      {show.map(t => (
        <Card key={t.key}>
          <BlockStack gap="200">
            <div><Badge>{t.badge}</Badge></div>
            <Text as="h3" variant="headingSm">{t.title}</Text>
            <Text as="p" tone="subdued">{t.body}</Text>
            <div><Button onClick={t.run}>{t.cta}</Button></div>
          </BlockStack>
        </Card>
      ))}
      {show.length === 0 && <Banner tone="info">Nothing new to recommend right now.</Banner>}
    </div>
  )
}
