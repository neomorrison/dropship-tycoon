import { useEffect, useState, type CSSProperties, type MouseEventHandler } from 'react'
import { cx, initials, tileColor } from './utils'
import './common.css'

export interface ImageWithFallbackProps {
  /** image URL (e.g. productImage(id)); null/empty renders the fallback tile directly */
  src?: string | null
  alt: string
  /** text used for the fallback tile's initials + stable color (defaults to alt) */
  fallbackLabel?: string
  /** emoji/glyph shown on the fallback tile instead of initials */
  fallbackEmoji?: string
  fit?: 'cover' | 'contain'
  /** CSS aspect-ratio, e.g. 1, '4 / 5', '9 / 16'. Defaults to 1 (square) when `height` is not set. */
  aspectRatio?: number | string
  width?: number | string
  height?: number | string
  /** corner radius in px */
  radius?: number
  className?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLDivElement>
  /** 'lazy' (default) or 'eager' */
  loading?: 'lazy' | 'eager'
  /** slow Ken Burns zoom (used by ad previews) */
  kenBurns?: boolean
}

/**
 * <img> that degrades to a tasteful colored tile (emoji or initials) when the
 * asset is missing — art may not exist yet during development.
 */
export function ImageWithFallback({
  src, alt, fallbackLabel, fallbackEmoji, fit = 'cover', aspectRatio, width, height, radius, className, style, onClick,
  loading = 'lazy', kenBurns,
}: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(!src)
  useEffect(() => setFailed(!src), [src])
  const label = fallbackLabel ?? alt
  const color = tileColor(label)
  return (
    <div
      className={cx('kx-img', onClick && 'kx-img-click', className)}
      style={{
        // default to a square tile when no height/ratio is given so the fallback never collapses
        aspectRatio: (aspectRatio ?? (height === undefined ? 1 : undefined)) as CSSProperties['aspectRatio'],
        width, height, borderRadius: radius, ...style,
      }}
      onClick={onClick}
    >
      {!failed && src ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          draggable={false}
          className={cx('kx-img-el', kenBurns && 'kx-kenburns')}
          style={{ objectFit: fit }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="kx-img-fallback" style={{ background: `linear-gradient(135deg, ${color.bg}, #ffffff)`, color: color.fg }} role="img" aria-label={alt}>
          {/* SVG text scales with the tile at any size */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden>
            <text
              x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="currentColor"
              fontSize={fallbackEmoji ? 44 : 32} fontWeight={650} letterSpacing="0.5"
            >
              {fallbackEmoji ?? initials(label)}
            </text>
          </svg>
        </div>
      )}
    </div>
  )
}
