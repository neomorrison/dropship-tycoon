// Shopifly › Online Store: current theme (live preview, Customize), store speed, theme
// library (publish / preview), the Theme Store (buy premium themes) and brand Preferences.
import { useMemo, useState } from 'react'
import { Eye, Gauge, Globe, LayoutTemplate, Palette, Store } from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import { act, getGS, useGS } from '../../../../core/store'
import { openSite, usePauseWhileMounted } from '../../../../core/ui'
import { THEMES, themeDef, type ThemeDef } from '../../../../data/themes'
import { appDef } from '../../../../data/apps'
import { buyTheme, canUseTheme, effectiveLoadTime, updateStoreSettings } from '../../../../sim/store'
import {
  Badge, BlockStack, Box, Button, Card, ContextualSaveBar, Icon, InlineGrid, InlineStack, Layout, Modal, Page, ProgressBar, Tabs, Text,
} from '../../../kit/polaris'
import { LivePreview } from '../merch/LivePreview'
import { ThemeThumb } from '../merch/ThemeThumb'
import { PresetSwatch, publishThemeWithDefaults, ThemeSettingsForm, themeDraftValid, themeKey, type ThemeDraft } from '../merch/ThemeSettingsForm'
import { appShortName, useFlash } from '../merch/shared'
import { withOverrides } from '../../storefront'
import '../merch/merch.css'

/** Shopify-style speed score (0–100) from mobile load time. */
export function speedScore(loadTime: number): number {
  return Math.max(5, Math.min(100, Math.round(100 - Math.max(0, loadTime - 1.2) * 25)))
}

export default function OnlineStore({ params, navigate }: ShopiflyPageProps) {
  const tab = params[0] === 'preferences' ? 1 : 0
  return (
    <div className="sf-mx-page">
      <Page title="Online Store" secondaryActions={[{ content: 'View your store', icon: Eye, onAction: () => openSite('storefront', '') }]}>
        <BlockStack gap="400">
          <Tabs
            tabs={[{ id: 'themes', content: 'Themes' }, { id: 'preferences', content: 'Preferences' }]}
            selected={tab}
            onSelect={i => navigate(i === 1 ? 'online-store/preferences' : 'online-store')}
          />
          {tab === 0 ? <Themes navigate={navigate} /> : <Preferences navigate={navigate} />}
        </BlockStack>
      </Page>
    </div>
  )
}

