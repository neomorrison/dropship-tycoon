// Zillo — rental listings (Zillow parody). OWNER: ui-life-sites. Class prefix: zl-
// Routes: '' search | 'listing/<tier>' | 'home' (your lease) | 'afford' (affordability calculator)
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Bath, BedDouble, Building2, Camera, Check, Heart, House, KeyRound, Mail, MapPin, Ruler, Sparkles, Users, X, Zap, Smile } from 'lucide-react'
import type { SiteProps } from '../types'
import type { GameState } from '../../../core/types'
import { roomImage } from '../../../core/assets'
import { formatDate } from '../../../core/time'
import { APARTMENTS, HOUSING_RULES, type ApartmentDef } from '../../../data/apartments'
import { apartmentEligibility, income30, moveApartment, type Eligibility } from '../../../sim/life'
import { monthlyBurn } from '../../../sim/finance'
import { ImageWithFallback } from '../../kit/common'
import { SiteLayer } from '../bank/SiteLayer'
import { run, safe, segs, simRead, todayOf, useFlash, useWorld, usd, type Flash } from '../bank/lifeCommon'
import './zillo.css'

type Sort = 'rec' | 'low' | 'high' | 'size'
type PriceCap = 'any' | '1000' | '2000' | '5000'

// stylized map pin positions (percent) for each tier
const PINS: Record<number, { x: number; y: number }> = {
  0: { x: 18, y: 72 }, 1: { x: 66, y: 26 }, 2: { x: 48, y: 46 }, 3: { x: 34, y: 30 }, 4: { x: 22, y: 42 }, 5: { x: 58, y: 64 },
}
const BATHS = ['Shared', '1 shared', '1', '1', '2.5', '3.5']

