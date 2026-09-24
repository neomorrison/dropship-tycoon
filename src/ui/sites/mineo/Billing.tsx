// Mineo — Plan & billing: status, renewal, cancel/resume, invoices from the bank ledger.
import { useMemo, useState } from 'react'
import { CalendarClock, Check, CreditCard, Receipt, RotateCcw, XCircle } from 'lucide-react'
import { act, useGS } from '../../../core/store'
import { dayOf, formatDate } from '../../../core/time'
import { MINEO_MONTHLY, cancelSpyTool, subscribeSpyTool } from '../../../sim/market'
import { cx } from '../../kit/common'
import { usd, useSpyActive } from './data'

export default function Billing() {
  const active = useSpyActive()
  const until = useGS(s => s.catalog.spyToolUntilDay)
  const autoRenew = useGS(s => !!s.catalog.spyToolAutoRenew)
  const ledger = useGS(s => s.finance.ledger)
  const bills = useGS(s => s.finance.bills)
  const [confirm, setConfirm] = useState(false)
  const [failed, setFailed] = useState(false)
  const invoices = useMemo(() => ledger.filter(e => /mineo/i.test(e.memo) && e.amount < 0).slice().reverse(), [ledger])
  const bill = useMemo(() => bills.find(b => b.ref === 'mineo'), [bills])

  const subscribe = () => {
    let ok = false
    act(s => { ok = subscribeSpyTool(s) })
    setFailed(!ok)
  }
  const cancel = () => { act(s => cancelSpyTool(s)); setConfirm(false) }

  const status = active ? (autoRenew ? 'active' : 'canceling') : 'inactive'
  return (
    <div className="mi-page">
      <div className="mi-page-head"><div><h1><CreditCard size={22} /> Plan & billing</h1><p className="mi-muted">Manage your Mineo subscription.</p></div></div>
      <div className="mi-grid2">
        <section className="mi-panel mi-plan">
          <div className="mi-plan-top">
            <div>
              <div className="mi-plan-name">Mineo Pro</div>
              <div className="mi-plan-price">${MINEO_MONTHLY}<span>/month</span></div>
            </div>
            <span className={cx('mi-status', `mi-status-${status}`)}>{status === 'active' ? 'Active' : status === 'canceling' ? 'Canceled' : 'Inactive'}</span>
          </div>
          <div className="mi-plan-line">
            <CalendarClock size={15} />
            {status === 'active' && <span>Renews on <b>{formatDate(bill?.nextDueDay ?? until ?? 0, 'long')}</b> · {usd(MINEO_MONTHLY)} to your {bill?.payWith === 'bank' ? 'checking account' : 'card'}</span>}
            {status === 'canceling' && <span>Access until <b>{formatDate(until ?? 0, 'long')}</b>. You won’t be charged again.</span>}
            {status === 'inactive' && <span>{until !== null ? `Your access ended on ${formatDate(until, 'long')}.` : 'You don’t have an active plan.'}</span>}
          </div>
          <ul className="mi-plan-feats">
            <li><Check size={14} /> Ad library across Fadbook, Instaglam & TikTak</li>
            <li><Check size={14} /> Product analytics, advertisers & first-seen dates</li>
            <li><Check size={14} /> Top ads with hook types, formats and prices</li>
          </ul>
          <div className="mi-plan-actions">
            {status === 'active' && !confirm && <button type="button" className="mi-btn mi-btn-ghost" onClick={() => setConfirm(true)}><XCircle size={15} /> Cancel subscription</button>}
            {status === 'active' && confirm && (
              <div className="mi-confirm">
                <span>Cancel auto-renewal? You keep access until {formatDate(until ?? 0, 'md')}.</span>
                <button type="button" className="mi-btn mi-btn-danger" onClick={cancel}>Yes, cancel</button>
                <button type="button" className="mi-btn mi-btn-ghost" onClick={() => setConfirm(false)}>Keep Pro</button>
              </div>
            )}
            {status === 'canceling' && <button type="button" className="mi-btn mi-btn-primary" onClick={subscribe}><RotateCcw size={15} /> Resume auto-renewal</button>}
            {status === 'inactive' && <button type="button" className="mi-btn mi-btn-primary" onClick={subscribe}><CreditCard size={15} /> Subscribe — ${MINEO_MONTHLY}/mo</button>}
          </div>
          {failed && <p className="mi-price-err">Payment declined. Check your balances in Chaise Bank.</p>}
        </section>
        <section className="mi-panel">
          <header className="mi-panel-head"><h3><Receipt size={16} /> Invoices</h3></header>
          {invoices.length ? (
            <div className="mi-table-wrap">
              <table className="mi-table mi-table-static">
                <thead><tr><th>Date</th><th>Description</th><th>Paid with</th><th className="mi-num">Amount</th></tr></thead>
                <tbody>
                  {invoices.map(e => (
                    <tr key={e.id}>
                      <td>{formatDate(dayOf(e.hour), 'short')}</td>
                      <td>Mineo Pro · monthly</td>
                      <td>{e.account === 'card' ? 'Chaise Sapphire card' : 'Chaise checking'}</td>
                      <td className="mi-num">{usd(-e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="mi-muted mi-small">No invoices yet.</div>}
        </section>
      </div>
    </div>
  )
}
