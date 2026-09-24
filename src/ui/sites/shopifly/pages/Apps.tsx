// Shopifly › Apps: installed apps (plan, monthly cost, uninstall) and the Shopifly App
// Store (search, categories, app cards with rating, pricing and "Built for Shopifly").
import { useMemo, useState } from 'react'
import { BadgeCheck, Search } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import { act, useGS } from '../../../../core/store'
import { formatDate } from '../../../../core/time'
import { money } from '../../../../core/format'
import { APPS, APP_CATEGORY_LABELS, appDef, type AppCategory, type AppDef } from '../../../../data/apps'
import { uninstallApp } from '../../../../sim/store'
import { Badge, BlockStack, Button, Card, EmptyState, InlineStack, Modal, Page, Text, TextField } from '../../../kit/polaris'
import { Stars } from '../../../kit/common'
import { AppIcon } from '../merch/shared'
import { planPriceLabel, pricingSummary } from '../merch/appVisuals'
import '../merch/merch.css'

function AppCard({ app, installed, onOpen }: { app: AppDef; installed: boolean; onOpen: () => void }) {
  return (
    <button type="button" className="sf-mx-appcard" onClick={onOpen}>
      <AppIcon app={app} size={48} />
      <div className="sf-mx-appcard-body">
        <Text as="p" fontWeight="semibold">{app.name}</Text>
        <InlineStack gap="100" blockAlign="center">
          <Stars rating={app.rating} size={12} color="#303030" />
          <Text as="span" variant="bodySm" tone="subdued">{app.rating.toFixed(1)} ({app.reviews.toLocaleString('en-US')})</Text>
        </InlineStack>
        <Text as="p" variant="bodySm" tone="subdued">{pricingSummary(app)}</Text>
        <p className="sf-mx-appcard-tag">{app.tagline}</p>
        <InlineStack gap="100">
          {app.builtForShopifly && <span className="sf-mx-bfs"><BadgeCheck size={12} /> Built for Shopifly</span>}
          {installed && <Badge tone="success">Installed</Badge>}
        </InlineStack>
      </div>
    </button>
  )
}

export default function Apps({ navigate }: ShopiflyPageProps) {
  const s = useGS(st => st)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<AppCategory | 'all'>('all')
  const [confirm, setConfirm] = useState<string | null>(null)
  const installed = s.store.apps
  const installedIds = new Set(installed.map(a => a.appId))
  const bills = s.finance.bills

  const cats = useMemo(() => [...new Set(APPS.map(a => a.category))], [])
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return APPS.filter(a => (cat === 'all' || a.category === cat) && (!q || `${a.name} ${a.tagline} ${a.developer} ${APP_CATEGORY_LABELS[a.category]}`.toLowerCase().includes(q)))
  }, [query, cat])
  const popular = APPS.filter(a => a.highlights.includes('Popular with stores like yours') && !installedIds.has(a.id))
  const monthly = bills.filter(b => b.ref?.startsWith('app:')).reduce((a, b) => a + b.amount, 0)
  const scripts = installed.map(a => appDef(a.appId)).filter(a => a && a.loadTime > 0).length
  const confirmApp = confirm ? appDef(confirm) : undefined

  return (
    <div className="sf-mx-page">
      <Page title="Apps" subtitle="Add features to your store with apps from the Shopifly App Store">
        <BlockStack gap="500">
          <Card padding="0">
            <div className="sf-mx-cardhead">
              <Text as="h2" variant="headingSm">Installed apps</Text>
              {installed.length > 0 && (
                <Text as="span" tone="subdued" variant="bodySm">
                  {money(monthly)}/month in app charges · {scripts} app{scripts === 1 ? '' : 's'} load{scripts === 1 ? 's' : ''} on your storefront
                </Text>
              )}
            </div>
            {installed.length === 0 ? (
              <div className="sf-mx-pad">
                <EmptyState heading="No apps installed yet" image="generic" compact>
                  Most dropshipping stores start with a fulfillment app and a reviews app.
                </EmptyState>
              </div>
            ) : (
              <div className="sf-mx-applist">
                {installed.map(ia => {
                  const a = appDef(ia.appId)
                  if (!a) return null
                  const plan = a.plans[Math.min(ia.planIdx, a.plans.length - 1)]
                  const bill = bills.find(b => b.ref === `app:${a.id}`)
                  const trialEnds = bill && plan.trialDays && bill.nextDueDay > ia.installedDay && bill.nextDueDay - ia.installedDay <= plan.trialDays ? bill.nextDueDay : null
                  return (
                    <div key={a.id} className="sf-mx-applist-row">
                      <button type="button" className="sf-mx-applist-main" onClick={() => navigate(`apps/${a.id}`)}>
                        <AppIcon app={a} size={36} />
                        <div>
                          <Text as="p" fontWeight="semibold">{a.name}</Text>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {plan.name} · {a.id === 'klavio' && bill ? `${money(bill.amount)}/month` : planPriceLabel(plan)}
                            {trialEnds != null ? ` · Free trial until ${formatDate(trialEnds, 'md')}` : ''}
                          </Text>
                        </div>
                      </button>
                      <InlineStack gap="200">
                        <Button size="slim" onClick={() => navigate(`apps/${a.id}`)}>Open</Button>
                        <Button size="slim" variant="tertiary" tone="critical" onClick={() => setConfirm(a.id)}>Uninstall</Button>
                      </InlineStack>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingLg">Shopifly App Store</Text>
              <div className="sf-mx-appsearch">
                <TextField label="Search apps" labelHidden prefix={<Search size={16} />} placeholder="Search apps" value={query} onChange={setQuery} clearButton onClearButtonClick={() => setQuery('')} />
              </div>
            </InlineStack>
            <div className="sf-mx-pills">
              <button type="button" className={`sf-mx-pill${cat === 'all' ? ' is-on' : ''}`} onClick={() => setCat('all')}>All</button>
              {cats.map(c => (
                <button key={c} type="button" className={`sf-mx-pill${cat === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>{APP_CATEGORY_LABELS[c]}</button>
              ))}
            </div>

            {cat === 'all' && !query && popular.length > 0 && (
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Popular with stores like yours</Text>
                <div className="sf-mx-appgrid">
                  {popular.map(a => <AppCard key={a.id} app={a} installed={false} onOpen={() => navigate(`apps/${a.id}`)} />)}
                </div>
              </BlockStack>
            )}

            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">{cat === 'all' ? (query ? `Results for “${query}”` : 'All apps') : APP_CATEGORY_LABELS[cat]}</Text>
              {list.length === 0 ? (
                <Card><EmptyState heading="No apps found" image="search" compact>Try a different search or category.</EmptyState></Card>
              ) : (
                <div className="sf-mx-appgrid">
                  {list.map(a => <AppCard key={a.id} app={a} installed={installedIds.has(a.id)} onOpen={() => navigate(`apps/${a.id}`)} />)}
                </div>
              )}
            </BlockStack>
          </BlockStack>
        </BlockStack>
      </Page>

      <Modal
        open={!!confirmApp}
        onClose={() => setConfirm(null)}
        title={`Uninstall ${confirmApp?.name ?? ''}?`}
        size="small"
        primaryAction={{
          content: 'Uninstall',
          destructive: true,
          onAction: () => {
            const id = confirm!
            act(st => uninstallApp(st, id))
            setConfirm(null)
          },
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setConfirm(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <Text as="p">The app's charges stop and its features are removed from your store.</Text>
            {confirmApp && confirmApp.unlocksSections.length > 0 && (
              <Text as="p" tone="subdued">Product page sections that need this app will be hidden.</Text>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </div>
  )
}
