// iPhone-style frame (dynamic island, status bar, home indicator). Content is laid
// out on a 360×780 design canvas and scaled to `width`, so anything inside renders
// pixel-identical at any size.
import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../common/utils'
import './phone.css'

/** Design size of the phone screen content (px). */
export const PHONE_SCREEN = { width: 360, height: 780 } as const
const FRAME = { width: 384, height: 804 }

export interface ScaleBoxProps {
  /** design width/height of the content */
  designWidth: number
  designHeight: number
  /** rendered width in px */
  width: number
  children: ReactNode
  className?: string
  style?: CSSProperties
}
/** Render fixed-size content scaled to a target width (keeps aspect ratio). */
export function ScaleBox({ designWidth, designHeight, width, children, className, style }: ScaleBoxProps) {
  const k = width / designWidth
  return (
    <div className={cx('ph-scale-box', className)} style={{ width, height: Math.round(designHeight * k), ...style }}>
      <div className="ph-scale-inner" style={{ width: designWidth, height: designHeight, transform: `scale(${k})` }}>
        {children}
      </div>
    </div>
  )
}

export interface PhoneMockupProps {
  /** screen content, laid out for 360×780 */
  children?: ReactNode
  /** rendered outer width in px (default 300) */
  width?: number
  /** status bar text color: 'light' for dark screens (default), 'dark' for white apps, 'none' to hide */
  statusBar?: 'light' | 'dark' | 'none'
  /** status bar clock (default "9:41") */
  time?: string
  frame?: 'black' | 'silver' | 'titanium'
  /** screen background (default black) */
  screenBg?: string
  className?: string
  style?: CSSProperties
  /** accessible description of what the phone shows */
  ariaLabel?: string
}

function StatusIcons() {
  return (
    <span className="ph-status-icons" aria-hidden>
      <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx="1" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
        <rect x="10" y="3" width="3" height="9" rx="1" />
        <rect x="15" y="0" width="3" height="12" rx="1" />
      </svg>
      <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
        <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.1-1.2A10.2 10.2 0 0 0 8 .6 10.2 10.2 0 0 0 .9 3.4L2 4.6a8.6 8.6 0 0 1 6-2.4zm0 3.3c1.4 0 2.6.5 3.6 1.4l1.1-1.2A7 7 0 0 0 8 3.9a7 7 0 0 0-4.7 1.8l1.1 1.2c1-.9 2.2-1.4 3.6-1.4zm0 3.3c.5 0 1 .2 1.3.5L8 10.8 6.7 9.3c.3-.3.8-.5 1.3-.5z" />
      </svg>
      <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
        <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" opacity="0.4" />
        <rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor" />
        <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="currentColor" opacity="0.5" />
      </svg>
    </span>
  )
}

/** Status bar + home indicator overlay for a 360×780 screen (use inside custom screens). */
export function PhoneChrome({ statusBar = 'light', time = '9:41' }: { statusBar?: 'light' | 'dark' | 'none'; time?: string }) {
  if (statusBar === 'none') return null
  return (
    <>
      <div className={cx('ph-status', `ph-status-${statusBar}`)}>
        <span>{time}</span>
        <StatusIcons />
      </div>
      <div className={cx('ph-home', `ph-home-${statusBar}`)} />
    </>
  )
}

/**
 * A phone around any screen content.
 *   <PhoneMockup width={260}><MyScreen /></PhoneMockup>
 */
export function PhoneMockup({ children, width = 300, statusBar = 'light', time = '9:41', frame = 'black', screenBg, className, style, ariaLabel }: PhoneMockupProps) {
  return (
    <ScaleBox designWidth={FRAME.width} designHeight={FRAME.height} width={width} className={className} style={style}>
      <div className={cx('ph-phone', frame !== 'black' && `ph-phone-${frame}`)} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
        <div className="ph-screen" style={screenBg ? { background: screenBg } : undefined}>
          {children}
          <div className="ph-island" />
          <PhoneChrome statusBar={statusBar} time={time} />
        </div>
      </div>
    </ScaleBox>
  )
}
