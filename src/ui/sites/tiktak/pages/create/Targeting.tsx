// Ad group targeting editor (automatic vs custom: location, gender, age, custom audiences,
// interests & behaviors) plus the audience-size / estimated-results side card.
import { useMemo, useState } from 'react'
import type { GameState, Targeting } from '../../../../../core/types'
import { DEFAULT_TARGETING, estimateDailyResults, searchInterestsDetailed } from '../../../../../sim/ads'
import { AmField, AmNotice, AmRadioCard, AmSearch, AmSegmented, AmSelect, AmTag, AudienceGauge, AmCard, amFmt } from '../../../../kit/adsmanager'
import { cx } from '../../../../kit/common'
import { Sparkles, SlidersHorizontal } from 'lucide-react'

const AGE_BUCKETS: { label: string; from: number; to: number }[] = [
  { label: '18-24', from: 18, to: 24 },
  { label: '25-34', from: 25, to: 34 },
  { label: '35-44', from: 35, to: 44 },
  { label: '45-54', from: 45, to: 54 },
  { label: '55+', from: 55, to: 65 },
]

const peopleFmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)))

/** Is this targeting anything other than TikTak's automatic (broad, all demographics)? */
export function isCustomTargeting(t: Targeting): boolean {
  return t.type !== 'broad' || t.gender !== 'all' || t.ageMin > 18 || t.ageMax < 65
}

export function targetingSummary(s: GameState, t: Targeting): string {
  const parts: string[] = [t.geo === 'T1' ? 'Tier 1 countries' : 'United States']
  if (!isCustomTargeting(t)) return `${parts[0]} · Automatic targeting`
  parts.push(t.gender === 'all' ? 'All genders' : t.gender === 'female' ? 'Female' : 'Male')
  parts.push(t.ageMin <= 18 && t.ageMax >= 65 ? 'All ages' : `${t.ageMin}-${t.ageMax >= 65 ? '55+' : t.ageMax}`)
  if (t.type === 'interest') parts.push(`${t.interests.length} interest${t.interests.length === 1 ? '' : 's'}`)
  if (t.type === 'lookalike' || t.type === 'retargeting') parts.push(s.ads.audiences.find(a => a.id === t.audienceId)?.name ?? 'Custom audience')
  return parts.join(' · ')
}

export interface TargetingEditorProps {
  s: GameState
  value: Targeting
  onChange: (t: Targeting) => void
  /** Smart+ campaigns: automatic targeting only */
  locked?: boolean
}

