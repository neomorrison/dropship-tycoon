// McDoodle's Crew portal pages.
import { useMemo, useState, type ReactNode } from 'react'
import { AlarmClock, BadgeCheck, CalendarClock, ChevronDown, ChevronRight, CircleAlert, Clock, Coffee, Frown, HandHeart, IceCream, Lock, LogOut, Megaphone, PartyPopper, Receipt, Thermometer, Timer, Utensils } from 'lucide-react'
import type { GameState, JobSchedule, PayStub, Shift } from '../../../core/types'
import { formatDate, weekday, weekdayName, yearOf } from '../../../core/time'
import { portrait } from '../../../core/assets'
import { JOB_RANKS, JOB_RULES, JOB_SCHEDULES, MANAGER, PAYROLL, RANK_ORDER } from '../../../data/job'
import {
  askForJobBack, callOutSick, callOutsRemaining, currentShift, enqueueActivity, minutesUntilNextShift, nextPayday, nextShift,
  pendingShift, promotionProgress, quitJobNow, setSchedule, unpaidGross, upcomingShifts,
} from '../../../sim/life'
import { monthlyBurn, recentIncome } from '../../../sim/finance'
import { SiteLayer } from '../bank/SiteLayer'
import { nextPaycheck } from '../bank/bankData'
import { clockLabel, durationLabel, firstNameOf, hash01, relDay, run, safe, todayOf, useFlash, usd, type Flash } from '../bank/lifeCommon'

const TAKE_HOME = 1 - PAYROLL.socialSecurity - PAYROLL.medicare - PAYROLL.federal

export function employeeId(s: GameState): string {
  return `4471-${String(10000 + Math.floor(hash01(`${s.meta.saveId}:crew`) * 89999))}`
}

const shiftEnd = (sh: Shift) => clockLabel(sh.startHour + sh.hours)
const shiftSpan = (sh: Shift) => `${clockLabel(sh.startHour)} – ${shiftEnd(sh)}`

function FlashNote({ flash }: { flash: Flash | null }) {
  if (!flash) return null
  return <div className={`md-flash is-${flash.tone}`}>{flash.text}</div>
}

