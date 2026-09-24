// Account quality: ad account status and restrictions, the review (appeal) request, rejected ads
// with "Request review", the signals that put accounts at risk, and ways to keep advertising
// (backup account, agency account, copying campaigns to a working account).
import { useState } from 'react'
import { Building2, CircleCheck, Copy, RotateCcw, ShieldAlert, ShieldCheck, TriangleAlert, UserPlus } from 'lucide-react'
import type { AdAccount, GameState } from '../../../../core/types'
import { act } from '../../../../core/store'
import { dayOf, formatDate } from '../../../../core/time'
import { BENCHMARKS } from '../../../../data/benchmarks'
import { AGENCY_SETUP_FEE, copyCampaignToAccount, openAccountBlocker, openAdAccount, requestAdReview, startAppeal } from '../../../../sim/ads'
import { chargebackRatio } from '../../../../sim/store'
import { AmButton, AmCard, AmModal, AmNotice, AmSelect, AmTag, amFmt } from '../../../kit/adsmanager'
import { ImageWithFallback } from '../../../kit/common'
import { accountStatusLabel, displayId, fbAccounts } from '../data'
import { useFbUI } from '../uiStore'

function health(acc: AdAccount): { label: string; tone: 'green' | 'yellow' | 'red'; text: string } {
  if (acc.status === 'restricted' || acc.status === 'disabled') {
    return { label: acc.status === 'restricted' ? 'Restricted' : 'Disabled', tone: 'red', text: 'This ad account can\'t run ads.' }
  }
  if (acc.quality < 50 || (acc.failedPayments ?? 0) >= 2) return { label: 'At risk', tone: 'red', text: 'Several issues on this account increase the chance of a restriction.' }
  if (acc.quality < 65 || acc.disapprovals > 0 || (acc.failedPayments ?? 0) > 0) return { label: 'Some issues', tone: 'yellow', text: 'Recent rejections or payment problems have been noted on this account.' }
  return { label: 'No issues', tone: 'green', text: 'Your ad account is in good standing.' }
}

