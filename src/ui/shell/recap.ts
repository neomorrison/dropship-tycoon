// Midnight recap: a compact P&L + funnel summary of the day that just ended.
import type { Day, GameState } from '../../core/types'
import { emptyPnl } from '../../core/money'
import { pct } from '../../core/format'
import { BENCHMARKS } from '../../data/benchmarks'

export interface DayRecap {
  day: Day
  revenue: number
  refunds: number
  /** ad spend the platforms delivered that day (billing charges land on other days) */
  adSpendFadbook: number
  adSpendTiktak: number
  adSpend: number
  /** ad charges actually billed to your card/bank that day */
  adBilled: number
  /** product cost + shipping */
  cogs: number
  fees: number
  apps: number
  creatives: number
  staff: number
  other: number
  /** business profit (inventory purchases excluded: that's cash turned into stock) */
  profit: number
  inventory: number
  orders: number
  sessions: number
  /** sessions converted / sessions */
  cvr: number
  aov: number
  /** blended revenue / ad spend */
  roas: number
  wage: number
  personalSpend: number
  cashEnd: number
  cashDelta: number | null
  netWorth: number | null
  netWorthDelta: number | null
  /** any business activity at all that day */
  hasBusiness: boolean
}

/** Spend the ads delivered on `day`, per platform (null when no ad has stats for that day). */
function deliveredSpend(s: GameState, day: Day): { fadbook: number; tiktak: number } | null {
  let fadbook = 0
  let tiktak = 0
  let any = false
  for (const ad of s.ads?.ads ?? []) {
    const st = ad.stats?.[day]
    if (!st) continue
    any = true
    const v = Number.isFinite(st.spend) ? st.spend : 0
    if (ad.platform === 'tiktak') tiktak += v
    else fadbook += v
  }
  return any ? { fadbook, tiktak } : null
}

export function buildRecap(s: GameState, day: Day): DayRecap {
  const p = s.finance.pnl[day] ?? emptyPnl()
  const a = s.store.analytics.daily[day]
  const adBilled = p.adSpendFadbook + p.adSpendTiktak
  // the P&L books ad spend when a platform bills the card (threshold / monthly), which makes a
  // single day look free or terrible; the recap judges the day by what the ads actually spent
  const delivered = deliveredSpend(s, day)
  const adSpendFadbook = delivered ? delivered.fadbook : p.adSpendFadbook
  const adSpendTiktak = delivered ? delivered.tiktak : p.adSpendTiktak
  const adSpend = adSpendFadbook + adSpendTiktak
  const cogs = p.cogs + p.shipping
  const profit = p.revenue - p.refunds - p.chargebacks - cogs - adSpend - p.paymentFees - p.apps - p.creatives - p.staff - p.otherBusiness
  const snap = s.history.find(h => h.day === day)
  const prev = s.history.find(h => h.day === day - 1)
  const orders = a?.orders ?? 0
  const sessions = a?.sessions ?? 0
  const hasBusiness = p.revenue > 0 || adSpend > 0 || adBilled > 0 || orders > 0 || sessions > 0 || p.creatives > 0 || p.apps > 0 || p.cogs > 0
  return {
    day,
    revenue: p.revenue,
    refunds: p.refunds + p.chargebacks,
    adSpendFadbook,
    adSpendTiktak,
    adSpend,
    adBilled,
    cogs,
    fees: p.paymentFees,
    apps: p.apps,
    creatives: p.creatives,
    staff: p.staff,
    other: p.otherBusiness,
    profit,
    inventory: p.inventory,
    orders,
    sessions,
    cvr: sessions > 0 ? (a?.converted ?? orders) / sessions : 0,
    aov: orders > 0 ? p.revenue / orders : 0,
    roas: adSpend > 0 ? p.revenue / adSpend : 0,
    wage: p.personalIncome,
    personalSpend: p.personalSpend,
    cashEnd: snap?.cash ?? s.finance.cash,
    cashDelta: snap && prev ? snap.cash - prev.cash : null,
    netWorth: snap?.netWorth ?? null,
    netWorthDelta: snap && prev ? snap.netWorth - prev.netWorth : null,
    hasBusiness,
  }
}

/** One skill-building takeaway for the day, judged against real-world benchmarks. */
export function recapInsight(r: DayRecap): string | null {
  const cvrB = BENCHMARKS.store.cvr
  if (!r.hasBusiness) return r.wage > 0 ? 'A day of shifts. Every paycheck is runway for your first product test.' : null
  if (r.adSpend > 25 && r.orders === 0) return 'Spend with zero orders. Check where the funnel breaks: link CTR on the ads, add-to-cart rate on the page, then checkout.'
  if (r.sessions >= 150 && r.cvr < cvrB.bad)
    return `Store conversion was ${pct(r.cvr)}. Under ${pct(cvrB.bad, 1)} usually means the page or the offer is the problem, not the ads.`
  if (r.adSpend > 0 && r.roas > 0 && r.roas < 1) return `Blended ROAS was ${r.roas.toFixed(2)}: you paid more for ads than you took in. Don't scale this yet. Fix the creative or the page first.`
  if (r.sessions >= 150 && r.cvr >= cvrB.good)
    return `Store conversion was ${pct(r.cvr)}, top-20% territory (above ${pct(cvrB.good, 1)}). If profit holds, raise budgets gradually, ≤${Math.round(BENCHMARKS.fadbook.significantBudgetChange * 100)}% at a time.`
  if (r.profit > 0) return 'A profitable day. Check it against the ad-platform numbers: they over-report, and Shopifly orders are the truth.'
  return null
}