function Card({ title, icon, children, className, action }: { title?: ReactNode; icon?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`md-card${className ? ` ${className}` : ''}`}>
      {title && (
        <header className="md-card-head">
          {icon && <span className="md-card-icon">{icon}</span>}
          <h2>{title}</h2>
          {action && <div className="md-card-action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

function Bar({ value, max, tone }: { value: number; max: number; tone?: 'red' | 'yellow' | 'green' }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <div className="md-bar"><div className={`md-bar-fill is-${tone ?? (pct >= 1 ? 'green' : 'yellow')}`} style={{ width: `${pct * 100}%` }} /></div>
  )
}

function reliabilityLabel(r: number): { text: string; tone: 'green' | 'yellow' | 'red' } {
  if (r >= 85) return { text: 'Excellent', tone: 'green' }
  if (r >= 75) return { text: 'Good', tone: 'green' }
  if (r >= 60) return { text: 'Needs work', tone: 'yellow' }
  return { text: 'At risk', tone: 'red' }
}

function Ring({ value, label }: { value: number; label: string }) {
  const r = 30
  const c = 2 * Math.PI * r
  const tone = reliabilityLabel(value).tone
  return (
    <div className="md-ring">
      <svg viewBox="0 0 76 76" width="76" height="76" aria-hidden>
        <circle cx="38" cy="38" r={r} className="md-ring-bg" />
        <circle cx="38" cy="38" r={r} className={`md-ring-fg is-${tone}`} strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 38 38)" />
      </svg>
      <div className="md-ring-text"><b>{Math.round(value)}</b><span>{label}</span></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
const BOARD: { icon: ReactNode; text: string }[] = [
  { icon: <IceCream size={16} />, text: 'Ice cream machine is DOWN (cleaning cycle). Do not promise Doodle Swirls. I repeat: do not promise Doodle Swirls.' },
  { icon: <Utensils size={16} />, text: 'Free crew meal on every shift over 6 hours. Take your break — the fryer will still be there.' },
  { icon: <Megaphone size={16} />, text: 'Drive-thru goal this month: under 3:30 per car. Current average: 4:12. We can do better.' },
  { icon: <Coffee size={16} />, text: 'Breakfast crew: coffee urns get rinsed at 10:30 sharp before changeover.' },
  { icon: <PartyPopper size={16} />, text: 'Shout-out to Tanya for covering three call-outs this week. Legend.' },
  { icon: <BadgeCheck size={16} />, text: 'Food safety audit next month. Date-label everything, even if you think it’s obvious.' },
  { icon: <HandHeart size={16} />, text: 'Reminder: the schedule posts two weeks out and locks three days ahead. Plan your life accordingly.' },
  { icon: <Megaphone size={16} />, text: 'Whoever keeps putting the pickles in the lettuce bin: I will find you.' },
  { icon: <Timer size={16} />, text: 'Clock in on the kiosk, not on your phone app. The app "forgets" and payroll does not.' },
]

export function HomePage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const j = s.job
  const today = todayOf(s)
  const cur = safe(() => currentShift(s), null)
  const pend = safe(() => pendingShift(s), null)
  const next = safe(() => nextShift(s), null)
  const mins = safe(() => minutesUntilNextShift(s), null)
  const gross = safe(() => unpaidGross(s), 0)
  const check = nextPaycheck(s)
  const payday = check.payday
  const rel = reliabilityLabel(j.reliability)
  const week = Math.floor(today / 7)
  const board = [BOARD[week % BOARD.length], BOARD[(week * 3 + 2) % BOARD.length], BOARD[(week * 5 + 4) % BOARD.length]].filter((b, i, a) => a.indexOf(b) === i)
  const [flash, setFlash] = useFlash()
  const act = s.player.activity
  const passedOut = act?.kind === 'sleep' && !!act.payload?.forced

  const clockInNow = () => {
    const id = run(st => enqueueActivity(st, 'work_shift'))
    setFlash(id ? { tone: 'success', text: 'Clocked in. Hustle — Darnell noticed the time.' } : { tone: 'critical', text: 'Couldn’t clock in — the shift already counted as a no-show.' })
  }

  if (!j.employed) {
    return (
      <div className="md-page">
        <Card className="md-hero is-off">
          <div className="md-hero-row">
            <Frown size={34} />
            <div>
              <h1>You don't work here anymore</h1>
              <p>{j.firedDay !== null ? `Terminated ${formatDate(j.firedDay, 'md')}.` : j.quitDay !== null ? `You resigned on ${formatDate(j.quitDay, 'md')}.` : 'No active employment.'} {gross > 0 ? `Your final paycheck (${usd(gross * TAKE_HOME)} est.) arrives ${formatDate(payday, 'md')}.` : ''}</p>
            </div>
          </div>
          <button className="md-btn is-primary" onClick={() => navigate('resign')}>Ask for your job back</button>
        </Card>
        <PayStubList s={s} limit={3} />
      </div>
    )
  }

  return (
    <div className="md-page">
      <FlashNote flash={flash} />
      {cur ? (
        <Card className="md-hero is-on">
          <div className="md-hero-row">
            <span className="md-live-dot" />
            <div>
              <h1>You're on the clock</h1>
              <p>{shiftSpan(cur)} · {JOB_RANKS[j.rank].title}{cur.lateMin ? ` · clocked in ${cur.lateMin} min late` : ''}</p>
            </div>
          </div>
          {act?.kind === 'work_shift' && (
            <div className="md-hero-progress">
              <Bar value={act.durationMin - act.remainingMin} max={act.durationMin} tone="yellow" />
              <span>{durationLabel(act.remainingMin)} left · clock out {shiftEnd(cur)}</span>
            </div>
          )}
        </Card>
      ) : pend ? (
        <Card className="md-hero is-alert">
          <div className="md-hero-row">
            <AlarmClock size={34} />
            <div>
              <h1>Your {clockLabel(pend.startHour)} shift started!</h1>
              <p>
                You haven't clocked in. After {JOB_RULES.missAfterMin} minutes it's a no-show and a strike.
                {act ? ` You're currently: ${act.label.toLowerCase()}.` : ''}
              </p>
            </div>
          </div>
          <button className="md-btn is-primary" disabled={passedOut} onClick={clockInNow}>{passedOut ? 'You’re passed out' : act ? `Stop ${act.label.toLowerCase()} & clock in` : 'Clock in now'}</button>
        </Card>
      ) : next ? (
        <Card className="md-hero">
          <div className="md-hero-row">
            <CalendarClock size={34} />
            <div>
              <span className="md-eyebrow">Next shift</span>
              <h1>{relDay(next.day, today) === 'Today' ? 'Today' : relDay(next.day, today) === 'Tomorrow' ? 'Tomorrow' : weekdayName(next.day, true)}, {shiftSpan(next)}</h1>
              <p>{formatDate(next.day, 'long')} · starts in {durationLabel(mins ?? 0)}. You'll head out automatically when it's time.</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="md-hero">
          <div className="md-hero-row"><CalendarClock size={34} /><div><h1>No shifts posted</h1><p>New shifts post two weeks out.</p></div></div>
        </Card>
      )}

      <div className="md-stats">
        <div className="md-stat">
          <span className="md-stat-label">Position</span>
          <b>{JOB_RANKS[j.rank].title}</b>
          <span className="md-stat-sub">{usd(j.hourlyWage)}/hr · {JOB_SCHEDULES[j.schedule].label}</span>
        </div>
        <div className="md-stat md-stat-ring">
          <Ring value={j.reliability} label="/ 100" />
          <div><b className={`is-${rel.tone}`}>{rel.text}</b><span className="md-stat-sub">{j.shiftsWorked} shifts worked</span></div>
        </div>
        <div className="md-stat">
          <span className="md-stat-label">Strikes</span>
          <div className="md-strikes" aria-label={`${j.strikes} of ${JOB_RULES.strikesToFire} strikes`}>
            {Array.from({ length: JOB_RULES.strikesToFire }, (_, i) => <span key={i} className={i < j.strikes ? 'is-on' : ''}>{i < j.strikes ? '✕' : ''}</span>)}
          </div>
          <span className="md-stat-sub">
            {j.strikes === 0 ? 'Clean record' : j.lastStrikeDay !== null && j.lastStrikeDay !== undefined ? `Oldest clears ${formatDate(j.lastStrikeDay + JOB_RULES.strikeExpiryDays, 'md')} if you stay clean` : `${JOB_RULES.strikesToFire} = terminated`}
          </span>
        </div>
        <button className="md-stat is-link" onClick={() => navigate('pay')}>
          <span className="md-stat-label">Next payday</span>
          <b>{formatDate(payday, 'md')}</b>
          <span className="md-stat-sub">≈ {usd(check.net)} net{check.laterGross > 0 ? ` · ${usd(check.laterGross)} more rolls into the next check` : ''}</span>
        </button>
      </div>

      <div className="md-two">
        <Card title="This week" icon={<CalendarClock size={18} />} action={<button className="md-link" onClick={() => navigate('schedule')}>Full schedule <ChevronRight size={14} /></button>}>
          <WeekStrip s={s} days={7} />
        </Card>
        <Card title="From the GM" icon={<Megaphone size={18} />}>
          <div className="md-gm">
            <Portrait id={MANAGER.portrait} name={MANAGER.name} />
            <div>
              <b>{MANAGER.name}</b>
              <span>{MANAGER.title}</span>
            </div>
          </div>
          <ul className="md-board">
            {j.strikes > 0 && <li className="is-warn"><CircleAlert size={16} /> {firstNameOf(s)}, you're at {j.strikes} strike{j.strikes === 1 ? '' : 's'}. {JOB_RULES.strikesToFire - j.strikes} more and we part ways.</li>}
            {board.map((b, i) => <li key={i}>{b.icon} {b.text}</li>)}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Portrait({ id, name }: { id: string; name: string }) {
  const [bad, setBad] = useState(false)
  return (
    <span className="md-portrait">
      {bad ? name.split(' ').map(w => w[0]).join('').slice(0, 2) : <img src={portrait(id)} alt="" onError={() => setBad(true)} />}
    </span>
  )
}

function shiftStatus(sh: Shift, today: number): { text: string; tone: string } {
  switch (sh.status) {
    case 'in_progress': return { text: 'On the clock', tone: 'live' }
    case 'worked': return { text: sh.lateMin ? `Worked · ${sh.lateMin}m late` : `Worked ${sh.hoursWorked ?? sh.hours}h`, tone: sh.lateMin ? 'warn' : 'ok' }
    case 'missed': return { text: 'No-show', tone: 'bad' }
    case 'called_out': return { text: 'Called out', tone: 'muted' }
    default: return sh.pendingSince !== undefined ? { text: 'Started — clock in!', tone: 'bad' } : { text: sh.day === today ? 'Today' : 'Scheduled', tone: 'sched' }
  }
}

function WeekStrip({ s, days }: { s: GameState; days: number }) {
  const today = todayOf(s)
  const byDay = new Map<number, Shift>()
  for (const sh of s.job.shifts) if (sh.day >= today && sh.day < today + days) byDay.set(sh.day, sh)
  return (
    <div className="md-week">
      {Array.from({ length: days }, (_, i) => {
        const d = today + i
        const sh = byDay.get(d)
        const st = sh ? shiftStatus(sh, today) : null
        return (
          <div key={d} className={`md-day${sh ? ' has-shift' : ''}${i === 0 ? ' is-today' : ''}`}>
            <span className="md-day-name">{weekdayName(d)}</span>
            <span className="md-day-num">{formatDate(d, 'md').split(' ')[1]}</span>
            {sh ? <span className={`md-day-shift is-${st?.tone}`}>{clockLabel(sh.startHour).replace(':00', '')}</span> : <span className="md-day-off">Off</span>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------
export function SchedulePage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const j = s.job
  const today = todayOf(s)
  const upcoming = safe(() => upcomingShifts(s, 14), [])
  const past = useMemo(() => j.shifts.filter(sh => sh.day < today && sh.day >= today - 14).sort((a, b) => b.day - a.day), [j.shifts, today])
  const [flash, setFlash] = useFlash(7000)
  const changed = s.flags['job.scheduleChangedDay']
  const cooldownUntil = typeof changed === 'number' ? changed + JOB_RULES.scheduleChangeCooldownDays : -1
  const locked = cooldownUntil > today
  const allowed = JOB_RANKS[j.rank].schedules
  const effective = s.flags['job.scheduleFrom']
  const [pick, setPick] = useState<JobSchedule | null>(null)

  const hoursThisWeek = useMemo(() => {
    const monday = today - weekday(today)
    return j.shifts.filter(sh => sh.day >= monday && sh.day < monday + 7 && sh.status !== 'called_out' && sh.status !== 'missed').reduce((a, sh) => a + (sh.status === 'worked' ? sh.hoursWorked ?? sh.hours : sh.hours), 0)
  }, [j.shifts, today])

  const submit = (sch: JobSchedule) => {
    run(st => setSchedule(st, sch))
    setPick(null)
    setFlash({ tone: 'success', text: `Availability change sent to Darnell: ${JOB_SCHEDULES[sch].label}. It starts ${formatDate(today + JOB_RULES.scheduleNoticeDays, 'md')}.` })
  }

  if (!j.employed) {
    return (
      <div className="md-page">
        <Card title="Schedule" icon={<CalendarClock size={18} />}>
          <p className="md-muted">You're not on the schedule. <button className="md-link" onClick={() => navigate('resign')}>Ask for your job back</button></p>
        </Card>
      </div>
    )
  }

  // 14 calendar days, shifts or "off"
  const byDay = new Map<number, Shift>()
  for (const sh of upcoming) byDay.set(sh.day, sh)

  return (
    <div className="md-page">
      <FlashNote flash={flash} />
      <div className="md-two is-wide-left">
        <Card title="Next 14 days" icon={<CalendarClock size={18} />} action={<span className="md-chip">{hoursThisWeek}h this week</span>}>
          <ul className="md-sched">
            {Array.from({ length: 14 }, (_, i) => {
              const d = today + i
              const sh = byDay.get(d)
              const st = sh ? shiftStatus(sh, today) : null
              return (
                <li key={d} className={`${sh ? '' : 'is-off'}${i === 0 ? ' is-today' : ''}`}>
                  <span className="md-sched-date"><b>{weekdayName(d)}</b>{formatDate(d, 'md')}</span>
                  {sh ? (
                    <>
                      <span className="md-sched-time">{shiftSpan(sh)}<small>{sh.hours}h · {JOB_RANKS[j.rank].title}</small></span>
                      <span className={`md-status is-${st?.tone}`}>{st?.text}</span>
                    </>
                  ) : (
                    <span className="md-sched-off">Day off</span>
                  )}
                </li>
              )
            })}
          </ul>
          {typeof effective === 'number' && effective > today && (
            <p className="md-note"><Lock size={14} /> Your new availability ({JOB_SCHEDULES[j.schedule].label}) takes effect {formatDate(effective, 'md')}. Shifts before that were already posted.</p>
          )}
        </Card>

        <div className="md-col">
          <Card title="Change availability" icon={<Clock size={18} />}>
            <p className="md-muted md-small">
              Changes start {JOB_RULES.scheduleNoticeDays} days out (the posted schedule is locked) and you can change once every {JOB_RULES.scheduleChangeCooldownDays} days.
              {locked ? ` Next change allowed ${formatDate(cooldownUntil, 'md')}.` : ''}
            </p>
            <div className="md-options">
              {(['part', 'full', 'weekends'] as JobSchedule[]).map(id => {
                const def = JOB_SCHEDULES[id]
                const isCur = j.schedule === id
                const ok = allowed.includes(id)
                const weekly = def.weeklyHours * j.hourlyWage
                return (
                  <div key={id} className={`md-option${isCur ? ' is-current' : ''}${!ok ? ' is-disabled' : ''}`}>
                    <div className="md-option-head">
                      <b>{def.label}</b>
                      {isCur && <span className="md-chip is-red">Current</span>}
                    </div>
                    <span className="md-option-desc">{def.description}</span>
                    <span className="md-option-pitch">{def.pitch}</span>
                    <span className="md-option-pay">{def.weeklyHours}h/week · ≈ {usd(weekly * TAKE_HOME, false)} take-home/week</span>
                    {!isCur && (
                      <button className="md-btn is-small" disabled={!ok || locked} onClick={() => setPick(id)}>
                        {!ok ? 'Managers are full-time only' : locked ? 'Locked' : 'Request this'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
          <Card title="Past 2 weeks" icon={<BadgeCheck size={18} />}>
            {past.length === 0 ? <p className="md-muted">No shifts yet.</p> : (
              <ul className="md-history">
                {past.map(sh => {
                  const st = shiftStatus(sh, today)
                  return (
                    <li key={`${sh.day}-${sh.startHour}`}>
                      <span>{weekdayName(sh.day)} {formatDate(sh.day, 'md')}</span>
                      <span className={`md-status is-${st.tone}`}>{st.text}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {pick && (
        <SiteLayer className="md-layer" onClose={() => setPick(null)} pauseKey="md-schedule">
          <div className="md-dialog" role="dialog" aria-modal>
            <h3>Switch to {JOB_SCHEDULES[pick].label}?</h3>
            <p>{JOB_SCHEDULES[pick].description}. Starts {formatDate(today + JOB_RULES.scheduleNoticeDays, 'long')}; shifts already posted before then stay.</p>
            <p className="md-muted">Weekly hours {JOB_SCHEDULES[j.schedule].weeklyHours} → {JOB_SCHEDULES[pick].weeklyHours}. Take-home ≈ {usd(JOB_SCHEDULES[j.schedule].weeklyHours * j.hourlyWage * TAKE_HOME, false)} → {usd(JOB_SCHEDULES[pick].weeklyHours * j.hourlyWage * TAKE_HOME, false)} per week.</p>
            <div className="md-dialog-actions">
              <button className="md-btn is-ghost" onClick={() => setPick(null)}>Cancel</button>
              <button className="md-btn is-primary" onClick={() => submit(pick)}>Send to Darnell</button>
            </div>
          </div>
        </SiteLayer>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pay
// ---------------------------------------------------------------------------
export function PayPage({ s }: { s: GameState }) {
  const today = todayOf(s)
  const check = nextPaycheck(s)
  const payday = check.payday
  const stubs = s.job.payStubs ?? []
  const ytd = stubs.filter(p => yearOf(p.payDay) === yearOf(today))
  const ytdGross = ytd.reduce((a, p) => a + p.gross, 0)
  const ytdNet = ytd.reduce((a, p) => a + p.net, 0)
  return (
    <div className="md-page">
      <div className="md-two">
        <Card title="Next paycheck" icon={<CalendarClock size={18} />}>
          <div className="md-bigpay">
            <span className="md-muted">{weekdayName(payday, true)}, {formatDate(payday, 'md')} · {relDay(payday, today)}</span>
            <b>{usd(check.net)}</b>
            <span className="md-muted">estimated net · {check.hours.toFixed(2)} hours worked through {formatDate(check.periodEnd, 'md')} · {usd(check.gross)} gross</span>
            {check.laterGross > 0 && <span className="md-muted">+ {check.laterHours.toFixed(2)} hours after the cutoff ({usd(check.laterGross)} gross) go on the following check.</span>}
          </div>
          <p className="md-note">Paid every other Friday by direct deposit to your Chaise checking. Each check covers hours through the Sunday before payday; hours after that roll into the next check.</p>
        </Card>
        <Card title="Year to date" icon={<BadgeCheck size={18} />}>
          <div className="md-ytd">
            <div><span>Gross</span><b>{usd(ytdGross)}</b></div>
            <div><span>Taxes withheld</span><b>{usd(ytdGross - ytdNet)}</b></div>
            <div><span>Net deposited</span><b>{usd(ytdNet)}</b></div>
          </div>
        </Card>
      </div>
      <PayStubList s={s} />
    </div>
  )
}

function PayStubList({ s, limit }: { s: GameState; limit?: number }) {
  const stubs = [...(s.job.payStubs ?? [])].reverse()
  const shown = limit ? stubs.slice(0, limit) : stubs
  const [open, setOpen] = useState<string | null>(null)
  return (
    <Card title="Pay stubs" icon={<Receipt size={18} />}>
      {shown.length === 0 ? (
        <p className="md-muted">Your first pay stub arrives on your first payday ({formatDate(PAYROLL.firstPayday, 'md')}).</p>
      ) : (
        <ul className="md-stubs">
          {shown.map(p => (
            <li key={p.id} className={open === p.id ? 'is-open' : ''}>
              <button className="md-stub-row" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                <span className="md-stub-date"><b>{formatDate(p.payDay, 'md')}</b>{formatDate(p.periodStart, 'md')} – {formatDate(p.periodEnd, 'md')}</span>
                <span className="md-stub-hours">{p.hours.toFixed(2)} h</span>
                <span className="md-stub-net">{usd(p.net)}</span>
                <ChevronDown size={16} className="md-stub-chev" />
              </button>
              {open === p.id && <StubDetail s={s} p={p} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function StubDetail({ s, p }: { s: GameState; p: PayStub }) {
  const year = yearOf(p.payDay)
  const ytd = (s.job.payStubs ?? []).filter(x => yearOf(x.payDay) === year && x.payDay <= p.payDay)
  const sum = (k: keyof PayStub) => ytd.reduce((a, x) => a + Number(x[k]), 0)
  return (
    <div className="md-stub">
      <div className="md-stub-top">
        <div>
          <b>McDoodle's Restaurants, LLC</b>
          <span>{MANAGER.store}</span>
        </div>
        <div className="r">
          <b>{s.player.name || s.meta.playerName}</b>
          <span>Employee ID {employeeId(s)}</span>
        </div>
      </div>
      <table>
        <thead><tr><th>Earnings</th><th className="r">Rate</th><th className="r">Hours</th><th className="r">This period</th><th className="r">YTD</th></tr></thead>
        <tbody>
          <tr><td>Regular</td><td className="r">{usd(p.rate)}</td><td className="r">{p.hours.toFixed(2)}</td><td className="r">{usd(p.gross)}</td><td className="r">{usd(sum('gross'))}</td></tr>
        </tbody>
        <thead><tr><th>Deductions</th><th /><th /><th /><th /></tr></thead>
        <tbody>
          <tr><td>Social Security ({(PAYROLL.socialSecurity * 100).toFixed(1)}%)</td><td /><td /><td className="r">-{usd(p.socialSecurity)}</td><td className="r">-{usd(sum('socialSecurity'))}</td></tr>
          <tr><td>Medicare ({(PAYROLL.medicare * 100).toFixed(2)}%)</td><td /><td /><td className="r">-{usd(p.medicare)}</td><td className="r">-{usd(sum('medicare'))}</td></tr>
          <tr><td>Federal income tax</td><td /><td /><td className="r">-{usd(p.federal)}</td><td className="r">-{usd(sum('federal'))}</td></tr>
        </tbody>
        <tfoot><tr><td>Net pay</td><td /><td /><td className="r">{usd(p.net)}</td><td className="r">{usd(sum('net'))}</td></tr></tfoot>
      </table>
      <span className="md-stub-foot">Direct deposit · Chaise Total Checking · Pay date {formatDate(p.payDay, 'short')}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Career
// ---------------------------------------------------------------------------
export function CareerPage({ s }: { s: GameState }) {
  const j = s.job
  const pp = safe(() => promotionProgress(s), null)
  const idx = RANK_ORDER.indexOf(j.rank)
  const r = JOB_RULES.reliability
  return (
    <div className="md-page">
      <Card title="Career path" icon={<BadgeCheck size={18} />}>
        <ol className="md-ladder">
          {RANK_ORDER.map((id, i) => {
            const def = JOB_RANKS[id]
            const state = !j.employed ? 'future' : i < idx ? 'done' : i === idx ? 'current' : 'future'
            return (
              <li key={id} className={`is-${state}`}>
                <span className="md-ladder-dot">{state === 'done' ? '✓' : i + 1}</span>
                <div className="md-ladder-body">
                  <div className="md-ladder-head"><b>{def.title}</b><span className="md-chip">{usd(def.wage)}/hr</span>{state === 'current' && <span className="md-chip is-red">You</span>}</div>
                  <span className="md-muted md-small">{i === 0 ? 'Starting position' : `${def.shiftsRequired} shifts worked · reliability ${def.reliabilityRequired}+`}{def.schedules.length === 1 ? ' · full-time only' : ''}</span>
                  <ul className="md-perks">{def.perks.map(p => <li key={p}>{p}</li>)}</ul>
                </div>
              </li>
            )
          })}
        </ol>
      </Card>
      <div className="md-two">
        <Card title={pp?.next ? `Progress to ${pp.title}` : 'Top of the ladder'} icon={<Timer size={18} />}>
          {!j.employed ? (
            <p className="md-muted">Get rehired to keep climbing.</p>
          ) : pp?.next ? (
            <div className="md-progress">
              <div><span>Shifts worked</span><b>{pp.shifts} / {pp.shiftsNeeded}</b></div>
              <Bar value={pp.shifts} max={pp.shiftsNeeded} />
              <div><span>Reliability</span><b>{Math.round(pp.reliability)} / {pp.reliabilityNeeded}</b></div>
              <Bar value={pp.reliability} max={pp.reliabilityNeeded} tone={pp.reliability >= pp.reliabilityNeeded ? 'green' : pp.reliability < 60 ? 'red' : 'yellow'} />
              <p className="md-note">
                {pp.next === 'shift_lead' ? 'Shift Lead promotions happen automatically once you qualify.' : 'Darnell offers the Manager job in person once you qualify. It comes with the full-time schedule.'}
                {pp.ready ? ' You qualify now!' : ''}
              </p>
            </div>
          ) : (
            <p className="md-muted">You're the Manager. There's nowhere left to climb here except out.</p>
          )}
        </Card>
        <Card title="How reliability works" icon={<AlarmClock size={18} />}>
          <ul className="md-rules">
            <li><span>On-time shift</span><b className="is-green">+{r.onTime}</b></li>
            <li><span>Late clock-in</span><b className="is-yellow">{r.late}</b></li>
            <li><span>More than {JOB_RULES.veryLateMin} min late</span><b className="is-red">{r.veryLate}</b></li>
            <li><span>No-show</span><b className="is-red">{r.missed}</b></li>
            <li><span>Call-out (first {JOB_RULES.freeCallOuts} per 30 days)</span><b className="is-yellow">{r.calloutFree}</b></li>
            <li><span>Extra call-out (also a strike)</span><b className="is-red">{r.calloutStrike}</b></li>
          </ul>
          <p className="md-note">Every {JOB_RULES.tardiesPerStrike}rd late clock-in is a strike. {JOB_RULES.strikesToFire} strikes and you're let go; a strike falls off after {JOB_RULES.strikeExpiryDays} clean days. Late clock-ins so far: {j.lateCount ?? 0}.</p>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Call out
// ---------------------------------------------------------------------------
export function TimeOffPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const today = todayOf(s)
  const j = s.job
  const now = s.time.hour
  const pend = safe(() => pendingShift(s), null)
  const cur = safe(() => currentShift(s), null)
  const target = pend ?? j.shifts.find(sh => sh.status === 'scheduled' && sh.day * 24 + sh.startHour >= now && sh.day * 24 + sh.startHour - now <= 24) ?? null
  const left = safe(() => callOutsRemaining(s), 0)
  const sick = s.player.sickDays > 0
  const [confirm, setConfirm] = useState(false)
  const [flash, setFlash] = useFlash(7000)
  const recent = (j.callOutDays ?? []).filter(d => today - d < 30).sort((a, b) => b - a)

  const callOut = () => {
    setConfirm(false)
    run(st => callOutSick(st))
    setFlash({ tone: 'info', text: 'Call-out logged. Darnell will find coverage.' })
  }

  if (!j.employed) {
    return (
      <div className="md-page">
        <Card title="Call out sick" icon={<Thermometer size={18} />}><p className="md-muted">You're not on the schedule. <button className="md-link" onClick={() => navigate('resign')}>Ask for your job back</button></p></Card>
      </div>
    )
  }

  const consequence = sick ? 'You’re sick, so this call-out is excused: no strike.' : left > 0 ? `This uses 1 of your ${left} remaining free call-out${left === 1 ? '' : 's'} (reliability ${JOB_RULES.reliability.calloutFree}).` : `You're out of free call-outs. This one is a strike and ${JOB_RULES.reliability.calloutStrike} reliability.`

  return (
    <div className="md-page">
      <FlashNote flash={flash} />
      <div className="md-two">
        <Card title="Call out sick" icon={<Thermometer size={18} />}>
          {cur ? (
            <p className="md-muted">You're on the clock right now. Finish the shift — you can't call out of a shift you're working.</p>
          ) : target ? (
            <>
              <div className="md-target">
                <span className="md-eyebrow">{pend ? 'Started — you haven’t clocked in' : 'Your next shift'}</span>
                <b>{weekdayName(target.day, true)}, {shiftSpan(target)}</b>
                <span className="md-muted">{formatDate(target.day, 'long')}</span>
              </div>
              <p className={`md-conseq${!sick && left === 0 ? ' is-bad' : ''}`}>{consequence}</p>
              <button className="md-btn is-primary" onClick={() => setConfirm(true)}>Call out of this shift</button>
            </>
          ) : (
            <p className="md-muted">You can only call out of a shift that starts in the next 24 hours. Nothing to call out of right now.</p>
          )}
        </Card>
        <Card title="Call-out policy" icon={<CircleAlert size={18} />}>
          <div className="md-callouts">
            {Array.from({ length: JOB_RULES.freeCallOuts }, (_, i) => <span key={i} className={i < JOB_RULES.freeCallOuts - left ? 'is-used' : ''}>{i < JOB_RULES.freeCallOuts - left ? 'Used' : 'Free'}</span>)}
          </div>
          <p className="md-note">{JOB_RULES.freeCallOuts} free call-outs per rolling 30 days. After that, each one is a strike. If you're actually sick (the game will tell you), call-outs are excused.</p>
          {recent.length > 0 && <p className="md-muted md-small">Recent call-outs: {recent.map(d => formatDate(d, 'md')).join(', ')}</p>}
          {sick && <p className="md-conseq">🤒 You're sick for {s.player.sickDays} more day{s.player.sickDays === 1 ? '' : 's'}. Rest — working sick is slower and miserable.</p>}
        </Card>
      </div>
      {confirm && target && (
        <SiteLayer className="md-layer" onClose={() => setConfirm(false)} pauseKey="md-callout">
          <div className="md-dialog" role="dialog" aria-modal>
            <h3>Call out of your {weekdayName(target.day)} shift?</h3>
            <p>{shiftSpan(target)} · {formatDate(target.day, 'md')}</p>
            <p className={!sick && left === 0 ? 'md-conseq is-bad' : 'md-muted'}>{consequence}</p>
            <div className="md-dialog-actions">
              <button className="md-btn is-ghost" onClick={() => setConfirm(false)}>Never mind</button>
              <button className="md-btn is-primary" onClick={callOut}>Text Darnell</button>
            </div>
          </div>
        </SiteLayer>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resign / rehire
// ---------------------------------------------------------------------------
export function ResignPage({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const j = s.job
  const today = todayOf(s)
  const [ack, setAck] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [flash, setFlash] = useFlash(7000)
  const inc = safe(() => recentIncome(s, today, 30), { wages: 0, business: 0, revenue: 0, total: 0 })
  const bills = safe(() => monthlyBurn(s, b => !b.business), 0)
  const FOOD_MONTH = 360
  const monthlyNeed = bills + FOOD_MONTH
  const weeklyNet = JOB_SCHEDULES[j.schedule].weeklyHours * j.hourlyWage * TAKE_HOME
  const gross = safe(() => unpaidGross(s), 0)
  const payday = safe(() => nextPayday(s), today)

  if (!j.employed) {
    const cooldown = j.firedDay !== null ? j.firedDay + JOB_RULES.rehireCooldownDays : null
    const waiting = cooldown !== null && cooldown > today
    const maxed = j.timesRehired >= JOB_RULES.maxRehires
    const ask = () => {
      const ok = run(st => askForJobBack(st))
      if (!ok) setFlash({ tone: 'warning', text: maxed ? 'Darnell won’t take you back again.' : 'Darnell isn’t ready to talk yet.' })
    }
    return (
      <div className="md-page">
        <FlashNote flash={flash} />
        <Card title="Ask for your job back" icon={<HandHeart size={18} />}>
          <div className="md-gm">
            <Portrait id={MANAGER.portrait} name={MANAGER.name} />
            <div><b>{MANAGER.name}</b><span>{MANAGER.title}</span></div>
          </div>
          <p>{j.firedDay !== null ? `You were let go on ${formatDate(j.firedDay, 'md')}.` : j.quitDay !== null ? `You quit on ${formatDate(j.quitDay, 'md')}.` : ''} Coming back means starting over as Crew Member ({usd(JOB_RANKS.crew.wage)}/hr, part-time) with reliability {JOB_RULES.rehireReliability}.</p>
          <ul className="md-rules">
            <li><span>Times rehired</span><b>{j.timesRehired} / {JOB_RULES.maxRehires}</b></li>
            {j.firedDay !== null && <li><span>Cool-off after being fired</span><b>{JOB_RULES.rehireCooldownDays} days</b></li>}
          </ul>
          {maxed ? <p className="md-conseq is-bad">Darnell has already rehired you {JOB_RULES.maxRehires} times. He won't do it again.</p>
            : waiting ? <p className="md-conseq">Darnell will talk to you after {formatDate(cooldown as number, 'md')}.</p> : null}
          <button className="md-btn is-primary" disabled={maxed || waiting} onClick={ask}>Walk in and ask Darnell</button>
          {gross > 0 && <p className="md-note">Your final paycheck for {usd(gross)} gross arrives {formatDate(payday, 'md')}.</p>}
        </Card>
      </div>
    )
  }

  const covered = inc.business >= monthlyNeed
  return (
    <div className="md-page">
      <Card title="Resignation" icon={<LogOut size={18} />}>
        <p>Quitting is immediate: your remaining shifts are dropped and hours you've already worked are paid on {formatDate(payday, 'md')} ({usd(gross)} gross so far).</p>
        <div className="md-compare">
          <div>
            <span>You give up</span>
            <b>{usd(weeklyNet, false)}/week</b>
            <small>≈ {usd(weeklyNet * 52 / 12, false)}/month take-home</small>
          </div>
          <div className={covered ? 'is-good' : 'is-bad'}>
            <span>Your store, last 30 days</span>
            <b>{usd(inc.business, false)}</b>
            <small>operating profit · {usd(inc.revenue, false)} sales</small>
          </div>
          <div>
            <span>Your monthly fixed costs</span>
            <b>{usd(monthlyNeed, false)}</b>
            <small>rent & bills + ~{usd(FOOD_MONTH, false)} food</small>
          </div>
        </div>
        <p className={`md-conseq${covered ? '' : ' is-bad'}`}>
          {covered
            ? 'Your store profit covers your fixed costs. Rule of thumb: quit once it has done that for 3 months in a row and you have a cash buffer for ad billing.'
            : 'Your store doesn’t cover your fixed costs yet. Most people who quit now end up financing ads on a 28% APR card.'}
        </p>
        <label className="md-check">
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
          <span>I understand quitting is immediate and I lose my paycheck.</span>
        </label>
        <div className="md-row-actions">
          <button className="md-btn is-ghost" onClick={() => navigate('')}>Keep my job</button>
          <button className="md-btn is-danger" disabled={!ack} onClick={() => setConfirm(true)}>Submit resignation</button>
        </div>
      </Card>
      {confirm && (
        <SiteLayer className="md-layer" onClose={() => setConfirm(false)} pauseKey="md-resign">
          <div className="md-dialog" role="dialog" aria-modal>
            <h3>Hand in your visor?</h3>
            <p>This can't be undone from the portal. Getting rehired later means starting over as crew with a humbling conversation.</p>
            <div className="md-dialog-actions">
              <button className="md-btn is-ghost" onClick={() => setConfirm(false)}>Stay</button>
              <button className="md-btn is-danger" onClick={() => { setConfirm(false); run(st => quitJobNow(st)); navigate('') }}>Quit McDoodle's</button>
            </div>
          </div>
        </SiteLayer>
      )}
    </div>
  )
}

