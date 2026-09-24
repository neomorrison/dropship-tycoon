// Chaise Bank — quarterly estimated taxes (Normal/Realistic).
import { useState } from 'react'
import { Landmark } from 'lucide-react'
import type { GameState } from '../../../core/types'
import { formatDate, yearOf } from '../../../core/time'
import { TAX_RULES, nextTaxDue, payTaxes, setTaxAutopay, taxDueDates } from '../../../sim/finance'
import { taxInfo } from './bankData'
import { Amount, Btn, FlashBar, KV, Notice, Panel } from './ui'
import { SiteLayer } from './SiteLayer'
import { relDay, run, safe, todayOf, useFlash, usd } from './lifeCommon'

export function TaxesPage({ s }: { s: GameState }) {
  const today = todayOf(s)
  const t = taxInfo(s)
  const [flash, setFlash] = useFlash(6000)
  const [confirm, setConfirm] = useState(false)
  const outstanding = t.owed + t.pending
  // In January the next payment (Q4) belongs to last year's taxes: show that year's schedule and numbers
  const taxYear = safe(() => nextTaxDue(today).year, yearOf(today))
  const priorYear = taxYear < yearOf(today)
  const schedule = safe(() => taxDueDates(taxYear), [])
  const payments = [...(s.finance.taxes.payments ?? [])].reverse()
  const paidFor = (label: string) => (s.finance.taxes.payments ?? []).filter(p => p.label.endsWith(label)).reduce((a, p) => a + p.amount, 0)
  const yearProfit = priorYear ? s.finance.taxes.priorYearProfit ?? 0 : t.ytdProfit
  const yearPaid = priorYear ? s.finance.taxes.priorYearPaid ?? 0 : s.finance.taxes.paidYtd

  if (!t.enabled) {
    return (
      <div className="bk-page">
        <h1 className="bk-h1">Taxes</h1>
        <Notice tone="info" title="Estimated taxes are off on Chill">
          On Normal and Realistic, self-employed profit is taxed quarterly: {Math.round(TAX_RULES.rate * 100)}% of year-to-date business profit, due Apr 15, Jun 15, Sep 15 and Jan 15.
        </Notice>
        <Panel title="This year so far">
          <KV label="Business profit (YTD)" value={<Amount n={t.ytdProfit} />} />
        </Panel>
      </div>
    )
  }

  const pay = () => {
    setConfirm(false)
    const paid = run(st => payTaxes(st)) ?? 0
    if (paid > 0) setFlash({ tone: 'success', text: `${usd(paid)} sent to the Infernal Revenue Service (EFTPS). Confirmation #${Math.floor(100000 + (s.seq % 900000))}.` })
    else setFlash({ tone: 'critical', text: 'Payment failed — not enough in checking.' })
  }
  const toggleAutopay = (on: boolean) => {
    run(st => setTaxAutopay(st, on))
    setFlash({ tone: 'info', text: on ? 'Estimated payments will draft from checking on each due date.' : 'Autopay off. Pay each quarter by the due date to avoid penalties.' })
  }

  return (
    <div className="bk-page">
      <h1 className="bk-h1">Taxes</h1>
      <p className="bk-lede">As a self-employed seller you pay estimated tax each quarter: about {Math.round(TAX_RULES.rate * 100)}% of your year-to-date business profit (self-employment tax plus income tax), minus what you've already paid.</p>
      <FlashBar flash={flash} />
      {t.owed > 0 && (
        <Notice tone="critical" title={`Past due: ${usd(t.owed)}`}>
          Unpaid estimated tax accrues a {Math.round(TAX_RULES.penaltyPerMonth * 100)}% penalty every month. Penalties so far: {usd(t.penalties)}.
        </Notice>
      )}
      <div className="bk-grid">
        <div className="bk-col-main">
          <Panel>
            <div className="bk-tax-hero">
              <div className="bk-tax-icon"><Landmark size={26} /></div>
              <div className="bk-tax-main">
                <span className="bk-muted">{t.label} estimated payment · due {formatDate(t.dueDay, 'long')} ({relDay(t.dueDay, today).toLowerCase()})</span>
                <div className="bk-acct-big"><Amount n={outstanding > 0 ? outstanding : t.estimate} /></div>
                <span className="bk-muted">
                  {t.pending > 0 ? 'Amount set by your 14-day reminder' : `Estimate so far — finalized ${formatDate(t.dueDay - 14, 'md')}`}
                </span>
              </div>
              <div className="bk-tax-actions">
                <Btn disabled={outstanding <= 0} onClick={() => setConfirm(true)}>Pay {outstanding > 0 ? usd(outstanding) : 'now'}</Btn>
                {outstanding <= 0 && <small className="bk-muted">Nothing is due yet.</small>}
              </div>
            </div>
          </Panel>
          <Panel title={`${taxYear} payment schedule`} pad={false}>
            <div className="bk-table-wrap">
              <table className="bk-table">
                <thead><tr><th>Quarter</th><th>Due date</th><th>Status</th></tr></thead>
                <tbody>
                  {schedule.map(q => {
                    const paid = paidFor(q.label)
                    return (
                      <tr key={q.day}>
                        <td>{q.label}</td>
                        <td>{formatDate(q.day, 'short')}</td>
                        <td>
                          {paid > 0 ? <span className="bk-pill is-ok">Paid {usd(paid)}</span>
                            : q.day === t.dueDay ? <span className="bk-pill is-info">Next</span>
                              : q.day < today ? <span className="bk-pill">{t.owed > 0 ? 'Unpaid' : 'Nothing due'}</span>
                                : <span className="bk-pill">Upcoming</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Payment history" pad={false}>
            {payments.length === 0 ? (
              <p className="bk-empty bk-pad">No estimated payments yet.</p>
            ) : (
              <div className="bk-table-wrap">
                <table className="bk-table">
                  <thead><tr><th>Date</th><th>Description</th><th className="r">Amount</th></tr></thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={i}><td>{formatDate(p.day, 'short')}</td><td>{p.label}</td><td className="r"><Amount n={p.amount} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        <aside className="bk-col-side">
          <Panel title={priorYear ? `${taxYear} tax year` : 'Year to date'}>
            <KV label="Business profit" value={<Amount n={yearProfit} />} sub={priorYear ? 'Full year' : `Through ${formatDate(today - 1, 'md')}`} />
            <KV label={`Tax at ${Math.round(TAX_RULES.rate * 100)}%`} value={<Amount n={Math.max(0, yearProfit * TAX_RULES.rate)} />} />
            <KV label={priorYear ? `Paid for ${taxYear}` : 'Paid this year'} value={<Amount n={yearPaid} />} />
            {t.penalties > 0 && <KV label="Penalties" value={<Amount n={t.penalties} />} />}
            {priorYear && <KV label={`${yearOf(today)} business profit so far`} value={<Amount n={t.ytdProfit} />} sub={`First ${yearOf(today)} payment due Apr 15`} />}
          </Panel>
          <Panel title="Autopay">
            <label className={`bk-switch${t.autopay ? ' is-on' : ''}`}>
              <input type="checkbox" checked={t.autopay} onChange={e => toggleAutopay(e.target.checked)} />
              <span className="bk-switch-track"><span /></span>
              <span>Pay estimated taxes automatically from checking</span>
            </label>
            <p className="bk-fine">A tax draft that bounces still counts as unpaid. Set aside roughly a quarter of every profitable month.</p>
          </Panel>
        </aside>
      </div>
      {confirm && (
        <SiteLayer className="bk-layer" onClose={() => setConfirm(false)} pauseKey="bk-tax-confirm">
          <div className="bk-modal" role="dialog" aria-modal>
            <h3>Pay estimated tax</h3>
            <KV label="Payee" value="Infernal Revenue Service (EFTPS)" />
            <KV label="From" value="Total Checking" />
            <KV label="Amount" value={<Amount n={outstanding} />} strong />
            <div className="bk-modal-actions">
              <Btn kind="secondary" onClick={() => setConfirm(false)}>Cancel</Btn>
              <Btn onClick={pay} disabled={outstanding > s.finance.cash}>Send payment</Btn>
            </div>
            {outstanding > s.finance.cash && <p className="bk-err">Checking has {usd(s.finance.cash)} — not enough.</p>}
          </div>
        </SiteLayer>
      )}
    </div>
  )
}
