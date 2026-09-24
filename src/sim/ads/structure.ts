// Campaign → ad set (TikTak: ad group) → ad structure: validation, CRUD, duplication,
// the learning phase (resets on significant edits), policy review, custom audiences, rules CRUD.
import type {
  Ad, AdLevel, AdSet, AutomatedRule, Campaign, CustomAudience, EntityStatus, GameState, Platform, Targeting,
} from '../../core/types'
import type { NewAdInput, NewAdSetInput, NewCampaignInput } from './inputs'
import { chance, clamp, randInt } from '../../core/rng'
import { notify, coachTip } from '../../core/notify'
import { DIFFICULTY } from '../../core/difficulty'
import { uid } from '../../core/ids'
import { BENCHMARKS } from '../../data/benchmarks'
import { TIKTAK_REACH_RATIO, findInterest } from '../../data/interests'
import { emptyStats } from './metrics'
import {
  ADSET_WORD, PLATFORM_NAME, adSetsInCampaign, adsInAdSet, bench, budgetBasis, findAccount, findAd, findAdSet,
  claimRiskMult, findCampaign, findCreative, findStoreProduct, fmtMoney, hasPixel, pixelPurchases, productDef, skillLevel, today, tokens,
} from './shared'

export const DEFAULT_TARGETING: Targeting = {
  type: 'broad', interests: [], audienceId: null, ageMin: 18, ageMax: 65, gender: 'all', geo: 'US', placements: 'advantage',
}
const LEARNING_DAYS = 7
const PAUSE_RESET_HOURS = 7 * 24
/** hours a budget must stay unchanged before it becomes the new baseline for "significant change" */
const REANCHOR_HOURS: Record<Platform, number> = { fadbook: 24, tiktak: BENCHMARKS.tiktak.minHoursBetweenBudgetChanges }

// ---------------------------------------------------------------------------
// Skill gates
// ---------------------------------------------------------------------------
export const MB_GATES = { advantage: 2, costCap: 3, breakdowns: 3, rules: 4 } as const
/** Ads Manager's per-campaign / per-ad-set daily budget ceiling. */
export const MAX_DAILY_BUDGET = 1_000_000
export function featureUnlocked(s: GameState, f: keyof typeof MB_GATES): boolean {
  return skillLevel(s, 'media_buying') >= MB_GATES[f]
}

/** Minimum daily budget for a campaign (CBO) or ad set (ABO). */
export function minDailyBudget(platform: Platform, level: 'campaign' | 'adset', adSetCount = 1): number {
  if (platform === 'tiktak') return level === 'campaign' ? BENCHMARKS.tiktak.minCampaignDailyBudget : BENCHMARKS.tiktak.minAdGroupDailyBudget
  const per = BENCHMARKS.fadbook.minDailyBudgetConversion
  return level === 'campaign' ? per * Math.max(1, adSetCount) : per
}

// ---------------------------------------------------------------------------
// Learning phase
// ---------------------------------------------------------------------------
export function freshLearning(s: GameState, basis: number) {
  return { state: 'learning' as const, window: Array(LEARNING_DAYS).fill(0), resetHour: s.time.hour, budgetAtReset: basis }
}

export function resetLearning(s: GameState, set: AdSet, why: string, coach = true): void {
  const wasSettled = set.learning.state === 'active' || s.time.hour - set.learning.resetHour > 24
  set.learning = freshLearning(s, budgetBasis(s, set))
  if (coach && wasSettled && set.impressions > 0) {
    coachTip(s, `ads_reset_${set.id}`,
      `You just reset learning on ${ADSET_WORD[set.platform]} "${set.name}" (${why}). The algorithm starts over: CPMs rise and results get shaky for days. ${set.platform === 'fadbook' ? 'Scale in steps of 20% or less' : 'Keep budget edits at 30% or less and 48h apart'}, or duplicate it instead.`,
      { app: set.platform, cooldownHours: 24 })
  }
}

function significanceThreshold(set: AdSet): number {
  const p = set.platform
  let th: number = bench(p).significantBudgetChange
  if (p === 'tiktak' && set.learning.state === 'learning') th = Math.max(th, BENCHMARKS.tiktak.maxBudgetIncreaseInLearning)
  return th
}

function lastBudgetChangeHour(s: GameState, set: AdSet): number | undefined {
  const camp = findCampaign(s, set.campaignId)
  return camp?.budgetMode === 'cbo' ? camp.lastBudgetChangeHour : set.lastBudgetChangeHour
}
/** Budget the "significant change" test compares against right now: the budget at the last reset,
 *  or the current budget once it has been left alone for a quiet period (24h Fadbook, 48h TikTak). */
function budgetAnchor(s: GameState, set: AdSet): number {
  const stableSince = Math.max(lastBudgetChangeHour(s, set) ?? -Infinity, set.learning.resetHour)
  if (s.time.hour - stableSince >= REANCHOR_HOURS[set.platform]) return budgetBasis(s, set)
  return set.learning.budgetAtReset
}

/** Would setting the budget basis of this ad set to `next` reset learning? */
export function budgetChangeResets(s: GameState, set: AdSet, next: number): boolean {
  if (set.impressions <= 0 || !(next > 0)) return false
  const anchor = budgetAnchor(s, set)
  if (!(anchor > 0)) return false
  return Math.abs(next - anchor) / anchor > significanceThreshold(set) + 1e-9
}

