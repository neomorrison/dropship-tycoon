// Ads Manager controls: buttons, toggle, checkbox/radio, radio cards, fields,
// inputs, select, search, tags, notices, cards, segmented control, tooltips.
import {
  useRef, useState,
  type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref,
} from 'react'
import {
  Check, ChevronDown, CircleAlert, CircleCheck, Info, Minus, Search, TriangleAlert, X, CircleX,
} from 'lucide-react'
import { cx } from '../common/utils'
import { Floating, type FloatingPlacement } from '../common/Floating'
import { renderIcon, type IconSource } from '../common/icon'
import { amThemeClass, useAmTheme, type AmTheme } from './theme'
import './adsmanager.css'

/** Small circular spinner that inherits color. */
export function AmSpinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="am-spinner" width={size} height={size} viewBox="0 0 20 20" fill="none" role="status" aria-label="Loading">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.4" />
      <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
export interface AmButtonProps {
  children?: ReactNode
  /** 'secondary' (default outlined) · 'primary' (blue/teal) · 'create' (Fadbook green "+ Create") · 'tertiary' · 'danger' · 'link' */
  variant?: 'primary' | 'secondary' | 'create' | 'tertiary' | 'danger' | 'link'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconSource
  iconRight?: IconSource
  /** dropdown caret */
  caret?: boolean
  disabled?: boolean
  loading?: boolean
  /** toggled/selected look (filter buttons, view switchers) */
  pressed?: boolean
  fullWidth?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  title?: string
  ariaLabel?: string
  type?: 'button' | 'submit'
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLButtonElement>
}
/** Ads Manager button. `<AmButton variant="create" icon={Plus}>Create</AmButton>` */
export function AmButton({
  children, variant = 'secondary', size = 'md', icon, iconRight, caret, disabled, loading, pressed, fullWidth, onClick, title, ariaLabel,
  type = 'button', className, style, ref,
}: AmButtonProps) {
  const iconOnly = !!icon && (children === undefined || children === null || children === '') && !caret
  const px = size === 'sm' ? 14 : 16
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'am-btn', `am-btn-${variant}`, size !== 'md' && `am-btn-${size}`, iconOnly && 'am-btn-iconOnly', fullWidth && 'am-btn-full',
        pressed && 'am-btn-pressed', loading && 'am-btn-loading', disabled && 'am-btn-disabled', className,
      )}
      style={style}
      disabled={disabled}
      title={title ?? (iconOnly ? ariaLabel : undefined)}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      onClick={e => {
        if (!disabled && !loading) onClick?.(e)
      }}
    >
      {icon && renderIcon(icon, px, 2)}
      {!iconOnly && children !== undefined && <span>{children}</span>}
      {iconRight && renderIcon(iconRight, px, 2)}
      {caret && <span className="am-btn-caret"><ChevronDown size={px} strokeWidth={2} /></span>}
      {loading && <span className="am-btn-spin"><AmSpinner size={px} /></span>}
    </button>
  )
}
/** Joined row of AmButtons (view switchers). */
export function AmButtonGroup({ children, className }: { children?: ReactNode; className?: string }) {
  return <div className={cx('am-btngroup', className)} role="group">{children}</div>
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------
export interface ToggleProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  /** spinner in the knob while a change is pending */
  busy?: boolean
  size?: 'sm' | 'md'
  /** visible label to the right */
  label?: ReactNode
  /** accessible label when there is no visible label */
  ariaLabel?: string
  title?: string
  theme?: AmTheme
}
/** On/off switch (blue on Fadbook, teal on TikTak). */
export function Toggle({ checked, onChange, disabled, busy, size = 'md', label, ariaLabel, title, theme }: ToggleProps) {
  const t = useAmTheme(theme)
  const sw = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      title={title}
      disabled={disabled}
      className={cx('am-toggle', size === 'sm' && 'am-toggle-sm', checked && 'am-toggle-on', busy && 'am-toggle-busy', theme && `am-theme-${t}`)}
      onClick={e => {
        e.stopPropagation()
        if (!busy) onChange?.(!checked)
      }}
    >
      <span className="am-toggle-knob" />
    </button>
  )
  if (!label) return sw
  return (
    <label className="am-toggle-label" onClick={e => e.stopPropagation()}>
      {sw}
      <span>{label}</span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Checkbox / Radio
// ---------------------------------------------------------------------------
export interface AmCheckboxProps {
  checked: boolean | 'indeterminate'
  onChange?: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  ariaLabel?: string
  className?: string
}
/** Square checkbox (blue/teal fill). */
export function AmCheckbox({ checked, onChange, label, description, disabled, ariaLabel, className }: AmCheckboxProps) {
  const on = checked === true || checked === 'indeterminate'
  return (
    <label className={cx('am-check', disabled && 'am-check-disabled', className)} onClick={e => e.stopPropagation()}>
      <input
        type="checkbox"
        className="am-check-input"
        checked={checked === true}
        disabled={disabled}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        aria-checked={checked === 'indeterminate' ? 'mixed' : checked}
        onChange={() => onChange?.(checked === 'indeterminate' ? true : !checked)}
      />
      <span className={cx('am-check-box', on && 'am-check-box-on')}>
        {checked === 'indeterminate' ? <Minus size={12} strokeWidth={3.5} /> : checked ? <Check size={12} strokeWidth={3.5} /> : null}
      </span>
      {(label || description) && (
        <span className="am-check-text">
          {label}
          {description && <span className="am-check-desc">{description}</span>}
        </span>
      )}
    </label>
  )
}

export interface AmRadioProps {
  checked: boolean
  onChange?: () => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  name?: string
  className?: string
}
/** Round radio button with optional description. */
export function AmRadio({ checked, onChange, label, description, disabled, name, className }: AmRadioProps) {
  return (
    <label className={cx('am-check', disabled && 'am-check-disabled', className)}>
      <input type="radio" className="am-check-input" name={name} checked={checked} disabled={disabled} onChange={() => onChange?.()} />
      <span className={cx('am-radio-dot', checked && 'am-radio-dot-on')} />
      {(label || description) && (
        <span className="am-check-text">
          {label}
          {description && <span className="am-check-desc">{description}</span>}
        </span>
      )}
    </label>
  )
}

export interface AmRadioCardProps {
  checked: boolean
  onSelect?: () => void
  title: ReactNode
  description?: ReactNode
  icon?: IconSource
  /** e.g. <AmTag tone="primary">Recommended</AmTag> */
  badge?: ReactNode
  disabled?: boolean
  /** tooltip explaining why the card is disabled */
  disabledReason?: ReactNode
  /** extra content revealed when selected */
  children?: ReactNode
}
/** Big selectable card (campaign objective, Advantage+ vs manual, Smart+ vs manual). */
export function AmRadioCard({ checked, onSelect, title, description, icon, badge, disabled, disabledReason, children }: AmRadioCardProps) {
  const card = (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      className={cx('am-rcard', checked && 'am-rcard-on')}
      onClick={() => onSelect?.()}
    >
      {icon && <span className="am-rcard-icon">{renderIcon(icon, 18, 2)}</span>}
      <span className="am-rcard-body">
        <span className="am-rcard-title">{title}{badge}</span>
        {description && <span className="am-rcard-desc">{description}</span>}
        {checked && children}
      </span>
      <span className={cx('am-radio-dot', checked && 'am-radio-dot-on')} />
    </button>
  )
  if (disabled && disabledReason) return <AmTooltip content={disabledReason} block>{card}</AmTooltip>
  return card
}

// ---------------------------------------------------------------------------
// Field + inputs
// ---------------------------------------------------------------------------
export interface AmFieldProps {
  label?: ReactNode
  /** (i) tooltip next to the label */
  labelTip?: ReactNode
  optional?: boolean
  required?: boolean
  help?: ReactNode
  error?: ReactNode
  /** amber advisory under the control (e.g. "Significant edits reset learning") */
  warning?: ReactNode
  children: ReactNode
  /** right side of the footer (character count etc.) */
  footerRight?: ReactNode
  htmlFor?: string
  className?: string
}
/** Label + control + help/error/warning stack used across create flows. */
export function AmField({ label, labelTip, optional, required, help, error, warning, children, footerRight, htmlFor, className }: AmFieldProps) {
  return (
    <div className={cx('am-field', className)}>
      {label && (
        <label className={cx('am-field-label', required && 'am-field-required')} htmlFor={htmlFor}>
          {label}
          {optional && <span className="am-field-optional"> · Optional</span>}
          {labelTip && <InfoTip content={labelTip} />}
        </label>
      )}
      {children}
      {(error || footerRight) && (
        <div className="am-field-foot">
          {error ? <span className="am-field-error"><CircleAlert size={14} strokeWidth={2} />{error}</span> : <span />}
          {footerRight}
        </div>
      )}
      {!error && warning && <span className="am-field-warn"><TriangleAlert size={14} strokeWidth={2} />{warning}</span>}
      {help && <span className="am-field-help">{help}</span>}
    </div>
  )
}

export interface AmInputProps {
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  prefix?: ReactNode
  suffix?: ReactNode
  type?: 'text' | 'number' | 'currency' | 'url' | 'search'
  /** textarea rows (makes it multiline) */
  rows?: number
  maxLength?: number
  disabled?: boolean
  error?: boolean
  size?: 'sm' | 'md'
  clearable?: boolean
  autoFocus?: boolean
  onEnter?: () => void
  onBlur?: () => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  id?: string
  ariaLabel?: string
  width?: number | string
  className?: string
  selectOnFocus?: boolean
}
/** Text input / textarea with prefix & suffix. `type="currency"` filters to digits and a dot. */
export function AmInput({
  value, onChange, placeholder, prefix, suffix, type = 'text', rows, maxLength, disabled, error, size = 'md', clearable, autoFocus,
  onEnter, onBlur, onKeyDown, id, ariaLabel, width, className, selectOnFocus,
}: AmInputProps) {
  const [focus, setFocus] = useState(false)
  const common = {
    id,
    className: 'am-input-el',
    value,
    placeholder,
    maxLength,
    disabled,
    autoFocus,
    'aria-label': ariaLabel,
    'aria-invalid': error || undefined,
    onFocus: (e: { target: HTMLInputElement | HTMLTextAreaElement }) => {
      setFocus(true)
      if (selectOnFocus) e.target.select()
    },
    onBlur: () => {
      setFocus(false)
      onBlur?.()
    },
    onChange: (e: { target: { value: string } }) => {
      let v = e.target.value
      if (type === 'currency' || type === 'number') v = v.replace(type === 'currency' ? /[^\d.]/g : /[^\d.-]/g, '')
      onChange?.(v)
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !rows) onEnter?.()
      onKeyDown?.(e)
    },
  }
  return (
    <div
      className={cx(
        'am-input', focus && 'am-input-focus', error && 'am-input-error', disabled && 'am-input-disabled', size === 'sm' && 'am-input-sm',
        rows && 'am-input-multi', className,
      )}
      style={{ width }}
    >
      {prefix !== undefined && <span className="am-input-affix">{prefix}</span>}
      {rows ? (
        <textarea {...common} rows={rows} />
      ) : (
        <input {...common} type={type === 'currency' || type === 'number' ? 'text' : type} inputMode={type === 'currency' || type === 'number' ? 'decimal' : undefined} />
      )}
      {clearable && value && !disabled && (
        <button type="button" className="am-input-clear" aria-label="Clear" onClick={() => onChange?.('')}>
          <CircleX size={14} strokeWidth={2} />
        </button>
      )}
      {suffix !== undefined && <span className="am-input-affix">{suffix}</span>}
    </div>
  )
}

