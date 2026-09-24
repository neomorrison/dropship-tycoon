// Mineo — Product search: every tracked product with its ad-library metrics, sortable & filterable.
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Bookmark, Minus, Package, Search, TrendingDown, TrendingUp } from 'lucide-react'
import type { Niche } from '../../../core/types'
import { productImage } from '../../../core/assets'
import { useGS } from '../../../core/store'
import { ImageWithFallback, cx } from '../../kit/common'
import { MiniSpark } from './charts'
import { WatchButton } from './components'
import { TREND_LABEL, agoLabel, productLabel, socialCount, usd, useSpyRows, type SpyRow } from './data'
import { NICHE_LABEL } from './labels'

type Col = 'name' | 'ads' | 'advertisers' | 'growth' | 'seen' | 'likes' | 'price' | 'cost'
type SeenFilter = 'any' | '30' | '90' | 'old'
const TREND_ICON = { rising: TrendingUp, flat: Minus, falling: TrendingDown }

function growth(r: SpyRow): number {
  const h = r.d.adsHistory ?? []
  if (h.length < 14) return 0
  const last = h.slice(-7).reduce((a, x) => a + x.ads, 0)
  const prev = h.slice(-14, -7).reduce((a, x) => a + x.ads, 0)
  return prev > 0 ? last / prev - 1 : last > 0 ? 1 : 0
}

