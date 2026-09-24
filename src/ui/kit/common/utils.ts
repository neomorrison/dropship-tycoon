// Small presentation helpers shared by every kit. Pure functions, no React.
export { clsx as cx } from 'clsx'

/** Deterministic 32-bit string hash (FNV-1a). Same input → same color/initials everywhere. */
export function hashString(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Soft background / ink pairs used for fallback tiles and avatars. */
export const TILE_PALETTE: { bg: string; fg: string }[] = [
  { bg: '#e0f0ff', fg: '#00527c' },
  { bg: '#cdfee1', fg: '#0c5132' },
  { bg: '#fff1e3', fg: '#5e4200' },
  { bg: '#f3e8ff', fg: '#4a1d96' },
  { bg: '#fee9e8', fg: '#8e0b21' },
  { bg: '#e3f7f5', fg: '#0b5d57' },
  { bg: '#fff8db', fg: '#4f4700' },
  { bg: '#eceff4', fg: '#303a4b' },
]

/** Pick a stable color pair for any label (product name, customer, brand). */
export function tileColor(label: string): { bg: string; fg: string } {
  return TILE_PALETTE[hashString(label || '?') % TILE_PALETTE.length]
}

/** "Jordan Lee" → "JL", "glowpup" → "GL", "" → "?" */
export function initials(name: string, max = 2): string {
  const words = (name || '').trim().split(/[\s_\-.@]+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, max).toUpperCase()
  return words.slice(0, max).map(w => w[0]).join('').toUpperCase()
}

/** Social-app counters: 999 → "999", 1234 → "1.2K", 15300 → "15.3K", 2400000 → "2.4M". */
export function formatSocialCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) {
    const k = n / 1000
    return `${k >= 100 ? Math.round(k) : trim1(k)}K`
  }
  const m = n / 1_000_000
  return `${m >= 100 ? Math.round(m) : trim1(m)}M`
}
const trim1 = (x: number) => {
  const s = (Math.floor(x * 10) / 10).toFixed(1)
  return s.endsWith('.0') ? s.slice(0, -2) : s
}

/** Clamp helper. */
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Simple stable id for DOM wiring when React's useId is not available (SSR-safe enough for a game). */
let domSeq = 0
export const domId = (prefix = 'kx') => `${prefix}-${++domSeq}`
