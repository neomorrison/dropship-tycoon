// Shopifly App Store — parody of the Shopify App Store.
// OWNER: sim-store. Player-facing listing data only; the simulated effects live in
// sim/store (they are what the app really does, which is not always what the listing claims).
import type { SectionId } from '../core/types'

export type AppCategory =
  | 'fulfillment' | 'sales_channel' | 'reviews' | 'upsell' | 'marketing' | 'disputes' | 'conversion'
  | 'trust' | 'speed' | 'support' | 'shipping' | 'payments' | 'page_builder'

export const APP_CATEGORY_LABELS: Record<AppCategory, string> = {
  fulfillment: 'Dropshipping & fulfillment',
  sales_channel: 'Sales channels',
  reviews: 'Product reviews',
  upsell: 'Upsell & cross-sell',
  marketing: 'Marketing & email',
  disputes: 'Chargebacks & fraud',
  conversion: 'Conversion',
  trust: 'Trust & security',
  speed: 'Store speed',
  support: 'Customer support',
  shipping: 'Order tracking',
  payments: 'Payments',
  page_builder: 'Page builders',
}

export interface AppPlan {
  name: string
  /** USD per month ('monthly'), 0 for free; for 'usage' plans the headline fee (often 0) */
  price: number
  billing: 'free' | 'monthly' | 'usage'
  features: string[]
  /** free trial before the first charge */
  trialDays?: number
  /** e.g. "25% of recovered disputes" */
  usageNote?: string
}

export interface AppDef {
  id: string
  name: string
  developer: string
  category: AppCategory
  tagline: string
  description: string
  /** icon tile: short glyph + colors */
  icon: { glyph: string; bg: string; fg: string }
  /** App Store rating 1..5 */
  rating: number
  reviews: number
  builtForShopifly: boolean
  plans: AppPlan[]
  /** script weight added to the storefront product page, seconds (negative = speeds it up) */
  loadTime: number
  /** "What this app does in your store" bullets */
  effects: string[]
  /** listing highlight chips */
  highlights: string[]
  /** theme sections this app unlocks */
  unlocksSections: SectionId[]
  launched: string
  worksWith: string[]
}

