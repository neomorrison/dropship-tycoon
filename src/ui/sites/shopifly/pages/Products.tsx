// Shopifly › Products: IndexTable of store products with view tabs, search, sort,
// bulk status changes, and an "Import" list of AliExprez favorites (DSerz import).
import { useMemo, useState } from 'react'
import { Download, ExternalLink, Plus } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { StoreProduct } from '../../../../core/types'
import { act, useGS } from '../../../../core/store'
import { openSite } from '../../../../core/ui'
import { productImage } from '../../../../core/assets'
import { money, num } from '../../../../core/format'
import { dayOf } from '../../../../core/time'
import { deleteProduct, importProduct, setProductStatus, storeRange } from '../../../../sim/store'
import { getProduct, publicListing } from '../../../../sim/market'
import {
  Badge, BlockStack, Button, Card, EmptyState, IndexFilters, IndexTable, InlineStack, Modal, Page, Text, Thumbnail,
  type IndexTableColumn, type SortDirection,
} from '../../../kit/polaris'
import { gradeColor } from '../merch/GradeCard'
import '../merch/merch.css'

const VIEWS = ['all', 'active', 'draft', 'archived'] as const
const STATUS: Record<StoreProduct['status'], { tone: 'success' | 'info' | 'read-only'; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  draft: { tone: 'info', label: 'Draft' },
  archived: { tone: 'read-only', label: 'Archived' },
}

interface Row {
  p: StoreProduct
  sales30: number
  orders30: number
  stock: number | null
}

