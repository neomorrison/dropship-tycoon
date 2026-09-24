// Ecom Academy content: rules of thumb, glossary, benchmark tables, courses and Coach Kev's FAQ.
// Numbers are read from src/data/benchmarks.ts so the Academy always matches the simulation;
// the wording follows docs/BENCHMARKS.md "Rules of thumb (Ecom Academy)". OWNER: ui-life-sites.
import type { SkillId } from '../../../core/types'
import { BENCHMARKS as B } from '../../../data/benchmarks'

// ---------------------------------------------------------------------------
// formatting helpers
// ---------------------------------------------------------------------------
/** 0.011 → "1.1%", 0.3 → "30%" */
export const pc = (x: number, d = 1) => {
  const v = (x * 100).toFixed(d)
  return `${v.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')}%`
}
const usd0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const usd2 = (n: number) => `$${n.toFixed(2)}`
const range = (r: readonly [number, number] | number[], unit = '') => `${r[0]}–${r[1]}${unit}`
const cpmAvg = (base: number) => base * (B.seasonality.cpmByMonth.reduce((a, b) => a + b, 0) / 12)
const nov = B.seasonality.cpmByMonth[10]
const jan = B.seasonality.cpmByMonth[0]

// worked break-even example (Basic plan card fees)
const exPrice = 40
const exLanded = 14
const exFees = +(exPrice * B.fees.plans.basic.cardPct + B.fees.plans.basic.cardFixed).toFixed(2)
const exMargin = +(exPrice - exLanded - exFees).toFixed(2)
const exBeRoas = +(exPrice / exMargin).toFixed(2)
const learnBudget = (cpa: number) => Math.round((cpa * B.fadbook.learningConversions) / B.fadbook.learningWindowDays)

// ---------------------------------------------------------------------------
// Rules of thumb (25), grouped
// ---------------------------------------------------------------------------
export interface Rule { n: number; title: string; body: string; bullets?: string[] }
export interface RuleGroup { id: string; title: string; rules: Rule[] }

