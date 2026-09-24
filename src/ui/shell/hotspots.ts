// Clickable room hotspots. Rects are % of the 16:9 room image (x, y = top-left).
// Loaded at runtime from assets/rooms/hotspots.json; falls back to sensible defaults.
import { useEffect, useState } from 'react'
import { asset } from '../../core/assets'
import type { HotspotKey } from './activityMeta'

/** backdrop colour sampled from each room render, so the image melts into the page */
export const ROOM_BACKDROP: Record<string, string> = {
  tier0: '#fbf3e7', tier1: '#fdf6e8', tier2: '#fdf4e3', tier3: '#fcf6e7', tier4: '#fbf4e5', tier5: '#08143a', mcdoodles: '#fffcec',
}

export interface Rect { x: number; y: number; w: number; h: number }
export type RoomHotspots = Partial<Record<HotspotKey, Rect>>
export type HotspotFile = Record<string, RoomHotspots>

/** Used when the art exists but hotspots.json (or a room entry) is missing. */
export const DEFAULT_HOME: RoomHotspots = {
  bed: { x: 24, y: 50, w: 21, h: 25 },
  computer: { x: 38.5, y: 34, w: 12, h: 18 },
  fridge: { x: 52, y: 33, w: 7, h: 21 },
  door: { x: 62, y: 26, w: 10, h: 32 },
}
export const DEFAULT_WORK: RoomHotspots = {
  counter: { x: 21.5, y: 56, w: 31, h: 34 },
  fryer: { x: 28.5, y: 38, w: 20, h: 16 },
  exit: { x: 65.5, y: 28, w: 12.5, h: 31 },
}

/** Layout of the CSS-illustrated fallback room (furniture is drawn exactly here). */
export const FALLBACK_HOME: RoomHotspots = {
  bed: { x: 9, y: 52, w: 29, h: 27 },
  computer: { x: 40, y: 38, w: 20, h: 32 },
  fridge: { x: 63, y: 30, w: 10, h: 43 },
  door: { x: 77, y: 20, w: 13, h: 53 },
}
export const FALLBACK_WORK: RoomHotspots = {
  counter: { x: 8, y: 56, w: 50, h: 26 },
  fryer: { x: 12, y: 30, w: 24, h: 24 },
  exit: { x: 70, y: 20, w: 16, h: 53 },
}

let cache: HotspotFile | null = null
let pending: Promise<HotspotFile | null> | null = null
let failed = false

function isRect(r: unknown): r is Rect {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return ['x', 'y', 'w', 'h'].every(k => typeof o[k] === 'number' && Number.isFinite(o[k] as number))
}

function sanitize(raw: unknown): HotspotFile {
  const out: HotspotFile = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [room, spots] of Object.entries(raw as Record<string, unknown>)) {
    if (!spots || typeof spots !== 'object') continue
    const clean: RoomHotspots = {}
    for (const [k, r] of Object.entries(spots as Record<string, unknown>)) if (isRect(r)) clean[k as HotspotKey] = r
    out[room] = clean
  }
  return out
}

export function loadHotspots(): Promise<HotspotFile | null> {
  if (cache) return Promise.resolve(cache)
  if (failed) return Promise.resolve(null)
  pending ??= fetch(asset('rooms/hotspots.json'))
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then(j => (cache = sanitize(j)))
    .catch(() => {
      failed = true
      return null
    })
  return pending
}

/** Hotspot file (null while loading or when missing). */
export function useHotspotFile(): HotspotFile | null {
  const [file, setFile] = useState<HotspotFile | null>(cache)
  useEffect(() => {
    if (cache) return
    let alive = true
    void loadHotspots().then(f => alive && setFile(f))
    return () => {
      alive = false
    }
  }, [])
  return file
}
