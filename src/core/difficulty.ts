import type { Difficulty } from './types'

export interface DifficultyDef {
  label: string
  tagline: string
  description: string
  startingCash: number
  cardLimit: number
  /** global CPM multiplier */
  cpmMult: number
  /** multiplier on product demand (appeal) */
  demandMult: number
  /** multiplier on random-noise sigma in ads/store sims */
  noiseMult: number
  /** ad account ban/disapproval risk multiplier */
  banRiskMult: number
  /** Shopifly payout delays & holds enabled */
  payoutHolds: boolean
  /** payout delay in business days */
  payoutDays: number
  chargebackMult: number
  refundMult: number
  /** quarterly estimated taxes on business profit */
  taxes: boolean
  /** how proactively the coach gives tips */
  coach: 'frequent' | 'some' | 'on_request'
  /** random negative event frequency multiplier */
  dramaMult: number
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  chill: {
    label: 'Chill',
    tagline: 'Learn the ropes',
    description: 'Cheaper ads, more forgiving customers, faster payouts, no account bans or taxes. Coach Kev explains everything.',
    startingCash: 2500,
    cardLimit: 3000,
    cpmMult: 0.85,
    demandMult: 1.2,
    noiseMult: 0.7,
    banRiskMult: 0,
    payoutHolds: false,
    payoutDays: 1,
    chargebackMult: 0.6,
    refundMult: 0.7,
    taxes: false,
    coach: 'frequent',
    dramaMult: 0.5,
  },
  normal: {
    label: 'Normal',
    tagline: 'The real game, a little kinder',
    description: 'Real-world economics with softer edges. Occasional platform drama, payout holds, and quarterly taxes.',
    startingCash: 1850,
    cardLimit: 2000,
    cpmMult: 1,
    demandMult: 1,
    noiseMult: 1,
    banRiskMult: 0.6,
    payoutHolds: true,
    payoutDays: 3,
    chargebackMult: 1,
    refundMult: 1,
    taxes: true,
    coach: 'some',
    dramaMult: 1,
  },
  realistic: {
    label: 'Realistic',
    tagline: 'Most stores fail. Will yours?',
    description: 'Real-world brutal: ~1 in 8 products wins, ad accounts get banned, payouts get held, Q4 CPMs spike, and the coach only speaks when asked.',
    startingCash: 1500,
    cardLimit: 1500,
    cpmMult: 1.08,
    demandMult: 0.9,
    noiseMult: 1.25,
    banRiskMult: 1,
    payoutHolds: true,
    payoutDays: 3,
    chargebackMult: 1.2,
    refundMult: 1.15,
    taxes: true,
    coach: 'on_request',
    dramaMult: 1.4,
  },
}
