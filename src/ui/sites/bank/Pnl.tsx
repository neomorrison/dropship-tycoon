// Chaise Bank — Business P&L by month, built from finance.pnl (daily buckets).
import { useMemo, useState, type ReactNode } from 'react'
import type { DailyPnl, GameState } from '../../../core/types'
import { emptyPnl } from '../../../core/money'
import { businessProfit } from '../../../sim/finance'
import { Amount, Notice, Panel } from './ui'
import { monthKey, monthKeyLabel, todayOf, usd } from './lifeCommon'

interface Month { key: number; p: DailyPnl; orders: number; days: number }

function addInto(a: DailyPnl, b: DailyPnl) {
  for (const k of Object.keys(a) as (keyof DailyPnl)[]) a[k] += b[k] || 0
}

export function PnlPage({ s }: { s: GameState }) {
  const today = todayOf(s)
  const months = useMemo(() => {
    const map = new Map<number, Month>()
    const ensure = (key: number) => {
      let m = map.get(key)
      if (!m) { m = { key, p: emptyPnl(), orders: 0, days: 0 }; map.set(key, m) }
      return m
    }
    for (const [dStr, p] of Object.entries(s.finance.pnl)) {
      const d = Number(dStr)
      if (!p || d > today) continue
      const m = ensure(monthKey(d))
      addInto(m.p, p)
      m.days++
    }
    for (const [dStr, sd] of Object.entries(s.store?.analytics?.daily ?? {})) {
      const d = Number(dStr)
      if (d > today) continue
      ensure(monthKey(d)).orders += sd?.orders ?? 0
    }
    ensure(monthKey(today))
    return [...map.values()].sort((a, b) => a.key - b.key)
  }, [s.finance.pnl, s.store?.analytics?.daily, today])

  const [sel, setSel] = useState<number>(monthKey(today))
  const cur = months.find(m => m.key === sel) ?? months[months.length - 1]
  const prev = months.find(m => m.key === cur.key - 1)
  const ytdKeyFrom = Math.floor(cur.key / 12) * 12
  const ytd = useMemo(() => {
    const out: Month = { key: -1, p: emptyPnl(), orders: 0, days: 0 }
    for (const m of months) if (m.key >= ytdKeyFrom && m.key <= cur.key) { addInto(out.p, m.p); out.orders += m.orders }
    return out
  }, [months, ytdKeyFrom, cur.key])
  const chart = months.slice(-6)
  const hasBusiness = months.some(m => m.p.revenue > 0 || m.p.adSpendFadbook + m.p.adSpendTiktak > 0 || m.p.cogs > 0)

  return (
    <div className="bk-page">
      <h1 className="bk-h1">Business P&L</h1>
      <p className="bk-lede">Your store's profit and loss by month, from the money that actually moved: Shopifly sales, ad billing, suppliers, apps, contractors. Inventory purchases are capitalized (they become cost of goods when the units sell).</p>
      {!hasBusiness && (
        <Notice tone="info" title="No business activity yet">
          Once your store makes sales or you spend on ads, suppliers or apps, this page turns into a monthly income statement.
        </Notice>
      )}
      <div className="bk-seg bk-seg-scroll" role="tablist">
        {months.slice(-12).map(m => (
          <button key={m.key} role="tab" aria-selected={m.key === cur.key} className={m.key === cur.key ? 'is-on' : ''} onClick={() => setSel(m.key)}>
            {monthKeyLabel(m.key)}
          </button>
        ))}
      </div>
      <div className="bk-grid">
        <div className="bk-col-main">
          <Panel title={`Income statement — ${monthKeyLabel(cur.key, true)}${cur.key === monthKey(today) ? ' (month to date)' : ''}`} pad={false}>
            <Statement cur={cur} prev={prev} ytd={ytd} ytdLabel={`YTD ${Math.floor(cur.key / 12)}`} />
          </Panel>
          {chart.length > 1 && (
            <Panel title="Last 6 months">
              <MonthChart months={chart} />
            </Panel>
          )}
        </div>
        <aside className="bk-col-side">
          <Kpis m={cur} />
          <Panel title="How to read this">
            <ul className="bk-tips">
              <li><b>MER</b> (revenue ÷ ad spend) is your real blended ROAS. Ads Manager over-reports; this doesn't.</li>
              <li><b>Operating profit</b> is what the business earned before tax. Estimated tax is 25% of it.</li>
              <li><b>Blended CPA</b> = total ad spend ÷ store orders. Compare it with your break-even CPA per product.</li>
              <li>A month can be profitable while checking shrinks: payouts land days after ad billing hits your card.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  )
}

