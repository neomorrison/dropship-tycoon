// Fadbook column catalog: every metric the player can add in "Customize columns", the built-in
// column presets (Performance, Performance and clicks, Video engagement, Engagement, Ecom custom)
// and Meta-style value formatting. Values are computed from platform-reported stats only.
import type { AdDayStats, AdLevel, GameState } from '../../../core/types'
import { BENCHMARKS } from '../../../data/benchmarks'
import { breakEven } from '../../../sim/store'
import { addStats, emptyStats } from '../../../sim/ads'
import { amFmt } from '../../kit/adsmanager'
import { resultLabels, resultsOf, type ResultKind, type Row } from './data'

/** The part of a row metrics read (entity rows, breakdown rows, and totals). */
export interface StatRow {
  st: AdDayStats
  playSec: number
  vidImps: number
  products: string[]
  resultKind: ResultKind
}

export interface MetricDef {
  id: string
  /** name in the customize-columns list */
  label: string
  /** table header (defaults to label) */
  header?: string
  category: 'Settings' | 'Performance' | 'Engagement' | 'Video' | 'Conversions' | 'Custom metrics' | 'Ad relevance diagnostics'
  description: string
  width?: number
  /** numeric value for sorting/totals (null = "—") */
  value?: (r: StatRow, s: GameState) => number | null
  format?: (v: number | null) => string
  /** gray second line */
  sub?: (r: StatRow) => string | undefined
  /** custom metric (Meta shows a small "Custom" marker) */
  custom?: boolean
  /** setting columns render their own cells (delivery, budget, bid strategy…) */
  setting?: boolean
  /** only meaningful for these levels (others render "—") */
  levels?: AdLevel[]
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null)
const B = BENCHMARKS.fadbook

/** Relevance diagnostics ranking vs. typical ads (Meta needs 500+ impressions). */
export function rankLabel(v: number | null, bench: { bad: number; avg: number; good: number }): string {
  if (v === null || !Number.isFinite(v)) return amFmt.dash
  if (v >= bench.good) return 'Above average'
  if (v >= bench.avg * 0.85) return 'Average'
  if (v >= bench.bad) return 'Below average - Bottom 35% of ads'
  if (v >= bench.bad * 0.7) return 'Below average - Bottom 20% of ads'
  return 'Below average - Bottom 10% of ads'
}
export function qualityRanking(r: StatRow): string {
  if (r.st.impressions < 500) return amFmt.dash
  if (r.vidImps > 0) return rankLabel(div(r.st.videoViewsShort, r.vidImps), B.hookRate)
  const k = 1.8
  return rankLabel(div(r.st.clicks, r.st.impressions), { bad: B.ctrLink.bad * k, avg: B.ctrLink.avg * k, good: B.ctrLink.good * k })
}
export function engagementRanking(r: StatRow): string {
  if (r.st.impressions < 500) return amFmt.dash
  return rankLabel(div(r.st.linkClicks, r.st.impressions), B.ctrLink)
}
export function conversionRanking(r: StatRow): string {
  if (r.st.impressions < 500 || r.st.lpv < 50) return amFmt.dash
  return rankLabel(div(r.st.purchases, r.st.lpv), BENCHMARKS.store.cvr)
}

const money = (v: number | null) => amFmt.money(v)
/** Ads Manager shows "—" rather than 0 for counts with no activity */
const int = (v: number | null) => (v ? amFmt.int(v) : amFmt.dash)
const pct = (v: number | null) => amFmt.pct(v)

