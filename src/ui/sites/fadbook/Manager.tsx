// Ads Manager main view: search/filter bar + date range, Campaigns / Ad sets / Ads tabs with
// selection filtering, the toolbar (Create, Duplicate, Edit, A/B test, delete, Rules, Columns,
// Breakdown, Reports), the table (or charts), the edit drawer and the create flow.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ChartColumn, ClipboardCopy, Copy, FlaskConical, ListFilter, Lock, Pencil, Plus, RefreshCw, Table2, Trash, Zap, ChevronRight,
} from 'lucide-react'
import type { AdAccount, AdLevel, GameState } from '../../../core/types'
import { act } from '../../../core/store'
import { dayOf } from '../../../core/time'
import {
  MB_GATES, duplicateEntity, featureUnlocked, requestAdReview, setEntityStatus, updateAdSet, updateCampaign,
} from '../../../sim/ads'
import {
  AmButton, AmButtonGroup, AmDateRangePicker, AmInput, AmMenu, AmModal, AmNotice, AmSearch, AmTable, AmTag, AmTooltip,
  BreakdownMenu, ColumnsMenu, EntityTabs, MetricCell, StatusCell, Toggle, amFmt, type AmColumnPreset,
} from '../../kit/adsmanager'
import { ImageWithFallback, resolvePreset, type DateRangeValue } from '../../kit/common'
import { buildColumns, deliveryFor } from './columns'
import { accountData, breakdownRows, buildRows, resultLabels, resultsOf, type Row } from './data'
import { BUILTIN_PRESETS, METRICS, METRIC_BY_ID, effectiveColumns } from './metrics'
import { ChartsView } from './ChartsView'
import { EditDrawer, type DrawerTarget } from './EditDrawer'
import { CreateChooser, CreateEditor, ObjectiveModal, SetupModal, type CreateStart } from './CreateFlow'
import { AccountNotices, SetupNotices } from './Notices'
import { RuleModal } from './pages/Rules'
import { persistPresets, useFbUI, type FbBreakdown, type FbFilter, type SavedPreset } from './uiStore'
import { FbBudgetCell } from './BudgetEdit'
import type { Ad, AdSet, Campaign } from '../../../core/types'

const FILTERS: { id: FbFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'learning', label: 'Learning' },
  { id: 'learning_limited', label: 'Learning limited' },
  { id: 'off', label: 'Off' },
  { id: 'in_review', label: 'In review' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'not_delivering', label: 'Not delivering' },
  { id: 'had_delivery', label: 'Had delivery' },
]

function matchesFilter(f: FbFilter, label: string, row: Row): boolean {
  switch (f) {
    case 'active': return label === 'Active'
    case 'learning': return label === 'Learning'
    case 'learning_limited': return label === 'Learning limited'
    case 'off': return /\boff\b/i.test(label)
    case 'in_review': return label === 'In review'
    case 'rejected': return label === 'Rejected'
    case 'not_delivering': return label === 'Not delivering' || label.startsWith('Account')
    case 'had_delivery': return row.st.impressions > 0
  }
}

type CreateState =
  | null
  | { step: 'chooser'; options: CreateStart[] }
  | { step: 'objective' }
  | { step: 'setup' }
  | { step: 'editor'; start: CreateStart; kind: 'advantage' | 'manual' }

export interface ManagerProps {
  s: GameState
  acc: AdAccount
  navigate: (p: string) => void
  compact: boolean
  autoCreate?: boolean
  /** with autoCreate: preselect this ready creative in the new ad (deep link 'create/creative/<id>') */
  autoCreativeId?: string
}

