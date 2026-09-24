// Believable in-feed ad previews: TikTak For You, Fadbook Reels, Fadbook News Feed.
// "Video" creatives get CSS-only motion: Ken Burns on the product shot, a playback
// progress bar and auto-captions stepping through the script, all looping every
// `durationSec`. Missing art falls back to a branded tile.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Bell, Bookmark, Camera, ChevronRight, Clapperboard, Ellipsis, Forward, Globe, Heart, House, Inbox, Menu, MessageCircle,
  MessageCircleMore, Music2, Play, Plus, Search, Share2, Store, ThumbsUp, Tv, User, Users, VolumeX, X,
} from 'lucide-react'
import { cx, formatSocialCount, initials, tileColor } from '../common/utils'
import { ImageWithFallback } from '../common/ImageWithFallback'
import { PhoneChrome, PhoneMockup, ScaleBox, PHONE_SCREEN } from './PhoneMockup'
import './phone.css'

export type AdPlatform = 'tiktak' | 'fadbook-reels' | 'fadbook-feed'

export interface AdPreviewProps {
  platform: AdPlatform
  /** main visual (e.g. productImage(catalogId) or creative.thumb) */
  productImage?: string | null
  /** optional extra frames → slideshow (carousel/slideshow formats) */
  images?: string[]
  /** big on-screen hook text (first thing viewers read) */
  hookText?: string
  /** post caption / primary text */
  caption?: string
  brandName: string
  /** call-to-action button label (default "Shop now") */
  cta?: string
  likes?: number
  comments?: number
  shares?: number
  /** TikTak bookmarks (default ≈ 12% of likes) */
  saves?: number
  /** animate as a video (Ken Burns, progress bar, captions). Static images show no playback UI */
  isVideo?: boolean
  /** video length in seconds; drives every loop (default 15) */
  durationSec?: number
  /** voiceover/script: turned into auto-captions */
  script?: string
  /** explicit caption lines (override `script`) */
  subtitles?: string[]
  /** feed: bold headline in the link strip (default: product name or brand) */
  headline?: string
  /** feed: small description under the headline */
  linkDescription?: string
  /** feed: domain in the link strip (default "<brand>.myshopifly.com") */
  domain?: string
  /** brand avatar image; default is a colored initial tile */
  avatar?: string
  /** used for the image fallback label */
  productName?: string
  /** TikTak music line (default "Promoted music") */
  musicLabel?: string
  /** hook text style: white box (default) or outlined text */
  hookStyle?: 'box' | 'outline'
  /** false freezes all motion (e.g. offscreen cards) */
  playing?: boolean
  /** wrap in a PhoneMockup (default true) */
  frame?: boolean
  /** rendered width in px (default 280) */
  width?: number
  /** status bar when frameless (default hidden) */
  showStatusBar?: boolean
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'store'

/** Split a script/caption into short on-screen caption chunks (TikTok-style auto captions). */
export function subtitleChunks(text: string, maxWords = 4, maxChunks = 10): string[] {
  const clean = text.replace(/#[\w-]+/g, '').replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const out: string[] = []
  for (const sentence of clean.split(/(?<=[.!?…])\s+/)) {
    const words = sentence.split(' ').filter(Boolean)
    for (let i = 0; i < words.length; i += maxWords) out.push(words.slice(i, i + maxWords).join(' '))
  }
  return out.slice(0, maxChunks)
}

/** Caption text with #hashtags bolded. */
function richCaption(text: string): ReactNode[] {
  return text.split(/(\s+)/).map((tok, i) => (tok.startsWith('#') ? <b key={i}>{tok}</b> : tok))
}
/** Highlight numbers / prices / percentages in yellow like creator captions do. */
function emphasize(line: string): ReactNode[] {
  return line.split(' ').map((w, i) => (
    <span key={i}>
      {i > 0 && ' '}
      {/[\d$%]/.test(w) ? <em>{w}</em> : w}
    </span>
  ))
}

function BrandAvatar({ brandName, avatar, size }: { brandName: string; avatar?: string; size: number }) {
  const c = tileColor(brandName)
  return (
    <span className="ph-avatar" style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: size * 0.42 }}>
      {avatar ? <ImageWithFallback src={avatar} alt={brandName} fallbackLabel={brandName} /> : initials(brandName, 1)}
    </span>
  )
}

