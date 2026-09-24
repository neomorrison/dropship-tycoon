// Tools › Audiences: website traffic (retargeting) and lookalike audiences built from pixel data.
import { useState } from 'react'
import { Globe, Plus, UsersRound } from 'lucide-react'
import type { CustomAudience } from '../../../../core/types'
import { act } from '../../../../core/store'
import { formatDate } from '../../../../core/time'
import { createAudience, hasPixel, lookalikeSize, retargetingSize } from '../../../../sim/ads'
import { BENCHMARKS } from '../../../../data/benchmarks'
import {
  AmButton, AmField, AmMenu, AmModal, AmNotice, AmRadioCard, AmSegmented, AmSelect, AmTable, MetricCell, amFmt, type AmColumn,
} from '../../../kit/adsmanager'
import { EmptyBlock, Panel, PageHead, Pill, useGame, useTt } from '../common'
import { entityDisplayId } from '../data'

const WINDOWS = [7, 14, 30, 60, 90, 180]

export default function Audiences() {
  const s = useGame()
  const { navigate } = useTt()
  const [modal, setModal] = useState<null | 'retargeting' | 'lookalike'>(null)
  const [days, setDays] = useState('30')
  const [pct, setPct] = useState('3')
  const [error, setError] = useState<string | null>(null)
  const audiences = s.ads.audiences.filter(a => a.platform === 'tiktak')
  const pixel = hasPixel(s, 'tiktak')
  const buyers = s.store.pixel?.tiktak?.purchases ?? 0
  const need = BENCHMARKS.fadbook.lookalikeMinPurchasers
  const usedIn = (a: CustomAudience) => s.ads.adSets.filter(x => x.platform === 'tiktak' && x.status !== 'deleted' && x.targeting.audienceId === a.id).length

  const create = () => {
    const out: { id: string | null } = { id: null }
    act(st => { out.id = createAudience(st, 'tiktak', modal!, modal === 'lookalike' ? Number(pct) : Number(days)) })
    if (out.id) { setModal(null); setError(null) }
    else setError(modal === 'lookalike' ? `A lookalike needs at least ${need} Complete payment events from your pixel. Yours has ${amFmt.int(buyers)}.` : 'The audience couldn\'t be created. Check that your pixel is connected.')
  }

  const cols: AmColumn<CustomAudience>[] = [
    {
      id: 'name', header: 'Audience name', width: 280, sticky: true, sortValue: a => a.name,
      render: a => <div className="tt-col" style={{ gap: 1 }}><b style={{ fontSize: 13 }}>{a.name}</b><span className="tt-faint tt-small">ID: {entityDisplayId(a.id).slice(0, 10)}</span></div>,
    },
    { id: 'type', header: 'Type', width: 170, render: a => <span style={{ fontSize: 12 }}>{a.kind === 'lookalike' ? 'Lookalike audience' : 'Custom audience · Website traffic'}</span> },
    {
      id: 'size', header: 'Audience size', align: 'right', width: 140, sortValue: a => a.size,
      render: a => <MetricCell value={a.size < 1000 ? (a.size < 100 ? 'Below 100' : amFmt.int(a.size)) : amFmt.compact(a.size)} />,
    },
    {
      id: 'status', header: 'Status', width: 150,
      render: a => (a.size >= 100 ? <Pill tone="success" dot>Available</Pill> : <Pill tone="warning" dot>Audience too small</Pill>),
    },
    { id: 'used', header: 'Used in', align: 'right', width: 120, render: a => <MetricCell value={`${usedIn(a)} ad group${usedIn(a) === 1 ? '' : 's'}`} /> },
    { id: 'created', header: 'Created', width: 130, sortValue: a => a.createdDay, render: a => <span style={{ fontSize: 12 }}>{formatDate(a.createdDay, 'short')}</span> },
  ]

  const previewSize = modal === 'lookalike' ? lookalikeSize('tiktak', Number(pct)) : modal === 'retargeting' ? retargetingSize(s, 'tiktak', Number(days)) : 0

  return (
    <div className="tt-page tt-page-narrow">
      <PageHead
        title="Audiences"
        crumbs={[{ label: 'Tools' }, { label: 'Audiences' }]}
        actions={
          <AmMenu
            placement="bottom-end"
            width={300}
            trigger={<AmButton variant="primary" icon={Plus} caret>Create audience</AmButton>}
            items={[
              { id: 'rt', label: 'Custom audience: Website traffic', icon: Globe, description: 'People who visited your store', onSelect: () => { setError(null); setModal('retargeting') } },
              { id: 'lal', label: 'Lookalike audience', icon: UsersRound, description: 'People similar to your buyers', onSelect: () => { setError(null); setModal('lookalike') } },
            ]}
          />
        }
      />
      {!pixel && (
        <AmNotice tone="warning" title="Audiences need pixel data" actions={<AmButton size="sm" onClick={() => navigate('tools/events')}>Go to Events</AmButton>}>
          Website traffic and lookalike audiences are built from TikTak Pixel events. Connect the pixel first.
        </AmNotice>
      )}
      <Panel pad={false}>
        {audiences.length === 0 ? (
          <EmptyBlock
            art="customers"
            title="No audiences yet"
            body={`Retarget people who visited your store, or find new people who look like your buyers. Lookalikes need at least ${need} Complete payment events.`}
          />
        ) : (
          <div style={{ padding: 16 }}>
            <AmTable rows={audiences} columns={cols} rowKey={a => a.id} selectable={false} totals={false} defaultSort={{ columnId: 'created', direction: 'desc' }} />
          </div>
        )}
      </Panel>
      <span className="tt-faint tt-small">Website traffic audiences update every day. Small retargeting audiences (a few thousand people) can only absorb a small budget before frequency climbs.</span>

      <AmModal
        open={modal !== null}
        onClose={() => setModal(null)}
        inline
        pauseGame
        title={modal === 'lookalike' ? 'Create lookalike audience' : 'Create custom audience'}
        subtitle={modal === 'lookalike' ? 'Find new people similar to your buyers' : 'Website traffic'}
        footer={<><AmButton onClick={() => setModal(null)}>Cancel</AmButton><AmButton variant="primary" onClick={create} disabled={!pixel}>Create</AmButton></>}
      >
        <div className="tt-fields">
          {modal === 'retargeting' ? (
            <>
              <AmRadioCard checked title="All website visitors" description="People who visited any page of your store, including those who didn't buy." icon={Globe} />
              <AmField label="Lookback window" help="How far back to include visitors.">
                <AmSelect value={days} onChange={setDays} options={WINDOWS.map(d => ({ value: String(d), label: `${d} days` }))} width={200} />
              </AmField>
            </>
          ) : (
            <>
              <AmField label="Source" help={`Your pixel has ${amFmt.int(buyers)} Complete payment events (at least ${need} needed).`}>
                <AmSelect value="cp" onChange={() => {}} options={[{ value: 'cp', label: 'TikTak Pixel · Complete payment (180 days)' }]} />
              </AmField>
              <AmField label="Audience size" labelTip="Narrow lookalikes are most similar to your buyers; broad ones reach more people.">
                <AmSegmented
                  value={pct}
                  onChange={setPct}
                  options={[{ value: '3', label: 'Narrow' }, { value: '6', label: 'Balanced' }, { value: '10', label: 'Broad' }]}
                  ariaLabel="Lookalike size"
                />
              </AmField>
              {buyers < need && <AmNotice tone="warning">Not enough source data yet. Keep collecting purchases: {amFmt.int(buyers)} of {need}.</AmNotice>}
            </>
          )}
          <div className="tt-est-row" style={{ fontSize: 13 }}><span className="tt-muted">Estimated audience size</span><b>{previewSize < 100 ? 'Below 100' : amFmt.int(previewSize)}</b></div>
          {error && <AmNotice tone="error">{error}</AmNotice>}
        </div>
      </AmModal>
    </div>
  )
}
