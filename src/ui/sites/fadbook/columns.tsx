// Builds AmTable columns for the Fadbook campaigns / ad sets / ads tables from the metric catalog.
import type { ReactNode } from 'react'
import { ChartColumn, Copy, Pencil, RotateCcw } from 'lucide-react'
import type { Ad, AdLevel, AdSet, Campaign, GameState } from '../../../core/types'
import { deliveryLabel, learningProgress } from '../../../sim/ads'
import { AmNameCell, MetricCell, StatusCell, amFmt, type AmColumn, type AmRowAction, type DeliveryTone } from '../../kit/adsmanager'
import { ImageWithFallback } from '../../kit/common'
import { FbBudgetCell } from './BudgetEdit'
import type { AccountData, Row } from './data'
import {
  METRIC_BY_ID, TOTAL_SUB, conversionRanking, engagementRanking, qualityRanking, totalsRow, type MetricDef, type StatRow,
} from './metrics'

export interface ColumnCtx {
  s: GameState
  level: AdLevel
  d: AccountData
  onDrill: (row: Row) => void
  onEdit: (row: Row, tab?: 'edit' | 'charts') => void
  onDuplicate: (row: Row) => void
  onRequestReview: (adId: string) => void
  onBudget: (level: 'campaign' | 'adset', id: string, next: number) => void
  nameHeader: string
}

/** Delivery label + tone for an entity, with Fadbook's "Account restricted" wording. */
export function deliveryFor(s: GameState, level: AdLevel, id: string, d: AccountData): { label: string; tone?: DeliveryTone; detail?: string; progress?: number } {
  const dl = deliveryLabel(s, level, id)
  let label = dl.label
  let tone: DeliveryTone | undefined
  if (label === 'Account disabled') {
    const campId = level === 'campaign' ? id : level === 'adset' ? d.adSetById.get(id)?.campaignId : d.ads.find(a => a.id === id)?.campaignId
    const acc = s.ads.accounts.find(a => a.id === d.campaignById.get(campId ?? '')?.accountId)
    if (acc?.status === 'restricted') label = 'Account restricted'
    tone = 'error'
  }
  let progress: number | undefined
  let detail = dl.detail
  if (level === 'adset' && (label === 'Learning' || label === 'Learning limited')) {
    const lp = learningProgress(s, id)
    if (lp) {
      progress = label === 'Learning' ? Math.min(1, lp.conversions / Math.max(1, lp.needed)) : undefined
      detail = lp.hasPixel
        ? `${lp.conversions} of ${lp.needed} ${d.adSetById.get(id)?.optimization === 'add_to_cart' ? 'adds to cart' : 'purchases'} in the last 7 days. ${label === 'Learning' ? 'Avoid significant edits while delivery optimizes.' : 'Not enough conversions to exit learning: consider consolidating ad sets or raising the budget.'}`
        : 'No pixel events: without purchase data delivery can\'t optimize or exit learning. Connect the Fadbook & Instaglam app in Shopifly.'
    }
  }
  return { label, tone, detail, progress }
}

function bidText(c: Campaign | undefined): { value: string; sub?: string } {
  if (!c) return { value: amFmt.dash }
  if (c.bidStrategy === 'cost_cap') return { value: 'Cost per result goal', sub: c.costCap ? amFmt.money(c.costCap) : undefined }
  return { value: 'Highest volume' }
}

function settingCell(m: MetricDef, row: Row, ctx: ColumnCtx): ReactNode {
  const { s, d } = ctx
  if (row.slice) {
    if (m.id === 'quality_ranking') return <span className="fb-cell-text">{qualityRanking(row)}</span>
    if (m.id === 'engagement_ranking') return <span className="fb-cell-text">{engagementRanking(row)}</span>
    if (m.id === 'conversion_ranking') return <span className="fb-cell-text">{conversionRanking(row)}</span>
    return null
  }
  switch (m.id) {
    case 'delivery': {
      const dl = deliveryFor(s, row.level, row.id, d)
      return <StatusCell label={dl.label} tone={dl.tone} progress={dl.progress} tooltip={dl.detail} />
    }
    case 'bid': {
      if (row.level === 'ad') return <span className="fb-cell-sub">Using ad set bid strategy</span>
      const c = row.level === 'campaign' ? (row.entity as Campaign) : d.campaignById.get((row.entity as AdSet).campaignId)
      if (row.level === 'adset' && c?.budgetMode === 'cbo') return <span className="fb-cell-sub">Using campaign bid strategy</span>
      const b = bidText(c)
      return <MetricCell align="left" value={b.value} sub={b.sub} />
    }
    case 'budget': {
      if (row.level === 'campaign') {
        const c = row.entity as Campaign
        if (c.budgetMode !== 'cbo' || c.dailyBudget == null) return <span className="fb-cell-sub">Using ad set budget</span>
        const n = d.adSets.filter(x => x.campaignId === c.id).length
        return <FbBudgetCell level="campaign" id={c.id} amount={c.dailyBudget} adSetCount={Math.max(1, n)} onSave={v => ctx.onBudget('campaign', c.id, v)} />
      }
      if (row.level === 'adset') {
        const set = row.entity as AdSet
        const c = d.campaignById.get(set.campaignId)
        if (c?.budgetMode === 'cbo' || set.dailyBudget == null) return <span className="fb-cell-sub">Using campaign budget</span>
        return <FbBudgetCell level="adset" id={set.id} amount={set.dailyBudget} onSave={v => ctx.onBudget('adset', set.id, v)} />
      }
      const ad = row.entity as Ad
      const c = d.campaignById.get(ad.campaignId)
      return <span className="fb-cell-sub">{c?.budgetMode === 'cbo' ? 'Using campaign budget' : 'Using ad set budget'}</span>
    }
    case 'attribution':
      return <span className="fb-cell-text">7-day click or 1-day view</span>
    case 'ends':
      return <span className="fb-cell-text">Ongoing</span>
    case 'quality_ranking':
      return <span className="fb-cell-text">{row.level === 'ad' ? qualityRanking(row) : amFmt.dash}</span>
    case 'engagement_ranking':
      return <span className="fb-cell-text">{row.level === 'ad' ? engagementRanking(row) : amFmt.dash}</span>
    case 'conversion_ranking':
      return <span className="fb-cell-text">{row.level === 'ad' ? conversionRanking(row) : amFmt.dash}</span>
  }
  return null
}