function Themes({ navigate }: { navigate: (p: string) => void }) {
  const s = useGS(st => st)
  const st = s.store
  const current = themeDef(st.theme.id)
  const [detail, setDetail] = useState<ThemeDef | null>(null)
  const owned = THEMES.filter(t => canUseTheme(s, t.id) && t.id !== current.id)
  const active = st.products.filter(p => p.status === 'active')
  const sample = active[0] ?? st.products[0] ?? null
  const loadTime = sample ? effectiveLoadTime(s, sample) : current.loadTime
  const score = speedScore(loadTime)
  const thumbImg = sample?.media[0]?.src ?? null
  const heavyApps = st.apps.map(a => appDef(a.appId)).filter((a): a is NonNullable<typeof a> => !!a && a.loadTime > 0)

  // publishTheme / buyTheme raise their own store notifications (success and declines)
  const publish = (id: string) => act(g => { publishThemeWithDefaults(g, id) })
  const buy = (t: ThemeDef) => {
    act(g => { buyTheme(g, t.id) })
    setDetail(null)
  }

  return (
    <BlockStack gap="400">
      <Card padding="0">
        <div className="sf-mx-current">
          <div className="sf-mx-current-shots">
            <LivePreview s={s} layoutWidth={1200} width={420} height={262} productId={null} />
            <div className="sf-mx-current-phone">
              <LivePreview s={s} layoutWidth={390} width={120} height={240} productId={sample?.id ?? null} />
            </div>
          </div>
          <div className="sf-mx-current-info">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">{current.name}</Text>
              <Badge tone="success">Current theme</Badge>
            </InlineStack>
            <Text as="p" tone="subdued" variant="bodySm">Version {current.version} · by {current.developer}</Text>
            <Text as="p">{current.tagline}</Text>
            <InlineStack gap="200">
              <Button variant="primary" icon={LayoutTemplate} onClick={() => navigate('online-store/editor')}>Customize</Button>
              <Button icon={Eye} onClick={() => openSite('storefront', '')}>Preview</Button>
            </InlineStack>
          </div>
        </div>
      </Card>

      <Card title={<InlineStack gap="150" blockAlign="center"><Icon source={Gauge} size={18} /><span>Online store speed</span></InlineStack>}>
        <BlockStack gap="300">
          <InlineStack gap="400" blockAlign="center">
            <Text as="p" variant="heading2xl">{score}</Text>
            <BlockStack gap="050">
              <Text as="p" fontWeight="semibold">{score >= 70 ? 'Faster than most similar stores' : score >= 50 ? 'About as fast as similar stores' : 'Slower than most similar stores'}</Text>
              <Text as="p" tone="subdued" variant="bodySm">Product page loads in about {loadTime.toFixed(1)}s on a phone{sample ? ` (${sample.title.slice(0, 40)})` : ''}</Text>
            </BlockStack>
          </InlineStack>
          <ProgressBar progress={score} size="small" tone={score >= 70 ? 'success' : score >= 50 ? 'warning' : 'critical'} />
          <Text as="p" tone="subdued" variant="bodySm">
            Your theme, the apps that add code to your storefront and heavy page sections all affect speed.
            {heavyApps.length > 0 && ` Apps loading on your storefront: ${heavyApps.map(a => appShortName(a.name)).join(', ')}.`}
          </Text>
        </BlockStack>
      </Card>

      <Card title="Theme library">
        {owned.length === 0 ? (
          <Text as="p" tone="subdued">Themes you add or buy appear here so you can try them before publishing.</Text>
        ) : (
          <div className="sf-mx-themelib">
            {owned.map(t => (
              <div key={t.id} className="sf-mx-themelib-row">
                <div className="sf-mx-themelib-thumb"><ThemeThumb theme={t} image={thumbImg} /></div>
                <BlockStack gap="050">
                  <Text as="p" fontWeight="semibold">{t.name}</Text>
                  <Text as="p" tone="subdued" variant="bodySm">{t.price === 0 ? 'Free theme' : 'Purchased'} · Version {t.version}</Text>
                </BlockStack>
                <InlineStack gap="200">
                  <Button size="slim" onClick={() => navigate(`online-store/editor/preview/${t.id}`)}>Preview</Button>
                  <Button size="slim" variant="primary" onClick={() => publish(t.id)}>Publish</Button>
                </InlineStack>
              </div>
            ))}
          </div>
        )}
      </Card>

      <BlockStack gap="300">
        <Text as="h2" variant="headingLg">Shopifly Theme Store</Text>
        <div className="sf-mx-themegrid">
          {THEMES.map(t => {
            const have = canUseTheme(s, t.id)
            return (
              <button key={t.id} type="button" className="sf-mx-themecard" onClick={() => setDetail(t)}>
                <ThemeThumb theme={t} image={thumbImg} />
                <div className="sf-mx-themecard-body">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" fontWeight="semibold">{t.name}</Text>
                    <Text as="span" fontWeight="semibold">{t.price === 0 ? 'Free' : `$${t.price} USD`}</Text>
                  </InlineStack>
                  <Text as="p" tone="subdued" variant="bodySm">by {t.developer} · {t.positivePct}% positive ({t.reviews.toLocaleString('en-US')})</Text>
                  <p className="sf-mx-appcard-tag">{t.tagline}</p>
                  <InlineStack gap="100">
                    {t.id === current.id ? <Badge tone="success">Current</Badge> : have ? <Badge tone="info">In library</Badge> : null}
                    {t.industries.slice(0, 2).map(i => <Badge key={i}>{i}</Badge>)}
                  </InlineStack>
                </div>
              </button>
            )
          })}
        </div>
      </BlockStack>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        size="large"
        primaryAction={detail ? (
          detail.id === current.id
            ? { content: 'Customize', onAction: () => navigate('online-store/editor') }
            : canUseTheme(s, detail.id)
              ? { content: 'Publish', onAction: () => { publish(detail.id); setDetail(null) } }
              : { content: `Buy theme · $${detail.price}`, onAction: () => buy(detail) }
        ) : undefined}
        secondaryActions={detail && detail.id !== current.id ? [{ content: 'Try theme', onAction: () => navigate(`online-store/editor/preview/${detail.id}`) }] : []}
      >
        {detail && (
          <Modal.Section>
            <Layout>
              <Layout.Section>
                <BlockStack gap="400">
                  <div className="sf-mx-themedetail-shots">
                    <ThemeThumb theme={detail} image={thumbImg} />
                    <div className="sf-mx-themedetail-phone"><ThemeThumb theme={detail} device="mobile" image={thumbImg} /></div>
                  </div>
                  <Text as="p">{detail.description}</Text>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Styles</Text>
                    <div className="sf-mx-presets">
                      {detail.presets.map(p => <PresetSwatch key={p.name} label={p.name} bg={p.background} primary={p.primaryColor} accent={p.accent} />)}
                    </div>
                  </BlockStack>
                </BlockStack>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <BlockStack gap="300">
                  <Text as="p" variant="headingLg">{detail.price === 0 ? 'Free' : `$${detail.price} USD`}</Text>
                  {detail.price > 0 && <Text as="p" tone="subdued" variant="bodySm">One-time purchase, free updates. Charged to your card.</Text>}
                  <Text as="p" tone="subdued" variant="bodySm">{detail.positivePct}% positive · {detail.reviews.toLocaleString('en-US')} reviews</Text>
                  <Text as="h3" variant="headingSm">Features</Text>
                  <ul className="sf-mx-bullets">{detail.features.map(f => <li key={f}>{f}</li>)}</ul>
                  <Text as="h3" variant="headingSm">Best for</Text>
                  <InlineStack gap="100">{detail.industries.map(i => <Badge key={i}>{i}</Badge>)}</InlineStack>
                  <Text as="p" tone="subdued" variant="bodySm">Built for {detail.catalogSize} catalogs · by {detail.developer}</Text>
                </BlockStack>
              </Layout.Section>
            </Layout>
          </Modal.Section>
        )}
      </Modal>
    </BlockStack>
  )
}

