// Chaise Bank — online banking (Chase parody). OWNER: ui-life-sites. Class prefix: bk-
// Routes: '' overview | 'card' | 'activity[/bank|card]' | 'pnl' | 'bills' | 'taxes' | 'offers'
import type { ReactNode } from 'react'
import { Bell, LockKeyhole, LogOut, Menu } from 'lucide-react'
import type { SiteProps } from '../types'
import { hourOfDay, yearOf } from '../../../core/time'
import { firstNameOf, segs, todayOf, useWorld } from './lifeCommon'
import { Overview } from './Overview'
import { CardPage } from './CardPage'
import { ActivityPage } from './Activity'
import { PnlPage } from './Pnl'
import { BillsPage } from './Bills'
import { TaxesPage } from './Taxes'
import { OffersPage } from './Offers'
import { alertsFor } from './bankData'
import './bank.css'

const NAV: { id: string; label: string }[] = [
  { id: '', label: 'Accounts' },
  { id: 'card', label: 'Pay card' },
  { id: 'activity', label: 'Activity' },
  { id: 'bills', label: 'Bills & autopay' },
  { id: 'pnl', label: 'Business P&L' },
  { id: 'taxes', label: 'Taxes' },
  { id: 'offers', label: 'Offers' },
]

export default function ChaiseBank({ path, navigate, compact }: SiteProps) {
  const s = useWorld()
  const [root, sub] = segs(path)
  const page = NAV.some(n => n.id === (root ?? '')) ? root ?? '' : ''
  const h = hourOfDay(s.time.hour)
  const greet = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  const alerts = alertsFor(s)

  let body: ReactNode
  switch (page) {
    case 'card': body = <CardPage s={s} navigate={navigate} />; break
    case 'activity': body = <ActivityPage s={s} account={sub === 'bank' || sub === 'card' ? sub : 'all'} navigate={navigate} />; break
    case 'pnl': body = <PnlPage s={s} />; break
    case 'bills': body = <BillsPage s={s} navigate={navigate} />; break
    case 'taxes': body = <TaxesPage s={s} />; break
    case 'offers': body = <OffersPage s={s} navigate={navigate} />; break
    default: body = <Overview s={s} navigate={navigate} greet={`${greet}, ${firstNameOf(s)}`} />
  }

  return (
    <div className={`bk-root${compact ? ' is-compact' : ''}`}>
      <header className="bk-header">
        <div className="bk-header-in">
          <button className="bk-brand" onClick={() => navigate('')} aria-label="Chaise home">
            <ChaiseMark />
            <span className="bk-wordmark">CHAISE</span>
          </button>
          <div className="bk-header-right">
            <span className="bk-secure"><LockKeyhole size={14} /> Secure session</span>
            <button className="bk-hdr-btn" onClick={() => navigate('')} aria-label={`${alerts.length} alerts`}>
              <Bell size={18} />
              {alerts.length > 0 && <span className="bk-hdr-dot">{alerts.length}</span>}
            </button>
            <span className="bk-hdr-user">
              <Menu size={16} className="bk-hdr-menu" />
              {firstNameOf(s)}
            </span>
            <span className="bk-hdr-out"><LogOut size={15} /> Sign out</span>
          </div>
        </div>
        <nav className="bk-nav" aria-label="Chaise navigation">
          <div className="bk-nav-in">
            {NAV.map(n => (
              <button key={n.id || 'home'} className={`bk-nav-item${page === n.id ? ' is-active' : ''}`} onClick={() => navigate(n.id)}>
                {n.label}
              </button>
            ))}
          </div>
        </nav>
      </header>
      <main className="bk-main">{body}</main>
      <footer className="bk-footer">
        <div className="bk-footer-in">
          <span>Chaise Bank, N.A. Member FDIC-ish. Equal Housing Lender.</span>
          <span>Deposit products provided by Chaise Bank. Credit cards are issued by Chaise Bank and subject to credit approval.</span>
          <span>© {yearOf(todayOf(s))} Chaise Financial Holdings, Inc.</span>
        </div>
      </footer>
    </div>
  )
}

export function ChaiseMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="bk-mark">
      <rect x="2" y="2" width="28" height="28" rx="9" fill="#fff" />
      <path d="M8.2 20.6 11.4 9.4" stroke="#117aca" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8.2 20.6h14.4c2.4 0 3.2-1.2 3.4-3.2" stroke="#117aca" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M10.2 20.8v3.8M22.6 20.8v3.8" stroke="#0b2d6b" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
