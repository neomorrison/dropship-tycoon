// Chaise Bank — offers: Shopifly Capital (merchant cash advance) and credit-limit increase.
import { useState } from 'react'
import { BadgeDollarSign, CreditCard, TrendingUp } from 'lucide-react'
import type { GameState } from '../../../core/types'
import { formatDate } from '../../../core/time'
import { CAPITAL_RULES, CARD_RULES, acceptCapital, activeCapital, capitalOffer, creditIncreaseEligibility, requestCreditIncrease } from '../../../sim/finance'
import { cardInfo } from './bankData'
import { Amount, Btn, FlashBar, KV, Meter, Notice, Panel } from './ui'
import { SiteLayer } from './SiteLayer'
import { run, safe, simRead, todayOf, useFlash, usd } from './lifeCommon'

export function OffersPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const today = todayOf(s)
  const offer = safe(() => capitalOffer(s), null)
  const loan = safe(() => activeCapital(s), undefined)
  const c = cardInfo(s)
  const inc = simRead(s, st => creditIncreaseEligibility(st, today), { ok: false as boolean, reason: 'Unavailable right now.' as string | undefined })
  const [flash, setFlash] = useFlash(7000)
  const [confirm, setConfirm] = useState(false)

  const accept = () => {
    setConfirm(false)
    const ok = run(st => acceptCapital(st))
    setFlash(ok ? { tone: 'success', text: 'Funds deposited to checking. Repayment starts with your next Shopifly payout.' } : { tone: 'critical', text: 'This offer is no longer available.' })
  }
  const increase = () => {
    const r = run(st => requestCreditIncrease(st))
    setFlash(r?.ok && r.newLimit ? { tone: 'success', text: `Approved — new limit ${usd(r.newLimit, false)}.` } : { tone: 'warning', text: r?.reason ?? 'Not approved.' })
  }
  const pastLoans = s.finance.loans.filter(l => l.remaining <= 0.005)

  return (
    <div className="bk-page">
      <h1 className="bk-h1">Offers for you</h1>
      <FlashBar flash={flash} />
      <div className="bk-grid">
        <div className="bk-col-main">
          <Panel title="Shopifly Capital">
            {loan ? (
              <div className="bk-offer">
                <div className="bk-offer-icon"><BadgeDollarSign size={26} /></div>
                <div className="bk-offer-main">
                  <b>Active advance — {usd(loan.principal, false)}</b>
                  <p>{Math.round(loan.withholdPct * 100)}% of each Shopifly payout goes to repayment until the total is repaid. No interest and no due date; the fee is fixed.</p>
                  <div className="bk-util is-wide">
                    <Meter value={(loan.repaid ?? 0) / Math.max(1, (loan.repaid ?? 0) + loan.remaining)} tone="ok" />
                    <span>{usd(loan.repaid ?? 0)} repaid · {usd(loan.remaining)} remaining</span>
                  </div>
                  <KV label="Funded" value={formatDate(loan.takenDay, 'short')} />
                  {loan.feePct !== undefined && <KV label="Fixed fee" value={`${(loan.feePct * 100).toFixed(1)}% (${usd(loan.principal * loan.feePct)})`} />}
                </div>
              </div>
            ) : offer ? (
              <div className="bk-offer">
                <div className="bk-offer-icon"><BadgeDollarSign size={26} /></div>
                <div className="bk-offer-main">
                  <b>You're pre-approved for {usd(offer.amount, false)}</b>
                  <p>Based on {CAPITAL_RULES.minSalesDays} days of sales averaging {usd(offer.avgDaily ?? 0, false)}/day. Funds land in checking today.</p>
                  <KV label="Advance" value={<Amount n={offer.amount} cents={false} />} />
                  <KV label="Fixed fee" value={<Amount n={offer.fee} />} sub={offer.feePct !== undefined ? `${(offer.feePct * 100).toFixed(1)}% of the advance, whatever the repayment speed` : undefined} />
                  <KV label="Total to repay" value={<Amount n={offer.total ?? offer.amount + offer.fee} />} strong />
                  <KV label="Repayment" value={`${(offer.withholdPct * 100).toFixed(1)}% of each payout`} />
                  <Notice tone="info">
                    A cash advance is cheaper than carrying a 28% APR card only if the extra money goes into ads and inventory that already make a profit. Borrowing to "fix" an unprofitable product just makes the loss bigger.
                  </Notice>
                  <Btn onClick={() => setConfirm(true)}>Review & accept</Btn>
                </div>
              </div>
            ) : (
              <div className="bk-offer is-muted">
                <div className="bk-offer-icon"><TrendingUp size={26} /></div>
                <div className="bk-offer-main">
                  <b>No offer yet</b>
                  <p>Shopifly Capital becomes available after {CAPITAL_RULES.minSalesDays} days of sales averaging at least {usd(CAPITAL_RULES.minAvgDaily, false)}/day. Offers are about {CAPITAL_RULES.amountMultiple}× your average daily revenue, with a {Math.round(CAPITAL_RULES.feePct[0] * 100)}–{Math.round(CAPITAL_RULES.feePct[1] * 100)}% flat fee.</p>
                </div>
              </div>
            )}
            {pastLoans.length > 0 && <p className="bk-fine">{pastLoans.length} advance{pastLoans.length === 1 ? '' : 's'} repaid in full.</p>}
          </Panel>
        </div>
        <aside className="bk-col-side">
          <Panel title="Credit limit increase">
            <div className="bk-goal">
              <CreditCard size={22} />
              <div>
                <p className="bk-fine" style={{ marginTop: 0 }}>Current limit {usd(c.limit, false)}. Requires {CARD_RULES.onTimeForIncrease} on-time statements in a row; the new limit depends on your last 60 days of income.</p>
                {inc.ok ? <Btn small onClick={increase}>Request increase</Btn> : <p className="bk-muted">{inc.reason}</p>}
              </div>
            </div>
          </Panel>
          <Btn kind="link" onClick={() => navigate('card')}>Manage your card →</Btn>
        </aside>
      </div>
      {confirm && offer && (
        <SiteLayer className="bk-layer" onClose={() => setConfirm(false)} pauseKey="bk-capital-confirm">
          <div className="bk-modal" role="dialog" aria-modal>
            <h3>Accept Shopifly Capital?</h3>
            <KV label="Deposited to checking" value={<Amount n={offer.amount} cents={false} />} />
            <KV label="Total you'll repay" value={<Amount n={offer.total ?? offer.amount + offer.fee} />} strong />
            <KV label="Withheld from payouts" value={`${(offer.withholdPct * 100).toFixed(1)}%`} />
            <p className="bk-fine">Every payout will be smaller until it's repaid. Plan your ad billing around that.</p>
            <div className="bk-modal-actions">
              <Btn kind="secondary" onClick={() => setConfirm(false)}>Not now</Btn>
              <Btn onClick={accept}>Accept funds</Btn>
            </div>
          </div>
        </SiteLayer>
      )}
    </div>
  )
}
