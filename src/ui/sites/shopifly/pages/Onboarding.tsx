// Store signup (shown until the store exists): Shopify-style "Start your free trial" flow —
// a couple of setup questions, name your store, create it.
import { useMemo, useState } from 'react'
import {
  Boxes, Check, CircleHelp, Globe, Package, Palette, ShoppingBag, Smartphone, Sparkles, Store, Truck, Users,
} from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import { act, useGSShallow } from '../../../../core/store'
import { usePauseWhileMounted } from '../../../../core/ui'
import { BENCHMARKS } from '../../../../data/benchmarks'
import { createStore } from '../../../../sim/store'
import { BlockStack, Button, InlineStack, PolarisProvider, ProgressBar, Text, TextField } from '../../../kit/polaris'
import { cx } from '../../../kit/common'
import { ShopiflyLogo } from '../core/Logo'
import '../shopifly.css'

type Step = 'welcome' | 'sell' | 'what' | 'name'
const STEPS: Step[] = ['welcome', 'sell', 'what', 'name']

const WHERE = [
  { id: 'online', label: 'An online store', sub: 'Create a fully customizable website', icon: Globe },
  { id: 'social', label: 'Social media', sub: 'Reach customers on Fadbook, Instaglam, TikTak and more', icon: Smartphone },
  { id: 'person', label: 'In person', sub: 'Sell at retail stores, pop-ups, or other physical locations', icon: Store },
  { id: 'market', label: 'Online marketplaces', sub: 'List products on marketplaces like Amazin', icon: ShoppingBag },
]
const WHAT = [
  { id: 'dropship', label: 'Products I buy or source from suppliers', sub: 'Dropshipping, wholesale, private label', icon: Truck },
  { id: 'make', label: 'Products I make myself', sub: 'Handmade goods, crafts, art', icon: Palette },
  { id: 'pod', label: 'Print-on-demand', sub: 'Custom designs on shirts, mugs and more', icon: Boxes },
  { id: 'digital', label: 'Digital products', sub: 'Courses, templates, downloads', icon: Sparkles },
  { id: 'services', label: 'Services', sub: 'Coaching, repairs, bookings', icon: Users },
  { id: 'later', label: "I'll decide later", sub: '', icon: CircleHelp },
]

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'my-store'
}

