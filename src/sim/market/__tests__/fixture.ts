// Minimal headless game state for market/events tests (no UI, no other module side effects).
import type { Difficulty, GameState } from '../../../core/types'
import { START_DATE, START_HOUR, dayOf } from '../../../core/time'
import { createAdsState, createCreativeState } from '../../ads'
import { createStoreState } from '../../store'
import { createFinanceState } from '../../finance'
import { createGearState, createHomeState, createJobState, createPlayerState, createSkillsState, createStaffState } from '../../life'
import { createCatalogState, marketDayRollover, marketOnNewGame, marketTickHour } from '..'
import { createCoachState, createEventsState, eventsDayRollover, eventsOnNewGame, eventsTickHour } from '../../events'

export function makeState(opts: { difficulty?: Difficulty; seed?: number } = {}): GameState {
  const difficulty = opts.difficulty ?? 'normal'
  const seed = opts.seed ?? 12345
  const s = {
    version: 1,
    meta: { saveId: 'test', playerName: 'Tester', difficulty, seed, startDate: START_DATE, createdAtReal: 0, lastSavedReal: 0 },
    rng: seed,
    time: { hour: START_HOUR },
    player: createPlayerState('Tester'),
    job: createJobState(),
    home: createHomeState(),
    gear: createGearState(),
    skills: createSkillsState(),
    staff: createStaffState(),
    finance: createFinanceState(difficulty),
    catalog: null as unknown as GameState['catalog'],
    store: createStoreState(),
    ads: createAdsState(),
    creatives: null as unknown as GameState['creatives'],
    events: createEventsState(),
    coach: createCoachState(),
    notifications: [],
    inbox: [],
    milestones: {},
    history: [],
    flags: {},
    seq: 0,
  } as GameState
  s.catalog = createCatalogState(s)
  s.creatives = createCreativeState(s)
  marketOnNewGame(s)
  eventsOnNewGame(s)
  return s
}

/** Advance whole days running only the market + events systems (midnight rollover + one tick). */
export function advanceDays(s: GameState, n: number, onDay?: (day: number) => void): void {
  for (let i = 0; i < n; i++) {
    const day = dayOf(s.time.hour) + 1
    s.time.hour = day * 24
    marketDayRollover(s, day)
    eventsDayRollover(s, day)
    eventsTickHour(s)
    marketTickHour(s)
    onDay?.(day)
  }
}

/** Jump to an absolute day (runs every rollover in between). */
export function advanceTo(s: GameState, day: number, onDay?: (day: number) => void): void {
  advanceDays(s, Math.max(0, day - dayOf(s.time.hour)), onDay)
}
