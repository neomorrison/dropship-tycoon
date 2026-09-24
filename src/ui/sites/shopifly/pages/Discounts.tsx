// Shopifly › Discounts: list (codes & automatic discounts with usage), a discount-type
// picker, and the create/edit form (discounts/new/<type>, discounts/<id>).
import { useMemo, useState } from 'react'
import { Gift, Layers, Percent, Truck } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { Discount } from '../../../../core/types'
import { act, getGS, useGS } from '../../../../core/store'
import { usePauseWhileMounted } from '../../../../core/ui'
import { money } from '../../../../core/format'
import { formatDate } from '../../../../core/time'
import { deleteDiscount, upsertDiscount } from '../../../../sim/store'
import {
  Badge, Banner, BlockStack, Card, ChoiceList, EmptyState, Icon, IndexFilters, IndexTable, InlineStack, Layout, Modal, Page,
  Select, Text, TextField, type IndexTableColumn,
} from '../../../kit/polaris'
import { AdminSaveBar, useFlash, useLeaveGuard } from '../merch/shared'
import '../merch/merch.css'

type Kind = Discount['kind']
const TYPE_LABEL: Record<Kind, string> = {
  percent: 'Amount off products', fixed: 'Amount off order', free_shipping: 'Free shipping', bxgy: 'Buy X get Y', quantity_break: 'Quantity discount',
}
const AUTO_ONLY: Kind[] = ['bxgy', 'quantity_break']
/** What the merchant named it: the title of an automatic discount, else the code. */
export const discountName = (d: Pick<Discount, 'code' | 'title' | 'automatic'>) => (d.automatic && d.title?.trim()) || d.code

export function discountSummary(d: Pick<Discount, 'kind' | 'value'>): string {
  switch (d.kind) {
    case 'percent': return `${d.value}% off all products`
    case 'fixed': return `${money(d.value)} off the order`
    case 'free_shipping': return 'Free shipping on all orders'
    case 'bxgy': return 'Buy 2, get 1 free'
    case 'quantity_break': return `${d.value}% off orders of 2 or more items`
  }
}

const TYPES: { kind: Kind; title: string; text: string; icon: typeof Percent }[] = [
  { kind: 'percent', title: 'Amount off products', text: 'Discount every product by a percentage.', icon: Percent },
  { kind: 'fixed', title: 'Amount off order', text: 'Take a fixed dollar amount off the order.', icon: Gift },
  { kind: 'quantity_break', title: 'Quantity discount', text: 'Percentage off when customers buy 2 or more.', icon: Layers },
  { kind: 'bxgy', title: 'Buy X get Y', text: 'Buy 2, get the third one free.', icon: Gift },
  { kind: 'free_shipping', title: 'Free shipping', text: 'Waive your shipping rate.', icon: Truck },
]

export default function Discounts({ params, navigate }: ShopiflyPageProps) {
  const [a, b] = params
  if (a === 'new') return <DiscountForm key={`new-${b}`} kind={(TYPES.some(t => t.kind === b) ? b : 'percent') as Kind} navigate={navigate} />
  if (a) return <DiscountForm key={a} id={a} navigate={navigate} />
  return <DiscountList navigate={navigate} />
}