function Preferences({ navigate }: { navigate: (p: string) => void }) {
  usePauseWhileMounted('shopifly-store-preferences')
  const s = useGS(st => st)
  const st = s.store
  const [draft, setDraft] = useState<ThemeDraft>(st.theme)
  const [flash, showFlash] = useFlash()
  const dirty = themeKey(draft) !== themeKey(st.theme)
  const err = themeDraftValid(draft)
  const previewState = useMemo(() => withOverrides(s, { theme: draft }), [s, draft])
  const sample = st.products.find(p => p.status === 'active') ?? st.products[0] ?? null
  const save = () => {
    if (err) { showFlash(err, 'critical'); return }
    act(g => updateStoreSettings(g, { theme: draft }))
    setDraft(getGS().store.theme)
    showFlash('Preferences saved')
  }
  return (
    <>
      <ContextualSaveBar visible={dirty} message="Unsaved changes" saveAction={{ onAction: save }} discardAction={{ onAction: () => setDraft(st.theme) }} />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card title={<InlineStack gap="150" blockAlign="center"><Icon source={Palette} size={18} /><span>Brand</span></InlineStack>}>
              <ThemeSettingsForm theme={draft} onChange={setDraft} storeState={st} />
            </Card>
          </BlockStack>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card title="Preview">
              <BlockStack gap="200">
                <Box borderRadius="200" borderColor="border" borderWidth={1} style={{ overflow: 'hidden' }}>
                  <LivePreview s={previewState} layoutWidth={390} width={240} height={420} productId={sample?.id ?? null} />
                </Box>
                <Text as="p" tone="subdued" variant="bodySm">{themeDef(st.theme.id).name} theme · mobile</Text>
              </BlockStack>
            </Card>
            <Card title="Store">
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center"><Icon source={Store} size={18} tone="subdued" /><Text as="span">{st.name}</Text></InlineStack>
                <InlineStack gap="200" blockAlign="center"><Icon source={Globe} size={18} tone="subdued" /><Text as="span">{st.customDomain ?? st.subdomain}</Text></InlineStack>
                <InlineGrid columns={2} gap="200">
                  <Button onClick={() => navigate('settings/general')}>Store details</Button>
                  <Button onClick={() => navigate('settings/domains')}>Domains</Button>
                </InlineGrid>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
      {flash}
    </>
  )
}
