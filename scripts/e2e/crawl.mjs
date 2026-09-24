#!/usr/bin/env node
// Crash crawl: for each dev scenario, open EVERY in-game site and every known route in the
// in-game browser, wait for it to render and record crashes (per-tab error boundary, shell
// crash screen), blank pages, stuck loaders, uncaught errors and console.error output.
// Also runs a phone-viewport (390×844) pass over the shell + Shopifly / Fadbook / TikTak.
//
//   node scripts/e2e/crawl.mjs                         all scenarios (fresh roots + store, ads, scaled, crisis) + phone pass
//   node scripts/e2e/crawl.mjs --scenarios ads,crisis  some scenarios
//   node scripts/e2e/crawl.mjs --sites shopifly,mail   some sites
//   node scripts/e2e/crawl.mjs --grep orders           only routes whose "site/path" contains "orders"
//   node scripts/e2e/crawl.mjs --no-phone --no-shots --concurrency 2
//   node scripts/e2e/crawl.mjs --live-hours 168      simulate a week after the route crawl (default 72, --no-live to skip)
//
// Output: scripts/e2e/out/crawl-report.json, scripts/e2e/out/crawl-summary.md,
//         scripts/e2e/out/crawl/<scenario>/*.png (site landing pages + every failure).
// Exit code: 1 when any route crashed / went blank / hung, else 0.
import { launch, newPage, openGame, waitForGame, isReloadError, waitForSite, scanText, shot, writeOut, horizontalOverflow, closeTabs, PHONE, BASE_URL, OUT_DIR } from './helpers.mjs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const flag = name => argv.includes(`--${name}`)
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def
}
const ALL_SCENARIOS = ['fresh', 'store', 'ads', 'scaled', 'crisis']
const SCENARIOS = opt('scenarios', ALL_SCENARIOS.join(',')).split(',').map(x => x.trim()).filter(Boolean)
const ONLY_SITES = opt('sites', '').split(',').map(x => x.trim()).filter(Boolean)
const GREP = opt('grep', '')
const CONCURRENCY = Math.max(1, Number(opt('concurrency', '3')) || 3)
const SHOTS = !flag('no-shots')
const PHONE_PASS = !flag('no-phone')
const PHONE_SCENARIO = opt('phone-scenario', 'ads')
const ROUTE_TIMEOUT = Number(opt('timeout', '10000')) || 10000
/** in-game hours simulated after the route crawl (live ticks + decision modals); 0 disables */
const LIVE_HOURS = flag('no-live') ? 0 : Number(opt('live-hours', '72')) || 0

// ---------------------------------------------------------------------------
// Route enumeration (from each site's router; ids come from the loaded scenario)
// ---------------------------------------------------------------------------
async function collectIds(page) {
  return page.evaluate(async () => {
    const s = window.__dt.state()
    const load = (url, f) => import(/* @vite-ignore */ url).then(f).catch(() => [])
    const [apps, reports, themes, roles] = await Promise.all([
      load('/src/data/apps.ts', m => m.APPS.map(a => a.id)),
      load('/src/ui/sites/shopifly/core/reportsCatalog.ts', m => m.REPORTS.map(r => r.id)),
      load('/src/data/themes.ts', m => m.THEMES.map(t => t.id)),
      load('/src/data/staff.ts', m => Object.keys(m.STAFF_ROLES)),
    ])
    const last = a => (a && a.length ? a[a.length - 1] : undefined)
    const live = x => x.status !== 'deleted'
    const orders = s.store.orders
    const cb = s.store.chargebacks.find(c => c.status === 'needs_response') ?? last(s.store.chargebacks)
    const ticket = s.store.tickets.find(t => t.status === 'open') ?? last(s.store.tickets)
    const ready = s.creatives.creatives.filter(c => c.status === 'ready')
    const mine = [...new Set(s.store.products.map(p => p.catalogId))]
    return {
      storeCreated: s.store.created,
      lastOrder: last(orders)?.id,
      disputedOrder: cb?.orderId,
      products: s.store.products.map(p => p.id),
      customerEmail: last(orders)?.customer?.email,
      chargeback: cb?.id,
      ticket: ticket?.id,
      payout: last(s.store.payouts)?.id,
      discount: s.store.discounts[0]?.id,
      installedApps: s.store.apps.map(a => a.appId),
      apps,
      reports,
      themes,
      roles,
      fbAccount: s.ads.accounts.some(a => a.platform === 'fadbook'),
      ttAccount: s.ads.accounts.some(a => a.platform === 'tiktak'),
      ttCampaign: s.ads.campaigns.find(c => c.platform === 'tiktak' && live(c))?.id,
      ttAdGroup: s.ads.adSets.find(c => c.platform === 'tiktak' && live(c))?.id,
      creative: ready[0]?.id ?? last(s.creatives.creatives)?.id,
      post: s.ads.organicPosts[0]?.id,
      mineCatalog: mine[0],
      otherCatalog: s.catalog.available.find(id => !mine.includes(id)),
      keyword: (s.store.products[0]?.title ?? 'pet').split(/\s+/)[0].toLowerCase(),
      creator: s.creatives.creators[0]?.id,
      candidate: s.staff.candidates[0]?.id,
      member: s.staff.members[0]?.id,
      lastMail: last(s.inbox)?.id,
      cnyMail: s.inbox.find(m => /spring festival|chinese new year/i.test(m.subject))?.id,
    }
  })
}

