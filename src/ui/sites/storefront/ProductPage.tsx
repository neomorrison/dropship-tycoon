// Dawn-style product page: gallery, info column (price, offer blocks, variants, quantity,
// buy buttons, assurance blocks, description), then full-width sections in the order the
// merchant arranged them, plus the sticky add-to-cart bar.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, EyeOff, Minus, Plus } from 'lucide-react'
import type { SectionId } from '../../../core/types'
import { sectionDef, sectionSettings } from '../../../data/sections'
import { money } from '../../../core/format'
import { sanitizeHtml } from '../../../sim/store'
import { Stars } from '../../kit/common'
import { MediaImage } from './media'
import { SECTION_ZONE, SectionView, StickyAtcBar, TrustBadgesBlock, type PageCtx } from './sections'
import type { ProductModel, StoreView } from './view'
import './storefront.css'

export interface CartLine {
  productId: string
  title: string
  variant: string
  qty: number
  unitPrice: number
  lineTotal: number
  media?: ProductModel['product']['media'][number]
}

export interface EditorBridge {
  /** currently selected section/block key in the Theme Editor */
  selected: string | null
  onSelect: (key: string) => void
}

export interface ProductPageProps {
  view: StoreView
  model: ProductModel
  /** Theme Editor preview hooks (click-to-select, placeholders, sticky bar always shown) */
  editor?: EditorBridge | null
  onAddToCart?: (line: CartLine, buyNow: boolean) => void
}

