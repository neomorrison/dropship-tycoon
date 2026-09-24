// Mineo — dark-theme chart primitives (recharts). Animations off: the game re-renders often.
import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface Point { label: string; value: number }

function DarkTip({ active, payload, label, unit }: { active?: boolean; payload?: { value: number }[]; label?: string; unit: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="mi-tip">
      <div className="mi-tip-label">{label}</div>
      <div className="mi-tip-value">{Math.round(payload[0].value).toLocaleString('en-US')} {unit}</div>
    </div>
  )
}

/** Area chart with a purple glow — Mineo's signature "ads over time" look. */
export function GlowArea({ data, color = '#8b6cff', height = 200, unit = '' }: { data: Point[]; color?: string; height?: number; unit?: string }) {
  const id = useId().replace(/:/g, '')
  if (!data.length) return <div className="mi-chart-empty" style={{ height }}>No data yet</div>
  return (
    <div className="mi-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#2a2350" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#8a82b8', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fill: '#8a82b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
          <Tooltip content={<DarkTip unit={unit} />} cursor={{ stroke: '#5b4bb0', strokeWidth: 1 }} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#g${id})`} isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: color, stroke: '#0f0b1f', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Tiny inline trend line for table rows. */
export function MiniSpark({ values, color = '#9b7dff', width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />
  const max = Math.max(1, ...values)
  const min = Math.min(...values)
  const span = Math.max(1, max - min)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
  const area = `1,${height} ${pts.join(' ')} ${width - 1},${height}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="mi-spark">
      <polygon points={area} fill={color} opacity={0.14} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Horizontal share bars (hooks, platforms, formats). */
export function ShareBars({ rows }: { rows: { label: string; value: number; sub?: string; color?: string }[] }) {
  const total = rows.reduce((a, r) => a + r.value, 0) || 1
  return (
    <div className="mi-bars">
      {rows.map(r => {
        const pct = r.value / total
        return (
          <div key={r.label} className="mi-bar">
            <div className="mi-bar-top"><span>{r.label}</span><b>{Math.round(pct * 100)}%</b></div>
            <div className="mi-bar-track"><i style={{ width: `${Math.max(2, pct * 100)}%`, background: r.color }} /></div>
            {r.sub && <div className="mi-bar-sub">{r.sub}</div>}
          </div>
        )
      })}
    </div>
  )
}
