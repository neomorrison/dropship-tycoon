// Live View globe: dark SVG orthographic dot globe with visitor and order markers.
// Land is ~3.4k dots drawn as three zero-length-segment paths (one DOM node per depth band),
// so the slow auto-rotation and drag-to-rotate stay cheap.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { landDots } from './land'

export interface GlobeMarker {
  key: string
  lon: number
  lat: number
  kind: 'visitor' | 'order'
  /** placed in the current hour: ripple animation */
  fresh?: boolean
  label?: string
}

const RAD = Math.PI / 180

interface Precomp { sinLat: Float32Array; cosLat: Float32Array; lon: Float32Array; n: number }
let pre: Precomp | null = null
function precompute(): Precomp {
  if (pre) return pre
  const d = landDots()
  const n = d.length / 2
  const sinLat = new Float32Array(n)
  const cosLat = new Float32Array(n)
  const lon = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    lon[i] = d[i * 2] * RAD
    sinLat[i] = Math.sin(d[i * 2 + 1] * RAD)
    cosLat[i] = Math.cos(d[i * 2 + 1] * RAD)
  }
  pre = { sinLat, cosLat, lon, n }
  return pre
}

function project(lon: number, lat: number, lon0: number, sin0: number, cos0: number, r: number): [number, number, number] {
  const l = lon * RAD - lon0
  const sp = Math.sin(lat * RAD)
  const cp = Math.cos(lat * RAD)
  const cosc = sin0 * sp + cos0 * cp * Math.cos(l)
  return [r * cp * Math.sin(l), -r * (cos0 * sp - sin0 * cp * Math.cos(l)), cosc]
}

export interface GlobeProps {
  markers: GlobeMarker[]
  /** rendered size in px (square) */
  size?: number
  /** center longitude (degrees), default central US */
  centerLon?: number
  /** tilt: latitude facing the viewer */
  centerLat?: number
  /** gentle auto-rotation around the center longitude */
  animate?: boolean
}

export function Globe({ markers, size = 460, centerLon = -97, centerLat = 30, animate = true }: GlobeProps) {
  const [offset, setOffset] = useState(0)
  const drag = useRef<{ x: number; start: number } | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])

  // slow sway ±14° over ~48 s (paused while dragging, hidden, or reduced motion)
  useEffect(() => {
    if (!animate || reduced) return
    let raf = 0
    let last = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (drag.current || document.hidden || t - last < 50) return
      last = t
      setOffset(Math.sin(((t - t0) / 48000) * Math.PI * 2) * 14)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animate, reduced])

  const r = 100
  const lon0 = (centerLon + offset + dragOffset) * RAD
  const lat0 = centerLat * RAD
  const sin0 = Math.sin(lat0)
  const cos0 = Math.cos(lat0)

  const paths = useMemo(() => {
    const p = precompute()
    const bands = ['', '', '']
    for (let i = 0; i < p.n; i++) {
      const l = p.lon[i] - lon0
      const cl = Math.cos(l)
      const cosc = sin0 * p.sinLat[i] + cos0 * p.cosLat[i] * cl
      if (cosc <= 0.02) continue
      const x = r * p.cosLat[i] * Math.sin(l)
      const y = -r * (cos0 * p.sinLat[i] - sin0 * p.cosLat[i] * cl)
      const b = cosc > 0.55 ? 2 : cosc > 0.22 ? 1 : 0
      bands[b] += `M${x.toFixed(1)} ${y.toFixed(1)}h0`
    }
    return bands
  }, [lon0, sin0, cos0])

  const shown = useMemo(() => {
    const out: (GlobeMarker & { x: number; y: number; depth: number })[] = []
    for (const m of markers) {
      const [x, y, c] = project(m.lon, m.lat, lon0, sin0, cos0, r)
      if (c > 0.05) out.push({ ...m, x, y, depth: c })
    }
    // orders on top of visitors
    return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'order' ? 1 : -1))
  }, [markers, lon0, sin0, cos0])

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, start: dragOffset }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    setDragOffset(drag.current.start - (dx / size) * 140)
  }
  const onUp = () => {
    drag.current = null
  }

  return (
    <svg
      className="sf-globe"
      style={{ maxWidth: size }}
      viewBox="-112 -112 224 224"
      role="img"
      aria-label={`Globe showing ${markers.filter(m => m.kind === 'visitor').length} visitors and ${markers.filter(m => m.kind === 'order').length} recent orders`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <defs>
        <radialGradient id="sf-globe-ocean" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#1c2b4a" />
          <stop offset="70%" stopColor="#101a30" />
          <stop offset="100%" stopColor="#0a1122" />
        </radialGradient>
        <radialGradient id="sf-globe-halo" cx="50%" cy="50%" r="50%">
          <stop offset="86%" stopColor="#3f7cff" stopOpacity="0" />
          <stop offset="92%" stopColor="#3f7cff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3f7cff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r={111} fill="url(#sf-globe-halo)" />
      <circle r={r} fill="url(#sf-globe-ocean)" stroke="#2b4270" strokeWidth={0.6} />
      <path d={paths[0]} stroke="#3c5b98" strokeWidth={1.25} strokeLinecap="round" fill="none" />
      <path d={paths[1]} stroke="#5b82cf" strokeWidth={1.35} strokeLinecap="round" fill="none" />
      <path d={paths[2]} stroke="#86a9f0" strokeWidth={1.45} strokeLinecap="round" fill="none" />
      {shown.map(m => (
        m.kind === 'visitor' ? (
          <g key={m.key} transform={`translate(${m.x.toFixed(2)} ${m.y.toFixed(2)})`} opacity={0.4 + 0.6 * m.depth}>
            <circle r={3.4} className="sf-globe-visitor-halo" />
            <circle r={1.7} className="sf-globe-visitor" />
          </g>
        ) : (
          <g key={m.key} transform={`translate(${m.x.toFixed(2)} ${m.y.toFixed(2)})`} opacity={0.5 + 0.5 * m.depth}>
            {m.fresh && <circle r={2.4} className="sf-globe-ripple" />}
            <circle r={2.4} className="sf-globe-order">{m.label && <title>{m.label}</title>}</circle>
          </g>
        )
      ))}
    </svg>
  )
}
