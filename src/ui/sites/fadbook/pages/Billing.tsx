// Billing & payments: current balance vs. payment threshold, "Pay now" (required after a failed
// charge), the daily spending limit, payment methods and the payment activity log.
import { CreditCard, Landmark, ReceiptText } from 'lucide-react'
import type { AccountRef, AdAccount, AdBillingRecord, GameState } from '../../../../core/types'
import { act } from '../../../../core/store'
import { openSite } from '../../../../core/ui'
import { dayOf, firstOfNextMonth, formatClock, formatDate } from '../../../../core/time'
import { BENCHMARKS } from '../../../../data/benchmarks'
import { accountSpendLimit, nextBillingThreshold, payAdBalance } from '../../../../sim/ads'
import { AmButton, AmCard, AmNotice, AmRadio, AmTag, amFmt } from '../../../kit/adsmanager'
import { displayId, entityNumericId } from '../data'

const REASON: Record<AdBillingRecord['reason'], string> = { threshold: 'Billing threshold reached', monthly: 'Monthly billing date', manual: 'Manual payment' }

export function cardLast4(s: GameState): string {
  return String(Math.abs(s.meta.seed * 7919) % 10000).padStart(4, '0')
}
function methodLabel(s: GameState, m: AccountRef | null): string {
  if (m === 'card') return `Chaise Sapphire •••• ${cardLast4(s)}`
  if (m === 'bank') return 'Chaise checking •••• ' + String(Math.abs(s.meta.seed * 104729) % 10000).padStart(4, '0')
  return 'Not charged'
}

