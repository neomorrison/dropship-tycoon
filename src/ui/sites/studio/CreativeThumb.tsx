// Lightweight 9:16 creative thumbnail for library cards (the full AdPreview is reserved for detail views).
import { Clapperboard, GalleryVerticalEnd, Image as ImageIcon, Loader2, Play, Truck, XCircle } from 'lucide-react'
import type { Creative } from '../../../core/types'
import { cx, ImageWithFallback } from '../../kit/common'
import { fmtClip } from './helpers'

export function CreativeThumb({ c, width = 96, label }: { c: Creative; width?: number; label?: string }) {
  const still = !c.isVideo
  const pending = c.status === 'in_production' || c.status === 'waiting_sample'
  return (
    <div className={cx('ch-thumb', pending && 'is-pending', c.status === 'failed' && 'is-failed')} style={{ width }}>
      <ImageWithFallback src={c.thumb} alt={c.name} fallbackLabel={label ?? c.name} height="100%" style={{ width: '100%', height: '100%' }} />
      <span className="ch-thumb-shade" aria-hidden />
      {c.hookText.trim() && <span className="ch-thumb-hook">{c.hookText.trim()}</span>}
      <span className="ch-thumb-foot">
        {c.format === 'carousel' ? <GalleryVerticalEnd size={11} /> : still ? <ImageIcon size={11} /> : <Play size={10} fill="currentColor" strokeWidth={0} />}
        {still ? (c.format === 'carousel' ? 'Carousel' : 'Image') : fmtClip(c.durationSec || 15)}
      </span>
      {pending && (
        <span className="ch-thumb-state">
          {c.status === 'waiting_sample' ? <Truck size={16} /> : c.producer === 'self' || c.producer === 'supplier_edit' ? <Clapperboard size={16} /> : <Loader2 size={16} className="ch-spin" />}
        </span>
      )}
      {c.status === 'failed' && <span className="ch-thumb-state"><XCircle size={16} /></span>}
    </div>
  )
}
