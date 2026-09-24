# UI kits

Shared components for the in-game websites. Everything below is production code: typed, documented with JSDoc,
and rendered on one page for visual QA at **`/src/ui/kit/demo/gallery.html`** on the dev server
(`http://localhost:5317/src/ui/kit/demo/gallery.html`, component: `src/ui/kit/demo/KitGallery.tsx`).

| Kit | Import from | CSS prefix | Used by |
|---|---|---|---|
| Polaris (Shopifly admin) | `src/ui/kit/polaris` | `p-` | Shopifly core + merch |
| Ads Manager (Fadbook / TikTak) | `src/ui/kit/adsmanager` | `am-` | Fadbook, TikTak |
| Phone (frame + ad previews) | `src/ui/kit/phone` | `ph-` | Studio, Fadbook, TikTak, Mineo |
| Charts (recharts wrappers) | `src/ui/kit/charts` | `kc-` | Shopifly analytics, ads dashboards, bank |
| Common | `src/ui/kit/common` | `kx-` | everyone |

```ts
// paths are relative to your file, e.g. from src/ui/sites/shopifly/pages/Orders.tsx:
import { Page, Card, IndexTable, Badge } from '../../../kit/polaris'
import { Money, ImageWithFallback } from '../../../kit/common'
```

## Ground rules

- **Each component imports its own CSS.** Don't restyle kit classes from site CSS; wrap or pass `className`.
- **Overlays portal to `document.body`** (Popover, Tooltip, menus, Modal, drawers) so tables and cards never clip them.
  They re-apply their theme class, so Polaris tokens and the Ads Manager theme still resolve. Escape closes only the
  top-most layer (`useLayer`). `Modal`, `AmModal` and `SideDrawer` take `inline` to render inside the nearest
  positioned ancestor (e.g. to stay inside the in-game browser window) and `pauseGame` to call
  `usePauseWhileMounted` while open.
- **Responsive by container, not viewport.** Sites render inside the in-game browser or a 390px phone frame, so
  `Page`, `InlineGrid` responsive columns and the date pickers measure their own width.
- **Sticky things** (`ContextualSaveBar placement="sticky"`, IndexTable bulk bar, AmTable header/footer) need a
  scrolling ancestor with no `overflow: hidden` in between.
- **Skill-based UI:** tables show raw metrics exactly like the real tools. Don't color CTR/ROAS as good/bad unless the
  player set the target (e.g. break-even ROAS). `MetricCell tone` and chart `referenceLines` exist for that.
- **Parody names only** in visible text (Shopifly, Fadbook, Instaglam, TikTak…).
- **Game clock:** kit components never touch game state. The only core import is `usePauseWhileMounted` (opt-in via `pauseGame`).
- **Budget rules come from `src/data/benchmarks.ts`:** learning-reset thresholds (Fadbook 20%, TikTak 30%) and
  minimum budgets (Fadbook $5, TikTak $20 ad group / $50 campaign).

---

## Common (`kit/common`)

