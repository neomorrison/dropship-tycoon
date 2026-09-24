// New brief: product → format → hook → angle → script → producer, with a live ad preview.
// Pauses the game clock while open (the player is thinking, not the sim).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Clapperboard, Library, RotateCcw } from 'lucide-react'
import { act, getGS, useGS } from '../../../core/store'
import { usePauseWhileMounted } from '../../../core/ui'
import { ANGLE_LIST, FORMATS, FORMAT_LIST, HOOK_LIST, HOOKS, SUPPLIER_EDIT_FORMATS, type FormatDef } from '../../../data/creativeTaxonomy'
import { orderCreative, validateCreativeBrief } from '../../../sim/ads'
import { playSfx } from '../../audio'
import { cx, useElementWidth } from '../../kit/common'
import { useBriefDraft } from './draft'
import { briefableProducts } from './helpers'
import { studioPaths } from './route'
import { buildBriefModel, type StepId } from './brief/model'
import { ProductStep } from './brief/ProductStep'
import { OptionStep, PolicyNote } from './brief/OptionStep'
import { ScriptStep } from './brief/ScriptStep'
import { ProducerStep } from './brief/ProducerStep'
import { ActionBar, PreviewCard, ReviewCard } from './brief/PreviewPanel'
import { Chip } from './ui'

const PRODUCER_NAMES: Record<string, string> = { self: 'you', supplier_edit: 'supplier edit', ugc: 'creators', agency: 'agency', staff: 'in-house' }

function Step({ n, id, title, subtitle, done, aside, children, stepRef }: {
  n: number
  id: StepId | 'review'
  title: string
  subtitle: string
  done: boolean
  aside?: ReactNode
  children: ReactNode
  stepRef: (el: HTMLElement | null) => void
}) {
  return (
    <section className="ch-step" ref={stepRef} data-step={id} aria-labelledby={`ch-step-${id}`}>
      <header className="ch-step-head">
        <span className={cx('ch-step-num', done && 'is-done')}>{done ? <Check size={14} strokeWidth={3} /> : n}</span>
        <div className="ch-step-titles">
          <h3 id={`ch-step-${id}`}>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {aside && <div className="ch-step-aside">{aside}</div>}
      </header>
      <div className="ch-step-body">{children}</div>
    </section>
  )
}

function formatMeta(f: FormatDef) {
  return (
    <>
      <Chip>{f.video ? `Video · ${f.durationRange[0]}–${f.durationRange[1]}s` : 'Still'}</Chip>
      {f.talking && <Chip>On camera</Chip>}
      {SUPPLIER_EDIT_FORMATS.includes(f.id) && <Chip>No filming needed</Chip>}
    </>
  )
}