/** Pure: would this budget edit reset learning somewhere (UI warning)? */
export function wouldResetLearning(s: GameState, level: AdLevel, id: string, newBudget: number): boolean {
  if (level === 'campaign') {
    const c = findCampaign(s, id)
    if (!c || c.budgetMode !== 'cbo') return false
    return adSetsInCampaign(s, id).some(set => budgetChangeResets(s, set, newBudget))
  }
  if (level === 'adset') {
    const set = findAdSet(s, id)
    const c = set && findCampaign(s, set.campaignId)
    if (!set || !c || c.budgetMode === 'cbo') return false
    return budgetChangeResets(s, set, newBudget)
  }
  return false
}

interface BudgetPlan { set: AdSet; anchor: number; resets: boolean }
/** Evaluate a budget edit BEFORE mutating anything. */
function planBudgetChange(s: GameState, set: AdSet, next: number): BudgetPlan {
  return { set, anchor: budgetAnchor(s, set), resets: budgetChangeResets(s, set, next) }
}
/** Apply the learning bookkeeping AFTER the budget was written. */
function applyBudgetPlan(s: GameState, plan: BudgetPlan, prev: number, next: number): void {
  const { set } = plan
  if (set.impressions <= 0) { set.learning.budgetAtReset = next; return }
  set.learning.budgetAtReset = plan.anchor
  if (plan.resets) {
    const pct = prev > 0 ? Math.round(((next - prev) / prev) * 100) : 0
    resetLearning(s, set, `budget ${fmtMoney(prev)} → ${fmtMoney(next)}, ${pct >= 0 ? '+' : ''}${pct}%`)
  }
}

function noteBudgetJump(s: GameState, accountId: string, prev: number, next: number) {
  if (prev > 0 && next / prev > 3) {
    const acc = findAccount(s, accountId)
    if (acc) acc.budgetJumpDay = today(s)
  }
}

export function learningProgress(s: GameState, adSetId: string): { state: AdSet['learning']['state']; conversions: number; needed: number; daysLeft: number; hasPixel: boolean } | null {
  const set = findAdSet(s, adSetId)
  if (!set) return null
  const needed = bench(set.platform).learningConversions
  const conversions = set.learning.window.reduce((a, b) => a + b, 0)
  const daysLeft = Math.max(0, LEARNING_DAYS - Math.floor((s.time.hour - set.learning.resetHour) / 24))
  return { state: set.learning.state, conversions, needed, daysLeft, hasPixel: hasPixel(s, set.platform) }
}

/** Count optimization events for learning. */
export function learningOnConversions(s: GameState, set: AdSet, purchases: number, atc: number): void {
  if (!hasPixel(s, set.platform)) return // no pixel → no optimization events → never exits learning
  const n = set.optimization === 'add_to_cart' ? atc : purchases
  if (n <= 0) return
  set.learning.window[0] = (set.learning.window[0] ?? 0) + n
  if (set.learning.state !== 'active') {
    const total = set.learning.window.reduce((a, b) => a + b, 0)
    if (total >= bench(set.platform).learningConversions) {
      set.learning.state = 'active'
      notify(s, {
        kind: 'success',
        title: `Learning complete: ${set.name}`,
        body: `The ${ADSET_WORD[set.platform]} got ${total} ${set.optimization === 'add_to_cart' ? 'add-to-carts' : 'purchases'} in 7 days. Delivery is stable now: avoid big edits.`,
        site: set.platform,
      })
    }
  }
}

