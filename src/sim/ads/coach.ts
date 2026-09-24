// Coach Kev diagnostics for ads (metric thresholds from BENCHMARKS). Run once a day.
import type { GameState } from '../../core/types'
import { coachTip } from '../../core/notify'
import { BENCHMARKS } from '../../data/benchmarks'
import { breakEven } from '../store'
import { deriveMetrics } from './metrics'
import { PLATFORM_NAME, adRange, adTotals, bench, findCreative, fmtInt, fmtMoney, fmtPct, hasPixel } from './shared'

const CD = 72

export function coachAdsDayRollover(s: GameState, day: number): void {
  // pixel missing while money is being spent
  for (const p of ['fadbook', 'tiktak'] as const) {
    const spending = s.ads.ads.some(a => a.platform === p && a.status === 'active' && (a.stats[day - 1]?.spend ?? 0) > 0)
    if (spending && !hasPixel(s, p)) {
      coachTip(s, `ads_pixel_missing_${p}`, `You're spending on ${PLATFORM_NAME[p]} with no pixel. It can't see a single purchase, so it optimizes for clickers. Install the ${p === 'fadbook' ? 'Fadbook & Instaglam' : 'TikTak'} channel app in Shopifly today.`, { app: 'shopifly', essential: true, cooldownHours: 48 })
    }
  }
  for (const ad of s.ads.ads) {
    if (ad.status !== 'active' || ad.review !== 'approved') continue
    const p = ad.platform
    const B = bench(p)
    const recent = adRange(ad, day - 3, day - 1)
    if (recent.spend <= 0) continue
    const life = adTotals(ad)
    const m = deriveMetrics(life)
    const cr = findCreative(s, ad.creativeId)
    const app = p
    if (life.impressions >= 3000 && m.ctrLink < B.ctrLink.bad) {
      coachTip(s, `ads_ctr_${ad.id}`, `"${ad.name}" has a ${fmtPct(m.ctrLink)} link CTR after ${fmtInt(life.impressions)} impressions (weak is under ${fmtPct(B.ctrLink.bad, 1)}). The hook or offer isn't landing: test a new opening before you touch the budget.`, { app, cooldownHours: CD })
      continue
    }
    if (cr?.isVideo && life.impressions >= 3000) {
      const band = p === 'fadbook' ? BENCHMARKS.fadbook.hookRate : BENCHMARKS.tiktak.view2sRate
      if (m.hookRate < band.bad) {
        coachTip(s, `ads_hook_${ad.id}`, `Only ${fmtPct(m.hookRate, 1)} of people watch past the first ${p === 'fadbook' ? '3' : '2'} seconds of "${ad.name}" (weak is under ${fmtPct(band.bad, 0)}). Rework the first frame and on-screen text. Same body, new hook.`, { app, cooldownHours: CD })
        continue
      }
      if (p === 'fadbook' && life.videoViewsShort > 500 && m.holdRate < BENCHMARKS.fadbook.holdRate.bad) {
        coachTip(s, `ads_hold_${ad.id}`, `"${ad.name}" stops the scroll but loses people: hold rate ${fmtPct(m.holdRate, 1)} (weak is under ${fmtPct(BENCHMARKS.fadbook.holdRate.bad, 0)}). Tighten seconds 4–15: show the demo sooner and cut the slow part.`, { app, cooldownHours: CD })
      }
    }
    if (ad.frequency > B.fatigueFrequency + 0.5) {
      coachTip(s, `ads_freq_${ad.id}`, `Frequency on "${ad.name}" is ${ad.frequency.toFixed(2)}: the same people keep seeing it and it's fatiguing. Launch fresh creatives (new hooks) or widen the audience.`, { app, cooldownHours: CD })
    }
    const be = safeBreakEven(s, ad.storeProductId)
    if (be > 0) {
      const spend = life.spend
      const cpa = life.purchases > 0 ? life.spend / life.purchases : Infinity
      if (spend >= 2 * be && cpa > 2 * be) {
        coachTip(s, `ads_cpa_${ad.id}`, life.purchases > 0
          ? `"${ad.name}" has spent ${fmtMoney(spend)} at a ${fmtMoney(cpa)} CPA, more than double your ${fmtMoney(be)} break-even. Turn it off and move the budget to what works.`
          : `"${ad.name}" has spent ${fmtMoney(spend)} (2× your ${fmtMoney(be)} break-even CPA) without a purchase. Kill it: waiting rarely saves an ad like this.`,
        { app, cooldownHours: CD * 2 })
      }
    }
  }
}

function safeBreakEven(s: GameState, storeProductId: string): number {
  try {
    const be = breakEven(s, storeProductId)
    return Number.isFinite(be.breakEvenCpa) ? be.breakEvenCpa : 0
  } catch {
    return 0
  }
}
