// Coach Kev: bottom-left portrait + speech bubble fed by s.coach.queue. While the computer
// (or phone) is open, Kev docks into the browser toolbar instead so he never covers a site:
// a face button with a badge, and a popup that opens on click or for a tip about the site
// you're looking at.
import { useEffect, useMemo, useRef } from 'react'
import clsx from 'clsx'
import { ArrowUpRight, ChevronDown, X } from 'lucide-react'
import type { GameState, SiteId } from '../../core/types'
import { act, useGS } from '../../core/store'
import { openSite, useUI } from '../../core/ui'
import { COACH_PORTRAIT, portrait } from '../../core/assets'
import { dismissCoachTip } from '../../sim/events'
import { siteDef } from '../sites/registry'
import { sfx } from '../audio'
import { Img, RichText, STACK_BREAKPOINT, useViewportWidth } from './common'
import { useShell, useShellPrefs } from './shellStore'
import { useLayer } from '../kit/common/hooks'

type Tip = GameState['coach']['queue'][number]
/** tips older than this are stale advice: the bubble skips them (they stay in the sim's queue) */
const TIP_MAX_AGE_H = 72

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

/** Current (not stale) coach tips, oldest first. */
function useCoachTips(): Tip[] {
  const queue = useGS(s => s.coach.queue)
  const hour = useGS(s => s.time.hour)
  return useMemo(() => queue.filter(q => hour - q.hour <= TIP_MAX_AGE_H), [queue, hour])
}

const tipKey = (t: Tip) => `${t.id}@${t.hour}`

/**
 * Pop sound (unless silent) + onNew when a tip arrives (not on first mount). Only tips that weren't
 * queued before count: dismissing one and revealing the next queued tip is not news.
 */
function useTipPop(tips: Tip[], opts: { silent?: boolean; onNew?: (tip: Tip) => void } = {}) {
  const seen = useRef<Set<string> | null>(null)
  const o = useRef(opts)
  o.current = opts
  useEffect(() => {
    const keys = new Set(tips.map(tipKey))
    const prev = seen.current
    seen.current = keys
    if (!prev) return
    const fresh = tips.find(t => !prev.has(tipKey(t)))
    if (!fresh) return
    if (!o.current.silent) sfx.pop()
    o.current.onNew?.(fresh)
  }, [tips])
}

/** Scene and panel stack on narrow screens: a floating bubble would sit on top of the panel's buttons. */
const useStacked = () => useViewportWidth() <= STACK_BREAKPOINT

export default function CoachBubble() {
  const tips = useCoachTips()
  const computerOpen = useUI(u => u.computerOpen)
  const collapsed = useShellPrefs(p => p.coachCollapsed)
  const setPrefs = useShellPrefs(p => p.set)
  const stacked = useStacked()
  const tucked = useShell(s => s.coachTucked)
  const tip = tips[0]
  // a new tip always gets the full bubble again
  useTipPop(tips, { silent: computerOpen, onNew: () => useShell.getState().set({ coachTucked: false }) })

  // the browser hosts Kev while it's open (see CoachDock); stacked layouts show him in the panel (CoachInline)
  if (!tip || computerOpen || stacked) return null

  if (collapsed || tucked) {
    return (
      <button
        type="button"
        className="sh-coach-mini"
        onClick={() => {
          setPrefs({ coachCollapsed: false })
          useShell.getState().set({ coachTucked: false })
        }}
        title="Coach Kev has a tip"
        aria-label={`Coach Kev: ${tips.length} tip${tips.length > 1 ? 's' : ''}`}
      >
        <CoachFace />
        <span className="sh-badge">{tips.length}</span>
      </button>
    )
  }

  return (
    <aside className="sh-coach" aria-live="polite" aria-label="Coach Kev">
      <CoachFace />
      <CoachCard tip={tip} count={tips.length} onMinimize={() => setPrefs({ coachCollapsed: true })} className="sh-coach-bubble" />
    </aside>
  )
}

/**
 * Kev as a card in the activity panel when the scene and panel stack (phones, narrow tablets):
 * in the page flow, so he never covers the buttons underneath.
 */
export function CoachInline() {
  const tips = useCoachTips()
  const collapsed = useShellPrefs(p => p.coachCollapsed)
  const setPrefs = useShellPrefs(p => p.set)
  const stacked = useStacked()
  const tip = tips[0]
  if (!stacked || !tip) return null
  if (collapsed) {
    return (
      <button type="button" className="sh-coach-inline is-mini" onClick={() => setPrefs({ coachCollapsed: false })} aria-label={`Coach Kev: ${tips.length} tip${tips.length > 1 ? 's' : ''}`}>
        <CoachFace />
        <span className="sh-coach-inline-text">
          <b>Coach Kev</b> has {tips.length === 1 ? 'a tip' : `${tips.length} tips`} for you
        </span>
        <span className="sh-badge">{tips.length}</span>
      </button>
    )
  }
  return (
    <section className="sh-coach-inline" aria-live="polite" aria-label="Coach Kev">
      <CoachFace />
      <CoachCard tip={tip} count={tips.length} onMinimize={() => setPrefs({ coachCollapsed: true })} className="sh-coach-inline-card" />
    </section>
  )
}