export function learningDayRollover(s: GameState): void {
  const hour = s.time.hour
  for (const set of s.ads.adSets) {
    if (set.status === 'deleted') continue
    const w = [0, ...set.learning.window].slice(0, LEARNING_DAYS)
    while (w.length < LEARNING_DAYS) w.push(0)
    set.learning.window = w
    const total = w.reduce((a, b) => a + b, 0)
    const need = bench(set.platform).learningConversions
    const age = hour - set.learning.resetHour
    if (set.learning.state === 'learning' && age >= LEARNING_DAYS * 24 && total < need && set.impressions > 0) {
      set.learning.state = 'learning_limited'
      coachTip(s, `ads_limited_${set.id}`,
        `"${set.name}" is Learning limited: it can't reach ${need} ${set.optimization === 'add_to_cart' ? 'add-to-carts' : 'purchases'} a week. Consolidate ad sets, raise the budget (about CPA × 50 ÷ 7 per day), or accept it if it's profitable.`,
        { app: set.platform, cooldownHours: 24 * 7 })
    } else if (set.learning.state === 'learning_limited' && total >= need) {
      set.learning.state = 'active'
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export function resolveAccountId(s: GameState, platform: Platform, accountId?: string): string | null {
  if (accountId) return findAccount(s, accountId)?.platform === platform ? accountId : null
  const accs = s.ads.accounts.filter(a => a.platform === platform)
  return (accs.find(a => a.status === 'active') ?? accs.find(a => a.status === 'payment_failed') ?? accs[0])?.id ?? null
}

export function validateCampaignInput(s: GameState, input: NewCampaignInput): string | null {
  const P = PLATFORM_NAME[input.platform]
  const accId = resolveAccountId(s, input.platform, input.accountId)
  if (!accId) return `Open a ${P} ad account first.`
  const acc = findAccount(s, accId)!
  if (acc.status === 'restricted' || acc.status === 'disabled') return `This ad account is ${acc.status}. Appeal it or use another account.`
  if (!input.name.trim()) return 'Give the campaign a name.'
  if (input.name.length > 400) return 'Campaign names can be up to 400 characters.'
  if (input.kind === 'advantage' && !featureUnlocked(s, 'advantage')) {
    return `${input.platform === 'fadbook' ? 'Advantage+ shopping' : 'Smart+'} campaigns unlock at Media Buying level ${MB_GATES.advantage}.`
  }
  if (input.bidStrategy === 'cost_cap') {
    if (!featureUnlocked(s, 'costCap')) return `Cost cap bidding unlocks at Media Buying level ${MB_GATES.costCap}.`
    if (!(Number(input.costCap) > 0)) return 'Enter a cost per result goal for the cost cap.'
  }
  const cbo = input.kind === 'advantage' || input.budgetMode === 'cbo'
  if (cbo) {
    const b = Number(input.dailyBudget)
    const min = minDailyBudget(input.platform, 'campaign')
    if (!(b > 0)) return 'Enter a daily campaign budget.'
    if (b < min) return `${P} requires a campaign budget of at least ${fmtMoney(min)} per day.`
    if (b > MAX_DAILY_BUDGET) return 'That budget is above the maximum.'
  }
  return null
}

function normalizeTargeting(platform: Platform, t: Partial<Targeting> | undefined, advantage: boolean): Targeting {
  const out: Targeting = { ...DEFAULT_TARGETING, ...(t ?? {}) }
  out.interests = [...new Set((out.interests ?? []).map(n => findInterest(n)?.name ?? n.trim()).filter(Boolean))]
  out.ageMin = clamp(Math.round(out.ageMin || 18), 18, 65)
  out.ageMax = clamp(Math.round(out.ageMax || 65), 18, 65)
  if (out.ageMax < out.ageMin) [out.ageMin, out.ageMax] = [out.ageMax, out.ageMin]
  if (platform === 'tiktak' && out.placements !== 'advantage') out.placements = 'advantage'
  if (advantage) {
    out.type = 'broad'
    out.interests = []
    out.audienceId = null
    out.placements = 'advantage'
  }
  if (out.type === 'broad') { out.interests = []; out.audienceId = null }
  if (out.type === 'interest') out.audienceId = null
  if (out.type === 'lookalike' || out.type === 'retargeting') out.interests = []
  return out
}

export function validateTargeting(s: GameState, platform: Platform, t: Targeting): string | null {
  if (t.type === 'interest') {
    if (!t.interests.length) return 'Add at least one interest, or switch to broad targeting.'
    if (t.interests.length > 25) return 'Use 25 interests or fewer.'
  }
  if (t.type === 'lookalike' || t.type === 'retargeting') {
    const a = s.ads.audiences.find(x => x.id === t.audienceId)
    if (!a || a.platform !== platform || a.kind !== t.type) return `Pick a ${t.type === 'lookalike' ? 'lookalike' : 'website visitors'} audience.`
  }
  if (t.ageMax - t.ageMin < 5) return 'Age range must span at least 5 years.'
  return null
}

export function validateAdSetInput(s: GameState, input: NewAdSetInput): string | null {
  const camp = findCampaign(s, input.campaignId)
  if (!camp || camp.status === 'deleted') return 'That campaign no longer exists.'
  const P = PLATFORM_NAME[camp.platform]
  const word = ADSET_WORD[camp.platform]
  if (!input.name.trim()) return `Give the ${word} a name.`
  if (camp.budgetMode === 'abo') {
    const b = Number(input.dailyBudget)
    const min = minDailyBudget(camp.platform, 'adset')
    if (!(b > 0)) return `Enter a daily budget for the ${word}.`
    if (b < min) return `${P} requires at least ${fmtMoney(min)} per day for each ${word}.`
  }
  if (adSetsInCampaign(s, camp.id).length >= 50) return `A campaign can have up to 50 ${word}s.`
  if (camp.budgetMode === 'cbo' && camp.dailyBudget != null && camp.platform === 'fadbook') {
    const need = minDailyBudget('fadbook', 'campaign', adSetsInCampaign(s, camp.id).length + 1)
    if (camp.dailyBudget < need) return `The campaign budget (${fmtMoney(camp.dailyBudget)}) is too low for another ad set. Raise it to at least ${fmtMoney(need)}.`
  }
  const t = normalizeTargeting(camp.platform, input.targeting, camp.kind === 'advantage')
  return validateTargeting(s, camp.platform, t)
}

const CLAIM_WORDS = ['cure', 'cures', 'guaranteed', 'guarantee results', 'miracle', 'instantly', 'lose weight', 'weight loss', 'fda', 'doctor recommended', 'clinically proven', '100%', 'permanent', 'overnight', 'detox', 'anti-aging', 'burn fat']
const CONDITION_WORDS = new Set(['acne', 'overweight', 'fat', 'wrinkles', 'wrinkly', 'pain', 'anxiety', 'insomnia', 'diabetes', 'bald', 'balding', 'depression', 'depressed', 'arthritis', 'eczema', 'cellulite', 'obese', 'snoring', 'hairloss'])

export function validateAdInput(s: GameState, input: NewAdInput): string | null {
  const set = findAdSet(s, input.adSetId)
  if (!set || set.status === 'deleted') return 'That ad set no longer exists.'
  const p = set.platform
  if (!input.name.trim()) return 'Give the ad a name.'
  const cr = findCreative(s, input.creativeId)
  if (!cr) return 'Pick a creative.'
  if (cr.status !== 'ready') return 'That creative isn\'t ready yet.'
  const sp = findStoreProduct(s, input.storeProductId)
  if (!sp || sp.status === 'archived') return 'Pick an active product page as the website URL.'
  if (cr.catalogId !== sp.catalogId) return 'This creative shows a different product than the landing page.'
  const text = input.primaryText.trim()
  if (p === 'tiktak') {
    if (!text) return 'Enter ad text (1–100 characters).'
    if (text.length > 100) return 'TikTak ad text can be up to 100 characters.'
  } else {
    if (!text) return 'Enter primary text for the ad.'
    if (text.length > 2200) return 'Primary text can be up to 2,200 characters.'
    if (input.headline.length > 255) return 'Headlines can be up to 255 characters.'
  }
  if (adsInAdSet(s, set.id).length >= 50) return `An ${ADSET_WORD[p]} can have up to 50 ads.`
  return null
}

function reject(s: GameState, msg: string, site: Platform) {
  notify(s, { kind: 'warning', title: 'Couldn\'t publish', body: msg, site })
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export function createCampaign(s: GameState, input: NewCampaignInput): string | null {
  const err = validateCampaignInput(s, input)
  if (err) { reject(s, err, input.platform); return null }
  const advantage = input.kind === 'advantage'
  const cbo = advantage || input.budgetMode === 'cbo'
  const c: Campaign = {
    id: uid(s, 'cmp'),
    platform: input.platform,
    accountId: resolveAccountId(s, input.platform, input.accountId)!,
    name: input.name.trim(),
    objective: 'sales',
    kind: advantage ? 'advantage' : 'manual',
    status: 'active',
    budgetMode: cbo ? 'cbo' : 'abo',
    dailyBudget: cbo ? Math.round(Number(input.dailyBudget) * 100) / 100 : null,
    bidStrategy: input.bidStrategy === 'cost_cap' ? 'cost_cap' : 'lowest_cost',
    costCap: input.bidStrategy === 'cost_cap' ? Number(input.costCap) : null,
    createdHour: s.time.hour,
    pausedHour: null,
  }
  s.ads.campaigns.push(c)
  if (!hasPixel(s, c.platform)) pixelWarning(s, c.platform)
  return c.id
}

function pixelWarning(s: GameState, p: Platform) {
  const app = p === 'fadbook' ? 'Fadbook & Instaglam' : 'TikTak'
  notify(s, {
    kind: 'warning',
    title: 'No pixel events',
    body: `Your store isn't sending purchase events to ${PLATFORM_NAME[p]}. Install the ${app} channel app in Shopifly. Until then ${PLATFORM_NAME[p]} can only find clickers, not buyers, and learning never completes.`,
    site: 'shopifly', path: 'apps',
  })
  coachTip(s, `ads_no_pixel_${p}`, `Connect your ${PLATFORM_NAME[p]} pixel before spending: install the ${app} channel app in Shopifly. Without purchase events the algorithm optimizes for cheap clicks that rarely buy.`, { app: 'shopifly', essential: true, cooldownHours: 72 })
}

export function createAdSet(s: GameState, input: NewAdSetInput): string | null {
  const camp = findCampaign(s, input.campaignId)
  const err = validateAdSetInput(s, input)
  if (err || !camp) { reject(s, err ?? 'Campaign not found.', camp?.platform ?? 'fadbook'); return null }
  const targeting = normalizeTargeting(camp.platform, input.targeting, camp.kind === 'advantage')
  const set: AdSet = {
    id: uid(s, 'ads'),
    campaignId: camp.id,
    platform: camp.platform,
    name: input.name.trim(),
    status: 'active',
    dailyBudget: camp.budgetMode === 'abo' ? Math.round(Number(input.dailyBudget) * 100) / 100 : null,
    targeting,
    optimization: input.optimization ?? 'purchase',
    createdHour: s.time.hour,
    learning: freshLearning(s, 0),
    reach: 0,
    impressions: 0,
    pausedHour: null,
  }
  set.learning.budgetAtReset = budgetBasis(s, set)
  s.ads.adSets.push(set)
  return set.id
}

export function createAd(s: GameState, input: NewAdInput): string | null {
  const set = findAdSet(s, input.adSetId)
  const err = validateAdInput(s, input)
  if (err || !set) { reject(s, err ?? 'Ad set not found.', set?.platform ?? 'fadbook'); return null }
  const ad: Ad = {
    id: uid(s, 'ad'),
    adSetId: set.id,
    campaignId: set.campaignId,
    platform: set.platform,
    name: input.name.trim(),
    status: 'active',
    creativeId: input.creativeId,
    storeProductId: input.storeProductId,
    primaryText: input.primaryText.trim(),
    headline: input.headline.trim(),
    cta: input.cta ?? 'shop_now',
    review: 'in_review',
    createdHour: s.time.hour,
    stats: {},
    lifetime: emptyStats(),
    frequency: 0,
    firstDeliveryHour: null,
    reviewDoneHour: s.time.hour + randInt(s, 1, 6),
  }
  s.ads.ads.push(ad)
  if (set.impressions > 0) resetLearning(s, set, 'new ad added')
  const sp = findStoreProduct(s, input.storeProductId)
  if (sp && sp.status !== 'active') {
    notify(s, { kind: 'warning', title: 'Landing page is a draft', body: `"${sp.title}" isn't active in Shopifly, so this ad won't deliver until you publish it.`, site: 'shopifly', path: `products/${sp.id}` })
  }
  return ad.id
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export function updateCampaign(s: GameState, id: string, patch: Partial<Pick<Campaign, 'name' | 'dailyBudget' | 'bidStrategy' | 'costCap' | 'budgetMode'>>): void {
  const c = findCampaign(s, id)
  if (!c || c.status === 'deleted') return
  const P = PLATFORM_NAME[c.platform]
  if (patch.name !== undefined && patch.name.trim()) c.name = patch.name.trim().slice(0, 400)
  const sets = adSetsInCampaign(s, c.id)

  if (patch.budgetMode && patch.budgetMode !== c.budgetMode && c.kind !== 'advantage') {
    if (patch.budgetMode === 'abo') {
      const per = Math.max(minDailyBudget(c.platform, 'adset'), Math.round(((c.dailyBudget ?? 0) / Math.max(1, sets.length)) * 100) / 100)
      for (const set of sets) set.dailyBudget = per
      c.dailyBudget = null
    } else {
      const total = sets.reduce((a, set) => a + (set.dailyBudget ?? 0), 0)
      c.dailyBudget = Math.max(minDailyBudget(c.platform, 'campaign', sets.length), total)
      for (const set of sets) set.dailyBudget = null
    }
    c.budgetMode = patch.budgetMode
    for (const set of sets) resetLearning(s, set, 'budget type changed')
  }

  if (patch.dailyBudget != null && c.budgetMode === 'cbo') {
    const next = Math.round(Number(patch.dailyBudget) * 100) / 100
    const min = minDailyBudget(c.platform, 'campaign', c.platform === 'fadbook' ? sets.length : 1)
    if (!(next >= min)) {
      reject(s, `${P} requires a campaign budget of at least ${fmtMoney(min)} per day.`, c.platform)
    } else if (next > MAX_DAILY_BUDGET) {
      reject(s, `That budget is above the ${fmtMoney(MAX_DAILY_BUDGET)} daily maximum.`, c.platform)
    } else if (next !== c.dailyBudget) {
      const prev = c.dailyBudget ?? 0
      const plans = sets.map(set => planBudgetChange(s, set, next))
      c.dailyBudget = next
      c.lastBudgetChangeHour = s.time.hour
      noteBudgetJump(s, c.accountId, prev, next)
      for (const plan of plans) applyBudgetPlan(s, plan, prev, next)
    }
  }

  if (patch.bidStrategy && patch.bidStrategy !== c.bidStrategy) {
    if (patch.bidStrategy === 'cost_cap' && !featureUnlocked(s, 'costCap')) {
      reject(s, `Cost cap bidding unlocks at Media Buying level ${MB_GATES.costCap}.`, c.platform)
    } else {
      c.bidStrategy = patch.bidStrategy
      if (c.bidStrategy === 'lowest_cost') c.costCap = null
      else c.costCap = patch.costCap != null && patch.costCap > 0 ? Number(patch.costCap) : c.costCap ?? 30
      for (const set of sets) resetLearning(s, set, 'bid strategy changed')
    }
  } else if (patch.costCap != null && c.bidStrategy === 'cost_cap' && patch.costCap > 0 && patch.costCap !== c.costCap) {
    const prev = c.costCap ?? patch.costCap
    c.costCap = Number(patch.costCap)
    if (Math.abs(c.costCap - prev) / prev > 0.2) for (const set of sets) resetLearning(s, set, 'cost cap changed')
  }
}

export function updateAdSet(s: GameState, id: string, patch: Partial<Pick<AdSet, 'name' | 'dailyBudget' | 'optimization'>> & { targeting?: Partial<Targeting> }): void {
  const set = findAdSet(s, id)
  const camp = set && findCampaign(s, set.campaignId)
  if (!set || !camp || set.status === 'deleted') return
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim()
  if (patch.dailyBudget != null && camp.budgetMode === 'abo') {
    const next = Math.round(Number(patch.dailyBudget) * 100) / 100
    const min = minDailyBudget(set.platform, 'adset')
    if (!(next >= min)) {
      reject(s, `${PLATFORM_NAME[set.platform]} requires at least ${fmtMoney(min)} per day for each ${ADSET_WORD[set.platform]}.`, set.platform)
    } else if (next > MAX_DAILY_BUDGET) {
      reject(s, `That budget is above the ${fmtMoney(MAX_DAILY_BUDGET)} daily maximum.`, set.platform)
    } else if (next !== set.dailyBudget) {
      const prev = set.dailyBudget ?? 0
      const plan = planBudgetChange(s, set, next)
      set.dailyBudget = next
      set.lastBudgetChangeHour = s.time.hour
      noteBudgetJump(s, camp.accountId, prev, next)
      applyBudgetPlan(s, plan, prev, next)
    }
  }
  if (patch.optimization && patch.optimization !== set.optimization) {
    set.optimization = patch.optimization
    resetLearning(s, set, 'optimization event changed')
  }
  if (patch.targeting) {
    const next = normalizeTargeting(set.platform, { ...set.targeting, ...patch.targeting }, camp.kind === 'advantage')
    const err = validateTargeting(s, set.platform, next)
    if (err) { reject(s, err, set.platform); return }
    if (JSON.stringify(next) !== JSON.stringify(set.targeting)) {
      set.targeting = next
      resetLearning(s, set, 'targeting edited')
    }
  }
}

export function updateAd(s: GameState, id: string, patch: Partial<Pick<Ad, 'name' | 'primaryText' | 'headline' | 'cta' | 'creativeId' | 'storeProductId'>>): void {
  const ad = findAd(s, id)
  if (!ad || ad.status === 'deleted') return
  if (patch.name !== undefined && patch.name.trim()) ad.name = patch.name.trim()
  const next = {
    primaryText: patch.primaryText ?? ad.primaryText,
    headline: patch.headline ?? ad.headline,
    creativeId: patch.creativeId ?? ad.creativeId,
    storeProductId: patch.storeProductId ?? ad.storeProductId,
  }
  const contentChanged = next.primaryText !== ad.primaryText || next.headline !== ad.headline || (patch.cta != null && patch.cta !== ad.cta)
  const creativeChanged = next.creativeId !== ad.creativeId || next.storeProductId !== ad.storeProductId
  if (!contentChanged && !creativeChanged) return
  const err = validateAdInput(s, { adSetId: ad.adSetId, name: ad.name, cta: patch.cta ?? ad.cta, ...next })
  if (err) { reject(s, err, ad.platform); return }
  ad.primaryText = next.primaryText.trim()
  ad.headline = next.headline.trim()
  if (patch.cta) ad.cta = patch.cta
  ad.creativeId = next.creativeId
  ad.storeProductId = next.storeProductId
  ad.review = 'in_review'
  ad.rejectReason = undefined
  ad.reviewDoneHour = s.time.hour + randInt(s, 1, 6)
  if (creativeChanged) {
    ad.firstDeliveryHour = null
    const set = findAdSet(s, ad.adSetId)
    if (set) resetLearning(s, set, 'creative changed')
  }
}

export function setEntityStatus(s: GameState, level: AdLevel, id: string, status: EntityStatus): void {
  const hour = s.time.hour
  const apply = (e: { status: EntityStatus; pausedHour?: number | null }) => {
    if (e.status === 'deleted') return
    const prevPaused = e.status === 'paused' ? e.pausedHour : null
    e.status = status
    if (status === 'paused') e.pausedHour = hour
    else if (status === 'active') e.pausedHour = null
    return prevPaused
  }
  if (level === 'ad') {
    const ad = findAd(s, id)
    if (!ad) return
    apply(ad)
    return
  }
  if (level === 'adset') {
    const set = findAdSet(s, id)
    if (!set) return
    const pausedSince = apply(set)
    if (status === 'deleted') for (const ad of adsInAdSet(s, id)) ad.status = 'deleted'
    if (status === 'active' && pausedSince != null && hour - pausedSince > PAUSE_RESET_HOURS) resetLearning(s, set, 'paused for more than 7 days')
    return
  }
  const c = findCampaign(s, id)
  if (!c) return
  const pausedSince = apply(c)
  if (status === 'deleted') {
    for (const set of s.ads.adSets) if (set.campaignId === id) set.status = 'deleted'
    for (const ad of s.ads.ads) if (ad.campaignId === id) ad.status = 'deleted'
  }
  if (status === 'active' && pausedSince != null && hour - pausedSince > PAUSE_RESET_HOURS) {
    for (const set of adSetsInCampaign(s, id)) resetLearning(s, set, 'paused for more than 7 days')
  }
}

/** Send a rejected ad back for another review (policy appeal for a single ad). */
export function requestAdReview(s: GameState, adId: string): void {
  const ad = findAd(s, adId)
  if (!ad || ad.review !== 'rejected') return
  ad.review = 'in_review'
  ad.reviewDoneHour = s.time.hour + randInt(s, 12, 36)
  notify(s, { kind: 'info', title: 'Review requested', body: `"${ad.name}" will be reviewed again, usually within 24 hours.`, site: ad.platform })
}

// ---------------------------------------------------------------------------
// Duplicate / copy
// ---------------------------------------------------------------------------
function cloneAd(s: GameState, src: Ad, adSetId: string, campaignId: string, rename: boolean): Ad {
  const ad: Ad = {
    ...src,
    id: uid(s, 'ad'),
    adSetId,
    campaignId,
    name: rename ? `${src.name} - Copy` : src.name,
    status: src.status === 'deleted' ? 'paused' : src.status,
    review: 'in_review',
    rejectReason: undefined,
    reviewDoneHour: s.time.hour + randInt(s, 1, 6),
    createdHour: s.time.hour,
    stats: {},
    lifetime: emptyStats(),
    frequency: 0,
    firstDeliveryHour: null,
    allocShare: undefined,
    noise: undefined,
    pausedHour: null,
  }
  s.ads.ads.push(ad)
  return ad
}
function cloneAdSet(s: GameState, src: AdSet, campaignId: string, rename: boolean): AdSet {
  const set: AdSet = {
    ...src,
    id: uid(s, 'ads'),
    campaignId,
    name: rename ? `${src.name} - Copy` : src.name,
    targeting: { ...src.targeting, interests: [...src.targeting.interests] },
    createdHour: s.time.hour,
    learning: freshLearning(s, 0),
    reach: 0,
    impressions: 0,
    pausedHour: null,
    lastBudgetChangeHour: undefined,
    allocShare: undefined,
  }
  s.ads.adSets.push(set)
  set.learning.budgetAtReset = budgetBasis(s, set)
  for (const ad of adsInAdSet(s, src.id)) cloneAd(s, ad, set.id, campaignId, false)
  return set
}
function cloneCampaign(s: GameState, src: Campaign, accountId: string, rename: boolean): Campaign {
  const c: Campaign = { ...src, id: uid(s, 'cmp'), accountId, name: rename ? `${src.name} - Copy` : src.name, createdHour: s.time.hour, pausedHour: null, lastBudgetChangeHour: undefined }
  s.ads.campaigns.push(c)
  for (const set of adSetsInCampaign(s, src.id)) cloneAdSet(s, set, c.id, false)
  return c
}

export function duplicateEntity(s: GameState, level: AdLevel, id: string): string | null {
  if (level === 'ad') {
    const ad = findAd(s, id)
    const set = ad && findAdSet(s, ad.adSetId)
    if (!ad || !set || ad.status === 'deleted') return null
    const copy = cloneAd(s, ad, ad.adSetId, ad.campaignId, true)
    if (set.impressions > 0) resetLearning(s, set, 'new ad added')
    return copy.id
  }
  if (level === 'adset') {
    const set = findAdSet(s, id)
    if (!set || set.status === 'deleted') return null
    const camp = findCampaign(s, set.campaignId)
    if (camp?.platform === 'fadbook' && camp.budgetMode === 'cbo' && camp.dailyBudget != null) {
      const need = minDailyBudget('fadbook', 'campaign', adSetsInCampaign(s, camp.id).length + 1)
      if (camp.dailyBudget < need) { reject(s, `Raise the campaign budget to at least ${fmtMoney(need)} to add another ad set.`, 'fadbook'); return null }
    }
    return cloneAdSet(s, set, set.campaignId, true).id
  }
  const c = findCampaign(s, id)
  if (!c || c.status === 'deleted') return null
  return cloneCampaign(s, c, c.accountId, true).id
}

/** Rebuild a campaign (with its ad sets & ads) inside another account on the same platform. */
export function copyCampaignToAccount(s: GameState, campaignId: string, accountId: string): string | null {
  const c = findCampaign(s, campaignId)
  const acc = findAccount(s, accountId)
  if (!c || !acc || acc.platform !== c.platform) return null
  if (acc.status === 'restricted' || acc.status === 'disabled') { reject(s, `"${acc.name}" is ${acc.status}.`, acc.platform); return null }
  const copy = cloneCampaign(s, c, acc.id, false)
  notify(s, { kind: 'success', title: 'Campaign copied', body: `"${c.name}" was rebuilt in "${acc.name}". New ads go through review and learning starts over.`, site: acc.platform })
  return copy.id
}

// ---------------------------------------------------------------------------
// Policy review
// ---------------------------------------------------------------------------
function textOf(ad: Ad, extra: string[]): string {
  return [ad.primaryText, ad.headline, ...extra].join(' \n ').toLowerCase()
}

export function rejectionOdds(s: GameState, ad: Ad): { p: number; reason: string } {
  const cr = findCreative(s, ad.creativeId)
  const pd = cr ? productDef(cr.catalogId) : null
  const crackdown = claimRiskMult(s)
  const claimRisk = Math.min(1, (pd?.claimRisk ?? 0.1) * crackdown)
  const risky = !!cr && (cr.hook === 'before_after' || cr.format === 'before_after_video' || cr.angle === 'health')
  let p = claimRisk * (risky ? 1.5 : 0.5)
  if (ad.platform === 'tiktak') p *= 0.8
  const text = textOf(ad, cr ? [cr.hookText, cr.script] : [])
  const claimHits = CLAIM_WORDS.filter(w => text.includes(w)).length
  p += Math.min(0.4, 0.12 * claimHits)
  const toks = tokens(text)
  const personal = toks.some(t => t === 'you' || t === 'your' || t === 'youre') && toks.some(t => CONDITION_WORDS.has(t))
  if (personal) p += ad.platform === 'fadbook' ? 0.25 : 0.15
  if (cr?.hook === 'controversial') p += 0.05
  p *= Math.max(0.25, DIFFICULTY[s.meta.difficulty].banRiskMult)
  let reason: string
  if (personal) reason = 'Personal attributes: ads can\'t assert or imply things about a person\'s health, body or appearance (for example "your acne").'
  else if (claimHits > 0) reason = 'Unrealistic outcomes: ads can\'t promise guaranteed, instant or medical results.'
  else if (risky && (pd?.niche === 'beauty' || pd?.niche === 'wellness' || pd?.niche === 'fitness')) reason = 'Health and wellness: before-and-after footage and implied body or skin results aren\'t allowed.'
  else if (cr?.hook === 'controversial') reason = 'Low-quality or disruptive content: sensational or divisive openers.'
  else reason = 'Misleading claims: the ad makes claims about the product that we couldn\'t verify.'
  return { p: clamp(p, 0, 0.92), reason }
}

export function processReviews(s: GameState): void {
  const hour = s.time.hour
  for (const ad of s.ads.ads) {
    if (ad.review !== 'in_review' || ad.status === 'deleted') continue
    if ((ad.reviewDoneHour ?? ad.createdHour + 3) > hour) continue
    const { p, reason } = rejectionOdds(s, ad)
    const second = !!ad.rejectReason
    if (chance(s, second ? p * 0.7 : p)) {
      ad.review = 'rejected'
      ad.rejectReason = reason
      const camp = findCampaign(s, ad.campaignId)
      const acc = camp && findAccount(s, camp.accountId)
      if (acc) {
        acc.disapprovals++
        acc.quality = clamp(acc.quality - 4, 0, 100)
      }
      notify(s, { kind: 'warning', title: `Ad rejected: ${ad.name}`, body: `${reason} Edit the ad or request another review.`, site: ad.platform })
    } else {
      ad.review = 'approved'
      ad.rejectReason = undefined
    }
  }
}

// ---------------------------------------------------------------------------
// Audiences
// ---------------------------------------------------------------------------
const LAL_1PCT_US = BENCHMARKS.fadbook.audienceSizeUS.lookalike1
export function lookalikeSize(platform: Platform, pct: number): number {
  const base = LAL_1PCT_US * Math.pow(pct, 0.98)
  return Math.round(platform === 'tiktak' ? base * TIKTAK_REACH_RATIO : base)
}
export function retargetingSize(s: GameState, platform: Platform, days: number): number {
  const day = today(s)
  let sessions = 0
  for (let d = day - days; d <= day; d++) sessions += s.store.analytics.daily[d]?.sessions ?? 0
  const matchRate = platform === 'fadbook' ? 0.62 : 0.48
  return Math.round(sessions * 0.8 * matchRate)
}

export function createAudience(s: GameState, platform: Platform, kind: 'lookalike' | 'retargeting', param: number): string | null {
  const P = PLATFORM_NAME[platform]
  if (!hasPixel(s, platform)) {
    notify(s, { kind: 'warning', title: 'Pixel required', body: `Custom audiences are built from pixel data. Install the ${P} channel app in Shopifly first.`, site: 'shopifly', path: 'apps' })
    return null
  }
  let aud: CustomAudience
  if (kind === 'lookalike') {
    const buyers = pixelPurchases(s, platform)
    const need = BENCHMARKS.fadbook.lookalikeMinPurchasers
    if (buyers < need) {
      notify(s, { kind: 'warning', title: 'Source audience too small', body: `A lookalike needs at least ${need} purchasers in the source audience. Your ${P} pixel has seen ${buyers}.`, site: platform })
      return null
    }
    const pct = clamp(Math.round(param), 1, 10)
    aud = { id: uid(s, 'aud'), platform, kind, name: platform === 'fadbook' ? `Lookalike (US, ${pct}%) - Purchasers` : `Lookalike ${pct}% - Purchasers`, param: pct, size: lookalikeSize(platform, pct), createdDay: today(s) }
  } else {
    const days = clamp(Math.round(param), 1, 180)
    aud = { id: uid(s, 'aud'), platform, kind, name: platform === 'fadbook' ? `Website visitors - last ${days} days` : `Website traffic - last ${days} days`, param: days, size: retargetingSize(s, platform, days), createdDay: today(s) }
  }
  s.ads.audiences.push(aud)
  return aud.id
}

export function refreshAudiences(s: GameState): void {
  for (const a of s.ads.audiences) if (a.kind === 'retargeting') a.size = retargetingSize(s, a.platform, a.param)
}

// ---------------------------------------------------------------------------
// Rules CRUD
// ---------------------------------------------------------------------------
export function upsertRule(s: GameState, rule: AutomatedRule): void {
  if (!featureUnlocked(s, 'rules')) {
    notify(s, { kind: 'warning', title: 'Automated rules locked', body: `Automated rules unlock at Media Buying level ${MB_GATES.rules}.`, site: rule.platform })
    return
  }
  if (!rule.name.trim() || !Number.isFinite(rule.value)) {
    notify(s, { kind: 'warning', title: 'Rule not saved', body: 'Give the rule a name and a numeric condition.', site: rule.platform })
    return
  }
  const r: AutomatedRule = {
    ...rule,
    id: rule.id || uid(s, 'rule'),
    name: rule.name.trim(),
    minSpend: Math.max(0, Number(rule.minSpend) || 0),
    actionPct: clamp(Number(rule.actionPct) || 0, 0, 100),
    scope: rule.action !== 'pause' && rule.scope === 'ad' ? 'adset' : rule.scope,
  }
  const i = s.ads.rules.findIndex(x => x.id === r.id)
  if (i >= 0) s.ads.rules[i] = r
  else s.ads.rules.push(r)
}
export function deleteRule(s: GameState, id: string): void {
  s.ads.rules = s.ads.rules.filter(r => r.id !== id)
}
