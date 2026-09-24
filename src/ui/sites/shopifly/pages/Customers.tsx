// Customers: list derived from the order history + customer detail page.
import { useMemo, useState } from 'react'
import type { ShopiflyPageProps } from '../route'
import type { Order } from '../../../../core/types'
import { useGS, useGSShallow } from '../../../../core/store'
import { dayOf, formatDate } from '../../../../core/time'
import {
  Badge, BlockStack, Card, EmptyState, IndexFilters, IndexTable, InlineStack, Layout, Link, Page, PolarisProvider, Text,
} from '../../../kit/polaris'
import { deriveCustomers, fulfillmentBadge, itemsLabel, paymentBadge, productThumb, productTitle, streetFor, zipFor, type CustomerRow } from '../core/orders'
import { ProductCell, StatusBadgeView, TableCard, useNow, useToday } from '../core/ui'
import { listDate, longDate, orderMinute, pct2, usd } from '../core/format'
import { ExportModal } from '../core/ExportModal'

type View = 'all' | 'returning' | 'subscribed' | 'new'
const VIEWS: { id: View; label: string }[] = [
  { id: 'all', label: 'All customers' },
  { id: 'returning', label: 'Returning' },
  { id: 'subscribed', label: 'Email subscribers' },
  { id: 'new', label: 'New this month' },
]

export default function Customers(props: ShopiflyPageProps) {
  const { orders, subscribers, totals } = useGSShallow(s => ({ orders: s.store.orders, subscribers: s.store.emailSubscribers, totals: s.store.customers }))
  const customers = useMemo(() => deriveCustomers(orders), [orders])
  if (props.params[0]) return <CustomerDetail {...props} customers={customers} orders={orders} />
  return <CustomerList {...props} customers={customers} subscribers={subscribers} knownTotal={totals.total} />
}

