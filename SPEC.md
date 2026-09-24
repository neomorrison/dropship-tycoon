# Dropship Tycoon — Game Design & Engineering Spec

A browser game: **Sims × Game Dev Tycoon**, about a broke 22-year-old at McDoodle's who builds a
dropshipping business. Find products on AliExprez → build a Shopifly product page → make creatives →
media-buy on Fadbook & TikTak → read analytics → scale, stock inventory, go private label, quit the job,
move up from the parents' basement to a penthouse. Pure sandbox; difficulty chosen at start.

**Design pillars**
1. **Real-world fidelity.** Metrics behave like the real thing (see `src/data/benchmarks.ts`,
   `docs/BENCHMARKS.md`). >3% CVR good, <1% bad; link CTR <0.8% weak; hook rate <20% weak;
   frequency >~3 = fatigue; budget jumps >20% reset learning; platforms over-report purchases.
2. **Skill beats luck.** A player who knows e-commerce must win far more often than a random clicker.
   Hidden truths are *inferable* from public signals; graders reward real CRO/creative/media-buying
   principles; mistakes (copying supplier titles, 2× markups, one creative, 5× budget jumps, ignoring
   fatigue, lying about shipping, over-scaling on a credit card) are punished the way reality punishes them.
3. **UI mimicry.** Shopifly ≈ Shopify admin (Polaris look), Fadbook ≈ Meta Ads Manager, TikTak ≈ TikTok
   Ads Manager, AliExprez ≈ AliExpress. Parody names only — never real logos/brands.
4. **Life pressure.** Energy/hunger/mood + a 24h day. Shifts at McDoodle's pay the bills but eat time.
   Quitting is a real decision. Cash-flow timing (ads billed before payouts land) is the classic trap.

---

## 1. Architecture & conventions (READ FIRST — every agent)

```
src/
  core/        types.ts (STATE CONTRACT), store.ts (zustand+immer act), ui.ts (UI store), engine.ts (loop),
               rng.ts, time.ts, money.ts (pay/receive), notify.ts (notify/mail/coachTip), modals.ts,
               difficulty.ts, format.ts, ids.ts, assets.ts, save.ts, newGame.ts
  sim/         index.ts (hour orchestrator), hooks.ts (activity completion dispatch),
               ads/ store/ life/ finance/ market/ events/   ← each has index.ts = PUBLIC API
  data/        productList.ts, products.ts, benchmarks.ts, + per-module data files
  ui/shell/    title screen, HUD, apartment scene, activity panel, computer/browser, toasts, modals
  ui/kit/      polaris/ (Shopifly design system), adsmanager/ (Fadbook+TikTak table kit), phone/, charts/
  ui/sites/    one folder per in-game website (registry.ts lists them)
public/assets/ rooms/ products/ people/ player/ gear/ audio/   (generated art)
```

### Hard rules
- **State changes only via `act(s => ...)`** (immer draft). Sim functions take `(s: GameState, ...)` and mutate `s`.
- **Never `Math.random()` in `src/sim`** — use `core/rng` (`rand`, `randRange`, `chance`, `poisson`, `binomial`, `lognormal`…) with the state.
- **All money movement through `core/money.ts`**: `pay(s, amt, {category, memo, business, prefer, pnl})` returns the account used or `null` if unaffordable; `receive(...)`; `payCard(...)`. `addPnl(s, key, amt)` for revenue-type P&L lines (e.g. `revenue` recorded by the store per order).
- **Player-facing messages**: `notify(s, {kind, title, body, site, path, amount})` (toasts/bell), `mail(s, {...})` (Inboxly email), `coachTip(s, id, text, {app, essential, cooldownHours})`, `pushModal(s, {kind, title, body, choices})` + `registerModalHandler(kind, fn)` at module import.
- **Ids**: `uid(s, 'prefix')`. **Time**: absolute hours; helpers in `core/time.ts` (`dayOf`, `hourOfDay`, `monthOf`, `weekday` (0=Mon), `isBfcm`, `nextCny`, `addBusinessDays`, date ranges).
- **Types**: `core/types.ts` is the contract. You may ADD optional fields (`foo?:`) to types your module owns; never rename/remove. If you need a field in another module's type, add it as optional and mention it in your final report.
- **Public APIs**: keep every export/signature in `src/sim/*/index.ts`. You may add exports. Split implementation into more files inside your folder freely.
- **Zustand selectors must return stable references** (a slice or primitive). Never `useGS(s => s.x.filter(...))` — select the slice and `useMemo`. Use `useGSShallow` for multiple fields.
- **CSS**: plain CSS files imported by components, **class names prefixed per owner** to avoid collisions:
  `sh-` shell, `p-` polaris kit, `am-` adsmanager kit, `ph-` phone kit, `sf-` Shopifly pages, `st-` storefront,
  `fb-` Fadbook, `tt-` TikTak, `ax-` AliExprez, `mi-` Mineo, `ch-` CreatorHub, `bk-` bank, `ml-` mail,
  `md-` McDoodle's, `zl-` Zillo, `az-` Amazin, `uw-` UpWorx, `ac-` Academy. No global element selectors outside `src/index.css`.
- **Assets** via `core/assets.ts` (`productImage(id)`, `roomImage(tier)`, `portrait('p07')`, `playerPortrait(mood)`, `gearImage(id)`). Images may be missing during development → always handle `onError` with a tasteful fallback (emoji/initials on a colored tile).
- **Icons**: `lucide-react`. **Charts**: `recharts` (wrapped by `ui/kit/charts`). No other new dependencies without need.
- **Typecheck**: `npx tsc --noEmit`. Other agents work concurrently — only fix errors in files you own; filter output by your paths.
- Every site component receives `SiteProps { tabId, path, navigate(path), compact }`. Routing is string paths inside the site. Cross-site navigation: `openSite(siteId, path)` from `core/ui`.
- Editors/forms that need the player to think call `usePauseWhileMounted('key')` (auto-pauses the clock). The engine also pauses while `s.events.modals.length > 0`.

### Engine
- 1x speed = **1.25 real seconds per in-game hour** (30 s/day); 2x, 4x; sleeping runs 4× faster on top.
- `tickHour(s)` order: `hour++` → (at 00:00) `dayRollover` [snapshot → market → ads → store → finance → life → staff → events → coach → milestones] → `eventsTickHour` (recompute `s.events.modifiers`) → `marketTickHour` → `lifeTickHour` → `staffTickHour` → `adsTickHour` (returns `TrafficPacket[]`) + `storeOrganicTraffic` → `storeProcessTraffic` (returns `ConversionEvent[]`) → `adsRecordConversions` → `storeTickHour` → `financeTickHour` → `coachTickHour`.
- Autosave to IndexedDB each in-game day. Start: **Mon Mar 2, 2026, 7:00 AM**, living in the parents' basement, McDoodle's part-time crew.

### Difficulty (`core/difficulty.ts`)
Chill / Normal / Realistic change: starting cash & card limit, CPM mult, demand mult, noise, ban risk, payout holds & delay, chargeback/refund mults, taxes, coach proactivity, drama frequency. Read `DIFFICULTY[s.meta.difficulty]`.

---

## 2. Module ownership

| Agent | Owns (write access) |
|---|---|
| **sim-ads** | `src/sim/ads/**`, `src/data/creativeTaxonomy.ts`, `src/data/interests.ts`, `src/data/creators.ts` |
| **sim-store** | `src/sim/store/**`, `src/data/apps.ts`, `src/data/themes.ts`, `src/data/sections.ts`, `src/data/customers.ts` |
| **sim-life-finance** | `src/sim/life/**`, `src/sim/finance/**`, `src/data/apartments.ts`, `src/data/gear.ts`, `src/data/activities.ts`, `src/data/staff.ts`, `src/data/job.ts` |
| **sim-market-events** | `src/data/products.ts`, `src/sim/market/**`, `src/sim/events/**`, `src/data/events.ts`, `src/data/milestones.ts` |
| **ui-shell** | `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/ui/shell/**`, `src/ui/audio.ts` |
| **ui-kits** | `src/ui/kit/**` (polaris, adsmanager, phone, charts, common) |
| **ui-shopifly-core** | `src/ui/sites/shopifly/{index.tsx,route.ts,AdminFrame.tsx,shopifly.css}`, pages: Onboarding, Home, Orders, OrderDetail, Customers, Analytics, Reports, LiveView, Finances, Disputes, Inbox, Marketing |
| **ui-shopifly-merch** | shopifly pages: Products, ProductEditor, OnlineStore, ThemeEditor, Apps, AppDetail, Discounts, Settings (+ `shopifly/merch/**` helpers), `src/ui/sites/storefront/**` |
| **ui-fadbook** | `src/ui/sites/fadbook/**` |
| **ui-tiktak** | `src/ui/sites/tiktak/**` |
| **ui-sourcing** | `src/ui/sites/aliexprez/**`, `src/ui/sites/mineo/**` |
| **ui-studio** | `src/ui/sites/studio/**` |
| **ui-life-sites** | `src/ui/sites/{bank,mail,mcdoodles,zillo,amazin,upworx,academy}/**` |