/** Search box with magnifier icon and clear button. */
export function AmSearch({ value, onChange, placeholder = 'Search', width, size = 'md', autoFocus }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  width?: number | string
  size?: 'sm' | 'md'
  autoFocus?: boolean
}) {
  return (
    <AmInput
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      prefix={<Search size={15} strokeWidth={2} />}
      clearable
      width={width}
      size={size}
      autoFocus={autoFocus}
      type="search"
      ariaLabel={placeholder}
    />
  )
}

// ---------------------------------------------------------------------------
// Select (custom dropdown)
// ---------------------------------------------------------------------------
export interface AmOption<V extends string = string> {
  value: V
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  /** why it is disabled (shown as description) */
  disabledReason?: ReactNode
  icon?: IconSource
}
export interface AmSelectProps<V extends string = string> {
  value: V | null
  onChange: (value: V) => void
  options: AmOption<V>[]
  placeholder?: string
  disabled?: boolean
  error?: boolean
  size?: 'sm' | 'md'
  width?: number | string
  /** dropdown at least this wide */
  menuWidth?: number
  ariaLabel?: string
  theme?: AmTheme
}
/** Dropdown select styled per theme (not a native select, so descriptions render). */
export function AmSelect<V extends string = string>({
  value, onChange, options, placeholder = 'Select', disabled, error, size = 'md', width, menuWidth, ariaLabel, theme,
}: AmSelectProps<V>) {
  const t = useAmTheme(theme)
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)
  return (
    <div style={{ width, minWidth: 0 }}>
      <button
        ref={anchor}
        type="button"
        className={cx('am-select-trigger', size === 'sm' && 'am-select-sm', open && 'am-select-open', error && 'am-select-error')}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        {current?.icon && renderIcon(current.icon, 16, 2)}
        <span className={cx('am-select-value', !current && 'am-select-placeholder')}>{current ? current.label : placeholder}</span>
        <span className="am-select-caret"><ChevronDown size={16} strokeWidth={2} /></span>
      </button>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} matchWidth className={amThemeClass(t)}>
        <div className="am-menu" role="listbox" style={{ minWidth: menuWidth }}>
          <div className="am-menu-scroll">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                disabled={o.disabled}
                className={cx('am-menu-item', o.value === value && 'am-menu-item-on')}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.icon && <span className="am-menu-item-icon">{renderIcon(o.icon, 16, 2)}</span>}
                <span className="am-menu-item-text">
                  <span>{o.label}</span>
                  {(o.description || (o.disabled && o.disabledReason)) && (
                    <span className="am-menu-item-desc">{o.disabled && o.disabledReason ? o.disabledReason : o.description}</span>
                  )}
                </span>
                <span className="am-menu-item-check">{o.value === value && <Check size={16} strokeWidth={2.5} />}</span>
              </button>
            ))}
          </div>
        </div>
      </Floating>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tag, Notice, Card, Segmented
