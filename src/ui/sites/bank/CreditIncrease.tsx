// Chaise Bank — credit-limit increase panel (Pay card + Offers pages).
import { CreditCard } from 'lucide-react'
import type { GameState } from '../../../core/types'
import { formatDate } from '../../../core/time'
import { CARD_RULES, creditIncreaseEligibility, requestCreditIncrease } from '../../../sim/finance'
import { cardInfo } from './bankData'
import { Btn, Meter, Panel } from './ui'
import { run, simRead, todayOf, usd, type Flash } from './lifeCommon'

export function CreditIncreasePanel({ s, setFlash }: { s: GameState; setFlash: (f: Flash | null) => void }) {
  const today = todayOf(s)
  const c = cardInfo(s)
  const inc = simRead(s, st => creditIncreaseEligibility(st, today), { ok: false as boolean, reason: 'Unavailable right now.' as string | undefined })
  const streak = Math.min(c.onTimeStreak, CARD_RULES.onTimeForIncrease)
  const last = s.finance.card.lastIncreaseDay
  const ask = () => {
    const r = run(st => requestCreditIncrease(st))
    if (r?.ok && r.newLimit) setFlash({ tone: 'success', text: `Approved! Your credit limit is now ${usd(r.newLimit, false)} (was ${usd(c.limit, false)}).` })
    else setFlash({ tone: 'warning', text: r?.reason ?? 'We couldn’t approve an increase right now.' })
  }
  // the streak requirement is already shown by the meter; only repeat other reasons
  const reason = !inc.ok && inc.reason && !/on-time/i.test(inc.reason) ? inc.reason : null
  return (
    <Panel title="Credit limit increase">
      <div className="bk-goal">
        <CreditCard size={22} />
        <div>
          <p className="bk-fine" style={{ marginTop: 0 }}>
            Current limit {usd(c.limit, false)}. Chaise reviews your payment history and your last 60 days of income; approved increases are 1.5–2× your limit. One review every {CARD_RULES.increaseCooldownDays} days.
          </p>
          <div className="bk-util is-wide">
            <Meter value={streak / CARD_RULES.onTimeForIncrease} tone={streak >= CARD_RULES.onTimeForIncrease ? 'ok' : 'warn'} />
            <span>On-time statements in a row: {c.onTimeStreak} of {CARD_RULES.onTimeForIncrease} needed</span>
          </div>
          {last !== null && last !== undefined && <p className="bk-muted bk-small">Last increase {formatDate(last, 'md')}.</p>}
          {inc.ok ? <Btn small onClick={ask}>Request increase</Btn> : reason ? <p className="bk-muted">{reason}</p> : null}
        </div>
      </div>
    </Panel>
  )
}
