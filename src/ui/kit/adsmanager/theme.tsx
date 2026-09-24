// Ads Manager theming: one kit, two skins. Wrap a site in <AmThemeProvider theme="fadbook">
// (Meta Ads Manager look) or theme="tiktak" (TikTok Ads Manager look). Every am- component
// reads the theme from context; a `theme` prop overrides it per component. Portaled layers
// (menus, tooltips, drawers, modals) re-apply the theme class so CSS variables resolve.
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import { cx } from '../common/utils'
import './adsmanager.css'

export type AmTheme = 'fadbook' | 'tiktak'

const AmThemeContext = createContext<AmTheme>('fadbook')

/** Current theme (prop override wins). */
export function useAmTheme(override?: AmTheme): AmTheme {
  const ctx = useContext(AmThemeContext)
  return override ?? ctx
}

/** Class list that applies the theme's CSS variables + base typography. */
export const amThemeClass = (theme: AmTheme) => `am-root am-theme-${theme}`

export interface AmThemeProviderProps {
  theme: AmTheme
  children?: ReactNode
  className?: string
  style?: CSSProperties
  /** render a canvas-colored full-height container (default true) */
  canvas?: boolean
}
/** Theme root for an Ads Manager site. */
export function AmThemeProvider({ theme, children, className, style, canvas = true }: AmThemeProviderProps) {
  return (
    <AmThemeContext.Provider value={theme}>
      <div className={cx(amThemeClass(theme), canvas && 'am-canvas', className)} style={style}>
        {children}
      </div>
    </AmThemeContext.Provider>
  )
}

/** Provide a theme to children without adding a DOM wrapper (e.g. inside portals). */
export function AmThemeScope({ theme, children }: { theme: AmTheme; children?: ReactNode }) {
  return <AmThemeContext.Provider value={theme}>{children}</AmThemeContext.Provider>
}
