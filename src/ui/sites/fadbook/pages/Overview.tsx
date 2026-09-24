// Account overview: headline metrics vs. the previous period, a daily trend with comparison,
// account status (spending limit, billing threshold), delivery summary and top campaigns.
import { useMemo, useState } from 'react'
import type { AdAccount, GameState } from '../../../../core/types'
import { dayOf, firstOfNextMonth, formatDate } from '../../../../core/time'
import { accountSpendLimit, deliveryLabel, learningProgress, nextBillingThreshold } from '../../../../sim/ads'
import { AmButton, AmCard, AmDateRangePicker, AmTag, StatusCell, amFmt } from '../../../kit/adsmanager'
import { LineChartCard, CHART_COLORS, DeltaBadge } from '../../../kit/charts'
import { comparisonRange, formatRange, resolvePreset, type DateRangeValue } from '../../../kit/common'
import { accountData, accountStatusLabel, buildRows, dailySeries, displayId, resultLabels } from '../data'
import { METRIC_BY_ID, totalsRow } from '../metrics'
import { AccountNotices, SetupNotices } from '../Notices'
import { useFbUI } from '../uiStore'

const KPIS: { id: string; label: string; invert?: boolean; format: 'money' | 'number' | 'decimal' | 'percent' }[] = [
  { id: 'spend', label: 'Amount spent', format: 'money' },
  { id: 'results', label: 'Results', format: 'number' },
  { id: 'cpr', label: 'Cost per result', invert: true, format: 'money' },
  { id: 'roas', label: 'Purchase ROAS', format: 'decimal' },
  { id: 'impressions', label: 'Impressions', format: 'number' },
  { id: 'reach', label: 'Reach', format: 'number' },
  { id: 'cpm', label: 'CPM', invert: true, format: 'money' },
  { id: 'ctr_link', label: 'CTR (link)', format: 'percent' },
]