export const RULE_GROUPS: RuleGroup[] = [
  {
    id: 'ads', title: 'Reading your ads',
    rules: [
      { n: 1, title: 'Judge link CTR, not "CTR (all)"', body: `On Fadbook, a link CTR under ${pc(B.fadbook.ctrLink.bad)} means the hook or offer is weak. About ${pc(B.fadbook.ctrLink.avg)} is normal and ${pc(B.fadbook.ctrLink.good)}+ is good. On TikTak, under ${pc(B.tiktak.ctrLink.bad)} is weak and about ${pc(B.tiktak.ctrLink.avg)} is normal.` },
      { n: 2, title: 'Hook rate', body: `3-second views ÷ impressions. Under ${pc(B.fadbook.hookRate.bad, 0)} means the first 3 seconds need fixing. ${pc(B.fadbook.hookRate.avg, 0)} is average and ${pc(B.fadbook.hookRate.good, 0)}+ is good. A strong hook is cheaper than a new product.` },
      { n: 3, title: 'Hold rate', body: `ThruPlays ÷ 3-second views. Under ${pc(B.fadbook.holdRate.bad, 0)} means people stopped scrolling but left before the offer — rebuild seconds 4–15. About ${pc(B.fadbook.holdRate.avg, 0)} is average and ${pc(B.fadbook.holdRate.good, 0)}+ is good.` },
      { n: 4, title: 'TikTak view rates', body: `A 2-second view rate under ${pc(B.tiktak.view2sRate.bad, 0)} is a weak opener and ${pc((B.tiktak.view2sRate.avg + B.tiktak.view2sRate.good) / 2 - 0.02, 0)}+ is working. A 6-second view rate under ${pc(B.tiktak.view6sRate.bad, 0)} means the middle of the video loses people.` },
      {
        n: 5, title: 'Diagnose the funnel in order', body: 'CTR, then add-to-cart, then checkout, then purchase. Fix the first stage that is below benchmark — fixing a later stage won\'t help if too few people get that far.',
        bullets: [
          `Good CTR but add-to-cart under ${pc(B.store.atcRate.bad)}: the product page, price or trust is the problem.`,
          `Good add-to-cart but purchase rate under ${pc(0.01, 0)}: the checkout is the problem — surprise shipping costs, slow shipping promises or missing payment options.`,
        ],
      },
    ],
  },
  {
    id: 'store', title: 'Store benchmarks',
    rules: [
      { n: 6, title: 'Conversion rate', body: `Under ${pc(B.store.cvr.bad)} is bad, ${pc(B.store.cvr.avg)} is the Shopifly average, ${pc(B.store.cvr.good)}+ is top 20% and ${pc(B.store.cvr.great)}+ is top 10%. Mobile converts about 40% worse than desktop (${pc(B.store.cvrMobileAvg)} vs ${pc(B.store.cvrDesktopAvg)}).` },
      { n: 7, title: 'Abandonment is normal', body: `About 70% of carts are abandoned and more than half of checkouts are (${pc(B.store.checkoutAbandon, 0)}). Recover some with abandoned-checkout emails.` },
      { n: 8, title: 'Speed', body: `Each extra second of load time over ~2.5 s costs roughly ${pc(B.store.cvrLossPerSecondSlow, 0)} of your sales.` },
    ],
  },
  {
    id: 'money', title: 'Money math',
    rules: [
      {
        n: 9, title: 'Break-even ROAS = price ÷ (price − landed cost − fees)', body: 'Anything below it loses money on every sale. Refunds and chargebacks raise the bar further.',
        bullets: [
          'Landed cost = product + shipping + import duty.',
          `Fees = card fee (${pc(B.fees.plans.basic.cardPct)} + ${Math.round(B.fees.plans.basic.cardFixed * 100)}¢ on Basic) plus any app or gateway fees.`,
          `Example: a ${usd0(exPrice)} price, ${usd0(exLanded)} landed cost and ${usd2(exFees)} in fees leaves ${usd2(exMargin)}. Break-even ROAS is ${exPrice} ÷ ${exMargin} = ${exBeRoas}, and break-even CPA is ${usd2(exMargin)}.`,
        ],
      },
      {
        n: 10, title: 'Trust Shopifly over the ad dashboard', body: 'Judge profit on your store\'s real orders: MER = total revenue ÷ total ad spend.',
        bullets: [
          `Fadbook's default attribution (7-day click + 1-day view) can over-count purchases by up to ~${B.fadbook.reportedPurchaseInflation.max}×. Sales from people who only saw an ad get counted.`,
        ],
      },
      {
        n: 11, title: 'Cash flow kills stores that are profitable on paper', body: 'Keep a buffer of at least a week of ad spend.',
        bullets: [
          `Shopifly pays out ${B.fees.payoutBusinessDays} business days after a sale at the earliest (your very first payout takes ~${B.fees.firstPayoutDelayDays} days).`,
          'Your ad card gets charged every time spend hits the billing threshold.',
        ],
      },
      { n: 12, title: 'Import duty is real now', body: `The US de minimis exemption is gone. Budget ~${pc(B.shipping.chinaDutyPct[0], 0)}–${pc(B.shipping.chinaDutyPct[1], 0)} duty on the supplier price of Chinese goods, plus ${range(B.shipping.customsExtraDays)} extra shipping days.` },
      { n: 13, title: 'Credit cards are a last resort', body: `A starter card charges about ${pc(B.life.creditCard.apr, 0)} APR, while a winning ad account can double money in a week. Scaling a loser on the card is how people go broke.` },
    ],
  },
  {
    id: 'scale', title: 'Scaling and the algorithm',
    rules: [
      { n: 14, title: 'Learning phase', body: `An ad set needs about ${B.fadbook.learningConversions} purchases in ${B.fadbook.learningWindowDays} days to exit learning on either platform. The daily budget needed is about CPA × ${B.fadbook.learningConversions} ÷ ${B.fadbook.learningWindowDays}. At a $30 CPA that's ~${usd0(learnBudget(30))}/day.` },
      {
        n: 15, title: 'Scale gently', body: 'To grow faster, duplicate the ad set instead of jacking up one budget.',
        bullets: [
          `On Fadbook, raise budgets no more than ~${pc(B.fadbook.significantBudgetChange, 0)} at a time or you risk resetting learning.`,
          `On TikTak, the official limit is ≤${pc(B.tiktak.significantBudgetChange, 0)} per edit after learning (≤${pc(B.tiktak.maxBudgetIncreaseInLearning, 0)} during), with at least ${B.tiktak.minHoursBetweenBudgetChanges} hours between edits.`,
        ],
      },
      { n: 16, title: 'Creative fatigue', body: `On prospecting, a 7-day frequency over ~${B.fadbook.fatigueFrequency} means fatigue is starting, and over 3 means refresh now. TikTak creatives burn out faster (plan a new batch every ~7 days).` },
      { n: 17, title: 'Most creatives lose', body: `Only about ${pc(B.creatives.winnerRate[0], 0)}–${pc(B.creatives.winnerRate[1], 0)} of ads become winners, so a small brand should expect roughly 1 in 12–25. Test many cheap variations and give real budget only to the winners.` },
      { n: 18, title: 'Minimums', body: `Fadbook allows $${B.fadbook.minDailyBudget}/day ($${B.fadbook.minDailyBudgetConversion} for conversion goals). TikTak requires $${B.tiktak.minCampaignDailyBudget}/day per campaign and $${B.tiktak.minAdGroupDailyBudget}/day per ad group.` },
      { n: 19, title: 'New ad accounts are capped', body: `About $${B.fadbook.spendLimitLadder[0]}/day at first; the cap rises as you pay bills on time. A failed payment on a new account is the fastest way to get restricted.` },
    ],
  },
  {
    id: 'disputes', title: 'Disputes',
    rules: [
      {
        n: 20, title: `Keep chargebacks under ${pc(B.chargebacks.warnRatio, 2)} of orders`, body: 'Every dispute counts, even the ones you win.',
        bullets: [
          `Above ~${pc(B.chargebacks.thresholdRatio, 0)}, expect payout holds.`,
          `The card networks' own programs start at ${pc(B.chargebacks.visaVampExcessiveRatio)}.`,
        ],
      },
      { n: 21, title: 'A refund is cheaper than a chargeback', body: `A chargeback costs the order + a $${B.chargebacks.feePerDispute} fee + the goods. Answer "where is my order?" emails fast, give tracking, and refund angry customers before they call their bank.` },
      { n: 22, title: 'When you fight a dispute', body: `Send tracking with proof of delivery and your customer messages, matched to the reason code, before the deadline (often only ${B.chargebacks.respondWithinDays} days). Self-fought wins run ~20–50%. Chargeback apps charge ${pc(B.chargebacks.appFeeOnRecovered, 0)} of what they recover.` },
    ],
  },
  {
    id: 'calendar', title: 'Calendar',
    rules: [
      {
        n: 23, title: 'Q4 and "Q5"', body: `November CPMs run ~${pc(nov - 1, 0)} above average, and BFCM week is ~${B.seasonality.bfcmCpmMult}× normal. Conversion rates also rise, so good offers still work.`,
        bullets: [
          `January is the cheapest month (~${pc(1 - jan, 0)} below average) — the "Q5" window for testing.`,
          'Late-December ads are cheap, but slow-shipping stores miss Christmas delivery.',
        ],
      },
      { n: 24, title: 'Chinese New Year', body: `Chinese suppliers go dark for ${Math.round(B.cny.shutdownDays[0] / 7)}–${Math.round(B.cny.shutdownDays[1] / 7)} weeks, with 6–8 weeks of total slowdown and ${pc(B.cny.workerNonReturnRate[0], 0)}–${pc(B.cny.workerNonReturnRate[1], 0)} of workers not returning. Stock up or switch suppliers 4–6 weeks before, and warn customers about slower shipping.` },
      { n: 25, title: 'Shipping speed sets refunds and disputes', body: `AliExprez Standard takes ${range(B.shipping.aliStandard, ' days')}, AliExprez Choice ${range(B.shipping.aliChoice)}, and a US 3PL ${range(B.shipping.usWarehouse3pl)}. Promising faster than you can deliver generates "not received" chargebacks.` },
    ],
  },
]

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------
export type TermCat = 'Ads' | 'Store' | 'Money' | 'Creative' | 'Ops'
export interface Term { term: string; aka?: string; cat: TermCat; def: string; formula?: string; bench?: string; tip?: string }

