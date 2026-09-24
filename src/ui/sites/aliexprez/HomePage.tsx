// AliExprez — home: category rail, banner carousel, SuperDeals, New arrivals, "More to love" feed.
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Factory, FlaskConical, Heart, Package, Sparkles, TrendingUp, Zap } from 'lucide-react'
import { useGS } from '../../../core/store'
import { hourOfDay } from '../../../core/time'
import { Countdown, cx, initials } from '../../kit/common'
import type { AxPageProps } from './index'
import { useFavoriteSet, useImported, useListings, useSampleStatus, useToday } from './hooks'
import { NICHES, hrand, productNoun, searchRows, withQuery, type Row } from './lib'
import { ChoiceBadge, NicheIcon, ProductCard, ProductShot, SectionHead, SHOT_MAIN } from './components'

const PAGE = 20

export default function HomePage({ navigate }: AxPageProps) {
  const rows = useListings()
  const day = useToday()
  const favs = useFavoriteSet()
  const imported = useImported()
  const samples = useSampleStatus()
  const name = useGS(s => s.player.name || s.meta.playerName)
  const research = useGS(s => s.catalog.research)
  const agent = useGS(s => s.catalog.unlocks.agent)
  const [shown, setShown] = useState(PAGE)
  const open = (id: string) => navigate(`item/${id}`)
  const flags = (id: string) => ({ fav: favs.has(id), imported: imported.has(id), sample: samples.get(id) })

  const deals = useMemo(
    () => [...rows].sort((a, b) => (b.l.discountPct ?? 0) + hrand(b.p.id, 'deal', day) * 0.25 - ((a.l.discountPct ?? 0) + hrand(a.p.id, 'deal', day) * 0.25)).slice(0, 6),
    [rows, day],
  )
  const fresh = useMemo(() => rows.filter(r => day - r.p.releaseDay <= 30 && r.p.releaseDay > 0).sort((a, b) => b.p.releaseDay - a.p.releaseDay).slice(0, 6), [rows, day])
  const feed = useMemo(() => searchRows(rows, { day, sort: 'best' }), [rows, day])
  const researched = useMemo(() => Object.values(research).filter(v => v > 0).length, [research])
  // search volume follows public order velocity, with some daily churn
  const trending = useMemo(
    () => [...rows].sort((a, b) => b.l.orders30d * (0.6 + hrand(b.p.id, 'ts', day)) - a.l.orders30d * (0.6 + hrand(a.p.id, 'ts', day))).slice(0, 6).map(r => productNoun(r.p)),
    [rows, day],
  )

  return (
    <div className="ax-wrap ax-home">
      <section className="ax-hero">
        <nav className="ax-rail" aria-label="Categories">
          <div className="ax-rail-title">Categories</div>
          {NICHES.map(n => (
            <button key={n.id} type="button" className="ax-rail-item" onClick={() => navigate(`category/${n.id}`)}>
              <NicheIcon niche={n.id} size={16} /> <span>{n.label}</span> <ChevronRight size={14} className="ax-rail-chev" />
            </button>
          ))}
        </nav>
        <Banners rows={rows} fresh={fresh} navigate={navigate} />
        <aside className="ax-welcome">
          <div className="ax-welcome-top">
            <span className="ax-avatar ax-avatar-lg">{initials(name || 'You')}</span>
            <div>
              <div className="ax-welcome-hi">Hi, {(name || 'there').split(' ')[0]}</div>
              <div className="ax-muted ax-small">Dropshipper account · US</div>
            </div>
          </div>
          <div className="ax-welcome-stats">
            <button type="button" onClick={() => navigate('wishlist')}><b>{favs.size}</b><span><Heart size={12} /> Wishlist</span></button>
            <button type="button" onClick={() => navigate('orders')}><b>{[...samples.values()].filter(v => v === 'shipping').length}</b><span><Package size={12} /> In transit</span></button>
            <button type="button" onClick={() => navigate('search')}><b>{researched}</b><span><FlaskConical size={12} /> Researched</span></button>
          </div>
          <div className="ax-trending">
            <div className="ax-trending-h"><TrendingUp size={14} /> Trending searches</div>
            <div className="ax-trending-list">
              {trending.map(t => <button key={t} type="button" onClick={() => navigate(withQuery('search', { q: t }))}>{t}</button>)}
            </div>
          </div>
          <button type="button" className="ax-welcome-biz" onClick={() => navigate('business')}>
            <Factory size={16} />
            <span>
              <b>Dropshipping center</b>
              <em>{agent ? 'Agent, bulk orders & 3PL' : 'Unlocks at 100 store orders'}</em>
            </span>
            <ChevronRight size={16} />
          </button>
        </aside>
      </section>

      <section className="ax-block ax-deals">
        <SectionHead
          title="SuperDeals" icon={<Zap size={20} fill="currentColor" />}
          extra={<button type="button" className="ax-link" onClick={() => navigate(withQuery('search', { sort: 'orders' }))}>View more <ChevronRight size={14} /></button>}
        >
          <DealsCountdown />
        </SectionHead>
        <div className="ax-row">
          {deals.map(r => <ProductCard key={r.p.id} row={r} flags={flags(r.p.id)} onOpen={open} deal />)}
        </div>
      </section>

      {fresh.length > 0 && (
        <section className="ax-block">
          <SectionHead
            title="New arrivals" icon={<Sparkles size={18} />}
            extra={<button type="button" className="ax-link" onClick={() => navigate('new')}>View more <ChevronRight size={14} /></button>}
          >
            <span className="ax-muted ax-small">Just listed by suppliers this month</span>
          </SectionHead>
          <div className="ax-row">
            {fresh.map(r => <ProductCard key={r.p.id} row={r} flags={flags(r.p.id)} onOpen={open} />)}
          </div>
        </section>
      )}

      <section className="ax-block ax-block-plain">
        <SectionHead title="More to love" />
        <div className="ax-grid">
          {feed.slice(0, shown).map(r => <ProductCard key={r.p.id} row={r} flags={flags(r.p.id)} onOpen={open} />)}
        </div>
        {shown < feed.length && (
          <div className="ax-center"><button type="button" className="ax-btn ax-btn-outline" onClick={() => setShown(n => n + PAGE)}>View more</button></div>
        )}
      </section>
    </div>
  )
}

