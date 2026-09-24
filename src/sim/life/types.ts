// Shared life-module types (kept separate so data files can import them without a runtime cycle).
import type { ActivityKind, SkillId } from '../../core/types'

export interface ActivityDef {
  kind: ActivityKind
  label: string
  /** minutes */
  duration: number
  /** per-hour deltas while doing it */
  energy: number
  hunger: number
  mood: number
  cost: number
  /** can only be done at home (needs the computer / camera) */
  atHome: boolean
  skill?: SkillId
  xp?: number
  description: string
  // ---- optional extras ----
  group?: 'life' | 'work' | 'business'
  /** a starting shift may cut this short (default true for life, false for sleep/filming) */
  interruptible?: boolean
  /** when interrupted by a shift, the remaining time goes back to the front of the queue */
  resumable?: boolean
  /** can be done from the phone while away from the computer */
  phoneOk?: boolean
  /** where the player is while doing it */
  location?: 'home' | 'out' | 'work'
  /** local hours it may START in, [from, to) wrapping midnight, e.g. [17, 1] */
  window?: [number, number]
  /** duration is multiplied by productivity() */
  scalesWithProductivity?: boolean
  /** ledger category for the cost */
  costCategory?: 'food' | 'fun' | 'misc'
  costMemo?: string
}
