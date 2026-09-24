// Card grid for formats, hooks and angles. Cards carry only neutral, product-agnostic copy
// from data/creativeTaxonomy.ts: what the option is and how it plays on screen, never which
// products it suits.
import type { ReactNode } from 'react'
import { Check, ShieldAlert } from 'lucide-react'
import { cx } from '../../../kit/common'
import type { TaxonomyItem } from '../../../../data/creativeTaxonomy'
import { TaxIcon } from '../icons'

export function OptionStep<T extends string, I extends TaxonomyItem<T>>({ items, value, onChange, meta, detail, label, compact }: {
  items: I[]
  value: T | null
  onChange: (id: T) => void
  /** small chips under the card text */
  meta?: (item: I) => ReactNode
  /** extra content in the detail panel of the selected card */
  detail?: (item: I) => ReactNode
  label: string
  compact: boolean
}) {
  const sel = items.find(i => i.id === value) ?? null
  return (
    <div className="ch-options">
      <div className={cx('ch-option-grid', compact && 'is-compact')} role="radiogroup" aria-label={label}>
        {items.map(it => {
          const on = it.id === value
          return (
            <button
              key={it.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={cx('ch-option', on && 'is-on')}
              onClick={() => onChange(it.id)}
            >
              <span className="ch-option-top">
                <span className="ch-option-icon"><TaxIcon name={it.icon} size={17} /></span>
                <span className="ch-option-name">{it.name}</span>
                {on && <span className="ch-option-check"><Check size={12} strokeWidth={3} /></span>}
              </span>
              <span className="ch-option-short">{it.short}</span>
              {meta && <span className="ch-option-meta">{meta(it)}</span>}
            </button>
          )
        })}
      </div>
      {sel && (
        <div className="ch-detail" aria-live="polite">
          <div className="ch-detail-head">
            <span className="ch-option-icon is-on"><TaxIcon name={sel.icon} size={17} /></span>
            <div>
              <b>{sel.name}</b>
              <p>{sel.description}</p>
            </div>
          </div>
          {sel.examples.length > 0 && (
            <div className="ch-detail-block">
              <span className="ch-kicker">Examples</span>
              <ul className="ch-examples">
                {sel.examples.map(e => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}
          {detail?.(sel)}
        </div>
      )}
    </div>
  )
}

export function PolicyNote({ children }: { children: ReactNode }) {
  return (
    <div className="ch-policy">
      <ShieldAlert size={15} strokeWidth={2.2} />
      <span>{children}</span>
    </div>
  )
}