function sortSetting(m: MetricDef, row: Row, ctx: ColumnCtx): string | number | null {
  switch (m.id) {
    case 'delivery': return deliveryFor(ctx.s, row.level, row.id, ctx.d).label
    case 'budget': {
      if (row.level === 'campaign') return (row.entity as Campaign).dailyBudget ?? null
      if (row.level === 'adset') return (row.entity as AdSet).dailyBudget ?? null
      return null
    }
    case 'bid': return row.level === 'campaign' ? bidText(row.entity as Campaign).value : null
    default: return null
  }
}

function metricTotal(m: MetricDef, rows: Row[], s: GameState): ReactNode {
  if (!m.value) return null
  const t: StatRow = totalsRow(rows)
  const v = m.value(t, s)
  let sub: string | undefined = TOTAL_SUB[m.id]
  if (m.id === 'results' || m.id === 'cpr') sub = m.sub?.(t)
  if (m.id === 'be_roas') return null
  return <MetricCell value={(m.format ?? amFmt.int)(v)} sub={sub} />
}

function nameColumn(ctx: ColumnCtx): AmColumn<Row> {
  const { level } = ctx
  return {
    id: 'name',
    header: ctx.nameHeader,
    width: 280,
    minWidth: 180,
    sticky: true,
    sortValue: r => r.name.toLowerCase(),
    render: row => {
      if (row.slice) return <span className="fb-slice">{row.slice}</span>
      let leading: ReactNode
      let sub: ReactNode
      if (level === 'ad') {
        const ad = row.entity as Ad
        const cr = ctx.d.creatives.get(ad.creativeId)
        leading = (
          <ImageWithFallback src={cr?.thumb} alt={cr?.name ?? ad.name} width={32} height={32} radius={4} fallbackLabel={ad.name} />
        )
      }
      if (level === 'campaign' && (row.entity as Campaign).kind === 'advantage') sub = 'Advantage+ shopping campaign'
      return <AmNameCell name={row.name} sub={sub} leading={leading} onClick={() => ctx.onDrill(row)} />
    },
    hoverActions: row => {
      if (row.slice) return []
      const acts: AmRowAction[] = [
        { label: 'View charts', icon: ChartColumn, onClick: () => ctx.onEdit(row, 'charts') },
        { label: 'Edit', icon: Pencil, onClick: () => ctx.onEdit(row, 'edit') },
        { label: 'Duplicate', icon: Copy, onClick: () => ctx.onDuplicate(row) },
      ]
      if (row.level === 'ad' && (row.entity as Ad).review === 'rejected') {
        acts.push({ label: 'Request review', icon: RotateCcw, onClick: () => ctx.onRequestReview(row.id) })
      }
      return acts
    },
  }
}

/** AmTable columns for the given metric ids. */
export function buildColumns(ids: string[], ctx: ColumnCtx): AmColumn<Row>[] {
  const cols: AmColumn<Row>[] = [nameColumn(ctx)]
  for (const id of ids) {
    const m = METRIC_BY_ID.get(id)
    if (!m) continue
    if (m.setting) {
      cols.push({
        id: m.id,
        header: m.header ?? m.label,
        headerTip: m.description,
        width: m.width,
        align: m.id === 'budget' ? 'right' : 'left',
        sortValue: row => sortSetting(m, row, ctx),
        render: row => settingCell(m, row, ctx),
      })
      continue
    }
    const fmt = m.format ?? amFmt.int
    cols.push({
      id: m.id,
      header: m.custom ? <span className="fb-custom-h">{m.header ?? m.label}</span> : (m.header ?? m.label),
      headerTip: m.description,
      width: m.width,
      align: 'right',
      sortValue: row => m.value?.(row, ctx.s) ?? null,
      render: row => {
        const v = m.value?.(row, ctx.s) ?? null
        return <MetricCell value={fmt(v)} sub={m.sub?.(row)} />
      },
      total: rows => metricTotal(m, rows, ctx.s),
    })
  }
  return cols
}
