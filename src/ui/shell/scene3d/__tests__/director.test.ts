import { describe, expect, it } from 'vitest'
import type { ActivityKind } from '../../../../core/types'
import {
  BeatTimeline, HOLD, YIELD, actorMood, beatProgress, customerInterval, gearItems, needsThought, playerPose, staffOnDuty, staffSeats, taskKeyOf,
  uniformLook, type Beat, type SimSnapshot,
} from '../director'
import { ACTIVITY_META } from '../../activityMeta'

const snap = (p: Partial<SimSnapshot> = {}): SimSnapshot => ({ activityId: null, kind: null, progress: 0, location: 'home', computerOpen: false, ...p })
const beat = (kind: Beat['kind'], p: Partial<Beat> = {}): Beat => ({ key: `act:${kind}`, kind, atWork: false, out: false, elapsed: 0, simActive: true, simProgress: 0, ...p })

describe('playerPose', () => {
  it('gives every activity a visible behaviour', () => {
    for (const kind of Object.keys(ACTIVITY_META) as ActivityKind[]) {
      const pose = playerPose(beat(kind, { atWork: kind === 'work_shift' }), { couch: true })
      expect(pose.task.kind, kind).not.toBe('wander')
    }
  })

  it('sleeps in bed, relaxes on the couch (or the bed edge) with the phone', () => {
    expect(playerPose(beat('sleep'), { couch: true }).task).toEqual({ kind: 'lie', at: 'bed_lie' })
    expect(playerPose(beat('nap'), { couch: true }).task).toEqual({ kind: 'lie', at: 'bed_lie' })
    expect(playerPose(beat('relax'), { couch: true })).toEqual({ task: { kind: 'sit', at: 'couch_sit', anim: 'sit_idle' }, hold: 'phone' })
    expect(playerPose(beat('relax'), { couch: false }).task).toMatchObject({ at: 'bed_sit' })
  })

  it('cooks, then eats at the table', () => {
    const cook = playerPose(beat('eat_home', { elapsed: 2, simProgress: 1 }), { couch: true })
    expect(cook.task).toEqual({ kind: 'use', at: 'stove_stand', anim: 'cook' })
    const eat = playerPose(beat('eat_home', { elapsed: HOLD.eat_home * 0.8, simProgress: 1 }), { couch: true })
    expect(eat).toEqual({ task: { kind: 'sit', at: 'eat_sit', anim: 'eat_sit' }, hold: 'plate' })
    // a long meal follows the sim's progress
    expect(playerPose(beat('eat_home', { elapsed: 60, simProgress: 0.3 }), { couch: true }).task.kind).toBe('use')
  })

  it('waits for takeout at the door, then eats', () => {
    expect(playerPose(beat('eat_takeout', { elapsed: 1, simProgress: 1 }), { couch: true })).toEqual({ task: { kind: 'idle', at: 'door_stand', anim: 'phone' }, hold: 'phone' })
    expect(playerPose(beat('eat_takeout', { elapsed: 14, simProgress: 1 }), { couch: true }).hold).toBe('takeout_bag')
  })

  it('types at the desk, films with the phone, leaves for the gym and shifts', () => {
    expect(playerPose(beat('customer_support'), { couch: true }).task).toEqual({ kind: 'sit', at: 'computer_sit', anim: 'sit_type' })
    expect(playerPose(beat('film_creative'), { couch: true })).toEqual({ task: { kind: 'use', at: 'film_stand', anim: 'film' }, hold: 'phone' })
    for (const k of ['gym', 'socialize', 'shower', 'work_shift'] as const) expect(playerPose(beat(k), { couch: true }).task.kind).toBe('leave')
    expect(playerPose(beat('work_shift', { atWork: true }), { couch: true }).task).toEqual({ kind: 'use', at: 'counter_stand', anim: 'register' })
    expect(playerPose(beat('work_shift', { atWork: true }), { couch: true, override: { kind: 'fry' } }).task).toMatchObject({ at: 'fryer_stand' })
    expect(playerPose(beat('gym', { out: true }), { couch: true }).task.kind).toBe('leave')
  })

  it('wanders when free, sits at the desk while the computer is open, walks where clicked', () => {
    expect(playerPose(beat('idle', { simActive: false }), { couch: true }).task).toEqual({ kind: 'wander' })
    expect(playerPose(beat('computer', { simActive: false }), { couch: true }).task).toMatchObject({ kind: 'sit', at: 'computer_sit' })
    expect(playerPose(beat('idle', { simActive: false }), { couch: true, override: { kind: 'goto', point: { x: 1, z: 2 } } }).task).toEqual({ kind: 'goto', point: { x: 1, z: 2 } })
  })
})

