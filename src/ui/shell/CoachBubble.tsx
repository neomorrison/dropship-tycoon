// Coach Kev: bottom-left portrait + speech bubble fed by s.coach.queue.
import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { ArrowUpRight, ChevronDown, X } from 'lucide-react'
import type { SiteId } from '../../core/types'
import { act, useGS } from '../../core/store'
import { openSite } from '../../core/ui'
import { COACH_PORTRAIT, portrait } from '../../core/assets'
import { dismissCoachTip } from '../../sim/events'
import { siteDef } from '../sites/registry'
import { sfx } from '../audio'
import { Img, RichText } from './common'
import { useShellPrefs } from './shellStore'

function dismiss(id: string) {
  act(s => {
    try {
      dismissCoachTip(s, id)
    } catch {
      /* events module mid-refactor: still drop it from the queue below */
    }
    const i = s.coach.queue.findIndex(q => q.id === id)
    if (i >= 0) s.coach.queue.splice(i, 1)
  })
}

export default function CoachBubble() {
  const queue = useGS(s => s.coach.queue)
  const collapsed = useShellPrefs(p => p.coachCollapsed)
  const setPrefs = useShellPrefs(p => p.set)
  const tip = queue[0]
  const lastId = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const id = tip ? `${tip.id}@${tip.hour}` : null
    // pop on new tips (not on first mount with an existing queue)
    if (lastId.current !== undefined && id && id !== lastId.current) sfx.pop()
    lastId.current = id
  }, [tip])

  if (!tip) return null
  const app = tip.app as SiteId | undefined
  const appName = app ? siteDef(app)?.name : null

  if (collapsed) {
    return (
      <button type="button" className="sh-coach-mini" onClick={() => setPrefs({ coachCollapsed: false })} title="Coach Kev has a tip" aria-label={`Coach Kev: ${queue.length} tip${queue.length > 1 ? 's' : ''}`}>
        <CoachFace />
        <span className="sh-badge">{queue.length}</span>
      </button>
    )
  }

  return (
    <aside className="sh-coach" aria-live="polite" aria-label="Coach Kev">
      <CoachFace />
      <div className="sh-coach-bubble" key={`${tip.id}@${tip.hour}`}>
        <div className="sh-coach-head">
          <b>Coach Kev</b>
          {queue.length > 1 && <span className="sh-coach-count">1 of {queue.length}</span>}
          <button type="button" className="sh-coach-ctl" onClick={() => setPrefs({ coachCollapsed: true })} title="Minimize" aria-label="Minimize coach">
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            className="sh-coach-ctl"
            onClick={() => {
              dismiss(tip.id)
              sfx.click()
            }}
            title="Dismiss"
            aria-label="Dismiss tip"
          >
            <X size={15} />
          </button>
        </div>
        <RichText text={tip.text} className="sh-coach-text" />
        <div className="sh-coach-actions">
          {app && (
            <button
              type="button"
              className="sh-btn sh-btn-primary sh-btn-sm"
              onClick={() => {
                openSite(app)
                dismiss(tip.id)
                sfx.click()
              }}
            >
              Show me{appName ? ` in ${appName.replace(/ Ads Manager| Admin/, '')}` : ''} <ArrowUpRight size={14} />
            </button>
          )}
          <button
            type="button"
            className={clsx('sh-btn sh-btn-sm', app ? 'sh-btn-ghost' : 'sh-btn-soft')}
            onClick={() => {
              dismiss(tip.id)
              sfx.click()
            }}
          >
            {queue.length > 1 ? 'Next tip' : 'Got it'}
          </button>
        </div>
      </div>
    </aside>
  )
}

function CoachFace() {
  return (
    <span className="sh-coach-face">
      <Img src={portrait(COACH_PORTRAIT)} alt="Coach Kev" className="sh-coach-img" fallback={<span className="sh-coach-fallback">KEV</span>} />
    </span>
  )
}
