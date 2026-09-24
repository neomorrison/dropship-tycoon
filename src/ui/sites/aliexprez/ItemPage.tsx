// AliExprez — product page: gallery, price, variants, delivery estimate, store card,
// DSerz import, sample checkout, wishlist; tabs Description / Reviews / Research.
import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck, CalendarClock, ChevronRight, CircleCheck, CreditCard, Factory, Info, PackageCheck, ShieldCheck, Store, Truck, Users,
} from 'lucide-react'
import type { ProductDef } from '../../../core/types'
import { act, getGS, useGS } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { formatDate } from '../../../core/time'
import { findProduct, orderSample, sampleCost } from '../../../sim/market'
import { importProduct } from '../../../sim/store'
import { compact as compactNum } from '../../../core/format'
import { cx } from '../../kit/common'
import type { AxPageProps } from './index'
import { useFavoriteSet, useImported, useListing, useListings, useSampleStatus, useToday } from './hooks'
import { NICHE_BY_ID, deliveryRange, hrand, searchRows, usd } from './lib'
import {
  ChoiceBadge, Dialog, GALLERY, HeartButton, Price, ProductCard, ProductShot, SectionHead, StarRow, TrendChip,
} from './components'
import ItemReviews from './ItemReviews'
import ItemResearch from './ItemResearch'

type Tab = 'description' | 'reviews' | 'research'
const asTab = (x?: string): Tab => (x === 'reviews' || x === 'research' ? x : 'description')

