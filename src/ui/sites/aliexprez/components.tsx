// AliExprez — shared presentational components (ax- prefix).
import type { MouseEvent, ReactNode } from 'react'
import { Heart, Play, Star, TrendingDown, TrendingUp, X, ZoomIn } from 'lucide-react'
import type { ProductDef } from '../../../core/types'
import { productImage } from '../../../core/assets'
import { act } from '../../../core/store'
import { usePauseWhileMounted } from '../../../core/ui'
import { toggleFavorite } from '../../../sim/market'
import { ImageWithFallback, Portal, cx, useLayer } from '../../kit/common'
import { NICHE_BY_ID, sizeSpec, specCallouts, splitPrice, usd, type Row } from './lib'

// ---------------------------------------------------------------------------
// Product shots: one supplier photo rendered with CSS "treatments" so a listing
// has a believable gallery (main, detail crop, lifestyle, colors, infographic,
// size chart, video).
// ---------------------------------------------------------------------------
export const SHOT_MAIN = 0
export const SHOT_DETAIL = 1
export const SHOT_LIFESTYLE = 2
export const SHOT_COLORS = 3
export const SHOT_FEATURES = 4
export const SHOT_SIZE = 5
export const SHOT_VIDEO = 6
export const GALLERY: number[] = [SHOT_VIDEO, SHOT_MAIN, SHOT_FEATURES, SHOT_DETAIL, SHOT_LIFESTYLE, SHOT_SIZE, SHOT_COLORS]