function CustomerList({ navigate, customers, subscribers, knownTotal }: ShopiflyPageProps & { customers: CustomerRow[]; subscribers: number; knownTotal: number }) {
  const today = useToday()
  const [view, setView] = useState(0)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const rows = useMemo(() => {
    const v = VIEWS[view].id
    const ql = q.trim().toLowerCase()
    return customers.filter(c =>
      (v === 'all' || (v === 'returning' && c.orders > 1) || (v === 'subscribed' && c.subscribed) || (v === 'new' && dayOf(c.firstHour) > today - 30)) &&
      (!ql || c.name.toLowerCase().includes(ql) || c.email.toLowerCase().includes(ql) || c.city.toLowerCase().includes(ql)))
  }, [customers, view, q, today])
  const returning = customers.filter(c => c.orders > 1).length

  if (!customers.length) {
    return (
      <PolarisProvider>
        <Page title="Customers">
          <Card>
            <EmptyState heading="Everything customers-related in one place" image="customers" action={{ content: 'View orders', onAction: () => navigate('orders') }}>
              Customers are added here when they place an order. See who buys, where they live and who comes back.
            </EmptyState>
          </Card>
        </Page>
      </PolarisProvider>
    )
  }

  return (
    <PolarisProvider>
      <Page title="Customers" fullWidth secondaryActions={[{ content: 'Export', onAction: () => setExporting(true) }]}>
        <Card padding="0">
          <div className="sf-cust-stats">
            <div><Text as="span" fontWeight="semibold">{Math.max(knownTotal, customers.length).toLocaleString('en-US')} customers</Text><Text as="span" tone="subdued"> · 100% of your customer base</Text></div>
            <div><Text as="span" tone="subdued">Returning customer rate </Text><Text as="span" fontWeight="semibold">{pct2(customers.length ? returning / customers.length : 0, 1)}</Text></div>
            <div><Text as="span" tone="subdued">Email subscribers </Text><Text as="span" fontWeight="semibold">{subscribers.toLocaleString('en-US')}</Text></div>
          </div>
        </Card>
        <Card padding="0">
          <IndexFilters tabs={VIEWS.map(v => ({ id: v.id, content: v.label }))} selected={view} onSelect={i => { setView(i); setSelected([]) }}
            queryValue={q} onQueryChange={setQ} queryPlaceholder="Searching all customers" />
          <IndexTable
            rows={rows}
            rowKey={c => c.id}
            resourceName={{ singular: 'customer', plural: 'customers' }}
            selectedIds={selected}
            onSelectionChange={setSelected}
            onRowClick={c => navigate(`customers/${c.id}`)}
            defaultSort={{ columnId: 'last', direction: 'descending' }}
            pageSize={50}
            resetPageKey={`${view}|${q}`}
            emptyState={<EmptyState heading="No customers found" image="search" compact>Try changing the filters or search term.</EmptyState>}
            columns={[
              { id: 'name', title: 'Customer name', sortValue: c => c.name, render: c => <Text as="span" fontWeight="semibold">{c.name}</Text> },
              {
                id: 'sub', title: 'Email subscription', nowrap: true,
                render: c => (c.subscribed ? <Badge tone="success">Subscribed</Badge> : <Badge>Not subscribed</Badge>),
              },
              { id: 'loc', title: 'Location', nowrap: true, sortValue: c => `${c.region} ${c.city}`, render: c => `${c.city} ${c.region}, US` },
              { id: 'orders', title: 'Orders', sortValue: c => c.orders, render: c => `${c.orders} order${c.orders === 1 ? '' : 's'}` },
              { id: 'spent', title: 'Amount spent', numeric: true, sortValue: c => c.spent, render: c => usd(c.spent) },
              { id: 'last', title: 'Last order', nowrap: true, sortValue: c => c.lastHour, render: c => formatDate(dayOf(c.lastHour), 'md') },
            ]}
          />
        </Card>
      </Page>
      {exporting && (
        <ExportModal
          open
          onClose={() => setExporting(false)}
          resource="customers"
          filename={`customers_export_day${today + 1}.csv`}
          scopes={[
            { value: 'all', label: 'All customers', rows: customers },
            ...(view > 0 || q.trim() ? [{ value: 'view', label: q.trim() ? 'Customers matching your search' : ({ all: 'All customers', returning: 'Returning customers', subscribed: 'Email subscribers', new: 'Customers new this month' } as const)[VIEWS[view].id], rows }] : []),
            { value: 'selected', label: 'Selected customers', rows: customers.filter(c => selected.includes(c.id)) },
          ]}
          headings={['First Name', 'Last Name', 'Email', 'Accepts Email Marketing', 'Default Address City', 'Default Address Province Code', 'Default Address Country Code', 'Total Spent', 'Total Orders', 'First Order', 'Last Order']}
          toRow={c => {
            const [firstName, ...rest] = c.name.split(' ')
            return [firstName, rest.join(' '), c.email, c.subscribed ? 'yes' : 'no', c.city, c.region, 'US', c.spent.toFixed(2), c.orders, formatDate(dayOf(c.firstHour), 'iso'), formatDate(dayOf(c.lastHour), 'iso')]
          }}
        />
      )}
    </PolarisProvider>
  )
}

