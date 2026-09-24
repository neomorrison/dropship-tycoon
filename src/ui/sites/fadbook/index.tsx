// Fadbook Ads Manager (Meta Ads Manager parody). OWNER: ui-fadbook.
// Routes (site-internal paths):
//   ''  | 'manage' | 'manage/campaigns' | 'manage/adsets' | 'manage/ads'   Ads Manager tables
//   'create'           Ads Manager with the create flow open
//   'create/creative/<creativeId>'  …with that ready creative (and its product) preselected in the ad
//   'overview'         Account overview          'audiences'   Audiences
//   'events'           Events Manager (pixel)    'billing'     Billing & payments (ADS_PATHS.billing)
//   'account_quality'  Account quality / appeals (ADS_PATHS.accountQuality)
//   'rules'            Automated rules + log (ADS_PATHS.rules)
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Building2, ChevronDown, CircleQuestionMark, CreditCard, LayoutDashboard, Megaphone, Menu, Plus, ShieldCheck, UsersRound,
  Waypoints, Zap,
} from 'lucide-react'
import type { AdAccount, AdLevel, GameState } from '../../../core/types'
import { act, useGS } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { AGENCY_SETUP_FEE, openAccountBlocker, openAdAccount } from '../../../sim/ads'
import { AmButton, AmMenu, AmModal, AmTag, AmThemeProvider, AmTooltip, amFmt } from '../../kit/adsmanager'
import { tileColor } from '../../kit/common'
import type { SiteProps } from '../types'
import { accountStatusLabel, displayId, fbAccounts, pickAccount } from './data'
import { Manager } from './Manager'
import Overview from './pages/Overview'
import Billing from './pages/Billing'
import AccountQuality from './pages/AccountQuality'
import EventsManager from './pages/Events'
import Audiences from './pages/Audiences'
import RulesPage from './pages/Rules'
import Onboarding from './pages/Onboarding'
import { useFbUI } from './uiStore'
import './fadbook.css'

type PageKey = 'manage' | 'overview' | 'audiences' | 'events' | 'billing' | 'account_quality' | 'rules'

const NAV: { key: PageKey; label: string; title: string; icon: typeof Megaphone }[] = [
  { key: 'overview', label: 'Account overview', title: 'Account overview', icon: LayoutDashboard },
  { key: 'manage', label: 'Campaigns', title: 'Campaigns', icon: Megaphone },
  { key: 'audiences', label: 'Audiences', title: 'Audiences', icon: UsersRound },
  { key: 'events', label: 'Events Manager', title: 'Events Manager', icon: Waypoints },
  { key: 'billing', label: 'Billing & payments', title: 'Billing & payments', icon: CreditCard },
  { key: 'account_quality', label: 'Account quality', title: 'Account quality', icon: ShieldCheck },
  { key: 'rules', label: 'Automated rules', title: 'Automated rules', icon: Zap },
]

function route(path: string): { page: PageKey; level?: AdLevel; create: boolean; creativeId?: string } {
  const [a, b, c] = path.split('/').filter(Boolean)
  switch (a) {
    case undefined:
    case 'manage': return { page: 'manage', level: b === 'adsets' ? 'adset' : b === 'ads' ? 'ad' : b === 'campaigns' ? 'campaign' : undefined, create: false }
    case 'create': return { page: 'manage', create: true, creativeId: b === 'creative' ? c : undefined }
    case 'overview':
    case 'audiences':
    case 'events':
    case 'billing':
    case 'account_quality':
    case 'rules': return { page: a, create: false }
    default: return { page: 'manage', create: false }
  }
}