export default function ItemPage({ id, tab: tabParam, navigate, compact }: AxPageProps & { id: string; tab?: string }) {
  const row = useListing(id)
  const today = useToday()
  const [tab, setTab] = useState<Tab>(asTab(tabParam))
  useEffect(() => setTab(asTab(tabParam)), [tabParam])
  const [shot, setShot] = useState(GALLERY[1])
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [dialog, setDialog] = useState<null | 'sample' | 'nostore'>(null)
  const favs = useFavoriteSet()
  const imported = useImported()
  const sampleStatus = useSampleStatus()
  const storeCreated = useGS(s => s.store.created)
  const delay = useGS(s => s.events.modifiers.dropshipDelayDays || 0)
  const depth = useGS(s => s.catalog.research[id] ?? 0)

  if (!row) {
    const p = findProduct(id)
    return (
      <div className="ax-wrap">
        <div className="ax-empty">
          <PackageCheck size={44} strokeWidth={1.25} />
          <h3>{p ? 'This item is not available yet' : 'Sorry, this item can’t be found'}</h3>
          <p>{p ? 'The supplier has not published this listing. Check New arrivals for fresh products.' : 'It may have been removed by the seller.'}</p>
          <button type="button" className="ax-btn ax-btn-red" onClick={() => navigate(p ? 'new' : '')}>{p ? 'See new arrivals' : 'Back to home'}</button>
        </div>
      </div>
    )
  }
  const { p, l } = row
  const niche = NICHE_BY_ID[p.niche]
  const spId = imported.get(id)
  const sample = sampleStatus.get(id)
  const disc = Math.round((l.discountPct ?? 1 - l.price / l.originalPrice) * 100)
  const duty = l.price * (l.dutyPct ?? 0)
  const delivery = deliveryRange(today, l.shipDays, delay)
  const wishCount = Math.round(l.reviews * (1.1 + hrand(p.id, 'wish') * 0.6))

  const importIt = () => {
    if (!storeCreated) { setDialog('nostore'); return }
    let newId = ''
    act(s => { newId = importProduct(s, id) })
    if (newId) openSite('shopifly', `products/${newId}`)
  }

  return (
    <div className="ax-wrap ax-item">
      <div className="ax-crumbs">
        <button type="button" onClick={() => navigate('')}>Home</button>
        <ChevronRight size={12} />
        <button type="button" onClick={() => navigate(`category/${p.niche}`)}>{niche.label}</button>
        <ChevronRight size={12} />
        <span>{p.name}</span>
      </div>

      <div className="ax-item-top">
        <div className="ax-gallery">
          <div className="ax-thumbs">
            {GALLERY.map(v => (
              <button key={v} type="button" className={cx('ax-thumb', shot === v && 'ax-thumb-on')} onMouseEnter={() => setShot(v)} onClick={() => setShot(v)} aria-label={`Image ${v + 1}`}>
                <ProductShot p={p} variant={v} playing={false} />
              </button>
            ))}
          </div>
          <div className="ax-mainshot">
            <ProductShot p={p} variant={shot} eager />
          </div>
        </div>

        <div className="ax-info">
          <div className="ax-pricebox">
            <Price amount={l.price} size="xl" />
            <div className="ax-pricebox-row">
              <s className="ax-strike">{usd(l.originalPrice)}</s>
              <span className="ax-off-pill">-{disc}%</span>
            </div>
            <div className="ax-tax"><Info size={12} /> Tax excluded. US import duty ≈ {usd(duty)} ({Math.round((l.dutyPct ?? 0) * 100)}%) is added at checkout.</div>
          </div>
          <div className="ax-badges">
            {l.choice && <ChoiceBadge />}
            {l.badges.filter(b => b !== 'Choice').map(b => <span key={b} className={cx('ax-badge', b === 'Bestseller' || b === 'Hot' ? 'ax-badge-hot' : '')}>{b}</span>)}
          </div>
          <h1 className="ax-title">{p.supplierTitle}</h1>
          <div className="ax-ratingrow">
            <StarRow value={l.rating} />
            <b>{l.rating.toFixed(1)}</b>
            <span className="ax-vsep" />
            <button type="button" className="ax-link-plain" onClick={() => setTab('reviews')}>{l.reviews.toLocaleString('en-US')} Reviews</button>
            <span className="ax-vsep" />
            <span>{l.soldLabel}</span>
            <TrendChip trend={l.trend} />
          </div>

          {p.variants.map(v => {
            const sel = picked[v.name] ?? v.values[0]
            return (
              <div key={v.name} className="ax-variant">
                <div className="ax-variant-label">{v.name}: <b>{sel}</b></div>
                <div className="ax-variant-opts">
                  {v.values.map(val => (
                    <button key={val} type="button" className={cx('ax-vopt', sel === val && 'ax-vopt-on')} onClick={() => setPicked(m => ({ ...m, [v.name]: val }))}>{val}</button>
                  ))}
                </div>
              </div>
            )
          })}

          <div className="ax-mini-specs">
            {Object.entries(p.specs).slice(0, 4).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
          </div>
        </div>

        <aside className="ax-buybox">
          <div className="ax-buybox-sec">
            <div className="ax-buybox-h">Ship to <b>United States</b></div>
            <div className="ax-shipline"><Truck size={16} /><div><b>Shipping: {usd(l.shipCost)}</b><div className="ax-muted ax-small">{l.choice ? 'AliExprez Choice consolidated line' : 'AliExprez Standard Shipping'}</div></div></div>
            <div className="ax-shipline"><CalendarClock size={16} /><div><b>Delivery: {delivery.label}</b><div className="ax-muted ax-small">{l.shipDays[0]}–{l.shipDays[1]} days incl. US customs clearance</div></div></div>
            {delay > 0 && <div className="ax-warnline">Spring Festival logistics backlog: +{Math.round(delay)} days on new orders.</div>}
          </div>
          <div className="ax-buybox-sec">
            <div className="ax-landed">
              <span>Cost per order delivered</span>
              <b>{usd(l.price + duty + l.shipCost)}</b>
            </div>
            <div className="ax-muted ax-small">Item {usd(l.price)} + shipping {usd(l.shipCost)} + duty {usd(duty)}</div>
          </div>
          <div className="ax-buybox-sec ax-buybox-actions">
            {spId ? (
              <button type="button" className="ax-btn ax-btn-red ax-btn-block" onClick={() => openSite('shopifly', `products/${spId}`)}>
                <CircleCheck size={16} /> Imported — edit in Shopifly
              </button>
            ) : (
              <button type="button" className="ax-btn ax-btn-red ax-btn-block" onClick={importIt}>Add to Shopifly (DSerz)</button>
            )}
            <button type="button" className="ax-btn ax-btn-soft ax-btn-block" onClick={() => setDialog('sample')}>Buy sample</button>
            <div className="ax-buybox-row">
              <HeartButton id={p.id} active={favs.has(p.id)} count={wishCount + (favs.has(p.id) ? 1 : 0)} className="ax-heart-wide" />
            </div>
            {spId && <button type="button" className="ax-textbtn" onClick={importIt}>Import another copy</button>}
            {sample && (
              <button type="button" className="ax-status-line" onClick={() => navigate('orders')}>
                <PackageCheck size={14} /> {sample === 'owned' ? 'You have a sample of this item' : 'Sample on the way — track order'}
              </button>
            )}
            {depth > 0 && (
              <button type="button" className="ax-status-line" onClick={() => setTab('research')}>
                <BadgeCheck size={14} /> Research {depth}/3 done — view notes
              </button>
            )}
          </div>
          <div className="ax-buybox-sec ax-protect">
            <div><ShieldCheck size={15} /> <b>Buyer protection</b></div>
            <p>Refund if the item doesn’t arrive or isn’t as described.</p>
            <div><CreditCard size={15} /> <b>Secure payments</b></div>
            <p>Your card details are never shared with sellers.</p>
          </div>
          <StoreCard name={l.supplierName} years={l.supplierYears} positive={l.storePositivePct} followers={l.storeFollowers} trusted={l.badges.includes('Trusted store')} />
        </aside>
      </div>

      <div className="ax-tabs" role="tablist">
        {([['description', 'Description'], ['reviews', `Reviews (${compactNum(l.reviews)})`], ['research', 'Research']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={cx('ax-tab', tab === k && 'ax-tab-on')} onClick={() => setTab(k)}>
            {label}{k === 'research' && depth > 0 && <span className="ax-tab-dot">{depth}/3</span>}
          </button>
        ))}
      </div>
      <div className="ax-tabpanel">
        {tab === 'description' && <Description p={p} />}
        {tab === 'reviews' && <ItemReviews row={row} compact={compact} />}
        {tab === 'research' && <ItemResearch row={row} />}
      </div>

      <Related id={id} niche={p.niche} navigate={navigate} />

      {dialog === 'sample' && <SampleCheckout id={id} variant={p.variants.map(v => `${v.name}: ${picked[v.name] ?? v.values[0]}`).join(', ')} onClose={() => setDialog(null)} onTrack={() => { setDialog(null); navigate('orders') }} />}
      {dialog === 'nostore' && (
        <Dialog
          title="Connect a Shopifly store first" onClose={() => setDialog(null)}
          footer={<>
            <button type="button" className="ax-btn ax-btn-outline" onClick={() => setDialog(null)}>Not now</button>
            <button type="button" className="ax-btn ax-btn-red" onClick={() => { setDialog(null); openSite('shopifly', '') }}>Create my store</button>
          </>}
        >
          <p className="ax-dialog-p">DSerz imports this listing into your Shopifly store as a draft product (title, description, photos and variants), and later places supplier orders automatically.</p>
          <p className="ax-dialog-p ax-muted">You don’t have a store yet. Start the Shopifly trial ($1/month for 3 months), then come back and import.</p>
        </Dialog>
      )}
    </div>
  )
}

function StoreCard({ name, years, positive, followers, trusted }: { name: string; years: number; positive?: number; followers?: number; trusted: boolean }) {
  return (
    <div className="ax-storecard">
      <div className="ax-storecard-top">
        <span className="ax-store-logo"><Store size={18} /></span>
        <div>
          <div className="ax-store-name">{name}</div>
          <div className="ax-muted ax-small">{years} {years === 1 ? 'yr' : 'yrs'} on AliExprez{trusted ? ' · Trusted store' : ''}</div>
        </div>
      </div>
      <div className="ax-storecard-stats">
        <div><b>{(positive ?? 97).toFixed(1)}%</b><span>Positive feedback</span></div>
        <div><b>{compactNum(followers ?? 0)}</b><span><Users size={11} /> Followers</span></div>
        <div><b>{years >= 6 ? 'Gold' : years >= 3 ? 'Silver' : 'New'}</b><span><Factory size={11} /> Seller level</span></div>
      </div>
    </div>
  )
}

function Description({ p }: { p: ProductDef }) {
  const specs: [string, string][] = [['Brand Name', 'NoEnName_Null'], ...Object.entries(p.specs), ['Certification', 'CE'], ['Model Number', `${p.id.slice(0, 3).toUpperCase()}-${(p.id.length * 137) % 900 + 100}`]]
  const origin = specs.some(([k]) => /origin/i.test(k))
  if (!origin) specs.push(['Origin', 'Mainland China'])
  return (
    <div className="ax-desc">
      <h3>Specifications</h3>
      <dl className="ax-spec">
        {specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <h3>Overview</h3>
      <pre className="ax-desc-text">{p.supplierDescription}</pre>
      <div className="ax-desc-shots">
        {[4, 0, 5, 2].map(v => <ProductShot key={v} p={p} variant={v} />)}
      </div>
    </div>
  )
}

function Related({ id, niche, navigate }: { id: string; niche: string; navigate: (p: string) => void }) {
  const rows = useListings()
  const day = useToday()
  const favs = useFavoriteSet()
  const imported = useImported()
  const samples = useSampleStatus()
  const list = useMemo(() => searchRows(rows.filter(r => r.p.niche === niche && r.p.id !== id), { day, sort: 'best' }).slice(0, 6), [rows, niche, id, day])
  if (!list.length) return null
  return (
    <section className="ax-block">
      <SectionHead title="More from this category" />
      <div className="ax-row">
        {list.map(r => <ProductCard key={r.p.id} row={r} flags={{ fav: favs.has(r.p.id), imported: imported.has(r.p.id), sample: samples.get(r.p.id) }} onOpen={x => navigate(`item/${x}`)} />)}
      </div>
    </section>
  )
}

function SampleCheckout({ id, variant, onClose, onTrack }: { id: string; variant: string; onClose: () => void; onTrack: () => void }) {
  const row = useListing(id)
  const today = useToday()
  const cash = useGS(s => s.finance.cash)
  const card = useGS(s => s.finance.card)
  const delay = useGS(s => s.events.modifiers.dropshipDelayDays || 0)
  const [done, setDone] = useState<null | { ok: boolean; arriveDay?: number }>(null)
  const total = useMemo(() => sampleCost(getGS(), id), [id, row])
  if (!row) return null
  const { p, l } = row
  const duty = Math.max(0, total - l.price - l.shipCost)
  const cardLeft = card.frozen ? 0 : Math.max(0, card.limit - card.balance)
  const method = cardLeft >= total ? 'card' : cash >= total ? 'bank' : null
  const eta = deliveryRange(today, l.shipDays, delay)
  const place = () => {
    let ok = false
    let arriveDay: number | undefined
    act(s => {
      ok = orderSample(s, id)
      if (ok) arriveDay = s.catalog.samples[s.catalog.samples.length - 1]?.arriveDay
    })
    setDone({ ok, arriveDay })
  }
  if (done?.ok) {
    return (
      <Dialog title="Payment successful" onClose={onClose} footer={<>
        <button type="button" className="ax-btn ax-btn-outline" onClick={onClose}>Continue shopping</button>
        <button type="button" className="ax-btn ax-btn-red" onClick={onTrack}>Track order</button>
      </>}>
        <div className="ax-success">
          <CircleCheck size={40} />
          <p>Your sample of <b>{p.name}</b> is ordered. Estimated delivery <b>{done.arriveDay !== undefined ? formatDate(done.arriveDay, 'long') : eta.label}</b>.</p>
          <p className="ax-muted ax-small">Once it arrives you can inspect the quality yourself and film your own ad creatives with it in CreatorHub.</p>
        </div>
      </Dialog>
    )
  }
  return (
    <Dialog
      title="Order summary" onClose={onClose}
      footer={<>
        <button type="button" className="ax-btn ax-btn-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="ax-btn ax-btn-red" disabled={!method} onClick={place}>Place order · {usd(total)}</button>
      </>}
    >
      <div className="ax-co-item">
        <div className="ax-co-img"><ProductShot p={p} variant={0} /></div>
        <div>
          <div className="ax-co-title">{p.supplierTitle}</div>
          <div className="ax-muted ax-small">{variant} · Qty 1 (sample)</div>
          <div className="ax-small">Sold by {l.supplierName}</div>
        </div>
      </div>
      <dl className="ax-co-lines">
        <div><dt>Item subtotal</dt><dd>{usd(l.price)}</dd></div>
        <div><dt>Shipping</dt><dd>{usd(l.shipCost)}</dd></div>
        <div><dt>Import duty ({Math.round((l.dutyPct ?? 0) * 100)}%)</dt><dd>{usd(duty)}</dd></div>
        <div className="ax-co-total"><dt>Total</dt><dd>{usd(total)}</dd></div>
      </dl>
      <div className="ax-co-meta">
        <div><Truck size={14} /> Estimated delivery <b>{eta.label}</b> ({formatDate(eta.to, 'medium')} at the latest)</div>
        <div><CreditCard size={14} /> {method === 'card' ? 'Pay with Chaise Sapphire credit card' : method === 'bank' ? 'Pay from Chaise checking (card limit reached)' : 'Payment declined: not enough cash or available credit'}</div>
      </div>
      {done && !done.ok && <div className="ax-warnline">Payment failed. Check your balances in Chaise Bank.</div>}
    </Dialog>
  )
}

