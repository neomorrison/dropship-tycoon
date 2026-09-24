// Deterministic hash-based noise for PURE, read-only views (listings, Mineo, research notes)
// that must render identically on every call. Sim mutations use core/rng with the state instead.

export function hash32(...parts: (string | number)[]): number {
  const str = parts.join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
/** uniform [0, 1) */
export const hrand = (...parts: (string | number)[]) => hash32(...parts) / 4294967296
/** standard normal */
export function hnorm(...parts: (string | number)[]): number {
  const u = Math.max(1e-9, hrand(...parts, 'u'))
  const v = hrand(...parts, 'v')
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
export const hpick = <T>(arr: readonly T[], ...parts: (string | number)[]): T => arr[Math.floor(hrand(...parts) * arr.length)]
/** mean-1 multiplicative noise */
export const hlognormal = (sigma: number, ...parts: (string | number)[]) => Math.exp(sigma * hnorm(...parts) - (sigma * sigma) / 2)
