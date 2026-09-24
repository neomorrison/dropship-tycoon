// Orders: metrics bar, view tabs (All / Unfulfilled / Unpaid / Open / Archived), search,
// sortable IndexTable with bulk "Fulfill orders" for stores without a fulfillment app.
import { useMemo, useState } from 'react'
import type { ShopiflyPageProps } from '../route'
import type { Order } from '../../../../core/types'
import { act, useGSShallow } from '../../../../core/store'
import { dayOf, formatDate, hourOfDay } from '../../../../core/time'
import { fulfillOrders, PAYMENT_LABELS, sourceLabel } from '../../../../sim/store'
import {
  Banner, Card, EmptyState, IndexFilters, IndexTable, InlineStack, Page, PolarisProvider, Text, type SortDirection,
} from '../../../kit/polaris'
import { useSfRange } from '../core/rangeState'
import { MetricTile, RangeControls, StatusBadgeView, useNow, useToday } from '../core/ui'
import {
  deliveryMethod, deliveryStatus, fulfillmentBadge, isArchived, itemsLabel, needsFulfillment, openOrderIdSet, orderTags,
  paymentBadge, productTitle,
} from '../core/orders'
import { capMinute, listDate, orderMinute, usd } from '../core/format'
import { ExportModal } from '../core/ExportModal'

const PAYMENT_METHOD_LABEL: Record<NonNullable<Order['paymentMethod']>, string> = {
  card: 'Credit card', shop_pay: PAYMENT_LABELS.shopPay, paypal: PAYMENT_LABELS.paypal, bnpl: PAYMENT_LABELS.bnpl,
}

type View = 'all' | 'unfulfilled' | 'unpaid' | 'open' | 'archived'
const VIEWS: { id: View; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unfulfilled', label: 'Unfulfilled' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'open', label: 'Open' },
  { id: 'archived', label: 'Archived' },
]

interface OrdersStats { orders: number; units: number; returns: number; fulfilled: number; delivered: number }
/** `cutoff`: only count orders placed on the last day up to this hour of day (comparison with a period in progress) */
function stats(list: Order[], from: number, to: number, cutoff = 23): OrdersStats {
  const out = { orders: 0, units: 0, returns: 0, fulfilled: 0, delivered: 0 }
  for (const o of list) {
    const d = dayOf(o.hour)
    if (d >= from && d <= to && (d < to || hourOfDay(o.hour) <= cutoff)) {
      out.orders++
      out.units += o.qty
      out.returns += o.refunded
    }
    // fulfillment / delivery events counted on the day they happened
    if (o.shipDay != null && o.shipDay >= from && o.shipDay <= to && o.fulfillment !== 'unfulfilled') out.fulfilled++
    if (o.deliveredDay != null && o.deliveredDay >= from && o.deliveredDay <= to) out.delivered++
  }
  return out
}
function dailySeries(list: Order[], from: number, to: number, pick: (o: Order) => [number | null, number]): number[] {
  const n = Math.max(1, to - from + 1)
  const arr = new Array(n).fill(0)
  for (const o of list) {
    const [d, v] = pick(o)
    if (d != null && d >= from && d <= to) arr[d - from] += v
  }
  return arr
}

