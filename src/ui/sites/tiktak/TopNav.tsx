// TikTak Ads Manager top navigation: logo, Dashboard | Campaign | Tools | Analytics | Assets,
// account switcher, notifications bell and the account menu. Compact mode uses a menu sheet.
import { useMemo, useState } from 'react'
import { Bell, Building2, Check, ChevronDown, CreditCard, Menu, Plus, ShieldCheck, UserRound, X } from 'lucide-react'
import type { AdAccount, GameNotification } from '../../../core/types'
import { act, useGS } from '../../../core/store'
import { formatClock, formatDate } from '../../../core/time'
import { AmMenu, type AmMenuSection } from '../../kit/adsmanager'
import { cx, initials, tileColor } from '../../kit/common'
import { accountDisplayId, accountStatusText } from './data'
import { selectAccount, useTt } from './common'

export type NavKey = 'dashboard' | 'campaign' | 'tools' | 'analytics' | 'assets' | 'account'

interface NavDef { key: NavKey; label: string; path?: string; items?: { label: string; path: string; description?: string }[] }
const NAV: NavDef[] = [
  { key: 'dashboard', label: 'Dashboard', path: 'dashboard' },
  { key: 'campaign', label: 'Campaign', path: 'campaign' },
  {
    key: 'tools', label: 'Tools', items: [
      { label: 'Events', path: 'tools/events', description: 'TikTak Pixel and web events' },
      { label: 'Audiences', path: 'tools/audiences', description: 'Lookalike and website traffic audiences' },
      { label: 'Automated rules', path: 'tools/rules', description: 'Turn off or scale ads automatically' },
    ],
  },
  {
    key: 'analytics', label: 'Analytics', items: [
      { label: 'Custom reports', path: 'analytics', description: 'Build a report by day, campaign, ad group or ad' },
      { label: 'Creative insights', path: 'analytics/creative', description: 'Compare videos and their watch time' },
    ],
  },
  {
    key: 'assets', label: 'Assets', items: [
      { label: 'Creative', path: 'assets/creatives', description: 'Your video library' },
      { label: 'TikTak posts', path: 'assets/posts', description: 'Organic posts and Spark Ads' },
    ],
  },
]

export function navKeyFor(path: string): NavKey {
  const a = path.split('/').filter(Boolean)[0] ?? ''
  if (a === 'campaign') return 'campaign'
  if (a === 'tools' || a === 'rules') return 'tools'
  if (a === 'analytics') return 'analytics'
  if (a === 'assets' || a === 'library') return 'assets'
  if (a === 'account' || a === 'billing' || a === 'account_quality' || a === 'setup') return 'account'
  return 'dashboard'
}

function Logo({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="tt-logo" onClick={onClick} aria-label="TikTak Ads Manager home">
      <span className="tt-logo-mark" aria-hidden>♪</span>
      <span className="tt-logo-word"><b>TikTak</b><small>Ads Manager</small></span>
    </button>
  )
}

function AccountAvatar({ account, size = 24 }: { account: AdAccount; size?: number }) {
  const c = tileColor(account.name)
  return <span className="tt-acct-avatar" style={{ background: c.bg, color: c.fg, width: size, height: size }}>{initials(account.name)}</span>
}

function AccountSwitcher({ account, accounts, compact }: { account: AdAccount; accounts: AdAccount[]; compact: boolean }) {
  const { navigate } = useTt()
  const st = accountStatusText(account)
  const sections: AmMenuSection[] = [
    {
      title: 'Ad accounts',
      items: accounts.map(a => {
        const s2 = accountStatusText(a)
        return {
          id: a.id,
          label: a.name,
          description: `ID: ${accountDisplayId(a)} · ${s2.label}${a.rentedFeePct != null ? ' · Agency' : ''}`,
          checked: a.id === account.id,
          onSelect: () => selectAccount(a.id),
        }
      }),
    },
    {
      items: [
        { id: 'status', label: 'Account status', icon: ShieldCheck, onSelect: () => navigate('account_quality') },
        { id: 'new', label: 'Create or rent an ad account', icon: Plus, onSelect: () => navigate('account_quality') },
      ],
    },
  ]
  return (
    <AmMenu
      placement="bottom-end"
      width={300}
      sections={sections}
      trigger={
        <button type="button" className="tt-acct" aria-label="Switch ad account">
          <AccountAvatar account={account} />
          {!compact && (
            <span className="tt-acct-text">
              <span className="tt-acct-name">{account.name}</span>
              <span className="tt-acct-id"><span className={`tt-dot tt-dot-${st.tone}`} style={{ width: 6, height: 6, marginRight: 4 }} />{st.label} · ID {accountDisplayId(account)}</span>
            </span>
          )}
          <ChevronDown size={14} strokeWidth={2} />
        </button>
      }
    />
  )
}

