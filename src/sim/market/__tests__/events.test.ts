import { describe, expect, it } from 'vitest'
import type { GameState } from '../../../core/types'
import { resolveModal } from '../../../core/modals'
import { askCoach, checkMilestones, eventsDayRollover, eventsTickHour, milestoneDefs } from '../../events'
import { cnyWindow } from '../../events/calendar'
import { advanceTo, makeState } from './fixture'

describe('events', () => {
  it('CNY window sets dropshipDelayDays > 0 (and not before it)', () => {
    const s: GameState = makeState()
    const w = cnyWindow(2027)!
    expect(w).not.toBeNull()
    advanceTo(s, w.shutdownStart - 3)
    expect(s.events.modifiers.dropshipDelayDays).toBe(0)
    advanceTo(s, w.day)
    expect(s.events.modifiers.dropshipDelayDays).toBeGreaterThanOrEqual(10)
    expect(s.events.modifiers.dropshipDelayDays).toBeLessThanOrEqual(20)
    expect(s.events.modifiers.supplierDelayDays).toBeGreaterThanOrEqual(21)
    expect(s.events.active.some(e => e.kind === 'cny_shutdown')).toBe(true)
    advanceTo(s, w.backlogEnd + 2)
    expect(s.events.modifiers.dropshipDelayDays).toBe(0)
  })

  it('sends CNY supplier warnings at T−42/−28/−14/−7 when you have suppliers', () => {
    const s = makeState()
    s.store.created = true
    s.store.products.push({ id: 'sp1', catalogId: 'pet-hair-roller' } as GameState['store']['products'][number])
    const w = cnyWindow(2027)!
    advanceTo(s, w.day - 43)
    const before = s.inbox.filter(m => /Spring Festival|Chinese New Year/.test(m.subject)).length
    advanceTo(s, w.shutdownStart)
    const warnings = s.inbox.filter(m => /Spring Festival|Chinese New Year/.test(m.subject)).length - before
    expect(warnings).toBe(4)
  })

  it('BFCM and holidays create calendar events; Mega Deal Days lowers CVR', () => {
    const s = makeState()
    advanceTo(s, 135) // Jul 15, 2026 = 2nd Wednesday of July
    const t = s.events.active.find(e => e.kind === 'prime_day')
    expect(t).toBeDefined()
    expect(s.events.modifiers.cvrMult).toBeCloseTo(0.95, 3)
    advanceTo(s, 269)
    expect(s.events.active.some(e => e.kind === 'bfcm')).toBe(true)
  })

  it('modifiers are recomputed every hour and include market competition', () => {
    const s = makeState()
    s.events.modifiers.cvrMult = 0.1
    eventsTickHour(s)
    expect(s.events.modifiers.cvrMult).toBe(1)
    expect(Object.keys(s.events.modifiers.competitionMult).length).toBeGreaterThan(10)
  })

  it('competitor copy fires after 3 days of $1k+ revenue and the modal response changes pressure', () => {
    const s = makeState({ seed: 99 })
    const id = 'pet-hair-roller'
    let fired = false
    for (let d = 0; d < 80 && !fired; d++) {
      const day = Math.floor(s.time.hour / 24) + 1
      s.time.hour = day * 24
      s.catalog.sales![id] = { orders: 1000, units: 1000, revenue: 60_000, costs: 20_000, dropshipUnits: 1000, daily: [[day - 3, 40, 40, 1200], [day - 2, 40, 40, 1200], [day - 1, 40, 40, 1200]] }
      eventsDayRollover(s, day)
      fired = s.events.modals.some(m => m.kind === 'competitor_copy')
    }
    expect(fired).toBe(true)
    const modal = s.events.modals.find(m => m.kind === 'competitor_copy')!
    eventsTickHour(s)
    const base = s.events.modifiers.competitionMult[id]
    resolveModal(s, modal.id, 'match')
    eventsTickHour(s)
    expect(s.events.modifiers.competitionMult[id]).toBeLessThan(base)
  })

  it('askCoach returns 3–6 concrete tips', () => {
    const s = makeState()
    const tips = askCoach(s)
    expect(tips.length).toBeGreaterThanOrEqual(3)
    expect(tips.length).toBeLessThanOrEqual(6)
    expect(tips.some(t => /\$\d/.test(t))).toBe(true)
  })

  it('milestones unlock once with notify + mail', () => {
    const s = makeState()
    expect(milestoneDefs().length).toBe(17)
    s.store.created = true
    checkMilestones(s)
    expect(s.milestones.first_store).toBe(0)
    const mails = s.inbox.length
    checkMilestones(s)
    expect(s.inbox.length).toBe(mails)
    expect(s.notifications.some(n => /Milestone unlocked/.test(n.title))).toBe(true)
  })
})
