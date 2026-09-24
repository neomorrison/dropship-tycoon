// Campaign management: Campaign / Ad group / Ad tabs, status filter, search, date range, custom
// columns, breakdown by day/week, inline budgets & on/off toggles, bulk actions, edit drawer.
import { useEffect, useMemo, useState } from 'react'
import { ChartLine, Copy, Eye, Pencil, Plus, Power, PowerOff, Trash2, X } from 'lucide-react'
import type { AdLevel, EntityStatus, GameState } from '../../../../core/types'
import { act } from '../../../../core/store'
import { formatDate } from '../../../../core/time'
import { addStats, duplicateEntity, emptyStats, setEntityStatus, updateAdSet, updateCampaign } from '../../../../sim/ads'
import { BENCHMARKS } from '../../../../data/benchmarks'
import {
  AmButton, AmCheckbox, AmDateRangePicker, AmMenu, AmModal, AmNameCell, AmNotice, AmSearch, AmSelect, AmTable, BreakdownMenu, BudgetCell, ColumnsMenu,
  EntityTabs, MetricCell, StatusCell, Toggle, amFmt, type AmColumn, type AmColumnDef, type AmColumnPreset,
} from '../../../kit/adsmanager'
import { LineChartCard, CHART_COLORS } from '../../../kit/charts'
import { ImageWithFallback, cx } from '../../../kit/common'
import { AccountBanners, EmptyBlock, Panel, useAccount, useGame, useToday, useTt } from '../common'
import { useStoredRange, useTtUi, ttUi, type StatusFilter } from '../uiState'
import {
  DEFAULT_COLUMNS, METRICS, accountData, bidLabel, breakEvenFor, buildRows, dailySeries, entityDisplayId, optimizationLabel,
  type AccountData, type Bundle, type EntityRow, type MetricId,
} from '../data'
import { targetingSummary } from './create/Targeting'
import { creativeThumb } from './create/Pickers'
import { EditDrawer, type DrawerTarget } from './EditDrawer'

type ColId = MetricId | 'status' | 'budget' | 'bid' | 'optimization' | 'beCpa' | 'beRoas'

const ATTR_COLUMNS: AmColumnDef[] = [
  { id: 'status', label: 'Status', category: 'Attribute settings', description: 'Delivery status of the campaign, ad group or ad.' },
  { id: 'budget', label: 'Budget', category: 'Attribute settings', description: 'Daily budget. Campaign budget optimization sets it at the campaign level.' },
  { id: 'bid', label: 'Bid strategy', category: 'Attribute settings', description: 'Maximum delivery (lowest cost) or cost cap.' },
  { id: 'optimization', label: 'Optimization goal', category: 'Attribute settings', description: 'The event delivery optimizes for.' },
]
const STORE_COLUMNS: AmColumnDef[] = [
  { id: 'beCpa', label: 'Break-even CPA (Shopifly)', category: 'Shopifly', description: 'Price minus product, shipping and payment fees for the landing product. Pay more than this per purchase and you lose money.' },
  { id: 'beRoas', label: 'Break-even ROAS (Shopifly)', category: 'Shopifly', description: 'Price ÷ margin for the landing product. ROAS below this loses money (before other costs).' },
]
const ALL_COLUMNS: AmColumnDef[] = [
  ...ATTR_COLUMNS,
  ...(Object.values(METRICS).map(m => ({ id: m.id, label: m.label, category: m.category, description: m.description }))),
  ...STORE_COLUMNS,
]
const BUILTIN_PRESETS: AmColumnPreset[] = [
  { id: 'default', label: 'Default', columns: ['status', 'budget', ...DEFAULT_COLUMNS] },
  { id: 'delivery', label: 'Delivery', columns: ['status', 'budget', 'cost', 'reach', 'impressions', 'frequency', 'cpm', 'cpc'] },
  { id: 'video', label: 'Video play', columns: ['status', 'budget', 'cost', 'impressions', 'v2s', 'v6s', 'v25', 'v50', 'v75', 'v100', 'likes', 'comments', 'shares'] },
  { id: 'conversion', label: 'Conversion', columns: ['status', 'budget', 'cost', 'clicks', 'lpv', 'atc', 'cpatc', 'checkouts', 'purchases', 'cppurchase', 'value', 'aov', 'roas'] },
]

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all_but_deleted', label: 'All (except deleted)' },
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Delivering' },
  { value: 'learning', label: 'Learning' },
  { value: 'limited', label: 'Learning limited' },
  { value: 'not_delivering', label: 'Not delivering' },
  { value: 'in_review', label: 'In review' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'deleted', label: 'Deleted' },
]

