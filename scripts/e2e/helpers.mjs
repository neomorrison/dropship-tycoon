// Playwright helpers for Dropship Tycoon QA scripts (dev server only).
// Usage: see scripts/e2e/README.md.
//
//   import { launch, openGame, openSite, shot } from './helpers.mjs'
//   const { browser, page, errors } = await launch()
//   await openGame(page, 'ads')
//   const r = await openSite(page, 'shopifly', 'orders')   // → { status: 'ok' | 'crash' | 'blank' | 'timeout', ... }
//   await shot(page, 'orders')                              // → scripts/e2e/out/orders.png
//   console.log(errors.take())                              // page errors + console.error since last take()
//   await browser.close()
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const E2E_DIR = path.dirname(fileURLToPath(import.meta.url))
export const OUT_DIR = path.join(E2E_DIR, 'out')
export const TMP_DIR = path.join(E2E_DIR, 'tmp')
export const BASE_URL = (process.env.DT_URL ?? 'http://localhost:5317').replace(/\/$/, '')
export const DESKTOP = { width: 1440, height: 900 }
export const PHONE = { width: 390, height: 844 }
/** scratch save slot used by scenarios (never listed on the title screen) */
export const SCRATCH_SLOT = 9

export const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------
/**
 * Launch Chromium with one page. Options: { headless = true, viewport = DESKTOP, mobile = false, slowMo }.
 * `mobile: true` emulates a touch phone (isMobile + hasTouch) — use with viewport PHONE.
 * Returns { browser, context, page, errors } (errors = collectErrors(page)).
 */
export async function launch(opts = {}) {
  const browser = await chromium.launch({ headless: opts.headless ?? process.env.HEADED !== '1', slowMo: opts.slowMo })
  const { context, page, errors } = await newPage(browser, opts)
  return { browser, context, page, errors }
}