function fallbackElig(s: GameState, apt: ApartmentDef): Eligibility {
  return {
    ok: false, reason: 'Unavailable right now.', income30: 0, needIncome: apt.rent * HOUSING_RULES.incomeMultiple, cash: s.finance.cash,
    needCash: apt.rent * HOUSING_RULES.cashMultiple, deposit: apt.rent, movers: HOUSING_RULES.moversPerTier * apt.tier, proratedRent: 0,
    depositRefund: 0, moveInCost: 0,
  }
}
const eligOf = (s: GameState, apt: ApartmentDef) => simRead(s, st => apartmentEligibility(st, apt.tier), fallbackElig(s, apt))
const bedsLabel = (apt: ApartmentDef) => (apt.tier === 2 ? 'Studio' : apt.tier === 0 || apt.tier === 1 ? '1 room' : apt.tier === 3 ? '1 bd' : apt.tier === 4 ? '3 bds' : '3 bds')
const shortPrice = (n: number) => (n === 0 ? '$0' : n >= 10000 ? `$${(n / 1000).toFixed(1)}K` : n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 2).replace(/0$/, '')}K` : `$${n}`)

export default function Zillo({ path, navigate, compact }: SiteProps) {
  const s = useWorld()
  const [root, arg] = segs(path)
  const page = root === 'listing' ? 'listing' : root === 'home' ? 'home' : root === 'afford' ? 'afford' : 'search'
  const [flash, setFlash] = useFlash(8000)
  const mainRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [path])

  let body: ReactNode
  if (page === 'listing') {
    const apt = APARTMENTS.find(a => String(a.tier) === arg)
    body = apt ? <ListingPage s={s} apt={apt} navigate={navigate} setFlash={setFlash} /> : <SearchPage s={s} navigate={navigate} />
  } else if (page === 'home') body = <HomePage s={s} navigate={navigate} />
  else if (page === 'afford') body = <AffordPage s={s} navigate={navigate} />
  else body = <SearchPage s={s} navigate={navigate} />

  return (
    <div className={`zl-root${compact ? ' is-compact' : ''}`}>
      <header className="zl-header">
        <nav className="zl-nav-left">
          <button className={page === 'search' || page === 'listing' ? 'is-active' : ''} onClick={() => navigate('')}>Rent</button>
          <button className={page === 'home' ? 'is-active' : ''} onClick={() => navigate('home')}>Your home</button>
          <button className={page === 'afford' ? 'is-active' : ''} onClick={() => navigate('afford')}>Affordability</button>
        </nav>
        <button className="zl-logo" onClick={() => navigate('')} aria-label="Zillo home">
          <ZilloMark />
          <span>Zillo</span>
        </button>
        <nav className="zl-nav-right">
          <span className="zl-nav-muted">Manage Rentals</span>
          <span className="zl-user">{(s.player.name || s.meta.playerName || '?').slice(0, 1).toUpperCase()}</span>
        </nav>
      </header>
      {flash && <div className={`zl-flash is-${flash.tone}`}>{flash.text}</div>}
      <main className="zl-main" ref={mainRef}>{body}</main>
    </div>
  )
}

function ZilloMark() {
  return (
    <svg width="30" height="26" viewBox="0 0 30 26" aria-hidden>
      <path d="M15 1.5 1.8 11.4a1 1 0 0 0 .6 1.8H5v10.3a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V13.2h2.6a1 1 0 0 0 .6-1.8z" fill="#006aff" />
      <rect x="12.5" y="14.5" width="5" height="5" rx="1" fill="#fff" />
      <rect x="19.5" y="16" width="3" height="8.5" rx="0.8" fill="#fff" opacity="0.85" />
    </svg>
  )
}

function RoomPhoto({ tier, alt, className, eager }: { tier: number; alt: string; className?: string; eager?: boolean }) {
  return (
    <ImageWithFallback
      src={roomImage(tier)}
      alt={alt}
      fallbackLabel={alt}
      fallbackEmoji={tier === 0 ? '🏡' : tier >= 4 ? '🏙️' : '🛋️'}
      aspectRatio="16 / 10"
      className={className}
      loading={eager ? 'eager' : 'lazy'}
    />
  )
}

// ---------------------------------------------------------------------------
// search (map + list)
// ---------------------------------------------------------------------------
function SearchPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const [sort, setSort] = useState<Sort>('rec')
  const [cap, setCap] = useState<PriceCap>('any')
  const [qualified, setQualified] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [saved, setSaved] = useState<Set<number>>(new Set())
  const listings = useMemo(() => {
    let list = APARTMENTS.map(apt => ({ apt, e: eligOf(s, apt) }))
    if (cap !== 'any') list = list.filter(x => x.apt.rent <= Number(cap))
    if (qualified) list = list.filter(x => x.e.ok || x.apt.tier === s.home.tier)
    const rank = (x: { apt: ApartmentDef; e: Eligibility }) => (x.apt.tier === s.home.tier ? 2 : x.e.ok ? 0 : 1)
    switch (sort) {
      case 'low': return list.sort((a, b) => a.apt.rent - b.apt.rent)
      case 'high': return list.sort((a, b) => b.apt.rent - a.apt.rent)
      case 'size': return list.sort((a, b) => b.apt.sqft - a.apt.sqft)
      default: return list.sort((a, b) => rank(a) - rank(b) || Math.abs(a.apt.tier - s.home.tier - 1) - Math.abs(b.apt.tier - s.home.tier - 1))
    }
  }, [s, sort, cap, qualified])
  const inc = safe(() => income30(s), { wages: 0, business: 0, revenue: 0, total: 0 })

  return (
    <div className="zl-search">
      <div className="zl-filters">
        <label className="zl-where">
          <MapPin size={16} />
          <input value="Harbor City metro · Rentals" readOnly aria-label="Location" />
        </label>
        <span className="zl-pill is-on">For Rent</span>
        <select value={cap} onChange={e => setCap(e.target.value as PriceCap)} aria-label="Price">
          <option value="any">Price: Any</option>
          <option value="1000">Up to $1,000</option>
          <option value="2000">Up to $2,000</option>
          <option value="5000">Up to $5,000</option>
        </select>
        <button className={`zl-pill${qualified ? ' is-on' : ''}`} onClick={() => setQualified(q => !q)}>
          {qualified ? <Check size={14} /> : null} I qualify
        </button>
        <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="rec">Sort: Homes for You</option>
          <option value="low">Price (Low to High)</option>
          <option value="high">Price (High to Low)</option>
          <option value="size">Square Feet</option>
        </select>
      </div>
      <div className="zl-split">
        <div className="zl-map" aria-label="Map of listings">
          <MapArt />
          {APARTMENTS.map(apt => {
            const pos = PINS[apt.tier]
            const shown = listings.some(l => l.apt.tier === apt.tier)
            if (!shown) return null
            const e = eligOf(s, apt)
            const mine = apt.tier === s.home.tier
            return (
              <button
                key={apt.tier}
                className={`zl-pin${hover === apt.tier ? ' is-hover' : ''}${mine ? ' is-mine' : e.ok ? '' : ' is-no'}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onMouseEnter={() => setHover(apt.tier)}
                onMouseLeave={() => setHover(null)}
                onClick={() => navigate(`listing/${apt.tier}`)}
              >
                {mine ? <House size={12} /> : null}
                {shortPrice(apt.rent)}
              </button>
            )
          })}
          <div className="zl-map-attrib">Map data © Zillo · Harbor City</div>
        </div>
        <div className="zl-list">
          <div className="zl-list-head">
            <h1>Harbor City Rentals</h1>
            <span>{listings.length} rentals · your 30-day income {usd(inc.total, false)} · checking {usd(s.finance.cash, false)}</span>
          </div>
          <div className="zl-cards">
            {listings.map(({ apt, e }) => {
              const mine = apt.tier === s.home.tier
              return (
                <article
                  key={apt.tier}
                  className={`zl-card${hover === apt.tier ? ' is-hover' : ''}`}
                  onMouseEnter={() => setHover(apt.tier)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => navigate(`listing/${apt.tier}`)}
                >
                  <div className="zl-card-photo">
                    <RoomPhoto tier={apt.tier} alt={apt.name} />
                    <span className={`zl-badge ${mine ? 'is-mine' : e.ok ? 'is-ok' : 'is-no'}`}>
                      {mine ? 'Your home' : e.ok ? 'Pre-qualified' : apt.tier === 0 ? 'Available' : 'Doesn’t qualify'}
                    </span>
                    <button
                      className={`zl-heart${saved.has(apt.tier) ? ' is-on' : ''}`}
                      aria-label="Save"
                      onClick={ev => {
                        ev.stopPropagation()
                        setSaved(prev => {
                          const n = new Set(prev)
                          if (n.has(apt.tier)) n.delete(apt.tier)
                          else n.add(apt.tier)
                          return n
                        })
                      }}
                    >
                      <Heart size={20} />
                    </button>
                  </div>
                  <div className="zl-card-body">
                    <div className="zl-price">{apt.rent === 0 ? '$0/mo' : `${usd(apt.rent, false)}/mo`}</div>
                    <div className="zl-facts"><b>{bedsLabel(apt)}</b> | <b>{BATHS[apt.tier]}</b> ba | <b>{apt.sqft.toLocaleString('en-US')}</b> sqft - {apt.name}</div>
                    <div className="zl-addr">{apt.neighborhood}</div>
                    <div className="zl-listed">{apt.headline}</div>
                  </div>
                </article>
              )
            })}
          </div>
          {listings.length === 0 && <p className="zl-empty">No rentals match. Try removing a filter.</p>}
          <p className="zl-fine">Landlords want 30-day income of {HOUSING_RULES.incomeMultiple}× the rent, or {HOUSING_RULES.cashMultiple}× the rent in the bank. Income = paychecks + business profit.</p>
        </div>
      </div>
    </div>
  )
}

