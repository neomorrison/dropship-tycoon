// UpWorx — freelancer marketplace (Upwork parody). OWNER: ui-life-sites. Class prefix: uw-
// Routes: '' find talent | 'role/<role>' filtered | 'f/<candidateId>' profile | 'team' my team
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, BadgeCheck, Bell, Briefcase, CalendarClock, Clock, Gem, MapPin, Rocket, Search, Sparkles, Star, Users } from 'lucide-react'
import type { SiteProps } from '../types'
import type { GameState, StaffCandidate, StaffMember, StaffRole } from '../../../core/types'
import { portrait } from '../../../core/assets'
import { dayOf, formatDate } from '../../../core/time'
import { STAFF_ROLES, STAFF_ROLE_LIST, STAFF_RULES, UPWORX_FEE_PCT, skillTier, type StaffConfigField } from '../../../data/staff'
import { configureStaff, copywriterQuality, designerBonus, fireStaff, hireStaff, opsBulkDiscountPct, ugcQuality, vaDailyCapacity, weeklyPayroll } from '../../../sim/life'
import { cardAvailable } from '../../../core/money'
import { Stars } from '../../kit/common'
import { SiteLayer } from '../bank/SiteLayer'
import { relDay, round2, run, safe, segs, todayOf, useFlash, useWorld, usd, type Flash } from '../bank/lifeCommon'
import './upworx.css'

type Tier = 'any' | 'junior' | 'mid' | 'senior'
type Sort = 'best' | 'rate_low' | 'rate_high' | 'skill'

