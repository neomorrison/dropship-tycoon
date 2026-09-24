// Storefront chrome: announcement bar, header, footer (policies, payment methods),
// cart drawer. Shared by the live storefront site and the Theme Editor preview.
import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, CreditCard, Menu, Search, ShoppingBag, User, X } from 'lucide-react'
import { money } from '../../../core/format'
import { yearOf } from '../../../core/time'
import { PAYMENT_LABELS } from '../../../sim/store'
import { MediaImage } from './media'
import type { CartLine, EditorBridge } from './ProductPage'
import { OverlayCtx, OverlayHost } from './overlay'
import { themeStyle } from './theme'
import type { StoreView } from './view'
import './storefront.css'

export const POLICY_PAGES = [
  { key: 'refund', label: 'Refund policy' },
  { key: 'shipping', label: 'Shipping policy' },
  { key: 'privacy', label: 'Privacy policy' },
  { key: 'terms', label: 'Terms of service' },
  { key: 'contact', label: 'Contact information' },
] as const
export type PolicyKey = (typeof POLICY_PAGES)[number]['key']

function EditorFrame({ id, label, editor, children }: { id: string; label: string; editor?: EditorBridge | null; children: ReactNode }) {
  if (!editor) return <>{children}</>
  return (
    <div className={`st-frame${editor.selected === id ? ' is-selected' : ''}`} data-st-block={id} onClick={e => { e.stopPropagation(); editor.onSelect(id) }}>
      {children}
      <span className="st-frame-label">{label}</span>
    </div>
  )
}

export interface StoreChromeProps {
  view: StoreView
  children: ReactNode
  /** site navigation (undefined in the Theme Editor preview) */
  navigate?: (path: string) => void
  cart?: CartLine[]
  onOpenCart?: () => void
  editor?: EditorBridge | null
  /** narrow (phone) layout regardless of container width */
  mobile?: boolean
  /** content pinned above the announcement bar (owner preview bar) */
  topBar?: ReactNode
  /** site-level overlay (cart drawer); sections open their own through useStoreOverlay */
  overlay?: ReactNode | null
  onOverlayClose?: () => void
}

