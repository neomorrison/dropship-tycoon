// Attribution: the store reports real conversions per ad; we record the truth and queue the
// platform-REPORTED numbers (inflated by view-through/modeled conversions, and delayed:
// 70% now, 22% next day, 8% in two days — always credited to the ORIGINAL day, so
// yesterday's numbers "catch up" the way they do in real ads managers).
import type { ConversionEvent, GameState } from '../../core/types'
import { rand, randInt, randRange, stochRound } from '../../core/rng'
import { dayOf } from '../../core/time'
import { bench, dayStats, findAd, findAdSet, hasPixel } from './shared'
import { learningOnConversions } from './structure'

const QUEUE_CAP = 5000

/** Store reports real conversions per ad; record truth + queue delayed/inflated platform reports. */
export function adsRecordConversions(s: GameState, events: ConversionEvent[]): void {
  const hour = s.time.hour
  const day = dayOf(hour)
  for (const ev of events) {
    const ad = findAd(s, ev.adId)
    if (!ad) continue
    const p = ad.platform
    const st = dayStats(ad, day)
    st.truePurchases += ev.purchases
    st.trueRevenue += ev.revenue
    const set = findAdSet(s, ad.adSetId)
    if (set) learningOnConversions(s, set, ev.purchases, ev.atc)
    if (!hasPixel(s, p)) continue // no pixel → the platform never sees the conversion

    const { min, max } = bench(p).reportedPurchaseInflation
    const infl = randRange(s, min, max) * (s.events.modifiers.attributionMult?.[p] ?? 1)
    st.atc += stochRound(s, ev.atc * infl)
    st.checkouts += stochRound(s, ev.checkouts * infl)
    const reported = stochRound(s, ev.purchases * infl)
    if (reported <= 0) continue
    const aov = ev.purchases > 0 ? ev.revenue / ev.purchases : 0
    let now = 0
    let d1 = 0
    let d2 = 0
    for (let i = 0; i < reported; i++) {
      const r = rand(s)
      if (r < 0.7) now++
      else if (r < 0.92) d1++
      else d2++
    }
    st.purchases += now
    st.purchaseValue += now * aov
    if (d1) s.ads.reportQueue.push({ adId: ad.id, day, releaseHour: hour + 24 + randInt(s, -6, 8), purchases: d1, value: d1 * aov })
    if (d2) s.ads.reportQueue.push({ adId: ad.id, day, releaseHour: hour + 48 + randInt(s, -6, 10), purchases: d2, value: d2 * aov })
  }
  if (s.ads.reportQueue.length > QUEUE_CAP) s.ads.reportQueue.splice(0, s.ads.reportQueue.length - QUEUE_CAP)
}

/** Hourly: late-reported conversions land on their original day. */
export function releaseReports(s: GameState): void {
  const hour = s.time.hour
  if (!s.ads.reportQueue.length) return
  const keep = []
  for (const r of s.ads.reportQueue) {
    if (r.releaseHour > hour) { keep.push(r); continue }
    const ad = findAd(s, r.adId)
    if (!ad) continue
    const st = ad.stats[r.day] ?? (dayOf(hour) - r.day < 120 ? dayStats(ad, r.day) : null)
    if (st) {
      st.purchases += r.purchases
      st.purchaseValue += r.value
    } else {
      ad.lifetime.purchases += r.purchases
      ad.lifetime.purchaseValue += r.value
    }
  }
  s.ads.reportQueue = keep
}