export default function AccountQuality({ s, acc, navigate }: { s: GameState; acc: AdAccount; navigate: (p: string) => void }) {
  const ui = useFbUI()
  const today = dayOf(s.time.hour)
  const [confirm, setConfirm] = useState<null | 'backup' | 'rent'>(null)
  const [copyTo, setCopyTo] = useState<string>('')
  const [copied, setCopied] = useState<string | null>(null)
  const status = accountStatusLabel(acc)
  const h = health(acc)
  const banned = acc.status === 'restricted' || acc.status === 'disabled'
  const appealQueued = [s.player.activity, ...s.player.queue].some(a => a?.kind === 'appeal_ad_account' && a.payload?.accountId === acc.id)
  const campaigns = s.ads.campaigns.filter(c => c.accountId === acc.id && c.status !== 'deleted')
  const campIds = new Set(campaigns.map(c => c.id))
  const rejected = s.ads.ads.filter(a => campIds.has(a.campaignId) && a.status !== 'deleted' && a.review === 'rejected')
  const others = fbAccounts(s).filter(a => a.id !== acc.id && (a.status === 'active' || a.status === 'payment_failed'))
  const backupBlock = openAccountBlocker(s, 'fadbook', false)
  const rentBlock = openAccountBlocker(s, 'fadbook', true)
  const cb = chargebackRatio(s)
  const ageDays = today - acc.createdDay
  const bans = s.ads.bans?.fadbook ?? 0
  const bannedUntil = s.ads.bannedUntil?.fadbook
  const creatives = new Map(s.creatives.creatives.map(c => [c.id, c]))

  const signals: { ok: boolean; label: string; detail: string }[] = [
    { ok: acc.disapprovals === 0, label: 'Rejected ads', detail: acc.disapprovals ? `${acc.disapprovals} ad${acc.disapprovals === 1 ? ' was' : 's were'} rejected on this account. Each rejection counts against it.` : 'No ads rejected.' },
    { ok: !(acc.failedPayments ?? 0), label: 'Payments', detail: acc.failedPayments ? `${acc.failedPayments} recent failed payment${acc.failedPayments === 1 ? '' : 's'}.` : 'Payments are up to date.' },
    {
      ok: cb <= BENCHMARKS.chargebacks.warnRatio,
      label: 'Customer feedback',
      detail: cb > BENCHMARKS.chargebacks.thresholdRatio ? `Poor: ${(cb * 100).toFixed(2)}% of recent orders turned into disputes. People who buy from your ads are unhappy.`
        : cb > BENCHMARKS.chargebacks.warnRatio ? `Needs attention: ${(cb * 100).toFixed(2)}% of recent orders were disputed.` : 'Good: few disputes from buyers.',
    },
    { ok: ageDays >= 14, label: 'Account age', detail: ageDays >= 14 ? `Created ${formatDate(acc.createdDay, 'short')}.` : `New account (${ageDays} day${ageDays === 1 ? '' : 's'} old). New accounts get extra scrutiny; avoid sudden budget jumps.` },
  ]

  const [openErr, setOpenErr] = useState<string | null>(null)
  const doOpen = (rented: boolean) => {
    let id: string | null = null
    act(g => { id = openAdAccount(g, 'fadbook', { rented }) })
    if (id) {
      setConfirm(null)
      setOpenErr(null)
      ui.set({ accountId: id })
    } else {
      setOpenErr(rented
        ? `The ${amFmt.money(AGENCY_SETUP_FEE.fadbook)} setup fee was declined. Free up cash or card credit, then try again.`
        : 'The ad account couldn\'t be created. Check your notifications for the reason.')
    }
  }

  return (
    <div className="fb-page">
      <div className="fb-page-head">
        <div>
          <h1>Account quality</h1>
          <p className="fb-muted">See issues with your ad account and request a review if you think we made a mistake.</p>
        </div>
      </div>

      <AmCard>
        <div className="fb-aq-head">
          <span className={`fb-aq-icon fb-aq-${h.tone}`}>{h.tone === 'green' ? <ShieldCheck size={26} /> : h.tone === 'yellow' ? <TriangleAlert size={26} /> : <ShieldAlert size={26} />}</span>
          <div className="fb-stack-tight">
            <strong className="fb-aq-name">{acc.name}</strong>
            <span className="fb-muted fb-small">Ad account ID: {displayId(acc)}{acc.agencyName ? ` · Agency: ${acc.agencyName}` : ''}</span>
            <span className="fb-inline"><AmTag tone={status.tone}>{status.label}</AmTag> {!banned && <AmTag tone={h.tone === 'green' ? 'green' : h.tone === 'yellow' ? 'yellow' : 'red'}>{h.label}</AmTag>}</span>
          </div>
        </div>
        <p className="fb-small">{h.text}</p>
      </AmCard>

      {banned && (
        <AmCard title={acc.status === 'restricted' ? 'Ad account restricted' : 'Ad account disabled'}>
          <div className="fb-stack">
            <AmNotice tone="error" title="Why this happened">{acc.statusReason ?? 'Your ad account doesn\'t follow our Advertising Standards.'}</AmNotice>
            {acc.statusSinceHour != null && <span className="fb-small fb-muted">Since {formatDate(dayOf(acc.statusSinceHour), 'long')}</span>}
            {acc.appeal ? (
              <AmNotice tone="info" title="Review in progress">
                You requested a review on {formatDate(acc.appeal.submittedDay, 'md')}. We'll let you know our decision by {formatDate(acc.appeal.resolveDay, 'md')}.
              </AmNotice>
            ) : acc.appealDenied ? (
              <AmNotice tone="error" title="Decision is final">We reviewed this account and confirmed it doesn't comply with our Advertising Standards. You can't request another review.</AmNotice>
            ) : appealQueued ? (
              <AmNotice tone="info" title="Review request in your to-do list">You'll submit the request when you get to it at your computer (about 30 minutes).</AmNotice>
            ) : (
              <div className="fb-stack">
                <p className="fb-small">If you think this restriction is a mistake, request a review. You'll need to explain your business and confirm your ads follow our standards (a 30-minute task). Most reviews take 2–4 days.</p>
                <div><AmButton variant="primary" icon={RotateCcw} onClick={() => act(g => startAppeal(g, acc.id))}>Request review</AmButton></div>
              </div>
            )}
          </div>
        </AmCard>
      )}

      {banned && (
        <AmCard title="Keep advertising" subtitle="While this account can't run ads">
          <div className="fb-grid-2">
            <div className="fb-option">
              <UserPlus size={22} />
              <strong>Open a backup ad account</strong>
              <span className="fb-small fb-muted">A new account under a new business portfolio. It starts over at the lowest spending limit and payment threshold.</span>
              {backupBlock ? <span className="fb-small fb-warn-text">{backupBlock}</span> : <AmButton onClick={() => setConfirm('backup')}>Create ad account</AmButton>}
            </div>
            <div className="fb-option">
              <Building2 size={22} />
              <strong>Rent an agency ad account</strong>
              <span className="fb-small fb-muted">An aged account with higher limits and fewer restrictions. {amFmt.money(AGENCY_SETUP_FEE.fadbook)} setup, then 3–6% of ad spend.</span>
              {rentBlock ? <span className="fb-small fb-warn-text">{rentBlock}</span> : <AmButton onClick={() => setConfirm('rent')}>Rent account</AmButton>}
            </div>
          </div>
          {others.length > 0 && campaigns.length > 0 && (
            <div className="fb-stack fb-mt">
              <strong className="fb-small">Copy your campaigns to a working account</strong>
              <div className="fb-inline fb-wrap">
                <AmSelect
                  value={copyTo || null}
                  onChange={setCopyTo}
                  placeholder="Choose an ad account"
                  width={300}
                  options={others.map(o => ({ value: o.id, label: o.name, description: `ID ${displayId(o)}` }))}
                  ariaLabel="Destination account"
                />
                <AmButton
                  icon={Copy}
                  disabled={!copyTo}
                  onClick={() => {
                    let n = 0
                    act(g => { for (const c of campaigns) if (copyCampaignToAccount(g, c.id, copyTo)) n++ })
                    setCopied(`${n} campaign${n === 1 ? '' : 's'} copied. New ads go through review and learning starts over.`)
                  }}
                >
                  Copy {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'}
                </AmButton>
              </div>
              {copied && <AmNotice tone="success" onDismiss={() => setCopied(null)}>{copied} <button type="button" className="am-name-link" onClick={() => { ui.set({ accountId: copyTo }); navigate('manage/campaigns') }}>Go to that account</button></AmNotice>}
            </div>
          )}
        </AmCard>
      )}

      {(bans > 0 || bannedUntil != null) && (
        <AmNotice tone={bannedUntil != null && today < bannedUntil ? 'error' : 'warning'} title="Advertising history">
          {bans} ad account restriction{bans === 1 ? '' : 's'} on your business.{' '}
          {bannedUntil != null && today < bannedUntil ? `You can't create new ad accounts until ${formatDate(bannedUntil, 'md')}.` : 'More restrictions can lead to a temporary ban on creating ad accounts.'}
        </AmNotice>
      )}

      <AmCard title="Account signals" subtitle="What we look at when we review accounts">
        <ul className="fb-signals">
          {signals.map(sg => (
            <li key={sg.label}>
              {sg.ok ? <CircleCheck size={18} className="fb-ok" /> : <TriangleAlert size={18} className="fb-bad" />}
              <div className="fb-stack-tight">
                <strong>{sg.label}</strong>
                <span className="fb-small fb-muted">{sg.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </AmCard>

      <AmCard title="Rejected ads" subtitle={rejected.length ? `${rejected.length} ad${rejected.length === 1 ? '' : 's'} can't run` : undefined} flush>
        {rejected.length === 0 ? (
          <div className="fb-empty"><CircleCheck size={22} className="fb-ok" /><span className="fb-muted">No rejected ads. Keep claims realistic and avoid implying things about people's bodies or health.</span></div>
        ) : (
          <table className="fb-grid">
            <thead><tr><th>Ad</th><th>Policy</th><th /></tr></thead>
            <tbody>
              {rejected.map(a => {
                const cr = creatives.get(a.creativeId)
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="fb-inline">
                        <ImageWithFallback src={cr?.thumb} alt={a.name} width={36} height={36} radius={4} fallbackLabel={a.name} />
                        <div className="fb-stack-tight">
                          <strong>{a.name}</strong>
                          <span className="fb-small fb-muted">{s.ads.campaigns.find(c => c.id === a.campaignId)?.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="fb-small">{a.rejectReason ?? 'Doesn\'t follow Advertising Standards.'}</td>
                    <td>
                      <div className="fb-inline">
                        <AmButton size="sm" icon={RotateCcw} onClick={() => act(g => requestAdReview(g, a.id))}>Request review</AmButton>
                        <AmButton size="sm" variant="link" onClick={() => { ui.set({ level: 'ad', sel: { campaign: [a.campaignId], adset: [a.adSetId], ad: [a.id] } }); navigate('manage/ads') }}>Edit ad</AmButton>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </AmCard>

      {confirm && (
        <AmModal
          inline
          open
          onClose={() => { setConfirm(null); setOpenErr(null) }}
          title={confirm === 'backup' ? 'Create a new ad account?' : 'Rent an agency ad account?'}
          size="sm"
          footer={<><AmButton onClick={() => { setConfirm(null); setOpenErr(null) }}>Cancel</AmButton><AmButton variant="primary" onClick={() => doOpen(confirm === 'rent')}>{confirm === 'backup' ? 'Create' : `Pay ${amFmt.money(AGENCY_SETUP_FEE.fadbook)} and rent`}</AmButton></>}
        >
          <p className="fb-small">
            {confirm === 'backup'
              ? 'Your new account starts with a low daily spending limit and has to build trust again. Running the same risky ads there can get it restricted too, and repeated restrictions can ban you from creating accounts for 30 days.'
              : `The agency charges a ${amFmt.money(AGENCY_SETUP_FEE.fadbook)} setup fee now (on your default payment method) and adds 3–6% to every ad bill. Agency accounts have higher limits and are restricted less often.`}
          </p>
          {openErr && <AmNotice tone="error">{openErr}</AmNotice>}
        </AmModal>
      )}
    </div>
  )
}
