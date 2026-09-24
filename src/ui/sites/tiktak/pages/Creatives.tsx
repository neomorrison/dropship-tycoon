// Assets › Creative: the video library (from CreatorHub), per-video TikTak performance,
// "Create ad" and "Post to TikTak" shortcuts, and a detail drawer with diagnosis.
import { useMemo, useState } from 'react'
import { Clapperboard, Clock, Lightbulb, Play, Plus, Send } from 'lucide-react'
import type { Creative, GameState } from '../../../../core/types'
import { formatDate } from '../../../../core/time'
import { formatName, hookName, angleName } from '../../../../data/creativeTaxonomy'
import { TIPS_MIN_IMPRESSIONS, adTotals, adsUsingCreative, creativeImpressions, creativeInsights, addStats, emptyStats } from '../../../../sim/ads'
import { AmButton, AmSearch, AmSelect, SideDrawer, AmCard, amFmt } from '../../../kit/adsmanager'
import { AdPreview } from '../../../kit/phone'
import { ImageWithFallback } from '../../../kit/common'
import { openSite } from '../../../../core/ui'
import { EmptyBlock, PageHead, Pill, SubTabs, useGame, useTt } from '../common'
import { identityName } from '../data'
import { creativeThumb } from './create/Pickers'
import { PostModal } from './Posts'

type StatusF = 'all' | 'ready' | 'producing'

const MADE_BY: Record<Creative['producer'], string> = {
  self: 'Self-shot', supplier_edit: 'Supplier footage', ugc: 'UGC creator', agency: 'Agency', staff: 'In-house creator',
}

export function creativeStatus(c: Creative, hour: number): { label: string; tone: 'success' | 'info' | 'warning' | 'critical' } {
  if (c.status === 'ready') return { label: 'Ready', tone: 'success' }
  if (c.status === 'failed') return { label: 'Failed', tone: 'critical' }
  if (c.status === 'waiting_sample') return { label: 'Waiting for product', tone: 'warning' }
  const eta = c.readyHour != null ? Math.max(0, c.readyHour - hour) : null
  return { label: eta != null ? `In production · ${eta >= 48 ? `${Math.ceil(eta / 24)}d` : `${Math.max(1, Math.round(eta))}h`}` : 'In production', tone: 'info' }
}

/** Lifetime TikTak totals for a creative across every TikTak ad using it. */
export function tiktakCreativeStats(s: GameState, creativeId: string) {
  const st = emptyStats()
  for (const a of s.ads.ads) if (a.platform === 'tiktak' && a.creativeId === creativeId) addStats(st, adTotals(a))
  return st
}

