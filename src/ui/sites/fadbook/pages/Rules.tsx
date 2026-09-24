// Automated rules (Media Buying level 4+): rule list with on/off, the create/edit rule dialog and
// the rule activity log. Rules run daily at 9:00 AM in the sim (sim/ads rules.ts).
import { useMemo, useState } from 'react'
import { Lock, Pencil, Plus, Trash, Zap } from 'lucide-react'
import type { AdLevel, AutomatedRule, GameState } from '../../../../core/types'
import { act } from '../../../../core/store'
import { openSite } from '../../../../core/ui'
import { formatClock, formatDate } from '../../../../core/time'
import { MB_GATES, deleteRule, describeRule, featureUnlocked, upsertRule } from '../../../../sim/ads'
import { breakEven } from '../../../../sim/store'
import {
  AmButton, AmCard, AmField, AmInput, AmModal, AmNotice, AmSelect, AmTag, Toggle, amFmt,
} from '../../../kit/adsmanager'
import { EmptyArt } from '../../../kit/common'
import { useFbUI } from '../uiStore'

const METRIC_OPTS: { value: AutomatedRule['metric']; label: string; unit: 'money' | 'ratio' | 'pct' | 'num' }[] = [
  { value: 'cpa', label: 'Cost per purchase', unit: 'money' },
  { value: 'roas', label: 'Purchase ROAS', unit: 'ratio' },
  { value: 'spend', label: 'Amount spent', unit: 'money' },
  { value: 'ctr', label: 'CTR (link click-through rate)', unit: 'pct' },
  { value: 'frequency', label: 'Frequency', unit: 'num' },
]
const WINDOW_OPTS: { value: NonNullable<AutomatedRule['window']>; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_3d', label: 'Last 3 days' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'lifetime', label: 'Maximum' },
]
const SCOPE_WORD: Record<AdLevel, string> = { campaign: 'campaigns', adset: 'ad sets', ad: 'ads' }