export function StoreChrome({ view, children, navigate, cart = [], onOpenCart, editor, mobile, topBar, overlay, onOverlayClose }: StoreChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [inner, setInner] = useState<ReactNode | null>(null)
  const show = useCallback((node: ReactNode | null) => setInner(node), [])
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const go = (path: string) => (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.()
    setMenuOpen(false)
    navigate?.(path)
  }
  const count = cart.reduce((a, l) => a + l.qty, 0)
  const t = view.theme
  const subscribe = (e: FormEvent) => {
    e.preventDefault()
    if (/.+@.+\..+/.test(email)) setSubscribed(true)
  }
  const pm = view.payments
  return (
    <OverlayCtx.Provider value={show}>
    <div className={`st-root st-theme--${t.id} st-style--${t.look.style}${t.dark ? ' st-dark' : ''}${t.look.caps ? ' st-caps' : ''}${mobile ? ' st-mobile' : ''}`} style={themeStyle(t)}>
      <OverlayHost content={inner ?? overlay ?? null} onClose={() => (inner ? setInner(null) : onOverlayClose?.())} />
      {topBar}
      {view.announcement.trim() && (
        <EditorFrame id="announcement" label="Announcement bar" editor={editor}>
          <div className="st-announcement">{view.announcement}</div>
        </EditorFrame>
      )}
      <EditorFrame id="header" label="Header" editor={editor}>
        <header className={`st-header st-header--${t.look.logoAlign}`}>
          <button type="button" className="st-iconbtn st-header-menu" aria-label="Menu" onClick={() => setMenuOpen(o => !o)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <a href="#" className="st-logo" onClick={go('')}>{view.logoText || view.name}</a>
          <nav className="st-nav">
            <a href="#" onClick={go('')}>Home</a>
            <a href="#" onClick={go('collections/all')}>Catalog</a>
            <a href="#" onClick={go('policies/contact')}>Contact</a>
          </nav>
          <div className="st-header-icons">
            <button type="button" className="st-iconbtn st-hide-mobile" aria-label="Search" onClick={go('collections/all')}><Search size={20} /></button>
            <button type="button" className="st-iconbtn st-hide-mobile" aria-label="Account"><User size={20} /></button>
            <button type="button" className="st-iconbtn st-cart-btn" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`} onClick={() => onOpenCart?.()}>
              <ShoppingBag size={20} />
              {count > 0 && <span className="st-cart-count">{count}</span>}
            </button>
          </div>
        </header>
        {menuOpen && (
          <nav className="st-mobile-menu">
            <a href="#" onClick={go('')}>Home</a>
            <a href="#" onClick={go('collections/all')}>Catalog</a>
            <a href="#" onClick={go('policies/contact')}>Contact</a>
          </nav>
        )}
      </EditorFrame>

      <main className="st-main">{children}</main>

      <EditorFrame id="footer" label="Footer" editor={editor}>
        <footer className="st-footer">
          <div className="st-footer-top">
            <div className="st-footer-col">
              <p className="st-footer-h">Quick links</p>
              <a href="#" onClick={go('collections/all')}>Search</a>
              {POLICY_PAGES.map(pg => <a key={pg.key} href="#" onClick={go(`policies/${pg.key}`)}>{pg.label}</a>)}
            </div>
            <div className="st-footer-col st-footer-news">
              <p className="st-footer-h">Subscribe to our emails</p>
              <p className="st-muted">Be the first to know about new collections and exclusive offers.</p>
              {subscribed ? (
                <p className="st-footer-thanks">Thanks for subscribing!</p>
              ) : (
                <form className="st-news" onSubmit={subscribe}>
                  <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email" />
                  <button type="submit" aria-label="Subscribe"><ArrowRight size={16} /></button>
                </form>
              )}
            </div>
          </div>
          <div className="st-footer-bottom">
            <div className="st-paychips">
              <span className="st-paychip"><CreditCard size={13} /> Cards</span>
              {pm.shopPay && <span className="st-paychip st-paychip--shop">{PAYMENT_LABELS.shopPay}</span>}
              {pm.paypal && <span className="st-paychip st-paychip--pp">{PAYMENT_LABELS.paypal}</span>}
              {pm.bnpl && <span className="st-paychip st-paychip--bnpl">Klarno.</span>}
            </div>
            <p className="st-copyright">
              © {yearOf(view.day)}, {view.name} · Powered by Shopifly
            </p>
          </div>
        </footer>
      </EditorFrame>
    </div>
    </OverlayCtx.Provider>
  )
}

// ---------------------------------------------------------------------------
// Cart drawer
// ---------------------------------------------------------------------------
export function CartDrawer({
  lines, view, onClose, onChangeQty, checkoutNotice, onCheckout,
}: {
  lines: CartLine[]
  view: StoreView
  onClose: () => void
  onChangeQty: (index: number, qty: number) => void
  checkoutNotice: boolean
  onCheckout: () => void
}) {
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0)
  const sh = view.shipping
  const shipNote = sh.freeShipping || (sh.freeOver != null && subtotal >= sh.freeOver)
    ? 'Free shipping'
    : `Shipping: ${money(sh.flatRate)}${sh.freeOver != null ? ` (free over ${money(sh.freeOver)})` : ''}`
  return (
    <aside className="st-cart" role="dialog" aria-label="Your cart">
        <div className="st-cart-head">
          <h2>Your cart</h2>
          <button type="button" className="st-iconbtn" aria-label="Close cart" onClick={onClose}><X size={20} /></button>
        </div>
        {lines.length === 0 ? (
          <div className="st-cart-empty">
            <p>Your cart is empty</p>
            <button type="button" className="st-btn st-btn--primary" onClick={onClose}>Continue shopping</button>
          </div>
        ) : (
          <>
            <div className="st-cart-lines">
              {lines.map((l, i) => (
                <div key={`${l.productId}-${l.variant}-${i}`} className="st-cart-line">
                  {l.media ? <MediaImage item={l.media} small showBadges={false} className="st-cart-thumb" /> : <div className="st-cart-thumb" />}
                  <div className="st-cart-info">
                    <p className="st-cart-title">{l.title}</p>
                    {l.variant && <p className="st-muted st-small">{l.variant}</p>}
                    <div className="st-qty st-qty--small">
                      <button type="button" aria-label="Decrease" onClick={() => onChangeQty(i, l.qty - 1)}>−</button>
                      <span>{l.qty}</span>
                      <button type="button" aria-label="Increase" onClick={() => onChangeQty(i, l.qty + 1)}>+</button>
                    </div>
                  </div>
                  <p className="st-cart-price">{money(l.lineTotal)}</p>
                </div>
              ))}
            </div>
            <div className="st-cart-foot">
              <div className="st-cart-row"><span>Subtotal</span><strong>{money(subtotal)} USD</strong></div>
              <p className="st-muted st-small">{shipNote}. Taxes and discounts calculated at checkout.</p>
              {checkoutNotice && (
                <p className="st-cart-notice">
                  You&apos;re browsing your own store as the owner, so checkout is turned off. Real shoppers&apos; orders show up in Shopifly → Orders.
                </p>
              )}
              <button type="button" className="st-btn st-btn--primary st-btn--full" onClick={onCheckout}>Check out</button>
            </div>
          </>
        )}
    </aside>
  )
}
