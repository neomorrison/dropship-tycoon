// Mineo — paywall / pricing page shown until the player subscribes to Pro ($49/month).
import { useMemo, useState } from 'react'
import { BarChart3, Check, Clock, CreditCard, Lock, Radar, Sparkles, Tags, Users } from 'lucide-react'
import { act, useGS } from '../../../core/store'
import { formatDate } from '../../../core/time'
import { MINEO_MONTHLY, findProduct, hookTextFor, subscribeSpyTool } from '../../../sim/market'
import { productImage } from '../../../core/assets'
import { AdPreview } from '../../kit/phone'
import { useToday } from './data'

export default function Paywall({ productId }: { productId?: string }) {
  const today = useToday()
  const until = useGS(s => s.catalog.spyToolUntilDay)
  const available = useGS(s => s.catalog.available)
  const cardFrozen = useGS(s => s.finance.card.frozen)
  const cardLeft = useGS(s => Math.max(0, s.finance.card.limit - s.finance.card.balance))
  const cash = useGS(s => s.finance.cash)
  const [failed, setFailed] = useState(false)
  const product = productId ? findProduct(productId) : undefined
  const preview = useMemo(() => available.slice(0, 8).map(id => findProduct(id)).filter(Boolean).slice(0, 4), [available])
  const payWith = !cardFrozen && cardLeft >= MINEO_MONTHLY ? 'Chaise Sapphire card' : cash >= MINEO_MONTHLY ? 'Chaise checking' : null

  const subscribe = () => {
    let ok = false
    act(s => { ok = subscribeSpyTool(s) })
    setFailed(!ok)
  }

  return (
    <div className="mi-paywall">
      {until !== null && until < today && (
        <div className="mi-banner"><Clock size={16} /> Your Mineo Pro access ended on {formatDate(until, 'short')}. Resubscribe to pick up where you left off.</div>
      )}
      <div className="mi-pw-hero">
        <div className="mi-pw-copy">
          <span className="mi-eyebrow"><Radar size={14} /> Ad intelligence for e-commerce</span>
          <h1>{product ? <>Unlock the ad data for <em>{product.name}</em></> : <>See the ads that are <em>actually</em> selling</>}</h1>
          <p>Mineo tracks every product ad running on Fadbook, Instaglam and TikTak: who is advertising, how long each ad has been live, how people engage, and which hooks and formats the top ads use.</p>
          <ul className="mi-pw-feats">
            <li><BarChart3 size={16} /> Ads over time and first-seen dates for every product</li>
            <li><Users size={16} /> Advertiser counts and the prices competitors charge</li>
            <li><Sparkles size={16} /> Top-performing ads with hook types and formats</li>
            <li><Tags size={16} /> Trending ads feed across all niches, updated daily</li>
          </ul>
        </div>
        <div className="mi-price-card">
          <div className="mi-price-plan">Mineo Pro</div>
          <div className="mi-price-amount"><b>${MINEO_MONTHLY}</b><span>/month</span></div>
          <ul>
            <li><Check size={14} /> Unlimited ad & product searches</li>
            <li><Check size={14} /> Fadbook + TikTak ad library</li>
            <li><Check size={14} /> Product analytics & competitor prices</li>
            <li><Check size={14} /> Cancel anytime</li>
          </ul>
          <button type="button" className="mi-btn mi-btn-primary mi-btn-block" onClick={subscribe} disabled={!payWith}>
            <CreditCard size={16} /> Start Pro — ${MINEO_MONTHLY}/mo
          </button>
          <p className="mi-price-note">
            {payWith ? `Billed monthly to your ${payWith}. Cancel anytime; access continues until the end of the paid month.` : `You need $${MINEO_MONTHLY} of available credit or cash to subscribe.`}
          </p>
          {failed && <p className="mi-price-err">Payment declined. Check your balances in Chaise Bank.</p>}
        </div>
      </div>
      <div className="mi-pw-preview" aria-hidden>
        <div className="mi-pw-grid">
          {preview.map((p, i) => p && (
            <div key={p.id} className="mi-pw-cell">
              <AdPreview
                platform={i % 2 ? 'tiktak' : 'fadbook-reels'} productImage={productImage(p.id)} productName={p.name}
                hookText={hookTextFor(p, i % 2 ? 'pov' : 'question', i)} brandName="Locked store" likes={12000 + i * 3100} comments={420} shares={900}
                frame={false} width={170} playing={false}
              />
            </div>
          ))}
        </div>
        <div className="mi-pw-lock"><Lock size={22} /><b>Thousands of live ads</b><span>Subscribe to browse the full library</span></div>
      </div>
    </div>
  )
}