const LEVEL_PATH: Record<AdLevel, string> = { campaign: 'campaign', adset: 'campaign/adgroup', ad: 'campaign/ad' }
const LEVEL_NOUN: Record<AdLevel, { singular: string; plural: string }> = {
  campaign: { singular: 'campaign', plural: 'campaigns' },
  adset: { singular: 'ad group', plural: 'ad groups' },
  ad: { singular: 'ad', plural: 'ads' },
}

function matchesStatus(r: EntityRow, f: StatusFilter): boolean {
  const l = r.delivery.label
  switch (f) {
    case 'all': return true
    case 'all_but_deleted': return r.status !== 'deleted'
    case 'deleted': return r.status === 'deleted'
    case 'inactive': return r.status === 'paused'
    case 'active': return r.status === 'active' && (l === 'Active' || l === 'Learning' || l === 'Learning limited')
    case 'learning': return l === 'Learning'
    case 'limited': return l === 'Learning limited'
    case 'not_delivering': return r.status !== 'deleted' && l === 'Not delivering'
    case 'in_review': return l === 'In review'
    case 'rejected': return l === 'Rejected'
  }
}

const sumRows = (rows: EntityRow[]): Bundle => {
  const b: Bundle = { stats: emptyStats(), conv: 0 }
  for (const r of rows) { addStats(b.stats, r.b.stats); b.conv += r.b.conv }
  return b
}

function purchaseOptimized(s: GameState, r: EntityRow): boolean {
  if (r.adSet) return r.adSet.optimization === 'purchase'
  return s.ads.adSets.filter(x => x.campaignId === r.campaign.id && x.status !== 'deleted').every(x => x.optimization === 'purchase')
}

/** Weekly breakdown rows (weeks ending on the range's last day). */
function weeklyRows(s: GameState, data: AccountData, row: EntityRow, from: number, to: number): EntityRow[] {
  const ads = row.level === 'ad' ? data.ads.filter(a => a.id === row.id) : row.level === 'adset' ? data.ads.filter(a => a.adSetId === row.id) : data.ads.filter(a => a.campaignId === row.id)
  const days = dailySeries(s, ads, { from, to })
  const out: EntityRow[] = []
  for (let end = days.length - 1; end >= 0; end -= 7) {
    const chunk = days.slice(Math.max(0, end - 6), end + 1)
    const b: Bundle = { stats: emptyStats(), conv: 0 }
    for (const d of chunk) { addStats(b.stats, d.b.stats); b.conv += d.b.conv }
    if (b.stats.impressions <= 0 && b.stats.spend <= 0) continue
    const a = chunk[0].day
    const z = chunk[chunk.length - 1].day
    out.push({ ...row, key: `${row.key}::w${a}`, b, day: a, name: `${formatDate(a, 'md')} – ${formatDate(z, 'md')}` })
  }
  return out
}

