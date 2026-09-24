// Right-side edit panel for campaigns, ad sets and ads (single or bulk), with a Charts tab.
// Edits publish through sim/ads update* functions, which apply the real learning-reset and
// re-review consequences; the drawer warns before the player publishes them.
import { useEffect, useMemo, useState } from 'react'
import { ChartColumn, Pencil, RotateCcw } from 'lucide-react'
import type { Ad, AdLevel, AdSet, Campaign, GameState, Targeting } from '../../../core/types'
import { act } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { formatDate } from '../../../core/time'
import {
  MB_GATES, creativeInsights, featureUnlocked, learningProgress, requestAdReview, setEntityStatus, updateAd, updateAdSet, updateCampaign,
  validateTargeting, wouldResetLearning,
} from '../../../sim/ads'
import { AmButton, AmCard, AmField, AmInput, AmNotice, AmSelect, AmTag, SideDrawer, StatusCell, Toggle, amFmt } from '../../kit/adsmanager'
import { FbBudgetField, checkFbBudget } from './BudgetEdit'
import { ChartsView } from './ChartsView'
import { deliveryFor } from './columns'
import { entityNumericId, type AccountData, type Row } from './data'
import { conversionRanking, engagementRanking, qualityRanking } from './metrics'
import { AdCreativeEditor, AdPreviewPane, AudienceEditor, AudiencePane, CTA_LABEL, localAdError, type AdDraft } from './forms'
import type { DateRange } from '../../../core/time'

export interface DrawerTarget { level: AdLevel; ids: string[]; tab: 'edit' | 'charts' }

interface Props {
  s: GameState
  d: AccountData
  target: DrawerTarget | null
  rows: Row[]
  range: DateRange
  onClose: () => void
  onManageAudiences: () => void
  narrow?: boolean
}

const LEVEL_WORD: Record<AdLevel, [string, string]> = { campaign: ['campaign', 'campaigns'], adset: ['ad set', 'ad sets'], ad: ['ad', 'ads'] }

