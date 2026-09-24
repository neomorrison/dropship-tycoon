// Store setup & merchandising: create store, settings, policies, domain, plan, themes,
// apps (install/uninstall + billing), discounts, products (import/edit/status), reviews import.
import type { Discount, GameState, MediaItem, PageSection, PlanId, RecurringBill, SectionId, StoreProduct, StoreState } from '../../core/types'
import { BENCHMARKS } from '../../data/benchmarks'
import { APPS, appDef, klavioPrice } from '../../data/apps'
import { THEMES, themeDef } from '../../data/themes'
import { SECTIONS } from '../../data/sections'
import { clamp, randInt } from '../../core/rng'
import { formatDate } from '../../core/time'
import { pay } from '../../core/money'
import { coachTip, mail, notify } from '../../core/notify'
import { money } from '../../core/format'
import { uid } from '../../core/ids'
import { productImage } from '../../core/assets'
import { removeBillByRef, upsertBill } from '../finance'
import { grantXp } from '../life'
import { publicListing } from '../market'
import { effectivePromise, gradePage, realDeliveryWindow } from './grade'
import { policyTemplate, type PolicyKind } from './templates'
import { defOf, findProduct, fulfillment, hasApp, installedApp, r2, roundTo99, slugify, today } from './util'

// ---------------------------------------------------------------------------
// Grading cache
// ---------------------------------------------------------------------------
/** Re-grade every product (after settings/apps/theme changes and daily). Only writes when something changed. */
export function regradeAll(s: GameState) {
  for (const p of s.store.products) regrade(s, p)
}
export function regrade(s: GameState, p: StoreProduct) {
  const g = gradePage(s, p)
  const old = p.grade
  if (!old || old.score !== g.score || old.honesty !== g.honesty || old.loadTime !== g.loadTime || old.trust !== g.trust || old.aovMult !== g.aovMult || old.shippingLie !== g.shippingLie || JSON.stringify(old.factors) !== JSON.stringify(g.factors)) {
    p.grade = g
  }
  return p.grade!
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------
function bill(s: GameState, ref: string, name: string, amount: number, cadence: RecurringBill['cadence'], nextDueDay: number, category: RecurringBill['category'] = 'apps') {
  upsertBill(s, { id: `bill_${ref.replace(/[^a-z0-9]+/gi, '_')}`, name, amount: r2(amount), cadence, nextDueDay, payWith: 'card', category, business: true, ref })
}

// ---------------------------------------------------------------------------
// Store setup
// ---------------------------------------------------------------------------
export function createStore(s: GameState, input: { name: string }): void {
  const st = s.store
  if (st.created) return
  const day = today(s)
  const name = (input.name ?? '').trim().slice(0, 60) || `${s.player.name.split(' ')[0]}'s Shop`
  st.created = true
  st.name = name
  st.subdomain = `${slugify(name)}.myshopifly.com`
  st.plan = 'trial'
  st.createdDay = day
  st.trialEndsDay = day + 30 * BENCHMARKS.fees.trialMonths
  st.theme = { id: 'dawnish', primaryColor: '#121212', font: 'Assistant', logoText: name }
  st.payments = { paypal: false, shopPay: true, bnpl: false }
  st.shipping = { freeShipping: true, flatRate: 4.99, freeOver: null }
  st.themesOwned = THEMES.filter(t => t.price === 0).map(t => t.id)
  // $1 for the first month now, then monthly on the card
  pay(s, BENCHMARKS.fees.trialMonthly, { category: 'subscription', memo: 'Shopifly: first month ($1 offer)', business: true, prefer: 'card', pnl: 'apps' })
  bill(s, 'shopifly_plan', 'Shopifly plan ($1/mo intro offer)', BENCHMARKS.fees.trialMonthly, 'monthly', day + 30, 'subscription')
  notify(s, { kind: 'success', title: `${name} is open for business`, body: `Your store is live at ${st.subdomain}. Next: add a product.`, site: 'shopifly', path: '' })
  mail(s, {
    from: 'Shopifly', fromEmail: 'hello@shopifly.com', tag: 'shopifly', site: 'shopifly', path: '',
    subject: `Welcome to Shopifly, ${s.player.name.split(' ')[0]}!`,
    body:
      `Your store ${name} is ready at ${st.subdomain}.\n\nYou're on our intro offer: $1/month for your first 3 months (then Basic at $${BENCHMARKS.fees.plans.basic.monthly}/month; ` +
      `your trial ends ${formatDate(st.trialEndsDay, 'long')}).\n\nYour setup guide:\n• Add your first product\n• Customize your product page\n• Install a fulfillment app\n` +
      `• Connect your ad channels (pixel)\n• Add your store policies\n• Buy a custom domain\n\nHappy selling!\nThe Shopifly Team`,
  })
  coachTip(s, 'store_created', 'Store created! Before you spend a cent on ads: import a product from AliExprez, then REWRITE the title and description. Never keep the supplier\'s "2026 New Hot Sale…" title. Install DSerz so orders get fulfilled automatically.', { app: 'aliexprez', essential: true })
}

/** Trial end + reminders (daily). */
export function planDaily(s: GameState, day: number) {
  const st = s.store
  if (!st.created) return
  if (st.plan === 'trial' && st.trialEndsDay != null) {
    if (day === st.trialEndsDay - 7) {
      mail(s, {
        from: 'Shopifly', fromEmail: 'billing@shopifly.com', tag: 'shopifly', site: 'shopifly', path: 'settings/plan',
        subject: 'Your $1/month offer ends in 7 days',
        body: `On ${formatDate(st.trialEndsDay, 'long')} your store moves to the Basic plan at $${BENCHMARKS.fees.plans.basic.monthly}/month, billed to your card. You can pick a different plan any time in Settings → Plan.`,
      })
    }
    if (day >= st.trialEndsDay) {
      st.plan = 'basic'
      bill(s, 'shopifly_plan', 'Shopifly Basic plan', BENCHMARKS.fees.plans.basic.monthly, 'monthly', day, 'subscription')
      notify(s, { kind: 'info', title: 'Intro offer ended: now on Basic', body: `$${BENCHMARKS.fees.plans.basic.monthly}/month from today.`, site: 'shopifly', path: 'settings/plan' })
    }
  }
  // Klavio bills by list size
  if (hasApp(s, 'klavio')) {
    const price = klavioPrice(st.emailSubscribers)
    const ia = installedApp(s, 'klavio')!
    const wantIdx = price > 0 ? 1 : 0
    if (ia.planIdx !== wantIdx || (ia.settings?.billed as number | undefined) !== price) {
      ia.planIdx = wantIdx
      ia.settings = { ...(ia.settings ?? {}), billed: price }
      if (price > 0) bill(s, 'app:klavio', `Klavio (${st.emailSubscribers.toLocaleString('en-US')} contacts)`, price, 'monthly', day + 1)
      else removeBillByRef(s, 'app:klavio')
    }
  }
}

export function updateStoreSettings(s: GameState, patch: Partial<Pick<StoreState, 'name' | 'theme' | 'policies' | 'payments' | 'shipping'>>): void {
  const st = s.store
  if (patch.name !== undefined) st.name = patch.name.trim().slice(0, 60) || st.name
  if (patch.theme) {
    const t = { ...st.theme, ...patch.theme }
    if (!canUseTheme(s, t.id)) t.id = st.theme.id
    st.theme = t
  }
  if (patch.policies) st.policies = { ...st.policies, ...patch.policies }
  if (patch.payments) {
    const pm = { ...st.payments, ...patch.payments }
    if (pm.bnpl && !hasApp(s, 'klarno')) {
      pm.bnpl = false
      notify(s, { kind: 'warning', title: 'Install Klarno to offer pay-later', body: 'Buy now, pay later needs the Klarno app.', site: 'shopifly', path: 'apps/klarno' })
    }
    st.payments = pm
  }
  if (patch.shipping) {
    const sh = { ...st.shipping, ...patch.shipping }
    sh.flatRate = r2(clamp(Number(sh.flatRate) || 0, 0, 99))
    sh.freeOver = sh.freeOver == null || !(Number(sh.freeOver) > 0) ? null : r2(Number(sh.freeOver))
    st.shipping = sh
  }
  regradeAll(s)
}

/** Templated policy text (honest shipping window from your live products). Doesn't save it. */
export function generatePolicy(s: GameState, kind: PolicyKind): string {
  const live = s.store.products.filter(p => p.status === 'active')
  const list = live.length ? live : s.store.products
  let win: [number, number] | null = null
  for (const p of list) {
    const w = realDeliveryWindow(s, p.catalogId)
    win = win ? [Math.min(win[0], w[0]), Math.max(win[1], w[1])] : w
  }
  return policyTemplate(s, kind, win)
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------
const TLD_PRICES: Record<string, number> = { com: BENCHMARKS.fees.domainYearly, co: 32, shop: 12, store: 9, net: 16 }
const TAKEN = new Set(['shop', 'store', 'pets', 'pet', 'home', 'beauty', 'glow', 'cozy', 'gadget', 'gadgets', 'kitchen', 'fitness', 'best', 'deals', 'trendy', 'daily', 'smart', 'love', 'lux', 'luxe'])

export function domainQuote(s: GameState, domain: string): { ok: boolean; domain: string; price: number; reason?: string } {
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  const m = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.([a-z]{2,6})$/.exec(d)
  if (!m) return { ok: false, domain: d, price: 0, reason: 'Enter a domain like mystore.com' }
  const [, name, tld] = m
  const price = TLD_PRICES[tld]
  if (price == null) return { ok: false, domain: d, price: 0, reason: `.${tld} domains aren't available. Try .com, .co, .shop, .store or .net` }
  if (s.store.customDomain === d) return { ok: false, domain: d, price, reason: 'That domain is already connected to your store' }
  if (name.length <= 4 || TAKEN.has(name) || name.split('-').every(w => TAKEN.has(w))) return { ok: false, domain: d, price, reason: `${d} is already taken` }
  return { ok: true, domain: d, price }
}

export function buyDomain(s: GameState, domain: string): boolean {
  if (!s.store.created) return false
  const q = domainQuote(s, domain)
  if (!q.ok) {
    notify(s, { kind: 'warning', title: 'Domain unavailable', body: q.reason, site: 'shopifly', path: 'settings/domains' })
    return false
  }
  if (!pay(s, q.price, { category: 'subscription', memo: `Domain registration: ${q.domain} (1 year)`, business: true, prefer: 'card', pnl: 'apps' })) {
    notify(s, { kind: 'warning', title: 'Payment declined', body: `Couldn't charge ${money(q.price)} for ${q.domain}.`, site: 'bank', path: '' })
    return false
  }
  const day = today(s)
  s.store.customDomain = q.domain
  s.store.domainRenewDay = day + 365
  bill(s, 'domain', `Domain ${q.domain}`, q.price, 'yearly', day + 365, 'subscription')
  notify(s, { kind: 'success', title: `${q.domain} is connected`, body: 'Your store now looks like a real brand.', site: 'shopifly', path: 'settings/domains' })
  regradeAll(s)
  return true
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------
export function changePlan(s: GameState, plan: PlanId): void {
  const st = s.store
  if (!st.created || plan === 'trial' || plan === st.plan) return
  const def = BENCHMARKS.fees.plans[plan]
  if (!pay(s, def.monthly, { category: 'subscription', memo: `Shopifly ${plan === 'shopifly' ? 'Shopifly' : plan === 'basic' ? 'Basic' : 'Advanced'} plan`, business: true, prefer: 'card', pnl: 'apps' })) {
    notify(s, { kind: 'warning', title: 'Plan change failed', body: `Couldn't charge ${money(def.monthly)} to your card.`, site: 'bank', path: '' })
    return
  }
  const label = plan === 'basic' ? 'Basic' : plan === 'shopifly' ? 'Shopifly' : 'Advanced'
  st.plan = plan
  bill(s, 'shopifly_plan', `Shopifly ${label} plan`, def.monthly, 'monthly', today(s) + 30, 'subscription')
  notify(s, { kind: 'success', title: `You're on the ${label} plan`, body: `Online card rate ${(def.cardPct * 100).toFixed(1)}% + ${def.cardFixed * 100}¢.`, site: 'shopifly', path: 'settings/plan' })
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------
export function canUseTheme(s: GameState, id: string): boolean {
  const t = THEMES.find(x => x.id === id)
  if (!t) return false
  return t.price === 0 || (s.store.themesOwned ?? []).includes(id)
}
export function buyTheme(s: GameState, id: string): boolean {
  const t = THEMES.find(x => x.id === id)
  if (!t || !s.store.created) return false
  if (canUseTheme(s, id)) return true
  if (!pay(s, t.price, { category: 'apps', memo: `Theme purchase: ${t.name}`, business: true, prefer: 'card' })) {
    notify(s, { kind: 'warning', title: 'Theme purchase declined', body: `Couldn't charge ${money(t.price)}.`, site: 'bank', path: '' })
    return false
  }
  ;(s.store.themesOwned ??= []).push(id)
  notify(s, { kind: 'success', title: `${t.name} added to your theme library`, body: 'Publish it from Online Store → Themes.', site: 'shopifly', path: 'online-store' })
  return true
}
export function publishTheme(s: GameState, id: string): boolean {
  if (!canUseTheme(s, id)) return false
  const t = themeDef(id)
  s.store.theme = { ...s.store.theme, id: t.id }
  regradeAll(s)
  notify(s, { kind: 'success', title: `${t.name} is now your live theme`, site: 'shopifly', path: 'online-store' })
  return true
}

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------
export function installApp(s: GameState, appId: string, planIdx = 0): boolean {
  const d = appDef(appId)
  const st = s.store
  if (!d || !st.created) return false
  const idx = clamp(Math.floor(planIdx), 0, d.plans.length - 1)
  const plan = d.plans[idx]
  const day = today(s)
  const existing = installedApp(s, appId)
  if (existing && existing.planIdx === idx) return true
  const ref = `app:${appId}`
  if (appId === 'klavio') {
    // Klavio is priced by contacts, not by the plan the player picks
    const price = klavioPrice(st.emailSubscribers)
    if (price > 0) bill(s, ref, `Klavio (${st.emailSubscribers.toLocaleString('en-US')} contacts)`, price, 'monthly', day + 1)
    if (!existing) st.apps.push({ appId, installedDay: day, planIdx: price > 0 ? 1 : 0, settings: { billed: price } })
  } else {
    if (plan.billing === 'monthly' && plan.price > 0) {
      const trial = existing ? 0 : plan.trialDays ?? 0
      if (!trial && !pay(s, plan.price, { category: 'apps', memo: `${d.name}: ${plan.name} plan`, business: true, prefer: 'card' })) {
        notify(s, { kind: 'warning', title: `Couldn't install ${d.name}`, body: `The ${money(plan.price)}/month charge was declined.`, site: 'bank', path: '' })
        return false
      }
      bill(s, ref, `${d.name} (${plan.name})`, plan.price, 'monthly', day + (trial || 30))
    } else removeBillByRef(s, ref)
    if (existing) existing.planIdx = idx
    else st.apps.push({ appId, installedDay: day, planIdx: idx })
  }
  if (appId === 'fadbook-channel') st.pixel.fadbook.installed = true
  if (appId === 'tiktak-channel') st.pixel.tiktak.installed = true
  if (appId === 'klarno' && !existing) st.payments.bnpl = true
  regradeAll(s)
  if (!existing) {
    const trial = plan.billing === 'monthly' && plan.price > 0 && plan.trialDays ? ` Free for ${plan.trialDays} days, then ${money(plan.price)}/month.` : ''
    notify(s, { kind: 'success', title: `${d.name.split(/[:\-–]/)[0].trim()} installed`, body: `${d.effects[0]}${trial}`, site: 'shopifly', path: `apps/${appId}` })
  }
  return true
}

export function uninstallApp(s: GameState, appId: string): void {
  const st = s.store
  const i = st.apps.findIndex(a => a.appId === appId)
  if (i < 0) return
  st.apps.splice(i, 1)
  removeBillByRef(s, `app:${appId}`)
  if (appId === 'fadbook-channel') st.pixel.fadbook.installed = false
  if (appId === 'tiktak-channel') st.pixel.tiktak.installed = false
  if (appId === 'klarno') st.payments.bnpl = false
  regradeAll(s)
  const d = appDef(appId)
  notify(s, { kind: 'info', title: `${d?.name.split(/[:\-–]/)[0].trim() ?? appId} uninstalled`, site: 'shopifly', path: 'apps' })
  if (appId === 'dserz' && st.products.some(p => p.status === 'active')) {
    coachTip(s, 'store_dserz_removed', 'Without DSerz, every dropship order waits in Orders → Unfulfilled until you click Fulfill yourself. Late orders mean angry customers and chargebacks.', { app: 'shopifly', cooldownHours: 24 * 7 })
  }
}

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------
export function upsertDiscount(s: GameState, d: Discount): void {
  const st = s.store
  const code = (d.code ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24) || (d.automatic ? 'AUTOMATIC' : 'SAVE10')
  let value = Number(d.value) || 0
  if (d.kind === 'percent' || d.kind === 'quantity_break') value = clamp(Math.round(value), 1, 90)
  else if (d.kind === 'fixed') value = r2(clamp(value, 0.01, 1000))
  else value = 0
  const clean: Discount = { ...d, id: d.id || uid(s, 'disc'), code, value, usage: d.usage ?? 0, createdDay: d.createdDay ?? today(s) }
  const i = st.discounts.findIndex(x => x.id === clean.id)
  if (i >= 0) st.discounts[i] = { ...st.discounts[i], ...clean, usage: st.discounts[i].usage }
  else st.discounts.push(clean)
  regradeAll(s)
}
export function deleteDiscount(s: GameState, id: string): void {
  s.store.discounts = s.store.discounts.filter(d => d.id !== id)
  regradeAll(s)
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
/** Plain supplier text → the limited HTML the editor uses (verbatim, deliberately bad). */
function supplierHtml(text: string): string {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/\n{2,}/)
    .map(block => `<p>${block.split('\n').map(esc).join('<br>')}</p>`)
    .join('')
}

/** Import from AliExprez (DSerz-style) → draft with supplier title/description/photos and a naive 2× price. */
export function importProduct(s: GameState, catalogId: string): string {
  const st = s.store
  const d = defOf(catalogId)
  if (!st.created || !d) return ''
  const day = today(s)
  const f = fulfillment(s, catalogId)
  let vendor = 'AliExprez Supplier'
  try { vendor = publicListing(s, catalogId)?.supplierName || vendor } catch { /* market listing unavailable */ }
  const nMedia = randInt(s, 1, 3)
  const media: MediaItem[] = Array.from({ length: nMedia }, (_, i) => ({
    id: uid(s, 'media'), kind: 'supplier', src: productImage(catalogId), alt: d.supplierTitle, variant: i,
  }))
  const id = uid(s, 'sp')
  const p: StoreProduct = {
    id, catalogId, status: 'draft',
    title: d.supplierTitle,
    descriptionHtml: supplierHtml(d.supplierDescription),
    media,
    price: roundTo99(d.cogs * 2),
    compareAtPrice: null,
    costPerItem: r2(f.unitCost + f.shipCost),
    variants: d.variants.map(v => ({ name: v.name, values: [...v.values] })),
    trackInventory: false,
    weightKg: d.weightKg,
    seo: { title: '', description: '', handle: slugify(d.name) },
    productType: '',
    vendor,
    tags: ['dserz'],
    sections: [],
    reviews: { count: 0, avg: 0, photos: 0, source: 'none' },
    promisedDays: null,
    createdDay: day,
    publishedDay: null,
  }
  st.products.push(p)
  p.grade = gradePage(s, p)
  p.xpBestScore = p.grade.score
  notify(s, { kind: 'success', title: 'Product imported', body: `${d.name} was added as a draft. Rewrite the title and description before you publish.`, site: 'shopifly', path: `products/${id}` })
  if (!hasApp(s, 'dserz')) coachTip(s, 'store_no_dserz_import', 'Tip: install DSerz (free) from the Shopifly App Store. It places and pays supplier orders automatically. Without it you fulfill every order by hand.', { app: 'shopifly', essential: true })
  return id
}

const ALLOWED_TAGS = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 'h3', 'br'])
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (m, tag: string) => {
      const t = tag.toLowerCase()
      if (!ALLOWED_TAGS.has(t)) return ''
      return m.startsWith('</') ? `</${t}>` : t === 'br' ? '<br>' : `<${t}>`
    })
}

