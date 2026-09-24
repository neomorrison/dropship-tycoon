// Right-hand panel: current activity, queue, quick actions, work schedule, autopilot.
import { useMemo } from 'react'
import clsx from 'clsx'
import { ArrowUpRight, Bot, Briefcase, CalendarClock, Laptop, ListOrdered, Smartphone, Sparkles, X } from 'lucide-react'
import type { ActivityKind, GameState, SiteId } from '../../core/types'
import { act, useGame, useGS } from '../../core/store'
import { openSite, useUI } from '../../core/ui'
import { hourOfDay, weekdayName } from '../../core/time'
import { money } from '../../core/format'
import { sfx } from '../audio'
import { ACTIVITY_META, LIFE_QUICK, activityInfo } from './activityMeta'
import { checkActivity, doActivity, cancelAct, setComputerOpen } from './actions'
import { Switch, ProgressBar, fmtMinutes, fmtUntil, nextShift, shiftStart, shiftEnd, clockOf } from './common'
import { isAutopilot, setAutopilot } from '../../sim/life'

export default function SidePanel() {
  return (
    <aside className="sh-panel" aria-label="Activities">
      <ComputerCta />
      <NowCard />
      <QueueCard />
      <QuickActions />
      <WorkCard />
      <AutopilotCard />
    </aside>
  )
}

// ---------------------------------------------------------------------------
function ComputerCta() {
  const location = useGS(s => s.player.location)
  const storeName = useGS(s => (s.store.created ? s.store.name : ''))
  const away = location !== 'home'
  return (
    <button type="button" className="sh-panel-cta" onClick={() => setComputerOpen(true)}>
      <span className="sh-panel-cta-icon">{away ? <Smartphone size={20} /> : <Laptop size={20} />}</span>
      <span className="sh-panel-cta-text">
        <b>{away ? 'Check your phone' : 'Use your computer'}</b>
        <small>{storeName ? `${storeName} · ads · suppliers · email` : 'Start a store, find products, run ads'}</small>
      </span>
      <ArrowUpRight size={18} className="sh-panel-cta-go" />
    </button>
  )
}

