// Shared Polaris helpers: spacing tokens, icon sources, and the action shape
// every Polaris-style API (Page, Modal, Banner, EmptyState…) accepts.
import type { ReactNode } from 'react'
import type { IconSource } from '../common/icon'

/**
 * Polaris spacing scale ('100' = 4px, '200' = 8px, '400' = 16px …) or a raw px number.
 * Used by BlockStack / InlineStack / InlineGrid / Box / Card.
 */
export type SpaceToken =
  | '0' | '025' | '050' | '100' | '150' | '200' | '300' | '400' | '500' | '600' | '800' | '1000' | '1200' | '1600'

const SPACE_PX: Record<SpaceToken, number> = {
  '0': 0, '025': 1, '050': 2, '100': 4, '150': 6, '200': 8, '300': 12, '400': 16, '500': 20, '600': 24,
  '800': 32, '1000': 40, '1200': 48, '1600': 64,
}

/** Resolve a spacing token or number to a CSS length ("16px"). */
export function space(v: SpaceToken | number | undefined): string | undefined {
  if (v === undefined) return undefined
  if (typeof v === 'number') return `${v}px`
  return `${SPACE_PX[v] ?? 0}px`
}

export { renderIcon, type IconComponentProps, type IconSource } from '../common/icon'

/** A clickable action (Polaris "ComplexAction"). */
export interface PAction {
  content: ReactNode
  onAction?: () => void
  icon?: IconSource
  disabled?: boolean
  loading?: boolean
  /** red / destructive styling */
  destructive?: boolean
  /** tooltip / aria label when content is an icon */
  accessibilityLabel?: string
  /** optional tooltip text shown on hover (e.g. why the action is disabled) */
  helpText?: string
  id?: string
}
