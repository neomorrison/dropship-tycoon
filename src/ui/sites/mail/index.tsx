// Inboxly — Gmail-style webmail for the player's inbox. OWNER: ui-life-sites. Class prefix: ml-
// Routes: '' | 'inbox/<business|updates>' | 'unread' | 'all' | 'label/<tag>' | 'm/<id>'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Archive, ArrowLeft, Briefcase, ChevronLeft, ChevronRight, Info, Inbox, Mail, MailOpen, Menu, Search, Tag, Trash2, X,
  CircleHelp, ExternalLink, MailCheck, Users,
} from 'lucide-react'
import type { SiteProps } from '../types'
import type { GameState, MailMessage, SiteId } from '../../../core/types'
import { act } from '../../../core/store'
import { openSite } from '../../../core/ui'
import { dayOf, formatDate, hourOfDay, yearOf, dateOfDay } from '../../../core/time'
import { COACH_PORTRAIT, portrait } from '../../../core/assets'
import { siteDef } from '../registry'
import { MANAGER } from '../../../data/job'
import { clockLabel, firstNameOf, relDay, segs, useWorld } from '../bank/lifeCommon'
import './mail.css'

type Tag = MailMessage['tag']
type Category = 'primary' | 'business' | 'updates'

const TAGS: { id: Tag; label: string; color: string }[] = [
  { id: 'coach', label: 'Coach Kev', color: '#a142f4' },
  { id: 'job', label: "McDoodle's", color: '#d93025' },
  { id: 'bank', label: 'Bank', color: '#188038' },
  { id: 'landlord', label: 'Housing', color: '#8d6e63' },
  { id: 'shopifly', label: 'Shopifly', color: '#5b8c1a' },
  { id: 'platform', label: 'Ad platforms', color: '#1a73e8' },
  { id: 'supplier', label: 'Suppliers', color: '#e37400' },
  { id: 'customer', label: 'Customers', color: '#007b83' },
  { id: 'creator', label: 'Creators & team', color: '#e52592' },
  { id: 'misc', label: 'Personal', color: '#5f6368' },
]
const TAG_BY_ID = Object.fromEntries(TAGS.map(t => [t.id, t])) as Record<Tag, (typeof TAGS)[number]>

const CATEGORY_OF: Record<Tag, Category> = {
  misc: 'primary', job: 'primary', landlord: 'primary', coach: 'primary',
  supplier: 'business', shopifly: 'business', platform: 'business', customer: 'business', creator: 'business',
  bank: 'updates',
}
const CATEGORIES: { id: Category; label: string; icon: ReactNode; hint: string }[] = [
  { id: 'primary', label: 'Primary', icon: <Inbox size={18} />, hint: 'People you know' },
  { id: 'business', label: 'Business', icon: <Briefcase size={18} />, hint: 'Shopifly, ad platforms, suppliers' },
  { id: 'updates', label: 'Updates', icon: <Info size={18} />, hint: 'Bank alerts, statements, taxes' },
]

const PAGE = 50

type View =
  | { kind: 'inbox'; cat: Category }
  | { kind: 'unread' }
  | { kind: 'all' }
  | { kind: 'label'; tag: Tag }
  | { kind: 'message'; id: string }

function parse(path: string): View {
  const [a, b] = segs(path)
  if (a === 'm' && b) return { kind: 'message', id: b }
  if (a === 'inbox' && (b === 'business' || b === 'updates' || b === 'primary')) return { kind: 'inbox', cat: b }
  if (a === 'unread') return { kind: 'unread' }
  if (a === 'all') return { kind: 'all' }
  if (a === 'label' && b && b in TAG_BY_ID) return { kind: 'label', tag: b as Tag }
  return { kind: 'inbox', cat: 'primary' }
}

