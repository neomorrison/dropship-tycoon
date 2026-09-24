// McDoodle's Crew — employee self-service portal. OWNER: ui-life-sites. Class prefix: md-
// Routes: '' home | 'schedule' | 'pay' | 'career' | 'timeoff' | 'resign' (quit when employed, rehire when not)
import type { ReactNode } from 'react'
import { CalendarDays, DollarSign, House, LogOut, Medal, Thermometer } from 'lucide-react'
import type { SiteProps } from '../types'
import { JOB_RANKS, MANAGER } from '../../../data/job'
import { segs, useWorld } from '../bank/lifeCommon'
import { CareerPage, HomePage, PayPage, ResignPage, SchedulePage, TimeOffPage, employeeId } from './pages'
import './mcdoodles.css'

const TABS: { id: string; label: string; icon: ReactNode }[] = [
  { id: '', label: 'Home', icon: <House size={17} /> },
  { id: 'schedule', label: 'Schedule', icon: <CalendarDays size={17} /> },
  { id: 'pay', label: 'Pay', icon: <DollarSign size={17} /> },
  { id: 'career', label: 'Career', icon: <Medal size={17} /> },
  { id: 'timeoff', label: 'Call out', icon: <Thermometer size={17} /> },
  { id: 'resign', label: 'Resign', icon: <LogOut size={17} /> },
]

export default function McDoodlesCrew({ path, navigate, compact }: SiteProps) {
  const s = useWorld()
  const [root] = segs(path)
  const page = TABS.some(t => t.id === (root ?? '')) ? root ?? '' : ''
  const employed = s.job.employed
  const tabs = TABS.map(t => (t.id === 'resign' && !employed ? { ...t, label: 'Rehire' } : t))

  let body: ReactNode
  switch (page) {
    case 'schedule': body = <SchedulePage s={s} navigate={navigate} />; break
    case 'pay': body = <PayPage s={s} />; break
    case 'career': body = <CareerPage s={s} />; break
    case 'timeoff': body = <TimeOffPage s={s} navigate={navigate} />; break
    case 'resign': body = <ResignPage s={s} navigate={navigate} />; break
    default: body = <HomePage s={s} navigate={navigate} />
  }

  return (
    <div className={`md-root${compact ? ' is-compact' : ''}`}>
      <header className="md-header">
        <div className="md-header-in">
          <button className="md-logo" onClick={() => navigate('')} aria-label="McDoodle's Crew home">
            <FriesMark />
            <span className="md-logo-text">McDoodle's</span>
            <span className="md-crew-pill">Crew</span>
          </button>
          <div className="md-who">
            <span className="md-who-name">{s.player.name || s.meta.playerName}</span>
            <span className="md-who-sub">
              {employed ? `${JOB_RANKS[s.job.rank].title} · ID ${employeeId(s)}` : 'Former crew member'} · {MANAGER.store.split(' — ')[0]}
            </span>
          </div>
        </div>
        <nav className="md-tabs" aria-label="Crew portal">
          {tabs.map(t => (
            <button key={t.id || 'home'} className={`md-tab${page === t.id ? ' is-active' : ''}${t.id === 'resign' ? ' is-danger' : ''}`} onClick={() => navigate(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <main className="md-main">{body}</main>
      <footer className="md-footer">
        McDoodle's Crew Portal · {MANAGER.store} · Questions about pay? Ask your General Manager. · © 2026 McDoodle's Restaurants, LLC
      </footer>
    </div>
  )
}

export function FriesMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="md-mark">
      <rect x="11" y="4" width="4" height="18" rx="1.6" transform="rotate(-10 13 13)" fill="#ffc72c" />
      <rect x="17.5" y="2" width="4" height="20" rx="1.6" fill="#ffd95a" />
      <rect x="24" y="4" width="4" height="18" rx="1.6" transform="rotate(9 26 13)" fill="#ffc72c" />
      <rect x="14" y="6" width="3.4" height="15" rx="1.5" transform="rotate(-4 15 13)" fill="#f5b400" />
      <rect x="21.6" y="5" width="3.4" height="16" rx="1.5" transform="rotate(5 23 13)" fill="#f5b400" />
      <path d="M7 17h26l-3.2 19.2a2 2 0 0 1-2 1.8H12.2a2 2 0 0 1-2-1.8z" fill="#fff" />
      <path d="M9 19h22l-2.8 16.6a1.6 1.6 0 0 1-1.6 1.4H13.4a1.6 1.6 0 0 1-1.6-1.4z" fill="#c8102e" />
      <path d="M14.5 26.5c1.6 2.4 3.5 3.5 5.5 3.5s3.9-1.1 5.5-3.5" stroke="#ffc72c" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  )
}
