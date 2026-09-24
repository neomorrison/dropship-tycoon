// Shopifly brand marks (parody): a green shopping bag with a pair of fly wings.

/** Green bag mark. */
export function ShopiflyBag({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size * (30 / 34)} height={size} viewBox="0 0 30 34" aria-hidden focusable="false">
      {/* handle */}
      <path d="M10 10.5V8.2a5 5 0 0 1 10 0v2.3" fill="none" stroke="#5e8e3e" strokeWidth="2.4" strokeLinecap="round" />
      {/* body: darker back panel + main face */}
      <path d="M4.6 10.2h21.2l2.1 20.4a2.2 2.2 0 0 1-2.2 2.4H4.6a2.2 2.2 0 0 1-2.2-2.4z" fill="#95bf47" />
      <path d="M4.6 10.2h5.2l-1.4 22.8H4.6a2.2 2.2 0 0 1-2.2-2.4z" fill="#5e8e3e" />
      {/* wings */}
      <path d="M16.2 17.4c-2.6-3.6-6.4-3.9-6.7-1.9-.3 2 2.6 3.7 6.7 1.9z" fill="#fff" />
      <path d="M17 17.4c2.3-4.6 6.8-5.3 7.2-3 .4 2.3-2.9 4.4-7.2 3z" fill="#fff" />
      <path d="M16.6 17.6c.8 2.8.6 6.9-1 9.3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16.6 17.6c-2.9 1.3-4.5 3.5-4.4 6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".85" />
    </svg>
  )
}

/** Bag + "shopifly" wordmark for the dark admin top bar (or dark text on light backgrounds). */
export function ShopiflyLogo({ size = 28, tone = 'light', wordmark = true }: { size?: number; tone?: 'light' | 'dark'; wordmark?: boolean }) {
  return (
    <span className="sf-logo" style={{ color: tone === 'light' ? '#fff' : '#1a1a1a' }}>
      <ShopiflyBag size={size} />
      {wordmark && <span className="sf-logo-word" style={{ fontSize: Math.round(size * 0.66) }}>shopifly</span>}
    </span>
  )
}
