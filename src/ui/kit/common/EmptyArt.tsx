import type { ReactElement } from 'react'
import { cx } from './utils'
import './common.css'

export type EmptyArtKind = 'orders' | 'products' | 'search' | 'chart' | 'inbox' | 'ads' | 'customers' | 'creative' | 'generic'

export interface EmptyArtProps {
  kind?: EmptyArtKind
  /** rendered width in px (height follows 4:3). Default 160 */
  size?: number
  /** accent color for the highlighted shape (default Shopifly green) */
  accent?: string
  className?: string
}

const INK = '#8a8a8a'
const PAPER = '#ffffff'

function art(kind: EmptyArtKind, a: string): ReactElement {
  switch (kind) {
    case 'orders':
      return (
        <g>
          <rect x="52" y="22" width="56" height="72" rx="6" fill={PAPER} stroke={INK} strokeWidth="2" />
          <path d="M62 38h36M62 48h36M62 58h22" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <circle cx="104" cy="82" r="14" fill={a} />
          <path d="M97 82l5 5 9-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
    case 'products':
      return (
        <g>
          <path d="M50 44l30-14 30 14v36l-30 14-30-14z" fill={PAPER} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M50 44l30 14 30-14M80 58v36" stroke={INK} strokeWidth="2" fill="none" />
          <path d="M65 37l30 14v10" stroke={a} strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>
      )
    case 'search':
      return (
        <g>
          <circle cx="74" cy="56" r="22" fill={PAPER} stroke={INK} strokeWidth="2.5" />
          <path d="M90 72l18 18" stroke={a} strokeWidth="6" strokeLinecap="round" />
          <path d="M64 50a12 12 0 0 1 12-8" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )
    case 'chart':
      return (
        <g>
          <rect x="40" y="26" width="80" height="64" rx="6" fill={PAPER} stroke={INK} strokeWidth="2" />
          <path d="M50 78l16-16 12 8 22-24" stroke={a} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M50 40h20" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        </g>
      )
    case 'inbox':
      return (
        <g>
          <path d="M44 60l12-28h48l12 28v26a4 4 0 0 1-4 4H48a4 4 0 0 1-4-4z" fill={PAPER} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M44 60h22a14 14 0 0 0 28 0h22" stroke={INK} strokeWidth="2" fill="none" />
          <circle cx="108" cy="34" r="9" fill={a} />
        </g>
      )
    case 'ads':
      return (
        <g>
          <path d="M50 52v18l14 2 36 16V36L64 50z" fill={PAPER} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M60 72l5 16h9l-4-15" stroke={INK} strokeWidth="2" fill={PAPER} strokeLinejoin="round" />
          <path d="M108 50c4 3 4 13 0 16M114 44c8 6 8 22 0 28" stroke={a} strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      )
    case 'customers':
      return (
        <g>
          <circle cx="68" cy="46" r="12" fill={PAPER} stroke={INK} strokeWidth="2" />
          <path d="M46 88c0-14 10-22 22-22s22 8 22 22" fill={PAPER} stroke={INK} strokeWidth="2" />
          <circle cx="98" cy="50" r="10" fill={a} />
          <path d="M82 88c1-11 7-18 16-18s16 7 17 18" fill={a} />
        </g>
      )
    case 'creative':
      return (
        <g>
          <rect x="58" y="18" width="44" height="80" rx="8" fill={PAPER} stroke={INK} strokeWidth="2" />
          <path d="M74 48v20l17-10z" fill={a} />
          <path d="M66 86h28" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        </g>
      )
    default:
      return (
        <g>
          <path d="M44 40h26l6 8h40v38a4 4 0 0 1-4 4H48a4 4 0 0 1-4-4z" fill={PAPER} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="80" cy="68" r="8" fill={a} />
        </g>
      )
  }
}

/** Lightweight empty-state illustration (inline SVG, no asset needed). */
export function EmptyArt({ kind = 'generic', size = 160, accent = '#29845a', className }: EmptyArtProps) {
  return (
    <svg className={cx('kx-emptyart', className)} width={size} height={(size * 3) / 4} viewBox="0 0 160 120" aria-hidden>
      <ellipse cx="80" cy="62" rx="66" ry="50" fill="#f1f1f1" />
      <ellipse cx="80" cy="104" rx="42" ry="4" fill="#e3e3e3" />
      {art(kind, accent)}
    </svg>
  )
}