export default function Campaigns({ level: routeLevel }: { level?: AdLevel }) {
  const s = useGame()
  const today = useToday()
  const { navigate, compact } = useTt()
  const { account } = useAccount()
  const acc = account!
  const ui = useTtUi()
  const level: AdLevel = routeLevel ?? ui.level
  const [range, setRange] = useStoredRange('campaign', today, 'today')
  const r = range.range
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickParent, setPickParent] = useState(false)

  useEffect(() => {
    if (routeLevel && routeLevel !== ttUi().level) ttUi().set({ level: routeLevel })
  }, [routeLevel])
  // take the one-shot "submitted" message into local state so it shows once, then clear it
  const [flash, setFlash] = useState<string | null>(() => ttUi().flash)
  useEffect(() => { if (ttUi().flash) ttUi().set({ flash: null }) }, [])

  const data = useMemo(() => accountData(s, acc.id, r), [s.ads, acc.id, r.from, r.to]) // stats only depend on ads
  const sel = ui.selected

  // ---- rows per level with parent-selection filtering ----
  const rowsFor = (lv: AdLevel): EntityRow[] => {
    let rows = buildRows(s, data, lv)
    if (lv === 'adset' && sel.campaign.length) rows = rows.filter(x => sel.campaign.includes(x.campaign.id))
    if (lv === 'ad') {
      if (sel.adset.length) rows = rows.filter(x => x.adSet && sel.adset.includes(x.adSet.id))
      else if (sel.campaign.length) rows = rows.filter(x => sel.campaign.includes(x.campaign.id))
    }
    return rows
  }
  const allRows = rowsFor(level)
  const q = ui.search.trim().toLowerCase()
  const rows = allRows.filter(x => matchesStatus(x, ui.statusFilter) && (!q || x.name.toLowerCase().includes(q) || entityDisplayId(x.id).includes(q) || x.id.toLowerCase() === q))
  const counts = {
    campaign: data.campaigns.filter(c => c.status !== 'deleted').length,
    adset: rowsFor('adset').filter(x => x.status !== 'deleted').length,
    ad: rowsFor('ad').filter(x => x.status !== 'deleted').length,
  }
  const visibleIds = new Set(rows.map(x => x.id))
  const selectedHere = sel[level].filter(id => visibleIds.has(id))
  const setSel = (lv: AdLevel, ids: string[]) => {
    const next = { ...ttUi().selected, [lv]: ids }
    // selecting in a parent tab resets narrower selections
    if (lv === 'campaign') { next.adset = []; next.ad = [] }
    if (lv === 'adset') next.ad = []
    ttUi().set({ selected: next })
  }
  const goLevel = (lv: AdLevel) => {
    ttUi().set({ level: lv })
    navigate(LEVEL_PATH[lv])
  }
  const drill = (row: EntityRow) => {
    if (row.level === 'campaign') { setSel('campaign', [row.id]); goLevel('adset') }
    else if (row.level === 'adset') { ttUi().set({ selected: { ...ttUi().selected, adset: [row.id], ad: [] } }); goLevel('ad') }
    else setDrawer({ level: 'ad', id: row.id, tab: 'settings' })
  }

  // ---- columns ----
  const presets: AmColumnPreset[] = [...BUILTIN_PRESETS, ...ui.customPresets.map(p => ({ ...p, custom: true }))]
  const presetCols = presets.find(p => p.id === ui.columnsPreset)?.columns
  const colIds = (ui.columns ?? presetCols ?? BUILTIN_PRESETS[0].columns).filter(id => ALL_COLUMNS.some(c => c.id === id)) as ColId[]
  const beCache = new Map<string | null, ReturnType<typeof breakEvenFor>>()
  const beOf = (row: EntityRow) => {
    if (!beCache.has(row.productId)) beCache.set(row.productId, breakEvenFor(s, row.productId))
    return beCache.get(row.productId) ?? null
  }
  const tone = (id: MetricId, row: EntityRow): 'good' | 'bad' | undefined => {
    if (!ui.beHighlight || row.b.stats.spend <= 0) return undefined
    const be = beOf(row)
    if (!be) return undefined
    const v = METRICS[id].value(row.b)
    if (v === null) return undefined
    if (id === 'roas') return v >= be.roas ? 'good' : 'bad'
    if (id === 'cppurchase' || (id === 'cpa' && purchaseOptimized(s, row))) return v <= be.cpa ? 'good' : 'bad'
    return undefined
  }
  const isBreak = (row: EntityRow) => row.day !== undefined

  const metricCol = (id: MetricId): AmColumn<EntityRow> => {
    const m = METRICS[id]
    return {
      id, header: m.label, headerTip: m.description, align: 'right', width: Math.max(112, Math.min(240, m.label.length * 7.4 + 58)),
      sortValue: row => m.value(row.b),
      render: row => <MetricCell value={m.format(m.value(row.b))} tone={isBreak(row) ? undefined : tone(id, row)} />,
      total: rs => <MetricCell value={m.format(m.value(sumRows(rs)))} />,
    }
  }
  const budgetCol: AmColumn<EntityRow> = {
    id: 'budget', header: 'Budget', width: 150, align: 'right',
    sortValue: row => (row.level === 'campaign' ? row.campaign.dailyBudget : row.level === 'adset' ? row.adSet?.dailyBudget ?? row.campaign.dailyBudget : null) ?? null,
    render: row => {
      if (isBreak(row)) return null
      const c = row.campaign
      const deleted = row.status === 'deleted'
      if (row.level === 'campaign') {
        if (c.budgetMode !== 'cbo') return <span className="am-budget"><span className="am-budget-parent">Ad group budget</span></span>
        const learning = s.ads.adSets.some(x => x.campaignId === c.id && x.status === 'active' && x.learning.state === 'learning')
        return (
          <BudgetCell amount={c.dailyBudget} level="campaign" editable={!deleted} lockedReason={deleted ? 'Deleted campaigns can\'t be edited.' : undefined}
            learningResetThreshold={learning ? BENCHMARKS.tiktak.maxBudgetIncreaseInLearning : BENCHMARKS.tiktak.significantBudgetChange}
            onChange={v => act(st => updateCampaign(st, c.id, { dailyBudget: v }))} />
        )
      }
      if (row.level === 'adset' && row.adSet) {
        if (c.budgetMode === 'cbo') return <BudgetCell amount={null} usingParent="campaign" />
        const set = row.adSet
        return (
          <BudgetCell amount={set.dailyBudget} level="adset" editable={!deleted} lockedReason={deleted ? 'Deleted ad groups can\'t be edited.' : undefined}
            learningResetThreshold={set.learning.state === 'learning' ? BENCHMARKS.tiktak.maxBudgetIncreaseInLearning : BENCHMARKS.tiktak.significantBudgetChange}
            warnLearning={set.impressions > 0}
            onChange={v => act(st => updateAdSet(st, set.id, { dailyBudget: v }))} />
        )
      }
      return <BudgetCell amount={null} usingParent="ad group" />
    },
  }
  const statusCol: AmColumn<EntityRow> = {
    id: 'status', header: 'Status', width: 170,
    sortValue: row => row.delivery.label,
    render: row => {
      if (isBreak(row)) return null
      const d = row.delivery
      if (row.learning && (d.label === 'Learning' || d.label === 'Learning limited')) {
        return <StatusCell label={d.label} detail={`${row.learning.conversions}/${row.learning.needed} conversions`} progress={row.learning.conversions / row.learning.needed} tooltip={d.detail} />
      }
      const detail = d.label === 'Not delivering' || d.label === 'Rejected' ? d.detail : undefined
      return <StatusCell label={d.label} detail={detail ? (detail.length > 42 ? `${detail.slice(0, 40)}…` : detail) : undefined} tooltip={d.detail} />
    },
  }
  const attrCol = (id: 'bid' | 'optimization'): AmColumn<EntityRow> => ({
    id, header: id === 'bid' ? 'Bid strategy' : 'Optimization goal', width: 150,
    render: row => isBreak(row) ? null : (
      <span className="am-cell-clip" style={{ fontSize: 12 }}>
        {id === 'bid' ? bidLabel(row.campaign) : row.adSet ? optimizationLabel(row.adSet) : 'Conversion'}
      </span>
    ),
  })
  const beCol = (id: 'beCpa' | 'beRoas'): AmColumn<EntityRow> => ({
    id, header: id === 'beCpa' ? 'Break-even CPA (Shopifly)' : 'Break-even ROAS (Shopifly)', align: 'right', width: 190,
    headerTip: STORE_COLUMNS.find(c => c.id === id)!.description,
    sortValue: row => { const be = beOf(row); return be ? (id === 'beCpa' ? be.cpa : be.roas) : null },
    render: row => {
      if (isBreak(row)) return null
      const be = beOf(row)
      return <MetricCell value={be ? (id === 'beCpa' ? amFmt.money(be.cpa) : be.roas.toFixed(2)) : amFmt.dash} sub={be ? be.product.title : undefined} />
    },
  })
  const nameCol: AmColumn<EntityRow> = {
    id: 'name', header: level === 'campaign' ? 'Campaign name' : level === 'adset' ? 'Ad group name' : 'Ad name', width: compact ? 200 : 290, sticky: true,
    sortValue: row => row.name,
    render: row => {
      if (isBreak(row)) return <span className="tt-num" style={{ fontSize: 12, color: 'var(--am-text-2)' }}>{row.name}</span>
      const cr = row.ad ? s.creatives.creatives.find(c => c.id === row.ad!.creativeId) : undefined
      const sub = row.level === 'campaign'
        ? `${row.campaign.kind === 'advantage' ? 'Smart+' : 'Manual'} · Web conversions`
        : row.level === 'adset' && row.adSet
          ? `${optimizationLabel(row.adSet)} · ${targetingSummary(s, row.adSet.targeting)}`
          : `${row.ad?.sparkPostId ? 'Spark Ad · ' : ''}${cr ? cr.name : 'Video'}`
      return (
        <AmNameCell
          name={row.name}
          sub={sub}
          onClick={() => drill(row)}
          leading={row.ad && cr ? <ImageWithFallback src={creativeThumb(cr)} alt={cr.name} width={28} height={38} radius={3} fallbackEmoji="🎬" /> : undefined}
        />
      )
    },
    hoverActions: row => row.status === 'deleted' ? [{ label: 'View data', icon: ChartLine, onClick: () => setDrawer({ level: row.level, id: row.id, tab: 'data' }) }] : [
      { label: 'Edit', icon: Pencil, onClick: () => setDrawer({ level: row.level, id: row.id, tab: 'settings' }) },
      { label: 'Duplicate', icon: Copy, onClick: () => act(st => { duplicateEntity(st, row.level, row.id) }) },
      { label: row.level === 'ad' ? 'Preview' : 'View data', icon: row.level === 'ad' ? Eye : ChartLine, onClick: () => setDrawer({ level: row.level, id: row.id, tab: row.level === 'ad' ? 'settings' : 'data' }) },
    ],
  }
  const columns: AmColumn<EntityRow>[] = [nameCol]
  for (const id of colIds) {
    if (id === 'status') columns.push(statusCol)
    else if (id === 'budget') columns.push(budgetCol)
    else if (id === 'bid' || id === 'optimization') columns.push(attrCol(id))
    else if (id === 'beCpa' || id === 'beRoas') columns.push(beCol(id))
    else if (id in METRICS) columns.push(metricCol(id as MetricId))
  }
  if (!colIds.includes('status')) columns.splice(1, 0, statusCol)

  // ---- actions ----
  const setStatus = (ids: string[], status: EntityStatus) => act(st => { for (const id of ids) setEntityStatus(st, level, id, status) })
  const duplicate = (ids: string[]) => act(st => { for (const id of ids) duplicateEntity(st, level, id) })
  const breakdown = ui.breakdown
  const subRows = breakdown ? (row: EntityRow) => (isBreak(row) ? undefined : breakdown === 'week' ? weeklyRows(s, data, row, r.from, r.to) : breakdownDaily(s, data, row, r.from, r.to)) : undefined

  const createNew = () => {
    if (level === 'campaign') navigate('campaign/create')
    else if (level === 'adset' && sel.campaign.length === 1) navigate(`campaign/create/adgroup/${sel.campaign[0]}`)
    else if (level === 'ad' && sel.adset.length === 1) navigate(`campaign/create/ad/${sel.adset[0]}`)
    else setPickParent(true)
  }

  const chartAds = data.ads.filter(a => rows.some(x => (level === 'campaign' ? a.campaignId === x.id : level === 'adset' ? a.adSetId === x.id : a.id === x.id)))
  const chartMetric: MetricId = (ui.chartMetric in METRICS ? ui.chartMetric : 'cost') as MetricId
  const chartSeries = ui.showChart ? dailySeries(s, chartAds, r) : []

  const parentChip = level !== 'campaign' && (sel.campaign.length > 0 || (level === 'ad' && sel.adset.length > 0))
  const parentLabel = level === 'ad' && sel.adset.length
    ? `Ad group: ${sel.adset.length === 1 ? s.ads.adSets.find(x => x.id === sel.adset[0])?.name ?? '1 selected' : `${sel.adset.length} selected`}`
    : `Campaign: ${sel.campaign.length === 1 ? s.ads.campaigns.find(x => x.id === sel.campaign[0])?.name ?? '1 selected' : `${sel.campaign.length} selected`}`

  const noCampaigns = data.campaigns.length === 0

  return (
    <div className="tt-page">
      <div className="tt-page-head">
        <h1 className="tt-page-title">Campaign</h1>
        <div className="tt-page-actions">
          <AmDateRangePicker value={range} onChange={setRange} today={today} size={compact ? 'sm' : 'md'} />
        </div>
      </div>
      <AccountBanners s={s} account={acc} />
      {flash && <AmNotice tone="success" title={flash} onDismiss={() => setFlash(null)} />}

      {noCampaigns ? (
        <Panel>
          <EmptyBlock
            title="Create your first campaign"
            body={`Web conversions campaigns send people from the For You feed to your product page. TikTak needs at least ${amFmt.money(BENCHMARKS.tiktak.minAdGroupDailyBudget)}/day per ad group (${amFmt.money(BENCHMARKS.tiktak.minCampaignDailyBudget)}/day with campaign budget optimization).`}
            action={<AmButton variant="primary" icon={Plus} onClick={() => navigate('campaign/create')}>Create</AmButton>}
          />
        </Panel>
      ) : (
        <>
          <div className="tt-tablecard">
            <div style={{ padding: '0 16px' }}>
              <EntityTabs
                active={level}
                onChange={id => goLevel(id as AdLevel)}
                tabs={[
                  { id: 'campaign', label: 'Campaign', count: counts.campaign, selectedCount: sel.campaign.length, onClearSelection: () => setSel('campaign', []) },
                  { id: 'adset', label: 'Ad group', count: counts.adset, selectedCount: sel.adset.length, onClearSelection: () => setSel('adset', []) },
                  { id: 'ad', label: 'Ad', count: counts.ad, selectedCount: sel.ad.length, onClearSelection: () => setSel('ad', []) },
                ]}
              />
            </div>
            <div className="tt-toolbar-inner" style={{ borderTop: 0 }}>
              {level === 'campaign' ? (
                <AmButton variant="primary" icon={Plus} onClick={createNew}>Create</AmButton>
              ) : (
                <AmMenu
                  width={260}
                  trigger={<AmButton variant="primary" icon={Plus} caret>Create</AmButton>}
                  items={[
                    { id: 'c', label: 'New campaign', description: 'Campaign, ad group and ads', onSelect: () => navigate('campaign/create') },
                    level === 'adset'
                      ? { id: 'g', label: 'Ad group in existing campaign', description: sel.campaign.length === 1 ? s.ads.campaigns.find(c => c.id === sel.campaign[0])?.name : 'Choose a campaign', onSelect: createNew }
                      : { id: 'a', label: 'Ad in existing ad group', description: sel.adset.length === 1 ? s.ads.adSets.find(x => x.id === sel.adset[0])?.name : 'Choose an ad group', onSelect: createNew },
                  ]}
                />
              )}
              <AmButton icon={Pencil} disabled={selectedHere.length !== 1} onClick={() => setDrawer({ level, id: selectedHere[0], tab: 'settings' })}>Edit</AmButton>
              {!compact && <AmButton icon={Copy} disabled={!selectedHere.length} onClick={() => duplicate(selectedHere)}>Duplicate</AmButton>}
              <AmMenu
                width={200}
                disabled={!selectedHere.length}
                trigger={<AmButton caret disabled={!selectedHere.length}>More</AmButton>}
                items={[
                  { id: 'on', label: 'Turn on', icon: Power, onSelect: () => setStatus(selectedHere, 'active') },
                  { id: 'off', label: 'Turn off', icon: PowerOff, onSelect: () => setStatus(selectedHere, 'paused') },
                  ...(compact ? [{ id: 'dup', label: 'Duplicate', icon: Copy, onSelect: () => duplicate(selectedHere) }] : []),
                  { id: 'del', label: 'Delete', icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
                ]}
              />
              <div className="tt-toolbar-right">
                {!compact && (
                  <>
                    <AmButton size="md" pressed={ui.beHighlight} onClick={() => ui.set({ beHighlight: !ui.beHighlight })} title="Color cost per conversion and ROAS against the landing product's break-even from Shopifly">
                      Break-even view
                    </AmButton>
                    <BreakdownMenu
                      value={breakdown}
                      onChange={v => ui.set({ breakdown: v })}
                      sections={[{ title: 'By time', items: [{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }] }]}
                    />
                    <ColumnsMenu
                      presets={presets}
                      allColumns={ALL_COLUMNS}
                      value={{ presetId: ui.columns ? 'custom' : ui.columnsPreset, columns: colIds }}
                      onChange={v => {
                        const isPreset = presets.some(p => p.id === v.presetId)
                        ui.set(isPreset ? { columnsPreset: v.presetId, columns: null } : { columns: v.columns })
                      }}
                      locked={['status']}
                      onSavePreset={(name, cols) => {
                        const id = `custom_${Date.now().toString(36)}`
                        ui.set({ customPresets: [...ui.customPresets, { id, label: name, columns: cols }], columnsPreset: id, columns: null })
                        return id
                      }}
                      onDeletePreset={id => ui.set({ customPresets: ui.customPresets.filter(p => p.id !== id), ...(ui.columnsPreset === id ? { columnsPreset: 'default', columns: null } : {}) })}
                    />
                  </>
                )}
                <AmButton icon={ChartLine} pressed={ui.showChart} onClick={() => ui.set({ showChart: !ui.showChart })} ariaLabel="Show chart">{compact ? undefined : 'Chart'}</AmButton>
              </div>
            </div>
            <div className="tt-toolbar-inner">
              <AmSearch value={ui.search} onChange={v => ui.set({ search: v })} placeholder={`Search ${LEVEL_NOUN[level].singular} name or ID`} width={compact ? '100%' : 280} />
              <AmSelect value={ui.statusFilter} onChange={v => ui.set({ statusFilter: v })} options={STATUS_OPTIONS} width={compact ? '100%' : 210} ariaLabel="Status filter" />
              {parentChip && (
                <span className="am-tag am-tag-teal" style={{ height: 28 }}>
                  <span className="am-tag-text">{parentLabel}</span>
                  <button type="button" className="am-tag-x" aria-label="Clear filter" onClick={() => ttUi().set({ selected: { campaign: [], adset: [], ad: [] } })}><X size={12} strokeWidth={2.5} /></button>
                </span>
              )}
            </div>
            {ui.showChart && (
              <div style={{ padding: '4px 16px 16px', borderTop: '1px solid var(--am-divider-soft)' }}>
                <div className="tt-row" style={{ padding: '10px 0' }}>
                  <AmSelect value={chartMetric} onChange={v => ui.set({ chartMetric: v })} options={(['cost', 'impressions', 'clicks', 'ctr', 'cpm', 'cpc', 'conversions', 'cpa', 'cvr', 'roas', 'frequency'] as MetricId[]).map(x => ({ value: x, label: METRICS[x].label }))} width={240} size="sm" />
                  <span className="tt-faint tt-small">{rows.length} {rows.length === 1 ? LEVEL_NOUN[level].singular : LEVEL_NOUN[level].plural} in view</span>
                </div>
                <LineChartCard
                  bare
                  title={METRICS[chartMetric].label}
                  titleTip={METRICS[chartMetric].description}
                  value={METRICS[chartMetric].value(sumRows(rows.filter(x => !isBreak(x)))) ?? amFmt.dash}
                  format={METRICS[chartMetric].chart}
                  data={chartSeries.map(x => ({ label: formatDate(x.day, 'md'), value: METRICS[chartMetric].value(x.b) }))}
                  color={CHART_COLORS.tiktak}
                  height={compact ? 160 : 200}
                  emptyText="No data for this date range."
                />
              </div>
            )}
            {compact ? (
              <div style={{ padding: 12, borderTop: '1px solid var(--am-divider-soft)', background: 'var(--am-bg)' }}>
                <MobileList rows={rows} level={level} selected={selectedHere} onSelect={ids => setSel(level, ids)} onOpen={row => setDrawer({ level: row.level, id: row.id, tab: 'settings' })} onDrill={drill} />
              </div>
            ) : (
              <AmTable
                attachedTop
                rows={rows}
                columns={columns}
                rowKey={x => x.key}
                selectedIds={selectedHere}
                onSelectionChange={ids => setSel(level, ids)}
                toggle={{
                  isOn: x => x.status === 'active',
                  onChange: (x, on) => act(st => setEntityStatus(st, x.level, x.id, on ? 'active' : 'paused')),
                  disabled: x => x.status === 'deleted',
                }}
                entityName={LEVEL_NOUN[level]}
                rowMuted={x => x.status !== 'active'}
                subRows={subRows}
                defaultSort={{ columnId: 'cost', direction: 'desc' }}
                maxHeight="max(360px, calc(100vh - 380px))"
                emptyState={
                  <div className="tt-col" style={{ alignItems: 'center', gap: 8 }}>
                    <span>No {LEVEL_NOUN[level].plural} match these filters.</span>
                    {(ui.statusFilter !== 'all_but_deleted' || ui.search) && <AmButton size="sm" onClick={() => ui.set({ statusFilter: 'all_but_deleted', search: '' })}>Clear filters</AmButton>}
                  </div>
                }
              />
            )}
          </div>
          <span className="tt-faint tt-small">
            Data from {formatDate(r.from, 'short')}{r.to !== r.from ? ` to ${formatDate(r.to, 'short')}` : ''}. Conversions are reported by the TikTak Pixel (7-day click, 1-day view) and can keep updating for up to 48 hours.
          </span>
        </>
      )}

      <EditDrawer target={drawer} onClose={() => setDrawer(null)} range={r} accountId={acc.id} />

      <AmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        inline
        size="sm"
        title={`Delete ${selectedHere.length} ${selectedHere.length === 1 ? LEVEL_NOUN[level].singular : LEVEL_NOUN[level].plural}?`}
        footer={<><AmButton onClick={() => setConfirmDelete(false)}>Cancel</AmButton><AmButton variant="danger" onClick={() => { setStatus(selectedHere, 'deleted'); setSel(level, []); setConfirmDelete(false) }}>Delete</AmButton></>}
      >
        <span style={{ fontSize: 13 }}>Deleted items stop delivering and can&apos;t be turned back on.{level !== 'ad' ? ' Everything inside them is deleted too.' : ''} Their past data stays in your reports.</span>
      </AmModal>

      <ChooseParent
        open={pickParent}
        onClose={() => setPickParent(false)}
        s={s}
        data={data}
        level={level === 'ad' ? 'ad' : 'adset'}
        onPick={id => { setPickParent(false); navigate(level === 'ad' ? `campaign/create/ad/${id}` : `campaign/create/adgroup/${id}`) }}
      />
    </div>
  )
}

