// Amazin — gear store (Amazon parody). OWNER: ui-life-sites. Class prefix: az-
// Routes: '' home | 'c/<slot>' category | 'item/<gearId>' product | 'owned' your gear | 'search/<q>'
import { useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronRight, Lock, MapPin, Menu, Search, ShoppingCart } from 'lucide-react'
import type { SiteProps } from '../types'
import type { GameState, GearSlot } from '../../../core/types'
import { gearImage } from '../../../core/assets'
import { dayOf, formatDate } from '../../../core/time'
import { GEAR, GEAR_SLOTS, gearDef, type GearDef } from '../../../data/gear'
import { buyGear, computerProductivity, equipGear, filmTimeMult, selfShotQuality, unequipGear } from '../../../sim/life'
import { cardAvailable } from '../../../core/money'
import { ImageWithFallback, Stars } from '../../kit/common'
import { SiteLayer } from '../bank/SiteLayer'
import { firstNameOf, run, safe, segs, todayOf, useFlash, useWorld, usd, type Flash } from '../bank/lifeCommon'
import './amazin.css'

const SLOT_EMOJI: Record<GearSlot, string> = { phone: '📱', lighting: '💡', camera: '📷', computer: '💻', audio: '🎙️' }
const SLOT_DEPT: Record<GearSlot, string> = { phone: 'Cell Phones', lighting: 'Studio Lighting', camera: 'Cameras', computer: 'Computers', audio: 'Microphones' }
const forSale = GEAR.filter(g => !g.starter && g.price > 0)

/** In-game effect lines for a gear item (shown in a clearly separated box). */
function effectLines(g: GearDef): string[] {
  const out: string[] = []
  if (g.filmQuality > 0) out.push(`+${g.filmQuality.toFixed(2)} self-shot video quality${g.slot === 'phone' || g.slot === 'camera' ? ' (phone and camera don’t stack — the better one is used)' : ''}`)
  if (g.talkingBonus) out.push(`+${g.talkingBonus.toFixed(2)} quality on talking formats (testimonial, green screen, founder story)`)
  if (g.filmTimeMult && g.filmTimeMult < 1) out.push(`Filming takes ${Math.round((1 - g.filmTimeMult) * 100)}% less time`)
  if (g.productivity !== undefined) {
    const p = g.productivity
    out.push(p > 1 ? `Business tasks take ${Math.round((p - 1) * 100)}% longer` : p < 1 ? `Business tasks ${Math.round((1 - p) * 100)}% faster` : 'Business tasks at normal speed')
  }
  if (g.editBonus) out.push(`+${g.editBonus.toFixed(2)} edit quality on creatives you cut yourself`)
  return out
}

function Price({ n, big }: { n: number; big?: boolean }) {
  const [whole, cents] = n.toFixed(2).split('.')
  return (
    <span className={`az-price${big ? ' is-big' : ''}`}>
      <sup>$</sup>{Number(whole).toLocaleString('en-US')}<sup>{cents}</sup>
    </span>
  )
}
function Primo() {
  return <span className="az-primo"><Check size={13} strokeWidth={3.5} /><i>primo</i></span>
}
function GearPhoto({ g, size }: { g: GearDef; size?: 'sm' | 'lg' }) {
  return (
    <ImageWithFallback
      src={gearImage(g.id)}
      alt={g.name}
      fallbackLabel={g.brand}
      fallbackEmoji={SLOT_EMOJI[g.slot]}
      fit="contain"
      aspectRatio={1}
      className={`az-photo${size === 'lg' ? ' is-lg' : ''}`}
    />
  )
}

