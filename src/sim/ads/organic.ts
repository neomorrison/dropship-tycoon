// Organic TikTak posts: a baseline burst of views, a small chance to go viral (hundreds of
// thousands to millions of views over a few days), store sessions from the link in bio, and
// Spark Ads that boost a post into an ad group.
import type { GameState, OrganicPost, TrafficPacket } from '../../core/types'
import { binomial, chance, clamp, poisson, rand, randInt, randRange, stochRound } from '../../core/rng'
import { notify } from '../../core/notify'
import { uid } from '../../core/ids'
import { BENCHMARKS } from '../../data/benchmarks'
import { enqueueActivity } from '../life'
import { findAdSet, findCreative, findStoreProduct, fmtInt, productDef } from './shared'
import { hookFit, scoreCreative } from './scoring'
import { createAd } from './structure'

const POSTS_CAP = 80

/** Enqueue the 'post_organic' activity (1h) for a ready creative. */
export function startOrganicPost(s: GameState, creativeId: string, storeProductId: string): string | null {
  const err = organicPostBlocker(s, creativeId, storeProductId)
  if (err) {
    notify(s, { kind: 'warning', title: 'Can\'t post this', body: err, site: 'tiktak' })
    return null
  }
  const cr = findCreative(s, creativeId)!
  return enqueueActivity(s, 'post_organic', { payload: { creativeId, storeProductId }, label: `Post "${cr.name}" to TikTak` })
}

export function organicPostBlocker(s: GameState, creativeId: string, storeProductId: string): string | null {
  const cr = findCreative(s, creativeId)
  if (!cr || cr.status !== 'ready') return 'Pick a finished creative.'
  const sp = findStoreProduct(s, storeProductId)
  if (!sp) return 'Pick the product this post links to.'
  if (sp.catalogId !== cr.catalogId) return 'The video shows a different product than the link in bio.'
  const today = Math.floor(s.time.hour / 24)
  const postsToday = s.ads.organicPosts.filter(p => Math.floor(p.postedHour / 24) === today).length
  if (postsToday >= 4) return 'Posting more than 4 times a day tanks your reach. Try again tomorrow.'
  return null
}

/** Called when the 'post_organic' activity completes. */
export function postOrganic(s: GameState, creativeId: string, storeProductId: string): void {
  const cr = findCreative(s, creativeId)
  const pd = cr ? productDef(cr.catalogId) : null
  if (!cr || !pd) return
  if (!cr.scores) cr.scores = scoreCreative(s, cr)
  const power = cr.scores.power.tiktak
  const hf = hookFit(pd, cr.hook, cr.format)
  const base = randRange(s, 300, 3000) * power * pd.wow
  // recycled footage & reposts do worse on the For You feed
  const dupe = s.ads.organicPosts.filter(p => p.creativeId === creativeId).length
  const views0 = base * (cr.shared ? 0.6 : 1) * Math.pow(0.5, dupe)
  const viralP = 0.015 * power * power * pd.wow * hf * (cr.shared ? 0.3 : 1) * Math.pow(0.4, dupe)
  const viral = chance(s, clamp(viralP, 0, 0.35))
  let target = views0
  let decay = 0.96
  let popHour: number | null = null
  if (viral) {
    // heavy-tailed: most viral posts land at 200–600k, a few break a million
    target = 200_000 * Math.pow(25, Math.pow(rand(s), 2.2))
    const hours = randInt(s, 2, 4) * 24
    decay = Math.pow(0.05, 1 / hours)
    popHour = s.time.hour + randInt(s, 4, 30)
  }
  const post: OrganicPost = {
    id: uid(s, 'post'),
    creativeId,
    storeProductId,
    postedHour: s.time.hour,
    views: 0,
    likes: 0,
    shares: 0,
    velocity: views0 * (1 - 0.9),
    sparked: false,
    viral,
    decay: 0.9,
    popHour,
    targetViews: Math.round(target),
    comments: 0,
    sessions: 0,
    viralDecay: viral ? decay : undefined,
  }
  s.ads.organicPosts.push(post)
  if (s.ads.organicPosts.length > POSTS_CAP) s.ads.organicPosts.splice(0, s.ads.organicPosts.length - POSTS_CAP)
  notify(s, { kind: 'info', title: 'Posted to TikTak', body: `"${cr.name}" is live. Views usually come in over the next day.`, site: 'tiktak', path: 'assets/posts' })
}

