// Storefront theme tokens: turns the published theme (data/themes) plus the merchant's
// brand settings (store.theme) into CSS variables for the st- storefront components.
import type { CSSProperties } from 'react'
import type { StoreState } from '../../../core/types'
import { themeDef, THEMES, type ThemeDef } from '../../../data/themes'

export type ThemeStyle = 'minimal' | 'soft' | 'editorial' | 'conversion' | 'promo' | 'luxe' | 'motion'

interface ThemeLook {
  style: ThemeStyle
  /** card / image corner radius (px) */
  radius: number
  /** button corner radius (px) */
  buttonRadius: number
  /** logo alignment in the header */
  logoAlign: 'left' | 'center'
  /** uppercase buttons / small caps labels */
  caps: boolean
  /** heading font override (serif themes) */
  headingFont?: string
}

const LOOKS: Record<string, ThemeLook> = {
  dawnish: { style: 'minimal', radius: 0, buttonRadius: 0, logoAlign: 'left', caps: false },
  sensed: { style: 'soft', radius: 18, buttonRadius: 40, logoAlign: 'center', caps: false },
  studioish: { style: 'editorial', radius: 0, buttonRadius: 0, logoAlign: 'center', caps: true, headingFont: 'Libre Baskerville' },
  shrined: { style: 'conversion', radius: 10, buttonRadius: 8, logoAlign: 'left', caps: false },
  impulsive: { style: 'promo', radius: 4, buttonRadius: 4, logoAlign: 'center', caps: true },
  prestigio: { style: 'luxe', radius: 0, buttonRadius: 0, logoAlign: 'center', caps: true, headingFont: 'Cormorant Garamond' },
  motionly: { style: 'motion', radius: 16, buttonRadius: 999, logoAlign: 'left', caps: false },
}

/** Font families the theme settings offer (all served by Google Fonts). */
export const FONT_OPTIONS = [
  'Assistant', 'Inter', 'DM Sans', 'Nunito Sans', 'Poppins', 'Archivo', 'Space Grotesk',
  'Playfair Display', 'Cormorant Garamond', 'Libre Baskerville',
] as const
const SERIF = new Set(['Playfair Display', 'Cormorant Garamond', 'Libre Baskerville'])

export function fontStack(name: string): string {
  const fallback = SERIF.has(name) ? "Georgia, 'Times New Roman', serif" : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
  return `'${name}', ${fallback}`
}

const loadedFonts = new Set<string>(['Inter'])
/** Lazily add the Google Fonts stylesheet for a theme font (fails silently offline). */
export function ensureFont(name: string) {
  if (typeof document === 'undefined' || !name || loadedFonts.has(name)) return
  loadedFonts.add(name)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`
  link.dataset.stFont = name
  document.head.appendChild(link)
}

// ---- color helpers ----
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** Relative luminance 0..1 (WCAG). */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 1
  const [r, g, b] = rgb.map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Readable text color on top of `bg`. */
export const onColor = (bg: string) => (luminance(bg) > 0.45 ? '#121212' : '#ffffff')
export function withAlpha(hex: string, a: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
}
export const isHexColor = (v: string) => !!hexToRgb(v)

export interface StoreThemeTokens {
  id: string
  def: ThemeDef
  look: ThemeLook
  primary: string
  accent: string
  background: string
  text: string
  subdued: string
  border: string
  surface: string
  dark: boolean
  font: string
  headingFont: string
}

export type ThemeSettings = StoreState['theme']

/** Resolve tokens for a theme id + merchant settings (settings.id is ignored in favor of `themeId`). */
export function themeTokens(settings: ThemeSettings, themeId = settings.id): StoreThemeTokens {
  const def = themeDef(themeId)
  const preset = def.presets.find(p => p.primaryColor.toLowerCase() === settings.primaryColor?.toLowerCase()) ?? def.presets[0]
  const look = LOOKS[def.id] ?? LOOKS.dawnish
  const background = settings.background && isHexColor(settings.background) ? settings.background : preset.background
  const dark = luminance(background) < 0.2
  const primary = settings.primaryColor && isHexColor(settings.primaryColor) ? settings.primaryColor : preset.primaryColor
  const accent = settings.accentColor && isHexColor(settings.accentColor) ? settings.accentColor : preset.accent
  const fontName = settings.font || preset.font
  const headingName = look.headingFont && !SERIF.has(fontName) ? look.headingFont : fontName
  return {
    id: def.id, def, look, primary, accent, background, dark,
    text: dark ? '#f3f4f6' : '#121212',
    subdued: dark ? 'rgba(243,244,246,0.68)' : 'rgba(18,18,18,0.68)',
    border: dark ? 'rgba(243,244,246,0.16)' : 'rgba(18,18,18,0.12)',
    surface: dark ? 'rgba(255,255,255,0.05)' : (luminance(background) > 0.97 ? '#f6f6f6' : 'rgba(18,18,18,0.035)'),
    font: fontName,
    headingFont: headingName,
  }
}

/** CSS variables for the .st-root element. */
export function themeStyle(t: StoreThemeTokens): CSSProperties {
  ensureFont(t.font)
  ensureFont(t.headingFont)
  // buttons use the primary color; on dark backgrounds a near-black primary would vanish
  const btn = t.dark && luminance(t.primary) < 0.2 ? t.accent : t.primary
  return {
    ['--st-bg' as string]: t.background,
    ['--st-text' as string]: t.text,
    ['--st-subdued' as string]: t.subdued,
    ['--st-border' as string]: t.border,
    ['--st-surface' as string]: t.surface,
    ['--st-primary' as string]: btn,
    ['--st-on-primary' as string]: onColor(btn),
    ['--st-accent' as string]: t.accent,
    ['--st-on-accent' as string]: onColor(t.accent),
    ['--st-accent-soft' as string]: withAlpha(t.accent, 0.12),
    ['--st-font' as string]: fontStack(t.font),
    ['--st-heading-font' as string]: fontStack(t.headingFont),
    ['--st-radius' as string]: `${t.look.radius}px`,
    ['--st-btn-radius' as string]: `${t.look.buttonRadius}px`,
  }
}

/** Every theme's selectable fonts (presets first, then the general list). */
export function fontChoices(themeId: string): string[] {
  const def = themeDef(themeId)
  return [...new Set([...def.presets.map(p => p.font), ...FONT_OPTIONS])]
}

export { THEMES, themeDef }