export function Manager({ s, acc, navigate, compact, autoCreate, autoCreativeId }: ManagerProps) {
  const ui = useFbUI()
  const today = dayOf(s.time.hour)
  const range = ui.datePreset === 'custom' && ui.customRange ? ui.customRange : resolvePreset(ui.datePreset === 'custom' ? 'maximum' : ui.datePreset, today, 'ads')
  const dateValue: DateRangeValue = { preset: ui.datePreset, range }
  const d = useMemo(() => accountData(s, acc.id), [s.ads, s.creatives.creatives, s.store.products, acc.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => buildRows(d, range), [d, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const level = ui.level
  const sel = ui.sel

  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  const [create, setCreate] = useState<CreateState>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  // the table scrolls inside itself (sticky header/footer): size it to the Ads Manager viewport
  const hostRef = useRef<HTMLDivElement>(null)
  const [mainH, setMainH] = useState(640)
  useEffect(() => {
    const main = hostRef.current?.closest('.fb-main') as HTMLElement | null
    if (!main || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setMainH(main.clientHeight))
    ro.observe(main)
    setMainH(main.clientHeight)
    return () => ro.disconnect()
  }, [])

  // ---- rows in view ----
  const scoped = useMemo(() => {
    const campSel = new Set(sel.campaign)
    const setSel = new Set(sel.adset)
    let rows = all[level]
    if (level === 'adset' && campSel.size) rows = rows.filter(r => campSel.has((r.entity as AdSet).campaignId))
    if (level === 'ad') {
      if (setSel.size) rows = rows.filter(r => setSel.has((r.entity as Ad).adSetId))
      else if (campSel.size) rows = rows.filter(r => campSel.has((r.entity as Ad).campaignId))
    }
    return rows
  }, [all, level, sel.campaign, sel.adset])
  const visible = useMemo(() => {
    const q = ui.query.trim().toLowerCase()
    return scoped.filter(r => {
      if (q && !r.name.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) return false
      if (!ui.filters.length) return true
      const label = deliveryFor(s, r.level, r.id, d).label
      const deliveryFilters = ui.filters.filter(f => f !== 'had_delivery')
      if (ui.filters.includes('had_delivery') && r.st.impressions <= 0) return false
      return !deliveryFilters.length || deliveryFilters.some(f => matchesFilter(f, label, r))
    })
  }, [scoped, ui.query, ui.filters, s, d])
  const breakdown = useMemo(
    () => (ui.breakdown && ui.view === 'table' && !compact ? breakdownRows(d, range, ui.breakdown, level) : null),
    [ui.breakdown, ui.view, compact, d, range.from, range.to, level], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ---- create flow ----
  const openCreate = () => {
    const opts: CreateStart[] = []
    if (level === 'ad' && sel.adset.length === 1) opts.push({ mode: 'ad', adSetId: sel.adset[0] })
    if ((level === 'adset' || level === 'ad') && sel.campaign.length === 1) opts.push({ mode: 'adset', campaignId: sel.campaign[0] })
    if (level === 'ad' && !sel.adset.length && sel.campaign.length === 1) {
      const sets = d.adSets.filter(x => x.campaignId === sel.campaign[0])
      if (sets.length === 1) opts.unshift({ mode: 'ad', adSetId: sets[0].id })
    }
    if (opts.length) setCreate({ step: 'chooser', options: [...opts, { mode: 'new' }] })
    else setCreate({ step: 'objective' })
  }
  const pendingCreative = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (autoCreate && acc.status !== 'restricted' && acc.status !== 'disabled') {
      pendingCreative.current = autoCreativeId
      setCreate({ step: 'objective' })
      navigate('manage/campaigns')
    }
  }, [autoCreate]) // eslint-disable-line react-hooks/exhaustive-deps
  const accountBlocked = acc.status === 'restricted' || acc.status === 'disabled'

  // ---- selection helpers ----
  const setSelection = (lvl: AdLevel, ids: string[]) => {
    const next = { ...sel, [lvl]: ids }
    if (lvl === 'campaign') {
      next.adset = sel.adset.filter(id => ids.includes(d.adSetById.get(id)?.campaignId ?? ''))
      next.ad = sel.ad.filter(id => ids.includes(d.ads.find(a => a.id === id)?.campaignId ?? ''))
    }
    if (lvl === 'adset') next.ad = sel.ad.filter(id => ids.includes(d.ads.find(a => a.id === id)?.adSetId ?? ''))
    ui.set({ sel: next })
  }
  const drill = (row: Row) => {
    if (row.level === 'campaign') ui.set({ level: 'adset', sel: { campaign: [row.id], adset: [], ad: [] } })
    else if (row.level === 'adset') ui.set({ level: 'ad', sel: { campaign: sel.campaign, adset: [row.id], ad: [] } })
    else setDrawer({ level: 'ad', ids: [row.id], tab: 'edit' })
  }
  const selectedHere = sel[level].filter(id => visible.some(r => r.id === id) || all[level].some(r => r.id === id))

  // ---- actions ----
  const onBudget = (lvl: 'campaign' | 'adset', id: string, next: number) => {
    act(g => (lvl === 'campaign' ? updateCampaign(g, id, { dailyBudget: next }) : updateAdSet(g, id, { dailyBudget: next })))
  }
  const duplicate = (ids: string[], copies = 1) => {
    const made: string[] = []
    act(g => {
      for (const id of ids) for (let i = 0; i < copies; i++) {
        const nid = duplicateEntity(g, level, id)
        if (nid) made.push(nid)
      }
    })
    if (made.length) {
      setSelection(level, made)
      setFlash(`${made.length} ${levelWord(level, made.length)} duplicated. Duplicates go through review and start a new learning phase.`)
    }
  }
  const remove = () => {
    const ids = selectedHere
    act(g => { for (const id of ids) setEntityStatus(g, level, id, 'deleted') })
    setSelection(level, [])
    setConfirmDelete(false)
    setFlash(`${ids.length} ${levelWord(level, ids.length)} deleted.`)
  }

  // ---- columns ----
  const presets: AmColumnPreset[] = [...BUILTIN_PRESETS, ...ui.savedPresets]
  const preset = presets.find(p => p.id === ui.columns.presetId)
  const colIds = effectiveColumns(ui.columns.presetId, ui.columns.columns.length ? ui.columns.columns : preset?.columns ?? BUILTIN_PRESETS[0].columns, level)
  const nameHeader = level === 'campaign' ? 'Campaign' : level === 'adset' ? 'Ad set' : 'Ad'
  const columns = buildColumns(colIds, {
    s, level, d, nameHeader,
    onDrill: drill,
    onEdit: (row, tab = 'edit') => setDrawer({ level: row.level, ids: [row.id], tab }),
    onDuplicate: row => duplicate([row.id]),
    onRequestReview: id => act(g => requestAdReview(g, id)),
    onBudget,
  })
  const savePreset = (name: string, cols: string[]) => {
    const id = `saved_${Date.now().toString(36)}`
    const list: SavedPreset[] = [...ui.savedPresets, { id, label: name, columns: cols, custom: true }]
    persistPresets(list)
    ui.set({ savedPresets: list })
    return id
  }
  const deletePreset = (id: string) => {
    const list = ui.savedPresets.filter(p => p.id !== id)
    persistPresets(list)
    ui.set({ savedPresets: list, columns: ui.columns.presetId === id ? { presetId: 'performance', columns: [] } : ui.columns })
  }

  const copyCsv = async () => {
    const heads = ['Name', ...colIds.map(id => METRIC_BY_ID.get(id)?.label ?? id)]
    const lines = [heads, ...visible.map(r => [r.name, ...colIds.map(id => {
      const m = METRIC_BY_ID.get(id)!
      if (m.setting) return id === 'delivery' ? deliveryFor(s, r.level, r.id, d).label : ''
      return (m.format ?? amFmt.int)(m.value?.(r, s) ?? null)
    })])]
    const csv = lines.map(l => l.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
    try {
      await navigator.clipboard.writeText(csv)
      setFlash(`Copied ${visible.length} row${visible.length === 1 ? '' : 's'} to the clipboard as CSV.`)
    } catch {
      setFlash('Your browser blocked clipboard access.')
    }
  }

  const rulesOk = featureUnlocked(s, 'rules')
  const breakdownsOk = featureUnlocked(s, 'breakdowns')
  const nCamp = sel.campaign.length
  const nSet = sel.adset.length
  const tabs = [
    { id: 'campaign', label: 'Campaigns', selectedCount: nCamp, onClearSelection: () => setSelection('campaign', []) },
    { id: 'adset', label: nCamp ? `Ad sets for ${nCamp} Campaign${nCamp > 1 ? 's' : ''}` : 'Ad sets', selectedCount: nSet, onClearSelection: () => setSelection('adset', []) },
    {
      id: 'ad',
      label: nSet ? `Ads for ${nSet} Ad set${nSet > 1 ? 's' : ''}` : nCamp ? `Ads for ${nCamp} Campaign${nCamp > 1 ? 's' : ''}` : 'Ads',
      selectedCount: sel.ad.length, onClearSelection: () => setSelection('ad', []),
    },
  ]
  const chartRows = selectedHere.length ? visible.filter(r => selectedHere.includes(r.id)) : visible
  const entityName = level === 'campaign' ? { singular: 'campaign', plural: 'campaigns' } : level === 'adset' ? { singular: 'ad set', plural: 'ad sets' } : { singular: 'ad', plural: 'ads' }

  const refresh = () => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 700)
  }

  const emptyState = d.campaigns.length === 0 ? (
    <div className="fb-table-empty">
      <strong>You don't have any campaigns yet</strong>
      <span>Create a Sales campaign to start showing ads for your products on Fadbook and Instaglam.</span>
      <AmButton variant="create" icon={Plus} disabled={accountBlocked} onClick={openCreate}>Create</AmButton>
    </div>
  ) : ui.query || ui.filters.length ? (
    <div className="fb-table-empty">
      <strong>No results match your search and filters</strong>
      <AmButton size="sm" onClick={() => ui.set({ query: '', filters: [] })}>Clear search and filters</AmButton>
    </div>
  ) : (
    <div className="fb-table-empty"><strong>No {entityName.plural} here</strong><span>Clear your selection on the previous tab to see all {entityName.plural}.</span></div>
  )

  return (
    <div className="fb-manager" ref={hostRef}>
      <SetupNotices s={s} navigate={navigate} compact={compact} />
      <AccountNotices s={s} acc={acc} navigate={navigate} />
      {flash && <AmNotice tone="success" onDismiss={() => setFlash(null)}>{flash}</AmNotice>}

      <div className="fb-searchbar">
        <div className="fb-searchbar-left">
          <div className="fb-search-grow">
            <AmSearch value={ui.query} onChange={q => ui.set({ query: q })} placeholder="Search and filter" width="100%" />
          </div>
          <AmMenu
            trigger={<AmButton icon={ListFilter} pressed={ui.filters.length > 0}>{compact ? '' : 'Filters'}</AmButton>}
            closeOnSelect={false}
            width={220}
            sections={[
              { title: 'Delivery', items: FILTERS.filter(f => f.id !== 'had_delivery').map(f => ({ id: f.id, label: f.label, checked: ui.filters.includes(f.id), onSelect: () => ui.set({ filters: toggleIn(ui.filters, f.id) }) })) },
              { title: 'Performance', items: [{ id: 'had_delivery', label: 'Had delivery', description: 'Impressions in the selected date range', checked: ui.filters.includes('had_delivery'), onSelect: () => ui.set({ filters: toggleIn(ui.filters, 'had_delivery') }) }] },
            ]}
          />
          {ui.filters.map(f => (
            <AmTag key={f} tone="blue" onRemove={() => ui.set({ filters: ui.filters.filter(x => x !== f) })}>
              {f === 'had_delivery' ? 'Had delivery' : `Delivery: ${FILTERS.find(x => x.id === f)?.label}`}
            </AmTag>
          ))}
        </div>
        <div className="fb-searchbar-right">
          {!compact && (
            <button type="button" className="fb-updated" onClick={refresh} title="Refresh">
              <RefreshCw size={13} className={refreshing ? 'fb-spin' : undefined} /> {refreshing ? 'Updating…' : 'Updated just now'}
            </button>
          )}
          <AmDateRangePicker
            value={dateValue}
            today={today}
            size={compact ? 'sm' : 'md'}
            onChange={v => ui.set({ datePreset: v.preset as typeof ui.datePreset, customRange: v.preset === 'custom' ? v.range : null })}
          />
        </div>
      </div>

      <EntityTabs tabs={tabs} active={level} onChange={id => ui.set({ level: id as AdLevel })} />
      <div className="fb-toolbar">
        <div className="fb-toolbar-left">
          <AmTooltip content={accountBlocked ? 'You can\'t create ads while this account is restricted.' : undefined}>
            <AmButton variant="create" icon={Plus} disabled={accountBlocked} onClick={openCreate}>Create</AmButton>
          </AmTooltip>
          <AmButton icon={Copy} disabled={!selectedHere.length} onClick={() => setDupOpen(true)}>{compact ? '' : 'Duplicate'}</AmButton>
          <AmButton icon={Pencil} disabled={!selectedHere.length} onClick={() => setDrawer({ level, ids: selectedHere, tab: 'edit' })}>{compact ? '' : 'Edit'}</AmButton>
          {!compact && (
            <AmTooltip content="A/B tests need two or more campaigns or ad sets with enough budget and history to compare. Not available for this ad account yet.">
              <AmButton icon={FlaskConical} disabled>A/B test</AmButton>
            </AmTooltip>
          )}
          <AmButton icon={Trash} ariaLabel="Delete" disabled={!selectedHere.length} onClick={() => setConfirmDelete(true)} />
          <AmMenu
            trigger={<AmButton icon={rulesOk ? Zap : Lock} caret>Rules</AmButton>}
            width={260}
            items={[
              { id: 'new', label: 'Create new rule', icon: Plus, disabled: !rulesOk, disabledReason: `Automated rules unlock at Media Buying level ${MB_GATES.rules}.`, onSelect: () => setRuleOpen(true) },
              { id: 'manage', label: 'Manage rules', icon: Zap, disabled: !rulesOk, disabledReason: `Automated rules unlock at Media Buying level ${MB_GATES.rules}.`, onSelect: () => navigate('rules') },
            ]}
          />
        </div>
        <div className="fb-toolbar-right">
          {!compact && (
            <>
              <ColumnsMenu
                presets={presets}
                allColumns={METRICS.map(m => ({ id: m.id, label: m.custom ? `${m.label} (custom)` : m.label, category: m.category, description: m.description }))}
                value={{ presetId: ui.columns.presetId, columns: colIds.filter(id => id !== 'delivery') }}
                onChange={v => ui.set({ columns: { presetId: v.presetId, columns: v.presetId.startsWith('custom') || v.presetId.startsWith('saved_') ? v.columns : [] } })}
                locked={['delivery']}
                onSavePreset={savePreset}
                onDeletePreset={deletePreset}
              />
              <BreakdownMenu
                value={ui.breakdown}
                onChange={b => ui.set({ breakdown: b as FbBreakdown, view: 'table' })}
                sections={[{
                  title: 'By time',
                  items: [
                    { id: 'day', label: 'Day' },
                    { id: 'week', label: 'Week', disabled: !breakdownsOk, disabledReason: `Unlocks at Media Buying level ${MB_GATES.breakdowns}.` },
                    { id: 'month', label: 'Month', disabled: !breakdownsOk, disabledReason: `Unlocks at Media Buying level ${MB_GATES.breakdowns}.` },
                  ],
                }]}
              />
              <AmMenu
                trigger={<AmButton caret>Reports</AmButton>}
                width={240}
                items={[
                  { id: 'charts', label: 'View charts', icon: ChartColumn, onSelect: () => ui.set({ view: 'charts' }) },
                  { id: 'csv', label: 'Copy table data (CSV)', icon: ClipboardCopy, onSelect: () => { void copyCsv() } },
                ]}
              />
            </>
          )}
          <AmButtonGroup>
            <AmButton icon={Table2} pressed={ui.view === 'table'} ariaLabel="Table" onClick={() => ui.set({ view: 'table' })} />
            <AmButton icon={ChartColumn} pressed={ui.view === 'charts'} ariaLabel="Charts" onClick={() => ui.set({ view: 'charts' })} />
          </AmButtonGroup>
        </div>
      </div>

      {ui.view === 'charts' ? (
        <ChartsView s={s} d={d} level={level} rows={chartRows} range={range} narrow={compact} />
      ) : compact ? (
        <MobileList s={s} d={d} rows={visible} level={level} onOpen={row => (row.level === 'ad' ? setDrawer({ level: 'ad', ids: [row.id], tab: 'edit' }) : drill(row))} onBudget={onBudget} emptyState={emptyState} />
      ) : (
        <AmTable<Row>
          attachedTop
          rows={visible}
          columns={columns}
          rowKey={r => r.key}
          entityName={entityName}
          selectedIds={sel[level]}
          onSelectionChange={ids => setSelection(level, ids)}
          toggle={{
            isOn: r => r.entity.status === 'active',
            onChange: (r, on) => act(g => setEntityStatus(g, r.level, r.id, on ? 'active' : 'paused')),
          }}
          defaultSort={{ columnId: 'spend', direction: 'desc' }}
          subRows={breakdown ? r => breakdown.get(r.id) ?? [] : undefined}
          subRowKey={r => r.key}
          rowMuted={r => r.entity.status !== 'active'}
          maxHeight={Math.max(320, mainH - 190)}
          emptyState={emptyState}
        />
      )}

      {/* ---- overlays ---- */}
      <EditDrawer
        s={s}
        d={d}
        target={drawer}
        rows={all[drawer?.level ?? 'campaign']}
        range={range}
        narrow={compact}
        onClose={() => setDrawer(null)}
        onManageAudiences={() => { setDrawer(null); navigate('audiences') }}
      />
      {create?.step === 'chooser' && (
        <CreateChooser
          s={s}
          options={create.options}
          onClose={() => setCreate(null)}
          onPick={o => setCreate(o.mode === 'new' ? { step: 'objective' } : { step: 'editor', start: o, kind: 'manual' })}
        />
      )}
      {create?.step === 'objective' && <ObjectiveModal onClose={() => setCreate(null)} onContinue={() => setCreate({ step: 'setup' })} />}
      {create?.step === 'setup' && (
        <SetupModal s={s} onClose={() => setCreate(null)} onBack={() => setCreate({ step: 'objective' })} onContinue={kind => { const creativeId = pendingCreative.current; pendingCreative.current = undefined; setCreate({ step: 'editor', start: { mode: 'new', creativeId }, kind }) }} />
      )}
      {create?.step === 'editor' && (
        <CreateEditor
          s={s}
          accountId={acc.id}
          start={create.start}
          kind={create.kind}
          onClose={() => setCreate(null)}
          onManageAudiences={() => { setCreate(null); navigate('audiences') }}
          onPublished={ids => {
            setCreate(null)
            if (create.start.mode === 'new' && ids.campaignId) ui.set({ level: 'campaign', sel: { campaign: [ids.campaignId], adset: [], ad: [] } })
            else if (ids.adSetId && create.start.mode === 'adset') ui.set({ level: 'adset', sel: { campaign: sel.campaign, adset: [ids.adSetId], ad: [] } })
            else if (ids.adId) ui.set({ level: 'ad', sel: { ...sel, ad: [ids.adId] } })
            setFlash('Published. Your ad is in review: most ads are reviewed within 24 hours, then delivery starts and enters the learning phase.')
          }}
        />
      )}
      {confirmDelete && (
        <AmModal
          inline
          open
          onClose={() => setConfirmDelete(false)}
          title={`Delete ${selectedHere.length} ${levelWord(level, selectedHere.length)}?`}
          size="sm"
          footer={<><AmButton onClick={() => setConfirmDelete(false)}>Cancel</AmButton><AmButton variant="danger" onClick={remove}>Delete</AmButton></>}
        >
          <p>
            Deleted {entityName.plural} stop delivering and can't be turned back on.{level !== 'ad' && ` Everything inside ${selectedHere.length === 1 ? 'it' : 'them'} is deleted too.`} Past
            results stay in your reports. To pause instead, turn {selectedHere.length === 1 ? 'it' : 'them'} off.
          </p>
        </AmModal>
      )}
      {dupOpen && <DuplicateModal level={level} count={selectedHere.length} onClose={() => setDupOpen(false)} onConfirm={n => { setDupOpen(false); duplicate(selectedHere, n) }} />}
      {ruleOpen && <RuleModal s={s} rule={null} defaultScope={level} targetIds={selectedHere} onClose={() => setRuleOpen(false)} />}
    </div>
  )
}

function toggleIn<T>(list: T[], x: T): T[] {
  return list.includes(x) ? list.filter(y => y !== x) : [...list, x]
}
function levelWord(level: AdLevel, n: number) {
  const w = level === 'campaign' ? 'campaign' : level === 'adset' ? 'ad set' : 'ad'
  return n === 1 ? w : `${w}s`
}

function DuplicateModal({ level, count, onClose, onConfirm }: { level: AdLevel; count: number; onClose: () => void; onConfirm: (copies: number) => void }) {
  const [copies, setCopies] = useState('1')
  const n = Math.max(1, Math.min(5, Math.round(Number(copies) || 1)))
  return (
    <AmModal
      inline
      open
      onClose={onClose}
      title={`Duplicate ${count} ${levelWord(level, count)}`}
      size="sm"
      footer={<><AmButton onClick={onClose}>Cancel</AmButton><AmButton variant="primary" onClick={() => onConfirm(n)}>Duplicate</AmButton></>}
    >
      <div className="fb-stack">
        <p className="fb-small">
          {level === 'ad' ? 'Copies are added to the same ad set. Adding ads to a delivering ad set restarts its learning phase.'
            : level === 'adset' ? 'Copies are added to the same campaign with the same budget, audience and ads. Each copy starts its own learning phase.'
              : 'Copies include every ad set and ad. They start with no history and go through review and learning again.'}
        </p>
        <label className="fb-inline fb-small">
          Number of copies
          <AmInput size="sm" value={copies} onChange={setCopies} type="number" width={80} ariaLabel="Number of copies" />
        </label>
      </div>
    </AmModal>
  )
}

// ---------------------------------------------------------------------------
// Compact (phone) list: Ads Manager app style cards
// ---------------------------------------------------------------------------
function MobileList({ s, d, rows, level, onOpen, onBudget, emptyState }: {
  s: GameState
  d: ReturnType<typeof accountData>
  rows: Row[]
  level: AdLevel
  onOpen: (r: Row) => void
  onBudget: (lvl: 'campaign' | 'adset', id: string, next: number) => void
  emptyState: ReactNode
}) {
  const sorted = [...rows].sort((a, b) => b.st.spend - a.st.spend || a.name.localeCompare(b.name))
  if (!sorted.length) return <div className="fb-mcard">{emptyState}</div>
  return (
    <div className="fb-mlist">
      {sorted.map(r => {
        const dl = deliveryFor(s, r.level, r.id, d)
        const res = resultsOf(r)
        const labels = resultLabels(r.resultKind)
        let budget: ReactNode = null
        if (r.level === 'campaign' && (r.entity as Campaign).budgetMode === 'cbo' && (r.entity as Campaign).dailyBudget != null) {
          const c = r.entity as Campaign
          budget = <FbBudgetCell level="campaign" id={c.id} amount={c.dailyBudget!} adSetCount={Math.max(1, d.adSets.filter(x => x.campaignId === c.id).length)} onSave={v => onBudget('campaign', c.id, v)} />
        } else if (r.level === 'adset' && (r.entity as AdSet).dailyBudget != null && d.campaignById.get((r.entity as AdSet).campaignId)?.budgetMode === 'abo') {
          const set = r.entity as AdSet
          budget = <FbBudgetCell level="adset" id={set.id} amount={set.dailyBudget!} onSave={v => onBudget('adset', set.id, v)} />
        }
        const cr = r.level === 'ad' ? d.creatives.get((r.entity as Ad).creativeId) : undefined
        return (
          <div key={r.key} className="fb-mcard">
            <div className="fb-mcard-head">
              {cr && <ImageWithFallback src={cr.thumb} alt={cr.name} width={40} height={40} radius={6} fallbackLabel={r.name} />}
              <button type="button" className="fb-mcard-name" onClick={() => onOpen(r)}>
                <span>{r.name}</span>
                <ChevronRight size={16} />
              </button>
              <Toggle checked={r.entity.status === 'active'} ariaLabel="On/off" onChange={on => act(g => setEntityStatus(g, r.level, r.id, on ? 'active' : 'paused'))} />
            </div>
            <StatusCell label={dl.label} tone={dl.tone} progress={dl.progress} />
            <div className="fb-mcard-metrics">
              <MetricCell align="left" value={amFmt.int(res)} sub={labels.results} />
              <MetricCell align="left" value={res ? amFmt.money(r.st.spend / res) : amFmt.dash} sub={labels.per} />
              <MetricCell align="left" value={amFmt.money(r.st.spend)} sub="Amount spent" />
              <MetricCell align="left" value={amFmt.roas(r.st.spend ? r.st.purchaseValue / r.st.spend : null)} sub="Purchase ROAS" />
            </div>
            {budget && <div className="fb-mcard-budget"><span className="fb-small fb-muted">{r.level === 'campaign' ? 'Campaign budget' : 'Ad set budget'}</span>{budget}</div>}
          </div>
        )
      })}
      <p className="fb-small fb-muted fb-mfoot">
        {level === 'campaign' ? 'Tap a campaign to see its ad sets.' : level === 'adset' ? 'Tap an ad set to see its ads.' : 'Tap an ad to edit it.'} Selected results use your date range.
      </p>
    </div>
  )
}