export const GLOSSARY: Term[] = [
  { term: 'CPM', aka: 'cost per mille', cat: 'Ads', def: 'What you pay for 1,000 ad impressions. Driven by the auction: season, competition, audience and how engaging your ad is.', formula: 'spend ÷ impressions × 1,000', bench: `Fadbook ≈ $${cpmAvg(B.fadbook.cpmBase).toFixed(0)}, TikTak ≈ $${cpmAvg(B.tiktak.cpmBase).toFixed(0)} on average; November +${pc(nov - 1, 0)}, January −${pc(1 - jan, 0)}.`, tip: 'Better creatives get cheaper CPMs — the platform rewards ads people engage with.' },
  { term: 'Link CTR', aka: 'click-through rate (link)', cat: 'Ads', def: 'Share of impressions that clicked through to your store. The clearest read on whether the hook and offer land.', formula: 'link clicks ÷ impressions', bench: `Fadbook ${pc(B.fadbook.ctrLink.bad)} bad · ${pc(B.fadbook.ctrLink.avg)} avg · ${pc(B.fadbook.ctrLink.good)} good · TikTak ${pc(B.tiktak.ctrLink.bad)} / ${pc(B.tiktak.ctrLink.avg)} / ${pc(B.tiktak.ctrLink.good)}.`, tip: 'Ignore "CTR (all)": it counts likes, profile taps and "see more".' },
  { term: 'CPC (link)', cat: 'Ads', def: 'Average cost of one click to your store.', formula: 'spend ÷ link clicks = CPM ÷ (1,000 × CTR)', tip: 'CPC only matters together with conversion rate: cost per purchase = CPC ÷ CVR.' },
  { term: 'Hook rate', cat: 'Ads', def: 'Share of impressions that watched at least 3 seconds of your video. Measures the opening.', formula: '3-second plays ÷ impressions', bench: `${pc(B.fadbook.hookRate.bad, 0)} weak · ${pc(B.fadbook.hookRate.avg, 0)} avg · ${pc(B.fadbook.hookRate.good, 0)} good · ${pc(B.fadbook.hookRate.great, 0)} elite.` },
  { term: 'Hold rate', cat: 'Ads', def: 'Of the people who got hooked, how many kept watching to 15 seconds. Measures the body of the video.', formula: 'ThruPlays ÷ 3-second plays', bench: `${pc(B.fadbook.holdRate.bad, 0)} poor · ${pc(B.fadbook.holdRate.avg, 0)} avg · ${pc(B.fadbook.holdRate.good, 0)}+ strong.` },
  { term: '2s / 6s view rate', cat: 'Ads', def: 'TikTak\'s version of hook and hold: 2-second and 6-second views per impression.', bench: `2s: ${pc(B.tiktak.view2sRate.bad, 0)} weak · ${pc(B.tiktak.view2sRate.avg, 0)} avg. 6s: ${pc(B.tiktak.view6sRate.bad, 0)} weak · ${pc(B.tiktak.view6sRate.avg, 0)} avg.` },
  { term: 'Frequency', cat: 'Ads', def: 'Average number of times each person saw your ad (7-day, per ad set).', formula: 'impressions ÷ reach', bench: `Fatigue starts around ${B.fadbook.fatigueFrequency} on Fadbook and ${B.tiktak.fatigueFrequency} on TikTak.`, tip: 'Rising frequency + falling CTR = the audience is tired of this creative. Refresh it.' },
  { term: 'CPA', aka: 'cost per acquisition / purchase', cat: 'Ads', def: 'Ad spend per purchase.', formula: 'spend ÷ purchases', tip: 'Compare with your break-even CPA. Use Shopifly orders, not only platform-reported purchases.' },
  { term: 'ROAS', aka: 'return on ad spend', cat: 'Ads', def: 'Revenue the platform attributes to your ads per dollar spent.', formula: 'attributed revenue ÷ spend', tip: `Platforms over-report (up to ~${B.fadbook.reportedPurchaseInflation.max}× on Fadbook). Cross-check with MER.` },
  { term: 'Break-even ROAS', cat: 'Money', def: 'The ROAS where a sale pays exactly for its product, shipping, fees and the ads that sold it.', formula: 'price ÷ (price − landed cost − fees)', bench: `Healthy winners usually sit at 1.6–2.2. Example: ${usd0(exPrice)} price, ${usd0(exLanded)} landed → ${exBeRoas}.`, tip: 'The lower it is, the more ad inefficiency your product can survive.' },
  { term: 'Break-even CPA', cat: 'Money', def: 'The most you can pay for one purchase without losing money.', formula: 'price − landed cost − fees' },
  { term: 'MER', aka: 'marketing efficiency ratio / blended ROAS', cat: 'Money', def: 'All store revenue divided by all ad spend. Can\'t be gamed by attribution settings.', formula: 'total revenue ÷ total ad spend', tip: 'If MER is below your break-even ROAS, the business is losing money no matter what Ads Manager says.' },
  { term: 'Landed cost', cat: 'Money', def: 'Everything it costs to get one unit to the customer.', formula: 'product cost + shipping + import duty', bench: `Duty on Chinese goods ≈ ${pc(B.shipping.chinaDutyPct[0], 0)}–${pc(B.shipping.chinaDutyPct[1], 0)} of the supplier price.` },
  { term: 'Gross margin', cat: 'Money', def: 'What\'s left of each sale after product, shipping and payment fees — before ads.', formula: '(price − landed cost − fees) ÷ price', tip: 'Aim to price at 3×+ landed cost so ads have room to work.' },
  { term: 'AOV', aka: 'average order value', cat: 'Store', def: 'Average revenue per order.', formula: 'revenue ÷ orders', bench: `Shopifly average ≈ $${B.store.aovShopifyAvg}.`, tip: 'Bundles and post-purchase upsells raise AOV — and your break-even CPA with it.' },
  { term: 'CVR', aka: 'conversion rate', cat: 'Store', def: 'Share of store sessions that became an order.', formula: 'orders ÷ sessions', bench: `${pc(B.store.cvr.bad)} bad · ${pc(B.store.cvr.avg)} avg · ${pc(B.store.cvr.good)} top 20% · ${pc(B.store.cvr.great)} top 10%.` },
  { term: 'ATC rate', aka: 'add-to-cart rate', cat: 'Store', def: 'Share of sessions that added the product to the cart. Mostly a verdict on the product page and price.', formula: 'sessions with add-to-cart ÷ sessions', bench: `${pc(B.store.atcRate.bad)} bad · ${pc(B.store.atcRate.avg)} avg · ${pc(B.store.atcRate.good)} good.` },
  { term: 'LPV', aka: 'landing page view', cat: 'Ads', def: 'A click that actually loaded your page. Slow pages lose clicks before the page even appears.', bench: `Fadbook ~${pc(B.fadbook.lpvRate, 0)} of link clicks, TikTak ~${pc(B.tiktak.lpvRate, 0)}.` },
  { term: 'Learning phase', cat: 'Ads', def: 'The period after launch or a significant edit when the algorithm explores who to show your ad to. Costs are higher and less stable.', bench: `Exit after ~${B.fadbook.learningConversions} purchases in ${B.fadbook.learningWindowDays} days. "Learning limited" = not enough conversions.`, tip: `Budget changes over ${pc(B.fadbook.significantBudgetChange, 0)} (Fadbook) or ${pc(B.tiktak.significantBudgetChange, 0)} (TikTak) restart learning.` },
  { term: 'CBO / ABO', cat: 'Ads', def: 'Campaign budget optimization: one budget, the platform splits it across ad sets. Ad set budget optimization: you set each ad set\'s budget.', tip: 'ABO for controlled tests, CBO to scale proven ad sets.' },
  { term: 'Broad targeting', cat: 'Ads', def: 'No interests: age, gender and country only. With a trained pixel it\'s usually the cheapest and most scalable audience.' },
  { term: 'Lookalike', cat: 'Ads', def: 'An audience of people similar to your buyers.', bench: `Needs ~${B.fadbook.lookalikeMinPurchasers}+ purchasers in the source.` },
  { term: 'Retargeting', cat: 'Ads', def: 'Ads to people who already visited or added to cart. Converts far better, but the audience is tiny and gets expensive fast.' },
  { term: 'Attribution window', cat: 'Ads', def: 'How long after a click or view a purchase is credited to an ad. Fadbook defaults to 7-day click + 1-day view.', tip: 'View-through credit inflates results. Your store\'s real order count is the truth.' },
  { term: 'Pixel', cat: 'Ads', def: 'Tracking code that reports store events (views, add-to-carts, purchases) back to the ad platform so it can optimize for buyers.', tip: 'Install the sales-channel app before you spend a dollar. No pixel = no purchase optimization.' },
  { term: 'Advantage+ / Smart+', cat: 'Ads', def: 'Automated campaign types where the platform controls targeting and placements.', bench: `Platform-reported lift up to ~${pc(B.fadbook.advantagePlusRoasLift, 0)} vs manual — treat as an upper bound.` },
  { term: 'Cost cap', cat: 'Ads', def: 'A bid strategy that tries to keep your average CPA under a target. Delivers less when the cap is too tight.' },
  { term: 'Spend limit & billing threshold', cat: 'Ads', def: 'New ad accounts have a daily spend cap and bill your card each time unbilled spend reaches a threshold.', bench: `Caps start near $${B.fadbook.spendLimitLadder[0]}/day; thresholds start at $${B.fadbook.billingThresholds[0]} and climb.`, tip: 'A declined billing charge pauses every campaign on the account.' },
  { term: 'Hook', cat: 'Creative', def: 'The first 1–3 seconds of an ad: the visual and on-screen text that stop the scroll.', tip: '3–12 words, speak to "you", name the pain or the payoff, no ALL CAPS.' },
  { term: 'Angle', cat: 'Creative', def: 'The reason-to-buy the ad argues: pain point, convenience, gift, savings, social proof…', tip: 'Test different angles, not just different videos with the same message.' },
  { term: 'UGC', aka: 'user-generated content', cat: 'Creative', def: 'Ads that look like a real customer filmed them. Native to TikTak and Reels.', bench: `Creators charge ~$${B.creatives.ugcCreatorCost[0]}–${B.creatives.ugcCreatorCost[1]} per video.` },
  { term: 'Creative fatigue', cat: 'Creative', def: 'An ad\'s performance decays as the same people see it again. Shared supplier footage fatigues faster because other stores run it too.' },
  { term: 'Spark Ads', cat: 'Creative', def: 'TikTak ads that boost an organic post, keeping its likes and comments as social proof.' },
  { term: 'Compare-at price', cat: 'Store', def: 'The crossed-out "was" price. A believable discount (15–50%) helps; 70%+ off looks fake and hurts trust.' },
  { term: 'Perceived value', cat: 'Store', def: 'What shoppers feel the product is worth. Amazin prices and the product\'s look are the best public clues.', tip: 'Price at roughly 75–100% of perceived value.' },
  { term: 'Social proof', cat: 'Store', def: 'Reviews, photos and ratings that show other people bought and liked it.', tip: 'A 4.3–4.8 average reads as real. A perfect 5.0 looks suspicious.' },
  { term: 'WISMO', aka: 'where is my order', cat: 'Ops', def: 'The most common support ticket. Caused by slow shipping and missing tracking.', bench: `~${pc(B.shipping.wismoRateLate, 0)} of late orders open one vs ~${pc(B.shipping.wismoRateOnTime, 0)} on-time.` },
  { term: 'Chargeback', cat: 'Ops', def: 'A customer disputes the charge with their bank. You lose the money plus a fee unless you win with evidence.', bench: `$${B.chargebacks.feePerDispute} fee · keep the ratio under ${pc(B.chargebacks.warnRatio, 2)} · respond within ${B.chargebacks.respondWithinDays} days.` },
  { term: 'Chargeback ratio', cat: 'Ops', def: 'Disputes as a share of orders over the last 30 days.', formula: 'disputes ÷ orders', bench: `> ${pc(B.chargebacks.warnRatio, 2)} warning · > ${pc(B.chargebacks.thresholdRatio, 0)} payout holds.` },
  { term: 'Payout', cat: 'Money', def: 'Shopifly sending your sales (minus fees) to your bank.', bench: `${B.fees.payoutBusinessDays} business days after the sale; the first payout takes ~${B.fees.firstPayoutDelayDays} days.` },
  { term: 'Shopifly Capital', aka: 'merchant cash advance', cat: 'Money', def: 'A lump sum repaid by withholding a share of every payout, with a flat fee instead of interest.' },
  { term: 'APR', cat: 'Money', def: 'Annual interest rate on a card balance you carry past the due date.', bench: `Starter card ≈ ${pc(B.life.creditCard.apr)}; late fee $${B.life.creditCard.lateFee}.`, tip: 'Pay the statement balance in full and purchases cost no interest.' },
  { term: 'Estimated taxes', cat: 'Money', def: 'Quarterly prepayments of tax on self-employed profit (Apr 15, Jun 15, Sep 15, Jan 15).', bench: `~${pc(B.life.businessTaxRate, 0)} of business profit.` },
  { term: 'COGS', aka: 'cost of goods sold', cat: 'Ops', def: 'What the product itself costs you, per unit sold.' },
  { term: 'MOQ', aka: 'minimum order quantity', cat: 'Ops', def: 'The smallest bulk order a factory will accept — usually hundreds of units.' },
  { term: 'Sourcing agent', cat: 'Ops', def: 'A middleman in China who buys, quality-checks and ships for you. Cheaper and faster than marketplace dropshipping at volume.', bench: `Agent shipping ≈ ${range(B.shipping.agentExpress, ' days')}.` },
  { term: '3PL', aka: 'third-party logistics', cat: 'Ops', def: 'A US warehouse that stores your inventory and ships orders in days.', bench: `Delivery ${range(B.shipping.usWarehouse3pl, ' days')} · pick & pack ≈ $${B.shipping.threePlPickPackPerOrder} · storage ≈ $${B.shipping.threePlStoragePerUnitMonth}/unit/month.` },
  { term: 'Sea vs air freight', cat: 'Ops', def: 'How bulk stock gets to the 3PL. Sea is cheap and slow, air is fast and expensive.', bench: `Sea ${range(B.shipping.seaFreightDays, ' days')} · air ${range(B.shipping.airFreightDays, ' days')}.` },
  { term: 'Private label', cat: 'Ops', def: 'Your own brand on the product and packaging. Higher MOQ, but better conversion, fewer refunds and fewer copycats.' },
  { term: 'De minimis', cat: 'Ops', def: 'The old US rule that let parcels under $800 enter duty-free. It\'s suspended, so every China-origin parcel pays duty.' },
  { term: 'CNY', aka: 'Chinese New Year', cat: 'Ops', def: 'Factories close for weeks around the Lunar New Year; shipping from China slows for 6–8 weeks.' },
  { term: 'BFCM', aka: 'Black Friday / Cyber Monday', cat: 'Store', def: 'The biggest shopping weekend of the year. CPMs spike, conversion rates rise.', bench: `CPM ≈ ${B.seasonality.bfcmCpmMult}× normal that week.` },
  { term: 'Q5', cat: 'Ads', def: 'Late December through January: ad costs crash after the holidays — a cheap window to test.' },
]