export const METRICS: MetricDef[] = [
  // ---- settings ----
  { id: 'delivery', label: 'Delivery', category: 'Settings', setting: true, width: 150, description: 'The current status of your campaign, ad set or ad, including learning and review states.' },
  { id: 'bid', label: 'Bid strategy', category: 'Settings', setting: true, width: 150, description: 'How delivery bids in the auction: Highest volume (lowest cost) or a Cost per result goal (cost cap).' },
  { id: 'budget', label: 'Budget', category: 'Settings', setting: true, width: 140, description: 'Daily budget. Advantage+ campaign budget (CBO) sets it on the campaign; otherwise each ad set has its own.' },
  { id: 'attribution', label: 'Attribution setting', category: 'Settings', setting: true, width: 150, description: 'The window used to credit conversions to your ads: 7-day click or 1-day view.' },
  { id: 'ends', label: 'Ends', category: 'Settings', setting: true, width: 96, description: 'When delivery is scheduled to stop.' },
  // ---- performance ----
  {
    id: 'results', label: 'Results', category: 'Performance', width: 120,
    description: 'The number of times your ad achieved an outcome, based on the optimization event you selected (purchases or adds to cart).',
    value: r => resultsOf(r), format: int, sub: r => resultLabels(r.resultKind).results,
  },
  { id: 'reach', label: 'Reach', category: 'Performance', width: 112, description: 'The number of Accounts Center accounts that saw your ads at least once. Summed across days, so longer ranges overstate unique reach.', value: r => r.st.reach, format: int },
  { id: 'impressions', label: 'Impressions', category: 'Performance', width: 134, description: 'The number of times your ads were on screen.', value: r => r.st.impressions, format: int },
  { id: 'frequency', label: 'Frequency', category: 'Performance', width: 120, description: 'The average number of times each account saw your ad (impressions ÷ reach).', value: r => div(r.st.impressions, r.st.reach), format: v => amFmt.freq(v) },
  {
    id: 'cpr', label: 'Cost per result', category: 'Performance', width: 124, description: 'The average cost per result from your ads.',
    value: r => { const n = resultsOf(r); return n ? r.st.spend / n : null }, format: money, sub: r => resultLabels(r.resultKind).per,
  },
  { id: 'spend', label: 'Amount spent', category: 'Performance', width: 116, description: 'The estimated total amount of money you\'ve spent on your campaign, ad set or ad during its schedule.', value: r => r.st.spend, format: money },
  { id: 'cpm', label: 'CPM (cost per 1,000 impressions)', header: 'CPM (cost per 1,000 impressions)', category: 'Performance', width: 132, description: 'The average cost for 1,000 impressions.', value: r => (r.st.impressions ? (r.st.spend / r.st.impressions) * 1000 : null), format: money },
  // ---- engagement / clicks ----
  { id: 'link_clicks', label: 'Link clicks', category: 'Engagement', width: 104, description: 'The number of clicks on links within the ad that led to your website.', value: r => r.st.linkClicks, format: int },
  { id: 'cpc_link', label: 'CPC (cost per link click)', category: 'Engagement', width: 124, description: 'The average cost for each link click.', value: r => div(r.st.spend, r.st.linkClicks), format: money },
  { id: 'ctr_link', label: 'CTR (link click-through rate)', category: 'Engagement', width: 132, description: 'The percentage of times people saw your ad and performed a link click.', value: r => div(r.st.linkClicks, r.st.impressions), format: pct },
  { id: 'clicks_all', label: 'Clicks (all)', category: 'Engagement', width: 100, description: 'The number of clicks on your ads, including profile, reactions and "See more".', value: r => r.st.clicks, format: int },
  { id: 'ctr_all', label: 'CTR (all)', category: 'Engagement', width: 96, description: 'The percentage of times people saw your ad and performed a click (all).', value: r => div(r.st.clicks, r.st.impressions), format: pct },
  { id: 'cpc_all', label: 'CPC (all)', category: 'Engagement', width: 96, description: 'The average cost for each click (all).', value: r => div(r.st.spend, r.st.clicks), format: money },
  { id: 'lpv', label: 'Landing page views', category: 'Engagement', width: 120, description: 'The number of times a person clicked a link and then successfully loaded your landing page.', value: r => r.st.lpv, format: int },
  { id: 'cost_per_lpv', label: 'Cost per landing page view', category: 'Engagement', width: 130, description: 'The average cost for each landing page view.', value: r => div(r.st.spend, r.st.lpv), format: money },
  { id: 'post_engagement', label: 'Post engagements', category: 'Engagement', width: 120, description: 'Reactions, comments and shares on your ads.', value: r => r.st.likes + r.st.comments + r.st.shares, format: int },
  { id: 'reactions', label: 'Post reactions', category: 'Engagement', width: 110, description: 'The number of reactions on your ads.', value: r => r.st.likes, format: int },
  { id: 'comments', label: 'Post comments', category: 'Engagement', width: 110, description: 'The number of comments on your ads.', value: r => r.st.comments, format: int },
  { id: 'shares', label: 'Post shares', category: 'Engagement', width: 100, description: 'The number of shares of your ads.', value: r => r.st.shares, format: int },
  { id: 'cost_per_engagement', label: 'Cost per post engagement', category: 'Engagement', width: 130, description: 'The average cost for each post engagement.', value: r => div(r.st.spend, r.st.likes + r.st.comments + r.st.shares), format: money },
  // ---- video ----
  { id: 'video_3s', label: '3-second video plays', category: 'Video', width: 120, description: 'The number of times your video played for at least 3 seconds, or nearly its total length if shorter.', value: r => (r.vidImps ? r.st.videoViewsShort : null), format: int },
  { id: 'cost_per_3s', label: 'Cost per 3-second video play', category: 'Video', width: 130, description: 'The average cost for each 3-second video play.', value: r => (r.vidImps ? div(r.st.spend, r.st.videoViewsShort) : null), format: money },
  { id: 'thruplays', label: 'ThruPlays', category: 'Video', width: 104, description: 'The number of times your video was played to completion, or for at least 15 seconds.', value: r => (r.vidImps ? r.st.videoViewsLong : null), format: int },
  { id: 'cost_per_thruplay', label: 'Cost per ThruPlay', category: 'Video', width: 116, description: 'The average cost for each ThruPlay.', value: r => (r.vidImps ? div(r.st.spend, r.st.videoViewsLong) : null), format: money },
  { id: 'v25', label: 'Video plays at 25%', category: 'Video', width: 110, description: 'The number of times your video was played to 25% of its length.', value: r => (r.vidImps ? r.st.v25 : null), format: int },
  { id: 'v50', label: 'Video plays at 50%', category: 'Video', width: 110, description: 'The number of times your video was played to 50% of its length.', value: r => (r.vidImps ? r.st.v50 : null), format: int },
  { id: 'v75', label: 'Video plays at 75%', category: 'Video', width: 110, description: 'The number of times your video was played to 75% of its length.', value: r => (r.vidImps ? r.st.v75 : null), format: int },
  { id: 'v100', label: 'Video plays at 100%', category: 'Video', width: 116, description: 'The number of times your video was played to 100% of its length.', value: r => (r.vidImps ? r.st.v100 : null), format: int },
  { id: 'avg_play_time', label: 'Video average play time', category: 'Video', width: 120, description: 'The average time your video was played, including any time spent replaying.', value: r => div(r.playSec, r.st.videoViewsShort), format: v => amFmt.secs(v) },
  // ---- conversions ----
  { id: 'atc', label: 'Adds to cart', category: 'Conversions', width: 104, description: 'The number of add-to-cart events attributed to your ads.', value: r => r.st.atc, format: int },
  { id: 'cost_per_atc', label: 'Cost per add to cart', category: 'Conversions', width: 120, description: 'The average cost for each add to cart.', value: r => div(r.st.spend, r.st.atc), format: money },
  { id: 'checkouts', label: 'Checkouts initiated', category: 'Conversions', width: 120, description: 'The number of checkout-initiated events attributed to your ads.', value: r => r.st.checkouts, format: int },
  { id: 'cost_per_checkout', label: 'Cost per checkout initiated', category: 'Conversions', width: 130, description: 'The average cost for each checkout initiated.', value: r => div(r.st.spend, r.st.checkouts), format: money },
  { id: 'purchases', label: 'Purchases', category: 'Conversions', width: 100, description: 'The number of purchase events attributed to your ads (7-day click or 1-day view).', value: r => r.st.purchases, format: int },
  { id: 'cpa', label: 'Cost per purchase', category: 'Conversions', width: 116, description: 'The average cost for each purchase.', value: r => div(r.st.spend, r.st.purchases), format: money },
  { id: 'purchase_value', label: 'Purchases conversion value', category: 'Conversions', width: 130, description: 'The total value of purchases attributed to your ads.', value: r => r.st.purchaseValue, format: money },
  { id: 'roas', label: 'Purchase ROAS (return on ad spend)', header: 'Purchase ROAS (return on ad spend)', category: 'Conversions', width: 136, description: 'Purchases conversion value ÷ amount spent.', value: r => div(r.st.purchaseValue, r.st.spend), format: v => amFmt.roas(v) },
  { id: 'aov', label: 'Average purchases conversion value', category: 'Conversions', width: 140, description: 'Purchases conversion value ÷ purchases.', value: r => div(r.st.purchaseValue, r.st.purchases), format: money },
  // ---- custom metrics ----
  {
    id: 'hook_rate', label: 'Hook rate', category: 'Custom metrics', custom: true, width: 100,
    description: 'Custom metric: 3-second video plays ÷ impressions (video ads only). How well the first seconds stop the scroll.',
    value: r => div(r.st.videoViewsShort, r.vidImps), format: pct,
  },
  {
    id: 'hold_rate', label: 'Hold rate', category: 'Custom metrics', custom: true, width: 100,
    description: 'Custom metric: ThruPlays ÷ 3-second video plays. How many viewers you keep after the hook.',
    value: r => (r.vidImps ? div(r.st.videoViewsLong, r.st.videoViewsShort) : null), format: pct,
  },
  {
    id: 'lpv_cvr', label: 'Landing page conversion rate', category: 'Custom metrics', custom: true, width: 130,
    description: 'Custom metric: purchases ÷ landing page views.',
    value: r => div(r.st.purchases, r.st.lpv), format: pct,
  },
  {
    id: 'be_roas', label: 'Break-even ROAS', category: 'Custom metrics', custom: true, width: 116,
    description: 'Custom metric from your store: product price ÷ margin after landed cost and payment fees. Below this ROAS the ad loses money on the first order.',
    value: (r, s) => {
      if (r.products.length !== 1) return null
      const be = breakEven(s, r.products[0]).breakEvenRoas
      return Number.isFinite(be) && be > 0 ? be : null
    },
    format: v => amFmt.roas(v),
    sub: r => (r.products.length > 1 ? 'Multiple products' : undefined),
  },
  // ---- diagnostics (ads only) ----
  { id: 'quality_ranking', label: 'Quality ranking', category: 'Ad relevance diagnostics', setting: true, levels: ['ad'], width: 150, description: 'How your ad\'s perceived quality compared to ads competing for the same audience (needs 500+ impressions).' },
  { id: 'engagement_ranking', label: 'Engagement rate ranking', category: 'Ad relevance diagnostics', setting: true, levels: ['ad'], width: 160, description: 'How your ad\'s expected engagement rate compared to ads competing for the same audience.' },
  { id: 'conversion_ranking', label: 'Conversion rate ranking', category: 'Ad relevance diagnostics', setting: true, levels: ['ad'], width: 160, description: 'How your ad\'s expected conversion rate compared to ads with the same optimization goal.' },
]

