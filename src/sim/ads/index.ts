// ============================================================================
// ADS MODULE — Fadbook + TikTak delivery, creatives, learning, accounts, billing.
// OWNER: sim-ads agent. This file is the PUBLIC API; keep every export & signature.
// Stubs below are placeholders so the app runs before the module is implemented.
// ============================================================================
import type {
  AdLevel, AdSet, Ad, AdsState, AutomatedRule, Campaign, ConversionEvent, Creative, CreativeProducer,
  CreativeScores, CreativeState, EntityStatus, FormatId, GameState, HookId, AngleId, BeatId, Platform,
  Targeting, TrafficPacket,
} from '../../core/types'
export * from './metrics'

// ---- lifecycle (called by sim/index.ts) ----
export function createAdsState(): AdsState {
  return { accounts: [], campaigns: [], adSets: [], ads: [], audiences: [], reportQueue: [], rules: [], organicPosts: [] }
}
export function createCreativeState(_s: GameState): CreativeState {
  return { creatives: [], creators: [], lastCreatorRefreshDay: -1 }
}
/** Deliver ads for the current hour; returns landing-page traffic for the store to convert. */
export function adsTickHour(_s: GameState): TrafficPacket[] { return [] }
/** Store reports real conversions per ad; record truth + queue delayed/inflated platform reports. */
export function adsRecordConversions(_s: GameState, _events: ConversionEvent[]): void {}
export function adsDayRollover(_s: GameState, _day: number): void {}

// ---- accounts ----
export function openAdAccount(_s: GameState, _platform: Platform, _opts?: { rented?: boolean }): string | null { return null }
/** Retry a failed billing charge (account in 'payment_failed'). Returns true if paid. */
export function payAdBalance(_s: GameState, _accountId: string): boolean { return false }
/** Enqueue the 'appeal_ad_account' activity for a restricted/disabled account. */
export function startAppeal(_s: GameState, _accountId: string): void {}
/** Called when the appeal activity completes. */
export function submitAppeal(_s: GameState, _accountId: string): void {}

// ---- structure ----
export interface NewCampaignInput {
  platform: Platform
  accountId?: string
  name: string
  kind?: 'manual' | 'advantage'
  budgetMode: 'cbo' | 'abo'
  dailyBudget?: number | null
  bidStrategy?: 'lowest_cost' | 'cost_cap'
  costCap?: number | null
}
export interface NewAdSetInput {
  campaignId: string
  name: string
  dailyBudget?: number | null
  targeting?: Partial<Targeting>
  optimization?: 'purchase' | 'add_to_cart'
}
export interface NewAdInput {
  adSetId: string
  name: string
  creativeId: string
  storeProductId: string
  primaryText: string
  headline: string
  cta?: Ad['cta']
}
/** Returns new id, or null (with a notification explaining why) if invalid. */
export function createCampaign(_s: GameState, _input: NewCampaignInput): string | null { return null }
export function createAdSet(_s: GameState, _input: NewAdSetInput): string | null { return null }
export function createAd(_s: GameState, _input: NewAdInput): string | null { return null }
export function updateCampaign(_s: GameState, _id: string, _patch: Partial<Pick<Campaign, 'name' | 'dailyBudget' | 'bidStrategy' | 'costCap' | 'budgetMode'>>): void {}
export function updateAdSet(_s: GameState, _id: string, _patch: Partial<Pick<AdSet, 'name' | 'dailyBudget' | 'optimization'>> & { targeting?: Partial<Targeting> }): void {}
export function updateAd(_s: GameState, _id: string, _patch: Partial<Pick<Ad, 'name' | 'primaryText' | 'headline' | 'cta' | 'creativeId' | 'storeProductId'>>): void {}
export function setEntityStatus(_s: GameState, _level: AdLevel, _id: string, _status: EntityStatus): void {}
export function duplicateEntity(_s: GameState, _level: AdLevel, _id: string): string | null { return null }
/** lookalike: param = % (1..10, needs pixel purchases); retargeting: param = window days */
export function createAudience(_s: GameState, _platform: Platform, _kind: 'lookalike' | 'retargeting', _param: number): string | null { return null }
export function upsertRule(_s: GameState, _rule: AutomatedRule): void {}
export function deleteRule(_s: GameState, _id: string): void {}

// ---- organic ----
/** Called when the 'post_organic' activity completes. */
export function postOrganic(_s: GameState, _creativeId: string, _storeProductId: string): void {}
/** TikTak Spark Ad: boost an organic post into an ad set. */
export function sparkPost(_s: GameState, _postId: string, _adSetId: string): string | null { return null }

// ---- creatives ----
export interface CreativeBrief {
  catalogId: string
  name: string
  format: FormatId
  hook: HookId
  angle: AngleId
  beats: BeatId[]
  hookText: string
  script: string
  producer: CreativeProducer
  creatorId?: string | null
}
/** Validates (sample in hand? money?), charges, creates the creative and schedules production. */
export function orderCreative(_s: GameState, _brief: CreativeBrief): string | null { return null }
/** Activity completion for self-shot / supplier edits. */
export function completeCreative(_s: GameState, _creativeId: string): void {}
/** Hidden creative scoring (hook/body/cta/fit/power per platform + player tips). Pure. */
export function scoreCreative(_s: GameState, _c: Creative): CreativeScores {
  return { hook: 0.5, body: 0.5, cta: 0.5, fit: 0.5, power: { fadbook: 1, tiktak: 1 }, tips: [] }
}
export function refreshCreators(_s: GameState): void {}

// ---- queries (pure) ----
export function deliveryLabel(_s: GameState, _level: AdLevel, _id: string): { label: string; tone: 'success' | 'info' | 'attention' | 'warning' | 'critical' | 'subdued' } {
  return { label: 'Off', tone: 'subdued' }
}
/** Effective daily budget for an entity (CBO campaign budget or sum of ad set budgets). */
export function effectiveBudget(_s: GameState, _level: AdLevel, _id: string): number { return 0 }
export function estimateAudienceSize(_s: GameState, _platform: Platform, _t: Targeting): number { return 0 }
/** Interest suggestions for the targeting search box. */
export function searchInterests(_query: string, _platform: Platform): { name: string; size: number }[] { return [] }
