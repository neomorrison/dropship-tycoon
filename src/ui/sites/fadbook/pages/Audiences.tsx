// Audiences: website custom audiences (retargeting visitors from the pixel) and lookalike
// audiences (1–10% of US accounts most similar to your purchasers).
import { useMemo, useState } from 'react'
import { Globe, Plus, UsersRound } from 'lucide-react'
import type { CustomAudience, GameState } from '../../../../core/types'
import { act } from '../../../../core/store'
import { openSite } from '../../../../core/ui'
import { formatDate } from '../../../../core/time'
import { BENCHMARKS } from '../../../../data/benchmarks'
import { createAudience, hasPixel, lookalikeSize, retargetingSize } from '../../../../sim/ads'
import { AmButton, AmCard, AmField, AmMenu, AmModal, AmNotice, AmSegmented, AmTag } from '../../../kit/adsmanager'
import { EmptyArt } from '../../../kit/common'

const people = (n: number) => Math.round(n).toLocaleString('en-US')
const RETENTION = ['7', '14', '30', '60', '90', '180'] as const

export default function Audiences({ s, navigate }: { s: GameState; navigate: (p: string) => void }) {
  const [modal, setModal] = useState<null | 'website' | 'lookalike'>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const list = useMemo(() => s.ads.audiences.filter(a => a.platform === 'fadbook').slice().reverse(), [s.ads.audiences])
  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const set of s.ads.adSets) if (set.platform === 'fadbook' && set.status !== 'deleted' && set.targeting.audienceId) m.set(set.targeting.audienceId, (m.get(set.targeting.audienceId) ?? 0) + 1)
    return m
  }, [s.ads.adSets])
  const pixel = hasPixel(s, 'fadbook')
  const purchasers = s.store.pixel.fadbook.purchases
  const need = BENCHMARKS.fadbook.lookalikeMinPurchasers

  const availability = (a: CustomAudience) => {
    if (a.size < 100) return <AmTag tone="red">Audience too small</AmTag>
    if (a.kind === 'retargeting' && a.size < 1000) return <AmTag tone="yellow">Small audience</AmTag>
    return <AmTag tone="green">Ready</AmTag>
  }

  return (
    <div className="fb-page">
      <div className="fb-page-head">
        <div>
          <h1>Audiences</h1>
          <p className="fb-muted">Reach people who already know your store, or people similar to your customers.</p>
        </div>
        <AmMenu
          trigger={<AmButton variant="create" icon={Plus} caret>Create audience</AmButton>}
          placement="bottom-end"
          width={300}
          items={[
            { id: 'website', label: 'Custom audience', description: 'Website visitors from your pixel', icon: Globe, disabled: !pixel, disabledReason: 'Connect your pixel in Events Manager first.', onSelect: () => setModal('website') },
            { id: 'lookalike', label: 'Lookalike audience', description: 'People similar to your purchasers', icon: UsersRound, disabled: !pixel, disabledReason: 'Connect your pixel in Events Manager first.', onSelect: () => setModal('lookalike') },
          ]}
        />
      </div>
      {!pixel && (
        <AmNotice
          tone="warning"
          title="Audiences need pixel data"
          actions={<><AmButton size="sm" onClick={() => openSite('shopifly', s.store.created ? 'apps/fadbook-channel' : '')}>Connect in Shopifly</AmButton><AmButton size="sm" variant="link" onClick={() => navigate('events')}>Events Manager</AmButton></>}
        >
          Website custom audiences and lookalikes are built from the events your pixel sends. Connect the Fadbook &amp; Instaglam app first.
        </AmNotice>
      )}
      {flash && <AmNotice tone="success" onDismiss={() => setFlash(null)}>{flash}</AmNotice>}
      <AmCard flush>
        {list.length === 0 ? (
          <div className="fb-empty">
            <EmptyArt kind="customers" size={120} />
            <strong>You don't have any audiences yet</strong>
            <span className="fb-muted">Retarget people who visited your store, or find new people who look like your buyers.</span>
          </div>
        ) : (
          <table className="fb-grid">
            <thead><tr><th>Name</th><th>Type</th><th className="fb-r">Estimated audience size</th><th>Availability</th><th className="fb-hide-narrow">Used in</th><th className="fb-hide-narrow">Date created</th></tr></thead>
            <tbody>
              {list.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  <td>{a.kind === 'lookalike' ? 'Lookalike audience' : 'Custom audience'}<div className="fb-small fb-muted">{a.kind === 'lookalike' ? `Source: purchasers · ${a.param}%` : `Website · ${a.param}-day retention`}</div></td>
                  <td className="fb-r">{a.size < 1000 ? 'Below 1,000' : `${people(a.size * 0.9)} – ${people(a.size * 1.06)}`}</td>
                  <td>{availability(a)}</td>
                  <td className="fb-hide-narrow">{usage.get(a.id) ? `${usage.get(a.id)} ad set${usage.get(a.id) === 1 ? '' : 's'}` : <span className="fb-muted">Not used</span>}</td>
                  <td className="fb-hide-narrow">{formatDate(a.createdDay, 'short')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AmCard>
      <p className="fb-small fb-muted">Website audiences update every day as new people visit your store and older visits fall out of the retention window.</p>
      {modal === 'website' && (
        <WebsiteModal
          s={s}
          onClose={() => setModal(null)}
          onCreate={days => {
            let id: string | null = null
            act(g => { id = createAudience(g, 'fadbook', 'retargeting', days) })
            setModal(null)
            if (id) setFlash(`Website visitors (last ${days} days) created. Use it in an ad set's audience section.`)
          }}
        />
      )}
      {modal === 'lookalike' && (
        <LookalikeModal
          purchasers={purchasers}
          need={need}
          onClose={() => setModal(null)}
          onCreate={pct => {
            let id: string | null = null
            act(g => { id = createAudience(g, 'fadbook', 'lookalike', pct) })
            setModal(null)
            if (id) setFlash(`Lookalike (US, ${pct}%) created. Choose it under Lookalike audience in an ad set.`)
          }}
        />
      )}
    </div>
  )
}

function WebsiteModal({ s, onClose, onCreate }: { s: GameState; onClose: () => void; onCreate: (days: number) => void }) {
  const [days, setDays] = useState<(typeof RETENTION)[number]>('30')
  const size = retargetingSize(s, 'fadbook', Number(days))
  return (
    <AmModal
      inline
      open
      onClose={onClose}
      title="Create a website custom audience"
      size="md"
      pauseGame
      footer={<><AmButton onClick={onClose}>Cancel</AmButton><AmButton variant="primary" onClick={() => onCreate(Number(days))}>Create audience</AmButton></>}
    >
      <div className="fb-stack">
        <AmField label="Source"><span className="fb-inline"><Globe size={16} /> {s.store.name || 'My Store'} Pixel</span></AmField>
        <AmField label="Events"><span>All website visitors</span></AmField>
        <AmField label="Retention" labelTip="How long people stay in the audience after their last visit (max 180 days).">
          <AmSegmented value={days} onChange={setDays} options={RETENTION.map(d => ({ value: d, label: `${d} days` }))} ariaLabel="Retention" />
        </AmField>
        <div className="fb-estimate">
          <span className="fb-small fb-muted">Estimated audience size</span>
          <strong>{size < 1000 ? `${people(size)} (below 1,000)` : people(size)}</strong>
          <span className="fb-small fb-muted">Visitors your pixel matched to Fadbook accounts in the last {days} days.</span>
        </div>
        {size < 1000 && (
          <AmNotice tone="warning">
            Small retargeting audiences fill up fast: frequency climbs and costs rise if you give them much budget. They grow as more people visit your store.
          </AmNotice>
        )}
      </div>
    </AmModal>
  )
}

function LookalikeModal({ purchasers, need, onClose, onCreate }: { purchasers: number; need: number; onClose: () => void; onCreate: (pct: number) => void }) {
  const [pct, setPct] = useState(1)
  const ok = purchasers >= need
  return (
    <AmModal
      inline
      open
      onClose={onClose}
      title="Create a lookalike audience"
      size="md"
      pauseGame
      footer={<><AmButton onClick={onClose}>Cancel</AmButton><AmButton variant="primary" disabled={!ok} onClick={() => onCreate(pct)}>Create audience</AmButton></>}
    >
      <div className="fb-stack">
        <AmField label="Select your lookalike source" help={ok ? `${people(purchasers)} purchasers from your pixel.` : undefined}>
          <span className="fb-inline"><UsersRound size={16} /> Purchasers (website, from your pixel)</span>
        </AmField>
        {!ok && (
          <AmNotice tone="warning" title="Source audience too small">
            A lookalike needs at least {need} people in the source audience. Your pixel has seen {people(purchasers)} purchaser{purchasers === 1 ? '' : 's'}.
          </AmNotice>
        )}
        <AmField label="Audience location"><span>United States</span></AmField>
        <AmField label="Audience size" labelTip="1% is the people most similar to your source. Bigger percentages reach more people but are less similar.">
          <div className="fb-slider">
            <input type="range" min={1} max={10} step={1} value={pct} disabled={!ok} onChange={e => setPct(Number(e.target.value))} aria-label="Lookalike percentage" />
            <div className="fb-slider-scale"><span>1%</span><span>5%</span><span>10%</span></div>
          </div>
        </AmField>
        <div className="fb-estimate">
          <span className="fb-small fb-muted">Estimated reach</span>
          <strong>{people(lookalikeSize('fadbook', pct))} accounts</strong>
          <span className="fb-small fb-muted">{pct}% of accounts in the United States most similar to your purchasers.</span>
        </div>
      </div>
    </AmModal>
  )
}
