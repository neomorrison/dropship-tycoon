// "+ Create" flow: objective picker (only Sales is available), campaign setup (Advantage+
// shopping vs manual), then the 3-pane editor (campaign › ad set › ad tree, form, audience /
// preview pane) that publishes through sim/ads createCampaign / createAdSet / createAd.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Clapperboard, Download, Folder, LayoutGrid, Megaphone, MousePointerClick, RectangleHorizontal, ShoppingBag, Sparkles, Store, Users, X,
  SlidersHorizontal, MessagesSquare,
} from 'lucide-react'
import type { AdSet, Campaign, GameState, Targeting } from '../../../core/types'
import { act } from '../../../core/store'
import { openSite, usePauseWhileMounted } from '../../../core/ui'
import {
  DEFAULT_TARGETING, MB_GATES, accountSpendLimit, learningConversionsNeeded, createAd, createAdSet, createCampaign, featureUnlocked, hasPixel, setEntityStatus,
  validateAdInput, validateAdSetInput, validateCampaignInput, validateTargeting,
} from '../../../sim/ads'
import {
  AmButton, AmCard, AmField, AmInput, AmModal, AmNotice, AmRadioCard, AmSelect, AmTag, AmTooltip, Stepper, Toggle, amFmt, type StepDef,
} from '../../kit/adsmanager'
import { useLayer } from '../../kit/common'
import { FbBudgetField, checkFbBudget } from './BudgetEdit'
import { AdCreativeEditor, AdPreviewPane, AudienceEditor, AudiencePane, localAdError, type AdDraft } from './forms'

export type CreateStart =
  /** creativeId: preselect a ready creative (and its product) for the ad, e.g. from CreatorHub */
  | { mode: 'new'; creativeId?: string }
  | { mode: 'adset'; campaignId: string }
  | { mode: 'ad'; adSetId: string }

// ---------------------------------------------------------------------------
// Chooser (existing campaign / ad set vs new campaign)
// ---------------------------------------------------------------------------
export function CreateChooser({ s, options, onPick, onClose }: {
  s: GameState
  options: CreateStart[]
  onPick: (o: CreateStart) => void
  onClose: () => void
}) {
  const [pick, setPick] = useState(0)
  const label = (o: CreateStart) => {
    if (o.mode === 'new') return { title: 'Create new campaign', desc: 'Start from an objective, then set up the ad set and ad.' }
    if (o.mode === 'adset') {
      const c = s.ads.campaigns.find(x => x.id === o.campaignId)
      return { title: 'New ad set in an existing campaign', desc: `Add an ad set to "${c?.name ?? 'campaign'}". Its settings (objective, budget type, bid strategy) are reused.` }
    }
    const set = s.ads.adSets.find(x => x.id === o.adSetId)
    return { title: 'New ad in an existing ad set', desc: `Add an ad to "${set?.name ?? 'ad set'}". Adding an ad to a delivering ad set restarts its learning phase.` }
  }
  return (
    <AmModal
      inline
      open
      onClose={onClose}
      title="Create"
      size="md"
      pauseGame
      footer={<><AmButton onClick={onClose}>Cancel</AmButton><AmButton variant="primary" onClick={() => onPick(options[pick])}>Continue</AmButton></>}
    >
      <div className="fb-stack" role="radiogroup">
        {options.map((o, i) => {
          const l = label(o)
          return <AmRadioCard key={i} checked={pick === i} onSelect={() => setPick(i)} title={l.title} description={l.desc} icon={o.mode === 'new' ? Megaphone : o.mode === 'adset' ? Users : Clapperboard} />
        })}
      </div>
    </AmModal>
  )
}

