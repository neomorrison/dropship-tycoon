// Game camera: fit-to-room framing at any aspect, damped yaw drag with inertia, zoom/pinch, clamped pan,
// animated rotate/zoom/reset, and a slow orbit mode for title screens.
import * as THREE from 'three'
import { clamp, damp, lerp } from './math'

const DEG = Math.PI / 180
export const DEFAULT_YAW = 45
const FOV = 28
const ELEV_OUT = 40
const ELEV_IN = 31
const ZOOM_MIN = 0.32
const ZOOM_MAX = 1.25

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  mode: 'room' | 'orbit' = 'room'
  private box = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 2.7, 3))
  private orbitSpec: { target: THREE.Vector3; radius: number; height: number; fov: number; yaw0: number } | null = null
  private aspect = 16 / 9
  yaw = DEFAULT_YAW
  tYaw = DEFAULT_YAW
  zoom = 1
  tZoom = 1
  pan = new THREE.Vector2()
  tPan = new THREE.Vector2()
  /** extra target elevation offset (not user controlled) */
  private orbitYaw = 0
  private dragVel = 0
  dragging = false
  private target = new THREE.Vector3()
  /** fit cache per yaw bucket */
  private fitTarget = new THREE.Vector3()
  private fitDist = 10

  constructor() {
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 400)
  }

  setAspect(a: number) {
    this.aspect = a > 0 && Number.isFinite(a) ? a : 16 / 9
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()
  }

  setRoom(box: THREE.Box3, cam: { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null) {
    this.box.copy(box)
    if (cam) {
      const off = cam.pos.clone().sub(cam.target)
      this.orbitSpec = { target: cam.target.clone(), radius: Math.hypot(off.x, off.z), height: off.y, fov: cam.fov, yaw0: Math.atan2(off.x, off.z) / DEG }
    } else this.orbitSpec = null
    this.snap()
  }

  /** jump to the default view with no animation */
  snap() {
    this.yaw = this.tYaw = this.orbitSpec && this.mode === 'orbit' ? this.orbitSpec.yaw0 : DEFAULT_YAW
    this.orbitYaw = 0
    this.zoom = this.tZoom = 1
    this.pan.set(0, 0); this.tPan.set(0, 0)
    this.dragVel = 0
    this.update(0)
  }

  rotate(stepDeg: number) { this.tYaw += stepDeg; this.dragVel = 0 }
  /** delta > 0 zooms in (one unit = one step) */
  zoomBy(delta: number) { this.tZoom = clamp(this.tZoom * Math.pow(0.8, delta), ZOOM_MIN, ZOOM_MAX) }
  zoomFactor(f: number) { this.tZoom = clamp(this.tZoom * f, ZOOM_MIN, ZOOM_MAX) }
  reset() { this.tYaw = this.nearestYaw(DEFAULT_YAW); this.tZoom = 1; this.tPan.set(0, 0); this.dragVel = 0 }

  private nearestYaw(y: number) {
    // animate the short way round to the default yaw
    const k = Math.round((this.yaw - y) / 360)
    return y + k * 360
  }

  // --- drag input (pixels)
  dragStart() { this.dragging = true; this.dragVel = 0 }
  dragRotate(dxPx: number, dt: number) {
    const d = -dxPx * 0.32
    this.tYaw += d
    if (dt > 0) this.dragVel = lerp(this.dragVel, d / dt, 0.35)
  }
  dragEnd() {
    this.dragging = false
    // coast: carry the release velocity a little further
    this.tYaw += clamp(this.dragVel * 0.09, -40, 40)
    this.dragVel = 0
  }
  /** screen-space pan in pixels (right-drag / two fingers) */
  dragPan(dxPx: number, dyPx: number, viewH: number) {
    const dist = this.fitDist * this.zoom
    const worldPerPx = (2 * Math.tan((this.camera.fov * DEG) / 2) * dist) / Math.max(1, viewH)
    const a = this.yaw * DEG
    // camera right (in XZ) and forward projected on the ground
    const rx = Math.cos(a), rz = -Math.sin(a)
    const fx = -Math.sin(a), fz = -Math.cos(a)
    const k = worldPerPx * 1.0
    this.tPan.x += (-dxPx * rx + dyPx * fx * 1.4) * k
    this.tPan.y += (-dxPx * rz + dyPx * fz * 1.4) * k
  }

  private clampPan(p: THREE.Vector2, zoom: number) {
    const hx = (this.box.max.x - this.box.min.x) / 2, hz = (this.box.max.z - this.box.min.z) / 2
    const f = clamp((1.08 - zoom) / (1.08 - ZOOM_MIN), 0, 1)
    p.x = clamp(p.x, -hx * f, hx * f)
    p.y = clamp(p.y, -hz * f, hz * f)
  }

  /** elevation for a zoom level: slightly lower when zoomed in (more cinematic) */
  private elevFor(zoom: number) { return lerp(ELEV_IN, ELEV_OUT, clamp((zoom - ZOOM_MIN) / (1 - ZOOM_MIN), 0, 1)) }

  /**
   * Fit distance + target so the fit box fills the view with a margin, for a yaw/elevation. Iterates a few times to
   * centre the projected box.
   */
  private fit(yawDeg: number, elevDeg: number, outTarget: THREE.Vector3): number {
    const yaw = yawDeg * DEG, el = elevDeg * DEG
    const D = new THREE.Vector3(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el))
    const f = D.clone().negate()
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize()
    const u = new THREE.Vector3().crossVectors(r, f).normalize()
    const margin = this.aspect < 1 ? 0.05 : 0.07
    const tanV = Math.tan((FOV * DEG) / 2) * (1 - margin)
    const tanH = tanV * this.aspect
    const b = this.box
    const corners: THREE.Vector3[] = []
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z))
    const target = b.getCenter(new THREE.Vector3())
    target.y = 0.35
    let dist = 10
    const v = new THREE.Vector3()
    for (let it = 0; it < 4; it++) {
      dist = 0
      for (const c of corners) {
        v.subVectors(c, target)
        const depthOff = v.dot(D)
        dist = Math.max(dist, depthOff + Math.abs(v.dot(r)) / tanH, depthOff + Math.abs(v.dot(u)) / tanV)
      }
      // centre: project corners to normalised screen coords and shift the target by the extent's midpoint
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const c of corners) {
        v.subVectors(c, target)
        const depth = dist - v.dot(D)
        const sx = v.dot(r) / (depth * tanH), sy = v.dot(u) / (depth * tanV)
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy)
      }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
      if (Math.abs(cx) < 1e-3 && Math.abs(cy) < 1e-3) break
      target.addScaledVector(r, cx * dist * tanH * 0.9).addScaledVector(u, cy * dist * tanV * 0.9)
    }
    outTarget.copy(target)
    return dist
  }

  update(dt: number) {
    if (this.mode === 'orbit' && !this.dragging) this.tYaw += dt * 5
    // inertia is folded into tYaw; everything chases its target
    const k = damp(this.dragging ? 18 : 7, dt)
    this.yaw = dt === 0 ? this.tYaw : this.yaw + (this.tYaw - this.yaw) * k
    this.tZoom = clamp(this.tZoom, ZOOM_MIN, ZOOM_MAX)
    this.zoom = dt === 0 ? this.tZoom : this.zoom + (this.tZoom - this.zoom) * damp(8, dt)
    this.clampPan(this.tPan, this.tZoom)
    if (dt === 0) this.pan.copy(this.tPan)
    else this.pan.lerp(this.tPan, damp(9, dt))
    this.clampPan(this.pan, this.zoom)

    const cam = this.camera
    if (this.mode === 'orbit' && this.orbitSpec) {
      const o = this.orbitSpec
      const a = this.yaw * DEG
      const rad = o.radius * this.zoom, h = o.height * this.zoom
      cam.fov = o.fov
      cam.position.set(o.target.x + Math.sin(a) * rad, o.target.y + h, o.target.z + Math.cos(a) * rad)
      cam.lookAt(o.target)
      cam.near = 0.5; cam.far = 600
      cam.updateProjectionMatrix()
      return
    }
    cam.fov = FOV
    const elev = this.elevFor(this.zoom)
    this.fitDist = this.fit(this.yaw, elev, this.fitTarget)
    const dist = this.fitDist * this.zoom
    const a = this.yaw * DEG, el = elev * DEG
    // zoomed in: drift the look-at point toward the floor centre height of people
    this.target.copy(this.fitTarget)
    this.target.y = lerp(0.8, this.fitTarget.y, clamp((this.zoom - ZOOM_MIN) / (1 - ZOOM_MIN), 0, 1))
    this.target.x += this.pan.x
    this.target.z += this.pan.y
    cam.position.set(
      this.target.x + Math.sin(a) * Math.cos(el) * dist,
      this.target.y + Math.sin(el) * dist,
      this.target.z + Math.cos(a) * Math.cos(el) * dist,
    )
    cam.lookAt(this.target)
    cam.near = Math.max(0.1, dist * 0.2)
    cam.far = dist * 4 + 60
    cam.updateProjectionMatrix()
  }

  /** horizontal direction from the look-at point to the camera (for the cutaway) */
  horizontalDir(out: THREE.Vector2): THREE.Vector2 {
    const a = this.yaw * DEG
    return out.set(Math.sin(a), Math.cos(a))
  }

  get isAnimating() {
    return this.dragging || Math.abs(this.tYaw - this.yaw) > 0.01 || Math.abs(this.tZoom - this.zoom) > 1e-4 || this.pan.distanceTo(this.tPan) > 1e-4 || this.mode === 'orbit'
  }
}