export default function Products({ navigate }: ShopiflyPageProps) {
  const s = useGS(st => st)
  const products = s.store.products
  const [view, setView] = useState(0)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ value: string; direction: SortDirection }>({ value: 'created', direction: 'descending' })
  const [sel, setSel] = useState<string[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)

  const today = dayOf(s.time.hour)
  const r30 = useMemo(() => storeRange(s, { from: today - 29, to: today }), [s.store.analytics.daily, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const v = VIEWS[view]
    const order = new Map(products.map((p, i) => [p.id, i]))
    const list = products
      .filter(p => v === 'all' || p.status === v)
      .filter(p => !q || p.title.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q)) || p.productType.toLowerCase().includes(q))
      .map(p => {
        const bp = r30.byProduct[p.id]
        const sourcing = s.catalog.sourcing[p.catalogId]
        const threePl = sourcing?.mode === 'bulk' || sourcing?.mode === 'private_label'
        return { p, sales30: bp?.sales ?? 0, orders30: bp?.orders ?? 0, stock: threePl ? s.catalog.inventory[p.catalogId]?.units ?? 0 : null }
      })
    const dir = sort.direction === 'ascending' ? 1 : -1
    const key = (x: Row): number | string => {
      switch (sort.value) {
        case 'title': return x.p.title.toLowerCase()
        case 'price': return x.p.price
        case 'grade': return x.p.grade?.score ?? 0
        case 'sales': return x.sales30
        default: return order.get(x.p.id) ?? 0
      }
    }
    return [...list].sort((a, b) => {
      const ka = key(a)
      const kb = key(b)
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir
    })
  }, [products, query, view, sort, r30, s.catalog.sourcing, s.catalog.inventory])

  const counts = { all: products.length, active: 0, draft: 0, archived: 0 }
  for (const p of products) counts[p.status]++

  const columns: IndexTableColumn<Row>[] = [
    {
      id: 'product', title: 'Product', sortValue: r => r.p.title.toLowerCase(), minWidth: 220, width: 260,
      render: r => (
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <Thumbnail source={r.p.media[0]?.src || productImage(r.p.catalogId)} alt={r.p.title} size="small" />
          <span className="sf-mx-celltitle" title={r.p.title}>{r.p.title || 'Untitled product'}</span>
        </InlineStack>
      ),
    },
    { id: 'status', title: 'Status', render: r => <Badge tone={STATUS[r.p.status].tone}>{STATUS[r.p.status].label}</Badge>, sortValue: r => r.p.status },
    {
      id: 'inventory', title: 'Inventory', nowrap: true,
      render: r => r.stock == null
        ? <Text as="span" tone="subdued">{r.p.trackInventory ? 'Supplier stock' : 'Inventory not tracked'}</Text>
        : <Text as="span" tone={r.stock === 0 ? 'critical' : undefined}>{num(r.stock)} in stock</Text>,
      sortValue: r => r.stock ?? -1,
    },
    { id: 'price', title: 'Price', numeric: true, render: r => money(r.p.price), sortValue: r => r.p.price },
    {
      id: 'grade', title: 'Grade', numeric: true, tooltip: 'Page grade: how well the product page is built to convert (0–100).',
      render: r => r.p.grade ? (
        <span className="sf-mx-gradecell"><span className="sf-mx-gradedot" style={{ background: gradeColor(r.p.grade.score) }} />{Math.round(r.p.grade.score)}</span>
      ) : '—',
      sortValue: r => r.p.grade?.score ?? 0,
    },
    {
      id: 'sales', title: 'Sales (30d)', numeric: true, nowrap: true, sortValue: r => r.sales30,
      render: r => (r.orders30 ? (
        <BlockStack gap="0" inlineAlign="end">
          <Text as="span" numeric>{money(r.sales30, { cents: false })}</Text>
          <Text as="span" tone="subdued" variant="bodySm">{num(r.orders30)} order{r.orders30 === 1 ? '' : 's'}</Text>
        </BlockStack>
      ) : <Text as="span" tone="subdued">—</Text>),
    },
    { id: 'type', title: 'Type', render: r => r.p.productType || <Text as="span" tone="subdued">—</Text> },
    { id: 'vendor', title: 'Vendor', width: 130, render: r => <span className="sf-mx-cellclip" title={r.p.vendor}>{r.p.vendor || '—'}</span> },
  ]

  const bulkStatus = (status: StoreProduct['status']) => (ids: string[]) => {
    act(st => { for (const id of ids) setProductStatus(st, id, status) })
    setSel([])
  }

  return (
    <div className="sf-mx-page">
      <Page
        title="Products"
        primaryAction={{ content: 'Add product', icon: Plus, onAction: () => openSite('aliexprez', '') }}
        secondaryActions={[
          { content: 'Import', icon: Download, onAction: () => setImportOpen(true) },
          { content: 'Find products', icon: ExternalLink, onAction: () => openSite('aliexprez', '') },
        ]}
        fullWidth={false}
      >
        {products.length === 0 ? (
          <Card>
            <EmptyState
              heading="Add your products"
              image="products"
              action={{ content: 'Find products on AliExprez', onAction: () => openSite('aliexprez', '') }}
              secondaryAction={{ content: 'Import from favorites', onAction: () => setImportOpen(true) }}
            >
              Research products on AliExprez, then import the winners with DSerz. You&apos;ll rewrite the page before it goes live.
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexFilters
              tabs={VIEWS.map(v => ({ id: v, content: v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1), badge: v === 'all' ? undefined : counts[v] || undefined }))}
              selected={view}
              onSelect={i => { setView(i); setSel([]) }}
              queryValue={query}
              onQueryChange={setQuery}
              queryPlaceholder="Searching all products"
              sortOptions={[
                { label: 'Product title', value: 'title', directionLabels: ['A–Z', 'Z–A'] },
                { label: 'Created', value: 'created', directionLabels: ['Oldest first', 'Newest first'] },
                { label: 'Price', value: 'price', directionLabels: ['Lowest first', 'Highest first'] },
                { label: 'Page grade', value: 'grade', directionLabels: ['Lowest first', 'Highest first'] },
                { label: 'Sales (30 days)', value: 'sales', directionLabels: ['Lowest first', 'Highest first'] },
              ]}
              sortSelected={sort}
              onSortChange={(value, direction) => setSort({ value, direction })}
            />
            <IndexTable
              rows={rows}
              rowKey={r => r.p.id}
              columns={columns}
              resourceName={{ singular: 'product', plural: 'products' }}
              selectedIds={sel}
              onSelectionChange={setSel}
              onRowClick={r => navigate(`products/${r.p.id}`)}
              promotedBulkActions={[
                { content: 'Set as active', onAction: bulkStatus('active') },
                { content: 'Set as draft', onAction: bulkStatus('draft') },
              ]}
              bulkActions={[
                { content: 'Archive products', onAction: bulkStatus('archived') },
                { content: 'Delete products', destructive: true, onAction: ids => setConfirmDelete(ids) },
              ]}
              pageSize={50}
              rowTone={r => (r.p.status === 'archived' ? 'subdued' : undefined)}
              emptyState={<EmptyState heading="No products found" image="search" compact>Try changing the filters or search term.</EmptyState>}
            />
          </Card>
        )}
      </Page>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={id => navigate(`products/${id}`)} />
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.length ?? 0} product${confirmDelete?.length === 1 ? '' : 's'}?`}
        size="small"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          onAction: () => {
            const ids = confirmDelete ?? []
            act(st => { for (const id of ids) deleteProduct(st, id) })
            setSel([])
            setConfirmDelete(null)
          },
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setConfirmDelete(null) }]}
      >
        <Modal.Section><Text as="p">This can&apos;t be undone.</Text></Modal.Section>
      </Modal>
    </div>
  )
}

/** DSerz-style import list: AliExprez favorites not yet in the store. */
function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (id: string) => void }) {
  const s = useGS(st => st)
  const imported = new Set(s.store.products.map(p => p.catalogId))
  const favs = s.catalog.favorites.filter(id => s.catalog.available.includes(id))
  return (
    <Modal open={open} onClose={onClose} title="Import from AliExprez" size="medium" secondaryActions={[{ content: 'Close', onAction: onClose }]}
      footer={<Button variant="plain" onClick={() => { onClose(); openSite('aliexprez', '') }}>Browse AliExprez</Button>}>
      <Modal.Section flush>
        {favs.length === 0 ? (
          <EmptyState heading="No saved products" image="products" compact action={{ content: 'Browse AliExprez', onAction: () => { onClose(); openSite('aliexprez', '') } }}>
            Tap ♡ on AliExprez listings to save them here, or use &quot;Add to Shopifly&quot; right on the product page.
          </EmptyState>
        ) : (
          <div className="sf-mx-importlist">
            {favs.map(id => {
              let title = id
              let price: number | null = null
              try {
                const d = getProduct(id)
                title = d.supplierTitle
                price = publicListing(s, id)?.price ?? d.cogs
              } catch { /* unknown catalog id */ }
              const done = imported.has(id)
              return (
                <div key={id} className="sf-mx-importrow">
                  <Thumbnail source={productImage(id)} alt={title} size="small" />
                  <BlockStack gap="050">
                    <Text as="p" truncate>{title}</Text>
                    {price != null && <Text as="p" tone="subdued" variant="bodySm">Supplier price US {money(price)}</Text>}
                  </BlockStack>
                  {done ? (
                    <Badge>Imported</Badge>
                  ) : (
                    <Button
                      size="slim"
                      onClick={() => {
                        let newId = ''
                        act(st => { newId = importProduct(st, id) })
                        if (newId) {
                          onClose()
                          onImported(newId)
                        }
                      }}
                    >
                      Import
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Modal.Section>
    </Modal>
  )
}