function cleanSections(sections: PageSection[]): PageSection[] {
  const valid = new Set<SectionId>(SECTIONS.map(x => x.id))
  const seen = new Set<SectionId>()
  const out: PageSection[] = []
  for (const x of sections) {
    if (!valid.has(x.id) || seen.has(x.id)) continue
    seen.add(x.id)
    out.push({ id: x.id, enabled: !!x.enabled, settings: x.settings })
  }
  return out
}

/** Patch a product and regrade its page (copywriting XP when the grade improves ≥5). */
export function updateProduct(s: GameState, id: string, patch: Partial<StoreProduct>): void {
  const p = findProduct(s, id)
  if (!p) return
  const before = p.grade?.score ?? gradePage(s, p).score
  const { id: _i, catalogId: _c, createdDay: _cd, grade: _g, xpBestScore: _x, ...rest } = patch
  Object.assign(p, rest)
  if (rest.title !== undefined) p.title = String(rest.title).replace(/\s+/g, ' ').trim().slice(0, 255)
  if (rest.descriptionHtml !== undefined) p.descriptionHtml = sanitizeHtml(String(rest.descriptionHtml))
  if (rest.price !== undefined) p.price = r2(Math.max(0, Number(rest.price) || 0))
  if (rest.compareAtPrice !== undefined) p.compareAtPrice = rest.compareAtPrice == null || !(Number(rest.compareAtPrice) > 0) ? null : r2(Number(rest.compareAtPrice))
  if (rest.costPerItem !== undefined) p.costPerItem = r2(Math.max(0, Number(rest.costPerItem) || 0))
  if (rest.sections !== undefined) p.sections = cleanSections(rest.sections)
  if (rest.promisedDays !== undefined) {
    const pd = rest.promisedDays
    p.promisedDays = pd && pd[0] > 0 && pd[1] >= pd[0] && pd[1] <= 120 ? [Math.round(pd[0]), Math.round(pd[1])] : null
  } else if (rest.sections !== undefined || rest.descriptionHtml !== undefined) {
    p.promisedDays = null
    p.promisedDays = effectivePromise(p)
  }
  const g = gradePage(s, p)
  p.grade = g
  const best = p.xpBestScore ?? before
  if (g.score >= before + 5 && g.score > best) {
    grantXp(s, 'copywriting', 20)
    p.xpBestScore = g.score
  }
}

