// Polaris primitives: Icon, Text, Link, stacks/grid/box, Card, Layout, Divider,
// FormLayout, DescriptionList, Collapsible, Spinner.
import {
  Children, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type ElementType, type MouseEvent, type ReactNode,
} from 'react'
import { ExternalLink } from 'lucide-react'
import { cx } from '../common/utils'
import { renderIcon, space, type IconSource, type PAction, type SpaceToken } from './shared'
import './polaris.css'

// ---------------------------------------------------------------------------
// PolarisProvider
// ---------------------------------------------------------------------------
export interface PolarisProviderProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}
/** Root wrapper for a Shopifly admin screen: sets Inter 13/20, text color and the #f1f1f1 canvas. */
export function PolarisProvider({ children, className, style }: PolarisProviderProps) {
  return <div className={cx('p-app', className)} style={style}>{children}</div>
}

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------
export type IconTone =
  | 'base' | 'subdued' | 'secondary' | 'inherit' | 'critical' | 'success' | 'caution' | 'warning' | 'info'
  | 'interactive' | 'magic' | 'textInverse'
export interface IconProps {
  /** lucide-react icon component, e.g. `import { Truck } from 'lucide-react'` → `source={Truck}` */
  source: IconSource
  tone?: IconTone
  /** box size in px (default 20, Polaris' icon box); the glyph is drawn at ~80% */
  size?: number
  /** override glyph stroke width (default 1.75) */
  strokeWidth?: number
  accessibilityLabel?: string
  className?: string
}
/** Polaris-style icon wrapper around lucide icons (20px box, 16px glyph). */
export function Icon({ source, tone = 'base', size = 20, strokeWidth = 1.75, accessibilityLabel, className }: IconProps) {
  return (
    <span
      className={cx('p-icon', `p-icon-tone-${tone}`, className)}
      style={{ width: size, height: size }}
      role={accessibilityLabel ? 'img' : undefined}
      aria-label={accessibilityLabel}
      aria-hidden={accessibilityLabel ? undefined : true}
    >
      {renderIcon(source, Math.round(size * 0.8), strokeWidth)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
export type TextVariant =
  | 'heading2xl' | 'headingXl' | 'headingLg' | 'headingMd' | 'headingSm' | 'headingXs'
  | 'bodyLg' | 'bodyMd' | 'bodySm' | 'bodyXs'
export type TextTone =
  | 'base' | 'subdued' | 'secondary' | 'disabled' | 'success' | 'critical' | 'caution' | 'magic' | 'link' | 'text-inverse'
export interface TextProps {
  children?: ReactNode
  /** typographic style (default bodyMd = 13px/20px 450) */
  variant?: TextVariant
  /** HTML element (default h2 for headings, p for body) */
  as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'strong' | 'label' | 'dt' | 'dd' | 'legend'
  tone?: TextTone
  fontWeight?: 'regular' | 'medium' | 'semibold' | 'bold'
  alignment?: 'start' | 'center' | 'end' | 'justify'
  /** single line with ellipsis */
  truncate?: boolean
  /** tabular numerals (money, counts in tables) */
  numeric?: boolean
  breakWord?: boolean
  visuallyHidden?: boolean
  textDecorationLine?: 'line-through'
  id?: string
  className?: string
  style?: CSSProperties
  title?: string
}
/** Typography primitive. `<Text variant="headingMd" as="h2">Orders</Text>` */
export function Text({
  children, variant = 'bodyMd', as, tone, fontWeight, alignment, truncate, numeric, breakWord, visuallyHidden,
  textDecorationLine, id, className, style, title,
}: TextProps) {
  const Tag = (as ?? (variant.startsWith('heading') ? 'h2' : 'p')) as ElementType
  return (
    <Tag
      id={id}
      title={title}
      style={style}
      className={cx(
        'p-text', `p-text-${variant}`,
        tone && tone !== 'base' && `p-text-tone-${tone}`,
        fontWeight && `p-text-w-${fontWeight}`,
        alignment && `p-text-align-${alignment}`,
        truncate && 'p-text-truncate', numeric && 'p-text-numeric', breakWord && 'p-text-break',
        textDecorationLine && 'p-text-strike', visuallyHidden && 'p-visually-hidden', className,
      )}
    >
      {children}
    </Tag>
  )
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------
export interface LinkProps {
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  /** inherit text color (links inside banners / tables) */
  monochrome?: boolean
  removeUnderline?: boolean
  /** show the external-link glyph */
  external?: boolean
  accessibilityLabel?: string
  className?: string
}
/** Inline text link (renders a <button>; in-game navigation is done via onClick). */
export function Link({ children, onClick, monochrome, removeUnderline, external, accessibilityLabel, className }: LinkProps) {
  return (
    <button
      type="button"
      className={cx('p-link', monochrome && 'p-link-monochrome', removeUnderline && 'p-link-nounderline', external && 'p-link-external', className)}
      onClick={e => {
        e.stopPropagation()
        onClick?.(e)
      }}
      aria-label={accessibilityLabel}
    >
      {children}
      {external && <ExternalLink size={12} strokeWidth={2} aria-hidden />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Stacks, grid, box
// ---------------------------------------------------------------------------
type Align = 'start' | 'center' | 'end' | 'space-around' | 'space-between' | 'space-evenly'
const justify = (a?: Align) =>
  a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : a
const alignItems = (a?: 'start' | 'center' | 'end' | 'baseline' | 'stretch') =>
  a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : a

export interface BlockStackProps {
  children?: ReactNode
  /** vertical gap (default '0') */
  gap?: SpaceToken | number
  /** main-axis distribution */
  align?: Align
  /** cross-axis alignment (default stretch) */
  inlineAlign?: 'start' | 'center' | 'end' | 'baseline' | 'stretch'
  as?: 'div' | 'section' | 'ul' | 'ol' | 'li' | 'fieldset' | 'form'
  className?: string
  style?: CSSProperties
  id?: string
}
/** Vertical flex stack. */
export function BlockStack({ children, gap = '0', align, inlineAlign, as = 'div', className, style, id }: BlockStackProps) {
  const Tag = as as ElementType
  return (
    <Tag id={id} className={cx('p-block', className)} style={{ gap: space(gap), justifyContent: justify(align), alignItems: alignItems(inlineAlign), ...style }}>
      {children}
    </Tag>
  )
}

export interface InlineStackProps {
  children?: ReactNode
  gap?: SpaceToken | number
  /** main-axis distribution (default start) */
  align?: Align
  /** cross-axis alignment (default start, like Polaris) */
  blockAlign?: 'start' | 'center' | 'end' | 'baseline' | 'stretch'
  /** wrap children (default true) */
  wrap?: boolean
  direction?: 'row' | 'row-reverse'
  as?: 'div' | 'span' | 'ul' | 'li'
  className?: string
  style?: CSSProperties
}
/** Horizontal flex row (wraps by default). */
export function InlineStack({ children, gap = '0', align, blockAlign, wrap = true, direction, as = 'div', className, style }: InlineStackProps) {
  const Tag = as as ElementType
  return (
    <Tag
      className={cx('p-inline', wrap && 'p-inline-wrap', className)}
      style={{ gap: space(gap), justifyContent: justify(align), alignItems: alignItems(blockAlign) ?? 'flex-start', flexDirection: direction, ...style }}
    >
      {children}
    </Tag>
  )
}

export interface InlineGridProps {
  children?: ReactNode
  /**
   * number of equal columns, a CSS template ("2fr 1fr"), an array of templates, or
   * `{ xs, md }` for responsive columns (md applies ≥ 768px of the component's own width).
   */
  columns?: number | string | string[] | { xs?: number | string; md?: number | string }
  gap?: SpaceToken | number
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  className?: string
  style?: CSSProperties
}
const colTemplate = (c: number | string | string[]): string =>
  typeof c === 'number' ? `repeat(${c}, minmax(0, 1fr))` : Array.isArray(c) ? c.join(' ') : c
/** CSS grid with equal (or templated) columns; responsive by container width. */
export function InlineGrid({ children, columns = 2, gap = '400', alignItems: ai, className, style }: InlineGridProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(true)
  const responsive = typeof columns === 'object' && !Array.isArray(columns)
  useLayoutEffect(() => {
    if (!responsive || !ref.current) return
    const el = ref.current
    const measure = () => setWide(el.clientWidth >= 560)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [responsive])
  let tpl: string
  if (responsive) {
    const r = columns as { xs?: number | string; md?: number | string }
    tpl = colTemplate((wide ? r.md ?? r.xs : r.xs ?? r.md) ?? 1)
  } else tpl = colTemplate(columns as number | string | string[])
  return (
    <div ref={ref} className={cx('p-grid', className)} style={{ gridTemplateColumns: tpl, gap: space(gap), alignItems: ai, ...style }}>
      {children}
    </div>
  )
}

export interface BoxProps {
  children?: ReactNode
  padding?: SpaceToken | number
  paddingBlock?: SpaceToken | number
  paddingInline?: SpaceToken | number
  background?: 'bg-surface' | 'bg-surface-secondary' | 'bg-surface-tertiary' | 'bg-fill-critical-secondary' | 'bg-fill-success-secondary' | 'bg-fill-info-secondary' | 'bg-fill-caution-secondary' | string
  borderRadius?: '100' | '150' | '200' | '300' | 'full'
  borderColor?: 'border' | 'border-secondary' | string
  borderWidth?: number
  minHeight?: string
  width?: string
  maxWidth?: string
  as?: 'div' | 'section' | 'span' | 'li'
  className?: string
  style?: CSSProperties
  onClick?: () => void
}
const BG: Record<string, string> = {
  'bg-surface': '#ffffff', 'bg-surface-secondary': '#f7f7f7', 'bg-surface-tertiary': '#f3f3f3',
  'bg-fill-critical-secondary': '#fee9e8', 'bg-fill-success-secondary': '#cdfee1', 'bg-fill-info-secondary': '#eaf4ff',
  'bg-fill-caution-secondary': '#fff8db',
}
const RADIUS: Record<string, string> = { '100': '4px', '150': '6px', '200': '8px', '300': '12px', full: '9999px' }
/** Generic container with Polaris padding/background tokens. */
export function Box({
  children, padding, paddingBlock, paddingInline, background, borderRadius, borderColor, borderWidth, minHeight, width, maxWidth,
  as = 'div', className, style, onClick,
}: BoxProps) {
  const Tag = as as ElementType
  const bc = borderColor === 'border' ? '#e3e3e3' : borderColor === 'border-secondary' ? '#ebebeb' : borderColor
  // only emit defined keys: an undefined longhand (paddingTop) would clear the shorthand in React
  const css: CSSProperties = {}
  const p = space(padding)
  const pb = space(paddingBlock) ?? p
  const pi = space(paddingInline) ?? p
  if (pb !== undefined) css.paddingTop = css.paddingBottom = pb
  if (pi !== undefined) css.paddingLeft = css.paddingRight = pi
  if (background) css.background = BG[background] ?? background
  if (borderRadius) css.borderRadius = RADIUS[borderRadius]
  if (bc) css.border = `${borderWidth ?? 1}px solid ${bc}`
  if (minHeight !== undefined) css.minHeight = minHeight
  if (width !== undefined) css.width = width
  if (maxWidth !== undefined) css.maxWidth = maxWidth
  return (
    <Tag className={cx('p-box', className)} onClick={onClick} style={{ ...css, ...style }}>
      {children}
    </Tag>
  )
}

/** Horizontal rule (Polaris Divider). */
export function Divider({ strong, className, style }: { strong?: boolean; className?: string; style?: CSSProperties }) {
  return <hr className={cx('p-divider', strong && 'p-divider-strong', className)} style={style} />
}

// ---------------------------------------------------------------------------
// FormLayout
// ---------------------------------------------------------------------------
/** Vertical form rhythm (12px gaps). Use `FormLayout.Group` for side-by-side fields. */
export function FormLayout({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={cx('p-formlayout', className)}>{children}</div>
}
function FormLayoutGroup({ children, condensed }: { children?: ReactNode; condensed?: boolean }) {
  return <div className={cx('p-formlayout-group', condensed && 'p-formlayout-group-condensed')}>{children}</div>
}
FormLayout.Group = FormLayoutGroup

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export interface CardProps {
  children?: ReactNode
  /** optional header title (headingSm) */
  title?: ReactNode
  /** header right side: a node (e.g. Badge) or plain actions rendered as plain buttons */
  actions?: ReactNode
  /** content footer, right-aligned (e.g. a Save button) */
  footer?: ReactNode
  /** inner padding (default '400' = 16px). Use '0' for full-bleed tables and sectioned cards. */
  padding?: SpaceToken | number
  /** 'bg-surface-secondary' for subdued cards */
  background?: 'bg-surface' | 'bg-surface-secondary'
  /** clip children to the rounded corners (tables, images) */
  clip?: boolean
  className?: string
  style?: CSSProperties
  id?: string
}
/**
 * White surface with a 12px radius and the admin's subtle bevel.
 * Use `<Card padding="0">` + `<Card.Section>` children for divided sections.
 */
export function Card({ children, title, actions, footer, padding = '400', background, clip, className, style, id }: CardProps) {
  return (
    <div
      id={id}
      className={cx('p-card', background === 'bg-surface-secondary' && 'p-card-secondary', clip && 'p-card-clip', className)}
      style={{ padding: space(padding), ...style }}
    >
      {(title || actions) && (
        <div className="p-card-header">
          {typeof title === 'string' ? <h2 className="p-card-title">{title}</h2> : title ?? <span />}
          {actions && <div className="p-card-header-actions">{actions}</div>}
        </div>
      )}
      {children}
      {footer && <div className="p-card-footer">{footer}</div>}
    </div>
  )
}
export interface CardSectionProps {
  children?: ReactNode
  title?: ReactNode
  actions?: ReactNode
  /** no padding (tables / lists that manage their own) */
  flush?: boolean
  subdued?: boolean
  className?: string
}
/** Divided section inside `<Card padding="0">`. */
function CardSection({ children, title, actions, flush, subdued, className }: CardSectionProps) {
  return (
    <div className={cx('p-card-section', flush && 'p-card-section-flush', subdued && 'p-card-section-subdued', className)}>
      {(title || actions) && (
        <div className="p-card-header">
          {typeof title === 'string' ? <h3 className="p-card-title">{title}</h3> : title ?? <span />}
          {actions && <div className="p-card-header-actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
Card.Section = CardSection

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
/** Page layout: `Layout.Section` (2/3) + `Layout.Section variant="oneThird"` (1/3); stacks when narrow. */
export function Layout({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={cx('p-layout', className)}>{children}</div>
}
export interface LayoutSectionProps {
  children?: ReactNode
  /** default = two-thirds main column */
  variant?: 'oneThird' | 'oneHalf' | 'fullWidth'
  className?: string
}
function LayoutSection({ children, variant, className }: LayoutSectionProps) {
  return <div className={cx('p-layout-section', variant && `p-layout-section-${variant}`, className)}>{children}</div>
}
export interface LayoutAnnotatedSectionProps {
  children?: ReactNode
  title: ReactNode
  description?: ReactNode
  id?: string
}
/** Settings-style row: title + description on the left, cards on the right. */
function LayoutAnnotatedSection({ children, title, description, id }: LayoutAnnotatedSectionProps) {
  return (
    <div className="p-layout-annotated" id={id}>
      <div className="p-layout-annotation">
        <Text variant="headingMd" as="h2">{title}</Text>
        {description && <Text tone="subdued" as="div">{description}</Text>}
      </div>
      <div className="p-layout-annotation-content">{children}</div>
    </div>
  )
}
Layout.Section = LayoutSection
Layout.AnnotatedSection = LayoutAnnotatedSection

// ---------------------------------------------------------------------------
// DescriptionList
// ---------------------------------------------------------------------------
export interface DescriptionListProps {
  items: { term: ReactNode; description: ReactNode }[]
  spacing?: 'tight' | 'loose'
  /** term above description instead of side-by-side */
  stacked?: boolean
  className?: string
}
/** Term / description pairs (order details, settings summaries). */
export function DescriptionList({ items, spacing = 'loose', stacked, className }: DescriptionListProps) {
  return (
    <dl className={cx('p-dl', spacing === 'tight' && 'p-dl-tight', stacked && 'p-dl-stacked', className)}>
      {items.map((it, i) => (
        <DlPair key={i} term={it.term} description={it.description} />
      ))}
    </dl>
  )
}
function DlPair({ term, description }: { term: ReactNode; description: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{description}</dd>
    </>
  )
}

// ---------------------------------------------------------------------------
// Collapsible
// ---------------------------------------------------------------------------
export interface CollapsibleProps {
  open: boolean
  children?: ReactNode
  id?: string
  /** animate height (default true) */
  transition?: boolean
}
/** Height-animated disclosure region. */
export function Collapsible({ open, children, id, transition = true }: CollapsibleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>(open ? 'auto' : 0)
  const first = useRef(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (first.current) {
      first.current = false
      setHeight(open ? 'auto' : 0)
      return
    }
    if (!transition) {
      setHeight(open ? 'auto' : 0)
      return
    }
    const full = el.scrollHeight
    if (open) {
      setHeight(full)
      const t = setTimeout(() => setHeight('auto'), 210)
      return () => clearTimeout(t)
    }
    setHeight(full)
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setHeight(0)))
    return () => cancelAnimationFrame(raf)
  }, [open, transition])
  return (
    <div id={id} ref={ref} className="p-collapsible" style={{ height }} aria-hidden={!open}>
      {Children.count(children) ? children : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
/** Circular loading indicator (inherits color). */
export function Spinner({ size = 'small', accessibilityLabel = 'Loading' }: { size?: 'small' | 'large' | number; accessibilityLabel?: string }) {
  const px = typeof size === 'number' ? size : size === 'large' ? 44 : 20
  return (
    <span className="p-spinner" role="status" aria-label={accessibilityLabel}>
      <svg width={px} height={px} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.2" />
        <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/** Render a list of PActions as plain link buttons (used in Card headers). */
export function PlainActions({ actions }: { actions: PAction[] }) {
  return (
    <>
      {actions.map((a, i) => (
        <button
          key={a.id ?? i}
          type="button"
          className={cx('p-btn p-btn-plain', a.destructive && 'p-btn-critical', a.disabled && 'p-btn-disabled')}
          disabled={a.disabled}
          onClick={a.onAction}
        >
          {a.icon && <span className="p-btn-icon">{renderIcon(a.icon, 16)}</span>}
          <span className="p-btn-label">{a.content}</span>
        </button>
      ))}
    </>
  )
}
