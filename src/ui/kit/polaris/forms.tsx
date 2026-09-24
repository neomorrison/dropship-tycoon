// Polaris form controls: TextField, Select, Checkbox, RadioButton, ChoiceList, TagsInput.
import {
  useEffect, useId, useLayoutEffect, useRef, useState,
  type FocusEvent, type KeyboardEvent, type ReactNode,
} from 'react'
import { Check, ChevronDown, ChevronUp, ChevronsUpDown, CircleX, Minus } from 'lucide-react'
import { cx } from '../common/utils'
import { Button } from './Button'
import { InlineError, Tag } from './display'
import './polaris.css'
import './forms.css'

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------
interface LabelledProps {
  id: string
  label?: ReactNode
  labelHidden?: boolean
  labelAction?: { content: ReactNode; onAction: () => void }
  requiredIndicator?: boolean
  helpText?: ReactNode
  error?: ReactNode | boolean
  footerExtra?: ReactNode
  children: ReactNode
  inline?: boolean
}
function Labelled({ id, label, labelHidden, labelAction, requiredIndicator, helpText, error, footerExtra, children, inline }: LabelledProps) {
  const errMsg = typeof error === 'boolean' ? null : error
  return (
    <div className={cx('p-field', inline && 'p-field-inline')}>
      {label !== undefined && (
        <div className={cx('p-label-row', labelHidden && 'p-visually-hidden')}>
          <label htmlFor={id} className={cx('p-label', requiredIndicator && 'p-label-required')}>{label}</label>
          {labelAction && (
            <span className="p-label-action">
              <Button variant="plain" onClick={labelAction.onAction}>{labelAction.content}</Button>
            </span>
          )}
        </div>
      )}
      {children}
      {(errMsg || footerExtra) && (
        <div className="p-field-footer">
          {errMsg ? <InlineError message={errMsg} id={`${id}-error`} /> : <span />}
          {footerExtra}
        </div>
      )}
      {helpText && <div className="p-help" id={`${id}-help`}>{helpText}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TextField
// ---------------------------------------------------------------------------
export interface TextFieldProps {
  label?: ReactNode
  labelHidden?: boolean
  /** small plain action at the right of the label (e.g. "Generate") */
  labelAction?: { content: ReactNode; onAction: () => void }
  value: string
  onChange?: (value: string) => void
  /** 'currency' = decimal keypad without spinner; 'number'/'integer' show the Polaris stepper */
  type?: 'text' | 'number' | 'integer' | 'currency' | 'email' | 'url' | 'password' | 'search' | 'tel'
  placeholder?: string
  /** text/node inside the field on the left, e.g. "$" */
  prefix?: ReactNode
  /** text/node inside the field on the right, e.g. "%" or "kg" */
  suffix?: ReactNode
  helpText?: ReactNode
  /** error message (or true to only style the field red) */
  error?: ReactNode | boolean
  /** textarea: true = auto-growing, number = fixed rows */
  multiline?: boolean | number
  /** max auto-grow height in px for multiline (default 320) */
  maxHeight?: number
  maxLength?: number
  showCharacterCount?: boolean
  /** soft character guide shown as "42/70" and red when exceeded (does not block typing) */
  recommendedLength?: number
  disabled?: boolean
  readOnly?: boolean
  autoFocus?: boolean
  autoComplete?: string
  /** node attached to the left/right edge (e.g. a Select or Button) */
  connectedLeft?: ReactNode
  connectedRight?: ReactNode
  clearButton?: boolean
  onClearButtonClick?: () => void
  onBlur?: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onFocus?: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  /** called on Enter in single-line fields */
  onEnter?: () => void
  min?: number
  max?: number
  step?: number
  requiredIndicator?: boolean
  monospaced?: boolean
  align?: 'left' | 'center' | 'right'
  size?: 'slim' | 'medium'
  selectTextOnFocus?: boolean
  /** id of a <datalist> offering autocomplete suggestions (single-line only) */
  list?: string
  id?: string
  name?: string
  className?: string
}

/** Polaris text input with label, prefix/suffix, multiline, counter and inline error. */
export function TextField({
  label, labelHidden, labelAction, value, onChange, type = 'text', placeholder, prefix, suffix, helpText, error, multiline,
  maxHeight = 320, maxLength, showCharacterCount, recommendedLength, disabled, readOnly, autoFocus, autoComplete = 'off',
  connectedLeft, connectedRight, clearButton, onClearButtonClick, onBlur, onFocus, onKeyDown, onEnter, min, max, step = 1,
  requiredIndicator, monospaced, align, size = 'medium', selectTextOnFocus, list, id: idProp, name, className,
}: TextFieldProps) {
  const autoId = useId()
  const id = idProp ?? `p-tf${autoId.replace(/:/g, '')}`
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const isNumber = type === 'number' || type === 'integer'
  const rows = typeof multiline === 'number' ? multiline : 2

  // auto-grow textarea
  useLayoutEffect(() => {
    if (multiline !== true) return
    const el = inputRef.current as HTMLTextAreaElement | null
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(maxHeight, el.scrollHeight + 2)}px`
  }, [value, multiline, maxHeight])

  const stepBy = (dir: 1 | -1) => {
    const cur = parseFloat(value || '0')
    const base = Number.isFinite(cur) ? cur : 0
    let next = base + dir * step
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    const decimals = (String(step).split('.')[1] ?? '').length
    onChange?.(type === 'integer' ? String(Math.round(next)) : next.toFixed(decimals))
  }

  const common = {
    id,
    name,
    className: 'p-input-el',
    value,
    placeholder,
    disabled,
    readOnly,
    autoFocus,
    autoComplete,
    maxLength,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': helpText ? `${id}-help` : undefined,
    onChange: (e: { target: { value: string } }) => {
      let v = e.target.value
      if (type === 'integer') v = v.replace(/[^\d-]/g, '')
      if (type === 'currency') v = v.replace(/[^\d.]/g, '')
      onChange?.(v)
    },
    onFocus: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(true)
      if (selectTextOnFocus) e.target.select()
      onFocus?.(e)
    },
    onBlur: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(false)
      onBlur?.(e)
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (isNumber && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        stepBy(e.key === 'ArrowUp' ? 1 : -1)
      }
      if (!multiline && e.key === 'Enter') onEnter?.()
      onKeyDown?.(e)
    },
  }

  const count = recommendedLength ?? maxLength
  const counter = (showCharacterCount || recommendedLength) && (
    <span className={cx('p-charcount', recommendedLength !== undefined && value.length > recommendedLength && 'p-charcount-over')}>
      {value.length}{count ? `/${count}` : ''}
    </span>
  )

  const field = (
    <div
      className={cx(
        'p-input', focused && 'p-input-focused', error && 'p-input-error', disabled && 'p-input-disabled',
        readOnly && 'p-input-readonly', multiline && 'p-input-multi', monospaced && 'p-input-mono',
        align && align !== 'left' && `p-input-align-${align}`, size === 'slim' && 'p-input-slim',
        type === 'search' && 'p-input-search',
        connectedLeft && 'p-input-connected-left', connectedRight && 'p-input-connected-right',
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {prefix !== undefined && <span className="p-input-prefix">{prefix}</span>}
      {multiline ? (
        <textarea {...common} ref={el => { inputRef.current = el }} rows={rows} style={{ maxHeight }} />
      ) : (
        <input
          {...common}
          ref={el => { inputRef.current = el }}
          type={isNumber || type === 'currency' ? 'text' : type}
          inputMode={type === 'integer' ? 'numeric' : isNumber || type === 'currency' ? 'decimal' : undefined}
          min={min}
          max={max}
          list={list}
        />
      )}
      {clearButton && value && !disabled && (
        <button
          type="button"
          className="p-input-clear"
          aria-label="Clear"
          onClick={e => {
            e.stopPropagation()
            if (onClearButtonClick) onClearButtonClick()
            else onChange?.('')
          }}
        >
          <CircleX size={16} strokeWidth={2} />
        </button>
      )}
      {suffix !== undefined && <span className="p-input-suffix">{suffix}</span>}
      {isNumber && !disabled && !readOnly && (
        <span className="p-input-spinner" onClick={e => e.stopPropagation()}>
          <button type="button" tabIndex={-1} aria-label="Increase" onClick={() => stepBy(1)}><ChevronUp size={12} strokeWidth={2.5} /></button>
          <button type="button" tabIndex={-1} aria-label="Decrease" onClick={() => stepBy(-1)}><ChevronDown size={12} strokeWidth={2.5} /></button>
        </span>
      )}
    </div>
  )

  return (
    <div className={className}>
      <Labelled
        id={id}
        label={label}
        labelHidden={labelHidden}
        labelAction={labelAction}
        requiredIndicator={requiredIndicator}
        helpText={helpText}
        error={error}
        footerExtra={counter || undefined}
      >
        {connectedLeft || connectedRight ? (
          <div className="p-input-wrap">
            {connectedLeft && <div className="p-input-connection p-input-connection-left">{connectedLeft}</div>}
            {field}
            {connectedRight && <div className="p-input-connection p-input-connection-right">{connectedRight}</div>}
          </div>
        ) : (
          field
        )}
      </Labelled>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------
export interface SelectOption {
  label: string
  value: string
  disabled?: boolean
}
export interface SelectGroup {
  title: string
  options: SelectOption[]
}
export interface SelectProps {
  label?: ReactNode
  labelHidden?: boolean
  /** show the label inside the box, e.g. "Sort by  Newest" */
  labelInline?: boolean
  options: (string | SelectOption | SelectGroup)[]
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  helpText?: ReactNode
  error?: ReactNode | boolean
  disabled?: boolean
  size?: 'slim' | 'medium'
  id?: string
  className?: string
}
const normOpt = (o: string | SelectOption): SelectOption => (typeof o === 'string' ? { label: o, value: o } : o)
const isGroup = (o: string | SelectOption | SelectGroup): o is SelectGroup => typeof o === 'object' && 'options' in o

/** Native select styled like Polaris (keyboard + mobile friendly). */
export function Select({ label, labelHidden, labelInline, options, value, onChange, placeholder, helpText, error, disabled, size, id: idProp, className }: SelectProps) {
  const autoId = useId()
  const id = idProp ?? `p-sel${autoId.replace(/:/g, '')}`
  const flat: SelectOption[] = options.flatMap(o => (isGroup(o) ? o.options : [normOpt(o)]))
  const current = flat.find(o => o.value === value)
  const showPlaceholder = !current && placeholder
  return (
    <div className={className}>
      <Labelled id={id} label={labelInline ? undefined : label} labelHidden={labelHidden} helpText={helpText} error={error}>
        <div className={cx('p-select', error && 'p-select-error', disabled && 'p-select-disabled', size === 'slim' && 'p-select-slim')}>
          <select
            id={id}
            className="p-select-native"
            value={current ? value : ''}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-label={labelInline && typeof label === 'string' ? label : undefined}
            onChange={e => onChange?.(e.target.value)}
          >
            {(placeholder || !current) && <option value="" disabled>{placeholder ?? ''}</option>}
            {options.map((o, i) =>
              isGroup(o) ? (
                <optgroup key={`g${i}`} label={o.title}>
                  {o.options.map(op => <option key={op.value} value={op.value} disabled={op.disabled}>{op.label}</option>)}
                </optgroup>
              ) : (
                <option key={normOpt(o).value} value={normOpt(o).value} disabled={normOpt(o).disabled}>{normOpt(o).label}</option>
              ),
            )}
          </select>
          <div className="p-select-box" aria-hidden>
            {labelInline && label && <span className="p-select-inlinelabel">{label}</span>}
            <span className={cx('p-select-text', showPlaceholder && 'p-select-text-placeholder')}>
              {current ? current.label : placeholder ?? ''}
            </span>
            <span className="p-select-arrow"><ChevronsUpDown size={14} strokeWidth={2} /></span>
          </div>
        </div>
      </Labelled>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------
export interface CheckboxProps {
  label?: ReactNode
  labelHidden?: boolean
  /** true / false / 'indeterminate' (some rows selected) */
  checked: boolean | 'indeterminate'
  onChange?: (checked: boolean) => void
  helpText?: ReactNode
  disabled?: boolean
  error?: ReactNode | boolean
  id?: string
  className?: string
}
/** Polaris checkbox (dark fill when checked). */
export function Checkbox({ label, labelHidden, checked, onChange, helpText, disabled, error, id: idProp, className }: CheckboxProps) {
  const autoId = useId()
  const id = idProp ?? `p-cb${autoId.replace(/:/g, '')}`
  const ref = useRef<HTMLInputElement>(null)
  const indeterminate = checked === 'indeterminate'
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  const errMsg = typeof error === 'boolean' ? null : error
  return (
    <div className={cx('p-choice-wrap', className)}>
      <label className={cx('p-choice', disabled && 'p-choice-disabled', error && 'p-choice-error')} htmlFor={id} onClick={e => e.stopPropagation()}>
        <span className="p-choice-control">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            className="p-choice-input"
            checked={checked === true}
            disabled={disabled}
            aria-checked={indeterminate ? 'mixed' : checked === true}
            aria-label={labelHidden && typeof label === 'string' ? label : undefined}
            onChange={e => onChange?.(indeterminate ? true : e.target.checked)}
          />
          <span className={cx('p-checkbox-box', indeterminate && 'p-checkbox-box-indeterminate')}>
            {indeterminate ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
          </span>
        </span>
        {label !== undefined && <span className={cx('p-choice-label', labelHidden && 'p-visually-hidden')}>{label}</span>}
      </label>
      {helpText && <div className="p-choice-help">{helpText}</div>}
      {errMsg && <div className="p-choice-help"><InlineError message={errMsg} /></div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RadioButton
// ---------------------------------------------------------------------------
export interface RadioButtonProps {
  label: ReactNode
  labelHidden?: boolean
  checked: boolean
  /** called when this radio becomes selected */
  onChange?: (checked: boolean) => void
  helpText?: ReactNode
  name?: string
  value?: string
  disabled?: boolean
  id?: string
  className?: string
}
/** Single radio input. Prefer ChoiceList for groups. */
export function RadioButton({ label, labelHidden, checked, onChange, helpText, name, value, disabled, id: idProp, className }: RadioButtonProps) {
  const autoId = useId()
  const id = idProp ?? `p-rb${autoId.replace(/:/g, '')}`
  return (
    <div className={cx('p-choice-wrap', className)}>
      <label className={cx('p-choice', disabled && 'p-choice-disabled')} htmlFor={id}>
        <span className="p-choice-control">
          <input
            id={id}
            type="radio"
            className="p-choice-input"
            name={name}
            value={value}
            checked={checked}
            disabled={disabled}
            onChange={e => onChange?.(e.target.checked)}
          />
          <span className="p-radio-circle" />
        </span>
        <span className={cx('p-choice-label', labelHidden && 'p-visually-hidden')}>{label}</span>
      </label>
      {helpText && <div className="p-choice-help">{helpText}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChoiceList
// ---------------------------------------------------------------------------
export interface ChoiceListChoice {
  label: ReactNode
  value: string
  helpText?: ReactNode
  disabled?: boolean
  /** extra controls revealed under the choice (e.g. a threshold field) */
  renderChildren?: (isSelected: boolean) => ReactNode
}
export interface ChoiceListProps {
  title?: ReactNode
  titleHidden?: boolean
  choices: ChoiceListChoice[]
  /** selected values (one item for radio mode) */
  selected: string[]
  onChange?: (selected: string[]) => void
  /** checkboxes instead of radios */
  allowMultiple?: boolean
  /** lay choices out horizontally */
  inline?: boolean
  error?: ReactNode
  disabled?: boolean
  name?: string
  className?: string
}
/** Radio or checkbox group. `<ChoiceList title="Autopay" choices={…} selected={[v]} onChange={([v]) => …} />` */
export function ChoiceList({ title, titleHidden, choices, selected, onChange, allowMultiple, inline, error, disabled, name, className }: ChoiceListProps) {
  const autoId = useId()
  const group = name ?? `p-cl${autoId.replace(/:/g, '')}`
  return (
    <fieldset className={cx('p-choicelist', className)}>
      {title && <legend className={cx('p-choicelist-title', titleHidden && 'p-visually-hidden')}>{title}</legend>}
      <ul className={cx('p-choicelist-items', inline && 'p-choicelist-items-inline')}>
        {choices.map(c => {
          const isSel = selected.includes(c.value)
          const dis = disabled || c.disabled
          return (
            <li key={c.value}>
              {allowMultiple ? (
                <Checkbox
                  label={c.label}
                  checked={isSel}
                  disabled={dis}
                  helpText={c.helpText}
                  onChange={on => onChange?.(on ? [...selected, c.value] : selected.filter(v => v !== c.value))}
                />
              ) : (
                <RadioButton
                  label={c.label}
                  name={group}
                  value={c.value}
                  checked={isSel}
                  disabled={dis}
                  helpText={c.helpText}
                  onChange={() => onChange?.([c.value])}
                />
              )}
              {c.renderChildren && (() => {
                const node = c.renderChildren(isSel)
                return node ? <div className="p-choice-children">{node}</div> : null
              })()}
            </li>
          )
        })}
      </ul>
      {error && <InlineError message={error} />}
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// TagsInput
// ---------------------------------------------------------------------------
export interface TagsInputProps {
  label?: ReactNode
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  helpText?: ReactNode
  /** optional suggestions offered by the browser's autocomplete list */
  suggestions?: string[]
  maxTags?: number
  disabled?: boolean
}
/** Text field that turns Enter/comma-separated entries into removable tags (product tags, collections). */
export function TagsInput({ label, tags, onChange, placeholder = 'Add a tag and press Enter', helpText, suggestions, maxTags, disabled }: TagsInputProps) {
  const [draft, setDraft] = useState('')
  const listId = `p-tags${useId().replace(/:/g, '')}`
  const full = maxTags !== undefined && tags.length >= maxTags
  const commit = (raw: string) => {
    const parts = raw.split(',').map(t => t.trim()).filter(Boolean)
    if (!parts.length) return
    const next = [...tags]
    for (const p of parts) if (!next.some(t => t.toLowerCase() === p.toLowerCase()) && (maxTags === undefined || next.length < maxTags)) next.push(p)
    onChange(next)
    setDraft('')
  }
  return (
    <div>
      <TextField
        label={label}
        value={draft}
        placeholder={full ? `Maximum ${maxTags} tags` : placeholder}
        disabled={disabled || full}
        helpText={helpText}
        onChange={v => {
          if (v.endsWith(',')) commit(v)
          else setDraft(v)
        }}
        onEnter={() => commit(draft)}
        onBlur={() => commit(draft)}
        onKeyDown={e => {
          if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1))
        }}
        id={listId + '-input'}
        list={suggestions && suggestions.length ? listId : undefined}
      />
      {suggestions && suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.filter(s => !tags.includes(s)).map(s => <option key={s} value={s} />)}
        </datalist>
      )}
      {tags.length > 0 && (
        <div className="p-tags-list">
          {tags.map(t => (
            <Tag key={t} onRemove={disabled ? undefined : () => onChange(tags.filter(x => x !== t))}>{t}</Tag>
          ))}
        </div>
      )}
    </div>
  )
}