export default function Amazin({ path, navigate, compact }: SiteProps) {
  const s = useWorld()
  const [root, arg] = segs(path)
  const [q, setQ] = useState(root === 'search' && arg ? decodeURIComponent(arg) : '')
  const [flash, setFlash] = useFlash(7000)
  const owned = s.gear.owned

  let body: ReactNode
  if (root === 'item' && arg && gearDef(arg)) body = <ProductPage s={s} g={gearDef(arg) as GearDef} navigate={navigate} setFlash={setFlash} />
  else if (root === 'owned') body = <OwnedPage s={s} navigate={navigate} setFlash={setFlash} />
  else if (root === 'c' && GEAR_SLOTS.some(x => x.slot === arg)) body = <Results s={s} navigate={navigate} title={SLOT_DEPT[arg as GearSlot]} items={forSale.filter(g => g.slot === arg)} />
  else if (root === 'search' && arg) {
    const needle = decodeURIComponent(arg).toLowerCase()
    body = <Results s={s} navigate={navigate} title={`Results for “${decodeURIComponent(arg)}”`} items={forSale.filter(g => `${g.name} ${g.brand} ${g.description} ${g.slot}`.toLowerCase().includes(needle))} />
  } else body = <HomePage s={s} navigate={navigate} />

  const submit = () => {
    const v = q.trim()
    navigate(v ? `search/${encodeURIComponent(v)}` : '')
  }
  const dept = root === 'c' ? arg : root === 'owned' ? 'owned' : root === 'item' ? gearDef(arg ?? '')?.slot : ''

  return (
    <div className={`az-root${compact ? ' is-compact' : ''}`}>
      <header className="az-top">
        <button className="az-logo" onClick={() => navigate('')} aria-label="Amazin home">
          <span>amazin</span>
          <svg viewBox="0 0 80 12" className="az-logo-wave" aria-hidden><path d="M2 5c10 6 22 6 34 2s24-6 38 2" stroke="#ff9900" strokeWidth="3.2" fill="none" strokeLinecap="round" /></svg>
        </button>
        <div className="az-deliver">
          <MapPin size={16} />
          <div><small>Deliver to {firstNameOf(s)}</small><b>Harbor City 90710</b></div>
        </div>
        <form className="az-search" onSubmit={e => { e.preventDefault(); submit() }}>
          <span className="az-search-dept">All</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search Amazin" aria-label="Search Amazin" />
          <button type="submit" aria-label="Go"><Search size={20} /></button>
        </form>
        <div className="az-account">
          <small>Hello, {firstNameOf(s)}</small>
          <b>Account & Lists</b>
        </div>
        <button className="az-cart" onClick={() => navigate('owned')}>
          <span className="az-cart-icon"><ShoppingCart size={30} /><em>{owned.length}</em></span>
          <b>Your gear</b>
        </button>
      </header>
      <nav className="az-subnav">
        <button onClick={() => navigate('')} className={!dept ? 'is-on' : ''}><Menu size={16} /> All</button>
        {GEAR_SLOTS.map(x => (
          <button key={x.slot} className={dept === x.slot ? 'is-on' : ''} onClick={() => navigate(`c/${x.slot}`)}>{SLOT_DEPT[x.slot]}</button>
        ))}
        <button className={dept === 'owned' ? 'is-on' : ''} onClick={() => navigate('owned')}>Your Gear</button>
        <span className="az-subnav-promo">Creator Week deals</span>
      </nav>
      {flash && <div className={`az-flash is-${flash.tone}`}>{flash.text}</div>}
      <main className="az-main">{body}</main>
      <footer className="az-footer">
        <button onClick={e => (e.currentTarget.closest('.sh-tabview') as HTMLElement | null)?.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top</button>
        <div>Conditions of Use · Privacy Notice · © 1996–2026, Amazin.com, Inc. or its affiliates</div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// home & results
// ---------------------------------------------------------------------------
function HomePage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const q = safe(() => selfShotQuality(s), null)
  return (
    <div className="az-home">
      <section className="az-hero">
        <div>
          <h1>Level up your content studio</h1>
          <p>Better light, a better camera and a faster computer. Every creative you film yourself looks sharper, and research and support go faster.</p>
          {q && <p className="az-hero-note">Your self-shot quality today: <b>{q.total.toFixed(2)}</b> (gear +{q.gear.toFixed(2)})</p>}
        </div>
      </section>
      <div className="az-tiles">
        {GEAR_SLOTS.map(x => {
          const items = forSale.filter(g => g.slot === x.slot)
          if (!items.length) return null
          return (
            <section key={x.slot} className="az-tile">
              <h2>{SLOT_DEPT[x.slot]}</h2>
              <div className={`az-tile-grid n${Math.min(items.length, 4)}`}>
                {items.slice(0, 4).map(g => (
                  <button key={g.id} onClick={() => navigate(`item/${g.id}`)}>
                    <GearPhoto g={g} />
                    <span>{g.name.split(' ').slice(0, 4).join(' ')}</span>
                  </button>
                ))}
              </div>
              <button className="az-link" onClick={() => navigate(`c/${x.slot}`)}>Shop {SLOT_DEPT[x.slot].toLowerCase()}</button>
            </section>
          )
        })}
      </div>
      <Results s={s} navigate={navigate} title="Recommended for creators" items={[...forSale].sort((a, b) => b.reviews - a.reviews)} />
    </div>
  )
}

function Results({ s, navigate, title, items }: { s: GameState; navigate: (p: string) => void; title: string; items: GearDef[] }) {
  const [sort, setSort] = useState<'featured' | 'low' | 'high' | 'reviews'>('featured')
  const sorted = useMemo(() => {
    const arr = [...items]
    if (sort === 'low') arr.sort((a, b) => a.price - b.price)
    else if (sort === 'high') arr.sort((a, b) => b.price - a.price)
    else if (sort === 'reviews') arr.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
    return arr
  }, [items, sort])
  const tomorrow = todayOf(s) + 1
  return (
    <section className="az-results">
      <div className="az-results-head">
        <h2>{title}</h2>
        <span>{sorted.length} result{sorted.length === 1 ? '' : 's'}</span>
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort by">
          <option value="featured">Sort by: Featured</option>
          <option value="low">Price: Low to High</option>
          <option value="high">Price: High to Low</option>
          <option value="reviews">Avg. Customer Review</option>
        </select>
      </div>
      {sorted.length === 0 ? (
        <p className="az-empty">No results. Try “light”, “laptop” or “mic”.</p>
      ) : (
        <div className="az-grid">
          {sorted.map(g => {
            const owned = s.gear.owned.includes(g.id)
            const equipped = s.gear.equipped[g.slot] === g.id
            const best = bestSeller(g)
            return (
              <article key={g.id} className="az-card" onClick={() => navigate(`item/${g.id}`)}>
                {best && <span className="az-best">Best Seller</span>}
                <div className="az-card-img"><GearPhoto g={g} /></div>
                <div className="az-card-body">
                  <h3>{g.name}</h3>
                  <div className="az-rating"><Stars rating={g.rating} color="#ffa41c" size={15} /><span>{g.reviews.toLocaleString('en-US')}</span></div>
                  <div className="az-bought">{boughtLine(g)}</div>
                  <Price n={g.price} />
                  {g.prime ? <div className="az-ship"><Primo /> FREE delivery <b>{formatDate(tomorrow, 'md')}</b></div> : <div className="az-ship">FREE delivery <b>{formatDate(tomorrow + 3, 'md')}</b></div>}
                  {owned && <span className={`az-owned${equipped ? ' is-eq' : ''}`}>{equipped ? 'In use' : 'Owned'}</span>}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function bestSeller(g: GearDef) {
  const inSlot = forSale.filter(x => x.slot === g.slot)
  return inSlot.length > 1 && inSlot.every(x => x.reviews <= g.reviews)
}
function boughtLine(g: GearDef) {
  const n = g.reviews > 30000 ? '10K+' : g.reviews > 10000 ? '5K+' : g.reviews > 5000 ? '2K+' : '1K+'
  return `${n} bought in past month`
}

// ---------------------------------------------------------------------------
// product
// ---------------------------------------------------------------------------
function ProductPage({ s, g, navigate, setFlash }: { s: GameState; g: GearDef; navigate: (p: string) => void; setFlash: (f: Flash | null) => void }) {
  const owned = s.gear.owned.includes(g.id)
  const equipped = s.gear.equipped[g.slot] === g.id
  const cur = s.gear.equipped[g.slot] ? gearDef(s.gear.equipped[g.slot] as string) : undefined
  const [pay, setPay] = useState<'bank' | 'card'>(s.finance.cash >= g.price ? 'bank' : 'card')
  const [confirm, setConfirm] = useState(false)
  const cardLeft = safe(() => cardAvailable(s), 0)
  const canBank = s.finance.cash >= g.price
  const canCard = cardLeft >= g.price
  const tomorrow = todayOf(s) + 1
  const purchase = useMemo(() => {
    const memo = `Amazin.com — ${g.name}`
    for (let i = s.finance.ledger.length - 1; i >= 0; i--) if (s.finance.ledger[i].memo === memo) return s.finance.ledger[i]
    return null
  }, [s.finance.ledger, g.name])
  const related = forSale.filter(x => x.id !== g.id && (x.slot === g.slot || (g.slot === 'phone' && x.slot === 'camera') || (g.slot === 'camera' && x.slot === 'phone'))).slice(0, 4)
  const effects = effectLines(g)
  const sellable = !g.starter && g.price > 0

  const buy = () => {
    setConfirm(false)
    const r = run(st => buyGear(st, g.id, { payWith: pay }))
    if (r?.ok) setFlash({ tone: 'success', text: `Order placed, thanks! ${g.name} arrived — check Your gear to see what's in use.` })
    else setFlash({ tone: 'critical', text: r?.reason ?? 'There was a problem with your payment method.' })
  }

  return (
    <div className="az-product">
      <div className="az-crumbs">
        <button onClick={() => navigate('')}>All</button><ChevronRight size={12} />
        <button onClick={() => navigate(`c/${g.slot}`)}>{SLOT_DEPT[g.slot]}</button><ChevronRight size={12} />
        <span>{g.brand}</span>
      </div>
      <div className="az-product-grid">
        <div className="az-gallery"><GearPhoto g={g} size="lg" /></div>
        <div className="az-info">
          <h1>{g.name}</h1>
          <button className="az-link">Visit the {g.brand} Store</button>
          <div className="az-rating is-big">
            <span>{g.rating.toFixed(1)}</span>
            <Stars rating={g.rating} color="#ffa41c" size={17} />
            <button className="az-link">{g.reviews.toLocaleString('en-US')} ratings</button>
          </div>
          {bestSeller(g) && <span className="az-best is-inline">#1 Best Seller in {SLOT_DEPT[g.slot]}</span>}
          <hr />
          {sellable ? <Price n={g.price} big /> : <span className="az-muted">Not sold on Amazin</span>}
          <div className="az-effect">
            <b>How it helps your business</b>
            {effects.length ? <ul>{effects.map(e => <li key={e}>{e}</li>)}</ul> : <p>No gameplay effect.</p>}
            {cur && cur.id !== g.id && <p className="az-muted">Currently using: {cur.name}.</p>}
          </div>
          <h3>About this item</h3>
          <ul className="az-bullets">{g.bullets.map(b => <li key={b}>{b}</li>)}</ul>
          <p className="az-desc">{g.description}</p>
        </div>
        <aside className="az-buybox">
          {owned ? (
            <>
              <div className="az-bought-box">
                <b>{purchase ? `Purchased ${formatDate(dayOf(purchase.hour), 'md')}` : g.starter ? 'You already own this' : 'You own this item'}</b>
                <span>{equipped ? 'Currently in use in your setup.' : 'Sitting in a drawer.'}</span>
              </div>
              {equipped ? (
                g.slot === 'phone' || g.slot === 'computer' ? <p className="az-muted az-small">You always need a {g.slot}. Equip another one to switch.</p> : <button className="az-btn is-yellow" onClick={() => { run(st => unequipGear(st, g.slot)); setFlash({ tone: 'info', text: `${g.name} put away.` }) }}>Put away</button>
              ) : (
                <button className="az-btn is-yellow" onClick={() => { run(st => equipGear(st, g.id)); setFlash({ tone: 'success', text: `Now using ${g.name}.` }) }}>Use this {g.slot}</button>
              )}
              <button className="az-btn" onClick={() => navigate('owned')}>Your gear</button>
            </>
          ) : sellable ? (
            <>
              <Price n={g.price} big />
              <div className="az-ship">{g.prime ? <><Primo /> FREE delivery <b>Tomorrow, {formatDate(tomorrow, 'md')}</b></> : <>FREE delivery <b>{formatDate(tomorrow + 3, 'long')}</b></>}</div>
              <div className="az-deliver-to"><MapPin size={14} /> Deliver to {firstNameOf(s)} — Harbor City 90710</div>
              <div className="az-stock">In Stock</div>
              <fieldset className="az-pay">
                <legend>Payment method</legend>
                <label className={pay === 'bank' ? 'is-on' : ''}>
                  <input type="radio" checked={pay === 'bank'} onChange={() => setPay('bank')} />
                  <span>Chaise checking<small>{usd(s.finance.cash)} available</small></span>
                </label>
                <label className={pay === 'card' ? 'is-on' : ''}>
                  <input type="radio" checked={pay === 'card'} onChange={() => setPay('card')} />
                  <span>Chaise Sapphire card<small>{usd(cardLeft)} available · {(s.finance.card.apr * 100).toFixed(2)}% APR</small></span>
                </label>
              </fieldset>
              {!canBank && !canCard && <p className="az-err">Neither account can cover {usd(g.price)}.</p>}
              <button className="az-btn is-yellow" disabled={!canBank && !canCard} onClick={() => setConfirm(true)}>Buy Now</button>
              <p className="az-secure"><Lock size={12} /> Secure transaction</p>
              <div className="az-sold"><span>Ships from</span><b>Amazin.com</b><span>Sold by</span><b>{g.brand} Official</b><span>Returns</span><b>30-day refund</b></div>
            </>
          ) : (
            <p className="az-muted">This item isn't sold on Amazin.</p>
          )}
        </aside>
      </div>
      {related.length > 0 && (
        <section className="az-related">
          <h2>Customers who viewed this item also viewed</h2>
          <div className="az-related-row">
            {related.map(r => (
              <button key={r.id} className="az-related-card" onClick={() => navigate(`item/${r.id}`)}>
                <GearPhoto g={r} />
                <span>{r.name}</span>
                <Stars rating={r.rating} color="#ffa41c" size={13} count={r.reviews} />
                <Price n={r.price} />
              </button>
            ))}
          </div>
        </section>
      )}
      {confirm && (
        <SiteLayer className="az-layer" onClose={() => setConfirm(false)} pauseKey="az-checkout">
          <div className="az-dialog" role="dialog" aria-modal>
            <h3>Review your order</h3>
            <div className="az-dialog-item">
              <GearPhoto g={g} />
              <div><b>{g.name}</b><span>{g.prime ? 'FREE Primo delivery tomorrow' : 'FREE delivery'}</span></div>
            </div>
            <div className="az-dialog-rows">
              <div><span>Items:</span><span>{usd(g.price)}</span></div>
              <div><span>Shipping & handling:</span><span>$0.00</span></div>
              <div className="is-total"><span>Order total:</span><span>{usd(g.price)}</span></div>
              <div><span>Paying with:</span><span>{pay === 'bank' ? 'Chaise checking' : 'Chaise Sapphire card'}</span></div>
            </div>
            {pay === 'card' && <p className="az-muted az-small">Carried card balances accrue interest. Gear is a personal expense, not a business write-off in this game.</p>}
            <div className="az-dialog-actions">
              <button className="az-btn" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="az-btn is-yellow" onClick={buy} disabled={pay === 'bank' ? !canBank : !canCard}>Place your order</button>
            </div>
          </div>
        </SiteLayer>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// your gear
// ---------------------------------------------------------------------------
function OwnedPage({ s, navigate, setFlash }: { s: GameState; navigate: (p: string) => void; setFlash: (f: Flash | null) => void }) {
  const q = safe(() => selfShotQuality(s), null)
  const talk = safe(() => selfShotQuality(s, 'ugc_testimonial'), null)
  const prod = safe(() => computerProductivity(s), 1.25)
  const ftm = safe(() => filmTimeMult(s), 1)
  return (
    <div className="az-owned-page">
      <h1>Your gear</h1>
      <div className="az-setup">
        <div className="az-setup-card">
          <span>Self-shot video quality</span>
          <b>{q ? q.total.toFixed(2) : '—'}</b>
          {q && <small>base {q.base.toFixed(2)} · gear +{q.gear.toFixed(2)} · skill +{q.skill.toFixed(2)} · home +{q.apartment.toFixed(2)}{q.mood ? ` · mood ${q.mood.toFixed(2)}` : ''}{q.burnout ? ` · burnout ${q.burnout.toFixed(2)}` : ''}</small>}
        </div>
        <div className="az-setup-card">
          <span>Talking-to-camera formats</span>
          <b>{talk ? talk.total.toFixed(2) : '—'}</b>
          <small>testimonials, green screen, founder story</small>
        </div>
        <div className="az-setup-card">
          <span>Business task speed</span>
          <b>{prod > 1 ? `${Math.round((prod - 1) * 100)}% slower` : prod < 1 ? `${Math.round((1 - prod) * 100)}% faster` : 'Normal'}</b>
          <small>research, support, edits, disputes</small>
        </div>
        <div className="az-setup-card">
          <span>Filming time</span>
          <b>{ftm < 1 ? `${Math.round((1 - ftm) * 100)}% faster` : 'Normal'}</b>
          <small>per self-filmed creative</small>
        </div>
      </div>
      <div className="az-slots">
        {GEAR_SLOTS.map(x => {
          const eq = s.gear.equipped[x.slot] ? gearDef(s.gear.equipped[x.slot] as string) : undefined
          const others = s.gear.owned.map(id => gearDef(id)).filter((g): g is GearDef => !!g && g.slot === x.slot && g.id !== eq?.id)
          const upgrade = forSale.filter(g => g.slot === x.slot && !s.gear.owned.includes(g.id))
          return (
            <section key={x.slot} className="az-slot">
              <h2>{x.label}</h2>
              {eq ? (
                <div className="az-slot-item is-eq">
                  <GearPhoto g={eq} />
                  <div>
                    <button className="az-link" onClick={() => navigate(`item/${eq.id}`)}>{eq.name}</button>
                    <span className="az-owned is-eq">In use</span>
                    <ul>{effectLines(eq).map(e => <li key={e}>{e}</li>)}</ul>
                  </div>
                  {x.slot !== 'phone' && x.slot !== 'computer' && (
                    <button className="az-btn is-small" onClick={() => { run(st => unequipGear(st, x.slot)); setFlash({ tone: 'info', text: `${eq.name} put away.` }) }}>Put away</button>
                  )}
                </div>
              ) : (
                <p className="az-muted">Nothing in use.</p>
              )}
              {others.map(g => (
                <div key={g.id} className="az-slot-item">
                  <GearPhoto g={g} />
                  <div>
                    <button className="az-link" onClick={() => navigate(`item/${g.id}`)}>{g.name}</button>
                    <span className="az-owned">Owned</span>
                  </div>
                  <button className="az-btn is-small is-yellow" onClick={() => { run(st => equipGear(st, g.id)); setFlash({ tone: 'success', text: `Now using ${g.name}.` }) }}>Use</button>
                </div>
              ))}
              {upgrade.length > 0 && (
                <div className="az-upgrades">
                  {upgrade.map(g => (
                    <button key={g.id} onClick={() => navigate(`item/${g.id}`)}>
                      <span>Upgrade: {g.name}</span>
                      <b>{usd(g.price, false)}</b>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
