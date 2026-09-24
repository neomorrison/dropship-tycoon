// Product page sections: the section catalog (with app/theme locks), an "Add section"
// list, and the product editor card that toggles, orders and configures sections.
import { useState } from 'react'
import {
  ArrowDown, ArrowUp, BadgeCheck, Columns2, Eye, EyeOff, Flame, HelpCircle, Images, Layers, LayoutTemplate, ListOrdered, Lock,
  Newspaper, PackageCheck, PanelBottom, PenLine, Plus, Ruler, Settings2, ShieldCheck, Sparkles, Star, Timer, Trash2, Truck,
  type LucideIcon,
} from 'lucide-react'
import type { GameState, PageSection, SectionId, StoreProduct } from '../../../../core/types'
import { SECTIONS, sectionDef, type SectionCategory } from '../../../../data/sections'
import { appDef } from '../../../../data/apps'
import { themeDef } from '../../../../data/themes'
import { sectionAvailability } from '../../../../sim/store'
import { openSite } from '../../../../core/ui'
import { Badge, BlockStack, Button, Card, InlineStack, Modal, Text, Tooltip } from '../../../kit/polaris'
import { SectionSettingsEditor, type SettingsCtx } from './SectionSettings'
import { addSection, canMoveSection, moveSection, removeSection, setSectionSettings, toggleSection } from './sectionOps'
import { appShortName } from './shared'
import { SECTION_ZONE, type SectionZone } from '../../storefront'

/** Top-to-bottom order of the page zones (same order the theme editor's section tree uses). */
const ZONE_ORDER: SectionZone[] = ['offer', 'variant', 'assure', 'main', 'overlay']

export const SECTION_ICONS: Record<string, LucideIcon> = {
  Star, ShieldCheck, HelpCircle, Truck, BadgeCheck, Layers, PanelBottom, Timer, Columns2, Newspaper, Ruler, Sparkles, Images, Flame,
  PackageCheck, ListOrdered, PenLine,
}
export const sectionIcon = (id: SectionId): LucideIcon => SECTION_ICONS[sectionDef(id).icon] ?? Sparkles

export const CATEGORY_LABEL: Record<SectionCategory, string> = {
  social_proof: 'Social proof', trust: 'Trust', offer: 'Offers', urgency: 'Urgency', info: 'Information', layout: 'Layout',
}
const CATEGORY_ORDER: SectionCategory[] = ['social_proof', 'trust', 'offer', 'info', 'layout', 'urgency']

/** Where to go to unlock a locked section. */
export function unlockAction(s: GameState, id: SectionId, navigate: (path: string) => void): { label: string; go: () => void } | null {
  const req = sectionDef(id).requires
  if (!req) return null
  if (req.apps?.length) {
    const a = appDef(req.apps[0])
    return a ? { label: `Get ${appShortName(a.name)}`, go: () => navigate(`apps/${a.id}`) } : null
  }
  if (req.ugc) return { label: 'Order UGC', go: () => openSite('studio', '') }
  if (req.themes?.length) return { label: 'Browse themes', go: () => navigate('online-store') }
  return null
}

