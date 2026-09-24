// Settings editors for every product-page section (Theme Editor right panel and the
// product editor's section modal). Each editor receives typed settings and returns a
// full replacement object; empty inputs stay empty so the grader sees what the shopper sees.
import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { SectionId } from '../../../../core/types'
import {
  sectionSettings, TRUST_BADGE_LABELS, type BundleTier, type SectionSettingsMap, type TrustBadgeId,
} from '../../../../data/sections'
import {
  BlockStack, Button, Checkbox, ChoiceList, InlineStack, Select, TagsInput, Text, TextField,
} from '../../../kit/polaris'
import { BENEFIT_ICONS } from '../../storefront'

type Editor<K extends SectionId> = (p: { value: SectionSettingsMap[K]; onChange: (v: SectionSettingsMap[K]) => void; ctx: SettingsCtx }) => ReactNode

export interface SettingsCtx {
  /** honest delivery window for the product's current fulfillment */
  realWindow: [number, number]
  /** ready creatives of the product available to the UGC gallery */
  creatives: { id: string; name: string; producer: string }[]
  storeName: string
  freeOver: number | null
  /** store ships every order free */
  freeShipping?: boolean
}

/** Integer input that keeps what the player types and only commits values inside [min, max]. */
function IntField({ label, value, onChange, min, max, suffix, prefix, helpText, disabled }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; suffix?: string; prefix?: string; helpText?: ReactNode; disabled?: boolean }) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText(t => (Number(t) === value ? t : String(value)))
  }, [value])
  return (
    <TextField
      label={label}
      type="integer"
      suffix={suffix}
      prefix={prefix}
      disabled={disabled}
      value={text}
      min={min}
      max={max}
      helpText={helpText}
      error={text.trim() !== '' && !(Number(text) >= min && Number(text) <= max) ? `Enter ${min}–${max}` : undefined}
      onChange={t => {
        setText(t)
        const n = Math.round(Number(t))
        if (t.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n)
      }}
      onBlur={() => setText(String(value))}
    />
  )
}
const optInt = (v: string): number | null => {
  if (!v.trim()) return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.min(120, n) : null
}

/** Generic list editor with add / remove / move. */
function ListEditor<T>({
  items, onChange, render, make, max, addLabel, itemLabel,
}: {
  items: T[]
  onChange: (items: T[]) => void
  render: (item: T, set: (v: T) => void, i: number) => ReactNode
  make: () => T
  max: number
  addLabel: string
  itemLabel: (i: number) => string
}) {
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <BlockStack gap="300">
      {items.map((it, i) => (
        <div key={i} className="sf-mx-listitem">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="span" variant="headingXs">{itemLabel(i)}</Text>
            <InlineStack gap="050">
              <Button variant="tertiary" size="micro" icon={ArrowUp} accessibilityLabel="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
              <Button variant="tertiary" size="micro" icon={ArrowDown} accessibilityLabel="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
              <Button variant="tertiary" size="micro" tone="critical" icon={Trash2} accessibilityLabel="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))} />
            </InlineStack>
          </InlineStack>
          <BlockStack gap="200">{render(it, v => onChange(items.map((x, j) => (j === i ? v : x))), i)}</BlockStack>
        </div>
      ))}
      {items.length < max && (
        <Button icon={Plus} onClick={() => onChange([...items, make()])}>{addLabel}</Button>
      )}
    </BlockStack>
  )
}

