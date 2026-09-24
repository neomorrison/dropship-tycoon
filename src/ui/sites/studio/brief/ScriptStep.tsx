// Script beats builder (add / remove / drag or arrow to reorder), on-screen hook text,
// optional voiceover script and the creative's name.
import { useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, GripVertical, Plus, RotateCcw, Type, X } from 'lucide-react'
import type { BeatId, FormatId, HookId } from '../../../../core/types'
import { BEAT_LIST, BEATS, FORMATS, HOOKS } from '../../../../data/creativeTaxonomy'
import { cx } from '../../../kit/common'
import { HOOK_TEXT_MAX, MAX_BEATS, SCRIPT_MAX, useBriefDraft } from '../draft'
import { briefDurationSec, fmtClip } from '../helpers'
import { TaxIcon } from '../icons'

/** categorical colors for the beat timeline (grouped by role in the script) */
const BEAT_COLOR: Record<BeatId, string> = {
  hook: '#ff7a00', problem: '#e5484d', agitate: '#c2410c', demo: '#2563eb', benefits: '#16a34a', social_proof: '#7c3aed',
  testimonial: '#9333ea', offer: '#d97706', urgency: '#b45309', cta: '#1c1917', unboxing: '#0e7490', comparison: '#0891b2',
}

const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)