export function setProductStatus(s: GameState, id: string, status: StoreProduct['status']): void {
  const p = findProduct(s, id)
  if (!p || p.status === status) return
  if (status === 'active' && (!p.title.trim() || !(p.price > 0))) {
    notify(s, { kind: 'warning', title: 'Can\'t publish yet', body: 'A product needs a title and a price before it can go live.', site: 'shopifly', path: `products/${id}` })
    return
  }
  p.status = status
  if (status === 'active') {
    if (p.publishedDay == null) p.publishedDay = today(s)
    regrade(s, p)
    notify(s, { kind: 'success', title: 'Product is live', body: `${p.title.slice(0, 60)} is now visible on your storefront.`, site: 'storefront', path: `products/${id}` })
    if ((p.grade?.score ?? 0) < 45) coachTip(s, 'store_published_weak_page', `You just published a page that grades ${Math.round(p.grade?.score ?? 0)}/100. Paid traffic to a weak page burns money. Check the Page grade card in the product editor first.`, { app: 'shopifly', essential: true, cooldownHours: 48 })
  }
}

export function deleteProduct(s: GameState, id: string): void {
  const st = s.store
  st.products = st.products.filter(p => p.id !== id)
  st.repeatPipeline = st.repeatPipeline.filter(x => x.storeProductId !== id)
  if (st.recovery) st.recovery = st.recovery.filter(x => x.storeProductId !== id)
}

