// Assets › TikTak posts: organic posts (views, likes, comments, shares, link-in-bio visits),
// "Post to TikTak" (queues the post_organic activity) and Spark Ads from a post.
import { useState, type ReactNode } from 'react'
import { Eye, Flame, Heart, Link2, Loader2, MessageCircle, Play, Plus, Send, Share2, Zap } from 'lucide-react'
import type { Creative, GameState, OrganicPost } from '../../../../core/types'
import { act, useGS } from '../../../../core/store'
import { formatClock, formatDate } from '../../../../core/time'
import { organicPostBlocker, sparkPost, startOrganicPost } from '../../../../sim/ads'
import { AmButton, AmField, AmModal, AmNotice, AmSelect, amFmt } from '../../../kit/adsmanager'
import { ImageWithFallback, formatSocialCount } from '../../../kit/common'
import { EmptyBlock, PageHead, Pill, SubTabs, useAccount, useGame, useTt } from '../common'
import { identityName } from '../data'
import { CreativePicker, creativeThumb } from './create/Pickers'

/** Profile-grid style tile: 9:16 cover with the on-screen text and the play count. */
function PostTile({ c, views, width }: { c: Creative; views: number | null; width: number }) {
  return (
    <div className="tt-lib-thumb" style={{ width, aspectRatio: '9 / 16', borderRadius: 6, cursor: 'default' }}>
      <ImageWithFallback src={creativeThumb(c)} alt={c.name} fallbackLabel={c.name} fallbackEmoji="🎬" width="100%" height="100%" />
      {c.hookText && <span className="tt-lib-thumb-hook">{c.hookText}</span>}
      <span className="tt-lib-thumb-badge"><Play size={10} fill="#fff" /> {views === null ? `0:${String(Math.round(c.durationSec)).padStart(2, '0')}` : formatSocialCount(views)}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Post to TikTak modal
// ---------------------------------------------------------------------------
export function PostModal({ open, onClose, initialCreativeId }: { open: boolean; onClose: () => void; initialCreativeId?: string | null }) {
  const s = useGame()
  const [creativeId, setCreativeId] = useState<string | null>(null)
  const [productId, setProductId] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [openKey, setOpenKey] = useState(false)
  if (open !== openKey) {
    // reset the form each time the modal opens
    setOpenKey(open)
    if (open) {
      const cr = initialCreativeId ? s.creatives.creatives.find(c => c.id === initialCreativeId) : undefined
      setCreativeId(cr?.id ?? null)
      setProductId(cr ? (s.store.products.find(p => p.catalogId === cr.catalogId && p.status === 'active') ?? s.store.products.find(p => p.catalogId === cr.catalogId))?.id ?? null : s.store.products.find(p => p.status === 'active')?.id ?? null)
      setDone(null)
    }
  }
  const product = s.store.products.find(p => p.id === productId)
  const cr = s.creatives.creatives.find(c => c.id === creativeId)
  const blocker = creativeId && productId ? organicPostBlocker(s, creativeId, productId) : null
  const post = () => {
    if (!creativeId || !productId || blocker) return
    const out: { id: string | null } = { id: null }
    act(st => { out.id = startOrganicPost(st, creativeId, productId) })
    if (out.id) setDone(cr?.name ?? 'Your video')
  }
  return (
    <AmModal
      open={open}
      onClose={onClose}
      inline
      size="lg"
      title="Post to TikTak"
      subtitle="Publish a video on your TikTak account with your store link in bio"
      footer={done
        ? <AmButton variant="primary" onClick={onClose}>Done</AmButton>
        : <><AmButton onClick={onClose}>Cancel</AmButton><AmButton variant="primary" icon={Send} disabled={!creativeId || !productId || !!blocker} onClick={post}>Post</AmButton></>}
    >
      {done ? (
        <AmNotice tone="success" title="Added to your to-do list">
          “{done}” will be posted when you get to it. Posting and replying to the first comments takes about an hour and works from your phone. Views come in over the next day.
        </AmNotice>
      ) : (
        <div className="tt-grid2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 220px' }}>
          <div className="tt-fields">
            <AmField label="Link in bio" labelTip="Where viewers go when they tap your profile link.">
              <AmSelect
                value={productId}
                onChange={v => { setProductId(v); const p = s.store.products.find(x => x.id === v); if (cr && p && cr.catalogId !== p.catalogId) setCreativeId(null) }}
                placeholder="Select a product"
                options={s.store.products.filter(p => p.status !== 'archived').map(p => ({ value: p.id, label: p.title, description: p.status === 'active' ? undefined : 'Draft: visitors will see an unavailable page' }))}
              />
            </AmField>
            <AmField label="Video">
              {product ? (
                <CreativePicker s={s} catalogId={product.catalogId} selected={creativeId ? [creativeId] : []} onChange={ids => setCreativeId(ids[ids.length - 1] ?? null)} max={2} />
              ) : <span className="tt-muted tt-small">Select a product first.</span>}
            </AmField>
            {blocker && <AmNotice tone="warning">{blocker}</AmNotice>}
            <span className="tt-faint tt-small">Organic reach is unpredictable: most posts get a few hundred to a few thousand views, and a rare one takes off. Reposting the same video does worse each time.</span>
          </div>
          <div className="tt-preview" style={{ padding: 0 }}>
            {cr ? (
              <>
                <PostTile c={cr} views={null} width={180} />
                <span className="tt-preview-note">@{identityName(s).toLowerCase().replace(/[^a-z0-9]+/g, '')} · caption: “{cr.hookText || cr.name}”</span>
              </>
            ) : <span className="tt-muted tt-small" style={{ padding: '60px 0' }}>Pick a video to preview</span>}
          </div>
        </div>
      )}
    </AmModal>
  )
}

// ---------------------------------------------------------------------------
// Spark modal
// ---------------------------------------------------------------------------
function SparkModal({ post, onClose }: { post: OrganicPost | null; onClose: () => void }) {
  const s = useGame()
  const { navigate } = useTt()
  const { account } = useAccount()
  const [adSetId, setAdSetId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const campaigns = s.ads.campaigns.filter(c => c.platform === 'tiktak' && c.accountId === account?.id && c.status !== 'deleted')
  const sets = s.ads.adSets.filter(x => campaigns.some(c => c.id === x.campaignId) && x.status !== 'deleted')
  const boost = () => {
    if (!post || !adSetId) return
    const out: { id: string | null } = { id: null }
    act(st => { out.id = sparkPost(st, post.id, adSetId) })
    if (out.id) { setMsg(null); onClose() }
    else setMsg('This post couldn\'t be added to that ad group. Check the notification for details.')
  }
  return (
    <AmModal
      open={!!post}
      onClose={onClose}
      inline
      title="Boost with Spark Ads"
      subtitle="Run this post as an ad. Views, likes and follows count on the original post."
      footer={<>
        <AmButton onClick={() => post && navigate(`campaign/create/spark/${post.id}`)}>New campaign</AmButton>
        <AmButton variant="primary" icon={Zap} disabled={!adSetId} onClick={boost}>Add to ad group</AmButton>
      </>}
    >
      <div className="tt-fields">
        {sets.length ? (
          <AmField label="Ad group" help="The post becomes a new ad in this ad group. If the ad group has delivered, it goes back into learning.">
            <AmSelect value={adSetId} onChange={setAdSetId} placeholder="Select an ad group" options={sets.map(x => ({ value: x.id, label: x.name, description: campaigns.find(c => c.id === x.campaignId)?.name }))} />
          </AmField>
        ) : (
          <span className="tt-muted" style={{ fontSize: 13 }}>You don&apos;t have an ad group yet. Create a new campaign with this post.</span>
        )}
        {msg && <AmNotice tone="error">{msg}</AmNotice>}
      </div>
    </AmModal>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function PostCard({ s, p, onSpark }: { s: GameState; p: OrganicPost; onSpark: () => void }) {
  const cr = s.creatives.creatives.find(c => c.id === p.creativeId)
  const product = s.store.products.find(x => x.id === p.storeProductId)
  const hoursLive = s.time.hour - p.postedHour
  const trending = p.velocity > 500 || (!!p.viral && p.popHour == null && p.velocity > 50)
  const stat = (icon: ReactNode, v: number, label: string) => (
    <div className="tt-post-stat"><b>{icon}{formatSocialCount(v)}</b><span>{label}</span></div>
  )
  return (
    <div className="tt-post">
      <div className="tt-post-media">
        {cr ? <PostTile c={cr} views={p.views} width={150} /> : <span className="tt-muted tt-small" style={{ padding: 40 }}>Video removed</span>}
        <span style={{ position: 'absolute', top: 18, left: 12, display: 'flex', gap: 4, flexDirection: 'column', alignItems: 'flex-start' }}>
          {trending && <Pill tone="pink"><Flame size={11} /> Trending</Pill>}
          {p.sparked && <Pill tone="dark"><Zap size={11} /> Spark Ad</Pill>}
        </span>
      </div>
      <div className="tt-post-body">
        <span className="tt-post-caption">{cr?.hookText || cr?.name || 'TikTak post'}</span>
        <div className="tt-post-stats">
          {stat(<Eye size={12} />, p.views, 'Views')}
          {stat(<Heart size={12} />, p.likes, 'Likes')}
          {stat(<MessageCircle size={12} />, p.comments ?? 0, 'Comments')}
          {stat(<Share2 size={12} />, p.shares, 'Shares')}
        </div>
        <div className="tt-row tt-small tt-muted" style={{ justifyContent: 'space-between' }}>
          <span className="tt-row" style={{ gap: 4 }}><Link2 size={12} /> {amFmt.int(p.sessions ?? 0)} link-in-bio visits</span>
          <span>{hoursLive < 24 ? `${Math.max(1, hoursLive)}h ago` : formatDate(Math.floor(p.postedHour / 24), 'md')}</span>
        </div>
        {product && <span className="tt-faint tt-small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Links to {product.title}</span>}
        <AmButton size="sm" variant={p.sparked ? 'secondary' : 'primary'} icon={Zap} onClick={onSpark} disabled={!cr || cr.status !== 'ready'}>{p.sparked ? 'Spark again' : 'Spark'}</AmButton>
      </div>
    </div>
  )
}

export default function Posts() {
  const s = useGame()
  const { navigate } = useTt()
  const [postOpen, setPostOpen] = useState(false)
  const [sparkFor, setSparkFor] = useState<OrganicPost | null>(null)
  const activity = useGS(st => st.player.activity)
  const queue = useGS(st => st.player.queue)
  const pending = [activity, ...queue].filter(a => a && a.kind === 'post_organic')
  const posts = [...s.ads.organicPosts].sort((a, b) => b.postedHour - a.postedHour)
  const totals = posts.reduce((acc, p) => ({ views: acc.views + p.views, likes: acc.likes + p.likes, sessions: acc.sessions + (p.sessions ?? 0) }), { views: 0, likes: 0, sessions: 0 })
  const today = Math.floor(s.time.hour / 24)
  const postsToday = s.ads.organicPosts.filter(p => Math.floor(p.postedHour / 24) === today).length

  return (
    <div className="tt-page">
      <PageHead
        title="TikTak posts"
        crumbs={[{ label: 'Assets' }, { label: 'TikTak posts' }]}
        actions={<AmButton variant="primary" icon={Plus} onClick={() => setPostOpen(true)}>Post to TikTak</AmButton>}
      />
      <SubTabs tabs={[{ id: 'videos', label: 'Videos' }, { id: 'posts', label: 'TikTak posts' }]} active="posts" onChange={id => id === 'videos' && navigate('assets/creatives')} />
      <div className="tt-kpis">
        <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Posts</span><span className="tt-kpi-value">{amFmt.int(posts.length)}</span><span className="tt-kpi-foot">{postsToday}/4 today</span></div>
        <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Total views</span><span className="tt-kpi-value">{formatSocialCount(totals.views)}</span></div>
        <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Total likes</span><span className="tt-kpi-value">{formatSocialCount(totals.likes)}</span></div>
        <div className="tt-kpi tt-kpi-static"><span className="tt-kpi-label">Link-in-bio visits</span><span className="tt-kpi-value">{amFmt.int(totals.sessions)}</span></div>
      </div>
      {pending.length > 0 && (
        <AmNotice tone="info" title={`${pending.length} post${pending.length === 1 ? '' : 's'} waiting to go up`}>
          <span className="tt-row" style={{ gap: 6 }}>
            <Loader2 size={14} className="am-spinner" />
            {pending.map(a => a!.label).join(' · ')}{activity?.kind === 'post_organic' && activity.startedHour != null ? ` (started ${formatClock(activity.startedHour)})` : ''}
          </span>
        </AmNotice>
      )}
      {posts.length === 0 ? (
        <EmptyBlock
          art="creative"
          title="No posts yet"
          body="Post your videos organically to test hooks for free. Posts that do well can be boosted as Spark Ads, which keep the likes and comments social proof."
          action={<AmButton variant="primary" icon={Send} onClick={() => setPostOpen(true)}>Post to TikTak</AmButton>}
        />
      ) : (
        <div className="tt-posts">
          {posts.map(p => <PostCard key={p.id} s={s} p={p} onSpark={() => setSparkFor(p)} />)}
        </div>
      )}
      <PostModal open={postOpen} onClose={() => setPostOpen(false)} />
      <SparkModal post={sparkFor} onClose={() => setSparkFor(null)} />
    </div>
  )
}
