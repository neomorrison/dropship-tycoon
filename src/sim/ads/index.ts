// ============================================================================
// ADS MODULE — Fadbook + TikTak delivery, creatives, learning, accounts, billing.
// OWNER: sim-ads agent. This file is the PUBLIC API; keep every export & signature.
// Implementation lives in the sibling files:
//   accounts.ts   ad accounts, spend-limit ladder, billing, bans, appeals
//   structure.ts  campaigns / ad sets / ads CRUD + validation, learning phase, reviews, audiences, rules CRUD
//   delivery.ts   the hourly auction & delivery model → TrafficPacket[]
//   attribution.ts conversions → truth + inflated/delayed platform reporting
//   creatives.ts  briefs, producers, creator marketplace
//   scoring.ts    the hidden creative skill model + skill-gated tips
//   organic.ts    organic TikTak posts, virality, Spark Ads
//   rules.ts      automated rules      coach.ts  Coach Kev ads diagnostics
//   rollover.ts   daily upkeep         queries.ts pure helpers for the UIs
// ============================================================================
import type { AdsState } from '../../core/types'

export * from './metrics'
export type { NewCampaignInput, NewAdSetInput, NewAdInput, CreativeBrief } from './inputs'

// ---- lifecycle (called by sim/index.ts) ----
export function createAdsState(): AdsState {
  return { accounts: [], campaigns: [], adSets: [], ads: [], audiences: [], reportQueue: [], rules: [], organicPosts: [], bans: {}, bannedUntil: {}, ruleLog: [] }
}
export { createCreativeState } from './creatives'
/** Deliver ads for the current hour; returns landing-page traffic for the store to convert. */
export { adsTickHour } from './delivery'
/** Store reports real conversions per ad; record truth + queue delayed/inflated platform reports. */
export { adsRecordConversions } from './attribution'
export { adsDayRollover } from './rollover'

// ---- accounts ----
export {
  openAdAccount, payAdBalance, startAppeal, submitAppeal,
  // additions
  openAccountBlocker, AGENCY_SETUP_FEE,
} from './accounts'

// ---- structure ----
export {
  createCampaign, createAdSet, createAd, updateCampaign, updateAdSet, updateAd, setEntityStatus, duplicateEntity,
  createAudience, upsertRule, deleteRule,
  // additions
  validateCampaignInput, validateAdSetInput, validateAdInput, validateTargeting, wouldResetLearning, learningProgress,
  requestAdReview, copyCampaignToAccount, minDailyBudget, featureUnlocked, MB_GATES, MAX_DAILY_BUDGET, DEFAULT_TARGETING,
  lookalikeSize, retargetingSize,
} from './structure'
export { describeRule } from './rules'

// ---- organic ----
export { postOrganic, sparkPost, startOrganicPost, organicPostBlocker } from './organic'

// ---- creatives ----
export {
  orderCreative, completeCreative, refreshCreators,
  // additions
  validateCreativeBrief, expectedCreativeQuality, productionMinutes, agencyQuote, cancelCreative, selfShotQuality,
} from './creatives'
/** Hidden creative scoring (hook/body/cta/fit/power per platform + player tips). Pure. */
export { scoreCreative, creativeImpressions, TIPS_MIN_IMPRESSIONS } from './scoring'

// ---- queries (pure) ----
export {
  deliveryLabel, effectiveBudget, estimateAudienceSize, searchInterests,
  // additions
  searchInterestsDetailed, estimateDailyResults, audienceDefinition, accountSpendLimit, nextBillingThreshold,
  creativeInsights, adsUsingCreative, learningConversionsNeeded,
} from './queries'
export type { DeliveryLabel, DeliveryTone, InterestHit } from './queries'
export { adTotals, hasPixel, PLATFORM_NAME, ADSET_WORD, ADS_PATHS } from './shared'
