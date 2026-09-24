// Product editor draft model: form-friendly strings for numeric inputs, conversion to a
// StoreProduct (for live grading / previews) and to the patch sent to updateProduct().
import type { MediaItem, PageSection, StoreProduct } from '../../../../core/types'

export type WeightUnit = 'kg' | 'g' | 'lb' | 'oz'
export const WEIGHT_UNITS: { label: string; value: WeightUnit }[] = [
  { label: 'kg', value: 'kg' },
  { label: 'g', value: 'g' },
  { label: 'lb', value: 'lb' },
  { label: 'oz', value: 'oz' },
]
const PER_KG: Record<WeightUnit, number> = { kg: 1, g: 1000, lb: 2.20462, oz: 35.274 }

export interface ProductDraft {
  title: string
  descriptionHtml: string
  media: MediaItem[]
  price: string
  compareAtPrice: string
  costPerItem: string
  trackInventory: boolean
  weight: string
  weightUnit: WeightUnit
  variants: { name: string; values: string[] }[]
  seo: { title: string; description: string; handle: string }
  productType: string
  vendor: string
  tags: string[]
  status: StoreProduct['status']
  sections: PageSection[]
}

/** 12.5 → "12.50", 3 → "3.00"; empty for null */
export const moneyInput = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : n.toFixed(2))
const trimNum = (n: number, digits: number) => String(Number(n.toFixed(digits)))

export function parseNum(v: string): number | null {
  const t = v.replace(/[$,\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function toDraft(p: StoreProduct, unit: WeightUnit = 'kg'): ProductDraft {
  return {
    title: p.title,
    descriptionHtml: p.descriptionHtml,
    media: p.media.map(m => ({ ...m })),
    price: moneyInput(p.price),
    compareAtPrice: moneyInput(p.compareAtPrice),
    costPerItem: moneyInput(p.costPerItem),
    trackInventory: p.trackInventory,
    weight: trimNum(p.weightKg * PER_KG[unit], unit === 'g' ? 0 : 3),
    weightUnit: unit,
    variants: p.variants.map(v => ({ name: v.name, values: [...v.values] })),
    seo: { ...p.seo },
    productType: p.productType,
    vendor: p.vendor,
    tags: [...p.tags],
    status: p.status,
    sections: p.sections.map(s => ({ ...s, settings: s.settings ? JSON.parse(JSON.stringify(s.settings)) : undefined })),
  }
}

export function draftWeightKg(d: ProductDraft): number {
  const n = parseNum(d.weight)
  return n == null ? 0 : Math.max(0, n / PER_KG[d.weightUnit])
}

/** Convert the weight field to another unit (keeps the same physical weight). */
export function convertWeight(d: ProductDraft, unit: WeightUnit): ProductDraft {
  const kg = draftWeightKg(d)
  return { ...d, weightUnit: unit, weight: trimNum(kg * PER_KG[unit], unit === 'g' ? 0 : 3) }
}

const cleanVariants = (vs: ProductDraft['variants']) =>
  vs.map(v => ({ name: v.name.trim(), values: v.values.map(x => x.trim()).filter(Boolean) })).filter(v => v.name && v.values.length)

/** Patch for updateProduct() (status is applied separately with setProductStatus). */
export function draftPatch(d: ProductDraft): Partial<StoreProduct> {
  const price = parseNum(d.price)
  const cap = parseNum(d.compareAtPrice)
  const cost = parseNum(d.costPerItem)
  return {
    title: d.title,
    descriptionHtml: d.descriptionHtml,
    media: d.media,
    price: price ?? 0,
    compareAtPrice: cap && cap > 0 ? cap : null,
    costPerItem: cost ?? 0,
    trackInventory: d.trackInventory,
    weightKg: Math.round(draftWeightKg(d) * 1000) / 1000,
    variants: cleanVariants(d.variants),
    seo: { title: d.seo.title.trim(), description: d.seo.description.trim(), handle: slugHandle(d.seo.handle) },
    productType: d.productType.trim(),
    vendor: d.vendor.trim(),
    tags: d.tags,
    sections: d.sections,
  }
}

/** The product as it would be after saving (for live grading and the preview). */
export function applyDraft(p: StoreProduct, d: ProductDraft): StoreProduct {
  const patch = draftPatch(d)
  return { ...p, ...patch, status: d.status, title: (patch.title ?? '').replace(/\s+/g, ' ').trim() }
}

/** Stable key for dirty checks (ignores the display unit of the weight field). */
export function draftKey(d: ProductDraft): string {
  const { weightUnit: _u, weight: _w, ...rest } = d
  return JSON.stringify({ ...rest, weightKg: Math.round(draftWeightKg(d) * 1000) / 1000, price: parseNum(d.price), compareAtPrice: parseNum(d.compareAtPrice), costPerItem: parseNum(d.costPerItem) })
}

export function slugHandle(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
