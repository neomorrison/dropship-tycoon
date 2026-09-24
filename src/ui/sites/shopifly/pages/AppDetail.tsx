// Shopifly App Store listing: header with install/uninstall, screenshots, description,
// "what it does", pricing plans (switch plan), merchant reviews, app details, and
// shortcuts into the part of the game the app powers once it's installed.
import { useMemo, useState } from 'react'
import { BadgeCheck, Check, ExternalLink, LayoutTemplate, ShieldCheck } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import { act, useGS } from '../../../../core/store'
import { openSite } from '../../../../core/ui'
import { money } from '../../../../core/format'
import { formatDate } from '../../../../core/time'
import { APP_CATEGORY_LABELS, KLAVIO_TIERS, appDef, type AppDef } from '../../../../data/apps'
import { sectionDef } from '../../../../data/sections'
import { appTrialAvailable, installApp, uninstallApp } from '../../../../sim/store'
import {
  Badge, Banner, BlockStack, Button, Card, DataTable, DescriptionList, EmptyState, InlineGrid, InlineStack, Layout, Modal, Page, Select, Text,
} from '../../../kit/polaris'
import { Stars } from '../../../kit/common'
import { starCounts } from '../../storefront'
import { AppIcon, appShortName, ImportReviewsModal, REVIEW_APPS, useFlash } from '../merch/shared'
import { AppScreenshot, merchantReviews, PERMISSIONS, planPriceLabel } from '../merch/appVisuals'
import '../merch/merch.css'

const shortName = (a: AppDef) => appShortName(a.name)

