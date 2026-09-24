# E2E / QA tooling (dev server only)

Browser QA for Dropship Tycoon with Playwright against the running Vite dev server
(`http://localhost:5317`, override with `DT_URL=...`). Nothing here ships: the scenario code in
`src/dev/**` is loaded from `src/main.tsx` behind `import.meta.env.DEV` + a dynamic import, so
production builds tree-shake it away.

```
scripts/e2e/
  helpers.mjs            launch / openGame / openSite / collectErrors / shot / wait helpers
  crawl.mjs              crash crawl over every site + route for every scenario (+ phone pass)
  scenarios-report.ts    headless: build each scenario with the real sim and print what's in it
  selftest.mjs           proves the detectors work (console/page errors, error-boundary crash)
  out/                   screenshots + reports (gitignored)
  tmp/                   your throwaway scripts (gitignored)
```

## 1. Scenarios: jump straight into a mid-game state

Open the dev server with `?scenario=<name>`:

| name     | state |
|----------|-------|
| `fresh`  | Day 1, 7:00 AM. Brand-new game, nothing set up (onboarding everywhere). |
| `store`  | Day 4. Store "Northwind Goods" created; DSerz, Fadbook channel, TikTak channel, JudgyMe installed; 2 products imported (one polished page, active; one untouched supplier-copy draft); AliExprez sample in hand; Mineo active. No ad accounts yet. |
| `ads`    | Day 36. Fadbook + TikTak accounts with campaigns / ad sets / ads; 4+ ready creatives (self-shot + UGC); ~600 orders; open tickets; a dispute awaiting response; payouts flowing; Mineo active; quit McDoodle's. No pending decision modal. |
| `scaled` | Day 121. Sourcing agent + 3PL bulk inventory on hand (fulfillment mode `bulk`); VA + a second hire on UpWorx; Studio apartment (tier 2); four months of history. |
| `crisis` | Day 315 (mid-January 2027, four weeks before Chinese New Year). Fadbook account **restricted**, TikTak account **payment_failed**, credit card at ~99% of its limit, checking at ~$38, open chargebacks + escalated tickets, two CNY warning mails from the supplier. Still employed at McDoodle's. |

Examples:

```
http://localhost:5317/?scenario=ads
http://localhost:5317/?scenario=crisis&site=fadbook&path=account_quality
http://localhost:5317/?scenario=scaled&speed=1
```

URL params:

| param | default | meaning |
|-------|---------|---------|
| `scenario` | – | `fresh` \| `store` \| `ads` \| `scaled` \| `crisis` |
| `slot` | `9` | save slot the autosave writes to. `9` is a scratch slot the title screen never lists, so your real saves (0–2) are safe. Use `0`–`2` to make the run show up under "Load game". |
| `seed` | `20260302` | RNG seed (scenarios are deterministic per seed) |
| `speed` | `0` | clock after loading: `0` paused (state stays put while you inspect), `1`, `2`, `4` |
| `site`, `path` | – | open the in-game computer on that site / route immediately |