/** Hourly views, engagement and link-in-bio sessions for organic posts. */
export function organicTickHour(s: GameState, packets: TrafficPacket[]): void {
  const hour = s.time.hour
  for (const post of s.ads.organicPosts) {
    if (post.popHour != null && hour >= post.popHour && post.viral) {
      const vd = post.viralDecay ?? 0.96
      post.decay = vd
      post.velocity = Math.max(post.velocity, (post.targetViews ?? 200_000) * (1 - vd))
      post.popHour = null
      notify(s, { kind: 'success', title: 'Your TikTak post is taking off', body: 'Views are climbing fast on the For You feed. Make sure the product page and stock can handle it.', site: 'tiktak', path: 'assets/posts' })
    }
    if (post.velocity < 0.5) { post.velocity = 0; continue }
    const cr = findCreative(s, post.creativeId)
    const pd = cr ? productDef(cr.catalogId) : null
    const views = poisson(s, post.velocity)
    post.velocity *= post.decay ?? 0.9
    if (views <= 0 || !cr || !pd) continue
    const before = post.views
    post.views += views
    post.likes += binomial(s, views, clamp(0.04 + 0.08 * pd.wow, 0.01, 0.2))
    post.shares += binomial(s, views, clamp(0.004 + 0.008 * pd.wow, 0.001, 0.05))
    post.comments = (post.comments ?? 0) + binomial(s, views, cr.hook === 'controversial' ? 0.01 : 0.003)
    for (const m of [10_000, 100_000, 1_000_000]) {
      if (before < m && post.views >= m) {
        notify(s, { kind: 'success', title: `${fmtInt(m)} views on TikTak`, body: `"${cr.name}" just passed ${fmtInt(m)} views.`, site: 'tiktak', path: 'assets/posts' })
      }
    }
    const sp = findStoreProduct(s, post.storeProductId)
    if (!sp || sp.status !== 'active') continue
    const fit = cr.scores?.fit ?? 0.5
    const sessions = stochRound(s, views * 0.004 * (0.7 + 0.6 * fit))
    if (sessions <= 0) continue
    post.sessions = (post.sessions ?? 0) + sessions
    packets.push({
      source: 'tiktak_organic',
      platform: 'tiktak',
      storeProductId: post.storeProductId,
      sessions,
      intent: BENCHMARKS.tiktak.cvrMultiplier * 0.9,
      messageMatch: clamp(0.9 + 0.2 * fit, 0.85, 1.15),
    })
  }
}

/** TikTak Spark Ad: boost an organic post into an ad group. */
export function sparkPost(s: GameState, postId: string, adSetId: string): string | null {
  const post = s.ads.organicPosts.find(p => p.id === postId)
  const set = findAdSet(s, adSetId)
  if (!post || !set) return null
  if (set.platform !== 'tiktak') {
    notify(s, { kind: 'warning', title: 'Spark Ads are TikTak-only', body: 'Pick a TikTak ad group to boost this post.', site: 'tiktak' })
    return null
  }
  const cr = findCreative(s, post.creativeId)
  if (!cr) return null
  const text = (cr.hookText || cr.name).slice(0, 100)
  const id = createAd(s, {
    adSetId,
    name: `Spark · ${cr.name}`.slice(0, 120),
    creativeId: cr.id,
    storeProductId: post.storeProductId,
    primaryText: text,
    headline: '',
    cta: 'shop_now',
  })
  if (!id) return null
  const ad = s.ads.ads.find(a => a.id === id)
  if (ad) ad.sparkPostId = post.id
  post.sparked = true
  return id
}
