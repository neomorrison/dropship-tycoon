// Content → Files: every media file used on product pages (Shopify's Files library).
import { useMemo, useState } from 'react'
import type { ShopiflyPageProps } from '../route'
import type { MediaItem } from '../../../../core/types'
import { useGS } from '../../../../core/store'
import { productImage } from '../../../../core/assets'
import { dayOf } from '../../../../core/time'
import { EmptyState, IndexFilters, IndexTable, Link, Page, PolarisProvider, Text, Thumbnail, Card, Badge } from '../../../kit/polaris'
import { shortDate } from './format'
import { unitHash } from './orders'
import { useToday } from './ui'

interface FileRow {
  key: string
  name: string
  alt: string
  kind: MediaItem['kind']
  src: string
  day: number
  sizeKb: number
  productId: string
  productTitle: string
}

const EXT: Record<MediaItem['kind'], string> = { supplier: 'jpg', lifestyle: 'jpg', ugc_photo: 'jpg', video: 'mp4', gif: 'gif' }
const KIND_LABEL: Record<MediaItem['kind'], string> = { supplier: 'Image', lifestyle: 'Image', ugc_photo: 'Image', video: 'Video', gif: 'GIF' }

function fileName(m: MediaItem, idx: number): string {
  const base = (m.src.split('/').pop() ?? 'file').replace(/\.[a-z0-9]+$/i, '')
  const prefix = m.kind === 'supplier' ? 'S' : m.kind === 'ugc_photo' ? 'UGC_' : m.kind === 'lifestyle' ? 'IMG_' : m.kind === 'video' ? 'VID_' : 'GIF_'
  const n = Math.floor(unitHash(m.id) * 9000) + 1000
  return m.kind === 'supplier' ? `${prefix}${n}${base.slice(0, 6)}-${idx + 1}.${EXT[m.kind]}`.replace(/[^A-Za-z0-9_.-]/g, '') : `${prefix}${n}.${EXT[m.kind]}`
}

function fmtSize(kb: number) {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`
}

/** Creative id behind a media item added from your own creatives ("cr-<id>-<kind>" / "m_cr_<id>"). */
function creativeIdOf(mediaId: string): string | null {
  const m = /^cr-(.+)-(?:lifestyle|ugc_photo|video|gif)$/.exec(mediaId) ?? /^m_cr_(.+)$/.exec(mediaId)
  return m ? m[1] : null
}

export default function ContentFiles({ navigate }: ShopiflyPageProps) {
  const products = useGS(s => s.store.products)
  const creatives = useGS(s => s.creatives.creatives)
  const today = useToday()
  const [tab, setTab] = useState(0)
  const [q, setQ] = useState('')
  const rows = useMemo<FileRow[]>(() => {
    const out: FileRow[] = []
    for (const p of products) {
      p.media.forEach((m, i) => {
        const h = unitHash(m.id)
        const sizeKb = m.kind === 'video' ? 4200 + h * 9000 : m.kind === 'gif' ? 1800 + h * 2600 : 140 + h * 520
        // files from your own creatives were added when the creative was ready, not when the product was imported
        const cid = creativeIdOf(m.id)
        const c = cid ? creatives.find(x => x.id === cid) : undefined
        const day = c ? Math.max(p.createdDay, dayOf(c.readyHour ?? c.orderedHour)) : p.createdDay
        out.push({ key: `${p.id}:${m.id}`, name: fileName(m, i), alt: m.alt, kind: m.kind, src: m.src || productImage(p.catalogId), day, sizeKb, productId: p.id, productTitle: p.title })
      })
    }
    return out
  }, [products, creatives])
  const tabs = [
    { id: 'all', content: 'All' },
    { id: 'images', content: 'Images' },
    { id: 'videos', content: 'Videos' },
  ]
  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return rows.filter(r =>
      (tab === 0 || (tab === 1 ? r.kind !== 'video' && r.kind !== 'gif' : r.kind === 'video' || r.kind === 'gif')) &&
      (!ql || r.name.toLowerCase().includes(ql) || r.alt.toLowerCase().includes(ql) || r.productTitle.toLowerCase().includes(ql)))
  }, [rows, tab, q])
  const totalMb = rows.reduce((a, r) => a + r.sizeKb, 0) / 1024

  return (
    <PolarisProvider>
      <Page title="Files" subtitle={rows.length ? `${rows.length} file${rows.length === 1 ? '' : 's'} · ${totalMb.toFixed(1)} MB used` : undefined} fullWidth>
        {rows.length === 0 ? (
          <Card>
            <EmptyState heading="Upload and manage your files" image="products" action={{ content: 'Go to products', onAction: () => navigate('products') }}>
              Product photos, lifestyle shots and videos you add to your products are stored here.
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <IndexFilters tabs={tabs} selected={tab} onSelect={setTab} queryValue={q} onQueryChange={setQ} queryPlaceholder="Searching all files" />
            <IndexTable
              rows={shown}
              rowKey={r => r.key}
              selectable={false}
              resourceName={{ singular: 'file', plural: 'files' }}
              pageSize={50}
              resetPageKey={`${tab}|${q}`}
              defaultSort={{ columnId: 'date', direction: 'descending' }}
              emptyState={<EmptyState heading="No files found" image="search" compact>Try changing the search term or filter.</EmptyState>}
              onRowClick={r => navigate(`products/${r.productId}`)}
              columns={[
                {
                  id: 'file', title: 'File name', sortValue: r => r.name,
                  render: r => (
                    <div className="sf-product-cell">
                      <Thumbnail source={r.src} alt={r.alt || r.name} size="small" />
                      <div className="sf-product-cell-text">
                        <Text as="span" fontWeight="medium" truncate>{r.name}</Text>
                        <Text as="span" variant="bodySm" tone="subdued">{r.name.split('.').pop()?.toUpperCase()}</Text>
                      </div>
                    </div>
                  ),
                },
                {
                  // long supplier alt texts would stretch the table: one ellipsized line, full text on hover
                  id: 'alt', title: 'Alt text',
                  render: r => (r.alt ? <div className="sf-files-alt" title={r.alt}>{r.alt}</div> : <Text as="span" tone="subdued">—</Text>),
                },
                { id: 'type', title: 'Type', nowrap: true, render: r => <Badge>{KIND_LABEL[r.kind]}</Badge> },
                { id: 'date', title: 'Date added', nowrap: true, sortValue: r => r.day, render: r => shortDate(r.day, today) },
                { id: 'size', title: 'Size', numeric: true, nowrap: true, sortValue: r => r.sizeKb, render: r => fmtSize(r.sizeKb) },
                {
                  id: 'refs', title: 'References', nowrap: true,
                  render: r => <Link onClick={() => navigate(`products/${r.productId}`)}>{r.productTitle.length > 32 ? `${r.productTitle.slice(0, 32).trim()}…` : r.productTitle}</Link>,
                },
              ]}
            />
          </Card>
        )}
      </Page>
    </PolarisProvider>
  )
}
