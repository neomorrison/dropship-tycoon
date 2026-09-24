// Drives the 3D stage from the game every frame: the player's beat (director.ts), room swaps with a walk
// out of the door and back in, time of day, speed, gear, stock boxes, staff at their desks and the
// McDoodle's crowd. Reads the stores directly (no React re-render per frame) and publishes the few things
// the DOM overlays need to useScene3D.
import type { Stage } from '../../../three'
import { presetLook, resolveLook } from '../../../three/looks'
import type { ActorTask, Mood, RoomId } from '../../../three/types'
import type { GameState } from '../../../core/types'
import { useGame } from '../../../core/store'
import { useUI } from '../../../core/ui'
import { dayOf, hourOfDay } from '../../../core/time'
import {
  BeatTimeline, COUCH_ROOMS, actorMood, gearItems, playerPose, roomFor, staffOnDuty, staffSeats, taskKeyOf, uniformLook, visibleTask,
  type Beat, type PlayerOverride,
} from './director'
import { McdCrowd } from './mcdoodles'
import { useScene3D } from './bus'


const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

interface Transition { to: string; phase: 'leaving' | 'swapping'; stageEl: number; realEl: number }

export class SceneDirector {
  private stage: Stage
  private timeline = new BeatTimeline()
  private visualRoom: string | null = null
  private transition: Transition | null = null
  private swapPrep: { from: string | null; to: string; t0: number } | null = null
  private last = performance.now()
  private stageTime = 0
  private playerKey: string | null = null
  private playerTask: ActorTask | null = null
  private playerHold: string | null | undefined = undefined
  private playerLookKey = ''
  private playerMood: Mood | null = null
  private override: (PlayerOverride & { until: number; beatKey: string }) | null = null
  private staff = new Map<string, string>()
  private staffDesks = -1
  private staffCheck = 0
  private gearKey: string | null = null
  private boxes = -1
  private mcd: McdCrowd
  private happyUntil = 0
  private seenSales = new Set<string>()
  private unsub: () => void
  private disposed = false

  constructor(stage: Stage) {
    this.stage = stage
    const g = useGame.getState().state
    this.mcd = new McdCrowd(stage, (g?.meta.seed ?? 1) ^ dayOf(g?.time.hour ?? 0))
    for (const n of g?.notifications ?? []) if (n.kind === 'sale') this.seenSales.add(n.id)
    this.unsub = stage.onFrame(() => this.frame())
  }

  dispose() {
    this.disposed = true
    this.unsub()
    useScene3D.setState({ room: null, beat: null, atWork: false, moving: false })
  }

  // -------------------------------------------------------------------------
  // commands from the UI
  // -------------------------------------------------------------------------
  /** click on the floor: walk there (only when free) */
  walkTo(point: { x: number; z: number }): boolean {
    const g = useGame.getState().state
    if (!g || g.player.activity || g.player.location !== 'home' || this.transition) return false
    // a finished activity still playing out (eating the last bites...) ends when you take over
    const b = this.timeline.release()
    if (!b || b.kind !== 'idle' || b.atWork || b.out) return false
    this.override = { kind: 'goto', point, until: this.stageTime + 30, beatKey: b.key }
    return true
  }

  /** "Drop a basket": the player steps over to the fryer for a few seconds */
  fry() {
    const b = this.timeline.current
    if (!b || this.visualRoom !== 'mcdoodles' || this.transition) return
    this.override = { kind: 'fry', until: this.stageTime + 5.5, beatKey: b.key }
  }

  /** someone in the room was clicked: a friendly wave */
  wave(id: string) {
    this.stage.emote(id, 'wave')
  }

  debug() {
    return {
      beat: this.timeline.current ? { ...this.timeline.current } : null,
      pending: this.timeline.pending ? { ...this.timeline.pending } : null,
      room: this.visualRoom,
      transition: this.transition ? { ...this.transition } : null,
      player: this.playerKey,
      hold: this.playerHold ?? null,
      mood: this.playerMood,
      override: this.override ? this.override.kind : null,
      staff: [...this.staff.entries()],
      mcd: this.mcd.debug(),
    }
  }

