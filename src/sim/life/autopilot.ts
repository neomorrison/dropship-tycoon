// Autopilot toggle (eat / sleep / get to shifts automatically when idle).
import type { GameState } from '../../core/types'
import { notify } from '../../core/notify'
import { autopilotOn } from './util'

export function isAutopilot(s: GameState): boolean { return autopilotOn(s) }

export function setAutopilot(s: GameState, on: boolean): void {
  s.flags.autopilot = on
  notify(s, {
    kind: 'info', title: on ? 'Autopilot on' : 'Autopilot off',
    body: on
      ? 'When you\'re idle you\'ll eat when hungry, sleep at night or when exhausted, and your alarm gets you to shifts.'
      : 'You\'re on your own: plan meals and sleep, or you\'ll pass out and miss shifts.',
  })
}