/** The speech-bubble body shared by the room bubble, the panel card and the docked popup. */
function CoachCard({ tip, count, onMinimize, onDone, className, minimizeLabel = 'Minimize' }: {
  tip: Tip
  count: number
  onMinimize: () => void
  /** after "Show me", or dismissing the last tip (the dock closes its popup) */
  onDone?: () => void
  className: string
  minimizeLabel?: string
}) {
  const app = tip.app as SiteId | undefined
  const appName = app ? siteDef(app)?.name : null
  return (
    <div className={className} key={`${tip.id}@${tip.hour}`}>
      <div className="sh-coach-head">
        <b>Coach Kev</b>
        {count > 1 && <span className="sh-coach-count">1 of {count}</span>}
        <button type="button" className="sh-coach-ctl" onClick={onMinimize} title={minimizeLabel} aria-label={minimizeLabel}>
          <ChevronDown size={15} />
        </button>
        <button
          type="button"
          className="sh-coach-ctl"
          onClick={() => {
            dismiss(tip.id)
            sfx.click()
            if (count <= 1) onDone?.()
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
              openSite(app, tip.path ?? '')
              dismiss(tip.id)
              sfx.click()
              onDone?.()
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
            if (count <= 1) onDone?.()
          }}
        >
          {count > 1 ? 'Next tip' : 'Got it'}
        </button>
      </div>
    </div>
  )
}

/**
 * Kev inside the in-game browser: a face button for the desktop toolbar or the phone's bottom
 * bar, plus the popup. A new tip about the site in the active tab (or a general one) pops the
 * popup open by itself; anything else just bumps the badge.
 */
export function CoachDock({ variant, activeSite }: { variant: 'desktop' | 'phone'; activeSite: SiteId | null }) {
  const tips = useCoachTips()
  const open = useShell(s => s.coachOpen)
  const tip = tips[0]
  const ref = useRef<HTMLDivElement>(null)
  const setOpen = (v: boolean) => useShell.getState().set({ coachOpen: v })
  useTipPop(tips, {
    onNew: t => {
      if (!t.app || t.app === activeSite) setOpen(true)
    },
  })
  // closing the computer resets the dock
  useEffect(() => () => useShell.getState().set({ coachOpen: false }), [])
  // Esc closes the popup first (like any popover), not the computer behind it
  useLayer(open, () => setOpen(false))
  return (
    <div ref={ref} className={clsx('sh-kev-dock', `is-${variant}`)}>
      <button
        type="button"
        className={clsx('sh-kev-btn', open && 'is-on', tips.length > 0 && 'has-tips')}
        onClick={() => {
          setOpen(!open)
          sfx.click()
        }}
        title={tips.length ? `Coach Kev: ${tips.length} tip${tips.length > 1 ? 's' : ''}` : 'Coach Kev'}
        aria-label={tips.length ? `Coach Kev, ${tips.length} tip${tips.length > 1 ? 's' : ''}` : 'Coach Kev'}
        aria-expanded={open}
      >
        <span className="sh-kev-face" key={tip ? tip.id : 'none'}>
          <Img src={portrait(COACH_PORTRAIT)} alt="" className="sh-coach-img" fallback={<span className="sh-coach-fallback">K</span>} />
        </span>
        {tips.length > 0 && <span className="sh-kev-badge">{tips.length}</span>}
      </button>
      {open && (
        <div className="sh-kev-pop" role="dialog" aria-label="Coach Kev">
          {tip ? (
            <CoachCard tip={tip} count={tips.length} onMinimize={() => setOpen(false)} onDone={() => setOpen(false)} minimizeLabel="Hide" className="sh-kev-card" />
          ) : (
            <div className="sh-kev-card sh-kev-empty">
              <div className="sh-coach-head">
                <b>Coach Kev</b>
                <button type="button" className="sh-coach-ctl" onClick={() => setOpen(false)} title="Hide" aria-label="Hide">
                  <ChevronDown size={15} />
                </button>
              </div>
              <p className="sh-coach-text">No tips right now. Want a read on your numbers? Ask me in Ecom Academy.</p>
              <div className="sh-coach-actions">
                <button
                  type="button"
                  className="sh-btn sh-btn-soft sh-btn-sm"
                  onClick={() => {
                    openSite('academy', 'kev')
                    setOpen(false)
                  }}
                >
                  Ask Kev <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CoachFace() {
  return (
    <span className="sh-coach-face">
      <Img src={portrait(COACH_PORTRAIT)} alt="Coach Kev" className="sh-coach-img" fallback={<span className="sh-coach-fallback">KEV</span>} />
    </span>
  )
}
