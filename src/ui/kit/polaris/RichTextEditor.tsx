// Shopify product-description editor lookalike: toolbar (Paragraph/Heading,
// B / I / U, bulleted & numbered lists, clear formatting, </> HTML view) over a
// contentEditable area. Emits sanitized limited HTML (see richText.ts).
import { useCallback, useEffect, useId, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { Bold, ChevronDown, Code, Italic, List, ListOrdered, RemoveFormatting, Underline } from 'lucide-react'
import { cx } from '../common/utils'
import { InlineError } from './display'
import { ActionList, Popover, Tooltip } from './overlays'
import { plainToRichText, sanitizeRichText } from './richText'
import './polaris.css'
import './forms.css'
import './rte.css'

export type RteTool = 'format' | 'bold' | 'italic' | 'underline' | 'bullets' | 'numbers' | 'clear' | 'source'

export interface RichTextEditorProps {
  /** sanitized HTML (p/h3/ul/ol/li/strong/em/u/br) */
  value: string
  /** receives sanitized HTML on every edit */
  onChange: (html: string) => void
  label?: ReactNode
  labelHidden?: boolean
  placeholder?: string
  helpText?: ReactNode
  error?: ReactNode
  /** min editable height in px (default 180) */
  minHeight?: number
  /** max height before the area scrolls (default 480) */
  maxHeight?: number
  disabled?: boolean
  /** which toolbar buttons to show (default all) */
  tools?: RteTool[]
  /** content under the editor inside the frame (word meter, grader hints…) */
  footer?: ReactNode
  /** right side of the toolbar (e.g. "Rewrite with copywriter" button) */
  toolbarExtra?: ReactNode
  onFocus?: () => void
  onBlur?: () => void
  id?: string
}

const ALL_TOOLS: RteTool[] = ['format', 'bold', 'italic', 'underline', 'bullets', 'numbers', 'clear', 'source']
const EMPTY = '<p><br></p>'

interface ActiveState {
  bold: boolean
  italic: boolean
  underline: boolean
  ul: boolean
  ol: boolean
  block: 'p' | 'h3'
}
const NO_ACTIVE: ActiveState = { bold: false, italic: false, underline: false, ul: false, ol: false, block: 'p' }

/** Pretty-print the subset for the HTML view (one block per line). */
const prettyHtml = (html: string) =>
  html.replace(/<\/(p|h3|li)>/g, '</$1>\n').replace(/<(ul|ol)>/g, '<$1>\n').replace(/<\/(ul|ol)>/g, '</$1>\n').trim()

// execCommand is deprecated but remains the only cross-browser way to drive a
// contentEditable toolbar without a framework; wrap it so failures are harmless.
function exec(cmd: string, arg?: string) {
  try {
    document.execCommand(cmd, false, arg)
  } catch {
    /* unsupported command: ignore */
  }
}
function query(cmd: string): boolean {
  try {
    return document.queryCommandState(cmd)
  } catch {
    return false
  }
}

/**
 * `<RichTextEditor label="Description" value={html} onChange={setHtml} />`
 * Paste is sanitized; Enter creates paragraphs; Shift+Enter a line break.
 */
export function RichTextEditor({
  value, onChange, label, labelHidden, placeholder = 'Describe your product…', helpText, error, minHeight = 180, maxHeight = 480,
  disabled, tools = ALL_TOOLS, footer, toolbarExtra, onFocus, onBlur, id: idProp,
}: RichTextEditorProps) {
  const autoId = useId()
  const id = idProp ?? `p-rte${autoId.replace(/:/g, '')}`
  const editorRef = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [empty, setEmpty] = useState(!value)
  const [active, setActive] = useState<ActiveState>(NO_ACTIVE)
  const [formatOpen, setFormatOpen] = useState(false)
  const [source, setSource] = useState(false)
  const [sourceText, setSourceText] = useState('')

  // external value → DOM (never while the change came from us, so the caret stays put)
  useEffect(() => {
    const el = editorRef.current
    if (!el || value === lastEmitted.current) return
    el.innerHTML = value || EMPTY
    lastEmitted.current = value
    setEmpty(!el.textContent?.trim() && !el.querySelector('li'))
  }, [value, source])

  const emit = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    if (!el.innerHTML || el.innerHTML === '<br>') el.innerHTML = EMPTY
    const clean = sanitizeRichText(el.innerHTML)
    setEmpty(!el.textContent?.trim() && !el.querySelector('li'))
    if (clean !== lastEmitted.current) {
      lastEmitted.current = clean
      onChange(clean)
    }
  }, [onChange])

  const refreshActive = useCallback(() => {
    const el = editorRef.current
    const selNode = document.getSelection()?.anchorNode ?? null
    if (!el || !selNode || !el.contains(selNode)) return
    let block: 'p' | 'h3' = 'p'
    let n: Node | null = selNode
    while (n && n !== el) {
      if (n.nodeType === 1 && /^H[1-6]$/.test((n as Element).tagName)) block = 'h3'
      n = n.parentNode
    }
    setActive({
      bold: query('bold'), italic: query('italic'), underline: query('underline'),
      ul: query('insertUnorderedList'), ol: query('insertOrderedList'), block,
    })
  }, [])

  useEffect(() => {
    if (!focused) return
    document.addEventListener('selectionchange', refreshActive)
    return () => document.removeEventListener('selectionchange', refreshActive)
  }, [focused, refreshActive])

  const run = (cmd: string, arg?: string) => {
    if (disabled) return
    editorRef.current?.focus()
    exec('styleWithCSS', 'false')
    exec(cmd, arg)
    emit()
    refreshActive()
  }
  const setBlock = (tag: 'p' | 'h3') => run('formatBlock', tag === 'h3' ? 'H3' : 'P')

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    const clean = html ? sanitizeRichText(html) : plainToRichText(text)
    if (!clean) return
    // single paragraph → insert inline so pasting a phrase doesn't split the line
    const single = /^<p>((?:(?!<p>).)*)<\/p>$/.exec(clean)
    exec('insertHTML', single ? single[1] : clean)
    emit()
  }

  const toggleSource = () => {
    if (!source) {
      setSourceText(prettyHtml(value))
      setSource(true)
    } else {
      const clean = sanitizeRichText(sourceText.replace(/\n/g, ''))
      lastEmitted.current = null // force DOM refresh when the editor remounts
      onChange(clean)
      setSource(false)
    }
  }

  const has = (t: RteTool) => tools.includes(t)
  const btn = (key: RteTool, labelText: string, icon: ReactNode, on: boolean, action: () => void) =>
    has(key) && (
      <Tooltip key={key} content={labelText} hoverDelay={400}>
        <button
          type="button"
          className={cx('p-rte-btn', on && 'p-rte-btn-on')}
          aria-label={labelText}
          aria-pressed={on}
          disabled={disabled || (source && key !== 'source')}
          onMouseDown={e => e.preventDefault()}
          onClick={action}
        >
          {icon}
        </button>
      </Tooltip>
    )

  return (
    <div className="p-field">
      {label !== undefined && (
        <div className={cx('p-label-row', labelHidden && 'p-visually-hidden')}>
          <label className="p-label" htmlFor={id} onClick={() => editorRef.current?.focus()}>{label}</label>
        </div>
      )}
      <div className={cx('p-rte', focused && 'p-rte-focused', error && 'p-rte-error', disabled && 'p-rte-disabled')}>
        <div className="p-rte-toolbar" role="toolbar" aria-label="Formatting">
          {has('format') && (
            <Popover
              active={formatOpen}
              onClose={() => setFormatOpen(false)}
              activator={
                <button
                  type="button"
                  className="p-rte-format"
                  disabled={disabled || source}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setFormatOpen(o => !o)}
                  aria-haspopup="menu"
                >
                  {active.block === 'h3' ? 'Heading' : 'Paragraph'}
                  <ChevronDown size={14} strokeWidth={2} />
                </button>
              }
            >
              <ActionList
                items={[
                  { content: 'Paragraph', active: active.block === 'p', checkable: true, onAction: () => setBlock('p') },
                  { content: <span className="p-rte-menu-h">Heading</span>, active: active.block === 'h3', checkable: true, onAction: () => setBlock('h3') },
                ]}
                onActionAnyItem={() => setFormatOpen(false)}
              />
            </Popover>
          )}
          {has('format') && <span className="p-rte-sep" />}
          {btn('bold', 'Bold', <Bold size={16} strokeWidth={2.25} />, active.bold, () => run('bold'))}
          {btn('italic', 'Italic', <Italic size={16} strokeWidth={2} />, active.italic, () => run('italic'))}
          {btn('underline', 'Underline', <Underline size={16} strokeWidth={2} />, active.underline, () => run('underline'))}
          {(has('bullets') || has('numbers')) && <span className="p-rte-sep" />}
          {btn('bullets', 'Bulleted list', <List size={16} strokeWidth={2} />, active.ul, () => run('insertUnorderedList'))}
          {btn('numbers', 'Numbered list', <ListOrdered size={16} strokeWidth={2} />, active.ol, () => run('insertOrderedList'))}
          {has('clear') && <span className="p-rte-sep" />}
          {btn('clear', 'Clear formatting', <RemoveFormatting size={16} strokeWidth={2} />, false, () => {
            run('removeFormat')
            if (active.block === 'h3') setBlock('p')
          })}
          <span className="p-rte-spacer" />
          {toolbarExtra}
          {btn('source', source ? 'Show editor' : 'Show HTML', <Code size={16} strokeWidth={2} />, source, toggleSource)}
        </div>
        {source ? (
          <textarea
            className="p-rte-source"
            value={sourceText}
            spellCheck={false}
            onChange={e => setSourceText(e.target.value)}
            onBlur={() => onChange(sanitizeRichText(sourceText.replace(/\n/g, '')))}
            style={{ minHeight, maxHeight }}
            aria-label="HTML source"
          />
        ) : (
          <div
            id={id}
            ref={editorRef}
            className={cx('p-rte-content', empty && 'p-rte-empty')}
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-invalid={error ? true : undefined}
            data-placeholder={placeholder}
            style={{ minHeight, maxHeight }}
            onInput={emit}
            onPaste={onPaste}
            onKeyUp={refreshActive}
            onMouseUp={refreshActive}
            onFocus={() => {
              setFocused(true)
              exec('defaultParagraphSeparator', 'p')
              onFocus?.()
            }}
            onBlur={() => {
              setFocused(false)
              emit()
              onBlur?.()
            }}
          />
        )}
        {footer && <div className="p-rte-footer">{footer}</div>}
      </div>
      {error && <InlineError message={error} />}
      {helpText && <div className="p-help">{helpText}</div>}
    </div>
  )
}
