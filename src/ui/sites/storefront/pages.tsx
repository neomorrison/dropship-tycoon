// Storefront pages besides the product page: home, catalog, policies, 404, closed store.
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, BadgeCheck, Headset, Lock, Truck } from 'lucide-react'
import type { GameState, StoreProduct } from '../../../core/types'
import { money } from '../../../core/format'
import { Stars } from '../../kit/common'
import { POLICY_PAGES, type PolicyKey } from './Layout'
import { MediaImage } from './media'
import type { StoreView } from './view'
import { effectivePrice, sectionActive } from '../../../sim/store'

export interface CardInfo {
  product: StoreProduct
  price: number
  compare: number | null
  reviews: boolean
}

export function cardInfo(s: GameState, p: StoreProduct): CardInfo {
  const price = effectivePrice(s, p)
  const compare = Math.max(p.compareAtPrice ?? 0, price < p.price ? p.price : 0)
  return { product: p, price, compare: compare > price ? compare : null, reviews: sectionActive(s, p, 'reviews') && p.reviews.count > 0 }
}

export function ProductCard({ info, onOpen }: { info: CardInfo; onOpen?: () => void }) {
  const p = info.product
  return (
    <a href="#" className="st-card" onClick={e => { e.preventDefault(); onOpen?.() }}>
      <div className="st-card-media">
        {p.media[0] ? <MediaImage item={p.media[0]} seed={p.media[0].id} showBadges={false} /> : <div className="st-gallery-empty">No image</div>}
        {info.compare && <span className="st-sale-badge st-card-badge">Sale</span>}
      </div>
      <p className="st-card-title">{p.title || 'Untitled product'}</p>
      {info.reviews && (
        <span className="st-card-rating"><Stars rating={p.reviews.avg} size={12} color="#e8a723" /> <span>({p.reviews.count})</span></span>
      )}
      <p className="st-card-price">
        {info.compare && <s>{money(info.compare)}</s>} <span className={info.compare ? 'is-sale' : ''}>{money(info.price)}</span>
      </p>
    </a>
  )
}

function Grid({ cards, go }: { cards: CardInfo[]; go?: (path: string) => void }) {
  return (
    <div className="st-grid">
      {cards.map(c => <ProductCard key={c.product.id} info={c} onOpen={() => go?.(`products/${c.product.id}`)} />)}
    </div>
  )
}

export function HomePage({ view, cards, go, editorFrame }: { view: StoreView; cards: CardInfo[]; go?: (path: string) => void; editorFrame?: (id: string, label: string, node: ReactNode) => ReactNode }) {
  const hero = cards[0]?.product
  const frame = editorFrame ?? ((_id: string, _l: string, n: ReactNode) => n)
  const sh = view.shipping
  const perks = [
    { icon: Truck, title: sh.freeShipping ? 'Free shipping' : sh.freeOver != null ? `Free shipping over ${money(sh.freeOver)}` : 'Tracked shipping', text: 'Every order ships with tracking.' },
    { icon: BadgeCheck, title: view.policies.refund.trim() ? 'Hassle-free returns' : 'Quality checked', text: view.policies.refund.trim() ? 'See our refund policy for details.' : 'Inspected before it ships.' },
    { icon: Lock, title: 'Secure checkout', text: 'Encrypted payments by Shopifly.' },
    { icon: Headset, title: 'Real support', text: `Questions? ${view.supportEmail}` },
  ]
  return (
    <div className="st-home">
      {frame('banner', 'Image banner', (
        <section className="st-hero">
          <div className="st-hero-media">
            {hero?.media[0] ? <MediaImage item={{ ...hero.media[0], kind: 'lifestyle' }} seed={`hero-${hero.id}`} showBadges={false} /> : <div className="st-hero-blank" />}
          </div>
          <div className="st-hero-text">
            <h1 className="st-hero-title">{hero ? hero.title : `Welcome to ${view.name}`}</h1>
            <p className="st-hero-sub">{hero ? `Discover our featured product at ${view.name}.` : 'New products are on the way. Check back soon.'}</p>
            {hero && (
              <button type="button" className="st-btn st-btn--primary" onClick={() => go?.(`products/${hero.id}`)}>
                Shop now <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
      ))}
      {frame('featured', 'Featured collection', (
        <section className="st-section">
          <h2 className="st-h2">Featured products</h2>
          {cards.length ? <Grid cards={cards.slice(0, 8)} go={go} /> : <p className="st-muted">No products are available yet.</p>}
          {cards.length > 8 && (
            <div className="st-center"><button type="button" className="st-btn st-btn--secondary" onClick={() => go?.('collections/all')}>View all</button></div>
          )}
        </section>
      ))}
      {frame('perks', 'Multicolumn', (
        <section className="st-section st-perks">
          {perks.map(p => (
            <div key={p.title} className="st-perk">
              <p.icon size={24} strokeWidth={1.6} />
              <p className="st-perk-title">{p.title}</p>
              <p className="st-muted st-small">{p.text}</p>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

export function CollectionPage({ cards, go }: { cards: CardInfo[]; go?: (path: string) => void }) {
  const [sort, setSort] = useState<'featured' | 'price-asc' | 'price-desc' | 'az'>('featured')
  const sorted = useMemo(() => {
    const c = [...cards]
    if (sort === 'price-asc') c.sort((a, b) => a.price - b.price)
    else if (sort === 'price-desc') c.sort((a, b) => b.price - a.price)
    else if (sort === 'az') c.sort((a, b) => a.product.title.localeCompare(b.product.title))
    return c
  }, [cards, sort])
  return (
    <div className="st-section st-collection">
      <h1 className="st-h1">Products</h1>
      <div className="st-collection-bar">
        <label className="st-sort">
          Sort by:
          <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
            <option value="featured">Featured</option>
            <option value="az">Alphabetically, A-Z</option>
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
          </select>
        </label>
        <span className="st-muted">{cards.length} product{cards.length === 1 ? '' : 's'}</span>
      </div>
      {cards.length ? <Grid cards={sorted} go={go} /> : <p className="st-muted">No products found.</p>}
    </div>
  )
}

export function PolicyPage({ view, kind }: { view: StoreView; kind: PolicyKey }) {
  const meta = POLICY_PAGES.find(p => p.key === kind)!
  const text = view.policies[kind]?.trim() ?? ''
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="st-section st-policy">
      <h1 className="st-h1">{meta.label}</h1>
      {text ? (
        blocks.map((b, i) => (
          <p key={i}>
            {b.split('\n').map((line, j, arr) => (
              <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
            ))}
          </p>
        ))
      ) : (
        <p className="st-muted">This store hasn&apos;t published a {meta.label.toLowerCase()} yet.</p>
      )}
    </div>
  )
}

export function NotFoundPage({ go }: { go?: (path: string) => void }) {
  return (
    <div className="st-section st-center st-404">
      <h1 className="st-h1">Page not found</h1>
      <p className="st-muted">The page you were looking for does not exist.</p>
      <button type="button" className="st-btn st-btn--primary" onClick={() => go?.('collections/all')}>Continue shopping</button>
    </div>
  )
}

export function ClosedStorePage({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  return (
    <div className="st-closed">
      <div className="st-closed-card">
        <p className="st-closed-kicker">Opening soon</p>
        <h1>This store doesn&apos;t exist yet</h1>
        <p>Create your Shopifly store to get a storefront at <strong>your-store.myshopifly.com</strong>.</p>
        <button type="button" className="st-btn st-btn--primary" onClick={onOpenAdmin}>Go to Shopifly</button>
      </div>
    </div>
  )
}
