// Shopifly product editor — the most important screen in the game. A faithful product
// page editor (title, description, media, pricing, inventory, shipping, variants, search
// listing, status/publishing/organization) plus the game's Page grade and Break-even
// cards, graded live against the unsaved draft. Saving calls updateProduct (copywriting XP
// when the grade improves) and setProductStatus.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Eye, LayoutTemplate, Plus, Sparkles, Trash2, X } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { StoreProduct } from '../../../../core/types'
import { act, getGS, useGS } from '../../../../core/store'
import { openSite, usePauseWhileMounted } from '../../../../core/ui'
import { money, pct } from '../../../../core/format'
import { formatDate } from '../../../../core/time'
import { sectionSettings } from '../../../../data/sections'
import { breakEven, deleteProduct, gradePage, realDeliveryWindow, setProductStatus, updateProduct } from '../../../../sim/store'
import { fulfillmentFor } from '../../../../sim/market'
import { copywriterQuality, hasCopywriter, skillLevel, staffByRole } from '../../../../sim/life'
import {
  Badge, Banner, BlockStack, Box, Button, Card, Checkbox, Divider, EmptyState, InlineGrid, InlineStack, Layout,
  Link, Modal, Page, RichTextEditor, Select, TagsInput, Text, TextField, richTextToPlain,
} from '../../../kit/polaris'
import { Stars } from '../../../kit/common'
import { catalogDef, withOverrides } from '../../storefront'
import {
  applyDraft, convertWeight, draftKey, draftPatch, moneyInput, parseNum, slugHandle, toDraft, WEIGHT_UNITS, type ProductDraft, type WeightUnit,
} from '../merch/draft'
import { PageGradeCard } from '../merch/GradeCard'
import { BreakEvenCard, InsightsCard } from '../merch/EconomicsCards'
import { CopyHelpers } from '../merch/CopyHelpers'
import { MediaCard } from '../merch/MediaCard'
import { SectionsCard } from '../merch/SectionsCard'
import { addSection, setDeliveryWindow, setSectionSettings } from '../merch/sectionOps'
import { copywriterRewrite } from '../merch/copywriter'
import { AdminSaveBar, ImportReviewsModal, installedReviewApp, useFlash, useLeaveGuard } from '../merch/shared'
import '../merch/merch.css'

const STATUS_BADGE: Record<StoreProduct['status'], { tone: 'success' | 'info' | 'read-only'; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  draft: { tone: 'info', label: 'Draft' },
  archived: { tone: 'read-only', label: 'Archived' },
}

export default function ProductEditor({ params, navigate }: ShopiflyPageProps) {
  const id = params[0]
  const s = useGS(st => st)
  const product = s.store.products.find(p => p.id === id)
  if (!product) {
    return (
      <Page backAction={{ content: 'Products', onAction: () => navigate('products') }} title="Product not found">
        <Card>
          <EmptyState heading="This product doesn't exist" image="products" action={{ content: 'Back to products', onAction: () => navigate('products') }}>
            It may have been deleted.
          </EmptyState>
        </Card>
      </Page>
    )
  }
  return <Editor key={product.id} product={product} navigate={navigate} />
}