```tsx
import {
  ImageWithFallback, Money, Stars, Countdown, EmptyArt, RangeCalendar, Floating, Portal,
  useDateRangeState, formatRange, comparisonRange, formatSocialCount, tileColor, initials, cx,
} from '../../kit/common'

// Image with a branded tile fallback (art may be missing during development)
<ImageWithFallback src={productImage(p.id)} alt={p.name} width={64} radius={8} />
<ImageWithFallback src={null} alt="Heated vest" fallbackEmoji="🧥" aspectRatio="4 / 5" />

// Money: tabular USD, compact, signed, colored, compare-at strike
<Money amount={1234.5} />                      // $1,234.50
<Money amount={48213} compact />               // $48.2K
<Money amount={profit} sign tone="auto" />     // +$312.40 (green) / -$86.10 (red)
<Money amount={59.99} strike />                // compare-at price
<Money amount={129} currencyCode />            // $129.00 USD

// Stars with fractional fill
<Stars rating={4.7} showValue count={12840} />
<Stars rating={4.4} color="#f79009" size={16} />        // Amazin orange

// Countdown: in-game hours (static) or real-time seconds (live)
<Countdown hoursLeft={dispute.dueHour - s.hour} />                  // "2d 5h", red under 24h
<Countdown secondsLeft={35999} live loop format="boxes" />          // storefront fake-urgency timer

// Empty illustrations
<EmptyArt kind="orders" size={160} />   // orders | products | search | chart | inbox | ads | customers | creative | generic

// Range calendar (used inside both date pickers; themable with --kx-cal-* variables)
<RangeCalendar value={range} onChange={setRange} maxDay={today} today={today} months={2} />

// Date-range state that rolls forward as game days pass
const [range, setRange] = useDateRangeState(today, 'last30', 'shop')   // or 'last7', 'ads'
formatRange(range.range)                        // "Mar 31 – Apr 29, 2026"
comparisonRange(range.range, 'previous_period') // equal-length range just before

// Positioned layer for custom popovers (portal, flips at edges, outside-click + Esc)
const anchor = useRef<HTMLButtonElement>(null)
<button ref={anchor} onClick={() => setOpen(true)}>Filters</button>
<Floating anchor={anchor} open={open} onClose={() => setOpen(false)} placement="bottom-end">…</Floating>
<Portal><div className="my-overlay">…</div></Portal>

// Helpers
formatSocialCount(18400)   // "18.4K"
tileColor('FurFree')       // { bg, fg } stable per label
initials('Jordan Lee')     // "JL"
```

Hooks: `useControllableState`, `useLayer(active, onEscape)`, `useInterval(fn, ms, active)`, `useHover()`,
`useElementWidth()` (returns `[ref, width]`), `kitLayerOpen()` (true while any kit overlay is open; for shell hotkeys).
Icons: `renderIcon(source, size)` accepts a lucide component or an element.

---

## Polaris (`kit/polaris`): the Shopifly admin

Tokens: bg `#f1f1f1`, surface `#fff`, text `#303030`/`#616161`, border `#e3e3e3`, Inter 13/20, weights 450/550/650,
12px card radius, 8px control radius, bevelled buttons.

### Frame & layout

```tsx
<PolarisProvider>{/* Inter 13px, #303030 text, #f1f1f1 canvas: wrap each admin screen */}
  <Page
    backAction={{ content: 'Products', onAction: () => navigate('products') }}
    title="Reusable Pet Hair Remover Roller"
    titleMetadata={<Badge tone="success">Active</Badge>}
    subtitle="Imported via DSerz"
    secondaryActions={[{ content: 'Duplicate', icon: Copy, onAction: dup }, { content: 'Preview', icon: Eye }]}
    actionGroups={[{ title: 'More actions', actions: [{ content: 'Archive' }, { content: 'Delete', destructive: true }] }]}
    primaryAction={{ content: 'Save', onAction: save, disabled: !dirty }}
    pagination={{ hasPrevious, hasNext, onPrevious, onNext }}
    fullWidth /* analytics */ /* or narrowWidth for settings */
  >
    <Layout>
      <Layout.Section>{/* 2/3 */}<Card>…</Card></Layout.Section>
      <Layout.Section variant="oneThird">{/* 1/3 */}<Card>…</Card></Layout.Section>
    </Layout>
    <Layout>
      <Layout.AnnotatedSection title="Store details" description="Shown on your storefront">
        <Card>…</Card>
      </Layout.AnnotatedSection>
    </Layout>
  </Page>
</PolarisProvider>

<Card title="Pricing" actions={<Button variant="plain">Edit</Button>} footer={<Button>Save</Button>}>…</Card>
<Card padding="0">
  <Card.Section title="Payment">…</Card.Section>
  <Card.Section subdued>…</Card.Section>
</Card>

<BlockStack gap="300">…</BlockStack>                          // vertical, tokens '100'=4px … '800'=32px
<InlineStack gap="200" align="space-between" blockAlign="center">…</InlineStack>
<InlineGrid columns={{ xs: 1, md: 3 }} gap="400">…</InlineGrid> // container-responsive
<Box padding="400" background="bg-surface-secondary" borderRadius="200">…</Box>
<Divider />
<FormLayout>
  <TextField … />
  <FormLayout.Group><TextField … /><TextField … /></FormLayout.Group>
</FormLayout>
<DescriptionList items={[{ term: 'Vendor', description: 'Shenzhen Petbright' }]} spacing="tight" />
<Collapsible open={open}>Details…</Collapsible>
```

