// Product editor "Media" card: Shopify-style grid (featured tile first), drag to reorder,
// multi-select remove, a media picker (supplier gallery + your own content from finished
// creatives) and a media detail modal with alt text.
import { useMemo, useState, type DragEvent } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Star, Trash2 } from 'lucide-react'
import type { Creative, MediaItem, StoreProduct } from '../../../../core/types'
import { openSite } from '../../../../core/ui'
import { Badge, BlockStack, Button, Card, Checkbox, EmptyState, InlineStack, Modal, Tabs, Text, TextField } from '../../../kit/polaris'
import { MediaImage, MEDIA_KIND_LABEL, SUPPLIER_VARIANTS, SUPPLIER_VARIANT_LABELS } from '../../storefront'

export interface MediaSource {
  key: string
  item: MediaItem
  group: 'supplier' | 'yours'
  label: string
  sub: string
}

const PRODUCER_LABEL: Record<Creative['producer'], string> = {
  self: 'Shot by you', supplier_edit: 'Supplier footage', ugc: 'UGC creator', agency: 'Agency', staff: 'Your team',
}

/** Everything that can be added to a product's gallery. */
export function mediaLibrary(p: StoreProduct, creatives: Creative[], supplierAlt: string): MediaSource[] {
  const out: MediaSource[] = []
  const src = p.media.find(m => m.kind === 'supplier')?.src ?? creatives[0]?.thumb ?? ''
  for (let v = 0; v < SUPPLIER_VARIANTS; v++) {
    out.push({
      key: `sup-${v}`,
      item: { id: `sup-${p.catalogId}-${v}`, kind: 'supplier', src, alt: supplierAlt, variant: v },
      group: 'supplier',
      label: `Supplier photo ${v + 1}`,
      sub: SUPPLIER_VARIANT_LABELS[v],
    })
  }
  for (const c of creatives) {
    if (c.status !== 'ready' || c.catalogId !== p.catalogId) continue
    const by = PRODUCER_LABEL[c.producer]
    if (c.producer !== 'supplier_edit') {
      const kind: MediaItem['kind'] = c.producer === 'ugc' ? 'ugc_photo' : 'lifestyle'
      out.push({ key: `cr-${c.id}-${kind}`, item: { id: `cr-${c.id}-${kind}`, kind, src: c.thumb, alt: c.name }, group: 'yours', label: c.name, sub: `${MEDIA_KIND_LABEL[kind]} · ${by}` })
    }
    if (c.isVideo) {
      out.push({ key: `cr-${c.id}-video`, item: { id: `cr-${c.id}-video`, kind: 'video', src: c.thumb, alt: c.name }, group: 'yours', label: c.name, sub: `Video · ${Math.round(c.durationSec)}s · ${by}` })
      out.push({ key: `cr-${c.id}-gif`, item: { id: `cr-${c.id}-gif`, kind: 'gif', src: c.thumb, alt: `${c.name} (demo loop)` }, group: 'yours', label: c.name, sub: `GIF loop · ${by}` })
    }
  }
  return out
}

const inGallery = (media: MediaItem[], s: MediaSource) =>
  s.item.kind === 'supplier' ? media.some(m => m.kind === 'supplier' && (m.variant ?? 0) % SUPPLIER_VARIANTS === s.item.variant) : media.some(m => m.id === s.item.id)