// ---------------------------------------------------------------------------
// Objective + setup modals
// ---------------------------------------------------------------------------
const OBJECTIVES = [
  { id: 'awareness', label: 'Awareness', icon: Megaphone, desc: 'Show your ads to people who are most likely to remember them.', good: ['Reach', 'Brand awareness', 'Video views'] },
  { id: 'traffic', label: 'Traffic', icon: MousePointerClick, desc: 'Send people to a destination, like your website or app.', good: ['Link clicks', 'Landing page views'] },
  { id: 'engagement', label: 'Engagement', icon: MessagesSquare, desc: 'Get more messages, video views, post engagement or Page likes.', good: ['Messages', 'Video views', 'Post engagement'] },
  { id: 'leads', label: 'Leads', icon: SlidersHorizontal, desc: 'Collect leads for your business or brand.', good: ['Instant forms', 'Calls', 'Sign-ups'] },
  { id: 'app', label: 'App promotion', icon: Download, desc: 'Find new people to install your app and continue using it.', good: ['App installs', 'App events'] },
  { id: 'sales', label: 'Sales', icon: ShoppingBag, desc: 'Find people likely to purchase your product or service.', good: ['Conversions', 'Catalog sales', 'Messages'] },
] as const

export function ObjectiveModal({ onContinue, onClose }: { onContinue: () => void; onClose: () => void }) {
  const [sel, setSel] = useState<string>('sales')
  const cur = OBJECTIVES.find(o => o.id === sel)!
  return (
    <AmModal
      inline
      open
      onClose={onClose}
      title="Create new campaign"
      size="lg"
      pauseGame
      footerLeft={<AmTooltip content="Objectives and buying types are explained in Ecom Academy."><AmButton variant="link" size="sm" onClick={() => openSite('academy', '')}>Learn more</AmButton></AmTooltip>}
      footer={<><AmButton onClick={onClose}>Cancel</AmButton><AmButton variant="primary" disabled={sel !== 'sales'} onClick={onContinue}>Continue</AmButton></>}
    >
      <div className="fb-objective">
        <div className="fb-objective-list" role="radiogroup" aria-label="Campaign objective">
          <div className="fb-objective-buying">
            <span className="fb-objective-h">Buying type</span>
            <AmSelect value="auction" onChange={() => {}} options={[{ value: 'auction', label: 'Auction' }]} width={180} size="sm" ariaLabel="Buying type" />
          </div>
          <span className="fb-objective-h">Choose a campaign objective</span>
          {OBJECTIVES.map(o => {
            const disabled = o.id !== 'sales'
            const on = sel === o.id
            const row = (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                className={`fb-obj-row${on ? ' fb-obj-on' : ''}`}
                onClick={() => setSel(o.id)}
              >
                <span className={`am-radio-dot${on ? ' am-radio-dot-on' : ''}`} aria-hidden />
                <span className={`fb-obj-icon fb-obj-icon-${o.id}`}><o.icon size={18} strokeWidth={2} /></span>
                <span className="fb-obj-label">{o.label}</span>
              </button>
            )
            return disabled ? (
              <AmTooltip key={o.id} placement="right" block content={`${o.label} campaigns optimize for ${o.good[0].toLowerCase()}, not purchases. For a store, Sales is the objective that finds buyers.`}>
                {row}
              </AmTooltip>
            ) : row
          })}
        </div>
        <div className="fb-objective-info">
          <ObjectiveArt />
          <h3>{cur.label}</h3>
          <p>{cur.desc}</p>
          <span className="fb-objective-h">Good for:</span>
          <div className="fb-objective-good">
            {cur.good.map(g => <span key={g} className="fb-objective-chip">{g}</span>)}
          </div>
        </div>
      </div>
    </AmModal>
  )
}

