// Visual QA page for every kit component with realistic sample props.
// Dev: open /src/ui/kit/demo/gallery.html on the Vite server.
import { useMemo, useState, type ReactNode } from 'react'
import {
  ChartColumn, Copy, Eye, FileDown, Package, Pencil, Plus, ShoppingBag, Sparkles, Store, Target, Trash2, Truck, Users,
} from 'lucide-react'
import { productImage, portrait } from '../../../core/assets'
import { formatDate } from '../../../core/time'
import {
  Countdown, EmptyArt, ImageWithFallback, Money, RangeCalendar, Stars, useDateRangeState, type DateRange,
} from '../common'
import {
  ActionList, Avatar, Badge, Banner, BlockStack, Box, Button, ButtonGroup, Card, Checkbox, ChoiceList, Collapsible, ComparisonPicker,
  ContextualSaveBar, DataTable, DateRangePicker, DescriptionList, Divider, DropZone, EmptyState, FormLayout, Icon, IndexFilters,
  IndexTable, InlineGrid, InlineStack, Layout, Link, Modal, Page, Pagination, PolarisProvider, Popover, ProgressBar, RadioButton,
  RichTextEditor, Select, SkeletonBodyText, SkeletonDisplayText, SkeletonPage, Tabs, Tag, TagsInput, Text, TextField, Thumbnail, Tooltip,
  richTextStats, type ComparisonMode, type IndexTableColumn,
} from '../polaris'
import {
  AmButton, AmCard, AmCheckbox, AmDateRangePicker, AmField, AmInput, AmMenu, AmModal, AmNameCell, AmNotice, AmRadio, AmRadioCard,
  AmSegmented, AmSelect, AmTable, AmTag, AmThemeProvider, AmTooltip, AudienceGauge, BreakdownMenu, BudgetCell, ColumnsMenu, EntityTabs,
  InfoTip, MetricCell, SideDrawer, StatusCell, Stepper, Toggle, amFmt, entityTabLabels, type AmColumn, type AmTheme, type ColumnsValue,
} from '../adsmanager'
import { AdPreview, PhoneMockup } from '../phone'
import { BarChart, CHART_COLORS, DonutChart, FunnelBars, GaugeRing, LineChartCard, Sparkline, TrendChart } from '../charts'

const TODAY = 58 // Apr 29, 2026 in game time
const wave = (i: number, seed: number) => (Math.sin(i * 0.9 + seed) + Math.sin(i * 0.37 + seed * 2) + 2) / 4

function Section({ id, title, children, dark }: { id: string; title: string; children: ReactNode; dark?: boolean }) {
  return (
    <section id={id} style={{ padding: '28px 24px 40px', background: dark ? '#f0f2f5' : undefined, borderTop: '1px solid #e3e3e3' }}>
      <h2 style={{ margin: '0 0 16px', font: '700 22px/28px Inter, sans-serif', color: '#1a1a1a' }}>{title}</h2>
      {children}
    </section>
  )
}
function Swatch({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <span style={{ font: '600 11px/14px Inter, sans-serif', color: '#8a8a8a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------
function CommonDemo() {
  const [range, setRange] = useState<DateRange | null>({ from: TODAY - 9, to: TODAY - 3 })
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
      <Swatch label="ImageWithFallback">
        <div style={{ display: 'flex', gap: 10 }}>
          <ImageWithFallback src={productImage('pet-hair-roller')} alt="Pet hair roller" width={96} radius={10} />
          <ImageWithFallback src={productImage('does-not-exist')} alt="Posture Corrector" width={96} radius={10} />
          <ImageWithFallback src={null} alt="Heated vest" fallbackEmoji="🧥" width={96} radius={10} />
        </div>
      </Swatch>
      <Swatch label="Money">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, font: '14px Inter, sans-serif' }}>
          <Money amount={1234.5} />
          <Money amount={48213.2} compact />
          <Money amount={312.4} sign tone="auto" />
          <Money amount={-86.1} tone="auto" />
          <span><Money amount={39.99} /> <Money amount={59.99} strike /></span>
          <Money amount={129} currencyCode />
        </div>
      </Swatch>
      <Swatch label="Stars">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, font: '13px Inter, sans-serif' }}>
          <Stars rating={4.7} showValue count={12840} />
          <Stars rating={3.2} size={18} color="#191919" />
          <Stars rating={4.4} color="#f79009" count={392} />
        </div>
      </Swatch>
      <Swatch label="Countdown">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, font: '14px Inter, sans-serif' }}>
          <span>Dispute due in <Countdown hoursLeft={53} /></span>
          <span>Payout in <Countdown hoursLeft={5.5} format="long" /></span>
          <span>Sale ends in <Countdown secondsLeft={35999} live loop format="clock" /></span>
          <Countdown secondsLeft={9 * 3600 + 59 * 60 + 32} live loop format="boxes" />
        </div>
      </Swatch>
      <Swatch label="EmptyArt">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 420 }}>
          {(['orders', 'products', 'search', 'chart', 'inbox', 'ads', 'customers', 'creative'] as const).map(k => <EmptyArt key={k} kind={k} size={96} />)}
        </div>
      </Swatch>
      <Swatch label="RangeCalendar">
        <div style={{ font: '13px Inter, sans-serif', color: '#303030' }}>
          <RangeCalendar value={range} onChange={setRange} maxDay={TODAY} today={TODAY} />
          <div style={{ marginTop: 6, color: '#616161' }}>{range ? `${formatDate(range.from, 'short')} – ${formatDate(range.to, 'short')}` : 'No range'}</div>
        </div>
      </Swatch>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Polaris
// ---------------------------------------------------------------------------
interface OrderRow { id: string; num: number; day: number; customer: string; channel: string; total: number; paid: boolean; fulfilled: boolean; items: number }
const ORDERS: OrderRow[] = Array.from({ length: 23 }, (_, i) => ({
  id: `o${i}`,
  num: 1042 - i,
  day: TODAY - Math.floor(i / 3),
  customer: ['Jordan Lee', 'Maya Patel', 'Chris Gomez', 'Ashley Nguyen', 'Tyler Brooks', 'Brianna Scott', 'Devon Carter'][i % 7],
  channel: i % 4 === 0 ? 'Online Store' : i % 4 === 1 ? 'Fadbook & Instaglam' : 'TikTak',
  total: Math.round((24.99 + (i % 5) * 17.5 + (i % 3) * 9.99) * 100) / 100,
  paid: i % 6 !== 2,
  fulfilled: i > 4 && i % 5 !== 0,
  items: 1 + (i % 3),
}))

