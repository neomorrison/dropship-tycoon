// Storefront site ("Your Store"): the player's live Shopifly store as shoppers see it.
// Routes: '' home · products/<id> · collections/all · policies/<refund|shipping|privacy|terms|contact>
// The owner sees a slim preview bar with shortcuts back into the Shopifly admin.
import { useMemo, useState, type ReactNode } from 'react'
import { Eye, LayoutTemplate, Pencil, Store } from 'lucide-react'
import type { SiteProps } from '../types'
import { useGS } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { CartDrawer, POLICY_PAGES, StoreChrome, type PolicyKey } from './Layout'
import { StoreProductPage, type CartLine } from './ProductPage'
import { cardInfo, ClosedStorePage, CollectionPage, HomePage, NotFoundPage, PolicyPage } from './pages'
import { buildProductModel, buildStoreView } from './view'
import './storefront.css'

export default function Storefront({ path, navigate }: SiteProps) {
  const s = useGS(st => st)
  const view = useMemo(() => buildStoreView(s), [s])
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(path === 'cart')
  const [checkoutNotice, setCheckoutNotice] = useState(false)

  const seg = path.split('/').filter(Boolean)
  const [a, b] = seg
  const product = a === 'products' && b ? s.store.products.find(p => p.id === b) ?? null : null
  const cards = useMemo(() => view.products.map(p => cardInfo(s, p)), [s, view.products])
  const model = useMemo(() => (product ? buildProductModel(s, product) : null), [s, product])

  if (!s.store.created) return <ClosedStorePage onOpenAdmin={() => openSite('shopifly', '')} />

  const addToCart = (line: CartLine, buyNow: boolean) => {
    setCart(c => {
      const i = c.findIndex(x => x.productId === line.productId && x.variant === line.variant)
      if (i < 0) return [...c, line]
      const next = [...c]
      const qty = next[i].qty + line.qty
      next[i] = { ...next[i], qty, lineTotal: next[i].lineTotal + line.lineTotal }
      return next
    })
    setCheckoutNotice(buyNow)
    setCartOpen(true)
  }
  const changeQty = (i: number, qty: number) =>
    setCart(c => (qty <= 0 ? c.filter((_, j) => j !== i) : c.map((l, j) => (j === i ? { ...l, qty, lineTotal: (l.lineTotal / l.qty) * qty } : l))))

  let page: ReactNode
  if (!a) page = <HomePage view={view} cards={cards} go={navigate} />
  else if (a === 'products' && product && model && (product.status === 'active' || product.status === 'draft')) {
    page = (
      <>
        {product.status === 'draft' && (
          <div className="st-draft-banner">
            <Eye size={15} /> This product is a <strong>draft</strong>. Only you can see it. Shoppers get a “page not found”.
            <button type="button" className="st-linkbtn" onClick={() => openSite('shopifly', `products/${product.id}`)}>Publish in Shopifly</button>
          </div>
        )}
        <StoreProductPage key={product.id} view={view} model={model} onAddToCart={addToCart} />
      </>
    )
  } else if (a === 'collections') page = <CollectionPage cards={cards} go={navigate} />
  else if (a === 'policies' && POLICY_PAGES.some(p => p.key === b)) page = <PolicyPage view={view} kind={b as PolicyKey} />
  else if (a === 'cart') page = <CollectionPage cards={cards} go={navigate} />
  else page = <NotFoundPage go={navigate} />

  const topBar = (
    <div className="st-ownerbar">
      <span className="st-ownerbar-brand"><Store size={14} /> {view.domain}</span>
      <span className="st-ownerbar-actions">
        {product && (
          <button type="button" onClick={() => openSite('shopifly', `products/${product.id}`)}><Pencil size={13} /> Edit product</button>
        )}
        <button type="button" onClick={() => openSite('shopifly', product ? `online-store/editor/product/${product.id}` : 'online-store/editor/home')}>
          <LayoutTemplate size={13} /> Customize
        </button>
        <button type="button" onClick={() => openSite('shopifly', '')}>Shopifly admin</button>
      </span>
    </div>
  )

  return (
    <StoreChrome
      view={view}
      navigate={navigate}
      cart={cart}
      onOpenCart={() => { setCheckoutNotice(false); setCartOpen(true) }}
      topBar={topBar}
      overlay={cartOpen ? (
        <CartDrawer
          lines={cart}
          view={view}
          onClose={() => setCartOpen(false)}
          onChangeQty={changeQty}
          checkoutNotice={checkoutNotice}
          onCheckout={() => setCheckoutNotice(true)}
        />
      ) : null}
      onOverlayClose={() => setCartOpen(false)}
    >
      {page}
    </StoreChrome>
  )
}

// ---- public components for the Shopifly Theme Editor & product preview ----
export { StoreChrome, CartDrawer, POLICY_PAGES } from './Layout'
export { StoreProductPage, type CartLine, type EditorBridge, type ProductPageProps } from './ProductPage'
export { HomePage, CollectionPage, PolicyPage, ProductCard, cardInfo, type CardInfo } from './pages'
export { SECTION_COMPONENTS, SECTION_ZONE, SectionView, BENEFIT_ICONS, benefitIcon, type SectionZone, type PageCtx } from './sections'
export { buildStoreView, buildProductModel, withOverrides, catalogDef, autoAnnouncement, type StoreView, type ProductModel } from './view'
export { MediaImage, MEDIA_KIND_LABEL, SUPPLIER_VARIANTS, SUPPLIER_VARIANT_LABELS } from './media'
export { themeTokens, themeStyle, fontChoices, ensureFont, FONT_OPTIONS, isHexColor } from './theme'
export { sampleReviews, starCounts } from './reviews'
