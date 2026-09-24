// Hotspot labels: names/icons of the clickable things in a room and the tag layout that keeps
// labels from overlapping each other, the activity bubble and the banners at the top of the scene.
import { BedDouble, DoorOpen, Laptop, LogOut, Package, Refrigerator, Store, Flame, Sofa, Tv } from 'lucide-react'
import type { HotspotKey } from './activityMeta'
import type { Rect } from './hotspots'

export const SPOT_LABEL: Record<HotspotKey, { label: string; icon: typeof BedDouble }> = {
  bed: { label: 'Bed', icon: BedDouble },
  computer: { label: 'Computer', icon: Laptop },
  fridge: { label: 'Kitchen', icon: Refrigerator },
  door: { label: 'Go out', icon: DoorOpen },
  garage: { label: 'Inventory', icon: Package },
  counter: { label: 'Register', icon: Store },
  fryer: { label: 'Fryer', icon: Flame },
  exit: { label: 'Exit', icon: LogOut },
  couch: { label: 'Couch', icon: Sofa },
  tv: { label: 'TV', icon: Tv },
}

// ---------------------------------------------------------------------------
// Hotspot tag layout: labels sit centered above their hotspot unless that would
// collide with another label or the activity bubble (small stages, tight rooms).
// ---------------------------------------------------------------------------
export interface Box { x: number; y: number; w: number; h: number }
/** tag position relative to its hotspot: horizontal offset from the center, top edge from the hotspot's top */
export interface TagPos { dx: number; top: number }
export const hit = (a: Box, b: Box, pad = 3) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

export function estimateTag(label: string, compact: boolean): { w: number; h: number } {
  return compact ? { w: Math.round(label.length * 6.3 + 31), h: 21 } : { w: Math.round(label.length * 7.4 + 38), h: 27 }
}

export function layoutTags(
  spots: [HotspotKey, Rect][],
  stage: { w: number; h: number },
  view: Box,
  compact: boolean,
  sizes: Partial<Record<HotspotKey, { w: number; h: number }>>,
  bubble: { spot: HotspotKey; size: number } | null,
  obstacles: Box[],
): Partial<Record<HotspotKey, TagPos>> {
  const gap = compact ? 6 : 8
  const placed: Box[] = [...obstacles]
  const px = (r: Rect) => ({ x: (r.x / 100) * stage.w, y: (r.y / 100) * stage.h, w: (r.w / 100) * stage.w, h: (r.h / 100) * stage.h })
  if (bubble) {
    const r = spots.find(([k]) => k === bubble.spot)?.[1]
    if (r) {
      const b = px(r)
      placed.push({ x: b.x + b.w / 2 - bubble.size / 2, y: b.y - 10 - bubble.size, w: bubble.size, h: bubble.size })
    }
  }
  const out: Partial<Record<HotspotKey, TagPos>> = {}
  // big hotspots keep their spot; small ones make room
  const order = [...spots].sort((a, b) => b[1].w * b[1].h - a[1].w * a[1].h)
  for (const [k, r] of order) {
    const L = SPOT_LABEL[k]
    if (!L) continue
    const { w, h } = sizes[k] ?? estimateTag(L.label, compact)
    const b = px(r)
    const cx = b.x + b.w / 2
    const clampX = (x: number) => Math.max(view.x + 4, Math.min(view.x + view.w - w - 4, x))
    const clampY = (y: number) => Math.max(view.y + 4, y)
    const box = (dx: number, y: number): Box => ({ x: clampX(cx + dx - w / 2), y: clampY(y), w, h })
    const above = b.y - gap - h
    const reach = b.w / 2 + 28
    const tries: Box[] = [box(0, above)]
    for (let d = 4; d <= reach; d += 4) tries.push(box(d, above), box(-d, above))
    tries.push(box(0, above - (h + 4)), box(0, b.y + 6), box(0, b.y + b.h + gap))
    for (let d = 4; d <= reach; d += 4) tries.push(box(d, above - (h + 4)), box(-d, above - (h + 4)))
    // other hotspots: a label parked on top of the desk while it names the bed reads wrong (and
    // swallows clicks meant for the desk), so prefer spots clear of them too
    const others = spots.filter(([o]) => o !== k).map(([, o]) => px(o))
    // first free spot; when everything is crowded, the one that overlaps least
    const overlap = (t: Box) => placed.reduce((a, p) => a + Math.max(0, Math.min(t.x + t.w, p.x + p.w) - Math.max(t.x, p.x)) * Math.max(0, Math.min(t.y + t.h, p.y + p.h) - Math.max(t.y, p.y)), 0)
    const pick =
      tries.find(t => !placed.some(p => hit(t, p)) && !others.some(o => hit(t, o, -6))) ??
      tries.find(t => !placed.some(p => hit(t, p))) ??
      tries.reduce((best, t) => (overlap(t) < overlap(best) ? t : best), tries[0])
    placed.push(pick)
    out[k] = { dx: pick.x + w / 2 - cx, top: pick.y - b.y }
  }
  return out
}