function MediaPicker({ open, onClose, library, media, onAdd }: { open: boolean; onClose: () => void; library: MediaSource[]; media: MediaItem[]; onAdd: (items: MediaItem[]) => void }) {
  const [tab, setTab] = useState(0)
  const [sel, setSel] = useState<string[]>([])
  const groups: MediaSource['group'][] = ['supplier', 'yours']
  const list = library.filter(x => x.group === groups[tab])
  const toggle = (k: string) => setSel(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]))
  const close = () => {
    setSel([])
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="Add media"
      size="large"
      primaryAction={{
        content: sel.length ? `Add ${sel.length} item${sel.length === 1 ? '' : 's'}` : 'Add',
        disabled: !sel.length,
        onAction: () => {
          onAdd(library.filter(x => sel.includes(x.key)).map(x => ({ ...x.item })))
          close()
        },
      }}
      secondaryActions={[{ content: 'Cancel', onAction: close }]}
    >
      <Modal.Section flush>
        <Tabs
          tabs={[
            { id: 'supplier', content: 'Supplier gallery', badge: library.filter(x => x.group === 'supplier').length },
            { id: 'yours', content: 'Your content', badge: library.filter(x => x.group === 'yours').length },
          ]}
          selected={tab}
          onSelect={setTab}
          variant="underline"
          bordered
        />
      </Modal.Section>
      <Modal.Section>
        {list.length === 0 ? (
          <EmptyState
            heading="No content of your own yet"
            image="creative"
            compact
            action={{ content: 'Open CreatorHub', onAction: () => openSite('studio', '') }}
          >
            Lifestyle photos, customer photos and demo videos come from finished creatives for this product: film it yourself, hire a UGC creator or an agency.
          </EmptyState>
        ) : (
          <div className="sf-mx-pickgrid">
            {list.map(x => {
              const added = inGallery(media, x)
              const on = sel.includes(x.key)
              return (
                <button key={x.key} type="button" className={`sf-mx-pick${on ? ' is-on' : ''}`} disabled={added} onClick={() => toggle(x.key)}>
                  <MediaImage item={x.item} seed={x.item.id} />
                  {!added && <span className={`sf-mx-pick-check${on ? ' is-on' : ''}`} aria-hidden>{on ? '✓' : ''}</span>}
                  {added && <span className="sf-mx-pick-added"><Badge>Added</Badge></span>}
                  <span className="sf-mx-pick-meta">
                    <span className="sf-mx-pick-label">{x.label}</span>
                    <span className="sf-mx-pick-sub">{x.sub}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Modal.Section>
    </Modal>
  )
}

function MediaDetail({ media, index, onClose, onChange, onIndex }: { media: MediaItem[]; index: number | null; onClose: () => void; onChange: (media: MediaItem[]) => void; onIndex: (i: number) => void }) {
  const m = index != null ? media[index] : undefined
  if (!m || index == null) return <Modal open={false} onClose={onClose} title="" />
  return (
    <Modal
      open
      onClose={onClose}
      title={MEDIA_KIND_LABEL[m.kind]}
      size="medium"
      primaryAction={{ content: 'Done', onAction: onClose }}
      secondaryActions={[
        { content: 'Remove', destructive: true, icon: Trash2, onAction: () => { onChange(media.filter((_, i) => i !== index)); onClose() } },
        ...(index > 0 ? [{ content: 'Set as featured', icon: Star, onAction: () => { const next = [m, ...media.filter((_, i) => i !== index)]; onChange(next); onIndex(0) } }] : []),
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <div className="sf-mx-detail">
            <Button variant="tertiary" icon={ChevronLeft} accessibilityLabel="Previous" disabled={index === 0} onClick={() => onIndex(index - 1)} />
            <div className="sf-mx-detail-img"><MediaImage item={m} seed={m.id} /></div>
            <Button variant="tertiary" icon={ChevronRight} accessibilityLabel="Next" disabled={index >= media.length - 1} onClick={() => onIndex(index + 1)} />
          </div>
          <TextField
            label="Alt text"
            value={m.alt}
            onChange={alt => onChange(media.map((x, i) => (i === index ? { ...x, alt } : x)))}
            helpText="Describes the image for screen readers and search engines."
            maxLength={512}
          />
          <Text as="p" tone="subdued" variant="bodySm">{index + 1} of {media.length}{index === 0 ? ' · Featured image' : ''}</Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  )
}

export function MediaCard({ media, onChange, product, creatives, supplierAlt }: { media: MediaItem[]; onChange: (m: MediaItem[]) => void; product: StoreProduct; creatives: Creative[]; supplierAlt: string }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sel, setSel] = useState<string[]>([])
  const [detail, setDetail] = useState<number | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const library = useMemo(() => mediaLibrary(product, creatives, supplierAlt), [product, creatives, supplierAlt])

  const onDrop = (e: DragEvent, i: number) => {
    e.preventDefault()
    if (drag == null || drag === i) return
    const next = [...media]
    const [m] = next.splice(drag, 1)
    next.splice(i, 0, m)
    onChange(next)
    setDrag(null)
    setOver(null)
  }
  const add = (items: MediaItem[]) => {
    const ids = new Set(media.map(m => m.id))
    onChange([...media, ...items.map(m => (ids.has(m.id) ? { ...m, id: `${m.id}-${media.length}` } : m))])
  }
  const allSel = sel.length > 0 && sel.length === media.length
  return (
    <Card
      title={sel.length ? undefined : 'Media'}
      padding="400"
      actions={
        sel.length ? undefined : media.length > 0 ? <Button variant="plain" onClick={() => setPickerOpen(true)}>Add media</Button> : undefined
      }
    >
      <BlockStack gap="300">
        {sel.length > 0 && (
          <InlineStack align="space-between" blockAlign="center">
            <Checkbox label={`${sel.length} file${sel.length === 1 ? '' : 's'} selected`} checked={allSel ? true : 'indeterminate'} onChange={() => setSel(allSel ? [] : media.map(m => m.id))} />
            <Button variant="plain" tone="critical" onClick={() => { onChange(media.filter(m => !sel.includes(m.id))); setSel([]) }}>
              Remove
            </Button>
          </InlineStack>
        )}
        {media.length === 0 ? (
          <div className="sf-mx-dropzone">
            <ImagePlus size={22} />
            <InlineStack gap="200" align="center">
              <Button onClick={() => setPickerOpen(true)}>Add media</Button>
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodySm">Supplier photos, your lifestyle shots, customer photos and demo videos</Text>
          </div>
        ) : (
          <div className="sf-mx-mediagrid">
            {media.map((m, i) => {
              const on = sel.includes(m.id)
              return (
                <div
                  key={m.id}
                  className={`sf-mx-tile${i === 0 ? ' is-featured' : ''}${on ? ' is-selected' : ''}${over === i && drag !== i ? ' is-over' : ''}${drag === i ? ' is-dragging' : ''}`}
                  draggable
                  onDragStart={e => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }}
                  onDragOver={e => { e.preventDefault(); setOver(i) }}
                  onDragLeave={() => setOver(o => (o === i ? null : o))}
                  onDragEnd={() => { setDrag(null); setOver(null) }}
                  onDrop={e => onDrop(e, i)}
                >
                  <MediaImage item={m} seed={m.id} onClick={() => setDetail(i)} />
                  <span className="sf-mx-tile-check" onClick={e => e.stopPropagation()}>
                    <Checkbox label="Select" labelHidden checked={on} onChange={() => setSel(s => (on ? s.filter(x => x !== m.id) : [...s, m.id]))} />
                  </span>
                </div>
              )
            })}
            <button type="button" className="sf-mx-tile sf-mx-addtile" onClick={() => setPickerOpen(true)} aria-label="Add media">
              <ImagePlus size={20} />
              <span>Add</span>
            </button>
          </div>
        )}
      </BlockStack>
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} library={library} media={media} onAdd={add} />
      <MediaDetail media={media} index={detail} onClose={() => setDetail(null)} onChange={onChange} onIndex={setDetail} />
    </Card>
  )
}
