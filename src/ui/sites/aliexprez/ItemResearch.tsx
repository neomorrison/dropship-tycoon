// AliExprez — Research tab: 1-hour research sessions deepen product knowledge (0 → 3).
// Notes come from market.researchInsights (wording/precision scale with research skill).
import { useMemo } from 'react'
import { Check, Clock, FlaskConical, Hourglass, Lock, Radar } from 'lucide-react'
import { act, getGS, useGS } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { formatDate } from '../../../core/time'
import { MAX_RESEARCH, marketHistory, researchInsights, startResearch } from '../../../sim/market'
import { activityDuration, canDoActivity } from '../../../sim/life'
import { TrendChart } from '../../kit/charts'
import { cx } from '../../kit/common'
import { onDraft, useToday } from './hooks'
import type { Row } from './lib'

const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

const LEVELS = [
  { title: 'Pricing & competition', text: 'What competing stores charge, the Amazin price anchor, your real landed cost, and how many stores advertise it.' },
  { title: 'Demand & quality', text: 'Direction of demand, what unhappy buyers complain about, and ad-policy risk. Unlocks the supplier order history chart.' },
  { title: 'Value & creative angles', text: 'What shoppers will pay, which ad hooks and angles competitors win with, who buys it, and seasonality.' },
]

export default function ItemResearch({ row }: { row: Row }) {
  const { p } = row
  const id = p.id
  const today = useToday()
  const depth = useGS(s => s.catalog.research[id] ?? 0)
  const market = useGS(s => s.catalog.market[id])
  const skill = useGS(s => s.skills.research?.level ?? 1)
  const activity = useGS(s => s.player.activity)
  const queue = useGS(s => s.player.queue)
  const spy = useGS(s => s.catalog.unlocks.spyTool)
  const insights = useMemo(() => researchInsights(getGS(), id), [id, depth, market, skill, today])
  const history = useMemo(() => marketHistory(getGS(), id).map(h => ({ label: formatDate(h.day, 'md'), orders: h.orders30d })), [id, market])

  const running = activity?.kind === 'product_research' && activity.payload?.catalogId === id ? activity : null
  const queued = !running && queue.some(a => a.kind === 'product_research' && a.payload?.catalogId === id)
  const hour = useGS(s => s.time.hour)
  const check = useMemo(() => onDraft(s => ({ ...canDoActivity(s, 'product_research') })), [activity, queue, hour])
  // real length after productivity (tired / old laptop = slower), not the nominal 1h
  const minutes = useMemo(() => onDraft(s => activityDuration(s, 'product_research')), [activity, queue, hour])
  const maxed = depth >= MAX_RESEARCH
  const progress = running ? 1 - running.remainingMin / Math.max(1, running.durationMin) : 0

  const start = () => act(s => startResearch(s, id))

  return (
    <div className="ax-research">
      <div className="ax-res-head">
        <div className="ax-res-title">
          <FlaskConical size={22} />
          <div>
            <h3>Product research</h3>
            <div className="ax-muted ax-small">Research skill Lv {skill} · higher skill = sharper numbers and more confident reads</div>
          </div>
        </div>
        <div className="ax-res-level" aria-label={`Research depth ${depth} of ${MAX_RESEARCH}`}>
          {Array.from({ length: MAX_RESEARCH }, (_, i) => <i key={i} className={cx(i < depth && 'on')} />)}
          <span>{depth}/{MAX_RESEARCH}</span>
        </div>
      </div>

      <div className="ax-res-action">
        {maxed ? (
          <div className="ax-res-state ax-res-done"><Check size={16} /> Research complete. Level up your research skill to sharpen these numbers.</div>
        ) : running ? (
          <div className="ax-res-state">
            <Hourglass size={16} />
            <div className="ax-res-prog">
              <div>Researching… {Math.max(1, Math.round(running.remainingMin))} min left</div>
              <span className="ax-res-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
            </div>
          </div>
        ) : queued ? (
          <div className="ax-res-state"><Clock size={16} /> Queued — starts after your current activity.</div>
        ) : (
          <>
            <button type="button" className="ax-btn ax-btn-red" onClick={start} disabled={!check.ok}>
              <FlaskConical size={15} /> Research this product ({fmtDuration(minutes)})
            </button>
            <span className="ax-muted ax-small">{check.ok ? `Next: ${LEVELS[depth].title.toLowerCase()} · +40 research XP` : check.reason}</span>
          </>
        )}
      </div>

      <ul className="ax-res-notes">
        {insights.map((t, i) => <li key={i} className={cx(depth === 0 && 'ax-res-note-muted')}>{t}</li>)}
      </ul>

      {depth >= 2 && (
        <div className="ax-res-chart">
          <div className="ax-res-chart-h">
            <b>Supplier orders, rolling 30 days</b>
            <span className="ax-muted ax-small">Public order counter sampled every 2 days. Includes orders from every store selling it.</span>
          </div>
          {history.length > 2
            ? <TrendChart data={history} xKey="label" series={[{ key: 'orders', label: 'Orders (30d)', color: '#fd384f', area: true }]} format="number" height={180} legend={false} zeroBaseline={false} />
            : <div className="ax-res-chart-empty"><Clock size={16} /> Tracking started recently ({history.length} sample{history.length === 1 ? '' : 's'} so far). The trend line appears after a few more readings, one every 2 days.</div>}
        </div>
      )}

      <div className="ax-res-levels">
        {LEVELS.map((lv, i) => (
          <div key={lv.title} className={cx('ax-res-lv', i < depth && 'ax-res-lv-done')}>
            <span className="ax-res-lv-n">{i < depth ? <Check size={14} /> : i === depth ? i + 1 : <Lock size={12} />}</span>
            <div><b>Level {i + 1}: {lv.title}</b><p>{lv.text}</p></div>
          </div>
        ))}
      </div>

      <button type="button" className="ax-res-spy" onClick={() => openSite('mineo', `product/${id}`)}>
        <Radar size={18} />
        <span>
          <b>See the actual competitor ads in Mineo</b>
          <em>{spy ? 'Active ads, advertisers, engagement and top hooks for this product.' : 'Ad-spy tool · $49/month. Active ads, advertisers and top hooks.'}</em>
        </span>
      </button>
    </div>
  )
}
