// Pure helpers for editing a product's PageSection list (product editor + theme editor).
import type { PageSection, SectionId } from '../../../../core/types'
import { sectionDef } from '../../../../data/sections'
import { SECTION_ZONE } from '../../storefront'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function hasSection(sections: PageSection[], id: SectionId) {
  return sections.some(s => s.id === id)
}

/** Add (or re-enable) a section with its default settings. */
export function addSection(sections: PageSection[], id: SectionId, settings?: Record<string, unknown>): PageSection[] {
  if (hasSection(sections, id)) return sections.map(s => (s.id === id ? { ...s, enabled: true, settings: settings ?? s.settings } : s))
  return [...sections, { id, enabled: true, settings: settings ?? clone(sectionDef(id).defaultSettings as unknown as Record<string, unknown>) }]
}
export const removeSection = (sections: PageSection[], id: SectionId) => sections.filter(s => s.id !== id)
export const toggleSection = (sections: PageSection[], id: SectionId, enabled: boolean) => sections.map(s => (s.id === id ? { ...s, enabled } : s))
export const setSectionSettings = (sections: PageSection[], id: SectionId, settings: Record<string, unknown>) =>
  sections.map(s => (s.id === id ? { ...s, settings } : s))

/** Move a section one step up/down among the sections that render in the same page zone. */
export function moveSection(sections: PageSection[], id: SectionId, dir: -1 | 1): PageSection[] {
  const zone = SECTION_ZONE[id]
  const idx = sections.findIndex(s => s.id === id)
  if (idx < 0) return sections
  let j = idx + dir
  while (j >= 0 && j < sections.length && SECTION_ZONE[sections[j].id] !== zone) j += dir
  if (j < 0 || j >= sections.length) return sections
  const next = [...sections]
  ;[next[idx], next[j]] = [next[j], next[idx]]
  return next
}

/** Drag & drop: put `fromId` where `toId` is (same zone only). */
export function reorderSection(sections: PageSection[], fromId: SectionId, toId: SectionId): PageSection[] {
  if (fromId === toId || SECTION_ZONE[fromId] !== SECTION_ZONE[toId]) return sections
  const from = sections.findIndex(s => s.id === fromId)
  const to = sections.findIndex(s => s.id === toId)
  if (from < 0 || to < 0) return sections
  const next = [...sections]
  const [m] = next.splice(from, 1)
  next.splice(to, 0, m)
  return next
}

/** Shipping section helper: set the promised delivery window (adds/enables the section). */
export function setDeliveryWindow(sections: PageSection[], minDays: number | null, maxDays: number | null): PageSection[] {
  const base = addSection(sections, 'shipping_info')
  return base.map(s => (s.id === 'shipping_info' ? { ...s, settings: { ...(s.settings ?? {}), minDays, maxDays } } : s))
}
