// Order detail: fulfillment card, payment summary, timeline, customer / conversion / supplier cards,
// refund modal, dispute and message banners.
import { useMemo, useState, type ReactNode } from 'react'
import { MapPin, Package, RotateCcw, Truck } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { Chargeback, Order, StoreProduct, SupportTicket } from '../../../../core/types'
import { act, useGSShallow } from '../../../../core/store'
import { dayOf, formatDate, hourAt } from '../../../../core/time'
import { fulfillOrder, PAYMENT_LABELS, refundOrder, sourceLabel } from '../../../../sim/store'
import {
  Badge, Banner, BlockStack, Button, Card, Divider, EmptyState, InlineStack, Layout, Link, Modal, Page, PolarisProvider,
  Select, Text, TextField,
} from '../../../kit/polaris'
import {
  customerId, deliveryMethod, fulfillmentBadge, inProgress, needsFulfillment, paymentBadge, productThumb, productTitle,
  streetFor, zipFor,
} from '../core/orders'
import { ProductCell, StatusBadgeView, SummaryLine, useNow, useToday } from '../core/ui'
import { capMinute, clock, longDateTime, minuteOf, orderMinute, trackingShort, usd } from '../core/format'

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

const PAY_METHOD: Record<NonNullable<Order['paymentMethod']>, string> = {
  card: 'Credit card', shop_pay: PAYMENT_LABELS.shopPay, paypal: PAYMENT_LABELS.paypal, bnpl: PAYMENT_LABELS.bnpl,
}

interface TimelineEvent { hour: number; min: number; text: ReactNode; tone?: 'critical' | 'success'; key: string }

