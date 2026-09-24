import type { SiteId } from '../../core/types'

/** Props every in-game website component receives from the browser shell. */
export interface SiteProps {
  tabId: string
  /** site-internal route, e.g. "products/sp_3" ("" = home) */
  path: string
  navigate: (path: string) => void
  /** true when rendered in the phone frame (away from home / small screens) */
  compact: boolean
}
export interface SiteDef {
  id: SiteId
  name: string
  /** fake domain shown in the URL bar */
  domain: string
  /** tab favicon: short text/emoji fallback */
  glyph: string
  /** brand color for favicon chip */
  color: string
  /** shown in the desktop dock / bookmarks bar */
  bookmark: boolean
  description: string
}
