import type { Difficulty, GameState } from './types'
import { START_DATE, START_HOUR } from './time'
import { createAdsState, createCreativeState } from '../sim/ads'
import { createStoreState } from '../sim/store'
import { createGearState, createHomeState, createJobState, createPlayerState, createSkillsState, createStaffState, lifeOnNewGame } from '../sim/life'
import { createFinanceState, financeOnNewGame } from '../sim/finance'
import { createCatalogState, marketOnNewGame } from '../sim/market'
import { createCoachState, createEventsState, eventsOnNewGame } from '../sim/events'

export const SAVE_VERSION = 1

export interface NewGameOptions { playerName: string; difficulty: Difficulty; seed?: number }

export function createNewGame(o: NewGameOptions): GameState {
  const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31)
  const s: GameState = {
    version: SAVE_VERSION,
    meta: { saveId: `save_${seed.toString(36)}`, playerName: o.playerName || 'You', difficulty: o.difficulty, seed, startDate: START_DATE, createdAtReal: Date.now(), lastSavedReal: 0 },
    rng: seed,
    time: { hour: START_HOUR },
    player: createPlayerState(o.playerName || 'You'),
    job: createJobState(),
    home: createHomeState(),
    gear: createGearState(),
    skills: createSkillsState(),
    staff: createStaffState(),
    finance: createFinanceState(o.difficulty),
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
  }
  s.catalog = createCatalogState(s)
  s.creatives = createCreativeState(s)
  lifeOnNewGame(s)
  financeOnNewGame(s)
  marketOnNewGame(s)
  eventsOnNewGame(s)
  return s
}