function PolarisDemo() {
  const [tab, setTab] = useState(0)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ value: string; direction: 'ascending' | 'descending' }>({ value: 'date', direction: 'descending' })
  const [sel, setSel] = useState<string[]>([])
  const [title, setTitle] = useState('Reusable Pet Hair Remover Roller')
  const [price, setPrice] = useState('24.99')
  const [compare, setCompare] = useState('39.99')
  const [weight, setWeight] = useState('0.3')
  const [status, setStatus] = useState('active')
  const [track, setTrack] = useState(true)
  const [autopay, setAutopay] = useState(['full'])
  const [channels, setChannels] = useState(['online', 'fadbook'])
  const [radio, setRadio] = useState('free')
  const [tags, setTags] = useState(['pet', 'cleaning', 'bestseller'])
  const [html, setHtml] = useState(
    '<h3>Say goodbye to pet hair — for good</h3><p>Your couch, your clothes, your car: one swipe and the fur is gone. No sticky sheets, no refills, no batteries.</p><ul><li><strong>Reusable forever</strong> — just empty the chamber</li><li>Works on sofas, beds, carpets and car seats</li><li>Ships in 3–5 business days with a 30-day guarantee</li></ul>',
  )
  const [popover, setPopover] = useState(false)
  const [modal, setModal] = useState(false)
  const [open, setOpen] = useState(true)
  const [page, setPage] = useState(1)
  const [range, setRange] = useDateRangeState(TODAY, 'last30', 'shop')
  const [cmp, setCmp] = useState<ComparisonMode>('previous_period')
  const [dirty, setDirty] = useState(true)
  const stats = richTextStats(html)

  const tabs = [{ id: 'all', content: 'All' }, { id: 'unfulfilled', content: 'Unfulfilled', badge: ORDERS.filter(o => !o.fulfilled).length }, { id: 'unpaid', content: 'Unpaid' }, { id: 'open', content: 'Open' }, { id: 'archived', content: 'Archived' }]
  const rows = useMemo(() => {
    let r = ORDERS
    if (tab === 1) r = r.filter(o => !o.fulfilled)
    if (tab === 2) r = r.filter(o => !o.paid)
    if (query) r = r.filter(o => `#${o.num} ${o.customer}`.toLowerCase().includes(query.toLowerCase()))
    return r
  }, [tab, query])
  const columns: IndexTableColumn<OrderRow>[] = [
    { id: 'order', title: 'Order', render: o => <Text as="span" fontWeight="semibold">#{o.num}</Text>, sortValue: o => o.num, nowrap: true },
    { id: 'date', title: 'Date', render: o => formatDate(o.day, 'md') + ' at 2:14 pm', sortValue: o => o.day, nowrap: true },
    { id: 'customer', title: 'Customer', render: o => o.customer, sortValue: o => o.customer },
    { id: 'channel', title: 'Channel', render: o => o.channel, nowrap: true },
    { id: 'total', title: 'Total', numeric: true, render: o => <Money amount={o.total} />, sortValue: o => o.total },
    { id: 'payment', title: 'Payment status', render: o => (o.paid ? <Badge progress="complete">Paid</Badge> : <Badge tone="warning" progress="partiallyComplete">Payment pending</Badge>) },
    { id: 'fulfillment', title: 'Fulfillment status', render: o => (o.fulfilled ? <Badge progress="complete">Fulfilled</Badge> : <Badge tone="attention" progress="incomplete">Unfulfilled</Badge>) },
    { id: 'items', title: 'Items', render: o => `${o.items} item${o.items > 1 ? 's' : ''}`, tooltip: 'Number of line items in the order' },
  ]

  return (
    <PolarisProvider style={{ borderRadius: 12, border: '1px solid #e3e3e3', position: 'relative' }}>
      <ContextualSaveBar
        visible={dirty}
        message="Unsaved product"
        placement="sticky"
        saveAction={{ onAction: () => setDirty(false) }}
        discardAction={{ onAction: () => setDirty(false) }}
      />
      <Page
        backAction={{ content: 'Products', onAction: () => {} }}
        title={title}
        titleMetadata={<Badge tone="success">Active</Badge>}
        subtitle="Pet supplies · Imported via DSerz"
        secondaryActions={[
          { content: 'Duplicate', icon: Copy, onAction: () => {} },
          { content: 'Preview', icon: Eye, onAction: () => {} },
          { content: 'Share', onAction: () => {} },
          { content: 'Archive product', onAction: () => {} },
          { content: 'Delete product', destructive: true, icon: Trash2, onAction: () => {} },
        ]}
        primaryAction={{ content: 'Save', onAction: () => setDirty(false), disabled: !dirty }}
        pagination={{ hasPrevious: true, hasNext: true }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <FormLayout>
                <TextField label="Title" value={title} onChange={v => { setTitle(v); setDirty(true) }} recommendedLength={70} helpText="Lead with the benefit, not the supplier's keywords." />
                <RichTextEditor
                  label="Description"
                  value={html}
                  onChange={v => { setHtml(v); setDirty(true) }}
                  footer={<><span>{stats.words} words</span><span>{stats.bullets} bullet{stats.bullets === 1 ? '' : 's'}</span><span>{stats.headings} heading{stats.headings === 1 ? '' : 's'}</span></>}
                />
              </FormLayout>
            </Card>
            <Card title="Media" actions={<Button variant="plain">Add from URL</Button>}>
              <InlineStack gap="300" blockAlign="center">
                <Thumbnail source={productImage('pet-hair-roller')} alt="Roller" size="large" />
                <Thumbnail source={productImage('dog-paw-cleaner')} alt="Paw cleaner" size="large" />
                <Thumbnail source={productImage('missing-image')} alt="Lifestyle photo" size="large" count={3} />
                <div style={{ flex: 1, minWidth: 160 }}><DropZone secondaryLabel="Add from supplier" hint="Accepts images, videos, or 3D models" minHeight={80} /></div>
              </InlineStack>
            </Card>
            <Card title="Pricing">
              <FormLayout>
                <FormLayout.Group>
                  <TextField label="Price" type="currency" prefix="$" value={price} onChange={setPrice} />
                  <TextField label="Compare-at price" type="currency" prefix="$" value={compare} onChange={setCompare} error={Number(compare) > 0 && Number(compare) <= Number(price) ? 'Compare-at price must be higher than price' : undefined} />
                </FormLayout.Group>
                <Checkbox label="Charge tax on this product" checked={track} onChange={setTrack} />
                <FormLayout.Group condensed>
                  <TextField label="Cost per item" type="currency" prefix="$" value="7.84" helpText="Customers won't see this" readOnly />
                  <TextField label="Profit" value="$17.15" readOnly />
                  <TextField label="Margin" value="68.6%" readOnly />
                </FormLayout.Group>
              </FormLayout>
            </Card>
            <Card title="Shipping">
              <FormLayout>
                <TextField label="Weight" type="number" step={0.1} min={0} value={weight} onChange={setWeight} suffix="kg" />
                <TextField label="Delivery promise" multiline={3} value="Ships in 1–2 business days. Delivered in 7–12 business days." onChange={() => {}} showCharacterCount maxLength={160} />
              </FormLayout>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card title="Status">
              <Select label="Status" labelHidden options={[{ label: 'Active', value: 'active' }, { label: 'Draft', value: 'draft' }, { label: 'Archived', value: 'archived' }]} value={status} onChange={setStatus} />
            </Card>
            <Card title="Publishing" actions={<Button variant="plain">Manage</Button>}>
              <ChoiceList title="Sales channels" titleHidden allowMultiple choices={[{ label: 'Online Store', value: 'online' }, { label: 'Fadbook & Instaglam', value: 'fadbook' }, { label: 'TikTak Shop', value: 'tiktak', helpText: 'Install the TikTak channel app first', disabled: true }]} selected={channels} onChange={setChannels} />
            </Card>
            <Card title="Product organization">
              <FormLayout>
                <TextField label="Type" value="Pet grooming" onChange={() => {}} />
                <TagsInput label="Tags" tags={tags} onChange={setTags} suggestions={['gift', 'new', 'sale']} />
              </FormLayout>
            </Card>
            <Card title="Badges">
              <InlineStack gap="150">
                <Badge>Default</Badge><Badge tone="success">Active</Badge><Badge tone="info">Scheduled</Badge><Badge tone="attention">Unfulfilled</Badge>
                <Badge tone="warning">Payment pending</Badge><Badge tone="critical">Chargeback</Badge><Badge tone="new">New</Badge><Badge tone="magic">Recommended</Badge>
                <Badge tone="success-strong">Won</Badge><Badge tone="critical-strong">Lost</Badge><Badge tone="read-only">Draft</Badge>
                <Badge progress="complete">Paid</Badge><Badge tone="warning" progress="partiallyComplete">Partially paid</Badge><Badge tone="attention" progress="incomplete">Unfulfilled</Badge>
              </InlineStack>
            </Card>
            <Card title="Avatars & tags">
              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Avatar name="Jordan Lee" size="xs" /><Avatar name="Maya Patel" size="sm" /><Avatar name="Chris Gomez" size="md" />
                  <Avatar name="Ashley Nguyen" size="lg" source={portrait('p03')} /><Avatar name="FurFree Co" size="xl" shape="square" /><Avatar customer size="lg" />
                </InlineStack>
                <InlineStack gap="150"><Tag onRemove={() => {}}>Sale</Tag><Tag>Winter</Tag><Tag onClick={() => {}}>Clickable</Tag></InlineStack>
              </BlockStack>
            </Card>
            <Card title="Setup guide" actions={<Text tone="subdued" variant="bodySm">3 of 6 tasks complete</Text>}>
              <BlockStack gap="300">
                <ProgressBar progress={50} size="small" />
                <ProgressBar progress={72} tone="success" />
                <ProgressBar progress={18} tone="critical" size="large" />
              </BlockStack>
            </Card>
            <Card title="Overlays">
              <BlockStack gap="200">
                <InlineStack gap="200">
                  <Popover
                    active={popover}
                    onClose={() => setPopover(false)}
                    activator={<Button disclosure onClick={() => setPopover(o => !o)}>More actions</Button>}
                  >
                    <ActionList
                      onActionAnyItem={() => setPopover(false)}
                      sections={[
                        { items: [{ content: 'Duplicate', icon: Copy }, { content: 'Export', icon: FileDown, helpText: 'CSV for Excel' }] },
                        { title: 'Danger zone', items: [{ content: 'Delete', icon: Trash2, destructive: true }] },
                      ]}
                    />
                  </Popover>
                  <Button onClick={() => setModal(true)}>Open modal</Button>
                  <Tooltip content="Your break-even ROAS is 1.85"><Button variant="tertiary" icon={Target} accessibilityLabel="Break-even" /></Tooltip>
                </InlineStack>
                <InlineStack gap="200">
                  <DateRangePicker value={range} onChange={setRange} today={TODAY} />
                  <ComparisonPicker value={cmp} onChange={setCmp} range={range.range} />
                </InlineStack>
              </BlockStack>
            </Card>
            <Card title="Details">
              <DescriptionList spacing="tight" items={[{ term: 'Vendor', description: 'Shenzhen Petbright Store' }, { term: 'SKU', description: 'PHR-RED-01' }, { term: 'Ships from', description: 'China (dropship)' }]} />
            </Card>
          </Layout.Section>
        </Layout>
        <Banner title="Your store is password protected" tone="warning" action={{ content: 'Remove password' }} secondaryAction={{ content: 'Learn more' }} onDismiss={() => {}}>
          <p>Visitors can't buy anything until you remove the storefront password. Ads sending traffic here will waste your budget.</p>
        </Banner>
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="300" alignItems="start">
          <Banner title="Payout of $1,284.20 is on its way" tone="success" />
          <Banner title="Chargeback received on order #1031" tone="critical" action={{ content: 'Respond' }}>Submit evidence within 7 days or you lose $64.97 plus a $15 fee.</Banner>
          <Banner tone="info" onDismiss={() => {}}>Tip: products with 5+ images convert noticeably better.</Banner>
          <Banner tone="warning" inline>Compare-at price is more than 70% off, which looks fake to shoppers.</Banner>
        </InlineGrid>
        <Card padding="0" clip>
          <IndexFilters
            tabs={tabs}
            selected={tab}
            onSelect={setTab}
            queryValue={query}
            onQueryChange={setQuery}
            queryPlaceholder="Searching all orders"
            sortOptions={[{ label: 'Date', value: 'date', directionLabels: ['Oldest to newest', 'Newest to oldest'] }, { label: 'Total', value: 'total', directionLabels: ['Lowest to highest', 'Highest to lowest'] }]}
            sortSelected={sort}
            onSortChange={(value, direction) => setSort({ value, direction })}
          />
          <IndexTable
            rows={rows}
            columns={columns}
            rowKey={o => o.id}
            resourceName={{ singular: 'order', plural: 'orders' }}
            selectedIds={sel}
            onSelectionChange={setSel}
            sort={{ columnId: sort.value, direction: sort.direction }}
            onSortChange={s => setSort({ value: s.columnId, direction: s.direction })}
            promotedBulkActions={[{ content: 'Mark as fulfilled', icon: Truck, onAction: () => setSel([]) }, { content: 'Capture payments', onAction: () => {} }]}
            bulkActions={[{ content: 'Add tags', onAction: () => {} }, { content: 'Archive orders', onAction: () => {} }, { content: 'Delete orders', destructive: true, onAction: () => {} }]}
            pageSize={10}
            onRowClick={() => {}}
            emptyState={<EmptyState heading="No orders match" image="search" compact>Try changing the filters or search term.</EmptyState>}
          />
        </Card>
        <Card padding="0">
          <Box padding="400"><Text variant="headingSm">Sales by product</Text></Box>
          <DataTable
            columnContentTypes={['text', 'numeric', 'numeric', 'numeric']}
            headings={['Product', 'Orders', 'Net sales', 'Refund rate']}
            rows={[['Pet Hair Remover Roller', 214, '$5,346.86', '3.2%'], ['Galaxy Star Projector', 88, '$3,079.12', '6.8%'], ['Dog Lick Mat', 51, '$866.49', '1.9%']]}
            totals={['', 353, '$9,292.47', '4.1%']}
            sortable={[false, true, true, true]}
            initialSortColumnIndex={2}
            showTotalsInFooter
            footerContent="Showing 3 of 3 products"
          />
        </Card>
        <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
          <Card><EmptyState heading="Add your first product" image="products" action={{ content: 'Add product', icon: Plus }} secondaryAction={{ content: 'Import' }} compact>Find a product on AliExprez and import it with DSerz.</EmptyState></Card>
          <Card>
            <BlockStack gap="300">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={4} />
            </BlockStack>
          </Card>
          <Card title="Text & icons">
            <BlockStack gap="100">
              <Text variant="headingLg" as="h3">Heading large</Text>
              <Text variant="headingMd" as="h4">Heading medium</Text>
              <Text>Body medium <Text as="span" tone="subdued">subdued</Text> <Text as="span" tone="critical">critical</Text> <Text as="span" tone="success">success</Text></Text>
              <Text variant="bodySm" tone="subdued">Body small · <Link onClick={() => {}}>View report</Link> · <Link external onClick={() => {}}>Help center</Link></Text>
              <InlineStack gap="200"><Icon source={ShoppingBag} /><Icon source={Truck} tone="success" /><Icon source={Users} tone="subdued" /><Icon source={Store} tone="interactive" /><Icon source={Sparkles} tone="magic" /></InlineStack>
              <Divider />
              <Button variant="plain" disclosure={open ? 'up' : 'down'} onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Show'} details</Button>
              <Collapsible open={open}><Text tone="subdued">Collapsible content animates its height.</Text></Collapsible>
              <Pagination hasPrevious={page > 1} hasNext={page < 5} onPrevious={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} label={`Page ${page} of 5`} />
            </BlockStack>
          </Card>
        </InlineGrid>
        <Card title="Buttons">
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Button variant="primary">Primary</Button><Button>Secondary</Button><Button variant="tertiary">Tertiary</Button><Button variant="plain">Plain</Button>
              <Button variant="primary" tone="critical">Delete</Button><Button tone="critical">Remove</Button><Button variant="primary" tone="success">Install app</Button>
              <Button loading>Saving</Button><Button disabled>Disabled</Button><Button variant="primary" disabled>Disabled</Button>
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              <Button size="micro">Micro</Button><Button size="slim">Slim</Button><Button size="large" variant="primary">Large</Button>
              <Button icon={Plus}>Add product</Button><Button icon={Pencil} accessibilityLabel="Edit" /><Button disclosure>Export</Button>
              <ButtonGroup variant="segmented"><Button pressed>Day</Button><Button>Week</Button><Button>Month</Button></ButtonGroup>
            </InlineStack>
            <InlineStack gap="400" blockAlign="start">
              <RadioButton label="Free shipping" checked={radio === 'free'} onChange={() => setRadio('free')} helpText="Most stores in your niche offer it" />
              <RadioButton label="Flat rate" checked={radio === 'flat'} onChange={() => setRadio('flat')} />
              <ChoiceList title="Card autopay" choices={[{ label: 'Statement balance', value: 'full' }, { label: 'Minimum due', value: 'min' }, { label: 'Off', value: 'none' }]} selected={autopay} onChange={setAutopay} inline />
              <Checkbox label="Indeterminate" checked="indeterminate" />
            </InlineStack>
          </BlockStack>
        </Card>
      </Page>
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Refund order #1038"
        primaryAction={{ content: 'Refund $49.98', destructive: true, onAction: () => setModal(false) }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setModal(false) }]}
        footer={<Text tone="subdued" variant="bodySm">The $1.75 processing fee is not returned.</Text>}
      >
        <Modal.Section>
          <FormLayout>
            <TextField label="Refund amount" type="currency" prefix="$" value="49.98" onChange={() => {}} />
            <Select label="Reason" options={['Item not received', 'Defective', 'Changed mind']} value="Defective" onChange={() => {}} />
          </FormLayout>
        </Modal.Section>
        <Modal.Section subdued><Text tone="subdued">Refunds take 5–10 business days to reach the customer.</Text></Modal.Section>
      </Modal>
      <div style={{ padding: '0 24px 24px' }}>
        <Text variant="headingSm">SkeletonPage (loading state)</Text>
        <div style={{ height: 300, overflow: 'hidden', border: '1px dashed #ccc', borderRadius: 12, marginTop: 8 }}>
          <SkeletonPage primaryAction backAction />
        </div>
      </div>
    </PolarisProvider>
  )
}