export function EditDrawer({ s, d, target, rows, range, onClose, onManageAudiences, narrow }: Props) {
  const [tab, setTab] = useState<'edit' | 'charts'>(target?.tab ?? 'edit')
  useEffect(() => {
    if (target) setTab(target.tab)
  }, [target])
  if (!target) return null
  const single = target.ids.length === 1
  const id = target.ids[0]
  const entity: Campaign | AdSet | Ad | undefined =
    target.level === 'campaign' ? d.campaignById.get(id) : target.level === 'adset' ? d.adSetById.get(id) : d.ads.find(a => a.id === id)
  if (!entity) return null
  const word = LEVEL_WORD[target.level]
  const title = single ? entity.name : `Edit ${target.ids.length} ${word[1]}`
  const subtitle = single ? `${word[0][0].toUpperCase()}${word[0].slice(1)} ID: ${entityNumericId(entity.id)}` : undefined
  const on = entity.status === 'active'
  const scopedRows = rows.filter(r => target.ids.includes(r.id))
  return (
    <SideDrawer
      inline
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      width={narrow ? 420 : 720}
      pauseGame
      tabs={[{ id: 'edit', label: <span className="fb-inline"><Pencil size={14} /> Edit</span> }, { id: 'charts', label: <span className="fb-inline"><ChartColumn size={14} /> Charts</span> }]}
      activeTab={tab}
      onTabChange={t => setTab(t as 'edit' | 'charts')}
      headerActions={single ? (
        <Toggle
          checked={on}
          ariaLabel={on ? 'Turn off' : 'Turn on'}
          onChange={v => act(g => setEntityStatus(g, target.level, id, v ? 'active' : 'paused'))}
        />
      ) : undefined}
    >
      {tab === 'charts' ? (
        <ChartsView s={s} d={d} level={target.level} rows={scopedRows} range={range} narrow />
      ) : !single ? (
        <BulkEdit s={s} d={d} level={target.level} ids={target.ids} onDone={onClose} />
      ) : target.level === 'campaign' ? (
        <CampaignEdit key={id} s={s} d={d} c={entity as Campaign} onDone={onClose} />
      ) : target.level === 'adset' ? (
        <AdSetEdit key={id} s={s} d={d} set={entity as AdSet} onDone={onClose} onManageAudiences={onManageAudiences} />
      ) : (
        <AdEdit key={id} s={s} d={d} ad={entity as Ad} row={scopedRows[0]} onDone={onClose} />
      )}
    </SideDrawer>
  )
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------
function CampaignEdit({ s, d, c, onDone }: { s: GameState; d: AccountData; c: Campaign; onDone: () => void }) {
  const sets = d.adSets.filter(x => x.campaignId === c.id)
  const [name, setName] = useState(c.name)
  const [cbo, setCbo] = useState(c.budgetMode === 'cbo')
  const [budget, setBudget] = useState(c.dailyBudget != null ? c.dailyBudget.toFixed(2) : '')
  const [bid, setBid] = useState<Campaign['bidStrategy']>(c.bidStrategy)
  const [cap, setCap] = useState(c.costCap != null ? c.costCap.toFixed(2) : '')
  const costCapOk = featureUnlocked(s, 'costCap')
  const n = parseFloat(budget)
  const budgetCheck = cbo ? checkFbBudget('campaign', c.budgetMode === 'cbo' ? c.id : null, c.dailyBudget, n, Math.max(1, sets.length)) : { change: null }
  const capN = parseFloat(cap)
  const capErr = bid === 'cost_cap' && !(capN > 0) ? 'Enter a cost per result goal.' : undefined
  const modeChanged = (cbo ? 'cbo' : 'abo') !== c.budgetMode
  const bidChanged = bid !== c.bidStrategy || (bid === 'cost_cap' && capN !== c.costCap)
  const dirty = name.trim() !== c.name || modeChanged || (cbo && !modeChanged && n !== c.dailyBudget) || bidChanged
  const errors = [!name.trim() && 'Enter a campaign name.', cbo && budgetCheck.error, capErr].filter(Boolean) as string[]
  const resetWarn = modeChanged ? 'Switching budget type resets learning for every ad set in this campaign.'
    : bidChanged ? 'Changing the bid strategy resets learning for every ad set in this campaign.'
      : undefined
  const publish = () => {
    act(g => {
      const patch: Parameters<typeof updateCampaign>[2] = {}
      if (name.trim() !== c.name) patch.name = name.trim()
      if (modeChanged) patch.budgetMode = cbo ? 'cbo' : 'abo'
      if (bidChanged) {
        patch.bidStrategy = bid
        if (bid === 'cost_cap') patch.costCap = capN
      }
      updateCampaign(g, c.id, patch)
      if (cbo && !modeChanged && n !== c.dailyBudget) updateCampaign(g, c.id, { dailyBudget: n })
    })
    onDone()
  }
  return (
    <div className="fb-drawer-body">
      <AmCard title="Campaign name">
        <AmInput value={name} onChange={setName} maxLength={400} ariaLabel="Campaign name" />
      </AmCard>
      <AmCard title="Campaign details">
        <dl className="fb-kv">
          <dt>Buying type</dt><dd>Auction</dd>
          <dt>Campaign objective</dt><dd>Sales</dd>
          <dt>Campaign setup</dt><dd>{c.kind === 'advantage' ? 'Advantage+ shopping campaign' : 'Manual sales campaign'}</dd>
          <dt>Created</dt><dd>{formatDate(Math.floor(c.createdHour / 24), 'short')}</dd>
        </dl>
      </AmCard>
      <AmCard title="Budget" titleTip="Advantage+ campaign budget (CBO) sets one budget on the campaign and shares it across ad sets based on performance.">
        <div className="fb-stack">
          <Toggle
            checked={cbo}
            disabled={c.kind === 'advantage'}
            onChange={setCbo}
            label={<span>Advantage+ campaign budget {c.kind === 'advantage' && <span className="fb-muted">(always on for Advantage+ shopping)</span>}</span>}
          />
          {cbo ? (
            modeChanged ? (
              <p className="fb-small fb-muted">The campaign budget will start at the sum of your ad set budgets ({amFmt.money(sets.reduce((a, x) => a + (x.dailyBudget ?? 0), 0))}). You can edit it after publishing.</p>
            ) : (
              <FbBudgetField level="campaign" id={c.id} current={c.dailyBudget} value={budget} onChange={setBudget} adSetCount={Math.max(1, sets.length)} />
            )
          ) : modeChanged ? (
            <p className="fb-small fb-muted">Each ad set will get an equal share of the campaign budget ({amFmt.money((c.dailyBudget ?? 0) / Math.max(1, sets.length))} per day, minimum $5.00).</p>
          ) : (
            <p className="fb-small fb-muted">Budgets are set on each ad set.</p>
          )}
        </div>
      </AmCard>
      <AmCard title="Campaign bid strategy" titleTip="Highest volume spends your budget to get the most results. A cost per result goal keeps the average cost near your goal but may spend less.">
        <AmField label="Bid strategy">
          <AmSelect
            value={bid}
            onChange={setBid}
            options={[
              { value: 'lowest_cost', label: 'Highest volume', description: 'Get the most results for your budget.' },
              {
                value: 'cost_cap', label: 'Cost per result goal', description: 'Aim for a certain cost per result while maximizing volume.',
                disabled: !costCapOk && c.bidStrategy !== 'cost_cap', disabledReason: `Unlocks at Media Buying level ${MB_GATES.costCap}.`,
              },
            ]}
            ariaLabel="Bid strategy"
          />
        </AmField>
        {bid === 'cost_cap' && (
          <AmField label="Cost per result goal" error={capErr} help="Delivery aims to keep the average cost per purchase at or below this. Set it too low and the campaign barely spends.">
            <AmInput value={cap} onChange={setCap} type="currency" prefix="$" suffix="USD" width={200} ariaLabel="Cost per result goal" />
          </AmField>
        )}
      </AmCard>
      {resetWarn && <AmNotice tone="warning" title="Significant edit">{resetWarn}</AmNotice>}
      <PublishBar disabled={!dirty || errors.length > 0} errors={errors} onPublish={publish} onCancel={onDone} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ad set
// ---------------------------------------------------------------------------
function AdSetEdit({ s, d, set, onDone, onManageAudiences }: { s: GameState; d: AccountData; set: AdSet; onDone: () => void; onManageAudiences: () => void }) {
  const c = d.campaignById.get(set.campaignId)
  const abo = c?.budgetMode === 'abo'
  const [name, setName] = useState(set.name)
  const [budget, setBudget] = useState(set.dailyBudget != null ? set.dailyBudget.toFixed(2) : '')
  const [opt, setOpt] = useState<AdSet['optimization']>(set.optimization)
  const [targeting, setTargeting] = useState<Targeting>(set.targeting)
  const lp = learningProgress(s, set.id)
  const n = parseFloat(budget)
  const budgetCheck = abo ? checkFbBudget('adset', set.id, set.dailyBudget, n) : { change: null }
  const targetingChanged = JSON.stringify(targeting) !== JSON.stringify(set.targeting)
  const tErr = targetingChanged ? validateTargeting(s, 'fadbook', targeting) : null
  const dirty = name.trim() !== set.name || (abo && n !== set.dailyBudget) || opt !== set.optimization || targetingChanged
  const errors = [!name.trim() && 'Enter an ad set name.', abo && budgetCheck.error, tErr].filter(Boolean) as string[]
  const resets = (opt !== set.optimization || targetingChanged) && set.impressions > 0
  const publish = () => {
    act(g => {
      updateAdSet(g, set.id, {
        name: name.trim() !== set.name ? name.trim() : undefined,
        dailyBudget: abo && n !== set.dailyBudget ? n : undefined,
        optimization: opt !== set.optimization ? opt : undefined,
        targeting: targetingChanged ? targeting : undefined,
      })
    })
    onDone()
  }
  return (
    <div className="fb-drawer-split">
      <div className="fb-drawer-body">
        {lp && lp.state !== 'active' && set.impressions > 0 && (
          <AmNotice tone={lp.state === 'learning' ? 'info' : 'warning'} title={lp.state === 'learning' ? 'Learning' : 'Learning limited'}>
            {lp.hasPixel
              ? `${lp.conversions} of ${lp.needed} ${set.optimization === 'add_to_cart' ? 'adds to cart' : 'purchases'} in the last 7 days. ${lp.state === 'learning' ? `About ${lp.daysLeft} day${lp.daysLeft === 1 ? '' : 's'} left in this learning window. Performance is less stable until it finishes.` : 'This ad set isn\'t getting enough conversions to exit learning. Combine ad sets, broaden the audience or raise the budget.'}`
              : 'Your pixel isn\'t sending purchase events, so delivery optimizes for clicks and can\'t exit learning.'}
          </AmNotice>
        )}
        <AmCard title="Ad set name">
          <AmInput value={name} onChange={setName} maxLength={400} ariaLabel="Ad set name" />
        </AmCard>
        <AmCard title="Conversion" titleTip="Where you want results and which pixel event counts as one.">
          <dl className="fb-kv">
            <dt>Conversion location</dt><dd>Website</dd>
            <dt>Performance goal</dt><dd>Maximize number of conversions</dd>
            <dt>Dataset</dt><dd>{s.store.name || 'Store'} Pixel</dd>
          </dl>
          <AmField label="Conversion event">
            <AmSelect
              value={opt}
              onChange={setOpt}
              options={[
                { value: 'purchase', label: 'Purchase', description: 'Optimize for people likely to buy.' },
                { value: 'add_to_cart', label: 'Add to cart', description: 'More events for learning, but people who add to cart don\'t always buy.' },
              ]}
              width={300}
              ariaLabel="Conversion event"
            />
          </AmField>
        </AmCard>
        {abo ? (
          <AmCard title="Budget & schedule">
            <FbBudgetField level="adset" id={set.id} current={set.dailyBudget} value={budget} onChange={setBudget} />
            <dl className="fb-kv"><dt>Schedule</dt><dd>Start {formatDate(Math.floor(set.createdHour / 24), 'short')} · No end date</dd></dl>
          </AmCard>
        ) : (
          <AmCard title="Budget & schedule">
            <p className="fb-small fb-muted">This ad set uses the campaign budget (Advantage+ campaign budget). Edit the budget on the campaign.</p>
          </AmCard>
        )}
        <AudienceEditor s={s} value={targeting} onChange={setTargeting} advantage={c?.kind === 'advantage'} onManageAudiences={onManageAudiences} />
        {resets && <AmNotice tone="warning" title="Significant edit">Changing the audience, placements or conversion event resets learning for this ad set.</AmNotice>}
        <PublishBar disabled={!dirty || errors.length > 0} errors={errors} onPublish={publish} onCancel={onDone} />
      </div>
      <aside className="fb-drawer-aside">
        <AudiencePane s={s} targeting={targeting} dailyBudget={abo ? n || 0 : (c?.dailyBudget ?? 0)} />
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ad
// ---------------------------------------------------------------------------
function AdEdit({ s, d, ad, row, onDone }: { s: GameState; d: AccountData; ad: Ad; row?: Row; onDone: () => void }) {
  const set = d.adSetById.get(ad.adSetId)
  const [draft, setDraft] = useState<AdDraft>({
    name: ad.name, storeProductId: ad.storeProductId, creativeId: ad.creativeId, primaryText: ad.primaryText, headline: ad.headline, cta: ad.cta,
  })
  const err = localAdError(s, draft)
  const contentChanged = draft.primaryText !== ad.primaryText || draft.headline !== ad.headline || draft.cta !== ad.cta
  const creativeChanged = draft.creativeId !== ad.creativeId || draft.storeProductId !== ad.storeProductId
  const dirty = draft.name.trim() !== ad.name || contentChanged || creativeChanged
  const tips = useMemo(() => creativeInsights(s, ad.creativeId), [s, ad.creativeId])
  const dl = deliveryFor(s, 'ad', ad.id, d)
  const totals = row?.st
  const publish = () => {
    act(g => updateAd(g, ad.id, {
      name: draft.name.trim() !== ad.name ? draft.name.trim() : undefined,
      primaryText: draft.primaryText, headline: draft.headline, cta: draft.cta, creativeId: draft.creativeId, storeProductId: draft.storeProductId,
    }))
    onDone()
  }
  return (
    <div className="fb-drawer-split">
      <div className="fb-drawer-body">
        <AmCard title="Delivery">
          <div className="fb-stack">
            <dl className="fb-kv">
              <dt>Delivery</dt><dd><StatusCell label={dl.label} tone={dl.tone} /></dd>
              <dt>Ad review</dt>
              <dd>
                <StatusCell
                  label={ad.review === 'approved' ? 'Approved' : ad.review === 'rejected' ? 'Rejected' : 'In review'}
                  tone={ad.review === 'approved' ? 'active' : ad.review === 'rejected' ? 'error' : 'review'}
                />
              </dd>
            </dl>
            {ad.review === 'rejected' && (
              <AmNotice
                tone="error"
                title="Ad rejected"
                actions={<AmButton size="sm" icon={RotateCcw} onClick={() => act(g => requestAdReview(g, ad.id))}>Request review</AmButton>}
              >
                {ad.rejectReason ?? 'This ad doesn\'t follow our Advertising Standards.'} Edit the ad and publish it again, or request another review if you think we got it wrong.
              </AmNotice>
            )}
            {ad.review === 'in_review' && <p className="fb-small fb-muted">Most ads are reviewed within 24 hours. Delivery starts automatically once approved.</p>}
          </div>
        </AmCard>
        {row && row.st.impressions >= 500 && (
          <AmCard title="Ad relevance diagnostics" titleTip="Compared with ads that competed for the same audience. Diagnostics need at least 500 impressions.">
            <dl className="fb-kv">
              <dt>Quality ranking</dt><dd><RankTag v={qualityRanking(row)} /></dd>
              <dt>Engagement rate ranking</dt><dd><RankTag v={engagementRanking(row)} /></dd>
              <dt>Conversion rate ranking</dt><dd><RankTag v={conversionRanking(row)} /></dd>
            </dl>
          </AmCard>
        )}
        {tips.length > 0 && (
          <AmCard title="Creative recommendations" titleTip="Based on how this creative performed across your ads.">
            <ul className="fb-list">{tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <AmButton size="sm" variant="link" onClick={() => openSite('studio', 'library')}>Open in CreatorHub</AmButton>
          </AmCard>
        )}
        <AdCreativeEditor s={s} draft={draft} onChange={setDraft} />
        {dirty && (
          <AmNotice tone="warning" title="Edits send the ad back to review">
            {creativeChanged
              ? 'Changing the creative or website URL resets learning for the ad set and restarts review. Consider duplicating the ad instead so the original keeps delivering.'
              : 'Changing text sends this ad back to review; it stops delivering until it\'s approved again.'}
          </AmNotice>
        )}
        <PublishBar disabled={!dirty || !!err} errors={err && dirty ? [err] : []} onPublish={publish} onCancel={onDone} />
      </div>
      <aside className="fb-drawer-aside">
        <AdPreviewPane s={s} draft={draft} placements={set?.targeting.placements ?? 'advantage'} stats={totals ? { likes: totals.likes, comments: totals.comments, shares: totals.shares } : undefined} />
        <p className="fb-small fb-muted">CTA: {CTA_LABEL[draft.cta]}</p>
      </aside>
    </div>
  )
}

function RankTag({ v }: { v: string }) {
  if (v === amFmt.dash) return <span className="fb-muted">{v}</span>
  const tone = v.startsWith('Above') ? 'green' : v === 'Average' ? 'neutral' : 'red'
  return <AmTag tone={tone}>{v}</AmTag>
}

// ---------------------------------------------------------------------------
// Bulk edit
// ---------------------------------------------------------------------------
function BulkEdit({ s, d, level, ids, onDone }: { s: GameState; d: AccountData; level: AdLevel; ids: string[]; onDone: () => void }) {
  const [pct, setPct] = useState('20')
  const [dir, setDir] = useState<'up' | 'down'>('up')
  const word = LEVEL_WORD[level]
  const budgets = ids.map(id => {
    if (level === 'campaign') {
      const c = d.campaignById.get(id)
      return c && c.budgetMode === 'cbo' && c.dailyBudget != null ? { id, name: c.name, amount: c.dailyBudget, level: 'campaign' as const, sets: d.adSets.filter(x => x.campaignId === id).length } : null
    }
    if (level === 'adset') {
      const set = d.adSetById.get(id)
      const c = set && d.campaignById.get(set.campaignId)
      return set && c?.budgetMode === 'abo' && set.dailyBudget != null ? { id, name: set.name, amount: set.dailyBudget, level: 'adset' as const, sets: 1 } : null
    }
    return null
  }).filter(Boolean) as { id: string; name: string; amount: number; level: 'campaign' | 'adset'; sets: number }[]
  const p = Math.max(0, Math.min(500, parseFloat(pct) || 0)) / 100
  const mult = dir === 'up' ? 1 + p : 1 - p
  const plan = budgets.map(b => {
    const next = Math.round(b.amount * mult * 100) / 100
    const check = checkFbBudget(b.level, b.id, b.amount, next, b.sets)
    return { ...b, next, check, resets: wouldResetLearning(s, b.level, b.id, next) }
  })
  const resetCount = plan.filter(x => x.resets).length
  const setAll = (on: boolean) => {
    act(g => { for (const id of ids) setEntityStatus(g, level, id, on ? 'active' : 'paused') })
    onDone()
  }
  const apply = () => {
    act(g => {
      for (const x of plan) {
        if (x.check.error) continue
        if (x.level === 'campaign') updateCampaign(g, x.id, { dailyBudget: x.next })
        else updateAdSet(g, x.id, { dailyBudget: x.next })
      }
    })
    onDone()
  }
  return (
    <div className="fb-drawer-body">
      <AmCard title="Delivery">
        <div className="fb-inline">
          <AmButton onClick={() => setAll(true)}>Turn on {ids.length} {word[1]}</AmButton>
          <AmButton onClick={() => setAll(false)}>Turn off {ids.length} {word[1]}</AmButton>
        </div>
      </AmCard>
      {level !== 'ad' && (
        <AmCard title="Adjust daily budgets" titleTip="Change every selected budget by the same percentage. Fadbook treats changes over 20% as significant edits.">
          {budgets.length === 0 ? (
            <p className="fb-small fb-muted">None of the selected {word[1]} has its own budget ({level === 'adset' ? 'they use campaign budget' : 'budgets are set on ad sets'}).</p>
          ) : (
            <div className="fb-stack">
              <div className="fb-inline">
                <AmSelect size="sm" width={140} value={dir} onChange={setDir} options={[{ value: 'up', label: 'Increase by' }, { value: 'down', label: 'Decrease by' }]} ariaLabel="Direction" />
                <AmInput size="sm" value={pct} onChange={setPct} type="number" suffix="%" width={110} ariaLabel="Percent" />
              </div>
              <table className="fb-mini">
                <thead><tr><th>Name</th><th>Current</th><th>New</th><th /></tr></thead>
                <tbody>
                  {plan.map(x => (
                    <tr key={x.id}>
                      <td>{x.name}</td>
                      <td>{amFmt.money(x.amount)}</td>
                      <td>{amFmt.money(x.next)}</td>
                      <td>{x.check.error ? <span className="fb-err-text">Below minimum</span> : x.resets ? <AmTag tone="yellow">Resets learning</AmTag> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resetCount > 0 && (
                <AmNotice tone="warning" title="Significant edits reset learning">
                  {resetCount} of {plan.length} budget{plan.length === 1 ? '' : 's'} will change enough to restart learning. Smaller steps (20% or less, once a day) keep delivery stable.
                </AmNotice>
              )}
              <div className="fb-inline">
                <AmButton variant="primary" disabled={!p || plan.every(x => x.check.error)} onClick={apply}>Apply to {plan.length} budget{plan.length === 1 ? '' : 's'}</AmButton>
              </div>
            </div>
          )}
        </AmCard>
      )}
    </div>
  )
}

function PublishBar({ disabled, errors, onPublish, onCancel }: { disabled: boolean; errors: string[]; onPublish: () => void; onCancel: () => void }) {
  return (
    <div className="fb-publishbar">
      <div className="fb-publishbar-msg">
        {errors.map((e, i) => <span key={i} className="fb-err-text">{e}</span>)}
      </div>
      <AmButton onClick={onCancel}>Close</AmButton>
      <AmButton variant="create" disabled={disabled} onClick={onPublish}>Publish</AmButton>
    </div>
  )
}
