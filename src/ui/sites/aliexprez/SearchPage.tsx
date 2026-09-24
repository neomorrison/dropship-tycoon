// AliExprez — search results, category browsing, New arrivals and Wishlist (same grid).
import { useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Heart, SearchX, Sparkles } from 'lucide-react'
import { cx } from '../../kit/common'
import type { AxPageProps } from './index'
import { useFavoriteSet, useImported, useListings, useSampleStatus, useToday } from './hooks'
import { NICHES, NICHE_BY_ID, SORTS, isNiche, isSort, searchRows, withQuery, type SortKey } from './lib'
import { ChoiceBadge, ProductCard } from './components'

const PER_PAGE = 24

export default function SearchPage({ mode, q, navigate }: AxPageProps & { mode: 'search' | 'new' | 'wishlist'; q: URLSearchParams }) {
  const rows = useListings()
  const day = useToday()
  const favs = useFavoriteSet()
  const imported = useImported()
  const samples = useSampleStatus()

  const query = q.get('q') ?? ''
  const catParam = q.get('cat')
  const cat = isNiche(catParam) ? catParam : null
  const sortParam = q.get('sort')
  const sort: SortKey = isSort(sortParam) ? sortParam : mode === 'new' ? 'newest' : 'best'
  const choice = q.get('choice') === '1'
  const stars4 = q.get('r4') === '1'
  const fast = q.get('fast') === '1'
  const page = Math.max(1, Number(q.get('page')) || 1)

  const base = mode === 'search' ? 'search' : mode === 'new' ? 'new' : 'wishlist'
  const params = { q: query, cat, sort: sort === (mode === 'new' ? 'newest' : 'best') ? null : sort, choice, r4: stars4, fast }
  const go = (patch: Partial<Record<keyof typeof params | 'page', string | boolean | null | number>>) =>
    navigate(withQuery(base, { ...params, page: null, ...patch }))

  const pool = useMemo(() => {
    if (mode === 'wishlist') return rows.filter(r => favs.has(r.p.id))
    if (mode === 'new') return rows.filter(r => r.p.releaseDay > 0 && day - r.p.releaseDay <= 45)
    return rows
  }, [rows, mode, favs, day])
  const catCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of searchRows(pool, { q: query, day, choice, stars4, fast })) m.set(r.p.niche, (m.get(r.p.niche) ?? 0) + 1)
    return m
  }, [pool, query, day, choice, stars4, fast])
  const results = useMemo(() => searchRows(pool, { q: query, cat, sort, choice, stars4, fast, day }), [pool, query, cat, sort, choice, stars4, fast, day])
  const pages = Math.max(1, Math.ceil(results.length / PER_PAGE))
  const pageRows = results.slice((Math.min(page, pages) - 1) * PER_PAGE, Math.min(page, pages) * PER_PAGE)
  const open = (id: string) => navigate(`item/${id}`)

  const heading = mode === 'wishlist' ? 'My wishlist'
    : mode === 'new' ? 'New arrivals'
      : query ? <>{results.length.toLocaleString('en-US')} results for <q>{query}</q></>
        : cat ? NICHE_BY_ID[cat].label : 'All categories'

  const priceSort = sort === 'price_asc' ? 'price_desc' : 'price_asc'
  return (
    <div className="ax-wrap ax-search-page">
      <div className="ax-crumbs">
        <button type="button" onClick={() => navigate('')}>Home</button>
        <ChevronRight size={12} />
        {mode === 'search'
          ? <button type="button" onClick={() => navigate('search')}>All categories</button>
          : <span>{mode === 'new' ? 'New arrivals' : 'Wishlist'}</span>}
        {cat && <><ChevronRight size={12} /><span>{NICHE_BY_ID[cat].label}</span></>}
      </div>
      <div className="ax-results-head">
        <h1>{mode === 'wishlist' && <Heart size={20} />}{mode === 'new' && <Sparkles size={20} />}{heading}</h1>
        {mode !== 'search' && <span className="ax-muted">{results.length} items</span>}
      </div>

      <div className="ax-chips" role="tablist" aria-label="Category">
        <button type="button" role="tab" aria-selected={!cat} className={cx('ax-chip', !cat && 'ax-chip-on')} onClick={() => go({ cat: null })}>All</button>
        {NICHES.filter(n => (catCounts.get(n.id) ?? 0) > 0 || cat === n.id).map(n => {
          const Icon = n.icon
          return (
            <button key={n.id} type="button" role="tab" aria-selected={cat === n.id} className={cx('ax-chip', cat === n.id && 'ax-chip-on')} onClick={() => go({ cat: cat === n.id ? null : n.id })}>
              <Icon size={14} /> {n.short} <span className="ax-chip-n">{catCounts.get(n.id) ?? 0}</span>
            </button>
          )
        })}
      </div>

      <div className="ax-sortbar">
        <div className="ax-sorts">
          <span className="ax-muted ax-small">Sort by:</span>
          {SORTS.filter(s => !s.id.startsWith('price')).map(s => (
            <button key={s.id} type="button" className={cx('ax-sort', sort === s.id && 'ax-sort-on')} onClick={() => go({ sort: s.id })}>{s.label}</button>
          ))}
          <button type="button" className={cx('ax-sort', sort.startsWith('price') && 'ax-sort-on')} onClick={() => go({ sort: priceSort })}>
            Price {sort === 'price_asc' ? <ArrowUp size={13} /> : sort === 'price_desc' ? <ArrowDown size={13} /> : <ArrowUpDown size={13} />}
          </button>
        </div>
        <div className="ax-filters">
          <label className="ax-check"><input type="checkbox" checked={choice} onChange={e => go({ choice: e.target.checked })} /> <ChoiceBadge small /></label>
          <label className="ax-check"><input type="checkbox" checked={stars4} onChange={e => go({ r4: e.target.checked })} /> 4.5★ &amp; up</label>
          <label className="ax-check"><input type="checkbox" checked={fast} onChange={e => go({ fast: e.target.checked })} /> Delivery ≤ 16 days</label>
        </div>
      </div>

      {pageRows.length ? (
        <div className="ax-grid">
          {pageRows.map(r => <ProductCard key={r.p.id} row={r} flags={{ fav: favs.has(r.p.id), imported: imported.has(r.p.id), sample: samples.get(r.p.id) }} onOpen={open} />)}
        </div>
      ) : (
        <div className="ax-empty">
          {mode === 'wishlist' ? <Heart size={44} strokeWidth={1.25} /> : <SearchX size={44} strokeWidth={1.25} />}
          <h3>{mode === 'wishlist' ? 'Your wishlist is empty' : mode === 'new' ? 'No new listings right now' : 'No matching items'}</h3>
          <p>
            {mode === 'wishlist' ? 'Tap ♡ on any product to save it for later research.'
              : mode === 'new' ? 'Suppliers list new products every week. Check back soon.'
                : 'Try fewer or more general words, or remove filters.'}
          </p>
          <button type="button" className="ax-btn ax-btn-red" onClick={() => navigate(mode === 'search' ? 'search' : '')}>{mode === 'search' ? 'Clear search' : 'Browse products'}</button>
        </div>
      )}

      {pages > 1 && (
        <div className="ax-pager">
          <button type="button" disabled={page <= 1} onClick={() => go({ page: page - 1 })} aria-label="Previous page"><ChevronLeft size={16} /></button>
          {Array.from({ length: pages }, (_, i) => i + 1).map(n => (
            <button key={n} type="button" className={cx(n === Math.min(page, pages) && 'on')} onClick={() => go({ page: n })}>{n}</button>
          ))}
          <button type="button" disabled={page >= pages} onClick={() => go({ page: page + 1 })} aria-label="Next page"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  )
}
