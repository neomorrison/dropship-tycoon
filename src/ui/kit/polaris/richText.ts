// Rich-text helpers for product descriptions. The editor only ever produces this
// limited, attribute-free HTML subset, so graders and storefronts can trust it:
//   <p> <h3> <ul> <ol> <li> <strong> <em> <u> <br>
// Pure functions; work in the browser (DOMParser) and headless (regex fallback).

export const RICH_TEXT_TAGS = ['p', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'u', 'br'] as const

type Inline = { t: 'text'; v: string } | { t: 'br' } | { t: 'strong' | 'em' | 'u'; c: Inline[] }
type Block = { t: 'p' | 'h3'; c: Inline[] } | { t: 'ul' | 'ol'; items: Inline[][] }

const DROP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'iframe', 'object', 'embed', 'template', 'svg', 'canvas', 'video', 'audio', 'img', 'input', 'button', 'select', 'textarea'])
const BLOCKISH = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'figure', 'figcaption', 'address', 'dl', 'dt', 'dd', 'main', 'aside', 'nav'])

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function inlineMark(el: Element): 'strong' | 'em' | 'u' | null {
  const tag = el.tagName.toLowerCase()
  const inlineStyle = (el.getAttribute('style') ?? '').toLowerCase()
  // word processors wrap whole pastes in <b style="font-weight:normal">
  if ((tag === 'b' || tag === 'strong') && /font-weight\s*:\s*(normal|[1-4]00)/.test(inlineStyle)) return null
  if (tag === 'b' || tag === 'strong') return 'strong'
  if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'dfn') return 'em'
  if (tag === 'u' || tag === 'ins') return 'u'
  const style = (el.getAttribute('style') ?? '').toLowerCase()
  if (/font-weight\s*:\s*(bold|[6-9]00)/.test(style)) return 'strong'
  if (/font-style\s*:\s*italic/.test(style)) return 'em'
  if (/text-decoration[^;]*underline/.test(style)) return 'u'
  return null
}

/** Collect inline content of a node (nested blocks are flattened with <br> separators). */
function inlineOf(node: Node): Inline[] {
  const out: Inline[] = []
  node.childNodes.forEach(ch => {
    if (ch.nodeType === 3) {
      const v = (ch.textContent ?? '').replace(/\s+/g, ' ')
      if (v) out.push({ t: 'text', v })
      return
    }
    if (ch.nodeType !== 1) return
    const el = ch as Element
    const tag = el.tagName.toLowerCase()
    if (DROP.has(tag)) return
    if (tag === 'br') {
      out.push({ t: 'br' })
      return
    }
    const mark = inlineMark(el)
    const inner = inlineOf(el)
    if (BLOCKISH.has(tag) && out.length && out[out.length - 1].t !== 'br') out.push({ t: 'br' })
    if (mark) out.push({ t: mark, c: inner })
    else out.push(...inner)
  })
  return out
}

function blocksOf(root: Node): Block[] {
  const blocks: Block[] = []
  let para: Inline[] = []
  const flush = () => {
    if (para.length) blocks.push({ t: 'p', c: para })
    para = []
  }
  const listItems = (listEl: Element): Inline[][] => {
    const items: Inline[][] = []
    listEl.childNodes.forEach(ch => {
      if (ch.nodeType === 1) {
        const el = ch as Element
        const tag = el.tagName.toLowerCase()
        if (tag === 'li') {
          // nested lists inside an item become sibling items (keeps the subset flat)
          const own = document.createElement('div')
          const nested: Element[] = []
          el.childNodes.forEach(n => {
            if (n.nodeType === 1 && ['ul', 'ol'].includes((n as Element).tagName.toLowerCase())) nested.push(n as Element)
            else own.appendChild(n.cloneNode(true))
          })
          items.push(inlineOf(own))
          nested.forEach(n => items.push(...listItems(n)))
        } else if (tag === 'ul' || tag === 'ol') items.push(...listItems(el))
        else items.push(inlineOf(el))
      } else if (ch.nodeType === 3 && (ch.textContent ?? '').trim()) items.push([{ t: 'text', v: ch.textContent! }])
    })
    return items
  }
  root.childNodes.forEach(ch => {
    if (ch.nodeType === 3) {
      const v = (ch.textContent ?? '').replace(/\s+/g, ' ')
      if (v.trim() || para.length) para.push({ t: 'text', v })
      return
    }
    if (ch.nodeType !== 1) return
    const el = ch as Element
    const tag = el.tagName.toLowerCase()
    if (DROP.has(tag)) return
    if (tag === 'br') {
      // <br> between top-level inline runs = paragraph break
      flush()
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      flush()
      blocks.push({ t: tag, items: listItems(el) })
      return
    }
    if (tag === 'li') {
      flush()
      const last = blocks[blocks.length - 1]
      const item = inlineOf(el)
      if (last && last.t === 'ul') last.items.push(item)
      else blocks.push({ t: 'ul', items: [item] })
      return
    }
    if (/^h[1-6]$/.test(tag)) {
      flush()
      blocks.push({ t: 'h3', c: inlineOf(el) })
      return
    }
    if (BLOCKISH.has(tag)) {
      flush()
      // a div/section may itself contain blocks (pasted content) → recurse
      const hasBlockChild = Array.from(el.children).some(c => BLOCKISH.has(c.tagName.toLowerCase()))
      if (hasBlockChild && tag !== 'p') blocks.push(...blocksOf(el))
      else blocks.push({ t: 'p', c: inlineOf(el) })
      return
    }
    // inline wrapper around block content (pasted documents) → unwrap and keep the blocks
    if (Array.from(el.children).some(c => BLOCKISH.has(c.tagName.toLowerCase()))) {
      flush()
      blocks.push(...blocksOf(el))
      return
    }
    // inline element at top level → part of the current paragraph
    const mark = inlineMark(el)
    const inner = inlineOf(el)
    if (mark) para.push({ t: mark, c: inner })
    else para.push(...inner)
  })
  flush()
  return blocks
}

