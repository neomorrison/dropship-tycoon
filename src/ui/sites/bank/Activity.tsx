// Chaise Bank — transactions ledger with filters (account, category, business/personal, date, search).
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { GameState, LedgerCategory, LedgerEntry } from '../../../core/types'
import { dayOf, formatDate, hourOfDay } from '../../../core/time'
import { CATEGORY_LABEL, CATEGORY_ORDER, acctName } from './bankData'
import { Amount, Btn, Panel } from './ui'
import { clockLabel, todayOf } from './lifeCommon'

type Range = '7' | '30' | '90' | 'all'
type Kind = 'all' | 'business' | 'personal'

const PAGE = 60

export function ActivityPage({ s, account, navigate }: { s: GameState; account: 'all' | 'bank' | 'card'; navigate: (p: string) => void }) {
  const today = todayOf(s)
  const [category, setCategory] = useState<LedgerCategory | 'all'>('all')
  const [kind, setKind] = useState<Kind>('all')
  const [range, setRange] = useState<Range>('30')
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)

  // running balance per account (walk backward from the current balance)
  const balances = useMemo(() => {
    const out = new Map<string, number>()
    let bank = s.finance.cash
    let card = s.finance.card.balance
    for (let i = s.finance.ledger.length - 1; i >= 0; i--) {
      const e = s.finance.ledger[i]
      if (e.account === 'bank') {
        out.set(e.id, bank)
        bank -= e.amount
      } else {
        out.set(e.id, card)
        card += e.amount
      }
    }
    return out
  }, [s.finance.ledger, s.finance.cash, s.finance.card.balance])

  const presentCats = useMemo(() => {
    const set = new Set<LedgerCategory>()
    for (const e of s.finance.ledger) set.add(e.category)
    return CATEGORY_ORDER.filter(c => set.has(c))
  }, [s.finance.ledger])

  const rows = useMemo(() => {
    const from = range === 'all' ? -Infinity : today - Number(range) + 1
    const needle = q.trim().toLowerCase()
    const out: LedgerEntry[] = []
    for (let i = s.finance.ledger.length - 1; i >= 0; i--) {
      const e = s.finance.ledger[i]
      if (account !== 'all' && e.account !== account) continue
      if (category !== 'all' && e.category !== category) continue
      if (kind === 'business' && !e.business) continue
      if (kind === 'personal' && e.business) continue
      if (dayOf(e.hour) < from) continue
      if (needle && !e.memo.toLowerCase().includes(needle) && !CATEGORY_LABEL[e.category].toLowerCase().includes(needle)) continue
      out.push(e)
    }
    return out
  }, [s.finance.ledger, account, category, kind, range, q, today])

  const moneyIn = rows.reduce((a, e) => a + (e.amount > 0 && e.category !== 'transfer' ? e.amount : 0), 0)
  const moneyOut = rows.reduce((a, e) => a + (e.amount < 0 && e.category !== 'transfer' ? -e.amount : 0), 0)
  const byCat = useMemo(() => {
    const m = new Map<LedgerCategory, number>()
    for (const e of rows) if (e.amount < 0 && e.category !== 'transfer') m.set(e.category, (m.get(e.category) ?? 0) - e.amount)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [rows])
  const maxCat = byCat.length ? byCat[0][1] : 1

  // group by day, like the real statement view
  const visible = rows.slice(0, shown)
  const groups: { day: number; items: LedgerEntry[] }[] = []
  for (const e of visible) {
    const d = dayOf(e.hour)
    const g = groups[groups.length - 1]
    if (g && g.day === d) g.items.push(e)
    else groups.push({ day: d, items: [e] })
  }

  return (
    <div className="bk-page">
      <h1 className="bk-h1">Account activity</h1>
      <div className="bk-seg" role="tablist">
        {(['all', 'bank', 'card'] as const).map(a => (
          <button key={a} role="tab" aria-selected={account === a} className={account === a ? 'is-on' : ''} onClick={() => { setShown(PAGE); navigate(a === 'all' ? 'activity' : `activity/${a}`) }}>
            {a === 'all' ? 'All accounts' : acctName(s, a)}
          </button>
        ))}
      </div>
      <div className="bk-grid">
        <div className="bk-col-main">
          <Panel pad={false}>
            <div className="bk-filters">
              <label className="bk-search">
                <Search size={16} />
                <input value={q} onChange={e => { setQ(e.target.value); setShown(PAGE) }} placeholder="Search descriptions" />
              </label>
              <select value={range} onChange={e => { setRange(e.target.value as Range); setShown(PAGE) }} aria-label="Date range">
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All available</option>
              </select>
              <select value={category} onChange={e => { setCategory(e.target.value as LedgerCategory | 'all'); setShown(PAGE) }} aria-label="Category">
                <option value="all">All categories</option>
                {presentCats.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
              <select value={kind} onChange={e => { setKind(e.target.value as Kind); setShown(PAGE) }} aria-label="Business or personal">
                <option value="all">Business & personal</option>
                <option value="business">Business only</option>
                <option value="personal">Personal only</option>
              </select>
            </div>
            {rows.length === 0 ? (
              <p className="bk-empty bk-pad">No transactions match these filters.</p>
            ) : (
              <div className="bk-table-wrap">
                <table className="bk-table bk-ledger">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="bk-hide-sm">Category</th>
                      {account === 'all' && <th className="bk-hide-sm">Account</th>}
                      <th className="r">Amount</th>
                      {account !== 'all' && <th className="r bk-hide-sm">Balance</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => g.items.map((e, i) => (
                      <tr key={e.id}>
                        <td className="bk-date">{i === 0 ? formatDate(g.day, 'md') : ''}<small>{clockLabel(hourOfDay(e.hour))}</small></td>
                        <td>
                          <span className="bk-memo">{e.memo}</span>
                          <span className="bk-memo-sub">
                            <span className="bk-show-sm">{CATEGORY_LABEL[e.category]} · </span>
                            {e.business ? <span className="bk-tag is-biz">Business</span> : <span className="bk-tag">Personal</span>}
                          </span>
                        </td>
                        <td className="bk-hide-sm"><span className="bk-cat">{CATEGORY_LABEL[e.category]}</span></td>
                        {account === 'all' && <td className="bk-hide-sm bk-muted">{e.account === 'bank' ? 'Checking' : 'Sapphire'}</td>}
                        <td className="r">
                          <DisplayAmount e={e} />
                        </td>
                        {account !== 'all' && <td className="r bk-hide-sm bk-muted"><Amount n={balances.get(e.id) ?? 0} /></td>}
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
            {rows.length > shown && (
              <div className="bk-more">
                <Btn kind="secondary" small onClick={() => setShown(n => n + PAGE)}>See more activity ({rows.length - shown} more)</Btn>
              </div>
            )}
          </Panel>
          <p className="bk-fine">Chaise keeps your most recent 800 transactions online.</p>
        </div>
        <aside className="bk-col-side">
          <Panel title="Summary">
            <div className="bk-sum">
              <div><span className="bk-muted">Money in</span><b className="bk-pos"><Amount n={moneyIn} /></b></div>
              <div><span className="bk-muted">Money out</span><b><Amount n={moneyOut} /></b></div>
            </div>
            <p className="bk-fine">Transfers between your own accounts (card payments) are excluded.</p>
          </Panel>
          {byCat.length > 0 && (
            <Panel title="Top spending">
              <ul className="bk-cats">
                {byCat.map(([cat, amt]) => (
                  <li key={cat}>
                    <button onClick={() => { setCategory(cat); setShown(PAGE) }}>
                      <span>{CATEGORY_LABEL[cat]}</span>
                      <Amount n={amt} cents={false} />
                    </button>
                    <div className="bk-cat-bar"><div style={{ width: `${(amt / maxCat) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}

/** Card ledger entries are signed from the bank's point of view (charge < 0, payment > 0). */
function DisplayAmount({ e }: { e: LedgerEntry }) {
  return <Amount n={e.amount} colored={e.amount > 0} />
}
