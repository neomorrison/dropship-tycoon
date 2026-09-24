// Asset URL helpers (respects Vite base path for GitHub Pages).
// import.meta.env is undefined under tsx/vitest headless runs
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
export const asset = (path: string) => `${BASE}assets/${path}`
export const productImage = (catalogId: string) => asset(`products/${catalogId}.webp`)
export const roomImage = (tier: number | 'mcdoodles' | 'title') => asset(`rooms/${typeof tier === 'number' ? `tier${tier}` : tier}.webp`)
export const portrait = (id: string) => asset(`people/${id}.webp`)
export const playerPortrait = (mood: 'neutral' | 'happy' | 'tired' | 'stressed') => asset(`player/${mood}.webp`)
export const gearImage = (id: string) => asset(`gear/${id}.webp`)
export const audioFile = (name: string) => asset(`audio/${name}`)
/** 18 portrait ids p01..p18 */
export const PORTRAITS = Array.from({ length: 18 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)