### Typography, icons, links

```tsx
<Text variant="headingMd" as="h2">Orders</Text>
<Text tone="subdued" variant="bodySm">Last updated 2 min ago</Text>
<Text numeric fontWeight="semibold">$1,204.00</Text>          // variants heading2xl…headingXs, bodyLg…bodyXs
<Icon source={Truck} tone="subdued" />                         // any lucide icon, 20px box
<Link onClick={() => navigate('orders')}>View orders</Link>
<Link external onClick={openHelp}>Help center</Link>
<Spinner size="small" />
```

### Buttons & badges

```tsx
<Button variant="primary" onClick={save}>Save</Button>             // dark bevel
<Button>Export</Button>                                            // white bevel (secondary)
<Button variant="tertiary" icon={Copy}>Duplicate</Button>
<Button variant="plain">Add from URL</Button>
<Button variant="primary" tone="critical">Delete product</Button>
<Button tone="success" variant="primary">Install app</Button>
<Button size="slim" disclosure>More actions</Button>               // micro | slim | medium | large
<Button icon={Pencil} accessibilityLabel="Edit" />
<Button loading>Saving</Button>
<ButtonGroup variant="segmented"><Button pressed>Day</Button><Button>Week</Button></ButtonGroup>

<Badge tone="success">Active</Badge>                               // info | attention | warning | critical | new | magic | read-only | *-strong
<Badge progress="complete">Paid</Badge>
<Badge tone="warning" progress="partiallyComplete">Payment pending</Badge>
<Badge tone="attention" progress="incomplete">Unfulfilled</Badge>
<Tag onRemove={() => removeTag(t)}>{t}</Tag>
```

### Feedback

```tsx
<Banner title="Payouts on hold" tone="warning" action={{ content: 'Review' }} onDismiss={close}>
  Your chargeback rate is above 1%.
</Banner>
<Banner tone="info">Tip without a title renders as a compact tinted notice.</Banner>
<ProgressBar progress={50} size="small" tone="success" />
<EmptyState heading="No orders yet" image="orders" action={{ content: 'Create order' }} secondaryAction={{ content: 'Learn more' }}>
  Orders appear here once customers buy.
</EmptyState>
<SkeletonPage title="Products" primaryAction />
<SkeletonBodyText lines={3} /> <SkeletonDisplayText size="small" /> <SkeletonThumbnail /> <SkeletonTabs />
<InlineError message="Price is required" />
```

### Media

```tsx
<Thumbnail source={productImage(id)} alt={name} size="small" />   // extraSmall | small | medium | large; lucide icon allowed
<Avatar name={customer.name} size="md" />                          // initials + stable color
<Avatar source={portrait('p07')} name="Maya" shape="square" size="xl" />
<DropZone actionLabel="Add media" secondaryLabel="Add from supplier" hint="Accepts images and videos" onClick={openPicker} />
```

### Forms