/** Catalog of sections that can be added, grouped by category. */
export function AddSectionList({
  s, product, sections, onAdd, navigate,
}: {
  s: GameState
  product: StoreProduct | null
  sections: PageSection[]
  onAdd: (id: SectionId) => void
  navigate: (path: string) => void
}) {
  const present = new Set(sections.map(x => x.id))
  const th = themeDef(s.store.theme.id)
  return (
    <div className="sf-mx-addlist">
      {CATEGORY_ORDER.map(cat => {
        const defs = SECTIONS.filter(d => d.category === cat && !present.has(d.id))
        if (!defs.length) return null
        return (
          <div key={cat} className="sf-mx-addgroup">
            <p className="sf-mx-addgroup-h">{CATEGORY_LABEL[cat]}</p>
            {defs.map(d => {
              const av = sectionAvailability(s, product, d.id)
              const I = sectionIcon(d.id)
              const unlock = av.ok ? null : unlockAction(s, d.id, navigate)
              const builtIn = (d.id === 'sticky_atc' && th.builtIn.stickyAtc) || (d.id === 'trust_badges' && th.builtIn.trustBadges)
              return (
                <div key={d.id} className={`sf-mx-additem${av.ok ? '' : ' is-locked'}`}>
                  <span className="sf-mx-additem-icon"><I size={16} /></span>
                  <div className="sf-mx-additem-text">
                    <Text as="p" fontWeight="medium">{d.name}{builtIn && <span className="sf-mx-builtin"> · built into {th.name}</span>}</Text>
                    <Text as="p" tone="subdued" variant="bodySm">{av.ok ? d.description : av.reason}</Text>
                  </div>
                  {av.ok ? (
                    <Tooltip content={d.cro} width="wide">
                      <Button size="slim" icon={Plus} onClick={() => onAdd(d.id)}>Add</Button>
                    </Tooltip>
                  ) : unlock ? (
                    <Button size="slim" variant="plain" icon={Lock} onClick={unlock.go}>{unlock.label}</Button>
                  ) : (
                    <Lock size={14} />
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/** Product editor card: sections on this product's page (draft), with settings modal. */
export function SectionsCard({
  s, product, sections, onChange, ctx, navigate, onOpenEditor,
}: {
  s: GameState
  product: StoreProduct
  sections: PageSection[]
  onChange: (sections: PageSection[]) => void
  ctx: SettingsCtx
  navigate: (path: string) => void
  onOpenEditor: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<SectionId | null>(null)
  const th = themeDef(s.store.theme.id)
  const editSec = editing ? sections.find(x => x.id === editing) : undefined
  const builtIns: string[] = []
  if (th.builtIn.stickyAtc && !sections.some(x => x.id === 'sticky_atc' && x.enabled)) builtIns.push('Sticky add to cart')
  if (th.builtIn.trustBadges && !sections.some(x => x.id === 'trust_badges' && x.enabled)) builtIns.push('Trust badges')
  return (
    <Card
      title="Product page sections"
      actions={<Button variant="plain" icon={LayoutTemplate} onClick={onOpenEditor}>Customize in theme editor</Button>}
    >
      <BlockStack gap="300">
        {sections.length === 0 ? (
          <Text as="p" tone="subdued">This page only shows the basics: images, title, price, buy buttons and description.</Text>
        ) : (
          <div className="sf-mx-seclist">
            {ZONE_ORDER.flatMap(z => sections.filter(x => SECTION_ZONE[x.id] === z)).map(sec => {
              const d = sectionDef(sec.id)
              const av = sectionAvailability(s, product, sec.id)
              const I = sectionIcon(sec.id)
              return (
                <div key={sec.id} className={`sf-mx-secrow${sec.enabled ? '' : ' is-off'}`}>
                  <span className="sf-mx-additem-icon"><I size={16} /></span>
                  <div className="sf-mx-secrow-text">
                    <Text as="p" fontWeight="medium">{d.name}</Text>
                    {!av.ok ? (
                      <Text as="p" tone="critical" variant="bodySm"><EyeOff size={11} /> Hidden on your store: {av.reason}</Text>
                    ) : !sec.enabled ? (
                      <Text as="p" tone="subdued" variant="bodySm">Hidden</Text>
                    ) : null}
                  </div>
                  <InlineStack gap="050" wrap={false}>
                    <Button variant="tertiary" size="micro" icon={ArrowUp} accessibilityLabel="Move up" disabled={!canMoveSection(sections, sec.id, -1)} onClick={() => onChange(moveSection(sections, sec.id, -1))} />
                    <Button variant="tertiary" size="micro" icon={ArrowDown} accessibilityLabel="Move down" disabled={!canMoveSection(sections, sec.id, 1)} onClick={() => onChange(moveSection(sections, sec.id, 1))} />
                    <Button variant="tertiary" size="micro" icon={Settings2} accessibilityLabel={`Edit ${d.name}`} onClick={() => setEditing(sec.id)} />
                    <Button variant="tertiary" size="micro" icon={sec.enabled ? EyeOff : Eye} accessibilityLabel={sec.enabled ? 'Hide section' : 'Show section'} onClick={() => onChange(toggleSection(sections, sec.id, !sec.enabled))}>
                      {sec.enabled ? 'Hide' : 'Show'}
                    </Button>
                    <Button variant="tertiary" size="micro" tone="critical" icon={Trash2} accessibilityLabel="Remove section" onClick={() => onChange(removeSection(sections, sec.id))} />
                  </InlineStack>
                </div>
              )
            })}
          </div>
        )}
        {builtIns.length > 0 && (
          <InlineStack gap="150" blockAlign="center">
            <Text as="span" tone="subdued" variant="bodySm">Built into {th.name}:</Text>
            {builtIns.map((b, i) => <Badge key={i} tone="info">{b}</Badge>)}
          </InlineStack>
        )}
        <div>
          <Button icon={Plus} onClick={() => setAdding(true)}>Add section</Button>
        </div>
      </BlockStack>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add section" size="medium" secondaryActions={[{ content: 'Close', onAction: () => setAdding(false) }]}>
        <Modal.Section>
          <AddSectionList
            s={s}
            product={product}
            sections={sections}
            navigate={navigate}
            onAdd={id => {
              onChange(addSection(sections, id))
              setAdding(false)
              setEditing(id)
            }}
          />
        </Modal.Section>
      </Modal>

      <Modal
        open={!!editSec}
        onClose={() => setEditing(null)}
        title={editSec ? sectionDef(editSec.id).name : ''}
        size="medium"
        primaryAction={{ content: 'Done', onAction: () => setEditing(null) }}
      >
        {editSec && (
          <>
            <Modal.Section subdued>
              <Text as="p" tone="subdued">{sectionDef(editSec.id).cro}</Text>
            </Modal.Section>
            <Modal.Section>
              <SectionSettingsEditor
                id={editSec.id}
                settings={editSec.settings}
                ctx={ctx}
                onChange={st => onChange(setSectionSettings(sections, editSec.id, st))}
              />
            </Modal.Section>
          </>
        )}
      </Modal>
    </Card>
  )
}
