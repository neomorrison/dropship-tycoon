// CreatorHub (creatorhub.co): brief, film and order ad creatives. Owner: ui-studio. Class prefix ch-.
import { useMemo } from 'react'
import { Clapperboard, Library as LibraryIcon, PenLine, Users, Wallet } from 'lucide-react'
import type { SiteProps } from '../types'
import { useGS } from '../../../core/store'
import { money } from '../../../core/format'
import { cx } from '../../kit/common'
import { parseRoute, type StudioRoute } from './route'
import { BriefBuilder } from './BriefBuilder'
import { Library } from './Library'
import { CreativeDetail } from './CreativeDetail'
import { Creators } from './Creators'
import './studio.css'

export default function Site({ path, navigate, compact }: SiteProps) {
  const route = useMemo(() => parseRoute(path), [path])
  return (
    <div className={cx('ch-root', compact && 'ch-compact')}>
      <TopBar route={route} navigate={navigate} compact={compact} />
      <main className="ch-main">
        {route.page === 'brief' && <BriefBuilder productRef={route.productRef} navigate={navigate} compact={compact} />}
        {route.page === 'library' && (route.creativeId
          ? <CreativeDetail key={route.creativeId} id={route.creativeId} navigate={navigate} compact={compact} />
          : <Library productFilter={route.product} navigate={navigate} compact={compact} />)}
        {route.page === 'creators' && <Creators highlightId={route.creatorId} navigate={navigate} compact={compact} />}
      </main>
    </div>
  )
}

function TopBar({ route, navigate, compact }: { route: StudioRoute; navigate: (p: string) => void; compact: boolean }) {
  const creatives = useGS(s => s.creatives.creatives)
  const creatorCount = useGS(s => s.creatives.creators.length)
  const skill = useGS(s => s.skills.creative?.level ?? 1)
  const cash = useGS(s => s.finance.cash)
  const cardLimit = useGS(s => s.finance.card.limit)
  const cardBalance = useGS(s => s.finance.card.balance)
  const frozen = useGS(s => s.finance.card.frozen)
  const inProduction = useMemo(() => creatives.filter(c => c.status === 'in_production' || c.status === 'waiting_sample').length, [creatives])
  const cardAvail = frozen ? 0 : Math.max(0, cardLimit - cardBalance)

  const tabs = [
    { id: 'brief' as const, label: 'New brief', icon: PenLine, path: 'new', badge: 0 },
    { id: 'library' as const, label: 'Library', icon: LibraryIcon, path: 'library', badge: inProduction },
    { id: 'creators' as const, label: 'Creators', icon: Users, path: 'creators', badge: 0, count: creatorCount },
  ]
  return (
    <header className="ch-top">
      <button type="button" className="ch-logo" onClick={() => navigate('new')} aria-label="CreatorHub home">
        <span className="ch-logo-mark"><Clapperboard size={16} strokeWidth={2.4} /></span>
        {!compact && <span className="ch-logo-text">Creator<b>Hub</b></span>}
      </button>
      <nav className="ch-nav" aria-label="CreatorHub">
        {tabs.map(t => {
          const on = route.page === t.id
          return (
            <button key={t.id} type="button" className={cx('ch-nav-btn', on && 'is-on')} aria-current={on ? 'page' : undefined} onClick={() => navigate(t.path)}>
              <t.icon size={15} strokeWidth={2.2} />
              <span>{t.label}</span>
              {t.badge > 0 && <span className="ch-nav-badge" title={`${t.badge} in production`}>{t.badge}</span>}
            </button>
          )
        })}
      </nav>
      {!compact && (
        <div className="ch-top-right">
          <span className="ch-skill" title="Your Creative skill level. It raises the quality of footage you shoot and sharpens insights.">
            Creative <b>Lv {skill}</b>
          </span>
          <span className="ch-funds" title={`Checking ${money(cash)} · card available ${money(cardAvail)}`}>
            <Wallet size={14} />
            {money(cash + cardAvail, { cents: false })}
            <small>available</small>
          </span>
        </div>
      )}
    </header>
  )
}
