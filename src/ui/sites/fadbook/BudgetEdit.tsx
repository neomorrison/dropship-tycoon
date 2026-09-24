// Budget editing that follows the sim's real rules: minimums from sim/ads (Fadbook $5 per ad set,
// CBO $5 × ad sets) and the learning-phase reset test (wouldResetLearning), which compares
// against the budget at the last reset rather than just the current number.
import { useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { AdLevel } from '../../../core/types'
import { getGS } from '../../../core/store'
import { minDailyBudget, wouldResetLearning } from '../../../sim/ads'
import { AmButton, AmField, AmInput, AmTooltip, amFmt } from '../../kit/adsmanager'
import { Floating } from '../../kit/common'

export interface BudgetCheck { error?: string; warning?: string; change: number | null }

/** Validate a proposed daily budget for an existing (or new, id = null) campaign / ad set. */
export function checkFbBudget(level: 'campaign' | 'adset', id: string | null, current: number | null, next: number, adSetCount = 1): BudgetCheck {
  const min = minDailyBudget('fadbook', level, level === 'campaign' ? adSetCount : 1)
  if (!Number.isFinite(next) || next <= 0) return { error: 'Enter a daily budget.', change: null }
  if (next < min) {
    return {
      error: level === 'campaign' && adSetCount > 1
        ? `This campaign has ${adSetCount} ad sets, so its daily budget must be at least ${amFmt.money(min)} (${amFmt.money(min / adSetCount)} per ad set).`
        : `Your daily budget must be at least ${amFmt.money(min)}.`,
      change: null,
    }
  }
  if (next > 1_000_000) return { error: 'That budget is above the maximum allowed.', change: null }
  const change = current ? (next - current) / current : null
  if (id && current && next !== current) {
    let resets = false
    try {
      resets = wouldResetLearning(getGS(), level as AdLevel, id, next)
    } catch {
      resets = false
    }
    if (resets) {
      const pct = change !== null ? Math.round(Math.abs(change) * 100) : 0
      return {
        change,
        warning: `Significant edits reset learning. A ${pct}% budget ${next > current ? 'increase' : 'decrease'} will send ${level === 'campaign' ? 'this campaign\'s ad sets' : 'this ad set'} back into the learning phase, and performance may be less stable while it re-learns.`,
      }
    }
  }
  return { change }
}

export interface FbBudgetCellProps {
  level: 'campaign' | 'adset'
  id: string
  amount: number
  adSetCount?: number
  onSave: (next: number) => void
  lockedReason?: string
}

/** Inline "$50.00 · Daily" budget with a click-to-edit popover (Ads Manager table cell). */
export function FbBudgetCell({ level, id, amount, adSetCount = 1, onSave, lockedReason }: FbBudgetCellProps) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const next = parseFloat(draft)
  const check = open ? checkFbBudget(level, id, amount, next, adSetCount) : { change: null }
  const save = () => {
    if (check.error || !Number.isFinite(next) || next === amount) return
    onSave(Math.round(next * 100) / 100)
    setOpen(false)
  }
  const btn = (
    <button
      ref={anchor}
      type="button"
      className="am-budget-btn"
      disabled={!!lockedReason}
      onClick={e => {
        e.stopPropagation()
        if (lockedReason) return
        setDraft(amount.toFixed(2))
        setOpen(true)
      }}
    >
      {!lockedReason && <Pencil size={12} strokeWidth={2} />}
      {amFmt.money(amount)}
    </button>
  )
  return (
    <span className="am-budget" onClick={e => e.stopPropagation()}>
      {lockedReason ? <AmTooltip content={lockedReason}>{btn}</AmTooltip> : btn}
      <span className="am-budget-period">Daily</span>
      <Floating anchor={anchor} open={open} onClose={() => setOpen(false)} placement="bottom-end" className="am-root am-theme-fadbook">
        <div className="am-menu am-budget-pop fb-budget-pop" role="dialog" aria-label="Edit budget">
          <span className="am-budget-pop-title">Daily budget</span>
          <AmField
            error={draft ? check.error : undefined}
            warning={check.warning}
            help={`Minimum ${amFmt.money(minDailyBudget('fadbook', level, level === 'campaign' ? adSetCount : 1))} per day. Actual daily spend can be up to 75% higher on some days, averaging out over the week.`}
          >
            <AmInput value={draft} onChange={setDraft} type="currency" prefix="$" suffix="USD" autoFocus selectOnFocus onEnter={save} ariaLabel="Daily budget" />
          </AmField>
          {check.change !== null && Number.isFinite(next) && next !== amount && (
            <span className={`am-budget-delta ${check.change > 0 ? 'am-budget-delta-up' : 'am-budget-delta-down'}`}>
              {check.change > 0 ? '+' : '−'}
              {Math.abs(check.change * 100).toFixed(0)}% vs. current {amFmt.money(amount)}
            </span>
          )}
          <div className="am-budget-pop-actions">
            <AmButton size="sm" onClick={() => setOpen(false)}>Cancel</AmButton>
            <AmButton size="sm" variant="primary" disabled={!!check.error || !Number.isFinite(next) || next === amount} onClick={save}>
              {check.warning ? 'Save anyway' : 'Save'}
            </AmButton>
          </div>
        </div>
      </Floating>
    </span>
  )
}

/** Budget input for forms (create flow, edit drawer). */
export function FbBudgetField({
  label = 'Daily budget', level, id, current, value, onChange, adSetCount = 1, help,
}: {
  label?: string
  level: 'campaign' | 'adset'
  id: string | null
  current: number | null
  value: string
  onChange: (v: string) => void
  adSetCount?: number
  help?: string
}) {
  const n = parseFloat(value)
  const check = checkFbBudget(level, id, current, n, adSetCount)
  return (
    <AmField
      label={label}
      labelTip="Your daily budget is the average amount you're willing to spend on this each day. On some days delivery may spend more or less, but over a calendar week it won't exceed 7 × your daily budget."
      error={value ? check.error : undefined}
      warning={check.warning}
      help={help ?? `Minimum ${amFmt.money(minDailyBudget('fadbook', level, level === 'campaign' ? adSetCount : 1))} per day.`}
    >
      <AmInput value={value} onChange={onChange} type="currency" prefix="$" suffix="USD" ariaLabel={label} width={220} />
    </AmField>
  )
}