const LINES: { label: string; get: (p: DailyPnl) => number; kind?: 'sub' | 'total' | 'neg'; indent?: boolean }[] = [
  { label: 'Gross sales', get: p => p.revenue },
  { label: 'Refunds', get: p => -p.refunds, kind: 'neg', indent: true },
  { label: 'Chargebacks & dispute fees', get: p => -p.chargebacks, kind: 'neg', indent: true },
  { label: 'Net sales', get: p => p.revenue - p.refunds - p.chargebacks, kind: 'sub' },
  { label: 'Product cost (COGS)', get: p => -p.cogs, kind: 'neg', indent: true },
  { label: 'Shipping & fulfillment', get: p => -p.shipping, kind: 'neg', indent: true },
  { label: 'Payment processing fees', get: p => -p.paymentFees, kind: 'neg', indent: true },
  { label: 'Gross profit', get: p => p.revenue - p.refunds - p.chargebacks - p.cogs - p.shipping - p.paymentFees, kind: 'sub' },
  { label: 'Ads — Fadbook', get: p => -p.adSpendFadbook, kind: 'neg', indent: true },
  { label: 'Ads — TikTak', get: p => -p.adSpendTiktak, kind: 'neg', indent: true },
  { label: 'Apps & subscriptions', get: p => -p.apps, kind: 'neg', indent: true },
  { label: 'Creatives', get: p => -p.creatives, kind: 'neg', indent: true },
  { label: 'Contractors (UpWorx)', get: p => -p.staff, kind: 'neg', indent: true },
  { label: 'Samples & other', get: p => -p.otherBusiness, kind: 'neg', indent: true },
  { label: 'Operating profit', get: p => businessProfit(p), kind: 'total' },
]