// per-tab memory (list you came from, search box), like a real web client keeps in its URL/session
const lastList = new Map<string, string>()
const lastQuery = new Map<string, string>()

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------
function listTime(hour: number, nowHour: number): string {
  const d = dayOf(hour)
  const t = dayOf(nowHour)
  if (d === t) return clockLabel(hourOfDay(hour))
  if (yearOf(d) === yearOf(t)) return formatDate(d, 'md')
  const dt = dateOfDay(d)
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}/${String(dt.getUTCFullYear()).slice(2)}`
}
function fullTime(hour: number, nowHour: number): string {
  const d = dayOf(hour)
  const rel = relDay(d, dayOf(nowHour))
  const ago = nowHour - hour
  const relText = ago < 1 ? 'just now' : ago < 24 ? `${ago} hour${ago === 1 ? '' : 's'} ago` : rel.toLowerCase()
  return `${formatDate(d, 'medium')}, ${clockLabel(hourOfDay(hour))} (${relText})`
}
const snippet = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 160)

function senderColor(name: string): string {
  const palette = ['#1a73e8', '#d93025', '#188038', '#e37400', '#a142f4', '#007b83', '#e52592', '#5f6368', '#9334e6', '#b06000']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

/** Known people get their photo; everyone else a letter tile. */
function senderPortrait(s: GameState, m: MailMessage): string | null {
  if (m.from === 'Coach Kev' || m.fromEmail.includes('coachkev')) return portrait(COACH_PORTRAIT)
  if (m.from === MANAGER.name || m.fromEmail === MANAGER.email) return portrait(MANAGER.portrait)
  const staff = s.staff.members.find(x => x.name === m.from) ?? s.staff.candidates.find(x => x.name === m.from)
  if (staff) return portrait(staff.portrait)
  const creator = s.creatives.creators.find(c => c.name === m.from)
  if (creator) return portrait(creator.portrait)
  return null
}

function Avatar({ name, src, size = 40 }: { name: string; src: string | null; size?: number }) {
  const [failed, setFailed] = useState(!src)
  useEffect(() => setFailed(!src), [src])
  const letter = (name.replace(/[^A-Za-z0-9]/g, '')[0] ?? '?').toUpperCase()
  return (
    <span className="ml-avatar" style={{ width: size, height: size, background: senderColor(name), fontSize: size * 0.45 }}>
      {!failed && src ? <img src={src} alt="" onError={() => setFailed(true)} /> : letter}
    </span>
  )
}

function LabelChip({ tag, onClick }: { tag: Tag; onClick?: () => void }) {
  const t = TAG_BY_ID[tag]
  return (
    <span
      className={`ml-chip${onClick ? ' is-click' : ''}`}
      style={{ color: t.color, background: `${t.color}1a` }}
      onClick={e => {
        if (!onClick) return
        e.stopPropagation()
        onClick()
      }}
    >
      {t.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------
function setRead(ids: string[], read: boolean) {
  const set = new Set(ids)
  act(s => {
    for (const m of s.inbox) if (set.has(m.id)) m.read = read
  })
}
function remove(ids: string[]) {
  const set = new Set(ids)
  act(s => {
    s.inbox = s.inbox.filter(m => !set.has(m.id))
  })
}

// ---------------------------------------------------------------------------
// site
// ---------------------------------------------------------------------------
export default function Inboxly({ tabId, path, navigate, compact }: SiteProps) {
  const s = useWorld()
  const view = parse(path)
  const [query, setQueryState] = useState(() => lastQuery.get(tabId) ?? '')
  const [drawer, setDrawer] = useState(false)
  const setQuery = (q: string) => {
    lastQuery.set(tabId, q)
    setQueryState(q)
  }
  useEffect(() => {
    if (view.kind !== 'message') lastList.set(tabId, path)
    setDrawer(false)
  }, [path, tabId, view.kind])

  const unreadAll = useMemo(() => s.inbox.reduce((a, m) => a + (m.read ? 0 : 1), 0), [s.inbox])
  const unreadByTag = useMemo(() => {
    const out: Partial<Record<Tag, number>> = {}
    for (const m of s.inbox) if (!m.read) out[m.tag] = (out[m.tag] ?? 0) + 1
    return out
  }, [s.inbox])

  const go = (p: string) => {
    if (query) setQuery('')
    navigate(p)
  }
  const activeNav = view.kind === 'inbox' ? 'inbox' : view.kind === 'label' ? `label/${view.tag}` : view.kind === 'message' ? '' : view.kind

  const rail = (
    <nav className="ml-rail" aria-label="Mailboxes">
      <NavItem icon={<Inbox size={19} />} label="Inbox" count={unreadAll} active={activeNav === 'inbox'} onClick={() => go('')} />
      <NavItem icon={<Mail size={19} />} label="Unread" count={unreadAll} active={activeNav === 'unread'} onClick={() => go('unread')} muted />
      <NavItem icon={<Archive size={19} />} label="All Mail" active={activeNav === 'all'} onClick={() => go('all')} />
      <div className="ml-rail-head">Labels</div>
      {TAGS.map(t => (
        <NavItem
          key={t.id}
          icon={<Tag size={17} style={{ color: t.color }} fill={t.color} fillOpacity={0.25} />}
          label={t.label}
          count={unreadByTag[t.id]}
          active={activeNav === `label/${t.id}`}
          onClick={() => go(`label/${t.id}`)}
        />
      ))}
    </nav>
  )

  return (
    <div className={`ml-root${compact ? ' is-compact' : ''}`}>
      <header className="ml-top">
        <button className="ml-icon-btn ml-burger" aria-label="Main menu" onClick={() => setDrawer(d => !d)}>
          <Menu size={22} />
        </button>
        <button className="ml-logo" onClick={() => go('')} aria-label="Inboxly home">
          <InboxlyMark />
          <span>Inboxly</span>
        </button>
        <label className="ml-search">
          <Search size={20} />
          <input
            value={query}
            placeholder="Search mail"
            onChange={e => {
              setQuery(e.target.value)
              if (view.kind === 'message' && e.target.value) navigate(lastList.get(tabId) ?? '')
            }}
          />
          {query && (
            <button className="ml-icon-btn" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={18} />
            </button>
          )}
        </label>
        <div className="ml-top-right">
          <span className="ml-icon-btn ml-help" title="Inboxly keeps every email you receive in-game">
            <CircleHelp size={21} />
          </span>
          <Avatar name={s.player.name || s.meta.playerName || 'Me'} src={null} size={32} />
        </div>
      </header>
      <div className="ml-body">
        {rail}
        {drawer && (
          <div className="ml-drawer-scrim" onClick={() => setDrawer(false)}>
            <div className="ml-drawer" onClick={e => e.stopPropagation()}>
              <div className="ml-drawer-head">
                <InboxlyMark />
                <span>Inboxly</span>
              </div>
              {rail}
            </div>
          </div>
        )}
        <main className="ml-main">
          {view.kind === 'message' ? (
            <MessageView s={s} id={view.id} backPath={lastList.get(tabId) ?? ''} navigate={navigate} compact={compact} />
          ) : (
            <ListView s={s} view={view} query={query} navigate={navigate} compact={compact} onLabel={t => go(`label/${t}`)} />
          )}
        </main>
      </div>
    </div>
  )
}

function NavItem({ icon, label, count, active, onClick, muted }: { icon: ReactNode; label: string; count?: number; active: boolean; onClick: () => void; muted?: boolean }) {
  return (
    <button className={`ml-nav${active ? ' is-active' : ''}${count ? ' has-unread' : ''}`} onClick={onClick}>
      <span className="ml-nav-icon">{icon}</span>
      <span className="ml-nav-label">{label}</span>
      {!!count && !muted && <span className="ml-nav-count">{count > 999 ? '999+' : count}</span>}
    </button>
  )
}

function InboxlyMark() {
  return (
    <svg className="ml-mark" viewBox="0 0 48 36" aria-hidden>
      <rect x="3" y="5" width="42" height="28" rx="6" fill="#fff" stroke="#ea4335" strokeWidth="3" />
      <path d="M6 9.5 24 21.5 42 9.5" fill="none" stroke="#ea4335" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="40" cy="8" r="6" fill="#1a73e8" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
function ListView({ s, view, query, navigate, compact, onLabel }: {
  s: GameState; view: Exclude<View, { kind: 'message' }>; query: string; navigate: (p: string) => void; compact: boolean; onLabel: (t: Tag) => void
}) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const viewKey = view.kind === 'inbox' ? `inbox/${view.cat}` : view.kind === 'label' ? `label/${view.tag}` : view.kind
  useEffect(() => {
    setPage(0)
    setSelected(new Set())
  }, [viewKey, query])

  const all = useMemo(() => [...s.inbox].reverse(), [s.inbox])
  const q = query.trim().toLowerCase()
  const rows = useMemo(() => {
    if (q) {
      return all.filter(m =>
        m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q) || m.fromEmail.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q) || TAG_BY_ID[m.tag].label.toLowerCase().includes(q))
    }
    switch (view.kind) {
      case 'inbox': return all.filter(m => CATEGORY_OF[m.tag] === view.cat)
      case 'unread': return all.filter(m => !m.read)
      case 'label': return all.filter(m => m.tag === view.tag)
      default: return all
    }
  }, [all, q, view])
  const catUnread = useMemo(() => {
    const out: Record<Category, number> = { primary: 0, business: 0, updates: 0 }
    const newest: Record<Category, string[]> = { primary: [], business: [], updates: [] }
    for (const m of all) {
      if (m.read) continue
      const c = CATEGORY_OF[m.tag]
      out[c]++
      if (newest[c].length < 3 && !newest[c].includes(m.from)) newest[c].push(m.from)
    }
    return { out, newest }
  }, [all])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pg = Math.min(page, pages - 1)
  const pageRows = rows.slice(pg * PAGE, pg * PAGE + PAGE)
  const pageIds = pageRows.map(m => m.id)
  const allSel = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const someSel = pageIds.some(id => selected.has(id))
  const selIds = [...selected]
  const nowHour = s.time.hour

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const title = q ? `Search results for “${query.trim()}”` : view.kind === 'label' ? TAG_BY_ID[view.tag].label : view.kind === 'unread' ? 'Unread' : view.kind === 'all' ? 'All Mail' : null

  return (
    <section className="ml-panel">
      <div className="ml-toolbar">
        <label className="ml-check" title="Select">
          <input
            type="checkbox"
            checked={allSel}
            ref={el => { if (el) el.indeterminate = !allSel && someSel }}
            onChange={() => setSelected(allSel ? new Set() : new Set(pageIds))}
          />
        </label>
        {someSel ? (
          <>
            <button className="ml-icon-btn" title="Delete" onClick={() => { remove(selIds); setSelected(new Set()) }}><Trash2 size={18} /></button>
            <button className="ml-icon-btn" title="Mark as read" onClick={() => { setRead(selIds, true); setSelected(new Set()) }}><MailOpen size={18} /></button>
            <button className="ml-icon-btn" title="Mark as unread" onClick={() => { setRead(selIds, false); setSelected(new Set()) }}><Mail size={18} /></button>
            <span className="ml-toolbar-note">{selIds.length} selected</span>
          </>
        ) : (
          <button
            className="ml-text-btn"
            disabled={!rows.some(m => !m.read)}
            onClick={() => setRead(rows.filter(m => !m.read).map(m => m.id), true)}
          >
            <MailCheck size={17} /> Mark all as read
          </button>
        )}
        <div className="ml-pager">
          <span>{rows.length ? `${pg * PAGE + 1}–${Math.min(rows.length, pg * PAGE + PAGE)} of ${rows.length.toLocaleString('en-US')}` : '0 of 0'}</span>
          <button className="ml-icon-btn" disabled={pg === 0} aria-label="Newer" onClick={() => setPage(pg - 1)}><ChevronLeft size={18} /></button>
          <button className="ml-icon-btn" disabled={pg >= pages - 1} aria-label="Older" onClick={() => setPage(pg + 1)}><ChevronRight size={18} /></button>
        </div>
      </div>

      {title ? (
        <div className="ml-view-title">{title}</div>
      ) : view.kind === 'inbox' && !compact ? (
        <div className="ml-tabs" role="tablist">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              role="tab"
              aria-selected={view.cat === c.id}
              className={`ml-tab${view.cat === c.id ? ' is-active' : ''}`}
              onClick={() => navigate(c.id === 'primary' ? '' : `inbox/${c.id}`)}
            >
              <span className="ml-tab-icon">{c.icon}</span>
              <span className="ml-tab-text">
                <span className="ml-tab-label">
                  {c.label}
                  {view.cat !== c.id && catUnread.out[c.id] > 0 && <span className="ml-tab-new">{catUnread.out[c.id]} new</span>}
                </span>
                <span className="ml-tab-hint">{view.cat !== c.id && catUnread.newest[c.id].length ? catUnread.newest[c.id].join(', ') : c.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : view.kind === 'inbox' ? (
        <div className="ml-mtabs">
          {CATEGORIES.map(c => (
            <button key={c.id} className={view.cat === c.id ? 'is-active' : ''} onClick={() => navigate(c.id === 'primary' ? '' : `inbox/${c.id}`)}>
              {c.label}
              {catUnread.out[c.id] > 0 && <b>{catUnread.out[c.id]}</b>}
            </button>
          ))}
        </div>
      ) : null}

      {pageRows.length === 0 ? (
        <div className="ml-empty">
          {q ? (
            <>
              <Search size={40} />
              <p>No messages matched your search.</p>
            </>
          ) : (
            <>
              <Users size={40} />
              <p>{view.kind === 'unread' ? 'You’re all caught up.' : 'Nothing here yet.'}</p>
              <span>Emails from Coach Kev, Darnell, Chaise Bank, suppliers and your platforms land here.</span>
            </>
          )}
        </div>
      ) : (
        <ul className="ml-list">
          {pageRows.map(m => (
            <li
              key={m.id}
              className={`ml-row${m.read ? '' : ' is-unread'}${selected.has(m.id) ? ' is-selected' : ''}`}
              onClick={() => navigate(`m/${m.id}`)}
            >
              <label className="ml-check" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
              </label>
              <span className="ml-row-avatar"><Avatar name={m.from} src={senderPortrait(s, m)} size={38} /></span>
              <span className="ml-from">{m.from}</span>
              <span className="ml-subject-line">
                {(view.kind !== 'label' || q) && <LabelChip tag={m.tag} onClick={() => onLabel(m.tag)} />}
                <span className="ml-subject">{m.subject}</span>
                <span className="ml-snippet"><span className="ml-dash"> - </span>{snippet(m.body)}</span>
              </span>
              <span className="ml-time">{listTime(m.hour, nowHour)}</span>
              <span className="ml-row-actions" onClick={e => e.stopPropagation()}>
                <button className="ml-icon-btn" title="Delete" onClick={() => remove([m.id])}><Trash2 size={17} /></button>
                <button className="ml-icon-btn" title={m.read ? 'Mark as unread' : 'Mark as read'} onClick={() => setRead([m.id], !m.read)}>
                  {m.read ? <Mail size={17} /> : <MailOpen size={17} />}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <footer className="ml-foot">
        <span>{(0.012 + s.inbox.length * 0.00041).toFixed(2)} GB of 15 GB used</span>
        <span>Terms · Privacy · Program Policies</span>
        <span>Last account activity: 0 minutes ago</span>
      </footer>
    </section>
  )
}

// ---------------------------------------------------------------------------
// message
// ---------------------------------------------------------------------------
function MessageView({ s, id, backPath, navigate, compact }: { s: GameState; id: string; backPath: string; navigate: (p: string) => void; compact: boolean }) {
  const m = s.inbox.find(x => x.id === id)
  useEffect(() => {
    if (m && !m.read) setRead([m.id], true)
  }, [m])

  const ordered = useMemo(() => [...s.inbox].reverse(), [s.inbox])
  if (!m) {
    return (
      <section className="ml-panel">
        <div className="ml-toolbar">
          <button className="ml-icon-btn" aria-label="Back" onClick={() => navigate(backPath)}><ArrowLeft size={20} /></button>
        </div>
        <div className="ml-empty">
          <Mail size={40} />
          <p>This message was deleted.</p>
        </div>
      </section>
    )
  }
  const idx = ordered.findIndex(x => x.id === id)
  const newer = idx > 0 ? ordered[idx - 1] : null
  const older = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null
  const target = m.site ? safeSite(m.site) : null
  const me = `${firstNameOf(s).toLowerCase()}@inboxly.com`

  return (
    <section className="ml-panel ml-msg">
      <div className="ml-toolbar">
        <button className="ml-icon-btn" aria-label="Back to list" onClick={() => navigate(backPath)}><ArrowLeft size={20} /></button>
        <button className="ml-icon-btn" title="Delete" onClick={() => { remove([m.id]); navigate(backPath) }}><Trash2 size={18} /></button>
        <button className="ml-icon-btn" title="Mark as unread" onClick={() => { setRead([m.id], false); navigate(backPath) }}><Mail size={18} /></button>
        <div className="ml-pager">
          <span>{idx + 1} of {ordered.length.toLocaleString('en-US')}</span>
          <button className="ml-icon-btn" disabled={!newer} aria-label="Newer" onClick={() => newer && navigate(`m/${newer.id}`)}><ChevronLeft size={18} /></button>
          <button className="ml-icon-btn" disabled={!older} aria-label="Older" onClick={() => older && navigate(`m/${older.id}`)}><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="ml-msg-body">
        <h1 className="ml-msg-subject">
          {m.subject}
          <LabelChip tag={m.tag} onClick={() => navigate(`label/${m.tag}`)} />
        </h1>
        <div className="ml-msg-head">
          <Avatar name={m.from} src={senderPortrait(s, m)} size={compact ? 36 : 40} />
          <div className="ml-msg-from">
            <div>
              <b>{m.from}</b> <span className="ml-email">&lt;{m.fromEmail}&gt;</span>
            </div>
            <div className="ml-to">to {me}</div>
          </div>
          <div className="ml-msg-time">{fullTime(m.hour, s.time.hour)}</div>
        </div>
        <div className="ml-msg-text">{m.body}</div>
        {target && m.site && (
          <div className="ml-msg-actions">
            <button className="ml-cta" onClick={() => openSite(m.site as SiteId, m.path ?? '')}>
              <span className="ml-cta-glyph" style={{ background: target.color }}>{target.glyph}</span>
              Open {target.name}
              <ExternalLink size={15} />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function safeSite(id: SiteId) {
  try {
    return siteDef(id)
  } catch {
    return null
  }
}
