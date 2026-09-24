// Shared building blocks for the TikTak Ads Manager pages.
import { createContext, useContext, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Clapperboard, CreditCard, ShieldAlert, Unplug } from 'lucide-react'
import type { AdAccount, GameState } from '../../../core/types'
import { act, useGS } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { hasPixel, payAdBalance, accountSpendLimit } from '../../../sim/ads'
import { AmButton, AmNotice } from '../../kit/adsmanager'
import { EmptyArt, type EmptyArtKind, cx } from '../../kit/common'
import { useTtUi } from './uiState'
import { accountDisplayId, pickAccount, tiktakAccounts } from './data'

// ---------------------------------------------------------------------------
// Site context
// ---------------------------------------------------------------------------
export interface TtContextValue {
  navigate: (path: string) => void
  compact: boolean
}
export const TtContext = createContext<TtContextValue>({ navigate: () => {}, compact: false })
export const useTt = () => useContext(TtContext)

export interface TtPageProps {
  /** path segments after the page key */
  params: string[]
}

/** Whole game state (re-renders every tick; pages derive with useMemo where it matters). */
export const useGame = (): GameState => useGS(s => s)
export const useToday = () => useGS(s => Math.floor(s.time.hour / 24))

/** Currently selected TikTak ad account (or null when none exists). */
export function useAccount(): { account: AdAccount | null; accounts: AdAccount[] } {
  const ads = useGS(s => s.ads)
  const preferred = useTtUi(st => st.accountId)
  const accounts = ads.accounts.filter(a => a.platform === 'tiktak')
  const account = pickAccount({ ads } as GameState, preferred)
  return { account, accounts }
}

export const selectAccount = (id: string) => useTtUi.getState().set({ accountId: id, selected: { campaign: [], adset: [], ad: [] } })

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------
export function PageHead({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { label: string; path?: string }[] }) {
  const { navigate } = useTt()
  return (
    <div className="tt-col" style={{ gap: 4 }}>
      {crumbs && crumbs.length > 0 && (
        <div className="tt-crumbs">
          {crumbs.map((c, i) => (
            <span key={i} className="tt-row" style={{ gap: 6 }}>
              {c.path !== undefined ? <button type="button" onClick={() => navigate(c.path!)}>{c.label}</button> : <span>{c.label}</span>}
              {i < crumbs.length - 1 && <span className="tt-faint">/</span>}
            </span>
          ))}
        </div>
      )}
      <div className="tt-page-head">
        <h1 className="tt-page-title">{title}</h1>
        {sub && <span className="tt-page-sub">{sub}</span>}
        {actions && <div className="tt-page-actions">{actions}</div>}
      </div>
    </div>
  )
}

