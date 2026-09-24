// Shopifly theme editor ("Customize"): section tree for the product template on the left,
// live storefront preview in the middle (desktop / mobile, click a section to select it),
// section or theme settings on the right. Routes:
//   online-store/editor                     → first product (or home)
//   online-store/editor/product/<id>        → that product's page
//   online-store/editor/home                → home page
//   online-store/editor/preview/<themeId>…  → try an unpublished theme
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  AlertTriangle, ArrowLeft, ChevronDown, Eye, EyeOff, GripVertical, LayoutTemplate, Megaphone, Monitor, Palette, PanelBottom,
  PanelTop, Plus, ShoppingBag, Smartphone, Trash2, Type,
} from 'lucide-react'
import type { ShopiflyPageProps } from '../route'
import type { PageSection, SectionId, StoreProduct } from '../../../../core/types'
import { act, getGS, useGS } from '../../../../core/store'
import { usePauseWhileMounted } from '../../../../core/ui'
import { money } from '../../../../core/format'
import { sectionDef } from '../../../../data/sections'
import { themeDef } from '../../../../data/themes'
import { buyTheme, canUseTheme, gradePage, realDeliveryWindow, sectionAvailability, updateProduct, updateStoreSettings } from '../../../../sim/store'
import { Badge, Banner, BlockStack, Button, ButtonGroup, InlineStack, Modal, Select, Text, Tooltip } from '../../../kit/polaris'
import { useElementWidth } from '../../../kit/common'
import {
  buildProductModel, buildStoreView, cardInfo, HomePage, SECTION_ZONE, StoreChrome, StoreProductPage, withOverrides, type EditorBridge,
} from '../../storefront'
import { SectionSettingsEditor } from '../merch/SectionSettings'
import { AddSectionList, sectionIcon, unlockAction } from '../merch/SectionsCard'
import { addSection, removeSection, reorderSection, setSectionSettings, toggleSection } from '../merch/sectionOps'
import { publishThemeWithDefaults, ThemeSettingsForm, themeDraftValid, themeKey, type ThemeDraft } from '../merch/ThemeSettingsForm'
import { gradeColor } from '../merch/GradeCard'
import { useFillHeight, useFlash, useLeaveGuard } from '../merch/shared'
import '../merch/merch.css'

type Page = { kind: 'product'; id: string } | { kind: 'home' }

function parseParams(params: string[]) {
  let previewTheme: string | null = null
  let page: Page | null = null
  for (let i = 0; i < params.length; i++) {
    if (params[i] === 'preview' && params[i + 1]) previewTheme = params[++i]
    else if (params[i] === 'product' && params[i + 1]) page = { kind: 'product', id: params[++i] }
    else if (params[i] === 'home') page = { kind: 'home' }
  }
  return { previewTheme, page }
}

