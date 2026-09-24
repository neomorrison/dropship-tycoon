// App Store presentation helpers: pricing summaries, install permissions, listing
// "screenshots" (CSS mockups tinted with the app's colors) and merchant review snippets.
import type { AppCategory, AppDef, AppPlan } from '../../../../data/apps'
import { money } from '../../../../core/format'

export function planPriceLabel(p: AppPlan): string {
  if (p.billing === 'free' || (p.billing === 'monthly' && p.price === 0)) return 'Free'
  if (p.billing === 'usage') return p.usageNote ?? (p.price ? `From ${money(p.price)}/month` : 'Usage-based')
  return `${money(p.price)}/month`
}

/** One-line pricing summary for app cards ("Free plan available · Free trial"). */
export function pricingSummary(a: AppDef): string {
  const free = a.plans.some(p => p.billing === 'free' || (p.billing !== 'usage' && p.price === 0))
  const paid = a.plans.filter(p => p.billing === 'monthly' && p.price > 0)
  const usage = a.plans.find(p => p.billing === 'usage')
  const trial = a.plans.some(p => (p.trialDays ?? 0) > 0)
  let s: string
  if (free && !paid.length && !usage) s = 'Free'
  else if (free) s = 'Free plan available'
  else if (usage && !paid.length) s = usage.usageNote ?? 'Usage-based'
  else s = `From ${money(Math.min(...paid.map(p => p.price)))}/month`
  return trial ? `${s} · Free trial available` : s
}

export const PERMISSIONS: Record<AppCategory, string[]> = {
  fulfillment: ['View and edit orders', 'Manage fulfillments and tracking numbers', 'View and edit products and variants'],
  sales_channel: ['Add a tracking pixel to your online store', 'Read products and inventory', 'Read orders to report conversions'],
  reviews: ['Read products', 'Read orders and customers to send review requests', 'Add app blocks to your theme'],
  upsell: ['Read and edit orders', 'Create discounts', 'Add app blocks to your theme'],
  marketing: ['Read customers and orders', 'Send email on your behalf', 'Add signup forms to your theme'],
  disputes: ['Read orders, customers and fulfillments', 'Submit dispute evidence to Shopifly Payments'],
  conversion: ['Add app blocks and scripts to your theme', 'Read products'],
  trust: ['Add app blocks to your theme'],
  speed: ['Edit theme code', 'Read and optimize theme images'],
  support: ['Read orders and customers', 'Send email on your behalf', 'Read fulfillments and tracking'],
  shipping: ['Read orders and fulfillments', 'Add a tracking page to your online store'],
  payments: ['Add a payment method to checkout', 'Read orders'],
  page_builder: ['Edit theme templates and code', 'Read products and collections'],
}

const REVIEW_BANK: { stars: number; text: string }[] = [
  { stars: 5, text: 'Set it up in ten minutes and it just works. Support answered my question the same day.' },
  { stars: 5, text: 'Exactly what I needed for my store. Clean design and no weird code left behind.' },
  { stars: 4, text: 'Does what it says. Took a bit of tweaking to match my theme colors.' },
  { stars: 5, text: 'We use it on every product. Worth every cent.' },
  { stars: 3, text: 'Works, but I noticed my pages got a little heavier after installing it.' },
  { stars: 2, text: 'Billing started earlier than I expected. The app itself is okay.' },
  { stars: 4, text: 'Good app, good support. A few more customization options would be nice.' },
  { stars: 1, text: 'Did not see any difference in my numbers. Uninstalled after a week.' },
]
const STORE_NAMES = ['Nest & Nook', 'Paws Daily', 'Glowline', 'Urban Carry Co', 'Kitchen Crumb', 'Peak Form Supply', 'Tiny Sprout', 'Nova Gadget Lab']
const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Australia', 'United States', 'Germany']

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Three merchant reviews whose mix follows the app's rating. */
export function merchantReviews(a: AppDef): { store: string; country: string; stars: number; text: string; months: number }[] {
  const good = REVIEW_BANK.filter(r => r.stars >= 4)
  const bad = REVIEW_BANK.filter(r => r.stars < 4)
  const h = hash(a.id)
  const nBad = a.rating >= 4.85 ? 0 : a.rating >= 4.5 ? 1 : 2
  const picks = [...good.slice(h % 3, (h % 3) + 3 - nBad), ...bad.slice(h % 2, (h % 2) + nBad)]
  return picks.map((r, i) => ({ ...r, store: STORE_NAMES[(h + i * 3) % STORE_NAMES.length], country: COUNTRIES[(h + i) % COUNTRIES.length], months: 1 + ((h >> (i + 2)) % 11) }))
}

/** Listing "screenshot": a stylized admin/storefront mockup in the app's colors. */
export function AppScreenshot({ app, kind }: { app: AppDef; kind: 0 | 1 | 2 }) {
  const { bg, fg } = app.icon
  if (kind === 0) {
    return (
      <div className="sf-mx-shot" aria-hidden>
        <div className="sf-mx-shot-bar" style={{ background: bg, color: fg }}>{app.name.split(/[:\-–]/)[0].trim()}</div>
        <div className="sf-mx-shot-body">
          <div className="sf-mx-shot-tiles">
            {[0, 1, 2].map(i => (
              <div key={i} className="sf-mx-shot-tile">
                <span className="sf-mx-shot-line" style={{ width: '50%' }} />
                <span className="sf-mx-shot-num" style={{ background: bg }} />
              </div>
            ))}
          </div>
          <div className="sf-mx-shot-chart">
            {[40, 55, 48, 70, 62, 80, 76, 92].map((h, i) => <span key={i} style={{ height: `${h}%`, background: bg, opacity: 0.35 + i * 0.08 }} />)}
          </div>
        </div>
      </div>
    )
  }
  if (kind === 1) {
    return (
      <div className="sf-mx-shot" aria-hidden>
        <div className="sf-mx-shot-bar" style={{ background: '#1a1a1a', color: '#fff' }}>Settings</div>
        <div className="sf-mx-shot-body">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="sf-mx-shot-row">
              <span className="sf-mx-shot-dot" style={{ background: i % 2 ? '#e3e3e3' : bg }} />
              <span className="sf-mx-shot-line" style={{ width: `${70 - i * 8}%` }} />
              <span className="sf-mx-shot-toggle" style={{ background: i === 3 ? '#e3e3e3' : bg }} />
            </div>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="sf-mx-shot sf-mx-shot--store" aria-hidden>
      <div className="sf-mx-shot-product">
        <div className="sf-mx-shot-img" />
        <div className="sf-mx-shot-info">
          <span className="sf-mx-shot-line" style={{ width: '80%', height: 8 }} />
          <span className="sf-mx-shot-line" style={{ width: '40%' }} />
          <span className="sf-mx-shot-widget" style={{ borderColor: bg, background: `${bg}14` }}>
            <span className="sf-mx-shot-line" style={{ width: '60%', background: bg }} />
            <span className="sf-mx-shot-line" style={{ width: '85%' }} />
          </span>
          <span className="sf-mx-shot-btn" />
        </div>
      </div>
    </div>
  )
}