export default function AppDetail({ params, navigate }: ShopiflyPageProps) {
  const app = appDef(params[0] ?? '')
  const s = useGS(st => st)
  const [installPlan, setInstallPlan] = useState<number | null>(null)
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [reviewProduct, setReviewProduct] = useState('')
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [flash, showFlash] = useFlash()
  const dist = useMemo(() => (app ? starCounts(app.reviews, app.rating) : []), [app])

  if (!app) {
    return (
      <Page backAction={{ content: 'Apps', onAction: () => navigate('apps') }} title="App not found">
        <Card><EmptyState heading="This app isn't available" image="search" action={{ content: 'Browse apps', onAction: () => navigate('apps') }} /></Card>
      </Page>
    )
  }
  const ia = s.store.apps.find(a => a.appId === app.id)
  const installed = !!ia
  const bill = s.finance.bills.find(b => b.ref === `app:${app.id}`)
  const name = shortName(app)
  const card = s.finance.card

  const doInstall = (idx: number) => {
    let ok = false
    act(st => { ok = installApp(st, app.id, idx) })
    setInstallPlan(null)
    // new installs and declined charges already raise a store notification
    if (ok && installed) showFlash(`Switched to the ${app.plans[idx].name} plan`)
  }

  // shortcuts once installed
  const shortcuts: { label: string; go: () => void; icon?: typeof ExternalLink }[] = []
  if (installed) {
    if (app.id === 'dserz') shortcuts.push({ label: 'View orders to fulfill', go: () => navigate('orders') })
    if (app.id === 'fadbook-channel') shortcuts.push({ label: 'Open Fadbook Ads Manager', go: () => openSite('fadbook', ''), icon: ExternalLink })
    if (app.id === 'tiktak-channel') shortcuts.push({ label: 'Open TikTak Ads Manager', go: () => openSite('tiktak', ''), icon: ExternalLink })
    if (app.id === 'klavio') shortcuts.push({ label: 'View email marketing', go: () => navigate('marketing') })
    if (app.id === 'chargeflo') shortcuts.push({ label: 'View disputes', go: () => navigate('disputes') })
    if (app.id === 'gorgeous' || app.id === 'trackwise') shortcuts.push({ label: 'Open support inbox', go: () => navigate('inbox') })
    if (app.id === 'klarno') shortcuts.push({ label: 'Payment settings', go: () => navigate('settings/payments') })
    if (app.unlocksSections.length) shortcuts.push({ label: 'Add to your product page', go: () => navigate('online-store/editor'), icon: LayoutTemplate })
  }
  const isReviewApp = (REVIEW_APPS as readonly string[]).includes(app.id)
  const products = s.store.products.filter(p => p.status !== 'archived')
  const plan = ia ? app.plans[Math.min(ia.planIdx, app.plans.length - 1)] : null
  const trialEnds = bill && plan?.trialDays && ia && bill.nextDueDay > ia.installedDay && bill.nextDueDay - ia.installedDay <= plan.trialDays ? bill.nextDueDay : null
  const chosen = installPlan != null ? app.plans[installPlan] : null
  // a free trial is offered once per app: reinstalling bills straight away
  const trialOk = appTrialAvailable(s, app.id)
  const trialOf = (p: { trialDays?: number }) => (trialOk ? p.trialDays ?? 0 : 0)

  return (
    <div className="sf-mx-page">
      <Page
        backAction={{ content: 'Apps', onAction: () => navigate('apps') }}
        title={app.name}
        titleMetadata={installed ? <Badge tone="success">Installed</Badge> : undefined}
        subtitle={`by ${app.developer}`}
        primaryAction={installed ? undefined : { content: 'Install', onAction: () => setInstallPlan(0) }}
        secondaryActions={installed ? [{ content: 'Uninstall', destructive: true, onAction: () => setConfirmUninstall(true) }] : undefined}
      >
        <BlockStack gap="400">
          <Card>
            <InlineStack gap="400" blockAlign="center" wrap={false}>
              <AppIcon app={app} size={72} />
              <BlockStack gap="150">
                <Text as="p" variant="headingLg">{app.tagline}</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Stars rating={app.rating} size={14} color="#303030" />
                  <Text as="span" fontWeight="semibold">{app.rating.toFixed(1)}</Text>
                  <Text as="span" tone="subdued">({app.reviews.toLocaleString('en-US')} reviews)</Text>
                  <Text as="span" tone="subdued">·</Text>
                  <Text as="span" tone="subdued">{APP_CATEGORY_LABELS[app.category]}</Text>
                </InlineStack>
                <InlineStack gap="150">
                  {app.builtForShopifly && <span className="sf-mx-bfs"><BadgeCheck size={12} /> Built for Shopifly</span>}
                  {app.highlights.filter(h => h !== 'Built for Shopifly').map(h => <Badge key={h}>{h}</Badge>)}
                </InlineStack>
              </BlockStack>
            </InlineStack>
          </Card>

          {installed && (
            <Banner
              tone="success"
              title={`${name} is installed`}
              action={shortcuts[0] ? { content: shortcuts[0].label, onAction: shortcuts[0].go } : undefined}
              secondaryAction={shortcuts[1] ? { content: shortcuts[1].label, onAction: shortcuts[1].go } : undefined}
            >
              {plan?.name} plan{bill ? ` · ${money(bill.amount)}/month on your card` : plan && planPriceLabel(plan) === 'Free' ? ' · free' : ''}
              {trialEnds != null ? ` · free trial until ${formatDate(trialEnds, 'short')}` : ''}
            </Banner>
          )}

          {installed && isReviewApp && (
            <Card title="Import reviews from AliExprez">
              {products.length === 0 ? (
                <Text as="p" tone="subdued">Import a product first.</Text>
              ) : (
                <InlineStack gap="200" blockAlign="end">
                  <div style={{ flex: '1 1 240px' }}>
                    <Select
                      label="Product"
                      options={[{ label: 'Choose a product', value: '' }, ...products.map(p => ({ label: `${p.title.slice(0, 60)}${p.reviews.count ? ` (${p.reviews.count} reviews)` : ''}`, value: p.id }))]}
                      value={reviewProduct}
                      onChange={setReviewProduct}
                    />
                  </div>
                  <Button disabled={!reviewProduct} onClick={() => setReviewsOpen(true)}>Import reviews</Button>
                </InlineStack>
              )}
            </Card>
          )}

          <div className="sf-mx-shots">
            {([0, 1, 2] as const).map(k => <AppScreenshot key={k} app={app} kind={k} />)}
          </div>

          <Layout>
            <Layout.Section>
              <BlockStack gap="400">
                <Card title="About this app">
                  <BlockStack gap="300">
                    <Text as="p">{app.description}</Text>
                    <Text as="h3" variant="headingSm">What it does in your store</Text>
                    <ul className="sf-mx-checklist">
                      {app.effects.map(e => <li key={e}><Check size={14} /> {e}</li>)}
                    </ul>
                    {app.unlocksSections.length > 0 && (
                      <InlineStack gap="150" blockAlign="center">
                        <Text as="span" tone="subdued" variant="bodySm">Adds theme sections:</Text>
                        {app.unlocksSections.map(id => <Badge key={id} tone="info">{sectionDef(id).name}</Badge>)}
                      </InlineStack>
                    )}
                  </BlockStack>
                </Card>

                <Card title="Pricing">
                  <BlockStack gap="300">
                    <InlineGrid columns={{ xs: 1, md: Math.min(3, app.plans.length) }} gap="300">
                      {app.plans.map((p, i) => {
                        const current = installed && ia!.planIdx === i
                        return (
                          <div key={p.name} className={`sf-mx-plan${current ? ' is-current' : ''}`}>
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text as="h3" variant="headingSm">{p.name}</Text>
                                {current && <Badge tone="success">Current</Badge>}
                              </InlineStack>
                              <Text as="p" variant="headingLg">{planPriceLabel(p)}</Text>
                              {(p.trialDays ?? 0) > 0 && p.price > 0 && (trialOk || !installed) && <Text as="p" tone="subdued" variant="bodySm">{trialOk ? `${p.trialDays}-day free trial` : 'Free trial already used'}</Text>}
                              <ul className="sf-mx-checklist sf-mx-checklist--small">
                                {p.features.map(f => <li key={f}><Check size={13} /> {f}</li>)}
                              </ul>
                              {app.id !== 'klavio' && !current && (
                                <Button onClick={() => setInstallPlan(i)} variant={installed ? 'secondary' : i === 0 ? 'primary' : 'secondary'}>
                                  {installed ? 'Switch to this plan' : trialOf(p) > 0 && p.price > 0 ? 'Start free trial' : 'Install'}
                                </Button>
                              )}
                            </BlockStack>
                          </div>
                        )
                      })}
                    </InlineGrid>
                    {app.id === 'klavio' && (
                      <DataTable
                        columnContentTypes={['text', 'numeric']}
                        headings={['Active contacts', 'Price per month']}
                        rows={KLAVIO_TIERS.map((t, i) => [
                          i === 0 ? `Up to ${t.maxContacts.toLocaleString('en-US')}` : Number.isFinite(t.maxContacts) ? `${(KLAVIO_TIERS[i - 1].maxContacts + 1).toLocaleString('en-US')}–${t.maxContacts.toLocaleString('en-US')}` : `${(KLAVIO_TIERS[i - 1].maxContacts + 1).toLocaleString('en-US')}+`,
                          t.price ? money(t.price, { cents: false }) : 'Free',
                        ])}
                      />
                    )}
                    <Text as="p" tone="subdued" variant="bodySm">All charges are billed in USD to your Chaise Sapphire card with your other Shopifly bills.</Text>
                  </BlockStack>
                </Card>

                <Card title="Reviews">
                  <BlockStack gap="400">
                    <InlineStack gap="600" blockAlign="center">
                      <BlockStack gap="100" inlineAlign="center">
                        <Text as="p" variant="heading2xl">{app.rating.toFixed(1)}</Text>
                        <Stars rating={app.rating} size={14} color="#303030" />
                        <Text as="p" tone="subdued" variant="bodySm">{app.reviews.toLocaleString('en-US')} reviews</Text>
                      </BlockStack>
                      <div className="sf-mx-ratingbars">
                        {[5, 4, 3, 2, 1].map(k => (
                          <div key={k} className="sf-mx-ratingbar">
                            <span>{k}</span>
                            <span className="sf-mx-ratingbar-track"><span style={{ width: `${app.reviews ? (dist[k] / app.reviews) * 100 : 0}%` }} /></span>
                            <span className="sf-mx-ratingbar-n">{Math.round(app.reviews ? (dist[k] / app.reviews) * 100 : 0)}%</span>
                          </div>
                        ))}
                      </div>
                    </InlineStack>
                    {merchantReviews(app).map((r, i) => (
                      <div key={i} className="sf-mx-mreview">
                        <InlineStack align="space-between">
                          <Text as="p" fontWeight="semibold">{r.store}</Text>
                          <Text as="span" tone="subdued" variant="bodySm">{r.months} month{r.months === 1 ? '' : 's'} using the app</Text>
                        </InlineStack>
                        <Text as="p" tone="subdued" variant="bodySm">{r.country}</Text>
                        <Stars rating={r.stars} size={12} color="#303030" />
                        <Text as="p">{r.text}</Text>
                      </div>
                    ))}
                  </BlockStack>
                </Card>
              </BlockStack>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card title="App details">
                  <DescriptionList
                    stacked
                    spacing="tight"
                    items={[
                      { term: 'Developer', description: app.developer },
                      { term: 'Category', description: APP_CATEGORY_LABELS[app.category] },
                      { term: 'Launched', description: app.launched },
                      { term: 'Works with', description: app.worksWith.join(', ') },
                      { term: 'Languages', description: 'English' },
                    ]}
                  />
                </Card>
                {installed && shortcuts.length > 0 && (
                  <Card title="Shortcuts">
                    <BlockStack gap="200">
                      {shortcuts.map(sc => <Button key={sc.label} icon={sc.icon} onClick={sc.go} fullWidth textAlign="start">{sc.label}</Button>)}
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>

      {/* install / switch plan consent */}
      <Modal
        open={chosen != null}
        onClose={() => setInstallPlan(null)}
        title={installed ? `Switch ${name} to ${chosen?.name}?` : `Install ${name}`}
        primaryAction={{ content: installed ? 'Switch plan' : chosen && trialOf(chosen) > 0 && chosen.price > 0 ? 'Start free trial' : 'Install app', onAction: () => installPlan != null && doInstall(installPlan) }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setInstallPlan(null) }]}
      >
        {chosen && (
          <>
            {!installed && (
              <Modal.Section>
                <BlockStack gap="200">
                  <InlineStack gap="300" blockAlign="center">
                    <AppIcon app={app} size={40} />
                    <Text as="p" fontWeight="semibold">{app.name} will be able to:</Text>
                  </InlineStack>
                  <ul className="sf-mx-checklist">
                    {PERMISSIONS[app.category].map(p => <li key={p}><ShieldCheck size={14} /> {p}</li>)}
                  </ul>
                </BlockStack>
              </Modal.Section>
            )}
            <Modal.Section subdued>
              <BlockStack gap="150">
                <InlineStack align="space-between">
                  <Text as="span" fontWeight="semibold">{chosen.name} plan</Text>
                  <Text as="span" fontWeight="semibold">{app.id === 'klavio' ? 'Priced by contacts' : planPriceLabel(chosen)}</Text>
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  {chosen.billing === 'monthly' && chosen.price > 0
                    ? trialOf(chosen) > 0 && !installed
                      ? `Free for ${chosen.trialDays} days, then ${money(chosen.price)} every 30 days on your card. Uninstall any time before then to pay nothing.`
                      : `${money(chosen.price)} is charged to your card now, then every 30 days.`
                    : chosen.billing === 'usage'
                      ? chosen.usageNote ?? 'Usage-based pricing.'
                      : 'Free. No charges.'}
                </Text>
                {chosen.billing === 'monthly' && chosen.price > 0 && !(trialOf(chosen) > 0 && !installed) && card.limit - card.balance < chosen.price && (
                  <Text as="p" tone="critical" variant="bodySm">Your card has {money(Math.max(0, card.limit - card.balance))} available, so this charge may be declined.</Text>
                )}
              </BlockStack>
            </Modal.Section>
          </>
        )}
      </Modal>

      <Modal
        open={confirmUninstall}
        onClose={() => setConfirmUninstall(false)}
        title={`Uninstall ${name}?`}
        size="small"
        primaryAction={{
          content: 'Uninstall',
          destructive: true,
          onAction: () => {
            act(st => uninstallApp(st, app.id))
            setConfirmUninstall(false)
          },
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setConfirmUninstall(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p">Charges stop and the app is removed from your store.</Text>
            {app.id === 'dserz' && <Text as="p" tone="critical">New dropship orders will wait for you to fulfill them by hand.</Text>}
            {(app.id === 'fadbook-channel' || app.id === 'tiktak-channel') && <Text as="p" tone="critical">The pixel is removed, so ads can no longer see purchases or optimize for them.</Text>}
            {app.unlocksSections.length > 0 && <Text as="p" tone="subdued">Sections that need this app will be hidden from your product pages.</Text>}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {reviewProduct && <ImportReviewsModal open={reviewsOpen} onClose={() => setReviewsOpen(false)} productId={reviewProduct} />}
      {flash}
    </div>
  )
}
