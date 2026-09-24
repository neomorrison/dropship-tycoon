// Payment: balance vs billing threshold, daily spending limit, payment method, transactions,
// "Pay now" when a charge failed.
import { CreditCard, Landmark, RefreshCw } from 'lucide-react'
import type { AdBillingRecord } from '../../../../core/types'
import { act } from '../../../../core/store'
import { firstOfNextMonth, formatClock, formatDate } from '../../../../core/time'
import { accountSpendLimit, nextBillingThreshold, payAdBalance } from '../../../../sim/ads'
import { BENCHMARKS } from '../../../../data/benchmarks'
import { AmButton, AmNotice, AmRadio, AmTable, MetricCell, amFmt, type AmColumn } from '../../../kit/adsmanager'
import { cx } from '../../../kit/common'
import { EmptyBlock, Panel, PageHead, Pill, useAccount, useGame } from '../common'
import { last4 } from '../data'
import { AccountTabs } from './AccountInfo'

const REASON: Record<AdBillingRecord['reason'], string> = {
  threshold: 'Automatic payment · threshold reached',
  monthly: 'Automatic payment · monthly bill',
  manual: 'Manual payment',
}

export default function Billing() {
  const s = useGame()
  const { account } = useAccount()
  const acc = account!
  const card = `Chaise Sapphire •••• ${last4(s.meta.saveId, 'card')}`
  const bank = `Chaise Checking •••• ${last4(s.meta.saveId, 'bank')}`
  const limit = accountSpendLimit(s, acc.id)
  const threshold = nextBillingThreshold(s, acc.id)
  const ladder = BENCHMARKS.tiktak.spendLimitLadder
  const nextLimit = ladder[Math.min(ladder.length - 1, acc.spendLimitTier + 1)]
  const history = [...(acc.billingHistory ?? [])].reverse()
  const failed = acc.status === 'payment_failed'
  const pay = () => act(st => { payAdBalance(st, acc.id) })
  const setMethod = (m: 'card' | 'bank') => act(st => { const a = st.ads.accounts.find(x => x.id === acc.id); if (a) a.payWith = m })
  const cardAvail = s.finance.card.frozen ? 0 : Math.max(0, s.finance.card.limit - s.finance.card.balance)

  const cols: AmColumn<AdBillingRecord>[] = [
    { id: 'date', header: 'Date', width: 170, sortValue: r => r.hour, render: r => <span style={{ fontSize: 12 }}>{formatDate(Math.floor(r.hour / 24), 'short')} {formatClock(r.hour)}</span> },
    { id: 'id', header: 'Transaction ID', width: 150, render: r => <span className="tt-num tt-muted" style={{ fontSize: 12 }}>{`TT${r.id.replace(/\W/g, '').toUpperCase().padStart(10, '0').slice(-10)}`}</span> },
    { id: 'type', header: 'Type', width: 260, render: r => <span style={{ fontSize: 12 }}>{REASON[r.reason]}{r.threshold ? ` (${amFmt.money0(r.threshold)})` : ''}</span> },
    { id: 'method', header: 'Payment method', width: 200, render: r => <span style={{ fontSize: 12 }}>{r.method === 'card' ? card : r.method === 'bank' ? bank : '—'}</span> },
    { id: 'amount', header: 'Amount', align: 'right', width: 120, sortValue: r => r.amount, render: r => <MetricCell value={amFmt.money(r.amount)} /> },
    { id: 'status', header: 'Status', width: 110, render: r => (r.status === 'paid' ? <Pill tone="success" dot>Paid</Pill> : <Pill tone="critical" dot>Failed</Pill>) },
  ]

  return (
    <div className="tt-page tt-page-narrow">
      <PageHead title="Payment" sub={`Automatic payments · ${acc.name}`} />
      <AccountTabs active="billing" />
      {failed && (
        <AmNotice tone="error" title="Your last payment failed" actions={<AmButton variant="primary" size="sm" icon={RefreshCw} onClick={pay}>Pay now</AmButton>}>
          {acc.statusReason ?? 'We couldn\'t charge your payment method.'} Ads are paused until the balance of <b>{amFmt.money(acc.unbilled)}</b> is paid. Add money to checking or pay down your card at Chaise Bank, then try again.
        </AmNotice>
      )}
      <div className="tt-grid-half">
        <Panel title="Balance">
          <div className="tt-col" style={{ gap: 12 }}>
            <div className="tt-row" style={{ alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 600 }} className="tt-num">{amFmt.money(acc.unbilled)}</span>
              <span className="tt-muted tt-small">unbilled spend{acc.rentedFeePct != null ? ' (incl. agency fee)' : ''}</span>
            </div>
            <div className={cx('tt-progress', failed && 'tt-progress-crit')}><span style={{ width: `${Math.min(100, (acc.unbilled / Math.max(1, threshold)) * 100)}%` }} /></div>
            <span className="tt-muted tt-small">
              Next automatic charge when your balance reaches <b>{amFmt.money0(threshold)}</b>, or on {formatDate(firstOfNextMonth(Math.floor(s.time.hour / 24)), 'md')} (monthly bill), whichever comes first. Your threshold rises as payments go through.
            </span>
            <div><AmButton size="sm" icon={CreditCard} disabled={acc.unbilled <= 0} onClick={pay}>{failed ? 'Pay now' : 'Make a payment'}</AmButton></div>
          </div>
        </Panel>
        <Panel title="Account spending limit">
          <div className="tt-col" style={{ gap: 12 }}>
            <div className="tt-row" style={{ alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 600 }} className="tt-num">{Number.isFinite(limit) ? amFmt.money0(limit) : 'No limit'}</span>
              <span className="tt-muted tt-small">per day</span>
            </div>
            {Number.isFinite(limit) && (
              <>
                <div className={cx('tt-progress', acc.todaySpend >= limit - 0.01 && 'tt-progress-warn')}><span style={{ width: `${Math.min(100, (acc.todaySpend / limit) * 100)}%` }} /></div>
                <span className="tt-muted tt-small">{amFmt.money(acc.todaySpend)} spent today. {acc.todaySpend >= limit - 0.01 ? 'Limit reached: ads resume at midnight.' : ''}</span>
              </>
            )}
            <span className="tt-faint tt-small">
              New accounts get a low daily limit. It increases automatically as your lifetime spend grows and payments succeed{Number.isFinite(nextLimit) && nextLimit > limit ? ` (next step: ${amFmt.money0(nextLimit)}/day)` : ''}. Failed payments and policy issues hold it back.
            </span>
          </div>
        </Panel>
      </div>
      <Panel title="Payment method">
        <div className="tt-col" style={{ gap: 12 }}>
          <AmRadio checked={acc.payWith === 'card'} onChange={() => setMethod('card')} label={<span className="tt-row" style={{ gap: 6 }}><CreditCard size={15} /> {card}</span>} description={`Credit card · ${amFmt.money0(cardAvail)} available`} />
          <AmRadio checked={acc.payWith === 'bank'} onChange={() => setMethod('bank')} label={<span className="tt-row" style={{ gap: 6 }}><Landmark size={15} /> {bank}</span>} description={`Bank account · ${amFmt.money(s.finance.cash)} balance`} />
          <span className="tt-faint tt-small">If the primary method is declined, the charge is tried on your other method before it fails.</span>
        </div>
      </Panel>
      <Panel title="Transactions" pad={false}>
        {history.length === 0 ? (
          <EmptyBlock art="generic" title="No transactions yet" body="Charges show up here when your spend reaches the billing threshold." />
        ) : (
          <div style={{ padding: 16 }}>
            <AmTable rows={history} columns={cols} rowKey={r => r.id} selectable={false} totals={false} maxHeight={420} defaultSort={{ columnId: 'date', direction: 'desc' }} />
          </div>
        )}
      </Panel>
    </div>
  )
}