export default function Onboarding({ compact }: ShopiflyPageProps) {
  const { player, cash, cardLimit, cardBalance } = useGSShallow(s => ({
    player: s.player.name, cash: s.finance.cash, cardLimit: s.finance.card.limit, cardBalance: s.finance.card.balance,
  }))
  const [step, setStep] = useState<Step>('welcome')
  const [where, setWhere] = useState<string[]>(['online', 'social'])
  const [what, setWhat] = useState<string>('dropship')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [creating, setCreating] = useState(false)
  usePauseWhileMounted('shopifly-onboarding-name', step === 'name')

  const idx = STEPS.indexOf(step)
  const trimmed = name.trim()
  const error = !trimmed ? 'Enter a store name' : trimmed.length < 3 ? 'Store name must be at least 3 characters' : trimmed.length > 60 ? 'Store name must be 60 characters or fewer' : null
  const domain = `${slugify(trimmed || 'your-store')}.myshopifly.com`
  const canPay = cash + Math.max(0, cardLimit - cardBalance) >= BENCHMARKS.fees.trialMonthly
  const suggestions = useMemo(() => {
    const firstName = player.split(' ')[0] || 'My'
    return [`${firstName}'s Goods`, 'Nest & Nook', 'Everyday Upgrade', 'Lumen Home Co.']
  }, [player])

  const create = () => {
    setTouched(true)
    if (error || creating) return
    setCreating(true)
    // a short "setting up" beat, like the real signup
    window.setTimeout(() => act(s => createStore(s, { name: trimmed })), 700)
  }

  return (
    <PolarisProvider className={cx('sf-onb', compact && 'sf-onb-compact')}>
      <header className="sf-onb-top">
        <ShopiflyLogo size={compact ? 24 : 28} tone="dark" />
        {step !== 'welcome' && !creating && (
          <Text as="span" variant="bodySm" tone="subdued">Step {idx} of 3</Text>
        )}
      </header>

      {step === 'welcome' && (
        <div className="sf-onb-hero">
          <div className="sf-onb-hero-copy">
            <Text as="h1" variant="heading2xl">Start your free trial</Text>
            <Text as="p" variant="bodyLg" tone="subdued">
              Build your store, sell to customers everywhere, and get paid, all in one place. Get 3 months for
              ${BENCHMARKS.fees.trialMonthly}/month, then Basic at ${BENCHMARKS.fees.plans.basic.monthly}/month.
            </Text>
            <ul className="sf-onb-bullets">
              <li><Check size={16} strokeWidth={2.4} /> An online store with free themes and a checkout that converts</li>
              <li><Check size={16} strokeWidth={2.4} /> Sell on Fadbook, Instaglam and TikTak with sales channel apps</li>
              <li><Check size={16} strokeWidth={2.4} /> Shopifly Payments: accept cards and get paid out to your bank</li>
            </ul>
            <InlineStack gap="300" blockAlign="center">
              <Button variant="primary" size="large" onClick={() => setStep('sell')}>Start free trial</Button>
              <Text as="span" variant="bodySm" tone="subdued">No commitment. Cancel anytime.</Text>
            </InlineStack>
          </div>
          <div className="sf-onb-hero-art" aria-hidden>
            <div className="sf-onb-mock">
              <div className="sf-onb-mock-bar"><span /><span /><span /></div>
              <div className="sf-onb-mock-body">
                <div className="sf-onb-mock-card sf-onb-mock-sales">
                  <span>Total sales</span>
                  <strong>$2,847.60</strong>
                  <svg viewBox="0 0 160 40" preserveAspectRatio="none"><path d="M0 34 L20 30 L40 32 L60 22 L80 25 L100 14 L120 17 L140 8 L160 10" fill="none" stroke="#2c6ecb" strokeWidth="2.5" /></svg>
                </div>
                <div className="sf-onb-mock-card sf-onb-mock-order">
                  <span className="sf-onb-mock-dot" />
                  <div><strong>Order #1027</strong><span>2 items · $54.98</span></div>
                </div>
                <div className="sf-onb-mock-card sf-onb-mock-order">
                  <span className="sf-onb-mock-dot" />
                  <div><strong>Order #1028</strong><span>1 item · $29.99</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {step !== 'welcome' && (
        <div className="sf-onb-body">
          <div className="sf-onb-card">
            <ProgressBar progress={creating ? 100 : ((idx - 0.5) / 3) * 100} size="small" tone="primary" />
            {step === 'sell' && (
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingXl">Where would you like to sell?</Text>
                  <Text as="p" tone="subdued">Pick as many as you like. We'll make sure you're set up to sell in these places.</Text>
                </BlockStack>
                <div className="sf-onb-options">
                  {WHERE.map(o => {
                    const on = where.includes(o.id)
                    return (
                      <button key={o.id} type="button" className={cx('sf-onb-option', on && 'is-on')} aria-pressed={on}
                        onClick={() => setWhere(w => (on ? w.filter(x => x !== o.id) : [...w, o.id]))}>
                        <span className="sf-onb-option-icon"><o.icon size={20} strokeWidth={1.8} /></span>
                        <span className="sf-onb-option-text"><strong>{o.label}</strong>{o.sub && <span>{o.sub}</span>}</span>
                        <span className={cx('sf-onb-check', on && 'is-on')}>{on && <Check size={12} strokeWidth={3} />}</span>
                      </button>
                    )
                  })}
                </div>
                <InlineStack align="space-between" blockAlign="center">
                  <Button variant="plain" onClick={() => setStep('what')}>Skip</Button>
                  <InlineStack gap="200">
                    <Button onClick={() => setStep('welcome')}>Back</Button>
                    <Button variant="primary" onClick={() => setStep('what')}>Next</Button>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            )}

            {step === 'what' && (
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingXl">What do you plan to sell first?</Text>
                  <Text as="p" tone="subdued">We'll use this to recommend apps and a setup guide for your business.</Text>
                </BlockStack>
                <div className="sf-onb-options sf-onb-options-grid">
                  {WHAT.map(o => {
                    const on = what === o.id
                    return (
                      <button key={o.id} type="button" className={cx('sf-onb-option', on && 'is-on')} aria-pressed={on} onClick={() => setWhat(o.id)}>
                        <span className="sf-onb-option-icon"><o.icon size={20} strokeWidth={1.8} /></span>
                        <span className="sf-onb-option-text"><strong>{o.label}</strong>{o.sub && <span>{o.sub}</span>}</span>
                        <span className={cx('sf-onb-radio', on && 'is-on')} />
                      </button>
                    )
                  })}
                </div>
                <InlineStack align="space-between" blockAlign="center">
                  <Button variant="plain" onClick={() => setStep('name')}>Skip</Button>
                  <InlineStack gap="200">
                    <Button onClick={() => setStep('sell')}>Back</Button>
                    <Button variant="primary" onClick={() => setStep('name')}>Next</Button>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
            )}

            {step === 'name' && (
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingXl">{creating ? 'Setting up your store…' : 'Name your store'}</Text>
                  <Text as="p" tone="subdued">
                    {creating
                      ? 'Creating your admin, checkout and online store.'
                      : 'Your store name appears on your storefront, checkout and emails to customers. You can change it later in Settings.'}
                  </Text>
                </BlockStack>
                {creating ? (
                  <div className="sf-onb-creating">
                    <div className="sf-onb-spinner" />
                    <Text as="span" fontWeight="medium">{domain}</Text>
                  </div>
                ) : (
                  <>
                    <TextField
                      label="Store name"
                      value={name}
                      onChange={v => setName(v)}
                      onBlur={() => setTouched(true)}
                      onEnter={create}
                      autoFocus
                      placeholder="e.g. Nest & Nook"
                      maxLength={60}
                      showCharacterCount
                      error={touched ? error ?? undefined : undefined}
                      helpText={<>Your free store address: <strong>{domain}</strong></>}
                    />
                    <InlineStack gap="200" wrap>
                      {suggestions.map(sg => (
                        <button key={sg} type="button" className="sf-onb-chip" onClick={() => { setName(sg); setTouched(true) }}>{sg}</button>
                      ))}
                    </InlineStack>
                    <div className="sf-onb-plan">
                      <Package size={18} strokeWidth={1.8} />
                      <div>
                        <Text as="p" fontWeight="semibold">${BENCHMARKS.fees.trialMonthly}/month for your first {BENCHMARKS.fees.trialMonths} months</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          We'll charge ${BENCHMARKS.fees.trialMonthly.toFixed(2)} to your card on file today. After {BENCHMARKS.fees.trialMonths} months
                          your store moves to Basic (${BENCHMARKS.fees.plans.basic.monthly}/month) unless you choose another plan.
                          Card payments: {(BENCHMARKS.fees.plans.basic.cardPct * 100).toFixed(1)}% + {Math.round(BENCHMARKS.fees.plans.basic.cardFixed * 100)}¢.
                        </Text>
                      </div>
                    </div>
                    {!canPay && (
                      <Text as="p" tone="critical">Your card and bank balance can't cover the ${BENCHMARKS.fees.trialMonthly} first-month charge.</Text>
                    )}
                    <InlineStack align="end" gap="200">
                      <Button onClick={() => setStep('what')}>Back</Button>
                      <Button variant="primary" onClick={create} disabled={!canPay}>Create store</Button>
                    </InlineStack>
                  </>
                )}
              </BlockStack>
            )}
          </div>

          {!compact && (
            <aside className="sf-onb-steps" aria-label="Setup progress">
              {[
                { t: 'Tell us about your business', done: idx > 2 || creating, cur: idx <= 2 },
                { t: 'Name your store', done: creating, cur: idx === 3 && !creating },
                { t: 'Start selling', done: false, cur: creating },
              ].map((x, i) => (
                <div key={x.t} className={cx('sf-onb-step', x.done && 'is-done', x.cur && 'is-current')}>
                  <span className="sf-onb-step-dot">{x.done ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                  <span>{x.t}</span>
                </div>
              ))}
            </aside>
          )}
        </div>
      )}
    </PolarisProvider>
  )
}