/** Flat illustration for the objective panel (storefront + cart + rising chart), Ads Manager style. */
function ObjectiveArt() {
  return (
    <svg className="fb-objective-art" viewBox="0 0 320 150" role="img" aria-label="">
      <rect x="0" y="0" width="320" height="150" rx="10" fill="#e7f0fd" />
      <circle cx="262" cy="36" r="46" fill="#d3e4fc" />
      <rect x="44" y="34" width="132" height="92" rx="8" fill="#ffffff" stroke="#c2d5f2" />
      <rect x="44" y="34" width="132" height="22" rx="8" fill="#0866ff" />
      <rect x="44" y="48" width="132" height="8" fill="#0866ff" />
      <rect x="58" y="66" width="44" height="44" rx="6" fill="#ffd8a8" />
      <rect x="112" y="68" width="50" height="7" rx="3.5" fill="#c8d4e3" />
      <rect x="112" y="81" width="36" height="7" rx="3.5" fill="#dfe6ef" />
      <rect x="112" y="96" width="42" height="14" rx="7" fill="#42b72a" />
      <polyline points="200,112 224,96 244,102 270,72 292,60" fill="none" stroke="#0866ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="292" cy="60" r="6" fill="#0866ff" />
      <rect x="196" y="118" width="100" height="4" rx="2" fill="#c2d5f2" />
      <g transform="translate(214,20)">
        <rect x="0" y="0" width="36" height="30" rx="6" fill="#ffffff" stroke="#c2d5f2" />
        <path d="M9 11 h18 l-2 11 h-14 z" fill="#0866ff" />
        <path d="M13 11 a5 5 0 0 1 10 0" fill="none" stroke="#0866ff" strokeWidth="2" />
      </g>
    </svg>
  )
}

