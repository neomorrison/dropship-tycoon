// Banners across the top of Ads Manager pages: missing store / pixel / creatives, and ad-account
// problems (failed payment, restriction, spending limit reached, appeal in review).
import { Clapperboard, CreditCard, ShieldAlert, Store } from 'lucide-react'
import type { AdAccount, GameState } from '../../../core/types'
import { act } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { formatDate } from '../../../core/time'
import { accountSpendLimit, hasPixel, payAdBalance } from '../../../sim/ads'
import { AmButton, AmNotice, amFmt } from '../../kit/adsmanager'

export function SetupNotices({ s, navigate, compact }: { s: GameState; navigate: (p: string) => void; compact?: boolean }) {
  const out = []
  if (!s.store.created) {
    out.push(
      <AmNotice
        key="store"
        tone="warning"
        title="You don't have a website to send people to"
        actions={<AmButton size="sm" icon={Store} onClick={() => openSite('shopifly', '')}>Create a Shopifly store</AmButton>}
      >
        Sales campaigns need a product page to link to. Create your store in Shopifly and import a product first.
      </AmNotice>,
    )
  } else {
    if (!hasPixel(s, 'fadbook')) {
      out.push(
        <AmNotice
          key="pixel"
          tone="warning"
          title="Your pixel isn't sending events"
          actions={
            <>
              <AmButton size="sm" icon={Store} onClick={() => openSite('shopifly', 'apps/fadbook-channel')}>Install Fadbook &amp; Instaglam app</AmButton>
              {!compact && <AmButton size="sm" variant="link" onClick={() => navigate('events')}>Open Events Manager</AmButton>}
            </>
          }
        >
          Without purchase events, Sales campaigns can't learn who buys: delivery optimizes for cheap clicks instead and ad sets never exit learning.
          Connect your store to Fadbook through the sales channel app in Shopifly.
        </AmNotice>,
      )
    }
    if (!s.store.products.some(p => p.status !== 'archived')) {
      out.push(
        <AmNotice key="products" tone="info" title="No products to advertise" actions={<AmButton size="sm" onClick={() => openSite('shopifly', 'products')}>Open Products</AmButton>}>
          Import a product from AliExprez and publish its page in Shopifly before creating ads.
        </AmNotice>,
      )
    }
  }
  if (!s.creatives.creatives.some(c => c.status === 'ready')) {
    const inProd = s.creatives.creatives.filter(c => c.status === 'in_production' || c.status === 'waiting_sample').length
    out.push(
      <AmNotice
        key="creatives"
        tone="info"
        title={inProd ? `${inProd} creative${inProd === 1 ? ' is' : 's are'} still in production` : 'You don\'t have any ad creatives yet'}
        actions={<AmButton size="sm" icon={Clapperboard} onClick={() => openSite('studio', inProd ? 'library' : '')}>{inProd ? 'View library' : 'Make a creative in CreatorHub'}</AmButton>}
      >
        Every ad needs an image or video of your product. Brief one in CreatorHub: film it yourself, edit supplier footage or hire a creator.
      </AmNotice>,
    )
  }
  if (!out.length) return null
  return <div className="fb-notices">{out}</div>
}

export function AccountNotices({ s, acc, navigate }: { s: GameState; acc: AdAccount; navigate: (p: string) => void }) {
  const out = []
  if (acc.status === 'payment_failed') {
    out.push(
      <AmNotice
        key="pay"
        tone="error"
        title="Your ads have stopped because of a payment issue"
        actions={
          <>
            <AmButton size="sm" variant="primary" icon={CreditCard} onClick={() => act(g => { payAdBalance(g, acc.id) })}>Pay now {amFmt.money(acc.unbilled)}</AmButton>
            <AmButton size="sm" onClick={() => navigate('billing')}>Go to Billing</AmButton>
          </>
        }
      >
        {acc.statusReason ?? 'We couldn\'t charge your payment method.'} Pay your outstanding balance to resume delivery.
      </AmNotice>,
    )
  }
  if (acc.status === 'restricted' || acc.status === 'disabled') {
    out.push(
      <AmNotice
        key="ban"
        tone="error"
        title={acc.status === 'restricted' ? 'Your ad account is restricted from advertising' : 'Your ad account is disabled'}
        actions={<AmButton size="sm" icon={ShieldAlert} onClick={() => navigate('account_quality')}>{acc.appeal ? 'View review status' : 'Go to Account quality'}</AmButton>}
      >
        {acc.statusReason ?? 'This account doesn\'t follow our Advertising Standards.'}{' '}
        {acc.appeal
          ? `Your review request is in progress. A decision is expected by ${formatDate(acc.appeal.resolveDay, 'md')}.`
          : acc.appealDenied ? 'The review decision is final.' : 'If you think this is a mistake, request a review.'}
      </AmNotice>,
    )
  }
  const limit = accountSpendLimit(s, acc.id)
  if (acc.status === 'active' && Number.isFinite(limit) && acc.todaySpend >= limit - 0.01) {
    out.push(
      <AmNotice key="limit" tone="warning" title="Account spending limit reached" actions={<AmButton size="sm" onClick={() => navigate('billing')}>View spending limit</AmButton>}>
        This ad account reached its {amFmt.money(limit)} daily spending limit, so ads stop until tomorrow. Limits rise automatically as you spend and pay on time.
      </AmNotice>,
    )
  }
  if (!out.length) return null
  return <div className="fb-notices">{out}</div>
}