  // -------------------------------------------------------------------------
  // per frame
  // -------------------------------------------------------------------------
  private frame() {
    if (this.disposed) return
    const now = performance.now()
    const dtReal = Math.min(0.1, Math.max(0, (now - this.last) / 1000))
    this.last = now
    const g = useGame.getState().state
    if (!g) return
    const u = useUI.getState()
    const paused = u.speed === 0 || u.pauseLocks.length > 0 || g.events.modals.length > 0
    // dev QA (scripts/e2e/scene3d.mjs): run the room while the sim clock stays frozen
    const qa = import.meta.env.DEV ? (globalThis as { __dtStageSpeed?: number }).__dtStageSpeed : undefined
    const speed = typeof qa === 'number' ? qa : paused ? 0 : u.speed
    const dt = dtReal * speed
    this.stageTime += dt
    this.stage.setSpeed(speed)
    const hod = hourOfDay(g.time.hour) + u.hourFrac
    this.stage.setTimeOfDay(hod)

    const a = g.player.activity
    let progress = 0
    if (a && a.durationMin > 0) {
      const R = Math.max(0, a.remainingMin)
      progress = clamp01(1 - (R - Math.min(R, 60) * u.hourFrac) / a.durationMin)
    }
    const beat = this.timeline.update({ activityId: a?.id ?? null, kind: a?.kind ?? null, progress, location: g.player.location, computerOpen: u.computerOpen }, dt)
    const target = roomFor(g.home.tier, beat.atWork)

    if (this.visualRoom === null) this.initial(target, g, hod)
    else if (target !== this.visualRoom && !this.transition) this.startTransition(target)

    if (this.transition) this.stepTransition(dt, dtReal, speed)
    if (this.swapPrep && (now - this.swapPrep.t0 > 650 || Number(this.stage.canvas.style.opacity || '1') < 0.06)) this.prepareRoom(g, hod)

    if (!this.transition && this.visualRoom) this.applyPlayer(beat, g)
    this.checkSales(g, beat)
    if (this.visualRoom === 'mcdoodles') {
      if (!this.swapPrep) this.mcd.update(dt, hod, this.override?.kind === 'fry')
    } else if (this.visualRoom && !this.swapPrep) {
      this.staffCheck -= dtReal
      if (this.staffCheck <= 0) {
        this.staffCheck = 0.4
        this.syncStaff(g, false)
      }
      this.syncStuff(g)
    }
    this.publish(beat)
  }

  private publish(beat: Beat) {
    const st = useScene3D.getState()
    const moving = !!this.transition
    if (st.room !== this.visualRoom || st.beat !== beat.kind || st.atWork !== beat.atWork || st.moving !== moving) {
      useScene3D.setState({ room: this.visualRoom, beat: beat.kind, atWork: beat.atWork, moving })
    }
  }

  // -------------------------------------------------------------------------
  // rooms
  // -------------------------------------------------------------------------
  private initial(room: string, g: GameState, hod: number) {
    this.visualRoom = room
    void this.stage.setRoom(room as RoomId, { staffDesks: this.deskCount(g, room) })
    this.applyLook(g)
    if (room === 'mcdoodles') this.mcd.enter(hod)
    else {
      this.syncStaff(g, true)
      this.syncStuff(g, true)
    }
  }

  private startTransition(to: string) {
    const walking = visibleTask(this.playerTask)
    this.transition = { to, phase: walking ? 'leaving' : 'swapping', stageEl: 0, realEl: 0 }
    this.override = null
    if (walking) this.setPlayerTask({ kind: 'leave' }, null)
    else this.swap(this.transition)
  }

  private stepTransition(dt: number, dtReal: number, speed: number) {
    const tr = this.transition!
    tr.stageEl += dt
    tr.realEl += dtReal
    if (tr.phase === 'leaving' && (tr.stageEl >= 4.8 || tr.realEl >= (speed === 0 ? 0.3 : 7))) this.swap(tr)
  }

  private swap(tr: Transition) {
    tr.phase = 'swapping'
    const from = this.visualRoom
    this.visualRoom = tr.to
    this.setPlayerTask({ kind: 'hidden' }, null)
    const g = useGame.getState().state
    this.swapPrep = { from, to: tr.to, t0: performance.now() }
    void this.stage.setRoom(tr.to as RoomId, { staffDesks: g ? this.deskCount(g, tr.to) : 0 }).then(() => {
      if (this.disposed || this.transition !== tr) return
      this.transition = null
      // the player walks in through the door
      this.playerKey = null
    })
  }

  /** the old room has faded out: swap its people for the new room's */
  private prepareRoom(g: GameState, hod: number) {
    const p = this.swapPrep!
    this.swapPrep = null
    if (p.from === 'mcdoodles') this.mcd.leave()
    else this.removeStaff()
    this.applyLook(g)
    if (p.to === 'mcdoodles') this.mcd.enter(hod)
    else {
      this.syncStaff(g, true)
      this.syncStuff(g, true)
    }
  }