```tsx
<TextField label="Title" value={title} onChange={setTitle} recommendedLength={70} helpText="Lead with the benefit." />
<TextField label="Price" type="currency" prefix="$" value={price} onChange={setPrice} error={priceError} />
<TextField label="Weight" type="number" step={0.1} min={0} suffix="kg" value={w} onChange={setW} />
<TextField label="Notes" multiline={4} maxLength={500} showCharacterCount value={n} onChange={setN} />
<TextField label="Search" labelHidden type="search" prefix={<Search size={16} />} clearButton value={q} onChange={setQ} />
<TextField label="Code" connectedRight={<Button>Generate</Button>} value={c} onChange={setC} />
<Select label="Status" options={[{ label: 'Active', value: 'active' }, { label: 'Draft', value: 'draft' }]} value={s} onChange={setS} />
<Select label="Sort by" labelInline options={['Newest', 'Oldest']} value={sort} onChange={setSort} />
<Checkbox label="Track quantity" checked={track} onChange={setTrack} />
<RadioButton label="Free shipping" checked={mode === 'free'} onChange={() => setMode('free')} />
<ChoiceList
  title="Autopay"
  choices={[{ label: 'Statement balance', value: 'full' }, { label: 'Minimum due', value: 'min', renderChildren: on => on && <Text>…</Text> }]}
  selected={[autopay]}
  onChange={([v]) => setAutopay(v)}
/>
<ChoiceList allowMultiple title="Channels" choices={…} selected={channels} onChange={setChannels} />
<TagsInput label="Tags" tags={tags} onChange={setTags} suggestions={['gift', 'sale']} />
```

### Overlays

```tsx
<Popover active={open} onClose={() => setOpen(false)} preferredAlignment="right"
  activator={<Button disclosure onClick={() => setOpen(o => !o)}>More actions</Button>}>
  <ActionList
    onActionAnyItem={() => setOpen(false)}
    sections={[
      { items: [{ content: 'Duplicate', icon: Copy, onAction: dup }, { content: 'Export', helpText: 'CSV' }] },
      { title: 'Danger zone', items: [{ content: 'Delete', destructive: true, onAction: del }] },
    ]}
  />
</Popover>

<Modal open={open} onClose={close} title="Refund order #1038"
  primaryAction={{ content: 'Refund $49.98', destructive: true, onAction: refund }}
  secondaryActions={[{ content: 'Cancel', onAction: close }]}
  footer={<Text tone="subdued">Fees are not returned.</Text>} size="small" pauseGame>
  <Modal.Section>…</Modal.Section>
  <Modal.Section subdued>…</Modal.Section>
</Modal>

<Tooltip content="Sessions that ended in an order"><Text as="span">Conversion rate</Text></Tooltip>
<Tooltip content={definition} hasUnderline width="wide">Total sales</Tooltip>   // dotted metric title
```

### Navigation, tables, save bar

```tsx
<Tabs tabs={[{ id: 'all', content: 'All' }, { id: 'unf', content: 'Unfulfilled', badge: 9 }]} selected={i} onSelect={setI} />
<Tabs variant="underline" … />

<Card padding="0">
  <IndexFilters
    tabs={views} selected={view} onSelect={setView}
    queryValue={q} onQueryChange={setQ} queryPlaceholder="Searching all orders"
    sortOptions={[{ label: 'Date', value: 'date', directionLabels: ['Oldest to newest', 'Newest to oldest'] }]}
    sortSelected={sort} onSortChange={(value, direction) => setSort({ value, direction })}
  />
  <IndexTable
    rows={orders}
    rowKey={o => o.id}
    resourceName={{ singular: 'order', plural: 'orders' }}
    columns={[
      { id: 'num', title: 'Order', render: o => <Text as="span" fontWeight="semibold">#{o.number}</Text>, sortValue: o => o.number },
      { id: 'total', title: 'Total', numeric: true, render: o => <Money amount={o.total} />, sortValue: o => o.total },
      { id: 'pay', title: 'Payment status', render: o => <Badge progress="complete">Paid</Badge> },
    ]}
    selectedIds={sel} onSelectionChange={setSel}                     // shift-click selects ranges
    promotedBulkActions={[{ content: 'Mark as fulfilled', onAction: ids => fulfill(ids) }]}
    bulkActions={[{ content: 'Archive', onAction: ids => archive(ids) }]}
    onRowClick={o => navigate(`orders/${o.id}`)}
    defaultSort={{ columnId: 'num', direction: 'descending' }}
    pageSize={50}
    emptyState={<EmptyState heading="No orders" image="orders" compact />}
  />
</Card>

<DataTable
  columnContentTypes={['text', 'numeric', 'numeric']}
  headings={['Product', 'Orders', 'Net sales']}
  rows={[['Pet Hair Roller', 214, '$5,346.86']]}      // strings like "$1,234" / "12%" sort numerically
  totals={['', 214, '$5,346.86']} showTotalsInFooter
  sortable={[false, true, true]} initialSortColumnIndex={2}
/>

<ContextualSaveBar
  visible={dirty}
  message="Unsaved product"
  saveAction={{ onAction: save, loading: saving }}
  discardAction={{ onAction: discard }}
  placement="overlay"   // over the admin top bar (container must be position: relative); or 'sticky' | 'fixed' | 'inline'
/>
<Pagination hasPrevious hasNext onPrevious={prev} onNext={next} label="1–50 of 213" />
```