// ---------------------------------------------------------------------------
export type AmTagTone = 'neutral' | 'blue' | 'green' | 'red' | 'yellow' | 'teal' | 'pink' | 'primary'
/** Small pill label. */
export function AmTag({ children, tone = 'neutral', onRemove, title }: { children: ReactNode; tone?: AmTagTone; onRemove?: () => void; title?: string }) {
  return (
    <span className={cx('am-tag', tone !== 'neutral' && `am-tag-${tone}`)} title={title}>
      <span className="am-tag-text">{children}</span>
      {onRemove && (
        <button type="button" className="am-tag-x" aria-label="Remove" onClick={e => { e.stopPropagation(); onRemove() }}>
          <X size={12} strokeWidth={2.5} />
        </button>
      )}
    </span>
  )
}

export interface AmNoticeProps {
  tone?: 'info' | 'warning' | 'error' | 'success'
  title?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  onDismiss?: () => void
  className?: string
}
const NOTICE_ICON = { info: Info, warning: TriangleAlert, error: CircleAlert, success: CircleCheck }
/** Inline advisory box (learning phase, account issues, disapprovals). */
export function AmNotice({ tone = 'info', title, children, actions, onDismiss, className }: AmNoticeProps) {
  const I = NOTICE_ICON[tone]
  return (
    <div className={cx('am-notice', tone !== 'info' && `am-notice-${tone}`, className)} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="am-notice-icon"><I size={18} strokeWidth={2} /></span>
      <div className="am-notice-body">
        {title && <span className="am-notice-title">{title}</span>}
        {children && <div>{children}</div>}
        {actions && <div className="am-notice-actions">{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="am-notice-x" aria-label="Dismiss" onClick={onDismiss}><X size={16} strokeWidth={2} /></button>
      )}
    </div>
  )
}

