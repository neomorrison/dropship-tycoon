// Ecom Academy — Coach Kev's learning platform. OWNER: ui-life-sites. Class prefix: ac-
// Routes: '' dashboard | 'kev' | 'courses' | 'course/<skill>' | 'glossary[/rules|terms|tables]' | 'skills' | 'milestones'
import { useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import {
  ArrowRight, Award, BookOpen, Building2, CalendarCheck, Check, ChevronDown, Clock, Crown, DoorOpen, Flame, Gem, GraduationCap, House,
  LayoutDashboard, Lock, MessageCircle, PiggyBank, Rocket, Scale, Search, Send, ShoppingBag, Sparkles, Store, Trophy, TrendingUp, UserPlus, Zap,
} from 'lucide-react'
import type { SiteProps } from '../types'
import type { GameState, SiteId, SkillId } from '../../../core/types'
import { COACH_PORTRAIT, portrait } from '../../../core/assets'
import { formatDate, monthName } from '../../../core/time'
import { openSite } from '../../../core/ui'
import { netWorth } from '../../../core/money'
import { SKILL_IDS, SKILL_INFO, activityDuration, canDoActivity, enqueueActivity, skillProgress } from '../../../sim/life'
import { analyzeBusiness, askCoach, milestoneDefs, onboardingInsight, type Insight } from '../../../sim/events'
import { siteDef } from '../registry'
import { BENCH_TABLES, COURSES, COURSE_BY_SKILL, CPM_BY_MONTH, GLOSSARY, KEV_FAQ, RULE_GROUPS, type TermCat } from './content'
import { durationLabel, firstNameOf, run, safe, segs, simRead, useFlash, useWorld, usd } from '../bank/lifeCommon'
import './academy.css'

const KEV = { name: 'Coach Kev', portrait: COACH_PORTRAIT }
const ICONS: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  Store, Rocket, ShoppingBag, TrendingUp, Flame, Zap, CalendarCheck, Trophy, Crown, DoorOpen, UserPlus, Home: House, Building2, Award, Scale, PiggyBank, Gem,
}
const SKILL_COLOR: Record<SkillId, string> = { research: '#f59e0b', copywriting: '#ec4899', creative: '#8b5cf6', media_buying: '#0866ff', operations: '#10b981' }