### Dates

```tsx
const [range, setRange] = useDateRangeState(today, 'last30', 'shop')
const [cmp, setCmp] = useState<ComparisonMode>('previous_period')
<DateRangePicker value={range} onChange={setRange} today={today} />          // presets + Starting/Ending + 2 months
<ComparisonPicker value={cmp} onChange={setCmp} range={range.range} />       // "Compare to: Feb 28 – Mar 29, 2026"
```

### Rich text (product descriptions)

```tsx
const stats = richTextStats(html)
<RichTextEditor
  label="Description"
  value={html}
  onChange={setHtml}             // always sanitized: p, h3, ul, ol, li, strong, em, u, br
  footer={<><span>{stats.words} words</span><span>{stats.bullets} bullets</span></>}   // copywriting L2 meter
  toolbarExtra={copywriterHired && <Button size="slim" icon={Sparkles}>Rewrite with copywriter</Button>}
/>

sanitizeRichText(pastedHtml)      // Docs/web paste → safe subset
plainToRichText(supplierText)     // "- bullet" lines → <ul>, blank lines → <p>
richTextToPlain(html)             // for similarity checks / word counts
richTextStats(html)               // { words, chars, paragraphs, bullets, headings, lists }
```

---

## Ads Manager (`kit/adsmanager`): Fadbook + TikTak

Wrap the site once. Every `am-` component reads the theme from context (or takes `theme`).

```tsx
<AmThemeProvider theme="fadbook">…</AmThemeProvider>   // Meta look: #0866ff blue, green Create, gray canvas
<AmThemeProvider theme="tiktak">…</AmThemeProvider>    // TikTok look: #00b2b4 teal, pink accents, underline tabs
```

### The table