export interface AmCardProps {
  title?: ReactNode
  subtitle?: ReactNode
  /** (i) tooltip next to the title */
  titleTip?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  /** body without padding (tables) */
  flush?: boolean
  /** collapsible section with chevron (create-flow sections) */
  collapsible?: boolean
  defaultCollapsed?: boolean
  className?: string
  style?: CSSProperties
  id?: string
}
/** White section card (create-flow sections, overview widgets). */
export function AmCard({ title, subtitle, titleTip, actions, children, flush, collapsible, defaultCollapsed, className, style, id }: AmCardProps) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed)
  return (
    <section className={cx('am-card', className)} style={style} id={id}>
      {(title || actions) && (
        <div className="am-card-head" style={collapsed ? { paddingBottom: 14 } : undefined}>
          <div className="am-card-titles">
            {title && <h3 className="am-card-title">{title}{titleTip && <InfoTip content={titleTip} />}</h3>}
            {subtitle && <span className="am-card-sub">{subtitle}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            {actions}
            {collapsible && (
              <button type="button" className="am-card-toggle" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand' : 'Collapse'} onClick={() => setCollapsed(c => !c)}>
                <ChevronDown size={18} strokeWidth={2} style={{ transform: collapsed ? 'rotate(-90deg)' : undefined, transition: 'transform 120ms' }} />
              </button>
            )}
          </div>
        </div>
      )}
      {!collapsed && children !== undefined && <div className={cx('am-card-body', flush && 'am-card-body-flush')}>{children}</div>}
    </section>
  )
}