export function TargetingEditor({ s, value, onChange, locked }: TargetingEditorProps) {
  const [mode, setMode] = useState<'auto' | 'custom'>(() => (isCustomTargeting(value) ? 'custom' : 'auto'))
  const [q, setQ] = useState('')
  const audiences = useMemo(() => s.ads.audiences.filter(a => a.platform === 'tiktak'), [s.ads.audiences])
  const results = useMemo(() => searchInterestsDetailed(q, 'tiktak', 30), [q])
  const set = (patch: Partial<Targeting>) => {
    const next: Targeting = { ...value, ...patch }
    // derive the targeting type from what's selected
    const aud = audiences.find(a => a.id === next.audienceId)
    if (aud) { next.type = aud.kind; next.interests = [] }
    else { next.audienceId = null; next.type = next.interests.length ? 'interest' : 'broad' }
    onChange(next)
  }
  const pickMode = (m: 'auto' | 'custom') => {
    setMode(m)
    if (m === 'auto') onChange({ ...DEFAULT_TARGETING, geo: value.geo })
  }
  const bucketOn = (b: typeof AGE_BUCKETS[number]) => value.ageMin <= b.from && value.ageMax >= b.to
  const toggleBucket = (b: typeof AGE_BUCKETS[number]) => {
    // from "All", picking an age group narrows to just that group (like TikTok's age chips)
    if (allAges) { set({ ageMin: b.from, ageMax: b.to }); return }
    const idx = AGE_BUCKETS.indexOf(b)
    const onIdx = AGE_BUCKETS.map((x, i) => (bucketOn(x) ? i : -1)).filter(i => i >= 0)
    const lo = Math.min(...onIdx)
    const hi = Math.max(...onIdx)
    let from = lo
    let to = hi
    if (!bucketOn(b)) {
      // adding a group: the range stays continuous, so groups in between are included
      from = Math.min(lo, idx)
      to = Math.max(hi, idx)
    } else if (idx === lo && idx === hi) {
      // removing the only group: back to all ages
      set({ ageMin: 18, ageMax: 65 })
      return
    } else if (idx === lo) from = lo + 1
    else if (idx === hi) to = hi - 1
    else {
      // a group in the middle can't leave a gap: drop it together with the shorter side
      if (idx - lo <= hi - idx) from = idx + 1
      else to = idx - 1
    }
    set({ ageMin: AGE_BUCKETS[from].from, ageMax: AGE_BUCKETS[to].to })
  }
  const toggleInterest = (name: string) => {
    const has = value.interests.includes(name)
    set({ interests: has ? value.interests.filter(i => i !== name) : [...value.interests, name].slice(0, 25) })
  }
  const allAges = value.ageMin <= 18 && value.ageMax >= 65

  const location = (
    <AmField label="Location" labelTip="Where people who see your ads live.">
      <AmSelect
        value={value.geo}
        onChange={g => set({ geo: g })}
        options={[
          { value: 'US', label: 'United States' },
          { value: 'T1', label: 'Tier 1 countries', description: 'United States, Canada, United Kingdom, Australia, New Zealand, Ireland. Ships further, so check your delivery times.' },
        ]}
      />
    </AmField>
  )

  if (locked) {
    return (
      <div className="tt-fields">
        {location}
        <AmNotice tone="info" title="Smart+ targeting">Smart+ campaigns use automatic targeting. Delivery finds buyers from your videos and pixel data. Only location can be set.</AmNotice>
      </div>
    )
  }

  return (
    <div className="tt-fields">
      <div className="tt-choice-grid" role="radiogroup" aria-label="Targeting mode">
        <AmRadioCard checked={mode === 'auto'} onSelect={() => pickMode('auto')} icon={Sparkles} title="Automatic targeting" description="Delivery uses your videos, ad text and pixel data to find people likely to complete a payment." />
        <AmRadioCard checked={mode === 'custom'} onSelect={() => pickMode('custom')} icon={SlidersHorizontal} title="Custom targeting" description="Choose demographics, interests & behaviors, or a custom audience." />
      </div>
      {location}
      {mode === 'custom' && (
        <>
          <AmField label="Gender">
            <AmSegmented value={value.gender} onChange={g => set({ gender: g })} options={[{ value: 'all', label: 'All' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} ariaLabel="Gender" />
          </AmField>
          <AmField label="Age" help={allAges ? undefined : 'Ages between the ranges you pick are included, so the range stays continuous.'}>
            <div className="tt-agebtns">
              <button type="button" className={cx('tt-agebtn', allAges && 'tt-agebtn-on')} onClick={() => set({ ageMin: 18, ageMax: 65 })}>All</button>
              {AGE_BUCKETS.map(b => (
                <button key={b.label} type="button" className={cx('tt-agebtn', bucketOn(b) && !allAges && 'tt-agebtn-on')} onClick={() => toggleBucket(b)}>{b.label}</button>
              ))}
            </div>
          </AmField>
          <AmField label="Audience" labelTip="Target people from a custom audience you built in Tools › Audiences." optional>
            <AmSelect
              value={value.audienceId ?? 'none'}
              onChange={v => set({ audienceId: v === 'none' ? null : v })}
              options={[
                { value: 'none', label: 'No custom audience' },
                ...audiences.map(a => ({ value: a.id, label: a.name, description: `${a.kind === 'lookalike' ? 'Lookalike audience' : 'Website traffic'} · ${peopleFmt(a.size)} people` })),
              ]}
            />
          </AmField>
          <AmField label="Interests & behaviors" labelTip="People who have shown interest in these topics or interacted with similar videos." optional>
            {value.audienceId ? (
              <span className="tt-muted tt-small">Interest targeting isn&apos;t combined with a custom audience in this ad group. Remove the audience to add interests.</span>
            ) : (
              <div className="tt-col" style={{ gap: 8 }}>
                {value.interests.length > 0 && (
                  <div className="tt-tags">
                    {value.interests.map(i => <AmTag key={i} tone="teal" onRemove={() => toggleInterest(i)}>{i}</AmTag>)}
                  </div>
                )}
                <AmSearch value={q} onChange={setQ} placeholder="Search interests or behaviors" />
                <div className="tt-interest-results">
                  {results.length === 0 && <span className="tt-muted tt-small" style={{ padding: 10 }}>No matches. Try a broader word.</span>}
                  {results.map(r => {
                    const on = value.interests.includes(r.name)
                    return (
                      <button key={r.id} type="button" className={cx('tt-interest', on && 'tt-interest-on')} onClick={() => toggleInterest(r.name)} aria-pressed={on}>
                        <span className="tt-interest-name"><b>{r.name}</b><span>{r.path}</span></span>
                        <span className="tt-interest-size">{peopleFmt(r.size)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </AmField>
        </>
      )}
    </div>
  )
}

/** Right-side card: audience size bar + estimated daily results. */
export function AudienceEstimate({ s, targeting, budget }: { s: GameState; targeting: Targeting; budget: number }) {
  const est = estimateDailyResults(s, 'tiktak', targeting, budget > 0 ? budget : 0)
  const range = ([a, b]: [number, number]) => (b < 1 ? 'Less than 1' : a === b ? amFmt.int(a) : `${amFmt.int(a)} – ${amFmt.int(b)}`)
  const lo = Math.round(est.audienceSize * 0.85)
  const hi = Math.round(est.audienceSize * 1.15)
  return (
    <AmCard title="Audience details">
      <div className="tt-est">
        <AudienceGauge estimate={[lo, hi]} note="Estimates are based on your targeting and may vary." />
        <div style={{ height: 1, background: 'var(--am-divider-soft)' }} />
        <span className="tt-strong" style={{ fontSize: 13 }}>Estimated daily results</span>
        {budget > 0 ? (
          <>
            <div className="tt-est-row"><span>Reach</span><b>{range(est.reach)}</b></div>
            <div className="tt-est-row"><span>Clicks (destination)</span><b>{range(est.linkClicks)}</b></div>
            <div className="tt-est-row"><span>Conversions</span><b>{est.conversions ? range(est.conversions) : 'Pixel required'}</b></div>
            <span className="tt-faint tt-small">Based on market averages for this audience, not on your videos. Real results depend on your creative and landing page.</span>
          </>
        ) : (
          <span className="tt-muted tt-small">Enter a budget to see estimates.</span>
        )}
      </div>
    </AmCard>
  )
}
