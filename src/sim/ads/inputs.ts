// Input shapes for the ads public API (re-exported from ./index.ts).
import type { Ad, AngleId, BeatId, CreativeProducer, FormatId, HookId, Platform, Targeting } from '../../core/types'

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
