// McDoodle's crew and customers in the 3D restaurant. Customers come in through the glass door by the
// hour (lunch and dinner rushes, quiet otherwise), queue at the counter, order, then either eat in a
// booth or take the bag home, and leave. Runs on stage time (real time × game speed), so pausing freezes it.
import type { Stage } from '../../../three'
import { presetLook } from '../../../three/looks'
import type { ActorTask } from '../../../three/types'
import { customerInterval, isRush, taskKeyOf } from './director'

type CState = 'queue' | 'order' | 'eat' | 'leaving'
interface Customer {
  id: string
  state: CState
  /** queue slot (0 = at the counter) */
  slot: number
  /** stage time when the customer is expected at the current spot */
  readyAt: number
  /** stage time the current state ends */
  until: number
  seat: number
}

const MAX_CUSTOMERS = 11
const SEATS = 6

/** small seeded PRNG (UI only; the sim has its own) */
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class McdCrowd {
  private stage: Stage
  private rand: () => number
  private now = 0
  private seq = 0
  private spawnIn = 1.2
  private customers: Customer[] = []
  private seats: (string | null)[] = Array.from({ length: SEATS }, () => null)
  private tasks = new Map<string, string>()
  private crew = ['crew_1', 'crew_2', 'crew_3']
  active = false

  constructor(stage: Stage, seed: number) {
    this.stage = stage
    this.rand = mulberry(seed)
  }

  private task(id: string, t: ActorTask) {
    const k = taskKeyOf(t)
    if (this.tasks.get(id) === k) return
    this.tasks.set(id, k)
    this.stage.task(id, t)
  }

  /** the restaurant is on screen: crew at their stations (placed directly), a few diners already in */
  enter(hour: number) {
    if (this.active) return
    this.active = true
    for (const id of this.crew) this.stage.setActor(id, { look: presetLook(id), name: 'Crew' })
    this.crewTasks(hour, false)
    this.stage.hold('crew_1', 'spatula')
    // a couple of people already eating when you walk in
    const diners = isRush(hour) ? 3 : 1
    for (let i = 0; i < diners; i++) {
      const c = this.spawn(true)
      if (!c) break
      const seat = this.freeSeat()
      if (seat < 0) break
      this.seats[seat] = c.id
      c.seat = seat
      c.state = 'eat'
      c.until = this.now + 6 + this.rand() * 14
      this.stage.hold(c.id, this.rand() < 0.5 ? 'burger' : 'fries')
      this.task(c.id, { kind: 'sit', at: `booth_sit_${seat + 1}`, anim: 'eat_sit' })
    }
  }

  /** left the restaurant: everyone goes */
  leave() {
    if (!this.active) return
    this.active = false
    for (const id of this.crew) this.stage.removeActor(id)
    for (const c of this.customers) this.stage.removeActor(c.id)
    this.customers = []
    this.seats.fill(null)
    for (const id of [...this.tasks.keys()]) this.tasks.delete(id)
  }

  private crewTasks(hour: number, playerFrying: boolean) {
    this.task('crew_1', { kind: 'use', at: 'grill_stand', anim: 'cook' })
    this.task('crew_2', playerFrying ? { kind: 'idle', at: 'crew_1' } : { kind: 'use', at: 'fryer_stand', anim: 'cook' })
    this.task('crew_3', isRush(hour) ? { kind: 'use', at: 'crew_2', anim: 'register' } : { kind: 'wander' })
  }

  private freeSeat(): number {
    const free = this.seats.map((s, i) => (s ? -1 : i)).filter(i => i >= 0)
    return free.length ? free[Math.floor(this.rand() * free.length)] : -1
  }

  private spawn(seated = false): Customer | null {
    if (this.customers.length >= MAX_CUSTOMERS) return null
    const n = this.seq++
    const id = `cust_${n}`
    const look = presetLook(`customer_${1 + (Math.floor(this.rand() * 8) % 8)}`)
    this.stage.setActor(id, { look, name: 'Customer', walkSpeed: 1.2 + this.rand() * 0.25 })
    if (!seated) {
      // hidden first, so the next task walks in through the door
      this.stage.task(id, { kind: 'hidden' })
      this.tasks.set(id, 'hidden')
    }
    const c: Customer = { id, state: 'queue', slot: -1, readyAt: 0, until: 0, seat: -1 }
    this.customers.push(c)
    return c
  }

  update(dt: number, hour: number, playerFrying: boolean) {
    if (!this.active) return
    this.now += dt
    this.crewTasks(hour, playerFrying)
    const queue = this.customers.filter(c => c.state === 'queue' || c.state === 'order')
    // arrivals
    this.spawnIn -= dt
    if (this.spawnIn <= 0) {
      const mean = customerInterval(hour)
      this.spawnIn = mean * (0.55 + this.rand() * 0.9)
      if (queue.length < 4) {
        const c = this.spawn()
        if (c) queue.push(c)
      }
    }
    // queue slots
    queue.forEach((c, i) => {
      if (c.slot === i) return
      const fromDoor = c.slot < 0
      c.slot = i
      c.readyAt = this.now + (fromDoor ? 4.6 + (3 - i) * 0.45 : 1.3)
      if (c.state === 'queue') this.task(c.id, { kind: 'idle', at: `queue_${i + 1}` })
    })
    const front = queue[0]
    if (front && front.slot === 0 && this.now >= front.readyAt) {
      if (front.state === 'queue') {
        front.state = 'order'
        front.until = this.now + 2.2 + this.rand() * 1.8
        this.task(front.id, { kind: 'idle', at: 'queue_1', anim: 'talk' })
      } else if (front.state === 'order' && this.now >= front.until) {
        const seat = this.rand() < 0.62 ? this.freeSeat() : -1
        if (seat >= 0) {
          this.seats[seat] = front.id
          front.seat = seat
          front.state = 'eat'
          front.until = this.now + 12 + this.rand() * 12
          this.stage.hold(front.id, this.rand() < 0.5 ? 'burger' : 'fries')
          this.task(front.id, { kind: 'sit', at: `booth_sit_${seat + 1}`, anim: 'eat_sit' })
        } else {
          this.stage.hold(front.id, 'takeout_bag')
          this.goHome(front)
        }
      }
    }
    // diners finish, leavers vanish
    for (const c of [...this.customers]) {
      if (c.state === 'eat' && this.now >= c.until) {
        this.stage.hold(c.id, null)
        if (c.seat >= 0) this.seats[c.seat] = null
        c.seat = -1
        this.goHome(c)
      } else if (c.state === 'leaving' && this.now >= c.until) {
        this.stage.removeActor(c.id)
        this.tasks.delete(c.id)
        this.customers.splice(this.customers.indexOf(c), 1)
      }
    }
  }

  private goHome(c: Customer) {
    c.state = 'leaving'
    c.slot = -1
    c.until = this.now + 12
    this.task(c.id, { kind: 'leave' })
  }

  /** for QA */
  debug() {
    return { customers: this.customers.map(c => ({ id: c.id, state: c.state, slot: c.slot, seat: c.seat })), seats: [...this.seats] }
  }
}