function breakdownDaily(s: GameState, data: AccountData, row: EntityRow, from: number, to: number): EntityRow[] {
  const ads = row.level === 'ad' ? data.ads.filter(a => a.id === row.id) : row.level === 'adset' ? data.ads.filter(a => a.adSetId === row.id) : data.ads.filter(a => a.campaignId === row.id)
  return dailySeries(s, ads, { from, to })
    .filter(x => x.b.stats.impressions > 0 || x.b.stats.spend > 0)
    .reverse()
    .map(x => ({ ...row, key: `${row.key}::${x.day}`, b: x.b, day: x.day, name: formatDate(x.day, 'iso') }))
}

// ---------------------------------------------------------------------------
// Pick the parent for "Create ad group / ad" when nothing (or several) is selected
// ---------------------------------------------------------------------------
function ChooseParent({ open, onClose, s, data, level, onPick }: { open: boolean; onClose: () => void; s: GameState; data: AccountData; level: 'adset' | 'ad'; onPick: (id: string) => void }) {
  const [id, setId] = useState<string | null>(null)
  const options = level === 'adset'
    ? data.campaigns.filter(c => c.status !== 'deleted').map(c => ({ value: c.id, label: c.name, description: `${c.kind === 'advantage' ? 'Smart+' : 'Manual'} · ${c.budgetMode === 'cbo' ? `${amFmt.money(c.dailyBudget)} daily` : 'Ad group budgets'}` }))
    : data.adSets.filter(x => x.status !== 'deleted').map(x => ({ value: x.id, label: x.name, description: data.campaigns.find(c => c.id === x.campaignId)?.name }))
  return (
    <AmModal
      open={open}
      onClose={onClose}
      inline
      size="sm"
      title={level === 'adset' ? 'Choose a campaign' : 'Choose an ad group'}
      footer={<><AmButton onClick={onClose}>Cancel</AmButton><AmButton variant="primary" disabled={!id} onClick={() => id && onPick(id)}>Continue</AmButton></>}
    >
      {options.length ? (
        <AmSelect value={id} onChange={setId} options={options} placeholder={level === 'adset' ? 'Select a campaign' : 'Select an ad group'} />
      ) : (
        <span style={{ fontSize: 13 }}>There&apos;s nothing to add to yet. Create a campaign first.</span>
      )}
      {level === 'ad' && s.ads.adSets.length > 0 && <p className="tt-faint tt-small" style={{ margin: '10px 0 0' }}>Adding an ad to an ad group that has delivered restarts its learning phase.</p>}
    </AmModal>
  )
}