/** A representative break-even for templates: the product with the most active Fadbook ads. */
function mainBreakEven(s: GameState): { cpa: number; roas: number } | null {
  const counts = new Map<string, number>()
  for (const a of s.ads.ads) if (a.platform === 'fadbook' && a.status === 'active') counts.set(a.storeProductId, (counts.get(a.storeProductId) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!top) return null
  const be = breakEven(s, top)
  return be.margin > 0 && Number.isFinite(be.breakEvenRoas) ? { cpa: be.breakEvenCpa, roas: be.breakEvenRoas } : null
}

export function RuleModal({ s, rule, defaultScope = 'adset', targetIds = [], onClose }: {
  s: GameState
  rule: AutomatedRule | null
  defaultScope?: AdLevel
  targetIds?: string[]
  onClose: () => void
}) {
  const [name, setName] = useState(rule?.name ?? '')
  const [scope, setScope] = useState<AdLevel>(rule?.scope ?? defaultScope)
  const [useTargets, setUseTargets] = useState(!!(rule?.targetIds?.length || targetIds.length))
  const targets = rule?.targetIds?.length ? rule.targetIds : targetIds
  const [action, setAction] = useState<AutomatedRule['action']>(rule?.action ?? 'pause')
  const [pct, setPct] = useState(String(rule?.actionPct ?? 20))
  const [metric, setMetric] = useState<AutomatedRule['metric']>(rule?.metric ?? 'cpa')
  const [op, setOp] = useState<AutomatedRule['op']>(rule?.op ?? '>')
  const [value, setValue] = useState(rule ? String(rule.value) : '')
  const [win, setWin] = useState<NonNullable<AutomatedRule['window']>>(rule?.window ?? 'last_3d')
  const [minSpend, setMinSpend] = useState(String(rule?.minSpend ?? 0))
  const be = useMemo(() => mainBreakEven(s), [s])
  const unit = METRIC_OPTS.find(m => m.value === metric)!.unit
  const effScope: AdLevel = action !== 'pause' && scope === 'ad' ? 'adset' : scope
  const draft: AutomatedRule = {
    id: rule?.id ?? '', platform: 'fadbook', name, enabled: rule?.enabled ?? true, scope: effScope, metric, op, value: Number(value), minSpend: Number(minSpend) || 0,
    action, actionPct: Number(pct) || 0, window: win, targetIds: useTargets && effScope === (rule?.scope ?? defaultScope) ? targets : undefined,
  }
  const err = !name.trim() ? 'Give the rule a name.' : !Number.isFinite(Number(value)) || value === '' ? 'Enter a value for the condition.'
    : action !== 'pause' && !(Number(pct) > 0) ? 'Enter a percentage for the budget change.' : null
  const applyTemplate = (t: 'losers' | 'winners' | 'fatigue') => {
    if (t === 'losers') {
      setName('Turn off ads above break-even CPA'); setScope('ad'); setAction('pause'); setMetric('cpa'); setOp('>')
      setValue(be ? be.cpa.toFixed(2) : ''); setWin('last_3d'); setMinSpend(be ? (be.cpa * 2).toFixed(2) : '40')
    } else if (t === 'winners') {
      setName('Scale ad sets beating break-even ROAS'); setScope('adset'); setAction('increase_budget'); setPct('20'); setMetric('roas'); setOp('>')
      setValue(be ? (be.roas * 1.3).toFixed(2) : ''); setWin('last_3d'); setMinSpend(be ? (be.cpa * 3).toFixed(2) : '60')
    } else {
      setName('Turn off fatigued ads'); setScope('ad'); setAction('pause'); setMetric('frequency'); setOp('>'); setValue('3.5'); setWin('last_7d'); setMinSpend('20')
    }
  }
  const save = () => {
    if (err) return
    act(g => upsertRule(g, draft))
    onClose()
  }
  return (
    <AmModal
      inline
      open
      onClose={onClose}
      title={rule ? 'Edit rule' : 'Create rule'}
      size="lg"
      pauseGame
      footerLeft={<span className="fb-small fb-muted">Rules check your {SCOPE_WORD[effScope]} every day at 9:00 AM.</span>}
      footer={<><AmButton onClick={onClose}>Cancel</AmButton><AmButton variant="primary" disabled={!!err} onClick={save}>{rule ? 'Save' : 'Create'}</AmButton></>}
    >
      <div className="fb-stack">
        {!rule && (
          <div className="fb-inline fb-wrap">
            <span className="fb-small fb-muted">Start from a template:</span>
            <AmButton size="sm" onClick={() => applyTemplate('losers')}>Turn off losing ads</AmButton>
            <AmButton size="sm" onClick={() => applyTemplate('winners')}>Scale winning ad sets</AmButton>
            <AmButton size="sm" onClick={() => applyTemplate('fatigue')}>Turn off fatigued ads</AmButton>
          </div>
        )}
        <AmField label="Rule name">
          <AmInput value={name} onChange={setName} maxLength={100} placeholder="Name your rule" ariaLabel="Rule name" />
        </AmField>
        <div className="fb-form-row">
          <AmField label="Apply rule to">
            <AmSelect
              value={scope}
              onChange={v => { setScope(v); setUseTargets(false) }}
              width={240}
              options={[
                { value: 'campaign', label: 'All active campaigns' },
                { value: 'adset', label: 'All active ad sets' },
                { value: 'ad', label: 'All active ads', disabled: action !== 'pause', disabledReason: 'Budget rules apply to campaigns or ad sets.' },
              ]}
              ariaLabel="Apply rule to"
            />
          </AmField>
          {targets.length > 0 && (rule?.scope ?? defaultScope) === scope && (
            <AmField label="Selection">
              <Toggle checked={useTargets} onChange={setUseTargets} label={`Only the ${targets.length} selected ${SCOPE_WORD[scope]}`} />
            </AmField>
          )}
        </div>
        <div className="fb-form-row">
          <AmField label="Action">
            <AmSelect
              value={action}
              onChange={setAction}
              width={260}
              options={[
                { value: 'pause', label: 'Turn off' },
                { value: 'increase_budget', label: 'Increase daily budget by' },
                { value: 'decrease_budget', label: 'Decrease daily budget by' },
              ]}
              ariaLabel="Action"
            />
          </AmField>
          {action !== 'pause' && (
            <AmField label="Percent" warning={Number(pct) > 20 ? 'Changes above 20% reset the learning phase each time the rule runs.' : undefined}>
              <AmInput value={pct} onChange={setPct} type="number" suffix="%" width={120} ariaLabel="Percent" />
            </AmField>
          )}
        </div>
        <AmCard title="Conditions" subtitle="ALL of the following match">
          <div className="fb-form-row">
            <AmSelect value={metric} onChange={setMetric} width={240} options={METRIC_OPTS.map(m => ({ value: m.value, label: m.label }))} ariaLabel="Metric" />
            <AmSelect value={op} onChange={setOp} width={170} options={[{ value: '>', label: 'is greater than' }, { value: '<', label: 'is smaller than' }]} ariaLabel="Operator" />
            <AmInput
              value={value}
              onChange={setValue}
              type="number"
              prefix={unit === 'money' ? '$' : undefined}
              suffix={unit === 'pct' ? '%' : undefined}
              width={140}
              ariaLabel="Value"
            />
          </div>
          <div className="fb-inline fb-wrap">
            <span className="fb-small">and Amount spent is greater than</span>
            <AmInput value={minSpend} onChange={setMinSpend} type="currency" prefix="$" width={140} ariaLabel="Minimum spend" />
          </div>
          {be && (metric === 'cpa' || metric === 'roas') && (
            <p className="fb-small fb-muted">
              For reference, your main product breaks even at {amFmt.money(be.cpa)} per purchase (ROAS {be.roas.toFixed(2)}). Fadbook-reported numbers
              can run ahead of your real sales.
            </p>
          )}
        </AmCard>
        <div className="fb-form-row">
          <AmField label="Time range" labelTip="The period of data the rule checks each time it runs.">
            <AmSelect value={win} onChange={setWin} width={200} options={WINDOW_OPTS} ariaLabel="Time range" />
          </AmField>
          <AmField label="Schedule"><span className="fb-small">Daily, at 9:00 AM</span></AmField>
        </div>
        {!err && <AmNotice tone="info">{describeRule(draft)}</AmNotice>}
      </div>
    </AmModal>
  )
}

export default function RulesPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const unlocked = featureUnlocked(s, 'rules')
  const [editing, setEditing] = useState<AutomatedRule | null | 'new'>(null)
  const rules = s.ads.rules.filter(r => r.platform === 'fadbook')
  const ruleIds = new Set(rules.map(r => r.id))
  const log = (s.ads.ruleLog ?? []).filter(e => ruleIds.has(e.ruleId)).slice().reverse().slice(0, 60)
  const level = s.skills.media_buying?.level ?? 1
  const ui = useFbUI()
  const showEntity = (lvl: AdLevel, id: string) => {
    if (lvl === 'campaign') ui.set({ level: 'campaign', sel: { campaign: [id], adset: [], ad: [] } })
    else if (lvl === 'adset') {
      const set = s.ads.adSets.find(x => x.id === id)
      ui.set({ level: 'adset', sel: { campaign: set ? [set.campaignId] : [], adset: [id], ad: [] } })
    } else {
      const ad = s.ads.ads.find(x => x.id === id)
      ui.set({ level: 'ad', sel: { campaign: ad ? [ad.campaignId] : [], adset: ad ? [ad.adSetId] : [], ad: [id] } })
    }
    navigate(lvl === 'campaign' ? 'manage/campaigns' : lvl === 'adset' ? 'manage/adsets' : 'manage/ads')
  }
  if (!unlocked) {
    return (
      <div className="fb-page">
        <AmCard>
          <div className="fb-locked">
            <span className="fb-locked-icon"><Lock size={28} /></span>
            <h2>Automated rules</h2>
            <p>
              Rules watch your campaigns for you: turn off ads that cost too much, raise budgets on winners or stop fatigued creatives, every day at 9:00 AM.
              They unlock at <strong>Media Buying level {MB_GATES.rules}</strong>. You're level {level}.
            </p>
            <p className="fb-small fb-muted">Spend on ads you manage and study media buying in Ecom Academy to level up.</p>
            <AmButton onClick={() => openSite('academy', '')}>Open Ecom Academy</AmButton>
          </div>
        </AmCard>
      </div>
    )
  }
  return (
    <div className="fb-page">
      <div className="fb-page-head">
        <div>
          <h1>Automated rules</h1>
          <p className="fb-muted">Rules check your campaigns, ad sets and ads daily at 9:00 AM and make changes for you.</p>
        </div>
        <AmButton variant="create" icon={Plus} onClick={() => setEditing('new')}>Create rule</AmButton>
      </div>
      <AmCard title="Rules" flush>
        {rules.length === 0 ? (
          <div className="fb-empty">
            <EmptyArt kind="ads" size={120} />
            <strong>You don't have any rules</strong>
            <span className="fb-muted">Create a rule to turn off losing ads or scale winners automatically.</span>
            <AmButton icon={Plus} onClick={() => setEditing('new')}>Create rule</AmButton>
          </div>
        ) : (
          <table className="fb-grid">
            <thead><tr><th style={{ width: 64 }}>On/Off</th><th>Rule</th><th className="fb-hide-narrow">Applies to</th><th className="fb-hide-narrow">Last run</th><th /></tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td><Toggle checked={r.enabled} ariaLabel="Rule on/off" onChange={on => act(g => upsertRule(g, { ...r, enabled: on }))} /></td>
                  <td>
                    <div className="fb-stack-tight">
                      <strong>{r.name}</strong>
                      <span className="fb-small fb-muted">{describeRule(r)}</span>
                    </div>
                  </td>
                  <td className="fb-hide-narrow">{r.targetIds?.length ? `${r.targetIds.length} selected ${SCOPE_WORD[r.scope]}` : `All active ${SCOPE_WORD[r.scope]}`}</td>
                  <td className="fb-hide-narrow">{r.lastRunHour != null ? `${formatDate(Math.floor(r.lastRunHour / 24), 'md')}, ${formatClock(r.lastRunHour)}` : <span className="fb-muted">Not run yet</span>}</td>
                  <td>
                    <div className="fb-inline">
                      <AmButton size="sm" icon={Pencil} ariaLabel="Edit rule" onClick={() => setEditing(r)} />
                      <AmButton size="sm" icon={Trash} ariaLabel="Delete rule" onClick={() => act(g => deleteRule(g, r.id))} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AmCard>
      <AmCard title="Activity" subtitle="Changes your rules made" flush>
        {log.length === 0 ? (
          <div className="fb-empty"><span className="fb-muted">No rule activity yet. Rules run daily at 9:00 AM.</span></div>
        ) : (
          <table className="fb-grid">
            <thead><tr><th>Date</th><th className="fb-hide-narrow">Rule</th><th>Item</th><th>Result</th></tr></thead>
            <tbody>
              {log.map(e => (
                <tr key={e.id}>
                  <td>{formatDate(Math.floor(e.hour / 24), 'md')}, {formatClock(e.hour)}</td>
                  <td className="fb-hide-narrow">{e.ruleName}</td>
                  <td>
                    <button type="button" className="am-name-link" onClick={() => showEntity(e.level, e.entityId)}>{e.entityName}</button>{' '}
                    <span className="fb-muted fb-small">{e.level === 'adset' ? 'Ad set' : e.level === 'ad' ? 'Ad' : 'Campaign'}</span>
                  </td>
                  <td><AmTag tone={e.action === 'pause' ? 'neutral' : e.action === 'increase_budget' ? 'green' : 'yellow'}><Zap size={11} /> {e.detail}</AmTag>{e.trigger && <div className="fb-muted fb-small">{e.trigger}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AmCard>
      {editing && <RuleModal s={s} rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
