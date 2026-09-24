// Onboarding: create a TikTak ad account (or rent one from an agency when banned).
import { useState } from 'react'
import { BadgeCheck, CircleCheck, Rocket, Target, Users } from 'lucide-react'
import { act } from '../../../../core/store'
import { AGENCY_SETUP_FEE, openAccountBlocker, openAdAccount } from '../../../../sim/ads'
import { BENCHMARKS } from '../../../../data/benchmarks'
import { AmButton, AmCheckbox, AmField, AmInput, AmNotice, AmRadio, AmSelect } from '../../../kit/adsmanager'
import { selectAccount, useAccount, useGame, useTt } from '../common'
import { identityName, last4 } from '../data'

export default function Setup() {
  const s = useGame()
  const { navigate, compact } = useTt()
  const { accounts } = useAccount()
  const [name, setName] = useState(() => identityName(s))
  const [payWith, setPayWith] = useState<'card' | 'bank'>('card')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocker = openAccountBlocker(s, 'tiktak')
  const rentBlocker = openAccountBlocker(s, 'tiktak', true)
  const firstLimit = BENCHMARKS.tiktak.spendLimitLadder[0]
  const cardDigits = last4(s.meta.saveId, 'card')
  const bankDigits = last4(s.meta.saveId, 'bank')

  const create = (rented: boolean) => {
    if (!rented && !name.trim()) { setError('Enter an ad account name.'); return }
    if (!agree) { setError('Agree to the TikTak Advertising Terms to continue.'); return }
    const out: { id: string | null } = { id: null }
    act(st => {
      const id = openAdAccount(st, 'tiktak', { rented })
      out.id = id
      const acc = id ? st.ads.accounts.find(a => a.id === id) : null
      if (acc) {
        if (!rented) acc.name = name.trim().slice(0, 80)
        acc.payWith = payWith
      }
    })
    if (out.id) {
      selectAccount(out.id)
      navigate('dashboard')
    } else {
      setError(rented ? 'The agency couldn\'t set up the account. Check your balance and card limit.' : 'The account couldn\'t be created.')
    }
  }

  return (
    <div className="tt-setup">
      <div className="tt-setup-hero">
        <span className="tt-logo-mark" style={{ width: 44, height: 44, fontSize: 26, borderRadius: 10, background: '#fff', color: '#161823' }} aria-hidden>♪</span>
        <h1>Reach shoppers where they discover what to buy.</h1>
        <p>TikTak Ads Manager puts your products in the For You feed. Build a campaign, pick your best videos and let delivery find people who complete payments.</p>
        <ul className="tt-setup-bullets">
          <li><Target size={18} /> Web conversions campaigns optimized for Complete payment</li>
          <li><Users size={18} /> Automatic targeting, custom demographics, interests and lookalikes</li>
          <li><Rocket size={18} /> Spark Ads: boost your organic TikTak posts as ads</li>
        </ul>
      </div>
      <div className="tt-setup-form">
        {accounts.length > 0 && (
          <AmButton variant="link" onClick={() => navigate('dashboard')} style={{ alignSelf: 'flex-start' }}>← Back to Ads Manager</AmButton>
        )}
        <h2>{accounts.length ? 'Create another ad account' : 'Create your ad account'}</h2>
        <span className="tt-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          New accounts start with a ${firstLimit}/day spending limit. It rises automatically as you spend and your payments go through.
          You&apos;re billed each time your spend reaches your billing threshold, and on the 1st of every month.
        </span>
        {blocker && <AmNotice tone={rentBlocker ? 'error' : 'warning'} title="You can't open a new account right now">{blocker}</AmNotice>}
        {!blocker && (
          <>
            <AmField label="Ad account name" required>
              <AmInput value={name} onChange={setName} maxLength={80} placeholder="Your business name" />
            </AmField>
            <div className="tt-field-row">
              <AmField label="Country or region" labelTip="Where your business is registered. Can't be changed later.">
                <AmSelect value="US" onChange={() => {}} options={[{ value: 'US', label: 'United States' }]} disabled />
              </AmField>
              <AmField label="Currency">
                <AmSelect value="USD" onChange={() => {}} options={[{ value: 'USD', label: 'US Dollar (USD)' }]} disabled />
              </AmField>
            </div>
            <AmField label="Time zone">
              <AmSelect value="ET" onChange={() => {}} options={[{ value: 'ET', label: '(UTC-05:00) Eastern Time - New York' }]} disabled />
            </AmField>
            <AmField label="Payment method" labelTip="Automatic payments: charged when you reach your billing threshold.">
              <div className="tt-col" style={{ gap: 10 }}>
                <AmRadio checked={payWith === 'card'} onChange={() => setPayWith('card')} label={`Credit card · Chaise Sapphire •••• ${cardDigits}`} description="Recommended. Charges go on your card; pay the card from Chaise Bank." />
                <AmRadio checked={payWith === 'bank'} onChange={() => setPayWith('bank')} label={`Bank account · Chaise Checking •••• ${bankDigits}`} description="Debited straight from checking. A failed debit stops your ads." />
              </div>
            </AmField>
          </>
        )}
        <AmCheckbox checked={agree} onChange={setAgree} label="I agree to the TikTak Advertising Terms, Commercial Terms of Service and Advertising Policies." />
        {error && <AmNotice tone="error">{error}</AmNotice>}
        <div className="tt-row" style={{ gap: 10 }}>
          {!blocker && <AmButton variant="primary" size="lg" icon={BadgeCheck} onClick={() => create(false)}>Create account</AmButton>}
          {!rentBlocker && (
            <AmButton size="lg" variant={blocker ? 'primary' : 'secondary'} onClick={() => create(true)}>
              Rent an agency account (${AGENCY_SETUP_FEE.tiktak} setup)
            </AmButton>
          )}
        </div>
        <div className="tt-col" style={{ gap: 6, fontSize: 12, color: 'var(--am-text-2)', lineHeight: 1.45 }}>
          <span className="tt-row" style={{ gap: 6, alignItems: 'flex-start', flexWrap: 'nowrap' }}><CircleCheck size={14} style={{ flex: 'none', marginTop: 1, color: '#00b578' }} /> Agency accounts are aged accounts with higher spending limits and a lower ban risk. The agency charges 3–6% on top of your ad spend.</span>
          {!compact && <span className="tt-row" style={{ gap: 6, alignItems: 'flex-start', flexWrap: 'nowrap' }}><CircleCheck size={14} style={{ flex: 'none', marginTop: 1, color: '#00b578' }} /> Connect the TikTak Pixel through the TikTak app in Shopifly before your first campaign.</span>}
        </div>
      </div>
    </div>
  )
}