export const METRIC_BY_ID = new Map(METRICS.map(m => [m.id, m]))

export const BUILTIN_PRESETS = [
  { id: 'performance', label: 'Performance', columns: ['delivery', 'bid', 'budget', 'attribution', 'results', 'reach', 'impressions', 'frequency', 'cpr', 'spend', 'roas', 'ends'] },
  {
    id: 'performance_clicks', label: 'Performance and clicks',
    columns: ['delivery', 'budget', 'results', 'reach', 'impressions', 'frequency', 'cpr', 'spend', 'cpm', 'link_clicks', 'cpc_link', 'ctr_link', 'clicks_all', 'ctr_all', 'cpc_all'],
  },
  {
    id: 'video', label: 'Video engagement',
    columns: ['delivery', 'spend', 'impressions', 'reach', 'video_3s', 'cost_per_3s', 'thruplays', 'cost_per_thruplay', 'hook_rate', 'hold_rate', 'v25', 'v50', 'v75', 'v100', 'avg_play_time'],
  },
  {
    id: 'engagement', label: 'Engagement',
    columns: ['delivery', 'spend', 'impressions', 'post_engagement', 'reactions', 'comments', 'shares', 'cost_per_engagement', 'link_clicks', 'ctr_link'],
  },
  {
    id: 'ecom', label: 'Ecom custom',
    columns: ['delivery', 'budget', 'spend', 'cpm', 'ctr_link', 'cpc_link', 'hook_rate', 'hold_rate', 'atc', 'cost_per_atc', 'purchases', 'cpa', 'roas', 'be_roas', 'frequency'],
  },
]
export const RANKING_COLUMNS = ['quality_ranking', 'engagement_ranking', 'conversion_ranking']