// ---------------------------------------------------------------------------
// Benchmark tables
// ---------------------------------------------------------------------------
export interface BenchRow { metric: string; bad: string; avg: string; good: string; great: string; note?: string }
export interface BenchTable { id: string; title: string; rows: BenchRow[] }
const rangeRow = (metric: string, r: { bad: number; avg: number; good: number; great: number }, d = 1, note?: string): BenchRow =>
  ({ metric, bad: `< ${pc(r.bad, d)}`, avg: pc(r.avg, d), good: pc(r.good, d), great: `${pc(r.great, d)}+`, note })

export const BENCH_TABLES: BenchTable[] = [
  {
    id: 'fadbook', title: 'Fadbook ads',
    rows: [
      rangeRow('Link CTR', B.fadbook.ctrLink, 1),
      rangeRow('Hook rate (3s plays ÷ impressions)', B.fadbook.hookRate, 0),
      rangeRow('Hold rate (ThruPlays ÷ 3s plays)', B.fadbook.holdRate, 0),
      { metric: 'CPM (yearly average)', bad: '—', avg: `$${cpmAvg(B.fadbook.cpmBase).toFixed(2)}`, good: '—', great: '—', note: `Nov ×${nov}, Jan ×${jan}, BFCM ×${B.seasonality.bfcmCpmMult}` },
      { metric: 'Fatigue frequency (7-day)', bad: '—', avg: `${B.fadbook.fatigueFrequency}`, good: '—', great: '—', note: 'refresh by 3.0' },
      { metric: 'Learning exit', bad: '—', avg: `${B.fadbook.learningConversions} / ${B.fadbook.learningWindowDays} days`, good: '—', great: '—', note: `edits > ${pc(B.fadbook.significantBudgetChange, 0)} reset it` },
    ],
  },
  {
    id: 'tiktak', title: 'TikTak ads',
    rows: [
      rangeRow('Link CTR', B.tiktak.ctrLink, 1),
      rangeRow('2-second view rate', B.tiktak.view2sRate, 0),
      rangeRow('6-second view rate', B.tiktak.view6sRate, 0),
      { metric: 'CPM (yearly average)', bad: '—', avg: `$${cpmAvg(B.tiktak.cpmBase).toFixed(2)}`, good: '—', great: '—' },
      { metric: 'Minimum budgets', bad: '—', avg: `$${B.tiktak.minCampaignDailyBudget} campaign`, good: `$${B.tiktak.minAdGroupDailyBudget} ad group`, great: '—', note: 'per day' },
      { metric: 'Budget edits', bad: '—', avg: `≤ ${pc(B.tiktak.significantBudgetChange, 0)}`, good: '—', great: '—', note: `${B.tiktak.minHoursBetweenBudgetChanges} h apart` },
    ],
  },
  {
    id: 'store', title: 'Store funnel',
    rows: [
      rangeRow('Conversion rate', B.store.cvr, 1),
      rangeRow('Add-to-cart rate', B.store.atcRate, 1),
      rangeRow('Reached checkout', B.store.checkoutRate, 1),
      { metric: 'Checkout abandonment', bad: '—', avg: pc(B.store.checkoutAbandon, 0), good: '—', great: '—', note: 'normal' },
      { metric: 'Mobile share of traffic', bad: '—', avg: pc(B.store.mobileShare, 0), good: '—', great: '—' },
      { metric: 'Speed penalty', bad: '—', avg: `−${pc(B.store.cvrLossPerSecondSlow, 0)}/s`, good: '≤ 2.5 s', great: '—', note: 'per second over 2.5 s' },
      { metric: 'Average order value', bad: '—', avg: `$${B.store.aovShopifyAvg}`, good: '—', great: '—' },
    ],
  },
  {
    id: 'money', title: 'Fees, payouts & disputes',
    rows: [
      { metric: 'Card processing (Basic)', bad: '—', avg: `${pc(B.fees.plans.basic.cardPct)} + ${Math.round(B.fees.plans.basic.cardFixed * 100)}¢`, good: '—', great: '—' },
      { metric: 'Payout timing', bad: '—', avg: `${B.fees.payoutBusinessDays} business days`, good: '—', great: '—', note: `first payout ~${B.fees.firstPayoutDelayDays} days` },
      { metric: 'Chargeback ratio', bad: `> ${pc(B.chargebacks.thresholdRatio, 0)}`, avg: `< ${pc(B.chargebacks.warnRatio, 2)}`, good: '—', great: '—', note: `$${B.chargebacks.feePerDispute} fee each` },
      { metric: 'Dispute win rate', bad: '—', avg: `${pc(B.chargebacks.winRateSelf, 0)} yourself`, good: `${pc(B.chargebacks.winRateApp, 0)} with an app`, great: '—', note: `app keeps ${pc(B.chargebacks.appFeeOnRecovered, 0)}` },
      { metric: 'Refund rate (dropship)', bad: '—', avg: pc(B.refunds.dropship, 0), good: `${pc(B.refunds.bulk)} bulk`, great: `${pc(B.refunds.privateLabel, 0)} private label` },
    ],
  },
  {
    id: 'ship', title: 'Shipping & imports',
    rows: [
      { metric: 'AliExprez Standard', bad: '—', avg: range(B.shipping.aliStandard, ' days'), good: '—', great: '—' },
      { metric: 'AliExprez Choice', bad: '—', avg: range(B.shipping.aliChoice, ' days'), good: '—', great: '—' },
      { metric: 'Sourcing agent', bad: '—', avg: range(B.shipping.agentExpress, ' days'), good: '—', great: '—' },
      { metric: 'US 3PL', bad: '—', avg: range(B.shipping.usWarehouse3pl, ' days'), good: '—', great: '—' },
      { metric: 'Import duty (China)', bad: '—', avg: `${pc(B.shipping.chinaDutyPct[0], 0)}–${pc(B.shipping.chinaDutyPct[1], 0)}`, good: '—', great: '—', note: `+${range(B.shipping.customsExtraDays)} days customs` },
      { metric: 'Bulk freight', bad: '—', avg: `sea ${range(B.shipping.seaFreightDays, ' d')}`, good: `air ${range(B.shipping.airFreightDays, ' d')}`, great: '—' },
    ],
  },
]

