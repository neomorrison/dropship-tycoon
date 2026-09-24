// Creative library: every creative you've briefed, its production status and (once it runs) real
// delivery numbers. Hidden fit scores are never shown; insights unlock only with data.
import { useEffect, useMemo, useState } from 'react'
import { Lightbulb, Plus, Search, SlidersHorizontal } from 'lucide-react'
import type { AdDayStats, Creative, GameState } from '../../../core/types'
import { useGS } from '../../../core/store'
import { money, pct, compact as compactNum } from '../../../core/format'
import { ANGLES, FORMATS, HOOKS } from '../../../data/creativeTaxonomy'
import { addStats, deliveryLabel, deriveMetrics, emptyStats, TIPS_MIN_IMPRESSIONS } from '../../../sim/ads'
import { Countdown, cx } from '../../kit/common'
import { CreativeThumb } from './CreativeThumb'
import { creativeEta, isLive, productName, producerDisplay } from './helpers'
import { studioPaths } from './route'
import { Badge, EmptyBlock, Portrait, Segmented } from './ui'

type StatusFilter = 'all' | 'production' | 'ready' | 'failed'
type SortKey = 'newest' | 'spend' | 'ctr' | 'hook'

interface PerfRow { totals: AdDayStats; ads: number; live: number; organicViews: number }

/** One pass over all ads: per-creative lifetime totals (same folding rules as statsFor over a lifetime range). */
function perfIndex(s: GameState): Map<string, PerfRow> {
  const map = new Map<string, PerfRow>()
  const row = (id: string) => {
    let r = map.get(id)
    if (!r) { r = { totals: emptyStats(), ads: 0, live: 0, organicViews: 0 }; map.set(id, r) }
    return r
  }
  for (const ad of s.ads.ads) {
    const r = row(ad.creativeId)
    addStats(r.totals, ad.lifetime)
    for (const st of Object.values(ad.stats)) addStats(r.totals, st)
    if (ad.status !== 'deleted') {
      r.ads++
      if (isLive(deliveryLabel(s, 'ad', ad.id))) r.live++
    }
  }
  for (const p of s.ads.organicPosts) row(p.creativeId).organicViews += p.views
  return map
}