function routesFor(scenario, ids) {
  const full = scenario === 'store' || scenario === 'ads'
  const R = []
  const add = (site, ...paths) => {
    for (const p of paths) if (p !== undefined && p !== null) R.push({ site, path: p })
  }
  const opt = (cond, v) => (cond ? v : undefined)

  if (scenario === 'fresh') {
    // brand-new game: every site's landing page (onboarding / empty states)
    for (const site of ['shopifly', 'storefront', 'fadbook', 'tiktak', 'aliexprez', 'mineo', 'studio', 'bank', 'mail', 'mcdoodles', 'zillo', 'amazin', 'upworx', 'academy']) add(site, '')
    add('fadbook', 'billing', 'account_quality')
    add('tiktak', 'setup', 'campaign/create')
    add('studio', 'library', 'creators')
    add('aliexprez', 'orders', 'business')
    return R
  }

  // ---- Shopifly admin ----
  add('shopifly', '', 'orders', opt(ids.lastOrder, `orders/${ids.lastOrder}`), opt(ids.disputedOrder && ids.disputedOrder !== ids.lastOrder, `orders/${ids.disputedOrder}`), 'orders/999999')
  add('shopifly', 'products', ...ids.products.map(id => `products/${id}`), 'products/sp_missing')
  add('shopifly', 'customers', opt(ids.customerEmail, `customers/${encodeURIComponent(ids.customerEmail ?? '')}`), 'content/files')
  add('shopifly', 'analytics', 'analytics/reports', 'analytics/live', 'analytics/reports/missing')
  const reports = full ? ids.reports : ids.reports.slice(0, 5)
  add('shopifly', ...reports.map(r => `analytics/reports/${r}`))
  add('shopifly', 'finances', 'finances/payouts', opt(ids.payout, `finances/payouts/${ids.payout}`), 'finances/payouts/missing', 'finances/transactions', 'finances/billing', 'finances/capital')
  add('shopifly', 'disputes', opt(ids.chargeback, `disputes/${ids.chargeback}`), 'disputes/missing')
  add('shopifly', 'inbox', opt(ids.ticket, `inbox/${ids.ticket}`), 'inbox/missing')
  add('shopifly', 'marketing', 'marketing/attribution', 'marketing/automations')
  add('shopifly', 'discounts', 'discounts/new', 'discounts/new/free_shipping', 'discounts/new/bxgy', opt(ids.discount, `discounts/${ids.discount}`))
  add('shopifly', 'online-store', 'online-store/preferences', 'online-store/editor', opt(ids.products[0], `online-store/editor/product/${ids.products[0]}`), 'online-store/editor/home')
  add('shopifly', ...ids.themes.filter(t => t !== 'dawnish').slice(0, 1).map(t => `online-store/editor/preview/${t}`))
  const apps = full ? ids.apps : [...new Set([...ids.installedApps, 'klavio', 'chargeflo'])]
  add('shopifly', 'apps', ...apps.map(a => `apps/${a}`), 'apps/missing')
  add('shopifly', 'settings', 'settings/general', 'settings/plan', 'settings/payments', 'settings/shipping', 'settings/domains', 'settings/policies')

  // ---- storefront ----
  add('storefront', '', ...ids.products.map(id => `products/${id}`), 'collections/all', 'cart', 'products/sp_missing', 'no-such-page')
  add('storefront', 'policies/refund', 'policies/shipping', 'policies/privacy', 'policies/terms', 'policies/contact')

  // ---- Fadbook Ads Manager ----
  add('fadbook', '', 'manage/campaigns', 'manage/adsets', 'manage/ads', 'create', opt(ids.creative, `create/creative/${ids.creative}`), 'overview', 'audiences', 'events', 'billing', 'account_quality', 'rules')

  // ---- TikTak Ads Manager ----
  add('tiktak', '', 'dashboard', 'campaign', 'campaign/adgroup', 'campaign/ad', 'campaign/create')
  add('tiktak', opt(ids.ttCampaign, `campaign/create/adgroup/${ids.ttCampaign}`), opt(ids.ttAdGroup, `campaign/create/ad/${ids.ttAdGroup}`), opt(ids.creative, `campaign/create/creative/${ids.creative}`), opt(ids.post, `campaign/create/spark/${ids.post}`))
  add('tiktak', 'tools/events', 'tools/audiences', 'tools/rules', 'analytics', 'analytics/creative', 'assets/creatives', 'assets/posts', 'account', 'billing', 'account_quality', 'setup')

  // ---- AliExprez ----
  add('aliexprez', '', `search?q=${encodeURIComponent(ids.keyword)}`, 'search?q=zzzqqq', 'search?sort=orders', 'category/pet', 'new', 'wishlist')
  if (ids.mineCatalog) add('aliexprez', `item/${ids.mineCatalog}`, `item/${ids.mineCatalog}/reviews`, `item/${ids.mineCatalog}/research`, `item/${ids.mineCatalog}/description`)
  add('aliexprez', opt(ids.otherCatalog, `item/${ids.otherCatalog}`), 'item/missing', 'orders', 'orders/store', 'business', 'business/bulk', 'business/inventory', 'business/private-label')

  // ---- Mineo ----
  add('mineo', '', 'ads', `ads?q=${encodeURIComponent(ids.keyword)}`, 'products', 'products?q=pet', opt(ids.mineCatalog, `product/${ids.mineCatalog}`), opt(ids.otherCatalog, `product/${ids.otherCatalog}`), 'product/missing', 'watchlist', 'billing')

  // ---- CreatorHub ----
  add('studio', '', 'new', opt(ids.products[0], `new/${ids.products[0]}`), opt(ids.mineCatalog, `new?product=${ids.mineCatalog}`), 'library', opt(ids.mineCatalog, `library?product=${ids.mineCatalog}`), opt(ids.creative, `library/${ids.creative}`), 'library/missing', 'creators', opt(ids.creator, `creators/${ids.creator}`))

  // ---- life sites ----
  add('bank', '', 'card', 'activity', 'activity/bank', 'activity/card', 'bills', 'pnl', 'taxes', 'offers')
  add('mail', '', 'inbox/business', 'inbox/updates', 'unread', 'all', ...['coach', 'job', 'bank', 'landlord', 'shopifly', 'platform', 'supplier', 'customer', 'creator', 'misc'].map(t => `label/${t}`))
  add('mail', opt(ids.lastMail, `m/${ids.lastMail}`), opt(ids.cnyMail, `m/${ids.cnyMail}`), 'm/missing')
  add('mcdoodles', '', 'schedule', 'pay', 'career', 'timeoff', 'resign')
  add('zillo', '', ...[0, 1, 2, 3, 4, 5].map(t => `listing/${t}`), 'listing/9', 'home', 'afford')
  add('amazin', '', 'c/phone', 'c/lighting', 'c/camera', 'c/computer', 'c/audio', 'item/ring-light', 'item/laptop-pro', 'item/phone-cracked', 'item/missing', 'owned', 'search/ring', 'search/zzzqqq')
  add('upworx', '', ...ids.roles.map(r => `role/${r}`), opt(ids.candidate, `f/${ids.candidate}`), opt(ids.member, `f/${ids.member}`), 'f/missing', 'team')
  add('academy', '', 'kev', 'courses', ...['research', 'copywriting', 'creative', 'media_buying', 'operations'].map(k => `course/${k}`), 'glossary', 'glossary/rules', 'glossary/terms', 'glossary/tables', 'skills', 'milestones')

  // de-dupe, filter
  const seen = new Set()
  return R.filter(r => {
    const k = `${r.site}/${r.path}`
    if (seen.has(k)) return false
    seen.add(k)
    if (ONLY_SITES.length && !ONLY_SITES.includes(r.site)) return false
    if (GREP && !k.includes(GREP)) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Crawl one scenario
// ---------------------------------------------------------------------------
const withTimeout = (p, ms, what) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms} ms: ${what}`)), ms))])

const slug = p => (p === '' ? '_root' : p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 80))

async function crawlScenario(browser, scenario) {
  let { context, page, errors } = await newPage(browser)
  const out = { scenario, info: null, loadError: null, shell: null, results: [] }
  const shotDir = `crawl/${scenario}`
  try {
    out.info = await openGame(page, scenario, { timeout: 90_000 })
  } catch (e) {
    out.loadError = String(e.message ?? e)
    await context.close()
    return out
  }
  out.shell = { errors: errors.take(), textIssues: await scanText(page, '.sh-game') }
  if (SHOTS) await shot(page, `${shotDir}/_shell`)
  const ids = await collectIds(page)
  const routes = routesFor(scenario, ids)
  let prevSite = null
  const shotSites = new Set()
  for (const r of routes) {
    const rec = { site: r.site, path: r.path }
    for (let attempt = 1; ; attempt++) {
      try {
        if (r.site !== prevSite) {
          await closeTabs(page)
          prevSite = r.site
        }
        errors.clear()
        await page.evaluate(([s, p]) => window.__dt.openSite(s, p), [r.site, r.path])
        const res = await withTimeout(waitForSite(page, r.site, { timeout: ROUTE_TIMEOUT }), ROUTE_TIMEOUT + 8000, `${r.site}/${r.path}`)
        Object.assign(rec, res)
        break
      } catch (e) {
        if (isReloadError(e) && attempt < 3) {
          // Vite full reload (someone edited a file): the URL rebuilds the scenario; retry this route
          out.reloads = (out.reloads ?? 0) + 1
          process.stdout.write('r')
          try {
            await waitForGame(page, { timeout: 90_000 })
          } catch { /* retry anyway */ }
          prevSite = null
          continue
        }
        rec.status = 'hang'
        rec.message = String(e.message ?? e)
        break
      }
    }
    rec.errors = errors.take().map(e => ({ type: e.type, text: e.text.split('\n')[0].slice(0, 400), stack: e.stack }))
    const bad = rec.status !== 'ok'
    if (SHOTS && (bad || !shotSites.has(r.site) || rec.errors.length)) {
      shotSites.add(r.site)
      try {
        rec.screenshot = path.relative(OUT_DIR, await withTimeout(shot(page, `${shotDir}/${r.site}__${slug(r.path)}`), 15_000, 'screenshot'))
      } catch { /* page hung */ }
    }
    out.results.push(rec)
    const mark = rec.status === 'ok' ? (rec.errors.length ? '!' : '.') : 'X'
    process.stdout.write(mark)
    if (rec.status === 'hang') {
      // the page's main thread is stuck: start over with a fresh page for the rest
      process.stdout.write(`\n[${scenario}] ${r.site}/${r.path} hung; reloading\n`)
      await context.close().catch(() => {})
      ;({ context, page, errors } = await newPage(browser))
      try {
        await openGame(page, scenario, { timeout: 90_000 })
      } catch (e) {
        out.loadError = `reload after hang failed: ${e.message ?? e}`
        break
      }
      prevSite = null
    }
  }
  if (LIVE_HOURS > 0 && !out.loadError) out.live = await livePass(page, errors, scenario)
  process.stdout.write(`  [${scenario}] ${routes.length} routes\n`)
  await context.close()
  return out
}

/**
 * Keep simulating (hour by hour through __dt.tick) with the Shopifly home open: catches sim
 * exceptions on each scenario's state, render errors under live updates, and screenshots every
 * decision modal that pops up (ModalHost) before resolving it with its first choice.
 */
async function livePass(page, errors, scenario) {
  const live = { hours: 0, modals: [], error: null, errors: [], fatal: null }
  try {
    await closeTabs(page)
    await page.evaluate(() => window.__dt.openSite('shopifly', ''))
    await waitForSite(page, 'shopifly')
    errors.clear()
    for (let h = 0; h < LIVE_HOURS; h++) {
      await page.evaluate(() => window.__dt.tick(1))
      live.hours++
      const modal = await page.evaluate(() => {
        const m = window.__dt.state().events.modals[0]
        return m ? { kind: m.kind, title: m.title, choices: m.choices.map(c => c.id) } : null
      })
      if (modal) {
        await page.waitForSelector('.sh-modal-layer, .sh-fatal', { timeout: 5000 }).catch(() => {})
        if (await page.$('.sh-fatal')) {
          live.fatal = await page.locator('.sh-fatal').innerText()
          break
        }
        if (SHOTS && !live.modals.some(m => m.kind === modal.kind)) modal.screenshot = path.relative(OUT_DIR, await shot(page, `crawl/${scenario}/_modal_${modal.kind}`))
        modal.rendered = !!(await page.$('.sh-modal-layer'))
        live.modals.push(modal)
        await page.evaluate(() => window.__dt.resolveModals())
      }
      if (await page.$('.sh-fatal')) {
        live.fatal = await page.locator('.sh-fatal').innerText()
        break
      }
    }
    const after = await waitForSite(page, 'shopifly', { timeout: ROUTE_TIMEOUT })
    if (after.status !== 'ok') live.error = `shopifly home after ${live.hours}h: ${after.status} ${after.message ?? ''}`
  } catch (e) {
    live.error = isReloadError(e) ? null : String(e.message ?? e).split('\n')[0]
  }
  live.errors = errors.take().map(e => ({ type: e.type, text: e.text.split('\n')[0].slice(0, 400), stack: e.stack }))
  process.stdout.write(live.error || live.fatal || live.errors.length ? 'L' : 'l')
  return live
}

// ---------------------------------------------------------------------------
// Phone pass: shell + 3 key sites at 390×844
// ---------------------------------------------------------------------------
async function phonePass(browser, scenario) {
  const { context, page, errors } = await newPage(browser, { viewport: PHONE, mobile: true })
  const out = { scenario, viewport: PHONE, loadError: null, results: [] }
  try {
    await openGame(page, scenario, { timeout: 90_000 })
  } catch (e) {
    out.loadError = String(e.message ?? e)
    await context.close()
    return out
  }
  const shell = { site: 'shell', path: '', status: 'ok', errors: errors.take(), overflow: await horizontalOverflow(page, 'body') }
  if (SHOTS) shell.screenshot = path.relative(OUT_DIR, await shot(page, `crawl/phone/${scenario}__shell`))
  out.results.push(shell)
  for (const [site, p] of [['shopifly', ''], ['shopifly', 'orders'], ['fadbook', ''], ['fadbook', 'manage/ads'], ['tiktak', ''], ['tiktak', 'campaign']]) {
    const rec = { site, path: p }
    errors.clear()
    for (let attempt = 1; ; attempt++) {
      try {
        await page.evaluate(([s, pp]) => window.__dt.openSite(s, pp), [site, p])
        Object.assign(rec, await withTimeout(waitForSite(page, site, { timeout: ROUTE_TIMEOUT }), ROUTE_TIMEOUT + 8000, `${site}/${p}`))
        break
      } catch (e) {
        if (isReloadError(e) && attempt < 3) {
          await waitForGame(page, { timeout: 90_000 }).catch(() => {})
          continue
        }
        rec.status = 'hang'
        rec.message = String(e.message ?? e)
        break
      }
    }
    rec.errors = errors.take().map(e => ({ type: e.type, text: e.text.split('\n')[0].slice(0, 400) }))
    rec.overflow = await horizontalOverflow(page, `.sh-tabview[data-site="${site}"]`).catch(() => null)
    if (SHOTS) rec.screenshot = path.relative(OUT_DIR, await shot(page, `crawl/phone/${scenario}__${site}__${slug(p)}`))
    out.results.push(rec)
    process.stdout.write(rec.status === 'ok' ? '.' : 'X')
  }
  process.stdout.write(`  [phone ${scenario}]\n`)
  await context.close()
  return out
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function summarize(report) {
  const lines = []
  const t = report.totals
  lines.push(`# Crawl report`, '', `${new Date(report.startedAt).toISOString()} · ${BASE_URL} · ${(report.durationMs / 1000).toFixed(0)} s`, '')
  lines.push(`**${t.routes} routes** · ok ${t.ok} · crash ${t.crash} · blank ${t.blank} · timeout ${t.timeout} · hang ${t.hang} · fatal ${t.fatal} · routes with console/page errors ${t.withErrors} · routes with text smells ${t.withTextIssues}`, '')
  for (const sc of report.scenarios) {
    lines.push(`## ${sc.scenario}${sc.info ? ` (day ${sc.info.day + 1}, built in ${sc.info.buildMs} ms)` : ''}`)
    if (sc.info?.warnings?.length) lines.push('', `Scenario is missing: ${sc.info.warnings.join('; ')}`)
    if (sc.loadError) {
      lines.push('', `LOAD FAILED: ${sc.loadError}`, '')
      continue
    }
    const bad = sc.results.filter(r => r.status !== 'ok')
    const noisy = sc.results.filter(r => r.status === 'ok' && r.errors.length)
    const slow = sc.results.filter(r => r.status === 'ok' && r.ms > 3000)
    const smelly = sc.results.filter(r => r.textIssues?.length)
    lines.push('', `${sc.results.length} routes · ${bad.length} failing · ${noisy.length} rendered with errors · ${slow.length} slow (>3 s) · ${smelly.length} with text smells${sc.reloads ? ` · ${sc.reloads} dev-server reload(s) retried` : ''}`, '')
    if (sc.shell?.errors?.length) lines.push(`- shell load errors: ${sc.shell.errors.map(e => e.text.split('\n')[0]).join(' | ')}`)
    if (sc.shell?.textIssues?.length) lines.push(`- shell text: ${sc.shell.textIssues.map(i => `${i.kind} "${i.match}" in “${i.context}”`).join(' · ')}`)
    if (sc.live) {
      const lv = sc.live
      lines.push(`- live: simulated ${lv.hours} h with Shopifly open · modals: ${lv.modals.map(m => `${m.kind}${m.rendered === false ? ' (NOT RENDERED)' : ''}`).join(', ') || 'none'}${lv.fatal ? ` · **SHELL CRASH**: ${lv.fatal.slice(0, 200)}` : ''}${lv.error ? ` · **ERROR**: ${lv.error}` : ''}${lv.errors.length ? ` · errors: ${[...new Set(lv.errors.map(e => e.text))].slice(0, 3).join(' | ')}` : ''}`)
    }
    for (const r of bad) lines.push(`- **${r.status.toUpperCase()}** \`${r.site}/${r.path}\`: ${r.message ?? ''}${r.errors.length ? ` — ${r.errors[0].text}` : ''}${r.screenshot ? ` (${r.screenshot})` : ''}`)
    for (const r of noisy) lines.push(`- errors on \`${r.site}/${r.path}\`: ${[...new Set(r.errors.map(e => e.text))].slice(0, 3).join(' | ')}`)
    for (const r of slow) lines.push(`- slow \`${r.site}/${r.path}\`: ${r.ms} ms`)
    for (const r of smelly) lines.push(`- text \`${r.site}/${r.path}\`: ${r.textIssues.map(i => `${i.kind} "${i.match}" in “${i.context}”`).slice(0, 3).join(' · ')}`)
    lines.push('')
  }
  if (report.phone?.length) {
    lines.push('## Phone viewport (390×844)', '')
    for (const ph of report.phone) {
      if (ph.loadError) {
        lines.push(`- LOAD FAILED (${ph.scenario}): ${ph.loadError}`)
        continue
      }
      for (const r of ph.results) {
        const ov = r.overflow && (r.overflow.pageScrollsX || r.overflow.offenders.length) ? ` · overflow: ${r.overflow.pageScrollsX ? 'page scrolls sideways; ' : ''}${r.overflow.offenders.slice(0, 4).join(', ')}` : ''
        lines.push(`- ${r.status === 'ok' ? 'ok' : `**${r.status.toUpperCase()}**`} \`${r.site}/${r.path}\` (${ph.scenario})${r.message ? `: ${r.message}` : ''}${r.errors.length ? ` — errors: ${r.errors.map(e => e.text).slice(0, 2).join(' | ')}` : ''}${ov}`)
      }
    }
    lines.push('')
  }
  // distinct error messages across the crawl
  const msgs = new Map()
  for (const sc of [...report.scenarios, ...(report.phone ?? [])]) {
    for (const r of sc.results ?? []) {
      for (const e of r.errors ?? []) {
        const k = e.text.split('\n')[0].slice(0, 200)
        if (!msgs.has(k)) msgs.set(k, [])
        msgs.get(k).push(`${sc.scenario}:${r.site}/${r.path}`)
      }
      if (r.status !== 'ok' && r.message) {
        const k = `[${r.status}] ${r.message.split('\n')[0].slice(0, 200)}`
        if (!msgs.has(k)) msgs.set(k, [])
        msgs.get(k).push(`${sc.scenario}:${r.site}/${r.path}`)
      }
    }
  }
  if (msgs.size) {
    lines.push('## Distinct errors', '')
    for (const [k, where] of msgs) lines.push(`- ${k}\n  - ${where.length}× — ${[...new Set(where)].slice(0, 6).join(', ')}${where.length > 6 ? ', …' : ''}`)
    lines.push('')
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function pool(items, n, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    }),
  )
  return results
}

