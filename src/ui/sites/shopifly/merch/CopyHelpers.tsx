// Skill-gated writing helpers under the description editor (SPEC §3, copywriting):
// L2 word & bullet meter, L4 benefit-word highlighter, L6 objection checklist.
// They read the grader's CopyMetrics for the unsaved draft.
import { useMemo, useState, type ReactNode } from 'react'
import { Check, Highlighter, Lock, X } from 'lucide-react'
import type { CopyMetrics } from '../../../../core/types'
import { richTextToPlain } from '../../../kit/polaris'

function Meter({ label, value, ok, hint }: { label: string; value: ReactNode; ok: boolean | null; hint: string }) {
  return (
    <span className={`sf-mx-meter${ok === true ? ' is-ok' : ok === false ? ' is-off' : ''}`} title={hint}>
      <span className="sf-mx-meter-v">{value}</span>
      <span className="sf-mx-meter-l">{label}</span>
    </span>
  )
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Plain-text preview with benefit words wrapped in <mark>. */
function Highlighted({ html, words }: { html: string; words: string[] }) {
  const parts = useMemo(() => {
    const text = richTextToPlain(html)
    const list = [...new Set(words.map(w => w.trim()).filter(w => w.length > 1))].sort((a, b) => b.length - a.length)
    if (!list.length) return [{ t: text, m: false }]
    const re = new RegExp(`\\b(${list.map(escapeRe).join('|')})\\w*`, 'gi')
    const out: { t: string; m: boolean }[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: text.slice(last, m.index), m: false })
      out.push({ t: m[0], m: true })
      last = m.index + m[0].length
      if (m[0].length === 0) re.lastIndex++
    }
    if (last < text.length) out.push({ t: text.slice(last), m: false })
    return out
  }, [html, words])
  return (
    <div className="sf-mx-highlight">
      {parts.map((p, i) => (p.m ? <mark key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>))}
    </div>
  )
}

export function CopyHelpers({ copy, level, html }: { copy: CopyMetrics | undefined; level: number; html: string }) {
  const [highlight, setHighlight] = useState(false)
  if (!copy) return null
  if (level < 2) {
    return (
      <div className="sf-mx-copyhelp">
        <span className="sf-mx-locked"><Lock size={12} /> Copywriting Lv 2 unlocks the word &amp; bullet meter</span>
      </div>
    )
  }
  const w = copy.words
  return (
    <div className="sf-mx-copyhelp">
      <div className="sf-mx-meters">
        <Meter label="words" value={w} ok={w >= 80 && w <= 400} hint="Product descriptions that sell are usually 80–400 words on mobile." />
        <Meter label="bullets" value={copy.bullets} ok={copy.bullets >= 3 && copy.bullets <= 7} hint="3–7 scannable bullet points." />
        <Meter label="headings" value={copy.headings} ok={copy.headings >= 1} hint="Headings break the page up for skimmers." />
        <Meter label="words / paragraph" value={copy.paragraphs ? Math.round(copy.avgParagraphWords) : '—'} ok={copy.paragraphs ? copy.avgParagraphWords <= 45 : null} hint="Short paragraphs read better on phones." />
        <Meter label="“you”" value={copy.youCount} ok={copy.youCount >= 3} hint="Talk to the shopper." />
        {level >= 4 && (
          <Meter label="benefit words" value={copy.benefitWords.length} ok={copy.benefitWords.length >= 4} hint="Outcome words (saves time, effortless, no mess…) and the product's selling points." />
        )}
      </div>
      {level >= 4 ? (
        <div className="sf-mx-copyrow">
          <button type="button" className={`sf-mx-chipbtn${highlight ? ' is-on' : ''}`} onClick={() => setHighlight(h => !h)}>
            <Highlighter size={13} /> {highlight ? 'Hide' : 'Highlight'} benefit words
          </button>
          {copy.supplierSimilarity >= 0.25 && <span className="sf-mx-warnchip">{Math.round(copy.supplierSimilarity * 100)}% matches the supplier listing</span>}
          {copy.spamTerms.length > 0 && <span className="sf-mx-warnchip">Supplier phrases: {copy.spamTerms.slice(0, 3).join(', ')}</span>}
          {copy.claimTerms.length > 0 && <span className="sf-mx-warnchip is-critical">Risky claims: {copy.claimTerms.join(', ')}</span>}
        </div>
      ) : (
        <span className="sf-mx-locked"><Lock size={12} /> Copywriting Lv 4 unlocks the benefit-word highlighter</span>
      )}
      {level >= 4 && highlight && <Highlighted html={html} words={copy.benefitWords} />}
      {level >= 6 ? (
        copy.objections.length > 0 && (
          <div className="sf-mx-objections">
            <p className="sf-mx-objections-h">Buyer objections <span>(description + FAQ)</span></p>
            <ul>
              {copy.objections.map(o => (
                <li key={o.text} className={o.covered ? 'is-ok' : ''}>
                  {o.covered ? <Check size={13} /> : <X size={13} />} {o.text}
                </li>
              ))}
            </ul>
          </div>
        )
      ) : (
        <span className="sf-mx-locked"><Lock size={12} /> Copywriting Lv 6 unlocks the objection checklist</span>
      )}
    </div>
  )
}