  // -------------------------------------------------------------------------
  // the player
  // -------------------------------------------------------------------------
  private applyLook(g: GameState) {
    const base = g.player.look ? resolveLook(g.player.look) : presetLook('player')
    const look = this.visualRoom === 'mcdoodles' ? uniformLook(base) : base
    const key = JSON.stringify(look)
    if (key === this.playerLookKey) return
    this.playerLookKey = key
    this.stage.setActor('player', { look, name: g.player.name || g.meta.playerName })
  }

  private applyPlayer(beat: Beat, g: GameState) {
    this.applyLook(g)
    const mood = actorMood(g.player.energy, g.player.mood, performance.now() < this.happyUntil)
    if (mood !== this.playerMood) {
      this.playerMood = mood
      this.stage.mood('player', mood)
    }
    if (this.override && (this.override.beatKey !== beat.key || this.stageTime > this.override.until)) this.override = null
    const pose = playerPose(beat, { couch: COUCH_ROOMS.has(this.visualRoom ?? ''), override: this.override })
    this.setPlayerTask(pose.task, pose.hold)
  }

  private setPlayerTask(t: ActorTask, hold: string | null) {
    const k = taskKeyOf(t)
    if (k !== this.playerKey) {
      this.playerKey = k
      this.playerTask = t
      this.stage.task('player', t)
    }
    if (hold !== this.playerHold) {
      this.playerHold = hold
      this.stage.hold('player', hold)
    }
  }

  private checkSales(g: GameState, beat: Beat) {
    const list = g.notifications
    for (let i = Math.max(0, list.length - 6); i < list.length; i++) {
      const n = list[i]
      if (n.kind !== 'sale' || this.seenSales.has(n.id)) continue
      this.seenSales.add(n.id)
      if ((n.amount ?? 0) >= 60) {
        this.happyUntil = performance.now() + 12000
        if (beat.kind === 'idle' && !this.transition) this.stage.emote('player', 'cheer')
      }
    }
    if (this.seenSales.size > 400) this.seenSales = new Set([...this.seenSales].slice(-100))
  }

  // -------------------------------------------------------------------------
  // staff, gear, boxes (home rooms)
  // -------------------------------------------------------------------------
  private deskCount(g: GameState, room: string) {
    if (room === 'mcdoodles') return 0
    return staffSeats(g.staff.members, g.home.tier).length
  }

  private removeStaff() {
    for (const id of this.staff.keys()) this.stage.removeActor(id)
    this.staff.clear()
  }

  /** `place`: the room just loaded, so people appear at their desks instead of walking in */
  private syncStaff(g: GameState, place: boolean) {
    const seats = staffSeats(g.staff.members, g.home.tier)
    if (seats.length !== this.staffDesks) {
      this.staffDesks = seats.length
      this.stage.setStaffDesks(seats.length)
    }
    const duty = staffOnDuty(dayOf(g.time.hour), hourOfDay(g.time.hour))
    const keep = new Set<string>()
    seats.forEach((m, i) => {
      const id = `staff_${m.id}`
      keep.add(id)
      const want: ActorTask = duty ? { kind: 'sit', at: `staff_${i + 1}_sit`, anim: 'sit_type' } : { kind: 'leave' }
      const k = taskKeyOf(want)
      const had = this.staff.get(id)
      if (had === undefined) {
        this.stage.setActor(id, { look: presetLook(m.portrait), name: m.name })
        this.stage.mood(id, m.morale < 35 ? 'stressed' : m.morale > 75 ? 'happy' : 'neutral')
        // hired mid-day: hidden first, so they come in through the door
        if (!place) this.stage.task(id, { kind: 'hidden' })
      }
      if (had !== k) {
        this.staff.set(id, k)
        this.stage.task(id, want)
      }
    })
    for (const id of [...this.staff.keys()]) {
      if (keep.has(id)) continue
      this.stage.removeActor(id)
      this.staff.delete(id)
    }
  }

  private syncStuff(g: GameState, force = false) {
    const gear = gearItems(g.gear)
    const gk = gear.map(x => x.id).join(',')
    if (force || gk !== this.gearKey) {
      this.gearKey = gk
      this.stage.setGear(gear)
    }
    let units = 0
    for (const inv of Object.values(g.catalog?.inventory ?? {})) units += Math.max(0, inv?.units ?? 0)
    units = Math.round(units)
    if (force || units !== this.boxes) {
      this.boxes = units
      this.stage.setBoxes(units)
    }
  }
}
