// Skills & XP. Skills mostly unlock INFORMATION and TOOLS (player knowledge must dominate).
import type { GameState, SkillId } from '../../core/types'
import { notify } from '../../core/notify'
import { send, firstName } from './util'

export const MAX_SKILL_LEVEL = 10

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level: number): number { return Math.round(100 * Math.pow(level, 1.6)) }

export interface SkillInfo {
  id: SkillId
  label: string
  description: string
  /** what each level adds, shown in Ecom Academy */
  perLevel: string
  unlocks: { level: number; text: string }[]
  /** where XP comes from */
  xpSources: string[]
}

export const SKILL_INFO: Record<SkillId, SkillInfo> = {
  research: {
    id: 'research', label: 'Product Research',
    description: 'Reading demand, competition and margins before you spend a dollar on ads.',
    perLevel: 'Research sessions reveal more, and perceived-value estimates get tighter.',
    unlocks: [
      { level: 2, text: 'Trend-direction reads in product research become more accurate.' },
      { level: 3, text: 'AliExprez shows trend arrows (rising / flat / falling) on listings.' },
      { level: 5, text: 'Research estimates how saturated a product already is.' },
      { level: 7, text: 'Perceived-value ranges narrow to about ±10%.' },
    ],
    xpSources: ['+40 per product research session', '+60 per study session'],
  },
  copywriting: {
    id: 'copywriting', label: 'Copywriting',
    description: 'Titles, descriptions and FAQs that turn visitors into buyers.',
    perLevel: 'The product editor gives more detailed page-grade tips.',
    unlocks: [
      { level: 2, text: 'Product editor: word-count and bullet meter.' },
      { level: 4, text: 'Product editor: benefit-word highlighter.' },
      { level: 6, text: 'Product editor: objection checklist for the FAQ and description.' },
    ],
    xpSources: ['+20 when a page save improves its grade by 5+ points', '+15 per influencer outreach', '+60 per study session'],
  },
  creative: {
    id: 'creative', label: 'Creative',
    description: 'Hooks, angles and on-camera craft for scroll-stopping ads.',
    perLevel: 'Self-shot creative quality +0.03 per level.',
    unlocks: [
      { level: 3, text: 'CreatorHub suggests hook ideas for your product.' },
      { level: 6, text: 'Self-shot videos reach agency-level polish with good gear.' },
    ],
    xpSources: ['+50 per self-filmed creative', '+20 per supplier-footage edit', '+10 per organic post', '+60 per study session'],
  },
  media_buying: {
    id: 'media_buying', label: 'Media Buying',
    description: 'Structuring, reading and scaling paid social campaigns.',
    perLevel: 'Unlocks Ads Manager power tools.',
    unlocks: [
      { level: 2, text: 'Advantage+ (Fadbook) and Smart+ (TikTak) campaigns.' },
      { level: 3, text: 'Cost-cap bidding and performance breakdowns.' },
      { level: 4, text: 'Automated rules (evaluated daily at 9 AM).' },
    ],
    xpSources: ['+1 per $10 of ad spend you manage (max 60/day)', '+10 per ad account appeal', '+60 per study session'],
  },
  operations: {
    id: 'operations', label: 'Operations',
    description: 'Support, disputes, suppliers and logistics.',
    perLevel: 'Support sessions solve +8% more tickets per level; dispute evidence +0.03 per level.',
    unlocks: [
      { level: 3, text: 'Support sessions clear noticeably bigger queues.' },
      { level: 5, text: 'Chargeback evidence packets win more disputes.' },
    ],
    xpSources: ['+5 per support ticket solved', '+20 per chargeback fought', '+60 per study session'],
  },
}
export const SKILL_IDS: SkillId[] = ['research', 'copywriting', 'creative', 'media_buying', 'operations']

export const skillLevel = (s: GameState, skill: SkillId) => s.skills[skill]?.level ?? 1
export const hasSkillLevel = (s: GameState, skill: SkillId, level: number) => skillLevel(s, skill) >= level

export function skillProgress(s: GameState, skill: SkillId): { level: number; xp: number; need: number; pct: number; max: boolean } {
  const st = s.skills[skill] ?? { level: 1, xp: 0 }
  const max = st.level >= MAX_SKILL_LEVEL
  const need = max ? 0 : xpForLevel(st.level)
  return { level: st.level, xp: st.xp, need, pct: max ? 1 : Math.min(1, st.xp / need), max }
}

export function grantXp(s: GameState, skill: SkillId, xp: number): void {
  if (!(xp > 0)) return
  const st = (s.skills[skill] ??= { level: 1, xp: 0 })
  if (st.level >= MAX_SKILL_LEVEL) return
  st.xp += xp
  while (st.level < MAX_SKILL_LEVEL && st.xp >= xpForLevel(st.level)) {
    st.xp -= xpForLevel(st.level)
    st.level += 1
    onLevelUp(s, skill, st.level)
  }
  if (st.level >= MAX_SKILL_LEVEL) st.xp = 0
}

function onLevelUp(s: GameState, skill: SkillId, level: number) {
  const info = SKILL_INFO[skill]
  const unlock = info.unlocks.find(u => u.level === level)
  notify(s, {
    kind: 'success',
    title: `${info.label} reached level ${level}!`,
    body: unlock ? `Unlocked: ${unlock.text}` : info.perLevel,
    site: 'academy', path: 'skills',
  })
  const lines = [
    `Hey ${firstName(s)},`,
    '',
    `You just hit level ${level} in ${info.label}. ${level >= MAX_SKILL_LEVEL ? 'That\'s the top of the ladder — genuinely rare.' : 'Nice work.'}`,
    '',
    unlock ? `New unlock: ${unlock.text}` : `What changes: ${info.perLevel}`,
    '',
    'Remember, skill levels give you better tools — your decisions are still what make money. Keep testing, keep reading the numbers.',
    '',
    '— Coach Kev, Ecom Academy',
  ]
  send(s, { from: 'Ecom Academy', fromEmail: 'progress@ecomacademy.io', subject: `Level up: ${info.label} ${level}`, body: lines.join('\n'), tag: 'coach', site: 'academy', path: 'skills' })
}

/** Tickets one support session clears: ~12 × operations factor (+8% per level above 1). */
export function ticketsPerSupportSession(s: GameState): number {
  return Math.round(12 * (1 + 0.08 * (skillLevel(s, 'operations') - 1)))
}
/** Dispute evidence bonus from the operations skill (+0.03 per level above 1). */
export const disputeEvidenceBonus = (s: GameState) => 0.03 * (skillLevel(s, 'operations') - 1)
