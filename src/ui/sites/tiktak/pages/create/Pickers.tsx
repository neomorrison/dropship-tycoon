// Video (creative library) and TikTak post pickers used by the ad step and Spark Ads.
import { Check, Eye, Heart, Play } from 'lucide-react'
import type { Creative, GameState, OrganicPost } from '../../../../../core/types'
import { productImage } from '../../../../../core/assets'
import { formatName } from '../../../../../data/creativeTaxonomy'
import { ImageWithFallback, cx, formatSocialCount } from '../../../../kit/common'
import { creativeFormatLabel } from '../../data'

export function creativeThumb(c: Creative): string {
  return c.thumb || productImage(c.catalogId)
}

export function CreativeTile({ c, on, disabled, onClick, meta }: { c: Creative; on: boolean; disabled?: boolean; onClick: () => void; meta?: string }) {
  return (
    <button type="button" className={cx('tt-pick', on && 'tt-pick-on')} disabled={disabled} onClick={onClick} aria-pressed={on} title={c.name}>
      <span className="tt-pick-thumb">
        <ImageWithFallback src={creativeThumb(c)} alt={c.name} fallbackLabel={c.name} fallbackEmoji="🎬" height="100%" width="100%" />
        {c.hookText && <span className="tt-lib-thumb-hook" style={{ fontSize: 10, top: '30%' }}>{c.hookText}</span>}
        <span className="tt-lib-thumb-badge">{c.isVideo ? <><Play size={10} fill="#fff" /> {Math.round(c.durationSec)}s</> : c.format === 'carousel' ? 'Carousel' : 'Image'}</span>
        <span className="tt-pick-check">{on && <Check size={12} strokeWidth={3} />}</span>
      </span>
      <span className="tt-pick-name">{c.name}</span>
      <span className="tt-pick-meta">{meta ?? `${formatName(c.format)} · ${creativeFormatLabel(c)}`}</span>
    </button>
  )
}

export interface CreativePickerProps {
  s: GameState
  catalogId: string | null
  selected: string[]
  onChange: (ids: string[]) => void
  max?: number
}
/** Ready creatives for a product, multi-select (one ad per video). */
export function CreativePicker({ s, catalogId, selected, onChange, max = 10 }: CreativePickerProps) {
  const list = s.creatives.creatives.filter(c => c.status === 'ready' && (!catalogId || c.catalogId === catalogId))
  const pending = s.creatives.creatives.filter(c => c.status !== 'ready' && c.status !== 'failed' && (!catalogId || c.catalogId === catalogId))
  if (!list.length) {
    return (
      <div className="tt-col" style={{ gap: 6 }}>
        <span className="tt-muted tt-small">
          No finished videos for this product yet.{pending.length ? ` ${pending.length} ${pending.length === 1 ? 'video is' : 'videos are'} still in production in CreatorHub.` : ' Film one yourself, edit supplier footage or hire a creator in CreatorHub.'}
        </span>
      </div>
    )
  }
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else if (selected.length < max) onChange([...selected, id])
  }
  return (
    <div className="tt-picker">
      {list.map(c => (
        <CreativeTile key={c.id} c={c} on={selected.includes(c.id)} disabled={!selected.includes(c.id) && selected.length >= max} onClick={() => toggle(c.id)} />
      ))}
    </div>
  )
}

export interface PostPickerProps {
  s: GameState
  selected: string[]
  onChange: (ids: string[]) => void
  max?: number
}
/** Organic TikTak posts available for Spark Ads. */
export function PostPicker({ s, selected, onChange, max = 10 }: PostPickerProps) {
  const posts = [...s.ads.organicPosts].reverse()
  const byId = new Map(s.creatives.creatives.map(c => [c.id, c]))
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else if (selected.length < max) onChange([...selected, id])
  }
  if (!posts.length) return <span className="tt-muted tt-small">You haven&apos;t posted anything to TikTak yet. Post a video from Assets › TikTak posts, then boost it here.</span>
  return (
    <div className="tt-picker">
      {posts.map((p: OrganicPost) => {
        const c = byId.get(p.creativeId)
        if (!c) return null
        const on = selected.includes(p.id)
        return (
          <CreativeTile
            key={p.id}
            c={c}
            on={on}
            disabled={(!on && selected.length >= max) || c.status !== 'ready'}
            onClick={() => toggle(p.id)}
            meta={`${formatSocialCount(p.views)} views · ${formatSocialCount(p.likes)} likes${p.sparked ? ' · Sparked' : ''}`}
          />
        )
      })}
    </div>
  )
}

export function PostStatsInline({ p }: { p: OrganicPost }) {
  return (
    <span className="tt-row tt-small tt-muted" style={{ gap: 10 }}>
      <span className="tt-row" style={{ gap: 3 }}><Eye size={12} /> {formatSocialCount(p.views)}</span>
      <span className="tt-row" style={{ gap: 3 }}><Heart size={12} /> {formatSocialCount(p.likes)}</span>
    </span>
  )
}