function Media({ src, images, alt, label, playing, durationSec }: { src?: string | null; images?: string[]; alt: string; label: string; playing: boolean; durationSec: number }) {
  const frames = images && images.length > 1 ? images : null
  const n = frames?.length ?? 0
  const framesKey = frames ? frames.join('|') : ''
  const [idx, setIdx] = useState(0)
  // keyed on content (not array identity) so parent re-renders don't restart the timer
  useEffect(() => {
    setIdx(0)
    if (n < 2 || !playing) return
    const ms = Math.max(1500, (durationSec * 1000) / n)
    const t = setInterval(() => setIdx(i => (i + 1) % n), ms)
    return () => clearInterval(t)
  }, [framesKey, n, playing, durationSec])
  if (frames) {
    return (
      <>
        {frames.map((f, i) => (
          <div key={f + i} className={cx('ph-slide', i === idx && 'ph-slide-on')}>
            <ImageWithFallback src={f} alt={alt} fallbackLabel={label} height="100%" style={{ width: '100%', height: '100%' }} loading="eager" />
          </div>
        ))}
      </>
    )
  }
  return <ImageWithFallback src={src} alt={alt} fallbackLabel={label} height="100%" style={{ width: '100%', height: '100%' }} loading="eager" />
}

function Hook({ text, style }: { text?: string; style: 'box' | 'outline' }) {
  if (!text?.trim()) return null
  return (
    <div className={cx('ph-hook', style === 'outline' && 'ph-hook-outline')}>
      <span>{text.trim()}</span>
    </div>
  )
}