function CustomerDetail({ params, navigate, customers, orders }: ShopiflyPageProps & { customers: CustomerRow[]; orders: Order[] }) {
  const id = decodeURIComponent(params[0] ?? '').toLowerCase()
  const now = useNow()
  const today = useToday()
  const products = useGS(s => s.store.products)
  const c = customers.find(x => x.email.toLowerCase() === id || x.id === params[0])
  const theirs = useMemo(() => (c ? orders.filter(o => o.customer.email.toLowerCase() === c.email.toLowerCase()).sort((a, b) => b.id - a.id) : []), [orders, c])
  if (!c) {
    return (
      <PolarisProvider>
        <Page title="Customer not found" backAction={{ content: 'Customers', onAction: () => navigate('customers') }}>
          <Card><EmptyState heading="This customer can't be found" image="customers" action={{ content: 'Back to customers', onAction: () => navigate('customers') }}>Their orders may have been archived.</EmptyState></Card>
        </Page>
      </PolarisProvider>
    )
  }
  const last = theirs[0]
  const since = dayOf(c.firstHour)
  const days = today - since
  const aov = c.orders ? (c.spent + c.refunded) / c.orders : 0
  return (
    <PolarisProvider>
      <Page
        backAction={{ content: 'Customers', onAction: () => navigate('customers') }}
        title={c.name}
        subtitle={`${c.city} ${c.region}, US · Customer for ${days <= 0 ? 'less than a day' : `${days} day${days === 1 ? '' : 's'}`}`}
      >
        <Card padding="0">
          <div className="sf-cust-bar">
            <div><Text as="span" variant="bodySm" tone="subdued">Amount spent</Text><Text as="p" variant="headingMd">{usd(c.spent)}</Text></div>
            <div><Text as="span" variant="bodySm" tone="subdued">Orders</Text><Text as="p" variant="headingMd">{c.orders}</Text></div>
            <div><Text as="span" variant="bodySm" tone="subdued">Average order value</Text><Text as="p" variant="headingMd">{usd(aov)}</Text></div>
            <div><Text as="span" variant="bodySm" tone="subdued">Customer since</Text><Text as="p" variant="headingMd">{formatDate(since, 'short')}</Text></div>
          </div>
        </Card>
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {last && (
                <Card title="Last order placed">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center" gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Link onClick={() => navigate(`orders/${last.id}`)}>#{last.id}</Link>
                        <StatusBadgeView b={paymentBadge(last)} />
                        <StatusBadgeView b={fulfillmentBadge(last)} />
                      </InlineStack>
                      <Text as="span" fontWeight="semibold">{usd(last.total)}</Text>
                    </InlineStack>
                    <Text as="p" tone="subdued">{listDate(last.hour, now, last.id, orderMinute(orders, last))} from Online Store</Text>
                    <ProductCell src={productThumb(products, last.storeProductId, last.catalogId)} title={productTitle(products, last)} sub={`${usd(last.subtotal / Math.max(1, last.qty))} × ${last.qty}${last.variant ? ` · ${last.variant}` : ''}`} />
                  </BlockStack>
                </Card>
              )}
              <TableCard title="Orders">
                <div className="sf-cust-orders">
                  {theirs.map(o => (
                    <button key={o.id} type="button" className="sf-cust-order" onClick={() => navigate(`orders/${o.id}`)}>
                      <span className="sf-cust-order-num">#{o.id}</span>
                      <span className="sf-cust-order-date">{listDate(o.hour, now, o.id, orderMinute(orders, o))}</span>
                      <span className="sf-cust-order-badges"><StatusBadgeView b={paymentBadge(o)} /><StatusBadgeView b={fulfillmentBadge(o)} /></span>
                      <span className="sf-cust-order-items">{itemsLabel(o.qty)}</span>
                      <span className="sf-cust-order-total">{usd(o.total)}</span>
                    </button>
                  ))}
                </div>
              </TableCard>
            </BlockStack>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card title="Customer">
                <BlockStack gap="300">
                  <BlockStack gap="050">
                    <Text as="h3" variant="headingXs">Contact information</Text>
                    <Text as="span" breakWord>{c.email}</Text>
                    <Text as="span" tone="subdued">No phone number</Text>
                  </BlockStack>
                  <BlockStack gap="050">
                    <Text as="h3" variant="headingXs">Default address</Text>
                    <Text as="span">{c.name}</Text>
                    <Text as="span">{streetFor(c.email)}</Text>
                    <Text as="span">{c.city} {c.region} {zipFor(c.email, c.region)}</Text>
                    <Text as="span">United States</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingXs">Marketing</Text>
                    <InlineStack gap="200" blockAlign="center">
                      {c.subscribed ? <Badge tone="success">Subscribed</Badge> : <Badge>Not subscribed</Badge>}
                      <Text as="span" tone="subdued">Email</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center"><Badge>Not subscribed</Badge><Text as="span" tone="subdued">SMS</Text></InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
              <Card title="Tags">
                <InlineStack gap="100">
                  {c.orders > 1 && <span className="sf-tag">repeat-buyer</span>}
                  {theirs.some(o => o.recovered) && <span className="sf-tag">abandoned-checkout</span>}
                  {c.refunded > 0 && <span className="sf-tag">refunded</span>}
                  {c.orders <= 1 && !theirs.some(o => o.recovered) && c.refunded <= 0 && <Text as="span" tone="subdued">No tags</Text>}
                </InlineStack>
              </Card>
              <Card title="Notes">
                <Text as="p" tone="subdued">{c.refunded > 0 ? `Refunded ${usd(c.refunded)} across ${c.orders} order${c.orders === 1 ? '' : 's'}.` : 'No notes'}</Text>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
        <Text as="p" variant="bodySm" tone="subdued" alignment="center">Customer since {longDate(since)}</Text>
      </Page>
    </PolarisProvider>
  )
}
