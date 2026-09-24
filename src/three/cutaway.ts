// Sims-style wall cutaway: walls whose outward normal faces the camera drop to a 0.3 m stub.
import * as THREE from 'three'
import type { Room } from './room'
import { damp, nextCutState, wallFacing } from './math'

export const STUB_HEIGHT = 0.3

export function updateCutaway(room: Room, camDir: THREE.Vector2, dt: number, instant = false) {
  for (const w of room.walls) {
    const dot = wallFacing(w.side, camDir.x, camDir.y)
    w.cut = nextCutState(w.cut, dot)
    const target = w.cut ? Math.min(1, STUB_HEIGHT / w.height) : 1
    if (instant) w.level = target
    else {
      w.level += (target - w.level) * damp(w.cut ? 9 : 7, dt)
      if (Math.abs(w.level - target) < 1e-3) w.level = target
    }
    w.pivot.scale.y = w.level
    w.pivot.visible = true
    if (w.decor) w.decor.visible = !w.cut && w.level > 0.985
  }
}