```tsx
const [sel, setSel] = useState<string[]>([])
<EntityTabs
  tabs={[
    { id: 'campaign', label: 'Campaigns', selectedCount: sel.length, onClearSelection: () => setSel([]) },
    { id: 'adset', label: sel.length ? 'Ad sets for 1 Campaign' : 'Ad sets' },
    { id: 'ad', label: 'Ads', count: ads.length },          // count shown on TikTak
  ]}
  active={level} onChange={setLevel}
/>                                                          // entityTabLabels(theme) → Campaigns/Ad sets/Ads vs Campaign/Ad group/Ad
<AmTable
  attachedTop                                               // flush under EntityTabs (Fadbook)
  rows={campaigns}
  rowKey={c => c.id}
  entityName={{ singular: 'campaign', plural: 'campaigns' }}   // footer: "Results from 6 campaigns"
  selectedIds={sel} onSelectionChange={setSel}
  toggle={{ isOn: c => c.status === 'active', onChange: (c, on) => setStatus(c.id, on), disabled: c => c.rejected }}
  defaultSort={{ columnId: 'spend', direction: 'desc' }}
  subRows={breakdown === 'day' ? c => dailyRows(c) : undefined}  // breakdown rows reuse the column renderers
  rowMuted={c => c.status !== 'active'}
  columns={[
    {
      id: 'name', header: 'Campaign', width: 280, sticky: true, sortValue: c => c.name,
      render: c => <AmNameCell name={c.name} sub={c.bidLabel} onClick={() => drill(c)} />,
      hoverActions: c => [{ label: 'View charts', icon: ChartColumn, onClick: … }, { label: 'Edit', icon: Pencil, onClick: … }],
    },
    { id: 'delivery', header: 'Delivery', width: 150, render: c => <StatusCell label="Learning" detail="31 of 50 conversions" progress={0.62} /> },
    { id: 'budget', header: 'Budget', align: 'right', render: c => <BudgetCell amount={c.budget} editable level="campaign" onChange={b => setBudget(c.id, b)} /> },
    {
      id: 'results', header: 'Results', align: 'right', headerTip: 'Purchases attributed to the ad…',
      render: c => <MetricCell value={amFmt.int(c.purchases)} sub="Website purchases" />, sortValue: c => c.purchases,
      total: rows => <MetricCell value={amFmt.int(sum(rows, 'purchases'))} sub="Website purchases" />,
    },
    { id: 'cpr', header: 'Cost per result', align: 'right', render: c => <MetricCell value={amFmt.ratio(c.spend, c.purchases, amFmt.money)} sub="Per purchase" /> },
  ]}
/>
```

Column headers are sortable and resizable (drag the right edge). Formatters: `amFmt.money / money0 / int / pct / roas / freq / secs / compact / ratio(a, b, f)`, all returning "—" for missing values.
`StatusCell` derives the dot from the label ("Active", "Learning", "Learning limited", "Off", "In review", "Rejected", "Not delivering", "Account disabled"), or pass `tone`. `deliveryTone(label)` exposes the mapping.

### Budgets

```tsx
<BudgetCell amount={50} period="daily" editable onChange={setBudget} level="adset" />   // popover with % change, min & learning warnings
<BudgetCell amount={null} usingParent="campaign" />                                    // "Using campaign budget"
const check = checkBudgetEdit('tiktak', 50, 80, { level: 'adset' })   // { error?, warning?, change } for create/edit forms
minDailyBudget('tiktak', 'campaign')      // 50
learningResetThreshold('fadbook')         // 0.2
```

### Toolbar pickers

```tsx
const [range, setRange] = useDateRangeState(today, 'last7', 'ads')
<AmDateRangePicker value={range} onChange={setRange} today={today} />   // Today, Yesterday, Last 7/14/30 days, This month, Last month, Maximum

<ColumnsMenu
  presets={[{ id: 'performance', label: 'Performance', columns: [...] }, { id: 'ecom', label: 'Ecom custom', columns: [...], custom: true }]}
  allColumns={[{ id: 'ctr', label: 'CTR (link click-through rate)', category: 'Engagement', description: '…' }]}
  value={cols} onChange={setCols} locked={['delivery']}
  onSavePreset={(name, columns) => savePreset(name, columns)}   // return the new preset id to select it
  onDeletePreset={id => deletePreset(id)}
/>

<BreakdownMenu value={breakdown} onChange={setBreakdown}
  sections={[{ title: 'By time', items: [{ id: 'day', label: 'Day' }] },
             { title: 'By delivery', items: [{ id: 'age', label: 'Age', disabled: lvl < 3, disabledReason: 'Unlocks at Media buying level 3' }] }]} />
```

### Controls

