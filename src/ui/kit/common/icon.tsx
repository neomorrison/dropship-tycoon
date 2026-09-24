// Icon plumbing shared by every kit: accept a lucide-react component (e.g. `Truck`)
// or a ready-made element, and render it at a given size.
import { isValidElement, type ComponentType, type ReactElement, type ReactNode } from 'react'

/** Minimal props every lucide icon (and compatible custom icon components) accepts. */
export interface IconComponentProps {
  size?: number | string
  strokeWidth?: number | string
  className?: string
  color?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}
/** A lucide-react icon component (e.g. `ShoppingBag`) or a ready-made element. */
export type IconSource = ComponentType<IconComponentProps> | ReactElement

/** Render an IconSource at a given pixel size (default stroke 1.75 for the admin look). */
export function renderIcon(src: IconSource | undefined, size = 16, strokeWidth = 1.75): ReactNode {
  if (!src) return null
  if (isValidElement(src)) return src
  const C = src as ComponentType<IconComponentProps>
  return <C size={size} strokeWidth={strokeWidth} aria-hidden />
}