export function Library({ productFilter, navigate, compact }: { productFilter: string | null; navigate: (p: string) => void; compact: boolean }) {
  const s = useGS(st => st)
  const creatives = s.creatives.creatives
  const [status, setStatus] = useState<StatusFilter>('all')
  const [product, setProduct] = useState<string>(productFilter ?? 'all')
  const [sort, setSort] = useState<SortKey>('newest')
  const [query, setQuery] = useState('')
  useEffect(() => setProduct(productFilter ?? 'all'), [productFilter])

  const perf = useMemo(() => perfIndex(s), [s])
  const counts = useMemo(() => ({
    all: creatives.length,
    production: creatives.filter(c => c.status === 'in_production' || c.status === 'waiting_sample').length,
    ready: creatives.filter(c => c.status === 'ready').length,
    failed: creatives.filter(c => c.status === 'failed').length,
  }), [creatives])
  const productOptions = useMemo(() => {
    const ids = [...new Set(creatives.map(c => c.catalogId))]
    return ids.map(id => ({ id, name: productName(s, id) })).sort((a, b) => a.name.localeCompare(b.name))
    // product names only change when the store's products do
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatives, s.store.products])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = creatives.filter(c => {
      if (status === 'production' && !(c.status === 'in_production' || c.status === 'waiting_sample')) return false
      if (status === 'ready' && c.status !== 'ready') return false
      if (status === 'failed' && c.status !== 'failed') return false
      if (product !== 'all' && c.catalogId !== product) return false
      if (q && !`${c.name} ${c.hookText} ${FORMATS[c.format]?.name} ${HOOKS[c.hook]?.name}`.toLowerCase().includes(q)) return false
      return true
    })
    const m = (c: Creative) => deriveMetrics(perf.get(c.id)?.totals ?? emptyStats())
    const spend = (c: Creative) => perf.get(c.id)?.totals.spend ?? 0
    list = [...list]
    switch (sort) {
      case 'newest': list.sort((a, b) => b.orderedHour - a.orderedHour); break
      case 'spend': list.sort((a, b) => spend(b) - spend(a) || b.orderedHour - a.orderedHour); break
      case 'ctr': list.sort((a, b) => m(b).ctrLink - m(a).ctrLink || spend(b) - spend(a)); break
      case 'hook': list.sort((a, b) => m(b).hookRate - m(a).hookRate || spend(b) - spend(a)); break
    }
    return list
  }, [creatives, status, product, sort, query, perf])

  const totalCost = useMemo(() => creatives.reduce((a, c) => a + (c.cost || 0), 0), [creatives])

  return (
    <div className="ch-library">
      <div className="ch-pagehead">
        <div>
          <h1 className="ch-h1">Library</h1>
          <p className="ch-sub">
            {counts.all ? <>{counts.all} creative{counts.all === 1 ? '' : 's'} · {counts.production} in production · {money(totalCost, { cents: false })} spent on production</> : 'Everything you brief lands here.'}
          </p>
        </div>
        <div className="ch-pagehead-actions">
          <button type="button" className="ch-btn ch-btn-primary" onClick={() => navigate('new')}><Plus size={15} />New brief</button>
        </div>
      </div>

      {creatives.length === 0 ? (
        <EmptyBlock
          title="No creatives yet"
          body="Brief your first creative: pick a product, a format, a hook and an angle, then decide who makes it."
          actions={<button type="button" className="ch-btn ch-btn-primary" onClick={() => navigate('new')}><Plus size={15} />Start a brief</button>}
          compact={compact}
        />
      ) : (
        <>
          <div className={cx('ch-toolbar', compact && 'is-compact')}>
            <Segmented
              size="sm"
              ariaLabel="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'production', label: compact ? 'Making' : 'In production', count: counts.production },
                { value: 'ready', label: 'Ready', count: counts.ready },
                ...(counts.failed ? [{ value: 'failed' as const, label: compact ? 'Stopped' : 'Not delivered', count: counts.failed }] : []),
              ]}
            />
            <div className="ch-toolbar-right">
              <label className="ch-search">
                <Search size={14} aria-hidden />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search creatives" aria-label="Search creatives" />
              </label>
              <label className="ch-select">
                <select value={product} onChange={e => setProduct(e.target.value)} aria-label="Product">
                  <option value="all">All products</option>
                  {productOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="ch-select">
                <SlidersHorizontal size={13} aria-hidden />
                <select value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort">
                  <option value="newest">Newest</option>
                  <option value="spend">Most spend</option>
                  <option value="ctr">Link CTR</option>
                  <option value="hook">Hook rate</option>
                </select>
              </label>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyBlock art="search" compact title="Nothing matches these filters" actions={
              <button type="button" className="ch-btn ch-btn-secondary" onClick={() => { setStatus('all'); setProduct('all'); setQuery('') }}>Clear filters</button>
            } />
          ) : (
            <div className={cx('ch-lgrid', compact && 'is-compact')}>
              {rows.map(c => <LibraryCard key={c.id} s={s} c={c} perf={perf.get(c.id) ?? null} onOpen={() => navigate(studioPaths.creative(c.id))} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LibraryCard({ s, c, perf, onOpen }: { s: GameState; c: Creative; perf: PerfRow | null; onOpen: () => void }) {
  const eta = creativeEta(s, c)
  const who = producerDisplay(s, c)
  const t = perf?.totals
  const m = t ? deriveMetrics(t) : null
  const exposure = (t?.impressions ?? 0) + (perf?.organicViews ?? 0)
  const pname = productName(s, c.catalogId)
  return (
    <button type="button" className={cx('ch-lcard', c.status === 'failed' && 'is-failed')} onClick={onOpen}>
      <CreativeThumb c={c} width={92} label={pname} />
      <span className="ch-lcard-body">
        <span className="ch-lcard-top">
          <Badge tone={eta.tone} dot>{eta.badge}</Badge>
          {eta.hoursLeft !== undefined && eta.hoursLeft > 0 && (c.producer === 'ugc' || c.producer === 'agency' || c.producer === 'staff') && (
            <Countdown hoursLeft={eta.hoursLeft} urgentBelowHours={0} className="ch-lcard-count" />
          )}
        </span>
        <span className="ch-lcard-name">{c.name}</span>
        <span className="ch-lcard-product">{pname}</span>
        <span className="ch-lcard-tags">
          {FORMATS[c.format]?.name} · {HOOKS[c.hook]?.name} · {ANGLES[c.angle]?.name}
        </span>
        <span className="ch-lcard-eta">{eta.text}</span>
        <span className="ch-lcard-producer">
          {who.portrait ? <Portrait id={who.portrait} name={who.name} size={20} /> : <span className="ch-mini-avatar">{c.producer === 'agency' ? 'NC' : (s.player.name || 'You').slice(0, 1).toUpperCase()}</span>}
          <span className="ch-ellipsis">{who.name}</span>
          <span className="ch-muted">· {c.cost > 0 ? money(c.cost) : 'free'}</span>
        </span>
        {t && t.impressions > 0 ? (
          <span className="ch-lcard-stats">
            <span><small>Spend</small><b>{money(t.spend, { cents: t.spend < 1000 })}</b></span>
            <span><small>Link CTR</small><b>{pct(m!.ctrLink)}</b></span>
            <span><small>{c.isVideo ? 'Hook rate' : 'Impr.'}</small><b>{c.isVideo ? pct(m!.hookRate, 1) : compactNum(t.impressions)}</b></span>
          </span>
        ) : (
          <span className="ch-lcard-usage ch-muted">
            {c.status === 'ready' ? (perf?.ads ? 'In ads, no delivery yet' : 'Not in any ads yet') : c.status === 'failed' ? 'No footage delivered' : 'Metrics appear once it runs'}
          </span>
        )}
        <span className="ch-lcard-foot">
          <span>{perf?.ads ? `Used in ${perf.ads} ad${perf.ads === 1 ? '' : 's'}${perf.live ? ` · ${perf.live} live` : ''}` : c.status === 'ready' ? 'Unused' : ''}</span>
          {exposure >= TIPS_MIN_IMPRESSIONS && <span className="ch-insight-pill"><Lightbulb size={11} />Insights</span>}
        </span>
      </span>
    </button>
  )
}