// ---------------------------------------------------------------------------
// Reviews import
// ---------------------------------------------------------------------------
/** Star distribution p[1..5] consistent with an average rating. */
export function starDistribution(rating: number): number[] {
  const R = clamp(rating, 3, 5)
  const low = clamp((5 - R) * 0.22, 0.01, 0.6)
  const high = 1 - low
  const lowMean = 1 * 0.5 + 2 * 0.25 + 3 * 0.25
  const highMean = clamp((R - low * lowMean) / high, 4, 5)
  const p5 = (highMean - 4) * high
  const p4 = high - p5
  return [0, low * 0.5, low * 0.25, low * 0.25, p4, p5]
}

/** Requires a reviews app. Imports supplier reviews filtered by min stars. */
export function importReviews(s: GameState, storeProductId: string, count: number, minStars: number): boolean {
  const p = findProduct(s, storeProductId)
  if (!p) return false
  const judgy = hasApp(s, 'judgyme')
  const lookz = hasApp(s, 'lookz')
  const vitalz = hasApp(s, 'vitalz')
  if (!judgy && !lookz && !vitalz) {
    notify(s, { kind: 'warning', title: 'Install a reviews app first', body: 'Judgy.me, Lookz or Vitalz can import reviews from your AliExprez supplier.', site: 'shopifly', path: 'apps' })
    return false
  }
  const d = defOf(p.catalogId)
  if (!d) return false
  const market = s.catalog?.market?.[p.catalogId]
  const rating = market?.rating ?? d.publicSignals.rating
  const pool = Math.max(0, Math.round(market?.reviews ?? d.publicSignals.reviews))
  const dist = starDistribution(rating)
  const minS = clamp(Math.round(minStars), 1, 5)
  let share = 0
  let wsum = 0
  for (let k = minS; k <= 5; k++) { share += dist[k]; wsum += k * dist[k] }
  const available = Math.floor(pool * share)
  const n = Math.max(0, Math.min(Math.floor(count), available, 500))
  if (n <= 0) {
    notify(s, { kind: 'warning', title: 'No reviews to import', body: 'The supplier listing has no reviews matching your filter.', site: 'shopifly', path: `products/${p.id}` })
    return false
  }
  const avg = share > 0 ? wsum / share : 5
  const photoShare = lookz ? 0.35 : judgy && (installedApp(s, 'judgyme')?.planIdx ?? 0) >= 1 ? 0.25 : vitalz ? 0.2 : 0
  const r = p.reviews
  const total = r.count + n
  r.avg = Math.round(((r.avg * r.count + avg * n) / total) * 100) / 100
  r.count = total
  r.photos += Math.round(n * photoShare)
  r.source = 'imported'
  regrade(s, p)
  notify(s, { kind: 'success', title: `${n} reviews imported`, body: `Average ${avg.toFixed(1)}★${photoShare ? `, ${Math.round(n * photoShare)} with photos` : ' (text only on this plan)'}.`, site: 'shopifly', path: `products/${p.id}` })
  return true
}

/** All apps in the App Store (re-export for UI convenience). */
export const APP_LIST = APPS
