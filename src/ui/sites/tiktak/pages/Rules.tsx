// Tools › Automated rules (Media Buying level 4+): turn off or scale campaigns / ad groups / ads
// when a metric crosses a threshold. Evaluated daily at 9:00 AM by the ads sim.
import { useState } from 'react'
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import type { AdLevel, AutomatedRule } from '../../../../core/types'
import { act } from '../../../../core/store'
import { formatClock, formatDate } from '../../../../core/time'
import { MB_GATES, deleteRule, featureUnlocked, upsertRule } from '../../../../sim/ads'
import { AmButton, AmCheckbox, AmField, AmInput, AmModal, AmNotice, AmSegmented, AmSelect, Toggle, amFmt } from '../../../kit/adsmanager'
import { EmptyBlock, Panel, PageHead, Pill, useGame } from '../common'

const METRIC_LABEL: Record<AutomatedRule['metric'], string> = {
  cpa: 'Cost per complete payment', roas: 'Complete payment ROAS', spend: 'Cost', ctr: 'CTR (destination)', frequency: 'Frequency',
}
const WINDOW_LABEL: Record<NonNullable<AutomatedRule['window']>, string> = {
  today: 'Today', yesterday: 'Yesterday', last_3d: 'Last 3 days', last_7d: 'Last 7 days', lifetime: 'Lifetime',
}
const SCOPE_LABEL: Record<AdLevel, string> = { campaign: 'Campaigns', adset: 'Ad groups', ad: 'Ads' }

export function describeTt(r: AutomatedRule): string {
  const v = r.metric === 'cpa' || r.metric === 'spend' ? amFmt.money(r.value) : r.metric === 'ctr' ? `${r.value}%` : String(r.value)
  const what = SCOPE_LABEL[r.scope].toLowerCase()
  const act = r.action === 'pause' ? 'turn it off' : `${r.action === 'increase_budget' ? 'increase' : 'decrease'} its daily budget by ${r.actionPct}%`
  const scope = r.targetIds?.length ? `${r.targetIds.length} selected ${r.targetIds.length === 1 ? what.replace(/s$/, '') : what}` : `all active ${what}`
  return `For ${scope}: if ${METRIC_LABEL[r.metric]} ${r.op === '>' ? 'is greater than' : 'is less than'} ${v} (${WINDOW_LABEL[r.window ?? 'last_3d'].toLowerCase()})${r.minSpend > 0 ? ` and cost is at least ${amFmt.money(r.minSpend)}` : ''}, ${act}.`
}

interface Draft {
  id: string; name: string; scope: AdLevel; metric: AutomatedRule['metric']; op: '>' | '<'; value: string; window: NonNullable<AutomatedRule['window']>
  minSpend: string; action: AutomatedRule['action']; actionPct: string; targetIds: string[]; enabled: boolean
}
const blank = (): Draft => ({
  id: '', name: 'Turn off unprofitable ads', scope: 'ad', metric: 'cpa', op: '>', value: '', window: 'last_3d', minSpend: '', action: 'pause', actionPct: '20', targetIds: [], enabled: true,
})
const fromRule = (r: AutomatedRule): Draft => ({
  id: r.id, name: r.name, scope: r.scope, metric: r.metric, op: r.op, value: String(r.value), window: r.window ?? 'last_3d', minSpend: r.minSpend ? String(r.minSpend) : '',
  action: r.action, actionPct: String(r.actionPct), targetIds: r.targetIds ?? [], enabled: r.enabled,
})