export const CPM_BY_MONTH = B.seasonality.cpmByMonth

// ---------------------------------------------------------------------------
// Courses (one per skill)
// ---------------------------------------------------------------------------
export interface Lesson { title: string; minutes: number; body: string[] }
export interface Course { skill: SkillId; title: string; tagline: string; color: string; lessons: Lesson[] }

export const COURSES: Course[] = [
  {
    skill: 'research', title: 'Finding Products That Actually Sell', tagline: 'Read demand, competition and margin before you spend a dollar on ads.', color: '#f59e0b',
    lessons: [
      {
        title: 'Demand signals vs. vanity numbers', minutes: 12, body: [
          'Big order counts tell you a product sells — not that it will sell for you. Look for orders that are climbing, not just high.',
          'Supplier ratings are a defect detector. A listing under ~4.4 stars with repeated complaints ("stopped working", "smaller than pictured") becomes refunds, chargebacks and angry emails.',
          'The Amazin price is your best public clue to perceived value: it tells you what shoppers are already willing to pay for something similar.',
          'Research sessions go deeper each time: competitor prices first, then trend direction and complaint themes, then perceived value and what the top competitor ads lean on.',
        ],
      },
      {
        title: 'Do the margin math first', minutes: 10, body: [
          `Landed cost = product + shipping + import duty (${pc(B.shipping.chinaDutyPct[0], 0)}–${pc(B.shipping.chinaDutyPct[1], 0)} of the supplier price on Chinese goods).`,
          'A product needs room for ads. Aim for a price of at least 3× landed cost; commodity items that Amazin sells for 2× your cost can\'t pay for advertising.',
          `Break-even ROAS = price ÷ (price − landed − fees). Under ~2 is workable; the example ${usd0(exPrice)} product at ${usd0(exLanded)} landed breaks even at ${exBeRoas}.`,
        ],
      },
      {
        title: 'Saturation and timing', minutes: 9, body: [
          'Many advertisers running ads for months = a saturated product: CPMs are bid up and customers have seen it everywhere.',
          'Few advertisers, recent ads and unusually high engagement = an early product. That\'s the window worth racing for.',
          'Check seasonality: gift items boom in Q4 and around Valentine\'s and Mother\'s Day; summer products die in October.',
        ],
      },
      {
        title: 'Red flags', minutes: 8, body: [
          'Health, beauty and "results" products trigger ad rejections and account bans — especially with before/after creative.',
          'Low ratings, fragile items and complicated sizing mean refunds.',
          'If the product looks amazing but the numbers look too good, research deeper. Traps look exactly like winners until the refunds arrive.',
        ],
      },
      {
        title: 'Validate cheaply', minutes: 11, body: [
          'Order a sample: you need it to film your own creatives anyway, and you\'ll see the quality your customers get.',
          'Launch with 3+ creatives on different hooks at $30–50/day. Judge on real Shopifly orders.',
          'Kill fast: an ad set that spends 2× your break-even CPA without a sale is telling you something.',
        ],
      },
    ],
  },
  {
    skill: 'copywriting', title: 'Product Pages That Convert', tagline: 'Titles, descriptions, offers and trust — the page is half the ad.', color: '#ec4899',
    lessons: [
      {
        title: 'Titles', minutes: 6, body: [
          '25–70 characters. Name the product in plain words plus the main benefit.',
          'Never paste the supplier title ("2026 New Hot Sale Upgraded…"). Shoppers read it as a scam and so does the page grader.',
          'No ALL CAPS, no "Free Shipping" in the title — put that in the offer.',
        ],
      },
      {
        title: 'Descriptions that sell benefits', minutes: 14, body: [
          '80–400 words, broken into short paragraphs with a few headings and 3–7 bullets.',
          'Lead with the outcome ("Your couch, hair-free in 30 seconds"), then explain how. Features support benefits; they don\'t replace them.',
          'Talk to the reader: "you" and "your". Mention your guarantee and a realistic shipping window.',
          'Answer the objections a buyer would have: will it fit, does it work on my X, what if I don\'t like it.',
        ],
      },
      {
        title: 'Price, compare-at and offers', minutes: 10, body: [
          'Price at roughly 75–100% of what the product feels worth. Too cheap reads as junk; far above perceived value kills conversion.',
          'A compare-at price 15–50% above your price is believable. 70%+ off looks fake.',
          'Bundles ("buy 2, save 15%") and free shipping raise AOV — and your break-even CPA with it.',
        ],
      },
      {
        title: 'Trust and honesty', minutes: 9, body: [
          'Reviews with photos, a 4.3–4.8 average (5.0 looks fake), filled-in policies, contact info and a guarantee.',
          'Promise the delivery window you can actually hit. Promising faster sells a bit more this week and triples "item not received" chargebacks next month.',
          'Scarcity timers are powerful once. Countdown + "only 3 left" on every product is a lie customers notice.',
        ],
      },
      {
        title: 'Speed and mobile', minutes: 7, body: [
          `${pc(B.store.mobileShare, 0)} of your traffic is on a phone. Sticky add-to-cart, short sections, fast images.`,
          `Every second over ~2.5 s costs ~${pc(B.store.cvrLossPerSecondSlow, 0)} of sales. Each app you install adds weight.`,
        ],
      },
    ],
  },
  {
    skill: 'creative', title: 'Ads That Stop the Scroll', tagline: 'Hooks, angles, beats and testing — the creative is the targeting now.', color: '#8b5cf6',
    lessons: [
      {
        title: 'The first three seconds', minutes: 10, body: [
          `Hook rate under ${pc(B.fadbook.hookRate.bad, 0)} means the opening doesn't stop anyone. Fix the hook before anything else.`,
          'On-screen text: 3–12 words, speak to "you", use a POV, a question or a number, name the pain or the payoff.',
          'Avoid generic openers ("Best product ever!", "Buy now") and ALL CAPS.',
        ],
      },
      {
        title: 'Formats and angles', minutes: 12, body: [
          'Demo videos sell problem-solvers. Before/after only works when the transformation is real and visible.',
          'Gift angles shine in Q4 and before holidays. ASMR and unboxing suit tactile, satisfying products.',
          'On TikTak, native-looking UGC beats polished studio ads; static images are weak for cold traffic there.',
          'Test different angles, not just re-edits of the same message.',
        ],
      },
      {
        title: 'Beat structure', minutes: 8, body: [
          'A reliable order: hook → problem → demo → social proof → offer → call to action. 4–7 beats is the sweet spot.',
          'Put the problem before the demo when you sell a pain point. End on a clear CTA.',
        ],
      },
      {
        title: 'Production', minutes: 9, body: [
          'Supplier footage is fast and free — and every other store runs it, so it fatigues quickly.',
          'Self-shot quality depends on light, camera and your space. A $39 ring light is the cheapest upgrade in the game.',
          `UGC creators cost ~$${B.creatives.ugcCreatorCost[0]}–${B.creatives.ugcCreatorCost[1]} per video; agencies deliver polish at $${B.creatives.agencyCost3Pack[0].toLocaleString('en-US')}+ per pack.`,
        ],
      },
      {
        title: 'Testing and fatigue', minutes: 10, body: [
          `Only ${pc(B.creatives.winnerRate[0], 0)}–${pc(B.creatives.winnerRate[1], 0)} of ads become winners. Launch batches, not single ads.`,
          `Watch frequency: past ~${B.fadbook.fatigueFrequency} on Fadbook (lower on TikTak), CTR slides. Have the next creative ready before the winner dies.`,
          'Insights on a creative only mean something after about 1,000 impressions.',
        ],
      },
    ],
  },
  {
    skill: 'media_buying', title: 'Testing, Reading & Scaling Ads', tagline: 'Structure tests, read the real numbers and scale without breaking learning.', color: '#0866ff',
    lessons: [
      {
        title: 'Account setup', minutes: 8, body: [
          'Install the pixel (sales-channel app) first. Without it the platform can\'t optimize for purchases.',
          `New accounts are capped around $${B.fadbook.spendLimitLadder[0]}/day and bill your card at low thresholds. Pay on time and both rise.`,
          `TikTak minimums: $${B.tiktak.minCampaignDailyBudget}/day per campaign and $${B.tiktak.minAdGroupDailyBudget}/day per ad group.`,
        ],
      },
      {
        title: 'How to test', minutes: 12, body: [
          'Broad targeting, purchase optimization, 3+ creatives with different hooks, $30–50/day.',
          'Give a test enough spend to judge: about 2× your break-even CPA before you call it.',
          'Kill ads that spend 2× break-even CPA with no purchase. Keep ads beating break-even ROAS.',
        ],
      },
      {
        title: 'Reading the numbers', minutes: 12, body: [
          'Diagnose in funnel order: CTR → add-to-cart → checkout → purchase. Fix the first broken stage.',
          `Platforms over-report purchases (Fadbook up to ~${B.fadbook.reportedPurchaseInflation.max}×). Your Shopifly orders and MER are the truth.`,
          'Tracking outages make reported sales drop while real sales hold. Panic-killing a winner during one is an expensive mistake.',
        ],
      },
      {
        title: 'The learning phase', minutes: 9, body: [
          `~${B.fadbook.learningConversions} conversions in ${B.fadbook.learningWindowDays} days to exit learning. Budget needed ≈ CPA × ${B.fadbook.learningConversions} ÷ ${B.fadbook.learningWindowDays}.`,
          `Budget changes over ${pc(B.fadbook.significantBudgetChange, 0)} on Fadbook (${pc(B.tiktak.significantBudgetChange, 0)} on TikTak), new ads and targeting edits restart it.`,
        ],
      },
      {
        title: 'Scaling', minutes: 11, body: [
          'Scale ad sets beating ~1.3× break-even ROAS by 15–20% a day. On TikTak wait 48 hours between edits.',
          'Need faster growth? Duplicate the winning ad set rather than doubling its budget.',
          'Every dollar of scale hits your card before the payout lands. Scale only as fast as your cash can float.',
        ],
      },
    ],
  },
  {
    skill: 'operations', title: 'Cash, Customers & Suppliers', tagline: 'The unglamorous half of the business — where stores actually die.', color: '#10b981',
    lessons: [
      {
        title: 'Cash flow', minutes: 11, body: [
          `Payouts land ${B.fees.payoutBusinessDays} business days after a sale (your first takes ~${B.fees.firstPayoutDelayDays} days). Ad billing hits your card immediately.`,
          'Keep at least a week of ad spend in cash. A declined billing charge pauses every campaign on the account.',
          `Card balances you carry cost ~${pc(B.life.creditCard.apr, 0)} APR. Pay the statement in full.`,
        ],
      },
      {
        title: 'Customer support', minutes: 9, body: [
          '"Where is my order?" is most of your inbox. Tracking pages and honest shipping promises cut it dramatically.',
          'Answer within 48 hours. Unanswered tickets turn into refunds, bad reviews and chargebacks.',
          'A refund is cheaper than a chargeback. Refund angry customers before they call their bank.',
        ],
      },
      {
        title: 'Chargebacks', minutes: 10, body: [
          `Keep disputes under ${pc(B.chargebacks.warnRatio, 2)} of orders. Above ${pc(B.chargebacks.thresholdRatio, 0)} expect payout holds.`,
          `Win with tracking, proof of delivery, your policies and customer messages — before the ${B.chargebacks.respondWithinDays}-day deadline.`,
          `Self-fought win rate ≈ ${pc(B.chargebacks.winRateSelf, 0)}; automation apps win more but keep ${pc(B.chargebacks.appFeeOnRecovered, 0)} of what they recover.`,
        ],
      },
      {
        title: 'Shipping and sourcing', minutes: 12, body: [
          `AliExprez Standard ${range(B.shipping.aliStandard)} days, Choice ${range(B.shipping.aliChoice)}, sourcing agent ${range(B.shipping.agentExpress)}, US 3PL ${range(B.shipping.usWarehouse3pl)}.`,
          'An agent unlocks at volume: cheaper units, faster shipping, quality control.',
          `Bulk stock in a 3PL ships in days. Sea freight takes ${range(B.shipping.seaFreightDays)} days, air ${range(B.shipping.airFreightDays)}. Storage costs ~$${B.shipping.threePlStoragePerUnitMonth}/unit/month, so don't overbuy.`,
        ],
      },
      {
        title: 'The calendar', minutes: 8, body: [
          'Chinese New Year shuts factories for weeks. Stock up 4–6 weeks before it.',
          'BFCM: CPMs spike but buyers are ready. Have stock and a real offer.',
          'December: slow shipping misses Christmas. January: the cheapest ads of the year — test aggressively.',
        ],
      },
    ],
  },
]
export const COURSE_BY_SKILL = Object.fromEntries(COURSES.map(c => [c.skill, c])) as Record<SkillId, Course>