// ---------------------------------------------------------------------------
// Ads Manager
// ---------------------------------------------------------------------------
interface CampRow {
  id: string
  name: string
  on: boolean
  delivery: string
  detail?: string
  progress?: number
  budget: number | null
  spend: number
  impressions: number
  reach: number
  clicks: number
  purchases: number
  value: number
  day?: number
}
const CAMPS: CampRow[] = [
  { id: 'c1', name: 'FurFree — Broad — UGC testimonial', on: true, delivery: 'Active', budget: 60, spend: 412.18, impressions: 29314, reach: 17012, clicks: 402, purchases: 21, value: 1049.79 },
  { id: 'c2', name: 'FurFree — ASC — 5 creatives', on: true, delivery: 'Learning', detail: '31 of 50 conversions', progress: 0.62, budget: 100, spend: 288.4, impressions: 22871, reach: 15877, clicks: 251, purchases: 11, value: 549.89 },
  { id: 'c3', name: 'Galaxy Projector — Interests — Gift', on: true, delivery: 'Learning limited', detail: 'Too few conversions', budget: 25, spend: 174.9, impressions: 10620, reach: 8411, clicks: 71, purchases: 2, value: 69.98 },
  { id: 'c4', name: 'Lick Mat — Retargeting 30d', on: false, delivery: 'Off', budget: 15, spend: 51.2, impressions: 3104, reach: 1320, clicks: 58, purchases: 4, value: 99.96 },
  { id: 'c5', name: 'Heated Vest — Broad — Before/after', on: true, delivery: 'In review', budget: 40, spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, value: 0 },
  { id: 'c6', name: 'Posture — Health claims', on: false, delivery: 'Rejected', detail: 'Unrealistic outcomes', budget: 30, spend: 12.4, impressions: 910, reach: 880, clicks: 6, purchases: 0, value: 0 },
]
const sum = (rows: CampRow[], k: keyof CampRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)