export function SubTabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: ReactNode }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="tt-subtabs" role="tablist">
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === active} className={cx('tt-subtab', t.id === active && 'tt-subtab-on')} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Panel({ title, actions, children, pad = true, className }: { title?: ReactNode; actions?: ReactNode; children?: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={cx('tt-panel', className)}>
      {(title || actions) && (
        <div className="tt-panel-head">
          {title && <h2 className="tt-panel-title">{title}</h2>}
          {actions && <div className="tt-page-actions">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'tt-panel-body' : undefined}>{children}</div>
    </section>
  )
}

export function EmptyBlock({ art = 'ads', title, body, action }: { art?: EmptyArtKind; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="tt-col" style={{ alignItems: 'center', textAlign: 'center', padding: '36px 16px', gap: 10 }}>
      <EmptyArt kind={art} size={120} accent="#00b2b4" />
      <div className="tt-strong" style={{ fontSize: 15 }}>{title}</div>
      {body && <div className="tt-muted" style={{ maxWidth: 420, fontSize: 13, lineHeight: 1.45 }}>{body}</div>}
      {action}
    </div>
  )
}

export function Pill({ tone = 'neutral', children, dot }: { tone?: 'success' | 'info' | 'warning' | 'critical' | 'neutral' | 'pink' | 'dark'; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`tt-pill tt-pill-${tone}`}>
      {dot && <span className={`tt-dot tt-dot-${tone === 'neutral' || tone === 'pink' || tone === 'dark' ? 'info' : tone}`} style={{ width: 6, height: 6 }} />}
      {children}
    </span>
  )
}

/** Percent change chip used on KPI tiles. */
export function Delta({ cur, prev, invert }: { cur: number | null; prev: number | null; invert?: boolean }) {
  if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return <span className="tt-delta tt-delta-flat">—</span>
  const d = (cur - prev) / Math.abs(prev)
  if (Math.abs(d) < 0.005) return <span className="tt-delta tt-delta-flat">0%</span>
  const up = d > 0
  const good = invert ? !up : up
  return (
    <span className={cx('tt-delta', good ? 'tt-delta-up' : 'tt-delta-down')}>
      {up ? <ArrowUpRight size={12} strokeWidth={2.5} /> : <ArrowDownRight size={12} strokeWidth={2.5} />}
      {Math.round(Math.abs(d) * 100)}%
    </span>
  )
}

// ---------------------------------------------------------------------------
// Account-level banners (payment failed, suspended, no pixel, spending limit)
// ---------------------------------------------------------------------------
export function AccountBanners({ s, account, showPixel = true }: { s: GameState; account: AdAccount | null; showPixel?: boolean }) {
  const { navigate } = useTt()
  if (!account) return null
  const out: ReactNode[] = []
  if (account.status === 'payment_failed') {
    out.push(
      <AmNotice key="pay" tone="error" title="Payment failed. Your ads have stopped delivering."
        actions={<>
          <AmButton size="sm" variant="primary" icon={CreditCard} onClick={() => act(st => { payAdBalance(st, account.id) })}>Pay now</AmButton>
          <AmButton size="sm" onClick={() => navigate('billing')}>View payment</AmButton>
        </>}>
        {account.statusReason ?? 'We couldn\'t charge your payment method for your ad spend.'} Balance due: <b>${account.unbilled.toFixed(2)}</b>.
      </AmNotice>,
    )
  }
  if (account.status === 'restricted' || account.status === 'disabled') {
    out.push(
      <AmNotice key="ban" tone="error" title={account.status === 'disabled' ? 'Your ad account has been permanently suspended' : 'Your ad account has been suspended'}
        actions={<AmButton size="sm" variant="primary" icon={ShieldAlert} onClick={() => navigate('account_quality')}>View account status</AmButton>}>
        {account.statusReason ?? 'Your account violated our Advertising Policies.'} All ads under this account stopped delivering.
      </AmNotice>,
    )
  }
  if (account.status === 'active') {
    const limit = accountSpendLimit(s, account.id)
    if (Number.isFinite(limit) && account.todaySpend >= limit - 0.01) {
      out.push(
        <AmNotice key="limit" tone="warning" title="Account spending limit reached"
          actions={<AmButton size="sm" onClick={() => navigate('billing')}>View spending limit</AmButton>}>
          This account can spend up to ${limit.toLocaleString('en-US')} per day while it builds payment history. Delivery resumes tomorrow.
        </AmNotice>,
      )
    }
  }
  if (showPixel && !hasPixel(s, 'tiktak')) {
    out.push(
      <AmNotice key="pixel" tone="warning" title="No pixel events"
        actions={<>
          <AmButton size="sm" variant="primary" icon={Unplug} onClick={() => openSite('shopifly', 'apps/tiktak-channel')}>Connect Shopifly</AmButton>
          <AmButton size="sm" onClick={() => navigate('tools/events')}>Events Manager</AmButton>
        </>}>
        Your website isn&apos;t sending events to TikTak. Without Complete payment events, delivery can only optimize for clicks and ad groups never exit learning.
      </AmNotice>,
    )
  }
  if (!out.length) return null
  return <div className="tt-banners">{out}</div>
}

/** "Create a video" shortcut used in empty states. */
export function MakeVideoButton({ label = 'Create a video in CreatorHub' }: { label?: string }) {
  return <AmButton icon={Clapperboard} onClick={() => openSite('studio')}>{label}</AmButton>
}

export function accountOptionLabel(a: AdAccount) {
  return `${a.name} (${accountDisplayId(a)})`
}

export { tiktakAccounts }
