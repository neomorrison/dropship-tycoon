// Account info: name, IDs, business center, time zone/currency, agency terms, feature access.
import { useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { act } from '../../../../core/store'
import { formatDate } from '../../../../core/time'
import { MB_GATES, featureUnlocked } from '../../../../sim/ads'
import { AmButton, AmInput, amFmt } from '../../../kit/adsmanager'
import { Panel, PageHead, Pill, SubTabs, useAccount, useGame, useTt } from '../common'
import { accountDisplayId, accountStatusText } from '../data'

export function AccountTabs({ active }: { active: 'info' | 'billing' | 'status' }) {
  const { navigate } = useTt()
  return (
    <SubTabs
      tabs={[{ id: 'info', label: 'Account info' }, { id: 'billing', label: 'Payment' }, { id: 'status', label: 'Account status' }]}
      active={active}
      onChange={id => navigate(id === 'info' ? 'account' : id === 'billing' ? 'billing' : 'account_quality')}
    />
  )
}

export default function AccountInfo() {
  const s = useGame()
  const { account } = useAccount()
  const acc = account!
  const [name, setName] = useState(acc.name)
  const [editing, setEditing] = useState(false)
  const st = accountStatusText(acc)
  const mb = s.skills.media_buying?.level ?? 1
  const features: { label: string; level: number; on: boolean; desc: string }[] = [
    { label: 'Manual campaigns, custom targeting, Spark Ads', level: 1, on: true, desc: 'Everything you need to test products.' },
    { label: 'Smart+ campaigns', level: MB_GATES.advantage, on: featureUnlocked(s, 'advantage'), desc: 'Automated targeting and creative delivery.' },
    { label: 'Cost cap bidding', level: MB_GATES.costCap, on: featureUnlocked(s, 'costCap'), desc: 'Keep the average cost per conversion near a goal.' },
    { label: 'Automated rules', level: MB_GATES.rules, on: featureUnlocked(s, 'rules'), desc: 'Turn off losers and scale winners every morning.' },
  ]
  const save = () => {
    const v = name.trim().slice(0, 80)
    if (!v) return
    act(g => { const a = g.ads.accounts.find(x => x.id === acc.id); if (a) a.name = v })
    setEditing(false)
  }
  return (
    <div className="tt-page tt-page-narrow">
      <PageHead title="Account info" />
      <AccountTabs active="info" />
      <Panel title="Basic information" actions={<Pill tone={st.tone === 'success' ? 'success' : st.tone === 'info' ? 'info' : 'critical'} dot>{st.label}</Pill>}>
        <dl className="tt-kv">
          <dt>Ad account name</dt>
          <dd>
            {editing ? (
              <span className="tt-row">
                <AmInput value={name} onChange={setName} maxLength={80} width={260} onEnter={save} autoFocus />
                <AmButton size="sm" variant="primary" onClick={save}>Save</AmButton>
                <AmButton size="sm" onClick={() => { setName(acc.name); setEditing(false) }}>Cancel</AmButton>
              </span>
            ) : (
              <span className="tt-row">{acc.name}<AmButton size="sm" variant="link" onClick={() => setEditing(true)}>Edit</AmButton></span>
            )}
          </dd>
          <dt>Ad account ID</dt><dd className="tt-num">{accountDisplayId(acc)}</dd>
          <dt>Business Center</dt><dd>{acc.businessName ?? '—'}</dd>
          <dt>Account type</dt><dd>{acc.rentedFeePct != null ? `Agency account · ${acc.agencyName ?? 'Agency'} (${(acc.rentedFeePct * 100).toFixed(1)}% service fee on spend)` : 'Self-serve'}</dd>
          <dt>Country or region</dt><dd>United States</dd>
          <dt>Currency</dt><dd>USD</dd>
          <dt>Time zone</dt><dd>(UTC-05:00) Eastern Time - New York</dd>
          <dt>Created</dt><dd>{formatDate(acc.createdDay, 'short')}</dd>
          <dt>Lifetime spend</dt><dd>{amFmt.money(acc.lifetimeSpend)}</dd>
        </dl>
      </Panel>
      <Panel title="Feature access" actions={<span className="tt-faint tt-small">Media Buying level {mb}</span>}>
        <div className="tt-list">
          {features.map(f => (
            <div key={f.label} className="tt-list-item">
              <span style={{ color: f.on ? '#00b578' : 'var(--am-text-3)', display: 'inline-flex' }}>{f.on ? <Check size={16} strokeWidth={2.5} /> : <Lock size={15} />}</span>
              <div className="tt-list-main">
                <span className="tt-list-title">{f.label}</span>
                <span className="tt-list-sub">{f.desc}</span>
              </div>
              {!f.on && <Pill tone="neutral">Level {f.level}</Pill>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