export default function Rules() {
  const s = useGame()
  const unlocked = featureUnlocked(s, 'rules')
  const level = s.skills.media_buying?.level ?? 1
  const rules = s.ads.rules.filter(r => r.platform === 'tiktak')
  const ttIds = new Set([...s.ads.campaigns, ...s.ads.adSets, ...s.ads.ads].filter(e => e.platform === 'tiktak').map(e => e.id))
  const log = (s.ads.ruleLog ?? []).filter(l => ttIds.has(l.entityId)).slice(-40).reverse()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  if (!unlocked) {
    return (
      <div className="tt-page tt-page-narrow">
        <PageHead title="Automated rules" crumbs={[{ label: 'Tools' }, { label: 'Automated rules' }]} />
        <Panel>
          <EmptyBlock
            title={<span className="tt-row" style={{ justifyContent: 'center', gap: 6 }}><Lock size={16} /> Automated rules unlock at Media Buying level {MB_GATES.rules}</span>}
            body={`You're level ${level}. Rules turn off losing ads and scale winners every morning at 9:00 AM, but only work if you already know which numbers to act on. Keep running and reading campaigns to level up.`}
          />
        </Panel>
      </div>
    )
  }

  const pool = draft
    ? (draft.scope === 'campaign' ? s.ads.campaigns : draft.scope === 'adset' ? s.ads.adSets : s.ads.ads).filter(e => e.platform === 'tiktak' && e.status !== 'deleted')
    : []
  const valueErr = draft && !(Number(draft.value) > 0) ? 'Enter a number greater than 0.' : undefined
  const save = () => {
    if (!draft || valueErr || !draft.name.trim()) return
    const rule: AutomatedRule = {
      id: draft.id, platform: 'tiktak', name: draft.name.trim(), enabled: draft.enabled, scope: draft.action !== 'pause' && draft.scope === 'ad' ? 'adset' : draft.scope,
      metric: draft.metric, op: draft.op, value: Number(draft.value), minSpend: Number(draft.minSpend) || 0, action: draft.action,
      actionPct: Number(draft.actionPct) || 0, window: draft.window, targetIds: draft.targetIds.length ? draft.targetIds : undefined,
    }
    act(st => upsertRule(st, rule))
    setDraft(null)
  }

  return (
    <div className="tt-page tt-page-narrow">
      <PageHead
        title="Automated rules"
        crumbs={[{ label: 'Tools' }, { label: 'Automated rules' }]}
        actions={<AmButton variant="primary" icon={Plus} onClick={() => setDraft(blank())}>Create rule</AmButton>}
      />
      <Panel pad={false}>
        {rules.length === 0 ? (
          <EmptyBlock title="No rules yet" body="Example: turn off ads whose cost per complete payment is above your break-even over the last 3 days once they've spent at least 2× that amount." />
        ) : (
          rules.map(r => (
            <div key={r.id} className="tt-rule">
              <Toggle checked={r.enabled} onChange={v => act(st => upsertRule(st, { ...r, enabled: v }))} ariaLabel={r.enabled ? 'Turn rule off' : 'Turn rule on'} />
              <div className="tt-rule-main">
                <span className="tt-rule-name">{r.name}</span>
                <span className="tt-rule-desc">{describeTt(r)}</span>
                <span className="tt-faint tt-small">Runs daily at 9:00 AM{r.lastRunHour != null ? ` · Last run ${formatDate(Math.floor(r.lastRunHour / 24), 'md')}` : ''}</span>
              </div>
              <AmButton size="sm" icon={Pencil} onClick={() => setDraft(fromRule(r))}>Edit</AmButton>
              <AmButton size="sm" variant="tertiary" icon={Trash2} ariaLabel="Delete rule" onClick={() => setConfirm(r.id)} />
            </div>
          ))
        )}
      </Panel>

      <Panel title="Rule activity">
        {log.length === 0 ? (
          <span className="tt-muted tt-small">No actions yet. Rules act when their conditions are met at the 9:00 AM check.</span>
        ) : (
          <div className="tt-list">
            {log.map(l => (
              <div key={l.id} className="tt-list-item">
                <div className="tt-list-main">
                  <span className="tt-list-title">{l.entityName}</span>
                  <span className="tt-list-sub">{[l.ruleName, l.trigger, l.action !== 'pause' ? l.detail : null].filter(Boolean).join(' · ')}</span>
                </div>
                <Pill tone={l.action === 'pause' ? 'warning' : 'info'}>{l.action === 'pause' ? 'Turned off' : l.action === 'increase_budget' ? 'Budget up' : 'Budget down'}</Pill>
                <span className="tt-faint tt-small" style={{ whiteSpace: 'nowrap' }}>{formatDate(Math.floor(l.hour / 24), 'md')} {formatClock(l.hour)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <AmModal
        open={!!draft}
        onClose={() => setDraft(null)}
        inline
        pauseGame
        size="lg"
        title={draft?.id ? 'Edit rule' : 'Create rule'}
        footer={<><AmButton onClick={() => setDraft(null)}>Cancel</AmButton><AmButton variant="primary" disabled={!!valueErr || !draft?.name.trim()} onClick={save}>Save</AmButton></>}
      >
        {draft && (
          <div className="tt-fields">
            <AmField label="Rule name"><AmInput value={draft.name} onChange={v => setDraft({ ...draft, name: v })} /></AmField>
            <AmField label="Apply to">
              <AmSegmented value={draft.scope} onChange={v => setDraft({ ...draft, scope: v, targetIds: [] })} options={[{ value: 'campaign', label: 'Campaigns' }, { value: 'adset', label: 'Ad groups' }, { value: 'ad', label: 'Ads' }]} />
            </AmField>
            <AmField label={`Which ${SCOPE_LABEL[draft.scope].toLowerCase()}`} help={draft.targetIds.length ? `${draft.targetIds.length} selected` : `All active ${SCOPE_LABEL[draft.scope].toLowerCase()}, including new ones`}>
              <div className="tt-col" style={{ gap: 6, maxHeight: 160, overflow: 'auto', padding: 2 }}>
                {pool.length === 0 && <span className="tt-faint tt-small">Nothing to select yet.</span>}
                {pool.map(e => (
                  <AmCheckbox key={e.id} checked={draft.targetIds.includes(e.id)} label={e.name} onChange={on => setDraft({ ...draft, targetIds: on ? [...draft.targetIds, e.id] : draft.targetIds.filter(x => x !== e.id) })} />
                ))}
              </div>
            </AmField>
            <div className="tt-field-row">
              <AmField label="Condition">
                <AmSelect value={draft.metric} onChange={v => setDraft({ ...draft, metric: v })} options={(Object.keys(METRIC_LABEL) as AutomatedRule['metric'][]).map(m => ({ value: m, label: METRIC_LABEL[m] }))} />
              </AmField>
              <AmField label="Time range">
                <AmSelect value={draft.window} onChange={v => setDraft({ ...draft, window: v })} options={(Object.keys(WINDOW_LABEL) as NonNullable<AutomatedRule['window']>[]).map(w => ({ value: w, label: WINDOW_LABEL[w] }))} />
              </AmField>
            </div>
            <div className="tt-field-row">
              <AmField label="Operator">
                <AmSegmented value={draft.op} onChange={v => setDraft({ ...draft, op: v })} options={[{ value: '>', label: 'Greater than' }, { value: '<', label: 'Less than' }]} />
              </AmField>
              <AmField label="Value" error={draft.value.trim() ? valueErr : undefined}>
                <AmInput value={draft.value} onChange={v => setDraft({ ...draft, value: v })} type="number" prefix={draft.metric === 'cpa' || draft.metric === 'spend' ? '$' : undefined} suffix={draft.metric === 'ctr' ? '%' : undefined} />
              </AmField>
            </div>
            <AmField label="And cost is at least" optional help="Stops the rule from judging ads that haven't spent enough to have real data.">
              <AmInput value={draft.minSpend} onChange={v => setDraft({ ...draft, minSpend: v })} type="currency" prefix="$" width={200} />
            </AmField>
            <div className="tt-field-row">
              <AmField label="Action">
                <AmSelect
                  value={draft.action}
                  onChange={v => setDraft({ ...draft, action: v })}
                  options={[
                    { value: 'pause', label: 'Turn off' },
                    { value: 'increase_budget', label: 'Increase daily budget' },
                    { value: 'decrease_budget', label: 'Decrease daily budget' },
                  ]}
                />
              </AmField>
              {draft.action !== 'pause' && (
                <AmField label="By" help={Number(draft.actionPct) > 30 ? 'Budget changes over 30% restart the learning phase.' : undefined}>
                  <AmInput value={draft.actionPct} onChange={v => setDraft({ ...draft, actionPct: v })} type="number" suffix="%" width={140} />
                </AmField>
              )}
            </div>
            {draft.action !== 'pause' && draft.scope === 'ad' && <AmNotice tone="info">Budget rules apply to ad groups (ads don&apos;t have budgets). This rule will be saved for ad groups.</AmNotice>}
            <div className="tt-code" style={{ whiteSpace: 'normal', fontFamily: 'inherit', fontSize: 12.5 }}>
              {describeTt({ id: draft.id, platform: 'tiktak', name: draft.name, enabled: true, scope: draft.action !== 'pause' && draft.scope === 'ad' ? 'adset' : draft.scope, metric: draft.metric, op: draft.op, value: Number(draft.value) || 0, minSpend: Number(draft.minSpend) || 0, action: draft.action, actionPct: Number(draft.actionPct) || 0, window: draft.window, targetIds: draft.targetIds })}
            </div>
          </div>
        )}
      </AmModal>

      <AmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        inline
        size="sm"
        title="Delete rule?"
        footer={<><AmButton onClick={() => setConfirm(null)}>Cancel</AmButton><AmButton variant="danger" onClick={() => { const id = confirm!; act(st => deleteRule(st, id)); setConfirm(null) }}>Delete</AmButton></>}
      >
        <span style={{ fontSize: 13 }}>The rule stops running. Changes it already made stay in place.</span>
      </AmModal>
    </div>
  )
}
