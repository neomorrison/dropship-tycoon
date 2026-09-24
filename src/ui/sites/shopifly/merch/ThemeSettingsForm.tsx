// Brand / theme settings shared by Online Store › Preferences and the Theme Editor:
// color scheme presets, colors, typography, logo text and announcement bar.
import type { GameState, StoreState } from '../../../../core/types'
import { themeDef, type ThemeDef } from '../../../../data/themes'
import { publishTheme, updateStoreSettings } from '../../../../sim/store'
import { BlockStack, Checkbox, Select, Text, TextField } from '../../../kit/polaris'
import { autoAnnouncement, ensureFont, fontChoices, isHexColor, themeTokens } from '../../storefront'

export type ThemeDraft = StoreState['theme']

export function ColorField({ label, value, onChange, helpText }: { label: string; value: string; onChange: (v: string) => void; helpText?: string }) {
  const valid = isHexColor(value)
  return (
    <div className="sf-mx-color">
      <label className="sf-mx-color-swatch" style={{ background: valid ? value : '#fff' }} title="Pick a color">
        <input type="color" value={valid && value.length === 7 ? value : '#000000'} onChange={e => onChange(e.target.value)} aria-label={`${label} picker`} />
      </label>
      <div className="sf-mx-color-field">
        <TextField label={label} value={value} onChange={v => onChange(v.startsWith('#') || !v ? v : `#${v}`)} error={value && !valid ? 'Use a hex color like #1a1a1a' : undefined} helpText={helpText} monospaced />
      </div>
    </div>
  )
}

/** Small color-scheme swatch for a theme preset. */
export function PresetSwatch({ bg, primary, accent, active, label, onClick }: { bg: string; primary: string; accent: string; active?: boolean; label: string; onClick?: () => void }) {
  return (
    <button type="button" className={`sf-mx-preset${active ? ' is-on' : ''}`} onClick={onClick} title={label}>
      <span className="sf-mx-preset-card" style={{ background: bg }}>
        <span style={{ color: primary }}>Aa</span>
        <span className="sf-mx-preset-dots">
          <i style={{ background: primary }} />
          <i style={{ background: accent }} />
        </span>
      </span>
      <span className="sf-mx-preset-label">{label}</span>
    </button>
  )
}

export function ThemeSettingsForm({
  theme, onChange, storeState, disabled, sections = ['colors', 'type', 'brand', 'announcement'],
}: {
  theme: ThemeDraft
  onChange: (t: ThemeDraft) => void
  storeState: StoreState
  disabled?: boolean
  sections?: ('colors' | 'type' | 'brand' | 'announcement')[]
}) {
  const def: ThemeDef = themeDef(theme.id)
  const tok = themeTokens(theme, theme.id)
  const set = (patch: Partial<ThemeDraft>) => onChange({ ...theme, ...patch })
  const auto = theme.announcement === undefined
  ensureFont(theme.font || tok.font)
  if (disabled) return <Text as="p" tone="subdued">Publish this theme to change its settings.</Text>
  return (
    <BlockStack gap="500">
      {sections.includes('colors') && (
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Colors</Text>
          <div className="sf-mx-presets">
            {def.presets.map(p => (
              <PresetSwatch
                key={p.name}
                label={p.name}
                bg={p.background}
                primary={p.primaryColor}
                accent={p.accent}
                active={tok.primary.toLowerCase() === p.primaryColor.toLowerCase() && tok.background.toLowerCase() === p.background.toLowerCase() && tok.accent.toLowerCase() === p.accent.toLowerCase()}
                onClick={() => set({ primaryColor: p.primaryColor, background: p.background, accentColor: p.accent, font: p.font })}
              />
            ))}
          </div>
          <ColorField label="Buttons & text accents" value={theme.primaryColor} onChange={v => set({ primaryColor: v })} />
          <ColorField label="Sale badges & highlights" value={theme.accentColor ?? tok.accent} onChange={v => set({ accentColor: v })} />
          <ColorField label="Background" value={theme.background ?? tok.background} onChange={v => set({ background: v })} />
        </BlockStack>
      )}
      {sections.includes('type') && (
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Typography</Text>
          <Select label="Font" options={fontChoices(theme.id).map(f => ({ label: f, value: f }))} value={theme.font || tok.font} onChange={font => set({ font })} />
          <p className="sf-mx-fontsample" style={{ fontFamily: `'${theme.font || tok.font}', system-ui, sans-serif` }}>The quick brown fox jumps over the lazy dog</p>
        </BlockStack>
      )}
      {sections.includes('brand') && (
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Logo</Text>
          <TextField label="Logo text" value={theme.logoText} onChange={logoText => set({ logoText })} maxLength={40} helpText="Shown in your store header." placeholder={storeState.name} />
        </BlockStack>
      )}
      {sections.includes('announcement') && (
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Announcement bar</Text>
          <Checkbox
            label="Show your shipping offer automatically"
            checked={auto}
            onChange={on => set({ announcement: on ? undefined : autoAnnouncement(storeState) })}
            helpText={auto ? `Currently: “${autoAnnouncement(storeState)}”` : undefined}
          />
          {!auto && (
            <TextField label="Text" value={theme.announcement ?? ''} onChange={announcement => set({ announcement })} maxLength={90} helpText="Leave empty to hide the bar." />
          )}
        </BlockStack>
      )}
    </BlockStack>
  )
}

/**
 * Publish a theme with its default style (a freshly added theme starts from its first
 * preset, like on Shopify); logo text and announcement carry over. Call inside act().
 */
export function publishThemeWithDefaults(g: GameState, themeId: string): boolean {
  if (!publishTheme(g, themeId)) return false
  const pr = themeDef(themeId).presets[0]
  updateStoreSettings(g, { theme: { ...g.store.theme, primaryColor: pr.primaryColor, background: pr.background, accentColor: pr.accent, font: pr.font } })
  return true
}

/** Normalize a draft for comparisons (undefined vs missing keys). */
export const themeKey = (t: ThemeDraft) =>
  JSON.stringify([t.id, t.primaryColor, t.font, t.logoText, t.accentColor ?? null, t.background ?? null, t.announcement === undefined ? '__auto' : t.announcement])

export function themeDraftValid(t: ThemeDraft): string | null {
  for (const c of [t.primaryColor, t.accentColor, t.background]) if (c != null && c !== '' && !isHexColor(c)) return 'Fix the invalid color first'
  return null
}