// ---------------------------------------------------------------------------
// profile helpers
// ---------------------------------------------------------------------------
function badgeOf(c: { rating?: number; jobsDone?: number; skill: number }): { label: string; icon: ReactNode; cls: string } | null {
  const r = c.rating ?? 0
  const j = c.jobsDone ?? 0
  if (j >= 100 && r >= 4.9) return { label: 'Top Rated Plus', icon: <Gem size={13} />, cls: 'is-plus' }
  if (j >= 20 && r >= 4.7) return { label: 'Top Rated', icon: <BadgeCheck size={13} />, cls: 'is-top' }
  if (j === 0) return { label: 'New to UpWorx', icon: <Sparkles size={13} />, cls: 'is-new' }
  if (c.skill >= 5 && j < 20) return { label: 'Rising Talent', icon: <Rocket size={13} />, cls: 'is-rising' }
  return null
}
const jobSuccess = (rating?: number) => (rating && rating > 0 ? Math.max(70, Math.min(100, Math.round(60 + (rating - 3.9) * 36))) : null)
const earned = (c: { jobsDone?: number; salaryWeekly: number }) => {
  const v = (c.jobsDone ?? 0) * c.salaryWeekly * 1.4
  if (v <= 0) return null
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M+` : v >= 1000 ? `$${Math.floor(v / 1000)}K+` : `$${Math.round(v)}`
}
const withFee = (weekly: number) => round2(weekly * (1 + UPWORX_FEE_PCT))
const tierLabel = (skill: number) => ({ junior: 'Entry level', mid: 'Intermediate', senior: 'Expert' })[skillTier(skill)]

function Avatar({ id, name, size = 56, online }: { id: string; name: string; size?: number; online?: boolean }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [id])
  return (
    <span className="uw-avatar" style={{ width: size, height: size }}>
      {bad ? <span className="uw-avatar-fb">{name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span> : <img src={portrait(id)} alt="" onError={() => setBad(true)} />}
      {online && <i className="uw-online" />}
    </span>
  )
}

function SkillMeter({ skill }: { skill: number }) {
  return (
    <span className="uw-skill" title={`Skill ${skill}/10`}>
      <Stars rating={skill / 2} color="#14a800" size={14} />
      <b>{skill}/10</b>
      <span>{tierLabel(skill)}</span>
    </span>
  )
}

function moraleInfo(m: number): { label: string; cls: string } {
  if (m >= 70) return { label: 'Happy', cls: 'is-good' }
  if (m >= 45) return { label: 'Okay', cls: 'is-ok' }
  if (m >= STAFF_RULES.quitMorale) return { label: 'Unhappy', cls: 'is-warn' }
  return { label: 'About to quit', cls: 'is-bad' }
}

// ---------------------------------------------------------------------------
// site
// ---------------------------------------------------------------------------
export default function UpWorx({ path, navigate, compact }: SiteProps) {
  const s = useWorld()
  const [root, arg] = segs(path)
  const [flash, setFlash] = useFlash(8000)
  const page = root === 'team' ? 'team' : root === 'f' ? 'profile' : 'find'

  let body: ReactNode
  if (page === 'team') body = <TeamPage s={s} navigate={navigate} setFlash={setFlash} />
  else if (page === 'profile') {
    const c = s.staff.candidates.find(x => x.id === arg)
    body = c ? <ProfilePage s={s} c={c} navigate={navigate} setFlash={setFlash} /> : <FindPage s={s} navigate={navigate} role={null} setFlash={setFlash} gone />
  } else body = <FindPage s={s} navigate={navigate} role={root === 'role' && arg && arg in STAFF_ROLES ? (arg as StaffRole) : null} setFlash={setFlash} />

  return (
    <div className={`uw-root${compact ? ' is-compact' : ''}`}>
      <header className="uw-header">
        <button className="uw-logo" onClick={() => navigate('')} aria-label="UpWorx home">upworx</button>
        <nav className="uw-nav">
          <button className={page !== 'team' ? 'is-on' : ''} onClick={() => navigate('')}>Find talent</button>
          <button className={page === 'team' ? 'is-on' : ''} onClick={() => navigate('team')}>
            My team{s.staff.members.length ? <span className="uw-count">{s.staff.members.length}</span> : null}
          </button>
        </nav>
        <div className="uw-header-right">
          <span className="uw-search-pill"><Search size={16} /> Search talent</span>
          <span className="uw-bell"><Bell size={19} /></span>
          <span className="uw-me">{(s.player.name || s.meta.playerName || '?').slice(0, 1).toUpperCase()}</span>
        </div>
      </header>
      {flash && <div className={`uw-flash is-${flash.tone}`}>{flash.text}</div>}
      <main className="uw-main">{body}</main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// find talent
// ---------------------------------------------------------------------------
function FindPage({ s, navigate, role, setFlash, gone }: { s: GameState; navigate: (p: string) => void; role: StaffRole | null; setFlash: (f: Flash | null) => void; gone?: boolean }) {
  const today = todayOf(s)
  const [tier, setTier] = useState<Tier>('any')
  const [sort, setSort] = useState<Sort>('best')
  const [hire, setHire] = useState<StaffCandidate | null>(null)
  const live = useMemo(() => s.staff.candidates.filter(c => c.expiresDay >= today), [s.staff.candidates, today])
  const counts = useMemo(() => {
    const m: Partial<Record<StaffRole, number>> = {}
    for (const c of live) m[c.role] = (m[c.role] ?? 0) + 1
    return m
  }, [live])
  const list = useMemo(() => {
    let arr = live.filter(c => (!role || c.role === role) && (tier === 'any' || skillTier(c.skill) === tier))
    arr = [...arr]
    if (sort === 'rate_low') arr.sort((a, b) => a.salaryWeekly - b.salaryWeekly)
    else if (sort === 'rate_high') arr.sort((a, b) => b.salaryWeekly - a.salaryWeekly)
    else if (sort === 'skill') arr.sort((a, b) => b.skill - a.skill)
    else arr.sort((a, b) => (b.skill * 100) / b.salaryWeekly - (a.skill * 100) / a.salaryWeekly)
    return arr
  }, [live, role, tier, sort])
  const nextBatch = Math.max(today + 1, (s.staff.lastRefreshDay ?? today) + 7)

  return (
    <div className="uw-find">
      <aside className="uw-filters">
        <h3>Role</h3>
        <button className={!role ? 'is-on' : ''} onClick={() => navigate('')}>All roles <span>{live.length}</span></button>
        {STAFF_ROLE_LIST.map(r => (
          <button key={r.id} className={role === r.id ? 'is-on' : ''} onClick={() => navigate(`role/${r.id}`)}>
            {r.label} <span>{counts[r.id] ?? 0}</span>
          </button>
        ))}
        <h3>Experience level</h3>
        {(['any', 'junior', 'mid', 'senior'] as Tier[]).map(t => (
          <label key={t} className="uw-radio">
            <input type="radio" name="uw-tier" checked={tier === t} onChange={() => setTier(t)} />
            {t === 'any' ? 'Any' : t === 'junior' ? 'Entry level (1–3)' : t === 'mid' ? 'Intermediate (4–7)' : 'Expert (8–10)'}
          </label>
        ))}
        <div className="uw-side-note">
          <CalendarClock size={16} />
          <span>Fresh proposals arrive weekly. Next batch around {formatDate(nextBatch, 'md')}.</span>
        </div>
      </aside>
      <section className="uw-results">
        {gone && <div className="uw-flash is-warning">That proposal expired or the freelancer took another contract.</div>}
        <div className="uw-results-head">
          <div>
            <h1>{role ? STAFF_ROLES[role].plural : 'Talent for your store'}</h1>
            <p>{role ? STAFF_ROLES[role].summary : 'Proposals from freelancers who applied to your job posts this week.'}</p>
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="best">Best match (skill per $)</option>
            <option value="skill">Highest skill</option>
            <option value="rate_low">Rate: low to high</option>
            <option value="rate_high">Rate: high to low</option>
          </select>
        </div>
        {role && <p className="uw-skillnote"><Star size={14} /> {STAFF_ROLES[role].skillNote} Typical rate {usd(STAFF_ROLES[role].rate[0], false)}–{usd(STAFF_ROLES[role].rate[1], false)}/week.</p>}
        {list.length === 0 ? (
          <div className="uw-empty">
            <Users size={40} />
            <p>No proposals match right now.</p>
            <span>New freelancers apply every week.</span>
          </div>
        ) : (
          <ul className="uw-list">
            {list.map(c => {
              const b = badgeOf(c)
              const jss = jobSuccess(c.rating)
              const e = earned(c)
              return (
                <li key={c.id} className="uw-cand" onClick={() => navigate(`f/${c.id}`)}>
                  <Avatar id={c.portrait} name={c.name} online={c.skill % 3 !== 0} />
                  <div className="uw-cand-main">
                    <div className="uw-cand-top">
                      <div>
                        <span className="uw-name">{c.name}</span>
                        <span className="uw-loc"><MapPin size={12} /> {c.country ?? 'Remote'}</span>
                      </div>
                      <div className="uw-cand-actions" onClick={ev => ev.stopPropagation()}>
                        <button className="uw-btn is-outline" onClick={() => navigate(`f/${c.id}`)}>View profile</button>
                        <button className="uw-btn" onClick={() => setHire(c)}>Hire</button>
                      </div>
                    </div>
                    <div className="uw-headline">{c.headline ?? STAFF_ROLES[c.role].label}</div>
                    <div className="uw-meta">
                      <span className="uw-rate">{usd(c.salaryWeekly, false)}/wk</span>
                      {jss !== null && <span><b>{jss}%</b> Job Success</span>}
                      {b && <span className={`uw-badge ${b.cls}`}>{b.icon}{b.label}</span>}
                      {e && <span>{e} earned</span>}
                      <span>{c.hoursPerWeek ?? STAFF_ROLES[c.role].hoursPerWeek[0]} hrs/wk</span>
                    </div>
                    <div className="uw-role-row">
                      <span className="uw-role">{STAFF_ROLES[c.role].label}</span>
                      <SkillMeter skill={c.skill} />
                      {(c.rating ?? 0) > 0 && <span className="uw-rating"><Star size={13} fill="#14a800" color="#14a800" /> {c.rating?.toFixed(1)} · {c.jobsDone} jobs</span>}
                    </div>
                    <p className="uw-bio">{c.bio}</p>
                    <span className="uw-expires">Proposal expires {relDay(c.expiresDay, today).toLowerCase()}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {hire && <HireDialog s={s} c={hire} onClose={() => setHire(null)} setFlash={setFlash} navigate={navigate} />}
    </div>
  )
}

function HireDialog({ s, c, onClose, setFlash, navigate }: { s: GameState; c: StaffCandidate; onClose: () => void; setFlash: (f: Flash | null) => void; navigate: (p: string) => void }) {
  const weekly = withFee(c.salaryWeekly)
  const def = STAFF_ROLES[c.role]
  const full = s.staff.members.length >= STAFF_RULES.maxTeam
  const canPay = s.finance.cash + safe(() => cardAvailable(s), 0) >= weekly
  const payroll = safe(() => weeklyPayroll(s), 0)
  const hire = () => {
    const r = run(st => hireStaff(st, c.id))
    onClose()
    if (r?.ok) {
      setFlash({ tone: 'success', text: `Contract started with ${c.name}. First invoice in 7 days.` })
      navigate('team')
    } else setFlash({ tone: 'critical', text: r?.reason ?? 'Couldn’t start the contract.' })
  }
  return (
    <SiteLayer className="uw-layer" onClose={onClose} pauseKey="uw-hire">
      <div className="uw-dialog" role="dialog" aria-modal>
        <div className="uw-dialog-head">
          <Avatar id={c.portrait} name={c.name} size={48} />
          <div><b>Hire {c.name}</b><span>{def.label} · skill {c.skill}/10</span></div>
        </div>
        <div className="uw-terms">
          <div><span>Weekly rate</span><b>{usd(c.salaryWeekly)}</b></div>
          <div><span>UpWorx marketplace fee ({Math.round(UPWORX_FEE_PCT * 100)}%)</span><b>{usd(weekly - c.salaryWeekly)}</b></div>
          <div className="is-total"><span>You pay weekly</span><b>{usd(weekly)}</b></div>
          <div><span>Billed from</span><b>Chaise checking, every 7 days</b></div>
          <div><span>Team payroll after hire</span><b>{usd(payroll + weekly)}/wk ≈ {usd((payroll + weekly) * 52 / 12, false)}/mo</b></div>
        </div>
        <p className="uw-fine">{def.summary} Freelancers stop working and leave after {STAFF_RULES.unpaidQuitDays} unpaid days.</p>
        {full && <p className="uw-err">Your team is full ({STAFF_RULES.maxTeam}).</p>}
        {!canPay && <p className="uw-err">UpWorx needs a payment method that covers one week ({usd(weekly)}).</p>}
        <div className="uw-dialog-actions">
          <button className="uw-btn is-outline" onClick={onClose}>Cancel</button>
          <button className="uw-btn" disabled={full || !canPay} onClick={hire}>Start contract</button>
        </div>
      </div>
    </SiteLayer>
  )
}

// ---------------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------------
function ProfilePage({ s, c, navigate, setFlash }: { s: GameState; c: StaffCandidate; navigate: (p: string) => void; setFlash: (f: Flash | null) => void }) {
  const today = todayOf(s)
  const [hire, setHire] = useState(false)
  const def = STAFF_ROLES[c.role]
  const b = badgeOf(c)
  const jss = jobSuccess(c.rating)
  const e = earned(c)
  return (
    <div className="uw-profile">
      <button className="uw-back" onClick={() => navigate(`role/${c.role}`)}><ArrowLeft size={16} /> Back to {def.plural.toLowerCase()}</button>
      <div className="uw-profile-card">
        <div className="uw-profile-head">
          <Avatar id={c.portrait} name={c.name} size={88} online />
          <div className="uw-profile-id">
            <h1>{c.name}</h1>
            <span className="uw-loc"><MapPin size={13} /> {c.country ?? 'Remote'}</span>
            <div className="uw-meta">
              {jss !== null && <span><b>{jss}%</b> Job Success</span>}
              {b && <span className={`uw-badge ${b.cls}`}>{b.icon}{b.label}</span>}
            </div>
          </div>
          <div className="uw-profile-cta">
            <button className="uw-btn" onClick={() => setHire(true)}>Hire {c.name.split(' ')[0]}</button>
            <span className="uw-expires">Proposal expires {relDay(c.expiresDay, today).toLowerCase()}</span>
          </div>
        </div>
        <div className="uw-profile-grid">
          <aside className="uw-profile-side">
            <div className="uw-stat"><b>{usd(c.salaryWeekly, false)}</b><span>per week</span></div>
            <div className="uw-stat"><b>{e ?? '$0'}</b><span>total earned</span></div>
            <div className="uw-stat"><b>{c.jobsDone ?? 0}</b><span>jobs</span></div>
            <div className="uw-stat"><b>{c.hoursPerWeek ?? def.hoursPerWeek[0]}</b><span>hours per week</span></div>
            <h4>Skill</h4>
            <SkillMeter skill={c.skill} />
            {(c.rating ?? 0) > 0 && (<><h4>Client rating</h4><Stars rating={c.rating ?? 0} color="#14a800" size={15} showValue /></>)}
          </aside>
          <div className="uw-profile-main">
            <h2>{c.headline ?? def.label}</h2>
            <p className="uw-bio is-full">{c.bio}</p>
            <div className="uw-role-box">
              <h3><Briefcase size={16} /> What a {def.label.toLowerCase()} does for you</h3>
              <p>{def.summary}</p>
              <p className="uw-muted">{def.skillNote}</p>
              <p className="uw-muted">Market rate for this role: {usd(def.rate[0], false)}–{usd(def.rate[1], false)}/week. {c.salaryWeekly < def.rate[0] + (def.rate[1] - def.rate[0]) * ((c.skill - 1) / 9) - 60 ? 'This proposal is priced below what that skill level usually costs.' : c.salaryWeekly > def.rate[0] + (def.rate[1] - def.rate[0]) * ((c.skill - 1) / 9) + 60 ? 'This proposal is priced above what that skill level usually costs.' : 'Priced about right for the skill level.'}</p>
            </div>
          </div>
        </div>
      </div>
      {hire && <HireDialog s={s} c={c} onClose={() => setHire(false)} setFlash={setFlash} navigate={navigate} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// my team
// ---------------------------------------------------------------------------
function TeamPage({ s, navigate, setFlash }: { s: GameState; navigate: (p: string) => void; setFlash: (f: Flash | null) => void }) {
  const members = s.staff.members
  const payroll = safe(() => weeklyPayroll(s), 0)
  const avgMorale = members.length ? Math.round(members.reduce((a, m) => a + m.morale, 0) / members.length) : 0
  const [fire, setFire] = useState<StaffMember | null>(null)
  const today = todayOf(s)
  const doFire = () => {
    if (!fire) return
    const name = fire.name
    run(st => fireStaff(st, fire.id))
    setFire(null)
    setFlash({ tone: 'info', text: `Contract with ${name} ended. A prorated final payment covers days worked.` })
  }
  return (
    <div className="uw-team">
      <div className="uw-team-head">
        <h1>My team</h1>
        <button className="uw-btn" onClick={() => navigate('')}>Find talent</button>
      </div>
      <div className="uw-team-stats">
        <div><span>Team members</span><b>{members.length} / {STAFF_RULES.maxTeam}</b></div>
        <div><span>Weekly payroll</span><b>{usd(payroll)}</b><small>incl. {Math.round(UPWORX_FEE_PCT * 100)}% fee</small></div>
        <div><span>Monthly equivalent</span><b>{usd(payroll * 52 / 12, false)}</b></div>
        <div><span>Average morale</span><b className={members.length ? moraleInfo(avgMorale).cls : ''}>{members.length ? `${avgMorale} · ${moraleInfo(avgMorale).label}` : '—'}</b></div>
      </div>
      {members.length === 0 ? (
        <div className="uw-empty is-card">
          <Users size={40} />
          <p>You haven't hired anyone yet.</p>
          <span>A VA to clear support tickets is usually the first hire. Media buyers and ops managers pay off once there's real spend and inventory.</span>
          <button className="uw-btn" onClick={() => navigate('')}>Browse proposals</button>
        </div>
      ) : (
        <ul className="uw-members">
          {members.map(m => <MemberCard key={m.id} s={s} m={m} today={today} onFire={() => setFire(m)} setFlash={setFlash} />)}
        </ul>
      )}
      {fire && (
        <SiteLayer className="uw-layer" onClose={() => setFire(null)} pauseKey="uw-fire">
          <div className="uw-dialog" role="dialog" aria-modal>
            <div className="uw-dialog-head">
              <Avatar id={fire.portrait} name={fire.name} size={48} />
              <div><b>End contract with {fire.name}?</b><span>{STAFF_ROLES[fire.role].label}</span></div>
            </div>
            <p>They stop working immediately. UpWorx charges a prorated final payment for days worked since the last invoice. The rest of the team loses a little morale.</p>
            <div className="uw-dialog-actions">
              <button className="uw-btn is-outline" onClick={() => setFire(null)}>Keep them</button>
              <button className="uw-btn is-danger" onClick={doFire}>End contract</button>
            </div>
          </div>
        </SiteLayer>
      )}
    </div>
  )
}

function MemberCard({ s, m, today, onFire, setFlash }: { s: GameState; m: StaffMember; today: number; onFire: () => void; setFlash: (f: Flash | null) => void }) {
  const def = STAFF_ROLES[m.role]
  const mi = moraleInfo(Math.round(m.morale))
  const [draft, setDraft] = useState<Record<string, string | number | boolean>>(() => ({ ...def.defaults, ...(m.config ?? {}) }))
  useEffect(() => setDraft({ ...def.defaults, ...(m.config ?? {}) }), [m.config, def.defaults])
  const current = { ...def.defaults, ...(m.config ?? {}) }
  const dirty = def.config.some(f => draft[f.key] !== current[f.key])
  const save = () => {
    const clean: Record<string, string | number | boolean> = {}
    for (const f of def.config) {
      let v = draft[f.key]
      if (f.kind === 'number') {
        const n = Number(v)
        v = Number.isFinite(n) ? Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, n)) : (current[f.key] as number)
      }
      clean[f.key] = v
    }
    run(st => configureStaff(st, m.id, clean))
    setFlash({ tone: 'success', text: `Saved ${m.name.split(' ')[0]}'s settings.` })
  }
  const days = today - m.hiredDay
  return (
    <li className="uw-member">
      <div className="uw-member-head">
        <Avatar id={m.portrait} name={m.name} size={56} online={m.morale >= STAFF_RULES.quitMorale} />
        <div className="uw-member-id">
          <span className="uw-name">{m.name}</span>
          <span className="uw-headline is-small">{def.label} · {m.country ?? 'Remote'}</span>
          <SkillMeter skill={m.skill} />
        </div>
        <div className="uw-member-pay">
          <b>{usd(withFee(m.salaryWeekly))}/wk</b>
          <span>{usd(m.salaryWeekly, false)} + fee · {days === 0 ? 'started today' : `${days} day${days === 1 ? '' : 's'} on the team`}</span>
        </div>
      </div>
      <div className="uw-morale">
        <span>Morale</span>
        <div className="uw-morale-bar"><div className={mi.cls} style={{ width: `${Math.max(3, m.morale)}%` }} /></div>
        <b className={mi.cls}>{Math.round(m.morale)} · {mi.label}</b>
      </div>
      {(m.unpaidDays ?? 0) > 0 && (
        <p className="uw-warn"><AlertTriangle size={15} /> Unpaid for {m.unpaidDays} day{m.unpaidDays === 1 ? '' : 's'}. They leave after {STAFF_RULES.unpaidQuitDays}. Put money in checking.</p>
      )}
      <RoleOutput s={s} m={m} />
      {m.lastReport && (
        <div className="uw-report">
          <Clock size={14} />
          <div><span>Daily update · {m.lastReportDay !== undefined ? formatDate(m.lastReportDay, 'md') : formatDate(dayOf(s.time.hour), 'md')}</span><p>{m.lastReport}</p></div>
        </div>
      )}
      {def.config.length > 0 && (
        <div className="uw-config">
          <h4>Settings</h4>
          {def.config.map(f => <ConfigField key={f.key} s={s} f={f} value={draft[f.key]} onChange={v => setDraft(d => ({ ...d, [f.key]: v }))} />)}
          <div className="uw-config-actions">
            {dirty && <button className="uw-btn is-outline is-small" onClick={() => setDraft(current)}>Discard</button>}
            <button className="uw-btn is-small" disabled={!dirty} onClick={save}>Save settings</button>
          </div>
        </div>
      )}
      <div className="uw-member-foot">
        <button className="uw-link is-danger" onClick={onFire}>End contract</button>
      </div>
    </li>
  )
}