const ALL_COLS = [
  { id: 'delivery', label: 'Delivery', category: 'Performance' },
  { id: 'budget', label: 'Budget', category: 'Settings' },
  { id: 'results', label: 'Results', category: 'Performance', description: 'Website purchases attributed to the ad' },
  { id: 'reach', label: 'Reach', category: 'Performance' },
  { id: 'impressions', label: 'Impressions', category: 'Performance' },
  { id: 'frequency', label: 'Frequency', category: 'Performance', description: 'Average times each person saw the ad' },
  { id: 'cpr', label: 'Cost per result', category: 'Performance' },
  { id: 'spend', label: 'Amount spent', category: 'Performance' },
  { id: 'cpm', label: 'CPM (cost per 1,000 impressions)', category: 'Engagement' },
  { id: 'ctr', label: 'CTR (link click-through rate)', category: 'Engagement' },
  { id: 'cpc', label: 'CPC (cost per link click)', category: 'Engagement' },
  { id: 'roas', label: 'Purchase ROAS', category: 'Conversions' },
]

function AdsDemo({ theme }: { theme: AmTheme }) {
  const [rows, setRows] = useState(CAMPS)
  const [sel, setSel] = useState<string[]>(['c1'])
  const [level, setLevel] = useState('campaign')
  const [range, setRange] = useDateRangeState(TODAY, 'last7', 'ads')
  const [cols, setCols] = useState<ColumnsValue>({ presetId: 'performance', columns: ALL_COLS.slice(0, 8).map(c => c.id) })
  const [breakdown, setBreakdown] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<CampRow | null>(null)
  const [objModal, setObjModal] = useState(false)
  const [objective, setObjective] = useState('sales')
  const [step, setStep] = useState('adset')
  const [bidStrategy, setBid] = useState<string | null>('lowest')
  const [period, setPeriod] = useState<'daily' | 'lifetime'>('daily')
  const [name, setName] = useState('FurFree — Broad — UGC testimonial')
  const [adv, setAdv] = useState(true)
  const labels = entityTabLabels(theme)

  const colDefs: Record<string, AmColumn<CampRow>> = {
    delivery: { id: 'delivery', header: 'Delivery', width: 150, render: r => <StatusCell label={r.delivery} detail={r.detail} progress={r.progress} />, sortValue: r => r.delivery },
    budget: { id: 'budget', header: 'Budget', width: 120, align: 'right', render: r => <BudgetCell amount={r.budget} editable level="adset" onChange={b => setRows(rs => rs.map(x => (x.id === r.id ? { ...x, budget: b } : x)))} />, sortValue: r => r.budget },
    results: { id: 'results', header: 'Results', headerTip: 'The number of times your ad achieved an outcome, based on the objective and settings you selected.', align: 'right', render: r => <MetricCell value={r.purchases ? amFmt.int(r.purchases) : amFmt.dash} sub={r.purchases ? 'Website purchases' : undefined} />, sortValue: r => r.purchases, total: rs => <MetricCell value={amFmt.int(sum(rs, 'purchases'))} sub="Website purchases" /> },
    reach: { id: 'reach', header: 'Reach', align: 'right', render: r => <MetricCell value={amFmt.int(r.reach)} />, sortValue: r => r.reach, total: rs => <MetricCell value={amFmt.int(sum(rs, 'reach'))} sub="Accounts Center accounts" /> },
    impressions: { id: 'impressions', header: 'Impressions', align: 'right', render: r => <MetricCell value={amFmt.int(r.impressions)} />, sortValue: r => r.impressions, total: rs => <MetricCell value={amFmt.int(sum(rs, 'impressions'))} sub="Total" /> },
    frequency: { id: 'frequency', header: 'Frequency', align: 'right', render: r => <MetricCell value={r.reach ? amFmt.freq(r.impressions / r.reach) : amFmt.dash} />, sortValue: r => (r.reach ? r.impressions / r.reach : null) },
    cpr: { id: 'cpr', header: 'Cost per result', align: 'right', render: r => <MetricCell value={amFmt.ratio(r.spend, r.purchases, amFmt.money)} sub={r.purchases ? 'Per purchase' : undefined} />, sortValue: r => (r.purchases ? r.spend / r.purchases : null), total: rs => <MetricCell value={amFmt.ratio(sum(rs, 'spend'), sum(rs, 'purchases'), amFmt.money)} sub="Per purchase" /> },
    spend: { id: 'spend', header: 'Amount spent', align: 'right', render: r => <MetricCell value={amFmt.money(r.spend)} />, sortValue: r => r.spend, total: rs => <MetricCell value={amFmt.money(sum(rs, 'spend'))} sub="Total spent" /> },
    cpm: { id: 'cpm', header: 'CPM (cost per 1,000 impressions)', align: 'right', render: r => <MetricCell value={amFmt.ratio(r.spend * 1000, r.impressions, amFmt.money)} />, sortValue: r => (r.impressions ? (r.spend * 1000) / r.impressions : null) },
    ctr: { id: 'ctr', header: 'CTR (link click-through rate)', align: 'right', render: r => <MetricCell value={amFmt.ratio(r.clicks, r.impressions, v => amFmt.pct(v))} />, sortValue: r => (r.impressions ? r.clicks / r.impressions : null) },
    cpc: { id: 'cpc', header: 'CPC (cost per link click)', align: 'right', render: r => <MetricCell value={amFmt.ratio(r.spend, r.clicks, amFmt.money)} /> },
    roas: { id: 'roas', header: theme === 'tiktak' ? 'Total complete payment ROAS' : 'Purchase ROAS (return on ad spend)', align: 'right', render: r => <MetricCell value={amFmt.ratio(r.value, r.spend, amFmt.roas)} />, sortValue: r => (r.spend ? r.value / r.spend : null), total: rs => <MetricCell value={amFmt.ratio(sum(rs, 'value'), sum(rs, 'spend'), amFmt.roas)} sub="Average" /> },
  }
  const nameCol: AmColumn<CampRow> = {
    id: 'name',
    header: theme === 'tiktak' ? 'Campaign name' : 'Campaign',
    width: 280,
    sticky: true,
    render: r => (r.day !== undefined ? <span>{formatDate(r.day, 'short')}</span> : <AmNameCell name={r.name} onClick={() => setDrawer(r)} />),
    sortValue: r => r.name,
    hoverActions: r => [
      { label: 'View charts', icon: ChartColumn, onClick: () => {} },
      { label: 'Edit', icon: Pencil, onClick: () => setDrawer(r) },
      { label: 'Duplicate', icon: Copy, onClick: () => {} },
    ],
  }
  const columns = [nameCol, ...cols.columns.map(id => colDefs[id]).filter(Boolean)]
  const subRows = breakdown === 'day'
    ? (r: CampRow) => Array.from({ length: 3 }, (_, i): CampRow => {
        const k = 0.25 + wave(i, r.spend) * 0.2
        return { ...r, id: `${r.id}-d${i}`, day: range.range.to - i, spend: r.spend * k, impressions: Math.round(r.impressions * k), reach: Math.round(r.reach * k * 1.2), clicks: Math.round(r.clicks * k), purchases: Math.round(r.purchases * k), value: r.value * k }
      })
    : undefined

  return (
    <AmThemeProvider theme={theme} style={{ padding: 16, borderRadius: 12, border: '1px solid #dadde1' }}>
      <div className="am-toolbar" style={{ marginBottom: 12 }}>
        <AmButton variant="create" icon={Plus} onClick={() => setObjModal(true)}>Create</AmButton>
        <AmButton icon={Copy} disabled={!sel.length}>Duplicate</AmButton>
        <AmButton icon={Pencil} disabled={sel.length !== 1} onClick={() => setDrawer(rows.find(r => r.id === sel[0]) ?? null)}>Edit</AmButton>
        <AmTooltip content="A/B tests unlock when you have 2+ active campaigns"><AmButton disabled>A/B test</AmButton></AmTooltip>
        <AmMenu trigger={<AmButton caret>Rules</AmButton>} items={[{ id: 'new', label: 'Create new rule', description: 'Pause ads with CPA over 2× break-even' }, { id: 'manage', label: 'Manage rules' }]} />
        <span className="am-toolbar-spacer" />
        <ColumnsMenu
          presets={[
            { id: 'performance', label: 'Performance', columns: ALL_COLS.slice(0, 8).map(c => c.id) },
            { id: 'clicks', label: 'Performance and clicks', columns: ['delivery', 'budget', 'results', 'spend', 'cpm', 'ctr', 'cpc', 'roas'] },
            { id: 'ecom', label: 'Ecom custom', columns: ['delivery', 'spend', 'cpm', 'ctr', 'cpc', 'results', 'cpr', 'roas', 'frequency'], custom: true },
          ]}
          allColumns={ALL_COLS}
          value={cols}
          onChange={setCols}
          locked={['delivery']}
          onSavePreset={() => undefined}
        />
        <BreakdownMenu value={breakdown} onChange={setBreakdown} sections={[{ title: 'By time', items: [{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }] }, { title: 'By delivery', items: [{ id: 'age', label: 'Age', disabled: true, disabledReason: 'Unlocks at Media buying level 3' }, { id: 'placement', label: 'Placement', disabled: true, disabledReason: 'Unlocks at Media buying level 3' }] }]} />
        <AmDateRangePicker value={range} onChange={setRange} today={TODAY} />
      </div>
      <EntityTabs
        tabs={[
          { id: 'campaign', label: labels.campaign, selectedCount: sel.length, onClearSelection: () => setSel([]), count: rows.length },
          { id: 'adset', label: sel.length ? `${labels.adset} for ${sel.length} ${theme === 'tiktak' ? 'campaign' : 'Campaign'}` : labels.adset, count: 9 },
          { id: 'ad', label: sel.length ? `${labels.ad} for ${sel.length} ${theme === 'tiktak' ? 'campaign' : 'Campaign'}` : labels.ad, count: 17 },
        ]}
        active={level}
        onChange={setLevel}
      />
      <AmTable
        rows={rows}
        columns={columns}
        rowKey={r => r.id}
        selectedIds={sel}
        onSelectionChange={setSel}
        toggle={{ isOn: r => r.on, onChange: (r, on) => setRows(rs => rs.map(x => (x.id === r.id ? { ...x, on, delivery: on ? 'Active' : 'Off' } : x))), disabled: r => r.delivery === 'Rejected' }}
        entityName={{ singular: 'campaign', plural: 'campaigns' }}
        subRows={subRows}
        rowMuted={r => !r.on}
        attachedTop={theme === 'fadbook'}
        maxHeight={420}
        defaultSort={{ columnId: 'spend', direction: 'desc' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
        <AmCard title="Ad set" subtitle="Budget, schedule & audience" titleTip="Ad sets control who sees your ads and how much you spend." collapsible>
          <AmField label="Ad set name" footerRight={<span className="am-field-count">{name.length}/100</span>}><AmInput value={name} onChange={setName} maxLength={100} /></AmField>
          <AmField label="Budget" labelTip="Your daily budget is the average you'll spend every day." warning={theme === 'tiktak' ? 'Budget changes over 30% may restart learning.' : undefined}>
            <div style={{ display: 'flex', gap: 8 }}>
              <AmSegmented value={period} onChange={setPeriod} options={[{ value: 'daily', label: 'Daily budget' }, { value: 'lifetime', label: 'Lifetime budget' }]} />
              <AmInput value="60.00" type="currency" prefix="$" suffix="USD" width={140} />
            </div>
          </AmField>
          <AmField label="Bid strategy" help="Get the most results for your budget.">
            <AmSelect value={bidStrategy} onChange={setBid} options={[{ value: 'lowest', label: 'Highest volume', description: 'Get the most results for your budget' }, { value: 'costcap', label: 'Cost per result goal', description: 'Keep cost per result near your goal', disabled: true, disabledReason: 'Unlocks at Media buying level 3' }, { value: 'roas', label: 'ROAS goal' }]} />
          </AmField>
          <AmCheckbox checked={adv} onChange={setAdv} label="Advantage+ audience" description="Let the delivery system find people beyond your selections." />
          <div style={{ display: 'flex', gap: 16 }}>
            <AmRadio checked label="Website" name={`loc-${theme}`} />
            <AmRadio checked={false} label="App" name={`loc-${theme}`} disabled />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Toggle checked label="Placements: Advantage+" />
            <Toggle checked={false} size="sm" ariaLabel="Small toggle" />
            <InfoTip content="Advantage+ placements let the system spread budget across feeds, Reels and Stories." />
          </div>
        </AmCard>
        <AmCard title="Audience">
          <AudienceGauge estimate={[adv ? 185_300_000 : 3_400_000, adv ? 218_000_000 : 4_000_000]} note="Estimates may vary significantly over time." />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <AmTag>United States</AmTag><AmTag tone="primary">Age 25–54</AmTag><AmTag tone="green" onRemove={() => {}}>Dog owners</AmTag>
            <AmTag tone="yellow">Learning</AmTag><AmTag tone="red">Rejected</AmTag><AmTag tone="teal">Smart+</AmTag><AmTag tone="pink">Spark Ads</AmTag>
          </div>
        </AmCard>
        <AmCard title="Notices & steps">
          <AmNotice title="Learning phase">This ad set needs about 50 purchases in 7 days to exit learning. Avoid significant edits.</AmNotice>
          <AmNotice tone="warning" title="Learning limited" actions={<AmButton size="sm">Combine ad sets</AmButton>}>Not enough conversions to optimize delivery.</AmNotice>
          <AmNotice tone="error" onDismiss={() => {}}>Payment failed. Your ads are paused until you pay the outstanding $25.00.</AmNotice>
          <AmNotice tone="success">Your ad was approved and is now delivering.</AmNotice>
          <Stepper
            steps={[{ id: 'campaign', label: 'New Sales campaign', icon: Package }, { id: 'adset', label: 'New Sales ad set', level: 1, description: '1 issue', status: 'warning' }, { id: 'ad', label: 'New Sales ad', level: 2 }]}
            current={step}
            onStepClick={setStep}
          />
          <Stepper orientation="horizontal" steps={[{ id: 'campaign', label: 'Campaign' }, { id: 'adset', label: 'Ad group' }, { id: 'ad', label: 'Ad' }]} current={step} onStepClick={setStep} />
        </AmCard>
      </div>
      <SideDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={drawer?.name}
        subtitle={drawer ? `${drawer.delivery} · Campaign ID 238${drawer.id.slice(1)}0419` : undefined}
        tabs={[{ id: 'edit', label: 'Edit' }, { id: 'charts', label: 'Charts' }, { id: 'history', label: 'History' }]}
        activeTab="edit"
        footer={<><AmButton onClick={() => setDrawer(null)}>Close</AmButton><AmButton variant={theme === 'fadbook' ? 'create' : 'primary'} onClick={() => setDrawer(null)}>Publish</AmButton></>}
        footerLeft="All edits saved as draft"
      >
        <AmCard title="Campaign details">
          <AmField label="Campaign name"><AmInput value={drawer?.name ?? ''} /></AmField>
          <AmField label="Campaign budget" warning="Significant edits (over 20%) can reset the learning phase."><AmInput value="60.00" prefix="$" type="currency" /></AmField>
        </AmCard>
        <AmCard title="Delivery"><StatusCell label={drawer?.delivery ?? 'Active'} detail={drawer?.detail} progress={drawer?.progress} /></AmCard>
      </SideDrawer>
      <AmModal
        open={objModal}
        onClose={() => setObjModal(false)}
        title="Choose a campaign objective"
        size="lg"
        footer={<><AmButton onClick={() => setObjModal(false)}>Cancel</AmButton><AmButton variant="primary" onClick={() => setObjModal(false)}>Continue</AmButton></>}
        footerLeft="Your campaign objective is the business goal you hope to achieve."
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <AmRadioCard checked={objective === 'sales'} onSelect={() => setObjective('sales')} icon={ShoppingBag} title="Sales" badge={<AmTag tone="primary">Recommended</AmTag>} description="Find people likely to purchase your product or service." />
          <AmRadioCard checked={objective === 'traffic'} onSelect={() => setObjective('traffic')} icon={Target} title="Traffic" description="Send people to a destination, like your website." disabled disabledReason="Traffic campaigns optimize for clicks, not buyers. Use Sales for a store." />
          <AmRadioCard checked={objective === 'awareness'} onSelect={() => setObjective('awareness')} icon={Eye} title="Awareness" description="Show your ads to people who are most likely to remember them." disabled disabledReason="Not available for new ad accounts." />
        </div>
      </AmModal>
    </AmThemeProvider>
  )
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------
function PhoneDemo() {
  const base = {
    productImage: productImage('pet-hair-roller'),
    brandName: 'FurFree',
    hookText: 'POV: your couch after ONE swipe 😳',
    caption: 'No refills, no batteries, no more fur on everything. 30-day money-back guarantee #cleantok #doglife #tiktakmademebuyit',
    script: 'I tried every lint roller. This one actually works. One swipe and the fur is gone. And it is reusable, so no refills ever. Get yours 40% off today.',
    likes: 18400,
    comments: 312,
    shares: 1240,
    isVideo: true,
    durationSec: 15,
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
      <Swatch label="TikTak (video)"><AdPreview platform="tiktak" {...base} /></Swatch>
      <Swatch label="Fadbook Reels (video)"><AdPreview platform="fadbook-reels" {...base} productImage={productImage('galaxy-projector')} brandName="Nightglow" hookText="Turned my room into a galaxy for $39" /></Swatch>
      <Swatch label="Fadbook feed (video)"><AdPreview platform="fadbook-feed" {...base} headline="Reusable Pet Hair Remover — 40% Off" linkDescription="Free shipping · 30-day guarantee" /></Swatch>
      <Swatch label="Static image, silver frame">
        <PhoneMockup width={220} frame="silver" statusBar="dark" screenBg="#fff">
          <div style={{ padding: '80px 24px', font: '600 22px/30px Inter, sans-serif', color: '#111' }}>Any screen content renders at 360×780 and scales.</div>
        </PhoneMockup>
      </Swatch>
      <Swatch label="Frameless cards (Mineo feed)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <AdPreview platform="tiktak" {...base} frame={false} width={150} productImage={productImage('dog-lick-mat')} brandName="LickLab" hookText="Bath time hack" />
          <AdPreview platform="fadbook-reels" {...base} frame={false} width={150} playing={false} productImage={productImage('missing-art')} productName="Posture Corrector" brandName="AlignUp" hookText="" />
          <AdPreview platform="fadbook-feed" {...base} frame={false} width={150} isVideo={false} productImage={productImage('heated-vest')} brandName="Toasty" />
        </div>
      </Swatch>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
function ChartsDemo() {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = TODAY - 29 + i
    return {
      label: formatDate(d, 'md'),
      value: Math.round((180 + i * 9 + wave(i, 1) * 160) * 100) / 100,
      compare: Math.round((140 + i * 4 + wave(i, 3) * 120) * 100) / 100,
      compareLabel: formatDate(d - 30, 'md'),
    }
  })
  const roas = Array.from({ length: 14 }, (_, i) => ({ label: formatDate(TODAY - 13 + i, 'md'), fadbook: 1.2 + wave(i, 2) * 1.4, tiktak: 0.8 + wave(i, 5) * 1.2 }))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
      <LineChartCard title="Total sales" titleTip="Gross sales minus discounts and returns, plus taxes and shipping." data={days} format="money" currentLabel={`${days[0].label}–${days[29].label}, 2026`} compareLabel={`${days[0].compareLabel}–${days[29].compareLabel}, 2026`} action={<Link onClick={() => {}}>View report</Link>} />
      <LineChartCard title="Online store conversion rate" format="percent" data={days.map((d, i) => ({ ...d, value: 0.012 + wave(i, 4) * 0.02, compare: 0.01 + wave(i, 6) * 0.015 }))} value={0.0231} comparisonValue={0.0187} area />
      <LineChartCard title="Cost per purchase" format="money" invertDelta data={days.slice(-14).map((d, i) => ({ label: d.label, value: 18 + wave(i, 7) * 14 }))} value={24.18} comparisonValue={29.9} referenceLines={[{ value: 27.4, label: 'Break-even CPA $27.40', color: CHART_COLORS.critical }]} color={CHART_COLORS.fadbook} />
      <div className="p-card" style={{ padding: 16 }}>
        <Text variant="headingSm">ROAS by platform</Text>
        <TrendChart data={roas} series={[{ key: 'fadbook', label: 'Fadbook', color: CHART_COLORS.fadbook }, { key: 'tiktak', label: 'TikTak', color: CHART_COLORS.tiktak }]} format="roas" height={200} referenceLines={[{ value: 1.85, label: 'Break-even 1.85' }]} />
      </div>
      <div className="p-card" style={{ padding: 16 }}>
        <Text variant="headingSm">Sessions by device</Text>
        <div style={{ marginTop: 12 }}>
          <BarChart orientation="horizontal" showShare data={[{ label: 'Mobile', value: 4212, compare: 3610 }, { label: 'Desktop', value: 1022, compare: 1180 }, { label: 'Tablet', value: 164, compare: 140 }]} />
        </div>
      </div>
      <div className="p-card" style={{ padding: 16 }}>
        <Text variant="headingSm">Orders by day</Text>
        <BarChart data={days.slice(-10).map((d, i) => ({ label: d.label, value: Math.round(4 + wave(i, 8) * 14) }))} height={200} />
      </div>
      <div className="p-card" style={{ padding: 16 }}>
        <Text variant="headingSm">Sales by social source</Text>
        <div style={{ marginTop: 12 }}>
          <DonutChart format="money0" centerLabel="Total sales" data={[{ label: 'Fadbook', value: 6120 }, { label: 'TikTak', value: 3480 }, { label: 'Instaglam', value: 1210 }, { label: 'Direct', value: 640 }]} />
        </div>
      </div>
      <div className="p-card" style={{ padding: 16 }}>
        <Text variant="headingSm">Conversion rate breakdown</Text>
        <div style={{ marginTop: 12 }}>
          <FunnelBars steps={[{ label: 'Sessions', value: 5398, compare: 4930 }, { label: 'Added to cart', value: 402, compare: 311 }, { label: 'Reached checkout', value: 219, compare: 170 }, { label: 'Sessions converted', value: 125, compare: 92 }]} />
        </div>
      </div>
      <div className="p-card" style={{ padding: 16 }}>
        <Text variant="headingSm">Funnel (rows) · sparklines · gauge</Text>
        <FunnelBars variant="rows" steps={[{ label: 'Sessions', value: 5398 }, { label: 'Added to cart', value: 402 }, { label: 'Reached checkout', value: 219 }, { label: 'Converted', value: 125 }]} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginTop: 12 }}>
          <Sparkline data={days.map(d => d.value)} />
          <Sparkline data={days.map(d => d.value)} compare={days.map(d => d.compare)} width={120} />
          <Sparkline data={[]} />
          <GaugeRing value={82} sublabel="Page grade" />
          <GaugeRing value={61} size={64} />
          <GaugeRing value={34} size={56} thickness={6} />
        </div>
      </div>
    </div>
  )
}

