// Storefront product-page sections (theme blocks + app blocks). Each component renders
// one PageSection with typed settings; the Theme Editor reuses them for its live preview.
// `ctx.editor` renders dashed placeholders for sections that have nothing to show yet,
// so merchants can see where an empty section sits on the page.
import { useState, type ComponentType, type ReactNode } from 'react'
import {
  Award, BadgeCheck, BatteryCharging, Check, ChevronDown, Clock, CreditCard, Droplets, Feather, Flame, Gift, Headset, Heart,
  Leaf, Lock, Package, PackageCheck, Play, Recycle, Ruler, ShieldCheck, Smile, Sparkles, Star, ThumbsUp, Timer, Truck, Undo2,
  VolumeX, X, Zap, type LucideIcon,
} from 'lucide-react'
import type { SectionId } from '../../../core/types'
import {
  sectionSettings, TRUST_BADGE_LABELS, type AsSeenOnSettings, type BenefitsIconsSettings, type BundleOfferSettings,
  type ComparisonSettings, type CountdownSettings, type FaqSettings, type FounderNoteSettings, type FreeShippingBarSettings,
  type GuaranteeSettings, type HowItWorksSettings, type ReviewsSettings, type SectionSettingsMap, type ShippingInfoSettings,
  type SizeChartSettings, type StickyAtcSettings, type StockScarcitySettings, type TrustBadgeId, type TrustBadgesSettings,
  type UgcGallerySettings,
} from '../../../data/sections'
import { formatDate } from '../../../core/time'
import { money } from '../../../core/format'
import { Countdown, Stars, initials } from '../../kit/common'
import { MediaImage } from './media'
import { useStoreOverlay } from './overlay'
import { sampleReviews, starCounts } from './reviews'
import type { ProductModel, StoreView } from './view'
import { PAYMENT_LABELS } from '../../../sim/store'

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------
/**
 * Where a section renders on the product page:
 * 'offer'  — inside the product info column, above the buy buttons
 * 'assure' — inside the product info column, below the buy buttons
 * 'variant'— next to the variant picker (size chart link)
 * 'main'   — full-width sections below the product
 * 'overlay'— floating (sticky add to cart)
 */
export type SectionZone = 'offer' | 'assure' | 'variant' | 'main' | 'overlay'
export const SECTION_ZONE: Record<SectionId, SectionZone> = {
  countdown: 'offer', stock_scarcity: 'offer', bundle_offer: 'offer', free_shipping_bar: 'offer',
  trust_badges: 'assure', shipping_info: 'assure', guarantee: 'assure',
  size_chart: 'variant',
  reviews: 'main', faq: 'main', benefits_icons: 'main', how_it_works: 'main', comparison: 'main', ugc_gallery: 'main',
  founder_note: 'main', as_seen_on: 'main',
  sticky_atc: 'overlay',
}

/** Icons offered for benefit rows (lucide names stored in settings). */
export const BENEFIT_ICONS: Record<string, LucideIcon> = {
  Sparkles, ShieldCheck, Truck, Heart, Leaf, Zap, Clock, Smile, ThumbsUp, Recycle, Droplets, Feather, BatteryCharging, VolumeX,
  Package, Award, Star, Gift, Timer, BadgeCheck,
}
export const benefitIcon = (name: string): LucideIcon => BENEFIT_ICONS[name] ?? Sparkles

const TRUST_ICONS: Record<TrustBadgeId, LucideIcon> = {
  secure_checkout: Lock, money_back: BadgeCheck, free_returns: Undo2, fast_shipping: Truck, support_247: Headset, made_safe: ShieldCheck,
}

// ---------------------------------------------------------------------------
// Context shared by the product page and its sections
// ---------------------------------------------------------------------------
export interface PageCtx {
  view: StoreView
  model: ProductModel
  /** quantity chosen (bundle tier or quantity picker) */
  qty: number
  setQty: (n: number) => void
  onAddToCart: () => void
  /** Theme Editor preview: placeholders for empty sections, no navigation */
  editor: boolean
}

export interface SectionProps<K extends SectionId> {
  settings: SectionSettingsMap[K]
  ctx: PageCtx
}