function DiscountList({ navigate }: { navigate: (p: string) => void }) {
  const discounts = useGS(s => s.store.discounts)
  const shipping = useGS(s => s.store.shipping)
  const [view, setView] = useState(0)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [picker, setPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return discounts
      .filter(d => view === 0 || (view === 1 ? d.active : !d.active))
      .filter(d => !q || discountName(d).toLowerCase().includes(q) || d.code.toLowerCase().includes(q) || TYPE_LABEL[d.kind].toLowerCase().includes(q))
      .slice()
      .reverse()
  }, [discounts, view, query])
  const setActive = (active: boolean) => (ids: string[]) => {
    act(s => { for (const d of s.store.discounts) if (ids.includes(d.id)) upsertDiscount(s, { ...d, active }) })
    setSel([])
  }
  const columns: IndexTableColumn<Discount>[] = [
    {
      id: 'title', title: 'Title', minWidth: 220, sortValue: d => discountName(d).toLowerCase(),
      render: d => (
        <BlockStack gap="050">
          <Text as="span" fontWeight="semibold">{discountName(d)}</Text>
          <Text as="span" tone="subdued" variant="bodySm">{discountSummary(d)}</Text>
        </BlockStack>
      ),
    },
    { id: 'status', title: 'Status', render: d => (d.active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>) },
    { id: 'method', title: 'Method', render: d => (d.automatic ? 'Automatic' : 'Code') },
    { id: 'type', title: 'Type', render: d => TYPE_LABEL[d.kind] },
    { id: 'used', title: 'Used', numeric: true, render: d => d.usage.toLocaleString('en-US'), sortValue: d => d.usage },
    { id: 'created', title: 'Created', render: d => formatDate(d.createdDay, 'md'), sortValue: d => d.createdDay },
  ]
  return (
    <div className="sf-mx-page">
      <Page title="Discounts" primaryAction={{ content: 'Create discount', onAction: () => setPicker(true) }}>
        <BlockStack gap="400">
          {shipping.freeShipping && discounts.some(d => d.active && d.kind === 'free_shipping') && (
            <Banner tone="info">You already ship every order free, so free-shipping discounts don&apos;t change anything.</Banner>
          )}
          {discounts.length === 0 ? (
            <Card>
              <EmptyState heading="Manage discounts and promotions" image="generic" action={{ content: 'Create discount', onAction: () => setPicker(true) }}>
                Add discount codes and automatic discounts that apply at checkout. Quantity discounts raise your average order value.
              </EmptyState>
            </Card>
          ) : (
            <Card padding="0">
              <IndexFilters
                tabs={[{ id: 'all', content: 'All' }, { id: 'active', content: 'Active' }, { id: 'inactive', content: 'Deactivated' }]}
                selected={view}
                onSelect={setView}
                queryValue={query}
                onQueryChange={setQuery}
                queryPlaceholder="Searching all discounts"
              />
              <IndexTable
                rows={rows}
                rowKey={d => d.id}
                columns={columns}
                resourceName={{ singular: 'discount', plural: 'discounts' }}
                selectedIds={sel}
                onSelectionChange={setSel}
                onRowClick={d => navigate(`discounts/${d.id}`)}
                promotedBulkActions={[{ content: 'Activate', onAction: setActive(true) }, { content: 'Deactivate', onAction: setActive(false) }]}
                bulkActions={[{ content: 'Delete discounts', destructive: true, onAction: ids => setConfirmDelete(ids) }]}
                emptyState={<EmptyState heading="No discounts found" image="search" compact />}
              />
            </Card>
          )}
        </BlockStack>
      </Page>
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.length ?? 0} discount${confirmDelete?.length === 1 ? '' : 's'}?`}
        size="small"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          onAction: () => {
            const ids = confirmDelete ?? []
            act(s => { for (const id of ids) deleteDiscount(s, id) })
            setSel([])
            setConfirmDelete(null)
          },
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setConfirmDelete(null) }]}
      >
        <Modal.Section><Text as="p">This can&apos;t be undone. Customers won&apos;t be able to use these codes any more.</Text></Modal.Section>
      </Modal>
      <Modal open={picker} onClose={() => setPicker(false)} title="Select discount type" secondaryActions={[{ content: 'Cancel', onAction: () => setPicker(false) }]}>
        <Modal.Section flush>
          <div className="sf-mx-typelist">
            {TYPES.map(t => (
              <button key={t.kind} type="button" className="sf-mx-typerow" onClick={() => { setPicker(false); navigate(`discounts/new/${t.kind}`) }}>
                <span className="sf-mx-typeicon"><Icon source={t.icon} /></span>
                <span>
                  <Text as="span" fontWeight="semibold">{t.title}</Text>
                  <Text as="span" tone="subdued" variant="bodySm"> · {t.text}</Text>
                </span>
              </button>
            ))}
          </div>
        </Modal.Section>
      </Modal>
    </div>
  )
}

/** Codes are stored upper-case without spaces or symbols (see upsertDiscount); show that while typing. */
const cleanCode = (v: string) => v.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9_-]/g, '').slice(0, 24)

const randomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function DiscountForm({ id, kind: initialKind, navigate }: { id?: string; kind?: Kind; navigate: (p: string) => void }) {
  usePauseWhileMounted('shopifly-discount-editor')
  const existing = useGS(s => (id ? s.store.discounts.find(d => d.id === id) : undefined))
  const shipping = useGS(s => s.store.shipping)
  const kindInit: Kind = existing?.kind ?? initialKind ?? 'percent'
  const init = {
    kind: kindInit,
    code: existing ? (existing.automatic ? discountName(existing) : existing.code) : '',
    automatic: existing?.automatic ?? AUTO_ONLY.includes(kindInit),
    value: existing ? String(existing.value) : kindInit === 'fixed' ? '5' : kindInit === 'quantity_break' ? '10' : '15',
    active: existing?.active ?? true,
  }
  const [f, setF] = useState(init)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [flash, showFlash] = useFlash()
  const dirty = !existing || JSON.stringify(f) !== JSON.stringify(init)
  const { guard, modal: leaveModal } = useLeaveGuard(dirty)
  const needsValue = f.kind === 'percent' || f.kind === 'fixed' || f.kind === 'quantity_break'
  const value = Number(f.value)
  const valueErr = needsValue && !(value > 0) ? 'Enter a value greater than 0' : f.kind !== 'fixed' && needsValue && value > 90 ? 'Maximum is 90%' : undefined
  const codeErr = !f.automatic && !cleanCode(f.code) ? 'Enter a discount code' : undefined

  if (id && !existing) {
    return (
      <Page backAction={{ content: 'Discounts', onAction: () => navigate('discounts') }} title="Discount not found">
        <Card><EmptyState heading="This discount doesn't exist" image="search" action={{ content: 'Back to discounts', onAction: () => navigate('discounts') }} /></Card>
      </Page>
    )
  }

  const save = () => {
    if (valueErr || codeErr) {
      showFlash(valueErr ?? codeErr ?? 'Check the form', 'critical')
      return
    }
    // automatic discounts keep the merchant's free-text title; the code stays a normalized id
    const autoTitle = f.automatic ? f.code.trim().replace(/\s+/g, ' ').slice(0, 60) || TYPE_LABEL[f.kind] : undefined
    const d: Discount = {
      id: existing?.id ?? '',
      code: cleanCode(f.automatic ? autoTitle ?? '' : f.code) || (f.automatic ? cleanCode(TYPE_LABEL[f.kind]) : ''),
      title: autoTitle,
      kind: f.kind,
      value: needsValue ? value : 0,
      automatic: f.automatic,
      active: f.active,
      usage: existing?.usage ?? 0,
      createdDay: existing?.createdDay ?? 0,
    }
    let newId = existing?.id ?? ''
    act(s => {
      const before = new Set(s.store.discounts.map(x => x.id))
      upsertDiscount(s, { ...d, createdDay: existing?.createdDay ?? Math.floor(s.time.hour / 24) })
      newId = existing?.id ?? s.store.discounts.find(x => !before.has(x.id))?.id ?? ''
    })
    if (!existing && newId) navigate(`discounts/${newId}`)
    else {
      // show what was stored (codes are normalized, percentages rounded) so the form is clean again
      const saved = newId ? getGS().store.discounts.find(x => x.id === newId) : undefined
      if (saved) setF({ kind: saved.kind, code: saved.automatic ? discountName(saved) : saved.code, automatic: saved.automatic, value: String(saved.value), active: saved.active })
      showFlash('Discount saved')
    }
  }

  const title = existing ? discountName(existing) : TYPE_LABEL[f.kind]
  return (
    <div className="sf-mx-page">
      <AdminSaveBar
        visible={dirty}
        message={existing ? 'Unsaved changes' : 'Unsaved discount'}
        saveAction={{ onAction: save, content: 'Save' }}
        discardAction={{ onAction: () => (existing ? setF(init) : navigate('discounts')), content: 'Discard' }}
      />
      {leaveModal}
      <Page
        backAction={{ content: 'Discounts', onAction: () => guard(() => navigate('discounts')) }}
        title={existing ? title : `Create ${TYPE_LABEL[f.kind].toLowerCase()}`}
        titleMetadata={existing ? (existing.active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>) : undefined}
        secondaryActions={existing ? [
          { content: existing.active ? 'Deactivate' : 'Activate', onAction: () => { act(s => upsertDiscount(s, { ...existing, active: !existing.active })); setF(x => ({ ...x, active: !existing.active })) } },
          { content: 'Delete', destructive: true, onAction: () => setConfirmDelete(true) },
        ] : undefined}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card title={TYPE_LABEL[f.kind]}>
                <BlockStack gap="400">
                  <ChoiceList
                    title="Method"
                    choices={[
                      { label: 'Discount code', value: 'code', disabled: AUTO_ONLY.includes(f.kind) },
                      { label: 'Automatic discount', value: 'auto' },
                    ]}
                    selected={[f.automatic ? 'auto' : 'code']}
                    onChange={([v]) => setF(x => ({ ...x, automatic: v === 'auto', code: v === 'auto' ? x.code : cleanCode(x.code) }))}
                  />
                  {AUTO_ONLY.includes(f.kind) && <Text as="p" tone="subdued" variant="bodySm">This discount type applies automatically at checkout.</Text>}
                  {f.automatic ? (
                    <TextField label="Title" value={f.code} onChange={code => setF(x => ({ ...x, code }))} helpText="Customers see this in their cart and at checkout." placeholder="Spring sale" maxLength={60} />
                  ) : (
                    <TextField
                      label="Discount code"
                      value={f.code}
                      onChange={code => setF(x => ({ ...x, code: cleanCode(code.replace(/\s+/g, '')) }))}
                      labelAction={{ content: 'Generate random code', onAction: () => setF(x => ({ ...x, code: randomCode() })) }}
                      helpText="Customers must enter this code at checkout."
                      error={codeErr && f.code !== '' ? codeErr : undefined}
                      monospaced
                      maxLength={24}
                    />
                  )}
                </BlockStack>
              </Card>

              {f.kind !== 'free_shipping' && f.kind !== 'bxgy' && (
                <Card title="Discount value">
                  <InlineStack gap="300" wrap={false} blockAlign="start">
                    {(f.kind === 'percent' || f.kind === 'fixed') && (
                      <div style={{ flex: '1 1 160px' }}>
                        <Select
                          label="Value type"
                          options={[{ label: 'Percentage', value: 'percent' }, { label: 'Fixed amount', value: 'fixed' }]}
                          value={f.kind}
                          onChange={k => setF(x => ({ ...x, kind: k as Kind }))}
                        />
                      </div>
                    )}
                    <div style={{ flex: '1 1 160px' }}>
                      <TextField
                        label={f.kind === 'quantity_break' ? 'Discount on 2+ items' : 'Value'}
                        type={f.kind === 'fixed' ? 'currency' : 'number'}
                        prefix={f.kind === 'fixed' ? '$' : undefined}
                        suffix={f.kind === 'fixed' ? undefined : '%'}
                        value={f.value}
                        onChange={value => setF(x => ({ ...x, value }))}
                        error={valueErr}
                      />
                    </div>
                  </InlineStack>
                </Card>
              )}
              {f.kind === 'bxgy' && (
                <Card title="Customer buys">
                  <Text as="p">Customers who add 3 of the same product pay for 2. The third one is free.</Text>
                </Card>
              )}
              {f.kind === 'free_shipping' && (
                <Card title="Shipping">
                  <Text as="p" tone={shipping.freeShipping ? 'caution' : undefined}>
                    {shipping.freeShipping ? 'Your store already ships every order free. Change your rates in Settings → Shipping first.' : `Waives your ${money(shipping.flatRate)} shipping rate.`}
                  </Text>
                </Card>
              )}

              <Card title="Status">
                <ChoiceList
                  title="Status"
                  titleHidden
                  choices={[{ label: 'Active', value: 'on' }, { label: 'Deactivated', value: 'off' }]}
                  selected={[f.active ? 'on' : 'off']}
                  onChange={([v]) => setF(x => ({ ...x, active: v === 'on' }))}
                />
              </Card>
            </BlockStack>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card title="Summary">
              <BlockStack gap="300">
                <Text as="p" variant="headingMd">{f.code.trim() || (f.automatic ? 'No title yet' : 'No discount code yet')}</Text>
                <Text as="p" tone="subdued">{TYPE_LABEL[f.kind]} · {f.automatic ? 'Automatic' : 'Code'}</Text>
                <ul className="sf-mx-bullets">
                  <li>{discountSummary({ kind: f.kind, value: needsValue ? value || 0 : 0 })}</li>
                  <li>{f.automatic ? 'Applies automatically at checkout' : 'Customers enter the code at checkout'}</li>
                  <li>Can&apos;t combine with other automatic discounts</li>
                  {existing && <li>Used {existing.usage.toLocaleString('en-US')} time{existing.usage === 1 ? '' : 's'}</li>}
                </ul>
                {f.automatic && (f.kind === 'percent' || f.kind === 'fixed') && (
                  <Text as="p" tone="subdued" variant="bodySm">Automatic discounts lower the price every shopper pays, so they also lower your profit per order.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${existing ? discountName(existing) : 'discount'}?`}
        size="small"
        primaryAction={{ content: 'Delete', destructive: true, onAction: () => { if (existing) act(s => deleteDiscount(s, existing.id)); setConfirmDelete(false); navigate('discounts') } }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setConfirmDelete(false) }]}
      >
        <Modal.Section><Text as="p">This can&apos;t be undone.</Text></Modal.Section>
      </Modal>
      {flash}
    </div>
  )
}