function Statement({ cur, prev, ytd, ytdLabel }: { cur: Month; prev?: Month; ytd: Month; ytdLabel: string }) {
  const rev = cur.p.revenue
  return (
    <div className="bk-table-wrap">
      <table className="bk-table bk-pnl">
        <thead>
          <tr>
            <th />
            <th className="r">{monthKeyLabel(cur.key)}</th>
            <th className="r bk-hide-sm">% of sales</th>
            <th className="r bk-hide-sm">{prev ? monthKeyLabel(prev.key) : 'Prior month'}</th>
            <th className="r">{ytdLabel}</th>
          </tr>
        </thead>
        <tbody>
          {LINES.map(l => {
            const v = l.get(cur.p)
            const pv = prev ? l.get(prev.p) : 0
            const y = l.get(ytd.p)
            return (
              <tr key={l.label} className={`${l.kind ? `is-${l.kind}` : ''}`}>
                <td className={l.indent ? 'bk-indent' : ''}>{l.label}</td>
                <td className="r"><Amount n={v} colored={l.kind === 'total'} /></td>
                <td className="r bk-hide-sm bk-muted">{rev > 0 ? `${((v / rev) * 100).toFixed(1)}%` : '—'}</td>
                <td className="r bk-hide-sm bk-muted">{prev ? <Amount n={pv} /> : '—'}</td>
                <td className="r"><Amount n={y} /></td>
              </tr>
            )
          })}
          <tr className="is-section"><td colSpan={5}>Below the line</td></tr>
          <tr>
            <td className="bk-indent">Inventory purchased (capitalized)</td>
            <td className="r"><Amount n={-cur.p.inventory} /></td>
            <td className="r bk-hide-sm" />
            <td className="r bk-hide-sm bk-muted">{prev ? <Amount n={-prev.p.inventory} /> : '—'}</td>
            <td className="r"><Amount n={-ytd.p.inventory} /></td>
          </tr>
          <tr>
            <td className="bk-indent">Paychecks (McDoodle's)</td>
            <td className="r"><Amount n={cur.p.personalIncome} /></td>
            <td className="r bk-hide-sm" />
            <td className="r bk-hide-sm bk-muted">{prev ? <Amount n={prev.p.personalIncome} /> : '—'}</td>
            <td className="r"><Amount n={ytd.p.personalIncome} /></td>
          </tr>
          <tr>
            <td className="bk-indent">Personal spending (rent, food, gear…)</td>
            <td className="r"><Amount n={-cur.p.personalSpend} /></td>
            <td className="r bk-hide-sm" />
            <td className="r bk-hide-sm bk-muted">{prev ? <Amount n={-prev.p.personalSpend} /> : '—'}</td>
            <td className="r"><Amount n={-ytd.p.personalSpend} /></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Kpis({ m }: { m: Month }) {
  const p = m.p
  const ad = p.adSpendFadbook + p.adSpendTiktak
  const profit = businessProfit(p)
  const items: { label: string; value: ReactNode; hint: string; tone?: 'good' | 'bad' }[] = [
    { label: 'MER (blended ROAS)', value: ad > 0 ? `${(p.revenue / ad).toFixed(2)}×` : '—', hint: 'Revenue ÷ total ad spend', tone: ad > 0 ? (p.revenue / ad >= 2 ? 'good' : p.revenue / ad < 1.3 ? 'bad' : undefined) : undefined },
    { label: 'Operating margin', value: p.revenue > 0 ? `${((profit / p.revenue) * 100).toFixed(1)}%` : '—', hint: 'Operating profit ÷ gross sales', tone: p.revenue > 0 ? (profit > 0 ? 'good' : 'bad') : undefined },
    { label: 'Orders', value: m.orders.toLocaleString('en-US'), hint: 'Store orders this month' },
    { label: 'Blended CPA', value: m.orders > 0 && ad > 0 ? usd(ad / m.orders) : '—', hint: 'Ad spend ÷ orders' },
    { label: 'AOV', value: m.orders > 0 ? usd(p.revenue / m.orders) : '—', hint: 'Gross sales ÷ orders' },
    { label: 'Ad spend share', value: p.revenue > 0 ? `${((ad / p.revenue) * 100).toFixed(0)}%` : '—', hint: 'Ad spend as % of sales' },
  ]
  return (
    <Panel title="Key numbers">
      <div className="bk-kpis">
        {items.map(k => (
          <div key={k.label} className={`bk-kpi${k.tone ? ` is-${k.tone}` : ''}`}>
            <span>{k.label}</span>
            <b>{k.value}</b>
            <small>{k.hint}</small>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function MonthChart({ months }: { months: Month[] }) {
  const W = 640
  const H = 220
  const padL = 56
  const padB = 28
  const padT = 12
  const vals = months.flatMap(m => [m.p.revenue, businessProfit(m.p)])
  const max = Math.max(1, ...vals)
  const min = Math.min(0, ...vals)
  const span = max - min || 1
  const y = (v: number) => padT + ((max - v) / span) * (H - padT - padB)
  const band = (W - padL - 8) / months.length
  const bw = Math.min(26, band * 0.3)
  const ticks = 4
  const step = niceStep(span / ticks)
  const tickVals: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-6; v += step) tickVals.push(v)
  return (
    <div className="bk-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue and operating profit by month">
        {tickVals.map(v => (
          <g key={v}>
            <line x1={padL} x2={W - 4} y1={y(v)} y2={y(v)} className={v === 0 ? 'bk-axis0' : 'bk-grid-line'} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="bk-tick">{compactUsd(v)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = padL + band * i + band / 2
          const r = m.p.revenue
          const pr = businessProfit(m.p)
          return (
            <g key={m.key}>
              <rect x={cx - bw - 2} y={y(Math.max(0, r))} width={bw} height={Math.abs(y(r) - y(0))} rx={3} className="bk-bar-rev">
                <title>{`${monthKeyLabel(m.key)} revenue ${usd(r)}`}</title>
              </rect>
              <rect x={cx + 2} y={y(Math.max(0, pr))} width={bw} height={Math.max(1, Math.abs(y(pr) - y(0)))} rx={3} className={pr >= 0 ? 'bk-bar-pos' : 'bk-bar-neg'}>
                <title>{`${monthKeyLabel(m.key)} operating profit ${usd(pr)}`}</title>
              </rect>
              <text x={cx} y={H - 8} textAnchor="middle" className="bk-tick">{monthKeyLabel(m.key).split(' ')[0]}</text>
            </g>
          )
        })}
      </svg>
      <div className="bk-legend">
        <span><i className="bk-bar-rev" /> Gross sales</span>
        <span><i className="bk-bar-pos" /> Operating profit</span>
        <span><i className="bk-bar-neg" /> Operating loss</span>
      </div>
    </div>
  )
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}
function compactUsd(v: number): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`
  return `${sign}$${Math.round(a)}`
}