function Subtitles({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <div className="ph-subs" aria-hidden>
      <div className="ph-subs-track">
        {lines.map((l, i) => <div key={i} className="ph-sub"><span>{emphasize(l)}</span></div>)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
interface ScreenProps extends Required<Pick<AdPreviewProps, 'brandName' | 'cta' | 'hookStyle'>> {
  p: AdPreviewProps
  subs: string[]
  isVideo: boolean
  playing: boolean
  durationSec: number
  likes: number
  comments: number
  shares: number
  label: string
}

function TikTakScreen({ p, subs, isVideo, playing, durationSec, likes, comments, shares, label, brandName, cta, hookStyle }: ScreenProps) {
  const handle = slugify(brandName)
  const saves = p.saves ?? Math.round(likes * 0.12)
  const music = p.musicLabel ?? `Promoted music · ${brandName}`
  return (
    <>
      <div className="ph-media">
        <Media src={p.productImage} images={p.images} alt={`${brandName} ad`} label={label} playing={playing} durationSec={durationSec} />
      </div>
      <div className="ph-shade-top" />
      <div className="ph-shade-rail" />
      <div className="ph-shade-bottom" />
      <Hook text={p.hookText} style={hookStyle} />
      {isVideo && <Subtitles lines={subs} />}
      <div className="ph-tt-top">
        <span className="ph-tt-live"><Tv size={22} strokeWidth={2} /></span>
        <span className="ph-tt-tabs"><span>Explore</span><span>Following</span><b>For You</b></span>
        <Search size={24} strokeWidth={2.2} />
      </div>
      <div className="ph-tt-rail">
        <div className="ph-tt-follow">
          <BrandAvatar brandName={brandName} avatar={p.avatar} size={48} />
          <span className="ph-tt-plus"><Plus size={14} strokeWidth={3} /></span>
        </div>
        <span className="ph-rail-btn"><Heart size={34} fill="#fff" strokeWidth={0} />{formatSocialCount(likes)}</span>
        <span className="ph-rail-btn"><MessageCircleMore size={32} fill="#fff" stroke="#000" strokeWidth={0.6} />{formatSocialCount(comments)}</span>
        <span className="ph-rail-btn"><Bookmark size={30} fill="#fff" strokeWidth={0} />{formatSocialCount(saves)}</span>
        <span className="ph-rail-btn"><Forward size={32} fill="#fff" strokeWidth={0} />{formatSocialCount(shares)}</span>
        <span className="ph-tt-disc"><BrandAvatar brandName={brandName} avatar={p.avatar} size={24} /></span>
      </div>
      <div className="ph-tt-info">
        <span className="ph-tt-name">{handle}</span>
        <span><span className="ph-sponsored">Sponsored</span></span>
        {p.caption && <span className="ph-tt-caption">{richCaption(p.caption)}</span>}
        <span className="ph-tt-music">
          <Music2 size={14} strokeWidth={2.4} />
          <span style={{ overflow: 'hidden', flex: 1 }}>
            <span className="ph-tt-music-scroll">{music}&nbsp;&nbsp;·&nbsp;&nbsp;{music}&nbsp;&nbsp;·&nbsp;&nbsp;</span>
          </span>
        </span>
        <span className="ph-tt-cta">{cta}<ChevronRight size={18} strokeWidth={2.6} /></span>
      </div>
      {isVideo && <div className="ph-progress ph-tt-progress"><span /></div>}
      <div className="ph-tt-nav">
        <span className="ph-nav-item ph-nav-item-on"><House size={24} strokeWidth={2.2} fill="#fff" />Home</span>
        <span className="ph-nav-item"><Users size={24} strokeWidth={2} />Friends</span>
        <span className="ph-nav-item"><span className="ph-tt-create"><Plus size={20} strokeWidth={3} /></span></span>
        <span className="ph-nav-item"><Inbox size={24} strokeWidth={2} />Inbox</span>
        <span className="ph-nav-item"><User size={24} strokeWidth={2} />Profile</span>
      </div>
    </>
  )
}

function ReelsScreen({ p, subs, isVideo, playing, durationSec, likes, comments, shares, label, brandName, cta, hookStyle }: ScreenProps) {
  return (
    <>
      <div className="ph-media">
        <Media src={p.productImage} images={p.images} alt={`${brandName} ad`} label={label} playing={playing} durationSec={durationSec} />
      </div>
      <div className="ph-shade-top" />
      <div className="ph-shade-rail" />
      <div className="ph-shade-bottom" />
      <Hook text={p.hookText} style={hookStyle} />
      {isVideo && <Subtitles lines={subs} />}
      <div className="ph-rl-top">
        <span>Reels</span>
        <span className="ph-rl-top-icons"><Search size={24} strokeWidth={2.2} /><Camera size={24} strokeWidth={2.2} /></span>
      </div>
      <div className="ph-rl-rail">
        <span className="ph-rail-btn"><ThumbsUp size={28} strokeWidth={2} />{formatSocialCount(likes)}</span>
        <span className="ph-rail-btn"><MessageCircle size={28} strokeWidth={2} />{formatSocialCount(comments)}</span>
        <span className="ph-rail-btn"><Share2 size={28} strokeWidth={2} />{formatSocialCount(shares)}</span>
        <span className="ph-rail-btn"><Ellipsis size={28} strokeWidth={2} /></span>
      </div>
      <div className="ph-rl-info">
        <span className="ph-rl-who">
          <BrandAvatar brandName={brandName} avatar={p.avatar} size={32} />
          <span className="ph-rl-who-text">{brandName}<small>Sponsored</small></span>
          <span className="ph-rl-follow">Follow</span>
        </span>
        {p.caption && <span className="ph-rl-caption">{richCaption(p.caption)}</span>}
        <span className="ph-rl-cta">{cta}<ChevronRight size={18} strokeWidth={2.6} /></span>
      </div>
      {isVideo && <div className="ph-progress ph-rl-progress"><span /></div>}
      <div className="ph-rl-nav">
        <House size={24} strokeWidth={2} />
        <span className="ph-rl-nav-on"><Clapperboard size={24} strokeWidth={2} /></span>
        <Store size={24} strokeWidth={2} />
        <Bell size={24} strokeWidth={2} />
        <Menu size={24} strokeWidth={2} />
      </div>
    </>
  )
}

function FeedScreen({ p, subs, isVideo, playing, durationSec, likes, comments, shares, label, brandName, cta, hookStyle }: ScreenProps) {
  const caption = p.caption ?? ''
  const long = caption.length > 80
  const domain = (p.domain ?? `${slugify(brandName)}.myshopifly.com`).toUpperCase()
  return (
    <div className="ph-feed">
      <div className="ph-feed-appbar">
        <span className="ph-feed-logo">fadbook</span>
        <span className="ph-feed-appicons">
          <span><Plus size={20} strokeWidth={2.4} /></span>
          <span><Search size={20} strokeWidth={2.4} /></span>
          <span><MessageCircle size={20} strokeWidth={2.4} /></span>
        </span>
      </div>
      <div className="ph-feed-tabs">
        <span className="ph-feed-tab-on"><House size={24} strokeWidth={2} fill="#0866ff" /></span>
        <Clapperboard size={24} strokeWidth={2} />
        <Users size={24} strokeWidth={2} />
        <Store size={24} strokeWidth={2} />
        <Bell size={24} strokeWidth={2} />
      </div>
      <div className="ph-post">
        <div className="ph-post-head">
          <BrandAvatar brandName={brandName} avatar={p.avatar} size={40} />
          <div className="ph-post-who">
            <span className="ph-post-name">{brandName}</span>
            <span className="ph-post-meta">Sponsored · <Globe size={12} strokeWidth={2.2} /></span>
          </div>
          <span className="ph-post-tools"><Ellipsis size={20} strokeWidth={2.2} /><X size={20} strokeWidth={2.2} /></span>
        </div>
        {caption && (
          <div className={cx('ph-post-text', long && 'ph-post-text-clamp')}>
            {long ? caption.slice(0, 72).trimEnd() + '… ' : caption}
            {long && <span className="ph-post-more">See more</span>}
          </div>
        )}
        <div className="ph-feed-media">
          <Media src={p.productImage} images={p.images} alt={`${brandName} ad`} label={label} playing={playing} durationSec={durationSec} />
          <Hook text={p.hookText} style={hookStyle} />
          {isVideo && <Subtitles lines={subs} />}
          {isVideo && (
            <>
              <span className="ph-feed-time">0:{String(Math.max(1, Math.round(durationSec))).padStart(2, '0')}</span>
              <span className="ph-feed-vol"><VolumeX size={16} strokeWidth={2.2} /></span>
              <div className="ph-progress ph-feed-progress"><span /></div>
            </>
          )}
        </div>
        <div className="ph-cta-strip">
          <div className="ph-cta-text">
            <span className="ph-cta-domain">{domain}</span>
            <span className="ph-cta-headline">{p.headline ?? p.productName ?? brandName}</span>
            {p.linkDescription && <span className="ph-cta-desc">{p.linkDescription}</span>}
          </div>
          <span className="ph-cta-btn">{cta}</span>
        </div>
        <div className="ph-post-stats">
          <span className="ph-reacts">
            <span className="ph-react-icons">
              <span style={{ background: '#0866ff' }}><ThumbsUp size={10} strokeWidth={0} fill="#fff" /></span>
              <span style={{ background: '#f33e58' }}><Heart size={10} strokeWidth={0} fill="#fff" /></span>
            </span>
            {formatSocialCount(likes)}
          </span>
          <span>{formatSocialCount(comments)} comments · {formatSocialCount(shares)} shares</span>
        </div>
        <div className="ph-post-actions">
          <span><ThumbsUp size={18} strokeWidth={2} />Like</span>
          <span><MessageCircle size={18} strokeWidth={2} />Comment</span>
          <span><Share2 size={18} strokeWidth={2} />Share</span>
        </div>
      </div>
      <div className="ph-post-ghost" aria-hidden>
        <i style={{ width: 40, height: 40, borderRadius: '50%' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <i style={{ width: '45%', height: 12 }} />
          <i style={{ width: '25%', height: 10 }} />
          <i style={{ width: '90%', height: 12, marginTop: 8 }} />
        </div>
      </div>
      <div className="ph-feed-nav" aria-hidden>
        <span className="ph-feed-nav-on"><House size={24} strokeWidth={2} /></span>
        <Clapperboard size={24} strokeWidth={2} />
        <Store size={24} strokeWidth={2} />
        <Bell size={24} strokeWidth={2} />
        <Menu size={24} strokeWidth={2} />
      </div>
    </div>
  )
}

/**
 * A creative rendered as a real in-feed ad.
 *   <AdPreview platform="tiktak" productImage={productImage('pet-hair-roller')} brandName="FurFree"
 *     hookText="POV: your couch after one swipe" caption="Reusable, no refills #cleantok" isVideo likes={18400} comments={312} shares={1240} />
 */
export function AdPreview(props: AdPreviewProps) {
  const {
    platform, brandName, cta = 'Shop now', likes = 0, comments = 0, shares = 0, isVideo = false, durationSec = 15, script, subtitles,
    caption, hookStyle = 'box', playing = true, frame = true, width = 280, showStatusBar, className, style, onClick, productName,
  } = props
  const subs = useMemo(
    () => subtitles ?? subtitleChunks(script || caption || ''),
    [subtitles, script, caption],
  )
  const dur = Math.max(3, durationSec)
  const vars = { '--ph-dur': `${dur}s`, '--ph-n': Math.max(1, subs.length) } as CSSProperties
  const sp: ScreenProps = {
    p: props, subs, isVideo, playing, durationSec: dur, likes, comments, shares, label: productName ?? brandName, brandName, cta, hookStyle,
  }
  const screen =
    platform === 'fadbook-feed' ? <FeedScreen {...sp} /> : platform === 'fadbook-reels' ? <ReelsScreen {...sp} /> : <TikTakScreen {...sp} />
  const content = (
    <div className={cx('ph-ad', isVideo ? 'ph-video' : 'ph-static', !playing && 'ph-paused')} style={vars}>
      {screen}
      {isVideo && !playing && <div className="ph-playbig"><Play size={34} fill="currentColor" strokeWidth={0} /></div>}
    </div>
  )
  const statusTone = platform === 'fadbook-feed' ? 'dark' : 'light'
  const label = `${platform === 'tiktak' ? 'TikTak' : platform === 'fadbook-reels' ? 'Fadbook Reels' : 'Fadbook feed'} ad preview for ${brandName}`
  const wrapStyle: CSSProperties = { cursor: onClick ? 'pointer' : undefined, ...style }
  if (frame) {
    return (
      <div className={cx('ph-card', className)} style={wrapStyle} onClick={onClick}>
        <PhoneMockup width={width} statusBar={statusTone} screenBg={platform === 'fadbook-feed' ? '#c9ccd1' : '#000'} ariaLabel={label}>
          {content}
        </PhoneMockup>
      </div>
    )
  }
  return (
    <div className={cx('ph-card', className)} style={wrapStyle} onClick={onClick} role="img" aria-label={label}>
      <ScaleBox designWidth={PHONE_SCREEN.width} designHeight={PHONE_SCREEN.height} width={width} style={{ borderRadius: Math.max(6, width * 0.045) }}>
        <div className="ph-bare">
          {content}
          {showStatusBar && <PhoneChrome statusBar={statusTone} />}
        </div>
      </ScaleBox>
    </div>
  )
}