Core files (`src/core/**`, `src/sim/index.ts`, `src/sim/hooks.ts`, `src/ui/sites/registry.ts`, `src/ui/sites/types.ts`) belong to the lead; if you truly need a change there, make the smallest additive edit and report it.

---

## 3. Life sim (sim-life-finance)

**Needs** (0–100), per in-game hour:
| State | Energy | Hunger | Mood |
|---|---|---|---|
| awake, idle/light | −4 | −4.5 | drifts 3%/h toward baseline |
| working a shift | −6.5 | −6 | −1.5 |
| business task (research/filming/support) | −5 | −5 | ±0 (filming +1 if mood>50) |
| sleeping | +11 × apartment.sleepQuality | −1.5 | +0.5 |

Mood baseline = apartment.moodBase + money stress (cash < $200 or card > 90% used: −12) + success (yesterday profit > 0: +5; milestone week: +8) + social (−1/day since last socialize, max −10).
Thresholds: energy < 20 → productivity ×1.35; energy ≤ 0 → pass out (forced 10h sleep, misses everything, strike if a shift). Hunger < 15 → mood −3/h and energy −2/h extra. Mood < 25 for 3 consecutive days → **burnout** (5 days: productivity ×1.5, self-shot creative quality −0.15, mood cap 50).
Productivity multiplier (on business-task durations) = computer gear factor (laptop-old 1.25, laptop-pro 1.0, workstation 0.85) × energy/burnout factors.

**Activities** (`src/data/activities.ts`; ActivityKind union in types): sleep (8h, auto-wakes at energy 100 or 10h), nap (1h, +12), eat_home (30 min, hunger +55, $5), eat_takeout (20 min, hunger +65, mood +4, $19), relax (1h, mood +8), gym (1.5h, mood +10, energy −8, +5% energy regen for 3 days), socialize (3h, mood +25, $35, only 5PM–1AM), shower (20m, mood +4), work_shift (auto), product_research (1h), film_creative (3h), edit_supplier_video (1.5h), customer_support (1h, resolves ~12 × ops-skill factor tickets), fight_chargeback (30m), appeal_ad_account (30m), post_organic (1h), influencer_outreach (1.5h), study (2h, XP). Business tasks require being home (computer) except post_organic/customer_support (phone OK).
Queue: activities run sequentially; the current one shows a progress bar. `onActivityComplete(s, a)` in `sim/hooks.ts` routes business effects to other modules — call it on completion.
**Autopilot** (`s.flags.autopilot`, default true on Chill/Normal): when idle — eat at home if hunger < 25 (takeout if no food money? eat_home costs $5), sleep if 11PM–2AM or energy < 12, go to scheduled shifts automatically.

**Job — McDoodle's** (`src/data/job.ts`): schedules — part (Tue/Thu/Sat 11:00–18:00, 21h/wk), full (Mon–Fri 7:00–15:00, 40h), weekends (Sat/Sun 10:00–18:00), none (only if quit). Start: part-time crew $16/h. Pay biweekly Friday: hours × wage × (1 − 0.12) → `receive`, pay-stub email. At shift start the player auto-leaves (interrupting interruptible activities; sleeping/filming = late→missed if not free within 1h). Missed shift = strike; 3 strikes = fired. Call out sick (2 per 30 days free, then a strike). Promotion: shift lead after 40 shifts & reliability ≥75 ($18.50); manager after 120 shifts & reliability ≥85 ($23, full-time). Quit: confirmation modal, immediate. Ask for job back: humiliation modal, back as part-time crew, reliability 60.

