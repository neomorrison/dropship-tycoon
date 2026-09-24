// Chaise Bank — recurring bills & autopay drafts (rent, phone, gym, plan, apps, contractors…).
import { useMemo } from 'react'
import type { GameState, RecurringBill } from '../../../core/types'
import { formatDate } from '../../../core/time'
import { billsDueWithin, monthlyBurn } from '../../../sim/finance'
import { CATEGORY_LABEL } from './bankData'
import { Amount, Btn, Notice, Panel } from './ui'
import { relDay, safe, todayOf, usd } from './lifeCommon'

const CADENCE: Record<RecurringBill['cadence'], string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

export function BillsPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const today = todayOf(s)
  const bills = useMemo(() => [...s.finance.bills].sort((a, b) => (b.arrears ?? 0) - (a.arrears ?? 0) || a.nextDueDay - b.nextDueDay), [s.finance.bills])
  const burnBiz = safe(() => monthlyBurn(s, b => b.business), 0)
  const burnPersonal = safe(() => monthlyBurn(s, b => !b.business), 0)
  const next30 = safe(() => billsDueWithin(s, today, 30), [])
  const fromBank = next30.filter(b => b.bill.payWith === 'bank').reduce((a, b) => a + b.amount, 0)
  const fromCard = next30.filter(b => b.bill.payWith === 'card').reduce((a, b) => a + b.amount, 0)
  const arrears = bills.filter(b => (b.arrears ?? 0) > 0)

  return (
    <div className="bk-page">
      <h1 className="bk-h1">Bills & autopay</h1>
      <p className="bk-lede">Everything that drafts automatically. Payments from checking need the cash there on the due date; card-billed subscriptions add to your Sapphire balance.</p>
      {/* the card's own autopay lives on the card page: say so here, where people look for "autopay" */}
      <Notice
        tone={s.finance.card.autopay === 'full' ? 'success' : 'info'}
        title={`Sapphire card autopay: ${s.finance.card.autopay === 'full' ? 'statement balance' : s.finance.card.autopay === 'min' ? 'minimum payment only' : 'off'}`}
        action={<Btn kind="secondary" small onClick={() => navigate('card')}>Change</Btn>}
      >
        {s.finance.card.autopay === 'full' ? 'Your statement is paid in full from checking each month, so you pay no interest.' : 'Paying only the minimum (or nothing) means interest on your whole balance. Set it to the statement balance on the card page.'}
      </Notice>
      {arrears.map(b => (
        <Notice key={b.id} tone="critical" title={`${b.name} — ${usd(b.arrears ?? 0)} past due`}>
          {b.failedSince !== null && b.failedSince !== undefined ? `Declined since ${formatDate(b.failedSince, 'md')}. ` : ''}
          We retry every day from {b.payWith === 'bank' ? 'checking' : 'your card'}.{b.ref === 'rent' ? ' Two missed rent payments lead to eviction.' : b.ref?.startsWith('staff:') ? ' Freelancers stop working after 3 unpaid days.' : ''}
        </Notice>
      ))}
      <div className="bk-grid">
        <div className="bk-col-main">
          <Panel title="Scheduled payments" pad={false}>
            {bills.length === 0 ? (
              <p className="bk-empty bk-pad">No recurring payments.</p>
            ) : (
              <div className="bk-table-wrap">
                <table className="bk-table">
                  <thead>
                    <tr><th>Payee</th><th className="r">Amount</th><th className="bk-hide-sm">Frequency</th><th>Next payment</th><th className="bk-hide-sm">Pay from</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {bills.map(b => (
                      <tr key={b.id}>
                        <td>
                          <span className="bk-memo">{b.name}</span>
                          <span className="bk-memo-sub">
                            {CATEGORY_LABEL[b.category]} · {b.business ? <span className="bk-tag is-biz">Business</span> : <span className="bk-tag">Personal</span>}
                          </span>
                        </td>
                        <td className="r"><Amount n={b.amount} /></td>
                        <td className="bk-hide-sm">{CADENCE[b.cadence]}</td>
                        <td>{formatDate(b.nextDueDay, 'md')}<small className="bk-block bk-muted">{relDay(b.nextDueDay, today)}</small></td>
                        <td className="bk-hide-sm">{b.payWith === 'bank' ? 'Checking' : 'Sapphire card'}</td>
                        <td>{(b.arrears ?? 0) > 0 ? <span className="bk-pill is-bad">Past due</span> : <span className="bk-pill is-ok">Scheduled</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Due in the next 30 days" pad={false}>
            {next30.length === 0 ? (
              <p className="bk-empty bk-pad">Nothing due.</p>
            ) : (
              <ul className="bk-flow">
                {next30.map((b, i) => (
                  <li key={`${b.bill.id}-${b.day}-${i}`}>
                    <span className="bk-flow-day">{b.day === today ? 'Today' : formatDate(b.day, 'md')}</span>
                    <span className="bk-flow-label">{b.bill.name}<small>{b.bill.payWith === 'bank' ? 'Checking' : 'Sapphire card'}</small></span>
                    <span className="bk-flow-amt"><Amount n={-b.amount} colored /></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <aside className="bk-col-side">
          <Panel title="Monthly fixed costs">
            <div className="bk-sum">
              <div><span className="bk-muted">Business</span><b><Amount n={burnBiz} /></b></div>
              <div><span className="bk-muted">Personal</span><b><Amount n={burnPersonal} /></b></div>
            </div>
            <p className="bk-fine">Weekly bills are converted to a monthly equivalent (× 52 ÷ 12).</p>
          </Panel>
          <Panel title="Next 30 days">
            <div className="bk-sum">
              <div><span className="bk-muted">From checking</span><b className={fromBank > s.finance.cash ? 'bk-neg' : ''}><Amount n={fromBank} /></b></div>
              <div><span className="bk-muted">To your card</span><b><Amount n={fromCard} /></b></div>
            </div>
            {fromBank > s.finance.cash && (
              <p className="bk-err">Checking ({usd(s.finance.cash)}) doesn't cover what drafts in the next 30 days yet. Payouts and paychecks may close the gap — check the projection on Accounts.</p>
            )}
            <Btn kind="link" onClick={() => navigate('')}>See cash-flow projection →</Btn>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