export default function Overview({ s, acc, navigate }: { s: GameState; acc: AdAccount; navigate: (p: string) => void }) {
  const ui = useFbUI()
  const today = dayOf(s.time.hour)
  const range = ui.datePreset === 'custom' && ui.customRange ? ui.customRange : resolvePreset(ui.datePreset === 'custom' ? 'maximum' : ui.datePreset, today, 'ads')
  const value: DateRangeValue = { preset: ui.datePreset, range }
  const prev = comparisonRange(range, 'previous_period')!
  const [metric, setMetric] = useState('spend')
  const d = useMemo(() => accountData(s, acc.id), [s.ads, s.creatives.creatives, s.store.products, acc.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = useMemo(() => totalsRow(buildRows(d, range).campaign), [d, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => totalsRow(buildRows(d, prev).campaign), [d, prev.from, prev.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const firstDay = Math.min(...d.campaigns.map(c => Math.floor(c.createdHour / 24)), today)
  const from = Math.max(range.from, firstDay)
  const days = useMemo(() => dailySeries(d, 'campaign', null, { from, to: range.to }), [d, from, range.to])
  const prevDays = useMemo(() => dailySeries(d, 'campaign', null, { from: from - (range.to - from + 1), to: from - 1 }), [d, from, range.to])
  // the previous period only means something if the account delivered then
  const hasPrev = before.st.impressions > 0 || before.st.spend > 0
  const def = METRIC_BY_ID.get(metric)!
  const kpi = KPIS.find(k => k.id === metric)!
  const span = range.to - from + 1
  const prevByDay = new Map(prevDays.map(p => [p.day, p]))
  const chartData = days.map(p => {
    const q = prevByDay.get(p.day - span)
    const row = { st: p.st, playSec: p.playSec, vidImps: p.vidImps, products: cur.products, resultKind: cur.resultKind }
    const prow = q ? { st: q.st, playSec: q.playSec, vidImps: q.vidImps, products: cur.products, resultKind: cur.resultKind } : null
    return {
      label: formatDate(p.day, 'md'),
      value: def.value?.(row, s) ?? 0,
      compare: hasPrev && prow ? def.value?.(prow, s) ?? 0 : undefined,
      compareLabel: hasPrev && q ? formatDate(q.day, 'md') : undefined,
    }
  })
  const status = accountStatusLabel(acc)
  const limit = accountSpendLimit(s, acc.id)
  const threshold = nextBillingThreshold(s, acc.id)
  const labels = d.campaigns.map(c => deliveryLabel(s, 'campaign', c.id).label)
  const counts = {
    active: labels.filter(l => l === 'Active').length,
    learning: labels.filter(l => l === 'Learning').length,
    limited: labels.filter(l => l === 'Learning limited').length,
    off: labels.filter(l => /off/i.test(l)).length,
    issues: labels.filter(l => l === 'Not delivering' || l === 'Rejected' || l.startsWith('Account')).length,
  }
  const top = useMemo(() => buildRows(d, range).campaign.filter(r => r.st.spend > 0).sort((a, b) => b.st.spend - a.st.spend).slice(0, 5), [d, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const learningSets = d.adSets.filter(x => x.status === 'active' && x.learning.state !== 'active' && x.impressions > 0).slice(0, 5)

  return (
    <div className="fb-page">
      <SetupNotices s={s} navigate={navigate} />
      <AccountNotices s={s} acc={acc} navigate={navigate} />
      <div className="fb-page-head">
        <div>
          <h1>Account overview</h1>
          <p className="fb-muted">{acc.name} · Ad account ID: {displayId(acc)}</p>
        </div>
        <AmDateRangePicker value={value} today={today} onChange={v => ui.set({ datePreset: v.preset as typeof ui.datePreset, customRange: v.preset === 'custom' ? v.range : null })} />
      </div>

      <div className="fb-kpis">
        {KPIS.map(k => {
          const m = METRIC_BY_ID.get(k.id)!
          const v = m.value?.(cur, s) ?? null
          const pv = m.value?.(before, s) ?? null
          return (
            <button key={k.id} type="button" className={`fb-kpi${metric === k.id ? ' fb-kpi-on' : ''}`} onClick={() => setMetric(k.id)}>
              <span className="fb-kpi-label">{k.label}</span>
              <span className="fb-kpi-value">{(m.format ?? amFmt.int)(v)}</span>
              <span className="fb-kpi-delta">
                {v !== null && pv && hasPrev ? (
                  <><DeltaBadge cur={v} prev={pv} invert={k.invert} /><span className="fb-muted fb-small">vs. previous period</span></>
                ) : (
                  <span className="fb-muted fb-small">{k.id === 'results' ? resultLabels(cur.resultKind).results : hasPrev ? 'No data for previous period' : ''}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <LineChartCard
        title={kpi.label}
        titleTip={def.description}
        value={def.value?.(cur, s) ?? amFmt.dash}
        comparisonValue={hasPrev ? def.value?.(before, s) ?? null : null}
        invertDelta={kpi.invert}
        data={chartData}
        format={kpi.format}
        currentLabel={formatRange({ from, to: range.to })}
        compareLabel="Previous period"
        color={CHART_COLORS.fadbook}
        area
        emptyText="No delivery in this date range."
      />

      <div className="fb-grid-2">
        <AmCard title="Account status" actions={<AmButton size="sm" variant="link" onClick={() => navigate('account_quality')}>Account quality</AmButton>}>
          <dl className="fb-kv">
            <dt>Status</dt><dd><AmTag tone={status.tone}>{status.label}</AmTag></dd>
            <dt>Daily spending limit</dt><dd>{Number.isFinite(limit) ? amFmt.money(limit) : 'No limit'}</dd>
            <dt>Spent today</dt>
            <dd>
              {amFmt.money(acc.todaySpend)}
              {Number.isFinite(limit) && (
                <span className="fb-meter"><span style={{ width: `${Math.min(100, (acc.todaySpend / limit) * 100)}%` }} /></span>
              )}
            </dd>
            <dt>Current balance</dt><dd>{amFmt.money(acc.unbilled)} <span className="fb-muted fb-small">of {amFmt.money(threshold)} threshold</span></dd>
            <dt>Next bill</dt><dd>{formatDate(firstOfNextMonth(today), 'short')} or when you reach {amFmt.money(threshold)}</dd>
            <dt>Lifetime spend</dt><dd>{amFmt.money(acc.lifetimeSpend)}</dd>
          </dl>
        </AmCard>
        <AmCard title="Campaign delivery" actions={<AmButton size="sm" variant="link" onClick={() => navigate('manage/campaigns')}>Go to campaigns</AmButton>}>
          {d.campaigns.length === 0 ? (
            <div className="fb-empty">
              <span className="fb-muted">No campaigns yet.</span>
              <AmButton variant="create" onClick={() => navigate('create')}>Create campaign</AmButton>
            </div>
          ) : (
            <div className="fb-deliv">
              <StatusCell label="Active" detail={`${counts.active} campaign${counts.active === 1 ? '' : 's'}`} />
              <StatusCell label="Learning" detail={`${counts.learning} campaign${counts.learning === 1 ? '' : 's'}`} />
              <StatusCell label="Learning limited" detail={`${counts.limited} campaign${counts.limited === 1 ? '' : 's'}`} />
              <StatusCell label="Not delivering" detail={`${counts.issues} campaign${counts.issues === 1 ? '' : 's'}`} />
              <StatusCell label="Off" detail={`${counts.off} campaign${counts.off === 1 ? '' : 's'}`} />
            </div>
          )}
          {learningSets.length > 0 && (
            <div className="fb-stack fb-mt">
              <span className="fb-small fb-strong">Ad sets in learning</span>
              {learningSets.map(x => {
                const lp = learningProgress(s, x.id)
                return (
                  <div key={x.id} className="fb-learn-row">
                    <span className="fb-ellipsis">{x.name}</span>
                    <StatusCell
                      label={x.learning.state === 'learning' ? 'Learning' : 'Learning limited'}
                      progress={lp && x.learning.state === 'learning' ? lp.conversions / Math.max(1, lp.needed) : undefined}
                      detail={lp ? `${lp.conversions}/${lp.needed} ${x.optimization === 'add_to_cart' ? 'adds to cart' : 'purchases'}` : undefined}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </AmCard>
      </div>

      <AmCard title="Top campaigns by amount spent" subtitle={formatRange(range)} flush>
        {top.length === 0 ? (
          <div className="fb-empty"><span className="fb-muted">No spend in this date range.</span></div>
        ) : (
          <table className="fb-grid">
            <thead><tr><th>Campaign</th><th className="fb-r">Amount spent</th><th className="fb-r">Results</th><th className="fb-r fb-hide-narrow">Cost per result</th><th className="fb-r">Purchase ROAS</th></tr></thead>
            <tbody>
              {top.map(r => {
                const res = METRIC_BY_ID.get('results')!.value!(r, s)
                return (
                  <tr key={r.id}>
                    <td><button type="button" className="am-name-link" onClick={() => { ui.set({ level: 'adset', sel: { campaign: [r.id], adset: [], ad: [] } }); navigate('manage/adsets') }}>{r.name}</button></td>
                    <td className="fb-r">{amFmt.money(r.st.spend)}</td>
                    <td className="fb-r">{amFmt.int(res)}</td>
                    <td className="fb-r fb-hide-narrow">{res ? amFmt.money(r.st.spend / res) : amFmt.dash}</td>
                    <td className="fb-r">{amFmt.roas(r.st.spend ? r.st.purchaseValue / r.st.spend : null)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </AmCard>
    </div>
  )
}