export function ProductShot({ p, variant = 0, className, rounded = 0, eager, playing = true }: {
  p: ProductDef; variant?: number; className?: string; rounded?: number; eager?: boolean; playing?: boolean
}) {
  const img = (cls?: string) => (
    <ImageWithFallback
      src={productImage(p.id)} alt={p.name} fit="contain" className={cx('ax-shot-img', cls)}
      loading={eager ? 'eager' : 'lazy'} style={{ aspectRatio: 'auto', background: 'transparent' }}
    />
  )
  const v = variant % 7
  return (
    <div className={cx('ax-shot', `ax-shot-v${v}`, className)} style={{ borderRadius: rounded }}>
      {v === SHOT_COLORS ? (
        <div className="ax-shot-grid">
          {[0, 1, 2, 3].map(i => <div key={i} className={`ax-shot-cell ax-shot-hue${i}`}>{img()}</div>)}
          <span className="ax-shot-banner">{p.variants.find(x => /colou?r/i.test(x.name))?.values.length ?? 4} options available</span>
        </div>
      ) : v === SHOT_FEATURES ? (
        <>
          <div className="ax-shot-head">{p.name.toUpperCase()}</div>
          <div className="ax-shot-feat-img">{img()}</div>
          <ul className="ax-shot-callouts">
            {specCallouts(p).map(c => <li key={c.k}><b>{c.k}</b><span>{c.v}</span></li>)}
          </ul>
        </>
      ) : v === SHOT_SIZE ? (
        <>
          <div className="ax-shot-size-img">{img()}</div>
          <span className="ax-dim ax-dim-h" />
          <span className="ax-dim ax-dim-v" />
          <span className="ax-shot-size-label">{sizeSpec(p) ?? `${Math.round(p.weightKg * 1000)} g`}</span>
          <span className="ax-shot-note">Please allow 1-2cm error due to manual measurement</span>
        </>
      ) : v === SHOT_VIDEO ? (
        <>
          <div className={cx('ax-shot-video', playing && 'ax-shot-video-on')}>{img()}</div>
          <span className="ax-shot-play"><Play size={14} fill="currentColor" /> 0:{String(12 + (p.id.length % 9) * 2).padStart(2, '0')}</span>
        </>
      ) : (
        <>
          {img()}
          {v === SHOT_DETAIL && <span className="ax-shot-zoom"><ZoomIn size={13} /> Details</span>}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------
export function Price({ amount, size = 'md', tone = 'red' }: { amount: number; size?: 'sm' | 'md' | 'lg' | 'xl'; tone?: 'red' | 'dark' }) {
  const { whole, cents } = splitPrice(amount)
  return (
    <span className={cx('ax-price', `ax-price-${size}`, tone === 'dark' && 'ax-price-dark')}>
      <span className="ax-price-cur">US $</span>
      <span className="ax-price-whole">{whole}</span>
      <span className="ax-price-cents">.{cents}</span>
    </span>
  )
}

export function ChoiceBadge({ small }: { small?: boolean }) {
  return <span className={cx('ax-choice', small && 'ax-choice-sm')} title="AliExprez Choice: faster consolidated shipping">Choice</span>
}

export function Rating({ value, count, size = 12 }: { value: number; count?: number; size?: number }) {
  return (
    <span className="ax-rating">
      <Star size={size} fill="currentColor" strokeWidth={0} />
      <b>{value.toFixed(1)}</b>
      {count !== undefined && <span className="ax-muted">({count.toLocaleString('en-US')})</span>}
    </span>
  )
}

/** Five-star row (AliExprez uses black stars). */
export function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="ax-stars" aria-label={`${value.toFixed(1)} out of 5`}>
      {[0, 1, 2, 3, 4].map(i => {
        const fill = Math.max(0, Math.min(1, value - i))
        return (
          <span key={i} className="ax-star" style={{ width: size, height: size }}>
            <Star size={size} strokeWidth={0} fill="#d9d9d9" />
            <span className="ax-star-fill" style={{ width: `${fill * 100}%` }}><Star size={size} strokeWidth={0} fill="currentColor" /></span>
          </span>
        )
      })}
    </span>
  )
}

export function TrendChip({ trend }: { trend: 'up' | 'flat' | 'down' | null | undefined }) {
  if (!trend || trend === 'flat') return null
  return trend === 'up'
    ? <span className="ax-trend ax-trend-up" title="Orders are trending up (research skill 3+)"><TrendingUp size={12} /> Trending</span>
    : <span className="ax-trend ax-trend-down" title="Orders are slowing down (research skill 3+)"><TrendingDown size={12} /> Cooling</span>
}

export function HeartButton({ id, active, count, className }: { id: string; active: boolean; count?: number; className?: string }) {
  const onClick = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    act(s => toggleFavorite(s, id))
  }
  return (
    <button type="button" className={cx('ax-heart', active && 'ax-heart-on', className)} onClick={onClick} aria-pressed={active} aria-label={active ? 'Remove from wishlist' : 'Add to wishlist'}>
      <Heart size={16} fill={active ? 'currentColor' : 'none'} />
      {count !== undefined && <span>{count.toLocaleString('en-US')}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Product card (search grid & rows)
// ---------------------------------------------------------------------------
export interface CardFlags { fav: boolean; imported?: boolean; sample?: 'owned' | 'shipping' }
export function ProductCard({ row, flags, onOpen, compact, deal }: {
  row: Row; flags: CardFlags; onOpen: (id: string) => void; compact?: boolean; deal?: boolean
}) {
  const { p, l } = row
  const disc = Math.round((l.discountPct ?? 1 - l.price / l.originalPrice) * 100)
  return (
    <div
      role="link"
      tabIndex={0}
      className={cx('ax-card', compact && 'ax-card-compact', deal && 'ax-card-deal')}
      onClick={() => onOpen(p.id)}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(p.id) }}
    >
      <div className="ax-card-media">
        <ProductShot p={p} variant={SHOT_MAIN} />
        <HeartButton id={p.id} active={flags.fav} className="ax-card-heart" />
        {l.newArrival && <span className="ax-card-flag">New</span>}
        {(flags.imported || flags.sample) && (
          <span className="ax-card-mine">{flags.imported ? 'In your store' : flags.sample === 'owned' ? 'Sample owned' : 'Sample ordered'}</span>
        )}
      </div>
      <div className="ax-card-body">
        {!deal && (
          <div className="ax-card-title">
            {l.choice && <ChoiceBadge small />}
            <span>{p.supplierTitle}</span>
          </div>
        )}
        <div className="ax-card-price">
          <Price amount={l.price} size={deal ? 'md' : 'md'} />
          <s className="ax-strike">{usd(l.originalPrice)}</s>
        </div>
        {deal ? (
          <div className="ax-card-dealrow"><span className="ax-off-pill">-{disc}%</span></div>
        ) : (
          <>
            <div className="ax-card-meta">
              <span className="ax-off">-{disc}%</span>
              <Rating value={l.rating} />
              <span className="ax-muted">{l.soldLabel}</span>
            </div>
            <div className="ax-card-ship">
              <span>+{usd(l.shipCost)} shipping{l.shipDays[1] <= 16 && <span className="ax-green"> · {l.shipDays[0]}–{l.shipDays[1]} days</span>}</span>
              <TrendChip trend={l.trend} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function SectionHead({ title, icon, extra, children }: { title: ReactNode; icon?: ReactNode; extra?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ax-sechead">
      <h2>{icon}{title}</h2>
      {children}
      {extra && <div className="ax-sechead-extra">{extra}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog (portal, pauses the game clock while open, Esc closes)
// ---------------------------------------------------------------------------
export function Dialog({ title, onClose, children, footer, width = 520 }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number
}) {
  usePauseWhileMounted('ax-dialog')
  useLayer(true, onClose)
  return (
    <Portal>
      <div className="ax-dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="ax-dialog" role="dialog" aria-modal="true" style={{ maxWidth: width }}>
          <div className="ax-dialog-head">
            <h3>{title}</h3>
            <button type="button" className="ax-dialog-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="ax-dialog-body">{children}</div>
          {footer && <div className="ax-dialog-foot">{footer}</div>}
        </div>
      </div>
    </Portal>
  )
}

export function NicheIcon({ niche, size = 18 }: { niche: ProductDef['niche']; size?: number }) {
  const Icon = NICHE_BY_ID[niche].icon
  return <Icon size={size} strokeWidth={1.75} />
}