// ---------------------------------------------------------------------------
// Coach Kev FAQ (general knowledge; "Ask Kev about my business" uses the live analysis)
// ---------------------------------------------------------------------------
export interface Faq { q: string; a: string[] }
export const KEV_FAQ: Faq[] = [
  {
    q: 'When should I kill an ad?',
    a: [
      'When it has spent about 2× your break-even CPA and Shopifly shows no sale from it, cut it.',
      `Early warning signs before that: link CTR under ${pc(B.fadbook.ctrLink.bad)} or hook rate under ${pc(B.fadbook.hookRate.bad, 0)} after ~3,000 impressions.`,
      'Don\'t judge on one day of data, and don\'t kill during a tracking outage just because reported purchases dipped.',
    ],
  },
  {
    q: 'How fast can I scale a winner?',
    a: [
      `About ${pc(B.fadbook.significantBudgetChange, 0)} a day on Fadbook; up to ${pc(B.tiktak.significantBudgetChange, 0)} on TikTak with 48 hours between edits. Bigger jumps restart learning.`,
      'Want more? Duplicate the ad set at the same budget.',
      'And check your card: scaling means billing charges before payouts arrive.',
    ],
  },
  {
    q: 'What\'s a good CTR and hook rate?',
    a: [
      `Fadbook link CTR: ${pc(B.fadbook.ctrLink.avg)} is average, ${pc(B.fadbook.ctrLink.good)}+ is good. TikTak: ${pc(B.tiktak.ctrLink.avg)} average.`,
      `Hook rate: ${pc(B.fadbook.hookRate.avg, 0)} average, ${pc(B.fadbook.hookRate.good, 0)}+ good. Hold rate: ${pc(B.fadbook.holdRate.avg, 0)} average.`,
    ],
  },
  {
    q: 'Ads Manager says ROAS 3, but my bank account disagrees. Why?',
    a: [
      `Platforms credit view-through and modeled conversions — Fadbook can over-count by up to ~${B.fadbook.reportedPurchaseInflation.max}×.`,
      'Use MER: total Shopifly revenue ÷ total ad spend. Compare it to your break-even ROAS.',
      'Then remember product cost, shipping, duty, fees, apps and refunds. Revenue is vanity, profit is sanity.',
    ],
  },
  {
    q: 'How do I set my price?',
    a: [
      'Start from perceived value: what similar items sell for on Amazin and how premium yours looks.',
      'Price around 75–100% of that, and make sure it\'s at least ~3× your landed cost so ads have room.',
      'The 2× markup your import tool suggests is almost never enough.',
    ],
  },
  {
    q: 'When can I quit McDoodle\'s?',
    a: [
      'When the store\'s monthly profit — after ads, product, apps and staff — has covered your rent, bills and food for about three months straight.',
      'And when you have a cash buffer for ad billing that doesn\'t depend on your credit card.',
    ],
  },
  {
    q: 'When should I buy inventory?',
    a: [
      'When a product sells consistently every day and you have months of sales data. Bulk stock in a US 3PL cuts shipping from weeks to days — fewer refunds, fewer disputes.',
      'Order enough to cover the sea-freight wait, and stock up well before Chinese New Year.',
    ],
  },
  {
    q: 'How do I avoid chargebacks?',
    a: [
      'Promise honest shipping times, give tracking, and answer support tickets within 48 hours.',
      'Refund unhappy customers quickly — a refund costs less than a chargeback plus its fee.',
      'Avoid products with high defect complaints. The reviews usually warn you.',
    ],
  },
]