export function BriefBuilder({ productRef, navigate, compact }: { productRef: string | null; navigate: (p: string) => void; compact: boolean }) {
  usePauseWhileMounted('studio-brief')
  const s = useGS(st => st)
  const draft = useBriefDraft()
  const patch = useBriefDraft.getState().patch
  const products = useMemo(() => briefableProducts(s.store.products), [s.store.products])
  const [submitError, setSubmitError] = useState<string | null>(null)

  // a draft from another save never leaks into this one. A draft that isn't bound to a save yet
  // (first visit, or filled from "Brief a variation" / a creator card) is adopted, not wiped.
  useEffect(() => {
    const cur = useBriefDraft.getState().saveId
    if (cur === null) useBriefDraft.getState().patch({ saveId: s.meta.saveId })
    else if (cur !== s.meta.saveId) useBriefDraft.getState().reset({ saveId: s.meta.saveId })
  }, [s.meta.saveId])

  // deep link: new/<storeProductId | catalogId>
  useEffect(() => {
    if (!productRef) return
    const sp = products.find(p => p.id === productRef) ?? products.find(p => p.catalogId === productRef)
    if (sp) useBriefDraft.getState().patch({ storeProductId: sp.id })
    // only when the link changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRef])

  // one product → preselect it; a deleted product → clear it
  useEffect(() => {
    const cur = useBriefDraft.getState().storeProductId
    if (cur && !products.some(p => p.id === cur)) patch({ storeProductId: null })
    else if (!cur && products.length === 1) patch({ storeProductId: products[0].id })
  }, [products, patch])

  // a creator whose listing expired can't be briefed
  useEffect(() => {
    if (draft.producer === 'ugc' && draft.creatorId && !s.creatives.creators.some(c => c.id === draft.creatorId)) patch({ creatorId: null })
  }, [draft.producer, draft.creatorId, s.creatives.creators, patch])

  useEffect(() => setSubmitError(null), [draft])

  // the "brief sent" banner clears as soon as the player starts tweaking the next variation
  const briefKey = JSON.stringify([draft.storeProductId, draft.format, draft.hook, draft.angle, draft.beats.map(b => b.id), draft.hookText, draft.script, draft.producer, draft.creatorId])
  const orderedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!draft.lastOrderedId) { orderedKey.current = null; return }
    if (orderedKey.current === null) orderedKey.current = briefKey
    else if (orderedKey.current !== briefKey) patch({ lastOrderedId: null })
  }, [briefKey, draft.lastOrderedId, patch])

  const model = useMemo(() => buildBriefModel(s, draft, products), [s, draft, products])
  const [rootRef, width] = useElementWidth<HTMLDivElement>()
  const stacked = compact || (width > 0 && width < 920)
  const refs = useRef<Partial<Record<StepId | 'review', HTMLElement | null>>>({})
  const setRef = (id: StepId | 'review') => (el: HTMLElement | null) => { refs.current[id] = el }
  const jump = (step: StepId | 'review') => refs.current[step]?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const lastOrdered = draft.lastOrderedId ? s.creatives.creatives.find(c => c.id === draft.lastOrderedId) ?? null : null
  const existing = useMemo(
    () => (model.catalogId ? s.creatives.creatives.filter(c => c.catalogId === model.catalogId && c.status !== 'failed') : []),
    [s.creatives.creatives, model.catalogId],
  )

  const submit = () => {
    const brief = model.brief
    if (!brief || model.issues.length) {
      playSfx('error')
      if (model.issues[0]) jump(model.issues[0].step)
      return
    }
    const out: { id: string | null } = { id: null }
    act(gs => { out.id = orderCreative(gs, brief) })
    if (out.id) {
      playSfx('pop')
      patch({ lastOrderedId: out.id, name: '' })
      setSubmitError(null)
    } else {
      playSfx('error')
      setSubmitError(validateCreativeBrief(getGS(), brief) ?? 'Couldn\'t start this creative. Check your notifications for the reason.')
    }
  }

  const f = draft.format ? FORMATS[draft.format] : null
  const previewWidth = compact ? 220 : 236

  const steps = (
    <div className="ch-steps">
      <Step n={1} id="product" stepRef={setRef('product')} done={!!model.sp} title="Product" subtitle="Which product is this creative for?"
        aside={existing.length > 0 && model.catalogId ? (
          <button type="button" className="ch-link-btn" onClick={() => navigate(studioPaths.libraryFor(model.catalogId!))}>
            <Library size={13} />{existing.length} creative{existing.length === 1 ? '' : 's'} already
          </button>
        ) : undefined}
      >
        <ProductStep s={s} products={products} selectedId={draft.storeProductId} onSelect={id => patch({ storeProductId: id })} compact={stacked} />
      </Step>

      <Step n={2} id="format" stepRef={setRef('format')} done={!!draft.format} title="Format" subtitle="What kind of content is it?">
        <OptionStep
          label="Format" items={FORMAT_LIST} value={draft.format} onChange={id => patch({ format: id })} compact={stacked}
          meta={formatMeta}
          detail={it => (
            <div className="ch-detail-block">
              <span className="ch-kicker">Production</span>
              <p className="ch-detail-p"><Clapperboard size={13} /> {it.productionNote}</p>
              <p className="ch-detail-p ch-muted">Made by: {it.producers.map(p => PRODUCER_NAMES[p]).join(', ')}</p>
            </div>
          )}
        />
      </Step>

      <Step n={3} id="hook" stepRef={setRef('hook')} done={!!draft.hook} title="Hook" subtitle="How it opens. The first seconds decide who keeps watching.">
        <OptionStep
          label="Hook" items={HOOK_LIST} value={draft.hook} onChange={id => patch({ hook: id })} compact={stacked}
          meta={it => (it.policyNote ? <Chip className="ch-chip-warn">Policy-sensitive</Chip> : null)}
          detail={it => (
            <>
              <div className="ch-detail-block">
                <span className="ch-kicker">On-screen text patterns</span>
                <div className="ch-patterns">
                  {it.textPatterns.map(t => (
                    <button key={t} type="button" className="ch-pattern" onClick={() => patch({ hookText: t })} title="Use as your hook text">{t}</button>
                  ))}
                </div>
              </div>
              {it.policyNote && <PolicyNote>{it.policyNote}</PolicyNote>}
            </>
          )}
        />
      </Step>

      <Step n={4} id="angle" stepRef={setRef('angle')} done={!!draft.angle} title="Angle" subtitle="The core reason to buy that the ad leads with.">
        <OptionStep
          label="Angle" items={ANGLE_LIST} value={draft.angle} onChange={id => patch({ angle: id })} compact={stacked}
          meta={it => (it.policyNote ? <Chip className="ch-chip-warn">Policy-sensitive</Chip> : null)}
          detail={it => (it.policyNote ? <PolicyNote>{it.policyNote}</PolicyNote> : null)}
        />
      </Step>

      <Step n={5} id="script" stepRef={setRef('script')} done={draft.beats.length > 0} title="Script" subtitle="Structure, on-screen text and voiceover."
        aside={draft.hook ? <span className="ch-step-hint">Hook: {HOOKS[draft.hook].name}</span> : undefined}
      >
        <ScriptStep format={draft.format} hook={draft.hook} autoName={model.autoName} compact={stacked} />
      </Step>

      <Step n={6} id="producer" stepRef={setRef('producer')} done={!!model.selected && !model.selected.blocked} title="Producer" subtitle="Who makes it, at what cost, speed and quality."
        aside={f ? <span className="ch-step-hint">{f.name}</span> : undefined}
      >
        <ProducerStep s={s} model={model} format={draft.format} navigate={navigate} compact={stacked} />
      </Step>

      <Step n={7} id="review" stepRef={setRef('review')} done={model.issues.length === 0 && !!model.brief} title="Review" subtitle="Check the brief, then send it from the bar below.">
        <ReviewCard model={model} onJump={jump} />
      </Step>
    </div>
  )

  return (
    <div ref={rootRef} className={cx('ch-brief', stacked && 'is-stacked')}>
      <div className="ch-pagehead">
        <div>
          <h1 className="ch-h1">New creative brief</h1>
          <p className="ch-sub">Tell your producer exactly what to make. The brief decides what ends up on screen.</p>
        </div>
        <div className="ch-pagehead-actions">
          <button type="button" className="ch-btn ch-btn-ghost ch-btn-sm" onClick={() => { useBriefDraft.getState().reset({ keepProduct: true }); setSubmitError(null) }}>
            <RotateCcw size={13} />Reset brief
          </button>
        </div>
      </div>

      {stacked ? (
        <>
          <details className="ch-preview-collapse">
            <summary><span>Preview the ad</span><ChevronDown size={15} /></summary>
            <PreviewCard model={model} width={previewWidth} />
          </details>
          {steps}
        </>
      ) : (
        <div className="ch-brief-grid">
          {steps}
          <aside className="ch-brief-side">
            <PreviewCard model={model} width={previewWidth} />
          </aside>
        </div>
      )}

      <ActionBar
        model={model}
        onSubmit={submit}
        onJump={jump}
        submitError={submitError}
        lastOrderedName={lastOrdered?.name ?? null}
        onViewLast={() => lastOrdered && navigate(studioPaths.creative(lastOrdered.id))}
        onFresh={() => { useBriefDraft.getState().reset({ keepProduct: true }); setSubmitError(null) }}
        onDismissLast={() => patch({ lastOrderedId: null })}
        stacked={stacked}
      />
    </div>
  )
}