function RoleOutput({ s, m }: { s: GameState; m: StaffMember }) {
  const items: { label: string; value: string }[] = []
  switch (m.role) {
    case 'va': {
      const open = (s.store?.tickets ?? []).filter(t => t.status !== 'solved').length
      items.push({ label: 'Capacity', value: `~${safe(() => vaDailyCapacity(m), m.skill * 15)} tickets/day (9 AM–5 PM)` })
      items.push({ label: 'Open tickets now', value: String(open) })
      items.push({ label: 'Chargebacks', value: m.config?.fightChargebacks === false ? 'Not handling' : 'Files evidence on new disputes' })
      break
    }
    case 'ugc_creator':
      items.push({ label: 'This week', value: `${m.producedThisWeek ?? 0} / ${m.weeklyQuota ?? 2} creatives` })
      items.push({ label: 'Quality', value: safe(() => ugcQuality(m), 0.5).toFixed(2) })
      break
    case 'designer':
      items.push({ label: 'Page design', value: `+${safe(() => designerBonus(s), 0)} points on every product page` })
      items.push({ label: 'Load time', value: '−0.1 s store-wide' })
      break
    case 'copywriter':
      items.push({ label: 'Product editor', value: '“Rewrite with copywriter” unlocked' })
      items.push({ label: 'Copy quality', value: `${Math.round(safe(() => copywriterQuality(s), 0) * 100)}%` })
      break
    case 'ops_manager':
      items.push({ label: 'Bulk discount', value: `${Math.round(safe(() => opsBulkDiscountPct(s), 0) * 1000) / 10}% off bulk COGS` })
      items.push({ label: 'Watching', value: `${Object.values(s.catalog.inventory).filter(i => i.units > 0).length} SKUs in the 3PL` })
      break
    case 'media_buyer':
      items.push({ label: 'Reviews ads', value: `Daily at ${STAFF_RULES.mediaBuyerHour} AM` })
      items.push({ label: 'Live ad sets', value: String(s.ads.adSets.filter(a => a.status === 'active').length) })
      break
  }
  return (
    <div className="uw-output">
      {items.map(i => <div key={i.label}><span>{i.label}</span><b>{i.value}</b></div>)}
    </div>
  )
}