/** Columns to show for a preset at a level (Meta adds relevance diagnostics to Performance on the Ads tab). */
export function effectiveColumns(presetId: string, columns: string[], level: AdLevel): string[] {
  let cols = columns.length ? columns : BUILTIN_PRESETS[0].columns
  if (presetId === 'performance' && level === 'ad') cols = [...cols, ...RANKING_COLUMNS]
  const seen = new Set<string>()
  return ['delivery', ...cols].filter(id => METRIC_BY_ID.has(id) && !seen.has(id) && (seen.add(id), true))
}

/** Sum rows into one totals row (ratios are recomputed on the sums, like Ads Manager). */
export function totalsRow(rows: Row[]): StatRow {
  const st = emptyStats()
  for (const r of rows) addStats(st, r.st)
  const kinds = new Set(rows.map(r => r.resultKind).filter(k => k !== 'none'))
  return {
    st,
    playSec: rows.reduce((a, r) => a + r.playSec, 0),
    vidImps: rows.reduce((a, r) => a + r.vidImps, 0),
    products: [...new Set(rows.flatMap(r => r.products))],
    resultKind: kinds.size === 0 ? 'purchase' : kinds.size > 1 ? 'mixed' : (kinds.values().next().value as ResultKind),
  }
}

/** Footer sub-labels in Ads Manager style. */
export const TOTAL_SUB: Record<string, string> = {
  reach: 'Accounts Center accounts',
  impressions: 'Total',
  frequency: 'Per Accounts Center account',
  spend: 'Total spent',
  roas: 'Average',
  cpm: 'Per 1,000 impressions',
  cpc_link: 'Per action',
  ctr_link: 'Per impression',
  link_clicks: 'Total',
  clicks_all: 'Total',
  ctr_all: 'Per impression',
  cpc_all: 'Per click',
  video_3s: 'Total',
  thruplays: 'Total',
  hook_rate: 'Per impression',
  hold_rate: 'Per 3-second play',
  atc: 'Total',
  purchases: 'Total',
  cpa: 'Per action',
  cost_per_atc: 'Per action',
  purchase_value: 'Total',
  lpv: 'Total',
  avg_play_time: 'Per play',
}