/** Wraps a block so the Theme Editor can highlight and select it. */
function Frame({ id, editor, children, className }: { id: string; editor?: EditorBridge | null; children: ReactNode; className?: string }) {
  if (!editor) return <>{children}</>
  const on = editor.selected === id
  return (
    <div
      className={`st-frame${on ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
      data-st-block={id}
      onClick={e => {
        e.stopPropagation()
        editor.onSelect(id)
      }}
    >
      {children}
      <span className="st-frame-label">{id === 'product-info' ? 'Product information' : sectionDef(id as SectionId)?.name ?? id}</span>
    </div>
  )
}

export function StoreProductPage({ view, model, editor, onAddToCart }: ProductPageProps) {
  const p = model.product
  const [mediaIdx, setMediaIdx] = useState(0)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const bundleTiers = model.active.has('bundle_offer') ? sectionSettings('bundle_offer', p.sections.find(s => s.id === 'bundle_offer')?.settings).tiers : []
  const [qty, setQty] = useState(1)
  const buyRef = useRef<HTMLDivElement>(null)
  const [buyVisible, setBuyVisible] = useState(true)

  useEffect(() => {
    if (mediaIdx >= p.media.length) setMediaIdx(0)
  }, [p.media.length, mediaIdx])

  useEffect(() => {
    const el = buyRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setBuyVisible(e.intersectionRatio > 0.3), { threshold: [0, 0.3, 0.6, 1] })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const options = p.variants.filter(v => v.name.trim() && v.values.some(x => x.trim()))
  const selected = (name: string, values: string[]) => choice[name] ?? values.find(x => x.trim()) ?? ''
  const variantLabel = options.map(o => selected(o.name, o.values)).filter(Boolean).join(' / ')

  const tier = bundleTiers.filter(t => t.qty <= qty).sort((a, b) => b.qty - a.qty)[0]
  const discountPct = model.bundles && tier ? Math.max(0, Math.min(60, tier.discountPct)) : 0
  const lineTotal = model.price * qty * (1 - discountPct / 100)
  const compare = Math.max(p.compareAtPrice ?? 0, model.price < p.price ? p.price : 0)
  const onSale = compare > model.price

  const addToCart = (buyNow: boolean) => {
    if (editor) return
    onAddToCart?.({ productId: p.id, title: p.title, variant: variantLabel, qty, unitPrice: model.price, lineTotal, media: p.media[0] }, buyNow)
  }
  const ctx: PageCtx = { view, model, qty, setQty: n => setQty(Math.max(1, Math.min(99, n))), onAddToCart: () => addToCart(false), editor: !!editor }

  const zoneSections = (zone: string) =>
    p.sections.filter(sec => sec.enabled && SECTION_ZONE[sec.id] === zone && (model.active.has(sec.id) || (editor && model.locked.includes(sec.id))))

  const renderSection = (id: SectionId, settings: Record<string, unknown> | undefined) =>
    model.active.has(id) ? (
      <SectionView id={id} settings={settings} ctx={ctx} />
    ) : (
      <div className="st-placeholder st-placeholder--locked">
        <EyeOff size={14} /> {sectionDef(id).name} is hidden: {sectionDef(id).requirementText ?? 'requirement not met'}
      </div>
    )

  const shipLine = view.shipping.freeShipping
    ? 'Free shipping on every order.'
    : view.shipping.freeOver != null
      ? `Free shipping on orders over ${money(view.shipping.freeOver)}.`
      : 'Shipping calculated at checkout.'

  const reviewsOn = model.active.has('reviews')
  const scrollToReviews = () => document.getElementById(`st-reviews-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const media = p.media[mediaIdx] ?? p.media[0]
  const stickySettings = sectionSettings('sticky_atc', p.sections.find(s => s.id === 'sticky_atc')?.settings)
  const trustDefaults = useMemo(() => sectionSettings('trust_badges', undefined), [])

  return (
    <div className="st-product-page">
      <div className="st-product">
        <div className="st-gallery">
          {media ? (
            <div className="st-gallery-main">
              <MediaImage item={media} seed={media.id} />
              {p.media.length > 1 && (
                <>
                  <button type="button" className="st-gallery-nav st-gallery-nav--prev" aria-label="Previous image" onClick={() => setMediaIdx(i => (i - 1 + p.media.length) % p.media.length)}>
                    <ChevronLeft size={18} />
                  </button>
                  <button type="button" className="st-gallery-nav st-gallery-nav--next" aria-label="Next image" onClick={() => setMediaIdx(i => (i + 1) % p.media.length)}>
                    <ChevronRight size={18} />
                  </button>
                  <span className="st-gallery-count">{mediaIdx + 1} / {p.media.length}</span>
                </>
              )}
            </div>
          ) : (
            <div className="st-gallery-main st-gallery-empty">No images</div>
          )}
          {p.media.length > 1 && (
            <div className="st-gallery-thumbs">
              {p.media.map((m, i) => (
                <button key={m.id} type="button" className={`st-gallery-thumb${i === mediaIdx ? ' is-on' : ''}`} onClick={() => setMediaIdx(i)} aria-label={`Show image ${i + 1}`}>
                  <MediaImage item={m} seed={m.id} small />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="st-info">
          <Frame id="product-info" editor={editor} className="st-frame--info">
            <p className="st-vendor">{view.name}</p>
            <h1 className="st-title">{p.title || 'Untitled product'}</h1>
            {reviewsOn && p.reviews.count > 0 && (
              <button type="button" className="st-rating-badge" onClick={scrollToReviews}>
                <Stars rating={p.reviews.avg} size={15} color={view.reviewsApp === 'judgyme' ? '#108474' : '#e8a723'} />
                <span>{p.reviews.count.toLocaleString('en-US')} review{p.reviews.count === 1 ? '' : 's'}</span>
              </button>
            )}
            <div className="st-price">
              <span className={`st-price-now${onSale ? ' is-sale' : ''}`}>{money(model.price)}</span>
              {onSale && <s className="st-price-was">{money(compare)}</s>}
              {onSale && <span className="st-sale-badge">Sale</span>}
            </div>
            <p className="st-taxline">{shipLine}</p>
          </Frame>

          {zoneSections('offer').map(sec => (
            <Frame key={sec.id} id={sec.id} editor={editor}>
              <div className="st-block">{renderSection(sec.id, sec.settings)}</div>
            </Frame>
          ))}

          {options.length > 0 && (
            <div className="st-variants">
              {options.map(o => (
                <fieldset key={o.name} className="st-variant">
                  <legend>{o.name}: <strong>{selected(o.name, o.values)}</strong></legend>
                  <div className="st-pills">
                    {o.values.filter(v => v.trim()).map(v => (
                      <button key={v} type="button" className={`st-pill${selected(o.name, o.values) === v ? ' is-on' : ''}`} onClick={() => setChoice(c => ({ ...c, [o.name]: v }))}>
                        {v}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
          {zoneSections('variant').map(sec => (
            <Frame key={sec.id} id={sec.id} editor={editor}>
              <div className="st-block st-block--tight">{renderSection(sec.id, sec.settings)}</div>
            </Frame>
          ))}

          {!model.bundles && (
            <div className="st-qty-wrap">
              <label className="st-label">Quantity</label>
              <div className="st-qty">
                <button type="button" aria-label="Decrease quantity" onClick={() => ctx.setQty(qty - 1)} disabled={qty <= 1}><Minus size={14} /></button>
                <span>{qty}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => ctx.setQty(qty + 1)}><Plus size={14} /></button>
              </div>
            </div>
          )}

          <div className="st-buy" ref={buyRef}>
            <button type="button" className="st-btn st-btn--secondary st-btn--full" onClick={() => addToCart(false)}>
              Add to cart{model.bundles && qty > 1 ? ` · ${money(lineTotal)}` : ''}
            </button>
            <button type="button" className="st-btn st-btn--primary st-btn--full" onClick={() => addToCart(true)}>Buy it now</button>
          </div>

          {model.trustBuiltIn && !zoneSections('assure').some(s => s.id === 'trust_badges') && (
            <div className="st-block"><TrustBadgesBlock settings={trustDefaults} ctx={ctx} /></div>
          )}
          {zoneSections('assure').map(sec => (
            <Frame key={sec.id} id={sec.id} editor={editor}>
              <div className="st-block">{renderSection(sec.id, sec.settings)}</div>
            </Frame>
          ))}

          <div className="st-description st-rte" dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.descriptionHtml || '') }} />
        </div>
      </div>

      {zoneSections('main').map(sec => (
        <Frame key={sec.id} id={sec.id} editor={editor}>
          <div id={sec.id === 'reviews' ? `st-reviews-${p.id}` : undefined}>{renderSection(sec.id, sec.settings)}</div>
        </Frame>
      ))}

      {model.sticky && (
        <StickyAtcBar settings={stickySettings} ctx={ctx} visible={!!editor || !buyVisible} />
      )}
    </div>
  )
}
