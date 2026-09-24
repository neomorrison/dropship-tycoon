// The live 3D room (Sims-style): a three.js stage in place of the painted room, with the shell's DOM
// overlays anchored to it (hover labels, activity bubble over the player's head, thought bubbles, the
// player's needs card, camera buttons). Lazy loaded: three.js lives in this chunk.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Focus, RotateCcw, RotateCw, X, ZoomIn, ZoomOut, Shirt } from 'lucide-react'
import { useStage } from '../../../three/react'
import type { Pick3D, ScreenRect, Stage } from '../../../three'
import { useGS, useGSShallow } from '../../../core/store'
import { openSite, useUI } from '../../../core/ui'
import { sfx } from '../../audio'
import { ACTIVITY_META, activityInfo, type HotspotKey } from '../activityMeta'
import { SPOT_LABEL, layoutTags, type Box } from '../hotspotLabels'
import type { Rect } from '../hotspots'
import { isTypingTarget, useDismiss } from '../common'
import { tuckCoachIfCoveringBox } from '../shellStore'
import { SceneDirector } from './SceneDirector'
import { setScene3DCommands, useScene3D } from './bus'
import { ROOM_SPOTS, THOUGHT, needsThought, type Thought } from './director'
import { mark3dFailed, stageUrl, useStageQuality } from './session'
import './scene3d.css'

export interface Scene3DProps {
  /** first visit: every label shows */
  hint: boolean
  compact: boolean
  ready: boolean
  /** menu currently open (its object keeps the hover glow) */
  menu: HotspotKey | null
  onReady: () => void
  onOpenMenu: (key: HotspotKey, rect: ScreenRect) => void
  /** bumps when a fry basket drops (the +🍟 pops over the fryer) */
  fries: number
}

declare global {
  interface Window {
    __stage?: Stage
    __scene3d?: SceneDirector
  }
}

const SPOT_KEYS = new Set(Object.keys(SPOT_LABEL))
const isSpot = (k: string | null): k is HotspotKey => !!k && SPOT_KEYS.has(k)