export default function Products({ navigate, initialQuery, watchlist }: { navigate: (p: string) => void; initialQuery: string; watchlist?: boolean }) {
  const rows = useSpyRows()
  const favs = useGS(s => s.catalog.favorites)
  const [q, setQ] = useState(initialQuery)
  const [niche, setNiche] = useState<'all' | Niche>('all')
  const [seen, setSeen] = useState<SeenFilter>('any')
  const [trend, setTrend] = useState<'any' | 'rising' | 'flat' | 'falling'>('any')
  const [lean, setLean] = useState<'any' | 'tiktak' | 'fadbook'>('any')
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 }>({ col: 'ads', dir: -1 })

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const fav = new Set(favs)
    const out = rows.filter(r =>
      (!watchlist || fav.has(r.p.id)) &&
      (niche === 'all' || r.p.niche === niche) &&
      (trend === 'any' || r.d.engagementTrend === trend) &&
      (lean === 'any' || (lean === 'tiktak' ? (r.d.tiktakShare ?? 0.5) >= 0.55 : (r.d.tiktakShare ?? 0.5) <= 0.45)) &&
      (seen === 'any' || (seen === '30' ? r.d.firstSeenDaysAgo <= 30 : seen === '90' ? r.d.firstSeenDaysAgo <= 90 : r.d.firstSeenDaysAgo > 180)) &&
      (!t || `${r.p.name} ${NICHE_LABEL[r.p.niche]}`.toLowerCase().includes(t)),
    )
    const val = (r: SpyRow): number | string => {
      switch (sort.col) {
        case 'name': return productLabel(r.p)
        case 'advertisers': return r.d.advertisers
        case 'growth': return growth(r)
        case 'seen': return r.d.firstSeenDaysAgo
        case 'likes': return r.d.avgLikes
        case 'price': return r.d.competitorPrice
        case 'cost': return r.l?.price ?? 0
        default: return r.d.activeAds
      }
    }
    out.sort((a, b) => {
      const x = val(a), y = val(b)
      return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * sort.dir
    })
    return out
  }, [rows, favs, watchlist, q, niche, trend, lean, seen, sort])

  const th = (col: Col, label: string, align: 'left' | 'right' = 'right') => (
    <th className={cx(align === 'right' && 'mi-num')}>
      <button type="button" className={cx('mi-th', sort.col === col && 'on')} onClick={() => setSort(s => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : col === 'name' || col === 'seen' || col === 'price' || col === 'cost' ? 1 : -1 }))}>
        {label}{sort.col === col && (sort.dir === -1 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  )

  return (
    <div className="mi-page">
      <div className="mi-page-head">
        <div>
          <h1>{watchlist ? <><Bookmark size={22} /> Watchlist</> : <><Package size={22} /> Products</>}</h1>
          <p className="mi-muted">{watchlist ? 'Products you saved (shared with your AliExprez wishlist).' : 'Every product with ads in the library. Click a row for full analytics.'}</p>
        </div>
      </div>
      <div className="mi-toolbar">
        <label className="mi-search">
          <Search size={15} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products" />
        </label>
        <select className="mi-select" value={niche} onChange={e => setNiche(e.target.value as 'all' | Niche)} aria-label="Niche">
          <option value="all">All niches</option>
          {Object.entries(NICHE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="mi-select" value={seen} onChange={e => setSeen(e.target.value as SeenFilter)} aria-label="First seen">
          <option value="any">First seen: any time</option>
          <option value="30">First seen: last 30 days</option>
          <option value="90">First seen: last 90 days</option>
          <option value="old">First seen: 6+ months ago</option>
        </select>
        <select className="mi-select" value={trend} onChange={e => setTrend(e.target.value as typeof trend)} aria-label="Engagement">
          <option value="any">Engagement: any</option>
          <option value="rising">Engagement: rising</option>
          <option value="flat">Engagement: stable</option>
          <option value="falling">Engagement: falling</option>
        </select>
        <select className="mi-select" value={lean} onChange={e => setLean(e.target.value as typeof lean)} aria-label="Platform">
          <option value="any">Platform: any</option>
          <option value="tiktak">Mostly TikTak</option>
          <option value="fadbook">Mostly Fadbook</option>
        </select>
      </div>
      <div className="mi-resultline"><b>{list.length}</b> products</div>
      {list.length ? (
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                {th('name', 'Product', 'left')}
                {th('ads', 'Active ads')}
                {th('advertisers', 'Advertisers')}
                {th('growth', 'Ads · 30 days')}
                {th('seen', 'First seen')}
                <th>Engagement</th>
                {th('likes', 'Avg likes')}
                {th('price', 'Lowest price')}
                {th('cost', 'AliExprez')}
                <th aria-label="Watch" />
              </tr>
            </thead>
            <tbody>
              {list.map(r => {
                const Icon = TREND_ICON[r.d.engagementTrend]
                const g = growth(r)
                const fav = favs.includes(r.p.id)
                return (
                  <tr key={r.p.id} onClick={() => navigate(`product/${r.p.id}`)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') navigate(`product/${r.p.id}`) }}>
                    <td>
                      <div className="mi-prodcell">
                        <ImageWithFallback src={productImage(r.p.id)} alt={r.p.name} width={38} radius={8} fit="contain" style={{ background: '#fff' }} />
                        <div><b>{productLabel(r.p)}</b><span>{NICHE_LABEL[r.p.niche]}</span></div>
                      </div>
                    </td>
                    <td className="mi-num"><b>{r.d.activeAds.toLocaleString('en-US')}</b></td>
                    <td className="mi-num">{r.d.advertisers.toLocaleString('en-US')}</td>
                    <td className="mi-num">
                      <div className="mi-sparkcell">
                        <MiniSpark values={(r.d.adsHistory ?? []).map(x => x.ads)} />
                        <span className={cx(g > 0.05 ? 'mi-tone-up' : g < -0.05 ? 'mi-tone-down' : 'mi-muted')}>{g >= 0 ? '+' : '−'}{Math.round(Math.abs(g) * 100)}%</span>
                      </div>
                    </td>
                    <td className="mi-num">{r.d.activeAds ? agoLabel(r.d.firstSeenDaysAgo) : '—'}</td>
                    <td><span className={cx('mi-trend', `mi-trend-${r.d.engagementTrend}`)}><Icon size={12} /> {TREND_LABEL[r.d.engagementTrend]}</span></td>
                    <td className="mi-num">{socialCount(r.d.avgLikes)}</td>
                    <td className="mi-num">{usd(r.d.competitorPrice)}</td>
                    <td className="mi-num mi-muted">{r.l ? usd(r.l.price) : '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <WatchButton id={r.p.id} on={fav} label={false} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mi-empty">
          {watchlist ? <Bookmark size={30} /> : <Search size={30} />}
          <b>{watchlist ? 'Your watchlist is empty' : 'No products match'}</b>
          <span>{watchlist ? 'Save products from their analytics page to track them here.' : 'Loosen the filters or try a broader search.'}</span>
        </div>
      )}
    </div>
  )
}