Notes
- The state is built by `src/dev/scenarios.ts` driving the real public sim APIs + `tickHour`
  (a scripted competent player, `src/dev/player.ts`, ported from `scripts/smoke.ts`). A few
  crisis beats are forced through sim functions (the Fadbook ban uses the sim's own ban path; the
  cash squeeze is real `pay()` charges; the dispute guarantee uses the store's `openChargeback`).
- Build times: fresh/store < 0.1 s, ads ≈ 0.3 s, scaled ≈ 1.5 s, crisis ≈ 0.6 s.
- A full page reload with `?scenario=` in the URL **rebuilds** the scenario (deterministic). Drop
  the param to resume the autosave instead.
- Coach tips older than 2 days are dismissed (a real player would have read them).
- Each build checks its own promises (`scenarioChecks` in `src/dev/scenarios.ts`); anything unmet is
  logged as a `[dev] scenario … is missing:` console warning, exposed as `__dt.scenario.warnings`, and
  listed at the top of the crawl summary (the sim keeps changing, so the RNG can drift).
- Headless check without a browser: `npx tsx scripts/e2e/scenarios-report.ts [names…]`.

## 2. `window.__dt` (dev builds only)

Available on every dev page (with or without `?scenario=`):

```js
__dt.useGame / __dt.useUI     // the zustand stores
__dt.act(s => { ... })        // mutate game state (immer)
__dt.openSite(site, path)     // open a site in the in-game browser (reuses that site's tab)
__dt.buildScenario(name)      // build a GameState (not loaded)
__dt.loadScenario(name, { slot, seed, speed, site, path })  // build + load in place, no reload
__dt.scenario                 // { name, seed, buildMs, day, hour, warnings } of the loaded scenario (or null)
__dt.scenarioError            // build error message when ?scenario= failed (title screen shows)
__dt.state()                  // current GameState
__dt.tick(hours)              // simulate N in-game hours now
__dt.resolveModals(choiceId?) // resolve pending decision modals (first choice by default)
__dt.closeTabs(closeComputer?)
__dt.setSpeed(0|1|2|4)
__dt.scenarios, __dt.sites    // names / site ids
```

## 3. `helpers.mjs`

```js
import { launch, openGame, openSite, shot, waitForText, horizontalOverflow, PHONE } from './helpers.mjs'

const { browser, page, errors } = await launch()          // { headless, viewport, mobile: true → touch phone }
const info = await openGame(page, 'ads')                    // waits for the scenario + game shell
const r = await openSite(page, 'shopifly', 'orders')        // { status: 'ok'|'crash'|'blank'|'timeout'|'fatal'|'missing', message, ms }
await page.getByRole('button', { name: 'Export' }).click()   // regular Playwright from here on
await shot(page, 'shopifly-orders')                          // → scripts/e2e/out/shopifly-orders.png
console.log(errors.take())                                   // pageerror + console.error since the last take()
await browser.close()
```

- `launch(opts)` / `newPage(browser, opts)`: Chromium, 1440×900 by default; `{ viewport: PHONE, mobile: true }` for 390×844 touch.
- `collectErrors(page)`: uncaught page errors + `console.error`; ignores Vite HMR noise, React DevTools
  hints and 404s for placeholder art (every `<img>` has an `onError` fallback). `take()` drains, `clear()` skips.
- `openGame(page, scenario, { slot, seed, speed, site, path })`.
- `openSite(page, site, path)` → `waitForSite(page, site)`: waits for Suspense/skeleton loaders to finish and
  the DOM to settle; reports the per-tab error boundary ("Aw, snap!" → `crash` + message), the shell crash
  screen (`fatal`), empty tabs (`blank`), and loaders that never resolve (`timeout`).
- `gameState(page, s => s.store.orders.length)`, `act(page, s => { s.finance.cash = 5 })`, `tick(page, 24)`, `closeTabs(page)`.
- `waitForIdle(page)`, `waitForText(page, 'Orders')`, `siteView(page, 'fadbook')` (locator of the visible tab).
- `horizontalOverflow(page, selector)`: elements sticking out past the viewport (phone layout check).
- `scanText(page, selector)`: visible `NaN` / `undefined` / `[object Object]` / real brand names.
- `waitForGame(page)`: after a Vite full reload (the `?scenario=` URL rebuilds the same state); `isReloadError(e)`.
- `shot(page, 'dir/name', { fullPage, selector })`, `writeOut('file.json', data)`.

Headed run: `HEADED=1 node scripts/e2e/tmp/my-test.mjs`.

## 4. Crash crawl

```
node scripts/e2e/crawl.mjs                          # all scenarios + phone pass (~2–3 min)
node scripts/e2e/crawl.mjs --scenarios ads,crisis   # some scenarios
node scripts/e2e/crawl.mjs --sites shopifly,mail    # some sites
node scripts/e2e/crawl.mjs --grep disputes          # routes whose "site/path" contains the text
node scripts/e2e/crawl.mjs --no-phone --no-shots --concurrency 2 --timeout 15000
```

For each scenario it opens every site in `src/ui/sites/registry.ts` and every route its router knows
(ids such as the latest order, the open dispute, a ready creative, a UpWorx candidate come from the loaded
state), plus deliberately bad deep links (`orders/999999`, `apps/missing`, …) which must render a
"not found" state rather than crash. `fresh` only visits landing / onboarding pages. The phone pass loads
`ads` at 390×844 (touch) and checks the shell + Shopifly / Fadbook / TikTak, including horizontal overflow.

Every rendered page is also scanned for visible-text smells: `NaN`, `undefined`, `Infinity`,
`[object Object]`, and real brand names (Shopify, TikTok, Meta, Amazon, PayPal, …) that must be parody
names in player-visible text (`scanText(page, selector)` in helpers does the same for any element). A Vite
full reload in the middle of the crawl (someone saved a file) is detected and the route is retried.

Output:
- `out/crawl-summary.md`: failures per scenario, routes that rendered with console errors, slow routes, phone
  results and a de-duplicated list of distinct errors.
- `out/crawl-report.json`: every route with status, timing, errors (+ stack for page errors).
- `out/crawl/<scenario>/*.png`: each site's first page + every failing / erroring route; `out/crawl/phone/*.png`.

After the routes, a live pass simulates 72 in-game hours (`--live-hours N`, `--no-live`) hour by hour with
the Shopifly home open: sim exceptions, render errors under live updates and every decision modal that pops
up are recorded (modals are screenshotted as `out/crawl/<scenario>/_modal_<kind>.png`, then resolved).

Exit code 1 when any route crashed, went blank, timed out or hung, or the live pass failed.