```tsx
<AmButton variant="create" icon={Plus}>Create</AmButton>          // primary | secondary | create | tertiary | danger | link
<AmButton caret>Reports</AmButton>
<AmButton size="sm" loading>Publishing</AmButton>
<AmButtonGroup><AmButton pressed>Table</AmButton><AmButton>Charts</AmButton></AmButtonGroup>
<Toggle checked={on} onChange={setOn} />                          // blue (Fadbook) / teal (TikTak)
<Toggle checked label="Advantage+ placements" busy={saving} />
<AmCheckbox checked={adv} onChange={setAdv} label="Advantage+ audience" description="…" />
<AmRadio checked={loc === 'web'} onChange={() => setLoc('web')} label="Website" />
<AmRadioCard checked={obj === 'sales'} onSelect={() => setObj('sales')} icon={ShoppingBag} title="Sales"
  description="Find people likely to purchase" badge={<AmTag tone="primary">Recommended</AmTag>} />
<AmRadioCard checked={false} title="Traffic" disabled disabledReason="Optimizes for clicks, not buyers" />
<AmField label="Daily budget" labelTip="Average spend per day" warning={check.warning} error={check.error} help="Minimum $20.00">
  <AmInput value={b} onChange={setB} type="currency" prefix="$" suffix="USD" />
</AmField>
<AmInput value={text} onChange={setText} rows={4} maxLength={125} />   // textarea
<AmSearch value={q} onChange={setQ} placeholder="Search by name or ID" />
<AmSelect value={bid} onChange={setBid} options={[{ value: 'lowest', label: 'Highest volume', description: '…' },
  { value: 'costcap', label: 'Cost per result goal', disabled: lvl < 3, disabledReason: 'Unlocks at Media buying level 3' }]} />
<AmSegmented value={period} onChange={setPeriod} options={[{ value: 'daily', label: 'Daily' }, { value: 'lifetime', label: 'Lifetime' }]} />
<AmTag tone="green" onRemove={remove}>Dog owners</AmTag>        // neutral | blue | green | red | yellow | teal | pink | primary
<AmNotice tone="warning" title="Learning limited" actions={<AmButton size="sm">Combine ad sets</AmButton>}>Not enough conversions.</AmNotice>
<AmCard title="Budget & schedule" titleTip="…" collapsible>…</AmCard>
<AmTooltip content="Why this is disabled"><AmButton disabled>A/B test</AmButton></AmTooltip>
<InfoTip content="Hook rate = 3-second video plays ÷ impressions" />
<AmSpinner size={20} />
```

### Overlays & flow

```tsx
<AmMenu trigger={<AmButton caret>Rules</AmButton>} items={[{ id: 'new', label: 'Create new rule', onSelect: … }]} />
<AmModal open={open} onClose={close} title="Choose a campaign objective" size="lg"
  footer={<><AmButton onClick={close}>Cancel</AmButton><AmButton variant="primary" onClick={next}>Continue</AmButton></>}>…</AmModal>
<SideDrawer open={!!editing} onClose={() => setEditing(null)} title={editing?.name} subtitle="Campaign ID 238104…"
  tabs={[{ id: 'edit', label: 'Edit' }, { id: 'charts', label: 'Charts' }]} activeTab={tab} onTabChange={setTab}
  footer={<AmButton variant="create" onClick={publish}>Publish</AmButton>} footerLeft="Draft saved" pauseGame>…</SideDrawer>
<Stepper steps={[{ id: 'c', label: 'New Sales campaign' }, { id: 's', label: 'New ad set', level: 1, status: 'warning' }, { id: 'a', label: 'New ad', level: 2 }]}
  current={step} onStepClick={setStep} />                         // orientation="horizontal" for TikTak
<AudienceGauge estimate={[185_300_000, 218_000_000]} note="Estimates may vary." />   // semicircle (Fadbook) / bar (TikTak)
```

Aliases: `DateRangePicker` = `AmDateRangePicker`, `Tabs` = `EntityTabs`, `Tooltip` = `AmTooltip` (import from the adsmanager barrel).

