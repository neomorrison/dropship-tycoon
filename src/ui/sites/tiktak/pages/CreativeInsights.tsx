// Analytics › Creative insights: compare the videos running in this ad account (watch-through,
// clicks, conversions) with a retention curve and skill-gated creative diagnosis per video.
import { useMemo, useState } from 'react'
import { Lightbulb, Plus } from 'lucide-react'
import type { Creative } from '../../../../core/types'
import { formatName, hookName, angleName } from '../../../../data/creativeTaxonomy'
import { TIPS_MIN_IMPRESSIONS, addStats, creativeImpressions, creativeInsights, emptyStats } from '../../../../sim/ads'
import { AmButton, AmDateRangePicker, AmNameCell, AmTable, MetricCell, amFmt, type AmColumn } from '../../../kit/adsmanager'
import { AdPreview } from '../../../kit/phone'
import { ImageWithFallback } from '../../../kit/common'
import { EmptyBlock, Panel, PageHead, useAccount, useGame, useToday, useTt, MakeVideoButton } from '../common'
import { useStoredRange } from '../uiState'
import { METRICS, accountData, identityName, retentionSteps, type Bundle } from '../data'
import { creativeThumb } from './create/Pickers'

interface VideoRow { c: Creative; b: Bundle; ads: number }
const rate = (a: number, b: number) => (b > 0 ? a / b : null)