/** A fresh isolated context (own IndexedDB/sessionStorage) + page on an existing browser. */
export async function newPage(browser, opts = {}) {
  const viewport = opts.viewport ?? (opts.mobile ? PHONE : DESKTOP)
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: opts.deviceScaleFactor ?? 1,
    isMobile: !!opts.mobile,
    hasTouch: !!opts.mobile,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(opts.timeout ?? 20_000)
  const errors = collectErrors(page)
  return { context, page, errors }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
/** Console noise that is not a game bug (Vite HMR, devtools hints, missing optional art). */
const IGNORE = [
  /\[vite\]/i,
  /\[hmr\]/i,
  /WebSocket connection to .* failed/i,
  /Download the React DevTools/i,
  /Failed to load resource: .*(404|net::ERR_ABORTED)/i, // placeholder art: every <img> has an onError fallback
  /\[dev\] scenario/i,
]

/**
 * Collect uncaught page errors + console.error (and optionally warnings) from a page.
 * Returns { all, take(), clear(), ignored } where take() returns and drains the entries
 * recorded since the previous take(). Entry: { type: 'pageerror'|'console'|'warning', text, stack?, url? }
 */
export function collectErrors(page, { warnings = false } = {}) {
  const all = []
  const ignored = []
  let cursor = 0
  const push = e => {
    if (IGNORE.some(r => r.test(e.text))) ignored.push(e)
    else all.push(e)
  }
  page.on('pageerror', err => push({ type: 'pageerror', text: String(err?.message ?? err), stack: err?.stack?.split('\n').slice(0, 6).join('\n') }))
  page.on('console', msg => {
    const t = msg.type()
    if (t === 'error' || (warnings && t === 'warning')) {
      const loc = msg.location()
      // React logs with format strings ("%o\n\n%s\n\n%s\n TypeError: …"): drop the unexpanded specifiers
      const text = msg.text().replace(/^(\s*%[osdifcO]\s*)+/, '').trim()
      push({ type: t === 'error' ? 'console' : 'warning', text: text.slice(0, 2000), url: loc?.url ? `${loc.url}:${loc.lineNumber}` : undefined })
    }
  })
  return {
    all,
    ignored,
    take() {
      const out = all.slice(cursor)
      cursor = all.length
      return out
    },
    clear() {
      cursor = all.length
    },
  }
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
/**
 * Load the game straight into a dev scenario ('fresh' | 'store' | 'ads' | 'scaled' | 'crisis').
 * Options: { slot = 9, seed, speed = 0 (paused), site, path, timeout = 60000 }.
 * Resolves with the scenario info { name, seed, buildMs, day, hour }; throws if the build failed.
 */
export async function openGame(page, scenario = 'ads', opts = {}) {
  const q = new URLSearchParams({ scenario, slot: String(opts.slot ?? SCRATCH_SLOT), speed: String(opts.speed ?? 0) })
  if (opts.seed != null) q.set('seed', String(opts.seed))
  if (opts.site) q.set('site', opts.site)
  if (opts.path != null) q.set('path', opts.path)
  await page.goto(`${BASE_URL}/?${q}`, { waitUntil: 'domcontentloaded' })
  return waitForGame(page, { timeout: opts.timeout ?? 60_000 })
}

/**
 * Wait for a ?scenario= page to be (re)built and the game shell mounted — also after a Vite
 * full reload (other people editing files trigger those; the URL rebuilds the same scenario).
 */
export async function waitForGame(page, { timeout = 60_000 } = {}) {
  await page.waitForFunction(() => window.__dt && (window.__dt.scenario || window.__dt.scenarioError), null, { timeout, polling: 100 })
  const err = await page.evaluate(() => window.__dt.scenarioError)
  if (err) throw new Error(`scenario failed to build: ${err}`)
  await page.waitForSelector('.sh-game, .sh-fatal', { timeout })
  const fatal = await page.$('.sh-fatal')
  if (fatal) throw new Error(`game shell crashed on load: ${await fatal.innerText()}`)
  return page.evaluate(() => window.__dt.scenario)
}

/** True for Playwright errors caused by the page navigating/reloading under us (Vite full reload). */
export const isReloadError = e => /Execution context was destroyed|most likely because of a navigation|Cannot find context|frame was detached/i.test(String(e?.message ?? e))

/** Current game state snapshot (JSON-serialisable parts only), or a selector over it: gameState(page, s => s.store.orders.length). */
export async function gameState(page, fn) {
  if (!fn) return page.evaluate(() => window.__dt.state())
  return page.evaluate(src => {
    // eslint-disable-next-line no-new-func
    const f = new Function(`return (${src})`)()
    return f(window.__dt.state())
  }, fn.toString())
}

/** Run a mutation through the game's act(): act(page, s => { s.finance.cash = 99 }) */
export async function act(page, fn) {
  return page.evaluate(src => {
    // eslint-disable-next-line no-new-func
    const f = new Function(`return (${src})`)()
    window.__dt.act(f)
  }, fn.toString())
}

/** Simulate N in-game hours (game must be loaded). */
export async function tick(page, hours = 1) {
  await page.evaluate(h => window.__dt.tick(h), hours)
}

/** Close every browser tab (and the computer if closeComputer). */
export async function closeTabs(page, closeComputer = false) {
  await page.evaluate(c => window.__dt.closeTabs(c), closeComputer)
}

/**
 * Open a site in the in-game browser (reuses that site's tab) via window.__dt.openSite, then
 * wait for it to render. Returns waitForSite()'s result. Options: { newTab, timeout, settle }.
 */
export async function openSite(page, site, sitePath = '', opts = {}) {
  await page.evaluate(([s, p, n]) => window.__dt.openSite(s, p, { newTab: n }), [site, sitePath, !!opts.newTab])
  return waitForSite(page, site, opts)
}

/** Visible-text smells: broken values, and real brand names (player-visible text must use parody names). */
export const TEXT_SMELLS = {
  bad: String.raw`\b(NaN|undefined|Infinity)\b|\[object Object\]`,
  brands: String.raw`\b(Shopify|Facebook|TikTok|AliExpress|McDonald'?s?|Instagram|Amazon|Upwork|Zillow|Gmail|Klaviyo|Minea|Meta|Chase|PayPal|Stripe|Google|Apple|iPhone|Visa|Mastercard|Judge\.me|DSers|Oberlo|Canva|Zapier|Afterpay|Klarna)\b`,
}

/** Scan the visible text under `selector` for TEXT_SMELLS. Returns [{ kind, match, context }] or undefined. */
export async function scanText(page, selector = 'body') {
  return page.evaluate(
    ([sel, smells]) => {
      const el = document.querySelector(sel)
      if (!el) return undefined
      const text = el.innerText || ''
      const out = []
      for (const [src, kind] of [[smells.bad, 'bad-value'], [smells.brands, 'real-brand']]) {
        const re = new RegExp(src, 'g')
        let m
        while ((m = re.exec(text)) && out.length < 6) out.push({ kind, match: m[0], context: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ').trim() })
      }
      return out.length ? out : undefined
    },
    [selector, TEXT_SMELLS],
  )
}

/**
 * Wait until the visible tab of `site` has rendered: no Suspense/skeleton loader, content present
 * and the DOM quiet for `settle` ms (pages that animate forever are accepted after `settleMax`).
 * Detects the per-tab error boundary ("Aw, snap!"), the shell crash screen and blank pages
 * (nothing rendered for `blankAfter` ms). Returns
 * { status: 'ok'|'crash'|'fatal'|'blank'|'timeout'|'missing', message?, note?, textLength, ms, textIssues? }.
 * textIssues (ok pages only): visible "NaN" / "undefined" / "Infinity" / "[object Object]" and real
 * brand names (Shopify, TikTok, …) with their surrounding text.
 */
export async function waitForSite(page, site, { timeout = 10_000, settle = 180, settleMax = 2_500, blankAfter = 3_000 } = {}) {
  const t0 = Date.now()
  const res = await page.evaluate(
    async ([site, timeout, settle, settleMax, blankAfter, smells]) => {
      const sleep = ms => new Promise(r => setTimeout(r, ms))
      const visible = el => !!el && el.getClientRects().length > 0
      const view = () => [...document.querySelectorAll(`.sh-tabview[data-site="${site}"]`)].find(visible)
      const LOADER = '.sh-site-loading, [aria-busy="true"].p-page'
      const scan = el => {
        const text = el.innerText || ''
        const out = []
        for (const [src, kind] of [[smells.bad, 'bad-value'], [smells.brands, 'real-brand']]) {
          const re = new RegExp(src, 'g')
          let m
          while ((m = re.exec(text)) && out.length < 6) out.push({ kind, match: m[0], context: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ').trim() })
        }
        return out.length ? out : undefined
      }
      const start = performance.now()
      let lastMut = performance.now()
      const mo = new MutationObserver(() => (lastMut = performance.now()))
      mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
      try {
        for (;;) {
          const now = performance.now()
          const elapsed = now - start
          const fatal = document.querySelector('.sh-fatal')
          if (fatal) return { status: 'fatal', message: fatal.querySelector('code')?.textContent ?? fatal.textContent?.slice(0, 300) }
          const v = view()
          if (v) {
            const crash = v.querySelector('.sh-crash')
            if (crash) return { status: 'crash', message: crash.querySelector('.sh-crash-details code')?.textContent ?? 'error boundary' }
            if (!v.querySelector(LOADER)) {
              const text = (v.innerText || '').trim()
              const media = v.querySelectorAll('img, svg, canvas, video').length
              const hasContent = text.length >= 12 || media >= 2
              if (hasContent && now - lastMut >= settle) return { status: 'ok', textLength: text.length, textIssues: scan(v) }
              if (hasContent && elapsed > settleMax) return { status: 'ok', note: 'DOM kept changing (animation/ticker)', textLength: text.length, textIssues: scan(v) }
              if (!hasContent && elapsed > blankAfter) return { status: 'blank', textLength: text.length }
            }
          }
          if (elapsed > timeout) {
            if (!v) return { status: 'missing', message: `no visible .sh-tabview[data-site="${site}"]` }
            return { status: 'timeout', message: v.querySelector(LOADER) ? 'still loading (Suspense/skeleton never resolved)' : 'never rendered', textLength: (v.innerText || '').trim().length }
          }
          await sleep(40)
        }
      } finally {
        mo.disconnect()
      }
    },
    [site, timeout, settle, settleMax, blankAfter, TEXT_SMELLS],
  )
  return { ...res, ms: Date.now() - t0 }
}

/** Wait until the DOM has been quiet for `quiet` ms (max `timeout`). */
export async function waitForIdle(page, { quiet = 250, timeout = 5_000 } = {}) {
  await page.evaluate(
    async ([quiet, timeout]) => {
      let last = performance.now()
      const mo = new MutationObserver(() => (last = performance.now()))
      mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
      const start = performance.now()
      while (performance.now() - last < quiet && performance.now() - start < timeout) await new Promise(r => setTimeout(r, 40))
      mo.disconnect()
    },
    [quiet, timeout],
  )
}

/** Wait for visible text anywhere on the page (string or RegExp). */
export async function waitForText(page, text, { timeout = 10_000 } = {}) {
  const loc = typeof text === 'string' ? page.getByText(text, { exact: false }) : page.getByText(text)
  await loc.first().waitFor({ state: 'visible', timeout })
  return loc.first()
}

/** The visible tab content element for a site (a Playwright Locator). */
export function siteView(page, site) {
  return page.locator(`.sh-tabview[data-site="${site}"]:visible`)
}

/** Horizontal overflow check (phone layouts): elements wider than the viewport inside `root`. */
export async function horizontalOverflow(page, rootSelector = 'body') {
  return page.evaluate(sel => {
    const root = document.querySelector(sel)
    if (!root) return null
    const vw = document.documentElement.clientWidth
    const doc = document.scrollingElement
    const offenders = []
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > vw + 2 && getComputedStyle(el).position !== 'fixed') {
        // skip children of horizontally scrollable containers (tables, carousels)
        let p = el.parentElement, scrolls = false
        while (p && p !== root) {
          const ox = getComputedStyle(p).overflowX
          if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden') && p.getBoundingClientRect().right <= vw + 2) { scrolls = true; break }
          p = p.parentElement
        }
        if (!scrolls) offenders.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} (right ${Math.round(r.right)}px)`)
      }
      if (offenders.length >= 8) break
    }
    return { pageScrollsX: doc.scrollWidth > doc.clientWidth + 1, viewport: vw, offenders }
  }, rootSelector)
}

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------
/** Screenshot to scripts/e2e/out/<name>.png (sub-folders allowed: 'crawl/ads__shopifly'). Returns the path. */
export async function shot(page, name, opts = {}) {
  const file = path.join(OUT_DIR, `${name.replace(/[^a-z0-9/_.-]+/gi, '_')}.png`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (opts.selector) await page.locator(opts.selector).first().screenshot({ path: file, animations: 'disabled' })
  else await page.screenshot({ path: file, fullPage: !!opts.fullPage, animations: 'disabled' })
  return file
}

/** Write JSON to scripts/e2e/out/<name>. */
export function writeOut(name, data) {
  const file = path.join(OUT_DIR, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
  return file
}