function buildTimeline(o: Order, m: number, tickets: SupportTicket[], cb: Chargeback | undefined, supplierLabel: string): TimelineEvent[] {
  const ev: TimelineEvent[] = []
  ev.push({ key: 'placed', hour: o.hour, min: m, text: <>{o.customer.name} placed this order on Online Store.</> })
  ev.push({ key: 'paid', hour: o.hour, min: m, text: <>A {usd(o.total)} USD payment was processed using {PAY_METHOD[o.paymentMethod ?? 'card']}.</> })
  ev.push({ key: 'conf', hour: o.hour, min: Math.min(59, m + 1), text: <>Order confirmation email was sent to {o.customer.name} ({o.customer.email}).</> })
  if (o.recovered) ev.push({ key: 'rec', hour: o.hour, min: m, text: <>Klavio: the customer came back from the abandoned checkout email.</> })
  if (o.supplierOrderedHour != null) {
    ev.push({
      key: 'sup', hour: o.supplierOrderedHour, min: Math.min(59, m + 3),
      // 3PL orders ship from stock you already bought: only pick, pack & postage is charged
      text: o.fulfilledBy === '3pl'
        ? <>Fulfillment request sent to the {supplierLabel}. Pick, pack &amp; postage: {usd(o.shippingCost)}.</>
        : <>{supplierLabel} order placed and paid ({usd(o.supplierCost ?? o.cogs + o.shippingCost)}).</>,
    })
  }
  if (o.shipDay != null && o.fulfillment !== 'unfulfilled') {
    ev.push({ key: 'ship', hour: hourAt(o.shipDay, 10), min: minuteOf(`${o.id}s`), text: <>{o.qty} item{o.qty === 1 ? ' was' : 's were'} fulfilled.{o.tracking ? <> Tracking number <span className="sf-mono">{o.tracking}</span>.</> : null}</> })
  }
  if (o.deliveredDay != null) ev.push({ key: 'del', hour: hourAt(o.deliveredDay, 14), min: minuteOf(`${o.id}d`), tone: 'success', text: <>The carrier marked this order as delivered.</> })
  let refundHour: number | null = null
  let refundMin = 59
  for (const t of tickets) {
    ev.push({ key: `t${t.id}`, hour: t.createdHour, min: minuteOf(t.id), text: <>{t.customer ?? o.customer.name} sent a message: “{t.subject}”</> })
    if (t.status === 'escalated') ev.push({ key: `te${t.id}`, hour: t.dueHour, min: minuteOf(t.id), tone: 'critical', text: <>The message went unanswered for 48 hours and was escalated.</> })
    if (t.status === 'solved' && t.solvedHour != null) {
      const who = t.solvedBy === 'staff' ? 'Your VA' : t.solvedBy === 'auto' ? 'Gorgeous auto-reply' : 'You'
      const what = t.resolution === 'refunded' ? 'replied and refunded the order' : t.resolution === 'partial_refund' ? 'replied with a partial refund' : t.resolution === 'replacement' ? 'replied and sent a replacement' : 'replied to the customer'
      ev.push({ key: `ts${t.id}`, hour: t.solvedHour, min: Math.min(59, minuteOf(t.id) + 7), text: <>{who} {what}.</> })
      if (t.resolution === 'refunded' || t.resolution === 'partial_refund') {
        refundHour = t.solvedHour
        refundMin = Math.min(59, minuteOf(t.id) + 8) // right after the reply that issued it
      }
    }
  }
  if (o.refunded > 0) {
    const h = o.refundedHour ?? refundHour ?? Math.max(...ev.map(e => e.hour))
    const min = refundHour != null && h === refundHour ? refundMin : o.refundedHour != null ? Math.min(59, minuteOf(`${o.id}r`)) : 59
    ev.push({ key: 'ref', hour: h, min, text: <>A {usd(o.refunded)} USD refund was processed{o.cancelled ? ' and the order was canceled' : ''}.</> })
  }
  if (o.replacementSent) ev.push({ key: 'repl', hour: Math.max(...ev.map(e => e.hour)), min: 58, text: <>A replacement unit was ordered from the supplier.</> })
  if (cb) {
    ev.push({ key: 'cb', hour: hourAt(cb.openedDay, 9), min: minuteOf(cb.id), tone: 'critical', text: <>The customer opened a chargeback for {usd(cb.amount)}. A {usd(cb.fee ?? 15)} dispute fee was charged.</> })
    if (cb.submittedDay != null) ev.push({ key: 'cbs', hour: hourAt(cb.submittedDay, 11), min: minuteOf(`${cb.id}s`), text: <>{cb.handledBy === 'app' ? 'ChargeFlo' : cb.handledBy === 'staff' ? 'Your VA' : 'You'} submitted a response to the chargeback.</> })
    if (cb.status === 'accepted') ev.push({ key: 'cba', hour: hourAt(cb.respondByDay, 0), min: 0, text: <>You accepted the chargeback.</> })
    if (cb.status === 'lost' && cb.decideDay == null) {
      ev.push({ key: 'cbx', hour: hourAt(cb.respondByDay + 1, 0), min: 5, tone: 'critical', text: <>No response was submitted before the deadline. The chargeback closed in the customer's favor.</> })
    }
    if ((cb.status === 'won' || cb.status === 'lost') && cb.decideDay != null) {
      ev.push({ key: 'cbd', hour: hourAt(cb.decideDay, 8), min: minuteOf(`${cb.id}d`), tone: cb.status === 'won' ? 'success' : 'critical', text: cb.status === 'won' ? <>The chargeback was decided in your favor. Funds were returned to your balance.</> : <>The chargeback was decided in the customer's favor.</> })
    }
  }
  // newest first; events at the same minute keep their causal order (placed → paid → confirmation), reversed
  return ev.map((e, i) => ({ e, i })).sort((a, b) => b.e.hour - a.e.hour || b.e.min - a.e.min || b.i - a.i).map(x => x.e)
}

export default function OrderDetail({ params, navigate }: ShopiflyPageProps) {
  const id = Number(params[0])
  const today = useToday()
  const now = useNow()
  const { orders, products, tickets, chargebacks, ads, hasDserz, discounts } = useGSShallow(s => ({
    orders: s.store.orders, products: s.store.products, tickets: s.store.tickets, chargebacks: s.store.chargebacks,
    ads: s.ads.ads, hasDserz: s.store.apps.some(a => a.appId === 'dserz'), discounts: s.store.discounts,
  }))
  const idx = useMemo(() => orders.findIndex(o => o.id === id), [orders, id])
  const o = idx >= 0 ? orders[idx] : undefined
  const [refundOpen, setRefundOpen] = useState(false)
  // automatic discounts keep a normalized id in `code`; shoppers (and Shopify's order page) see their title
  const disc = o?.discountCode ? discounts.find(d => d.code === o.discountCode) : undefined
  const discLabel = disc?.automatic ? (disc.title || disc.code) : o?.discountCode

  const orderTickets = useMemo(() => (o ? tickets.filter(t => t.orderId === o.id) : []), [tickets, o])
  const cb = useMemo(() => (o ? chargebacks.find(c => c.orderId === o.id) : undefined), [chargebacks, o])
  const customerOrders = useMemo(() => (o ? orders.filter(x => x.customer.email.toLowerCase() === o.customer.email.toLowerCase()) : []), [orders, o])

  if (!o) {
    return (
      <PolarisProvider>
        <Page title="Order not found" backAction={{ content: 'Orders', onAction: () => navigate('orders') }}>
          <Card>
            <EmptyState heading="This order can't be found" image="orders" action={{ content: 'Back to orders', onAction: () => navigate('orders') }}>
              It may have been archived out of your order history, or the link is wrong.
            </EmptyState>
          </Card>
        </Page>
      </PolarisProvider>
    )
  }

  const title = productTitle(products, o)
  const thumb = productThumb(products, o.storeProductId, o.catalogId)
  const product: StoreProduct | undefined = products.find(p => p.id === o.storeProductId)
  const unitPrice = o.qty ? o.subtotal / o.qty : o.subtotal
  const threePl = o.fulfilledBy === '3pl'
  const supplierLabel = threePl ? 'US warehouse (3PL)' : o.mode === 'agent' ? 'Sourcing agent' : 'AliExprez supplier'
  const openTicket = orderTickets.find(t => t.status !== 'solved')
  const refundable = o.total - o.refunded > 0.009 && (o.financial === 'paid' || o.financial === 'partially_refunded')
  const fb = fulfillmentBadge(o)
  const shipped = o.fulfillment === 'fulfilled' || o.fulfillment === 'delivered'
  const ad = o.adId ? ads.find(a => a.id === o.adId) : undefined
  const orderNumberInHistory = customerOrders.findIndex(x => x.id === o.id) + 1
  const placedMinute = orderMinute(orders, o)
  const timeline = buildTimeline(o, placedMinute, orderTickets, cb, supplierLabel)
  const carrier = threePl ? 'USPostal Ground' : o.mode === 'agent' ? 'YunExprez Line' : 'CaiNeo Standard'
  const net = o.total - o.refunded
  const grossProfit = net - (o.cancelled ? 0 : o.cogs + o.shippingCost) - o.fees

  return (
    <PolarisProvider>
      <Page
        backAction={{ content: 'Orders', onAction: () => navigate('orders') }}
        title={`#${o.id}`}
        titleMetadata={<InlineStack gap="100"><StatusBadgeView b={paymentBadge(o)} /><StatusBadgeView b={fb} /></InlineStack>}
        subtitle={`${longDateTime(o.hour, o.id, now, placedMinute)} from Online Store`}
        secondaryActions={[
          { content: 'Refund', icon: RotateCcw, disabled: !refundable, onAction: () => setRefundOpen(true), helpText: refundable ? undefined : 'Nothing left to refund on this order' },
        ]}
        actionGroups={[{
          title: 'More actions',
          actions: [
            { content: 'View customer', onAction: () => navigate(`customers/${customerId(o.customer.email)}`) },
            ...(openTicket ? [{ content: 'Reply to customer', onAction: () => navigate(`inbox/${openTicket.id}`) }] : []),
            ...(product ? [{ content: 'View product', onAction: () => navigate(`products/${product.id}`) }] : []),
          ],
        }]}
        // follows the orders list (newest first), like the admin: ‹ = the newer order above, › = the older one below
        pagination={{
          hasPrevious: idx < orders.length - 1, hasNext: idx > 0,
          onPrevious: () => navigate(`orders/${orders[idx + 1].id}`), onNext: () => navigate(`orders/${orders[idx - 1].id}`),
        }}
      >
        {cb && (cb.status === 'needs_response' || cb.status === 'submitted') && (
          <Banner
            tone={cb.status === 'needs_response' ? 'critical' : 'warning'}
            title={cb.status === 'needs_response' ? `Chargeback opened: respond by ${formatDate(cb.respondByDay, 'md')}` : 'Chargeback under review'}
            action={{ content: 'View chargeback', onAction: () => navigate(`disputes/${cb.id}`) }}
          >
            {cb.reasonText} {usd(cb.amount)} plus a {usd(cb.fee ?? 15)} fee were taken from your balance.
          </Banner>
        )}
        {cb && (cb.status === 'won' || cb.status === 'lost' || cb.status === 'accepted') && (
          <Banner tone={cb.status === 'won' ? 'success' : 'critical'} title={cb.status === 'won' ? 'Chargeback won' : cb.status === 'accepted' ? 'Chargeback accepted' : 'Chargeback lost'}
            action={{ content: 'View chargeback', onAction: () => navigate(`disputes/${cb.id}`) }}>
            {cb.status === 'won' ? 'The bank sided with you and the funds were returned.' : `${usd(cb.amount)} was returned to the cardholder.`}
          </Banner>
        )}
        {openTicket && (
          <Banner tone={openTicket.status === 'escalated' ? 'critical' : 'warning'} title={`${o.customer.name.split(' ')[0]} is waiting for a reply`}
            action={{ content: 'Reply', onAction: () => navigate(`inbox/${openTicket.id}`) }}>
            “{openTicket.subject}”
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* fulfillment */}
              <Card padding="0">
                <div className="sf-od-head">
                  <InlineStack gap="200" blockAlign="center">
                    <StatusBadgeView b={o.fulfillment === 'delivered' ? { label: 'Delivered', tone: 'success', progress: 'complete' } : fb} />
                    <Text as="span" variant="bodySm" tone="subdued">#{o.id}-F1</Text>
                  </InlineStack>
                </div>
                <div className="sf-od-section">
                  <div className="sf-od-meta">
                    <span><MapPin size={14} /> {threePl ? 'US fulfillment warehouse' : o.mode === 'agent' ? 'Sourcing agent warehouse, Shenzhen' : 'AliExprez supplier, China'}</span>
                    <span><Truck size={14} /> {deliveryMethod(o)}</span>
                  </div>
                  <div className="sf-od-line">
                    <button type="button" className="sf-od-line-product" onClick={() => product && navigate(`products/${product.id}`)} disabled={!product}>
                      <ProductCell src={thumb} title={title} sub={o.variant ? o.variant : undefined} />
                    </button>
                    <span className="sf-od-line-qty">{usd(unitPrice)} × {o.qty}</span>
                    <span className="sf-od-line-total">{usd(o.subtotal)}</span>
                  </div>
                  {o.upsell > 0 && (
                    <div className="sf-od-line">
                      <div className="sf-od-line-product"><ProductCell src={thumb} title={`Add-on: ${title.split(/[–|,-]/)[0].trim().slice(0, 40)} accessory`} sub="Post-purchase offer · ReKonvert" /></div>
                      <span className="sf-od-line-qty">{usd(o.upsell)} × 1</span>
                      <span className="sf-od-line-total">{usd(o.upsell)}</span>
                    </div>
                  )}
                </div>
                <div className="sf-od-section sf-od-foot">
                  {needsFulfillment(o) && (
                    // like the admin: the explanation on top, the action bottom-right of the card
                    <BlockStack gap="300">
                      <Text as="p" tone="subdued">
                        {hasDserz ? 'DSerz couldn\'t pay the supplier for this order.' : 'No fulfillment app installed. Place the supplier order to ship this item.'}
                        {' '}Supplier charge: {usd(o.supplierCost ?? o.cogs + o.shippingCost)}.
                      </Text>
                      <InlineStack align="end">
                        <Button variant="primary" onClick={() => act(s => { fulfillOrder(s, o.id) })}>Fulfill item</Button>
                      </InlineStack>
                    </BlockStack>
                  )}
                  {inProgress(o) && (
                    <Text as="p" tone="subdued">
                      {threePl ? 'Sent to the US warehouse' : `${supplierLabel} order placed`} {o.supplierOrderedHour != null ? formatDate(dayOf(o.supplierOrderedHour), 'md') : ''}. Expected to ship {o.shipDay != null ? formatDate(o.shipDay, 'md') : 'soon'}.
                    </Text>
                  )}
                  {shipped && (
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Package size={14} />
                        <Text as="span">{carrier} · <span className="sf-mono" title={o.tracking}>{o.tracking ? trackingShort(o.tracking) : 'Tracking pending'}</span></Text>
                      </InlineStack>
                      <Text as="p" tone="subdued">
                        {o.fulfillment === 'delivered' && o.deliveredDay != null
                          ? `Delivered ${formatDate(o.deliveredDay, 'md')} · ${o.deliveredDay - dayOf(o.hour)} days after the order${o.promisedMaxDays ? ` (promised within ${o.promisedMaxDays} days)` : ''}`
                          : `Shipped ${o.shipDay != null ? formatDate(o.shipDay, 'md') : ''} · Estimated delivery ${formatDate(o.deliverDay, 'md')}`}
                      </Text>
                    </BlockStack>
                  )}
                  {o.cancelled && <Text as="p" tone="subdued">This order was canceled and refunded before it shipped.</Text>}
                </div>
              </Card>

              {/* payment */}
              <Card padding="0">
                <div className="sf-od-head"><StatusBadgeView b={paymentBadge(o)} /></div>
                <div className="sf-od-section">
                  <SummaryLine label="Subtotal" sub={`${o.qty + (o.upsell > 0 ? 1 : 0)} item${o.qty + (o.upsell > 0 ? 1 : 0) === 1 ? '' : 's'}`} value={usd(o.subtotal + o.upsell)} />
                  {o.discount > 0 && <SummaryLine label="Discount" sub={discLabel ?? 'Bundle discount'} value={`-${usd(o.discount)}`} />}
                  <SummaryLine label="Shipping" sub={o.shippingCharged > 0 ? 'Standard' : 'Free shipping'} value={usd(o.shippingCharged)} />
                  <SummaryLine label="Taxes" sub="Not collected" value={usd(0)} />
                  <SummaryLine label="Total" value={usd(o.total)} strong />
                </div>
                <Divider />
                <div className="sf-od-section">
                  <SummaryLine label="Paid" sub={PAY_METHOD[o.paymentMethod ?? 'card']} value={usd(o.total)} />
                  {o.refunded > 0 && <SummaryLine label="Refunded" value={`-${usd(o.refunded)}`} />}
                  {cb && (cb.status === 'lost' || cb.status === 'accepted') && <SummaryLine label="Chargeback" value={`-${usd(cb.amount)}`} tone="critical" />}
                  <SummaryLine label="Net payment" value={usd(cb && (cb.status === 'lost' || cb.status === 'accepted') ? net - cb.amount : net)} strong />
                </div>
                <Divider />
                <div className="sf-od-section">
                  <SummaryLine label="Transaction fee" sub={o.paymentMethod === 'paypal' ? PAYMENT_LABELS.paypal : o.paymentMethod === 'bnpl' ? PAYMENT_LABELS.bnpl : 'Shopifly Payments'} value={usd(o.fees)} tone="subdued" />
                </div>
                {refundable && (
                  <div className="sf-od-section sf-od-foot">
                    <InlineStack align="end"><Button onClick={() => setRefundOpen(true)}>Refund</Button></InlineStack>
                  </div>
                )}
              </Card>

              {/* timeline */}
              <Card title="Timeline">
                <ol className="sf-timeline">
                  {timeline.map((e, i) => {
                    const showDay = i === 0 || dayOf(timeline[i - 1].hour) !== dayOf(e.hour)
                    return (
                      <li key={e.key} className="sf-timeline-item">
                        {showDay && <div className="sf-timeline-day">{dayOf(e.hour) === today ? 'Today' : dayOf(e.hour) === today - 1 ? 'Yesterday' : formatDate(dayOf(e.hour), 'long')}</div>}
                        <div className="sf-timeline-row">
                          <span className={`sf-timeline-dot${e.tone ? ` sf-timeline-dot-${e.tone}` : ''}`} />
                          <span className="sf-timeline-text">{e.text}</span>
                          <span className="sf-timeline-time">{e.hour <= now ? clock(e.hour, capMinute(e.min, e.hour, now)) : ''}</span>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card title="Notes">
                <Text as="p" tone="subdued">No notes from customer</Text>
              </Card>

              <Card title="Customer">
                <BlockStack gap="300">
                  <BlockStack gap="050">
                    <Link onClick={() => navigate(`customers/${customerId(o.customer.email)}`)}>{o.customer.name}</Link>
                    <Text as="span" tone="subdued">{customerOrders.length} order{customerOrders.length === 1 ? '' : 's'}</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="h3" variant="headingXs">Contact information</Text>
                    <Text as="span" breakWord><span className="sf-link-text">{o.customer.email}</span></Text>
                    <Text as="span" tone="subdued">No phone number</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="h3" variant="headingXs">Shipping address</Text>
                    <Text as="span">{o.customer.name}</Text>
                    <Text as="span">{streetFor(o.customer.email)}</Text>
                    <Text as="span">{o.customer.city} {o.customer.region} {zipFor(o.customer.email, o.customer.region)}</Text>
                    <Text as="span">United States</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="h3" variant="headingXs">Billing address</Text>
                    <Text as="span" tone="subdued">Same as shipping address</Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card title="Conversion summary">
                <BlockStack gap="200">
                  <Text as="p">This is their {ordinal(Math.max(1, orderNumberInHistory))} order</Text>
                  <ConvRow label="Source" value={o.source === 'fadbook' || o.source === 'tiktak' ? `${sourceLabel(o.source)} ad` : sourceLabel(o.source)} />
                  {ad && <ConvRow label="Ad" value={ad.name} />}
                  {o.adId && !ad && <ConvRow label="Ad" value="Deleted ad" />}
                  <ConvRow label="Device" value={o.device === 'mobile' ? 'Mobile' : o.device === 'tablet' ? 'Tablet' : 'Desktop'} />
                  <ConvRow label="Landing page" value={product ? `/products/${product.seo.handle || product.id}` : '/'} />
                  <ConvRow label="Sessions" value={o.recovered ? '2 sessions over 2 days' : o.customer.returning ? 'Returning visitor' : '1 session over 1 day'} />
                  {o.discountCode && <ConvRow label={disc?.automatic ? 'Automatic discount' : 'Discount code'} value={discLabel ?? o.discountCode} />}
                </BlockStack>
              </Card>

              <Card title={threePl ? 'Warehouse' : 'DSerz supplier order'}>
                <BlockStack gap="150">
                  <SummaryLine label="Status" value={
                    o.cancelled ? <Badge>Canceled</Badge>
                      : o.supplierOrderedHour == null ? <Badge tone="attention">Not placed</Badge>
                        : shipped ? <Badge tone="success">Shipped</Badge> : <Badge tone="info">Processing</Badge>
                  } />
                  <SummaryLine label={threePl ? 'Product cost (from stock)' : 'Product cost'} value={usd(o.cogs)} />
                  <SummaryLine label={threePl ? 'Pick, pack & postage' : 'Shipping to customer'} value={usd(o.shippingCost)} />
                  {/* after refunds; a canceled order never cost the product or shipping */}
                  <SummaryLine label="Gross profit" sub={net > 0.009 ? `${Math.round((grossProfit / net) * 100)}%` : undefined} value={usd(grossProfit)} strong />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
      {refundOpen && <RefundModal order={o} title={title} thumb={thumb} onClose={() => setRefundOpen(false)} />}
    </PolarisProvider>
  )
}

function ConvRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="sf-conv-row">
      <Text as="span" tone="subdued" variant="bodySm">{label}</Text>
      <Text as="span" breakWord>{value}</Text>
    </div>
  )
}

const REASONS = [
  { label: 'Select a reason', value: '' },
  { label: 'Customer changed their mind', value: 'changed_mind' },
  { label: 'Item arrived damaged or defective', value: 'defective' },
  { label: "Item didn't arrive", value: 'not_received' },
  { label: 'Item not as described', value: 'not_as_described' },
  { label: 'Other', value: 'other' },
]

function RefundModal({ order, title, thumb, onClose }: { order: Order; title: string; thumb: string; onClose: () => void }) {
  const max = Math.round((order.total - order.refunded) * 100) / 100
  const [amount, setAmount] = useState(max.toFixed(2))
  const [reason, setReason] = useState('')
  const v = Number(amount)
  const error = !Number.isFinite(v) || v <= 0 ? 'Enter a refund amount' : v > max + 0.001 ? `You can refund up to ${usd(max)}` : null
  const beforeShip = order.fulfillment === 'unfulfilled' && order.fulfilledBy !== '3pl'
  const doRefund = () => {
    if (error) return
    act(s => { refundOrder(s, order.id, Math.round(v * 100) / 100) })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Refund #${order.id}`}
      pauseGame
      sectioned
      primaryAction={{ content: `Refund ${usd(Number.isFinite(v) ? Math.min(v, max) : 0)}`, onAction: doRefund, disabled: !!error }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <BlockStack gap="400">
        <ProductCell src={thumb} title={title} sub={`${usd(order.subtotal / Math.max(1, order.qty))} × ${order.qty}`} />
        <TextField label="Refund amount" type="currency" prefix="$" value={amount} onChange={setAmount} error={error ?? undefined}
          helpText={`${usd(max)} available for refund`} autoFocus selectTextOnFocus />
        <Select label="Reason for refund" options={REASONS} value={reason} onChange={setReason} />
        <BlockStack gap="100">
          <Text as="p" tone="subdued">The refund goes back to the customer's original payment method and is deducted from your Shopifly balance. Transaction fees aren't returned.</Text>
          {beforeShip && v >= max - 0.001 && (
            <Text as="p" tone="subdued">A full refund before shipping also cancels the supplier order, and the supplier refunds what you paid.</Text>
          )}
        </BlockStack>
      </BlockStack>
    </Modal>
  )
}
