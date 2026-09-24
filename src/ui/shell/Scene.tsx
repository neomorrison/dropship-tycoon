// Apartment / McDoodle's scene with invisible hotspot buttons and context menus.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import { BedDouble, ChefHat, DoorOpen, Laptop, LogOut, Package, Refrigerator, Store, Flame, Sparkles } from 'lucide-react'
import type { ActivityKind, GameState } from '../../core/types'
import { useGame, useGS } from '../../core/store'
import { openSite, useUI } from '../../core/ui'
import { roomImage } from '../../core/assets'
import { hourOfDay, weekdayName, dayOf, formatDate } from '../../core/time'
import { money } from '../../core/format'
import { sfx } from '../audio'
import { ACTIVITY_META, activityInfo, type HotspotKey } from './activityMeta'
import { DEFAULT_HOME, DEFAULT_WORK, FALLBACK_HOME, FALLBACK_WORK, ROOM_BACKDROP, useHotspotFile, type Rect, type RoomHotspots } from './hotspots'
import { FallbackHome, FallbackWork } from './FallbackRoom'
import { checkActivity, doActivity, cancelAct, setComputerOpen } from './actions'
import { clockOf, fmtMinutes, fmtUntil, nextShift, ProgressBar, shiftEnd, shiftStart, useDismiss, useSmoothActivity } from './common'
import { tuckCoachIfCovering } from './shellStore'


const SPOT_LABEL: Record<HotspotKey, { label: string; icon: typeof BedDouble }> = {
  bed: { label: 'Bed', icon: BedDouble },
  computer: { label: 'Computer', icon: Laptop },
  fridge: { label: 'Kitchen', icon: Refrigerator },
  door: { label: 'Go out', icon: DoorOpen },
  garage: { label: 'Inventory', icon: Package },
  counter: { label: 'Register', icon: Store },
  fryer: { label: 'Fryer', icon: Flame },
  exit: { label: 'Exit', icon: LogOut },
}

const HINT_KEY = 'dropship-tycoon:hint-hotspots'
function readHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) !== '1'
  } catch {
    return true
  }
}

// ---------------------------------------------------------------------------
// Hotspot tag layout: labels sit centered above their hotspot unless that would
// collide with another label or the activity bubble (small stages, tight rooms).
// ---------------------------------------------------------------------------
interface Box { x: number; y: number; w: number; h: number }
/** tag position relative to its hotspot: horizontal offset from the center, top edge from the hotspot's top */
interface TagPos { dx: number; top: number }
const hit = (a: Box, b: Box, pad = 3) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

function estimateTag(label: string, compact: boolean): { w: number; h: number } {
  return compact ? { w: Math.round(label.length * 6.3 + 31), h: 21 } : { w: Math.round(label.length * 7.4 + 38), h: 27 }
}

