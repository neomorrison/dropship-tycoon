// Shopifly › Settings: store details, plan, payments, shipping rates, policies (with
// "Create from template") and domains. Left settings nav like the Shopify settings screen.
import { useMemo, useState, type ReactNode } from 'react'
import { CreditCard, FileText, Globe, Receipt, Store, Truck } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { GameState, PlanId, StoreState } from '../../../../core/types'
import { act, getGS, useGS } from '../../../../core/store'
import { usePauseWhileMounted } from '../../../../core/ui'
import { money, num, pct } from '../../../../core/format'
import { dayOf, formatDate } from '../../../../core/time'
import { DIFFICULTY } from '../../../../core/difficulty'
import { BENCHMARKS } from '../../../../data/benchmarks'
import {
  buyDomain, changePlan, domainQuote, generatePolicy, PAYMENT_LABELS, PLAN_LABEL, storePlanFees, storeRange, updateStoreSettings,
} from '../../../../sim/store'
import {
  Badge, Banner, BlockStack, Box, Button, Card, Checkbox, ChoiceList, ContextualSaveBar, Divider, Icon, InlineGrid, InlineStack,
  Modal, Page, Text, TextField,
} from '../../../kit/polaris'
import { useFlash } from '../merch/shared'
import '../merch/merch.css'

const NAV = [
  { key: 'general', label: 'General', icon: Store },
  { key: 'plan', label: 'Plan', icon: Receipt },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'shipping', label: 'Shipping and delivery', icon: Truck },
  { key: 'domains', label: 'Domains', icon: Globe },
  { key: 'policies', label: 'Policies', icon: FileText },
] as const
type SectionKey = (typeof NAV)[number]['key']

