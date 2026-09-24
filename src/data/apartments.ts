// Housing ladder (Zillo listings). Room art: public/assets/rooms/tier<N>.webp via roomImage(tier).
// Rents are 2026 mid-size US metro asking rents (room share → luxury high-rise).
// OWNER: sim-life-finance.

export interface Landlord {
  name: string
  email: string
  /** how they sign emails */
  signoff: string
}

export interface ApartmentDef {
  tier: number
  name: string
  /** short listing headline shown on Zillo */
  headline: string
  neighborhood: string
  rent: number
  sqft: number
  beds: string
  /** energy regen multiplier while sleeping */
  sleepQuality: number
  /** mood baseline */
  moodBase: number
  /** self-shot creative quality bonus (light, space, backdrop) */
  filmingBonus: number
  /** staff morale bonus (a real office for the team) */
  staffMoraleBonus: number
  description: string
  features: string[]
  landlord: Landlord
}

export const APARTMENTS: ApartmentDef[] = [
  {
    tier: 0, name: "Parents' Basement", headline: 'Rent-free. Mom-supervised.', neighborhood: 'Your childhood home, Maple Heights',
    rent: 0, sqft: 320, beds: 'Twin bed', sleepQuality: 0.9, moodBase: 48, filmingBonus: 0, staffMoraleBonus: 0,
    description: 'Wood paneling, a washer that shakes the whole room, and your old desk. The rent is free; the price is being asked about your "little website" at every dinner.',
    features: ['No rent', 'Home-cooked leftovers', 'Wi-Fi shared with Dad\'s 4K streams', 'Mom may need a hand'],
    landlord: { name: 'Mom', email: 'linda.homebase@inboxly.com', signoff: 'Love you,\nMom' },
  },
  {
    tier: 1, name: 'Shared Apartment', headline: 'Private room in a 3BR, utilities split', neighborhood: 'Eastside, near the college',
    rent: 950, sqft: 140, beds: 'Full mattress on a platform', sleepQuality: 0.95, moodBase: 54, filmingBonus: 0, staffMoraleBonus: 0,
    description: 'Your own room behind a door that mostly closes. Two roommates, one bathroom schedule, and a group chat about whose turn it is to buy dish soap.',
    features: ['Your own room', 'Kitchenette access', 'In-unit laundry', 'Roommates (mixed blessing)'],
    landlord: { name: 'Gary Pruitt', email: 'gary@maplecourtrentals.com', signoff: 'Thanks,\nGary Pruitt\nMaple Court Rentals' },
  },
  {
    tier: 2, name: 'Studio', headline: 'Bright studio with a real desk nook', neighborhood: 'Midtown, walkable',
    rent: 1650, sqft: 480, beds: 'Queen bed', sleepQuality: 1.05, moodBase: 60, filmingBonus: 0.03, staffMoraleBonus: 0,
    description: 'All yours. South-facing window (free key light for filming), a kitchenette with a real stove, and nobody eating your leftovers.',
    features: ['No roommates', 'South-facing window light', 'Desk nook', 'Package room'],
    landlord: { name: 'Sunset Terrace Leasing', email: 'leasing@sunsetterrace-apts.com', signoff: 'Warm regards,\nThe Leasing Team\nSunset Terrace Apartments' },
  },
  {
    tier: 3, name: '1BR Loft', headline: 'Industrial 1BR loft, 14-ft ceilings', neighborhood: 'Arts District',
    rent: 2600, sqft: 780, beds: 'King bed', sleepQuality: 1.1, moodBase: 66, filmingBonus: 0.06, staffMoraleBonus: 0,
    description: 'Exposed brick, factory windows and enough floor space for a proper filming corner. The kind of place that looks great behind a product demo.',
    features: ['Exposed brick backdrop', 'Factory windows', 'Separate bedroom', 'Gym & rooftop'],
    landlord: { name: 'The Foundry Lofts', email: 'residents@foundrylofts.com', signoff: 'Best,\nResident Services\nThe Foundry Lofts' },
  },
  {
    tier: 4, name: 'House w/ Garage Office', headline: '3BR house with a converted garage office', neighborhood: 'Westbrook suburbs',
    rent: 4200, sqft: 1850, beds: 'King bed + guest room', sleepQuality: 1.15, moodBase: 72, filmingBonus: 0.08, staffMoraleBonus: 10,
    description: 'A real office in the garage with shelving for samples and stock, a backyard, and a kitchen island that doubles as a product set. Your team finally has somewhere to meet.',
    features: ['Garage office + inventory shelves', 'Backyard', 'Room for team meetings (staff morale +10)', 'Two-car driveway for deliveries'],
    landlord: { name: 'Rosa Delgado', email: 'rosa.delgado.properties@inboxly.com', signoff: 'Take care,\nRosa Delgado' },
  },
  {
    tier: 5, name: 'Penthouse', headline: 'Top-floor penthouse, skyline views', neighborhood: 'Downtown — The Meridian',
    rent: 11500, sqft: 3100, beds: 'Emperor king', sleepQuality: 1.25, moodBase: 82, filmingBonus: 0.1, staffMoraleBonus: 10,
    description: 'Floor-to-ceiling windows, a private elevator and a concierge who signs for your samples. Every creative you shoot here looks expensive.',
    features: ['Floor-to-ceiling skyline windows', 'Concierge & package handling', 'Private elevator', 'Rooftop pool'],
    landlord: { name: 'The Meridian Residences', email: 'concierge@themeridian-residences.com', signoff: 'At your service,\nThe Meridian Concierge' },
  },
]

export const HOUSING_RULES = {
  /** qualify if 30-day income ≥ incomeMultiple × rent … */
  incomeMultiple: 2.5,
  /** … or cash on hand ≥ cashMultiple × rent */
  cashMultiple: 6,
  /** movers cost per tier moved into (tier 0 = Mom's minivan, free) */
  moversPerTier: 400,
  /** security deposit in months of rent */
  depositMonths: 1,
  /** days after the 1st before rent counts as missed */
  graceDays: 5,
  /** late fee: the greater of this flat amount or lateFeePct × rent */
  lateFeeFlat: 50,
  lateFeePct: 0.05,
  /** missed rent payments before eviction */
  missedToEvict: 2,
  /** on-time payments in a row that clear one missed-rent strike */
  forgiveAfterOnTime: 3,
  /** share of the deposit landlords keep for cleaning, range */
  cleaningFeePct: [0, 0.15] as [number, number],
}

export const apartmentDef = (tier: number): ApartmentDef => APARTMENTS[Math.max(0, Math.min(APARTMENTS.length - 1, Math.round(tier)))]
