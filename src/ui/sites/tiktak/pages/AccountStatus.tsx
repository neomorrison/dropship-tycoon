// Account status: suspension & appeal, account health, rejected ads, all ad accounts
// (switch, backup account, agency rental, copy campaigns into another account).
import { useState } from 'react'
import { ArrowRightLeft, Building2, FileWarning, Plus, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { AdAccount } from '../../../../core/types'
import { act, useGS } from '../../../../core/store'
import { formatDate } from '../../../../core/time'
import {
  AGENCY_SETUP_FEE, accountSpendLimit, copyCampaignToAccount, openAccountBlocker, openAdAccount, requestAdReview, startAppeal,
} from '../../../../sim/ads'
import { AmButton, AmModal, AmNotice, AmSelect, AmTable, MetricCell, amFmt, type AmColumn } from '../../../kit/adsmanager'
import { cx } from '../../../kit/common'
import { Panel, PageHead, Pill, selectAccount, useAccount, useGame, useTt } from '../common'
import { accountDisplayId, accountStatusText } from '../data'
import { AccountTabs } from './AccountInfo'

function health(q: number, status: AdAccount['status']): { label: string; tone: 'success' | 'warning' | 'critical'; text: string } {
  if (status === 'disabled') return { label: 'Permanently suspended', tone: 'critical', text: 'This account can no longer advertise. Move your campaigns to another ad account.' }
  if (status === 'restricted') return { label: 'Suspended', tone: 'critical', text: 'This account can\'t deliver ads until an appeal succeeds. Repeated suspensions lead to an advertising ban.' }
  if (q >= 70) return { label: 'Good', tone: 'success', text: 'No significant policy issues. Keep your ads compliant and your payments on time.' }
  if (q >= 50) return { label: 'Fair', tone: 'warning', text: 'Some ads were rejected or payments failed recently. More issues can lead to restrictions.' }
  return { label: 'At risk', tone: 'critical', text: 'Repeated rejections or failed payments put this account at risk of suspension. Avoid risky claims and before/after content.' }
}

export default function AccountStatus() {
  const s = useGame()
  const { navigate } = useTt()
  const { account, accounts } = useAccount()
  const acc = account!
  const st = accountStatusText(acc)
  const banned = acc.status === 'restricted' || acc.status === 'disabled'
  const h = health(acc.quality, acc.status)
  const queue = useGS(g => g.player.queue)
  const activity = useGS(g => g.player.activity)
  const appealQueued = [activity, ...queue].some(a => a?.kind === 'appeal_ad_account' && a.payload?.accountId === acc.id)
  const rejected = s.ads.ads.filter(a => a.platform === 'tiktak' && a.review === 'rejected' && a.status !== 'deleted' && s.ads.campaigns.find(c => c.id === a.campaignId)?.accountId === acc.id)
  const campaigns = s.ads.campaigns.filter(c => c.accountId === acc.id && c.status !== 'deleted')
  const others = accounts.filter(a => a.id !== acc.id && (a.status === 'active' || a.status === 'payment_failed'))
  const ownBlock = openAccountBlocker(s, 'tiktak')
  const rentBlock = openAccountBlocker(s, 'tiktak', true)
  const bannedUntil = s.ads.bannedUntil?.tiktak
  const [rentOpen, setRentOpen] = useState(false)
  const [copyTarget, setCopyTarget] = useState<string | null>(others[0]?.id ?? null)
  const [copied, setCopied] = useState<string[]>([])

  const rent = () => {
    const out: { id: string | null } = { id: null }
    act(g => { out.id = openAdAccount(g, 'tiktak', { rented: true }) })
    setRentOpen(false)
    if (out.id) selectAccount(out.id)
  }

  const cols: AmColumn<AdAccount>[] = [
    {
      id: 'name', header: 'Ad account', width: 260, sticky: true,
      render: a => <div className="tt-col" style={{ gap: 1 }}><b style={{ fontSize: 13 }}>{a.name}</b><span className="tt-faint tt-small">ID {accountDisplayId(a)}</span></div>,
    },
    { id: 'status', header: 'Status', width: 170, render: a => { const x = accountStatusText(a); return <Pill tone={x.tone === 'success' ? 'success' : x.tone === 'info' ? 'info' : 'critical'} dot>{x.label}</Pill> } },
    { id: 'type', header: 'Type', width: 180, render: a => <span style={{ fontSize: 12 }}>{a.rentedFeePct != null ? `Agency · ${(a.rentedFeePct * 100).toFixed(1)}% fee` : 'Self-serve'}</span> },
    { id: 'limit', header: 'Daily limit', align: 'right', width: 120, render: a => { const l = accountSpendLimit(s, a.id); return <MetricCell value={Number.isFinite(l) ? amFmt.money0(l) : 'No limit'} /> } },
    { id: 'spend', header: 'Lifetime spend', align: 'right', width: 140, render: a => <MetricCell value={amFmt.money(a.lifetimeSpend)} /> },
    {
      id: 'act', header: '', width: 120,
      render: a => a.id === acc.id ? <span className="tt-faint tt-small">Current</span> : <AmButton size="sm" icon={ArrowRightLeft} onClick={() => selectAccount(a.id)}>Switch</AmButton>,
    },
  ]

  return (
    <div className="tt-page tt-page-narrow">
      <PageHead title="Account status" />
      <AccountTabs active="status" />

      <Panel>
        <div className="tt-row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <span className="tt-pixel-icon" style={{ background: banned ? '#ffe8ec' : acc.status === 'payment_failed' ? '#fff2e0' : '#e3f8ef', color: banned ? '#c4163a' : acc.status === 'payment_failed' ? '#9a5200' : '#007a50' }}>
            {banned ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
          </span>
          <div className="tt-col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
            <div className="tt-row"><b style={{ fontSize: 16 }}>{acc.name}</b><Pill tone={st.tone === 'success' ? 'success' : st.tone === 'info' ? 'info' : 'critical'} dot>{st.label}</Pill></div>
            <span className="tt-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>
              {banned
                ? acc.statusReason ?? 'This ad account was suspended for violating our Advertising Policies.'
                : acc.status === 'payment_failed'
                  ? 'Ads stopped because a payment failed. Pay the outstanding balance to resume.'
                  : 'Your ad account is active and can deliver ads.'}
              {acc.statusSinceHour != null && acc.status !== 'active' ? ` Since ${formatDate(Math.floor(acc.statusSinceHour / 24), 'short')}.` : ''}
            </span>
            {acc.status === 'payment_failed' && <div><AmButton size="sm" variant="primary" onClick={() => navigate('billing')}>Go to Payment</AmButton></div>}
          </div>
        </div>
        {banned && (
          <div style={{ marginTop: 14 }}>
            {acc.appeal ? (
              <AmNotice tone="info" title="Appeal in review">
                Submitted {formatDate(acc.appeal.submittedDay, 'md')}. You should hear back by {formatDate(acc.appeal.resolveDay, 'md')}. Ads stay paused until then.
              </AmNotice>
            ) : acc.appealDenied ? (
              <AmNotice tone="error" title="Appeal rejected">
                We reviewed this account again and the decision is final. Move your campaigns to another ad account below.
              </AmNotice>
            ) : appealQueued ? (
              <AmNotice tone="info" title="Appeal queued">Writing your appeal is on your to-do list. It takes about 30 minutes; the review starts once it&apos;s submitted.</AmNotice>
            ) : (
              <AmNotice
                tone="warning"
                title="Think this is a mistake?"
                actions={<AmButton size="sm" variant="primary" icon={RotateCcw} onClick={() => act(g => startAppeal(g, acc.id))}>Request a review</AmButton>}
              >
                Submit an appeal explaining your business and the changes you made. Reviews usually take 2–4 days. Suspensions are overturned more often than permanent suspensions.
              </AmNotice>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Account health">
        <div className="tt-col" style={{ gap: 10 }}>
          <div className="tt-row" style={{ gap: 10 }}>
            <Pill tone={h.tone} dot>{h.label}</Pill>
            <span className="tt-muted" style={{ fontSize: 13 }}>{h.text}</span>
          </div>
          <div className="tt-grid-3">
            <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Rejected ads (all time)</span><span className="tt-kpi-value">{amFmt.int(acc.disapprovals)}</span></div>
            <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Failed payments</span><span className="tt-kpi-value">{amFmt.int(Math.round(acc.failedPayments ?? 0))}</span></div>
            <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Account age</span><span className="tt-kpi-value">{Math.max(0, Math.floor(s.time.hour / 24) - acc.createdDay)} days</span></div>
          </div>
        </div>
      </Panel>

      {rejected.length > 0 && (
        <Panel title={<span className="tt-row" style={{ gap: 6 }}><FileWarning size={16} /> Rejected ads</span>}>
          <div className="tt-list">
            {rejected.map(a => (
              <div key={a.id} className="tt-list-item" style={{ alignItems: 'flex-start' }}>
                <div className="tt-list-main">
                  <span className="tt-list-title">{a.name}</span>
                  <span className="tt-muted tt-small" style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>{a.rejectReason ?? 'Violates our Advertising Policies.'}</span>
                </div>
                <AmButton size="sm" icon={RotateCcw} onClick={() => act(g => requestAdReview(g, a.id))}>Request review</AmButton>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {(banned || acc.status === 'payment_failed') && campaigns.length > 0 && (
        <Panel title="Move campaigns to another account">
          {others.length === 0 ? (
            <span className="tt-muted" style={{ fontSize: 13 }}>Open a backup account or rent an agency account below, then copy your campaigns into it. Copies go through review and start learning from scratch.</span>
          ) : (
            <div className="tt-col" style={{ gap: 10 }}>
              <div className="tt-row">
                <span className="tt-muted tt-small">Copy to</span>
                <AmSelect value={copyTarget} onChange={setCopyTarget} options={others.map(a => ({ value: a.id, label: a.name, description: `ID ${accountDisplayId(a)}` }))} width={280} size="sm" />
              </div>
              <div className="tt-list">
                {campaigns.map(c => (
                  <div key={c.id} className="tt-list-item">
                    <div className="tt-list-main"><span className="tt-list-title">{c.name}</span><span className="tt-list-sub">{c.budgetMode === 'cbo' ? `${amFmt.money(c.dailyBudget)} daily` : 'Ad group budgets'}</span></div>
                    <AmButton
                      size="sm"
                      disabled={!copyTarget || copied.includes(c.id)}
                      onClick={() => { const t = copyTarget!; act(g => { copyCampaignToAccount(g, c.id, t) }); setCopied(x => [...x, c.id]) }}
                    >
                      {copied.includes(c.id) ? 'Copied' : 'Copy'}
                    </AmButton>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      <Panel
        title="Your ad accounts"
        actions={
          <span className="tt-row">
            <AmButton size="sm" icon={Plus} disabled={!!ownBlock} title={ownBlock ?? undefined} onClick={() => navigate('setup')}>New account</AmButton>
            <AmButton size="sm" icon={Building2} disabled={!!rentBlock} title={rentBlock ?? undefined} onClick={() => setRentOpen(true)}>Rent agency account</AmButton>
          </span>
        }
        pad={false}
      >
        <div style={{ padding: 16 }} className={cx('tt-col')}>
          {bannedUntil != null && bannedUntil > Math.floor(s.time.hour / 24) && (
            <AmNotice tone="error" title="Advertising restricted">You can&apos;t open new self-serve accounts until {formatDate(bannedUntil, 'short')} after repeated suspensions. Agency accounts are still available.</AmNotice>
          )}
          {ownBlock && !(bannedUntil != null && bannedUntil > Math.floor(s.time.hour / 24)) && <span className="tt-faint tt-small">{ownBlock}</span>}
          <AmTable rows={accounts} columns={cols} rowKey={a => a.id} selectable={false} totals={false} highlightedId={acc.id} maxHeight={320} />
        </div>
      </Panel>

      <AmModal
        open={rentOpen}
        onClose={() => setRentOpen(false)}
        inline
        size="sm"
        title="Rent an agency ad account"
        footer={<><AmButton onClick={() => setRentOpen(false)}>Cancel</AmButton><AmButton variant="primary" onClick={rent}>Pay {amFmt.money0(AGENCY_SETUP_FEE.tiktak)} and rent</AmButton></>}
      >
        <div className="tt-col" style={{ gap: 10, fontSize: 13, lineHeight: 1.45 }}>
          <span>An agency adds you to one of its aged TikTak ad accounts. You get a higher daily spending limit and a lower risk of suspension.</span>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>One-time setup fee: {amFmt.money0(AGENCY_SETUP_FEE.tiktak)}</li>
            <li>Service fee: 3–6% on top of all ad spend, billed with your spend</li>
            <li>Agencies rent at most 3 accounts per advertiser</li>
          </ul>
        </div>
      </AmModal>
    </div>
  )
}
