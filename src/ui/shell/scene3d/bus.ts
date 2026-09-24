// Tiny bridge between the always-loaded shell (Scene.tsx) and the lazily loaded 3D code: the room state the
// DOM overlays read, and commands the 2D menus send to the 3D room. No three.js here.
import { create } from 'zustand'
import type { BeatKind } from './director'

export interface Scene3DState {
  /** room the stage shows (or is fading to) */
  room: string | null
  /** the player's current beat */
  beat: BeatKind | null
  /** the beat happens at McDoodle's */
  atWork: boolean
  /** mid room swap (the player walked out) */
  moving: boolean
}
export const useScene3D = create<Scene3DState>()(() => ({ room: null, beat: null, atWork: false, moving: false }))

type Commands = { fry?: () => void }
const commands: Commands = {}
export function setScene3DCommands(c: Commands) {
  commands.fry = c.fry
}
/** "Drop a basket" in the room: the player walks to the fryer (no-op without a 3D room) */
export function scene3dFry() {
  commands.fry?.()
}