function Placeholder({ ctx, children }: { ctx: PageCtx; children: ReactNode }) {
  if (!ctx.editor) return null
  return <div className="st-placeholder">{children}</div>
}

const dayLabel = (day: number) => `${formatDate(day, 'medium').split(',')[0]}, ${formatDate(day, 'md')}`

// ---------------------------------------------------------------------------
// Offer blocks (above the buy buttons)
// ---------------------------------------------------------------------------
function CountdownBlock({ settings }: SectionProps<'countdown'>) {
  const mins = Math.max(1, Math.round(settings.minutes || 15))
  return (
    <div className="st-countdown">
      <span className="st-countdown-label"><Timer size={16} /> {settings.text || 'Sale ends in'}</span>
      <Countdown secondsLeft={mins * 60} live loop format="boxes" />
    </div>
  )
}

function StockScarcityBlock({ settings }: SectionProps<'stock_scarcity'>) {
  const n = Math.max(1, Math.round(settings.unitsLeft || 7))
  const pct = Math.max(6, Math.min(100, (n / 40) * 100))
  return (
    <div className="st-scarcity">
      <p><Flame size={15} /> Hurry! Only <strong>{n}</strong> left in stock</p>
      <div className="st-scarcity-bar"><span style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

function BundleOfferBlock({ settings, ctx }: SectionProps<'bundle_offer'>) {
  const tiers = [...settings.tiers].filter(t => t.qty >= 1).sort((a, b) => a.qty - b.qty)
  if (!tiers.length) return <Placeholder ctx={ctx}>Add quantity-break tiers in the section settings.</Placeholder>
  const price = ctx.model.price
  const selected = tiers.some(t => t.qty === ctx.qty) ? ctx.qty : tiers[0].qty
  return (
    <div className="st-bundles">
      <div className="st-bundles-head"><span>Bundle &amp; save</span></div>
      {tiers.map(t => {
        const total = price * t.qty * (1 - Math.max(0, Math.min(60, t.discountPct)) / 100)
        const on = selected === t.qty
        return (
          <button key={t.qty} type="button" className={`st-bundle${on ? ' is-on' : ''}`} onClick={() => ctx.setQty(t.qty)}>
            {t.badge && <span className="st-bundle-badge">{t.badge}</span>}
            <span className="st-bundle-radio" aria-hidden />
            <span className="st-bundle-main">
              <strong>{t.label || `Buy ${t.qty}`}</strong>
              {t.qty > 1 && <small>{money(total / t.qty)} each</small>}
            </span>
            <span className="st-bundle-price">
              <strong>{money(total)}</strong>
              {t.discountPct > 0 && <s>{money(price * t.qty)}</s>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FreeShippingBarBlock({ settings, ctx }: SectionProps<'free_shipping_bar'>) {
  const sh = ctx.view.shipping
  if (sh.freeShipping) {
    return (
      <div className="st-fsbar is-done">
        <p><PackageCheck size={15} /> Free shipping on every order</p>
        <div className="st-fsbar-track"><span style={{ width: '100%' }} /></div>
      </div>
    )
  }
  const threshold = sh.freeOver ?? settings.threshold
  const cart = ctx.model.price * Math.max(1, ctx.qty)
  const left = Math.max(0, threshold - cart)
  return (
    <div className={`st-fsbar${left <= 0 ? ' is-done' : ''}`}>
      <p>
        <Truck size={15} />{' '}
        {left <= 0 ? <>You&apos;ve unlocked <strong>free shipping</strong>!</> : <>You&apos;re <strong>{money(left)}</strong> away from free shipping</>}
      </p>
      <div className="st-fsbar-track"><span style={{ width: `${Math.min(100, (cart / Math.max(1, threshold)) * 100)}%` }} /></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Assurance blocks (below the buy buttons)
// ---------------------------------------------------------------------------
export function TrustBadgesBlock({ settings, ctx }: SectionProps<'trust_badges'>) {
  const badges = settings.badges.length ? settings.badges : (['secure_checkout', 'money_back', 'free_returns'] as TrustBadgeId[])
  const pm = ctx.view.payments
  return (
    <div className="st-trust">
      <div className="st-trust-badges">
        {badges.map(b => {
          const I = TRUST_ICONS[b]
          return (
            <div key={b} className="st-trust-badge">
              <I size={22} strokeWidth={1.6} />
              <span>{TRUST_BADGE_LABELS[b]}</span>
            </div>
          )
        })}
      </div>
      <div className="st-trust-pay">
        <span className="st-trust-pay-label">Guaranteed safe &amp; secure checkout</span>
        <div className="st-paychips">
          <span className="st-paychip"><CreditCard size={13} /> Card</span>
          {pm.shopPay && <span className="st-paychip st-paychip--shop">{PAYMENT_LABELS.shopPay}</span>}
          {pm.paypal && <span className="st-paychip st-paychip--pp">{PAYMENT_LABELS.paypal}</span>}
          {pm.bnpl && <span className="st-paychip st-paychip--bnpl">Klarno.</span>}
        </div>
      </div>
    </div>
  )
}

function ShippingInfoBlock({ settings, ctx }: SectionProps<'shipping_info'>) {
  const min = settings.minDays
  const max = settings.maxDays
  const has = min != null && max != null && min > 0 && max >= min
  return (
    <div className="st-shipinfo">
      <Truck size={20} strokeWidth={1.6} />
      <div>
        {has ? (
          <p>
            <strong>Estimated delivery:</strong> {dayLabel(ctx.view.day + (min as number))} – {dayLabel(ctx.view.day + (max as number))}
          </p>
        ) : ctx.editor && !settings.text ? (
          <p className="st-muted">Set a delivery window in the section settings.</p>
        ) : null}
        {settings.text && <p className="st-muted">{settings.text}</p>}
      </div>
    </div>
  )
}

function GuaranteeBlock({ settings }: SectionProps<'guarantee'>) {
  const days = Math.max(1, Math.round(settings.days || 30))
  return (
    <div className="st-guarantee">
      <div className="st-guarantee-seal" aria-hidden>
        <strong>{days}</strong>
        <span>DAY</span>
      </div>
      <div>
        <p className="st-guarantee-title">{days}-Day Money-Back Guarantee</p>
        {settings.text && <p className="st-muted">{settings.text}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Size chart (link + drawer next to the variant picker)
// ---------------------------------------------------------------------------
function SizeChartDialog({ settings, onClose }: { settings: SizeChartSettings; onClose: () => void }) {
  const cols = settings.columns.filter(Boolean)
  const rows = settings.rows.filter(r => r.size.trim())
  return (
    <div className="st-sizechart" role="dialog" aria-label="Size guide">
      <div className="st-sizechart-head">
        <h3>Size guide</h3>
        <button type="button" className="st-iconbtn" aria-label="Close" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="st-sizechart-scroll">
        <table>
          <thead>
            <tr>
              <th>Size</th>
              {cols.map(c => <th key={c}>{c} ({settings.unit})</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><strong>{r.size}</strong></td>
                {cols.map((c, j) => <td key={c}>{r.values[j] || '–'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="st-muted st-small">Measurements are approximate. Between sizes? Size up.</p>
    </div>
  )
}

export function SizeChartLink({ settings, ctx }: SectionProps<'size_chart'>) {
  const show = useStoreOverlay()
  const rows = settings.rows.filter(r => r.size.trim())
  if (!rows.length) return <Placeholder ctx={ctx}>Add sizes in the size chart settings.</Placeholder>
  return (
    <button type="button" className="st-linkbtn st-sizelink" onClick={() => show?.(<SizeChartDialog settings={settings} onClose={() => show?.(null)} />)}>
      <Ruler size={15} /> Size guide
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main sections (full width, below the product)
// ---------------------------------------------------------------------------
function ReviewsSection({ settings, ctx }: SectionProps<'reviews'>) {
  const p = ctx.model.product
  const { count, avg, photos } = p.reviews
  const [pages, setPages] = useState(1)
  const perPage = settings.layout === 'grid' ? 6 : 5
  const reviews = count > 0 ? Array.from({ length: pages }, (_, i) => sampleReviews(p, ctx.model.def, perPage, i)).flat() : []
  const counts = starCounts(count, avg)
  const app = ctx.view.reviewsApp
  const starColor = app === 'lookz' ? '#e8a723' : app === 'vitalz' ? '#ff9f1c' : '#108474'
  const photoMedia = { kind: 'ugc_photo' as const, src: p.media[0]?.src ?? '', alt: p.title }
  return (
    <section className={`st-section st-reviews st-reviews--${settings.layout} st-reviews--${app ?? 'none'}`}>
      <h2 className="st-h2 st-center">Customer Reviews</h2>
      {count <= 0 ? (
        <div className="st-reviews-empty">
          <Stars rating={0} size={18} color={starColor} />
          <p>No reviews yet</p>
          <button type="button" className="st-btn st-btn--secondary st-btn--small">Be the first to write a review</button>
        </div>
      ) : (
        <>
          <div className="st-reviews-summary">
            <div className="st-reviews-avg">
              <Stars rating={avg} size={20} color={starColor} />
              <p><strong>{avg.toFixed(2)}</strong> out of 5</p>
              <p className="st-muted">Based on {count.toLocaleString('en-US')} review{count === 1 ? '' : 's'}</p>
            </div>
            <div className="st-reviews-dist">
              {[5, 4, 3, 2, 1].map(k => (
                <div key={k} className="st-reviews-row">
                  <Stars rating={k} size={12} color={starColor} />
                  <span className="st-reviews-bar"><span style={{ width: `${count ? (counts[k] / count) * 100 : 0}%`, background: starColor }} /></span>
                  <span className="st-reviews-n">{counts[k]}</span>
                </div>
              ))}
            </div>
            <div className="st-reviews-cta">
              <button type="button" className="st-btn st-btn--primary st-btn--small" style={{ background: starColor, borderColor: starColor }}>Write a review</button>
            </div>
          </div>
          {settings.showPhotos && photos > 0 && (
            <div className="st-reviews-photos">
              {Array.from({ length: Math.min(photos, 8) }, (_, i) => (
                <MediaImage key={i} item={photoMedia} seed={`${p.id}-ph${i}`} showBadges={false} className="st-reviews-photo" />
              ))}
              {photos > 8 && <span className="st-reviews-more">+{photos - 8}</span>}
            </div>
          )}
          <div className="st-reviews-list">
            {reviews.map(r => (
              <article key={r.id} className="st-review">
                <div className="st-review-head">
                  <span className="st-review-avatar">{initials(r.name.replace(/\*+/g, ''))}</span>
                  <div>
                    <p className="st-review-name">
                      {r.name} {r.verified && <span className="st-review-verified"><BadgeCheck size={12} /> Verified Buyer</span>}
                    </p>
                    <p className="st-muted st-small">{r.location}</p>
                  </div>
                  <span className="st-muted st-small st-review-date">{r.daysAgo <= 0 ? 'Today' : `${r.daysAgo} day${r.daysAgo === 1 ? '' : 's'} ago`}</span>
                </div>
                <Stars rating={r.stars} size={14} color={starColor} />
                <p className="st-review-title">{r.title}</p>
                <p className="st-review-body">{r.body}</p>
                {r.variant && <p className="st-muted st-small">Variant: {r.variant}</p>}
                {settings.showPhotos && r.photo && (
                  <MediaImage item={photoMedia} seed={r.id} showBadges={false} className="st-review-photo" />
                )}
              </article>
            ))}
          </div>
          {reviews.length < count && (
            <div className="st-center">
              <button type="button" className="st-btn st-btn--secondary st-btn--small" onClick={() => setPages(n => n + 1)}>Show more reviews</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function FaqSection({ settings, ctx }: SectionProps<'faq'>) {
  const items = settings.items.filter(i => i.q.trim())
  const [open, setOpen] = useState<number | null>(0)
  if (!items.length) return <Placeholder ctx={ctx}>FAQ: add questions and answers in the section settings.</Placeholder>
  return (
    <section className="st-section st-faq">
      <h2 className="st-h2 st-center">Frequently asked questions</h2>
      <div className="st-faq-list">
        {items.map((it, i) => (
          <div key={i} className={`st-faq-item${open === i ? ' is-open' : ''}`}>
            <button type="button" className="st-faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span>{it.q}</span>
              <ChevronDown size={18} />
            </button>
            {open === i && <div className="st-faq-a">{it.a || <span className="st-muted">No answer yet.</span>}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

function BenefitsIconsSection({ settings, ctx }: SectionProps<'benefits_icons'>) {
  const items = settings.items.filter(i => i.title.trim()).slice(0, 4)
  if (!items.length) return <Placeholder ctx={ctx}>Benefit icons: add 3–4 benefits in the section settings.</Placeholder>
  return (
    <section className="st-section st-benefits">
      <div className="st-benefits-grid" data-n={items.length}>
        {items.map((it, i) => {
          const I = benefitIcon(it.icon)
          return (
            <div key={i} className="st-benefit">
              <span className="st-benefit-icon"><I size={26} strokeWidth={1.6} /></span>
              <p className="st-benefit-title">{it.title}</p>
              {it.text && <p className="st-muted">{it.text}</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function HowItWorksSection({ settings, ctx }: SectionProps<'how_it_works'>) {
  const steps = settings.steps.filter(s => s.title.trim()).slice(0, 5)
  if (!steps.length) return <Placeholder ctx={ctx}>How it works: add 3 simple steps in the section settings.</Placeholder>
  return (
    <section className="st-section st-how">
      <h2 className="st-h2 st-center">How it works</h2>
      <ol className="st-how-steps" data-n={steps.length}>
        {steps.map((s, i) => (
          <li key={i} className="st-how-step">
            <span className="st-how-num">{i + 1}</span>
            <p className="st-how-title">{s.title}</p>
            {s.text && <p className="st-muted">{s.text}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function ComparisonSection({ settings, ctx }: SectionProps<'comparison'>) {
  const rows = settings.rows.filter(r => r.feature.trim())
  if (!rows.length) return <Placeholder ctx={ctx}>Us vs. them: add comparison rows in the section settings.</Placeholder>
  const mark = (on: boolean) => (on ? <span className="st-cmp-yes"><Check size={16} strokeWidth={3} /></span> : <span className="st-cmp-no"><X size={16} strokeWidth={3} /></span>)
  return (
    <section className="st-section st-compare">
      <h2 className="st-h2 st-center">Why we&apos;re different</h2>
      <table className="st-cmp">
        <thead>
          <tr>
            <th />
            <th className="st-cmp-us">{ctx.view.logoText}</th>
            <th>{settings.themLabel || 'Others'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.feature}</td>
              <td className="st-cmp-us">{mark(r.us)}</td>
              <td>{mark(r.them)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function UgcGallerySection({ settings, ctx }: SectionProps<'ugc_gallery'>) {
  const p = ctx.model.product
  const chosen = settings.creativeIds.length ? ctx.model.creatives.filter(c => settings.creativeIds.includes(c.id)) : ctx.model.creatives.filter(c => c.producer !== 'supplier_edit')
  const photos = p.media.filter(m => m.kind === 'ugc_photo')
  const tiles = [
    ...chosen.map(c => ({ key: c.id, item: { kind: c.isVideo ? ('video' as const) : ('ugc_photo' as const), src: c.thumb, alt: c.name }, label: c.producer === 'ugc' ? 'Creator video' : 'Customer' })),
    ...photos.map(m => ({ key: m.id, item: m, label: 'Customer photo' })),
  ].slice(0, 8)
  if (!tiles.length) return <Placeholder ctx={ctx}>Customer photos &amp; videos: needs UGC content for this product.</Placeholder>
  return (
    <section className="st-section st-ugc">
      <h2 className="st-h2 st-center">Real customers, real results</h2>
      <div className="st-ugc-grid">
        {tiles.map(t => (
          <figure key={t.key} className="st-ugc-tile">
            <MediaImage item={t.item} seed={t.key} />
            <figcaption>{t.item.kind === 'video' ? <Play size={11} fill="currentColor" /> : <Heart size={11} />} {t.label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

function FounderNoteSection({ settings, ctx }: SectionProps<'founder_note'>) {
  if (!settings.text.trim()) return <Placeholder ctx={ctx}>Founder note: write a short personal note in the section settings.</Placeholder>
  const name = settings.name.trim() || 'The founder'
  return (
    <section className="st-section st-founder">
      <div className="st-founder-card">
        <span className="st-founder-avatar">{initials(name)}</span>
        <div>
          <p className="st-founder-kicker">A note from our founder</p>
          <blockquote>“{settings.text.trim()}”</blockquote>
          <p className="st-founder-sign">{name}, founder of {ctx.view.name}</p>
        </div>
      </div>
    </section>
  )
}

const OUTLET_STYLES = ['serif', 'caps', 'italic', 'condensed', 'mono', 'script']
function AsSeenOnSection({ settings, ctx }: SectionProps<'as_seen_on'>) {
  const outlets = settings.outlets.map(o => o.trim()).filter(Boolean).slice(0, 6)
  if (!outlets.length) return <Placeholder ctx={ctx}>As seen on: add publication names in the section settings.</Placeholder>
  return (
    <section className="st-section st-seen">
      <p className="st-seen-label">As seen on</p>
      <div className="st-seen-row">
        {outlets.map((o, i) => <span key={o} className={`st-seen-logo st-seen-logo--${OUTLET_STYLES[i % OUTLET_STYLES.length]}`}>{o}</span>)}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Sticky add to cart
// ---------------------------------------------------------------------------
export function StickyAtcBar({ settings, ctx, visible }: SectionProps<'sticky_atc'> & { visible: boolean }) {
  const p = ctx.model.product
  return (
    <div className={`st-sticky${visible ? ' is-visible' : ''}`} aria-hidden={!visible}>
      <div className="st-sticky-inner">
        {p.media[0] && <MediaImage item={p.media[0]} small showBadges={false} className="st-sticky-thumb" />}
        <div className="st-sticky-text">
          <p className="st-sticky-title">{p.title || 'Untitled product'}</p>
          {settings.showPrice && <p className="st-sticky-price">{money(ctx.model.price * Math.max(1, ctx.qty))}</p>}
        </div>
        <button type="button" className="st-btn st-btn--primary" onClick={ctx.onAddToCart}>Add to cart</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
const REGISTRY: { [K in SectionId]?: ComponentType<SectionProps<K>> } = {
  countdown: CountdownBlock,
  stock_scarcity: StockScarcityBlock,
  bundle_offer: BundleOfferBlock,
  free_shipping_bar: FreeShippingBarBlock,
  trust_badges: TrustBadgesBlock,
  shipping_info: ShippingInfoBlock,
  guarantee: GuaranteeBlock,
  size_chart: SizeChartLink,
  reviews: ReviewsSection,
  faq: FaqSection,
  benefits_icons: BenefitsIconsSection,
  how_it_works: HowItWorksSection,
  comparison: ComparisonSection,
  ugc_gallery: UgcGallerySection,
  founder_note: FounderNoteSection,
  as_seen_on: AsSeenOnSection,
}

/** Render one section of the product page with its typed settings. */
export function SectionView({ id, settings, ctx }: { id: SectionId; settings: Record<string, unknown> | undefined; ctx: PageCtx }) {
  const C = REGISTRY[id] as ComponentType<{ settings: unknown; ctx: PageCtx }> | undefined
  if (!C) return null
  return <C settings={sectionSettings(id, settings)} ctx={ctx} />
}

/** Section components by id, for custom layouts (Theme Editor previews, docs). */
export const SECTION_COMPONENTS = {
  countdown: CountdownBlock,
  stock_scarcity: StockScarcityBlock,
  bundle_offer: BundleOfferBlock,
  free_shipping_bar: FreeShippingBarBlock,
  trust_badges: TrustBadgesBlock,
  shipping_info: ShippingInfoBlock,
  guarantee: GuaranteeBlock,
  size_chart: SizeChartLink,
  reviews: ReviewsSection,
  faq: FaqSection,
  benefits_icons: BenefitsIconsSection,
  how_it_works: HowItWorksSection,
  comparison: ComparisonSection,
  ugc_gallery: UgcGallerySection,
  founder_note: FounderNoteSection,
  as_seen_on: AsSeenOnSection,
  sticky_atc: StickyAtcBar,
} as const

// re-exported settings types for editors
export type {
  AsSeenOnSettings, BenefitsIconsSettings, BundleOfferSettings, ComparisonSettings, CountdownSettings, FaqSettings, FounderNoteSettings,
  FreeShippingBarSettings, GuaranteeSettings, HowItWorksSettings, ReviewsSettings, ShippingInfoSettings, SizeChartSettings,
  StickyAtcSettings, StockScarcitySettings, TrustBadgesSettings, UgcGallerySettings,
}
