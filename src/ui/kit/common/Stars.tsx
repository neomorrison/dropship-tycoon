import { useId } from 'react'
import { num } from '../../../core/format'
import { cx } from './utils'
import './common.css'

export interface StarsProps {
  /** 0..max, fractional values render partial stars */
  rating: number
  max?: number
  /** star size in px (default 14) */
  size?: number
  /** filled color (default amber #ffb400; AliExprez uses #000, Amazin #f79009) */
  color?: string
  emptyColor?: string
  /** show the numeric rating after the stars, e.g. "4.7" */
  showValue?: boolean
  /** review count shown as "(1,234)" */
  count?: number
  className?: string
}

const STAR = 'M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96z'

/** Star rating with fractional fill. */
export function Stars({ rating, max = 5, size = 14, color = '#ffb400', emptyColor = '#d4d4d4', showValue, count, className }: StarsProps) {
  const uid = useId().replace(/:/g, '')
  const r = Math.max(0, Math.min(max, rating))
  return (
    <span className={cx('kx-stars', className)} aria-label={`${r.toFixed(1)} out of ${max} stars`}>
      <span className="kx-stars-row">
        {Array.from({ length: max }, (_, i) => {
          const fill = Math.max(0, Math.min(1, r - i))
          const gid = `${uid}-s${i}`
          return (
            <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
              <defs>
                <linearGradient id={gid}>
                  <stop offset={`${fill * 100}%`} stopColor={color} />
                  <stop offset={`${fill * 100}%`} stopColor={emptyColor} />
                </linearGradient>
              </defs>
              <path d={STAR} fill={`url(#${gid})`} />
            </svg>
          )
        })}
      </span>
      {showValue && <span className="kx-stars-value">{r.toFixed(1)}</span>}
      {count !== undefined && <span className="kx-stars-count">({num(count)})</span>}
    </span>
  )
}
