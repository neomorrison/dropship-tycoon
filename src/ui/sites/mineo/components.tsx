// Mineo — shared components (mi- prefix).
import { useState, type ReactNode } from 'react'
import { ArrowUpRight, Bookmark, CalendarDays, Heart, MessageCircle, Send } from 'lucide-react'
import type { Platform } from '../../../core/types'
import { productImage } from '../../../core/assets'
import { act } from '../../../core/store'
import { formatDate } from '../../../core/time'
import { toggleFavorite } from '../../../sim/market'
import { AdPreview } from '../../kit/phone'
import { ImageWithFallback, cx, tileColor, useElementWidth } from '../../kit/common'
import { PLATFORM_NAME, adCaption, adScript, advertiserDomain, isVideoFormat, previewPlatform, productLabel, socialCount, type FeedAd } from './data'

export function PlatformBadge({ platform, small }: { platform: Platform; small?: boolean }) {
  return (
    <span className={cx('mi-pf', `mi-pf-${platform}`, small && 'mi-pf-sm')}>
      <i>{platform === 'tiktak' ? '♪' : 'f'}</i>{!small && PLATFORM_NAME[platform]}
    </span>
  )
}

export function AdvAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const c = tileColor(name)
  return <span className="mi-adv-av" style={{ width: size, height: size, background: c.bg, color: c.fg }}>{name.charAt(0)}</span>
}

export function AdCard({ ad, today, onProduct, showProduct = true, width = 200 }: {
  ad: FeedAd; today: number; onProduct?: (id: string) => void; showProduct?: boolean; width?: number
}) {
  const [hover, setHover] = useState(false)
  const [mediaRef, mediaWidth] = useElementWidth<HTMLDivElement>()
  const previewWidth = mediaWidth ? Math.min(width, mediaWidth) : width
  const since = today - ad.daysRunning
  return (
    <article className="mi-adcard" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <header className="mi-adcard-head">
        <AdvAvatar name={ad.advertiser} />
        <div className="mi-adcard-who">
          <b>{ad.advertiser}</b>
          <span><i className="mi-live" /> Active · {advertiserDomain(ad.advertiser)}</span>
        </div>
        <PlatformBadge platform={ad.platform} small />
      </header>
      <div className="mi-adcard-media" ref={mediaRef} onClick={() => setHover(h => !h)}>
        <AdPreview
          platform={previewPlatform(ad)}
          productImage={productImage(ad.catalogId)}
          productName={productLabel(ad.product)}
          hookText={ad.hookText}
          caption={adCaption(ad)}
          script={adScript(ad)}
          brandName={ad.advertiser}
          domain={advertiserDomain(ad.advertiser)}
          headline={productLabel(ad.product)}
          linkDescription={ad.price ? `$${ad.price.toFixed(2)} · Free shipping` : 'Free shipping'}
          cta="Shop now"
          likes={ad.likes}
          comments={ad.comments}
          shares={ad.shares}
          isVideo={isVideoFormat(ad.format)}
          durationSec={15 + (ad.likes % 16)}
          frame={false}
          width={previewWidth}
          playing={hover}
        />
      </div>
      <div className="mi-adcard-stats">
        <span title="Likes"><Heart size={13} /> {socialCount(ad.likes)}</span>
        <span title="Comments"><MessageCircle size={13} /> {socialCount(ad.comments)}</span>
        <span title="Shares"><Send size={13} /> {socialCount(ad.shares)}</span>
      </div>
      <div className="mi-adcard-meta">
        <span className="mi-runs"><CalendarDays size={12} /> {ad.daysRunning} {ad.daysRunning === 1 ? 'day' : 'days'} · since {formatDate(since, 'md')}</span>
        <div className="mi-tags">
          <span className="mi-tag mi-tag-hook">{ad.hook}</span>
          {ad.format && <span className="mi-tag">{ad.format}</span>}
          {ad.price !== undefined && <span className="mi-tag mi-tag-price">${ad.price.toFixed(2)}</span>}
        </div>
      </div>
      {showProduct && onProduct && (
        <button type="button" className="mi-adcard-prod" onClick={() => onProduct(ad.catalogId)}>
          <ImageWithFallback src={productImage(ad.catalogId)} alt={ad.product.name} width={28} radius={6} fit="contain" style={{ background: '#fff' }} />
          <span>{productLabel(ad.product)}</span>
          <ArrowUpRight size={14} />
        </button>
      )}
    </article>
  )
}

export function WatchButton({ id, on, label = true }: { id: string; on: boolean; label?: boolean }) {
  return (
    <button type="button" className={cx('mi-btn', 'mi-btn-ghost', on && 'mi-btn-on')} onClick={() => act(s => toggleFavorite(s, id))} aria-pressed={on}>
      <Bookmark size={15} fill={on ? 'currentColor' : 'none'} />{label && (on ? 'Watching' : 'Watch')}
    </button>
  )
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' | 'flat' }) {
  return (
    <div className="mi-kpi">
      <span className="mi-kpi-label">{label}</span>
      <b className={cx('mi-kpi-value', tone && `mi-tone-${tone}`)}>{value}</b>
      {sub && <span className="mi-kpi-sub">{sub}</span>}
    </div>
  )
}

export function Panel({ title, extra, children, className }: { title: ReactNode; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mi-panel', className)}>
      <header className="mi-panel-head"><h3>{title}</h3>{extra}</header>
      {children}
    </section>
  )
}