/** Every kit component on one page, for visual QA. */
export function KitGallery() {
  return (
    <div style={{ minHeight: '100%', background: '#fff', color: '#1a1a1a' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center', padding: '12px 24px', background: '#1a1a1a', color: '#fff', font: '600 14px Inter, sans-serif' }}>
        <span style={{ fontSize: 16 }}>UI kit gallery</span>
        {[['common', 'Common'], ['polaris', 'Polaris'], ['fadbook', 'Fadbook'], ['tiktak', 'TikTak'], ['phone', 'Phone'], ['charts', 'Charts']].map(([id, l]) => (
          <a key={id} href={`#${id}`} style={{ color: '#c7c7c7', textDecoration: 'none' }}>{l}</a>
        ))}
      </header>
      <Section id="common" title="Common (kx-)"><CommonDemo /></Section>
      <Section id="polaris" title="Polaris (p-) — Shopifly admin" dark><PolarisDemo /></Section>
      <Section id="fadbook" title="Ads Manager (am-) — theme fadbook"><AdsDemo theme="fadbook" /></Section>
      <Section id="tiktak" title="Ads Manager (am-) — theme tiktak"><AdsDemo theme="tiktak" /></Section>
      <Section id="phone" title="Phone (ph-)" dark><PhoneDemo /></Section>
      <Section id="charts" title="Charts (kc-)" dark><ChartsDemo /></Section>
    </div>
  )
}

export default KitGallery
