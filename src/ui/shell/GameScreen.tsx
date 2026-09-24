// The in-game screen: HUD on top, room scene + activity panel, and every overlay
// (computer/phone, toasts, Coach Kev, decision modals, settings/report).
import { preload } from 'react-dom'
import clsx from 'clsx'
import { useGameLoop } from '../../core/engine'
import { useGS } from '../../core/store'
import { useUI } from '../../core/ui'
import { roomImage } from '../../core/assets'
import './shell.css'
import './scene.css'
import './browser.css'
import Hud from './Hud'
import Scene from './Scene'
import { ROOM_BACKDROP } from './hotspots'
import SidePanel from './SidePanel'
import Computer from './Computer'
import CoachBubble from './CoachBubble'
import ModalHost from './ModalHost'
import Overlays from './Overlays'
import { Toasts, useNotificationFeed } from './Notifications'
import { useMidnightRecap, usePauseOnLateShift, useProgressChimes, useSaveOnHide, useShortcuts } from './effects'
import type { CSSProperties } from 'react'

export default function GameScreen() {
  useGameLoop()
  useShortcuts()
  useSaveOnHide()
  useNotificationFeed()
  useMidnightRecap()
  useProgressChimes()
  usePauseOnLateShift()
  const tier = useGS(s => Math.max(0, Math.min(5, Math.round(s.home.tier))))
  const atWork = useGS(s => s.player.location === 'work')
  const roomKey = atWork ? 'mcdoodles' : `tier${tier}`
  const dark = roomKey === 'tier5'
  const computerOpen = useUI(u => u.computerOpen)
  // warm the cache for the other location so walking to/from work doesn't flash
  preload(atWork ? roomImage(tier) : roomImage('mcdoodles'), { as: 'image' })
  return (
    <div className={clsx('sh-game', dark && 'is-dark-room', computerOpen && 'is-computer-open')} style={{ '--sh-room-bg': ROOM_BACKDROP[roomKey] ?? '#fbf3e7' } as CSSProperties} data-room={roomKey}>
      <Hud />
      <main className="sh-main">
        <Scene />
        <SidePanel />
      </main>
      <Computer />
      <CoachBubble />
      <Toasts />
      <ModalHost />
      <Overlays />
    </div>
  )
}