function ConfigField({ s, f, value, onChange }: { s: GameState; f: StaffConfigField; value: string | number | boolean | undefined; onChange: (v: string | number | boolean) => void }) {
  if (f.kind === 'toggle') {
    const on = value === true
    return (
      <label className={`uw-toggle${on ? ' is-on' : ''}`}>
        <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
        <span className="uw-toggle-track"><span /></span>
        <span className="uw-field-text"><b>{f.label}</b><small>{f.help}</small></span>
      </label>
    )
  }
  if (f.kind === 'number') {
    return (
      <label className="uw-field">
        <span className="uw-field-text"><b>{f.label}</b><small>{f.help}</small></span>
        <input type="number" value={String(value ?? '')} min={f.min} max={f.max} step={f.step} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      </label>
    )
  }
  if (f.kind === 'select') {
    return (
      <label className="uw-field">
        <span className="uw-field-text"><b>{f.label}</b><small>{f.help}</small></span>
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
          {(f.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    )
  }
  // product picker: store products → catalogId ('' = Auto)
  const products = s.store?.products?.filter(p => p.status !== 'archived') ?? []
  const has = (catalogId: string) => s.catalog.samplesOwned.includes(catalogId) || (s.catalog.inventory[catalogId]?.units ?? 0) > 0
  const sel = String(value ?? '')
  return (
    <label className="uw-field">
      <span className="uw-field-text">
        <b>{f.label}</b>
        <small>{f.help}{sel && !has(sel) ? ' ⚠ No sample or stock for this product yet — they can’t film it.' : ''}</small>
      </span>
      <select value={sel} onChange={e => onChange(e.target.value)}>
        <option value="">Auto (best seller)</option>
        {products.map(p => <option key={p.id} value={p.catalogId}>{p.title.slice(0, 48)}{has(p.catalogId) ? '' : ' (no sample)'}</option>)}
      </select>
    </label>
  )
}
