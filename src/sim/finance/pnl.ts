// P&L helpers shared by finance, life (income checks) and UIs.
import type { DailyPnl, GameState } from '../../core/types'
import { emptyPnl } from '../../core/money'

/** Operating profit of the business for one day (inventory purchases are capitalized, not expensed). */
export function businessProfit(p: DailyPnl | undefined): number {
  if (!p) return 0
  return p.revenue - p.refunds - p.chargebacks - p.cogs - p.shipping - p.adSpendFadbook - p.adSpendTiktak
    - p.paymentFees - p.apps - p.creatives - p.staff - p.otherBusiness
}

/** Sum of daily P&L over [from, to] (inclusive). */
export function rangePnl(s: GameState, from: number, to: number): DailyPnl {
  const out = emptyPnl()
  for (let d = Math.max(0, from); d <= to; d++) {
    const p = s.finance.pnl[d]
    if (!p) continue
    for (const k of Object.keys(out) as (keyof DailyPnl)[]) out[k] += p[k] || 0
  }
  return out
}

/** Income over the last `days` complete days: wages + (positive) business profit. Landlords & lenders use this. */
export function recentIncome(s: GameState, today: number, days = 30): { wages: number; business: number; revenue: number; total: number } {
  const r = rangePnl(s, today - days, today - 1)
  const business = businessProfit(r)
  return { wages: r.personalIncome, business, revenue: r.revenue, total: r.personalIncome + Math.max(0, business) }
}