export function ScriptStep({ format, hook, autoName, compact }: { format: FormatId | null; hook: HookId | null; autoName: string; compact: boolean }) {
  const beats = useBriefDraft(d => d.beats)
  const hookText = useBriefDraft(d => d.hookText)
  const script = useBriefDraft(d => d.script)
  const name = useBriefDraft(d => d.name)
  const { patch, addBeat, removeBeat, moveBeat, clearBeats } = useBriefDraft.getState()
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const fmt = format ? FORMATS[format] : null
  const still = fmt ? !fmt.video : false
  const dur = briefDurationSec(format, beats.length)
  const rawSec = beats.reduce((a, b) => a + BEATS[b.id].seconds, 0)
  const full = beats.length >= MAX_BEATS

  const onKey = (e: KeyboardEvent<HTMLLIElement>, i: number, key: number) => {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeBeat(key) }
    else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); moveBeat(i, i - 1) }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); moveBeat(i, i + 1) }
  }

  return (
    <div className="ch-script">
      {/* ---- beats ---- */}
      <div className="ch-field">
        <div className="ch-field-head">
          <label className="ch-label">Script beats</label>
          <span className="ch-field-aside">
            {beats.length}/{MAX_BEATS} beats
            {fmt && !still && beats.length > 0 && <> · finished cut ≈ <b>{fmtClip(dur)}</b></>}
            {beats.length > 0 && (
              <button type="button" className="ch-link-btn" onClick={clearBeats}><RotateCcw size={12} />Clear</button>
            )}
          </span>
        </div>
        <p className="ch-help">
          {still
            ? fmt?.id === 'carousel'
              ? 'Each beat becomes a card, in this order.'
              : 'A still has no timeline: beats set the order of what the image says, top to bottom.'
            : 'The order the video plays in. Drag chips to reorder, or use the arrows.'}
        </p>
        {beats.length === 0 ? (
          <div className="ch-beats-empty">Add beats from the list below to build the script.</div>
        ) : (
          <ol className={cx('ch-beats', compact && 'is-compact')} aria-label="Script beats in order">
            {beats.map((b, i) => {
              const def = BEATS[b.id]
              return (
                <li
                  key={b.key}
                  tabIndex={0}
                  draggable
                  title={`${def.name}: ${def.short} (Alt+←/→ to move, Delete to remove)`}
                  className={cx('ch-beat', drag === i && 'is-drag', over === i && drag !== null && drag !== i && (drag < i ? 'is-over-after' : 'is-over-before'))}
                  style={{ ['--beat' as string]: BEAT_COLOR[b.id] }}
                  onKeyDown={e => onKey(e, i, b.key)}
                  onDragStart={e => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== i) setOver(i) }}
                  onDragLeave={() => setOver(o => (o === i ? null : o))}
                  onDrop={e => { e.preventDefault(); if (drag !== null) moveBeat(drag, i); setDrag(null); setOver(null) }}
                  onDragEnd={() => { setDrag(null); setOver(null) }}
                >
                  <span className="ch-beat-grip" aria-hidden><GripVertical size={13} /></span>
                  <span className="ch-beat-num">{i + 1}</span>
                  <span className="ch-beat-icon"><TaxIcon name={def.icon} size={14} /></span>
                  <span className="ch-beat-name">{def.name}</span>
                  <span className="ch-beat-ctrl">
                    <button type="button" aria-label={`Move ${def.name} earlier`} disabled={i === 0} onClick={() => moveBeat(i, i - 1)}><ChevronLeft size={13} /></button>
                    <button type="button" aria-label={`Move ${def.name} later`} disabled={i === beats.length - 1} onClick={() => moveBeat(i, i + 1)}><ChevronRight size={13} /></button>
                    <button type="button" aria-label={`Remove ${def.name}`} onClick={() => removeBeat(b.key)}><X size={13} /></button>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
        {beats.length > 0 && !still && (
          <div className="ch-timeline" aria-hidden>
            {beats.map(b => (
              <span key={b.key} style={{ flexGrow: BEATS[b.id].seconds, background: BEAT_COLOR[b.id] }} title={`${BEATS[b.id].name} · ~${Math.max(1, Math.round((BEATS[b.id].seconds / Math.max(1, rawSec)) * dur))}s`} />
            ))}
          </div>
        )}
        <div className="ch-palette" aria-label="Add a beat">
          {BEAT_LIST.map(b => (
            <button key={b.id} type="button" className="ch-palette-btn" disabled={full} title={`${b.short} ${b.examples[0] ? `e.g. ${b.examples[0]}` : ''}`} onClick={() => addBeat(b.id)}>
              <Plus size={12} strokeWidth={2.6} />
              <span className="ch-palette-dot" style={{ background: BEAT_COLOR[b.id] }} />
              {b.name}
            </button>
          ))}
        </div>
        {full && <p className="ch-help ch-help-warn">That's the maximum of {MAX_BEATS} beats. Remove one to add another.</p>}
      </div>

      {/* ---- hook text ---- */}
      <div className="ch-field">
        <div className="ch-field-head">
          <label className="ch-label" htmlFor="ch-hooktext">On-screen hook text</label>
          <span className={cx('ch-field-aside', hookText.length > HOOK_TEXT_MAX - 10 && 'is-warn')}>
            {wordCount(hookText)} words · {hookText.length}/{HOOK_TEXT_MAX}
          </span>
        </div>
        <div className="ch-input-wrap">
          <Type size={15} className="ch-input-icon" aria-hidden />
          <input
            id="ch-hooktext"
            className="ch-input ch-input-icon-pad"
            value={hookText}
            maxLength={HOOK_TEXT_MAX}
            placeholder={still ? 'The headline on the image' : 'The caption viewers read in the first frame'}
            onChange={e => patch({ hookText: e.target.value })}
          />
        </div>
        {hook ? (
          <div className="ch-patterns">
            <span className="ch-kicker">{HOOKS[hook].name} patterns</span>
            {HOOKS[hook].textPatterns.map(t => (
              <button key={t} type="button" className="ch-pattern" onClick={() => patch({ hookText: t })} title="Use this pattern, then replace the blanks">
                {t}
              </button>
            ))}
          </div>
        ) : (
          <p className="ch-help">Pick a hook above to see common text patterns for it.</p>
        )}
      </div>

      {/* ---- script ---- */}
      <div className="ch-field">
        <div className="ch-field-head">
          <label className="ch-label" htmlFor="ch-script">Script / voiceover <span className="ch-optional">optional</span></label>
          <span className="ch-field-aside">{wordCount(script)} words{script.trim() ? ` · ~${Math.round(wordCount(script) / 2.5)}s spoken` : ''}</span>
        </div>
        <textarea
          id="ch-script"
          className="ch-textarea"
          rows={compact ? 4 : 5}
          maxLength={SCRIPT_MAX}
          value={script}
          placeholder="What's said or captioned, beat by beat. It becomes the auto-captions in the preview."
          onChange={e => patch({ script: e.target.value })}
        />
      </div>

      {/* ---- name ---- */}
      <div className="ch-field">
        <div className="ch-field-head">
          <label className="ch-label" htmlFor="ch-name">Creative name <span className="ch-optional">optional</span></label>
        </div>
        <input id="ch-name" className="ch-input" value={name} maxLength={60} placeholder={autoName} onChange={e => patch({ name: e.target.value })} />
      </div>
    </div>
  )
}
