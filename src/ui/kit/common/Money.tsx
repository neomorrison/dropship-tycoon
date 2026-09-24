import { money } from '../../../core/format'
import { cx } from './utils'
import './common.css'

export interface MoneyProps {
  amount: number
  /** show cents (default true) */
  cents?: boolean
  /** $12.3K / $1.25M for large values */
  compact?: boolean
  /** prefix "+" on positive values */
  sign?: boolean
  /**
   * 'auto' → green when > 0, red when < 0; 'positive' / 'negative' force a tone;
   * 'none' (default) inherits the text color.
   */
  tone?: 'none' | 'auto' | 'positive' | 'negative' | 'subdued'
  /** strikethrough (compare-at prices) */
  strike?: boolean
  /** append " USD" like Shopify order totals */
  currencyCode?: boolean
  className?: string
}

/** Formatted USD amount with tabular numerals. */
export function Money({ amount, cents = true, compact, sign, tone = 'none', strike, currencyCode, className }: MoneyProps) {
  const t = tone === 'auto' ? (amount > 0 ? 'positive' : amount < 0 ? 'negative' : 'none') : tone
  return (
    <span className={cx('kx-money', t !== 'none' && `kx-money-${t}`, strike && 'kx-money-strike', className)}>
      {money(amount, { cents, compact, sign })}
      {currencyCode && <span className="kx-money-code"> USD</span>}
    </span>
  )
}