export default function FadbookAdsManager({ path, navigate, compact }: SiteProps) {
  const s = useGS(st => st)
  const ui = useFbUI()
  const accounts = useMemo(() => fbAccounts(s), [s.ads.accounts]) // eslint-disable-line react-hooks/exhaustive-deps
  const acc = pickAccount(accounts, ui.accountId)
  const r = route(path)
  useEffect(() => {
    if (acc && ui.accountId !== acc.id) ui.set({ accountId: acc.id })
  }, [acc?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (r.level && r.level !== ui.level) ui.set({ level: r.level })
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!acc) {
    return (
      <AmThemeProvider theme="fadbook" className={`fb-root${compact ? ' fb-compact' : ''}`}>
        <div className="fb-shell">
          {!compact && <Rail page={r.page} navigate={navigate} disabled />}
          <div className="fb-body">
            <header className="fb-header"><div className="fb-header-left"><h1 className="fb-title">Ads Manager</h1></div></header>
            <main className="fb-main"><Onboarding s={s} /></main>
          </div>
        </div>
      </AmThemeProvider>
    )
  }

  const nav = NAV.find(n => n.key === r.page)!
  let body: ReactNode
  switch (r.page) {
    case 'overview': body = <Overview s={s} acc={acc} navigate={navigate} />; break
    case 'audiences': body = <Audiences s={s} navigate={navigate} />; break
    case 'events': body = <EventsManager s={s} />; break
    case 'billing': body = <Billing s={s} acc={acc} navigate={navigate} />; break
    case 'account_quality': body = <AccountQuality s={s} acc={acc} navigate={navigate} />; break
    case 'rules': body = <RulesPage s={s} navigate={navigate} />; break
    default: body = <Manager key={acc.id} s={s} acc={acc} navigate={navigate} compact={compact} autoCreate={r.create} autoCreativeId={r.creativeId} />
  }
  return (
    <AmThemeProvider theme="fadbook" className={`fb-root${compact ? ' fb-compact' : ''}`}>
      <div className="fb-shell">
        {!compact && <Rail page={r.page} navigate={navigate} />}
        <div className="fb-body">
          <header className="fb-header">
            <div className="fb-header-left">
              {compact && <CompactNav page={r.page} navigate={navigate} />}
              <h1 className="fb-title">{nav.title}</h1>
              <AccountSwitcher s={s} acc={acc} accounts={accounts} navigate={navigate} compact={compact} />
            </div>
            {!compact && (
              <div className="fb-header-right">
                <span className="fb-biz">
                  <span className="fb-biz-tile" style={{ background: tileColor(acc.businessName ?? acc.name).bg, color: tileColor(acc.businessName ?? acc.name).fg }}>
                    {(acc.businessName ?? acc.name).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="fb-biz-name">{acc.businessName ?? `${acc.name} Business`}</span>
                </span>
              </div>
            )}
          </header>
          <main className="fb-main">{body}</main>
        </div>
      </div>
    </AmThemeProvider>
  )
}

function Rail({ page, navigate, disabled }: { page: PageKey; navigate: (p: string) => void; disabled?: boolean }) {
  return (
    <nav className="fb-rail" aria-label="Ads Manager navigation">
      <AmTooltip content="Ads Manager" placement="right">
        <button type="button" className="fb-rail-logo" aria-label="Ads Manager" onClick={() => navigate('manage/campaigns')}>
          <span>f</span>
        </button>
      </AmTooltip>
      <span className="fb-rail-sep" />
      {NAV.map(n => (
        <AmTooltip key={n.key} content={n.label} placement="right">
          <button
            type="button"
            className={`fb-rail-btn${page === n.key ? ' fb-rail-on' : ''}`}
            aria-label={n.label}
            aria-current={page === n.key ? 'page' : undefined}
            disabled={disabled}
            onClick={() => navigate(n.key === 'manage' ? 'manage/campaigns' : n.key)}
          >
            <n.icon size={20} strokeWidth={2} />
          </button>
        </AmTooltip>
      ))}
      <span className="fb-rail-fill" />
      <AmTooltip content="Help: metrics glossary in Ecom Academy" placement="right">
        <button type="button" className="fb-rail-btn" aria-label="Help" onClick={() => openSite('academy', '')}>
          <CircleQuestionMark size={20} strokeWidth={2} />
        </button>
      </AmTooltip>
    </nav>
  )
}

function CompactNav({ page, navigate }: { page: PageKey; navigate: (p: string) => void }) {
  return (
    <AmMenu
      trigger={<AmButton size="sm" icon={Menu} ariaLabel="Menu" />}
      width={240}
      items={NAV.map(n => ({ id: n.key, label: n.label, icon: n.icon, checked: page === n.key, onSelect: () => navigate(n.key === 'manage' ? 'manage/campaigns' : n.key) }))}
    />
  )
}

function AccountSwitcher({ s, acc, accounts, navigate, compact }: { s: GameState; acc: AdAccount; accounts: AdAccount[]; navigate: (p: string) => void; compact: boolean }) {
  const ui = useFbUI()
  const [confirm, setConfirm] = useState<null | 'own' | 'rent'>(null)
  const status = accountStatusLabel(acc)
  const ownBlock = openAccountBlocker(s, 'fadbook', false)
  const rentBlock = openAccountBlocker(s, 'fadbook', true)
  const tile = tileColor(acc.name)
  const open = (rented: boolean) => {
    let id: string | null = null
    act(g => { id = openAdAccount(g, 'fadbook', { rented }) })
    setConfirm(null)
    if (id) ui.set({ accountId: id, sel: { campaign: [], adset: [], ad: [] } })
  }
  const trigger = (
    <button type="button" className="fb-acct">
      <span className="fb-acct-tile" style={{ background: tile.bg, color: tile.fg }}>{acc.name.slice(0, 1).toUpperCase()}</span>
      <span className="fb-acct-text">
        <span className="fb-acct-name">{acc.name}</span>
        {!compact && <span className="fb-acct-id">({displayId(acc)})</span>}
      </span>
      {acc.status !== 'active' && <AmTag tone={status.tone}>{status.label}</AmTag>}
      <ChevronDown size={16} />
    </button>
  )
  return (
    <>
      <AmMenu
        trigger={trigger}
        width={340}
        header={<span className="fb-small fb-strong">Ad accounts</span>}
        sections={[
          {
            items: accounts.map(a => {
              const st = accountStatusLabel(a)
              return {
                id: a.id,
                label: <span className="fb-inline">{a.name} {a.rentedFeePct != null && <AmTag>Agency</AmTag>}</span>,
                description: `Ad account ID: ${displayId(a)} · ${st.label}`,
                checked: a.id === acc.id,
                onSelect: () => ui.set({ accountId: a.id, sel: { campaign: [], adset: [], ad: [] } }),
              }
            }),
          },
          {
            items: [
              { id: 'new', label: 'Create new ad account', icon: Plus, disabled: !!ownBlock, disabledReason: ownBlock ?? undefined, onSelect: () => setConfirm('own') },
              { id: 'rent', label: 'Rent an agency ad account', description: `${amFmt.money(AGENCY_SETUP_FEE.fadbook)} setup, then 3–6% of spend`, icon: Building2, disabled: !!rentBlock, disabledReason: rentBlock ?? undefined, onSelect: () => setConfirm('rent') },
              { id: 'quality', label: 'Account quality', icon: ShieldCheck, onSelect: () => navigate('account_quality') },
            ],
          },
        ]}
      />
      {confirm && (
        <AmModal
          inline
          open
          onClose={() => setConfirm(null)}
          title={confirm === 'own' ? 'Create a new ad account?' : 'Rent an agency ad account?'}
          size="sm"
          footer={<><AmButton onClick={() => setConfirm(null)}>Cancel</AmButton><AmButton variant="primary" onClick={() => open(confirm === 'rent')}>{confirm === 'own' ? 'Create' : `Pay ${amFmt.money(AGENCY_SETUP_FEE.fadbook)} and rent`}</AmButton></>}
        >
          <p className="fb-small">
            {confirm === 'own'
              ? 'The new account starts with the lowest daily spending limit and payment threshold, and gets extra scrutiny for its first two weeks.'
              : `An agency adds you to one of its aged accounts: higher spending limits and fewer restrictions, but a ${amFmt.money(AGENCY_SETUP_FEE.fadbook)} setup fee now and 3–6% on top of every ad bill.`}
          </p>
        </AmModal>
      )}
    </>
  )
}
