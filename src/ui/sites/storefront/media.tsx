// Product media rendering shared by the storefront and the Shopifly product editor.
// Supplier gallery photos are the same product shot with CSS "treatments" (crop, zoom,
// background) selected by MediaItem.variant; lifestyle / UGC / video media come from
// finished creatives and get a photographic look so they read as real-life content.
import { useState, type CSSProperties } from 'react'
import { Play } from 'lucide-react'
import type { MediaItem } from '../../../core/types'
import { tileColor, initials } from '../../kit/common'
import './media.css'

/** Number of distinct supplier-gallery treatments. */
export const SUPPLIER_VARIANTS = 6
export const SUPPLIER_VARIANT_LABELS = ['Front view', 'Close-up', 'Detail', 'Studio color', 'Reverse angle', 'Macro detail']

export interface MediaImageProps {
  item: Pick<MediaItem, 'kind' | 'src' | 'alt' | 'variant'>
  className?: string
  style?: CSSProperties
  /** show the play badge on videos (default true) */
  showBadges?: boolean
  /** small badges (thumbnails) */
  small?: boolean
  /** seed for the photo backdrop (e.g. media id) */
  seed?: string
  onClick?: () => void
}

function seedIndex(seed: string, n: number) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h) % n
}

/** Square media tile with the right treatment for its kind. */
export function MediaImage({ item, className, style, showBadges = true, small, seed, onClick }: MediaImageProps) {
  const [failed, setFailed] = useState(false)
  const kind = item.kind
  const v = kind === 'supplier' ? Math.abs(item.variant ?? 0) % SUPPLIER_VARIANTS : seedIndex(seed ?? item.src + item.alt, 4)
  const cls = ['st-media', `st-media--${kind}`, `st-media--v${v}`, small ? 'st-media--small' : '', onClick ? 'st-media--click' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  const tile = tileColor(item.alt || 'product')
  return (
    <div className={cls} style={style} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}>
      {failed || !item.src ? (
        <div className="st-media-fallback" style={{ background: tile.bg, color: tile.fg }}>
          <span>{initials(item.alt || 'Product')}</span>
        </div>
      ) : (
        <img className="st-media-img" src={item.src} alt={item.alt} loading="lazy" draggable={false} onError={() => setFailed(true)} />
      )}
      {(kind === 'lifestyle' || kind === 'ugc_photo' || kind === 'video' || kind === 'gif') && <span className="st-media-grain" aria-hidden />}
      {showBadges && kind === 'video' && (
        <span className="st-media-play" aria-label="Video">
          <Play size={small ? 10 : 18} fill="currentColor" />
        </span>
      )}
      {showBadges && kind === 'gif' && <span className="st-media-badge">GIF</span>}
    </div>
  )
}

export const MEDIA_KIND_LABEL: Record<MediaItem['kind'], string> = {
  supplier: 'Supplier photo',
  lifestyle: 'Lifestyle photo',
  ugc_photo: 'Customer photo',
  video: 'Video',
  gif: 'GIF',
}