describe('BeatTimeline', () => {
  it('keeps a short activity on screen for its hold time after the sim finished it', () => {
    const t = new BeatTimeline()
    t.update(snap(), 0.1)
    expect(t.update(snap({ activityId: 'a', kind: 'eat_home', progress: 0.2 }), 0.1).kind).toBe('eat_home')
    // the sim is done after a moment
    let b = t.update(snap(), 1)
    expect(b.kind).toBe('eat_home')
    expect(b.simActive).toBe(false)
    for (let i = 0; i < 10; i++) b = t.update(snap(), 1)
    expect(b.kind).toBe('eat_home')
    for (let i = 0; i < 6; i++) b = t.update(snap(), 1)
    expect(b.kind).toBe('idle')
  })

  it('lets a newer activity take over after YIELD, dropping stale ones', () => {
    const t = new BeatTimeline()
    t.update(snap({ activityId: 'a', kind: 'sleep', progress: 0 }), 0)
    t.update(snap({ activityId: 'b', kind: 'eat_home' }), 0.5)
    expect(t.current?.kind).toBe('sleep')
    t.update(snap({ activityId: 'c', kind: 'study' }), 0.5)
    expect(t.pending?.kind).toBe('study')
    let b = t.update(snap({ activityId: 'c', kind: 'study' }), YIELD)
    expect(b.kind).toBe('study')
    b = t.update(snap({ activityId: 'c', kind: 'study' }), 0.1)
    expect(b.key).toBe('act:c')
  })

  it('starts mid-activity where the sim is, and freezes while paused', () => {
    const t = new BeatTimeline()
    const b = t.update(snap({ activityId: 'a', kind: 'eat_home', progress: 0.9 }), 0)
    expect(beatProgress(b)).toBeGreaterThan(0.6)
    const t2 = new BeatTimeline()
    t2.update(snap({ activityId: 'a', kind: 'sleep' }), 0)
    for (let i = 0; i < 100; i++) t2.update(snap(), 0)
    expect(t2.current?.kind).toBe('sleep')
  })

  it('opens the computer as a beat of its own', () => {
    const t = new BeatTimeline()
    expect(t.update(snap({ computerOpen: true }), 0).kind).toBe('computer')
    expect(t.update(snap({ computerOpen: true, location: 'work' }), 0).kind).toBe('idle')
  })
})

describe('helpers', () => {
  it('needs and moods', () => {
    expect(needsThought(10, 80, 80)).toBe('exhausted')
    expect(needsThought(80, 10, 80)).toBe('hungry')
    expect(needsThought(80, 80, 10)).toBe('stressed')
    expect(needsThought(80, 80, 80)).toBeNull()
    expect(actorMood(20, 90, true)).toBe('tired')
    expect(actorMood(80, 20, true)).toBe('stressed')
    expect(actorMood(80, 50, true)).toBe('happy')
    expect(actorMood(80, 50, false)).toBe('neutral')
  })

  it('gear: equipped or best owned per slot, every owned light', () => {
    expect(gearItems({ owned: ['phone-cracked', 'laptop-old'], equipped: {} }).map(g => g.id)).toEqual(['laptop-old', 'phone-cracked'])
    const g = gearItems({ owned: ['phone-cracked', 'phone-pro', 'laptop-old', 'workstation', 'ring-light', 'softbox-kit', 'lav-mic'], equipped: { computer: 'laptop-old' } })
    expect(g.map(x => x.id)).toEqual(['laptop-old', 'phone-pro', 'lav-mic', 'ring-light', 'softbox-kit'])
    expect(gearItems(undefined)).toEqual([])
  })

  it('staff seats and hours', () => {
    const m = (id: string) => ({ id, name: id, role: 'va' as const, skill: 5, salaryWeekly: 100, hiredDay: 0, portrait: 'p01', morale: 50 })
    expect(staffSeats([m('a'), m('b'), m('c')], 2).map(x => x.id)).toEqual(['a', 'b'])
    expect(staffSeats([m('a')], 0)).toEqual([])
    expect(staffOnDuty(0, 9)).toBe(true)
    expect(staffOnDuty(0, 18)).toBe(false)
    expect(staffOnDuty(5, 12)).toBe(false)
  })

  it('uniform, rush hours, task keys', () => {
    const u = uniformLook({ skin: '#e3b08d', hair: '#3f2a20', hairStyle: 'messy', top: '#a7a3a0', bottom: '#3e4f75', shoes: '#f3f2ef', acc: ['cap', 'glasses'] })
    expect(u.topStyle).toBe('uniform')
    expect(u.acc).toEqual(['glasses', 'visor'])
    expect(customerInterval(12)).toBeLessThan(customerInterval(15))
    expect(customerInterval(3)).toBeGreaterThan(customerInterval(15))
    expect(taskKeyOf({ kind: 'sit', at: 'a', anim: 'sit_type' })).not.toBe(taskKeyOf({ kind: 'sit', at: 'a', anim: 'sit_idle' }))
  })
})
