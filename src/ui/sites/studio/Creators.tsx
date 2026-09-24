// UGC creator marketplace: this week's listings (refreshed every Monday by the ads module).
import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, CalendarDays, Clock, MapPin, SlidersHorizontal, Sparkles, UserCheck } from 'lucide-react'
import type { Niche, UgcCreator } from '../../../core/types'
import { useGS } from '../../../core/store'
import { dayOf, formatDate } from '../../../core/time'
import { money } from '../../../core/format'
import { CREATOR_TIERS } from '../../../data/creators'
import { findProduct } from '../../../sim/market'
import { Stars, cx } from '../../kit/common'
import { useBriefDraft } from './draft'
import { NICHE_LABEL, firstName } from './helpers'
import { Badge, EmptyBlock, Portrait, Segmented } from './ui'

type TierFilter = 'all' | UgcCreator['tier']
type SortKey = 'recommended' | 'price' | 'rating' | 'fastest' | 'jobs'
const TIER_TONE = { star: 'accent', pro: 'info', newbie: 'subdued' } as const
const STYLE_TEXT: Record<UgcCreator['style'], { label: string; hint: string }> = {
  native: { label: 'Native', hint: 'Phone-shot, feels like an organic post' },
  polished: { label: 'Polished', hint: 'Clean lighting and edit, looks produced' },
}