export default function Billing({ s, acc, navigate }: { s: GameState; acc: AdAccount; navigate: (p: string) => void }) {
  const today = dayOf(s.time.hour)
  const threshold = nextBillingThreshold(s, acc.id)
  const limit = accountSpendLimit(s, acc.id)
  const history = (acc.billingHistory ?? []).slice().reverse()
  const failed = acc.status === 'payment_failed'
  const ladder = BENCHMARKS.fadbook.billingThresholds
  const cardAvail = s.finance.card.frozen ? 0 : Math.max(0, s.finance.card.limit - s.finance.card.balance)
  const pay = () => act(g => { payAdBalance(g, acc.id) })
  const setMethod = (m: AccountRef) => act(g => {
    const a = g.ads.accounts.find(x => x.id === acc.id)
    if (a) a.payWith = m
  })
  const lastFailed = history.find(h => h.status === 'failed')
  return (
    <div className="fb-page">
      <div className="fb-page-head">
        <div>
          <h1>Billing &amp; payments</h1>
          <p className="fb-muted">{acc.name} · Ad account ID: {displayId(acc)}</p>
        </div>
      </div>
      {failed && (
        <AmNotice
          tone="error"
          title="Your ads are paused because a payment failed"
          actions={<AmButton variant="primary" size="sm" icon={CreditCard} onClick={pay}>Pay now {amFmt.money(acc.unbilled)}</AmButton>}
        >
          {acc.statusReason ?? 'We couldn\'t charge your payment method.'} Make sure your payment method has enough available funds, then pay your
          outstanding balance. Delivery resumes as soon as the payment goes through.
          {lastFailed && <> Last attempt: {formatDate(dayOf(lastFailed.hour), 'md')}, {formatClock(lastFailed.hour)}.</>}
        </AmNotice>
      )}
      {acc.rentedFeePct != null && (
        <AmNotice tone="info" title={`Billed through ${acc.agencyName ?? 'your agency'}`}>
          This is an agency account. Spend is billed with a {(acc.rentedFeePct * 100).toFixed(1)}% agency fee on top.
        </AmNotice>
      )}
      <div className="fb-grid-3">
        <AmCard title="Current balance" titleTip="Ad spend that hasn't been charged yet. You're charged when your balance reaches your payment threshold and on your monthly billing date, whichever comes first.">
          <div className="fb-big">{amFmt.money(acc.unbilled)}</div>
          <span className="fb-meter"><span style={{ width: `${Math.min(100, (acc.unbilled / Math.max(1, threshold)) * 100)}%`, background: failed ? 'var(--am-danger)' : undefined }} /></span>
          <p className="fb-small fb-muted">
            {failed ? 'Payment overdue.' : `You'll be charged when your balance reaches ${amFmt.money(threshold)} or on ${formatDate(firstOfNextMonth(today), 'short')}.`}
          </p>
          <AmButton variant={failed ? 'primary' : 'secondary'} disabled={acc.unbilled <= 0} onClick={pay}>Pay now</AmButton>
        </AmCard>
        <AmCard title="Payment threshold" titleTip="The amount of spend that triggers a charge. It rises automatically as you pay on time.">
          <div className="fb-big">{amFmt.money(threshold)}</div>
          <div className="fb-ladder" aria-label="Threshold levels">
            {ladder.map(t => (
              <span key={t} className={`fb-ladder-step${t === threshold ? ' fb-ladder-on' : t < threshold ? ' fb-ladder-done' : ''}`}>{amFmt.money0(t)}</span>
            ))}
          </div>
          <p className="fb-small fb-muted">Paying on time raises your threshold, so you're charged less often.</p>
        </AmCard>
        <AmCard title="Account spending limit" titleTip="The most this ad account can spend per day across all campaigns. New accounts start low and the limit increases as you spend and pay successfully.">
          <div className="fb-big">{Number.isFinite(limit) ? amFmt.money(limit) : 'No limit'}<span className="fb-muted fb-small"> / day</span></div>
          {Number.isFinite(limit) && <span className="fb-meter"><span style={{ width: `${Math.min(100, (acc.todaySpend / limit) * 100)}%` }} /></span>}
          <p className="fb-small fb-muted">Spent today: {amFmt.money(acc.todaySpend)}. Lifetime spend: {amFmt.money(acc.lifetimeSpend)}.</p>
          {(acc.failedPayments ?? 0) > 0 && <p className="fb-small fb-warn-text">Recent failed payments are holding back limit increases.</p>}
        </AmCard>
      </div>

      <AmCard title="Payment methods" actions={<AmButton size="sm" variant="link" onClick={() => openSite('bank', '')}>Open Chaise Bank</AmButton>}>
        <div className="fb-stack">
          <AmRadio
            checked={acc.payWith === 'card'}
            onChange={() => setMethod('card')}
            label={<span className="fb-inline"><CreditCard size={16} /> {methodLabel(s, 'card')} {acc.payWith === 'card' && <AmTag tone="blue">Default</AmTag>}</span>}
            description={s.finance.card.frozen ? 'Card is frozen: charges will fail until it\'s paid.' : `Available credit: ${amFmt.money(cardAvail)}`}
          />
          <AmRadio
            checked={acc.payWith === 'bank'}
            onChange={() => setMethod('bank')}
            label={<span className="fb-inline"><Landmark size={16} /> {methodLabel(s, 'bank')} {acc.payWith === 'bank' && <AmTag tone="blue">Default</AmTag>}</span>}
            description={`Available balance: ${amFmt.money(s.finance.cash)}`}
          />
          <p className="fb-small fb-muted">If the default method is declined, we'll try your other method before pausing your ads.</p>
        </div>
      </AmCard>

      <AmCard title="Payment activity" flush actions={<span className="fb-small fb-muted"><ReceiptText size={14} /> {history.length} transaction{history.length === 1 ? '' : 's'}</span>}>
        {history.length === 0 ? (
          <div className="fb-empty"><span className="fb-muted">No payments yet. Your first charge happens when your balance reaches {amFmt.money(threshold)}.</span></div>
        ) : (
          <table className="fb-grid">
            <thead><tr><th>Date</th><th className="fb-hide-narrow">Transaction ID</th><th className="fb-hide-narrow">Payment method</th><th>Reason</th><th className="fb-r">Amount</th><th>Payment status</th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td>{formatDate(dayOf(h.hour), 'short')}</td>
                  <td className="fb-mono fb-hide-narrow">{entityNumericId(h.id).slice(0, 16)}-{entityNumericId(h.id + 'x').slice(-7)}</td>
                  <td className="fb-hide-narrow">{methodLabel(s, h.method)}</td>
                  <td>{REASON[h.reason]}{h.threshold ? ` (${amFmt.money(h.threshold)})` : ''}</td>
                  <td className="fb-r">{amFmt.money(h.amount)}</td>
                  <td><AmTag tone={h.status === 'paid' ? 'green' : 'red'}>{h.status === 'paid' ? 'Paid' : 'Failed'}</AmTag></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AmCard>
      <p className="fb-small fb-muted">
        Ad charges post to your Chaise statement as "{acc.rentedFeePct != null ? `${acc.agencyName ?? 'Agency'}` : 'Fadbook Ads'}". Need to see your
        overall spend? <button type="button" className="am-name-link" onClick={() => navigate('overview')}>Account overview</button>
      </p>
    </div>
  )
}