export default function Orders({ navigate }: ShopiflyPageProps) {
  const today = useToday()
  const now = useNow()
  const r = useSfRange('orders', today)
  const { orders, tickets, chargebacks, products, dserz } = useGSShallow(s => ({
    orders: s.store.orders, tickets: s.store.tickets, chargebacks: s.store.chargebacks, products: s.store.products,
    dserz: s.store.apps.some(a => a.appId === 'dserz'),
  }))
  const [view, setView] = useState(0)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ value: string; direction: SortDirection }>({ value: 'date', direction: 'descending' })
  const [selected, setSelected] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)

  const openIds = useMemo(() => openOrderIdSet(tickets, chargebacks), [tickets, chargebacks])
  const counts = useMemo(() => {
    let unf = 0
    for (const o of orders) if (o.fulfillment === 'unfulfilled' && !o.cancelled && o.financial !== 'refunded') unf++
    return { unf }
  }, [orders])
  const waiting = useMemo(() => orders.filter(needsFulfillment), [orders])
  // with DSerz, new orders are placed within the hour; only stuck ones need attention
  const stuck = useMemo(() => (dserz ? waiting.filter(o => now - o.hour >= 2) : waiting), [waiting, dserz, now])

  const filtered = useMemo(() => {
    const v = VIEWS[view].id
    const ql = q.trim().toLowerCase().replace(/^#/, '')
    const out: Order[] = []
    for (const o of orders) {
      if (v === 'unfulfilled' && !(o.fulfillment === 'unfulfilled' && !o.cancelled && o.financial !== 'refunded')) continue
      // Shopifly Payments captures every checkout at purchase: nothing is ever awaiting payment
      if (v === 'unpaid') continue
      if (v === 'open' && isArchived(o, openIds)) continue
      if (v === 'archived' && !isArchived(o, openIds)) continue
      if (ql) {
        const hay = `${o.id} ${o.customer.name} ${o.customer.email} ${productTitle(products, o)}`.toLowerCase()
        if (!hay.includes(ql)) continue
      }
      out.push(o)
    }
    return out
  }, [orders, view, q, openIds, products])

  const cur = useMemo(() => stats(orders, r.range.from, r.range.to), [orders, r.range])
  // a range ending today is still in progress: orders placed are compared up to the same hour
  const cutoff = r.range.to === today ? hourOfDay(now) : 23
  const prev = useMemo(() => (r.cmp ? stats(orders, r.cmp.from, r.cmp.to, cutoff) : null), [orders, r.cmp, cutoff])
  const spark = useMemo(() => {
    // daily sparklines over the selected range (at least the last 7 days for 1-day ranges)
    const from = Math.min(r.range.from, r.range.to - 6)
    return {
      orders: dailySeries(orders, from, r.range.to, o => [dayOf(o.hour), 1]),
      units: dailySeries(orders, from, r.range.to, o => [dayOf(o.hour), o.qty]),
      returns: dailySeries(orders, from, r.range.to, o => [dayOf(o.hour), o.refunded]),
      fulfilled: dailySeries(orders, from, r.range.to, o => [o.fulfillment !== 'unfulfilled' ? o.shipDay : null, 1]),
      delivered: dailySeries(orders, from, r.range.to, o => [o.deliveredDay, 1]),
    }
  }, [orders, r.range])

  const fulfillIds = (ids: string[]) => {
    const want = ids.map(Number).filter(id => waiting.some(o => o.id === id))
    if (!want.length) return
    act(s => { fulfillOrders(s, want) })
    setSelected([])
  }

  const tabs = VIEWS.map(v => ({ id: v.id, content: v.label, badge: v.id === 'unfulfilled' && counts.unf ? counts.unf : undefined }))

  if (orders.length === 0) {
    return (
      <PolarisProvider>
        <Page title="Orders">
          <Card>
            <EmptyState
              heading="Your orders will show here"
              image="orders"
              action={{ content: 'View products', onAction: () => navigate('products') }}
              secondaryAction={{ content: 'Open Live View', onAction: () => navigate('analytics/live') }}
            >
              To get orders, you need to get customers to your store. Make a product active, then send traffic to it with ads or social posts.
            </EmptyState>
          </Card>
        </Page>
      </PolarisProvider>
    )
  }

  return (
    <PolarisProvider>
      <Page title="Orders" fullWidth secondaryActions={[{ content: 'Export', onAction: () => setExporting(true) }]}>
        <Card padding="0">
          <div className="sf-orders-metrics">
            <div className="sf-orders-metrics-range">
              <RangeControls r={r} today={today} compare={false} size="slim" />
            </div>
            <div className="sf-orders-tiles">
              <MetricTile title="Orders" tip="Orders placed in this date range." value={cur.orders} prev={prev?.orders} spark={spark.orders} />
              <MetricTile title="Items ordered" tip="Total quantity of items in those orders." value={cur.units} prev={prev?.units} spark={spark.units} />
              <MetricTile title="Returns" tip="Value of refunds on orders placed in this date range." value={cur.returns} display={usd(cur.returns)} prev={prev?.returns} invert spark={spark.returns} />
              <MetricTile title="Orders fulfilled" tip="Orders handed to the carrier in this date range." value={cur.fulfilled} prev={prev?.fulfilled} spark={spark.fulfilled} />
              <MetricTile title="Orders delivered" tip="Orders the carrier marked as delivered in this date range." value={cur.delivered} prev={prev?.delivered} spark={spark.delivered} />
            </div>
          </div>
        </Card>

        {stuck.length > 0 && (
          <Banner
            tone={stuck.some(o => today - dayOf(o.hour) >= 2) ? 'warning' : 'info'}
            title={`${stuck.length} order${stuck.length === 1 ? ' is' : 's are'} waiting to be fulfilled`}
            action={{ content: `Fulfill ${stuck.length} order${stuck.length === 1 ? '' : 's'}`, onAction: () => act(s => { fulfillOrders(s, stuck.map(o => o.id)) }) }}
            secondaryAction={dserz ? { content: 'View billing', onAction: () => navigate('finances/billing') } : { content: 'Install DSerz', onAction: () => navigate('apps/dserz') }}
          >
            {dserz
              ? 'DSerz couldn\'t pay the supplier for these orders. Free up room on your card or add funds, then fulfill them.'
              : 'Fulfilling places and pays the AliExprez order for each one. Customers start asking where their order is after a few days.'}
          </Banner>
        )}

        <Card padding="0">
          <IndexFilters
            tabs={tabs}
            selected={view}
            onSelect={i => { setView(i); setSelected([]) }}
            queryValue={q}
            onQueryChange={setQ}
            queryPlaceholder="Searching all orders"
            sortOptions={[
              { label: 'Order number', value: 'number', directionLabels: ['Ascending', 'Descending'] },
              { label: 'Date', value: 'date', directionLabels: ['Oldest to newest', 'Newest to oldest'] },
              { label: 'Customer name', value: 'customer', directionLabels: ['A–Z', 'Z–A'] },
              { label: 'Total', value: 'total', directionLabels: ['Lowest to highest', 'Highest to lowest'] },
            ]}
            sortSelected={sort}
            onSortChange={(value, direction) => setSort({ value, direction })}
          />
          <IndexTable
            rows={filtered}
            rowKey={o => String(o.id)}
            resourceName={{ singular: 'order', plural: 'orders' }}
            selectedIds={selected}
            onSelectionChange={setSelected}
            promotedBulkActions={!waiting.length ? [] : [{
              content: (() => {
                const n = selected.filter(id => waiting.some(o => String(o.id) === id)).length
                return n ? `Fulfill ${n} order${n === 1 ? '' : 's'}` : 'Fulfill orders'
              })(),
              // only orders still waiting for their supplier order can be fulfilled
              disabled: !selected.some(id => waiting.some(o => String(o.id) === id)),
              onAction: fulfillIds,
            }]}
            onRowClick={o => navigate(`orders/${o.id}`)}
            sort={{ columnId: sort.value, direction: sort.direction }}
            onSortChange={st => setSort({ value: st.columnId, direction: st.direction })}
            pageSize={50}
            resetPageKey={`${view}|${q}`}
            rowTone={o => (o.cancelled || o.financial === 'refunded' ? 'subdued' : undefined)}
            emptyState={
              <EmptyState heading={q ? 'No orders found' : `No ${VIEWS[view].label.toLowerCase()} orders`} image="search" compact>
                {q ? 'Try changing the filters or search term.' : 'Orders matching this view will appear here.'}
              </EmptyState>
            }
            columns={[
              {
                id: 'number', title: 'Order', sortValue: o => o.id, nowrap: true,
                render: o => (
                  <InlineStack gap="100" blockAlign="center" wrap={false}>
                    <Text as="span" fontWeight="semibold">#{o.id}</Text>
                    {openIds.has(o.id) && <span className="sf-dot-alert" title="Open message or dispute" />}
                  </InlineStack>
                ),
              },
              { id: 'date', title: 'Date', sortValue: o => o.hour + o.id / 1e6, nowrap: true, render: o => listDate(o.hour, now, o.id, orderMinute(orders, o)) },
              { id: 'customer', title: 'Customer', sortValue: o => o.customer.name, nowrap: true, render: o => o.customer.name },
              { id: 'channel', title: 'Channel', nowrap: true, render: () => 'Online Store' },
              { id: 'total', title: 'Total', numeric: true, sortValue: o => o.total, render: o => usd(o.total) },
              { id: 'payment', title: 'Payment status', nowrap: true, render: o => <StatusBadgeView b={paymentBadge(o)} /> },
              { id: 'fulfillment', title: 'Fulfillment status', nowrap: true, render: o => <StatusBadgeView b={fulfillmentBadge(o)} /> },
              { id: 'items', title: 'Items', nowrap: true, sortValue: o => o.qty, render: o => itemsLabel(o.qty) },
              { id: 'delivery', title: 'Delivery status', nowrap: true, render: o => deliveryStatus(o, today) },
              { id: 'method', title: 'Delivery method', nowrap: true, render: o => deliveryMethod(o) },
              {
                id: 'tags', title: 'Tags',
                render: o => {
                  const t = orderTags(o)
                  return t.length ? <span className="sf-tags">{t.map(x => <span key={x} className="sf-tag">{x}</span>)}</span> : null
                },
              },
            ]}
          />
        </Card>
      </Page>
      {exporting && (
        <ExportModal
          open
          onClose={() => setExporting(false)}
          resource="orders"
          filename={`orders_export_day${today + 1}.csv`}
          scopes={[
            { value: 'all', label: 'All orders', rows: orders.slice().reverse() },
            // the current tab / search, when it narrows the list
            ...(view > 0 || q.trim() ? [{ value: 'view', label: q.trim() ? 'Orders matching your search' : `${VIEWS[view].label} orders`, rows: filtered.slice().reverse() }] : []),
            { value: 'selected', label: 'Selected orders', rows: orders.filter(o => selected.includes(String(o.id))).reverse() },
          ]}
          headings={['Name', 'Email', 'Financial Status', 'Fulfillment Status', 'Created at', 'Subtotal', 'Shipping', 'Discount Amount', 'Total', 'Refunded Amount', 'Lineitem quantity', 'Lineitem name', 'Lineitem variant', 'Billing Name', 'Shipping City', 'Shipping Province', 'Shipping Country', 'Payment Method', 'Source']}
          toRow={o => [
            `#${o.id}`, o.customer.email, o.financial, o.fulfillment, `${formatDate(dayOf(o.hour), 'iso')} ${String(hourOfDay(o.hour)).padStart(2, '0')}:${String(capMinute(orderMinute(orders, o), o.hour, now)).padStart(2, '0')}`,
            (o.subtotal + o.upsell).toFixed(2), o.shippingCharged.toFixed(2), o.discount.toFixed(2), o.total.toFixed(2), o.refunded.toFixed(2),
            o.qty, productTitle(products, o), o.variant ?? '', o.customer.name, o.customer.city, o.customer.region, 'US',
            o.paymentMethod ? PAYMENT_METHOD_LABEL[o.paymentMethod] : 'Credit card', sourceLabel(o.source),
          ]}
        />
      )}
    </PolarisProvider>
  )
}