export function Creators({ highlightId, navigate, compact }: { highlightId: string | null; navigate: (p: string) => void; compact: boolean }) {
  const creators = useGS(s => s.creatives.creators)
  const creatives = useGS(s => s.creatives.creatives)
  const staff = useGS(s => s.staff.members)
  const hour = useGS(s => s.time.hour)
  const lastRefresh = useGS(s => s.creatives.lastCreatorRefreshDay)
  const products = useGS(s => s.store.products)
  const draftProductId = useBriefDraft(d => d.storeProductId)
  const draftCreator = useBriefDraft(d => d.creatorId)
  const draftProducer = useBriefDraft(d => d.producer)

  const sp = products.find(p => p.id === draftProductId) ?? null
  const niche: Niche | null = sp ? findProduct(sp.catalogId)?.niche ?? null : null
  const [tier, setTier] = useState<TierFilter>('all')
  const [style, setStyle] = useState<'all' | UgcCreator['style']>('all')
  const [nicheFilter, setNicheFilter] = useState<'all' | Niche>('all')
  const [sort, setSort] = useState<SortKey>('recommended')

  const today = dayOf(hour)
  const expires = creators[0]?.expiresDay ?? lastRefresh + 7
  const daysLeft = Math.max(0, expires - today)
  const ugcStaff = staff.filter(m => m.role === 'ugc_creator')

  const history = useMemo(() => {
    const map = new Map<string, { total: number; delivered: number }>()
    for (const c of creatives) {
      if (c.producer !== 'ugc' || !c.creatorId) continue
      const r = map.get(c.creatorId) ?? { total: 0, delivered: 0 }
      r.total++
      if (c.status === 'ready') r.delivered++
      map.set(c.creatorId, r)
    }
    return map
  }, [creatives])

  const allNiches = useMemo(() => [...new Set(creators.flatMap(c => c.niches))].sort(), [creators])
  const list = useMemo(() => {
    let l = creators.filter(c => (tier === 'all' || c.tier === tier) && (style === 'all' || c.style === style) && (nicheFilter === 'all' || c.niches.includes(nicheFilter)))
    l = [...l]
    switch (sort) {
      case 'price': l.sort((a, b) => a.pricePerVideo - b.pricePerVideo); break
      case 'rating': l.sort((a, b) => b.rating - a.rating || b.jobs - a.jobs); break
      case 'fastest': l.sort((a, b) => a.deliveryDays[0] - b.deliveryDays[0] || a.deliveryDays[1] - b.deliveryDays[1]); break
      case 'jobs': l.sort((a, b) => b.jobs - a.jobs); break
      default: break // marketplace order (featured tiers first)
    }
    return l
  }, [creators, tier, style, nicheFilter, sort])

  const refs = useRef<Record<string, HTMLElement | null>>({})
  useEffect(() => {
    if (highlightId) refs.current[highlightId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightId, list.length])

  const brief = (id: string) => {
    useBriefDraft.getState().patch({ producer: 'ugc', creatorId: id, lastOrderedId: null })
    navigate('new')
  }

  return (
    <div className="ch-creators">
      <div className="ch-pagehead">
        <div>
          <h1 className="ch-h1">Creators</h1>
          <p className="ch-sub">
            {creators.length} creators available this week. Turnaround starts when your product reaches them. New listings every Monday
            {creators.length > 0 && <> · <CalendarDays size={12} className="ch-inline-icon" /> open until {formatDate(expires, 'md')} ({daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`})</>}
          </p>
        </div>
      </div>

      {sp && (
        <div className="ch-context">
          <Sparkles size={15} />
          <span>Briefing for <b>{sp.title.length > 52 ? `${sp.title.slice(0, 50).trimEnd()}…` : sp.title}</b>{niche ? <> ({NICHE_LABEL[niche]})</> : null}. Pick a creator and you'll jump back to your brief.</span>
          {niche && (
            <button type="button" className={cx('ch-btn ch-btn-sm', nicheFilter === niche ? 'ch-btn-primary' : 'ch-btn-secondary')} onClick={() => setNicheFilter(nicheFilter === niche ? 'all' : niche)}>
              {nicheFilter === niche ? 'Showing' : 'Show'} {NICHE_LABEL[niche].toLowerCase()} creators
            </button>
          )}
        </div>
      )}

      {ugcStaff.length > 0 && (
        <div className="ch-team">
          <span className="ch-kicker"><UserCheck size={12} /> Your team</span>
          <div className="ch-team-list">
            {ugcStaff.map(m => (
              <button key={m.id} type="button" className="ch-team-item" onClick={() => { useBriefDraft.getState().patch({ producer: 'staff', creatorId: m.id, lastOrderedId: null }); navigate('new') }}>
                <Portrait id={m.portrait} name={m.name} size={32} />
                <span><b>{m.name}</b><small>In-house creator · skill {m.skill}/10</small></span>
                <span className="ch-link-btn">Brief</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {creators.length === 0 ? (
        <EmptyBlock art="customers" title="No creators listed this week" body="The marketplace refreshes every Monday with a new batch of creators." compact={compact} />
      ) : (
        <>
          <div className={cx('ch-toolbar', compact && 'is-compact')}>
            <Segmented
              size="sm"
              ariaLabel="Tier"
              value={tier}
              onChange={setTier}
              options={[
                { value: 'all', label: 'All', count: creators.length },
                { value: 'star', label: CREATOR_TIERS.star.label, count: creators.filter(c => c.tier === 'star').length },
                { value: 'pro', label: compact ? 'Pro' : CREATOR_TIERS.pro.label, count: creators.filter(c => c.tier === 'pro').length },
                { value: 'newbie', label: compact ? 'Rising' : CREATOR_TIERS.newbie.label, count: creators.filter(c => c.tier === 'newbie').length },
              ]}
            />
            <div className="ch-toolbar-right">
              <label className="ch-select">
                <select value={nicheFilter} onChange={e => setNicheFilter(e.target.value as 'all' | Niche)} aria-label="Niche">
                  <option value="all">Any niche</option>
                  {allNiches.map(n => <option key={n} value={n}>{NICHE_LABEL[n]}</option>)}
                </select>
              </label>
              <label className="ch-select">
                <select value={style} onChange={e => setStyle(e.target.value as 'all' | UgcCreator['style'])} aria-label="Style">
                  <option value="all">Any style</option>
                  <option value="native">Native</option>
                  <option value="polished">Polished</option>
                </select>
              </label>
              <label className="ch-select">
                <SlidersHorizontal size={13} aria-hidden />
                <select value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort">
                  <option value="recommended">Featured</option>
                  <option value="price">Price: low to high</option>
                  <option value="rating">Rating</option>
                  <option value="fastest">Fastest turnaround</option>
                  <option value="jobs">Most jobs</option>
                </select>
              </label>
            </div>
          </div>

          {list.length === 0 ? (
            <EmptyBlock art="search" compact title="No creators match these filters" actions={
              <button type="button" className="ch-btn ch-btn-secondary" onClick={() => { setTier('all'); setStyle('all'); setNicheFilter('all') }}>Clear filters</button>
            } />
          ) : (
            <div className={cx('ch-cgrid', compact && 'is-compact')}>
              {list.map(c => {
                const h = history.get(c.id)
                const selected = draftProducer === 'ugc' && draftCreator === c.id
                return (
                  <article
                    key={c.id}
                    ref={el => { refs.current[c.id] = el }}
                    className={cx('ch-ccard', highlightId === c.id && 'is-highlight', selected && 'is-selected')}
                  >
                    <div className="ch-ccard-head">
                      <Portrait id={c.portrait} name={c.name} size={60} ring={c.tier === 'star'} />
                      <div className="ch-minw0">
                        <h4 className="ch-ccard-name">
                          <span className="ch-ellipsis">{c.name}</span>
                          {c.tier === 'star' && <BadgeCheck size={15} className="ch-verified" aria-label="Top rated" />}
                        </h4>
                        <span className="ch-ccard-handle ch-ellipsis">{c.handle ?? ''}</span>
                        {c.location && <span className="ch-ccard-loc"><MapPin size={11} />{c.location}</span>}
                      </div>
                    </div>
                    <div className="ch-ccard-rating">
                      <Stars rating={c.rating} size={13} color="#ff7a00" />
                      <b>{c.rating.toFixed(1)}</b>
                      <span className="ch-muted">· {c.jobs.toLocaleString('en-US')} job{c.jobs === 1 ? '' : 's'}</span>
                      <Badge tone={TIER_TONE[c.tier]} className="ch-ccard-tier">{CREATOR_TIERS[c.tier].label}</Badge>
                    </div>
                    {c.bio && <p className="ch-ccard-bio">{c.bio}</p>}
                    <div className="ch-ccard-niches">
                      {c.niches.map(n => <span key={n} className={cx('ch-chip', n === niche && 'ch-chip-match')}>{NICHE_LABEL[n]}</span>)}
                    </div>
                    <dl className="ch-ccard-facts">
                      <div><dt>Price</dt><dd>{money(c.pricePerVideo, { cents: false })}<small>/video</small></dd></div>
                      <div title="Days to film and edit once the product reaches them"><dt>Films in</dt><dd><Clock size={12} />{c.deliveryDays[0]}–{c.deliveryDays[1]} days</dd></div>
                      <div title={STYLE_TEXT[c.style].hint}><dt>Style</dt><dd>{STYLE_TEXT[c.style].label}</dd></div>
                    </dl>
                    <p className="ch-ccard-note">{STYLE_TEXT[c.style].hint}.</p>
                    <div className="ch-ccard-foot">
                      <span className="ch-muted">{h ? `Worked with you: ${h.total} video${h.total === 1 ? '' : 's'}${h.delivered < h.total ? ` (${h.delivered} delivered)` : ''}` : 'New to you'}</span>
                      <button type="button" className={cx('ch-btn ch-btn-sm', selected ? 'ch-btn-secondary' : 'ch-btn-primary')} onClick={() => brief(c.id)}>
                        {selected ? 'Selected · back to brief' : `Brief ${firstName(c.name)}`}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
