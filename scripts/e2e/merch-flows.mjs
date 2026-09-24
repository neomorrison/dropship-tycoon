// Shopifly merchandising flows, played like a player would (dev server only).
//   node scripts/e2e/merch-flows.mjs            # all checks, exit 1 on any failure
//   HEADED=1 node scripts/e2e/merch-flows.mjs
// Covers the product editor (copy, rich text, media, pricing, delivery promise, save bar, leave
// guard), the page grader / break-even agreement, theme editor sections, app install/uninstall
// billing, discounts CRUD and store settings. Screenshots → scripts/e2e/out/merch-flows/.
import { launch, openGame, openSite, shot, sleep, gameState } from './helpers.mjs'

const results = []
const check = (name, ok, info = '') => {
  results.push({ name, ok: !!ok, info })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`)
}
const view = page => page.locator('.sh-tabview[data-site="shopifly"]:visible')
const saveBar = page => view(page).locator('.p-csb')
/** Coach Kev's popover can sit over page actions; players close it, so do we. */
const closeKev = async page => { if (await page.locator('.sh-kev-pop').count()) await page.locator('.sh-kev-btn').click().catch(() => {}) }
const ringScore = async page => Number(await view(page).locator('.sf-mx-ring-score').first().innerText())

const { browser, page, errors } = await launch({ viewport: { width: 1440, height: 1100 } })
try {
  // ---------------------------------------------------------------- product editor
  await openGame(page, 'store')
  await openSite(page, 'shopifly', 'products/sp_y')
  const v = view(page)
  const g0 = await ringScore(page)
  await v.getByLabel('Title', { exact: true }).fill('Shiatsu Neck Massager with Heat: Melt Away Knots in 15 Minutes')
  const rte = v.locator('.p-rte-content').first()
  await rte.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await v.locator('.p-rte-format').click()
  await page.locator('.p-rte-menu-h').click()
  await page.keyboard.type('Finally, a massage whenever you need it')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Desk job? Long drives? You don\'t need to book a massage therapist to feel relief. This cordless massager kneads the knots out of your neck and back in 15 minutes, with soothing heat that helps your muscles relax.')
  await page.keyboard.press('Enter')
  await v.getByRole('button', { name: 'Bulleted list' }).click()
  for (const b of ['8 deep-kneading nodes reach the knots your hands can\'t', 'Soothing heat relaxes tight muscles faster', 'Cordless: use it on the couch, at your desk or in the car', 'Auto shut-off after 15 minutes, so it is safe and easy']) {
    await page.keyboard.type(b)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.press('Enter')
  await page.keyboard.type('Try it for 30 days with our money-back guarantee. Free shipping on every order, tracked to your door in 14 to 29 days.')
  const html = await rte.innerHTML()
  check('rich text: heading + bullets', /<h3>/.test(html) && (html.match(/<li>/g) ?? []).length === 4, `${(html.match(/<li>/g) ?? []).length} bullets`)
  await v.getByLabel('Price', { exact: true }).fill('49.99')
  await v.getByLabel('Compare-at price').fill('79.99')
  await v.getByLabel('Cost per item').fill('26.41')
  check('profit & margin readout', (await v.getByLabel('Profit').inputValue()) === '$23.58' && (await v.getByLabel('Margin').inputValue()) === '47.2%')
  const g1 = await ringScore(page)
  check('page grade rises with the rewrite', g1 >= g0 + 15, `${g0} → ${g1}`)
  check('contextual save bar replaces the top bar', await saveBar(page).count() === 1 && await v.locator('.sf-topbar-slot .p-csb').count() === 1)
  // leave guard on the sidebar
  await v.locator('.sf-nav').getByRole('button', { name: 'Orders' }).click()
  await sleep(100)
  check('sidebar navigation asks before discarding changes', await page.getByText('Leave page with unsaved changes?').count() === 1)
  await page.getByRole('button', { name: 'Stay' }).click()
  await v.getByLabel('Status', { exact: true }).selectOption('active')
  await saveBar(page).getByRole('button', { name: 'Save' }).click()
  await sleep(200)
  const saved = await gameState(page, s => { const p = s.store.products.find(x => x.id === 'sp_y'); return { status: p.status, price: p.price, grade: p.grade.score, title: p.title } })
  check('save persists product + status', saved.status === 'active' && saved.price === 49.99 && saved.title.startsWith('Shiatsu'), JSON.stringify(saved))
  check('save bar gone after save', await saveBar(page).count() === 0)
  await closeKev(page)

  // delivery promise: a lie must hit the live grade and show the banner
  await openSite(page, 'shopifly', 'products/sp_r')
  const before = await ringScore(page)
  await v.getByLabel('From', { exact: true }).fill('5')
  await v.getByLabel('To', { exact: true }).fill('9')
  await sleep(50)
  const lie = await ringScore(page)
  check('faster-than-real delivery promise lowers the live grade', lie < before, `${before} → ${lie}`)
  check('shipping-lie banner shown', await v.getByText('Delivery promise is faster than reality').count() === 1)
  await saveBar(page).getByRole('button', { name: 'Discard' }).click()
  await sleep(50)
  check('discard restores the saved promise', (await v.getByLabel('To', { exact: true }).inputValue()) === '31')

  // media: add from the supplier gallery, drag to reorder, remove
  await openSite(page, 'shopifly', 'products/sp_y')
  const tiles = v.locator('.sf-mx-mediagrid .sf-mx-tile:not(.sf-mx-addtile)')
  const n0 = await tiles.count()
  await v.locator('.sf-mx-addtile').click()
  const picks = page.locator('[role=dialog] .sf-mx-pick:not([disabled])')
  await picks.nth(0).click()
  await picks.nth(1).click()
  await page.locator('[role=dialog]').getByRole('button', { name: /Add 2 items/ }).click()
  await sleep(100)
  check('media picker adds photos', await tiles.count() === n0 + 2, `${n0} → ${await tiles.count()}`)
  const cls = () => tiles.evaluateAll(els => els.map(e => e.querySelector('.st-media').className))
  const c0 = await cls()
  await tiles.nth(c0.length - 1).dragTo(tiles.nth(0))
  const c1 = await cls()
  check('drag reorders media', c1[0] === c0[c0.length - 1])
  await tiles.nth(1).locator('.sf-mx-tile-check input').click({ force: true })
  await v.getByRole('button', { name: 'Remove', exact: true }).click()
  check('selected media removed', await tiles.count() === n0 + 1)
  await saveBar(page).getByRole('button', { name: 'Discard' }).click()

  // grader ↔ break-even card agree on margin
  const agree = await page.evaluate(async () => {
    const st = await import('/src/sim/store/index.ts')
    const s = window.__dt.state()
    const p = s.store.products.find(x => x.id === 'sp_r')
    const be = st.breakEven(s, p.id)
    const det = st.gradePage(s, p).factors.find(f => f.key === 'price').details.find(d => d.startsWith('Margin at'))
    return { be: be.margin, det }
  })
  check('grader margin matches the Break-even card', agree.det?.includes(`$${agree.be.toFixed(2)}`), `${agree.det} vs ${agree.be}`)
  await shot(page, 'merch-flows/product-editor')

  // ---------------------------------------------------------------- theme editor
  await openSite(page, 'shopifly', 'online-store/editor/product/sp_y')
  await closeKev(page)
  const tgrade = async () => Number((await v.locator('.sf-mx-te-grade').innerText()).replace(/\D+/g, ''))
  const t0 = await tgrade()
  for (const name of ['Sticky add to cart', 'Money-back guarantee']) {
    await v.locator('.sf-mx-tree-add').click()
    await page.locator('[role=dialog]').last().locator('.sf-mx-additem').filter({ hasText: name }).getByRole('button', { name: 'Add' }).click()
    await sleep(80)
  }
  const t1 = await tgrade()
  check('theme editor: adding sections updates the grade', t1 > t0, `${t0} → ${t1}`)
  // sticky ATC is worth ~2 grade points (mobile factor), enough to always move the rounded score
  await v.getByRole('button', { name: 'Hide Sticky add to cart', exact: true }).click()
  const t2 = await tgrade()
  check('theme editor: hiding a section drops the grade', t2 < t1, `${t1} → ${t2}`)
  await v.getByRole('button', { name: 'Show Sticky add to cart', exact: true }).click()
  await v.getByRole('button', { name: 'Mobile', exact: true }).click()
  check('device toggle switches the preview', await v.locator('.sf-mx-te-canvas.is-mobile').count() === 1)
  await v.getByRole('button', { name: 'Save', exact: true }).click()
  await sleep(150)
  const secs = await gameState(page, s => s.store.products.find(x => x.id === 'sp_y').sections.map(x => x.id))
  check('theme editor save writes sections', secs.includes('sticky_atc') && secs.includes('guarantee'), secs.join(','))
  await shot(page, 'merch-flows/theme-editor')

  // ---------------------------------------------------------------- apps
  const bills = () => gameState(page, s => s.finance.bills.filter(b => b.ref?.startsWith('app:')).map(b => b.ref))
  await openSite(page, 'shopifly', 'apps/tickr')
  await closeKev(page)
  const load0 = await page.evaluate(async () => { const st = await import('/src/sim/store/index.ts'); const s = window.__dt.state(); return st.effectiveLoadTime(s, s.store.products[0]) })
  await v.getByRole('button', { name: 'Install', exact: true }).first().click()
  await page.locator('[role=dialog]').last().getByRole('button', { name: /Install app|Start free trial/ }).click()
  await sleep(100)
  const load1 = await page.evaluate(async () => { const st = await import('/src/sim/store/index.ts'); const s = window.__dt.state(); return st.effectiveLoadTime(s, s.store.products[0]) })
  check('app install adds its bill and load time', (await bills()).includes('app:tickr') && load1 > load0, `${load0}s → ${load1}s`)
  const unlocked = await page.evaluate(async () => { const st = await import('/src/sim/store/index.ts'); const s = window.__dt.state(); return st.sectionAvailability(s, s.store.products[0], 'countdown').ok })
  check('app install unlocks its sections', unlocked)
  await closeKev(page)
  await v.getByRole('button', { name: 'Uninstall' }).first().click()
  await page.locator('[role=dialog]').last().getByRole('button', { name: 'Uninstall' }).click()
  await sleep(100)
  check('app uninstall removes its bill', !(await bills()).includes('app:tickr'))

  // ---------------------------------------------------------------- discounts
  await openSite(page, 'shopifly', 'discounts/new/quantity_break')
  await closeKev(page)
  await v.getByRole('textbox', { name: 'Title' }).fill('Buy 2 save more')
  await saveBar(page).getByRole('button', { name: 'Save' }).click()
  await sleep(150)
  await v.getByRole('textbox', { name: 'Title' }).fill('Bundle deal')
  await saveBar(page).getByRole('button', { name: 'Save' }).click()
  await sleep(150)
  check('discount edit saves cleanly (no stuck save bar)', await saveBar(page).count() === 0, await v.getByRole('textbox', { name: 'Title' }).inputValue())
  check('automatic discount keeps its free-text title', (await v.getByRole('textbox', { name: 'Title' }).inputValue()) === 'Bundle deal')

  // ---------------------------------------------------------------- editor guards & grader tips
  await openSite(page, 'shopifly', 'products')
  await v.locator('table tbody tr').first().click()
  await sleep(150)
  check('editor prev/next follow the product list (first row has no previous)', await v.getByRole('button', { name: /Previous/ }).isDisabled())
  await openSite(page, 'shopifly', 'products/sp_r')
  await v.getByLabel('Price', { exact: true }).fill('')
  await saveBar(page).getByRole('button', { name: 'Save' }).click()
  await sleep(100)
  check('a blank price is never saved as $0', (await gameState(page, s => s.store.products.find(p => p.id === 'sp_r').price)) > 0 && (await v.getByText('Enter a price').count()) >= 1)
  await saveBar(page).getByRole('button', { name: 'Discard' }).click()
  const claims = await page.evaluate(async () => {
    const st = await import('/src/sim/store/index.ts')
    const s = window.__dt.state()
    const p = s.store.products.find(x => x.id === 'sp_r')
    return st.gradePage(s, { ...p, descriptionHtml: `${p.descriptionHtml}<p>Clinically proven miracle tool.</p>` }).factors.find(f => f.key === 'description').tip
  })
  check('description tip names risky claims even when the copy scores well', /medical or absolute claims/.test(claims), claims.slice(0, 80))

  // ---------------------------------------------------------------- storefront
  await openSite(page, 'storefront', 'products/sp_r')
  const sf = page.locator('.sh-tabview[data-site="storefront"]:visible')
  check('sticky add-to-cart bar renders after the footer (pinned over the whole page)', await sf.locator('.st-root > .st-bottom-slot .st-sticky').count() === 1)
  await sf.getByRole('button', { name: /^Add to cart/ }).first().click()
  await sleep(150)
  await page.keyboard.press('Escape')
  await sleep(150)
  check('Escape closes the cart drawer, not the computer', await sf.count() === 1 && await sf.locator('.st-drawer-backdrop').count() === 0)

  // ---------------------------------------------------------------- settings
  await openSite(page, 'shopifly', 'settings/general')
  await v.getByLabel('Store name').fill('Northwind Supply')
  await saveBar(page).getByRole('button', { name: 'Save' }).click()
  await sleep(100)
  const names = await gameState(page, s => [s.store.name, s.store.theme.logoText])
  check('store rename also renames the storefront logo', names[0] === 'Northwind Supply' && names[1] === 'Northwind Supply', names.join(' / '))
  await openSite(page, 'shopifly', 'settings/policies')
  await v.getByRole('textbox', { name: 'Refund policy' }).fill('No refunds.')
  await v.locator('.sf-mx-settings-nav').getByRole('button', { name: 'Plan' }).click()
  await sleep(80)
  check('settings nav asks before discarding changes', await page.getByText('Leave page with unsaved changes?').count() === 1)
  await page.getByRole('button', { name: 'Stay' }).click()
  check('too-short policy is flagged', await v.getByText('Too short to reassure shoppers').count() === 1)

  const errs = errors.take()
  check('no console / page errors', errs.length === 0, errs.map(e => e.text).join(' | ').slice(0, 300))
} catch (e) {
  check('flow crashed', false, String(e?.message ?? e).split('\n')[0])
  await shot(page, 'merch-flows/_crash').catch(() => {})
} finally {
  await browser.close()
}
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