export default function CreativeInsights() {
  const s = useGame()
  const today = useToday()
  const { navigate, compact } = useTt()
  const { account } = useAccount()
  const acc = account!
  const [range, setRange] = useStoredRange('creative', today, 'last7')
  const r = range.range
  const data = useMemo(() => accountData(s, acc.id, r), [s.ads, acc.id, r.from, r.to])
  const rows: VideoRow[] = useMemo(() => {
    const map = new Map<string, VideoRow>()
    for (const a of data.ads) {
      const c = s.creatives.creatives.find(x => x.id === a.creativeId)
      if (!c) continue
      const row = map.get(c.id) ?? { c, b: { stats: emptyStats(), conv: 0 }, ads: 0 }
      const ab = data.byAd.get(a.id)!
      addStats(row.b.stats, ab.stats)
      row.b.conv += ab.conv
      if (a.status !== 'deleted') row.ads++
      map.set(c.id, row)
    }
    return [...map.values()]
  }, [data, s.creatives.creatives])
  const [selId, setSelId] = useState<string | null>(null)
  const sel = rows.find(x => x.c.id === selId) ?? [...rows].sort((a, b) => b.b.stats.spend - a.b.stats.spend)[0]

  const cols: AmColumn<VideoRow>[] = [
    {
      id: 'video', header: 'Video', width: compact ? 200 : 280, sticky: true, sortValue: x => x.c.name,
      render: x => (
        <AmNameCell
          name={x.c.name}
          sub={`${formatName(x.c.format)} · ${Math.round(x.c.durationSec)}s · ${x.ads} ad${x.ads === 1 ? '' : 's'}`}
          onClick={() => setSelId(x.c.id)}
          leading={<ImageWithFallback src={creativeThumb(x.c)} alt={x.c.name} width={28} height={38} radius={3} fallbackEmoji="🎬" />}
        />
      ),
    },
    { id: 'cost', header: 'Cost', align: 'right', width: 110, sortValue: x => x.b.stats.spend, render: x => <MetricCell value={amFmt.money(x.b.stats.spend)} />, total: rs => <MetricCell value={amFmt.money(rs.reduce((a, x) => a + x.b.stats.spend, 0))} /> },
    { id: 'imps', header: 'Impressions', align: 'right', width: 120, sortValue: x => x.b.stats.impressions, render: x => <MetricCell value={amFmt.int(x.b.stats.impressions)} /> },
    { id: 'r2', header: '2-second view rate', headerTip: 'Video views at 2s ÷ Impressions. How often the first seconds stop the scroll.', align: 'right', width: 150, sortValue: x => rate(x.b.stats.videoViewsShort, x.b.stats.impressions), render: x => <MetricCell value={amFmt.pct(rate(x.b.stats.videoViewsShort, x.b.stats.impressions))} /> },
    { id: 'r6', header: '6-second view rate', headerTip: 'Video views at 6s ÷ Impressions.', align: 'right', width: 150, sortValue: x => rate(x.b.stats.videoViewsLong, x.b.stats.impressions), render: x => <MetricCell value={amFmt.pct(rate(x.b.stats.videoViewsLong, x.b.stats.impressions))} /> },
    { id: 'r100', header: 'Completion rate', headerTip: 'Video views at 100% ÷ Impressions.', align: 'right', width: 140, sortValue: x => rate(x.b.stats.v100, x.b.stats.impressions), render: x => <MetricCell value={amFmt.pct(rate(x.b.stats.v100, x.b.stats.impressions))} /> },
    { id: 'ctr', header: METRICS.ctr.label, headerTip: METRICS.ctr.description, align: 'right', width: 140, sortValue: x => METRICS.ctr.value(x.b), render: x => <MetricCell value={METRICS.ctr.format(METRICS.ctr.value(x.b))} /> },
    { id: 'conv', header: 'Conversions', align: 'right', width: 120, sortValue: x => x.b.conv, render: x => <MetricCell value={amFmt.int(x.b.conv)} /> },
    { id: 'cpa', header: 'Cost per conversion', align: 'right', width: 150, sortValue: x => METRICS.cpa.value(x.b), render: x => <MetricCell value={METRICS.cpa.format(METRICS.cpa.value(x.b))} /> },
    { id: 'roas', header: METRICS.roas.label, align: 'right', width: 200, sortValue: x => METRICS.roas.value(x.b), render: x => <MetricCell value={METRICS.roas.format(METRICS.roas.value(x.b))} /> },
  ]

  const st = sel?.b.stats
  const funnel = st && sel && st.impressions > 0 ? retentionSteps(st, sel.c.durationSec).map(x => ({ ...x, label: x.label.replace('Video views', 'Views') })) : null
  const imps = sel ? creativeImpressions(s, sel.c.id) : 0
  const tips = sel ? creativeInsights(s, sel.c.id) : []

  return (
    <div className="tt-page">
      <PageHead title="Creative insights" crumbs={[{ label: 'Analytics' }, { label: 'Creative insights' }]} actions={<AmDateRangePicker value={range} onChange={setRange} today={today} size={compact ? 'sm' : 'md'} />} />
      {rows.length === 0 ? (
        <Panel>
          <EmptyBlock art="creative" title="No videos have run in this account yet" body="Once your ads deliver, compare how each video holds attention and drives clicks here." action={<MakeVideoButton />} />
        </Panel>
      ) : (
        <>
          <Panel pad={false}>
            <div style={{ padding: 16 }}>
              <AmTable rows={rows} columns={cols} rowKey={x => x.c.id} selectable={false} highlightedId={sel?.c.id} onRowClick={x => setSelId(x.c.id)} entityName={{ singular: 'video', plural: 'videos' }} defaultSort={{ columnId: 'cost', direction: 'desc' }} maxHeight={420} />
            </div>
          </Panel>
          {sel && (
            <div className="tt-grid2">
              <div className="tt-col" style={{ gap: 16 }}>
                <Panel title={`Watch-through: ${sel.c.name}`}>
                  {funnel ? (
                    <div className="tt-retention">
                      {funnel.map(f => (
                        <div key={f.label} className="tt-ret-row">
                          <span>{f.label}</span>
                          <span className="tt-ret-bar"><span style={{ width: `${Math.min(100, (f.v / funnel[0].v) * 100)}%` }} /></span>
                          <b>{f.label === 'Impressions' ? amFmt.compact(f.v) : amFmt.pct(f.v / funnel[0].v, 1)}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="tt-muted tt-small">No impressions in this date range.</span>
                  )}
                </Panel>
                <Panel title={<span className="tt-row" style={{ gap: 6 }}><Lightbulb size={16} /> Creative diagnosis</span>}>
                  {imps < TIPS_MIN_IMPRESSIONS ? (
                    <span className="tt-muted tt-small">Needs {amFmt.int(TIPS_MIN_IMPRESSIONS)} impressions for a diagnosis ({amFmt.int(imps)} so far across all your ads).</span>
                  ) : tips.length ? (
                    <ul className="tt-insights">{tips.map((t, i) => <li key={i}><Lightbulb size={14} />{t}</li>)}</ul>
                  ) : (
                    <span className="tt-muted tt-small">Nothing stands out. Compare it with your other videos above.</span>
                  )}
                </Panel>
              </div>
              <Panel title="Video">
                <div className="tt-preview" style={{ padding: 0 }}>
                  <AdPreview platform="tiktak" productImage={creativeThumb(sel.c)} hookText={sel.c.hookText} caption={sel.c.hookText} script={sel.c.script} brandName={identityName(s)} isVideo={sel.c.isVideo} durationSec={sel.c.durationSec} width={220} />
                  <span className="tt-faint tt-small" style={{ textAlign: 'center' }}>{formatName(sel.c.format)} · Hook: {hookName(sel.c.hook)} · Angle: {angleName(sel.c.angle)}</span>
                  <AmButton size="sm" icon={Plus} onClick={() => navigate(`campaign/create/creative/${sel.c.id}`)}>Create ad with this video</AmButton>
                </div>
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  )
}