export default function Creatives() {
  const s = useGame()
  const { navigate, compact } = useTt()
  const [q, setQ] = useState('')
  const [product, setProduct] = useState('all')
  const [status, setStatus] = useState<StatusF>('all')
  const [detail, setDetail] = useState<string | null>(null)
  const [postFor, setPostFor] = useState<string | null>(null)
  const hour = s.time.hour
  const all = s.creatives.creatives
  const catalogIds = useMemo(() => [...new Set(all.map(c => c.catalogId))], [all])
  const productName = (catalogId: string) => s.store.products.find(p => p.catalogId === catalogId)?.title ?? catalogId.replace(/-/g, ' ')
  const list = all
    .filter(c => (product === 'all' || c.catalogId === product) && (status === 'all' || (status === 'ready' ? c.status === 'ready' : c.status === 'in_production' || c.status === 'waiting_sample')))
    .filter(c => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.hookText.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.orderedHour - a.orderedHour)
  const sel = detail ? all.find(c => c.id === detail) : undefined

  return (
    <div className="tt-page">
      <PageHead
        title="Creative"
        crumbs={[{ label: 'Assets' }, { label: 'Creative' }]}
        actions={<AmButton variant="primary" icon={Clapperboard} onClick={() => openSite('studio')}>Create video</AmButton>}
      />
      <SubTabs tabs={[{ id: 'videos', label: 'Videos' }, { id: 'posts', label: 'TikTak posts' }]} active="videos" onChange={id => id === 'posts' && navigate('assets/posts')} />
      <div className="tt-toolbar">
        <AmSearch value={q} onChange={setQ} placeholder="Search video name or hook text" width={compact ? '100%' : 280} />
        <AmSelect value={product} onChange={setProduct} options={[{ value: 'all', label: 'All products' }, ...catalogIds.map(id => ({ value: id, label: productName(id) }))]} width={compact ? '100%' : 240} />
        <AmSelect value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'ready', label: 'Ready' }, { value: 'producing', label: 'In production' }]} width={compact ? '100%' : 180} />
        <span className="tt-faint tt-small" style={{ marginLeft: 'auto' }}>{list.length} video{list.length === 1 ? '' : 's'}</span>
      </div>
      {all.length === 0 ? (
        <EmptyBlock
          art="creative"
          title="Your library is empty"
          body="Videos you film, edit or order in CreatorHub land here. Native-looking videos with a strong first 2 seconds win on TikTak."
          action={<AmButton variant="primary" icon={Clapperboard} onClick={() => openSite('studio')}>Go to CreatorHub</AmButton>}
        />
      ) : list.length === 0 ? (
        <span className="tt-muted tt-small">No videos match these filters.</span>
      ) : (
        <div className="tt-lib">
          {list.map(c => {
            const stt = creativeStatus(c, hour)
            const st = tiktakCreativeStats(s, c.id)
            const ready = c.status === 'ready'
            return (
              <div key={c.id} className="tt-lib-card">
                <div className="tt-lib-thumb" onClick={() => setDetail(c.id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setDetail(c.id) }} aria-label={`Open ${c.name}`}>
                  <ImageWithFallback src={creativeThumb(c)} alt={c.name} fallbackLabel={c.name} fallbackEmoji="🎬" width="100%" height="100%" />
                  {c.hookText && <span className="tt-lib-thumb-hook">{c.hookText}</span>}
                  <span className="tt-lib-thumb-status"><Pill tone={stt.tone === 'success' ? 'dark' : stt.tone}>{stt.label}</Pill></span>
                  <span className="tt-lib-thumb-badge">{c.isVideo ? <><Play size={10} fill="#fff" /> 0:{String(Math.round(c.durationSec)).padStart(2, '0')}</> : c.format === 'carousel' ? 'Carousel' : 'Image'}</span>
                </div>
                <div className="tt-lib-body">
                  <span className="tt-lib-name" title={c.name}>{c.name}</span>
                  <span className="tt-lib-meta"><span>{formatName(c.format)}</span><span>·</span><span>{MADE_BY[c.producer] ?? c.producer}</span></span>
                  <div className="tt-lib-stats">
                    <div className="tt-lib-stat"><b>{amFmt.money0(st.spend)}</b><span>Cost</span></div>
                    <div className="tt-lib-stat"><b>{amFmt.compact(st.impressions)}</b><span>Impr.</span></div>
                    <div className="tt-lib-stat"><b>{st.impressions ? amFmt.pct(st.videoViewsShort / st.impressions, 1) : '—'}</b><span>2s view rate</span></div>
                  </div>
                  <div className="tt-lib-actions">
                    <AmButton size="sm" icon={Plus} disabled={!ready} onClick={() => navigate(`campaign/create/creative/${c.id}`)}>Create ad</AmButton>
                    <AmButton size="sm" icon={Send} disabled={!ready || !c.isVideo} onClick={() => setPostFor(c.id)} title={!c.isVideo ? 'Only videos can be posted to TikTak' : undefined}>Post</AmButton>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SideDrawer open={!!sel} onClose={() => setDetail(null)} inline width={520} title={sel?.name} subtitle={sel ? `${formatName(sel.format)} · ordered ${formatDate(Math.floor(sel.orderedHour / 24), 'md')}` : undefined}>
        {sel && <CreativeDetail s={s} c={sel} onCreateAd={() => navigate(`campaign/create/creative/${sel.id}`)} onPost={() => setPostFor(sel.id)} />}
      </SideDrawer>
      <PostModal open={!!postFor} onClose={() => setPostFor(null)} initialCreativeId={postFor} />
    </div>
  )
}

function CreativeDetail({ s, c, onCreateAd, onPost }: { s: GameState; c: Creative; onCreateAd: () => void; onPost: () => void }) {
  const st = tiktakCreativeStats(s, c.id)
  const used = adsUsingCreative(s, c.id)
  const usedTt = used.filter(id => s.ads.ads.find(a => a.id === id)?.platform === 'tiktak').length
  const imps = creativeImpressions(s, c.id)
  const tips = creativeInsights(s, c.id)
  const stt = creativeStatus(c, s.time.hour)
  const ready = c.status === 'ready'
  return (
    <>
      <AmCard>
        <div className="tt-preview" style={{ padding: 0 }}>
          <AdPreview platform="tiktak" productImage={creativeThumb(c)} hookText={c.hookText} caption={c.hookText} script={c.script} brandName={identityName(s)} isVideo={c.isVideo} durationSec={c.durationSec} width={210} />
          <div className="tt-row">
            <AmButton size="sm" variant="primary" icon={Plus} disabled={!ready} onClick={onCreateAd}>Create ad</AmButton>
            <AmButton size="sm" icon={Send} disabled={!ready || !c.isVideo} onClick={onPost}>Post to TikTak</AmButton>
          </div>
        </div>
      </AmCard>
      <AmCard title="Details">
        <dl className="tt-kv">
          <dt>Status</dt><dd><Pill tone={stt.tone}>{stt.label}</Pill>{c.failReason ? ` ${c.failReason}` : ''}</dd>
          <dt>Format</dt><dd>{formatName(c.format)}{c.isVideo ? ` · ${Math.round(c.durationSec)}s` : ''}</dd>
          <dt>Hook</dt><dd>{hookName(c.hook)}</dd>
          <dt>Angle</dt><dd>{angleName(c.angle)}</dd>
          <dt>On-screen text</dt><dd>{c.hookText || '—'}</dd>
          <dt>Made by</dt><dd>{MADE_BY[c.producer] ?? c.producer}{c.shared ? ' · other stores run the same footage' : ''}</dd>
          <dt>Used in</dt><dd>{usedTt} TikTak ad{usedTt === 1 ? '' : 's'}{used.length > usedTt ? ` · ${used.length - usedTt} Fadbook` : ''}</dd>
          <dt>Production cost</dt><dd>{amFmt.money(c.cost)}</dd>
        </dl>
      </AmCard>
      <AmCard title="TikTak performance (lifetime)">
        <div className="tt-grid-3">
          {[
            ['Cost', amFmt.money(st.spend)],
            ['Impressions', amFmt.int(st.impressions)],
            ['Video views at 2s', amFmt.int(st.videoViewsShort)],
            ['Video views at 6s', amFmt.int(st.videoViewsLong)],
            ['CTR (destination)', st.impressions ? amFmt.pct(st.linkClicks / st.impressions) : '—'],
            ['Complete payment', amFmt.int(st.purchases)],
          ].map(([l, v]) => (
            <div key={l} className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">{l}</span><span className="tt-kpi-value" style={{ fontSize: 15 }}>{v}</span></div>
          ))}
        </div>
      </AmCard>
      <AmCard title={<span className="tt-row" style={{ gap: 6 }}><Lightbulb size={15} /> Creative diagnosis</span>}>
        {imps < TIPS_MIN_IMPRESSIONS ? (
          <span className="tt-muted tt-small"><Clock size={12} style={{ verticalAlign: -2 }} /> Available after {amFmt.int(TIPS_MIN_IMPRESSIONS)} impressions ({amFmt.int(imps)} so far).</span>
        ) : tips.length ? (
          <ul className="tt-insights">{tips.map((t, i) => <li key={i}><Lightbulb size={14} />{t}</li>)}</ul>
        ) : (
          <span className="tt-muted tt-small">No issues found.</span>
        )}
      </AmCard>
    </>
  )
}
