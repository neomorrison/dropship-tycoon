// Chaise Bank — Sapphire card: pay, autopay, statements, rates, credit-limit increase.
import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import type { GameState } from '../../../core/types'
import { formatDate } from '../../../core/time'
import { CARD_RULES, creditIncreaseEligibility, payCardBalance, requestCreditIncrease, setAutopay } from '../../../sim/finance'
import { acctLast4, acctName, cardInfo } from './bankData'
import { Amount, Btn, FlashBar, KV, Meter, Notice, Panel } from './ui'
import { SiteLayer } from './SiteLayer'
import { relDay, round2, run, simRead, todayOf, useFlash, usd } from './lifeCommon'

type PayChoice = 'min' | 'statement' | 'current' | 'other'

export function CardPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const today = todayOf(s)
  const c = cardInfo(s)
  const [choice, setChoice] = useState<PayChoice>(c.minRemaining > 0 ? 'statement' : 'current')
  const [other, setOther] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [flash, setFlash] = useFlash(6000)
  const inc = simRead(s, st => creditIncreaseEligibility(st, today), { ok: false as boolean, reason: 'Unavailable right now.' as string | undefined })

  const amountFor = (ch: PayChoice) =>
    ch === 'min' ? c.minRemaining : ch === 'statement' ? c.fullRemaining : ch === 'current' ? c.balance : Number(other.replace(/[^0-9.]/g, '')) || 0
  const amount = round2(Math.min(amountFor(choice), c.balance))
  const err =
    amount <= 0 ? 'Enter an amount greater than $0.00.'
      : amount > s.finance.cash + 0.005 ? `That's more than your checking balance (${usd(s.finance.cash)}).`
        : null

  const pay = () => {
    const paid = run(st => payCardBalance(st, amount)) ?? 0
    setConfirm(false)
    if (paid > 0) {
      setFlash({ tone: 'success', text: `Payment of ${usd(paid)} scheduled for today from ${acctName(s, 'bank')}. Thank you!` })
      setOther('')
    } else setFlash({ tone: 'critical', text: 'Payment could not be processed. Check your checking balance.' })
  }
  const changeAutopay = (mode: 'none' | 'min' | 'full') => {
    run(st => setAutopay(st, mode))
    setFlash({ tone: 'info', text: mode === 'none' ? 'Autopay turned off. Pay manually before each due date.' : `Autopay set to ${mode === 'min' ? 'minimum payment' : 'statement balance'}.` })
  }
  const askIncrease = () => {
    const r = run(st => requestCreditIncrease(st))
    if (r?.ok && r.newLimit) setFlash({ tone: 'success', text: `Approved! Your new credit limit is ${usd(r.newLimit, false)}.` })
    else setFlash({ tone: 'warning', text: r?.reason ?? 'We couldn’t approve an increase right now.' })
  }

  const statements = [...c.statements].reverse().slice(0, 12)
  const dueIn = c.dueDay !== null ? c.dueDay - today : null

  return (
    <div className="bk-page">
      <h1 className="bk-h1">Sapphire card <span className="bk-h1-sub">(...{acctLast4(s, 'card')})</span></h1>
      <FlashBar flash={flash} />
      {c.frozen && (
        <Notice tone="critical" title="Card frozen">
          After {CARD_RULES.latesToFreeze} late payments new purchases are blocked. Pay the past-due amount{c.pastDue > 0 ? ` of ${usd(c.pastDue)}` : ''} and the card reopens automatically.
        </Notice>
      )}
      {!c.frozen && c.pastDue > 0 && (
        <Notice tone="critical" title={`Past due: ${usd(c.pastDue)}`}>
          You missed a minimum payment. A {usd(CARD_RULES.lateFee, false)} late fee was added and your APR moved to the {(CARD_RULES.penaltyApr * 100).toFixed(2)}% penalty rate.
        </Notice>
      )}
      <div className="bk-grid">
        <div className="bk-col-main">
          <Panel>
            <div className="bk-card-hero">
              <div className="bk-plastic">
                <span className="bk-plastic-brand">CHAISE</span>
                <span className="bk-plastic-name">Sapphire</span>
                <span className="bk-plastic-chip" />
                <span className="bk-plastic-num">•••• {acctLast4(s, 'card')}</span>
                <span className="bk-plastic-visa">VIZA</span>
              </div>
              <div className="bk-card-stats">
                <KV label="Current balance" value={<Amount n={c.balance} />} strong />
                <KV label="Available credit" value={<Amount n={c.available} />} />
                <KV label="Credit limit" value={<Amount n={c.limit} cents={false} />} />
                <div className="bk-util is-wide">
                  <Meter value={c.utilization} />
                  <span>{Math.round(c.utilization * 100)}% of your limit used</span>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Make a payment">
            <div className="bk-pay-grid">
              <div className="bk-pay-summary">
                <KV label="Statement balance" value={<Amount n={c.statementBalance} />} sub={c.statements.length ? `Closed ${formatDate(c.statements[c.statements.length - 1].closeDay, 'md')}` : 'No statement yet'} />
                <KV label="Minimum payment due" value={<Amount n={c.minRemaining} />} sub={c.minRemaining <= 0 && c.statementBalance > 0 ? 'Minimum paid ✓' : undefined} />
                <KV label="Payment due date" value={c.dueDay !== null ? formatDate(c.dueDay, 'md') : '—'} sub={dueIn !== null && dueIn >= 0 ? relDay(c.dueDay as number, today) : undefined} />
              </div>
              <div className="bk-pay-form">
                <fieldset className="bk-radios">
                  <legend>Payment amount</legend>
                  <PayRadio id="min" label="Minimum payment" value={c.minRemaining} choice={choice} setChoice={setChoice} disabled={c.minRemaining <= 0} />
                  <PayRadio id="statement" label="Remaining statement balance" value={c.fullRemaining} choice={choice} setChoice={setChoice} disabled={c.fullRemaining <= 0} />
                  <PayRadio id="current" label="Current balance" value={c.balance} choice={choice} setChoice={setChoice} disabled={c.balance <= 0} />
                  <label className={`bk-radio${choice === 'other' ? ' is-on' : ''}`}>
                    <input type="radio" name="bk-pay" checked={choice === 'other'} onChange={() => setChoice('other')} />
                    <span>Other amount</span>
                    <span className="bk-money-input">
                      $<input inputMode="decimal" value={other} placeholder="0.00" onFocus={() => setChoice('other')} onChange={e => setOther(e.target.value)} />
                    </span>
                  </label>
                </fieldset>
                <div className="bk-from">
                  <span className="bk-muted">Pay from</span>
                  <b>{acctName(s, 'bank')}</b>
                  <span className="bk-muted">Available {usd(s.finance.cash)}</span>
                </div>
                {c.balance > 0 && err && choice === 'other' && other && <p className="bk-err">{err}</p>}
                <Btn disabled={c.balance <= 0 || !!err} onClick={() => setConfirm(true)}>Pay {amount > 0 ? usd(amount) : ''}</Btn>
                <p className="bk-fine">
                  Paying your full statement balance by the due date means no interest on purchases. Paying only the minimum means interest on everything, including new purchases, at {(c.apr * 100).toFixed(2)}% APR.
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Statements" pad={false}>
            {statements.length === 0 ? (
              <p className="bk-empty bk-pad">Your first statement closes on the {s.finance.card.statementDom}th.</p>
            ) : (
              <div className="bk-table-wrap">
                <table className="bk-table">
                  <thead>
                    <tr><th>Closing date</th><th className="r">Balance</th><th className="r">Minimum</th><th>Due</th><th className="r">Interest</th><th className="r">Fees</th><th className="r">Paid</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {statements.map(st => (
                      <tr key={st.closeDay}>
                        <td>{formatDate(st.closeDay, 'short')}</td>
                        <td className="r"><Amount n={st.balance} /></td>
                        <td className="r"><Amount n={st.minDue} /></td>
                        <td>{formatDate(st.dueDay, 'md')}</td>
                        <td className="r">{st.interest > 0 ? <Amount n={st.interest} /> : '—'}</td>
                        <td className="r">{st.fees > 0 ? <Amount n={st.fees} /> : '—'}</td>
                        <td className="r"><Amount n={st.paid} /></td>
                        <td><StatementStatus status={st.status} dueDay={st.dueDay} today={today} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <aside className="bk-col-side">
          <Panel title="Autopay">
            <p className="bk-fine">Automatically pays from {acctName(s, 'bank')} on each due date.</p>
            <fieldset className="bk-radios">
              {([
                ['none', 'Off', 'You pay manually each month.'],
                ['min', 'Minimum payment', 'Never late — but you pay interest on the rest.'],
                ['full', 'Statement balance', 'No interest, as long as checking can cover it.'],
              ] as const).map(([id, label, hint]) => (
                <label key={id} className={`bk-radio is-block${c.autopay === id ? ' is-on' : ''}`}>
                  <input type="radio" name="bk-autopay" checked={c.autopay === id} onChange={() => changeAutopay(id)} />
                  <span>
                    <b>{label}</b>
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </Panel>

          <Panel title="Rates & fees">
            <KV label="Purchase APR" value={`${(c.apr * 100).toFixed(2)}%`} sub={c.penalty ? `Penalty rate — back to ${(c.baseApr * 100).toFixed(2)}% after ${CARD_RULES.penaltyCureStreak} on-time payments (${c.onTimeStreak}/${CARD_RULES.penaltyCureStreak})` : 'Variable'} />
            <KV label="Penalty APR" value={`${(CARD_RULES.penaltyApr * 100).toFixed(2)}%`} sub="Applies after a late payment" />
            <KV label="Late payment fee" value={usd(CARD_RULES.lateFee, false)} />
            <KV label="Minimum payment" value={`${usd(CARD_RULES.minPaymentFloor, false)} or ${(CARD_RULES.minPaymentPct * 100).toFixed(0)}% + interest & fees`} />
            <KV label="Late payments" value={String(c.lateCount)} sub={`${CARD_RULES.latesToFreeze} lates freeze the card`} />
          </Panel>

          <Panel title="Credit limit increase">
            <div className="bk-goal">
              <CreditCard size={22} />
              <div>
                <p className="bk-fine" style={{ marginTop: 0 }}>
                  Chaise reviews your payment history and recent income. You need {CARD_RULES.onTimeForIncrease} on-time statements in a row (you have {c.onTimeStreak}); reviews are allowed every {CARD_RULES.increaseCooldownDays} days.
                </p>
                {inc.ok ? <Btn small onClick={askIncrease}>Request increase</Btn> : <p className="bk-muted">{inc.reason}</p>}
              </div>
            </div>
          </Panel>
          <Btn kind="link" onClick={() => navigate('activity/card')}>See card activity →</Btn>
        </aside>
      </div>

      {confirm && (
        <SiteLayer className="bk-layer" onClose={() => setConfirm(false)} pauseKey="bk-pay-confirm">
          <div className="bk-modal" role="dialog" aria-modal>
            <h3>Confirm your payment</h3>
            <KV label="Pay to" value={acctName(s, 'card')} />
            <KV label="Pay from" value={acctName(s, 'bank')} />
            <KV label="Amount" value={<Amount n={amount} />} strong />
            <KV label="Date" value={`${formatDate(today, 'short')} (today)`} />
            <div className="bk-modal-actions">
              <Btn kind="secondary" onClick={() => setConfirm(false)}>Cancel</Btn>
              <Btn onClick={pay}>Pay now</Btn>
            </div>
          </div>
        </SiteLayer>
      )}
    </div>
  )
}

function PayRadio({ id, label, value, choice, setChoice, disabled }: { id: PayChoice; label: string; value: number; choice: PayChoice; setChoice: (c: PayChoice) => void; disabled?: boolean }) {
  return (
    <label className={`bk-radio${choice === id ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input type="radio" name="bk-pay" checked={choice === id} disabled={disabled} onChange={() => setChoice(id)} />
      <span>{label}</span>
      <span className="bk-radio-amt"><Amount n={value} /></span>
    </label>
  )
}

function StatementStatus({ status, dueDay, today }: { status: string; dueDay: number; today: number }) {
  if (status === 'paid_full') return <span className="bk-pill is-ok">Paid in full</span>
  if (status === 'paid_min') return <span className="bk-pill is-info">Minimum paid</span>
  if (status === 'late') return <span className="bk-pill is-bad">Late</span>
  return <span className="bk-pill">{dueDay >= today ? 'Open' : 'Unpaid'}</span>
}
