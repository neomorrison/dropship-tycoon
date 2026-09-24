# Dropship Tycoon: Real-World Benchmarks

Every number the simulation uses lives in `src/data/benchmarks.ts`. This page says where each number comes from, how the game uses it, and what it means for a player. The Ecom Academy glossary is built from the "Rules of thumb" section at the end.

- **Market:** US, DTC and dropshipping stores, 2024–2026 data. Last checked **September 2026**.
- **Ranges:** `bad / avg / good / great` roughly means bottom 20% / median / top 20% / top 10%, unless a row says otherwise.
- **Labels:** **src** = checked against the linked source. **est.** = no reliable public number exists, so the value is a design estimate. Treat est. rows as tunable.
- **Game names:** Fadbook = Meta (Facebook/Instagram), TikTak = TikTok, Shopifly = Shopify.

---

## 1. Fadbook (Meta) ads

| Metric | bad | avg | good | great / value | Source | Notes |
|---|---|---|---|---|---|---|
| CPM, broad US prospecting (`cpmBase`) | | **$14** | | | [Triple Whale 2025 benchmarks](https://www.triplewhale.com/2025-ecommerce-benchmarks), [Triple Whale FB benchmarks](https://www.triplewhale.com/blog/facebook-ads-benchmarks) | Median Meta CPM across ~35k ecommerce brands was $14.19 in 2025 (+20% YoY), and $15.06 for Aug-2025 to Jul-2026. Monthly multipliers average ≈1.01, so the yearly mean works out to ≈$14.2. |
| Link CTR (`ctrLink`) | 0.7% | 1.1% | 1.8% | 2.8% | [Databox FB benchmarks](https://databox.com/benchmarks/facebook-benchmarks) | Databox median link CTR is 1.03%. "CTR (all)" is roughly double that (1.8–2.2%) because it counts likes, profile taps and "see more", so never compare link CTR against a CTR (all) benchmark. |
| Hook rate = 3s plays ÷ impressions (`hookRate`) | 18% | 26% | 33% | 42% | [Motion Creative Benchmarks 2026](https://motionapp.com/thumbstop-pulse/cb2026-key-benchmarks-and-insights), [AdSights view rate](https://www.adsights.ai/resources/glossary/metrics/view-rate), [SparkUGC hook benchmarks](https://www.sparkugc.com/resources/hook-rate-benchmarks-2026) | Under 15% is a kill zone, 15–20% means fix the opening, ~25% is the baseline, 35–45% is elite. Blended account averages land at 18–28%. |
| Hold rate = ThruPlays ÷ 3s plays (`holdRate`) | 10% | 18% | 25% | 32% | [AdSights hold rate](https://www.adsights.ai/resources/glossary/metrics/hold-rate), [AdLibrary hold rate](https://adlibrary.com/posts/hold-rate) | **Changed** from 6/11/17/24%. Feed DTC prospecting: under 10% is poor, ~18% median, over 30% strong. Reels runs about 5 points higher. |
| Landing-page views ÷ link clicks (`lpvRate`) | | 82% | | | est. | Slow pages and accidental taps cause the gap. |
| Fatigue frequency, 7-day (`fatigueFrequency`) | | **2.5** | | | [Atria 2026](https://www.tryatria.com/blog/meta-creative-fatigue-diagnose-and-fix-2026), [AdSights fatigue](https://www.adsights.ai/blog/topics/creative-strategy/creative-fatigue-in-meta-ads-detection-and-management-strategies) | **Changed** from 2.8. CTR starts sliding around 2.5 on prospecting, and most ads are decaying by 3.0. |
| Learning phase (`learningConversions`, `learningWindowDays`) | | 50 events / 7 days | | | [Meta Help: learning phase](https://www.facebook.com/business/help/112167992830700), [Madgicx on the 2024 test](https://madgicx.com/blog/meta-lowers-learning-phase-requirement-for-select-campaigns) | Counted per ad set, since the last significant edit. Meta tested a 10-event threshold for purchase campaigns in 2024, but 50 is still the documented standard. |
| Budget change that resets learning (`significantBudgetChange`) | | 20% | | | Practitioner consensus | Meta only says that "significant" budget edits can restart learning. The 20% line is the community's working rule. |
| Min daily budget (`minDailyBudget`, `minDailyBudgetConversion`) | | $1 / $5 | | | [Stackmatix 2026](https://www.stackmatix.com/blog/facebook-ads-minimum-budget-requirements) | $1/day for impression-billed ad sets and $5/day for click or conversion goals. Exiting learning takes about CPA × 50 ÷ 7 per day. |
| Daily spend-limit ladder (`spendLimitLadder`) | | $50 → $250 → $1,500 → $5,000 → none | | | [Meta Help: daily spending limits](https://www.facebook.com/business/help/563129151097553) | est. Meta confirms that new accounts get a temporary daily cap which rises as bills are paid, but it doesn't publish the tiers. $50, $250 and $1,500 are the caps practitioners report. |
| Billing thresholds (`billingThresholds`) | | $25 → $50 → $250 → $500 → $750 → $900 | | | [Meta Help: payment thresholds](https://en-gb.facebook.com/business/help/776240779095515) | New US accounts start around $25. Meta raises the threshold automatically after on-time payments, and most advertisers top out near $750. |
| Reported ÷ real purchases (`reportedPurchaseInflation`) | | 1.05–1.5× | | | [WorkMagic incrementality analysis, Apr-2025](https://www.workmagic.io/blog/incremental-attribution-meta), [Dataslayer on 2026 attribution changes](https://www.dataslayer.ai/blog/meta-attribution-change-2026-what-engage-through-attribution-is-and-why-your-numbers-look-different) | **Changed** from 1.0–1.25. Under the default 7-day-click + 1-day-view window, 37.7% of attributed purchases were not incremental (≈1.6×). Under 7-day click only, 12% were not (≈1.14×). Since March 2026, Meta also has a separate 1-day "engage-through" bucket. |
| Lookalike source minimum (`lookalikeMinPurchasers`) | | 100 people | | | [Jon Loomer: lookalikes](https://www.jonloomer.com/meta-ads-lookalike-audiences/) | 100 people from one country is the minimum. Meta recommends 1,000–5,000. |
| US broad audience (`audienceSizeUS.broad`) | | 250M | | | [Affect: Meta audience in the USA 2025](https://affectgroup.com/blog/meta-ads-audience-in-the-united-states-facebook-and-instagram-capacity-in-2025/) | **Changed** from 210M. The Meta US ad audience is ~253M (119M men + 134.5M women). Interest and lookalike sizes are estimates. |
| Advantage+ ROAS lift (`advantagePlusRoasLift`) *(new)* | | +22% | | | [Venti Scale summary of Meta's claim](https://www.ventiscale.com/blog/meta-advantage-plus-roas-ecommerce-2026) | Meta's own claim ($4.52 vs $3.70 ROAS), treated as an upper bound. Independent data (Wicked Reports, 2025) found new-customer CAC doubled on Advantage+. |
| iOS ATT opt-in (`iosAttOptInRate`) *(new)* | | 35% | | | [Adjust ATT opt-in 2025](https://www.adjust.com/blog/att-opt-in-rates-2025/) | Only about a third of iOS users allow tracking. The other conversions are modeled or never reported. |

**How the game uses these.** An ad's CPM is `cpmBase × cpmByMonth × cpmByWeekday`, and during BFCM the BFCM multiplier replaces the month multiplier. Each creative gets a hidden quality score, which is mapped onto the `bad…great` bands to produce hook rate, hold rate and link CTR. Clicks × `lpvRate` gives sessions. Frequency above `fatigueFrequency` erodes CTR. An ad set stays in "Learning" until it gets 50 purchases in 7 days. A budget edit above the threshold sends it back to learning. The Ads Manager purchase count is the real count × a random draw from `reportedPurchaseInflation`, and the store dashboard always shows the real count. Spend is limited by the spend-limit ladder, and the player's card is charged each time unbilled spend reaches the current billing threshold.

---

## 2. TikTak (TikTok) ads

| Metric | bad | avg | good | great / value | Source | Notes |
|---|---|---|---|---|---|---|
| CPM (`cpmBase`) | | **$10.50** | | | [Triple Whale TikTok benchmarks](https://www.triplewhale.com/blog/tiktok-benchmarks), [Lebesgue 2026](https://lebesgue.io/tiktok-ads/tiktok-ads-benchmarks-for-ctr-cr-and-cpm) | **Changed** from $8.50. Triple Whale's 2025 ecommerce median was $13.26 (+16% YoY). In-feed reports put it at ~$9.16, and Lebesgue's broad figure is $4.80. $10.50 is a US-prospecting midpoint. |
| Link CTR (`ctrLink`) | 0.5% | 0.9% | 1.5% | 2.4% | [Lebesgue 2026](https://lebesgue.io/tiktok-ads/tiktok-ads-benchmarks-for-ctr-cr-and-cpm), [Triple Whale TikTok](https://www.triplewhale.com/blog/tiktok-benchmarks) | Lebesgue measures 0.61% on conversion campaigns, and agencies call 0.8–1.5% solid. Triple Whale's 1.77% is CTR (all). |
| 2s view rate = 2s views ÷ impressions (`view2sRate`) | 20% | 28% | 36% | 45% | [AdSights view rate](https://www.adsights.ai/resources/glossary/metrics/view-rate), [SparkUGC](https://www.sparkugc.com/resources/hook-rate-benchmarks-2026) | **Changed** from 30/42/52/62%. The median is ~27%, with a typical range of 20–35%. Under 20% is weak and 40%+ is excellent. |
| 6s view rate (`view6sRate`) | 8% | 14% | 20% | 28% | [AdSights view rate](https://www.adsights.ai/resources/glossary/metrics/view-rate), [TikTok metrics glossary](https://ads.tiktok.com/resources/help/article/all-metrics?lang=en) | The median is ~17% (12–22%). The 6s rate usually runs 40–60% below the 2s rate. |
| Learning phase | | 50 conv / 7 days | | | [TikTok Help: learning phase](https://ads.tiktok.com/help/article/learning-phase) | Counted per ad group. |
| Budget change that resets learning (`significantBudgetChange`) | | **30%** | | | [TikTok Help: About Budget](https://ads.tiktok.com/help/article/budget) | **Changed** from 20%. TikTok's official advice is to raise budgets at most 40% per edit during learning and 30% after learning, and to edit no more than once every 2 days. Those limits are the new keys `maxBudgetIncreaseInLearning` and `minHoursBetweenBudgetChanges`. |
| Min budgets (`minCampaignDailyBudget`, `minAdGroupDailyBudget`) | | $50 / $20 per day | | | [TikTok Help: About Budget](https://ads.tiktok.com/help/article/budget) | Official. A lifetime budget must be at least days × $20. |
| Spend ladder / billing thresholds | | see file | | | [TikTok Help: billing threshold](https://ads.tiktok.com/resources/help/article/how-to-manage-your-billing-threshold-for-automatic-payment?lang=en), [TikTok ad account limits](https://ads.tiktok.com/help/article/ad-account-limits) | est. TikTok publishes no daily-cap tiers. The billing threshold rises automatically with spend, and the amounts aren't published. |
| Reported ÷ real purchases | | 0.8–1.3× | | | [Attribuly 2026](https://attribuly.com/blogs/shopify-attribution-mismatches-meta-vs-tiktok-2026/) | est. The in-app browser loses some purchases, while view-through attribution over-credits others. |
| CVR vs Fadbook traffic (`cvrMultiplier`) | | 0.72× | | | est. | Platform-reported CVRs don't show this penalty because they include view-through purchases. Shopify-side data does. |
| Fatigue frequency | | 1.8 | | | est. | TikTok creatives are usually refreshed every ~7 days. |

**How the game uses these.** The pipeline is the same as Fadbook, except that 2s and 6s view rates replace hook and hold. TikTak refuses budgets below $50/day per campaign and $20/day per ad group. Its traffic converts at `cvrMultiplier` × the store's normal CVR.

---

## 3. Store funnel (Shopifly)

| Metric | bad | avg | good | great / value | Source | Notes |
|---|---|---|---|---|---|---|
| Conversion rate, orders ÷ sessions (`cvr`) | 0.8% | 1.4% | **3.2%** | 4.7% | [Littledata Shopify CVR](https://www.littledata.io/average/ecommerce-conversion-rate-(all-devices)) | Littledata benchmarked 2,800 Shopify stores. Top 20% is above 3.2% and top 10% above 4.7%. **good changed** from 3.0%. The "bad" value is an estimate. |
| CVR by device (`cvrMobileAvg`, `cvrDesktopAvg`) *(new)* | | 1.2% / 1.9% | | | Littledata (same) | The top 10% of stores reach 3.9% on mobile and 6.5% on desktop. |
| Add-to-cart rate (`atcRate`) | 2.5% | **4.6%** | **7.5%** | **9.6%** | [Littledata website benchmarks](https://www.littledata.io/average-website-performance) | **Changed** from 3/6/9/13%. The average is 4.6%, top 20% 7.5%, top 10% 9.6%. |
| Reached checkout (`checkoutRate`) | 1.5% | 3.0% | 5.4% | 7.1% | Derived from Littledata | Calculated as CVR ÷ checkout completion (45 / 59 / 66%). good and great changed from 5% / 7.5%. |
| Checkout abandonment (`checkoutAbandon`) | | 55% | | | [Littledata](https://www.littledata.io/average-website-performance), [Baymard](https://baymard.com/lists/cart-abandonment-rate) | Shopify checkout completion averages 45%, top 10% is 66%. Baymard puts cart abandonment at 70.19%, which matches 1.4% ÷ 4.6%. |
| Device mix (`mobileShare` etc.) | | 78 / 19 / 3% | | | [Shopify BFCM 2025](https://www.shopify.com/investors/press-releases/shopify-merchants-achieve-record-breaking-14-6-billion-in-black-friday-cyber-monday-sales) | Around 69–75% of BFCM orders were placed on mobile. Stores that live on paid-social traffic run higher. |
| CVR loss per extra second of load (`cvrLossPerSecondSlow`) | | **10%** | | | [Portent 2022](https://portent.com/blog/analytics/research-site-speed-hurting-everyones-revenue.htm), [Deloitte/Google "Milliseconds Make Millions"](https://web.dev/case-studies/milliseconds-make-millions) | **Changed** from 7%. Portent found 1s pages convert ~2.5× better than 5s pages (≈ −20%/s, correlational). Deloitte measured +8.4% retail conversions from a 0.1s speed-up. The old 7% figure dates from 2008. |
| AOV (`aovShopifyAvg`, `aovShopifyBfcm`) *(new)* | | $85 / $114.70 | | | [Littledata](https://www.littledata.io/average-website-performance), [Shopify BFCM 2025](https://www.shopify.com/investors/press-releases/shopify-merchants-achieve-record-breaking-14-6-billion-in-black-friday-cyber-monday-sales) | The top 20% of Shopify stores have an AOV above $192. |
| Theme load time, bounce rate, returning-customer rate | | 1.8s / 55% / 20% | | | est. | |

**How the game uses these.** Sessions from ads go through the funnel: ATC, then reach checkout, then complete (1 − `checkoutAbandon`). Product-page quality, price, reviews and trust badges move a store's rates between the bad and great bands. Each second of load time over ~2.5s multiplies CVR by (1 − 0.10). BFCM and monthly multipliers apply on top of that.

---

## 4. Fees and payouts

| Item | Basic | Shopifly ("Grow") | Advanced | Source | Notes |
|---|---|---|---|---|---|
| Monthly price | $39 | $105 | $399 | [shopify.com/pricing](https://www.shopify.com/pricing) | Paying yearly saves 25% (`annualBillingDiscount`, new). |
| Online card rate (Shopify Payments) | 2.9% + 30¢ | 2.7% + 30¢ | 2.5% + 30¢ | [shopify.com/pricing](https://www.shopify.com/pricing) | |
| Third-party gateway surcharge | 2.0% | 1.0% | 0.6% | [shopify.com/pricing](https://www.shopify.com/pricing) | Charged on top of the gateway's own fee. |

| Metric | Value | Source | Notes |
|---|---|---|---|
| Intro offer | $1/mo for 3 months | [Style Factory, checked Sep 2026](https://www.stylefactoryproductions.com/blog/shopify-3-months-for-1-dollar) | After a 3-day free trial. |
| Payout settlement (`payoutBusinessDays`) | **3 business days** | [Shopify Help: US payouts](https://help.shopify.com/en/manual/payments/shopify-payments/supported-countries/united-states/payouts), [payout timing](https://help.shopify.com/en/manual/payments/shopify-payments/payouts/payout-timing) | **Changed** from 2. The US minimum is 3 business days, and money typically arrives in 3–5. Friday to Sunday sales are paid out together, and the bank can add 1–3 more days. |
| First payout (`firstPayoutDelayDays`) | 7 days | Shopify Help (same) | Shopify says new merchants settle more slowly. For Shopify Balance it's "up to 5 business days", about 7 calendar days. |
| Domain (`domainYearly`) | $14/yr | [Shopify blog: domain cost](https://www.shopify.com/blog/shopify-domain-cost) | A .com through Shopify costs about $11–16. |
| PayPal (`paypalPct`, `paypalFixed`) | 3.49% + 49¢ | [PayPal US fees](https://www.paypal.com/us/business/paypal-business-fees) | PayPal Checkout rate. |

**How the game uses these.** Every order pays the card fee for the store's plan, or the gateway fee plus Shopify's surcharge for other gateways. Sale money becomes spendable after the settlement delay, which is longer for a new store. Meanwhile, ad bills hit the credit card at each billing threshold. That gap between paying for ads and getting paid for sales is the cash-flow squeeze real dropshippers deal with.

---

## 5. Chargebacks and disputes

| Metric | Value | Source | Notes |
|---|---|---|---|
| Warning line (`warnRatio`) | 0.75% | [Stripe Docs: measuring disputes](https://docs.stripe.com/disputes/measuring) | Industry "excessive" line. Stripe powers Shopify Payments. |
| Payout-hold line (`thresholdRatio`) | 1.0% | est. | Shopify doesn't publish a number, so this is the game's line. |
| Fee per dispute (`feePerDispute`) | $15 | [Shopify Help: chargebacks](https://help.shopify.com/en/manual/payments/chargebacks/resolve-chargeback) | Refunded only if you win. The disputed amount and the fee leave your balance immediately. |
| Evidence deadline (`respondWithinDays`) | 7 days | Shopify Help (same) | Typically 7–21 days. The game uses the short end. Missing the deadline loses the dispute automatically. |
| Self-fought win rate (`winRateSelf`) | 32% | [Chargeback Gurus 2026](https://www.chargebackgurus.com/blog/how-often-do-merchants-win-chargeback-disputes), [Chargebacks911 stats](https://chargebacks911.com/chargeback-stats/) | Published figures range from 20% of contested cases (Datos Insights/Mastercard 2025) to 45–54% in other studies. Counted across *all* disputes, merchants recover only ~11–18%. |
| App win rate (`winRateApp`) | 60% | est. | Only vendor claims are available. |
| App fee (`appFeeOnRecovered`) | 25% of recovered | [Chargeflow pricing](https://www.chargeflow.io/pricing) | Charged only when a dispute is won. |
| Visa VAMP excessive (`visaVampExcessiveRatio`, `…MinCount`) *(new)* | 1.5% **and** ≥1,500/mo | [Stripe Docs: monitoring programs](https://docs.stripe.com/disputes/monitoring-programs), [Chargeflow VAMP guide](https://www.chargeflow.io/blog/what-are-visas-new-vamp-rules-a-2025-guide-for-merchants) | VAMP replaced VDMP/VFMP in April 2025. The ratio is (TC40 fraud reports + TC15 disputes) ÷ settled transactions. The threshold was 2.2% until March 2026 and has been 1.5% in the US, Canada, EU and Asia-Pacific since 1 April 2026. Merchants over it pay $8 per dispute (`visaVampFeePerDispute`). |
| Visa VAMP non-compliant (`visaVampNonCompliantRatio`) *(new)* | 0.5% | Stripe Docs (same) | |
| Mastercard ECM (`mastercardEcmRatio`, `…MinCount`) *(new)* | 1.5% **and** ≥100/mo | Stripe Docs (same) | The High Excessive tier is 3% and 300. Fines run from $1k up to $100k–200k per month. |

**How the game uses these.** The dispute ratio is chargebacks ÷ orders over a rolling month. Above `warnRatio` the player gets a Shopifly warning, and above `thresholdRatio` payouts are held. The card-network keys are for flavor text and extreme late-game scale. A small store can't reach 1,500 disputes, so in practice the processor thresholds are what bite. Won disputes still count toward the ratio.

---

## 6. Refunds

| Metric | Value | Source | Notes |
|---|---|---|---|
| Refund-request rate: dropship / bulk / private label | 8% / 4.5% / 3% | est. | No credible public split exists. Slow shipping and quality variance drive the gap. |

---

## 7. Shipping, fulfillment and imports

| Metric | Value (days) | Source | Notes |
|---|---|---|---|
| AliExpress Standard (`aliStandard`) | **15–30** | [AS Tools 2026](https://news.astools.app/en/blog/aliexpress-shipping-time-by-country-2026), [China Fulfillment 2026](https://www.china-fulfillment.com/us-de-minimis-ended-2026-china-sellers-guide.html) | **Changed** from 12–22. Transit is 15–25 business days, and customs has added 2–5 days since de minimis ended. |
| AliExpress Choice (`aliChoice`) | 7–12 | [SecretAli 2026](https://secretali.com/guide/aliexpress-choice-shipping-explained-2026) | The US median is ~7 business days, with the 90th percentile at 9–12. |
| Agent express, samples, sea and air freight | 6–10 / 9–16 / 28–40 / 8–14 | est. | |
| US 3PL delivery (`usWarehouse3pl`) | 2–5 | est. | Ground shipping. |
| 3PL pick and pack (`threePlPickPackPerOrder`) | $3.25/order | [Fulfill.com 3PL pricing](https://www.fulfill.com/3pl-pricing), [Fulfillment Advisor](https://www.thefulfillmentadvisor.com/3pl-pricing-and-rates-how-much-does-3pl-cost/) | The survey average for B2C orders is $3.20. Storage runs $18–40 per pallet per month, and monthly minimums average ~$500. |
| US de minimis (`usDeMinimisSuspended`) *(new)* | suspended | [Federal Register 2026-12670](https://www.federalregister.gov/documents/2026/06/24/2026-12670/indefinite-suspension-of-the-de-minimis-exemption-for-merchandise-arriving-through-all-modes-other) | The $800 exemption ended for China and Hong Kong on 2 May 2025 and for everyone on 29 Aug 2025. It was made indefinite in June 2026 and upheld by the Court of International Trade in Aug 2026. |
| China duty on declared value (`chinaDutyPct`) *(new)* | 23–40% | [Honigman, Jul 2026](https://www.honigman.com/alert-3462), [Zonos tariff tracker](https://zonos.com/us-tariff-updates), [CRS on the IEEPA ruling](https://www.congress.gov/crs-product/LSB11398) | The stack is MFN + legacy Section 301 (7.5% or 25%) + the 12.5% Section 301 forced-labor tariff from 24 Jul 2026. The IEEPA tariffs were struck down in Feb 2026. This number changes often, so re-check it before release. |
| Customs extra days (`customsExtraDays`) *(new)* | 2–5 | [China Fulfillment 2026](https://www.china-fulfillment.com/us-de-minimis-ended-2026-china-sellers-guide.html) | |
| WISMO ticket rate, late / on-time | 35% / 5% | est. | |

**How the game uses these.** Each order draws a delivery time from its method's range. A delivery that arrives later than the time promised on the product page raises WISMO tickets, refund requests and "item not received" chargebacks. Imported stock pays `chinaDutyPct` on the supplier price.

---

## 8. Seasonality

| Metric | Values | Source | Notes |
|---|---|---|---|
| CPM by month, Jan–Dec (`cpmByMonth`) | .78 .85 .93 .95 1.0 .98 .97 1.0 1.05 **1.07** 1.42 **1.15** | [Admanage 2026](https://admanage.ai/blog/facebook-cpm-benchmarks-by-industry), [Varos via Right Side Up](https://www.rightsideup.com/blog/q4-advertising-trends), [Sovran](https://sovran.ai/benchmarks/meta-ads-cpm-by-industry) | January runs ~22% below average and November ~41% above. Varos found Nov +33% over Oct, Dec −18% from Nov, and Jan −23% from Dec. **Oct changed** from 1.15 and **Dec** from 1.30. |
| CVR by month (`cvrByMonth`) | Nov 1.2, Dec 1.15, Jan 0.85 | est. | |
| BFCM CPM (`bfcmCpmMult`) | **1.6×** | [Triple Whale BFCM](https://www.triplewhale.com/blog/facebook-ads-bfcm) | **Changed** from 1.75. Meta CPM was $22.26 during BFCM 2025, against a $14.19 yearly median. Apply it *instead of* the November multiplier. |
| BFCM CVR (`bfcmCvrMult`) | 1.35× | est. | Stores running deep discounts report about 2×. |
| Late-December CPM (`lateDecCpmMult`) | 0.85× | Varos (same) | |
| Weekday and hourly curves | see file | est. | **Fix:** `trafficByHour` summed to 0.95 and has been rescaled to 1.00 with the same shape. |

**How the game uses these.** CPM and CVR are multiplied by the month, weekday and hour factors. The Thursday before Black Friday through Cyber Monday uses the BFCM multipliers. From Dec 20–31, CPM drops, and slow-shipping stores lose CVR because they miss Christmas shipping cutoffs.

---

## 9. Chinese New Year

| Metric | Value | Source | Notes |
|---|---|---|---|
| Supplier shutdown (`shutdownDays`) | **14–28 days** | [Titoma CNY 2026](https://titoma.com/blog/chinese-new-year-affect-manufacturing/), [ODM Group](https://www.theodmgroup.com/china-factory-closures-chinese-new-year/) | **Changed** from 14–24. Most factories fully close for 2–4 weeks, and total disruption lasts 6–8 weeks. |
| Lunar New Year (`lunarNewYearDates`) *(new)* | 2026-02-17, 2027-02-06, 2028-01-26 | Calendar | The official holiday was Feb 15–23 in 2026 and is Feb 4–12 in 2027. |
| Workers who don't return (`workerNonReturnRate`) *(new)* | 10–30% | Titoma (same) | This slows restart and hurts quality in the first batches. |
| Extra dropship delay | 10–20 days | est. | |

---

## 10. Creatives

| Metric | Value | Source | Notes |
|---|---|---|---|
| UGC creator video (`ugcCreatorCost`) | $150–400 | [Billo UGC rates](https://billo.app/blog/ugc-rates/), [Influee](https://influee.co/blog/ugc-price) | Billo's average is ~$198 and the median ~$175. Entry-level creators charge $50–100 and premium ones $300–500+. Usage rights and whitelisting add 30–50%. |
| Winner rate (`winnerRate`) *(new)* | 3.8–8.2% | [Motion Creative Benchmarks 2026](https://motionapp.com/thumbstop-pulse/cb2026-key-benchmarks-and-insights) | From 550k ads and $1.3B in spend. About 50–53% of ads are losers, switched off within 28 days. Winners take ~55% of spend, and mid-tier accounts ship 6–7 creatives a week. |
| Agency pack, turnaround times, shoot hours | see file | est. | |

---

## 11. Life (the day job and personal finance)

| Metric | Value | Source | Notes |
|---|---|---|---|
| Fast-food wages: crew / shift lead / manager | $16 / $18.50 / $23 per hour | [BLS OEWS 35-3023](https://www.bls.gov/oes/2024/may/oes353023.htm), [BLS May-2025 table](https://www.bls.gov/news.release/ocwage.t01.htm), [CA AB 1228](https://www.gov.ca.gov/2023/09/28/california-increases-minimum-wage-protections-for-fast-food-workers/) | The US median for fast-food and counter workers was $14.65 (May 2024), and for food-prep supervisors $21.19 (May 2025). California's fast-food minimum is $20. The game's numbers sit between the US median and California. |
| Credit card APR | 27.99% | [Fed G.19](https://www.federalreserve.gov/releases/g19/current/), [FRED](https://fred.stlouisfed.org/series/TERMCBCCINTNS) | The average APR on accounts paying interest was 22.15% in Q2 2026. Starter and fair-credit cards run about 28%. |
| Late fee | $35 | CFPB | The CFPB's $8 cap was vacated in 2025, so issuer fees of $30–41 are back. |
| Payroll withholding / business tax | 12% / 25% | est. | Payroll is 7.65% FICA plus income-tax withholding. Business tax is 15.3% self-employment tax on 92.35% of profit plus a low federal bracket. |

---

## Rules of thumb (Ecom Academy)

Numbers match the game's data. "Fadbook" = Meta, "TikTak" = TikTok.

### Reading your ads
1. **Judge link CTR, not "CTR (all)".** On Fadbook, a link CTR **under 0.7%** means the hook or offer is weak. **About 1%** is normal, and **1.8%+** is good. On TikTak, under 0.5% is weak and about 0.9% is normal.
2. **Hook rate** (3-second views ÷ impressions) **under 20%** means the first 3 seconds need fixing. **25%** is average and **30%+** is good. A strong hook is cheaper than a new product.
3. **Hold rate** (ThruPlays ÷ 3-second views) **under 10%** means people stopped scrolling but left before the offer, so rebuild seconds 4–15. **About 18%** is average and **25%+** is good.
4. **On TikTak,** a 2-second view rate **under 20%** is a weak opener, and **30%+** is working. A 6-second view rate under 8% means the middle of the video loses people.
5. **Diagnose the funnel in order: CTR, then add-to-cart, then checkout, then purchase.** Fix the first stage that's below benchmark, because fixing a later stage won't help if too few people get that far.
   - Good CTR but add-to-cart **under 2.5%**: the product page, price or trust is the problem.
   - Good add-to-cart but purchase rate **under 1%**: the checkout is the problem. Look for surprise shipping costs, slow shipping promises or missing payment options.

### Store benchmarks
6. **Conversion rate:** under 0.8% is bad, **1.4% is the Shopify average**, 3.2%+ is top 20%, and 4.7%+ is top 10%. Mobile converts about 40% worse than desktop (1.2% vs 1.9%).
7. **About 70% of carts are abandoned** and more than half of checkouts are. That's normal. Recover some with abandoned-checkout emails.
8. **Speed:** each extra second of load time over ~2.5s costs you roughly **10% of your sales**.

### Money math
9. **Break-even ROAS = price ÷ (price − landed cost − fees).**
   - Landed cost = product + shipping + import duty.
   - Fees = card fee (2.9% + 30¢ on Basic) plus any app or gateway fees.
   - Example: a $40 price, $14 landed cost and $1.46 in fees leaves $24.54. Break-even ROAS is 40 ÷ 24.54 = **1.63**, and break-even CPA is **$24.54**.
   - Anything below that loses money on every sale. Refunds and chargebacks raise the bar further.
10. **Trust Shopifly over the ad dashboard.**
    - Fadbook's default attribution (7-day click + 1-day view) can over-count purchases by **up to ~1.5×**. Sales from people who only *saw* an ad get counted.
    - Judge profit on your store's real orders: **MER = total revenue ÷ total ad spend**.
11. **Cash flow kills stores that are profitable on paper.**
    - Shopifly pays out **3 business days** after a sale at the earliest (longer for new stores).
    - Your ad card gets charged every time spend hits the billing threshold.
    - Keep a buffer of at least a week of ad spend.
12. **Import duty is real now.** The US de minimis exemption is gone. Budget **~23–40% duty on the supplier price** of Chinese goods, plus 2–5 extra shipping days.
13. **Credit cards are a last resort.** A starter card charges about **28% APR**, while a winning ad account can double money in a week. Scaling a *loser* on the card is how people go broke.

### Scaling and the algorithm
14. **Learning phase:** an ad set needs about **50 purchases in 7 days** to exit learning on either platform. The daily budget needed is about **CPA × 50 ÷ 7**. At a $30 CPA, that's ~$215/day.
15. **Scale gently.**
    - On Fadbook, raise budgets **no more than ~20% at a time**, or you risk resetting learning.
    - On TikTak, the official limit is **≤30% per edit after learning (≤40% during)**, with **at least 48 hours between edits**.
    - To grow faster, duplicate the ad set instead.
16. **Creative fatigue:** on prospecting, a 7-day **frequency over ~2.5** means fatigue is starting, and **over 3** means refresh now. TikTak creatives burn out faster (plan on a new batch every ~7 days).
17. **Most creatives lose.** Only about **4–8% of ads become winners**, so a small brand should expect roughly 1 in 12–25. Test many cheap variations and give real budget only to the winners.
18. **Minimums:** Fadbook allows $1/day ($5 for conversion goals). TikTak requires **$50/day per campaign and $20/day per ad group**.
19. **New ad accounts are capped** at about $50/day at first, and the cap rises as you pay bills on time. A failed payment on a new account is the fastest way to get restricted.

### Disputes
20. **Keep chargebacks under 0.75% of orders.**
    - Above ~1%, expect payout holds.
    - The card networks' own programs start at **1.5%** (Visa VAMP in the US since April 2026, Mastercard at 100+ chargebacks).
    - **Every dispute counts, even the ones you win.**
21. **A refund is cheaper than a chargeback.** A chargeback costs the order + a $15 fee + the goods. Answer "where is my order?" emails fast, give tracking, and refund angry customers before they call their bank.
22. **When you fight a dispute:** send tracking with proof of delivery and your customer messages, matched to the reason code, before the deadline (often only **7 days**). Self-fought wins run **~20–50%**. Chargeback apps charge **25%** of what they recover.

### Calendar
23. **Q4:** November CPMs run **~40% above average**, and BFCM week is **~1.6× normal**. Conversion rates also rise, so good offers still work.
    - **January is the cheapest month** (~22% below average). It's the "Q5" window for testing.
    - Late-December ads are cheap, but slow-shipping stores miss Christmas delivery.
24. **Chinese New Year (Feb 6, 2027; Jan 26, 2028):** Chinese suppliers go dark for **2–4 weeks**, with 6–8 weeks of total slowdown and 10–30% of workers not returning.
    - Stock up or switch suppliers **4–6 weeks before**.
    - Warn customers about slower shipping.
25. **Shipping speed sets refunds and disputes.** AliExpress Standard takes **15–30 days**, AliExpress Choice **7–12**, and a US 3PL **2–5**. Promising faster than you can deliver generates "not received" chargebacks.