function layoutTags(
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

export default function Scene() {
  const tier = useGS(s => s.home.tier)
  const location = useGS(s => s.player.location)
  const activity = useGS(s => s.player.activity)
  const hour = useGS(s => s.time.hour)
  const file = useHotspotFile()

  const atWork = location === 'work'
  const safeTier = Math.max(0, Math.min(5, Math.round(tier)))
  const roomKey = atWork ? 'mcdoodles' : `tier${safeTier}`
  const src = atWork ? roomImage('mcdoodles') : roomImage(safeTier)
  const [broken, setBroken] = useState<Record<string, true>>({})
  const [loaded, setLoaded] = useState<Record<string, true>>({})
  const missing = !!broken[src]

  const spots: RoomHotspots = useMemo(() => {
    if (missing) return atWork ? FALLBACK_WORK : FALLBACK_HOME
    const defaults = atWork ? DEFAULT_WORK : DEFAULT_HOME
    const fromFile = file?.[roomKey]
    return fromFile && Object.keys(fromFile).length ? { ...defaults, ...fromFile } : defaults
  }, [missing, atWork, file, roomKey])

  // --- stage sizing: 16:9 stage, zoomed so the diorama fills the area -------
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  let stageW = 0
  if (area.w > 0 && area.h > 0) {
    stageW = missing
      ? // the illustrated room is a framed card: keep a margin around it
        Math.max(0, Math.min(area.w - 36, ((area.h - 36) * 16) / 9))
      : // renders float on an empty backdrop: crop up to 14% per side horizontally, 3% vertically
        // (phones: 19% / 5%; every room sits inside the middle ~62% of its render)
        area.w < 560
        ? Math.min(area.w / 0.62, ((area.h / 0.9) * 16) / 9)
        : Math.min(area.w / 0.72, ((area.h / 0.94) * 16) / 9)
  }
  const stageH = (stageW * 9) / 16
  const stageLeft = (area.w - stageW) / 2
  const stageTop = (area.h - stageH) / 2
  const compact = stageW > 0 && stageW < 720

  // --- menus -----------------------------------------------------------------
  const [menu, setMenu] = useState<HotspotKey | null>(null)
  const [hint, setHint] = useState(readHint)
  const [fries, setFries] = useState(0)
  // pressing the hotspot whose menu is open: the outside-pointerdown (captured on window, before
  // React sees it) closes the menu, and that same gesture's click must not reopen it. The gesture is
  // matched by its pointerdown event, not a time window, so a quick deliberate re-click still opens.
  const menuRef = useRef<HotspotKey | null>(null)
  menuRef.current = menu
  const closedBy = useRef<{ key: HotspotKey | null; ev: Event | null }>({ key: null, ev: null })
  const downOnOpen = useRef<HotspotKey | null>(null)
  const closeMenu = useCallback((reason?: 'outside' | 'escape', e?: Event) => {
    closedBy.current = reason === 'outside' && e ? { key: menuRef.current, ev: e } : { key: null, ev: null }
    setMenu(null)
  }, [])
  const openMenu = (k: HotspotKey) => {
    sfx.pop()
    setMenu(m => (m === k ? null : k))
    if (hint) {
      setHint(false)
      try {
        localStorage.setItem(HINT_KEY, '1')
      } catch {
        /* ignore */
      }
    }
  }
  const [menuRoom, setMenuRoom] = useState(roomKey)
  if (menuRoom !== roomKey) {
    setMenuRoom(roomKey)
    setMenu(null)
  }

  /** hotspot anchor in scene-area pixels (the menu picks above/below/overlap once it knows its size) */
  const menuAnchor = (r: Rect) => ({
    cx: stageLeft + ((r.x + r.w / 2) / 100) * stageW,
    top: stageTop + (r.y / 100) * stageH,
    bottom: stageTop + ((r.y + r.h) / 100) * stageH,
    areaW: area.w,
    areaH: area.h,
  })

  const h = hourOfDay(hour)
  const tod = h >= 21 || h < 5 ? 'night' : h < 7 ? 'dawn' : h >= 17 ? 'dusk' : 'day'
  const sleeping = activity?.kind === 'sleep'
  const out = location === 'out'
  const busySpot = activity && !out && !atWork ? ACTIVITY_META[activity.kind]?.spot : null
  const bg = ROOM_BACKDROP[roomKey] ?? '#fbf3e7'
  const darkBackdrop = roomKey === 'tier5'

  // measured tag sizes (tags are always rendered, just transparent until hover/hint)
  const tagRefs = useRef<Partial<Record<HotspotKey, HTMLSpanElement | null>>>({})
  const topRef = useRef<HTMLDivElement>(null)
  const [tagSizes, setTagSizes] = useState<Partial<Record<HotspotKey, { w: number; h: number }>>>({})
  // the banner / hint / event pills at the top of the scene: labels steer around them
  const [obstacles, setObstacles] = useState<Box[]>([])
  useLayoutEffect(() => {
    const next: Partial<Record<HotspotKey, { w: number; h: number }>> = {}
    let changed = false
    for (const [k, el] of Object.entries(tagRefs.current) as [HotspotKey, HTMLSpanElement | null][]) {
      if (!el) continue
      const sz = { w: el.offsetWidth, h: el.offsetHeight }
      next[k] = sz
      const prev = tagSizes[k]
      if (!prev || Math.abs(prev.w - sz.w) > 1 || Math.abs(prev.h - sz.h) > 1) changed = true
    }
    if (changed) setTagSizes(next)
    const areaEl = areaRef.current
    const top = topRef.current
    if (areaEl && top) {
      const a = areaEl.getBoundingClientRect()
      const boxes: Box[] = []
      for (const el of Array.from(top.children) as HTMLElement[]) {
        const r = el.getBoundingClientRect()
        if (r.width && r.height) boxes.push({ x: Math.round(r.left - a.left - stageLeft), y: Math.round(r.top - a.top - stageTop), w: Math.round(r.width), h: Math.round(r.height) })
      }
      const same = boxes.length === obstacles.length && boxes.every((b, i) => b.x === obstacles[i].x && b.y === obstacles[i].y && b.w === obstacles[i].w && b.h === obstacles[i].h)
      if (!same) setObstacles(boxes)
    }
  })
  const bubbleSpot = busySpot && spots[busySpot] ? busySpot : null
  const tagPos = useMemo(
    () =>
      stageW > 0
        ? layoutTags(
            Object.entries(spots) as [HotspotKey, Rect][],
            { w: stageW, h: stageH },
            { x: -stageLeft, y: -stageTop, w: area.w, h: area.h },
            compact,
            tagSizes,
            bubbleSpot ? { spot: bubbleSpot, size: compact ? 32 : 42 } : null,
            obstacles,
          )
        : {},
    [spots, stageW, stageH, stageLeft, stageTop, area.w, area.h, compact, tagSizes, bubbleSpot, obstacles],
  )

  return (
    <div
      className={clsx('sh-scene', `sh-tod-${tod}`, darkBackdrop && 'is-dark', out && 'is-out', sleeping && 'is-sleeping')}
      style={{ '--sh-room-bg': bg } as CSSProperties}
    >
      <div className="sh-scene-area" ref={areaRef}>
        {stageW > 0 && (
          <div className={clsx('sh-stage', compact && 'is-compact')} style={{ width: stageW, height: stageH, left: stageLeft, top: stageTop }}>
            {missing ? (
              atWork ? <FallbackWork /> : <FallbackHome tier={safeTier} night={tod === 'night'} />
            ) : (
              <img
                key={src}
                src={src}
                alt={atWork ? "McDoodle's kitchen" : 'Your apartment'}
                className={clsx('sh-stage-img', loaded[src] && 'is-loaded')}
                draggable={false}
                onLoad={() => setLoaded(l => ({ ...l, [src]: true }))}
                onError={() => setBroken(b => ({ ...b, [src]: true }))}
              />
            )}
            {!atWork && safeTier !== 5 && <div className="sh-stage-tint" />}
            {(Object.entries(spots) as [HotspotKey, Rect][]).map(([k, r]) => {
              const L = SPOT_LABEL[k]
              if (!L) return null
              const Icon = L.icon
              const tp = tagPos[k]
              return (
                <button
                  key={k}
                  type="button"
                  className={clsx('sh-hotspot', menu === k && 'is-open', hint && 'is-hint', busySpot === k && 'is-busy')}
                  style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
                  onPointerDown={e => {
                    downOnOpen.current = closedBy.current.key === k && closedBy.current.ev === e.nativeEvent ? k : null
                  }}
                  onClick={e => {
                    if (downOnOpen.current === k) {
                      downOnOpen.current = null
                      return
                    }
                    // Kev's bubble sits over the room's bottom-left: reaching for something under it moves him aside
                    tuckCoachIfCovering(e.currentTarget)
                    openMenu(k)
                  }}
                  aria-label={L.label}
                  aria-haspopup="menu"
                  aria-expanded={menu === k}
                >
                  <span
                    className="sh-hotspot-tag"
                    ref={el => {
                      tagRefs.current[k] = el
                    }}
                    style={tp ? { left: `calc(50% + ${Math.round(tp.dx)}px)`, top: Math.round(tp.top), bottom: 'auto' } : undefined}
                  >
                    <Icon size={13} strokeWidth={2.4} />
                    {L.label}
                  </span>
                </button>
              )
            })}
            {busySpot && spots[busySpot] && activity && (
              <div
                className="sh-busy-bubble"
                style={{ left: `${spots[busySpot]!.x + spots[busySpot]!.w / 2}%`, top: `${spots[busySpot]!.y}%` }}
                aria-hidden
              >
                {ACTIVITY_META[activity.kind]?.emoji ?? '⏳'}
              </div>
            )}
            {atWork && fries > 0 && spots.fryer && (
              <div key={fries} className="sh-fries-pop" style={{ left: `${spots.fryer.x + spots.fryer.w / 2}%`, top: `${spots.fryer.y}%` }} aria-hidden>
                +🍟
              </div>
            )}
          </div>
        )}

        {menu && spots[menu] && (
          <HotspotMenu
            spot={menu}
            anchor={menuAnchor(spots[menu]!)}
            onClose={closeMenu}
            onFry={() => {
              sfx.fryer()
              setFries(f => f + 1)
            }}
          />
        )}

        <div className="sh-scene-top" ref={topRef}>
          {atWork && <WorkBanner />}
          {/* on small stages the labels themselves are the hint */}
          {hint && !compact && !atWork && !out && !sleeping && <div className="sh-scene-hint">Click things in your room: bed, fridge, computer, door</div>}
          <EventStrip compact={compact} />
        </div>
        {sleeping && activity && <SleepOverlay id={activity.id} remaining={activity.remainingMin} />}
        {out && <OutOverlay />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------
interface MenuItem {
  key: string
  emoji?: string
  label: string
  meta?: string
  disabled?: boolean
  reason?: string
  primary?: boolean
  run: () => void
}
interface MenuModel { title: string; icon: typeof BedDouble; subtitle?: string; items: MenuItem[] }

function actItem(s: GameState, kind: ActivityKind, o: { label?: string; meta?: string } = {}): MenuItem {
  const info = activityInfo(kind)
  const chk = checkActivity(s, kind)
  const meta = o.meta ?? [fmtMinutes(info.minutes), info.cost ? money(info.cost, { cents: false }) : 'free'].join(' · ')
  return { key: kind, emoji: info.emoji, label: o.label ?? info.label, meta, disabled: !chk.ok, reason: chk.reason, run: () => doActivity(kind) }
}

function buildMenu(spot: HotspotKey, s: GameState, onFry: () => void): MenuModel {
  const p = s.player
  switch (spot) {
    case 'bed':
      return {
        title: 'Bed',
        icon: BedDouble,
        subtitle: `Energy ${Math.round(p.energy)}/100`,
        items: [
          actItem(s, 'sleep', { meta: 'until rested · 4× speed' }),
          actItem(s, 'nap'),
          actItem(s, 'relax'),
        ],
      }
    case 'fridge':
      return {
        title: 'Kitchen',
        icon: Refrigerator,
        subtitle: `Hunger ${Math.round(p.hunger)}/100`,
        items: [actItem(s, 'eat_home'), actItem(s, 'eat_takeout')],
      }
    case 'computer': {
      const open = s.store.tickets.filter(t => t.status !== 'solved').length
      const support = actItem(s, 'customer_support', { label: open ? `Answer support tickets (${open})` : 'Answer support tickets' })
      if (!open) {
        support.disabled = true
        support.reason = 'No open tickets'
      }
      return {
        title: 'Computer',
        icon: Laptop,
        subtitle: s.store.created ? s.store.name : 'No store yet',
        items: [
          { key: 'open', emoji: '💻', label: 'Use computer', meta: 'Shopifly, ads, suppliers…', primary: true, run: () => setComputerOpen(true) },
          support,
          { key: 'research', emoji: '🔎', label: 'Research products', meta: 'AliExprez', run: () => openSite('aliexprez') },
        ],
      }
    }
    case 'door': {
      const items: MenuItem[] = [actItem(s, 'gym'), actItem(s, 'socialize')]
      if (s.job.employed) {
        const sh = nextShift(s.job, s.time.hour)
        const w = actItem(s, 'work_shift', {
          label: 'Head to your shift',
          meta: sh ? `${sh.status === 'in_progress' ? 'Now' : `${weekdayName(sh.day)} ${clockOf(sh.startHour)}`} · ${sh.hours}h` : 'No shift scheduled',
        })
        if (!sh) {
          w.disabled = true
          w.reason = w.reason ?? 'Nothing on the schedule'
        } else if (w.disabled && /automatically/i.test(w.reason ?? '')) {
          // the sim's reason is a full sentence; the menu line has room for the gist
          w.reason = `${weekdayName(sh.day)} ${clockOf(sh.startHour)} · you'll leave automatically`
        }
        items.push(w)
      } else {
        items.push({ key: 'crew', emoji: '🍟', label: "McDoodle's Crew portal", meta: s.job.quitDay !== null ? 'You quit' : 'Unemployed', run: () => openSite('mcdoodles') })
      }
      return { title: 'Front door', icon: DoorOpen, subtitle: 'Where to?', items }
    }
    case 'garage': {
      const units = Object.values(s.catalog.inventory).reduce((a, i) => a + i.units, 0)
      return {
        title: 'Garage stock room',
        icon: Package,
        subtitle: `${units.toLocaleString('en-US')} units on hand`,
        items: [
          { key: 'inv', emoji: '📦', label: 'Products & inventory', meta: 'Shopifly', run: () => openSite('shopifly', 'products') },
          { key: 'bulk', emoji: '🚢', label: 'Bulk orders & sourcing', meta: 'AliExprez', run: () => openSite('aliexprez') },
        ],
      }
    }
    case 'counter': {
      const sh = nextShift(s.job, s.time.hour)
      const left = sh && sh.status === 'in_progress' ? Math.max(0, shiftEnd(sh) - s.time.hour) : 0
      return {
        title: 'Front counter',
        icon: Store,
        subtitle: sh && sh.status === 'in_progress' ? `Shift ends ${clockOf(sh.startHour + sh.hours)} · ${left}h to go` : 'On the clock',
        items: [
          { key: 'phone', emoji: '📱', label: 'Sneak a look at your phone', meta: 'Store, ads, email', primary: true, run: () => setComputerOpen(true) },
          { key: 'crew', emoji: '🗓️', label: 'Crew portal', meta: 'Schedule, pay stubs', run: () => openSite('mcdoodles') },
        ],
      }
    }
    case 'fryer':
      return {
        title: 'Fry station',
        icon: ChefHat,
        subtitle: '3 minutes, then salt. Every time.',
        items: [{ key: 'fry', emoji: '🍟', label: 'Drop a basket', meta: 'Sizzle', run: onFry }],
      }
    case 'exit':
      return {
        title: 'Exit',
        icon: LogOut,
        subtitle: "You can't walk out mid-shift. Call out ahead of time, or quit.",
        items: [{ key: 'crew', emoji: '🗓️', label: 'Check schedule & call-outs', meta: 'Crew portal', run: () => openSite('mcdoodles') }],
      }
  }
}

type MenuAnchor = { cx: number; top: number; bottom: number; areaW: number; areaH: number }
/** Above the hotspot when it fits, else below, else pinned inside the scene (small screens). */
function placeMenu(a: MenuAnchor, w: number, h: number): { left: number; top: number; origin: string } {
  const M = 8
  const left = Math.max(M, Math.min(a.areaW - w - M, a.cx - w / 2))
  let top: number
  let origin = '50% 100%'
  if (a.top - 8 - h >= M) top = a.top - 8 - h
  else if (a.bottom + 8 + h <= a.areaH - M) {
    top = a.bottom + 8
    origin = '50% 0'
  } else {
    // doesn't fit either way: overlap the hotspot, fully on screen
    top = Math.max(M, Math.min(a.areaH - h - M, (a.top + a.bottom) / 2 - h / 2))
    origin = '50% 50%'
  }
  return { left, top, origin }
}

function HotspotMenu({ spot, anchor, onClose, onFry }: { spot: HotspotKey; anchor: MenuAnchor; onClose: (reason?: 'outside' | 'escape', e?: Event) => void; onFry: () => void }) {
  const s = useGame(st => st.state)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(true, onClose, [ref])
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    if (!size || size.w !== w || Math.abs(size.h - h) > 1) setSize({ w, h })
    else tuckCoachIfCovering(el)
  })
  if (!s) return null
  const m = buildMenu(spot, s, onFry)
  const Icon = m.icon
  return (
    <div
      ref={ref}
      className="sh-menu"
      style={size ? (() => {
        const p = placeMenu(anchor, size.w, size.h)
        return { left: p.left, top: p.top, transformOrigin: p.origin, maxHeight: anchor.areaH - 16 }
      })() : { left: 0, top: 0, visibility: 'hidden' }}
      role="menu"
    >
      <div className="sh-menu-head">
        <span className="sh-menu-icon"><Icon size={16} /></span>
        <div>
          <div className="sh-menu-title">{m.title}</div>
          {m.subtitle && <div className="sh-menu-sub">{m.subtitle}</div>}
        </div>
      </div>
      <div className="sh-menu-items">
        {m.items.map(it => (
          <button
            key={it.key}
            type="button"
            role="menuitem"
            className={clsx('sh-menu-item', it.primary && 'is-primary')}
            disabled={it.disabled}
            title={it.disabled ? it.reason : undefined}
            onClick={() => {
              it.run()
              if (it.key !== 'fry') onClose()
            }}
          >
            {it.emoji && <span className="sh-menu-emoji">{it.emoji}</span>}
            <span className="sh-menu-text">
              <span className="sh-menu-label">{it.label}</span>
              <span className="sh-menu-meta">{it.disabled && it.reason ? it.reason : it.meta}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------
/** World events happening today (sales holidays, outages, supplier news…). */
function EventStrip({ compact }: { compact: boolean }) {
  const active = useGS(s => s.events.active)
  const day = useGS(s => dayOf(s.time.hour))
  const [expanded, setExpanded] = useState(false)
  const now = useMemo(() => active.filter(e => e.startDay <= day && e.endDay >= day), [active, day])
  if (!now.length) return null
  if (compact && !expanded) {
    return (
      <div className="sh-events is-compact">
        <button type="button" className="sh-event-more is-chip" onClick={() => setExpanded(true)} title={now.map(e => e.title).join('\n')} aria-label={`${now.length} event${now.length === 1 ? '' : 's'} happening now`}>
          <Sparkles size={12} strokeWidth={2.6} /> {now.length === 1 ? '1 event' : `${now.length} events`}
        </button>
      </div>
    )
  }
  const max = compact ? now.length : 2
  const shown = expanded ? now : now.slice(0, max)
  const more = now.length - shown.length
  return (
    <div className={clsx('sh-events', compact && 'is-compact is-open')} role="list" aria-label="Happening now">
      {shown.map(e => {
        const left = e.endDay - day
        return (
          <div key={e.id} role="listitem" className="sh-event" title={`${e.title}\n${left === 0 ? 'Last day today' : `Until ${formatDate(e.endDay, 'medium')}`}`}>
            <Sparkles size={12} strokeWidth={2.6} className="sh-event-icon" />
            <span className="sh-event-title">{e.title}</span>
            <span className="sh-event-when">{left === 0 ? 'last day' : `${left + 1}d left`}</span>
          </div>
        )
      })}
      {(more > 0 || (expanded && (compact || now.length > max))) && (
        <button type="button" className="sh-event-more" onClick={() => setExpanded(v => !v)}>
          {expanded ? (compact ? 'Hide' : 'Show less') : `+${more} more`}
        </button>
      )}
    </div>
  )
}

function WorkBanner() {
  const job = useGS(s => s.job)
  const hour = useGS(s => s.time.hour)
  const frac = useUI(u => Math.floor(u.hourFrac * 12) / 12)
  const sh = nextShift(job, hour)
  if (!sh) return null
  const start = shiftStart(sh)
  const end = shiftEnd(sh)
  const now = hour + frac
  const live = sh.status === 'in_progress'
  const progress = live ? (now - start) / Math.max(1, sh.hours) : 0
  const leftMin = Math.max(0, (end - now) * 60)
  const title = live ? 'On shift' : start <= now ? 'Clocking in' : 'Next shift'
  const when = live || start <= now ? `${fmtMinutes(leftMin)} left` : fmtUntil(start - now)
  return (
    <div className="sh-work-banner">
      <span className="sh-work-emoji">🍟</span>
      <div className="sh-work-text">
        <b>{title}</b>
        <span>
          {clockOf(sh.startHour)}–{clockOf(sh.startHour + sh.hours)} · {money(job.hourlyWage)}/h · {when}
        </span>
        <ProgressBar value={progress} tone="amber" />
      </div>
    </div>
  )
}

function SleepOverlay({ id, remaining }: { id: string; remaining: number }) {
  const energy = useGS(s => s.player.energy)
  const forced = useGS(s => !!s.player.activity?.payload?.forced)
  const snoozed = useGS(s => !!s.player.activity?.payload?.snoozed)
  // a shift already started while you're in bed: say so, and make "wake up" the way to go
  const late = useGS(s => s.job.shifts.find(sh => sh.status === 'scheduled' && sh.pendingSince !== undefined) ?? null)
  return (
    <div className="sh-sleep">
      <div className="sh-zzz" aria-hidden>
        <span>Z</span>
        <span>z</span>
        <span>z</span>
      </div>
      <div className="sh-overlay-card">
        <div className="sh-overlay-title">{forced ? 'Passed out' : snoozed ? 'Snoozing…' : 'Sleeping'}</div>
        <div className="sh-overlay-sub">
          {forced
            ? `Energy hit zero. Out for about ${fmtMinutes(remaining)} more; nothing wakes you. Time runs 4× faster.`
            : `Energy ${Math.round(energy)}/100 · up to ${fmtMinutes(remaining)} left · time runs 4× faster`}
        </div>
        {late && !forced && (
          <div className="sh-sleep-late" role="alert">
            🍟 Your {clockOf(late.startHour)} shift already started. Clock in within the hour or it's a no-show.
          </div>
        )}
        {!forced && (
          <button type="button" className={clsx('sh-btn', late ? 'sh-btn-primary' : 'sh-btn-ghost')} onClick={() => cancelAct(id)}>
            {late ? 'Wake up & go to work' : 'Wake up'}
          </button>
        )}
      </div>
    </div>
  )
}

function OutOverlay() {
  const activity = useGS(s => s.player.activity)
  const hour = useGS(s => s.time.hour)
  const frac = useUI(u => Math.floor(u.hourFrac * 12) / 12)
  const kind = activity?.kind
  const info = kind ? activityInfo(kind) : null
  const { progress } = useSmoothActivity(activity, hour, frac)
  const late = hourOfDay(hour) >= 22 || hourOfDay(hour) < 5
  return (
    <div className="sh-out">
      <div className="sh-overlay-card">
        <div className="sh-out-emoji">{info?.emoji ?? (late ? '🌙' : '🚶')}</div>
        <div className="sh-overlay-title">{info ? info.label : 'Out and about'}</div>
        <div className="sh-overlay-sub">{info ? ACTIVITY_META[kind!].doing : `Day ${dayOf(hour) + 1}, away from home`}</div>
        {activity && <ProgressBar value={progress} tone="mint" />}
      </div>
    </div>
  )
}