const EDITORS: { [K in SectionId]: Editor<K> } = {
  reviews: ({ value, onChange }) => (
    <BlockStack gap="300">
      <Select
        label="Layout"
        options={[{ label: 'Grid', value: 'grid' }, { label: 'List', value: 'list' }, { label: 'Carousel', value: 'carousel' }]}
        value={value.layout}
        onChange={v => onChange({ ...value, layout: v as typeof value.layout })}
      />
      <Checkbox label="Show review photos" checked={value.showPhotos} onChange={c => onChange({ ...value, showPhotos: c })} />
    </BlockStack>
  ),
  trust_badges: ({ value, onChange }) => (
    <ChoiceList
      title="Badges"
      allowMultiple
      choices={(Object.keys(TRUST_BADGE_LABELS) as TrustBadgeId[]).map(id => ({ label: TRUST_BADGE_LABELS[id], value: id }))}
      selected={value.badges}
      onChange={sel => onChange({ ...value, badges: sel as TrustBadgeId[] })}
    />
  ),
  faq: ({ value, onChange }) => (
    <ListEditor
      items={value.items}
      onChange={items => onChange({ ...value, items })}
      make={() => ({ q: '', a: '' })}
      max={10}
      addLabel="Add question"
      itemLabel={i => `Question ${i + 1}`}
      render={(it, set) => (
        <>
          <TextField label="Question" labelHidden placeholder="Question" value={it.q} onChange={q => set({ ...it, q })} />
          <TextField label="Answer" labelHidden placeholder="Answer" multiline={3} value={it.a} onChange={a => set({ ...it, a })} />
        </>
      )}
    />
  ),
  shipping_info: ({ value, onChange, ctx }) => (
    <BlockStack gap="300">
      <InlineStack gap="200" wrap={false}>
        <TextField label="From (days)" type="integer" value={value.minDays == null ? '' : String(value.minDays)} onChange={v => onChange({ ...value, minDays: optInt(v) })} />
        <TextField label="To (days)" type="integer" value={value.maxDays == null ? '' : String(value.maxDays)} onChange={v => onChange({ ...value, maxDays: optInt(v) })} />
      </InlineStack>
      <Text as="p" tone="subdued" variant="bodySm">
        Your orders currently take {ctx.realWindow[0]}–{ctx.realWindow[1]} days to arrive. Shoppers see the dates counted from the day they order.
      </Text>
      <TextField label="Text" multiline={2} value={value.text} onChange={text => onChange({ ...value, text })} />
    </BlockStack>
  ),
  guarantee: ({ value, onChange }) => (
    <BlockStack gap="300">
      <IntField label="Guarantee length" suffix="days" min={1} max={365} value={value.days} onChange={days => onChange({ ...value, days })} helpText="Match what your refund policy says." />
      <TextField label="Text" multiline={2} value={value.text} onChange={text => onChange({ ...value, text })} />
    </BlockStack>
  ),
  bundle_offer: ({ value, onChange }) => (
    <ListEditor<BundleTier>
      items={value.tiers}
      onChange={tiers => onChange({ ...value, tiers })}
      make={(): BundleTier => {
        const q = Math.max(1, ...value.tiers.map(t => t.qty)) + 1
        return { qty: q, discountPct: 15, label: `Buy ${q}, save 15%` }
      }}
      max={4}
      addLabel="Add tier"
      itemLabel={i => `Tier ${i + 1}`}
      render={(t, set) => (
        <>
          <InlineStack gap="200" wrap={false}>
            <IntField label="Quantity" min={1} max={10} value={t.qty} onChange={qty => set({ ...t, qty })} />
            <IntField label="Discount" suffix="%" min={0} max={60} value={t.discountPct} onChange={discountPct => set({ ...t, discountPct })} />
          </InlineStack>
          <TextField label="Label" value={t.label} onChange={label => set({ ...t, label })} />
          <TextField label="Badge (optional)" placeholder="Most popular" value={t.badge ?? ''} onChange={badge => set({ ...t, badge: badge || undefined })} />
        </>
      )}
    />
  ),
  sticky_atc: ({ value, onChange }) => (
    <Checkbox label="Show price in the bar" checked={value.showPrice} onChange={c => onChange({ ...value, showPrice: c })} />
  ),
  countdown: ({ value, onChange }) => (
    <BlockStack gap="300">
      <TextField label="Heading" value={value.text} onChange={text => onChange({ ...value, text })} />
      <IntField label="Timer length" suffix="minutes" min={1} max={1440} value={value.minutes} onChange={minutes => onChange({ ...value, minutes })} helpText="The timer restarts for every visitor." />
    </BlockStack>
  ),
  comparison: ({ value, onChange, ctx }) => (
    <BlockStack gap="300">
      <TextField label="Competitor column" value={value.themLabel} onChange={themLabel => onChange({ ...value, themLabel })} placeholder="Others" />
      <ListEditor
        items={value.rows}
        onChange={rows => onChange({ ...value, rows })}
        make={() => ({ feature: '', us: true, them: false })}
        max={8}
        addLabel="Add row"
        itemLabel={i => `Row ${i + 1}`}
        render={(r, set) => (
          <>
            <TextField label="Feature" labelHidden placeholder="Feature" value={r.feature} onChange={feature => set({ ...r, feature })} />
            <InlineStack gap="400">
              <Checkbox label={ctx.storeName || 'Us'} checked={r.us} onChange={us => set({ ...r, us })} />
              <Checkbox label={value.themLabel || 'Others'} checked={r.them} onChange={them => set({ ...r, them })} />
            </InlineStack>
          </>
        )}
      />
    </BlockStack>
  ),
  as_seen_on: ({ value, onChange }) => (
    <TagsInput label="Publications" tags={value.outlets} onChange={outlets => onChange({ ...value, outlets: outlets.slice(0, 6) })} placeholder="Add a publication and press Enter" helpText="Only list press that actually covered your brand." />
  ),
  size_chart: ({ value, onChange }) => (
    <BlockStack gap="300">
      <Select label="Unit" options={[{ label: 'Inches', value: 'in' }, { label: 'Centimeters', value: 'cm' }]} value={value.unit} onChange={u => onChange({ ...value, unit: u as 'in' | 'cm' })} />
      <TagsInput label="Measurements (columns)" tags={value.columns} onChange={columns => onChange({ ...value, columns: columns.slice(0, 5), rows: value.rows.map(r => ({ ...r, values: columns.map((_, i) => r.values[i] ?? '') })) })} />
      <ListEditor
        items={value.rows}
        onChange={rows => onChange({ ...value, rows })}
        make={() => ({ size: '', values: value.columns.map(() => '') })}
        max={10}
        addLabel="Add size"
        itemLabel={i => `Size ${i + 1}`}
        render={(r, set) => (
          <>
            <TextField label="Size" value={r.size} onChange={size => set({ ...r, size })} placeholder="M" />
            <InlineStack gap="200">
              {value.columns.map((c, j) => (
                <div key={c + j} style={{ flex: '1 1 90px' }}>
                  <TextField label={c} value={r.values[j] ?? ''} onChange={v => set({ ...r, values: value.columns.map((_, k) => (k === j ? v : r.values[k] ?? '')) })} />
                </div>
              ))}
            </InlineStack>
          </>
        )}
      />
    </BlockStack>
  ),
  benefits_icons: ({ value, onChange }) => (
    <ListEditor
      items={value.items}
      onChange={items => onChange({ ...value, items })}
      make={() => ({ icon: 'Sparkles', title: '', text: '' })}
      max={4}
      addLabel="Add benefit"
      itemLabel={i => `Benefit ${i + 1}`}
      render={(it, set) => (
        <>
          <Select label="Icon" options={Object.keys(BENEFIT_ICONS).map(k => ({ label: k.replace(/([a-z])([A-Z])/g, '$1 $2'), value: k }))} value={it.icon} onChange={icon => set({ ...it, icon })} />
          <TextField label="Heading" value={it.title} onChange={title => set({ ...it, title })} placeholder="Saves you time" />
          <TextField label="Text" value={it.text} onChange={text => set({ ...it, text })} />
        </>
      )}
    />
  ),
  ugc_gallery: ({ value, onChange, ctx }) =>
    ctx.creatives.length ? (
      <BlockStack gap="200">
        <ChoiceList
          title="Content to show"
          allowMultiple
          choices={ctx.creatives.map(c => ({ label: c.name, value: c.id, helpText: c.producer === 'ugc' ? 'Creator video' : c.producer === 'self' ? 'Shot by you' : 'Creative' }))}
          selected={value.creativeIds}
          onChange={creativeIds => onChange({ ...value, creativeIds })}
        />
        {value.creativeIds.length === 0 && <Text as="p" tone="subdued" variant="bodySm">Nothing picked: the gallery shows all of them, plus customer photos in your media.</Text>}
      </BlockStack>
    ) : (
      <Text as="p" tone="subdued">No finished UGC or self-shot creatives for this product yet. Order one in CreatorHub.</Text>
    ),
  stock_scarcity: ({ value, onChange }) => (
    <IntField label="Units left shown" min={1} max={999} value={value.unitsLeft} onChange={unitsLeft => onChange({ ...value, unitsLeft })} helpText="Shoppers see the same number every visit." />
  ),
  free_shipping_bar: ({ value, onChange, ctx }) => (
    <BlockStack gap="200">
      <IntField label="Free shipping threshold" prefix="$" min={1} max={1000} value={ctx.freeOver ?? value.threshold} onChange={threshold => onChange({ ...value, threshold })} disabled={ctx.freeOver != null || ctx.freeShipping} />
      <Text as="p" tone={ctx.freeOver == null && !ctx.freeShipping ? 'caution' : 'subdued'} variant="bodySm">
        {ctx.freeShipping
          ? 'Every order already ships free, so the bar just says so.'
          : ctx.freeOver != null
            ? `Uses your shipping setting: free over $${ctx.freeOver}.`
            : 'You charge shipping on every order. Set "free over a minimum order" in Settings → Shipping, or this bar promises free shipping you don\'t give.'}
      </Text>
    </BlockStack>
  ),
  how_it_works: ({ value, onChange }) => (
    <ListEditor
      items={value.steps}
      onChange={steps => onChange({ ...value, steps })}
      make={() => ({ title: '', text: '' })}
      max={5}
      addLabel="Add step"
      itemLabel={i => `Step ${i + 1}`}
      render={(st, set) => (
        <>
          <TextField label="Title" value={st.title} onChange={title => set({ ...st, title })} />
          <TextField label="Text" multiline={2} value={st.text} onChange={text => set({ ...st, text })} />
        </>
      )}
    />
  ),
  founder_note: ({ value, onChange }) => (
    <BlockStack gap="300">
      <TextField label="Your name" value={value.name} onChange={name => onChange({ ...value, name })} />
      <TextField label="Note" multiline={5} value={value.text} onChange={text => onChange({ ...value, text })} helpText="Why you started the store and what you promise customers. Keep it genuine." />
    </BlockStack>
  ),
}

/** Settings form for a section; `settings` may be partial/undefined (defaults are filled in). */
export function SectionSettingsEditor({
  id, settings, onChange, ctx,
}: {
  id: SectionId
  settings: Record<string, unknown> | undefined
  onChange: (settings: Record<string, unknown>) => void
  ctx: SettingsCtx
}) {
  const E = EDITORS[id] as Editor<SectionId>
  const value = sectionSettings(id, settings)
  return <>{E({ value, onChange: v => onChange(v as unknown as Record<string, unknown>), ctx })}</>
}