export default function ThemeEditor({ params, navigate }: ShopiflyPageProps) {
  usePauseWhileMounted('shopifly-theme-editor')
  const s = useGS(st => st)
  const st = s.store
  const parsed = useMemo(() => parseParams(params), [params])
  const previewTheme = parsed.previewTheme && parsed.previewTheme !== st.theme.id && themeDef(parsed.previewTheme).id === parsed.previewTheme ? parsed.previewTheme : null
  const editingThemeId = previewTheme ?? st.theme.id
  const theme = themeDef(editingThemeId)

  const pickPage = (): Page => {
    const want = parsed.page
    if (want?.kind === 'home') return want
    if (want?.kind === 'product' && st.products.some(p => p.id === want.id)) return want
    const p = st.products.find(x => x.status === 'active') ?? st.products[0]
    return p ? { kind: 'product', id: p.id } : { kind: 'home' }
  }
  const [page, setPage] = useState<Page>(pickPage)
  // follow deep links (e.g. "Customize" from the storefront) while the editor stays open
  const paramKey = params.join('/')
  useEffect(() => {
    if (parsed.page) setPage(pickPage())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramKey])
  const [drafts, setDrafts] = useState<Record<string, PageSection[]>>({})
  const [themeDraft, setThemeDraft] = useState<ThemeDraft>(st.theme)
  // a newly published theme starts from its own settings
  useEffect(() => {
    setThemeDraft(st.theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.theme.id])
  const [selected, setSelected] = useState<string | null>(null)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [addOpen, setAddOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(true)
  const [pane, setPane] = useState<'edit' | 'preview'>('edit')
  const [dragId, setDragId] = useState<SectionId | null>(null)
  const [flash, showFlash] = useFlash()
  const rootRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const height = useFillHeight(rootRef, 560)
  const [measureRef, width] = useElementWidth<HTMLDivElement>()
  const narrow = width > 0 && width < 980
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el
    measureRef(el)
  }, [measureRef])

  const product: StoreProduct | null = page.kind === 'product' ? st.products.find(p => p.id === page.id) ?? null : null
  const sections = product ? drafts[product.id] ?? product.sections : []
  const setSections = (next: PageSection[]) => {
    if (!product) return
    setDrafts(d => ({ ...d, [product.id]: next }))
  }
  // promisedDays is re-derived from the draft's shipping section (as updateProduct does on save)
  const draftProduct = useMemo(() => (product ? { ...product, sections, promisedDays: null } : null), [product, sections])
  const presetTheme = useMemo<ThemeDraft | null>(() => {
    if (!previewTheme) return null
    const pr = themeDef(previewTheme).presets[0]
    return { ...st.theme, id: previewTheme, primaryColor: pr.primaryColor, background: pr.background, accentColor: pr.accent, font: pr.font }
  }, [previewTheme, st.theme])
  const ps = useMemo(
    () => withOverrides(s, { product: draftProduct ?? undefined, theme: presetTheme ?? themeDraft, themeId: editingThemeId }),
    [s, draftProduct, presetTheme, themeDraft, editingThemeId],
  )
  const view = useMemo(() => buildStoreView(ps), [ps])
  const model = useMemo(() => (draftProduct ? buildProductModel(ps, draftProduct) : null), [ps, draftProduct])
  const cards = useMemo(() => view.products.map(p => cardInfo(ps, p)), [ps, view.products])
  const grade = useMemo(() => (draftProduct ? gradePage(ps, draftProduct) : null), [ps, draftProduct])

  const changedProducts = Object.entries(drafts).filter(([id, secs]) => {
    const p = st.products.find(x => x.id === id)
    return p && JSON.stringify(p.sections) !== JSON.stringify(secs)
  })
  const themeDirty = !previewTheme && themeKey(themeDraft) !== themeKey(st.theme)
  const dirty = changedProducts.length > 0 || themeDirty
  const { guard, modal: leaveModal } = useLeaveGuard(dirty)

  // scroll the preview pane (only the pane: scrollIntoView would also scroll the admin tab and push
  // the editor's top bar out of view) to the selected block
  useEffect(() => {
    const box = previewRef.current
    if (!selected || !box) return
    const el = box.querySelector<HTMLElement>(`[data-st-block="${selected}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    const top = box.scrollTop + (r.top - b.top) - Math.max(12, (b.height - r.height) / 2)
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [selected, page, device])
  // a different page starts at its top
  const pageKey = page.kind === 'home' ? 'home' : page.id
  useEffect(() => {
    previewRef.current?.scrollTo({ top: 0 })
  }, [pageKey])

  const save = () => {
    const err = themeDirty ? themeDraftValid(themeDraft) : null
    if (err) { showFlash(err, 'critical'); return }
    act(g => {
      for (const [id, secs] of changedProducts) updateProduct(g, id, { sections: secs })
      if (themeDirty) updateStoreSettings(g, { theme: themeDraft })
    })
    setDrafts({})
    setThemeDraft(getGS().store.theme)
    showFlash('Saved')
  }
  const discard = () => {
    setDrafts({})
    setThemeDraft(st.theme)
  }

  const bridge: EditorBridge = { selected, onSelect: key => { setSelected(key); if (narrow) setPane('edit') } }
  const editorFrame = (id: string, label: string, node: ReactNode) => (
    <div className={`st-frame${selected === id ? ' is-selected' : ''}`} data-st-block={id} onClick={e => { e.stopPropagation(); bridge.onSelect(id) }}>
      {node}
      <span className="st-frame-label">{label}</span>
    </div>
  )

  // ---- sidebar rows ----
  const sectionRow = (sec: PageSection, nested = false) => {
    const d = sectionDef(sec.id)
    const I = sectionIcon(sec.id)
    const av = product ? sectionAvailability(ps, draftProduct, sec.id) : { ok: true }
    return (
      <div
        key={sec.id}
        className={`sf-mx-tree-row${nested ? ' is-nested' : ''}${selected === sec.id ? ' is-selected' : ''}${sec.enabled ? '' : ' is-hidden'}${dragId && dragId !== sec.id && SECTION_ZONE[dragId] === SECTION_ZONE[sec.id] ? ' is-droppable' : ''}`}
        draggable
        onDragStart={e => { setDragId(sec.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sec.id) }}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e: DragEvent) => { if (dragId && SECTION_ZONE[dragId] === SECTION_ZONE[sec.id]) e.preventDefault() }}
        onDrop={e => { e.preventDefault(); if (dragId) setSections(reorderSection(sections, dragId, sec.id)); setDragId(null) }}
        onClick={() => setSelected(sec.id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter') setSelected(sec.id) }}
      >
        <span className="sf-mx-tree-grip" aria-hidden><GripVertical size={14} /></span>
        <I size={15} />
        <span className="sf-mx-tree-label">{d.name}</span>
        {!av.ok && (
          <Tooltip content={`Hidden on your store: ${av.reason}`}><span className="sf-mx-tree-warn"><AlertTriangle size={14} /></span></Tooltip>
        )}
        <button
          type="button"
          className="sf-mx-tree-eye"
          aria-label={sec.enabled ? `Hide ${d.name}` : `Show ${d.name}`}
          onClick={e => { e.stopPropagation(); setSections(toggleSection(sections, sec.id, !sec.enabled)) }}
        >
          {sec.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>
    )
  }
  const fixedRow = (key: string, label: string, icon: ReactNode, extra?: ReactNode) => (
    <div key={key} className={`sf-mx-tree-row is-fixed${selected === key ? ' is-selected' : ''}`} onClick={() => setSelected(key)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSelected(key) }}>
      <span className="sf-mx-tree-grip" />
      {icon}
      <span className="sf-mx-tree-label">{label}</span>
      {extra}
    </div>
  )
  const staticRow = (label: string) => (
    <div key={label} className="sf-mx-tree-row is-nested is-static"><span className="sf-mx-tree-grip" /><span className="sf-mx-tree-dot" /><span className="sf-mx-tree-label">{label}</span></div>
  )
  const zone = (z: string) => sections.filter(x => SECTION_ZONE[x.id] === z)
  const announcementHidden = themeDraft.announcement === ''

  const sidebar = (
    <div className="sf-mx-te-sidebar">
      <div className="sf-mx-te-sidehead">
        <Text as="h2" variant="headingSm">{page.kind === 'home' ? 'Home page' : product ? 'Default product' : 'Product'}</Text>
        {grade && (
          <Tooltip content="Page grade with your unsaved changes">
            <span className="sf-mx-te-grade" style={{ color: gradeColor(grade.score) }}>Page grade {Math.round(grade.score)}</span>
          </Tooltip>
        )}
      </div>
      <div className="sf-mx-tree">
        <p className="sf-mx-tree-group">Header</p>
        {fixedRow('announcement', 'Announcement bar', <Megaphone size={15} />, (
          <button type="button" className="sf-mx-tree-eye" aria-label={announcementHidden ? 'Show announcement bar' : 'Hide announcement bar'}
            onClick={e => { e.stopPropagation(); if (!previewTheme) setThemeDraft(t => ({ ...t, announcement: announcementHidden ? undefined : '' })) }}>
            {announcementHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        ))}
        {fixedRow('header', 'Header', <PanelTop size={15} />)}

        <p className="sf-mx-tree-group">Template</p>
        {page.kind === 'home' ? (
          <>
            {fixedRow('banner', 'Image banner', <LayoutTemplate size={15} />)}
            {fixedRow('featured', 'Featured collection', <ShoppingBag size={15} />)}
            {fixedRow('perks', 'Multicolumn', <Type size={15} />)}
          </>
        ) : product ? (
          <>
            <div className={`sf-mx-tree-row is-fixed${selected === 'product-info' ? ' is-selected' : ''}`} onClick={() => setSelected('product-info')} role="button" tabIndex={0}>
              <button type="button" className="sf-mx-tree-caret" aria-label={infoOpen ? 'Collapse' : 'Expand'} onClick={e => { e.stopPropagation(); setInfoOpen(o => !o) }}>
                <ChevronDown size={14} style={{ transform: infoOpen ? 'none' : 'rotate(-90deg)' }} />
              </button>
              <ShoppingBag size={15} />
              <span className="sf-mx-tree-label">Product information</span>
            </div>
            {infoOpen && (
              <>
                {staticRow('Title')}
                {staticRow('Price')}
                {zone('offer').map(x => sectionRow(x, true))}
                {staticRow('Variant picker')}
                {zone('variant').map(x => sectionRow(x, true))}
                {staticRow('Quantity & buy buttons')}
                {zone('assure').map(x => sectionRow(x, true))}
                {staticRow('Description')}
              </>
            )}
            {zone('main').map(x => sectionRow(x))}
            {zone('overlay').map(x => sectionRow(x))}
            <button type="button" className="sf-mx-tree-add" onClick={() => setAddOpen(true)}><Plus size={15} /> Add section</button>
          </>
        ) : (
          <Text as="p" tone="subdued">Import a product to customize your product page.</Text>
        )}

        <p className="sf-mx-tree-group">Footer</p>
        {fixedRow('footer', 'Footer', <PanelBottom size={15} />)}
      </div>
    </div>
  )

  // ---- settings panel ----
  const selSection = sections.find(x => x.id === selected)
  let settings: ReactNode
  if (selSection && product) {
    const d = sectionDef(selSection.id)
    const av = sectionAvailability(ps, draftProduct, selSection.id)
    const unlock = av.ok ? null : unlockAction(ps, selSection.id, p => guard(() => navigate(p)))
    settings = (
      <BlockStack gap="400">
        <Text as="p" tone="subdued">{d.cro}</Text>
        {!av.ok && (
          <Banner tone="warning" inline action={unlock ? { content: unlock.label, onAction: unlock.go } : undefined}>
            Hidden on your store: {av.reason}
          </Banner>
        )}
        <SectionSettingsEditor
          id={selSection.id}
          settings={selSection.settings}
          onChange={v => setSections(setSectionSettings(sections, selSection.id, v))}
          ctx={{
            realWindow: realDeliveryWindow(ps, product.catalogId),
            creatives: model?.creatives.filter(c => c.producer !== 'supplier_edit').map(c => ({ id: c.id, name: c.name, producer: c.producer })) ?? [],
            storeName: view.logoText,
            freeOver: st.shipping.freeShipping ? null : st.shipping.freeOver,
            freeShipping: st.shipping.freeShipping,
          }}
        />
        <div className="sf-mx-te-remove">
          <Button variant="plain" tone="critical" icon={Trash2} onClick={() => { setSections(removeSection(sections, selSection.id)); setSelected(null) }}>Remove section</Button>
        </div>
      </BlockStack>
    )
  } else if (selected === 'announcement') {
    settings = <ThemeSettingsForm theme={themeDraft} onChange={setThemeDraft} storeState={st} sections={['announcement']} disabled={!!previewTheme} />
  } else if (selected === 'header') {
    settings = <ThemeSettingsForm theme={themeDraft} onChange={setThemeDraft} storeState={st} sections={['brand']} disabled={!!previewTheme} />
  } else if (selected === 'footer') {
    settings = (
      <BlockStack gap="300">
        <Text as="p">The footer links to your store policies and shows the payment methods you accept.</Text>
        <Button onClick={() => guard(() => navigate('settings/policies'))}>Edit policies</Button>
        <Button onClick={() => guard(() => navigate('settings/payments'))}>Payment methods</Button>
      </BlockStack>
    )
  } else if (selected === 'product-info' && product) {
    settings = (
      <BlockStack gap="300">
        <Text as="p">Title, price, variants, images and description come from the product itself.</Text>
        <Button onClick={() => guard(() => navigate(`products/${product.id}`))}>Edit product</Button>
        <Text as="p" tone="subdued" variant="bodySm">Add blocks like quantity breaks, trust badges or a delivery estimate with “Add section”; they appear in this column.</Text>
      </BlockStack>
    )
  } else if (selected === 'banner' || selected === 'featured' || selected === 'perks') {
    settings = <Text as="p" tone="subdued">This section fills itself from your active products and store settings. Most shoppers from your ads land on product pages, not here.</Text>
  } else {
    settings = (
      <BlockStack gap="300">
        {previewTheme && <Text as="p" tone="subdued">You&apos;re trying {theme.name} with its default style.</Text>}
        <ThemeSettingsForm theme={themeDraft} onChange={setThemeDraft} storeState={st} sections={['colors', 'type']} disabled={!!previewTheme} />
      </BlockStack>
    )
  }
  const settingsTitle = selSection ? sectionDef(selSection.id).name
    : selected === 'announcement' ? 'Announcement bar' : selected === 'header' ? 'Header' : selected === 'footer' ? 'Footer'
    : selected === 'product-info' ? 'Product information' : selected === 'banner' ? 'Image banner' : selected === 'featured' ? 'Featured collection'
    : selected === 'perks' ? 'Multicolumn' : 'Theme settings'
  const settingsPanel = (
    <div className="sf-mx-te-settings">
      <div className="sf-mx-te-sidehead">
        {narrow && selected && <Button variant="tertiary" size="slim" icon={ArrowLeft} accessibilityLabel="Back" onClick={() => setSelected(null)} />}
        <Text as="h2" variant="headingSm">{settingsTitle}</Text>
      </div>
      <div className="sf-mx-te-settings-body">{settings}</div>
    </div>
  )

  // ---- preview ----
  const preview = (
    <div className="sf-mx-te-preview" ref={previewRef}>
      <div className={`sf-mx-te-canvas${device === 'mobile' ? ' is-mobile' : ''}`}>
        <StoreChrome view={view} editor={bridge} mobile={device === 'mobile'}>
          {page.kind === 'product' && model ? (
            <StoreProductPage key={model.product.id} view={view} model={model} editor={bridge} />
          ) : (
            <HomePage view={view} cards={cards} editorFrame={editorFrame} />
          )}
        </StoreChrome>
      </div>
    </div>
  )

  const pageOptions = [
    { label: 'Home page', value: 'home' },
    ...st.products.filter(p => p.status !== 'archived').map(p => ({ label: `Product · ${p.title.slice(0, 48) || 'Untitled'}`, value: p.id })),
  ]
  const owned = canUseTheme(s, editingThemeId)

  return (
    <div className="sf-mx-te" ref={setRoot} style={{ height }}>
      <div className="sf-mx-te-top">
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          <Button variant="tertiary" icon={ArrowLeft} onClick={() => guard(() => navigate('online-store'))}>Exit</Button>
          <span className="sf-mx-te-theme">
            <Text as="span" fontWeight="semibold">{theme.name}</Text>
            {previewTheme ? <Badge tone="attention">Preview</Badge> : <Badge tone="success">Live</Badge>}
          </span>
        </InlineStack>
        <div className="sf-mx-te-pagesel">
          <Select label="Page" labelHidden options={pageOptions} value={page.kind === 'home' ? 'home' : page.id} onChange={v => { setPage(v === 'home' ? { kind: 'home' } : { kind: 'product', id: v }); setSelected(null) }} />
        </div>
        <InlineStack gap="200" blockAlign="center" wrap={false}>
          <ButtonGroup variant="segmented">
            <Button size="slim" icon={Monitor} pressed={device === 'desktop'} accessibilityLabel="Desktop" onClick={() => setDevice('desktop')} />
            <Button size="slim" icon={Smartphone} pressed={device === 'mobile'} accessibilityLabel="Mobile" onClick={() => setDevice('mobile')} />
          </ButtonGroup>
          <Button size="slim" icon={Palette} pressed={selected === null || selected === 'theme'} accessibilityLabel="Theme settings" onClick={() => setSelected('theme')} />
          {previewTheme && (owned ? (
            <Button size="slim" onClick={() => { if (dirty) save(); act(g => { publishThemeWithDefaults(g, previewTheme) }); navigate(page.kind === 'product' ? `online-store/editor/product/${page.id}` : 'online-store/editor/home') }}>Publish</Button>
          ) : (
            <Button size="slim" onClick={() => act(g => { buyTheme(g, previewTheme) })}>
              Buy · {money(theme.price, { cents: false })}
            </Button>
          ))}
          <Button size="slim" variant="primary" disabled={!dirty} onClick={save}>Save</Button>
        </InlineStack>
      </div>
      {narrow && (
        <div className="sf-mx-te-panes">
          <ButtonGroup variant="segmented" fullWidth>
            <Button size="slim" pressed={pane === 'edit'} onClick={() => setPane('edit')}>Sections</Button>
            <Button size="slim" pressed={pane === 'preview'} onClick={() => setPane('preview')}>Preview</Button>
          </ButtonGroup>
        </div>
      )}
      {dirty && (
        <div className="sf-mx-te-dirty">
          <Text as="span" variant="bodySm">Unsaved changes{changedProducts.length > 1 ? ` on ${changedProducts.length} product pages` : ''}</Text>
          <Button size="micro" variant="tertiary" onClick={discard}>Discard</Button>
        </div>
      )}
      <div className={`sf-mx-te-body${narrow ? ' is-narrow' : ''}`}>
        {narrow ? (
          pane === 'edit' ? (selected ? settingsPanel : sidebar) : preview
        ) : (
          <>
            {sidebar}
            {preview}
            {settingsPanel}
          </>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add section" size="medium" secondaryActions={[{ content: 'Close', onAction: () => setAddOpen(false) }]}>
        <Modal.Section>
          {product ? (
            <AddSectionList
              s={ps}
              product={draftProduct}
              sections={sections}
              navigate={p => { setAddOpen(false); guard(() => navigate(p)) }}
              onAdd={id => { setSections(addSection(sections, id)); setSelected(id); setAddOpen(false) }}
            />
          ) : (
            <Text as="p" tone="subdued">Select a product page first.</Text>
          )}
        </Modal.Section>
      </Modal>
      {leaveModal}
      {flash}
    </div>
  )
}
