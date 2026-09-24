// Mineo — Trending ads feed: every tracked product's top ads across Fadbook & TikTak.
import { useMemo, useState } from 'react'
import { Flame, Search, SlidersHorizontal } from 'lucide-react'
import type { Niche, Platform } from '../../../core/types'
import { HOOK_LIST } from '../../../data/creativeTaxonomy'
import { cx } from '../../kit/common'
import { AdCard } from './components'
import { feedFrom, productLabel, useSpyRows, useToday } from './data'
import { NICHE_LABEL } from './labels'

type SortKey = 'trending' | 'likes' | 'shares' | 'newest' | 'longest'
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'trending', label: 'Trending (engagement / day)' },
  { id: 'likes', label: 'Most likes' },
  { id: 'shares', label: 'Most shares' },
  { id: 'newest', label: 'Newest first' },
  { id: 'longest', label: 'Longest running' },
]
const PAGE = 16

export default function AdsFeed({ navigate, initialQuery }: { navigate: (p: string) => void; initialQuery: string }) {
  const rows = useSpyRows()
  const today = useToday()
  const [q, setQ] = useState(initialQuery)
  const [platform, setPlatform] = useState<'all' | Platform>('all')
  const [niche, setNiche] = useState<'all' | Niche>('all')
  const [hook, setHook] = useState('all')
  const [fresh, setFresh] = useState(false)
  const [sort, setSort] = useState<SortKey>('trending')
  const [shown, setShown] = useState(PAGE)

  const all = useMemo(() => feedFrom(rows), [rows])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const out = all.filter(a =>
      (platform === 'all' || a.platform === platform) &&
      (niche === 'all' || a.niche === niche) &&
      (hook === 'all' || a.hookId === hook) &&
      (!fresh || a.daysRunning <= 14) &&
      (!t || `${productLabel(a.product)} ${a.advertiser} ${a.hookText ?? ''} ${a.hook}`.toLowerCase().includes(t)),
    )
    out.sort((a, b) => {
      switch (sort) {
        case 'likes': return b.likes - a.likes
        case 'shares': return b.shares - a.shares
        case 'newest': return a.daysRunning - b.daysRunning || b.velocity - a.velocity
        case 'longest': return b.daysRunning - a.daysRunning
        default: return b.velocity - a.velocity
      }
    })
    return out
  }, [all, q, platform, niche, hook, fresh, sort])
  const advertisers = useMemo(() => new Set(list.map(a => a.advertiser)).size, [list])
  const reset = () => { setQ(''); setPlatform('all'); setNiche('all'); setHook('all'); setFresh(false); setShown(PAGE) }
  const set = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setShown(PAGE) }

  return (
    <div className="mi-page">
      <div className="mi-page-head">
        <div>
          <h1><Flame size={22} /> Trending ads</h1>
          <p className="mi-muted">Top-engaging creatives per product, refreshed daily from the Fadbook and TikTak ad libraries.</p>
        </div>
      </div>

      <div className="mi-toolbar">
        <label className="mi-search">
          <Search size={15} />
          <input value={q} onChange={e => set(setQ)(e.target.value)} placeholder="Search product, advertiser or hook text" />
        </label>
        <div className="mi-seg" role="group" aria-label="Platform">
          {(['all', 'fadbook', 'tiktak'] as const).map(p => (
            <button key={p} type="button" className={cx(platform === p && 'on')} onClick={() => set(setPlatform)(p)}>{p === 'all' ? 'All' : p === 'fadbook' ? 'Fadbook' : 'TikTak'}</button>
          ))}
        </div>
        <select className="mi-select" value={niche} onChange={e => set(setNiche)(e.target.value as 'all' | Niche)} aria-label="Niche">
          <option value="all">All niches</option>
          {Object.entries(NICHE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="mi-select" value={hook} onChange={e => set(setHook)(e.target.value)} aria-label="Hook type">
          <option value="all">All hook types</option>
          {HOOK_LIST.map(hk => <option key={hk.id} value={hk.id}>{hk.name}</option>)}
        </select>
        <label className="mi-toggle">
          <input type="checkbox" checked={fresh} onChange={e => set(setFresh)(e.target.checked)} />
          <span /> New ads (≤ 14 days)
        </label>
        <select className="mi-select mi-select-sort" value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort">
          {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div className="mi-resultline">
        <SlidersHorizontal size={14} /> <b>{list.length.toLocaleString('en-US')}</b> ads from <b>{advertisers.toLocaleString('en-US')}</b> advertisers
        {(q || platform !== 'all' || niche !== 'all' || hook !== 'all' || fresh) && <button type="button" className="mi-link" onClick={reset}>Clear filters</button>}
      </div>

      {list.length ? (
        <div className="mi-feed">
          {list.slice(0, shown).map(a => <AdCard key={a.key} ad={a} today={today} onProduct={id => navigate(`product/${id}`)} />)}
        </div>
      ) : (
        <div className="mi-empty"><Search size={30} /><b>No ads match these filters</b><span>Try another niche or hook type.</span></div>
      )}
      {shown < list.length && (
        <div className="mi-center"><button type="button" className="mi-btn mi-btn-ghost" onClick={() => setShown(n => n + PAGE)}>Load more ads</button></div>
      )}
    </div>
  )
}