function Editor({ product, navigate }: { product: StoreProduct; navigate: (path: string) => void }) {
  usePauseWhileMounted('shopifly-product-editor')
  const s = useGS(st => st)
  const [draft, setDraft] = useState<ProductDraft>(() => toDraft(product))
  const base = useMemo(() => toDraft(product, draft.weightUnit), [product, draft.weightUnit])
  const dirty = draftKey(draft) !== draftKey(base)
  const { guard, modal: leaveModal } = useLeaveGuard(dirty)
  const [flash, showFlash] = useFlash()
  const [seoOpen, setSeoOpen] = useState(false)
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rewrite, setRewrite] = useState<{ n: number; answered: number; total: number } | null>(null)
  const [saving, setSaving] = useState(false)
  // bumped on save/discard so per-card UI state (media selection, open pickers) starts fresh
  const [formKey, setFormKey] = useState(0)

  const def = useMemo(() => catalogDef(product.catalogId), [product.catalogId])
  const preview = useMemo(() => applyDraft(product, draft), [product, draft])
  const ps = useMemo(() => withOverrides(s, { product: preview }), [s, preview])
  const grade = useMemo(() => gradePage(ps, preview), [ps, preview])
  const copyLevel = skillLevel(s, 'copywriting')
  const creatives = useMemo(() => s.creatives.creatives.filter(c => c.catalogId === product.catalogId && c.status === 'ready'), [s.creatives.creatives, product.catalogId])
  const realWindow = useMemo(() => realDeliveryWindow(s, product.catalogId), [s, product.catalogId])
  const ful = useMemo(() => fulfillmentFor(s, product.catalogId), [s, product.catalogId])
  // same landed cost as the Break-even card (3PL orders pay pick & pack + postage instead of supplier shipping)
  const landed = useMemo(() => {
    const total = breakEven(ps, product.id).landedCost
    const unit = Math.min(total, ful.unitCost)
    return { total, unit, ship: Math.max(0, total - unit) }
  }, [ps, product.id, ful.unitCost])
  const domain = s.store.customDomain ?? s.store.subdomain

  // keep the editor in sync when the product changes elsewhere (status set from the list, an archive
  // action, a save): fields the player hasn't touched take the new value, their edits are kept
  const prevProduct = useRef(product)
  useEffect(() => {
    const before = prevProduct.current
    prevProduct.current = product
    if (before === product) return
    setDraft(d => {
      const oldBase = toDraft(before, d.weightUnit)
      const newBase = toDraft(product, d.weightUnit)
      const next = { ...d } as Record<string, unknown>
      for (const k of Object.keys(newBase) as (keyof ProductDraft)[]) {
        if (JSON.stringify(d[k]) === JSON.stringify(oldBase[k])) next[k] = newBase[k]
      }
      return next as unknown as ProductDraft
    })
  }, [product])

  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => setDraft(d => ({ ...d, [k]: v }))

  const save = () => {
    if (!draft.title.trim()) {
      showFlash('Title can\'t be blank', 'critical')
      return
    }
    // never save a typo as $0.00
    const invalid = priceError ?? capError ?? costError
    if (invalid) {
      showFlash(invalid, 'critical')
      return
    }
    setSaving(true)
    const before = product.grade?.score ?? null
    act(st => {
      updateProduct(st, product.id, draftPatch(draft))
      if (draft.status !== product.status) setProductStatus(st, product.id, draft.status)
    })
    const np = getGS().store.products.find(p => p.id === product.id)
    if (np) setDraft(toDraft(np, draft.weightUnit))
    setSaving(false)
    setRewrite(null)
    setFormKey(k => k + 1)
    const after = np?.grade?.score
    if (np && draft.status !== np.status) showFlash('Saved. The product couldn\'t go live yet', 'critical')
    else if (before != null && after != null && Math.round(after) !== Math.round(before)) showFlash(`Product saved · page grade ${Math.round(before)} → ${Math.round(after)}`)
    else showFlash('Product saved')
  }
  const discard = () => {
    setDraft(toDraft(product, draft.weightUnit))
    setRewrite(null)
    setFormKey(k => k + 1)
  }

  // ---- copywriter ----
  const copywriter = hasCopywriter(s) ? staffByRole(s, 'copywriter').sort((a, b) => b.skill - a.skill)[0] : null
  const doRewrite = () => {
    if (!def || !copywriter) return
    const n = (rewrite?.n ?? 0) + 1
    const cw = copywriterRewrite(def, { quality: copywriterQuality(s), revision: n, window: realWindow, freeShip: s.store.shipping.freeShipping })
    setDraft(d => {
      const withFaq = addSection(d.sections, 'faq')
      return {
        ...d,
        title: cw.title,
        descriptionHtml: cw.descriptionHtml,
        seo: cw.seo,
        sections: setSectionSettings(withFaq, 'faq', { items: cw.faq }),
      }
    })
    setRewrite({ n, answered: cw.answered, total: cw.total })
  }

  // ---- pricing readouts ----
  const price = parseNum(draft.price) ?? 0
  const cost = parseNum(draft.costPerItem) ?? 0
  const cap = parseNum(draft.compareAtPrice)
  const profit = price - cost
  const margin = price > 0 ? profit / price : 0
  const moneyError = (v: string, what: string) => {
    if (!v.trim()) return undefined
    const n = parseNum(v)
    return n == null ? `Enter a valid ${what}` : n < 0 ? `${what.charAt(0).toUpperCase()}${what.slice(1)} can't be negative` : undefined
  }
  // a blank or $0 price would put the product on sale for free: always ask for one
  const priceError = !draft.price.trim() ? 'Enter a price' : moneyError(draft.price, 'price') ?? ((parseNum(draft.price) ?? 0) <= 0 ? 'Price must be more than $0.00' : undefined)
  const capError = moneyError(draft.compareAtPrice, 'compare-at price')
  const costError = moneyError(draft.costPerItem, 'cost')
  const capWarn = cap != null && cap > 0 && cap <= price ? 'Compare-at price should be higher than the price' : undefined

  // ---- delivery promise (shipping section) ----
  const shipSec = draft.sections.find(x => x.id === 'shipping_info')
  const shipSettings = sectionSettings('shipping_info', shipSec?.settings)
  const promiseMin = shipSec?.enabled && shipSettings.minDays != null ? String(shipSettings.minDays) : ''
  const promiseMax = shipSec?.enabled && shipSettings.maxDays != null ? String(shipSettings.maxDays) : ''
  const setPromise = (minS: string, maxS: string) => {
    const toN = (v: string) => (v.trim() && Number(v) > 0 ? Math.min(120, Math.round(Number(v))) : null)
    setDraft(d => ({ ...d, sections: setDeliveryWindow(d.sections, toN(minS), toN(maxS)) }))
  }

  // ---- variants ----
  const setVariant = (i: number, v: { name: string; values: string[] }) => set('variants', draft.variants.map((x, j) => (j === i ? v : x)))
  const variantCount = draft.variants.filter(v => v.name.trim() && v.values.length).reduce((a, v) => a * v.values.length, 1)
  const hasOptions = draft.variants.some(v => v.name.trim() && v.values.length)

  // ---- navigation ----
  // prev/next follow the Products list's default order (newest first)
  const list = useMemo(() => [...s.store.products].reverse(), [s.store.products])
  const idx = list.findIndex(p => p.id === product.id)
  const prev = idx > 0 ? list[idx - 1] : null
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null
  const goEditor = () => guard(() => navigate(`online-store/editor/product/${product.id}`))

  const reviewApp = installedReviewApp(s)
  const channels = [
    { name: 'Online Store', on: true },
    ...(s.store.apps.some(a => a.appId === 'fadbook-channel') ? [{ name: 'Fadbook & Instaglam', on: true }] : []),
    ...(s.store.apps.some(a => a.appId === 'tiktak-channel') ? [{ name: 'TikTak', on: true }] : []),
  ]
  const seoTitle = draft.seo.title.trim() || draft.title
  const seoDesc = draft.seo.description.trim() || richTextToPlain(draft.descriptionHtml).replace(/\s+/g, ' ').slice(0, 160)
  const handle = draft.seo.handle || slugHandle(draft.title)
  const settingsCtx = {
    realWindow,
    creatives: creatives.filter(c => c.producer !== 'supplier_edit').map(c => ({ id: c.id, name: c.name, producer: c.producer })),
    storeName: s.store.theme.logoText || s.store.name,
    freeOver: s.store.shipping.freeShipping ? null : s.store.shipping.freeOver,
    freeShipping: s.store.shipping.freeShipping,
  }
  const inv = s.catalog.inventory[product.catalogId]
  const threePl = ful.mode === 'bulk' || ful.mode === 'private_label'
  const hasDserz = s.store.apps.some(a => a.appId === 'dserz')

  return (
    <div className="sf-mx-page">
      <AdminSaveBar
        visible={dirty}
        message="Unsaved changes"
        saveAction={{ onAction: save, loading: saving, content: 'Save' }}
        discardAction={{ onAction: discard, content: 'Discard' }}
      />
      <Page
        backAction={{ content: 'Products', onAction: () => guard(() => navigate('products')) }}
        title={product.title || 'Untitled product'}
        titleMetadata={<Badge tone={STATUS_BADGE[product.status].tone}>{STATUS_BADGE[product.status].label}</Badge>}
        secondaryActions={[
          { content: 'Preview', icon: Eye, onAction: () => openSite('storefront', `products/${product.id}`) },
          { content: 'Customize page', icon: LayoutTemplate, onAction: goEditor },
        ]}
        actionGroups={[
          {
            title: 'More actions',
            actions: [
              // applied right away; the draft follows so a later Save doesn't undo it
              product.status === 'archived'
                ? { content: 'Unarchive product', icon: ArchiveRestore, onAction: () => { act(st => setProductStatus(st, product.id, 'draft')); set('status', 'draft') } }
                : { content: 'Archive product', icon: Archive, onAction: () => { act(st => setProductStatus(st, product.id, 'archived')); set('status', 'archived') } },
              { content: 'Delete product', icon: Trash2, destructive: true, onAction: () => setConfirmDelete(true) },
            ],
          },
        ]}
        pagination={{
          hasPrevious: !!prev,
          hasNext: !!next,
          onPrevious: () => prev && guard(() => navigate(`products/${prev.id}`)),
          onNext: () => next && guard(() => navigate(`products/${next.id}`)),
        }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {rewrite && copywriter && (
                <Banner
                  tone="info"
                  title={`${copywriter.name.split(' ')[0]} rewrote your title, description and FAQ`}
                  onDismiss={() => setRewrite(null)}
                  action={{ content: 'Try another version', onAction: doRewrite }}
                  secondaryAction={{ content: 'Discard rewrite', onAction: discard }}
                >
                  The draft answers {rewrite.answered} of {rewrite.total} common buyer questions. Review it, then save.
                </Banner>
              )}

              {/* ---- title & description ---- */}
              <Card>
                <BlockStack gap="400">
                  <TextField label="Title" value={draft.title} onChange={v => set('title', v)} placeholder="Short sleeve t-shirt" recommendedLength={70} error={!draft.title.trim() ? 'Title can\'t be blank' : undefined} />
                  <RichTextEditor
                    label="Description"
                    value={draft.descriptionHtml}
                    onChange={v => set('descriptionHtml', v)}
                    minHeight={220}
                    toolbarExtra={copywriter ? (
                      <Button size="slim" icon={Sparkles} onClick={doRewrite}>Rewrite with copywriter</Button>
                    ) : undefined}
                    footer={<CopyHelpers copy={grade.copy} level={copyLevel} html={draft.descriptionHtml} />}
                  />
                </BlockStack>
              </Card>

              <MediaCard key={formKey} media={draft.media} onChange={m => set('media', m)} product={product} creatives={creatives} supplierAlt={def?.name ?? product.title} />

              {/* ---- pricing ---- */}
              <Card title="Pricing">
                <BlockStack gap="400">
                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                    <TextField label="Price" type="currency" prefix="$" value={draft.price} onChange={v => set('price', v)} error={priceError} placeholder="0.00"
                      onBlur={() => { const n = parseNum(draft.price); if (n != null) set('price', moneyInput(n)) }} />
                    <TextField
                      label="Compare-at price"
                      type="currency"
                      prefix="$"
                      value={draft.compareAtPrice}
                      onChange={v => set('compareAtPrice', v)}
                      placeholder="0.00"
                      error={capError ?? capWarn}
                      helpText="Shown crossed out next to the price."
                      onBlur={() => { const n = parseNum(draft.compareAtPrice); if (n != null) set('compareAtPrice', n > 0 ? moneyInput(n) : '') }}
                    />
                  </InlineGrid>
                  <Divider />
                  <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                    <TextField label="Cost per item" type="currency" prefix="$" value={draft.costPerItem} onChange={v => set('costPerItem', v)} error={costError} helpText="Customers won't see this"
                      onBlur={() => { const n = parseNum(draft.costPerItem); if (n != null) set('costPerItem', moneyInput(n)) }} />
                    <TextField label="Profit" value={price > 0 ? money(profit) : '--'} readOnly />
                    <TextField label="Margin" value={price > 0 ? pct(margin, 1) : '--'} readOnly />
                  </InlineGrid>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Current cost: {money(landed.unit)} {threePl ? 'per unit landed in the US warehouse' : 'from the supplier incl. import duty'} + {money(landed.ship)} {threePl ? 'pick, pack & postage' : 'shipping'} per order.
                    {Math.abs(landed.total - cost) > 0.5 && (
                      <> <Link onClick={() => set('costPerItem', moneyInput(landed.total))}>Update cost per item</Link></>
                    )}
                  </Text>
                </BlockStack>
              </Card>

              {/* ---- inventory ---- */}
              <Card title="Inventory">
                <BlockStack gap="300">
                  <Checkbox label="Track quantity" checked={draft.trackInventory} onChange={v => set('trackInventory', v)} />
                  {threePl ? (
                    <InlineStack align="space-between">
                      <Text as="span">US warehouse (3PL)</Text>
                      <Text as="span" numeric fontWeight="semibold">{inv?.units ?? 0} available</Text>
                    </InlineStack>
                  ) : (
                    <Text as="p" tone="subdued">
                      Stock is held by your AliExprez supplier. Orders are {hasDserz ? 'placed with the supplier automatically by DSerz.' : 'fulfilled by hand until you install DSerz.'}
                    </Text>
                  )}
                  {!threePl && !hasDserz && (
                    <Banner tone="warning" inline action={{ content: 'Get DSerz', onAction: () => guard(() => navigate('apps/dserz')) }}>
                      Without a fulfillment app, every order waits in Orders until you click Fulfill.
                    </Banner>
                  )}
                </BlockStack>
              </Card>

              {/* ---- shipping ---- */}
              <Card title="Shipping">
                <BlockStack gap="400">
                  <Checkbox label="This is a physical product" checked disabled onChange={() => undefined} />
                  <div className="sf-mx-weight">
                    <TextField
                      label="Weight"
                      type="number"
                      min={0}
                      step={draft.weightUnit === 'g' ? 10 : 0.1}
                      value={draft.weight}
                      onChange={v => set('weight', v)}
                      connectedRight={<Select label="Weight unit" labelHidden options={WEIGHT_UNITS} value={draft.weightUnit} onChange={u => setDraft(d => convertWeight(d, u as WeightUnit))} />}
                    />
                  </div>
                  <Divider />
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Delivery estimate on the product page</Text>
                    <InlineStack gap="300" wrap={false}>
                      <TextField label="From" type="integer" suffix="days" value={promiseMin} onChange={v => setPromise(v, promiseMax)} placeholder="–" />
                      <TextField label="To" type="integer" suffix="days" value={promiseMax} onChange={v => setPromise(promiseMin, v)} placeholder="–" />
                    </InlineStack>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Orders currently arrive in {realWindow[0]}–{realWindow[1]} days ({threePl ? 'US warehouse' : ful.mode === 'agent' ? 'sourcing agent' : 'AliExprez supplier, incl. customs'}). The estimate shows as delivery dates next to the buy button.
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* ---- variants ---- */}
              <Card
                title="Variants"
                actions={def && def.variants.length > 0 ? (
                  <Button variant="plain" onClick={() => set('variants', def.variants.map(v => ({ name: v.name, values: [...v.values] })))}>Use supplier options</Button>
                ) : undefined}
              >
                <BlockStack gap="300">
                  {draft.variants.map((v, i) => (
                    <div key={i} className="sf-mx-option">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="span" variant="headingXs">Option {i + 1}</Text>
                        <Button variant="tertiary" size="micro" icon={X} accessibilityLabel="Remove option" onClick={() => set('variants', draft.variants.filter((_, j) => j !== i))} />
                      </InlineStack>
                      <TextField label="Option name" value={v.name} onChange={name => setVariant(i, { ...v, name })} placeholder="Size" />
                      <TagsInput label="Option values" tags={v.values} onChange={values => setVariant(i, { ...v, values })} placeholder="Add a value and press Enter" />
                    </div>
                  ))}
                  {draft.variants.length < 3 && (
                    <div>
                      <Button variant="plain" icon={Plus} onClick={() => set('variants', [...draft.variants, { name: '', values: [] }])}>
                        {draft.variants.length ? 'Add another option' : 'Add options like size or color'}
                      </Button>
                    </div>
                  )}
                  {hasOptions && <Text as="p" tone="subdued" variant="bodySm">{variantCount} variant{variantCount === 1 ? '' : 's'}</Text>}
                </BlockStack>
              </Card>

              <SectionsCard
                s={ps}
                product={preview}
                sections={draft.sections}
                onChange={sections => set('sections', sections)}
                ctx={settingsCtx}
                navigate={p => guard(() => navigate(p))}
                onOpenEditor={goEditor}
              />

              {/* ---- SEO ---- */}
              <Card title="Search engine listing" actions={<Button variant="plain" onClick={() => setSeoOpen(o => !o)}>{seoOpen ? 'Done' : 'Edit'}</Button>}>
                <BlockStack gap="300">
                  <div className="sf-mx-serp">
                    <p className="sf-mx-serp-site">{s.store.name}</p>
                    <p className="sf-mx-serp-url">https://{domain} › products › {handle}</p>
                    <p className="sf-mx-serp-title">{seoTitle || 'Untitled product'}</p>
                    <p className="sf-mx-serp-desc">{seoDesc || 'Add a description to see how this product might appear in a search engine listing.'}</p>
                    {price > 0 && <p className="sf-mx-serp-price">{money(price)} USD{product.reviews.count > 0 ? ` · ${product.reviews.avg.toFixed(1)}★ (${product.reviews.count})` : ''}</p>}
                  </div>
                  {seoOpen && (
                    <BlockStack gap="300">
                      <TextField label="Page title" value={draft.seo.title} onChange={t => set('seo', { ...draft.seo, title: t })} placeholder={draft.title} recommendedLength={70} />
                      <TextField label="Meta description" multiline={3} value={draft.seo.description} onChange={t => set('seo', { ...draft.seo, description: t })} recommendedLength={160} />
                      <TextField label="URL handle" prefix={`${domain}/products/`} value={draft.seo.handle} onChange={t => set('seo', { ...draft.seo, handle: t })} onBlur={() => set('seo', { ...draft.seo, handle: slugHandle(draft.seo.handle) })} />
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card title="Status">
                <BlockStack gap="200">
                  <Select
                    label="Status"
                    labelHidden
                    options={[{ label: 'Active', value: 'active' }, { label: 'Draft', value: 'draft' }, { label: 'Archived', value: 'archived' }]}
                    value={draft.status}
                    onChange={v => set('status', v as StoreProduct['status'])}
                  />
                  {draft.status === 'active' && product.status !== 'active' && grade.score < 45 && (
                    <Text as="p" tone="caution" variant="bodySm">This page grades {Math.round(grade.score)}/100. Paid traffic to a weak page burns money.</Text>
                  )}
                </BlockStack>
              </Card>

              {/* the game's skill check sits right under Status so it's in view while editing the title and copy */}
              <PageGradeCard grade={grade} savedScore={product.grade?.score ?? null} dirty={dirty} copyLevel={copyLevel} />
              <Card title="Publishing">
                <BlockStack gap="200">
                  <Text as="p" variant="headingXs" tone="subdued">Sales channels</Text>
                  {channels.map(c => (
                    <InlineStack key={c.name} gap="200" blockAlign="center">
                      <span className={`sf-mx-dot${draft.status === 'active' ? ' is-on' : ''}`} />
                      <Text as="span">{c.name}</Text>
                    </InlineStack>
                  ))}
                  {draft.status !== 'active' && <Text as="p" tone="subdued" variant="bodySm">Set the status to Active to publish on these channels.</Text>}
                  {product.publishedDay != null && <Text as="p" tone="subdued" variant="bodySm">First published {formatDate(product.publishedDay, 'short')}</Text>}
                </BlockStack>
              </Card>

              <Card title="Product organization">
                <BlockStack gap="300">
                  <TextField label="Type" value={draft.productType} onChange={v => set('productType', v)} placeholder={def ? def.niche.charAt(0).toUpperCase() + def.niche.slice(1) : 'e.g. Pet supplies'} />
                  <TextField label="Vendor" value={draft.vendor} onChange={v => set('vendor', v)} />
                  <TagsInput label="Tags" tags={draft.tags} onChange={t => set('tags', t)} suggestions={['best-seller', 'gift', 'new', 'sale', 'dserz']} />
                </BlockStack>
              </Card>

              <Card title="Reviews" actions={reviewApp ? <Button variant="plain" onClick={() => setReviewsOpen(true)}>Import</Button> : undefined}>
                {product.reviews.count > 0 ? (
                  <BlockStack gap="150">
                    <InlineStack gap="200" blockAlign="center">
                      <Stars rating={product.reviews.avg} size={14} />
                      <Text as="span" fontWeight="semibold">{product.reviews.avg.toFixed(2)}</Text>
                      <Text as="span" tone="subdued">({product.reviews.count} review{product.reviews.count === 1 ? '' : 's'})</Text>
                    </InlineStack>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {product.reviews.photos} with photos · {product.reviews.source === 'imported' ? 'imported from AliExprez' : 'from your customers'}
                    </Text>
                    {!draft.sections.some(x => x.id === 'reviews' && x.enabled) && (
                      <Button size="slim" onClick={() => set('sections', addSection(draft.sections, 'reviews'))}>Show reviews on page</Button>
                    )}
                  </BlockStack>
                ) : reviewApp ? (
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">No reviews yet.</Text>
                    <div><Button onClick={() => setReviewsOpen(true)}>Import from AliExprez</Button></div>
                  </BlockStack>
                ) : (
                  <BlockStack gap="200">
                    <Text as="p" tone="subdued">Install a reviews app to collect reviews and import them from your supplier.</Text>
                    <div><Button onClick={() => guard(() => navigate('apps'))}>Browse review apps</Button></div>
                  </BlockStack>
                )}
              </Card>

              <BreakEvenCard s={ps} product={preview} />
              <InsightsCard s={s} product={product} />
              <Box paddingBlock="200">
                <Text as="p" tone="subdued" variant="bodySm">Imported from AliExprez{def ? `: ${def.name}` : ''}.</Text>
              </Box>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>

      <ImportReviewsModal open={reviewsOpen} onClose={() => setReviewsOpen(false)} productId={product.id} />
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${product.title.slice(0, 60) || 'product'}?`}
        size="small"
        primaryAction={{
          content: 'Delete product',
          destructive: true,
          onAction: () => {
            setConfirmDelete(false)
            act(st => deleteProduct(st, product.id))
            navigate('products')
          },
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setConfirmDelete(false) }]}
      >
        <Modal.Section>
          <Text as="p">This can't be undone. Ads pointing at this product will stop getting sales.</Text>
        </Modal.Section>
      </Modal>
      {leaveModal}
      {flash}
    </div>
  )
}