**Apartments** (`src/data/apartments.ts`): tier | name | rent/mo | sleepQuality | moodBase | filmingBonus | requirement
0 Parents' Basement | $0 | 0.9 | 48 | 0 | —  (random "Mom needs help" events)
1 Shared Apartment | $950 | 0.95 | 54 | 0 | 30-day income ≥ 2.5× rent OR cash ≥ 6× rent
2 Studio | $1,650 | 1.05 | 60 | +0.03 | same rule
3 1BR Loft | $2,600 | 1.1 | 66 | +0.06 | same rule
4 House w/ Garage Office | $4,200 | 1.15 | 72 | +0.08 | same rule (staff morale +10)
5 Penthouse | $11,500 | 1.25 | 82 | +0.10 | same rule
Moving: deposit (1 month) + movers ($400 × tier) charged immediately; rent due on the 1st (bank), late rent → strike email → eviction after 2 missed (back to parents').

**Gear** (`src/data/gear.ts`, images `gear/<id>.webp`): phone-cracked ($0), phone-pro ($1,099, +0.12 film quality, −10% film time), ring-light ($39, +0.05), softbox-kit ($189, +0.10), mirrorless-camera ($1,298, +0.12), laptop-old ($0, productivity 1.25), laptop-pro ($1,999, 1.0), workstation ($3,499, 0.85, +0.03), lav-mic ($79, +0.04 for talking formats). One item equipped per slot.

**Skills** (research, copywriting, creative, media_buying, operations): level 1–10, `xpForLevel(l) = 100·l^1.6`. XP: research activity +40; filming +50; saving a product page whose grade improved ≥5 points +20 (copywriting); media_buying +1 per $10 ad spend managed (max 60/day); operations +5 per ticket, +20 per chargeback. Effects are mostly **information & tools**, not raw stat boosts (player knowledge must dominate):
- research: deeper insights per research level (see §6), AliExprez trend arrows at L3, saturation estimate at L5, perceived-value range narrows with level.
- copywriting: editor helpers — L2 word/bullet meter, L4 benefit-word highlighter, L6 objection checklist.
- creative: self-shot quality +0.03/level; hook suggestions at L3.
- media_buying: Advantage/Smart+ campaigns at L2, cost cap + breakdowns at L3, automated rules at L4.
- operations: ticket speed +8%/level, dispute evidence +0.03/level.

**Staff** (UpWorx; `src/data/staff.ts`; portraits p01–p18): candidates refresh weekly (5–8), weekly salary paid from bank, morale (unpaid → quits).
- va ($180–400/wk): solves skill×15 tickets/day; optionally fights chargebacks (evidence 0.5 + skill×0.04).
- ugc_creator ($400–1,200/wk): produces 2–4 creatives/week for a configured product (needs sample or stock), quality 0.45 + skill×0.05.
- media_buyer ($800–2,500/wk): daily at 9AM applies rules: pause ads with spend > 2×BE-CPA and ROAS < 0.7×BE, scale ad sets with ROAS > 1.3×BE by 15–20%, duplicate winners; low skill makes mistakes (random 40% jumps, premature kills).
- designer ($600–1,500/wk): +skill×2 page-design points on all products, −0.1s load.
- copywriter ($500–1,200/wk): enables "Rewrite with copywriter" in the product editor producing good copy (quality by skill).
- ops_manager ($900–2,000/wk): auto-reorders bulk at reorder point, −5–10% bulk COGS, stocks up before CNY.

## 4. Finance (sim-life-finance)
- **Accounts**: checking (`finance.cash`) and the Chaise Sapphire card (`finance.card`). Business spend defaults to the card (as real dropshippers do).
- **Card**: statement closes monthly on `statementDom` → `statementBalance`, `minDue = max(35, 2% + interest)`, `dueDay = +25 days`. Unpaid statement balance → interest `balance × APR/12` at next close. Autopay (none/min/full) on due day from bank; insufficient → $35 late fee, `lateCount++`, penalty APR 29.99%; 2 lates → card frozen until paid. `requestCreditIncrease` after 3 on-time statements: limit × 1.5–2 based on 60-day revenue.
- **Recurring bills** (`finance.bills`): rent (1st, bank), phone $45 (bank), Shopifly plan (card; $1/mo for 3-month trial then $39/$105/$399), apps (card), domain (yearly), Mineo $49/mo, staff (weekly, bank). Modules add/remove bills with `upsertBill` / `removeBillByRef`.
- **Taxes** (Normal/Realistic): quarterly estimated tax = 25% × YTD business profit − paid, due Apr 15 / Jun 15 / Sep 15 / Jan 15, email 14 days ahead; unpaid → 5%/month penalty.
- **Shopifly Capital**: offered after 60 days of sales with avg ≥ $300/day revenue; amount ≈ 15× avg daily revenue, flat fee 10–13%, repaid by withholding 12–17% of each payout.
- History snapshots are taken by the orchestrator.

## 5. Catalog, market & sourcing (sim-market-events)

### Product data (`src/data/products.ts` → `PRODUCTS: ProductDef[]`, all 63 ids from `productList.ts`)
Author realistic US-market numbers. Guidance by archetype:
| archetype | baseDemand | perceivedValue / landed cost | wow | defect | notes |
|---|---|---|---|---|---|
| winner | 0.8–0.95 | 3.5–6× | 0.6–0.9 | 0.03–0.07 | evergreen or rising; scaleCeiling $2–5k |
| highticket | 0.7–0.85 | 4–8× (price $80–200) | 0.6–0.85 | 0.04–0.08 | needs trust; lower CVR; big margins |
| seasonal | 0.85 in season | 3–5× | 0.6–0.9 | 0.04 | seasonality peaks 1.6–2.2 in season, 0.2–0.4 off |
| emerging | 0.75–0.9 | 3–6× | 0.6–0.85 | 0.04 | trend rising; emergeDay 10–150, peak +40–120 days later |
| solid | 0.55–0.7 | 2.5–4× | 0.4–0.6 | 0.04 | profitable only with great execution |
| saturated | 0.7–0.8 | 2.5–4× | 0.5–0.7 | 0.05 | startSaturation 0.6–0.85, 30–90 competitors, amazonPrice low |
| dud | 0.25–0.4 | 1.5–2.5× | 0.2–0.4 | 0.05 | commodity; Amazin cheaper |
| trap | 0.7–0.85 | 4–6× | 0.7–0.9 | 0.2–0.35 **or** claimRisk 0.6+ | looks amazing; refunds/chargebacks/bans |
~1 in 8 products are real winners at any time (Realistic); `productAppeal` × `DIFFICULTY.demandMult` softens this on Chill.
Fields: `supplierTitle` (keyword-stuffed, e.g. "2026 New Pet Hair Remover Roller Reusable Lint Brush Dog Cat Fur Sofa Carpet Cleaning Tool"), `supplierDescription` (Chinglish spec dump), `specs`, `variants`, `cogs` ($2–45), `shipCost` ($0–8), `shipDays` (AliExprez standard `BENCHMARKS.shipping.aliStandard` 15–30; Choice-badge items `aliChoice` 7–12), `weightKg`, `bulkCogs` (~0.6–0.75× cogs), `moq` (100–500), private label ~1.15× bulk at MOQ 500–1000, `amazonPrice` (visible anchor, often ≈ perceivedValue×0.8–1.1; null for novel items), audience, platform fit, **bestFormats/bestHooks/bestAngles** (2–4 each; these are what "good creative instincts" should discover), seasonality[12], trend, saturation/competitors, `claimRisk` (health/beauty claims), `scaleCeiling` ($150 duds … $5,000 winners), `keywords` (10–16 benefit words for copy grading), `objections` (4–6), `publicSignals`, `releaseDay` (≈25 available at day 0, the rest release over the first ~200 days, 1–3 per week), `brandable`.
**Public signals must correlate with hidden truth** so skilled players can infer it: high orders30d + rising = demand (but many competitors = saturation), low rating ⇒ defects, Amazin price anchor ≈ perceived value, specs/visual quality hints at wow.

### Market dynamics
- `trendIndex(p, day)`: evergreen = 1; rising = logistic from emergeDay (0.35) to peakDay (1.0) then exponential decay with halfLife toward floor 0.35; fad = same with floor 0.15; declining = 0.8 decaying toward 0.3. Times `seasonality[month]`, plus holiday gift bumps for `giftable` (Valentine's Feb 1–14 +20%, Mother's Day 2 weeks +25%, Q4 Nov–Dec +30–60%).
- `productAppeal(s, id) = demandMult × baseDemand × trendIndex × (1 − 0.55 × saturation)` (≈ 0.1–1.6).
- Competitors: daily `+= Poisson(0.12 × trendIndex × (1 + orders30d/20000))`, plus copycats when you scale (see events); decay 1%/day when trendIndex < 0.5. `saturation = 1 − exp(−competitors/45)`. `competitionMult` (CPM) = `1 + 0.004 × competitors` (cap 1.45) → write into `s.events.modifiers.competitionMult[catalogId]` (events owns modifiers; market computes).
- AliExprez public listing: price = cogs, fake "original" price, `orders30d = ordersBase × trendIndex × (1 + competitors/25) × noise`, rating ≈ `publicSignals.rating − 1.2×defectRate`, reviews, ship window, Choice badge, supplier name/years.
- **Research** (activity 1h): research level 0→3 per product. Insights: L1 competitor price, Amazin price, # stores advertising; L2 trend direction (accuracy improves with research skill), review complaints hinting at defectRate ("11% of reviews say it stopped working"); L3 perceived value range (width shrinks with skill), "top competitor ads use <hook> hooks / <angle> angle" (hints bestHooks/bestAngles), audience skew. Skill-level-gated wording.
- **Mineo** ($49/mo, card): per product: active ads, advertisers, first seen, engagement trend, competitor price, top ads (advertiser, platform, likes/comments/shares, days running, hook type). Accurate but *interpretation* is the skill (many ads + old = saturated; few ads + high engagement + recent = early winner).
- **Samples**: `orderSample` pays cogs+shipCost, arrives in `rand(shipDays)` (+CNY delays) → `samplesOwned`. Needed for self-filming and UGC creators (or have bulk stock).
- **Sourcing progression**: `agent` unlocks after 100 store orders (email from "SourcePro Agent Lily"): agent dropship = unit cost `bulkCogs × 1.12`, ship $4.50, 6–10 days, 40% fewer defects (QC). `threePL`/`bulk` unlocks with agent: `placeBulkOrder` qty ≥ moq at `bulkCogs`, production 5–10 days (+ supplierDelayDays), sea 28–40 days (+$0.60/unit) or air 8–14 days (+$2.80/unit·kg); on arrival inventory at US 3PL; 3PL orders ship in 2–5 days, pick-pack $3.25 + domestic postage ≈ $4 + $1.5/kg, storage $0.35/unit/month. Stockout → orders fall back to AliExprez dropship (slow) with a critical notification. `privateLabel` unlocks at 500 orders of one product: MOQ 500–1000 at `privateLabelCogs`, brand name → CVR × (1 + 0.15×brandable), AOV +5%, refunds −40%, copycats −50%.
- **Import duty (2026 reality)**: US de minimis is suspended (`BENCHMARKS.shipping.usDeMinimisSuspended`), so every China-origin parcel pays duty: dropship/agent orders add `cogs × dutyPct` (per-product `dutyPct` ≈ 0.3 drawn from `chinaDutyPct`, store it in market state or derive deterministically from id) plus `customsExtraDays` to delivery; bulk/private-label shipments pay duty once on the shipment value. Include duty in landed cost everywhere (`fulfillmentFor`, `breakEven`, costPerItem default).
- `fulfillmentFor(s, id)` returns the mode, unit cost (incl. duty), ship cost, ship days, in stock — the store uses it for every order.

## 6. Store — Shopifly (sim-store)

### Setup
`createStore(name)`: 3-month $1/mo trial (bill on card), subdomain `slug.myshopifly.com`, theme "Dawnish" (free). Policies empty (grader penalizes; `generatePolicy` gives templated text). Payments: Shop Pay on, PayPal off, BNPL off. Shipping: free.
`importProduct(catalogId)` (via DSerz-style import): draft with **supplier title and description verbatim**, 1–3 supplier media (`kind:'supplier'`, `variant` = CSS treatment index), price = **cogs × 2 rounded to .99** (a deliberately naive default), costPerItem = cogs+shipCost, supplier variants, empty SEO, default sections [] (theme defaults: none), promisedDays null. The player must improve everything.

### Themes (`src/data/themes.ts`)
dawnish (free, load 1.8s, design 60), sensed (free, 1.9s, 64), shrined ($250 one-time, 2.0s, 80, built-in sticky ATC + trust icons), impulsive ($350, 2.2s, 86, built-in quantity breaks + sticky ATC).

### Sections (`src/data/sections.ts`) — enable per product page
reviews (needs a reviews app), trust_badges (TrustBadgz app or shrined/impulsive), faq (items editor), shipping_info (delivery window text → sets `promisedDays`), guarantee (days), bundle_offer (needs Bundlr or impulsive; tiers), sticky_atc, countdown & stock_scarcity (need Tickr; hurt honesty if overused), comparison (us vs them table), as_seen_on, size_chart, benefits_icons (3–4 icon+text items), ugc_gallery (needs UGC photos/creatives), free_shipping_bar, how_it_works, founder_note.

### Apps (`src/data/apps.ts`) — parody Shopify App Store; each: id, name, developer, category, icon glyph/color, rating, reviews, pricing plans, loadTime (s), effect text
dserz (dropship auto-fulfillment; **without it dropship orders wait for manual "Fulfill"**; free / $19.90), fadbook-channel (Fadbook & Instaglam sales channel: installs pixel; free), tiktak-channel (pixel; free), judgyme (reviews + AliExprez import; free / $15, 0.15s), lookz (photo reviews; $12.99–49.99, 0.3s), bundlr (quantity breaks; $9.99, 0.12s), rekonvert (post-purchase upsell, AOV +6–9%; $4.99–29.99, 0s), klavio (email: abandoned checkout recovery 6–9% of abandons, repeat flows; free ≤250 contacts then $20–150), chargeflo (auto disputes, win 60%, 25% of recovered), tickr (countdown/scarcity; $4.99, 0.2s), trustbadgz (free, 0.1s), swiftspeed (−0.4s load; $19.99), gorgeous (helpdesk: ticket time −40%, WISMO auto-replies; $10–50), trackwise (tracking page: WISMO tickets −35%; $11), klarno (BNPL: CVR +8% when price > $60; 6% fee on those orders), vitalz (40-in-1: unlocks many sections, **+0.6s load**; $29.99), pagefli (page builder: design +10, +0.25s; $24). Monthly app fees → `upsertBill` (card).

### Page grader — `gradePage(s, p)` (THE skill check for pages)
Weighted factors (0–100 each) → `score`; `cvrMult = 0.45 + 0.9 × (score/100)^1.3` (50→0.82, 70→1.02, 85→1.18, 100→1.35).
| factor | weight | what scores well |
|---|---|---|
| title | 8 | 25–70 chars, contains a product keyword/benefit, NOT the supplier title (token Jaccard > 0.5 → ≤15), no spam ("2026 New", "Hot Sale", "Free Shipping"), not ALL CAPS |
| description | 16 | 80–400 words, 3–7 bullets, benefit words (product.keywords + generic list), "you/your", short paragraphs, h3 headings, mentions guarantee & shipping, covers objections; supplier-copy similarity heavy penalty |
| media | 12 | 1 img → 20, 3 → 60, 5–8 → 90+; lifestyle/UGC photos, video/GIF bonus |
| price | 14 | `r = price/perceivedValue`: 0.75–1.0 ideal; >1.3 poor; <0.45 "too cheap to trust" |
| compare_at | 4 | 15–50% off good; none 60; >70% off = fake (trust −) |
| social_proof | 12 | reviews section + count (0→0, 10–50→70, 50+→90); avg 4.3–4.8 best; 5.0 suspicious; photos bonus |
| trust | 10 | 4 policies + contact filled, custom domain, trust badges, guarantee section, PayPal, founder note |
| offer | 8 | bundle_offer, free shipping, upsell app → also `aovMult` (1 + 0.12–0.2 bundles + 0.06 upsell + 0.04 free-ship threshold) |
| urgency | 4 | one of countdown/scarcity = +; both = honesty −0.1 |
| speed | 6 | `loadTime = theme + Σapps + heavy sections + max(0, media−8)×0.05 − swiftspeed`; ≤2.5s full marks |
| mobile | 4 | sticky_atc on; ≤10 sections |
| shipping | 6 | promisedDays present & honest vs `fulfillmentFor` days. **Promising faster than reality** → honesty −0.35 (CVR +5% short-term, chargebacks ×3) |
| faq | 4 | ≥3 items addressing product.objections |
| design | 6 | theme design score + designer staff + pagefli |
| variants | 2 | relevant variants offered |
Also returns `trust` (0–1), `honesty` (0–1), `loadTime`, and **factors with player-facing tips** (why + how). The editor shows tips at copywriting-skill-gated detail; the coach references them.

### Funnel & CVR — `storeProcessTraffic(s, packets)`
Per packet (per hour): `cvr = 0.026 × appealF × priceF × absPriceF × grade.cvrMult × speedF × packet.intent × packet.messageMatch × shipF × payF × brandF × modifiers.cvrMult × seasonalCvr(month, BFCM) × weekdayCvr × noise`
- `appealF = clamp(0.35 + 0.8 × productAppeal, 0.3, 1.6)`
- `priceF`: r ≤ 1 → `min(1.3, 1 + 0.45(1−r))` (×0.85 if r < 0.45); r > 1 → `exp(−2.4(r−1))`
- `absPriceF` by price: ≤$25 1.12, ≤$50 1.0, ≤$80 0.82, ≤$130 0.66, ≤$200 0.52, else 0.42 — raised to power `(1.4 − trust)` (trust softens high-ticket)
- `speedF = 1 − cvrLossPerSecondSlow × max(0, loadTime − 2.5)` (min 0.55)
- `shipF`: charging shipping 0.82; free-over threshold above price 0.95; free 1.0. `payF`: +3% Shop Pay, +4% PayPal, BNPL +8% if price > $60. `brandF` private label.
- noise `lognormal(0.18 × noiseMult)`; cap cvr 0.25. Purchases ~ `binomial(sessions, cvr)`; ATC sessions ≈ purchases + binomial(rest, cvr×(2.6–3.6)); checkout ≈ cvr×(1.6–2.1).
- Qty/AOV: bundle_offer → P(qty 2) 0.14–0.22, P(qty 3) 0.05 scaled by `aovMult`; upsell app 10–14% take rate at 25–40% of price.
- Abandoned checkouts → Klavio recovers 6–9% next day as `email` orders.
- Device split mobile 78% / desktop 19% / tablet 3%. Customers: generated names/cities (`src/data/customers.ts`), returning share from repeat pipeline.
- Emits `ConversionEvent` per ad (atc/checkouts/purchases/revenue) and records StoreDay/StoreHour analytics (sessions by source/device, funnel, sales, byProduct, ordersBySource…). Pixel counts (all purchases if installed).
- **Organic traffic** `storeOrganicTraffic`: search/direct baseline `(2 + 0.05×√lifetimeOrders)` sessions/h × hour curve; brand halo `direct` ≈ 6% of yesterday's paid sessions; `influencer` from `modifiers.organicBoost`; `email` repeats from `repeatPipeline` (consumables).

### Orders & operations — `storeTickHour` / `storeDayRollover`
- **Payment on order**: revenue → `addPnl('revenue')`, `pendingBalance += total − fees` (fees = plan cardPct×total + fixed; PayPal share of orders if enabled). Dropship/agent orders: **supplier charged immediately** via `pay(..., {category:'cogs', business:true})` (card first) — if unpayable, order stays unfulfilled (delays, tickets). Needs DSerz for auto-fulfill (else manual).
- Delivery day = order day + fulfillment ship days (+ `modifiers.dropshipDelayDays` for dropship/agent placed during CNY window). 3PL orders: inventory via `takeInventory`, pick-pack + postage charged.
- `defective = chance(defectRate × (agent 0.6 | bulk 0.6 | private 0.4))`.
- Tickets: WISMO when past promised max (or 10 days w/o promise) with p 0.35 (0.05 on-time; −35% trackwise, −50% gorgeous auto-reply); defect → ticket 70%; due in 48h; unanswered → escalate (30% become refund/chargeback). VA staff and `resolveTickets` solve them.
- Refunds: defective → 55% request; late > promised+5 → 15%. `refundOrder` returns money from balance (`refunds` P&L).
- **Chargebacks**: probability per order ≈ `0.0035 × chargebackMult × (defective ? 6 : 1) × (late ? 3 : 1) × (honesty < 0.7 ? 2.5 : 1) × (escalated ticket ? 3 : 1)`; opened 10–40 days after order; amount + $15 fee deducted immediately; respond within 7 days (`respondChargeback` → activity or ChargeFlo auto) else lost; decided 10–20 days later: win p = (winRateSelf|winRateApp) × evidence (tracking+delivered+policies+honest page). Chargeback ratio (30d disputes/orders) > 0.75% → warning email; > 1% → payout reserve 25% for 30 days + Fadbook account risk.
- **Payouts** (00:00): yesterday's net becomes a payout arriving `addBusinessDays(day, payoutDays)` (first-ever payout +7 days); holds: sudden spike (day sales > 5× 7-day avg and > $2,000) → 7–10 day hold (Normal/Realistic, `payoutHolds`); capital withholding; paid payouts → `receive(cash)`.
- Plan & apps billed via bills. Analytics: keep all StoreDay; prune `byProduct` beyond 120 days; hourly last 72h. Orders keep last 1,500. `liveVisitors` ≈ sessions this hour × avg duration.
- `breakEven(s, spId)`: landed cost (unit + shipping + fees at price) → margin, BE CPA, BE ROAS = price/margin.

## 7. Ads — Fadbook & TikTak (sim-ads)

### Accounts
`openAdAccount(platform)`: status active, spendLimitTier 0 (ladder `BENCHMARKS[platform].spendLimitLadder`, raised when lifetimeSpend passes 500 / 5k / 25k / 100k with quality > 60), billing tier 0, quality 70. Pixel data comes from the store (install `fadbook-channel`/`tiktak-channel` app). Without a pixel: purchase optimization unavailable ("No pixel events") → optimization forced to traffic-like delivery (intent ×0.7, no learning exit).
**Billing**: `unbilled += spend`; at threshold → `pay(unbilled, {category:'ad_spend', pnl:'adSpendFadbook'|'adSpendTiktak', prefer: payWith})`; success → next threshold tier; fail → `payment_failed` (all delivery stops, critical notification) until `payAdBalance`. Also charge on the 1st of each month. Rented (agency) account: +3–6% fee on spend, higher starting limit, ban risk ×0.4.
**Bans/disapprovals**: new ads `in_review` 1–6h; rejection p = `claimRisk × (before_after/health hooks/angles ? 1.5 : 0.5) × (tiktak 0.8)`; rejections lower quality. Daily ban risk per active account = `0.0015 × banRiskMult × (age<14d 2.5) × (1 + 4×claimRisk of live products using risky hooks) × (budget jump >3× 2) × (chargeback ratio >1% 3) × (min page honesty <0.6 2) × (quality<40 2) × (rented 0.4)`. On ban → `restricted` (60%) or `disabled`, modal with choices: Appeal (activity; resolves 2–4 days; success 45%/70% restricted), Rent agency account, Open backup account (new BM; starts at tier 0; if > 2 bans → "you are banned from advertising" for 30 days on that platform).

### Structure & rules
Campaign (CBO/ABO, manual or `advantage` = Advantage+/Smart+; bid lowest_cost | cost_cap) → Ad sets (targeting: broad | interest | lookalike | retargeting; age, gender, geo US|T1, placements) → Ads (creative + copy + landing store product). TikTak mins: campaign $50/day, ad group $20/day (`BENCHMARKS.tiktak`); Fadbook min $1 ($5 for conversion). TikTak calls them "ad groups". Feature gates by media_buying skill (§3).
**Learning**: `window` = true conversions/day last 7 days. `learning` until ≥ `learningConversions` in window (→ `active`); 7 days after reset with fewer → `learning_limited`. Reset on: budget change beyond `significantBudgetChange` vs `budgetAtReset` (Fadbook 20%, TikTak 30%), targeting/optimization edits, new ad added, >7 days paused. Show "Learning" / "Learning limited" in Delivery.

### Delivery model — `adsTickHour(s)` (per active ad set on an active account whose landing product is active)
- Hourly spend = daily budget × `trafficByHour[h]` (CBO: split across ad sets by weight = (recent ROAS or predicted power)² with 15% exploration floor). Capped by account daily spend limit and card/billing status. Cost cap: spend × `clamp((costCap/predCPA)^3, 0.05, 1)` with intent ×1.1.
- Within an ad set, ads share by `power^2.5 × fatigueF` (+ exploration for new ads).
- **CPM** = `cpmBase × difficulty.cpmMult × cpmByMonth × (BFCM bfcmCpmMult | lateDec) × cpmByWeekday × audienceMult (broad 1, interest 1.12, lookalike 1.1, retargeting 2.2; narrow age span <20 ×1.1; single gender ×1.05) × geo (T1 0.88) × engagementMult clamp(1.3 − 0.3·power, 0.7, 1.35) × scaleMult × competitionMult[catalog] × learning (1.12 learning, 1.2 limited) × (quality<50 ? 1.15 : 1) × modifiers.cpmMult × lognormal(0.12·noise)`
  - `scaleMult = 1 + 0.6 × max(0, adSetDailySpend / (scaleCeiling × appeal × capacity))^1.4`, capacity: broad 1, lookalike 0.6, interest 0.35, retargeting 0.05 (+ audience-size dependent).
- Impressions = spend/CPM×1000; reach via audience size `N`: `reach = N(1 − e^{−imps/N})`; `frequency` rolling 7-day.
- **fatigueF** = `1 / (1 + (freq/F0)^2.2)` renormalized to 1 at freq 1, `F0 = fatigueFrequency × (0.8 + 0.4·quality) × (shared ? 0.7 : 1)`, × age decay (Fadbook −0.6%/day, TikTak −1.2%/day, floor 0.55).
- **Link CTR** = `ctrLink.avg × power × (0.75 + 0.6·wow) × audienceFit (0.8 mismatch … 1.08 match; broad 1) × fatigueF × (giftable in Q4 ×1.1) × (retargeting ×1.8) × modifiers.ctrMult × lognormal(0.15)`. Clicks(all) = link × 1.6–2.2 (Fadbook) / 1.3–1.6 (TikTak).
- **Video**: short views = imps × hookRate where hookRate = `hookRate.avg (fb) | view2sRate.avg (tt) × (0.55 + 0.9·scores.hook) × fatigueF^0.3`; long views = short × holdRate (`holdRate.avg × (0.5 + scores.body)`; TikTak 6s/2s ≈ 0.5 × (0.6 + 0.8·body)); v25..v100 decreasing. Static/carousel: no video metrics.
- LPV = link clicks × lpvRate × page speed factor. **TrafficPacket**: sessions = LPV, `intent = (tiktak cvrMultiplier | 1) × audienceIntent (retargeting 2.6, lookalike 1.1, interest 1.0, broad 0.9 + 0.2×min(1, pixelPurchases/300)) × (learning 0.95 | active 1.08) × (T1 0.9) × hookIntent (clickbait/curiosity hooks 0.88, problem/demo 1.05) × (cost cap 1.1) × (no pixel 0.7)`, `messageMatch = 0.9 + 0.2 × scores.fit`.
- Engagement (likes/comments/shares) from power & wow; TikTak higher.
- **Attribution** `adsRecordConversions`: truth → `truePurchases/trueRevenue` on the ad's day stats; platform-reported = truth × `reportedPurchaseInflation` range × `modifiers.attributionMult` → 70% now, 22% next day, 8% in 2 days, credited to the ORIGINAL day (numbers "catch up"). ATC/checkouts reported with the same inflation.
- **Organic TikTak** (`postOrganic`): views = 300–3,000 × power × wow; viral chance `0.015 × power² × wow × hookFit` → 200k–5M views over 2–4 days (velocity decay) → `tiktak_organic` packets (sessions ≈ views × 0.004 × intent). Posts can be Spark-boosted into a TikTak ad group.
- Automated rules (L4+) evaluated daily at 9AM. Stats pruned into `lifetime` after 120 days.
- Coach hooks: CTR < ctrLink.bad after 3k impressions; hook rate < bad; frequency > fatigueFrequency+0.5; CPA > 2×BE after spend ≥ 2×BE; budget change beyond threshold → "you just reset learning".

### Creatives (sim-ads) — `src/data/creativeTaxonomy.ts`
Formats, hooks, angles, beats with player-facing names/descriptions/examples (no hidden info). Producers:
- **self** (film yourself): needs sample in hand (`catalog.samplesOwned`) or 3PL stock; 3h activity (× productivity × phone-pro 0.9); quality = `0.3 + gear bonuses + 0.03×creative skill + apartment filmingBonus − (mood<30 ? 0.1 : 0) − (burnout 0.15)`, cap 0.9.
- **supplier_edit**: 1.5h, no sample; formats limited to supplier_edit/slideshow/static_image/carousel; quality 0.25 + 0.02×skill (cap 0.5); `shared = true` (others run the same footage → faster fatigue).
- **ugc** creator: price/quality/tier from marketplace; delivery = product ship days to creator (or 3 days from 3PL stock) + creator days; `status: waiting_sample → in_production → ready`.
- **agency**: pack of 3, $1.5–3.5k, 7–14 days, quality 0.8–0.95, style polished.
- **staff** ugc_creator: weekly output.
**Scoring** `scoreCreative`: `formatFit`, `hookFit`, `angleFit` (1.0 if in product's best lists; otherwise compatibility heuristics: demo/before_after for problemSolving>0.6; gift_idea only if giftable>0.5 (+Q4); before_after needs visible transformation; asmr for tactile/satisfying; static weak on TikTak cold; controversial risky), `beatsScore` (starts with hook, ends with cta, demo present if wow/problemSolving>0.5, social proof present, offer before cta, 4–7 beats ideal, problem before demo for pain_point), `hookTextScore` (3–12 words, uses you/POV/?/number, product keyword or pain word, not generic "Buy now"/"Best product", not ALL CAPS), script bonus (benefits, objections, CTA words). `hook = .45 hookFit + .3 hookText + .25 quality`; `body = .4 formatFit + .35 beats + .25 quality`; `cta` from beats/script; `fit = mean(formatFit, hookFit, angleFit)`; `power[p] = 0.35 + 1.9 × (.35 hook + .25 body + .1 cta + .3 fit) × native[p] × (0.8 + 0.4 wow)` where native: TikTak ×1.15 for ugc/green_screen/slideshow/pov/skit, ×0.8 polished agency, ×0.5 static; Fadbook ×1.05 ugc, ×0.85 static/carousel prospecting. Average ≈ 1.0, great ≈ 2+. `tips` are revealed only after ≥1,000 impressions, and their specificity scales with creative/media_buying skill.
Creators marketplace refreshes weekly (8–12 creators, portraits p01–p18, niches, tiers newbie $150–200 q0.45–0.65 / pro $220–320 q0.6–0.8 / star $350–400 q0.75–0.9, native vs polished style).

## 8. Events, coach & milestones (sim-market-events)
`eventsTickHour` recomputes `s.events.modifiers` from active events (+ market competitionMult). Daily rolls use cooldowns and `DIFFICULTY.dramaMult`.
- **Scheduled**: CNY — supplier emails at T−42/−28/−14/−7 days ("factories close Feb X–Y, stock up now"), shutdown window [CNY−7, CNY+14]: `dropshipDelayDays` +10–20, `supplierDelayDays` +21; backlog after. BFCM (Thu–Mon): Shopifly email + coach tip (discount, stock), modifiers via benchmarks. Valentine's / Mother's Day / Back-to-school / Prime Day (CVR −5% 2 days). Tax deadlines (finance emails).
- **Market**: competitor_copy (your product ≥ $1k/day revenue 3+ days, p 0.08/day) → +5–15 competitors, competitionMult 1.15 for 30 days, modal (match price −10% / refresh creatives / ignore). Supplier price hike (+8% cogs 60 days). Trend collapse for fads. January CPM crash & post-holiday lull are via benchmarks.
- **Viral/organic**: influencer offers (modal: pay $300–2,000 flat or send free product; outcome depends on product fit — can flop), creator steals your ad (fatigue ×1.3 on that creative), organic virality (ads module).
- **Platform drama**: tracking outage ("iOS 26.1 privacy update": attributionMult 0.55–0.7 for 3–5 days — reported purchases drop while real Shopifly sales hold; panic-killing is punished), platform outage (Fadbook delivery 0 for 6h), policy crackdown (claimRisk ×1.5 for 7 days), payout hold & account bans (store/ads own; this module may add random review holds).
- **Chargeback waves**: friendly-fraud wave on high-ticket items (chargeback p ×2 for 10 days) — interacts with ChargeFlo.
- **Life**: Mom needs help (lose 3h), roommate party (−20 energy at night), car/phone breaks ($150–450), friend's birthday (socialize invite), sickness after 3+ days of energy <20 (2–4 sick days), birthday money $100, tax refund.
Modals: `pushModal` + `registerEventModalHandlers()` registering handlers via `registerModalHandler`.
**Coach Kev** (`coachTickHour`/`coachDayRollover`, `askCoach`): onboarding checklist (essential tips: create store → find product → install DSerz → write page (don't copy supplier title!) → connect pixel (channel app) → make 3+ creatives → test campaign $30–50/day → pay your card), metric diagnostics with thresholds from BENCHMARKS (CTR/hook/hold/CPM/CVR/ATC/frequency/CPA vs BE/learning resets), cash-crunch warnings (card >80%, big bills upcoming vs payouts), CNY stock-up, chargeback ratio, unanswered tickets, needs. `askCoach` returns 3–6 concrete tips about the current business ("Ad 'POV hook v2' CPA $18 vs BE $26 — scale its ad set 20%/day").
**Milestones** (`src/data/milestones.ts`): first_store, first_product_live, first_sale, first_100_day, first_1k_day, first_10k_day, month_10k, month_100k, lifetime_1m, quit_job, first_hire, move_out, penthouse, first_winner ($10k lifetime profit on one product), chargeback_won, networth_100k, networth_1m. Notify + mail on unlock.

## 9. UI specs

### Shell (ui-shell)
- **Title screen**: `rooms/title.webp` background, "Dropship Tycoon" logo (Fredoka), Continue (latest slot), New Game (player name, store-name later, difficulty cards with `DIFFICULTY` descriptions), Load (3 slots via `listSaves`, delete, import JSON), audio toggle. Short "how to play" blurb.
- **HUD** (top bar, always visible, also above the computer): date & clock (`formatClock(hour, hourFrac)`), speed controls ⏸ ▶ ▶▶ ▶▶▶ (Space / 1 / 2 / 3), cash, card used/limit, today's business snapshot (sales, ad spend, orders), needs bars (⚡ energy, 🍔 hunger, 🙂 mood) with player portrait (mood-based), bell (notifications), mail badge, settings.
- **Scene**: apartment tier image (or McDoodle's when `location==='work'`), invisible hotspot buttons from `rooms/hotspots.json` (bed → Sleep/Nap menu; fridge → Eat at home/Order takeout; computer → open computer; door → go out: Gym/Socialize/Go to shift). Graceful fallback when art/hotspots are missing (styled placeholder room with the same buttons).
- **Side panel**: current activity + progress, queue (cancel), quick actions grouped (Life, Business: research/support (n open tickets)/chargebacks/study/post organic), next shift, autopilot toggle.
- **Computer overlay**: macOS-like browser window: tab strip (favicon glyph chips with site colors), toolbar (back/forward/reload, URL bar `https://{domain}/{path}`), bookmarks bar (sites with `bookmark:true`), content renders `SITE_COMPONENTS[site]` with `SiteProps`. Esc closes. At work → **phone frame** (390px, `compact: true`) with a banner.
- **Toasts** (bottom-right, Shopify style dark pill): sales toasts batch per tick ("🛍 3 new orders · $119.97"), play cha-ching; other kinds colored. Bell dropdown lists notifications with deep links (`site`/`path`).
- **Decision modals** (centered card, pauses), **Coach Kev bubble** (bottom-left portrait p12 `COACH_PORTRAIT` + text + "Show me" → `openSite(app)` + dismiss), **Settings** (volume, music, SFX, autopilot, coach, save now, export/import, quit to title), optional **daily recap** toast at midnight.
- **Audio** (`src/ui/audio.ts`): WebAudio-synthesized SFX (chaChing, ping, click, error, levelUp, fryer), music player looping `audio/lofi1.mp3`/`lofi2.mp3` (crossfade, starts after first user gesture), mute/volume from UI store.
- Responsive: < 900px stacks scene/panel; computer overlay fills the screen.

### Kits (ui-kits)
- **polaris/** — Shopify Polaris lookalike: tokens (bg #f1f1f1, surface #fff, text #303030, subdued #616161, border #e3e3e3, radius 12px cards / 8px controls, Inter 13px/20px, font weights 450/550/650), `Page` (title, back action, primary/secondary actions, subtitle), `Layout`/`Layout.Section` (2/3 + 1/3), `Card`, `BlockStack`/`InlineStack`/`InlineGrid`, `Text` variants, `Button` (primary = dark #303030 gradient bevel, secondary white bevel, plain, critical, tertiary; sizes), `Badge` (success #affebf/#014b40, info #e0f0ff/#00527c, attention #ffef9d/#4f4700, warning #ffd6a4/#5e4200, critical #fedad9/#8e0b21, neutral), `Banner`, `TextField` (with prefix/suffix, multiline), `Select`, `Checkbox`, `RadioButton`, `ChoiceList`, `Tabs`, `IndexTable` (checkbox rows, sortable headers, bulk bar), `DataTable`, `Thumbnail`, `Avatar`, `Modal`, `Popover`/`ActionList`, `DatePicker`-lite presets popover, `Divider`, `ProgressBar`, `SkeletonPage`, `EmptyState`, `Tooltip`, `Icon` (lucide wrapper), `RichTextEditor` (Shopify description editor lookalike: toolbar B/I/U/list/heading, contentEditable limited HTML, sanitize to p/ul/ol/li/strong/em/h3/br).
- **adsmanager/** — shared by Fadbook & TikTak with a `theme` prop ('fadbook' | 'tiktak'): dense `AmTable` (sticky header & first columns, checkbox + toggle column, sortable, resizable-ish, totals footer row "Results from N"), `Toggle`, `StatusCell` (dot + label), `DateRangePicker` (Today/Yesterday/Last 7/14/30 days/This month/Maximum), `ColumnsMenu` (presets + custom column picker), `BreakdownMenu` (By day), `SideDrawer`, `Stepper`, `MetricCell` helpers, `BudgetCell`, `Tabs` (Campaigns / Ad sets|Ad groups / Ads with selection counts).
- **phone/** — `PhoneMockup` + `AdPreview` (platform 'tiktak' | 'fadbook-reels' | 'fadbook-feed'; product image, hook text overlay, caption, CTA button, platform chrome, like/comment/share counts), used by Studio, Fadbook, TikTak, Mineo.
- **charts/** — `LineChartCard` (Shopify analytics style: current solid #2c6ecb, comparison dashed #9ec3f2, minimal gridlines, tooltips), `Sparkline`, `BarChart`, `DonutChart`, `FunnelBars`.
- **common/** — `ImageWithFallback`, `Money`, `Stars`, `Countdown`, `EmptyArt`.

### Shopifly (ui-shopifly-core + ui-shopifly-merch)
Top bar near-black (#1a1a1a) with Shopifly logo (green bag), centered search (#303030), store name + avatar; sidebar #ebebeb: Home, Orders (count badge), Products, Customers, Content, Analytics, Marketing, Discounts; "Sales channels" → Online Store; "Apps" (+ installed apps); Settings at bottom; active item white pill with 650 weight. Page canvas #f1f1f1, max-width ~ 998px (wide for analytics).
- **Onboarding** (store not created): Shopify-like signup ("Start your free trial"), store name, 3-step checklist; creates store.
- **Home**: setup guide checklist (add product, customize page, install DSerz, connect pixel, add domain, policies), "Today" metric pills (Total sales, Sessions, Orders, Conversion rate with sparklines), things-to-do (orders to fulfill, tickets, disputes, payouts), tips.
- **Orders**: IndexTable (Order #, Date, Customer, Channel, Total, Payment status badge, Fulfillment status badge, Items, Delivery status, Tags) with tabs All/Unfulfilled/Unpaid/Open/Archived, search; Order detail: items, payment summary (subtotal, discount, shipping, total, fees), fulfillment timeline, customer card, refund button, dispute banner, conversion summary (source/ad).
- **Customers** list derived from orders. **Analytics**: date range + compare, cards grid (Total sales, Gross sales breakdown, Online store sessions, Online store conversion rate with funnel: Sessions → Added to cart → Reached checkout → Sessions converted, AOV, Total orders, Sessions by device, Sessions by social source, Sales by social source, Top products, Returning customer rate, Sales attributed to marketing). **Reports** list (Sales over time, Sales by product, Sessions over time, Conversion over time, Profit by product (COGS/ad spend), Finance summary). **Live View**: dark globe (SVG orthographic with dots at customer cities), visitors right now, sessions, orders, total sales, customer behavior (active carts / checking out / purchased).
- **Finances**: balance, upcoming & paid payouts table, holds banner, transactions/fees, billing (plan + apps), Capital offer. **Disputes** (chargebacks: respond / accept / auto via ChargeFlo). **Inbox** (support tickets: list + reply templates, bulk "Work through queue" → customer_support activity). **Marketing**: email subscribers, Klavio flows performance, attribution by channel.
- **Products** list (IndexTable: image, title, status, inventory, sales channels, type, vendor). **ProductEditor** — Shopify's product page layout: Title, Description (RichTextEditor), Media (grid; add from supplier gallery / lifestyle photos you shot / UGC creatives), Pricing (Price, Compare-at, Cost per item → Profit & Margin readout), Inventory, Shipping (weight), Variants (options/values), Search engine listing preview; right column: Status (Active/Draft), Publishing, Product organization (type, vendor, collections, tags), **Page grade** card (score ring, cvrMult, factor list with tips; detail gated by copywriting skill), break-even card (BE CPA/ROAS). Save bar (contextual "Unsaved product" top bar with Discard/Save) like Shopify. `usePauseWhileMounted`.
- **Online Store**: themes (current theme card, theme library to buy/install), **ThemeEditor** (Shopify customizer: left section list for the product template with add/remove/reorder/toggle + settings panel, center live preview using storefront components, top bar with device toggle), preferences (store name/logo text/colors), policies editing (Settings/Policies), domains (buy `name.com` $14/yr).
- **Apps**: App store (categories, search, app cards: icon, rating ★ reviews, pricing, "Built for Shopifly" badge), AppDetail (description, screenshots-ish, plans, Install/Uninstall), installed apps list.
- **Discounts** (codes, automatic, quantity breaks). **Settings**: General, Plan (change plan), Payments (PayPal, BNPL toggles), Shipping (free/flat/threshold), Policies (textareas + "Create from template"), Domains.
- **Storefront site** (`storefront`, path `products/<id>` or home): Dawn-like theme with store logo text, announcement bar, product page (gallery, title, price/compare-at badge "Sale", variants, qty, Add to cart / Buy it now, description, enabled sections rendered in order, sticky ATC), home grid, footer with policies. Also used for ThemeEditor preview.

### Fadbook Ads Manager (ui-fadbook)
Meta Ads Manager clone. White UI, font Helvetica/Segoe/Roboto 12–13px, text #1c2b33, blue #0866ff, green "+ Create" button (#42b72a → hover darker), gray canvas #f0f2f5. Left icon rail (Ads Manager, Account overview, Campaigns, Audiences, Events Manager (pixel), Billing, Account quality). Top: ad account selector (name + id + status), search/filter bar, date range picker (right), "Updated just now" refresh.
- **Campaigns / Ad sets / Ads** tabs (selected-count chips "1 selected"), toolbar (Create, Duplicate, Edit, A/B test (disabled), trash, Rules (L4), Columns: Performance ▼, Breakdown ▼, Reports ▼). AmTable: toggle, name (hover actions: Edit / Duplicate / View charts), Delivery (Active / Learning / Learning limited / Off / In review / Rejected / Not delivering / Account disabled), Bid strategy, Budget ("$50.00 Daily" / "Using ad set budget"), Attribution setting (7-day click or 1-day view), Results (Purchases), Reach, Impressions, Frequency, Cost per result, Amount spent, Purchase ROAS, and column presets: Performance, Performance & clicks (CPM, CPC link, CTR link, Link clicks), Video engagement (3-second video plays, ThruPlays, Hook rate, Hold rate, Video avg play time), **Ecom custom** (Spend, CPM, CTR (link), CPC (link), Hook rate, Hold rate, ATC, Cost per ATC, Purchases, CPA, ROAS, Frequency). Totals footer. Breakdown by day. Row selection filters child tabs.
- **Create flow**: objective modal (Sales enabled; others disabled with tooltip), Advantage+ shopping vs Manual → 3-pane editor (left tree Campaign > Ad set > Ad; center form; right audience-size gauge "Your audience is broad/defined", estimated daily results): campaign name, CBO toggle + budget, bid strategy/cost cap; ad set: conversion location Website, pixel, event Purchase (warn if no pixel), budget (ABO), audience (Advantage+ audience/broad, location US/T1, age, gender, detailed targeting search via `searchInterests`, custom audiences), placements (Advantage+/manual); ad: identity (store page), format, **creative picker** (ready creatives for that product, preview via `AdPreview`), primary text, headline, description, CTA, website URL (store product). Publish → "In review".
- Edit drawer on click; inline budget edit (warns "Significant edits reset learning" when >20%). Charts view (per entity daily lines). Account overview (spend, results trend), Billing (payment activity with thresholds, "Pay now" when failed, payment method), Account quality (status, disapprovals, appeal button), Events Manager (pixel status, events received last 7 days), Audiences (create lookalike 1–10% / website retargeting).

### TikTak Ads Manager (ui-tiktak)
TikTok Ads Manager clone. Top navigation (black TikTak logo, "Dashboard | Campaign | Tools | Analytics | Assets"), white canvas #f5f6f7, primary teal/cyan (#00B2B4-ish buttons) with TikTak pink #FE2C55 accents, rounded 4–6px, font 13px. **Dashboard** (cost, CPM, CPC, impressions, clicks, conversions, cost per conversion charts). **Campaign** page: tabs Campaign / Ad group / Ad, status filter, date range, table: On/off, Name, Status (Active, Learning, Learning limited, Not delivering, Inactive), Budget, Cost, CPC (destination), CPM, Impressions, Clicks (destination), CTR (destination), Conversions, Cost per conversion, Conversion rate, 2-second video views, 6-second video views, Total complete payment ROAS, Frequency. Create: Web conversions objective → Smart+ vs Manual; ad group (placement TikTak, targeting: automatic / custom demographics & interests, budget ≥ $20, optimization Complete Payment, bid Lowest cost / Cost cap); ad (identity, **Spark Ads** toggle for organic posts, video from creative library, ad text, CTA "Shop now"). Enforce $50 campaign / $20 ad group minimums. Budget changes >30% warning. Assets: creative library, organic posts (Post to TikTak → `post_organic` activity) with views/likes and Spark button. Pixel under Tools > Events.

### AliExprez & Mineo (ui-sourcing)
AliExprez: white/orange-red (#fd384f) header, search bar with red search button, category chips (niches), sort (Best match / Orders / Newest / Price), product cards (image, 2-line keyword-stuffed title, red price "US $6.49", strikethrough original, "−58%", "10,000+ sold", ★ 4.7, "Choice" badge, "Free shipping"), New arrivals row, favorites. Product page: gallery, supplierTitle, price, variant pickers, shipping estimate ("Delivery: Oct 2–Oct 12"), store info card (supplier name, years, rating), actions **Add to Shopifly (DSerz import)**, **Buy sample**, ♡; tabs: Description (supplierDescription + specs), Reviews (generated reviews whose complaint share reflects defectRate), Research (research notes + "Research this product (1h)" button + insights). My orders (samples tracking). **Business** area (after unlock): agent quotes, bulk orders (qty, sea/air, cost, ETA incl. CNY), 3PL inventory, private label. Mineo: dark purple SaaS; paywall/subscribe ($49/mo); Trending ads feed (AdPreview cards with likes/comments/shares, days running, advertiser, platform), product search, product analytics (ads over time, engagement trend, competitor price, first seen, top ads & hooks).

### CreatorHub (ui-studio)
Tabs: **New brief** (product picker [store products; shows sample/stock status], format cards, hook cards, angle cards (names + short neutral descriptions + examples; no "best for" leaks), script beats builder (add/remove/reorder chips), on-screen hook text input, optional script textarea, producer: Film yourself (needs sample; 3h; shows expected quality from gear/skill), Supplier footage edit (1.5h), Hire a creator (marketplace list), Agency pack), live `AdPreview`; **Library** (creative cards: preview, status/ETA, producer, cost, used in N ads, spend/CTR/hook rate if running, insights after data), **Creators** marketplace (portrait, tier, price, delivery, rating, jobs, style, niches). Orders call `orderCreative`.

### Life sites (ui-life-sites)
- **Chaise Bank**: accounts overview (checking, Sapphire card: balance, available, statement balance, min due, due date, autopay select, Pay card), transactions (ledger, filter by account/category/business), Business P&L by month (from `finance.pnl`), bills list, Capital offer, credit increase, taxes estimate.
- **Inboxly**: Gmail-like list (sender, subject, snippet, time, unread bold), tags filter, message view, deep-link button.
- **McDoodle's Crew**: red/yellow portal: next 14 days schedule, change schedule, rank & promotion progress, reliability, strikes, pay stubs, call out sick, quit (confirm), ask for job back.
- **Zillo**: listings (tier images, rent, requirements met/not, features), apply & move.
- **Amazin**: gear catalog (images, price, stars, Prime-ish badge), Buy, owned/equipped state, equip.
- **UpWorx**: candidates (portrait, role, skill stars, weekly rate, bio), hire; My team (salary, morale, config forms per role), fire.
- **Ecom Academy**: Coach Kev (portrait p12 `COACH_PORTRAIT`; "Ask Kev" → `askCoach`), glossary & benchmarks (from BENCHMARKS + docs/BENCHMARKS.md rules of thumb), courses (study activity per skill), milestones gallery, skill levels.

## 10. Balance targets (verified later with headless bots)
- **Novice bot** (random product, supplier title/description, price 2× cogs, 1 supplier-edit creative, $50/day broad, doubles budget after any sale, never refreshes, never answers tickets): loses money in ≥85% of 90-day runs; median ROAS ~0.1 (0.3–0.9 when it happens to pick a sound product: winner or high-ticket). At a ~$19 order, 0.3+ would need a top-decile 5–6% CVR, which a supplier-copy page can't reach (see §6 conversion formula, §7 benchmarks).
- **Expert bot** (picks from high perceived-value gap / rising / low-saturation signals, page grade ≥ 80, price ≈ 0.85–0.95× perceived, 4+ creatives fitting best hooks/angles, kills ads at 2× BE CPA without purchases, scales 20%/day above 1.3× BE ROAS, refreshes at frequency > 3, pays card, answers tickets, stocks before CNY): profitable within 30–45 days on Normal in ≥70% of runs; $500–2,000/day revenue by day 90; >$5k/day achievable by ~6 months with bulk + creative refresh.
- Typical winners: break-even ROAS 1.6–2.2; good ad CTR 1.5–3%, hook 30–40%, CVR 2.5–4.5%, CPA below BE.

## 11. Parody glossary
Shopify→**Shopifly**, Meta/Facebook→**Fadbook** (Instagram→**Instaglam**), TikTok→**TikTak**, AliExpress→**AliExprez**, Minea→**Mineo**, Chase→**Chaise Bank**, Gmail→**Inboxly**, McDonald's→**McDoodle's**, Zillow→**Zillo**, Amazon→**Amazin**, Upwork→**UpWorx**, DSers→**DSerz**, Judge.me→**Judgy.me**, Loox→**Lookz**, ReConvert→**ReKonvert**, Klaviyo→**Klavio**, Chargeflow→**ChargeFlo**, Gorgias→**Gorgeous**, AfterShip→**TrackWise**, Klarna→**Klarno**, Vitals→**Vitalz**, PageFly→**PageFli**, Advantage+→**Advantage+** (generic term OK), Smart+ → **Smart+**. Coach: **Coach Kev**. Sourcing agent: **SourcePro (Agent Lily)**.