/** SuperDeals end at midnight. Own component so the clock ticking doesn't re-render the whole home page. */
function DealsCountdown() {
  const hoursLeft = useGS(s => 24 - hourOfDay(s.time.hour))
  return <span className="ax-ends">Ends in <Countdown hoursLeft={hoursLeft} urgentBelowHours={0} /></span>
}

function Banners({ rows, fresh, navigate }: { rows: Row[]; fresh: Row[]; navigate: (p: string) => void }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setIdx(i => (i + 1) % 3), 6000)
    return () => window.clearInterval(t)
  }, [])
  const top = useMemo(() => [...rows].sort((a, b) => b.l.orders30d - a.l.orders30d).slice(0, 3), [rows])
  const choice = useMemo(() => rows.filter(r => r.l.choice).slice(0, 3), [rows])
  const slides = [
    { key: 'deals', cls: 'ax-banner-red', kicker: 'SuperDeals', title: 'Up to 70% off', sub: 'Bestsellers from verified suppliers', items: top, go: withQuery('search', { sort: 'orders' }) },
    { key: 'choice', cls: 'ax-banner-gold', kicker: <ChoiceBadge />, title: 'Faster delivery to the US', sub: 'Consolidated shipping · 7–12 days + customs', items: choice, go: withQuery('search', { choice: true }) },
    { key: 'new', cls: 'ax-banner-violet', kicker: 'New arrivals', title: 'Fresh from the factories', sub: fresh.length ? `${fresh.length} new listings this month` : 'Updated every week', items: fresh.length ? fresh.slice(0, 3) : top, go: 'new' },
  ]
  return (
    <div className="ax-banners">
      {slides.map((s, i) => (
        <button key={s.key} type="button" className={cx('ax-banner', s.cls, i === idx && 'ax-banner-on')} onClick={() => navigate(s.go)} aria-hidden={i !== idx} tabIndex={i === idx ? 0 : -1}>
          <div className="ax-banner-copy">
            <span className="ax-banner-kicker">{s.kicker}</span>
            <strong>{s.title}</strong>
            <span>{s.sub}</span>
            <span className="ax-banner-cta">Shop now</span>
          </div>
          <div className="ax-banner-shots">
            {s.items.map((r, j) => (
              <div key={r.p.id} className={`ax-banner-shot ax-banner-shot${j}`}>
                <ProductShot p={r.p} variant={SHOT_MAIN} rounded={12} />
              </div>
            ))}
          </div>
        </button>
      ))}
      <div className="ax-banner-dots">
        {slides.map((s, i) => <button key={s.key} type="button" className={cx(i === idx && 'on')} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} />)}
      </div>
    </div>
  )
}