export const APPS: AppDef[] = [
  {
    id: 'dserz',
    name: 'DSerz – AliExprez Dropshipping',
    developer: 'DSerz Inc.',
    category: 'fulfillment',
    tagline: 'Import AliExprez products and fulfill orders in bulk with one click.',
    description:
      'The official AliExprez dropshipping partner. Import products straight from AliExprez, map variants to suppliers, ' +
      'and have supplier orders placed and paid automatically as soon as a customer checks out. Tracking numbers sync ' +
      'back to Shopifly so your customers get shipping updates.',
    icon: { glyph: 'DS', bg: '#1f6feb', fg: '#ffffff' },
    rating: 4.8,
    reviews: 21340,
    builtForShopifly: true,
    plans: [
      { name: 'Basic', price: 0, billing: 'free', features: ['Up to 3,000 products', 'Auto-place and pay supplier orders', 'Tracking sync', 'Variant mapping'] },
      { name: 'Advanced', price: 19.9, billing: 'monthly', trialDays: 14, features: ['Everything in Basic', 'Priority order queue (tracking syncs a day sooner)', 'Bulk order editing', 'Supplier optimizer'] },
    ],
    loadTime: 0,
    effects: [
      'Places and pays AliExprez supplier orders automatically when a customer checks out.',
      'Without it, dropship orders sit in "Unfulfilled" until you fulfill each one by hand.',
      'Syncs tracking numbers back to your orders.',
    ],
    highlights: ['Built for Shopifly', 'Popular with stores like yours', 'Works with the latest themes'],
    unlocksSections: [],
    launched: 'Mar 2018',
    worksWith: ['AliExprez', 'Checkout'],
  },
  {
    id: 'fadbook-channel',
    name: 'Fadbook & Instaglam',
    developer: 'Fadbook Platforms',
    category: 'sales_channel',
    tagline: 'Sell on Fadbook and Instaglam and install the Fadbook pixel.',
    description:
      'Connect your store to Fadbook Business in a few clicks. Installs the Fadbook pixel and Conversions API so Ads ' +
      'Manager sees page views, add-to-carts and purchases, which you need to run purchase-optimized campaigns and build lookalike audiences.',
    icon: { glyph: 'f', bg: '#0866ff', fg: '#ffffff' },
    rating: 3.9,
    reviews: 6912,
    builtForShopifly: true,
    plans: [{ name: 'Free', price: 0, billing: 'free', features: ['Pixel + Conversions API', 'Product catalog sync', 'Shops on Fadbook & Instaglam'] }],
    loadTime: 0.05,
    effects: [
      'Installs the Fadbook pixel. Purchase and add-to-cart events flow to Ads Manager.',
      'Required for purchase-optimized campaigns, lookalike and retargeting audiences.',
    ],
    highlights: ['Built for Shopifly', 'Official partner'],
    unlocksSections: [],
    launched: 'Jun 2016',
    worksWith: ['Fadbook Ads Manager', 'Instaglam Shopping'],
  },
  {
    id: 'tiktak-channel',
    name: 'TikTak',
    developer: 'TikTak Commerce',
    category: 'sales_channel',
    tagline: 'Reach TikTak shoppers and install the TikTak pixel.',
    description:
      'Link your TikTak For Business account, sync your catalog and install the TikTak pixel with Events API. ' +
      'Needed for Complete Payment optimization and Smart+ campaigns.',
    icon: { glyph: '♪', bg: '#000000', fg: '#25f4ee' },
    rating: 4.3,
    reviews: 3108,
    builtForShopifly: true,
    plans: [{ name: 'Free', price: 0, billing: 'free', features: ['TikTak pixel + Events API', 'Catalog sync', 'Spark-ready product links'] }],
    loadTime: 0.05,
    effects: ['Installs the TikTak pixel. Complete Payment events flow to TikTak Ads Manager.', 'Required for conversion-optimized ad groups.'],
    highlights: ['Built for Shopifly', 'Official partner'],
    unlocksSections: [],
    launched: 'Oct 2020',
    worksWith: ['TikTak Ads Manager'],
  },
  {
    id: 'judgyme',
    name: 'Judgy.me Product Reviews',
    developer: 'Judgy.me',
    category: 'reviews',
    tagline: 'Collect and display product reviews. Free forever plan.',
    description:
      'Collect reviews with automated review-request emails, import reviews from AliExprez and show star ratings on ' +
      'product pages. The Awesome plan adds photo and video reviews and imports supplier photos.',
    icon: { glyph: 'J', bg: '#108474', fg: '#ffffff' },
    rating: 5.0,
    reviews: 38210,
    builtForShopifly: true,
    plans: [
      { name: 'Free', price: 0, billing: 'free', features: ['Unlimited reviews', 'Review request emails', 'AliExprez import (text only)', 'Star ratings widget'] },
      { name: 'Awesome', price: 15, billing: 'monthly', trialDays: 15, features: ['Photo & video reviews', 'Import with customer photos', 'Q&A widget', 'Smarter review requests'] },
    ],
    loadTime: 0.15,
    effects: ['Unlocks the Product reviews section.', 'Imports reviews from your AliExprez supplier.', 'Emails customers after delivery asking for a review.'],
    highlights: ['Built for Shopifly', 'Lightweight'],
    unlocksSections: ['reviews'],
    launched: 'Nov 2015',
    worksWith: ['AliExprez', 'Klavio'],
  },
  {
    id: 'lookz',
    name: 'Lookz Photo Reviews',
    developer: 'Lookz Ltd',
    category: 'reviews',
    tagline: 'Beautiful photo and video reviews that sell.',
    description:
      'Collect photo and video reviews with incentives, show them in eye-catching galleries and import supplier ' +
      'reviews with photos. Heavier than text-only widgets, but visual reviews are some of the strongest social proof you can show.',
    icon: { glyph: 'L', bg: '#ff5a5f', fg: '#ffffff' },
    rating: 4.9,
    reviews: 16804,
    builtForShopifly: true,
    plans: [
      { name: 'Beginner', price: 12.99, billing: 'monthly', trialDays: 14, features: ['Photo reviews', '100 review requests / month', 'AliExprez import with photos'] },
      { name: 'Scale', price: 34.99, billing: 'monthly', trialDays: 14, features: ['Video reviews', '500 review requests / month', 'UGC gallery', 'Discount incentives'] },
      { name: 'Unlimited', price: 49.99, billing: 'monthly', trialDays: 14, features: ['Unlimited review requests', 'Referral program', 'Priority support'] },
    ],
    loadTime: 0.3,
    effects: ['Unlocks the Product reviews section with photo galleries.', 'Imports supplier reviews including customer photos.', 'Higher share of reviews come with photos.'],
    highlights: ['Built for Shopifly', 'Popular with stores like yours'],
    unlocksSections: ['reviews'],
    launched: 'Jan 2017',
    worksWith: ['AliExprez', 'Klavio'],
  },
  {
    id: 'bundlr',
    name: 'Bundlr Quantity Breaks',
    developer: 'Bundlr Apps',
    category: 'upsell',
    tagline: 'Buy more, save more. Quantity breaks that raise AOV.',
    description: 'Add "Buy 2, save 10%" tiers right above the buy button. Tiers are applied automatically at checkout.',
    icon: { glyph: 'B', bg: '#7c3aed', fg: '#ffffff' },
    rating: 4.9,
    reviews: 2410,
    builtForShopifly: true,
    plans: [{ name: 'Standard', price: 9.99, billing: 'monthly', trialDays: 14, features: ['Unlimited bundles', 'Quantity break tiers', 'Automatic checkout discounts'] }],
    loadTime: 0.12,
    effects: ['Unlocks the Quantity breaks section.', 'Customers who pick a tier buy 2–3 units per order.'],
    highlights: ['Built for Shopifly', 'Lightweight'],
    unlocksSections: ['bundle_offer'],
    launched: 'Aug 2021',
    worksWith: ['Checkout'],
  },
  {
    id: 'rekonvert',
    name: 'ReKonvert Post Purchase Upsell',
    developer: 'Stylo Labs',
    category: 'upsell',
    tagline: 'One-click upsells after checkout. No extra page weight.',
    description:
      'Show a one-click offer right after payment. The customer adds a second item without re-entering card details. ' +
      'It runs after checkout, so it adds nothing to your product page load time.',
    icon: { glyph: 'R', bg: '#0f172a', fg: '#facc15' },
    rating: 4.8,
    reviews: 5207,
    builtForShopifly: true,
    plans: [
      { name: 'Starter', price: 4.99, billing: 'monthly', trialDays: 14, features: ['Post-purchase offers', 'Thank-you page builder', 'Up to 100 orders / month'] },
      { name: 'Premium', price: 29.99, billing: 'monthly', trialDays: 14, features: ['Unlimited orders', 'A/B tested offers', 'Smarter product recommendations'] },
    ],
    loadTime: 0,
    effects: ['About 1 in 8 customers accept a post-purchase add-on at 25–40% of the item price.', 'Raises average order value by a few percent.'],
    highlights: ['Built for Shopifly', 'No impact on page speed'],
    unlocksSections: [],
    launched: 'May 2019',
    worksWith: ['Checkout', 'Klavio'],
  },
  {
    id: 'klavio',
    name: 'Klavio: Email Marketing & SMS',
    developer: 'Klavio Inc.',
    category: 'marketing',
    tagline: 'Win back abandoned checkouts and bring customers back.',
    description:
      'Automated flows for abandoned checkouts, post-purchase follow-ups and replenishment reminders, plus signup ' +
      'forms that grow your list. Free up to 250 contacts. Pricing goes up automatically with your list size.',
    icon: { glyph: 'K', bg: '#232426', fg: '#ffffff' },
    rating: 4.6,
    reviews: 2811,
    builtForShopifly: true,
    plans: [
      { name: 'Free', price: 0, billing: 'free', features: ['Up to 250 contacts', '500 monthly emails', 'Abandoned checkout flow', 'Signup forms'] },
      { name: 'Email', price: 20, billing: 'usage', usageNote: '$20–150/month depending on contacts', features: ['Unlimited flows', 'Replenishment & win-back flows', 'A/B testing', 'Priced by list size'] },
    ],
    loadTime: 0.1,
    effects: [
      'Abandoned checkout emails win back a slice of shoppers the next day.',
      'Replenishment and post-purchase flows bring past customers back to reorder.',
      'Billed by list size: free up to 250 contacts.',
    ],
    highlights: ['Built for Shopifly', 'Popular with stores like yours'],
    unlocksSections: [],
    launched: 'Feb 2014',
    worksWith: ['Judgy.me', 'Lookz', 'ReKonvert'],
  },
  {
    id: 'chargeflo',
    name: 'ChargeFlo Chargebacks',
    developer: 'ChargeFlo',
    category: 'disputes',
    tagline: 'Automated chargeback responses. Pay only when you win.',
    description:
      'ChargeFlo builds and submits evidence packets for every dispute automatically (tracking, delivery proof, policies, ' +
      'customer messages) matched to the reason code. No monthly fee: you pay a share of what it recovers.',
    icon: { glyph: 'CF', bg: '#16a34a', fg: '#ffffff' },
    rating: 4.8,
    reviews: 1152,
    builtForShopifly: true,
    plans: [{ name: 'Success-based', price: 0, billing: 'usage', usageNote: '25% of recovered disputes', features: ['Automatic evidence submission', 'Reason-code templates', 'Dispute analytics'] }],
    loadTime: 0,
    effects: ['Responds to every new chargeback automatically with a full evidence packet.', 'Wins more disputes than doing it yourself. Keeps 25% of whatever it recovers.'],
    highlights: ['Built for Shopifly', 'No monthly fee'],
    unlocksSections: [],
    launched: 'Sep 2021',
    worksWith: ['Shopifly Payments', 'TrackWise'],
  },
  {
    id: 'tickr',
    name: 'Tickr Countdown Timer & Scarcity',
    developer: 'Tickr Apps',
    category: 'conversion',
    tagline: 'Countdown timers and low-stock alerts.',
    description: 'Add sale countdown timers and "only X left" stock alerts to your product page. Easy setup, no coding.',
    icon: { glyph: 'T', bg: '#f97316', fg: '#ffffff' },
    rating: 4.7,
    reviews: 3984,
    builtForShopifly: false,
    plans: [{ name: 'Pro', price: 4.99, billing: 'monthly', trialDays: 7, features: ['Countdown timers', 'Stock scarcity alerts', 'Cart timers'] }],
    loadTime: 0.2,
    effects: ['Unlocks the Countdown timer and Low stock alert sections.'],
    highlights: ['Easy setup'],
    unlocksSections: ['countdown', 'stock_scarcity'],
    launched: 'Apr 2017',
    worksWith: ['Online Store 2.0 themes'],
  },
  {
    id: 'trustbadgz',
    name: 'TrustBadgz Trust Badges',
    developer: 'Badge Bros',
    category: 'trust',
    tagline: 'Free trust badges under your buy button.',
    description: 'Display secure checkout, guarantee and free returns badges below the Add to cart button.',
    icon: { glyph: '✓', bg: '#0ea5e9', fg: '#ffffff' },
    rating: 4.9,
    reviews: 1243,
    builtForShopifly: true,
    plans: [{ name: 'Free', price: 0, billing: 'free', features: ['40+ badge icons', 'Custom colors', 'Placement options'] }],
    loadTime: 0.1,
    effects: ['Unlocks the Trust badges section.'],
    highlights: ['Built for Shopifly', 'Free'],
    unlocksSections: ['trust_badges'],
    launched: 'Jul 2020',
    worksWith: ['Online Store 2.0 themes'],
  },
  {
    id: 'swiftspeed',
    name: 'SwiftSpeed Page Speed Optimizer',
    developer: 'Swift Labs',
    category: 'speed',
    tagline: 'Lazy-load images and defer app scripts. Faster pages, more sales.',
    description:
      'Compresses images, lazy-loads media below the fold and defers non-critical app scripts. Typically takes a few ' +
      'hundred milliseconds off a product page. It cannot fix a store that runs ten heavy apps.',
    icon: { glyph: '⚡', bg: '#111827', fg: '#fde047' },
    rating: 4.8,
    reviews: 912,
    builtForShopifly: true,
    plans: [{ name: 'Pro', price: 19.99, billing: 'monthly', trialDays: 7, features: ['Image compression', 'Lazy loading', 'Script deferral', 'Speed reports'] }],
    loadTime: -0.4,
    effects: ['Cuts about 0.4s off your product page load time.'],
    highlights: ['Built for Shopifly'],
    unlocksSections: [],
    launched: 'Jan 2022',
    worksWith: ['Online Store 2.0 themes'],
  },
  {
    id: 'gorgeous',
    name: 'Gorgeous Helpdesk',
    developer: 'Gorgeous',
    category: 'support',
    tagline: 'Every customer conversation in one place, with order data.',
    description:
      'A shared inbox with the order, tracking and refund buttons right next to each ticket. Macros cut handling time; ' +
      'the Basic plan auto-answers "where is my order?" emails with live tracking.',
    icon: { glyph: 'G', bg: '#161616', fg: '#ffffff' },
    rating: 4.5,
    reviews: 541,
    builtForShopifly: true,
    plans: [
      { name: 'Starter', price: 10, billing: 'monthly', trialDays: 7, features: ['Shared inbox', 'Order sidebar', 'Macros', 'Chat widget'] },
      { name: 'Basic', price: 50, billing: 'monthly', trialDays: 7, features: ['Everything in Starter', 'WISMO auto-replies with tracking', 'Rules & automations'] },
    ],
    loadTime: 0.15,
    effects: ['Support work goes about 40% faster (more tickets per hour).', 'Basic plan: auto-replies to about half of "where is my order?" emails.'],
    highlights: ['Built for Shopifly'],
    unlocksSections: [],
    launched: 'Mar 2016',
    worksWith: ['Klavio', 'TrackWise', 'Judgy.me'],
  },
  {
    id: 'trackwise',
    name: 'TrackWise Order Tracking',
    developer: 'TrackWise Ltd',
    category: 'shipping',
    tagline: 'Branded tracking page and proactive shipping updates.',
    description:
      'Gives customers a branded tracking page and sends proactive shipping notifications, so fewer of them email you ' +
      'asking where their order is. Also improves delivery evidence for disputes.',
    icon: { glyph: '⌖', bg: '#4f46e5', fg: '#ffffff' },
    rating: 4.8,
    reviews: 12406,
    builtForShopifly: true,
    plans: [{ name: 'Essentials', price: 11, billing: 'monthly', trialDays: 14, features: ['Branded tracking page', 'Shipping notifications', 'Delivery analytics'] }],
    loadTime: 0,
    effects: ['About a third fewer "where is my order?" tickets.', 'Delivery confirmation strengthens chargeback evidence.'],
    highlights: ['Built for Shopifly', 'No impact on page speed'],
    unlocksSections: [],
    launched: 'Oct 2015',
    worksWith: ['Gorgeous', 'ChargeFlo', 'Klavio'],
  },
  {
    id: 'klarno',
    name: 'Klarno Pay Later',
    developer: 'Klarno Bank',
    category: 'payments',
    tagline: 'Let customers pay in 4 interest-free installments.',
    description:
      'Offer "Pay in 4" at checkout with on-site messaging. It helps most on higher-priced items. Klarno charges ' +
      'the merchant a fee on every pay-later order.',
    icon: { glyph: 'K.', bg: '#ffb3c7', fg: '#17120f' },
    rating: 4.2,
    reviews: 834,
    builtForShopifly: true,
    plans: [{ name: 'Standard', price: 0, billing: 'usage', usageNote: '6% per pay-later order', features: ['Pay in 4', 'On-site messaging', 'Instant merchant payout'] }],
    loadTime: 0.1,
    effects: ['Turns on buy now, pay later at checkout (toggle it in Settings → Payments).', 'Helps conversion on items over about $60. Fee on each pay-later order.'],
    highlights: ['Built for Shopifly'],
    unlocksSections: [],
    launched: 'Jun 2019',
    worksWith: ['Checkout'],
  },
  {
    id: 'vitalz',
    name: 'Vitalz: 40+ Apps in 1',
    developer: 'Vitalz',
    category: 'conversion',
    tagline: 'Reviews, bundles, timers, trust badges and 40+ tools in one app.',
    description:
      'Replace a dozen apps with one: product reviews with AliExprez import, bundles, countdown timers, stock ' +
      'alerts, trust badges, sticky add to cart and more. Convenient, but all those modules load on every page.',
    icon: { glyph: 'V', bg: '#e11d48', fg: '#ffffff' },
    rating: 4.9,
    reviews: 6522,
    builtForShopifly: false,
    plans: [{ name: 'All-in-one', price: 29.99, billing: 'monthly', trialDays: 7, features: ['Product reviews + import', 'Bundles & quantity breaks', 'Timers & scarcity', 'Trust badges', 'Sticky add to cart'] }],
    loadTime: 0.6,
    effects: ['Unlocks Reviews, Trust badges, Quantity breaks, Countdown, Low stock and Sticky add to cart.', 'Adds noticeable script weight to every page.'],
    highlights: ['Popular with stores like yours'],
    unlocksSections: ['reviews', 'trust_badges', 'bundle_offer', 'countdown', 'stock_scarcity', 'sticky_atc'],
    launched: 'Feb 2019',
    worksWith: ['AliExprez', 'Online Store 2.0 themes'],
  },
  {
    id: 'pagefli',
    name: 'PageFli Landing Page Builder',
    developer: 'PageFli',
    category: 'page_builder',
    tagline: 'Drag-and-drop product pages that look custom-built.',
    description: 'Design custom product pages with a drag-and-drop editor and 100+ templates. Nicer design, some extra page weight.',
    icon: { glyph: 'P', bg: '#3b82f6', fg: '#ffffff' },
    rating: 4.9,
    reviews: 9120,
    builtForShopifly: false,
    plans: [{ name: 'Pay as you go', price: 24, billing: 'monthly', trialDays: 7, features: ['Unlimited page designs', '100+ templates', 'Custom sections', 'Mobile editing'] }],
    loadTime: 0.25,
    effects: ['Improves your product page design score.', 'Adds some script weight to the product page.'],
    highlights: ['Popular with stores like yours'],
    unlocksSections: [],
    launched: 'Nov 2018',
    worksWith: ['Online Store 2.0 themes'],
  },
  {
    id: 'salespop',
    name: 'SalesPop Live Notifications',
    developer: 'PopMagic',
    category: 'conversion',
    tagline: '"Sarah from Austin just bought…" popups that create FOMO.',
    description:
      'Shows recent-purchase popups on every page. Can also show "sample" notifications before you have real sales. ' +
      'Claims to boost conversion up to 28%.',
    icon: { glyph: '🔔', bg: '#fef3c7', fg: '#92400e' },
    rating: 4.6,
    reviews: 4306,
    builtForShopifly: false,
    plans: [
      { name: 'Free', price: 0, billing: 'free', features: ['Recent sales popups', 'Basic styling'] },
      { name: 'Premium', price: 9.99, billing: 'monthly', trialDays: 7, features: ['Sample notifications', 'Custom timing', 'Remove branding'] },
    ],
    loadTime: 0.35,
    effects: ['Shows purchase popups on your storefront.', 'Loads on every page.'],
    highlights: ['Easy setup'],
    unlocksSections: [],
    launched: 'Jan 2017',
    worksWith: ['Online Store 2.0 themes'],
  },
  {
    id: 'spinwheel',
    name: 'SpinJoy Spin-to-Win Popup',
    developer: 'Growth Wheel Co',
    category: 'marketing',
    tagline: 'Gamified email popups that grow your list fast.',
    description:
      'A spin-the-wheel popup that trades a discount for an email address. Grows your list quickly. The popup covers ' +
      'the product page on phones, which some shoppers find annoying.',
    icon: { glyph: '◎', bg: '#10b981', fg: '#ffffff' },
    rating: 4.7,
    reviews: 2231,
    builtForShopifly: false,
    plans: [
      { name: 'Free', price: 0, billing: 'free', features: ['Spin-to-win popup', 'Up to 200 signups / month'] },
      { name: 'Growth', price: 14.99, billing: 'monthly', trialDays: 7, features: ['Unlimited signups', 'Klavio sync', 'Exit intent'] },
    ],
    loadTime: 0.25,
    effects: ['Roughly doubles how fast your email list grows.', 'The popup interrupts mobile shoppers.'],
    highlights: ['Easy setup'],
    unlocksSections: [],
    launched: 'Jun 2020',
    worksWith: ['Klavio'],
  },
  {
    id: 'currencyx',
    name: 'CurrencyX Converter',
    developer: 'Currency Hub',
    category: 'conversion',
    tagline: 'Show prices in 160+ currencies automatically.',
    description: 'Detects each visitor\'s location and converts your prices on the fly. Useful for stores that sell internationally.',
    icon: { glyph: '¤', bg: '#0891b2', fg: '#ffffff' },
    rating: 4.8,
    reviews: 3915,
    builtForShopifly: false,
    plans: [{ name: 'Free', price: 0, billing: 'free', features: ['160+ currencies', 'Auto-detect location', 'Currency switcher'] }],
    loadTime: 0.2,
    effects: ['Converts prices for international visitors.', 'Loads on every page.'],
    highlights: ['Free'],
    unlocksSections: [],
    launched: 'Aug 2016',
    worksWith: ['Online Store 2.0 themes'],
  },
  {
    id: 'seoboost',
    name: 'SEO Booster Ultra',
    developer: 'RankRocket',
    category: 'marketing',
    tagline: 'Rank #1 on search engines. Automatic SEO fixes.',
    description:
      'Automatically writes meta tags, compresses alt text and submits your sitemap. Claims to 10x your organic traffic. ' +
      'Organic search is a slow channel for new stores.',
    icon: { glyph: 'S', bg: '#f59e0b', fg: '#111827' },
    rating: 4.4,
    reviews: 1702,
    builtForShopifly: false,
    plans: [{ name: 'Pro', price: 19.99, billing: 'monthly', trialDays: 7, features: ['Auto meta tags', 'Image alt text', 'Sitemap submission', 'SEO reports'] }],
    loadTime: 0.15,
    effects: ['Slightly more organic search visits over time.'],
    highlights: ['Easy setup'],
    unlocksSections: [],
    launched: 'Mar 2021',
    worksWith: ['Online Store 2.0 themes'],
  },
]

export function appDef(id: string): AppDef | undefined {
  return APPS.find(a => a.id === id)
}

/** Klavio bills by active contacts (monthly USD). */
export const KLAVIO_TIERS: { maxContacts: number; price: number }[] = [
  { maxContacts: 250, price: 0 },
  { maxContacts: 500, price: 20 },
  { maxContacts: 1000, price: 30 },
  { maxContacts: 1500, price: 45 },
  { maxContacts: 2500, price: 60 },
  { maxContacts: 5000, price: 100 },
  { maxContacts: Infinity, price: 150 },
]
export function klavioPrice(contacts: number): number {
  return (KLAVIO_TIERS.find(t => contacts <= t.maxContacts) ?? KLAVIO_TIERS[KLAVIO_TIERS.length - 1]).price
}
