import { useMemo } from 'react'
import { Check, ExternalLink, PackageCheck, PackageSearch, Truck, Warehouse } from 'lucide-react'
import type { GameState, StoreProduct } from '../../../../core/types'
import { openSite } from '../../../../core/ui'
import { productImage } from '../../../../core/assets'
import { money } from '../../../../core/format'
import { sampleCost } from '../../../../sim/market'
import { cx, ImageWithFallback } from '../../../kit/common'
import { sampleStatus, type SampleKind } from '../helpers'
import { EmptyBlock } from '../ui'

const SAMPLE_ICON: Record<SampleKind, typeof Check> = { owned: PackageCheck, stock: Warehouse, transit: Truck, none: PackageSearch }

export function ProductStep({ s, products, selectedId, onSelect, compact }: {
  s: GameState
  products: StoreProduct[]
  selectedId: string | null
  onSelect: (id: string) => void
  compact: boolean
}) {
  const statuses = useMemo(() => Object.fromEntries(products.map(p => [p.id, sampleStatus(s, p.catalogId)])), [s, products])
  if (!s.store.created) {
    return (
      <EmptyBlock
        compact
        art="products"
        title="You need a store before you brief a creative"
        body="Creatives are made for a product in your Shopifly store. Set up the store, import a product, then come back."
        actions={<button type="button" className="ch-btn ch-btn-primary" onClick={() => openSite('shopifly')}>Open Shopifly <ExternalLink size={14} /></button>}
      />
    )
  }
  if (!products.length) {
    return (
      <EmptyBlock
        compact
        art="products"
        title="No products in your store yet"
        body="Find something worth selling on AliExprez and import it into Shopifly with DSerz. It shows up here right away."
        actions={
          <>
            <button type="button" className="ch-btn ch-btn-primary" onClick={() => openSite('aliexprez')}>Browse AliExprez <ExternalLink size={14} /></button>
            <button type="button" className="ch-btn ch-btn-secondary" onClick={() => openSite('shopifly', 'products')}>Shopifly products</button>
          </>
        }
      />
    )
  }
  const sel = products.find(p => p.id === selectedId) ?? null
  const st = sel ? statuses[sel.id] : null
  const StIcon = st ? SAMPLE_ICON[st.kind] : null
  return (
    <div className="ch-products">
      <div className={cx('ch-product-grid', compact && 'is-compact')} role="radiogroup" aria-label="Product">
        {products.map(p => {
          const ps = statuses[p.id]
          const on = p.id === selectedId
          const Icon = SAMPLE_ICON[ps.kind]
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={cx('ch-product', on && 'is-on')}
              onClick={() => onSelect(p.id)}
            >
              <ImageWithFallback src={p.media[0]?.src || productImage(p.catalogId)} alt={p.title} fallbackLabel={p.title} width={52} height={52} radius={10} />
              <span className="ch-product-text">
                <span className="ch-product-title">{p.title || 'Untitled product'}</span>
                <span className="ch-product-meta">
                  <span className={cx('ch-dotlabel', p.status === 'active' ? 'is-green' : 'is-gray')}>{p.status === 'active' ? 'Active' : 'Draft'}</span>
                  <span>{money(p.price)}</span>
                </span>
                <span className={cx('ch-sample', `ch-sample-${ps.kind}`)}><Icon size={12} strokeWidth={2.4} />{ps.label}</span>
              </span>
              {on && <span className="ch-product-check"><Check size={13} strokeWidth={3} /></span>}
            </button>
          )
        })}
      </div>
      {sel && st && StIcon && (
        <div className={cx('ch-sample-bar', `ch-sample-bar-${st.kind}`)}>
          <StIcon size={18} strokeWidth={2} />
          <div className="ch-sample-bar-text">
            <b>{st.label}</b>
            <span>{st.detail}{st.kind === 'none' ? ' You can still brief a supplier footage edit or an agency pack without one.' : ''}</span>
          </div>
          {st.kind === 'none' && (
            <button type="button" className="ch-btn ch-btn-secondary ch-btn-sm" onClick={() => openSite('aliexprez', `item/${sel.catalogId}`)}>
              Order a sample · {money(sampleCost(s, sel.catalogId))} <ExternalLink size={13} />
            </button>
          )}
          {st.kind === 'transit' && (
            <button type="button" className="ch-btn ch-btn-ghost ch-btn-sm" onClick={() => openSite('aliexprez', 'orders')}>
              Track order <ExternalLink size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