export function SetupModal({ s, onContinue, onBack, onClose }: { s: GameState; onContinue: (kind: 'advantage' | 'manual') => void; onBack: () => void; onClose: () => void }) {
  const advOk = featureUnlocked(s, 'advantage')
  const [kind, setKind] = useState<'advantage' | 'manual'>('manual')
  return (
    <AmModal
      inline
      open
      onClose={onClose}
      title="Choose a campaign setup"
      subtitle="Sales"
      size="md"
      pauseGame
      footer={<><AmButton onClick={onBack}>Back</AmButton><AmButton variant="primary" onClick={() => onContinue(kind)}>Continue</AmButton></>}
    >
      <div className="fb-stack" role="radiogroup">
        <AmRadioCard
          checked={kind === 'advantage'}
          onSelect={() => setKind('advantage')}
          icon={Sparkles}
          title="Advantage+ shopping campaign"
          badge={<AmTag tone="primary">Recommended</AmTag>}
          description="Use machine learning to find buyers across Fadbook and Instaglam with fewer settings: broad audience, automatic placements and a campaign budget."
          disabled={!advOk}
          disabledReason={`Advantage+ shopping campaigns unlock at Media Buying level ${MB_GATES.advantage}. Study media buying in Ecom Academy or run a few campaigns first.`}
        />
        <AmRadioCard
          checked={kind === 'manual'}
          onSelect={() => setKind('manual')}
          icon={SlidersHorizontal}
          title="Manual sales campaign"
          description="Choose your own audience, placements and budget type. Good for testing creatives in separate ad sets."
        />
      </div>
    </AmModal>
  )
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
type StepId = 'campaign' | 'adset' | 'ad'

interface Props {
  s: GameState
  accountId: string
  start: CreateStart
  kind: 'advantage' | 'manual'
  onClose: () => void
  onPublished: (ids: { campaignId: string | null; adSetId: string | null; adId: string | null }) => void
  onManageAudiences: () => void
}

export function CreateEditor({ s, accountId, start, kind, onClose, onPublished, onManageAudiences }: Props) {
  usePauseWhileMounted('fb-create-editor')
  // Esc must not close the computer (and throw away an unpublished campaign); like Ads Manager,
  // the editor only closes from its Close / X buttons
  useLayer(true, () => {})
  const existingCampaign: Campaign | undefined =
    start.mode === 'adset' ? s.ads.campaigns.find(c => c.id === start.campaignId)
      : start.mode === 'ad' ? s.ads.campaigns.find(c => c.id === s.ads.adSets.find(x => x.id === start.adSetId)?.campaignId)
        : undefined
  const existingSet: AdSet | undefined = start.mode === 'ad' ? s.ads.adSets.find(x => x.id === start.adSetId) : undefined
  const advantage = existingCampaign ? existingCampaign.kind === 'advantage' : kind === 'advantage'
  const steps: StepId[] = start.mode === 'new' ? ['campaign', 'adset', 'ad'] : start.mode === 'adset' ? ['adset', 'ad'] : ['ad']
  const [step, setStep] = useState<StepId>(steps[0])
  const [tried, setTried] = useState(false)
  // each step starts at the top of the form (and a failed publish shows its error notice)
  const formRef = useRef<HTMLElement>(null)
  const toTop = () => {
    formRef.current?.scrollTo({ top: 0 })
    formRef.current?.parentElement?.scrollTo({ top: 0 }) // narrow layouts scroll the whole editor body
  }
  useEffect(toTop, [step])

  // campaign
  const [cName, setCName] = useState(advantage ? 'New Advantage+ Shopping Campaign' : 'New Sales Campaign')
  const [cbo, setCbo] = useState(true)
  const [cBudget, setCBudget] = useState('20.00')
  const [bid, setBid] = useState<Campaign['bidStrategy']>('lowest_cost')
  const [cap, setCap] = useState('')
  // ad set
  const cboEffective = existingCampaign ? existingCampaign.budgetMode === 'cbo' : cbo || advantage
  const [sName, setSName] = useState(advantage ? 'Advantage+ Audience' : 'New Sales Ad Set')
  const [sBudget, setSBudget] = useState('20.00')
  const [opt, setOpt] = useState<AdSet['optimization']>('purchase')
  const [targeting, setTargeting] = useState<Targeting>({ ...DEFAULT_TARGETING, interests: [] })
  // ad
  const preCreative = start.mode === 'new' && start.creativeId ? s.creatives.creatives.find(c => c.id === start.creativeId && c.status === 'ready') : undefined
  const preProduct = preCreative
    ? s.store.products.find(p => p.catalogId === preCreative.catalogId && p.status === 'active') ?? s.store.products.find(p => p.catalogId === preCreative.catalogId && p.status !== 'archived')
    : undefined
  const firstProduct = preProduct ?? s.store.products.find(p => p.status === 'active') ?? s.store.products.find(p => p.status !== 'archived')
  const [ad, setAd] = useState<AdDraft>(() => {
    const cr = preProduct ? preCreative : firstProduct ? s.creatives.creatives.find(c => c.catalogId === firstProduct.catalogId && c.status === 'ready') : undefined
    return { name: cr?.name ?? 'New Sales Ad', storeProductId: firstProduct?.id ?? '', creativeId: cr?.id ?? '', primaryText: '', headline: firstProduct?.title ?? '', cta: 'shop_now' }
  })

  const pixel = hasPixel(s, 'fadbook')
  const costCapOk = featureUnlocked(s, 'costCap')
  const cBudgetN = parseFloat(cBudget)
  const sBudgetN = parseFloat(sBudget)
  const capN = parseFloat(cap)

  const errors = useMemo(() => {
    const e: Record<StepId, string | null> = { campaign: null, adset: null, ad: null }
    if (start.mode === 'new') {
      e.campaign = !cName.trim() ? 'Enter a campaign name.'
        : cboEffective ? checkFbBudget('campaign', null, null, cBudgetN, 1).error ?? null : null
      if (!e.campaign && bid === 'cost_cap' && !(capN > 0)) e.campaign = 'Enter a cost per result goal.'
      if (!e.campaign) {
        e.campaign = validateCampaignInput(s, {
          platform: 'fadbook', accountId, name: cName, kind: advantage ? 'advantage' : 'manual', budgetMode: cboEffective ? 'cbo' : 'abo',
          dailyBudget: cboEffective ? cBudgetN : null, bidStrategy: bid, costCap: bid === 'cost_cap' ? capN : null,
        })
      }
    }
    if (start.mode !== 'ad') {
      const t = advantage ? { ...targeting, type: 'broad' as const, interests: [], audienceId: null, placements: 'advantage' as const } : targeting
      if (!sName.trim()) e.adset = 'Enter an ad set name.'
      else if (!cboEffective) e.adset = checkFbBudget('adset', null, null, sBudgetN).error ?? null
      if (!e.adset) e.adset = validateTargeting(s, 'fadbook', t)
      if (!e.adset && existingCampaign) {
        e.adset = validateAdSetInput(s, { campaignId: existingCampaign.id, name: sName, dailyBudget: cboEffective ? null : sBudgetN, targeting: t, optimization: opt })
      }
    }
    e.ad = localAdError(s, ad)
    if (!e.ad && existingSet) e.ad = validateAdInput(s, { adSetId: existingSet.id, ...ad })
    return e
  }, [s, start.mode, cName, cboEffective, cBudgetN, bid, capN, accountId, advantage, targeting, sName, sBudgetN, existingCampaign, existingSet, opt, ad])

  const stepIdx = steps.indexOf(step)
  const firstError = steps.find(id => errors[id])
  const publish = () => {
    setTried(true)
    if (firstError) {
      setStep(firstError)
      toTop()
      return
    }
    let campaignId: string | null = existingCampaign?.id ?? null
    let adSetId: string | null = existingSet?.id ?? null
    let adId: string | null = null
    act(g => {
      if (start.mode === 'new') {
        campaignId = createCampaign(g, {
          platform: 'fadbook', accountId, name: cName, kind: advantage ? 'advantage' : 'manual', budgetMode: cboEffective ? 'cbo' : 'abo',
          dailyBudget: cboEffective ? cBudgetN : null, bidStrategy: bid, costCap: bid === 'cost_cap' ? capN : null,
        })
        if (!campaignId) return
      }
      if (start.mode !== 'ad' && campaignId) {
        adSetId = createAdSet(g, { campaignId, name: sName, dailyBudget: cboEffective ? null : sBudgetN, targeting, optimization: opt })
        if (!adSetId) {
          if (start.mode === 'new') setEntityStatus(g, 'campaign', campaignId, 'deleted')
          campaignId = start.mode === 'new' ? null : campaignId
          return
        }
      }
      if (adSetId) {
        adId = createAd(g, { adSetId, name: ad.name, creativeId: ad.creativeId, storeProductId: ad.storeProductId, primaryText: ad.primaryText, headline: ad.headline, cta: ad.cta })
        if (!adId) {
          // keep publishing atomic: don't leave an empty campaign / ad set behind
          if (start.mode === 'new' && campaignId) setEntityStatus(g, 'campaign', campaignId, 'deleted')
          else if (start.mode === 'adset') setEntityStatus(g, 'adset', adSetId, 'deleted')
        }
      }
    })
    if (adId) onPublished({ campaignId, adSetId, adId })
  }

  const stepDefs: StepDef[] = []
  const status = (id: StepId): StepDef['status'] => (errors[id] && (tried || steps.indexOf(id) < stepIdx) ? 'error' : undefined)
  if (steps.includes('campaign')) stepDefs.push({ id: 'campaign', label: cName || 'New Sales Campaign', description: advantage ? 'Advantage+ shopping' : 'Sales', icon: Folder, status: status('campaign') })
  if (steps.includes('adset')) stepDefs.push({ id: 'adset', label: sName || 'New Sales Ad Set', description: existingCampaign ? `In ${existingCampaign.name}` : 'Ad set', icon: LayoutGrid, level: steps.includes('campaign') ? 1 : 0, status: status('adset') })
  stepDefs.push({ id: 'ad', label: ad.name || 'New Sales Ad', description: existingSet ? `In ${existingSet.name}` : 'Ad', icon: RectangleHorizontal, level: steps.length - 1, status: status('ad') })

  const spendLimit = accountSpendLimit(s, accountId)
  const adSetBudgetForEstimates = cboEffective ? (existingCampaign?.dailyBudget ?? cBudgetN) || 0 : sBudgetN || 0
  const shownTargeting: Targeting = advantage ? { ...targeting, type: 'broad', interests: [], audienceId: null, placements: 'advantage' } : targeting

  return (
    <div className="fb-editor" role="dialog" aria-label="Create campaign">
      <header className="fb-editor-top">
        <button type="button" className="am-x" aria-label="Close" onClick={onClose}><X size={20} /></button>
        <div className="fb-editor-title">
          <strong>{start.mode === 'new' ? (advantage ? 'New Advantage+ shopping campaign' : 'New Sales campaign') : start.mode === 'adset' ? 'New ad set' : 'New ad'}</strong>
          <span className="fb-muted fb-small">Changes are saved when you publish.</span>
        </div>
        <div className="fb-editor-actions">
          <AmButton variant="create" onClick={publish}>Publish</AmButton>
        </div>
      </header>
      <div className="fb-editor-main">
        <nav className="fb-editor-tree">
          <Stepper steps={stepDefs} current={step} onStepClick={id => setStep(id as StepId)} />
        </nav>
        <section className="fb-editor-form" ref={formRef}>
          {tried && firstError && (
            <AmNotice tone="error" title="Fix errors before publishing">{errors[firstError]}</AmNotice>
          )}
          {step === 'campaign' && (
            <>
              <AmCard title="Campaign name">
                <AmInput value={cName} onChange={setCName} maxLength={400} ariaLabel="Campaign name" />
              </AmCard>
              <AmCard title="Campaign details">
                <dl className="fb-kv">
                  <dt>Buying type</dt><dd>Auction</dd>
                  <dt>Campaign objective</dt><dd><span className="fb-inline"><ShoppingBag size={14} /> Sales</span></dd>
                  <dt>Campaign setup</dt><dd>{advantage ? 'Advantage+ shopping campaign' : 'Manual sales campaign'}</dd>
                </dl>
              </AmCard>
              <AmCard title="Budget" titleTip="Advantage+ campaign budget distributes one budget across your ad sets to get more results. Without it, each ad set has its own budget (useful for controlled creative tests).">
                <div className="fb-stack">
                  <Toggle
                    checked={cboEffective}
                    disabled={advantage}
                    onChange={setCbo}
                    label="Advantage+ campaign budget"
                  />
                  {cboEffective ? (
                    <FbBudgetField level="campaign" id={null} current={null} value={cBudget} onChange={setCBudget} />
                  ) : (
                    <p className="fb-small fb-muted">You'll set a budget for each ad set.</p>
                  )}
                </div>
              </AmCard>
              <AmCard title="Campaign bid strategy">
                <AmField label="Bid strategy" help="Highest volume spends your full budget to get the most purchases at the lowest cost it can.">
                  <AmSelect
                    value={bid}
                    onChange={setBid}
                    options={[
                      { value: 'lowest_cost', label: 'Highest volume', description: 'Get the most results for your budget.' },
                      { value: 'cost_cap', label: 'Cost per result goal', description: 'Aim for a certain cost per result.', disabled: !costCapOk, disabledReason: `Unlocks at Media Buying level ${MB_GATES.costCap}.` },
                    ]}
                    width={320}
                    ariaLabel="Bid strategy"
                  />
                </AmField>
                {bid === 'cost_cap' && (
                  <AmField label="Cost per result goal" help="Delivery tries to keep the average cost per purchase at or below this amount. Too low and the campaign won't spend.">
                    <AmInput value={cap} onChange={setCap} type="currency" prefix="$" suffix="USD" width={200} ariaLabel="Cost per result goal" />
                  </AmField>
                )}
              </AmCard>
            </>
          )}
          {step === 'adset' && (
            <>
              <AmCard title="Ad set name">
                <AmInput value={sName} onChange={setSName} maxLength={400} ariaLabel="Ad set name" />
              </AmCard>
              <AmCard title="Conversion" titleTip="Where you want results and which event counts as a result.">
                <dl className="fb-kv">
                  <dt>Conversion location</dt><dd>Website</dd>
                  <dt>Performance goal</dt><dd>Maximize number of conversions</dd>
                  <dt>Dataset</dt><dd>{pixel ? `${s.store.name || 'Store'} Pixel` : <span className="fb-err-text">No pixel connected</span>}</dd>
                </dl>
                {!pixel && (
                  <AmNotice
                    tone="warning"
                    title="No pixel events"
                    actions={<AmButton size="sm" icon={Store} onClick={() => openSite('shopifly', s.store.created ? 'apps/fadbook-channel' : '')}>Connect in Shopifly</AmButton>}
                  >
                    Your store isn't sending purchase events. Without them, delivery can only find people who click, not people who buy, and the ad set never
                    leaves learning. Install the Fadbook &amp; Instaglam app in Shopifly first.
                  </AmNotice>
                )}
                <AmField label="Conversion event">
                  <AmSelect
                    value={opt}
                    onChange={setOpt}
                    options={[
                      { value: 'purchase', label: 'Purchase', description: 'Optimize for people likely to buy.' },
                      { value: 'add_to_cart', label: 'Add to cart', description: 'More events for learning, but carts don\'t always turn into purchases.' },
                    ]}
                    width={320}
                    ariaLabel="Conversion event"
                  />
                </AmField>
              </AmCard>
              {!cboEffective ? (
                <AmCard title="Budget & schedule">
                  <FbBudgetField level="adset" id={null} current={null} value={sBudget} onChange={setSBudget} />
                  <dl className="fb-kv"><dt>Schedule</dt><dd>Starts as soon as it's approved · No end date</dd></dl>
                </AmCard>
              ) : (
                <AmCard title="Budget & schedule">
                  <p className="fb-small fb-muted">
                    This ad set uses the campaign budget ({amFmt.money(existingCampaign?.dailyBudget ?? cBudgetN)} per day), shared with other ad sets in the campaign.
                  </p>
                </AmCard>
              )}
              <AudienceEditor s={s} value={targeting} onChange={setTargeting} advantage={advantage} onManageAudiences={onManageAudiences} />
            </>
          )}
          {step === 'ad' && <AdCreativeEditor s={s} draft={ad} onChange={setAd} />}
        </section>
        <aside className="fb-editor-pane">
          {step === 'campaign' && (
            <div className="fb-pane-stack">
              <AmCard title="Sales campaigns">
                <p className="fb-small">
                  Sales campaigns optimize for purchases on your website using your pixel. New ads go through review (usually within 24 hours) and then
                  enter a learning phase while delivery finds buyers: about {learningConversionsNeeded('fadbook')} purchases per ad set per week.
                </p>
              </AmCard>
              <AmCard title="Account spending limit">
                <p className="fb-small">
                  {Number.isFinite(spendLimit)
                    ? <>This ad account can spend up to <strong>{amFmt.money(spendLimit)}</strong> per day across all campaigns. The limit rises as you spend and pay on time.</>
                    : 'This ad account has no daily spending limit.'}
                </p>
              </AmCard>
            </div>
          )}
          {step === 'adset' && <AudiencePane s={s} targeting={shownTargeting} dailyBudget={adSetBudgetForEstimates} />}
          {step === 'ad' && <AdPreviewPane s={s} draft={ad} placements={existingSet?.targeting.placements ?? shownTargeting.placements} />}
        </aside>
      </div>
      <footer className="fb-editor-foot">
        <AmButton onClick={onClose}>Close</AmButton>
        <span className="fb-editor-foot-note">{steps.length > 1 ? `Step ${stepIdx + 1} of ${steps.length}` : ''}</span>
        <div className="fb-editor-foot-right">
          {stepIdx > 0 && <AmButton onClick={() => setStep(steps[stepIdx - 1])}>Back</AmButton>}
          {stepIdx < steps.length - 1 ? (
            <AmButton variant="primary" onClick={() => setStep(steps[stepIdx + 1])}>Next</AmButton>
          ) : (
            <AmButton variant="create" onClick={publish}>Publish</AmButton>
          )}
        </div>
      </footer>
    </div>
  )
}