function renderInline(nodes: Inline[]): string {
  let s = ''
  for (const n of nodes) {
    if (n.t === 'text') s += esc(n.v)
    else if (n.t === 'br') s += '<br>'
    else {
      const inner = renderInline(n.c)
      if (inner.replace(/<br>/g, '').trim()) s += `<${n.t}>${inner}</${n.t}>`
      else s += inner
    }
  }
  return s
}
/** trim whitespace and stray <br> at both ends of an inline run */
function tidy(html: string): string {
  return html
    .replace(/^(\s|<br>)+/, '')
    .replace(/(\s|<br>)+$/, '')
    .replace(/ {2,}/g, ' ')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
}

function renderBlocks(blocks: Block[]): string {
  const out: string[] = []
  for (const b of blocks) {
    if ('items' in b) {
      const items = b.items.map(i => tidy(renderInline(i))).filter(Boolean)
      if (items.length) out.push(`<${b.t}>${items.map(i => `<li>${i}</li>`).join('')}</${b.t}>`)
    } else {
      const inner = tidy(renderInline(b.c))
      if (inner) out.push(`<${b.t}>${inner}</${b.t}>`)
    }
  }
  return out.join('')
}

function sanitizeFallback(html: string): string {
  let s = html
    .replace(/<(script|style|head|title|noscript|template|iframe|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(\/?)\s*b(\s[^>]*)?>/gi, '<$1strong>')
    .replace(/<\s*(\/?)\s*i(\s[^>]*)?>/gi, '<$1em>')
    .replace(/<\s*(\/?)\s*h[1-6](\s[^>]*)?>/gi, '<$1h3>')
    .replace(/<\s*(\/?)\s*div(\s[^>]*)?>/gi, '<$1p>')
  const allowed = new Set<string>(RICH_TEXT_TAGS)
  s = s.replace(/<\s*(\/?)\s*([a-z0-9]+)[^>]*>/gi, (_m, slash: string, tag: string) => {
    const t = tag.toLowerCase()
    if (!allowed.has(t)) return ''
    return t === 'br' ? '<br>' : `<${slash}${t}>`
  })
  s = s.replace(/<p>\s*(<br>)?\s*<\/p>/g, '').replace(/\s{2,}/g, ' ').trim()
  if (s && !/^<(p|h3|ul|ol)>/.test(s)) s = `<p>${s}</p>`
  return s
}

/**
 * Clean arbitrary HTML (editor output, pasted web content) down to the allowed subset:
 * b→strong, i→em, div→p, h1–h6→h3, attributes stripped, scripts/styles dropped,
 * stray inline text wrapped in <p>, empty paragraphs removed.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return ''
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') return sanitizeFallback(html)
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html')
  return renderBlocks(blocksOf(doc.body))
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

/** Plain text (blocks → newlines, list items → "• "). */
export function richTextToPlain(html: string): string {
  if (!html) return ''
  return decode(
    html
      .replace(/<li>/g, '• ')
      .replace(/<\/(p|h3|li)>/g, '\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<\/?(ul|ol)>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

export interface RichTextStats {
  words: number
  chars: number
  paragraphs: number
  bullets: number
  headings: number
  lists: number
}
/** Counts used by the description meter (words, bullets, headings…). */
export function richTextStats(html: string): RichTextStats {
  const plain = richTextToPlain(html).replace(/•/g, ' ')
  const words = plain.split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).length
  const count = (re: RegExp) => (html.match(re) ?? []).length
  return {
    words,
    chars: plain.length,
    paragraphs: count(/<p>/g),
    bullets: count(/<li>/g),
    headings: count(/<h3>/g),
    lists: count(/<(ul|ol)>/g),
  }
}

/**
 * Convert plain text to the rich-text subset: blank-line separated paragraphs,
 * lines starting with "-", "*" or "•" become bullet lists, "1." lines numbered lists.
 * Supplier descriptions are imported through this.
 */
export function plainToRichText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { t: 'ul' | 'ol'; items: string[] } | null = null
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(esc).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) out.push(`<${list.t}>${list.items.map(i => `<li>${esc(i)}</li>`).join('')}</${list.t}>`)
    list = null
  }
  for (const raw of lines) {
    const line = raw.trim()
    const bullet = /^([-*•●▪])\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      flushPara()
      const t = bullet ? 'ul' : 'ol'
      if (!list || list.t !== t) {
        flushList()
        list = { t, items: [] }
      }
      list.items.push((bullet ? bullet[2] : numbered![1]).trim())
    } else if (!line) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return out.join('')
}