function MapArt() {
  return (
    <svg className="zl-map-art" viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="400" height="520" fill="#eef1ec" />
      <path d="M-10 380 C 80 350, 120 420, 210 400 S 330 330, 420 360 L420 440 C 330 420, 260 470, 180 470 S 40 440, -10 460z" fill="#b9d7f2" />
      <rect x="250" y="60" width="90" height="70" rx="8" fill="#cfe6c4" />
      <rect x="40" y="170" width="70" height="60" rx="8" fill="#cfe6c4" />
      <circle cx="300" cy="240" r="34" fill="#cfe6c4" />
      {[60, 130, 200, 270, 320].map(y => <line key={y} x1="0" x2="400" y1={y} y2={y - 20} stroke="#fff" strokeWidth={y === 200 ? 9 : 5} />)}
      {[70, 150, 230, 310].map(x => <line key={x} x1={x} x2={x + 30} y1="0" y2="520" stroke="#fff" strokeWidth={x === 150 ? 9 : 5} />)}
      <path d="M0 250 C 120 230, 180 300, 400 280" stroke="#f7d774" strokeWidth="7" fill="none" />
      <text x="92" y="162" fontSize="11" fill="#7b8a80" fontFamily="Inter, sans-serif">Arts District</text>
      <text x="262" y="50" fontSize="11" fill="#7b8a80" fontFamily="Inter, sans-serif">Eastside</text>
      <text x="200" y="232" fontSize="11" fill="#7b8a80" fontFamily="Inter, sans-serif">Midtown</text>
      <text x="36" y="300" fontSize="11" fill="#7b8a80" fontFamily="Inter, sans-serif">Westbrook</text>
      <text x="220" y="360" fontSize="11" fill="#7b8a80" fontFamily="Inter, sans-serif">Downtown</text>
      <text x="30" y="420" fontSize="11" fill="#7b8a80" fontFamily="Inter, sans-serif">Maple Heights</text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// listing detail
// ---------------------------------------------------------------------------
function ListingPage({ s, apt, navigate, setFlash }: { s: GameState; apt: ApartmentDef; navigate: (p: string) => void; setFlash: (f: Flash | null) => void }) {
  const e = eligOf(s, apt)
  const mine = apt.tier === s.home.tier
  const cur = APARTMENTS[s.home.tier] ?? APARTMENTS[0]
  const [confirm, setConfirm] = useState(false)
  const incOk = e.income30 >= e.needIncome
  const cashOk = e.cash >= e.needCash
  const rentShare = e.income30 > 0 ? apt.rent / e.income30 : Infinity
  const net = e.moveInCost - e.depositRefund
  const move = () => {
    setConfirm(false)
    const r = run(st => moveApartment(st, apt.tier))
    if (r?.ok) {
      setFlash({ tone: 'success', text: apt.tier === 0 ? 'You moved back into your parents’ basement. Mom is thrilled. You are… adjusting.' : `Lease signed! Welcome to ${apt.name}. Rent (${usd(apt.rent, false)}) drafts from checking on the 1st.` })
      navigate('home')
    } else setFlash({ tone: 'critical', text: r?.reason ?? 'Your application was declined.' })
  }

  const facts: { icon: ReactNode; label: string; value: string }[] = [
    { icon: <BedDouble size={18} />, label: 'Bedroom', value: apt.beds },
    { icon: <Ruler size={18} />, label: 'Size', value: `${apt.sqft.toLocaleString('en-US')} sqft` },
    { icon: <Zap size={18} />, label: 'Sleep quality', value: `×${apt.sleepQuality.toFixed(2)} energy recovery${apt.tier !== cur.tier ? ` (${apt.sleepQuality >= cur.sleepQuality ? '+' : '−'}${Math.round(Math.abs(apt.sleepQuality / cur.sleepQuality - 1) * 100)}% vs now)` : ''}` },
    { icon: <Smile size={18} />, label: 'Mood baseline', value: `${apt.moodBase}${apt.tier !== cur.tier ? ` (${apt.moodBase - cur.moodBase >= 0 ? '+' : ''}${apt.moodBase - cur.moodBase} vs now)` : ''}` },
    { icon: <Camera size={18} />, label: 'Filming light', value: apt.filmingBonus > 0 ? `+${apt.filmingBonus.toFixed(2)} self-shot quality` : 'No bonus' },
    { icon: <Users size={18} />, label: 'Team space', value: apt.staffMoraleBonus > 0 ? `+${apt.staffMoraleBonus} staff morale` : 'None' },
    { icon: <Bath size={18} />, label: 'Bathrooms', value: BATHS[apt.tier] },
    { icon: <KeyRound size={18} />, label: 'Deposit', value: apt.rent ? usd(apt.rent * HOUSING_RULES.depositMonths, false) : 'None' },
  ]

  return (
    <div className="zl-detail">
      <button className="zl-back" onClick={() => navigate('')}><ArrowLeft size={16} /> Back to search</button>
      <div className="zl-detail-photos">
        <RoomPhoto tier={apt.tier} alt={apt.name} className="zl-hero" eager />
      </div>
      <div className="zl-detail-grid">
        <div className="zl-detail-main">
          <div className="zl-detail-price">{apt.rent === 0 ? '$0/mo' : `${usd(apt.rent, false)}/mo`}</div>
          <div className="zl-facts is-big"><b>{bedsLabel(apt)}</b> | <b>{BATHS[apt.tier]}</b> ba | <b>{apt.sqft.toLocaleString('en-US')}</b> sqft</div>
          <div className="zl-addr is-big"><MapPin size={15} /> {apt.name} · {apt.neighborhood}</div>
          <p className="zl-headline">{apt.headline}</p>
          <section className="zl-section">
            <h2>What's special</h2>
            <p>{apt.description}</p>
            <ul className="zl-features">{apt.features.map(f => <li key={f}><Sparkles size={14} /> {f}</li>)}</ul>
          </section>
          <section className="zl-section">
            <h2>Facts & features</h2>
            <div className="zl-fact-grid">
              {facts.map(f => (
                <div key={f.label} className="zl-fact">
                  <span className="zl-fact-icon">{f.icon}</span>
                  <div><span>{f.label}</span><b>{f.value}</b></div>
                </div>
              ))}
            </div>
          </section>
          {apt.tier > 0 && (
            <section className="zl-section">
              <h2>Affordability</h2>
              <div className="zl-afford">
                <div className="zl-afford-bar">
                  <div className={`zl-afford-fill ${rentShare <= 0.3 ? 'is-ok' : rentShare <= 0.4 ? 'is-warn' : 'is-bad'}`} style={{ width: `${Math.min(100, (Number.isFinite(rentShare) ? rentShare : 1) * 100)}%` }} />
                </div>
                <p>
                  Rent would be <b>{Number.isFinite(rentShare) ? `${Math.round(rentShare * 100)}%` : '∞'}</b> of your last 30 days of income ({usd(e.income30, false)}).
                  {' '}{rentShare <= 0.3 ? 'Comfortable — under the 30% rule of thumb.' : rentShare <= 0.4 ? 'A stretch. One bad month for the store and rent eats your ad budget.' : 'Risky: rent would take most of what you earn.'}
                </p>
              </div>
            </section>
          )}
        </div>
        <aside className="zl-apply">
          <div className="zl-apply-card">
            {mine ? (
              <>
                <div className="zl-apply-title"><House size={18} /> You live here</div>
                <p className="zl-muted">Since {formatDate(s.home.movedInDay, 'short')}.</p>
                <button className="zl-btn is-ghost" onClick={() => navigate('home')}>View your lease</button>
              </>
            ) : (
              <>
                <div className="zl-apply-title">Rental requirements</div>
                {apt.tier === 0 ? (
                  <p className="zl-muted">No application needed — Mom already said yes. No deposit, no movers (Dad's minivan).</p>
                ) : (
                  <ul className="zl-reqs">
                    <li className={incOk ? 'is-ok' : 'is-no'}>
                      {incOk ? <Check size={16} /> : <X size={16} />}
                      <div><b>30-day income ≥ {usd(e.needIncome, false)}</b><span>You: {usd(e.income30, false)}</span></div>
                    </li>
                    <li className="zl-or">or</li>
                    <li className={cashOk ? 'is-ok' : 'is-no'}>
                      {cashOk ? <Check size={16} /> : <X size={16} />}
                      <div><b>Cash in the bank ≥ {usd(e.needCash, false)}</b><span>You: {usd(e.cash, false)}</span></div>
                    </li>
                  </ul>
                )}
                {apt.tier > 0 && (
                  <div className="zl-costs">
                    <div><span>Security deposit</span><b>{usd(e.deposit, false)}</b></div>
                    <div><span>First month (prorated)</span><b>{usd(e.proratedRent)}</b></div>
                    <div><span>Movers</span><b>{usd(e.movers, false)}</b></div>
                    {e.depositRefund > 0 && <div className="is-credit"><span>Deposit back from {cur.name} (est.)</span><b>−{usd(e.depositRefund, false)}</b></div>}
                    <div className="is-total"><span>Due at move-in</span><b>{usd(Math.max(0, net))}</b></div>
                  </div>
                )}
                {!e.ok && e.reason && <p className="zl-reason">{e.reason}</p>}
                <button className="zl-btn" disabled={!e.ok} onClick={() => setConfirm(true)}>{apt.tier === 0 ? 'Move back home' : 'Apply & move in'}</button>
                {apt.tier > 0 && <p className="zl-fine">Deposit and rent come from checking (landlords don't take credit cards). Movers can go on your card.</p>}
              </>
            )}
          </div>
          <div className="zl-agent">
            <span className="zl-agent-avatar"><Building2 size={18} /></span>
            <div>
              <b>{apt.landlord.name}</b>
              <span><Mail size={12} /> {apt.landlord.email}</span>
            </div>
          </div>
        </aside>
      </div>
      {confirm && (
        <SiteLayer className="zl-layer" onClose={() => setConfirm(false)} pauseKey="zl-move">
          <div className="zl-dialog" role="dialog" aria-modal>
            <h3>{apt.tier === 0 ? 'Move back in with your parents?' : `Sign the lease for ${apt.name}?`}</h3>
            {apt.tier > 0 ? (
              <>
                <p>{usd(Math.max(0, net))} due today, then {usd(apt.rent, false)} on the 1st of every month from checking. Two missed rent payments mean eviction.</p>
                <p className="zl-muted">Your monthly fixed costs go from {usd(safe(() => monthlyBurn(s, b => !b.business), 0), false)} to about {usd(safe(() => monthlyBurn(s, b => !b.business && b.ref !== 'rent'), 0) + apt.rent, false)}.</p>
              </>
            ) : (
              <p>No rent. Lower mood, shared Wi-Fi, and Mom asking about your "little website." {s.home.deposit ? `Your ${usd(s.home.deposit, false)} deposit comes back minus cleaning.` : ''}</p>
            )}
            <div className="zl-dialog-actions">
              <button className="zl-btn is-ghost" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="zl-btn" onClick={move}>{apt.tier === 0 ? 'Move home' : 'Sign & move in'}</button>
            </div>
          </div>
        </SiteLayer>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// your home
// ---------------------------------------------------------------------------
function HomePage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const apt = APARTMENTS[s.home.tier] ?? APARTMENTS[0]
  const bill = s.finance.bills.find(b => b.ref === 'rent')
  const today = todayOf(s)
  const arrears = bill?.arrears ?? 0
  return (
    <div className="zl-detail">
      <div className="zl-home-hero">
        <RoomPhoto tier={apt.tier} alt={apt.name} className="zl-home-photo" eager />
        <div className="zl-home-info">
          <span className="zl-eyebrow">Your home</span>
          <h1>{apt.name}</h1>
          <p className="zl-muted"><MapPin size={14} /> {apt.neighborhood}</p>
          <div className="zl-costs">
            <div><span>Monthly rent</span><b>{apt.rent ? usd(apt.rent, false) : 'Free'}</b></div>
            {bill && <div><span>Next rent due</span><b>{formatDate(bill.nextDueDay, 'md')}</b></div>}
            <div><span>Moved in</span><b>{formatDate(s.home.movedInDay, 'short')}</b></div>
            {(s.home.deposit ?? 0) > 0 && <div><span>Deposit held</span><b>{usd(s.home.deposit ?? 0, false)}</b></div>}
            {apt.tier > 0 && <div><span>Missed payments</span><b className={s.home.missedRent > 0 ? 'zl-bad' : ''}>{s.home.missedRent} / {HOUSING_RULES.missedToEvict}</b></div>}
            {apt.tier > 0 && <div><span>On-time streak</span><b>{s.home.onTimeRentStreak ?? 0} month{(s.home.onTimeRentStreak ?? 0) === 1 ? '' : 's'}</b></div>}
          </div>
          {arrears > 0 && <p className="zl-reason">Rent is past due: {usd(arrears)}. It retries daily from checking — after {HOUSING_RULES.graceDays} days a late fee applies, and {HOUSING_RULES.missedToEvict} missed payments mean eviction.</p>}
          {apt.tier > 0 && (s.home.missedRent ?? 0) > 0 && <p className="zl-fine">{HOUSING_RULES.forgiveAfterOnTime} on-time payments in a row clear one missed payment from your record.</p>}
          <div className="zl-row">
            <button className="zl-btn" onClick={() => navigate('')}>Browse rentals</button>
            <button className="zl-btn is-ghost" onClick={() => navigate(`listing/${apt.tier}`)}>Listing details</button>
          </div>
        </div>
      </div>
      <section className="zl-section">
        <h2>What this place does for you</h2>
        <div className="zl-fact-grid">
          <div className="zl-fact"><span className="zl-fact-icon"><Zap size={18} /></span><div><span>Sleep quality</span><b>×{apt.sleepQuality.toFixed(2)} energy recovery</b></div></div>
          <div className="zl-fact"><span className="zl-fact-icon"><Smile size={18} /></span><div><span>Mood baseline</span><b>{apt.moodBase}</b></div></div>
          <div className="zl-fact"><span className="zl-fact-icon"><Camera size={18} /></span><div><span>Filming</span><b>{apt.filmingBonus > 0 ? `+${apt.filmingBonus.toFixed(2)} quality` : 'No bonus'}</b></div></div>
          <div className="zl-fact"><span className="zl-fact-icon"><Users size={18} /></span><div><span>Team morale</span><b>{apt.staffMoraleBonus > 0 ? `+${apt.staffMoraleBonus}` : 'No bonus'}</b></div></div>
        </div>
        <p className="zl-fine">Rent drafts from checking on the 1st of each month. Today is {formatDate(today, 'long')}.</p>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// affordability calculator
// ---------------------------------------------------------------------------
function AffordPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const inc = safe(() => income30(s), { wages: 0, business: 0, revenue: 0, total: 0 })
  const byIncome = inc.total / HOUSING_RULES.incomeMultiple
  const byCash = s.finance.cash / HOUSING_RULES.cashMultiple
  const maxRent = Math.max(byIncome, byCash)
  const comfy = inc.total * 0.3
  return (
    <div className="zl-detail">
      <h1 className="zl-h1">How much rent can you afford?</h1>
      <div className="zl-afford-grid">
        <div className="zl-afford-card">
          <span>Landlord maximum</span>
          <b>{usd(maxRent, false)}/mo</b>
          <small>Higher of: income ÷ {HOUSING_RULES.incomeMultiple} ({usd(byIncome, false)}) or cash ÷ {HOUSING_RULES.cashMultiple} ({usd(byCash, false)})</small>
        </div>
        <div className="zl-afford-card is-green">
          <span>Comfortable (30% rule)</span>
          <b>{usd(comfy, false)}/mo</b>
          <small>30% of your last 30 days of income</small>
        </div>
        <div className="zl-afford-card">
          <span>Last 30 days of income</span>
          <b>{usd(inc.total, false)}</b>
          <small>{usd(inc.wages, false)} paychecks + {usd(Math.max(0, inc.business), false)} business profit</small>
        </div>
      </div>
      <p className="zl-fine">A lease is a fixed cost that doesn't care about your ROAS. Store income swings — base the decision on months of profit, not one great week.</p>
      <div className="zl-cards is-row">
        {APARTMENTS.filter(a => a.tier > 0).map(apt => (
          <button key={apt.tier} className={`zl-mini${apt.rent <= maxRent ? ' is-ok' : ''}`} onClick={() => navigate(`listing/${apt.tier}`)}>
            <b>{apt.name}</b>
            <span>{usd(apt.rent, false)}/mo</span>
            <em>{apt.rent <= comfy ? 'Comfortable' : apt.rent <= maxRent ? 'Qualifies (stretch)' : 'Out of reach'}</em>
          </button>
        ))}
      </div>
    </div>
  )
}