// ---------------------------------------------------------------------------
function NowCard() {
  const activity = useGS(s => s.player.activity)
  const location = useGS(s => s.player.location)
  const energy = useGS(s => s.player.energy)
  const hunger = useGS(s => s.player.hunger)
  const mood = useGS(s => s.player.mood)
  const hour = useGS(s => s.time.hour)
  const frac = useUI(u => Math.floor(u.hourFrac * 20) / 20)

  if (!activity) {
    const h = hourOfDay(hour)
    const hints: string[] = []
    if (hunger < 30) hints.push("You're hungry — grab food before it hits your mood.")
    if (energy < 25) hints.push("You're running on fumes. A nap or bed will fix it.")
    else if (h >= 23 || h < 5) hints.push("It's late. Sleep now and you'll wake up rested.")
    if (mood < 35) hints.push('Mood is low. See friends, hit the gym, or relax.')
    return (
      <section className="sh-card sh-now is-idle">
        <div className="sh-card-kicker">Right now</div>
        <div className="sh-now-row">
          <span className="sh-now-emoji">{location === 'home' ? '🛋️' : '🚶'}</span>
          <div className="sh-now-text">
            <b>Free time</b>
            <span>{hints[0] ?? 'Pick something to do: open the computer, or click around your room.'}</span>
          </div>
        </div>
      </section>
    )
  }

  const meta = ACTIVITY_META[activity.kind]
  const info = activityInfo(activity.kind)
  // smooth between hourly ticks: the fraction of the hour already elapsed is progress the next tick will book
  const remaining = Math.max(activity.remainingMin > 0 ? 1 : 0, activity.remainingMin - frac * 60)
  const progress = activity.durationMin > 0 ? 1 - remaining / activity.durationMin : 0
  const cancellable = activity.kind !== 'work_shift'
  return (
    <section className={clsx('sh-card sh-now', `is-${meta?.group ?? 'life'}`)}>
      <div className="sh-card-kicker">
        Right now
        {activity.kind === 'sleep' && <span className="sh-chip-mini">4× speed</span>}
      </div>
      <div className="sh-now-row">
        <span className="sh-now-emoji is-busy">{meta?.emoji ?? '⏳'}</span>
        <div className="sh-now-text">
          <b>{activity.label || info.label}</b>
          <span>{meta?.doing ?? info.description}</span>
        </div>
        {cancellable && (
          <button type="button" className="sh-icon-btn" onClick={() => cancelAct(activity.id)} title={activity.kind === 'sleep' ? 'Wake up' : 'Stop'} aria-label="Stop activity">
            <X size={15} />
          </button>
        )}
      </div>
      <ProgressBar value={progress} tone={meta?.group === 'business' ? 'blue' : meta?.group === 'work' ? 'amber' : 'mint'} />
      <div className="sh-now-foot">
        <span>{fmtMinutes(remaining)} left</span>
        <span>{Math.round(progress * 100)}%</span>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
function QueueCard() {
  const queue = useGS(s => s.player.queue)
  if (!queue.length) return null
  const total = queue.reduce((a, q) => a + q.remainingMin, 0)
  return (
    <section className="sh-card sh-queue">
      <div className="sh-card-kicker">
        <ListOrdered size={13} /> Up next
        <span className="sh-card-kicker-right">{fmtMinutes(total)}</span>
      </div>
      <ol className="sh-queue-list">
        {queue.map((q, i) => (
          <li key={q.id} className="sh-queue-item" style={{ animationDelay: `${i * 30}ms` }}>
            <span className="sh-queue-emoji">{ACTIVITY_META[q.kind]?.emoji ?? '•'}</span>
            <span className="sh-queue-label">{q.label || activityInfo(q.kind).label}</span>
            <span className="sh-queue-dur">{fmtMinutes(q.remainingMin)}</span>
            <button type="button" className="sh-icon-btn is-sm" onClick={() => cancelAct(q.id)} aria-label={`Cancel ${q.label}`} title="Cancel">
              <X size={13} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------------------
interface QuickItem {
  key: string
  emoji: string
  label: string
  /** full name for tooltips */
  title?: string
  meta: string
  disabled?: boolean
  reason?: string
  badge?: number
  tone?: 'alert'
  opensApp?: boolean
  run: () => void
}

/** compact labels for the 4-up life grid */
const SHORT_LABEL: Partial<Record<ActivityKind, string>> = {
  eat_home: 'Cook', eat_takeout: 'Takeout', nap: 'Nap', sleep: 'Sleep', shower: 'Shower', relax: 'Relax', gym: 'Gym', socialize: 'Friends',
}

function lifeItem(s: GameState, kind: ActivityKind): QuickItem {
  const info = activityInfo(kind)
  const chk = checkActivity(s, kind)
  return {
    key: kind,
    emoji: info.emoji,
    label: SHORT_LABEL[kind] ?? ACTIVITY_META[kind].label,
    title: info.label,
    meta: [fmtMinutes(info.minutes), info.cost ? money(info.cost, { cents: false }) : null].filter(Boolean).join(' · '),
    disabled: !chk.ok,
    reason: chk.reason,
    run: () => doActivity(kind),
  }
}

function appItem(kind: ActivityKind, site: SiteId, path: string, label: string, extra?: Partial<QuickItem>): QuickItem {
  const info = activityInfo(kind)
  return {
    key: kind,
    emoji: info.emoji,
    label,
    meta: fmtMinutes(info.minutes),
    opensApp: true,
    run: () => {
      openSite(site, path)
      sfx.click()
    },
    ...extra,
  }
}

function QuickActions() {
  // whole-state subscription: canDoActivity may look anywhere (location, cash, hour, gear…)
  const s = useGame(st => st.state)!
  const tickets = s.store.tickets
  const chargebacks = s.store.chargebacks
  const accounts = s.ads.accounts
  const openTickets = useMemo(() => tickets.filter(t => t.status === 'open').length, [tickets])
  const openDisputes = useMemo(() => chargebacks.filter(c => c.status === 'needs_response').length, [chargebacks])
  const flagged = useMemo(() => accounts.find(a => a.status === 'disabled' || a.status === 'restricted') ?? null, [accounts])

  const life = LIFE_QUICK.map(k => lifeItem(s, k))

  const business: QuickItem[] = []
  const support = lifeItem(s, 'customer_support')
  support.label = 'Answer tickets'
  support.badge = openTickets
  if (!openTickets) {
    support.disabled = true
    support.reason = s.store.created ? 'Inbox zero' : 'No store yet'
  }
  business.push(appItem('product_research', 'aliexprez', '', 'Research a product'))
  business.push(support)
  business.push(appItem('film_creative', 'studio', '', 'Make a creative'))
  business.push(appItem('post_organic', 'tiktak', '', 'Post on TikTak'))
  business.push(appItem('fight_chargeback', 'shopifly', 'disputes', 'Fight chargebacks', { badge: openDisputes, tone: openDisputes ? 'alert' : undefined, disabled: !openDisputes, reason: 'No open disputes' }))
  business.push(appItem('study', 'academy', '', 'Study'))
  if (flagged) business.push(appItem('appeal_ad_account', flagged.platform, '', `Appeal ${flagged.platform === 'fadbook' ? 'Fadbook' : 'TikTak'} account`, { tone: 'alert', badge: 1 }))

  return (
    <section className="sh-card sh-quick">
      <div className="sh-card-kicker">
        <Sparkles size={13} /> Life
      </div>
      <div className="sh-quick-grid">
        {life.map(it => (
          <QuickButton key={it.key} it={it} />
        ))}
      </div>
      <div className="sh-card-kicker is-spaced">
        <Briefcase size={13} /> Business
      </div>
      <div className="sh-quick-list">
        {business.map(it => (
          <QuickRow key={it.key} it={it} />
        ))}
      </div>
    </section>
  )
}

function QuickButton({ it }: { it: QuickItem }) {
  return (
    <button type="button" className="sh-quick-btn" disabled={it.disabled} onClick={it.run} title={it.disabled ? `${it.title ?? it.label}: ${it.reason ?? 'not available right now'}` : `${it.title ?? it.label} · ${it.meta}`}>
      <span className="sh-quick-emoji">{it.emoji}</span>
      <span className="sh-quick-label">{it.label}</span>
      <span className="sh-quick-meta">{it.disabled && it.reason ? it.reason : it.meta}</span>
    </button>
  )
}

function QuickRow({ it }: { it: QuickItem }) {
  return (
    <button type="button" className={clsx('sh-quick-row', it.tone === 'alert' && 'is-alert')} disabled={it.disabled} onClick={it.run} title={it.disabled ? it.reason : undefined}>
      <span className="sh-quick-emoji">{it.emoji}</span>
      <span className="sh-quick-row-label">{it.label}</span>
      {!!it.badge && <span className={clsx('sh-count', it.tone === 'alert' && 'is-alert')}>{it.badge}</span>}
      <span className="sh-quick-meta">{it.disabled && it.reason ? it.reason : it.meta}</span>
      {it.opensApp && !it.disabled && <ArrowUpRight size={14} className="sh-quick-go" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
function WorkCard() {
  const job = useGS(s => s.job)
  const hour = useGS(s => s.time.hour)
  const frac = useUI(u => Math.floor(u.hourFrac * 6) / 6)
  const sh = useMemo(() => nextShift(job, hour), [job, hour])
  const rank = job.rank === 'shift_lead' ? 'Shift lead' : job.rank === 'manager' ? 'Manager' : 'Crew member'

  if (!job.employed) {
    const fired = job.firedDay !== null && (job.quitDay === null || job.firedDay >= job.quitDay)
    return (
      <section className="sh-card sh-work">
        <div className="sh-card-kicker">
          <CalendarClock size={13} /> Work
        </div>
        <div className="sh-work-row">
          <span className="sh-work-big">{fired ? 'Fired from McDoodle’s' : job.quitDay !== null ? 'You quit McDoodle’s' : 'Unemployed'}</span>
          <span className="sh-work-sub">{fired ? 'Three strikes. No paycheck until you ask for your job back.' : job.quitDay !== null ? 'Full-time founder. The store pays the bills now.' : 'No paycheck coming in. Ask for your job back if cash gets tight.'}</span>
        </div>
        <button type="button" className="sh-link-btn" onClick={() => openSite('mcdoodles')}>
          McDoodle's Crew portal <ArrowUpRight size={13} />
        </button>
      </section>
    )
  }

  let when = 'Nothing scheduled'
  let detail = ''
  let live = false
  let progress = 0
  if (sh) {
    const start = shiftStart(sh)
    const end = shiftEnd(sh)
    const now = hour + frac
    live = sh.status === 'in_progress' || (now >= start && now < end)
    if (live) {
      when = `On shift until ${clockOf(sh.startHour + sh.hours)}`
      progress = (now - start) / Math.max(1, sh.hours)
      detail = `${fmtUntil(end - now).replace('in ', '')} to go`
    } else {
      const d = sh.day - Math.floor(hour / 24)
      const dayLabel = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : weekdayName(sh.day)
      when = `${dayLabel} ${clockOf(sh.startHour)}–${clockOf(sh.startHour + sh.hours)}`
      detail = `Starts ${fmtUntil(start - now)}`
    }
  }
  return (
    <section className={clsx('sh-card sh-work', live && 'is-live')}>
      <div className="sh-card-kicker">
        <CalendarClock size={13} /> Next shift
        <span className="sh-card-kicker-right">
          {rank} · {money(job.hourlyWage)}/h
        </span>
      </div>
      <div className="sh-work-row">
        <span className="sh-work-big">{when}</span>
        {detail && <span className="sh-work-sub">{detail}</span>}
      </div>
      {live && <ProgressBar value={progress} tone="amber" />}
      <div className="sh-work-stats">
        <span title="Three strikes and you're fired">
          Strikes{' '}
          <b className={clsx(job.strikes >= 2 && 'is-bad')}>
            {job.strikes}/3
          </b>
        </span>
        <span title="Reliability drives promotions">
          Reliability <b>{Math.round(job.reliability)}</b>
        </span>
        <button type="button" className="sh-link-btn" onClick={() => openSite('mcdoodles')}>
          Schedule <ArrowUpRight size={13} />
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
function AutopilotCard() {
  const on = useGS(s => isAutopilot(s))
  return (
    <section className={clsx('sh-card sh-auto', on && 'is-on')}>
      <span className="sh-auto-icon">
        <Bot size={18} />
      </span>
      <div className="sh-auto-text">
        <b>Autopilot {on ? 'on' : 'off'}</b>
        <span>{on ? 'Eats, sleeps and shows up to shifts when you’re idle.' : 'You handle food, sleep and shifts yourself.'}</span>
      </div>
      <Switch
        checked={on}
        onChange={v => {
          act(st => setAutopilot(st, v))
          sfx.click()
        }}
        label="Autopilot"
      />
    </section>
  )
}
