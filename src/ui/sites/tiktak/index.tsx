// TikTak Ads Manager (ads.tiktak.com) — TikTok Ads Manager lookalike. OWNER: ui-tiktak.
// Routes (site-internal paths):
//   '' | dashboard                       Dashboard
//   campaign[/adgroup|/ad]               Campaign management (Campaign / Ad group / Ad tabs)
//   campaign/create[/adgroup/<cmpId>|/ad/<adGroupId>|/creative/<creativeId>|/spark/<postId>]  Create flow
//   tools/events | tools/audiences | tools/rules (alias: rules)
//   analytics | analytics/creative
//   assets/creatives (alias: library) | assets/posts
//   account | billing | account_quality | setup
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import type { SiteProps } from '../types'
import { AmThemeProvider } from '../../kit/adsmanager'
import { cx } from '../../kit/common'
import { TopNav } from './TopNav'
import { TtContext, useAccount } from './common'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import CreateFlow from './pages/create/CreateFlow'
import Events from './pages/Events'
import Audiences from './pages/Audiences'
import Rules from './pages/Rules'
import Analytics from './pages/Analytics'
import CreativeInsights from './pages/CreativeInsights'
import Creatives from './pages/Creatives'
import Posts from './pages/Posts'
import AccountInfo from './pages/AccountInfo'
import Billing from './pages/Billing'
import AccountStatus from './pages/AccountStatus'
import './tiktak.css'

type Route =
  | { page: 'dashboard' } | { page: 'campaign'; level?: 'campaign' | 'adset' | 'ad' } | { page: 'create'; params: string[] }
  | { page: 'events' } | { page: 'audiences' } | { page: 'rules' } | { page: 'analytics' } | { page: 'creative-insights' }
  | { page: 'creatives' } | { page: 'posts' } | { page: 'account' } | { page: 'billing' } | { page: 'status' } | { page: 'setup' }

function resolve(path: string): Route {
  const [a, b, ...rest] = path.split(/[/?]/).filter(Boolean)
  switch (a) {
    case undefined:
    case 'dashboard': return { page: 'dashboard' }
    case 'campaign':
      if (b === 'create') return { page: 'create', params: rest }
      return { page: 'campaign', level: b === 'adgroup' ? 'adset' : b === 'ad' ? 'ad' : b === 'campaign' ? 'campaign' : undefined }
    case 'tools':
      if (b === 'audiences') return { page: 'audiences' }
      if (b === 'rules') return { page: 'rules' }
      return { page: 'events' }
    case 'rules': return { page: 'rules' }
    case 'analytics': return b === 'creative' ? { page: 'creative-insights' } : { page: 'analytics' }
    case 'assets': return b === 'posts' ? { page: 'posts' } : { page: 'creatives' }
    case 'library': return { page: 'creatives' }
    case 'account': return b === 'billing' ? { page: 'billing' } : b === 'status' ? { page: 'status' } : { page: 'account' }
    case 'billing': return { page: 'billing' }
    case 'account_quality': return { page: 'status' }
    case 'setup': return { page: 'setup' }
    default: return { page: 'dashboard' }
  }
}

export default function TikTakAdsManager({ path, navigate, compact }: SiteProps) {
  const { account, accounts } = useAccount()
  const route = useMemo(() => resolve(path), [path])
  const ctx = useMemo(() => ({ navigate, compact }), [navigate, compact])
  // this site scrolls inside its own shell: land at the top of each new page like a real navigation
  const mainRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0 }, [path])

  // No ad account yet (or the player asked for the setup page): onboarding.
  const needsSetup = !account || route.page === 'setup'
  let body: ReactNode
  if (needsSetup) body = <Setup />
  else {
    switch (route.page) {
      case 'dashboard': body = <Dashboard />; break
      case 'campaign': body = <Campaigns level={route.level} />; break
      case 'create': body = <CreateFlow params={route.params} />; break
      case 'events': body = <Events />; break
      case 'audiences': body = <Audiences />; break
      case 'rules': body = <Rules />; break
      case 'analytics': body = <Analytics />; break
      case 'creative-insights': body = <CreativeInsights />; break
      case 'creatives': body = <Creatives />; break
      case 'posts': body = <Posts />; break
      case 'account': body = <AccountInfo />; break
      case 'billing': body = <Billing />; break
      case 'status': body = <AccountStatus />; break
      default: body = <Dashboard />
    }
  }
  const fullBleed = route.page === 'create' && !needsSetup
  return (
    <TtContext.Provider value={ctx}>
      <AmThemeProvider theme="tiktak" canvas={false} className={cx('tt-app', compact && 'tt-compact')}>
        {!fullBleed && <TopNav path={path} account={needsSetup && route.page !== 'setup' ? null : account} accounts={accounts} />}
        {/* remount pages when the ad account changes so forms and selections start fresh */}
        <main ref={mainRef} key={needsSetup ? 'setup' : account?.id} className="tt-main" style={fullBleed ? { overflow: 'hidden' } : undefined}>{body}</main>
      </AmThemeProvider>
    </TtContext.Provider>
  )
}