const NAV: { id: string; label: string; icon: ReactNode }[] = [
  { id: '', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { id: 'kev', label: 'Ask Kev', icon: <MessageCircle size={16} /> },
  { id: 'courses', label: 'Courses', icon: <BookOpen size={16} /> },
  { id: 'glossary', label: 'Glossary & benchmarks', icon: <Search size={16} /> },
  { id: 'skills', label: 'Skills', icon: <Sparkles size={16} /> },
  { id: 'milestones', label: 'Milestones', icon: <Trophy size={16} /> },
]

function KevFace({ size = 44 }: { size?: number }) {
  const [bad, setBad] = useState(false)
  return (
    <span className="ac-kev" style={{ width: size, height: size }}>
      {bad ? 'K' : <img src={portrait(KEV.portrait)} alt="Coach Kev" onError={() => setBad(true)} />}
    </span>
  )
}

function safeSite(id?: SiteId) {
  if (!id) return null
  try { return siteDef(id) } catch { return null }
}

export default function EcomAcademy({ path, navigate, compact }: SiteProps) {
  const s = useWorld()
  const [root, arg] = segs(path)
  const page = NAV.some(n => n.id === (root ?? '')) || root === 'course' ? root ?? '' : ''
  const mainRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [path])

  let body: ReactNode
  switch (page) {
    case 'kev': body = <KevPage s={s} />; break
    case 'courses': body = <CoursesPage s={s} navigate={navigate} />; break
    case 'course': body = arg && arg in COURSE_BY_SKILL ? <CoursePage s={s} skill={arg as SkillId} navigate={navigate} /> : <CoursesPage s={s} navigate={navigate} />; break
    case 'glossary': body = <GlossaryPage tab={arg === 'terms' || arg === 'tables' ? arg : 'rules'} navigate={navigate} />; break
    case 'skills': body = <SkillsPage s={s} navigate={navigate} />; break
    case 'milestones': body = <MilestonesPage s={s} />; break
    default: body = <Dashboard s={s} navigate={navigate} />
  }
  const active = page === 'course' ? 'courses' : page

  return (
    <div className={`ac-root${compact ? ' is-compact' : ''}`}>
      <header className="ac-header">
        <button className="ac-logo" onClick={() => navigate('')} aria-label="Ecom Academy home">
          <span className="ac-logo-mark"><GraduationCap size={20} /></span>
          <span className="ac-logo-text">Ecom Academy<small>by Coach Kev</small></span>
        </button>
        <nav className="ac-nav">
          {NAV.map(n => (
            <button key={n.id || 'home'} className={active === n.id ? 'is-on' : ''} onClick={() => navigate(n.id)}>
              {n.icon}<span>{n.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <main className="ac-main" ref={mainRef}>{body}</main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function Dashboard({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const next = safe(() => onboardingInsight(s), null)
  const defs = safe(() => milestoneDefs(), [])
  const unlocked = defs.filter(d => s.milestones[d.id] !== undefined)
  const recent = [...unlocked].sort((a, b) => (s.milestones[b.id] ?? 0) - (s.milestones[a.id] ?? 0)).slice(0, 3)
  const lowest = [...SKILL_IDS].sort((a, b) => (s.skills[a]?.level ?? 1) - (s.skills[b]?.level ?? 1))[0]
  const target = safeSite(next?.app)
  return (
    <div className="ac-page">
      <section className="ac-hero">
        <KevFace size={84} />
        <div className="ac-hero-text">
          <span className="ac-eyebrow">Welcome back, {firstNameOf(s)}</span>
          <h1>From the break room to seven figures.</h1>
          <p>Real benchmarks, real math, and a coach who looks at your actual numbers. Skill levels give you better tools; your decisions make the money.</p>
          <div className="ac-row">
            <button className="ac-btn is-gold" onClick={() => navigate('kev')}><MessageCircle size={16} /> Ask Kev about my business</button>
            <button className="ac-btn is-ghost" onClick={() => navigate('glossary')}>Rules of thumb</button>
          </div>
        </div>
      </section>

      <div className="ac-grid">
        <section className="ac-card">
          <h2>Your next step</h2>
          {next ? (
            <>
              <p className="ac-next">{next.text}</p>
              {target && next.app && <button className="ac-btn" onClick={() => openSite(next.app as SiteId, next.path ?? '')}>Open {target.name} <ArrowRight size={15} /></button>}
            </>
          ) : (
            <>
              <p className="ac-next">Onboarding complete. Ask Kev for a read on your numbers, or study your weakest skill: <b>{SKILL_INFO[lowest].label}</b>.</p>
              <button className="ac-btn" onClick={() => navigate(`course/${lowest}`)}>Go to course <ArrowRight size={15} /></button>
            </>
          )}
        </section>
        <section className="ac-card">
          <div className="ac-card-head"><h2>Skills</h2><button className="ac-link" onClick={() => navigate('skills')}>All skills</button></div>
          <ul className="ac-skill-mini">
            {SKILL_IDS.map(id => {
              const p = safe(() => skillProgress(s, id), { level: 1, xp: 0, need: 100, pct: 0, max: false })
              return (
                <li key={id} onClick={() => navigate(`course/${id}`)}>
                  <span className="ac-skill-name">{SKILL_INFO[id].label}</span>
                  <span className="ac-skill-lvl" style={{ color: SKILL_COLOR[id] }}>Lv {p.level}</span>
                  <div className="ac-bar"><div style={{ width: `${p.pct * 100}%`, background: SKILL_COLOR[id] }} /></div>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="ac-card">
          <div className="ac-card-head"><h2>Milestones</h2><button className="ac-link" onClick={() => navigate('milestones')}>{unlocked.length} / {defs.length}</button></div>
          {recent.length === 0 ? (
            <p className="ac-muted">Your first one is "Open for Business": create your Shopifly store.</p>
          ) : (
            <ul className="ac-recent">
              {recent.map(d => {
                const Icon = ICONS[d.icon] ?? Trophy
                return (
                  <li key={d.id}>
                    <span className="ac-medal"><Icon size={18} /></span>
                    <div><b>{d.title}</b><span>{formatDate(s.milestones[d.id], 'md')}</span></div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="ac-card">
        <div className="ac-card-head"><h2>Courses</h2><button className="ac-link" onClick={() => navigate('courses')}>See all</button></div>
        <div className="ac-course-row">
          {COURSES.map(c => (
            <button key={c.skill} className="ac-course-chip" style={{ ['--c' as string]: c.color }} onClick={() => navigate(`course/${c.skill}`)}>
              <b>{c.title}</b>
              <span>{c.lessons.length} lessons · {SKILL_INFO[c.skill].label} Lv {s.skills[c.skill]?.level ?? 1}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ask Kev
// ---------------------------------------------------------------------------
interface KevMsg { from: 'kev' | 'me'; text: string; app?: SiteId; path?: string; hour?: number }
const threads = new Map<string, KevMsg[]>()

function KevPage({ s }: { s: GameState }) {
  const key = s.meta.saveId
  const intro: KevMsg[] = [{ from: 'kev', text: `Hey ${firstNameOf(s)}! Ask me about your business and I'll pull up your real numbers — products, ads, cash, the works. Or pick a question below.` }]
  const [msgs, setMsgs] = useState<KevMsg[]>(() => threads.get(key) ?? intro)
  const [open, setOpen] = useState<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const push = (m: KevMsg[]) => {
    setMsgs(prev => {
      const n = [...prev, ...m].slice(-80)
      threads.set(key, n)
      return n
    })
    requestAnimationFrame(() => {
      const el = bodyRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    })
  }
  const ask = () => {
    let tips: string[] = []
    let insights: Insight[] = []
    run(st => {
      tips = safe(() => askCoach(st), [])
      insights = safe(() => analyzeBusiness(st), [])
      const onb = safe(() => onboardingInsight(st), null)
      if (onb) insights = [onb, ...insights]
    })
    const byText = new Map(insights.map(i => [i.text, i]))
    const reply: KevMsg[] = tips.length
      ? tips.map(t => ({ from: 'kev' as const, text: t, app: byText.get(t)?.app, path: byText.get(t)?.path }))
      : [{ from: 'kev', text: 'Honestly? Nothing on fire right now. Keep testing creatives and watch your break-even numbers.' }]
    push([{ from: 'me', text: 'Kev, take a look at my business. What should I do next?', hour: s.time.hour }, ...reply])
  }
  const faq = (i: number) => {
    const f = KEV_FAQ[i]
    push([{ from: 'me', text: f.q }, ...f.a.map(a => ({ from: 'kev' as const, text: a }))])
  }
  return (
    <div className="ac-page ac-kev-page">
      <div className="ac-chat">
        <header className="ac-chat-head">
          <KevFace size={40} />
          <div><b>Coach Kev</b><span>Usually replies instantly · looks at your live numbers</span></div>
        </header>
        <div className="ac-chat-body" ref={bodyRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`ac-msg is-${m.from}`}>
              {m.from === 'kev' && (i === 0 || msgs[i - 1].from !== 'kev') ? <KevFace size={30} /> : m.from === 'kev' ? <span className="ac-msg-gap" /> : null}
              <div className="ac-bubble">
                <p>{m.text}</p>
                {m.app && safeSite(m.app) && (
                  <button className="ac-show" onClick={() => openSite(m.app as SiteId, m.path ?? '')}>Show me in {safeSite(m.app)?.name} <ArrowRight size={13} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="ac-chat-foot">
          <div className="ac-chips">
            {KEV_FAQ.map((f, i) => <button key={f.q} onClick={() => faq(i)}>{f.q}</button>)}
          </div>
          <button className="ac-btn is-gold ac-ask" onClick={ask}><Send size={16} /> Ask Kev about my business</button>
        </div>
      </div>
      <aside className="ac-side">
        <section className="ac-card">
          <h2>Kev's playbook</h2>
          <ul className="ac-faq">
            {KEV_FAQ.map((f, i) => (
              <li key={f.q} className={open === i ? 'is-open' : ''}>
                <button onClick={() => setOpen(open === i ? null : i)}>{f.q}<ChevronDown size={15} /></button>
                {open === i && <div>{f.a.map(a => <p key={a}>{a}</p>)}</div>}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------
function studyStatus(s: GameState, skill: SkillId) {
  const all = [...(s.player.activity ? [s.player.activity] : []), ...s.player.queue]
  const mine = all.filter(a => a.kind === 'study' && a.payload?.skill === skill)
  const now = s.player.activity?.kind === 'study' && s.player.activity.payload?.skill === skill ? s.player.activity : null
  return { queued: mine.length, now }
}

function StudyButton({ s, skill, onDone }: { s: GameState; skill: SkillId; onDone: (msg: string, ok: boolean) => void }) {
  const chk = simRead(s, st => canDoActivity(st, 'study'), { ok: true as boolean, reason: undefined as string | undefined })
  const mins = safe(() => activityDuration(s, 'study'), 120)
  const p = safe(() => skillProgress(s, skill), { level: 1, xp: 0, need: 100, pct: 0, max: false })
  const st = studyStatus(s, skill)
  const study = () => {
    const id = run(state => enqueueActivity(state, 'study', { payload: { skill } }))
    onDone(id ? `Study session added to your day: ${SKILL_INFO[skill].label} (${durationLabel(mins)}).` : chk.reason ?? 'Couldn’t schedule a study session right now.', !!id)
  }
  return (
    <div className="ac-study">
      <button className="ac-btn is-gold" disabled={!chk.ok || p.max} onClick={study}>
        <Clock size={15} /> {p.max ? 'Max level' : `Study session · ${durationLabel(mins)} · +60 XP`}
      </button>
      {st.now ? <span className="ac-study-note is-live">Studying now — {durationLabel(st.now.remainingMin)} left{st.queued > 1 ? ` · ${st.queued - 1} more queued` : ''}</span>
        : st.queued > 0 ? <span className="ac-study-note">{st.queued} session{st.queued === 1 ? '' : 's'} in your queue</span>
          : !chk.ok && chk.reason ? <span className="ac-study-note">{chk.reason}</span> : null}
    </div>
  )
}

function CoursesPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const [flash, setFlash] = useFlash(6000)
  return (
    <div className="ac-page">
      <div className="ac-page-head">
        <h1>Courses</h1>
        <p>Each study session is a 2-hour block in your day at home: case studies, teardown videos and practice. Sessions add XP to that course's skill.</p>
      </div>
      {flash && <div className={`ac-flash is-${flash.tone}`}>{flash.text}</div>}
      <div className="ac-courses">
        {COURSES.map(c => {
          const p = safe(() => skillProgress(s, c.skill), { level: 1, xp: 0, need: 100, pct: 0, max: false })
          return (
            <article key={c.skill} className="ac-course" style={{ ['--c' as string]: c.color }}>
              <div className="ac-course-top" onClick={() => navigate(`course/${c.skill}`)}>
                <span className="ac-course-skill">{SKILL_INFO[c.skill].label}</span>
                <h2>{c.title}</h2>
                <p>{c.tagline}</p>
              </div>
              <div className="ac-course-meta">
                <span>{c.lessons.length} lessons · {c.lessons.reduce((a, l) => a + l.minutes, 0)} min read</span>
                <span>Level {p.level}{p.max ? ' (max)' : ` · ${Math.round(p.pct * 100)}% to ${p.level + 1}`}</span>
              </div>
              <div className="ac-bar"><div style={{ width: `${p.pct * 100}%`, background: c.color }} /></div>
              <div className="ac-course-actions">
                <button className="ac-btn is-ghost" onClick={() => navigate(`course/${c.skill}`)}>Open course</button>
                <StudyButton s={s} skill={c.skill} onDone={(m, ok) => setFlash({ tone: ok ? 'success' : 'warning', text: m })} />
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function CoursePage({ s, skill, navigate }: { s: GameState; skill: SkillId; navigate: (p: string) => void }) {
  const c = COURSE_BY_SKILL[skill]
  const info = SKILL_INFO[skill]
  const p = safe(() => skillProgress(s, skill), { level: 1, xp: 0, need: 100, pct: 0, max: false })
  const [open, setOpen] = useState<number>(0)
  const [flash, setFlash] = useFlash(6000)
  return (
    <div className="ac-page">
      <button className="ac-back" onClick={() => navigate('courses')}>← All courses</button>
      <section className="ac-course-hero" style={{ ['--c' as string]: c.color }}>
        <span className="ac-course-skill">{info.label} · Level {p.level}</span>
        <h1>{c.title}</h1>
        <p>{c.tagline}</p>
        <div className="ac-course-hero-bar">
          <div className="ac-bar is-light"><div style={{ width: `${p.pct * 100}%` }} /></div>
          <span>{p.max ? 'Max level reached' : `${Math.round(p.xp)} / ${p.need} XP to level ${p.level + 1}`}</span>
        </div>
        <StudyButton s={s} skill={skill} onDone={(m, ok) => setFlash({ tone: ok ? 'success' : 'warning', text: m })} />
      </section>
      {flash && <div className={`ac-flash is-${flash.tone}`}>{flash.text}</div>}
      <div className="ac-course-grid">
        <section className="ac-lessons">
          {c.lessons.map((l, i) => (
            <article key={l.title} className={`ac-lesson${open === i ? ' is-open' : ''}`}>
              <button onClick={() => setOpen(open === i ? -1 : i)}>
                <span className="ac-lesson-n">{i + 1}</span>
                <span className="ac-lesson-title">{l.title}<small>{l.minutes} min</small></span>
                <ChevronDown size={18} />
              </button>
              {open === i && (
                <div className="ac-lesson-body">
                  {l.body.map(b => <p key={b}>{b}</p>)}
                </div>
              )}
            </article>
          ))}
        </section>
        <aside className="ac-side">
          <section className="ac-card">
            <h2>What leveling up unlocks</h2>
            <p className="ac-muted">{info.perLevel}</p>
            <ul className="ac-unlocks">
              {info.unlocks.map(u => (
                <li key={u.level} className={p.level >= u.level ? 'is-on' : ''}>
                  {p.level >= u.level ? <Check size={15} /> : <Lock size={14} />}
                  <span><b>Level {u.level}</b> {u.text}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="ac-card">
            <h2>How to earn XP</h2>
            <ul className="ac-xp">{info.xpSources.map(x => <li key={x}>{x}</li>)}</ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Glossary & benchmarks
// ---------------------------------------------------------------------------
function GlossaryPage({ tab, navigate }: { tab: 'rules' | 'terms' | 'tables'; navigate: (p: string) => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<TermCat | 'All'>('All')
  const needle = q.trim().toLowerCase()
  const groups = useMemo(() => RULE_GROUPS.map(g => ({
    ...g,
    rules: g.rules.filter(r => !needle || `${r.title} ${r.body} ${(r.bullets ?? []).join(' ')}`.toLowerCase().includes(needle)),
  })).filter(g => g.rules.length), [needle])
  const terms = useMemo(() => GLOSSARY
    .filter(t => cat === 'All' || t.cat === cat)
    .filter(t => !needle || `${t.term} ${t.aka ?? ''} ${t.def} ${t.formula ?? ''}`.toLowerCase().includes(needle))
    .sort((a, b) => a.term.localeCompare(b.term)), [needle, cat])
  const cats: (TermCat | 'All')[] = ['All', 'Ads', 'Store', 'Money', 'Creative', 'Ops']
  const maxCpm = Math.max(...CPM_BY_MONTH)
  return (
    <div className="ac-page">
      <div className="ac-page-head">
        <h1>Glossary & benchmarks</h1>
        <p>US DTC and dropshipping numbers, 2024–2026. The same numbers drive the game.</p>
      </div>
      <div className="ac-tabs">
        <button className={tab === 'rules' ? 'is-on' : ''} onClick={() => navigate('glossary')}>Rules of thumb</button>
        <button className={tab === 'terms' ? 'is-on' : ''} onClick={() => navigate('glossary/terms')}>Glossary</button>
        <button className={tab === 'tables' ? 'is-on' : ''} onClick={() => navigate('glossary/tables')}>Benchmark tables</button>
        {tab !== 'tables' && (
          <label className="ac-search">
            <Search size={15} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={tab === 'rules' ? 'Search rules' : 'Search terms (CPM, ROAS, 3PL…)'} />
          </label>
        )}
      </div>

      {tab === 'rules' && (
        <div className="ac-rules">
          {groups.length === 0 && <p className="ac-muted">No rules match “{q}”.</p>}
          {groups.map(g => (
            <section key={g.id} className="ac-rule-group">
              <h2>{g.title}</h2>
              {g.rules.map(r => (
                <article key={r.n} className="ac-rule">
                  <span className="ac-rule-n">{r.n}</span>
                  <div>
                    <h3>{r.title}</h3>
                    <p>{r.body}</p>
                    {r.bullets && <ul>{r.bullets.map(b => <li key={b}>{b}</li>)}</ul>}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}

      {tab === 'terms' && (
        <>
          <div className="ac-cats">
            {cats.map(c => <button key={c} className={cat === c ? 'is-on' : ''} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          {terms.length === 0 && <p className="ac-muted">No terms match.</p>}
          <dl className="ac-terms">
            {terms.map(t => (
              <div key={t.term} className="ac-term">
                <dt>{t.term}{t.aka && <small>{t.aka}</small>}<span className="ac-term-cat">{t.cat}</span></dt>
                <dd>
                  <p>{t.def}</p>
                  {t.formula && <p className="ac-formula">{t.formula}</p>}
                  {t.bench && <p className="ac-bench"><b>Benchmark:</b> {t.bench}</p>}
                  {t.tip && <p className="ac-tip"><b>Kev's tip:</b> {t.tip}</p>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {tab === 'tables' && (
        <div className="ac-tables">
          {BENCH_TABLES.map(tb => (
            <section key={tb.id} className="ac-card is-flush">
              <h2 className="ac-table-title">{tb.title}</h2>
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead><tr><th>Metric</th><th className="is-bad">Bad</th><th>Average</th><th className="is-good">Good</th><th className="is-great">Great</th><th>Note</th></tr></thead>
                  <tbody>
                    {tb.rows.map(r => (
                      <tr key={r.metric}><td>{r.metric}</td><td className="is-bad">{r.bad}</td><td>{r.avg}</td><td className="is-good">{r.good}</td><td className="is-great">{r.great}</td><td className="ac-muted">{r.note ?? ''}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <section className="ac-card">
            <h2>Ad costs through the year (CPM vs. average)</h2>
            <div className="ac-cpm">
              {CPM_BY_MONTH.map((v, i) => (
                <div key={i} className="ac-cpm-col" title={`${monthName(i, true)}: ×${v.toFixed(2)}`}>
                  <span className="ac-cpm-v">×{v.toFixed(2)}</span>
                  <div className={`ac-cpm-bar${v >= 1.1 ? ' is-hi' : v <= 0.85 ? ' is-lo' : ''}`} style={{ height: `${(v / maxCpm) * 100}%` }} />
                  <span className="ac-cpm-m">{monthName(i)}</span>
                </div>
              ))}
            </div>
            <p className="ac-muted">January is the cheapest time to test; November is the most expensive month to buy attention — plan margin for it.</p>
          </section>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
function SkillsPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  return (
    <div className="ac-page">
      <div className="ac-page-head">
        <h1>Skills</h1>
        <p>Levels go 1–10. They unlock information and tools — deeper research, editor helpers, Ads Manager features. Knowing what to do with them is still on you.</p>
      </div>
      <div className="ac-skills">
        {SKILL_IDS.map(id => {
          const info = SKILL_INFO[id]
          const p = safe(() => skillProgress(s, id), { level: 1, xp: 0, need: 100, pct: 0, max: false })
          return (
            <section key={id} className="ac-skill" style={{ ['--c' as string]: SKILL_COLOR[id] }}>
              <div className="ac-skill-head">
                <span className="ac-skill-badge">{p.level}</span>
                <div>
                  <h2>{info.label}</h2>
                  <p>{info.description}</p>
                </div>
              </div>
              <div className="ac-bar"><div style={{ width: `${p.pct * 100}%`, background: SKILL_COLOR[id] }} /></div>
              <span className="ac-muted ac-small">{p.max ? 'Max level' : `${Math.round(p.xp)} / ${p.need} XP to level ${p.level + 1}`} · {info.perLevel}</span>
              <ul className="ac-unlocks">
                {info.unlocks.map(u => (
                  <li key={u.level} className={p.level >= u.level ? 'is-on' : ''}>
                    {p.level >= u.level ? <Check size={15} /> : <Lock size={14} />}
                    <span><b>Lv {u.level}</b> {u.text}</span>
                  </li>
                ))}
              </ul>
              <div className="ac-skill-foot">
                <span className="ac-muted ac-small">{info.xpSources.join(' · ')}</span>
                <button className="ac-link" onClick={() => navigate(`course/${id}`)}>Course →</button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
function MilestonesPage({ s }: { s: GameState }) {
  const defs = safe(() => milestoneDefs(), [])
  const unlocked = defs.filter(d => s.milestones[d.id] !== undefined).length
  const bestDay = useMemo(() => Object.values(s.store?.analytics?.daily ?? {}).reduce((a, d) => Math.max(a, d?.totalSales ?? 0), 0), [s.store?.analytics?.daily])
  const nw = safe(() => netWorth(s), 0)
  const life = s.store?.lifetimeSales ?? 0
  const today = Math.floor(s.time.hour / 24)
  const month = useMemo(() => {
    const daily = s.store?.analytics?.daily ?? {}
    let sum = 0
    for (let d = today - 29; d <= today; d++) sum += daily[d]?.totalSales ?? 0
    return sum
  }, [s.store?.analytics?.daily, today])
  const progress = (id: string): { value: number; goal: number; label: string } | null => {
    switch (id) {
      case 'first_100_day': return { value: bestDay, goal: 100, label: `Best day ${usd(bestDay, false)}` }
      case 'first_1k_day': return { value: bestDay, goal: 1000, label: `Best day ${usd(bestDay, false)}` }
      case 'first_10k_day': return { value: bestDay, goal: 10000, label: `Best day ${usd(bestDay, false)}` }
      case 'month_10k': return { value: month, goal: 10_000, label: `${usd(month, false)} in the last 30 days` }
      case 'month_100k': return { value: month, goal: 100_000, label: `${usd(month, false)} in the last 30 days` }
      case 'lifetime_1m': return { value: life, goal: 1_000_000, label: `${usd(life, false)} lifetime` }
      case 'networth_100k': return { value: nw, goal: 100_000, label: `Net worth ${usd(nw, false)}` }
      case 'networth_1m': return { value: nw, goal: 1_000_000, label: `Net worth ${usd(nw, false)}` }
      case 'penthouse': return { value: s.home.tier, goal: 5, label: `Home tier ${s.home.tier} of 5` }
      default: return null
    }
  }
  return (
    <div className="ac-page">
      <div className="ac-page-head">
        <h1>Milestones</h1>
        <p>{unlocked} of {defs.length} unlocked.</p>
        <div className="ac-bar is-wide"><div style={{ width: `${defs.length ? (unlocked / defs.length) * 100 : 0}%`, background: '#f5b301' }} /></div>
      </div>
      <div className="ac-medals">
        {defs.map(d => {
          const day = s.milestones[d.id]
          const got = day !== undefined
          const Icon = ICONS[d.icon] ?? Trophy
          const pr = got ? null : progress(d.id)
          return (
            <article key={d.id} className={`ac-medal-card${got ? ' is-got' : ''}`}>
              <span className="ac-medal-big">{got ? <Icon size={30} strokeWidth={1.8} /> : <Lock size={24} />}</span>
              <h3>{d.title}</h3>
              <p>{d.description}</p>
              {got ? <span className="ac-medal-date">Unlocked {formatDate(day, 'short')}</span> : pr ? (
                <div className="ac-medal-prog">
                  <div className="ac-bar"><div style={{ width: `${Math.max(0, Math.min(1, pr.value / pr.goal)) * 100}%`, background: '#f5b301' }} /></div>
                  <span>{pr.label}</span>
                </div>
              ) : <span className="ac-medal-date is-locked">Locked</span>}
            </article>
          )
        })}
      </div>
    </div>
  )
}