const t0 = Date.now()
const { browser } = await launch()
console.log(`crawl ${BASE_URL} · scenarios ${SCENARIOS.join(', ')} · concurrency ${CONCURRENCY}${ONLY_SITES.length ? ` · sites ${ONLY_SITES.join(',')}` : ''}${GREP ? ` · grep ${GREP}` : ''}`)
const scenarios = await pool(SCENARIOS, CONCURRENCY, sc => crawlScenario(browser, sc))
const phone = PHONE_PASS && !ONLY_SITES.length && !GREP ? [await phonePass(browser, PHONE_SCENARIO)] : []
await browser.close()

const all = scenarios.flatMap(s => s.results)
const count = st => all.filter(r => r.status === st).length
const report = {
  startedAt: t0,
  durationMs: Date.now() - t0,
  baseUrl: BASE_URL,
  totals: {
    routes: all.length, ok: count('ok'), crash: count('crash'), blank: count('blank'), timeout: count('timeout'), hang: count('hang'), fatal: count('fatal'), missing: count('missing'),
    withErrors: all.filter(r => r.errors?.length).length,
    withTextIssues: all.filter(r => r.textIssues?.length).length,
  },
  scenarios,
  phone,
}
writeOut('crawl-report.json', report)
const md = summarize(report)
writeOut('crawl-summary.md', md)
console.log(`\n${md}`)
console.log(`report: ${path.join(OUT_DIR, 'crawl-report.json')}\nsummary: ${path.join(OUT_DIR, 'crawl-summary.md')}`)
const failing = all.filter(r => r.status !== 'ok').length + scenarios.filter(s => s.loadError || s.live?.fatal || s.live?.error).length
process.exit(failing ? 1 : 0)
