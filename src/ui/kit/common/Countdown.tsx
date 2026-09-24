import { useEffect, useRef, useState } from 'react'
import { useInterval } from './hooks'
import { cx } from './utils'
import './common.css'

export interface CountdownProps {
  /**
   * In-game hours remaining (static — re-renders when the parent re-renders with a new
   * value as the game clock advances). Renders "2d 5h", "5h", "45m".
   */
  hoursLeft?: number
  /**
   * Real seconds remaining for UI-only timers (storefront "Sale ends in 09:59:32").
   * With `live`, ticks down every second on its own.
   */
  secondsLeft?: number
  live?: boolean
  /** restart from `secondsLeft` at zero (fake-urgency timers do exactly this) */
  loop?: boolean
  /**
   * 'short' (default): "2d 5h" · 'long': "2 days 5 hours" · 'clock': "02:05:59" · 'boxes': HH MM SS tiles
   */
  format?: 'short' | 'long' | 'clock' | 'boxes'
  /** highlight red when below this many hours (default 24 for hoursLeft, 0 = never) */
  urgentBelowHours?: number
  /** text shown when time is up (default "Expired") */
  expiredText?: string
  prefix?: string
  onExpire?: () => void
  className?: string
}

function parts(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec))
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}
const pad = (n: number) => String(n).padStart(2, '0')
const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export function formatCountdown(totalSec: number, format: CountdownProps['format'] = 'short'): string {
  const p = parts(totalSec)
  if (format === 'clock' || format === 'boxes') return `${p.d ? `${p.d}:` : ''}${pad(p.h)}:${pad(p.m)}:${pad(p.s)}`
  if (format === 'long') {
    if (p.d) return p.h ? `${pl(p.d, 'day')} ${pl(p.h, 'hour')}` : pl(p.d, 'day')
    if (p.h) return p.m ? `${pl(p.h, 'hour')} ${pl(p.m, 'minute')}` : pl(p.h, 'hour')
    return pl(Math.max(1, p.m), 'minute')
  }
  if (p.d) return p.h ? `${p.d}d ${p.h}h` : `${p.d}d`
  if (p.h) return p.m ? `${p.h}h ${p.m}m` : `${p.h}h`
  return `${Math.max(1, p.m)}m`
}

/** Remaining-time label for in-game deadlines (hours) or real-time UI timers (seconds). */
export function Countdown({
  hoursLeft, secondsLeft, live, loop, format = 'short', urgentBelowHours, expiredText = 'Expired', prefix, onExpire, className,
}: CountdownProps) {
  const [left, setLeft] = useState<number>(secondsLeft ?? 0)
  const leftRef = useRef(left)
  const fired = useRef(false)
  useEffect(() => {
    if (secondsLeft !== undefined) {
      leftRef.current = secondsLeft
      setLeft(secondsLeft)
    }
    fired.current = false
  }, [secondsLeft])
  useInterval(
    () => {
      const v = leftRef.current
      let next = v - 1
      if (v <= 1) {
        if (loop && secondsLeft) next = secondsLeft
        else {
          next = 0
          if (!fired.current) {
            fired.current = true
            onExpire?.()
          }
        }
      }
      leftRef.current = next
      setLeft(next)
    },
    1000,
    !!live && secondsLeft !== undefined,
  )

  const totalSec = hoursLeft !== undefined ? hoursLeft * 3600 : left
  const expired = totalSec <= 0
  const urgentLine = urgentBelowHours ?? (hoursLeft !== undefined ? 24 : 0)
  const urgent = !expired && urgentLine > 0 && totalSec < urgentLine * 3600
  const text = expired ? expiredText : formatCountdown(totalSec, format)

  if (format === 'boxes' && !expired) {
    const p = parts(totalSec)
    const units: [number, string][] = [
      ...(p.d ? [[p.d, 'Days'] as [number, string]] : []),
      [p.h, 'Hours'], [p.m, 'Mins'], [p.s, 'Secs'],
    ]
    return (
      <span className={cx('kx-countdown kx-countdown-boxes', urgent && 'kx-countdown-urgent', className)} role="timer">
        {prefix && <span className="kx-countdown-prefix">{prefix}</span>}
        {units.map(([v, l], i) => (
          <span key={l} className="kx-countdown-box">
            <b>{pad(v)}</b>
            <small>{l}</small>
            {i < units.length - 1 && <i aria-hidden>:</i>}
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className={cx('kx-countdown', urgent && 'kx-countdown-urgent', expired && 'kx-countdown-expired', className)} role="timer">
      {prefix && !expired && <span className="kx-countdown-prefix">{prefix} </span>}
      {text}
    </span>
  )
}