export default function Settings({ params, navigate }: ShopiflyPageProps) {
  const key = (NAV.some(n => n.key === params[0]) ? params[0] : 'general') as SectionKey
  const current = NAV.find(n => n.key === key)!
  return (
    <div className="sf-mx-page">
      <Page title="Settings">
        <div className="sf-mx-settings">
          <nav className="sf-mx-settings-nav" aria-label="Settings">
            {NAV.map(n => (
              <button key={n.key} type="button" className={`sf-mx-settings-link${n.key === key ? ' is-on' : ''}`} onClick={() => navigate(`settings/${n.key}`)}>
                <Icon source={n.icon} size={18} tone={n.key === key ? 'base' : 'subdued'} />
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="sf-mx-settings-main">
            <Text as="h2" variant="headingLg">{current.label}</Text>
            {key === 'general' && <GeneralSettings />}
            {key === 'plan' && <PlanSettings />}
            {key === 'payments' && <PaymentSettings navigate={navigate} />}
            {key === 'shipping' && <ShippingSettings navigate={navigate} />}
            {key === 'domains' && <DomainSettings />}
            {key === 'policies' && <PolicySettings />}
          </div>
        </div>
      </Page>
    </div>
  )
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <InlineStack align="space-between" blockAlign="center" gap="300">
      <Text as="span" tone="subdued">{label}</Text>
      <Text as="span">{children}</Text>
    </InlineStack>
  )
}

// ---------------------------------------------------------------------------
function GeneralSettings() {
  const st = useGS(s => s.store)
  const owner = useGS(s => s.player.name)
  const [name, setName] = useState(st.name)
  const [flash, showFlash] = useFlash()
  const dirty = name.trim() !== st.name
  return (
    <>
      <ContextualSaveBar
        visible={dirty}
        message="Unsaved changes"
        saveAction={{ onAction: () => { act(s => updateStoreSettings(s, { name })); setName(getGS().store.name); showFlash('Store details saved') }, disabled: !name.trim() }}
        discardAction={{ onAction: () => setName(st.name) }}
      />
      <Card title="Store details">
        <BlockStack gap="400">
          <TextField label="Store name" value={name} onChange={setName} maxLength={60} helpText="Shown on your storefront, emails and checkout." error={!name.trim() ? 'Store name can\'t be blank' : undefined} />
          <Divider />
          <Row label="Store owner">{owner}</Row>
          <Row label="Store email">support@{st.customDomain ?? st.subdomain}</Row>
          <Row label="Store URL">{st.subdomain}</Row>
          {st.createdDay != null && <Row label="Store created">{formatDate(st.createdDay, 'short')}</Row>}
        </BlockStack>
      </Card>
      <Card title="Store defaults">
        <BlockStack gap="300">
          <Row label="Currency display">US dollar (USD $)</Row>
          <Row label="Time zone">(GMT-05:00) Eastern Time (US &amp; Canada)</Row>
          <Row label="Unit system">Imperial system</Row>
          <Row label="Selling to">United States</Row>
        </BlockStack>
      </Card>
      {flash}
    </>
  )
}

// ---------------------------------------------------------------------------
const PLANS: { id: Exclude<PlanId, 'trial'>; blurb: string; features: string[] }[] = [
  { id: 'basic', blurb: 'For solo entrepreneurs', features: ['Online store', 'Unlimited products', 'Basic reports', 'Standard checkout'] },
  { id: 'shopifly', blurb: 'For small teams', features: ['Everything in Basic', 'Lower card rates', 'Professional reports', '5 staff accounts'] },
  { id: 'advanced', blurb: 'As your business scales', features: ['Everything in Shopifly', 'Lowest card rates', 'Custom report builder', '15 staff accounts'] },
]

function planCost(s: GameState, id: Exclude<PlanId, 'trial'>, sales: number, orders: number) {
  const p = BENCHMARKS.fees.plans[id]
  const pp = s.store.payments.paypal ? 0.22 : 0
  return p.monthly + sales * (1 - pp) * p.cardPct + orders * (1 - pp) * p.cardFixed + sales * pp * p.thirdPartyFee
}

function PlanSettings() {
  const s = useGS(st => st)
  const st = s.store
  const [choose, setChoose] = useState<Exclude<PlanId, 'trial'> | null>(null)
  const today = dayOf(s.time.hour)
  const r30 = useMemo(() => storeRange(s, { from: today - 29, to: today }), [s.store.analytics.daily, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const fees = storePlanFees(s)
  const trial = st.plan === 'trial'
  return (
    <>
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text as="p" variant="headingMd">{PLAN_LABEL[st.plan]}</Text>
              <Text as="p" tone="subdued">
                {trial && st.trialEndsDay != null
                  ? `$${BENCHMARKS.fees.trialMonthly}/month intro offer until ${formatDate(st.trialEndsDay, 'short')}, then Basic at $${BENCHMARKS.fees.plans.basic.monthly}/month`
                  : `${money(BENCHMARKS.fees.plans[st.plan as Exclude<PlanId, 'trial'>].monthly, { cents: false })}/month, billed to your card`}
              </Text>
            </BlockStack>
            <Badge tone="success">Current plan</Badge>
          </InlineStack>
          <Text as="p" tone="subdued" variant="bodySm">
            Online card rate {pct(fees.cardPct, 1)} + {Math.round(fees.cardFixed * 100)}¢ · {pct(fees.thirdPartyFee, 1)} fee on {PAYMENT_LABELS.paypal} and other outside payment providers
          </Text>
        </BlockStack>
      </Card>
      <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
        {PLANS.map(p => {
          const def = BENCHMARKS.fees.plans[p.id]
          const cur = st.plan === p.id
          const est = planCost(s, p.id, r30.totalSales, r30.orders)
          return (
            <Card key={p.id}>
              <BlockStack gap="300">
                <BlockStack gap="050">
                  <Text as="h3" variant="headingMd">{PLAN_LABEL[p.id]}</Text>
                  <Text as="p" tone="subdued" variant="bodySm">{p.blurb}</Text>
                </BlockStack>
                <InlineStack gap="100" blockAlign="baseline">
                  <Text as="span" variant="headingXl">${def.monthly}</Text>
                  <Text as="span" tone="subdued">USD/month</Text>
                </InlineStack>
                <Text as="p" variant="bodySm">{pct(def.cardPct, 1)} + {Math.round(def.cardFixed * 100)}¢ online card rate</Text>
                <Text as="p" variant="bodySm" tone="subdued">{pct(def.thirdPartyFee, 1)} third-party payment fee</Text>
                <ul className="sf-mx-bullets">{p.features.map(f => <li key={f}>{f}</li>)}</ul>
                {r30.orders > 0 && (
                  <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                    <Text as="p" variant="bodySm">At your last 30 days ({money(r30.totalSales, { cents: false })}, {num(r30.orders)} orders): about <strong>{money(est, { cents: false })}</strong>/month in plan + card fees</Text>
                  </Box>
                )}
                <Button variant={cur ? 'secondary' : 'primary'} disabled={cur} onClick={() => setChoose(p.id)} fullWidth>{cur ? 'Current plan' : `Choose ${PLAN_LABEL[p.id]}`}</Button>
              </BlockStack>
            </Card>
          )
        })}
      </InlineGrid>
      <Modal
        open={!!choose}
        onClose={() => setChoose(null)}
        title={choose ? `Switch to the ${PLAN_LABEL[choose]} plan?` : ''}
        size="small"
        primaryAction={{
          content: 'Confirm plan',
          onAction: () => {
            const target = choose!
            act(g => changePlan(g, target))
            setChoose(null)
          },
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setChoose(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            {choose && <Text as="p">{money(BENCHMARKS.fees.plans[choose].monthly)} is charged to your card today, then every 30 days.</Text>}
            {trial && <Text as="p" tone="caution">Choosing a plan now ends your $1/month intro offer.</Text>}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
function PaymentSettings({ navigate }: { navigate: (p: string) => void }) {
  const s = useGS(st => st)
  const st = s.store
  const [pm, setPm] = useState(st.payments)
  const [flash, showFlash] = useFlash()
  const dirty = JSON.stringify(pm) !== JSON.stringify(st.payments)
  const hasKlarno = st.apps.some(a => a.appId === 'klarno')
  const fees = storePlanFees(s)
  const dif = DIFFICULTY[s.meta.difficulty]
  return (
    <>
      <ContextualSaveBar
        visible={dirty}
        message="Unsaved changes"
        saveAction={{ onAction: () => { act(g => updateStoreSettings(g, { payments: pm })); setPm(getGS().store.payments); showFlash('Payment settings saved') } }}
        discardAction={{ onAction: () => setPm(st.payments) }}
      />
      <Card title="Shopifly Payments" actions={<Badge tone="success">Active</Badge>}>
        <BlockStack gap="300">
          <Text as="p" tone="subdued">Accept all major credit and debit cards. Money from sales lands in your Chaise Bank account on your payout schedule.</Text>
          <Row label="Online card rate">{pct(fees.cardPct, 1)} + {Math.round(fees.cardFixed * 100)}¢</Row>
          <Row label="Payout schedule">{dif.payoutDays} business day{dif.payoutDays === 1 ? '' : 's'} after each sales day</Row>
          <Divider />
          <Checkbox
            label={PAYMENT_LABELS.shopPay}
            helpText="Accelerated checkout: shoppers pay with details saved across Shopifly stores."
            checked={pm.shopPay}
            onChange={v => setPm(p => ({ ...p, shopPay: v }))}
          />
        </BlockStack>
      </Card>
      <Card title="Supported payment methods">
        <BlockStack gap="400">
          <Checkbox
            label={PAYMENT_LABELS.paypal}
            helpText={`Wallet checkout. ${pct(BENCHMARKS.fees.paypalPct, 2)} + ${Math.round(BENCHMARKS.fees.paypalFixed * 100)}¢ per transaction, plus a ${pct(fees.thirdPartyFee, 1)} Shopifly fee on your plan.`}
            checked={pm.paypal}
            onChange={v => setPm(p => ({ ...p, paypal: v }))}
          />
          <BlockStack gap="150">
            <Checkbox
              label={PAYMENT_LABELS.bnpl}
              helpText="Split purchases into 4 interest-free payments. The provider charges a 6% fee on these orders."
              checked={pm.bnpl}
              disabled={!hasKlarno}
              onChange={v => setPm(p => ({ ...p, bnpl: v }))}
            />
            {!hasKlarno && (
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" tone="subdued" variant="bodySm">Requires the Klarno app.</Text>
                <Button variant="plain" onClick={() => navigate('apps/klarno')}>Get Klarno</Button>
              </InlineStack>
            )}
          </BlockStack>
        </BlockStack>
      </Card>
      {flash}
    </>
  )
}

// ---------------------------------------------------------------------------
type ShipMode = 'free' | 'flat' | 'threshold'
function shipModeOf(sh: StoreState['shipping']): ShipMode {
  return sh.freeShipping ? 'free' : sh.freeOver != null ? 'threshold' : 'flat'
}
function ShippingSettings({ navigate }: { navigate: (p: string) => void }) {
  usePauseWhileMounted('shopifly-shipping-settings')
  const st = useGS(s => s.store)
  const norm = (sh: StoreState['shipping']) => ({ mode: shipModeOf(sh), flat: sh.flatRate.toFixed(2), over: sh.freeOver != null ? String(sh.freeOver) : '50' })
  const init = norm(st.shipping)
  const [f, setF] = useState(init)
  const [flash, showFlash] = useFlash()
  const dirty = JSON.stringify(f) !== JSON.stringify(init)
  const flat = Number(f.flat)
  const over = Number(f.over)
  const err = f.mode !== 'free' && !(flat >= 0) ? 'Enter a rate' : f.mode === 'threshold' && !(over > 0) ? 'Enter a minimum order amount' : null
  const avgPrice = st.products.filter(p => p.status === 'active').reduce((a, p, _i, arr) => a + p.price / arr.length, 0)
  const save = () => {
    if (err) { showFlash(err, 'critical'); return }
    act(g => updateStoreSettings(g, { shipping: { freeShipping: f.mode === 'free', flatRate: flat || 0, freeOver: f.mode === 'threshold' ? over : null } }))
    setF(norm(getGS().store.shipping))
    showFlash('Shipping rates saved')
  }
  return (
    <>
      <ContextualSaveBar visible={dirty} message="Unsaved changes" saveAction={{ onAction: save }} discardAction={{ onAction: () => setF(init) }} />
      <Card title="Shipping rates · United States">
        <BlockStack gap="300">
          <ChoiceList
            title="Rate customers pay at checkout"
            titleHidden
            selected={[f.mode]}
            onChange={([m]) => setF(x => ({ ...x, mode: m as ShipMode }))}
            choices={[
              { label: 'Free shipping on all orders', value: 'free', helpText: 'Build the shipping cost into your product price.' },
              {
                label: 'Flat rate per order', value: 'flat',
                renderChildren: on => on && (
                  <div className="sf-mx-inset"><TextField label="Rate" type="currency" prefix="$" value={f.flat} onChange={v => setF(x => ({ ...x, flat: v }))} /></div>
                ),
              },
              {
                label: 'Flat rate, free over a minimum order', value: 'threshold',
                renderChildren: on => on && (
                  <div className="sf-mx-inset">
                    <InlineStack gap="300" wrap={false}>
                      <TextField label="Rate" type="currency" prefix="$" value={f.flat} onChange={v => setF(x => ({ ...x, flat: v }))} />
                      <TextField label="Free on orders over" type="currency" prefix="$" value={f.over} onChange={v => setF(x => ({ ...x, over: v }))} />
                    </InlineStack>
                    {avgPrice > 0 && (
                      <Text as="p" tone="subdued" variant="bodySm">Your active products average {money(avgPrice)}.</Text>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </BlockStack>
      </Card>
      <Card title="Delivery estimates">
        <BlockStack gap="200">
          <Text as="p" tone="subdued">Delivery windows are shown per product. Set them in each product&apos;s Shipping card or with the Shipping &amp; delivery section in the theme editor.</Text>
          <div><Button onClick={() => navigate('products')}>Go to products</Button></div>
        </BlockStack>
      </Card>
      {flash}
    </>
  )
}

// ---------------------------------------------------------------------------
function DomainSettings() {
  const s = useGS(st => st)
  const st = s.store
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')
  const [buy, setBuy] = useState<string | null>(null)
  const results = useMemo(() => {
    if (!searched) return []
    const base = searched.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
    const name = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base
    const first = base.includes('.') ? base : `${name}.com`
    const alts = ['com', 'co', 'shop', 'store', 'net'].map(t => `${name}.${t}`).filter(d => d !== first)
    return [first, ...alts].map(d => domainQuote(getGS(), d))
  }, [searched, st.customDomain]) // eslint-disable-line react-hooks/exhaustive-deps
  const q = buy ? domainQuote(s, buy) : null
  return (
    <>
      <Card title="Domains">
        <div className="sf-mx-domainlist">
          {st.customDomain && (
            <div className="sf-mx-domainrow">
              <BlockStack gap="050">
                <Text as="p" fontWeight="semibold">{st.customDomain}</Text>
                <Text as="p" tone="subdued" variant="bodySm">Bought through Shopifly{st.domainRenewDay != null ? ` · renews ${formatDate(st.domainRenewDay, 'short')}` : ''}</Text>
              </BlockStack>
              <Badge tone="success">Primary</Badge>
            </div>
          )}
          <div className="sf-mx-domainrow">
            <BlockStack gap="050">
              <Text as="p" fontWeight="semibold">{st.subdomain}</Text>
              <Text as="p" tone="subdued" variant="bodySm">Shopifly-managed</Text>
            </BlockStack>
            {!st.customDomain && <Badge tone="success">Primary</Badge>}
          </div>
        </div>
      </Card>
      <Card title="Buy new domain">
        <BlockStack gap="300">
          <TextField
            label="Domain"
            labelHidden
            placeholder="yourbrand.com"
            value={query}
            onChange={setQuery}
            onEnter={() => setSearched(query)}
            connectedRight={<Button onClick={() => setSearched(query)} disabled={!query.trim()}>Search</Button>}
          />
          {results.map(r => (
            <div key={r.domain} className="sf-mx-domainrow">
              <BlockStack gap="050">
                <Text as="p" fontWeight={r.ok ? 'semibold' : undefined} tone={r.ok ? undefined : 'subdued'}>{r.domain}</Text>
                {!r.ok && <Text as="p" tone="subdued" variant="bodySm">{r.reason}</Text>}
              </BlockStack>
              {r.ok && (
                <InlineStack gap="300" blockAlign="center">
                  <Text as="span">{money(r.price)} USD/year</Text>
                  <Button size="slim" variant="primary" onClick={() => setBuy(r.domain)}>Buy</Button>
                </InlineStack>
              )}
            </div>
          ))}
          <Text as="p" tone="subdued" variant="bodySm">Includes free SSL and WHOIS privacy. Renews yearly on your card.</Text>
        </BlockStack>
      </Card>
      <Modal
        open={!!q}
        onClose={() => setBuy(null)}
        title={`Buy ${q?.domain ?? ''}`}
        size="small"
        primaryAction={{
          content: `Buy for ${q ? money(q.price) : ''}`,
          disabled: !q?.ok,
          onAction: () => {
            const d = buy!
            let ok = false
            act(g => { ok = buyDomain(g, d) })
            setBuy(null)
            if (ok) {
              setSearched('')
              setQuery('')
            }
          },
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setBuy(null) }]}
      >
        <Modal.Section>
          <Text as="p">{q ? `${money(q.price)} is charged to your card today and every year after. ${q.domain} becomes your store's primary domain.` : ''}</Text>
        </Modal.Section>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
const POLICY_FIELDS: { key: keyof StoreState['policies']; label: string; help: string }[] = [
  { key: 'refund', label: 'Refund policy', help: 'When and how customers can get refunds, returns or replacements.' },
  { key: 'shipping', label: 'Shipping policy', help: 'Processing time, delivery windows and what happens with late or lost orders.' },
  { key: 'privacy', label: 'Privacy policy', help: 'What customer data you collect and how it is used.' },
  { key: 'terms', label: 'Terms of service', help: 'The rules for using your store.' },
  { key: 'contact', label: 'Contact information', help: 'How customers reach you. Shown on your contact page.' },
]
function PolicySettings() {
  usePauseWhileMounted('shopifly-policy-settings')
  const policies = useGS(s => s.store.policies)
  const [f, setF] = useState(policies)
  const [templated, setTemplated] = useState<string[]>([])
  const [flash, showFlash] = useFlash()
  const dirty = JSON.stringify(f) !== JSON.stringify(policies)
  const missing = POLICY_FIELDS.filter(p => !policies[p.key].trim()).length
  return (
    <>
      <ContextualSaveBar
        visible={dirty}
        message="Unsaved changes"
        saveAction={{ onAction: () => { act(g => updateStoreSettings(g, { policies: f })); setTemplated([]); showFlash('Policies saved') } }}
        discardAction={{ onAction: () => { setF(policies); setTemplated([]) } }}
      />
      {missing > 0 && (
        <Banner tone="warning" title={`${missing} polic${missing === 1 ? 'y is' : 'ies are'} missing`}>
          Stores without policies look untrustworthy to shoppers, and payment providers expect them.
        </Banner>
      )}
      {POLICY_FIELDS.map(p => (
        <Card
          key={p.key}
          title={p.label}
          actions={<Button variant="plain" onClick={() => { setF(x => ({ ...x, [p.key]: generatePolicy(getGS(), p.key) })); setTemplated(t => [...new Set([...t, p.key])]) }}>Create from template</Button>}
        >
          <BlockStack gap="200">
            <TextField label={p.label} labelHidden multiline={p.key === 'contact' ? 3 : 6} maxHeight={360} value={f[p.key]} onChange={v => setF(x => ({ ...x, [p.key]: v }))} helpText={p.help} />
            {templated.includes(p.key) && (
              <Text as="p" tone="caution" variant="bodySm">Review the template before saving: it makes promises (returns, delivery times) you have to keep.</Text>
            )}
          </BlockStack>
        </Card>
      ))}
      {flash}
    </>
  )
}