// ---------------------------------------------------------------------------
// Compact (phone) list
// ---------------------------------------------------------------------------
function MobileList({ rows, level, selected, onSelect, onOpen, onDrill }: {
  rows: EntityRow[]; level: AdLevel; selected: string[]; onSelect: (ids: string[]) => void; onOpen: (r: EntityRow) => void; onDrill: (r: EntityRow) => void
}) {
  if (!rows.length) return <span className="tt-muted tt-small">No {LEVEL_NOUN[level].plural} match these filters.</span>
  const sorted = [...rows].sort((a, b) => b.b.stats.spend - a.b.stats.spend)
  return (
    <div className="tt-cards">
      {sorted.map(row => {
        const on = row.status === 'active'
        const isSel = selected.includes(row.id)
        const budget = row.level === 'campaign' ? (row.campaign.budgetMode === 'cbo' ? amFmt.money(row.campaign.dailyBudget) : 'Ad group budget')
          : row.level === 'adset' ? (row.campaign.budgetMode === 'abo' ? amFmt.money(row.adSet?.dailyBudget) : 'Campaign budget') : ''
        const m = (id: MetricId) => METRICS[id].format(METRICS[id].value(row.b))
        return (
          <div key={row.key} className={cx('tt-card')} style={isSel ? { borderColor: 'var(--am-primary)' } : undefined}>
            <div className="tt-card-head">
              <Toggle checked={on} disabled={row.status === 'deleted'} onChange={v => act(st => setEntityStatus(st, row.level, row.id, v ? 'active' : 'paused'))} ariaLabel="On/off" size="sm" />
              <div className="tt-card-title">
                <button type="button" className="tt-link" style={{ textAlign: 'left', color: 'var(--am-text)', fontWeight: 600, fontSize: 14 }} onClick={() => onDrill(row)}>{row.name}</button>
                <StatusCell label={row.delivery.label} detail={row.learning ? `${row.learning.conversions}/${row.learning.needed} conversions` : undefined} />
              </div>
              <AmCheckbox checked={isSel} ariaLabel={`Select ${row.name}`} onChange={on => onSelect(on ? [...selected, row.id] : selected.filter(x => x !== row.id))} />
            </div>
            <div className="tt-card-metrics">
              <div className="tt-card-metric"><span>Cost</span><b>{m('cost')}</b></div>
              <div className="tt-card-metric"><span>Conversions</span><b>{m('conversions')}</b></div>
              <div className="tt-card-metric"><span>Cost per conv.</span><b>{m('cpa')}</b></div>
              <div className="tt-card-metric"><span>CTR (dest.)</span><b>{m('ctr')}</b></div>
              <div className="tt-card-metric"><span>CPM</span><b>{m('cpm')}</b></div>
              <div className="tt-card-metric"><span>ROAS</span><b>{m('roas')}</b></div>
            </div>
            <div className="tt-card-foot">
              {budget && <span className="tt-faint tt-small" style={{ alignSelf: 'center', marginRight: 'auto' }}>Budget: {budget}</span>}
              {row.status !== 'deleted' && <AmButton size="sm" icon={Pencil} onClick={() => onOpen(row)}>Edit</AmButton>}
              {level !== 'ad' && <AmButton size="sm" onClick={() => onDrill(row)}>{level === 'campaign' ? 'Ad groups' : 'Ads'}</AmButton>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
