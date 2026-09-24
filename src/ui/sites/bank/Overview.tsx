// Chaise Bank — Accounts overview.
import { useMemo } from 'react'
import { ArrowDownLeft, ArrowUpRight, CreditCard, Landmark, PiggyBank, Sparkles } from 'lucide-react'
import type { GameState } from '../../../core/types'
import { formatDate } from '../../../core/time'
import { inventoryValue, netWorth } from '../../../core/money'
import { capitalOffer, creditIncreaseEligibility } from '../../../sim/finance'
import { acctName, alertsFor, cardInfo, cashFlow, taxInfo } from './bankData'
import { Amount, Btn, KV, Meter, Notice, Panel } from './ui'
import { relDay, safe, simRead, todayOf, usd } from './lifeCommon'

export function Overview({ s, navigate, greet }: { s: GameState; navigate: (p: string) => void; greet: string }) {
  const today = todayOf(s)
  const c = cardInfo(s)
  const alerts = alertsFor(s)
  const flow = useMemo(() => cashFlow(s, 14), [s])
  const t = taxInfo(s)
  const offer = safe(() => capitalOffer(s), null)
  const increase = simRead(s, st => creditIncreaseEligibility(st, today), { ok: false as boolean, reason: '' as string | undefined })
  const nw = safe(() => netWorth(s), s.finance.cash - s.finance.card.balance)

  // projected checking balance over the window
  const bankFlow = flow.filter(f => f.account === 'bank' && !f.held)
  let running = s.finance.cash
  let lowest = running
  let lowestDay = today
  for (const f of bankFlow) {
    running += f.amount
    if (running < lowest) { lowest = running; lowestDay = f.day }
  }
  const cardBound = flow.filter(f => f.account === 'card').reduce((a, f) => a - f.amount, 0)
  const pendingPayouts = (s.store?.payouts ?? []).filter(p => p.status !== 'paid').reduce((a, p) => a + p.amount, 0)
  const reserves = (s.store?.reserves ?? []).reduce((a, r) => a + r.amount, 0)
  const loans = s.finance.loans.reduce((a, l) => a + l.remaining, 0)
  const unbilled = (s.ads?.accounts ?? []).reduce((a, x) => a + x.unbilled, 0)
  const inv = safe(() => inventoryValue(s), 0)

  return (
    <div className="bk-page">
      <h1 className="bk-h1">{greet}</h1>
      {alerts.slice(0, 3).map((a, i) => (
        <Notice key={i} tone={a.tone} title={a.title} action={<Btn kind="link" onClick={() => navigate(a.path)}>Review</Btn>}>{a.body}</Notice>
      ))}
      <div className="bk-grid">
        <div className="bk-col-main">
          <Panel title="Bank accounts" action={<Btn kind="link" onClick={() => navigate('activity/bank')}>See activity</Btn>}>
            <div className="bk-acct">
              <div className="bk-acct-icon"><Landmark size={20} /></div>
              <div className="bk-acct-main">
                <button className="bk-acct-name" onClick={() => navigate('activity/bank')}>{acctName(s, 'bank')}</button>
                <div className="bk-acct-big"><Amount n={s.finance.cash} /></div>
                <div className="bk-acct-sub">Available balance</div>
              </div>
              <div className="bk-acct-actions">
                <Btn kind="secondary" small onClick={() => navigate('card')}>Pay card</Btn>
                <Btn kind="secondary" small onClick={() => navigate('bills')}>Bills</Btn>
              </div>
            </div>
          </Panel>

          <Panel title="Credit cards" action={<Btn kind="link" onClick={() => navigate('activity/card')}>See activity</Btn>}>
            <div className="bk-acct">
              <div className="bk-acct-icon is-card"><CreditCard size={20} /></div>
              <div className="bk-acct-main">
                <button className="bk-acct-name" onClick={() => navigate('card')}>{acctName(s, 'card')}</button>
                <div className="bk-acct-big"><Amount n={c.balance} /></div>
                <div className="bk-acct-sub">Current balance{c.frozen ? ' · Card frozen' : ''}</div>
                <div className="bk-util">
                  <Meter value={c.utilization} />
                  <span>{usd(c.available)} available of {usd(c.limit, false)} ({Math.round(c.utilization * 100)}% used)</span>
                </div>
              </div>
              <div className="bk-acct-side">
                {c.dueDay !== null && c.statementBalance > 0 ? (
                  <>
                    <KV label="Next payment due" value={formatDate(c.dueDay, 'md')} sub={relDay(c.dueDay, today)} />
                    <KV label="Minimum payment" value={<Amount n={c.minRemaining} />} />
                    <KV label="Statement balance" value={<Amount n={c.statementBalance} />} />
                  </>
                ) : (
                  <KV label="Payment due" value="No payment due" sub={`Statement closes on the ${s.finance.card.statementDom}th`} />
                )}
                <Btn small onClick={() => navigate('card')}>Pay card</Btn>
              </div>
            </div>
          </Panel>

          <Panel title="Money in & out — next 14 days" action={<span className="bk-muted">Projected checking</span>}>
            <div className="bk-flow-summary">
              <div>
                <span className="bk-muted">Checking today</span>
                <b><Amount n={s.finance.cash} /></b>
              </div>
              <div>
                <span className="bk-muted">Lowest projected</span>
                <b className={lowest < 0 ? 'bk-neg' : ''}><Amount n={lowest} /></b>
                <small>{lowest < s.finance.cash ? formatDate(lowestDay, 'md') : 'no dip'}</small>
              </div>
              <div>
                <span className="bk-muted">Headed to your card</span>
                <b><Amount n={cardBound} /></b>
                <small>{usd(c.available)} available</small>
              </div>
            </div>
            {lowest < 0 && (
              <Notice tone="critical" title="Checking is projected to go negative">
                Scheduled payments exceed what's coming in before {formatDate(lowestDay, 'md')}. Declined rent, salaries or card autopay cost fees and trust — move money or cut spend now.
              </Notice>
            )}
            {cardBound > c.available && !c.frozen && (
              <Notice tone="warning" title="Your card can't absorb what's coming">
                {usd(cardBound)} of ad billing and card-billed bills is headed to a card with {usd(c.available)} left. Failed ad billing pauses every campaign on that account.
              </Notice>
            )}
            {flow.length === 0 ? (
              <p className="bk-empty">Nothing scheduled in the next two weeks.</p>
            ) : (
              <ul className="bk-flow">
                {flow.map((f, i) => (
                  <li key={i} className={f.held ? 'is-held' : ''}>
                    <span className={`bk-flow-icon ${f.amount >= 0 ? 'is-in' : 'is-out'}`}>{f.amount >= 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span>
                    <span className="bk-flow-day">{f.day === today ? 'Today' : formatDate(f.day, 'md')}</span>
                    <span className="bk-flow-label">
                      {f.label}
                      <small>{[f.account === 'card' ? 'Sapphire card' : 'Checking', f.detail, f.estimate ? 'estimate' : ''].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="bk-flow-amt"><Amount n={f.amount} colored /></span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="bk-col-side">
          <Panel title="Net worth">
            <div className="bk-nw"><Amount n={nw} /></div>
            <div className="bk-nw-rows">
              <KV label="Checking" value={<Amount n={s.finance.cash} />} />
              <KV label="Sapphire card" value={<Amount n={-c.balance} />} />
              {s.store?.created && <KV label="Shopifly balance + payouts" value={<Amount n={(s.store.pendingBalance ?? 0) + pendingPayouts} />} />}
              {reserves > 0 && <KV label="Shopifly reserve (held)" value={<Amount n={reserves} />} />}
              {inv > 0 && <KV label="Inventory at cost" value={<Amount n={inv} />} />}
              {unbilled > 0 && <KV label="Unbilled ad spend" value={<Amount n={-unbilled} />} />}
              {loans > 0 && <KV label="Shopifly Capital owed" value={<Amount n={-loans} />} />}
            </div>
          </Panel>

          {offer ? (
            <div className="bk-offer-tile">
              <Sparkles size={20} />
              <div>
                <b>Pre-approved: {usd(offer.amount, false)} in Shopifly Capital</b>
                <p>Flat fee {usd(offer.fee, false)}, repaid from {Math.round(offer.withholdPct * 100)}% of your payouts.</p>
                <Btn kind="link" onClick={() => navigate('offers')}>See offer</Btn>
              </div>
            </div>
          ) : increase.ok ? (
            <div className="bk-offer-tile">
              <Sparkles size={20} />
              <div>
                <b>You may qualify for a higher credit limit</b>
                <p>Three on-time payments in a row. Request a review in seconds.</p>
                <Btn kind="link" onClick={() => navigate('card')}>Request increase</Btn>
              </div>
            </div>
          ) : null}

          {t.enabled && (
            <Panel title="Estimated taxes" action={<Btn kind="link" onClick={() => navigate('taxes')}>Details</Btn>}>
              <KV label={`${t.label} due ${formatDate(t.dueDay, 'md')}`} value={<Amount n={(t.pending || t.estimate) + t.owed} />} sub={t.autopay ? 'Autopay from checking' : 'Pay manually'} />
              <KV label="Business profit this year" value={<Amount n={t.ytdProfit} />} />
            </Panel>
          )}

          <Panel title="Savings goal">
            <div className="bk-goal">
              <PiggyBank size={22} />
              <div>
                <b>Ad-spend buffer</b>
                <p>Keep at least a week of ad spend in checking so a billing charge never declines.</p>
                <BufferMeter s={s} />
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function BufferMeter({ s }: { s: GameState }) {
  const today = todayOf(s)
  let spend = 0
  for (let d = today - 7; d < today; d++) {
    const p = s.finance.pnl[d]
    if (p) spend += p.adSpendFadbook + p.adSpendTiktak
  }
  if (spend <= 0) return <p className="bk-muted">No ad spend in the last 7 days.</p>
  const ratio = s.finance.cash / spend
  return (
    <div className="bk-buffer">
      <Meter value={Math.min(1, ratio)} tone={ratio >= 1 ? 'ok' : ratio >= 0.5 ? 'warn' : 'bad'} />
      <span>{usd(s.finance.cash, false)} of {usd(spend, false)} (7-day ad spend)</span>
    </div>
  )
}
