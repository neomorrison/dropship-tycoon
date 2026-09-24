// Daily upkeep for the ads module (called at 00:00 by the orchestrator).
import type { GameState } from '../../core/types'
import { addStats } from './metrics'
import { STATS_RETENTION_DAYS, findCreative } from './shared'
import { accountsDayRollover } from './accounts'
import { learningDayRollover, refreshAudiences } from './structure'
import { creatorsDayRollover } from './creatives'
import { TIPS_MIN_IMPRESSIONS, creativeImpressions, creativeTips } from './scoring'
import { coachAdsDayRollover } from './coach'

export function adsDayRollover(s: GameState, day: number): void {
  learningDayRollover(s)
  accountsDayRollover(s, day)
  pruneStats(s, day)
  creatorsDayRollover(s, day)
  refreshAudiences(s)
  updateCreativeTips(s)
  coachAdsDayRollover(s, day)
  // quiet organic posts (no velocity, older than 30 days) are dropped from the live list
  s.ads.organicPosts = s.ads.organicPosts.filter(p => p.velocity > 0 || day - Math.floor(p.postedHour / 24) <= 30 || p.sparked)
}

/** Fold day stats older than the retention window into `lifetime`. */
export function pruneStats(s: GameState, day: number): void {
  const cutoff = day - STATS_RETENTION_DAYS
  for (const ad of s.ads.ads) {
    for (const k of Object.keys(ad.stats)) {
      const d = Number(k)
      if (d < cutoff) {
        addStats(ad.lifetime, ad.stats[d])
        delete ad.stats[d]
      }
    }
  }
}

/** Tips unlock after enough impressions; their detail follows the player's current skill. */
export function updateCreativeTips(s: GameState): void {
  const seen = new Set<string>()
  for (const ad of s.ads.ads) seen.add(ad.creativeId)
  for (const p of s.ads.organicPosts) seen.add(p.creativeId)
  for (const id of seen) {
    const c = findCreative(s, id)
    if (!c?.scores) continue
    if (creativeImpressions(s, id) < TIPS_MIN_IMPRESSIONS) continue
    c.scores.tips = creativeTips(s, c, c.scores)
  }
}
