// Apartment / McDoodle's scene with invisible hotspot buttons and context menus.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import { BedDouble, ChefHat, DoorOpen, Laptop, LogOut, Package, Refrigerator, Store, Flame } from 'lucide-react'
import type { ActivityKind, GameState } from '../../core/types'
import { useGame, useGS } from '../../core/store'
import { openSite, useUI } from '../../core/ui'
import { roomImage } from '../../core/assets'
import { hourOfDay, weekdayName, dayOf } from '../../core/time'
import { money } from '../../core/format'
import { sfx } from '../audio'
import { ACTIVITY_META, activityInfo, type HotspotKey } from './activityMeta'
import { DEFAULT_HOME, DEFAULT_WORK, FALLBACK_HOME, FALLBACK_WORK, ROOM_BACKDROP, useHotspotFile, type Rect, type RoomHotspots } from './hotspots'
import { FallbackHome, FallbackWork } from './FallbackRoom'
import { checkActivity, doActivity, cancelAct, setComputerOpen } from './actions'
import { clockOf, fmtMinutes, fmtUntil, nextShift, ProgressBar, shiftEnd, shiftStart, useDismiss } from './common'


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
        Math.min(area.w / 0.72, ((area.h / 0.94) * 16) / 9)
  }
  const stageH = (stageW * 9) / 16
  const stageLeft = (area.w - stageW) / 2
  const stageTop = (area.h - stageH) / 2

  // --- menus -----------------------------------------------------------------
  const [menu, setMenu] = useState<HotspotKey | null>(null)
  const [hint, setHint] = useState(readHint)
  const [fries, setFries] = useState(0)
  // an outside-pointerdown on the same hotspot closes the menu; don't let the click reopen it
  const closedRef = useRef<{ key: HotspotKey | null; t: number }>({ key: null, t: 0 })
  const closeMenu = useCallback(() => {
    setMenu(m => {
      closedRef.current = { key: m, t: performance.now() }
      return null
    })
  }, [])
  const openMenu = (k: HotspotKey) => {
    if (closedRef.current.key === k && performance.now() - closedRef.current.t < 350) return
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

  const menuPos = (r: Rect) => {
    const cx = stageLeft + ((r.x + r.w / 2) / 100) * stageW
    const top = stageTop + (r.y / 100) * stageH
    const bottom = stageTop + ((r.y + r.h) / 100) * stageH
    const below = top < 250
    const x = Math.max(150, Math.min(area.w - 150, cx))
    return { left: x, top: below ? Math.min(bottom + 8, area.h - 40) : Math.max(top - 8, 40), below }
  }

  const h = hourOfDay(hour)
  const tod = h >= 21 || h < 5 ? 'night' : h < 7 ? 'dawn' : h >= 17 ? 'dusk' : 'day'
  const sleeping = activity?.kind === 'sleep'
  const out = location === 'out'
  const busySpot = activity && !out && !atWork ? ACTIVITY_META[activity.kind]?.spot : null
  const bg = ROOM_BACKDROP[roomKey] ?? '#fbf3e7'
  const darkBackdrop = roomKey === 'tier5'

  return (
    <div
      className={clsx('sh-scene', `sh-tod-${tod}`, darkBackdrop && 'is-dark', out && 'is-out', sleeping && 'is-sleeping')}
      style={{ '--sh-room-bg': bg } as CSSProperties}
    >
      <div className="sh-scene-area" ref={areaRef}>
        {stageW > 0 && (
          <div className="sh-stage" style={{ width: stageW, height: stageH, left: stageLeft, top: stageTop }}>
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
              return (
                <button
                  key={k}
                  type="button"
                  className={clsx('sh-hotspot', menu === k && 'is-open', hint && 'is-hint', busySpot === k && 'is-busy')}
                  style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
                  onClick={() => openMenu(k)}
                  aria-label={L.label}
                  aria-haspopup="menu"
                  aria-expanded={menu === k}
                >
                  <span className="sh-hotspot-tag">
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
            pos={menuPos(spots[menu]!)}
            onClose={closeMenu}
            onFry={() => {
              sfx.fryer()
              setFries(f => f + 1)
            }}
          />
        )}

        {hint && !atWork && !out && !sleeping && <div className="sh-scene-hint">Click things in your room — bed, fridge, computer, door</div>}

        {atWork && <WorkBanner />}
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
      const open = s.store.tickets.filter(t => t.status === 'open').length
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
        subtitle: 'Walking out mid-shift counts as a missed shift.',
        items: [{ key: 'crew', emoji: '🗓️', label: 'Check schedule & call-outs', meta: 'Crew portal', run: () => openSite('mcdoodles') }],
      }
  }
}

function HotspotMenu({ spot, pos, onClose, onFry }: { spot: HotspotKey; pos: { left: number; top: number; below: boolean }; onClose: () => void; onFry: () => void }) {
  const s = useGame(st => st.state)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(true, onClose, [ref])
  if (!s) return null
  const m = buildMenu(spot, s, onFry)
  const Icon = m.icon
  return (
    <div ref={ref} className={clsx('sh-menu', pos.below && 'is-below')} style={{ left: pos.left, top: pos.top }} role="menu">
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
  return (
    <div className="sh-sleep">
      <div className="sh-zzz" aria-hidden>
        <span>Z</span>
        <span>z</span>
        <span>z</span>
      </div>
      <div className="sh-overlay-card">
        <div className="sh-overlay-title">Sleeping</div>
        <div className="sh-overlay-sub">
          Energy {Math.round(energy)}/100 · up to {fmtMinutes(remaining)} left · time runs 4× faster
        </div>
        <button type="button" className="sh-btn sh-btn-ghost" onClick={() => cancelAct(id)}>
          Wake up
        </button>
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
  const progress = activity ? 1 - Math.max(0, activity.remainingMin - frac * 60) / Math.max(1, activity.durationMin) : 0
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
