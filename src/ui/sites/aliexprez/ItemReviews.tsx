// AliExprez — Reviews tab. Reviews are generated deterministically from the product id and the
// PUBLIC rating: the share of complaints matches what the star average implies, so reading them
// is as informative as a real listing (no hidden numbers leak). Buyer Q&A surfaces real objections.
import { useMemo, useState } from 'react'
import { Camera, MessageCircleQuestion, ThumbsUp } from 'lucide-react'
import { formatDate } from '../../../core/time'
import { cx } from '../../kit/common'
import { useToday } from './hooks'
import { buyerQuestions, generateReviews, reviewTags, starDistribution, type GenReview, type Row } from './lib'
import { ProductShot, StarRow } from './components'

type Filter = 'all' | 'photos' | 1 | 2 | 3 | 4 | 5

export default function ItemReviews({ row }: { row: Row; compact: boolean }) {
  const { p, l } = row
  const today = useToday()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<'default' | 'recent'>('default')
  const [shown, setShown] = useState(8)
  const [helped, setHelped] = useState<Record<string, boolean>>({})
  const week = Math.floor(today / 7)
  const reviews = useMemo(() => generateReviews(p, l.rating, week * 7 + 6), [p, l.rating, week])
  const dist = useMemo(() => starDistribution(l.rating), [l.rating])
  const tags = useMemo(() => reviewTags(p, l.reviews, l.rating), [p, l.reviews, l.rating])
  const questions = useMemo(() => buyerQuestions(p, week * 7), [p, week])
  const photoCount = Math.round(l.reviews * (reviews.filter(r => r.photos > 0).length / reviews.length))

  const list = useMemo(() => {
    const out = reviews.filter(r => (filter === 'all' ? true : filter === 'photos' ? r.photos > 0 : r.stars === filter))
    if (sort === 'recent') out.sort((a, b) => b.day - a.day)
    else out.sort((a, b) => b.helpful + b.photos * 6 + (b.text.length > 60 ? 4 : 0) - (a.helpful + a.photos * 6 + (a.text.length > 60 ? 4 : 0)))
    return out
  }, [reviews, filter, sort])

  const pick = (f: Filter) => { setFilter(f); setShown(8) }

  return (
    <div className="ax-reviews">
      <div className="ax-rev-summary">
        <div className="ax-rev-score">
          <div className="ax-rev-big">{l.rating.toFixed(1)}</div>
          <StarRow value={l.rating} size={18} />
          <div className="ax-muted ax-small">{l.reviews.toLocaleString('en-US')} ratings · all from verified purchases</div>
        </div>
        <div className="ax-rev-bars">
          {[5, 4, 3, 2, 1].map(st => {
            const share = dist[st - 1]
            return (
              <button key={st} type="button" className="ax-rev-bar" onClick={() => pick(st as Filter)}>
                <span>{st} ★</span>
                <span className="ax-rev-track"><i style={{ width: `${(share * 100).toFixed(1)}%` }} /></span>
                <span className="ax-rev-pct">{(share * 100).toFixed(share < 0.1 ? 1 : 0)}%</span>
              </button>
            )
          })}
        </div>
        <div className="ax-rev-tags">
          <div className="ax-rev-tags-h">Buyers mention</div>
          <div className="ax-rev-tagwrap">
            {tags.map(t => <span key={t.label} className={cx('ax-rev-tag', t.negative && 'ax-rev-tag-neg')}>{t.label} ({t.count.toLocaleString('en-US')})</span>)}
          </div>
        </div>
      </div>

      <div className="ax-rev-toolbar">
        <div className="ax-rev-filters">
          {(['all', 'photos', 5, 4, 3, 2, 1] as Filter[]).map(f => (
            <button key={String(f)} type="button" className={cx('ax-pill', filter === f && 'ax-pill-on')} onClick={() => pick(f)}>
              {f === 'all' ? `All (${l.reviews.toLocaleString('en-US')})`
                : f === 'photos' ? <><Camera size={13} /> With photos ({photoCount.toLocaleString('en-US')})</>
                  : `${f} ★ (${Math.round(dist[f - 1] * l.reviews).toLocaleString('en-US')})`}
            </button>
          ))}
        </div>
        <select className="ax-select" value={sort} onChange={e => setSort(e.target.value as 'default' | 'recent')} aria-label="Sort reviews">
          <option value="default">Sort by default</option>
          <option value="recent">Most recent</option>
        </select>
      </div>

      <div className="ax-rev-list">
        {list.slice(0, shown).map(r => <ReviewItem key={r.id} r={r} p={row.p} helped={!!helped[r.id]} onHelp={() => setHelped(h => ({ ...h, [r.id]: !h[r.id] }))} />)}
        {!list.length && <div className="ax-muted ax-rev-none">No reviews match this filter in the latest batch.</div>}
      </div>
      {shown < list.length && (
        <div className="ax-center"><button type="button" className="ax-btn ax-btn-outline" onClick={() => setShown(n => n + 8)}>View more reviews</button></div>
      )}

      {questions.length > 0 && (
        <div className="ax-qa">
          <h3><MessageCircleQuestion size={18} /> Buyer questions &amp; answers</h3>
          {questions.map((q, i) => (
            <div key={i} className="ax-qa-item">
              <div className="ax-qa-q"><span className="ax-qa-mark">Q</span><div><b>{q.q}</b><div className="ax-muted ax-small">{q.name} · {formatDate(q.day, 'short')}</div></div></div>
              <div className="ax-qa-a"><span className="ax-qa-mark ax-qa-mark-a">A</span><div>{q.a}<div className="ax-muted ax-small">Seller · {q.helpful} found this helpful</div></div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewItem({ r, p, helped, onHelp }: { r: GenReview; p: Row['p']; helped: boolean; onHelp: () => void }) {
  return (
    <article className="ax-rev">
      <div className="ax-rev-head">
        <span className="ax-rev-avatar">{r.name[0]}</span>
        <div>
          <div className="ax-rev-name">{r.name} <span className="ax-cc">{r.country}</span></div>
          <div className="ax-muted ax-small">{formatDate(r.day, 'short')}</div>
        </div>
      </div>
      <StarRow value={r.stars} size={13} />
      <div className="ax-rev-variant">{r.variant}</div>
      <p className="ax-rev-text">{r.text}</p>
      {r.photos > 0 && (
        <div className="ax-rev-photos">
          {Array.from({ length: r.photos }, (_, i) => (
            <div key={i} className={`ax-rphoto ax-rphoto-${Math.abs(r.day * 7 + i) % 4}`}><ProductShot p={p} variant={i === 0 && r.stars <= 2 ? 1 : 0} /></div>
          ))}
        </div>
      )}
      {r.followUp && <div className="ax-rev-follow"><b>Additional feedback:</b> {r.followUp}</div>}
      <button type="button" className={cx('ax-helpful', helped && 'ax-helpful-on')} onClick={onHelp}>
        <ThumbsUp size={13} /> Helpful ({r.helpful + (helped ? 1 : 0)})
      </button>
    </article>
  )
}
