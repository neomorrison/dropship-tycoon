// Decision modals (Game Dev Tycoon-style). The engine pauses while any are queued;
// the player must pick a choice (no Esc / outside-click dismissal).
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { GameModal } from '../../core/types'
import { act, useGS } from '../../core/store'
import { resolveModal } from '../../core/modals'
import { asset, portrait, productImage } from '../../core/assets'
import { formatClock, formatDate, dayOf } from '../../core/time'
import { sfx } from '../audio'
import { RichText } from './common'

function modalImage(img?: string): string | null {
  if (!img) return null
  if (/^(https?:|data:|blob:|\/)/.test(img)) return img
  if (/^p\d{2}$/.test(img)) return portrait(img)
  if (img.includes('/') || img.includes('.')) return asset(img)
  return productImage(img)
}

export default function ModalHost() {
  const modals = useGS(s => s.events.modals)
  const m = modals[0]
  const lastId = useRef<string | null>(null)
  useEffect(() => {
    if (m && m.id !== lastId.current) sfx.ping()
    lastId.current = m?.id ?? null
  }, [m])
  if (!m) return null
  return <DecisionModal key={m.id} modal={m} queued={modals.length - 1} />
}

function DecisionModal({ modal, queued }: { modal: GameModal; queued: number }) {
  const hour = useGS(s => s.time.hour)
  const [chosen, setChosen] = useState<string | null>(null)
  const [imgOk, setImgOk] = useState(true)
  const firstBtn = useRef<HTMLButtonElement>(null)
  const img = modalImage(modal.image)
  useEffect(() => {
    // focus the safe choice for keyboard users (Enter activates it); nothing when every choice is destructive
    const t = window.setTimeout(() => firstBtn.current?.focus({ preventScroll: true }), 260)
    return () => window.clearTimeout(t)
  }, [])

  const choose = (id: string, tone?: string) => {
    if (chosen) return
    setChosen(id)
    if (tone === 'critical') sfx.error()
    else sfx.click()
    // let the press animation read before the card leaves
    window.setTimeout(() => {
      act(s => resolveModal(s, modal.id, id))
    }, 140)
  }

  const choices = modal.choices.length ? modal.choices : [{ id: 'ok', label: 'OK', tone: 'primary' as const }]
  // keyboard focus lands on the recommended choice, never on a destructive one (Enter must be safe)
  let focusIdx = choices.findIndex(c => c.tone === 'primary')
  if (focusIdx < 0) focusIdx = choices.findIndex(c => c.tone !== 'critical')
  if (focusIdx < 0) focusIdx = -1
  return (
    <div className="sh-modal-layer" role="presentation">
      <div className="sh-modal-backdrop" />
      <div className={clsx('sh-modal', img && imgOk && 'has-image')} role="alertdialog" aria-modal="true" aria-labelledby={`${modal.id}-t`} aria-describedby={`${modal.id}-b`}>
        {img && imgOk && (
          <div className="sh-modal-art">
            <img src={img} alt="" onError={() => setImgOk(false)} draggable={false} />
          </div>
        )}
        <div className="sh-modal-main">
          <div className="sh-modal-kicker">
            <span>
              {formatDate(dayOf(hour), 'medium').replace(/, \d{4}$/, '')} · {formatClock(hour)}
            </span>
            {queued > 0 && <span className="sh-modal-queue">+{queued} more waiting</span>}
          </div>
          <h2 className="sh-modal-title" id={`${modal.id}-t`}>
            {modal.title}
          </h2>
          <div id={`${modal.id}-b`}>
            <RichText text={modal.body} className="sh-modal-body" />
          </div>
          <div className={clsx('sh-modal-choices', choices.length > 2 && 'is-stacked')}>
            {choices.map((c, i) => (
              <button
                key={c.id}
                ref={i === focusIdx ? firstBtn : undefined}
                type="button"
                className={clsx('sh-choice', `is-${c.tone ?? 'default'}`, chosen === c.id && 'is-chosen')}
                disabled={!!chosen}
                onClick={() => choose(c.id, c.tone)}
              >
                <span className="sh-choice-label">{c.label}</span>
                {c.hint && <span className="sh-choice-hint">{c.hint}</span>}
              </button>
            ))}
          </div>
          <div className="sh-modal-foot">The clock is paused until you decide.</div>
        </div>
      </div>
    </div>
  )
}
