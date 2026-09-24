// Mineo — Product analytics: ads over time, advertisers, engagement, prices, top ads & hook types.
import { useMemo } from 'react'
import { ArrowLeft, ExternalLink, Info, Minus, SearchX, TrendingDown, TrendingUp } from 'lucide-react'
import { productImage } from '../../../core/assets'
import { getGS, useGS } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { formatDate } from '../../../core/time'
import { findProduct, marketHistory } from '../../../sim/market'
import { ImageWithFallback, cx } from '../../kit/common'
import { AdCard, Kpi, Panel, PlatformBadge, WatchButton } from './components'
import { GlowArea, ShareBars } from './charts'
import { TREND_LABEL, agoLabel, feedFrom, productLabel, socialCount, usd, useSpyRow, useToday } from './data'
import { NICHE_LABEL } from './labels'

const HOOK_COLORS = ['#8b6cff', '#ff5ca8', '#3ddc97', '#ffb547', '#4fb3ff', '#c38bff']

export default function ProductPage({ id, navigate }: { id: string; navigate: (p: string) => void }) {
  const row = useSpyRow(id)
  const today = useToday()
  const favs = useGS(s => s.catalog.favorites)
  const market = useGS(s => s.catalog.market[id])
  const ads = useMemo(() => (row ? feedFrom([row]) : []), [row])
  const advertisersHist = useMemo(
    () => marketHistory(getGS(), id).map(h => ({ label: formatDate(h.day, 'md'), value: h.competitors })),
    [id, market],
  )
  const hooks = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of ads) m.set(a.hook, (m.get(a.hook) ?? 0) + a.engagement)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: HOOK_COLORS[i % HOOK_COLORS.length] }))
  }, [ads])
  const formats = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of ads) if (a.format) m.set(a.format, (m.get(a.format) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: HOOK_COLORS[(i + 2) % HOOK_COLORS.length] }))
  }, [ads])

  if (!row) {
    const p = findProduct(id)
    return (
      <div className="mi-page">
        <button type="button" className="mi-back" onClick={() => navigate('products')}><ArrowLeft size={15} /> Products</button>
        <div className="mi-empty"><SearchX size={30} /><b>{p ? `${p.name} isn’t in the ad library yet` : 'Product not found'}</b><span>We start tracking products once suppliers list them.</span></div>
      </div>
    )
  }
  const { p, d, l } = row
  const TrendIcon = d.engagementTrend === 'rising' ? TrendingUp : d.engagementTrend === 'falling' ? TrendingDown : Minus
  const tone = d.engagementTrend === 'rising' ? 'up' : d.engagementTrend === 'falling' ? 'down' : 'flat'
  const ttShare = d.tiktakShare ?? 0.5
  const adsSeries = (d.adsHistory ?? []).map(x => ({ label: formatDate(x.day, 'md'), value: x.ads }))
  const multiple = l && l.price > 0 ? d.competitorPrice / l.price : null

  return (
    <div className="mi-page">
      <button type="button" className="mi-back" onClick={() => navigate('products')}><ArrowLeft size={15} /> Products</button>
      <div className="mi-prodhead">
        <ImageWithFallback src={productImage(p.id)} alt={p.name} width={72} radius={14} fit="contain" style={{ background: '#fff' }} />
        <div className="mi-prodhead-copy">
          <h1>{productLabel(p)}</h1>
          <div className="mi-prodhead-tags">
            <span className="mi-tag">{NICHE_LABEL[p.niche]}</span>
            <span className={cx('mi-trend', `mi-trend-${d.engagementTrend}`)}><TrendIcon size={12} /> Engagement {TREND_LABEL[d.engagementTrend].toLowerCase()}</span>
            {l && <span className="mi-tag">AliExprez {usd(l.price)}</span>}
          </div>
        </div>
        <div className="mi-prodhead-actions">
          <WatchButton id={p.id} on={favs.includes(p.id)} />
          <button type="button" className="mi-btn mi-btn-ghost" onClick={() => openSite('aliexprez', `item/${p.id}`)}><ExternalLink size={15} /> AliExprez listing</button>
        </div>
      </div>

      <div className="mi-kpis">
        <Kpi label="Active ads" value={d.activeAds.toLocaleString('en-US')} sub="Running right now" />
        <Kpi label="Advertisers" value={d.advertisers.toLocaleString('en-US')} sub="Stores running ads" />
        <Kpi label="First seen" value={d.activeAds ? (d.firstSeenDaysAgo < 60 ? `${d.firstSeenDaysAgo} days ago` : agoLabel(d.firstSeenDaysAgo)) : '—'} sub={d.activeAds ? formatDate(today - d.firstSeenDaysAgo, 'short') : 'No ads yet'} />
        <Kpi label="Avg likes / ad" value={socialCount(d.avgLikes)} sub={<>Engagement <b className={`mi-tone-${tone}`}>{TREND_LABEL[d.engagementTrend].toLowerCase()}</b></>} />
        <Kpi label="Lowest store price" value={usd(d.competitorPrice)} sub={multiple ? `${multiple.toFixed(1)}× the AliExprez price` : undefined} />
        <Kpi label="Platform split" value={`${Math.round(ttShare * 100)}% TikTak`} sub={`${Math.round((1 - ttShare) * 100)}% Fadbook / Instaglam`} />
      </div>

      <div className="mi-grid2">
        <Panel title="Active ads · last 30 days"><GlowArea data={adsSeries} unit="ads" /></Panel>
        <Panel title="Advertisers · last 90 days"><GlowArea data={advertisersHist} color="#3dd5c7" unit="advertisers" /></Panel>
      </div>

      <div className="mi-grid3">
        <Panel title="Hook types in top ads" extra={<span className="mi-muted mi-small">by engagement</span>}>
          {hooks.length ? <ShareBars rows={hooks} /> : <div className="mi-muted mi-small">No ads running.</div>}
        </Panel>
        <Panel title="Formats in top ads">
          {formats.length ? <ShareBars rows={formats} /> : <div className="mi-muted mi-small">No ads running.</div>}
        </Panel>
        <Panel title="Platforms">
          <ShareBars rows={[
            { label: 'TikTak', value: ttShare, color: '#ff3d7f' },
            { label: 'Fadbook / Instaglam', value: 1 - ttShare, color: '#4f8bff' },
          ]} />
          <p className="mi-help"><Info size={13} /> Share of all active ads for this product, by platform.</p>
        </Panel>
      </div>

      {ads.length > 0 && (
        <Panel title={`Top ads (${ads.length})`} extra={<span className="mi-muted mi-small">Hover to play</span>}>
          <div className="mi-feed mi-feed-tight">
            {ads.map(a => <AdCard key={a.key} ad={a} today={today} showProduct={false} width={190} />)}
          </div>
        </Panel>
      )}

      {ads.length > 0 && (
        <Panel title="Stores advertising it">
          <div className="mi-table-wrap">
            <table className="mi-table mi-table-static">
              <thead><tr><th>Store</th><th>Platform</th><th className="mi-num">Price</th><th className="mi-num">Running</th><th className="mi-num">Likes</th><th>Hook</th></tr></thead>
              <tbody>
                {ads.map(a => (
                  <tr key={a.key}>
                    <td><b>{a.advertiser}</b></td>
                    <td><PlatformBadge platform={a.platform} /></td>
                    <td className="mi-num">{a.price !== undefined ? usd(a.price) : '—'}</td>
                    <td className="mi-num">{a.daysRunning} days</td>
                    <td className="mi-num">{socialCount(a.likes)}</td>
                    <td>{a.hook}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title="Reading ad-library data" className="mi-readme">
        <ul>
          <li>Many advertisers with ads that have run for months usually means a mature market: proven demand, but crowded auctions and price pressure.</li>
          <li>A handful of recent ads with strong engagement can mean an early window, before the copycats arrive.</li>
          <li>Engagement is a leading signal, not revenue. Compare prices with your landed cost before you commit.</li>
        </ul>
      </Panel>
    </div>
  )
}
