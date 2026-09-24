// Self-test for the QA tooling: proves collectErrors() captures console.error + uncaught errors and
// waitForSite() reports the per-tab error boundary as a crash. Run: node scripts/e2e/selftest.mjs
// verifies the crawl's detectors: console.error capture, pageerror capture, error-boundary crash detection
import { launch, openGame, openSite, act } from './helpers.mjs'
const { browser, page, errors } = await launch()
await openGame(page, 'store')
await page.evaluate(() => { console.error('selftest console error'); setTimeout(() => { throw new Error('selftest uncaught') }, 0) })
await page.waitForTimeout(200)
console.log('errors', errors.take().map(e => `${e.type}: ${e.text}`))
console.log('ok route', await openSite(page, 'bank', ''))
await act(page, s => { s.finance.ledger = null })
console.log('crash route', await openSite(page, 'bank', 'activity'))
console.log('errors after crash', errors.take().map(e => `${e.type}: ${e.text.slice(0, 120)}`))
await browser.close()
