import type { SiteProps } from '../types'

// PLACEHOLDER — replaced by the agent that owns this site.
export default function Site({ path }: SiteProps) {
  return (
    <div style={{ padding: 32, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h2 style={{ margin: 0 }}>mail</h2>
      <p style={{ color: '#666' }}>Coming soon… (route: "{path || '/'}")</p>
    </div>
  )
}
