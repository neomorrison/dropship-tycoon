// First visit: no Fadbook ad account yet. Business-portfolio style setup that opens an account
// through sim/ads openAdAccount (or rents an agency account when the player is banned).
import { useState } from 'react'
import { BadgeCheck, Building2, CircleCheck, Circle, Clapperboard, CreditCard, Store } from 'lucide-react'
import type { GameState } from '../../../../core/types'
import { act } from '../../../../core/store'
import { openSite } from '../../../../core/ui'
import { AGENCY_SETUP_FEE, hasPixel, openAccountBlocker, openAdAccount } from '../../../../sim/ads'
import { BENCHMARKS } from '../../../../data/benchmarks'
import { AmButton, AmCard, AmCheckbox, AmField, AmNotice, amFmt } from '../../../kit/adsmanager'
import { cardLast4 } from './Billing'
import { useFbUI } from '../uiStore'

export default function Onboarding({ s }: { s: GameState }) {
  const ui = useFbUI()
  const [agree, setAgree] = useState(false)
  const [rentAgree, setRentAgree] = useState(false)
  const storeName = s.store.name || s.meta.playerName || 'My Store'
  const block = openAccountBlocker(s, 'fadbook', false)
  const rentBlock = openAccountBlocker(s, 'fadbook', true)
  const create = (rented: boolean) => {
    let id: string | null = null
    act(g => { id = openAdAccount(g, 'fadbook', { rented }) })
    if (id) ui.set({ accountId: id, level: 'campaign', sel: { campaign: [], adset: [], ad: [] } })
  }
  const checklist = [
    { done: s.store.created, label: 'A website to send people to', hint: 'Your Shopifly store with an active product page.', action: () => openSite('shopifly', s.store.created ? 'products' : '') },
    { done: hasPixel(s, 'fadbook'), label: 'The Fadbook pixel', hint: 'Install the Fadbook & Instaglam app in Shopifly so campaigns can see purchases.', action: () => openSite('shopifly', s.store.created ? 'apps/fadbook-channel' : '') },
    { done: s.creatives.creatives.some(c => c.status === 'ready'), label: 'Ad creatives', hint: 'Images or videos of your product from CreatorHub.', action: () => openSite('studio', '') },
  ]
  const startLimit = BENCHMARKS.fadbook.spendLimitLadder[0]
  return (
    <div className="fb-onb">
      <div className="fb-onb-main">
        <div className="fb-onb-logo" aria-hidden>f</div>
        <h1>Create an ad account</h1>
        <p className="fb-muted">Ad accounts hold your campaigns, payment method and billing history. You'll be the admin of this account.</p>
        {block ? (
          <AmNotice tone="error" title="You can't create an ad account right now">{block}</AmNotice>
        ) : (
          <AmCard>
            <div className="fb-stack">
              <AmField label="Business portfolio"><span className="fb-inline"><Building2 size={16} /> {storeName} Business</span></AmField>
              <AmField label="Ad account name"><span>{storeName}</span></AmField>
              <div className="fb-form-row">
                <AmField label="Time zone"><span>(GMT-07:00) America/Los_Angeles</span></AmField>
                <AmField label="Currency"><span>USD · US Dollar</span></AmField>
              </div>
              <AmField label="Payment method" help="You can change this later in Billing.">
                <span className="fb-inline"><CreditCard size={16} /> Chaise Sapphire •••• {cardLast4(s)}</span>
              </AmField>
              <AmNotice tone="info">
                New ad accounts start with a {amFmt.money(startLimit)} daily spending limit. It increases automatically as you spend and your payments go through.
              </AmNotice>
              <AmCheckbox checked={agree} onChange={setAgree} label="I agree to the Fadbook Advertising Standards and the Self-Serve Ad Terms." />
              <div><AmButton variant="primary" disabled={!agree} onClick={() => create(false)}>Create ad account</AmButton></div>
            </div>
          </AmCard>
        )}
        {block && (
          <AmCard title="Rent an agency ad account">
            <div className="fb-stack">
              <p className="fb-small">
                Agencies lease aged ad accounts with higher spending limits. They charge {amFmt.money(AGENCY_SETUP_FEE.fadbook)} to set one up and add 3–6% to every ad bill.
              </p>
              {rentBlock ? <span className="fb-small fb-warn-text">{rentBlock}</span> : (
                <>
                  <AmCheckbox checked={rentAgree} onChange={setRentAgree} label={`I understand the ${amFmt.money(AGENCY_SETUP_FEE.fadbook)} setup fee is charged now.`} />
                  <div><AmButton variant="primary" disabled={!rentAgree} onClick={() => create(true)}>Rent an account</AmButton></div>
                </>
              )}
            </div>
          </AmCard>
        )}
      </div>
      <aside className="fb-onb-side">
        <AmCard title="Before you advertise">
          <ul className="fb-checklist">
            {checklist.map(c => (
              <li key={c.label}>
                {c.done ? <CircleCheck size={18} className="fb-ok" /> : <Circle size={18} className="fb-muted" />}
                <div className="fb-stack-tight">
                  <strong>{c.label}</strong>
                  <span className="fb-small fb-muted">{c.hint}</span>
                  {!c.done && <AmButton size="sm" variant="link" onClick={c.action}>Set up</AmButton>}
                </div>
              </li>
            ))}
          </ul>
        </AmCard>
        <AmCard>
          <div className="fb-inline"><BadgeCheck size={18} className="fb-ok" /> <strong className="fb-small">Tip</strong></div>
          <p className="fb-small">Test with a small daily budget first. Several ads in one ad set shows you quickly which creative people stop scrolling for.</p>
          <div className="fb-inline fb-small fb-muted"><Store size={14} /> Shopifly · <Clapperboard size={14} /> CreatorHub</div>
        </AmCard>
      </aside>
    </div>
  )
}
