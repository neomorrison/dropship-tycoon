// Milestones: unlock checks (cheap subset hourly, full set at day rollover), notify + mail.
import type { GameState } from '../../core/types'
import { MILESTONES, MILESTONE_BY_ID } from '../../data/milestones'
import { mail, notify } from '../../core/notify'
import { netWorth } from '../../core/money'
import { lifetimeStoreOrders } from '../market'
import { SENDERS } from '../../data/events'
import { today } from './util'

export interface MilestoneDef { id: string; title: string; description: string; icon: string }

export function milestoneDefs(): MilestoneDef[] {
  return MILESTONES.map(({ id, title, description, icon }) => ({ id, title, description, icon }))
}

function unlock(s: GameState, id: string) {
  if (s.milestones[id] !== undefined) return
  const def = MILESTONE_BY_ID[id]
  if (!def) return
  s.milestones[id] = today(s)
  notify(s, { kind: 'success', title: `Milestone unlocked: ${def.title}`, body: def.description, site: 'academy', path: 'milestones' })
  mail(s, { ...SENDERS.coach, tag: 'coach', site: 'academy', path: 'milestones', subject: `🏆 ${def.title}`, body: `${def.mail}\n\n— Kev` })
}

function maxDailySales(s: GameState, days?: number[]): number {
  const daily = s.store.analytics?.daily ?? {}
  let best = 0
  const keys = days ?? Object.keys(daily).map(Number)
  for (const d of keys) best = Math.max(best, daily[d]?.totalSales ?? 0)
  return best
}

function salesBetween(s: GameState, from: number, to: number): number {
  const daily = s.store.analytics?.daily ?? {}
  let sum = 0
  for (let d = Math.max(0, from); d <= to; d++) sum += daily[d]?.totalSales ?? 0
  return sum
}

/** Lifetime profit per catalog product: revenue − product/shipping/fees − ad spend on its ads. */
function bestProductProfit(s: GameState): number {
  const spendByCatalog: Record<string, number> = {}
  const spToCat: Record<string, string> = {}
  for (const sp of s.store.products) spToCat[sp.id] = sp.catalogId
  for (const ad of s.ads.ads) {
    const cat = spToCat[ad.storeProductId]
    if (!cat) continue
    let spend = ad.lifetime?.spend ?? 0
    for (const st of Object.values(ad.stats)) spend += st.spend
    spendByCatalog[cat] = (spendByCatalog[cat] ?? 0) + spend
  }
  const refundsByCatalog: Record<string, number> = {}
  for (const o of s.store.orders) if (o.refunded > 0) refundsByCatalog[o.catalogId] = (refundsByCatalog[o.catalogId] ?? 0) + o.refunded
  let best = 0
  for (const [id, st] of Object.entries(s.catalog.sales ?? {})) {
    best = Math.max(best, st.revenue - st.costs - (spendByCatalog[id] ?? 0) - (refundsByCatalog[id] ?? 0))
  }
  return best
}

/** Cheap checks (safe to call every hour). */
export function checkMilestonesLight(s: GameState): void {
  const day = today(s)
  if (s.store.created) unlock(s, 'first_store')
  if (s.store.products.some(p => p.status === 'active')) unlock(s, 'first_product_live')
  if (s.store.orders.length > 0 || lifetimeStoreOrders(s) > 0) unlock(s, 'first_sale')
  const todaySales = maxDailySales(s, [day])
  if (todaySales >= 100) unlock(s, 'first_100_day')
  if (todaySales >= 1000) unlock(s, 'first_1k_day')
  if (todaySales >= 10_000) unlock(s, 'first_10k_day')
  if (s.job.quitDay !== null && s.job.quitDay !== undefined) unlock(s, 'quit_job')
  if (s.staff.members.length > 0) unlock(s, 'first_hire')
  if (s.home.tier >= 1) unlock(s, 'move_out')
  if (s.home.tier >= 5) unlock(s, 'penthouse')
  if (s.store.chargebacks.some(c => c.status === 'won')) unlock(s, 'chargeback_won')
}

export function checkMilestones(s: GameState): void {
  checkMilestonesLight(s)
  const day = today(s)
  const best = maxDailySales(s)
  if (best >= 100) unlock(s, 'first_100_day')
  if (best >= 1000) unlock(s, 'first_1k_day')
  if (best >= 10_000) unlock(s, 'first_10k_day')
  const month = salesBetween(s, day - 30, day)
  if (month >= 10_000) unlock(s, 'month_10k')
  if (month >= 100_000) unlock(s, 'month_100k')
  if (s.milestones.lifetime_1m === undefined && salesBetween(s, 0, day) >= 1_000_000) unlock(s, 'lifetime_1m')
  if (s.milestones.first_winner === undefined && bestProductProfit(s) >= 10_000) unlock(s, 'first_winner')
  const nw = netWorth(s)
  if (nw >= 100_000) unlock(s, 'networth_100k')
  if (nw >= 1_000_000) unlock(s, 'networth_1m')
}