function Notifications() {
  const { navigate } = useTt()
  const all = useGS(s => s.notifications)
  const hour = useGS(s => s.time.hour)
  const list = useMemo(() => all.filter(n => n.site === 'tiktak').slice(-25).reverse(), [all])
  const unread = list.filter(n => !n.read).length
  const markRead = (ids: string[]) => act(s => { for (const n of s.notifications) if (ids.includes(n.id)) n.read = true })
  const open = (n: GameNotification) => {
    markRead([n.id])
    navigate(n.path ?? 'dashboard')
  }
  const when = (h: number) => (hour - h < 24 ? formatClock(h) : formatDate(Math.floor(h / 24), 'md'))
  return (
    <AmMenu
      placement="bottom-end"
      fluid
      onOpenChange={o => { if (!o && unread) markRead(list.filter(n => !n.read).map(n => n.id)) }}
      trigger={
        <button type="button" className="tt-iconbtn" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
          <Bell size={19} strokeWidth={2} />
          {unread > 0 && <span className="tt-iconbtn-dot">{unread > 9 ? '9+' : unread}</span>}
        </button>
      }
    >
      <div className="tt-notifs" style={{ margin: -6 }}>
        <div style={{ padding: '12px 12px 8px', fontWeight: 600, fontSize: 14, borderBottom: '1px solid var(--am-divider-soft)' }}>Notifications</div>
        <div style={{ maxHeight: 380, overflow: 'auto' }}>
          {list.length === 0 && <div className="tt-notif-empty">You&apos;re all caught up. Account and ad review updates show up here.</div>}
          {list.map(n => (
            <div key={n.id} className={cx('tt-notif', !n.read && 'tt-notif-unread')} role="button" tabIndex={0} onClick={() => open(n)} onKeyDown={e => { if (e.key === 'Enter') open(n) }}>
              <span className={`tt-dot tt-dot-${n.kind === 'critical' ? 'critical' : n.kind === 'warning' ? 'warning' : n.kind === 'success' || n.kind === 'sale' ? 'success' : 'info'}`} style={{ marginTop: 5 }} />
              <div className="tt-notif-body">
                <span className="tt-notif-title">{n.title}</span>
                {n.body && <span className="tt-notif-text">{n.body}</span>}
                <span className="tt-notif-time">{when(n.hour)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AmMenu>
  )
}

function UserMenu() {
  const { navigate } = useTt()
  const name = useGS(s => s.meta.playerName)
  const c = tileColor(name || 'You')
  return (
    <AmMenu
      placement="bottom-end"
      width={240}
      header={<div className="tt-col" style={{ gap: 2 }}><b style={{ fontSize: 13 }}>{name}</b><span className="tt-faint tt-small">TikTak for Business</span></div>}
      items={[
        { id: 'info', label: 'Account info', icon: Building2, onSelect: () => navigate('account') },
        { id: 'pay', label: 'Payment', icon: CreditCard, onSelect: () => navigate('billing') },
        { id: 'status', label: 'Account status', icon: ShieldCheck, onSelect: () => navigate('account_quality') },
      ]}
      trigger={<button type="button" className="tt-avatar" style={{ background: c.bg, color: c.fg }} aria-label="Account menu">{initials(name || 'You')}</button>}
    />
  )
}

export function TopNav({ path, account, accounts }: { path: string; account: AdAccount | null; accounts: AdAccount[] }) {
  const { navigate, compact } = useTt()
  const [sheet, setSheet] = useState(false)
  const active = navKeyFor(path)
  const go = (p: string) => {
    setSheet(false)
    navigate(p)
  }
  if (compact) {
    return (
      <>
        <header className="tt-nav">
          <Logo onClick={() => go('dashboard')} />
          <div className="tt-nav-right">
            {account && <AccountSwitcher account={account} accounts={accounts} compact />}
            {account && <Notifications />}
            <button type="button" className="tt-iconbtn" aria-label={sheet ? 'Close menu' : 'Open menu'} onClick={() => setSheet(v => !v)}>
              {sheet ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
            </button>
          </div>
        </header>
        {sheet && (
          <nav className="tt-menu-sheet" aria-label="Main menu">
            {NAV.map(n => n.items ? (
              <div key={n.key}>
                <div className="tt-menu-sheet-group">{n.label}</div>
                {n.items.map(it => (
                  <button key={it.path} type="button" className={cx('tt-menu-sheet-item', 'tt-menu-sheet-sub', path === it.path && 'tt-menu-sheet-item-on')} onClick={() => go(it.path)}>{it.label}</button>
                ))}
              </div>
            ) : (
              <button key={n.key} type="button" className={cx('tt-menu-sheet-item', active === n.key && 'tt-menu-sheet-item-on')} onClick={() => go(n.path!)}>{n.label}</button>
            ))}
            <div className="tt-menu-sheet-group">Account</div>
            <button type="button" className="tt-menu-sheet-item tt-menu-sheet-sub" onClick={() => go('account')}><UserRound size={16} /> Account info</button>
            <button type="button" className="tt-menu-sheet-item tt-menu-sheet-sub" onClick={() => go('billing')}><CreditCard size={16} /> Payment</button>
            <button type="button" className="tt-menu-sheet-item tt-menu-sheet-sub" onClick={() => go('account_quality')}><ShieldCheck size={16} /> Account status</button>
          </nav>
        )}
      </>
    )
  }
  return (
    <header className="tt-nav">
      <Logo onClick={() => navigate('dashboard')} />
      {account && (
        <nav className="tt-nav-items" aria-label="Main">
          {NAV.map(n => n.items ? (
            <AmMenu
              key={n.key}
              width={260}
              items={n.items.map(it => ({ id: it.path, label: it.label, description: it.description, icon: path === it.path ? Check : undefined, onSelect: () => navigate(it.path) }))}
              trigger={
                <button type="button" className={cx('tt-nav-item', active === n.key && 'tt-nav-item-on')}>
                  {n.label}<ChevronDown size={14} strokeWidth={2} />
                </button>
              }
            />
          ) : (
            <button key={n.key} type="button" className={cx('tt-nav-item', active === n.key && 'tt-nav-item-on')} onClick={() => navigate(n.path!)}>{n.label}</button>
          ))}
        </nav>
      )}
      <div className="tt-nav-right">
        {account && <AccountSwitcher account={account} accounts={accounts} compact={false} />}
        {account && <Notifications />}
        <UserMenu />
      </div>
    </header>
  )
}
