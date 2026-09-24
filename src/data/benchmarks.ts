// Real-world e-commerce & paid-social benchmarks that drive the simulation.
// Values are US-market, DTC/dropshipping-typical, 2024–2026. See docs/BENCHMARKS.md for sources.
// KEYS ARE A CONTRACT — sim code references them by name. Tune values, don't rename keys.
// "src:" = checked against that source. "est." = no good public source; game-design estimate.

export interface Range { bad: number; avg: number; good: number; great: number }

export const BENCHMARKS = {
  fadbook: {
    /** CPM in USD for broad US prospecting, average month (× cpmByMonth averages ≈ $14.2/yr) */
    cpmBase: 14, // src: Triple Whale 2025 median Meta CPM $14.19 (35k brands); TTM to Jul-2026 $15.06
    /** link CTR (link clicks / impressions) */
    ctrLink: { bad: 0.007, avg: 0.011, good: 0.018, great: 0.028 } as Range, // src: Databox median link CTR 1.03% (CTR-all ~1.8–2.2%, Triple Whale 2025)
    /** 3-second video plays / impressions ("hook rate") */
    hookRate: { bad: 0.18, avg: 0.26, good: 0.33, great: 0.42 } as Range, // src: Motion/AdSights 2025–26: <20% weak, ~25% baseline, 30–35% good, 40%+ elite
    /** ThruPlays (15s) / 3-second plays ("hold rate") */
    holdRate: { bad: 0.1, avg: 0.18, good: 0.25, great: 0.32 } as Range, // src: AdSights/Motion 2026 feed DTC prospecting: <10% poor, ~18% median, >30% strong (was 0.06/0.11/0.17/0.24)
    /** landing page views / link clicks */
    lpvRate: 0.82, // est. (practitioner norm 75–90%)
    /** frequency at which creative fatigue becomes noticeable (7-day, prospecting) */
    fatigueFrequency: 2.5, // src: Atria/AdSights 2026 fatigue guides: CTR slides from ~2.5 (7-day, DTC prospecting), most decay by 3.0 (was 2.8)
    learningConversions: 50, // src: Meta Business Help Center, ~50 optimization events per ad set; a 2024 test of 10 for purchase campaigns never became the default
    learningWindowDays: 7, // src: Meta Business Help Center (7 days since last significant edit)
    /** relative budget change that resets learning */
    significantBudgetChange: 0.2, // src: practitioner consensus (Meta only says "significant" budget edits reset learning)
    minDailyBudget: 1, // src: Meta minimum $1/day for impression-billed ad sets
    /** minimum daily budget for click/conversion-optimized ad sets (USD) */
    minDailyBudgetConversion: 5, // src: Meta minimum-budget rules as summarized by Stackmatix 2026
    /** new ad-account daily spend limit ladder (USD/day) */
    spendLimitLadder: [50, 250, 1500, 5000, Infinity], // est. Meta does not publish tiers; $50 / $250 / $1,500 are the practitioner-reported caps
    /** billing thresholds ladder (USD) — card charged when unbilled spend reaches threshold */
    billingThresholds: [25, 50, 250, 500, 750, 900], // src: Meta Help "About payment thresholds": new US accounts ~$25, then auto-raised; $750 is the common ceiling
    /** platform over-reporting of purchases vs. real (view-through / modeled) */
    reportedPurchaseInflation: { min: 1.05, max: 1.5 }, // src: WorkMagic Apr-2025: 37.7% of 7DC1DV purchases not incremental (≈1.6×), 12% for 7DC (≈1.14×) (was 1.0–1.25)
    lookalikeMinPurchasers: 100, // src: Meta Help, ≥100 people from one country in the source audience
    audienceSizeUS: { broad: 250_000_000, interest: [2_000_000, 25_000_000], lookalike1: 2_300_000, lookalike5: 11_000_000 }, // src: broad = Meta US ad audience ~253M (Affect/DataReportal 2025; was 210M); others est.
    /** Advantage+ Sales (ASC) ROAS vs. manual campaigns, as a relative lift */
    advantagePlusRoasLift: 0.22, // src: Meta-reported, secondhand: "$4.52 ROAS, +22% vs manual" (Q1-2025, trade coverage) and "17% lower cost per purchase" (Meta via Coinis). Treat as an upper bound
    /** share of iOS users who allow cross-app tracking (ATT). Everyone else is modeled or lost */
    iosAttOptInRate: 0.35, // src: Adjust Q2-2025 industry average 35%
  },
  tiktak: {
    cpmBase: 10.5, // src: Triple Whale 2025 ecommerce median $13.26; in-feed reports ~$9.16 (WebFX/DigitalApplied) (was 8.5)
    ctrLink: { bad: 0.005, avg: 0.009, good: 0.015, great: 0.024 } as Range, // src: Lebesgue 2026 0.61%, "0.8–1.5% solid" (AGrowth); Triple Whale CTR-all 1.77%
    /** 2-second video views / impressions */
    view2sRate: { bad: 0.2, avg: 0.28, good: 0.36, great: 0.45 } as Range, // src: AdSights median ~27% (20–35%); MHI/Billo <20% weak, 30–40% good, 40%+ excellent (was 0.30/0.42/0.52/0.62)
    /** 6-second video views / impressions */
    view6sRate: { bad: 0.08, avg: 0.14, good: 0.2, great: 0.28 } as Range, // src: AdSights median ~17% (12–22%); 6s runs ~40–60% below the 2s rate
    lpvRate: 0.72, // est. (in-app browser drops more clicks than Meta)
    fatigueFrequency: 1.8, // est. (TikTok creatives burn out faster; ~7-day refresh is the norm)
    learningConversions: 50, // src: TikTok Ads Help "About Learning Phase" (~50 conversions)
    learningWindowDays: 7, // src: TikTok Ads Help
    significantBudgetChange: 0.3, // src: TikTok Ads Help "About Budget": keep increases ≤30% after learning, ≤40% during learning (was 0.2)
    /** max single budget increase TikTok recommends while still in learning */
    maxBudgetIncreaseInLearning: 0.4, // src: TikTok Ads Help "About Budget"
    /** TikTok advises waiting at least this long between budget edits */
    minHoursBetweenBudgetChanges: 48, // src: TikTok Ads Help "About Budget" (no more than every 2 days)
    /** TikTok requires min $50/day campaign budget and $20/day ad group budget */
    minCampaignDailyBudget: 50, // src: TikTok Ads Help "About Budget"
    minAdGroupDailyBudget: 20, // src: TikTok Ads Help "About Budget"
    spendLimitLadder: [100, 500, 2000, 6000, Infinity], // est. TikTok publishes no daily cap tiers; the real gate is billing threshold plus payment history
    billingThresholds: [50, 100, 500, 1000, 2000], // est. TikTok Help: threshold rises automatically with spend; amounts not published
    reportedPurchaseInflation: { min: 0.8, max: 1.3 }, // est. (in-app browser under-counts; view-through over-counts)
    /** TikTak traffic converts worse than Fadbook traffic (younger, impulse, in-app browser) */
    cvrMultiplier: 0.72, // est. (platform CVRs don't show this because they count view-through purchases)
  },
  store: {
    /** sessions converted / sessions */
    cvr: { bad: 0.008, avg: 0.014, good: 0.032, great: 0.047 } as Range, // src: Littledata (2,800 Shopify stores): avg 1.4%, top 20% >3.2%, top 10% >4.7% (good was 0.03)
    /** sessions with add-to-cart / sessions */
    atcRate: { bad: 0.025, avg: 0.046, good: 0.075, great: 0.096 } as Range, // src: Littledata Shopify ATC avg 4.6%, top 20% 7.5%, top 10% 9.6% (was 0.03/0.06/0.09/0.13)
    /** sessions that reached checkout / sessions */
    checkoutRate: { bad: 0.015, avg: 0.03, good: 0.054, great: 0.071 } as Range, // src: derived, Littledata CVR ÷ checkout completion (45/59/66%) (good/great were 0.05/0.075)
    /** share of checkouts abandoned (typical 70% cart abandonment, ~45–60% checkout abandonment) */
    checkoutAbandon: 0.55, // src: Littledata Shopify checkout completion avg 45%; Baymard 2025 cart abandonment 70.19%
    mobileShare: 0.78, // src: Shopify BFCM 2025 ~69–75% of orders on mobile; paid-social traffic runs higher
    desktopShare: 0.19,
    tabletShare: 0.03,
    /** average CVR by device (Littledata Shopify benchmark) */
    cvrMobileAvg: 0.012, // src: Littledata
    cvrDesktopAvg: 0.019, // src: Littledata
    /** page load: every second over ~2.5s costs this much relative CVR */
    cvrLossPerSecondSlow: 0.1, // src: Portent 2022 (1s pages convert ~2.5× 5s pages ≈ −20%/s); Deloitte/Google "Milliseconds Make Millions" 2020; 7% is Aberdeen 2008 (was 0.07)
    baseThemeLoadSeconds: 1.8, // est.
    bounceRateAvg: 0.55, // est.
    returningCustomerRateDTC: 0.2, // est.
    /** typical Shopify average order value (USD) */
    aovShopifyAvg: 85, // src: Littledata Shopify AOV avg $85 (top 20% >$192)
    /** Shopify BFCM 2025 average cart (USD) */
    aovShopifyBfcm: 114.7, // src: Shopify press release, BFCM 2025
  },
  fees: {
    /** Shopifly Payments online card rate by plan */
    plans: {
      basic:    { monthly: 39,  cardPct: 0.029, cardFixed: 0.3, thirdPartyFee: 0.02 }, // src: shopify.com/pricing 2026 (Basic)
      shopifly: { monthly: 105, cardPct: 0.027, cardFixed: 0.3, thirdPartyFee: 0.01 }, // src: shopify.com/pricing 2026 ("Grow")
      advanced: { monthly: 399, cardPct: 0.025, cardFixed: 0.3, thirdPartyFee: 0.006 }, // src: shopify.com/pricing 2026 (Advanced)
    },
    /** discount for paying yearly instead of monthly */
    annualBillingDiscount: 0.25, // src: shopify.com/pricing 2026 (25% off yearly)
    /** intro offer: $1/month for first 3 months */
    trialMonthly: 1, // src: Shopify offer, checked Sep 2026 (3-day free trial, then $1/mo for 3 months)
    trialMonths: 3,
    payoutBusinessDays: 3, // src: Shopify Help "Payouts in the United States": 3 business-day minimum settlement, typically 3–5 (was 2)
    firstPayoutDelayDays: 7, // src: Shopify Help: new merchants settle slower ("up to 5 business days" ≈ 7 calendar days)
    domainYearly: 14, // src: Shopify blog 2026: .com via Shopify $11–16/yr
    paypalPct: 0.0349, // src: paypal.com/us/business/fees 2026 (PayPal Checkout)
    paypalFixed: 0.49, // src: paypal.com/us/business/fees 2026
  },
  chargebacks: {
    /** Processor-level lines. Stripe (which powers Shopify Payments) calls >0.75% "excessive";
     *  the game holds payouts at 1%. Card-network programs are listed below. */
    warnRatio: 0.0075, // src: Stripe Docs "Measuring disputes" (0.75% industry excessive line)
    thresholdRatio: 0.01, // est. game payout-hold line (Shopify publishes no number)
    feePerDispute: 15, // src: Shopify Help: $15 per chargeback, returned if you win
    /** win rate when you fight it yourself with tracking + delivery proof */
    winRateSelf: 0.32, // src: range 20% (Datos/Mastercard 2025, contested cases) to 45–54% (Chargebacks911 / Chargeflow stats 2026)
    /** win rate with a chargeback-automation app */
    winRateApp: 0.6, // est. (vendor claims only)
    /** fee charged by the app on recovered amounts */
    appFeeOnRecovered: 0.25, // src: chargeflow.io/pricing 2026 (25% of recovered)
    respondWithinDays: 7, // src: Shopify Help: evidence deadline typically 7–21 days (game uses the short end)
    /** Visa VAMP (replaced VDMP/VFMP Apr-2025): (TC40 fraud + TC15 disputes) / settled txns, monthly */
    visaVampExcessiveRatio: 0.015, // src: Stripe Docs / Visa: 1.5% US/CA/EU/AP from 1 Apr 2026 (2.2% Apr-2025→Mar-2026)
    visaVampExcessiveMinCount: 1500, // src: Stripe Docs (count AND ratio must both be exceeded)
    visaVampNonCompliantRatio: 0.005, // src: Stripe Docs (0.5% with ≥5 disputes+fraud)
    visaVampFeePerDispute: 8, // src: Chargeflow 2026 ($8 per dispute in Excessive tier)
    /** Mastercard Excessive Chargeback Merchant program */
    mastercardEcmRatio: 0.015, // src: Stripe Docs (1.5% AND 100 chargebacks; HECM 3% & 300)
    mastercardEcmMinCount: 100, // src: Stripe Docs
  },
  refunds: {
    /** baseline refund/return request rates by fulfillment model */
    dropship: 0.08, // est.
    bulk: 0.045, // est.
    privateLabel: 0.03, // est.
  },
  shipping: {
    /** delivery days to US customers (processing + transit) */
    aliStandard: [15, 30] as [number, number], // src: AliExpress Standard to US 15–25 business days (astools 2026) + 2–5 days customs since de minimis ended (was [12, 22])
    aliChoice: [7, 12] as [number, number], // src: AliExpress Choice US median 7 business days, p90 9–12 (4,200 tracked orders, 2026)
    agentExpress: [6, 10] as [number, number], // est.
    usWarehouse3pl: [2, 5] as [number, number], // est. (ground from US 3PL)
    /** sample orders to yourself */
    sample: [9, 16] as [number, number], // est.
    /** sea freight bulk to 3PL */
    seaFreightDays: [28, 40] as [number, number], // est.
    airFreightDays: [8, 14] as [number, number], // est.
    threePlPickPackPerOrder: 3.25, // src: Fulfillment Advisor 2025 survey (600+ warehouses): B2C pick-pack avg $3.20
    threePlStoragePerUnitMonth: 0.35, // est. (pallets $18–40/mo per 2025–26 3PL surveys)
    /** WISMO ("where is my order") ticket rate per order when delivery > promised */
    wismoRateLate: 0.35, // est.
    wismoRateOnTime: 0.05, // est.
    /** US $800 de minimis suspended: China/HK 2 May 2025, all countries 29 Aug 2025, made indefinite Jun 2026 */
    usDeMinimisSuspended: true, // src: CBP / Federal Register 2026-12670; upheld by CIT Aug 2026
    /** combined ad-valorem duty on typical Chinese consumer goods, applied to declared (supplier) value.
     *  MFN + legacy Sec. 301 (7.5% or 25%) + 12.5% Sec. 301 forced-labor tariff from 24 Jul 2026 */
    chinaDutyPct: [0.23, 0.4] as [number, number], // src: Honigman / Zonos Jul-2026; IEEPA tariffs struck down Feb 2026
    /** extra transit days from customs entry on low-value parcels */
    customsExtraDays: [2, 5] as [number, number], // src: china-fulfillment.com 2026 guide
  },
  seasonality: {
    /** CPM multiplier by month (Jan..Dec) */
    cpmByMonth: [0.78, 0.85, 0.93, 0.95, 1.0, 0.98, 0.97, 1.0, 1.05, 1.07, 1.42, 1.15], // src: Jan −22% / Nov +41% vs avg (Admanage/Sovran 2026); Varos: Nov +33% over Oct, Dec −18% vs Nov (Oct was 1.15, Dec 1.30)
    /** CVR multiplier by month (Jan..Dec) */
    cvrByMonth: [0.85, 0.92, 0.97, 0.98, 1.0, 0.98, 0.97, 1.0, 1.0, 1.03, 1.2, 1.15], // est.
    /** BFCM week (Thu before Black Friday through Cyber Monday). Multiplier vs cpmBase: use it
     *  INSTEAD of cpmByMonth[10] during the window, not stacked on top */
    bfcmCpmMult: 1.6, // src: Triple Whale BFCM 2025 Meta CPM $22.26 vs 2025 median $14.19 = 1.57× (was 1.75)
    bfcmCvrMult: 1.35, // est. (stores running deep discounts report ~2×; a no-discount dropshipper gets far less)
    /** Dec 20–31: CPM falls off, shipping cutoffs kill CVR for slow-shipping stores */
    lateDecCpmMult: 0.85, // src: Varos: Dec CPM −18% vs Nov, Jan −23% vs Dec
    /** Mon..Sun */
    cpmByWeekday: [1.02, 1.0, 1.0, 1.02, 1.01, 0.95, 0.96], // est.
    cvrByWeekday: [1.03, 1.02, 1.0, 1.0, 0.97, 0.96, 1.02], // est.
    /** share of daily ad delivery / store traffic by hour (0..23), sums to 1 */
    trafficByHour: [
      0.023, 0.015, 0.009, 0.007, 0.007, 0.011, 0.019, 0.032, 0.042, 0.047, 0.051, 0.053,
      0.055, 0.054, 0.053, 0.053, 0.054, 0.057, 0.061, 0.065, 0.067, 0.066, 0.058, 0.041,
    ], // est. evening peak. Rescaled: the old array summed to 0.95, not 1.0
  },
  cny: {
    /** supplier shutdown length (days) around Chinese New Year */
    shutdownDays: [14, 28] as [number, number], // src: Titoma / ODM Group 2026–27: most factories fully closed 2–4 weeks, 6–8 weeks of total disruption (was [14, 24])
    /** warn players this many days before */
    warnDaysBefore: [42, 28, 14, 7],
    /** extra dropship delivery delay during/after shutdown */
    extraDelayDays: [10, 20] as [number, number], // est.
    /** Lunar New Year day (official holiday ~Feb 15–23 in 2026, Feb 4–12 in 2027) */
    lunarNewYearDates: ['2026-02-17', '2027-02-06', '2028-01-26'],
    /** share of factory workers who don't come back after the holiday */
    workerNonReturnRate: [0.1, 0.3] as [number, number], // src: Titoma 2026 CNY guide
  },
  creatives: {
    ugcCreatorCost: [150, 400] as [number, number], // src: Billo 2025 avg ~$198/video; median ~$175; premium creators $300–500
    ugcDeliveryDays: [4, 8] as [number, number], // est.
    agencyCost3Pack: [1500, 3500] as [number, number], // est.
    agencyDeliveryDays: [7, 14] as [number, number], // est.
    selfShootHours: [2, 4] as [number, number], // est.
    supplierEditHours: 1.5, // est.
    /** share of new ads that become "winners" (small → large spenders) */
    winnerRate: [0.038, 0.082] as [number, number], // src: Motion Creative Benchmarks 2026 (550k ads, $1.3B spend)
  },
  life: {
    /** fast-food hourly wages */
    wages: { crew: 16, shiftLead: 18.5, manager: 23 }, // src: BLS OEWS May-2024 fast-food/counter median $14.65; food-prep supervisors May-2025 median $21.19; CA fast-food minimum $20 (Apr-2024)
    payrollTaxRate: 0.12, // est. (7.65% FICA + ~4–5% income-tax withholding)
    /** estimated income/self-employment tax on business profit, paid quarterly in Normal/Realistic */
    businessTaxRate: 0.25, // est. (15.3% SE tax on 92.35% of profit + low federal bracket)
    creditCard: { startLimit: 2000, apr: 0.2799, minPaymentPct: 0.02, lateFee: 35 }, // src: Fed G.19 Q2-2026 avg APR on accounts paying interest 22.15%; starter/fair-credit cards run ~28%; late fee ~$30–41 after the CFPB $8 cap was vacated in 2025
    startingCash: 1850,
  },
} as const

export type Benchmarks = typeof BENCHMARKS