---

## Phone (`kit/phone`)

```tsx
<AdPreview
  platform="tiktak"                         // 'tiktak' | 'fadbook-reels' | 'fadbook-feed'
  productImage={productImage(c.catalogId)}  // or creative.thumb; falls back to a branded tile
  hookText={c.hookText}
  caption="No refills, no batteries. 30-day guarantee #cleantok"
  script={c.script}                         // becomes auto-captions (or pass subtitles={[…]})
  brandName={store.name}
  cta="Shop now"
  likes={18400} comments={312} shares={1240}
  isVideo={c.isVideo} durationSec={c.durationSec}   // Ken Burns + progress bar + captions, all CSS
  width={280}                                // rendered width; everything scales from a 360×780 design
/>
<AdPreview platform="fadbook-feed" … headline="Pet Hair Remover — 40% Off" linkDescription="Free shipping" domain="furfree.com" />
<AdPreview platform="tiktak" … frame={false} width={150} playing={inView} />   // Mineo grid card; playing={false} freezes motion

<PhoneMockup width={260} statusBar="dark" frame="silver" screenBg="#fff">{/* any 360×780 screen */}</PhoneMockup>
<ScaleBox designWidth={360} designHeight={780} width={180}>…</ScaleBox>
subtitleChunks(script)   // ["I tried every lint", "roller.", …]
```

---

## Charts (`kit/charts`)

Shopify analytics look: current period solid `#2c6ecb`, comparison dashed `#9ec3f2`, hairline gridlines, one y-axis,
crosshair tooltips, animations off (the game re-renders every tick). Categorical colors come from `SERIES_COLORS` in a
fixed order that passed the palette validator (assign by entity, never by rank).

```tsx
<LineChartCard
  title="Total sales" titleTip="Gross sales minus discounts and returns…"
  format="money"                             // money | money0 | number | percent | percent1 | decimal | roas | (v) => string
  data={days.map(d => ({ label: 'Mar 5', value: 120.5, compare: 88, compareLabel: 'Feb 3' }))}
  currentLabel="Mar 1–30, 2026" compareLabel="Jan 30–Feb 28, 2026"
  action={<Link onClick={openReport}>View report</Link>}
/>
<LineChartCard title="Cost per purchase" format="money" invertDelta value={24.18} comparisonValue={29.9}
  referenceLines={[{ value: breakEvenCpa, label: `Break-even CPA ${money(breakEvenCpa)}`, color: CHART_COLORS.critical }]}
  color={CHART_COLORS.fadbook} data={…} />
<TrendChart data={rows} xKey="label" format="roas"
  series={[{ key: 'fadbook', label: 'Fadbook', color: CHART_COLORS.fadbook }, { key: 'tiktak', label: 'TikTak', color: CHART_COLORS.tiktak }]}
  referenceLines={[{ value: 1.85, label: 'Break-even 1.85' }]} height={220} />
<Sparkline data={last14} compare={prev14} width={80} height={28} />
<BarChart data={[{ label: 'Apr 20', value: 13 }]} height={200} />                          // vertical columns
<BarChart orientation="horizontal" showShare data={[{ label: 'Mobile', value: 4212, compare: 3610 }]} />
<DonutChart format="money0" centerLabel="Total sales" data={[{ label: 'Fadbook', value: 6120 }, { label: 'TikTak', value: 3480 }]} />
<FunnelBars steps={[{ label: 'Sessions', value: 5398 }, { label: 'Added to cart', value: 402 },
  { label: 'Reached checkout', value: 219 }, { label: 'Sessions converted', value: 125 }]} />   // variant="rows" for a compact list
<GaugeRing value={grade.score} sublabel="Page grade" />                  // red < 50 ≤ amber < 70 ≤ green, number always shown
<DeltaBadge cur={thisWeek} prev={lastWeek} invert={false} />
formatValue(0.0231, 'percent')  // "2.31%"
```