export default function Scene3D({ hint, compact, ready, menu, onReady, onOpenMenu, fries }: Scene3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const quality = useStageQuality()
  const [hover, setHover] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [card, setCard] = useState<{ x: number; y: number } | null>(null)
  const [ripple, setRipple] = useState<{ x: number; y: number; n: number } | null>(null)
  const lastUp = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const directorRef = useRef<SceneDirector | null>(null)
  const stageRef = useRef<Stage | null>(null)
  const readyRef = useRef(ready)
  readyRef.current = ready

  const onPick = useCallback(
    (p: Pick3D) => {
      const stage = stageRef.current
      if (!stage || !readyRef.current) return
      if (p.kind === 'object' && isSpot(p.key)) {
        const r = stage.screenRect(p.key)
        if (!r) return
        const c = canvasRef.current?.getBoundingClientRect()
        if (c) tuckCoachIfCoveringBox({ left: c.left + r.x, top: c.top + r.y, right: c.left + r.x + r.w, bottom: c.top + r.y + r.h })
        setCard(null)
        onOpenMenu(p.key, r)
        return
      }
      if (p.kind === 'actor') {
        const id = p.key.slice(6)
        if (id === 'player') {
          const pt = stage.screenPoint('player', 'head')
          sfx.pop()
          setCard(c => (c ? null : pt ? { x: pt.x, y: pt.y } : null))
        } else if (id.startsWith('staff_')) {
          sfx.click()
          openSite('upworx', 'team')
        } else directorRef.current?.wave(id)
        return
      }
      if (p.kind === 'floor' && p.point) {
        setCard(null)
        if (directorRef.current?.walkTo({ x: p.point.x, z: p.point.z })) {
          setRipple(r => ({ ...lastUp.current, n: (r?.n ?? 0) + 1 }))
          sfx.click()
        }
      }
    },
    [onOpenMenu],
  )

  const stage = useStage(canvasRef, {
    url: stageUrl,
    quality,
    onHover: k => setHover(k),
    onPick,
    onReady,
    onError: e => mark3dFailed(e),
  })
  stageRef.current = stage

  // the director drives the room from the game
  useEffect(() => {
    if (!stage) return
    const d = new SceneDirector(stage)
    directorRef.current = d
    setScene3DCommands({ fry: () => d.fry() })
    if (import.meta.env.DEV) {
      window.__stage = stage
      window.__scene3d = d
    }
    return () => {
      d.dispose()
      directorRef.current = null
      setScene3DCommands({})
      if (import.meta.env.DEV && window.__stage === stage) {
        delete window.__stage
        delete window.__scene3d
      }
    }
  }, [stage])

  // stop drawing while the computer covers the room (the phone at work leaves it visible) or the look editor is up
  const computerOpen = useUI(u => u.computerOpen)
  const overlay = useUI(u => u.overlay)
  const room = useScene3D(s => s.room)
  const covered = (computerOpen && room !== 'mcdoodles') || overlay === 'look'
  useEffect(() => {
    if (!stage) return
    if (!covered) {
      stage.setActive(true)
      return
    }
    const t = window.setTimeout(() => stage.setActive(false), 450)
    return () => window.clearTimeout(t)
  }, [stage, covered])

  // the open menu's object keeps its glow; keyboard focus glows too
  useEffect(() => {
    stage?.highlight(focusKey ?? menu ?? null)
  }, [stage, focusKey, menu])

  // Q / E rotate the room (no other shortcut uses them)
  useEffect(() => {
    if (!stage) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      const u = useUI.getState()
      if (u.computerOpen || u.overlay) return
      const k = e.key.toLowerCase()
      if (k !== 'q' && k !== 'e') return
      e.preventDefault()
      stage.rotate(k === 'q' ? -90 : 90)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage])

  // ---- overlays ------------------------------------------------------------
  const beat = useScene3D(s => s.beat)
  const atWork = useScene3D(s => s.atWork)
  const moving = useScene3D(s => s.moving)
  const needs = useGSShallow(s => ({ energy: s.player.energy, hunger: s.player.hunger, mood: s.player.mood }))
  const location = useGS(s => s.player.location)
  const playerName = useGS(s => s.player.name || s.meta.playerName)
  const staff = useGS(s => s.staff.members)
  const spots = useMemo(() => (room ? (ROOM_SPOTS[room] ?? []).filter(isSpot) : []), [room])
  const labelKeys = useMemo(() => {
    if (!ready || moving) return [] as HotspotKey[]
    if (hint && !atWork) return spots.filter(k => k !== 'tv')
    const k = isSpot(focusKey) ? focusKey : isSpot(hover) ? hover : null
    return k && k !== menu && spots.includes(k) ? [k] : []
  }, [ready, moving, hint, atWork, spots, focusKey, hover, menu])
  const hoverActor = hover?.startsWith('actor:') ? hover.slice(6) : null
  const actorName = useMemo(() => {
    if (!hoverActor) return null
    if (hoverActor === 'player') return card ? null : playerName
    if (hoverActor.startsWith('staff_')) return staff.find(m => `staff_${m.id}` === hoverActor)?.name ?? null
    if (hoverActor.startsWith('crew')) return 'Crew'
    return null
  }, [hoverActor, playerName, staff, card])

  const sleepingBeat = !moving && (beat === 'sleep' || beat === 'nap')
  const thought: Thought | null = beat === 'idle' && location === 'home' && !moving ? needsThought(needs.energy, needs.hunger, needs.mood) : null
  const busyEmoji = !moving && beat && beat !== 'idle' && !sleepingBeat ? (beat === 'computer' ? '💻' : ACTIVITY_META[beat]?.emoji ?? null) : null
  const refKey = spots[0] ?? null
  const refKeyRef = useRef(refKey)
  refKeyRef.current = refKey

  // positions follow the camera every frame (no React render)
  const headRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLDivElement>(null)
  const tagRefs = useRef(new Map<string, HTMLSpanElement>())
  const labelsRef = useRef(labelKeys)
  labelsRef.current = labelKeys
  const actorRef = useRef(actorName ? hoverActor : null)
  actorRef.current = actorName ? hoverActor : null
  const compactRef = useRef(compact)
  compactRef.current = compact
  useEffect(() => {
    if (!stage) return
    let n = 0
    let obstacles: Box[] = []
    // is the player walking? (feet moving on screen while the camera holds still)
    let lastFeet: { x: number; y: number } | null = null
    let lastRef: ScreenRect | null = null
    let still = 0
    let lastT = performance.now()
    return stage.onFrame(() => {
      const root = rootRef.current
      if (!root) return
      const W = root.clientWidth
      const H = root.clientHeight
      const now = performance.now()
      const dt = Math.min(0.1, (now - lastT) / 1000)
      lastT = now
      // bubble over the head
      const head = headRef.current
      const hp = stage.screenPoint('player', 'above')
      const feet = stage.screenPoint('player', 'feet')
      const ref = refKeyRef.current ? stage.screenRect(refKeyRef.current) : null
      const camMoved = !!ref && !!lastRef && Math.abs(ref.x - lastRef.x) + Math.abs(ref.y - lastRef.y) + Math.abs(ref.w - lastRef.w) > 0.3
      if (!camMoved && feet && lastFeet) still = Math.hypot(feet.x - lastFeet.x, feet.y - lastFeet.y) > 0.25 ? 0 : still + dt
      lastFeet = feet
      lastRef = ref
      if (head) {
        if (hp) {
          head.style.transform = `translate(${hp.x.toFixed(1)}px, ${hp.y.toFixed(1)}px)`
          head.style.visibility = ''
          head.classList.toggle('is-walking', still < 0.3)
        } else head.style.visibility = 'hidden'
      }
      // hovered person's name
      const nm = nameRef.current
      const aid = actorRef.current
      if (nm) {
        const p = aid ? stage.screenPoint(aid, 'feet') : null
        if (p) {
          nm.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y + 8).toFixed(1)}px)`
          nm.style.visibility = ''
        } else nm.style.visibility = 'hidden'
      }
      // object labels
      const keys = labelsRef.current
      if (!keys.length) return
      if (n++ % 20 === 0) {
        const top = root.parentElement?.querySelector('.sh-scene-top')
        const a = root.getBoundingClientRect()
        obstacles = top
          ? (Array.from(top.children) as HTMLElement[])
              .map(el => el.getBoundingClientRect())
              .filter(r => r.width && r.height)
              .map(r => ({ x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height }))
          : []
      }
      const rects: [HotspotKey, Rect][] = []
      for (const k of keys) {
        const r = stage.screenRect(k)
        if (r && r.w > 2) rects.push([k, r])
      }
      const sizes: Partial<Record<HotspotKey, { w: number; h: number }>> = {}
      for (const [k] of rects) {
        const el = tagRefs.current.get(k)
        if (el) sizes[k] = { w: el.offsetWidth, h: el.offsetHeight }
      }
      const extra = hp ? [...obstacles, { x: hp.x - 22, y: hp.y - 46, w: 44, h: 46 }] : obstacles
      const pos = layoutTags(rects, { w: 100, h: 100 }, { x: 0, y: 0, w: W, h: H }, compactRef.current, sizes, null, extra)
      for (const k of keys) {
        const el = tagRefs.current.get(k)
        if (!el) continue
        const r = rects.find(x => x[0] === k)?.[1]
        const tp = pos[k]
        if (!r || !tp) {
          el.style.visibility = 'hidden'
          continue
        }
        const w = sizes[k]?.w ?? 0
        el.style.visibility = ''
        el.style.transform = `translate(${(r.x + r.w / 2 + tp.dx - w / 2).toFixed(1)}px, ${(r.y + tp.top).toFixed(1)}px)`
      }
    })
  }, [stage])

  // "+🍟" over the fryer
  const [friesAt, setFriesAt] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    if (!fries || !stage) return
    const r = stage.screenRect('fryer')
    setFriesAt(r ? { x: r.x + r.w / 2, y: r.y } : null)
  }, [fries, stage])

  // player's needs card closes when the player leaves the room
  useEffect(() => {
    if (moving || location !== 'home') setCard(null)
  }, [moving, location])

  const openSpot = (k: HotspotKey) => {
    const r = stage?.screenRect(k)
    if (r) onOpenMenu(k, r)
  }

  return (
    <div className={clsx('sh-3d', ready && 'is-ready', compact && 'is-compact')} ref={rootRef}>
      <canvas
        ref={canvasRef}
        className="sh-3d-canvas"
        aria-label={atWork ? "McDoodle's, in 3D" : 'Your place, in 3D'}
        onPointerUp={e => {
          const r = e.currentTarget.getBoundingClientRect()
          lastUp.current = { x: e.clientX - r.left, y: e.clientY - r.top }
        }}
      />
      {ready && (
        <>
          {labelKeys.map(k => {
            const L = SPOT_LABEL[k]
            const Icon = L.icon
            return (
              <span
                key={k}
                className={clsx('sh-3d-tag', hint && 'is-hint')}
                ref={el => {
                  if (el) tagRefs.current.set(k, el)
                  else tagRefs.current.delete(k)
                }}
                style={{ visibility: 'hidden' }}
                aria-hidden
              >
                <Icon size={13} strokeWidth={2.4} />
                {L.label}
              </span>
            )
          })}

          <div className="sh-3d-head" ref={headRef} style={{ visibility: 'hidden' }}>
            {sleepingBeat ? (
              <>
                <div className="sh-3d-zzz" aria-hidden>
                  <span>Z</span>
                  <span>z</span>
                  <span>z</span>
                </div>
                <div className="sh-3d-bubble is-sleepy" aria-hidden>
                  😴
                </div>
              </>
            ) : busyEmoji ? (
              <div className="sh-3d-bubble" aria-hidden>
                {busyEmoji}
              </div>
            ) : thought ? (
              <button
                type="button"
                className={clsx('sh-3d-thought', `is-${thought}`)}
                onClick={() => {
                  sfx.pop()
                  const spot = THOUGHT[thought].spot
                  openSpot(spot === 'couch' && !spots.includes('couch') ? 'bed' : spot)
                }}
                title={THOUGHT[thought].label}
                aria-label={`${THOUGHT[thought].label}: see what helps`}
              >
                <span className="sh-3d-thought-emoji">{THOUGHT[thought].emoji}</span>
                <i />
                <i />
              </button>
            ) : null}
          </div>

          <div className="sh-3d-name" ref={nameRef} style={{ visibility: 'hidden' }} aria-hidden>
            {actorName}
          </div>

          {ripple && <span key={`walk${ripple.n}`} className="sh-3d-ripple" style={{ left: ripple.x, top: ripple.y }} aria-hidden />}
          {friesAt && fries > 0 && (
            <div key={`fries${fries}`} className="sh-fries-pop" style={{ left: friesAt.x, top: friesAt.y }} aria-hidden>
              +🍟
            </div>
          )}

          {card && <NeedsCard at={card} onClose={() => setCard(null)} areaRef={rootRef} />}

          <div className="sh-3d-cam" role="group" aria-label="Camera">
            <button type="button" onClick={() => stage?.rotate(-90)} title="Rotate left (Q)" aria-label="Rotate left">
              <RotateCcw size={16} strokeWidth={2.4} />
            </button>
            <button type="button" onClick={() => stage?.rotate(90)} title="Rotate right (E)" aria-label="Rotate right">
              <RotateCw size={16} strokeWidth={2.4} />
            </button>
            <button type="button" onClick={() => stage?.zoom(1)} title="Zoom in" aria-label="Zoom in">
              <ZoomIn size={16} strokeWidth={2.4} />
            </button>
            <button type="button" onClick={() => stage?.zoom(-1)} title="Zoom out" aria-label="Zoom out">
              <ZoomOut size={16} strokeWidth={2.4} />
            </button>
            <button type="button" onClick={() => stage?.resetView()} title="Reset view" aria-label="Reset view">
              <Focus size={16} strokeWidth={2.4} />
            </button>
          </div>

          {/* keyboard: one focusable button per object (focus = glow + label, Enter = its menu) */}
          <div className="sh-3d-keys">
            {spots
              .filter(k => k !== 'tv')
              .map(k => (
                <button
                  key={k}
                  type="button"
                  className="sh-3d-key"
                  aria-haspopup="menu"
                  aria-expanded={menu === k}
                  onFocus={() => setFocusKey(k)}
                  onBlur={() => setFocusKey(f => (f === k ? null : f))}
                  onClick={() => openSpot(k)}
                >
                  {SPOT_LABEL[k].label}
                </button>
              ))}
            {location === 'home' && (
              <button
                type="button"
                className="sh-3d-key"
                onClick={() => {
                  const pt = stage?.screenPoint('player', 'head')
                  if (pt) setCard({ x: pt.x, y: pt.y })
                }}
              >
                {playerName}: needs
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// the player's needs card (click the player)
// ---------------------------------------------------------------------------
function NeedsCard({ at, onClose, areaRef }: { at: { x: number; y: number }; onClose: () => void; areaRef: { current: HTMLDivElement | null } }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(true, onClose, [ref])
  const p = useGSShallow(s => ({ name: s.player.name || s.meta.playerName, energy: s.player.energy, hunger: s.player.hunger, mood: s.player.mood, kind: s.player.activity?.kind ?? null }))
  const beat = useScene3D(s => s.beat)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && (!size || size.w !== el.offsetWidth || size.h !== el.offsetHeight)) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  })
  const W = areaRef.current?.clientWidth ?? 800
  const H = areaRef.current?.clientHeight ?? 600
  const w = size?.w ?? 240
  const h = size?.h ?? 200
  // beside the head (right, else left), inside the room
  let left = at.x + 26
  if (left + w > W - 8) left = at.x - 26 - w
  left = Math.max(8, Math.min(W - w - 8, left))
  const top = Math.max(8, Math.min(H - h - 8, at.y - h / 2))
  const kind = p.kind
  const doing = kind ? activityInfo(kind) : null
  const idleLine = beat === 'computer' ? 'At the computer' : 'Free time'
  const bars: { key: string; emoji: string; label: string; v: number; tone: string }[] = [
    { key: 'energy', emoji: '⚡', label: 'Energy', v: p.energy, tone: 'energy' },
    { key: 'hunger', emoji: '🍔', label: 'Hunger', v: p.hunger, tone: 'hunger' },
    { key: 'mood', emoji: '🙂', label: 'Mood', v: p.mood, tone: 'mood' },
  ]
  return (
    <div ref={ref} className="sh-3d-card" style={{ left, top, visibility: size ? 'visible' : 'hidden' }} role="dialog" aria-label={`${p.name}'s needs`}>
      <div className="sh-3d-card-head">
        <b>{p.name}</b>
        <button type="button" className="sh-3d-card-x" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="sh-3d-card-doing">
        <span>{doing ? doing.emoji : '🙂'}</span>
        {doing ? doing.label : idleLine}
      </div>
      <div className="sh-3d-card-bars">
        {bars.map(b => {
          const v = Math.max(0, Math.min(100, Number.isFinite(b.v) ? b.v : 0))
          return (
            <div key={b.key} className={clsx('sh-3d-bar', `is-${b.tone}`, v < 20 ? 'is-crit' : v < 40 ? 'is-low' : '')}>
              <span className="sh-3d-bar-label">
                {b.emoji} {b.label}
              </span>
              <span className="sh-3d-bar-track">
                <span style={{ transform: `scaleX(${v / 100})` }} />
              </span>
              <span className="sh-3d-bar-v">{Math.round(v)}</span>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="sh-btn sh-btn-ghost sh-btn-sm sh-3d-card-look"
        onClick={() => {
          sfx.click()
          onClose()
          useUI.getState().set({ overlay: 'look' })
        }}
      >
        <Shirt size={14} /> Change look
      </button>
    </div>
  )
}
