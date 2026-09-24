// Polaris Button & ButtonGroup — primary (dark bevel), secondary (white bevel),
// tertiary, plain link, critical / success tones, micro/slim/medium/large.
import type { CSSProperties, MouseEvent, ReactNode, Ref } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { cx } from '../common/utils'
import { Spinner } from './primitives'
import { renderIcon, type IconSource } from './shared'
import './polaris.css'

export interface ButtonProps {
  children?: ReactNode
  /** 'secondary' (default white bevel) · 'primary' (dark) · 'tertiary' (ghost) · 'plain' (link) · 'monochromePlain' */
  variant?: 'primary' | 'secondary' | 'tertiary' | 'plain' | 'monochromePlain'
  tone?: 'critical' | 'success'
  size?: 'micro' | 'slim' | 'medium' | 'large'
  /** lucide icon component or element, rendered before the label */
  icon?: IconSource
  /** caret after the label: true/'down', 'up', or 'select' (up-down chevrons) */
  disclosure?: boolean | 'down' | 'up' | 'select'
  fullWidth?: boolean
  textAlign?: 'start' | 'center' | 'end'
  loading?: boolean
  disabled?: boolean
  /** toggled-on state (segmented controls, filter buttons) */
  pressed?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  /** type="submit" */
  submit?: boolean
  accessibilityLabel?: string
  /** native title tooltip */
  title?: string
  id?: string
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLButtonElement>
}

/** Shopify admin button. `<Button variant="primary" onClick={save}>Save</Button>` */
export function Button({
  children, variant = 'secondary', tone, size = 'medium', icon, disclosure, fullWidth, textAlign, loading, disabled,
  pressed, onClick, submit, accessibilityLabel, title, id, className, style, ref,
}: ButtonProps) {
  const iconOnly = !!icon && (children === undefined || children === null || children === '')
  const caret = disclosure === 'up' ? ChevronUp : disclosure === 'select' ? ChevronsUpDown : ChevronDown
  const isPlain = variant === 'plain' || variant === 'monochromePlain'
  return (
    <button
      ref={ref}
      id={id}
      type={submit ? 'submit' : 'button'}
      className={cx(
        'p-btn', `p-btn-${variant}`, tone && `p-btn-${tone}`, size !== 'medium' && `p-btn-${size}`,
        iconOnly && 'p-btn-iconOnly', fullWidth && 'p-btn-full', textAlign && textAlign !== 'center' && `p-btn-align-${textAlign}`,
        pressed && 'p-btn-pressed', loading && 'p-btn-loading', disabled && 'p-btn-disabled', className,
      )}
      style={style}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-busy={loading || undefined}
      aria-label={accessibilityLabel}
      title={title ?? (iconOnly ? accessibilityLabel : undefined)}
      onClick={e => {
        if (disabled || loading) return
        onClick?.(e)
      }}
    >
      {icon && <span className="p-btn-icon">{renderIcon(icon, size === 'micro' ? 14 : isPlain ? 16 : 16)}</span>}
      {!iconOnly && children !== undefined && <span className="p-btn-label">{children}</span>}
      {disclosure && (
        <span className="p-btn-disclosure">
          {renderIcon(caret, size === 'micro' ? 12 : 16, 2)}
        </span>
      )}
      {loading && (
        <span className="p-btn-spinner">
          <Spinner size={16} />
        </span>
      )}
    </button>
  )
}

export interface ButtonGroupProps {
  children?: ReactNode
  /** 'segmented' joins buttons into one control */
  variant?: 'segmented'
  gap?: 'tight' | 'loose'
  fullWidth?: boolean
  className?: string
}
/** Row of buttons with consistent spacing (or a joined segmented control). */
export function ButtonGroup({ children, variant, gap, fullWidth, className }: ButtonGroupProps) {
  return (
    <div
      className={cx('p-btngroup', variant === 'segmented' && 'p-btngroup-segmented', gap && `p-btngroup-${gap}`, fullWidth && 'p-btngroup-full', className)}
      role={variant === 'segmented' ? 'group' : undefined}
    >
      {children}
    </div>
  )
}