export interface AmSegmentedProps<V extends string = string> {
  value: V
  onChange: (v: V) => void
  options: { value: V; label: ReactNode; disabled?: boolean }[]
  ariaLabel?: string
}
/** Compact segmented switch (e.g. Daily / Lifetime budget). */
export function AmSegmented<V extends string = string>({ value, onChange, options, ariaLabel }: AmSegmentedProps<V>) {
  return (
    <div className="am-seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          className={cx('am-seg-btn', o.value === value && 'am-seg-on')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tooltips
// ---------------------------------------------------------------------------
export interface AmTooltipProps {
  content: ReactNode
  /** bold first line */
  title?: ReactNode
  children: ReactNode
  placement?: FloatingPlacement
  wide?: boolean
  /** anchor is a block element */
  block?: boolean
  delay?: number
  theme?: AmTheme
}
/** Hover tooltip (white card on Fadbook, dark bubble on TikTak). */
export function AmTooltip({ content, title, children, placement = 'top', wide, block, delay = 200, theme }: AmTooltipProps) {
  const t = useAmTheme(theme)
  const anchor = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }
  if (content === null || content === undefined || content === '') return <>{children}</>
  return (
    <>
      <span ref={anchor} className="am-tip-anchor" style={block ? { display: 'flex', width: '100%' } : undefined} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        {children}
      </span>
      <Floating anchor={anchor} open={open} placement={placement} offset={6} passive className={amThemeClass(t)} zIndex={5400}>
        <div className={cx('am-tip', wide && 'am-tip-wide')} role="tooltip">
          {title && <span className="am-tip-title">{title}</span>}
          {content}
        </div>
      </Floating>
    </>
  )
}

/** (i) icon with a definition tooltip — column headers, form labels. */
export function InfoTip({ content, title, theme, size = 14 }: { content: ReactNode; title?: ReactNode; theme?: AmTheme; size?: number }) {
  return (
    <AmTooltip content={content} title={title} wide theme={theme}>
      <span className="am-infotip" tabIndex={0} role="img" aria-label="More information">
        <Info size={size} strokeWidth={2} />
      </span>
    </AmTooltip>
  )
}
