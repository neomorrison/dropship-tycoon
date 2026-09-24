// ============================================================================
// PRODUCT ECONOMICS — one entry per id in productList.ts (63 products).
// OWNER: sim-market-events. Numbers are 2026 US-market realistic:
//   cogs      = AliExprez unit price (what a DSerz-style import pays per unit)
//   shipCost  = per-unit AliExprez shipping (Choice consolidated lines are cheaper/faster)
//   shipDays  = supplier processing + transit BEFORE US customs; the market module adds
//               BENCHMARKS.shipping.customsExtraDays and import duty (de minimis is gone).
//   perceivedValue = what US shoppers feel it is worth (HIDDEN). The visible anchor is
//               amazonPrice (Amazin), usually 0.8–1.1× perceived value.
// Hidden truth (archetype, baseDemand, defectRate…) must be INFERABLE from public signals:
//   orders30d trend + competitor count (demand vs saturation), rating (defects),
//   Amazin anchor vs landed cost (margin room), supplier years, Mineo ad data.
// Guidance table: SPEC.md §5. Never show `archetype` to players.
// ============================================================================
import type { ProductDef } from '../core/types'
import { PRODUCT_LIST } from './productList'

type Trend = ProductDef['trend']

/** AliExprez Choice line: 5–9 days to US port (+2–5 customs ≈ BENCHMARKS.shipping.aliChoice) */
const CHOICE: [number, number] = [5, 9]
/** AliExprez Standard: 12–24 days (+2–5 customs ≈ BENCHMARKS.shipping.aliStandard 15–30) */
const STD: [number, number] = [12, 24]
/** bulky / battery lines ship slower */
const STD_SLOW: [number, number] = [14, 26]

const EVERGREEN: Trend = { kind: 'evergreen', emergeDay: 0, peakDay: 0, halfLifeDays: 100_000 }
/** was a winner years ago; demand ≈0.8 decaying toward 0.3 */
const declining = (halfLifeDays: number, firstSeenDaysAgo = 540): Trend => ({ kind: 'declining', emergeDay: -firstSeenDaysAgo, peakDay: -Math.round(firstSeenDaysAgo / 2), halfLifeDays })
/** logistic rise emergeDay→peakDay, then exponential decay (halfLife) toward a 0.35 floor */
const rising = (emergeDay: number, peakDay: number, halfLifeDays: number): Trend => ({ kind: 'rising', emergeDay, peakDay, halfLifeDays })
/** like rising but collapses toward a 0.15 floor */
const fad = (emergeDay: number, peakDay: number, halfLifeDays: number): Trend => ({ kind: 'fad', emergeDay, peakDay, halfLifeDays })

/** Supplier copy is written as one block with real line breaks (Chinglish spec dump). */
const d = (s: string) => s.trim().replace(/\n[ \t]+/g, '\n')

type Authored = Omit<ProductDef, 'id' | 'name' | 'niche' | 'archetype' | 'bulkCogs' | 'privateLabelCogs' | 'privateLabelMoq' | 'startSaturation'> & {
  /** bulk (agent, at MOQ) unit price as a share of the AliExprez price; default 0.68 */
  bulkRatio?: number
  privateLabelMoq?: number
}

const A: Record<string, Authored> = {
  // ==========================================================================
  // PET
  // ==========================================================================
  'pet-hair-roller': {
    supplierTitle: '2026 New Pet Hair Remover Roller Reusable Lint Brush Dog Cat Fur Remover Sofa Carpet Clothes Bed Cleaning Tool Self-Cleaning Hair Collector',
    supplierDescription: d(`
      Product Name: Pet Hair Remover Roller
      Material: ABS + Flannelette
      Color: Grey / Blue / Pink
      Size: 23*12*6cm
      Feature:
      1. Reusable, no need sticky paper, save money for you and protect environment.
      2. Just roll back and forth, the pet hair will be collect into the dust box automatic.
      3. Suitable for sofa, bed, carpet, clothes, car seat, cat tree etc.
      4. Open the cover and throw the hair, very easy clean.
      Package Include: 1 * Pet Hair Remover
      Note: Please allow 1-2cm error due to manual measurement. Due to the different monitor, the color maybe slightly different.`),
    specs: { Material: 'ABS + Flannelette', Size: '23 x 12 x 6 cm', 'Item Weight': '280 g', 'Power Source': 'No battery needed', 'Applicable Pet': 'Dog, Cat', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Grey', 'Blue', 'Pink'] }],
    cogs: 4.85, shipCost: 2.1, shipDays: CHOICE, weightKg: 0.32, moq: 500,
    perceivedValue: 29.99, amazonPrice: 27.99,
    baseDemand: 0.88, wow: 0.78, problemSolving: 0.9, impulse: 0.85, giftable: 0.25, repeatRate: 0.02,
    audience: { gender: 'female', ageMin: 25, ageMax: 54 }, platformFit: { fadbook: 0.85, tiktak: 0.8 },
    bestFormats: ['demo_video', 'before_after_video', 'ugc_testimonial'],
    bestHooks: ['before_after', 'problem_callout', 'asmr'],
    bestAngles: ['pet_love', 'pain_point', 'savings'],
    seasonality: [0.95, 1, 1.15, 1.15, 1.1, 0.95, 0.9, 0.9, 1, 1.05, 1, 0.95],
    trend: EVERGREEN, startCompetitors: 14, defectRate: 0.04, claimRisk: 0.02, scaleCeiling: 3500,
    keywords: ['reusable', 'pet hair', 'fur', 'couch', 'no refills', 'one swipe', 'instantly', 'effortless', 'washable', 'save money', 'eco-friendly', 'bedding', 'car seats', 'self-cleaning'],
    objections: ['Does it work on short, fine hair?', 'Will it damage my couch fabric?', 'How do I empty it?', 'Is it better than sticky lint rollers?', 'Does it work on carpet and car seats?'],
    publicSignals: { ordersBase: 4200, rating: 4.8, reviews: 3100, supplierYears: 6, choice: true },
    releaseDay: 0, brandable: 0.6,
  },
  'cat-water-fountain': {
    supplierTitle: '2.5L Cat Water Fountain Flower Automatic Pet Water Dispenser Ultra Quiet Pump LED Drinking Bowl Filter For Cats Dogs Drinker Feeder',
    supplierDescription: d(`
      Product: Pet Water Fountain Flower Style
      Capacity: 2.5L
      Material: PP + ABS (BPA free)
      Voltage: USB 5V
      Noise: <30dB ultra quiet
      Feature:
      1. Circulating water keep fresh, attract cat to drink more water, healthy kidney.
      2. 3 mode water flow: flower / bubble / waterfall.
      3. Multi filter system: activated carbon + ion exchange resin + sponge.
      4. Water level window, you know when to add water.
      Package: 1*Fountain, 1*Filter, 1*USB Cable
      Note: Please clean every 1-2 week and change filter every month for best effect.`),
    specs: { Capacity: '2.5 L', Material: 'PP + ABS, BPA-free', Power: 'USB 5V 1A', Noise: '< 30 dB', 'Filter Life': '2-4 weeks', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['White', 'Green', 'Pink'] }, { name: 'Bundle', values: ['Fountain', 'Fountain + 4 Filters'] }],
    cogs: 7.2, shipCost: 3.2, shipDays: STD, weightKg: 0.9, moq: 300,
    perceivedValue: 34.99, amazonPrice: 29.99,
    baseDemand: 0.62, wow: 0.45, problemSolving: 0.6, impulse: 0.5, giftable: 0.2, repeatRate: 0.12,
    audience: { gender: 'female', ageMin: 25, ageMax: 60 }, platformFit: { fadbook: 0.8, tiktak: 0.6 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'slideshow'],
    bestHooks: ['problem_callout', 'shock_stat', 'pov'],
    bestAngles: ['pet_love', 'health', 'pain_point'],
    seasonality: [0.95, 0.95, 1, 1, 1.05, 1.1, 1.1, 1.1, 1, 0.95, 0.95, 1],
    trend: EVERGREEN, startCompetitors: 22, defectRate: 0.05, claimRisk: 0.1, scaleCeiling: 900,
    keywords: ['hydration', 'quiet', 'filtered', 'fresh', 'flowing water', 'healthy', 'drink more', 'BPA-free', 'easy to clean', 'whisper-quiet', 'LED', 'peace of mind'],
    objections: ['Is the pump noisy at night?', 'Is it hard to clean?', 'How often do filters need replacing and what do they cost?', 'What if my cat ignores it?', 'Is 2.5L big enough for two cats?'],
    publicSignals: { ordersBase: 3800, rating: 4.65, reviews: 2400, supplierYears: 5, choice: false },
    releaseDay: 0, brandable: 0.55,
  },
  'dog-paw-cleaner': {
    supplierTitle: 'Portable Dog Paw Cleaner Cup Soft Silicone Pet Foot Washer Cup Cat Dog Feet Cleaning Brush Muddy Paw Washer Outdoor Travel',
    supplierDescription: d(`
      Name: Pet Paw Cleaner Cup
      Material: PP + Food-grade Silicone
      Size: S (small dog) / M / L (big dog)
      Feature:
      1. Soft silicone bristle clean mud and dirt between the toes, not hurt paw.
      2. Just add water, insert paw, twist gently, dry with towel. 3 steps finish.
      3. Portable with lid, can carry in car when walk dog.
      4. Protect your floor, sofa and car from muddy footprint.
      Package: 1*Paw Cleaner
      Tips: Please choose size according to paw width. S: <5cm, M: 5-7cm, L: 7-9cm.`),
    specs: { Material: 'PP + silicone', 'Size S': 'fits paws < 5 cm', 'Size M': '5–7 cm', 'Size L': '7–9 cm', Weight: '300 g', Origin: 'Mainland China' },
    variants: [{ name: 'Size', values: ['S', 'M', 'L'] }, { name: 'Color', values: ['Blue', 'Grey', 'Pink'] }],
    cogs: 3.9, shipCost: 2.4, shipDays: CHOICE, weightKg: 0.35, moq: 500,
    perceivedValue: 29.99, amazonPrice: 24.99,
    baseDemand: 0.84, wow: 0.8, problemSolving: 0.85, impulse: 0.8, giftable: 0.2, repeatRate: 0.02,
    audience: { gender: 'all', ageMin: 25, ageMax: 54 }, platformFit: { fadbook: 0.8, tiktak: 0.85 },
    bestFormats: ['demo_video', 'before_after_video', 'ugc_testimonial'],
    bestHooks: ['before_after', 'problem_callout', 'pov'],
    bestAngles: ['pet_love', 'pain_point', 'convenience'],
    seasonality: [1.1, 1.1, 1.2, 1.2, 1.05, 0.85, 0.85, 0.85, 0.95, 1.1, 1.15, 1.1],
    trend: EVERGREEN, startCompetitors: 9, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 3000,
    keywords: ['muddy paws', 'clean floors', 'gentle', 'silicone bristles', 'seconds', 'no mess', 'portable', 'car', 'rainy days', 'easy', 'paw-friendly', 'after walks'],
    objections: ['Which size fits my dog?', 'Will my dog tolerate it?', 'Does it actually get mud out between the toes?', 'Is it easy to rinse out?', 'Does it work for big dogs?'],
    publicSignals: { ordersBase: 2600, rating: 4.75, reviews: 1500, supplierYears: 4, choice: true },
    releaseDay: 18, brandable: 0.55,
  },
  'self-cleaning-brush': {
    supplierTitle: 'Self Cleaning Slicker Brush For Dog Cat Grooming Comb Shedding Tool Pet Hair Removal Brush One Click Release Button Deshedding',
    supplierDescription: d(`
      Product: Pet Self Cleaning Slicker Brush
      Material: ABS + TPR + Stainless Steel Pins
      Size: 16*10cm
      Features:
      1. Press the button, the bristle retract, hair fall off easy. Clean in 1 second.
      2. Fine bent wire bristles penetrate deep into coat, remove tangles, knots, dander.
      3. Comfortable grip handle, anti-slip.
      4. Suitable for long and short hair dog and cat.
      Package: 1 x brush`),
    specs: { Material: 'ABS, TPR, stainless steel pins', Size: '16 x 10 cm', Weight: '140 g', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Teal', 'Grey', 'Pink'] }],
    cogs: 2.6, shipCost: 1.9, shipDays: CHOICE, weightKg: 0.18, moq: 500,
    perceivedValue: 19.99, amazonPrice: 15.99,
    baseDemand: 0.74, wow: 0.55, problemSolving: 0.7, impulse: 0.8, giftable: 0.25, repeatRate: 0.01,
    audience: { gender: 'female', ageMin: 25, ageMax: 54 }, platformFit: { fadbook: 0.75, tiktak: 0.8 },
    bestFormats: ['asmr_unboxing', 'demo_video', 'ugc_testimonial'],
    bestHooks: ['asmr', 'before_after', 'problem_callout'],
    bestAngles: ['pet_love', 'convenience'],
    seasonality: [0.95, 1, 1.15, 1.15, 1.1, 0.95, 0.9, 0.9, 1, 1.05, 1, 0.95],
    trend: declining(420, 900), startCompetitors: 62, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 700,
    keywords: ['shedding', 'one click', 'self-cleaning', 'tangles', 'gentle', 'dander', 'grooming', 'soft coat', 'no mess', 'comfortable grip'],
    objections: ['Will the pins scratch my pet?', 'Does it work on long hair?', 'Is it different from the ones at the pet store?', 'Does the button break?'],
    publicSignals: { ordersBase: 9500, rating: 4.75, reviews: 21000, supplierYears: 8, choice: true },
    releaseDay: 0, brandable: 0.3,
  },
  'cat-laser-toy': {
    supplierTitle: 'Automatic Cat Laser Toy Interactive Smart Teasing Pet LED Laser Indoor Cat Toys USB Charging Random Moving Kitten Exercise Toy',
    supplierDescription: d(`
      Item: Smart Laser Cat Toy
      Material: ABS
      Battery: 1200mAh lithium, USB rechargeable
      Working Mode: Fast / Slow / Random, auto off after 15 min
      Features:
      1. 360 degree rotation, random laser path, keep your cat exercise and happy.
      2. Put on the table or floor, cat will chase for long time.
      3. Auto shut off protect cat not overexcited.
      Warning: Do not point laser to eyes of human or pet.
      Package: 1*laser toy, 1*USB cable, 1*manual`),
    specs: { Material: 'ABS', Battery: '1200 mAh, USB rechargeable', Modes: 'Fast / Slow / Random', 'Auto-off': '15 min', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['White', 'Black'] }],
    cogs: 5.4, shipCost: 2.6, shipDays: STD, weightKg: 0.2, moq: 500,
    perceivedValue: 24.99, amazonPrice: 21.99,
    baseDemand: 0.6, wow: 0.6, problemSolving: 0.5, impulse: 0.75, giftable: 0.35, repeatRate: 0,
    audience: { gender: 'female', ageMin: 18, ageMax: 45 }, platformFit: { fadbook: 0.65, tiktak: 0.85 },
    bestFormats: ['ugc_testimonial', 'skit', 'demo_video'],
    bestHooks: ['pov', 'tiktak_made_me_buy', 'question'],
    bestAngles: ['pet_love', 'time_saving', 'curiosity'],
    seasonality: [1, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1, 1, 1.1, 1.2],
    trend: EVERGREEN, startCompetitors: 24, defectRate: 0.06, claimRisk: 0.05, scaleCeiling: 700,
    keywords: ['bored cat', 'indoor', 'exercise', 'hands-free', 'play', 'random pattern', 'rechargeable', 'auto-off', 'healthy weight', 'entertained while you work'],
    objections: ['Is the laser safe for eyes?', 'Will my cat get frustrated never catching it?', 'How long does the battery last?', 'Does it get stuck on one pattern?'],
    publicSignals: { ordersBase: 3300, rating: 4.55, reviews: 1900, supplierYears: 5, choice: false },
    releaseDay: 0, brandable: 0.4,
  },
  'dog-car-hammock': {
    supplierTitle: 'Dog Car Seat Cover Waterproof Pet Travel Hammock Back Seat Protector Mat Anti-Scratch Nonslip Dog Carrier For Car SUV Truck',
    supplierDescription: d(`
      Product: Pet Car Hammock Seat Cover
      Material: 600D Oxford Cloth + Waterproof Layer + PVC Anti-slip Back
      Size: 137*147cm (fit most car, SUV)
      Features:
      1. 4 layer waterproof, protect seat from dirt, hair, pee, scratch.
      2. Hammock design prevent dog fall to front floor when brake.
      3. Side flaps protect door. Zipper opening for seat belt.
      4. Machine washable, easy install in 1 minute with headrest strap.
      Package: 1 * seat cover, 2 * seat anchors`),
    specs: { Material: '600D Oxford, waterproof TPU layer', Size: '137 x 147 cm', Fit: 'Most cars, SUVs, trucks', Care: 'Machine washable (cold)', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Black', 'Grey'] }, { name: 'Size', values: ['Standard', 'XL (trucks)'] }],
    cogs: 11, shipCost: 4.5, shipDays: STD, weightKg: 1.1, moq: 200,
    perceivedValue: 46.99, amazonPrice: 39.99,
    baseDemand: 0.6, wow: 0.4, problemSolving: 0.75, impulse: 0.45, giftable: 0.15, repeatRate: 0,
    audience: { gender: 'all', ageMin: 28, ageMax: 60 }, platformFit: { fadbook: 0.9, tiktak: 0.45 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'carousel'],
    bestHooks: ['problem_callout', 'before_after', 'testimonial'],
    bestAngles: ['pet_love', 'pain_point', 'savings'],
    seasonality: [0.9, 0.9, 1, 1.05, 1.1, 1.15, 1.15, 1.1, 1, 0.95, 0.95, 0.95],
    trend: EVERGREEN, startCompetitors: 18, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 800,
    keywords: ['waterproof', 'scratch-proof', 'road trips', 'hammock', 'safe', 'no slipping', 'machine washable', 'protects seats', 'resale value', 'easy install', 'muddy'],
    objections: ['Will it fit my car or SUV?', 'Can passengers still use seat belts?', 'Does it slide around?', 'Is it really waterproof?', 'Can I wash it?'],
    publicSignals: { ordersBase: 2100, rating: 4.7, reviews: 1300, supplierYears: 7, choice: false },
    releaseDay: 3, brandable: 0.5,
  },
  'pet-grooming-vacuum': {
    supplierTitle: 'Pet Grooming Kit Vacuum Suction 99% Pet Hair Professional Clippers Dog Grooming Vacuum 5 In 1 Low Noise Dog Hair Trimmer Shedding Brush',
    supplierDescription: d(`
      Product: Pet Grooming Vacuum Kit 5 in 1
      Power: 280W, Suction 12000Pa
      Dust Cup: 1.5L
      Noise: 58dB low noise mode
      Include tools: Electric clipper, Slicker brush, Deshedding brush, Nozzle head, Cleaning brush, 6 guard combs (3-24mm)
      Features:
      1. Groom and vacuum same time, 99% hair go into cup, no hair everywhere in home.
      2. 3 suction level, low noise not scare pet.
      3. Save money of grooming salon, do at home.
      Plug: US plug 110V
      Package: 1*main unit, 5*tools, 6*combs, 1*hose, 1*manual`),
    specs: { Power: '280 W', Suction: '12,000 Pa', 'Dust Cup': '1.5 L', Noise: '58 dB (low mode)', Plug: 'US 110V', Tools: 'clipper, 2 brushes, nozzle, 6 guide combs', Origin: 'Mainland China' },
    variants: [{ name: 'Plug', values: ['US Plug'] }, { name: 'Kit', values: ['5-in-1 Kit', '5-in-1 Kit + Spare Filters'] }],
    cogs: 26.9, shipCost: 5.9, shipDays: STD_SLOW, weightKg: 2.4, moq: 100, bulkRatio: 0.7, privateLabelMoq: 500,
    perceivedValue: 179.99, amazonPrice: 149.99,
    baseDemand: 0.76, wow: 0.8, problemSolving: 0.85, impulse: 0.2, giftable: 0.2, repeatRate: 0.03,
    audience: { gender: 'female', ageMin: 28, ageMax: 60 }, platformFit: { fadbook: 0.9, tiktak: 0.6 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'before_after_video'],
    bestHooks: ['shock_stat', 'before_after', 'problem_callout'],
    bestAngles: ['savings', 'pet_love', 'pain_point'],
    seasonality: [0.95, 0.95, 1.1, 1.1, 1.05, 0.95, 0.9, 0.9, 1, 1, 1.05, 1.05],
    trend: EVERGREEN, startCompetitors: 6, defectRate: 0.06, claimRisk: 0.03, scaleCeiling: 2800,
    keywords: ['salon results', 'at home', 'no hair everywhere', 'vacuum while you groom', 'quiet', 'save money', 'professional', 'stress-free', 'shedding', 'all-in-one', 'gentle', 'grooming costs'],
    objections: ['Will the noise scare my dog?', 'Is it hard to use without grooming experience?', 'Does it work on thick double coats?', 'What is the warranty?', 'Is it worth it vs a groomer?', 'Where do I get replacement filters?'],
    publicSignals: { ordersBase: 900, rating: 4.75, reviews: 520, supplierYears: 5, choice: false },
    releaseDay: 26, brandable: 0.75,
  },
  'dog-lick-mat': {
    supplierTitle: 'Dog Lick Mat Silicone Slow Feeder Pad With Suction Cups Pet Anxiety Relief Licking Plate Peanut Butter Bath Grooming Distraction',
    supplierDescription: d(`
      Name: Pet Lick Mat
      Material: Food Grade Silicone
      Size: 20*20cm
      Feature:
      1. Spread peanut butter, yogurt or wet food, dog lick slowly, reduce anxiety.
      2. Strong suction cups stick on wall or bathtub, distract dog when bath or nail trim.
      3. Dishwasher safe.
      Package: 1 * lick mat`),
    specs: { Material: 'Food-grade silicone', Size: '20 x 20 cm', 'Dishwasher Safe': 'Yes', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Pink', 'Blue', 'Green', 'Grey'] }],
    cogs: 1.8, shipCost: 1.5, shipDays: CHOICE, weightKg: 0.15, moq: 500,
    perceivedValue: 8.99, amazonPrice: 7.99,
    baseDemand: 0.35, wow: 0.3, problemSolving: 0.45, impulse: 0.8, giftable: 0.2, repeatRate: 0.02,
    audience: { gender: 'female', ageMin: 25, ageMax: 50 }, platformFit: { fadbook: 0.6, tiktak: 0.55 },
    bestFormats: ['ugc_testimonial', 'slideshow'],
    bestHooks: ['pov', 'question'],
    bestAngles: ['pet_love', 'convenience'],
    seasonality: [1, 1, 1, 1, 1, 1, 1.05, 1, 1, 1, 1, 1.05],
    trend: EVERGREEN, startCompetitors: 20, defectRate: 0.04, claimRisk: 0.05, scaleCeiling: 150,
    keywords: ['calm', 'anxiety', 'bath time', 'slow feeding', 'distraction', 'dishwasher safe', 'suction cups', 'enrichment', 'boredom buster', 'nail trims', 'grooming'],
    objections: ['Will my dog chew it apart?', 'Does the suction hold?', 'Is the silicone food safe?', 'Is it easy to clean?'],
    publicSignals: { ordersBase: 7000, rating: 4.7, reviews: 5200, supplierYears: 6, choice: true },
    releaseDay: 0, brandable: 0.2,
  },

  // ==========================================================================
  // BEAUTY
  // ==========================================================================
  'ice-face-roller': {
    supplierTitle: 'Ice Roller For Face Eye Puffiness Relief Cold Facial Roller Massager Skin Care Tool Stainless Steel Handle Reusable Freezer Beauty',
    supplierDescription: d(`
      Product: Ice Face Roller
      Material: PC + ABS + Stainless Steel
      Size: 16*6cm
      How To Use: Put in freezer 2 hours, then roll on face 3-5 minute every morning.
      Effect:
      1. Reduce puffiness and dark circles, shrink pores.
      2. Make skin tight and fresh, relieve migraine.
      3. Help skin care product absorb.
      Package: 1 * ice roller + 1 * storage bag`),
    specs: { Material: 'PC, ABS, stainless steel', Size: '16 x 6 cm', 'Freeze Time': '2 hours', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Mint', 'Pink', 'Clear', 'Purple'] }],
    cogs: 3.1, shipCost: 1.8, shipDays: CHOICE, weightKg: 0.2, moq: 500,
    perceivedValue: 19.99, amazonPrice: 16.99,
    baseDemand: 0.6, wow: 0.5, problemSolving: 0.5, impulse: 0.8, giftable: 0.45, repeatRate: 0,
    audience: { gender: 'female', ageMin: 18, ageMax: 40 }, platformFit: { fadbook: 0.6, tiktak: 0.85 },
    bestFormats: ['asmr_unboxing', 'ugc_testimonial', 'before_after_video'],
    bestHooks: ['asmr', 'pov', 'before_after'],
    bestAngles: ['self_care', 'aspirational'],
    seasonality: [0.95, 1, 1, 1, 1.05, 1.2, 1.2, 1.15, 1, 0.95, 1, 1.1],
    trend: EVERGREEN, startCompetitors: 26, defectRate: 0.04, claimRisk: 0.25, scaleCeiling: 600,
    keywords: ['morning routine', 'de-puff', 'refreshing', 'cooling', 'self-care', 'glow', 'soothing', 'reusable', 'skincare', 'awake'],
    objections: ['Does the ice leak when it melts?', 'How long does it stay cold?', 'Is it better than a jade roller?', 'Is it safe for sensitive skin?'],
    publicSignals: { ordersBase: 5200, rating: 4.7, reviews: 3300, supplierYears: 4, choice: true },
    releaseDay: 0, brandable: 0.65,
  },
  'blackhead-vacuum': {
    supplierTitle: 'Blackhead Remover Vacuum Pore Cleaner Electric Face Nose Acne Comedone Extractor Suction 5 Level LCD Rechargeable Facial Skin Care Tool',
    supplierDescription: d(`
      Name: Electric Blackhead Remover Vacuum
      Suction Power: 5 level (max 65KPa)
      Battery: 500mAh, USB charging
      Screen: LCD display
      Heads: 4 replaceable probes (large circle / small circle / oval / micro)
      Features:
      1. Strong vacuum suction remove blackhead, whitehead, dirt and oil deep in pore.
      2. Instant effect, see result in 1 time.
      3. Suitable for nose, forehead, chin.
      Attention: Do not stay one place more than 3 second, may cause red mark. Not for sensitive skin.
      Package: 1*device, 4*heads, 1*USB cable, 1*manual`),
    specs: { Suction: '5 levels, up to 65 kPa', Battery: '500 mAh USB', Display: 'LCD', Heads: '4 interchangeable', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['White', 'Pink'] }],
    cogs: 5.6, shipCost: 2.2, shipDays: CHOICE, weightKg: 0.25, moq: 500,
    perceivedValue: 39.99, amazonPrice: 29.99,
    baseDemand: 0.8, wow: 0.88, problemSolving: 0.7, impulse: 0.8, giftable: 0.2, repeatRate: 0,
    audience: { gender: 'female', ageMin: 16, ageMax: 34 }, platformFit: { fadbook: 0.6, tiktak: 0.95 },
    bestFormats: ['before_after_video', 'demo_video', 'ugc_testimonial'],
    bestHooks: ['before_after', 'asmr', 'shock_stat'],
    bestAngles: ['self_care', 'curiosity', 'pain_point'],
    seasonality: [1, 1, 1, 1, 1.05, 1.05, 1.05, 1.05, 1, 1, 1, 1],
    trend: EVERGREEN, startCompetitors: 30, defectRate: 0.3, claimRisk: 0.55, scaleCeiling: 2200,
    keywords: ['blackheads', 'pores', 'deep clean', 'instant results', 'satisfying', 'rechargeable', 'clear skin', 'nose', 'extraction', 'smooth'],
    objections: ['Will it leave red marks or bruises?', 'Does it actually pull out blackheads?', 'Is it safe for sensitive skin?', 'How long does the battery last?', 'What is your return policy if it does not work?'],
    publicSignals: { ordersBase: 8800, rating: 4.6, reviews: 6100, supplierYears: 3, choice: true },
    releaseDay: 0, brandable: 0.35,
  },
  'led-face-mask': {
    supplierTitle: '7 Colors LED Face Mask Light Therapy Photon Skin Rejuvenation Anti Aging Wrinkle Acne Facial Beauty Device Red Light Therapy Mask Home',
    supplierDescription: d(`
      Product Name: 7 Color LED Photon Mask
      LED Quantity: 192 pcs
      Wavelength: Red 630nm / Blue 470nm / Green 520nm / Yellow 590nm / Purple / Cyan / White
      Power: Rechargeable 1200mAh
      Time: 10 min auto off
      Function:
      1. Red light: collagen, anti wrinkle, skin tightening.
      2. Blue light: acne, oil control.
      3. Other colors: brighten, calm skin.
      Material: Soft PC, fit face shape, eye protect hole.
      Package: 1*Mask, 1*Controller, 1*USB Cable, 1*Manual, 1*Gift Box`),
    specs: { LEDs: '192', Wavelengths: '7 colors incl. 630 nm red, 470 nm blue', Battery: '1200 mAh rechargeable', 'Session Timer': '10 min', Material: 'Flexible PC', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['White', 'Black'] }],
    cogs: 24.5, shipCost: 4.9, shipDays: STD, weightKg: 0.7, moq: 100, bulkRatio: 0.66, privateLabelMoq: 500,
    perceivedValue: 169.99, amazonPrice: 149.99,
    baseDemand: 0.76, wow: 0.85, problemSolving: 0.65, impulse: 0.25, giftable: 0.6, repeatRate: 0,
    audience: { gender: 'female', ageMin: 25, ageMax: 54 }, platformFit: { fadbook: 0.9, tiktak: 0.75 },
    bestFormats: ['ugc_testimonial', 'before_after_video', 'founder_story'],
    bestHooks: ['testimonial', 'shock_stat', 'before_after'],
    bestAngles: ['self_care', 'savings', 'aspirational'],
    seasonality: [1.1, 1, 1, 1, 1.05, 0.95, 0.9, 0.9, 0.95, 1, 1.2, 1.35],
    trend: EVERGREEN, startCompetitors: 8, defectRate: 0.06, claimRisk: 0.45, scaleCeiling: 3200,
    keywords: ['spa results', 'at home', '10 minutes', 'red light', 'radiant', 'glow', 'confidence', 'gentle', 'rechargeable', 'painless', 'self-care ritual', 'fine lines', 'save on facials'],
    objections: ['Does LED therapy really work?', 'Is it safe for my eyes?', 'How long until I see results?', 'Why is it cheaper than the $400 masks?', 'What if it does not work for my skin?', 'Is there a warranty?'],
    publicSignals: { ordersBase: 1100, rating: 4.65, reviews: 640, supplierYears: 5, choice: false },
    releaseDay: 60, brandable: 0.85,
  },
  'heatless-curler': {
    supplierTitle: 'Heatless Curling Rod Headband No Heat Curls Silk Ribbon Hair Rollers Sleeping Soft Headband Hair Curler Lazy Curling Set Hair Styling',
    supplierDescription: d(`
      Product: Heatless Curling Rod Set
      Material: Satin + Sponge
      Length: 85cm
      Include: 1 curling rod, 2 scrunchies, 1 hair clip
      How to use:
      1. Put rod on top of head, wrap damp hair around the rod.
      2. Fix end with scrunchie, sleep with it.
      3. Next morning take off, get beautiful curl without heat damage.
      Suitable for long and medium hair.
      Package: 4pcs/set`),
    specs: { Material: 'Satin shell, sponge core', Length: '85 cm', 'Set Includes': 'rod, 2 scrunchies, claw clip', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Pink', 'Champagne', 'Black', 'Leopard'] }],
    cogs: 1.9, shipCost: 1.4, shipDays: CHOICE, weightKg: 0.12, moq: 500,
    perceivedValue: 18.99, amazonPrice: 15.99,
    baseDemand: 0.86, wow: 0.8, problemSolving: 0.65, impulse: 0.9, giftable: 0.4, repeatRate: 0.02,
    audience: { gender: 'female', ageMin: 16, ageMax: 34 }, platformFit: { fadbook: 0.55, tiktak: 0.95 },
    bestFormats: ['before_after_video', 'ugc_testimonial', 'green_screen'],
    bestHooks: ['before_after', 'tiktak_made_me_buy', 'pov'],
    bestAngles: ['self_care', 'time_saving', 'savings'],
    seasonality: [1, 1, 1, 1, 1.05, 1, 1, 1, 1, 1, 1.05, 1.1],
    trend: rising(25, 105, 160), startCompetitors: 3, defectRate: 0.04, claimRisk: 0.1, scaleCeiling: 2600,
    keywords: ['no heat', 'overnight', 'no damage', 'bouncy curls', 'sleep in it', 'soft satin', 'effortless', 'salon look', 'healthy hair', 'comfortable', 'save time'],
    objections: ['Can I actually sleep in it comfortably?', 'Does it work on short or thick hair?', 'How long do the curls last?', 'Will it work on straight hair that never holds a curl?'],
    publicSignals: { ordersBase: 1800, rating: 4.7, reviews: 800, supplierYears: 3, choice: true },
    releaseDay: 0, brandable: 0.55,
  },
  'scalp-massager': {
    supplierTitle: 'Silicone Scalp Massager Shampoo Brush Hair Washing Comb Head Massage Body Bath Brush Dandruff Scalp Care Soft Bristles',
    supplierDescription: d(`
      Name: Shampoo Scalp Massager
      Material: Soft Silicone + ABS
      Size: 8*7cm
      Feature: Soft silicone tooth massage scalp, promote blood circulation, remove dandruff, make hair wash comfortable.
      Can use wet or dry.
      Package: 1 * brush`),
    specs: { Material: 'Silicone, ABS', Size: '8 x 7 cm', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Lavender', 'Pink', 'Black', 'Green'] }],
    cogs: 0.95, shipCost: 1.2, shipDays: CHOICE, weightKg: 0.08, moq: 500,
    perceivedValue: 5.99, amazonPrice: 6.99,
    baseDemand: 0.32, wow: 0.25, problemSolving: 0.35, impulse: 0.8, giftable: 0.25, repeatRate: 0.02,
    audience: { gender: 'female', ageMin: 18, ageMax: 45 }, platformFit: { fadbook: 0.5, tiktak: 0.6 },
    bestFormats: ['asmr_unboxing', 'ugc_testimonial'],
    bestHooks: ['asmr', 'pov'],
    bestAngles: ['self_care', 'convenience'],
    seasonality: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.05],
    trend: EVERGREEN, startCompetitors: 16, defectRate: 0.03, claimRisk: 0.15, scaleCeiling: 150,
    keywords: ['relaxing', 'scalp care', 'deep clean', 'soft', 'massage', 'dandruff', 'shower', 'exfoliate', 'buildup', 'tingly', 'spa feel'],
    objections: ['Is it too harsh?', 'Does it help hair growth?', 'Does it tangle long hair?', 'Does it work on thick or curly hair?'],
    publicSignals: { ordersBase: 12000, rating: 4.8, reviews: 9100, supplierYears: 7, choice: true },
    releaseDay: 0, brandable: 0.25,
  },
  'teeth-whitening-kit': {
    supplierTitle: 'Teeth Whitening Kit LED Light Blue Cold Light Oral Care Dental Whitener Gel Pen Home Use Teeth Bleaching Tooth Whitening Device',
    supplierDescription: d(`
      Product: LED Teeth Whitening Kit
      Include: 1 LED mouth tray (16 LED blue light), 2 whitening gel pen, 1 shade guide, 1 storage case
      Charging: USB / phone type-C
      Use: Brush gel on teeth, put tray in mouth, 16 min 1 time per day.
      Effect: Remove coffee, tea, wine, smoke stain. Up to 8 shades whiter in 7 days.
      Note: Not suitable for pregnant woman and children under 16. Sensitive teeth use shorter time.
      Package: As picture`),
    specs: { LEDs: '16 blue LEDs', Timer: '16 min', Gel: '2 x 3 ml pens', Charging: 'USB-C', Origin: 'Mainland China' },
    variants: [{ name: 'Kit', values: ['Starter Kit', 'Kit + 4 Refill Pens'] }],
    cogs: 5.8, shipCost: 2.1, shipDays: CHOICE, weightKg: 0.2, moq: 500,
    perceivedValue: 29.99, amazonPrice: 24.99,
    baseDemand: 0.72, wow: 0.6, problemSolving: 0.6, impulse: 0.65, giftable: 0.2, repeatRate: 0.15,
    audience: { gender: 'all', ageMin: 18, ageMax: 40 }, platformFit: { fadbook: 0.75, tiktak: 0.85 },
    bestFormats: ['before_after_video', 'ugc_testimonial', 'demo_video'],
    bestHooks: ['before_after', 'testimonial', 'shock_stat'],
    bestAngles: ['self_care', 'savings', 'aspirational'],
    seasonality: [1.05, 1.05, 1, 1, 1.1, 1.05, 1, 1, 0.95, 0.95, 1, 1.05],
    trend: declining(500, 1100), startCompetitors: 70, defectRate: 0.06, claimRisk: 0.5, scaleCeiling: 900,
    keywords: ['whiter smile', 'confidence', 'coffee stains', 'at home', 'painless', 'dentist results', 'save money', 'enamel safe', 'fast', 'brighter', 'gentle'],
    objections: ['Will it make my teeth sensitive?', 'Is the gel peroxide-free?', 'How many shades whiter really?', 'How long do results last?', 'Is it safe for enamel?'],
    publicSignals: { ordersBase: 7600, rating: 4.5, reviews: 11800, supplierYears: 6, choice: true },
    releaseDay: 0, brandable: 0.6,
  },
  'scalp-oil-applicator': {
    supplierTitle: 'Scalp Applicator Bottle Hair Oil Comb Applicator Root Comb Dispenser Hair Growth Oil Dropper Bottle Hair Dye Brush Refillable 60ml',
    supplierDescription: d(`
      Name: Root Comb Applicator Bottle
      Capacity: 60ml / 120ml
      Material: PET + PP
      Use: Fill hair oil, dye or treatment, comb tip apply direct to root, no waste.
      Package: 1 * bottle (liquid not include)`),
    specs: { Capacity: '60 ml / 120 ml', Material: 'PET, PP', Origin: 'Mainland China' },
    variants: [{ name: 'Capacity', values: ['60ml', '120ml'] }, { name: 'Color', values: ['Amber', 'Clear'] }],
    cogs: 0.85, shipCost: 1.1, shipDays: CHOICE, weightKg: 0.05, moq: 500,
    perceivedValue: 4.99, amazonPrice: 5.99,
    baseDemand: 0.28, wow: 0.2, problemSolving: 0.3, impulse: 0.7, giftable: 0.05, repeatRate: 0.02,
    audience: { gender: 'female', ageMin: 18, ageMax: 45 }, platformFit: { fadbook: 0.45, tiktak: 0.6 },
    bestFormats: ['ugc_testimonial', 'slideshow'],
    bestHooks: ['pov', 'life_hack'],
    bestAngles: ['self_care', 'convenience'],
    seasonality: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    trend: EVERGREEN, startCompetitors: 9, defectRate: 0.06, claimRisk: 0.15, scaleCeiling: 150,
    keywords: ['no mess', 'roots', 'precise', 'no waste', 'refillable', 'hair oil', 'even coverage', 'hair growth routine', 'easy grip', 'precision tip'],
    objections: ['Does it leak?', 'Does oil come out too fast?', 'Is oil included?', 'Is it easy to clean between uses?'],
    publicSignals: { ordersBase: 6500, rating: 4.6, reviews: 2400, supplierYears: 3, choice: true },
    releaseDay: 8, brandable: 0.25,
  },
  'nail-drill-kit': {
    supplierTitle: '35000RPM Electric Nail Drill Machine Professional Manicure Pedicure Set Portable Nail File Gel Polish Remover Nail Art Tools Kit',
    supplierDescription: d(`
      Product: Electric Nail Drill Pen
      Speed: 0-35000RPM stepless
      Battery: Rechargeable 1500mAh, work 3-4 hour
      Direction: Forward / Reverse
      Include: 6 ceramic/tungsten bits, 50 sanding bands, 1 USB charger, 1 storage case
      Use for: gel removal, cuticle cleaning, shaping, polishing.
      Low noise, low vibration, not hot.
      Package: As picture show`),
    specs: { Speed: '0–35,000 RPM', Battery: '1500 mAh, 3–4 h runtime', Bits: '6 + 50 sanding bands', Direction: 'Forward / reverse', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Rose Gold', 'White', 'Black'] }],
    cogs: 9.8, shipCost: 2.9, shipDays: STD, weightKg: 0.4, moq: 300,
    perceivedValue: 39.99, amazonPrice: 34.99,
    baseDemand: 0.62, wow: 0.5, problemSolving: 0.6, impulse: 0.4, giftable: 0.35, repeatRate: 0.03,
    audience: { gender: 'female', ageMin: 18, ageMax: 40 }, platformFit: { fadbook: 0.65, tiktak: 0.8 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'green_screen'],
    bestHooks: ['shock_stat', 'pov', 'before_after'],
    bestAngles: ['savings', 'self_care', 'time_saving'],
    seasonality: [0.95, 1, 1, 1, 1.05, 1, 0.95, 0.95, 1, 1, 1.05, 1.15],
    trend: EVERGREEN, startCompetitors: 20, defectRate: 0.05, claimRisk: 0.05, scaleCeiling: 750,
    keywords: ['salon manicure', 'at home', 'save money', 'gel removal', 'cordless', 'quiet', 'precise', 'beginner-friendly', 'professional', 'rechargeable'],
    objections: ['Is it safe for beginners?', 'Will it damage my natural nails?', 'Which bits do I use for what?', 'Is it strong enough for acrylics?'],
    publicSignals: { ordersBase: 3100, rating: 4.6, reviews: 2100, supplierYears: 6, choice: false },
    releaseDay: 15, brandable: 0.55,
  },

  // ==========================================================================
  // HOME
  // ==========================================================================
  'galaxy-projector': {
    supplierTitle: 'Astronaut Galaxy Star Projector Night Light Starry Sky Nebula Projection Lamp Bedroom Kids Gift Remote Control Timer Rotating Decor',
    supplierDescription: d(`
      Product: Astronaut Starry Sky Projector
      Material: ABS + PC
      Power: USB 5V (adapter not include)
      Function: Nebula + Stars, 8 nebula color, 360 degree adjust head, remote control, timer 1H/2H
      Features:
      1. Turn your room into galaxy in seconds. Perfect for sleep, party, game room.
      2. Magnetic head can adjust angle any direction.
      3. Best gift for kids, boyfriend, girlfriend, Christmas, birthday.
      Package: 1*Projector, 1*Remote, 1*USB Cable, 1*Manual`),
    specs: { Material: 'ABS, PC', Power: 'USB 5V', Effects: 'nebula + stars, 8 colors', Timer: '1 h / 2 h', Remote: 'Included', Origin: 'Mainland China' },
    variants: [{ name: 'Style', values: ['Astronaut White', 'Astronaut Black'] }],
    cogs: 8.9, shipCost: 3.2, shipDays: STD, weightKg: 0.55, moq: 300,
    perceivedValue: 44.99, amazonPrice: 36.99,
    baseDemand: 0.85, wow: 0.9, problemSolving: 0.2, impulse: 0.6, giftable: 0.9, repeatRate: 0,
    audience: { gender: 'all', ageMin: 18, ageMax: 44 }, platformFit: { fadbook: 0.65, tiktak: 0.9 },
    bestFormats: ['demo_video', 'asmr_unboxing', 'ugc_testimonial'],
    bestHooks: ['gift_idea', 'pov', 'unboxing'],
    bestAngles: ['gift', 'aspirational', 'curiosity'],
    seasonality: [0.45, 0.55, 0.3, 0.28, 0.28, 0.25, 0.25, 0.3, 0.4, 0.8, 1.65, 1.9],
    trend: EVERGREEN, startCompetitors: 25, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 2500,
    keywords: ['galaxy', 'cozy', 'bedroom', 'aesthetic', 'relaxing', 'perfect gift', 'remote control', 'timer', 'kids love it', 'mood lighting', 'game room'],
    objections: ['How big is the projection?', 'Is it bright enough in a lit room?', 'Is it noisy?', 'Does it include a power adapter?', 'Will it arrive before Christmas?'],
    publicSignals: { ordersBase: 5000, rating: 4.6, reviews: 7400, supplierYears: 5, choice: false },
    releaseDay: 0, brandable: 0.5,
  },
  'sunset-lamp': {
    supplierTitle: 'Sunset Lamp Projector LED Rainbow Night Light 16 Colors Remote Photography Aesthetic Room Decor TikTak Selfie Atmosphere Lamp',
    supplierDescription: d(`
      Name: Sunset Projection Lamp
      Material: Aluminum + ABS
      Power: USB 5V 5W
      Color: 16 color with remote / Sunset red / Rainbow
      Rotate: 180 degree head
      Use for: Photography, living room, bedroom, party, background.
      Package: 1*Lamp, 1*USB cable, (1*remote for RGB version)`),
    specs: { Material: 'Aluminum, ABS', Power: 'USB 5V 5W', Colors: '16 (RGB version)', Head: '180° rotation', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Sunset Red', 'Rainbow', '16 Colors + Remote'] }],
    cogs: 4.9, shipCost: 2.8, shipDays: CHOICE, weightKg: 0.45, moq: 500,
    perceivedValue: 24.99, amazonPrice: 17.99,
    baseDemand: 0.7, wow: 0.7, problemSolving: 0.1, impulse: 0.8, giftable: 0.5, repeatRate: 0,
    audience: { gender: 'female', ageMin: 16, ageMax: 34 }, platformFit: { fadbook: 0.5, tiktak: 0.9 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'slideshow'],
    bestHooks: ['pov', 'tiktak_made_me_buy', 'asmr'],
    bestAngles: ['aspirational', 'self_care', 'gift'],
    seasonality: [0.95, 1, 0.95, 0.95, 0.95, 0.95, 0.95, 1, 1, 1.05, 1.1, 1.2],
    trend: declining(300, 1500), startCompetitors: 80, defectRate: 0.06, claimRisk: 0.02, scaleCeiling: 600,
    keywords: ['golden hour', 'aesthetic', 'selfies', 'vibe', 'cozy', 'room glow-up', 'photos', 'remote', 'mood', 'warm glow'],
    objections: ['Is it bright enough during the day?', 'Does it get hot?', 'How big is the circle on the wall?', 'Does it come with a remote?'],
    publicSignals: { ordersBase: 11000, rating: 4.6, reviews: 26000, supplierYears: 5, choice: true },
    releaseDay: 0, brandable: 0.3,
  },
  'motion-cabinet-lights': {
    supplierTitle: 'LED Motion Sensor Light Under Cabinet Lights Wireless USB Rechargeable Magnetic Closet Light Kitchen Wardrobe Stairs Night Lamp 3 Pack',
    supplierDescription: d(`
      Product: Motion Sensor Cabinet Light (3pcs)
      Length: 20cm / 30cm / 40cm
      Battery: 1000mAh built-in, Type-C charge, work 2-3 month (sensor mode)
      Light Color: Warm white 3000K / Cool white 6000K
      Sensor: PIR human body sensor, 3-5m, 120 degree, auto off 20s
      Install: Magnetic strip + 3M sticker, no drill, no wiring.
      Package: 3*lights, 3*magnetic strips, 1*USB cable`),
    specs: { Length: '20 / 30 / 40 cm', Battery: '1000 mAh USB-C', 'Sensor Range': '3–5 m, 120°', 'Color Temp': '3000K / 6000K', Install: 'Magnetic + adhesive, no wiring', Origin: 'Mainland China' },
    variants: [{ name: 'Length', values: ['20cm x3', '30cm x3', '40cm x3'] }, { name: 'Light', values: ['Warm White', 'Cool White'] }],
    cogs: 6.4, shipCost: 2.6, shipDays: CHOICE, weightKg: 0.4, moq: 300,
    perceivedValue: 29.99, amazonPrice: 24.99,
    baseDemand: 0.62, wow: 0.55, problemSolving: 0.65, impulse: 0.6, giftable: 0.2, repeatRate: 0,
    audience: { gender: 'all', ageMin: 25, ageMax: 60 }, platformFit: { fadbook: 0.85, tiktak: 0.65 },
    bestFormats: ['demo_video', 'before_after_video', 'ugc_testimonial'],
    bestHooks: ['before_after', 'life_hack', 'problem_callout'],
    bestAngles: ['convenience', 'aspirational', 'pain_point'],
    seasonality: [1.1, 1.05, 1, 0.95, 0.9, 0.9, 0.9, 0.95, 1, 1.1, 1.1, 1.1],
    trend: EVERGREEN, startCompetitors: 22, defectRate: 0.06, claimRisk: 0.02, scaleCeiling: 800,
    keywords: ['no wiring', 'motion sensor', 'rechargeable', 'magnetic', 'renter-friendly', 'hands-free', 'late-night snacks', 'closet', 'stairs', 'warm glow', 'install in seconds'],
    objections: ['How long does a charge last?', 'Does the adhesive damage cabinets?', 'Is it bright enough?', 'Does the sensor trigger reliably?'],
    publicSignals: { ordersBase: 4100, rating: 4.6, reviews: 2700, supplierYears: 6, choice: true },
    releaseDay: 21, brandable: 0.45,
  },
  'spin-scrubber': {
    supplierTitle: 'Electric Spin Scrubber Cordless Cleaning Brush Extension Handle 4 Replaceable Heads Bathroom Tub Tile Grout Floor Power Scrubber Rechargeable',
    supplierDescription: d(`
      Product: Cordless Electric Spin Scrubber
      Motor: 360 RPM high torque
      Battery: 2000mAh, 90 minute working
      Handle: Adjustable extension 38-120cm
      Waterproof: IPX7
      Brush Head: 4pcs (flat, dome, corner, cone)
      Feature:
      1. No need bend over and kneel, clean bathtub, tile, grout, floor, toilet easy.
      2. 2 speed, strong power remove stubborn stain.
      3. Cordless, Type-C charging.
      Package: 1*Scrubber, 4*Brush heads, 1*Extension handle, 1*Charging cable`),
    specs: { Speed: '2 speeds, up to 360 RPM', Battery: '2000 mAh, ~90 min', Handle: 'Extends 38–120 cm', Waterproof: 'IPX7', Heads: '4 interchangeable', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Grey', 'Blue'] }, { name: 'Kit', values: ['4 Heads', '8 Heads'] }],
    cogs: 11.4, shipCost: 4.2, shipDays: STD, weightKg: 1.3, moq: 200,
    perceivedValue: 66.99, amazonPrice: 56.99,
    baseDemand: 0.9, wow: 0.85, problemSolving: 0.9, impulse: 0.5, giftable: 0.25, repeatRate: 0.02,
    audience: { gender: 'female', ageMin: 28, ageMax: 65 }, platformFit: { fadbook: 0.9, tiktak: 0.8 },
    bestFormats: ['before_after_video', 'demo_video', 'ugc_testimonial'],
    bestHooks: ['before_after', 'asmr', 'problem_callout'],
    bestAngles: ['time_saving', 'pain_point', 'convenience'],
    seasonality: [1.1, 1.05, 1.2, 1.25, 1.1, 0.95, 0.9, 0.9, 0.95, 1, 1.1, 1],
    trend: EVERGREEN, startCompetitors: 12, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 4000,
    keywords: ['no scrubbing', 'no bending', 'grout', 'bathtub', 'effortless', 'cordless', 'waterproof', 'back pain', 'sparkling', 'saves hours', 'stubborn stains', 'extendable'],
    objections: ['Is it strong enough for hard-water stains?', 'How long does the battery last?', 'Is it waterproof?', 'Will it scratch my tub or tiles?', 'Can I buy replacement heads?'],
    publicSignals: { ordersBase: 3600, rating: 4.75, reviews: 2300, supplierYears: 5, choice: false },
    releaseDay: 0, brandable: 0.7,
  },
  'window-robot': {
    supplierTitle: 'Window Cleaning Robot Smart Glass Cleaner Automatic Vacuum Suction Remote Control Anti-Fall Safety Rope Water Spray Robot Window Washer',
    supplierDescription: d(`
      Product: Smart Window Cleaning Robot
      Suction: 3200Pa strong vacuum adsorption
      Power: 72W, built-in UPS battery 20 minute (power off protection)
      Water Tank: 30ml ultrasonic spray
      Control: Remote + App
      Path: Z / N / auto planning, edge detection, anti-fall
      Suitable: Glass window, mirror, tile, smooth wall. Min glass size 40*40cm, thickness >3mm.
      Package: 1*Robot, 1*Safety rope, 12*Cleaning pads, 1*Remote, 1*Adapter (US plug), 1*Manual`),
    specs: { Suction: '3,200 Pa', Power: '72 W, US plug', Backup: '20 min UPS battery', 'Water Tank': '30 ml spray', Control: 'Remote + app', 'Min Glass': '40 x 40 cm', Origin: 'Mainland China' },
    variants: [{ name: 'Model', values: ['Square (spray)', 'Square (no spray)'] }],
    cogs: 34.9, shipCost: 7.6, shipDays: STD_SLOW, weightKg: 1.6, moq: 100, bulkRatio: 0.7, privateLabelMoq: 500,
    perceivedValue: 199.99, amazonPrice: 179.99,
    baseDemand: 0.74, wow: 0.9, problemSolving: 0.7, impulse: 0.15, giftable: 0.35, repeatRate: 0.02,
    audience: { gender: 'all', ageMin: 30, ageMax: 65 }, platformFit: { fadbook: 0.9, tiktak: 0.7 },
    bestFormats: ['demo_video', 'before_after_video', 'ugc_testimonial'],
    bestHooks: ['shock_stat', 'before_after', 'pov'],
    bestAngles: ['time_saving', 'savings', 'aspirational'],
    seasonality: [0.9, 0.95, 1.2, 1.3, 1.2, 1, 0.9, 0.9, 1, 1, 1.1, 1.05],
    trend: EVERGREEN, startCompetitors: 5, defectRate: 0.08, claimRisk: 0.02, scaleCeiling: 2500,
    keywords: ['streak-free', 'hands-free', 'safe', 'no ladders', 'tall windows', 'remote control', 'anti-fall', 'spotless', 'save hours', 'smart', 'set and forget'],
    objections: ['Can it fall off the window?', 'Does it work on outside glass?', 'Does it leave streaks?', 'What window sizes does it work on?', 'Is there a warranty?', 'How loud is it?'],
    publicSignals: { ordersBase: 700, rating: 4.55, reviews: 390, supplierYears: 6, choice: false },
    releaseDay: 110, brandable: 0.7,
  },
  'garment-steamer': {
    supplierTitle: 'Handheld Garment Steamer Portable Travel Clothes Steamer 1500W Fast Heat Up Fabric Wrinkle Remover Mini Steam Iron Household',
    supplierDescription: d(`
      Name: Portable Garment Steamer
      Power: 1500W (US 110V)
      Water Tank: 260ml, work 15 minute continuously
      Heat Time: 25 seconds fast heating
      Feature:
      1. Remove wrinkle, odor and bacteria, no need ironing board.
      2. Vertical and horizontal steaming, suit, dress, curtain, sofa.
      3. Compact and light, perfect for travel and business trip.
      4. Auto shut off, anti dry burning protection.
      Package: 1*Steamer, 1*Brush, 1*Measuring Cup, 1*Manual`),
    specs: { Power: '1500 W, US 110V', 'Water Tank': '260 ml', 'Heat-up': '25 s', Safety: 'Auto shut-off, dry-burn protection', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['White/Sage', 'White/Pink', 'Black'] }],
    cogs: 9.2, shipCost: 3.8, shipDays: CHOICE, weightKg: 0.75, moq: 300,
    perceivedValue: 42.99, amazonPrice: 34.99,
    baseDemand: 0.6, wow: 0.5, problemSolving: 0.7, impulse: 0.45, giftable: 0.3, repeatRate: 0,
    audience: { gender: 'female', ageMin: 22, ageMax: 55 }, platformFit: { fadbook: 0.8, tiktak: 0.7 },
    bestFormats: ['before_after_video', 'demo_video', 'ugc_testimonial'],
    bestHooks: ['before_after', 'life_hack', 'pov'],
    bestAngles: ['time_saving', 'convenience'],
    seasonality: [0.95, 0.95, 1, 1, 1.05, 1.1, 1.1, 1.05, 1, 0.95, 1, 1.1],
    trend: EVERGREEN, startCompetitors: 28, defectRate: 0.06, claimRisk: 0.02, scaleCeiling: 700,
    keywords: ['wrinkle-free', 'no ironing board', '25 seconds', 'travel', 'compact', 'gentle on fabrics', 'fresh', 'fast', 'safe', 'kills odors'],
    objections: ['Does it leak or spit water?', 'Is it strong enough for cotton shirts?', 'Is it dual voltage for travel?', 'How long does the tank last?'],
    publicSignals: { ordersBase: 3900, rating: 4.6, reviews: 3200, supplierYears: 7, choice: true },
    releaseDay: 0, brandable: 0.5,
  },
  'magnetic-screen-door': {
    supplierTitle: 'Magnetic Screen Door Mesh Curtain Anti Mosquito Net Summer Door Screen Hands Free Automatic Closing Fly Bug Insect Curtain Pet Friendly',
    supplierDescription: d(`
      Product: Magnetic Screen Door
      Material: Polyester Fiberglass Mesh + Magnet
      Size: 90*210cm / 100*220cm (fit door up to 36"x82")
      Feature:
      1. Heavy duty mesh, keep bug and mosquito out, let fresh air in.
      2. 26 powerful magnets top to bottom, close automatic behind you, hands free.
      3. Pet and kids walk through easy.
      4. Easy install with thumbtacks, no tool need.
      Package: 1*screen, 26*magnets (installed), thumbtacks, hook tape`),
    specs: { Material: 'Polyester fiberglass mesh', Size: '90 x 210 cm / 100 x 220 cm', Magnets: '26, full-length seal', Install: 'Thumbtacks + hook tape, no tools', Origin: 'Mainland China' },
    variants: [{ name: 'Size', values: ['36" x 82"', '38" x 83"', '48" x 83"'] }, { name: 'Color', values: ['Black', 'White'] }],
    cogs: 5.1, shipCost: 2.9, shipDays: CHOICE, weightKg: 0.6, moq: 500,
    perceivedValue: 29.99, amazonPrice: 24.99,
    baseDemand: 0.85, wow: 0.65, problemSolving: 0.85, impulse: 0.7, giftable: 0.05, repeatRate: 0,
    audience: { gender: 'all', ageMin: 28, ageMax: 65 }, platformFit: { fadbook: 0.9, tiktak: 0.6 },
    bestFormats: ['demo_video', 'skit', 'ugc_testimonial'],
    bestHooks: ['problem_callout', 'pov', 'life_hack'],
    bestAngles: ['pain_point', 'convenience', 'pet_love'],
    seasonality: [0.2, 0.25, 0.45, 0.95, 1.6, 1.9, 1.9, 1.5, 0.9, 0.45, 0.25, 0.2],
    trend: EVERGREEN, startCompetitors: 30, defectRate: 0.06, claimRisk: 0.02, scaleCeiling: 2200,
    keywords: ['bug-free', 'fresh air', 'hands-free', 'snaps shut', 'pet-friendly', 'no tools', 'mosquitoes', 'summer evenings', 'easy install', 'kids'],
    objections: ['Will it fit my door?', 'Do the magnets really close every time?', 'Will it damage my door frame?', 'Can my dog get through it?', 'Does it hold up in wind?'],
    publicSignals: { ordersBase: 6200, rating: 4.5, reviews: 9800, supplierYears: 8, choice: true },
    releaseDay: 0, brandable: 0.35,
  },
  'moon-lamp': {
    supplierTitle: 'Levitating Moon Lamp 3D Print Floating Moon Night Light Magnetic Levitation Wooden Base Touch Dimmable Rotating Moon Gift Home Decor',
    supplierDescription: d(`
      Product: Magnetic Levitation Moon Lamp
      Moon Diameter: 14cm / 18cm
      Material: PLA 3D print + wood base
      Power: DC 24V adapter (US plug)
      Function: Auto rotate floating, 3 color touch (warm / white / yellow), wireless charging light
      How to float: Hold moon 2cm above base center, find balance point, release slowly.
      Note: Keep away from other magnet and metal. Not suitable for heart pacemaker user.
      Package: 1*Moon, 1*Base, 1*Adapter, 1*Manual, gift box`),
    specs: { 'Moon Size': '14 cm / 18 cm', Material: '3D-printed PLA, wood base', Power: '24V adapter, US plug', Light: '3 colors, touch dimmable', Origin: 'Mainland China' },
    variants: [{ name: 'Size', values: ['14cm Moon', '18cm Moon'] }],
    cogs: 15.8, shipCost: 4.8, shipDays: STD, weightKg: 1.1, moq: 200,
    perceivedValue: 109.99, amazonPrice: 89.99,
    baseDemand: 0.8, wow: 0.92, problemSolving: 0.05, impulse: 0.35, giftable: 0.8, repeatRate: 0,
    audience: { gender: 'all', ageMin: 18, ageMax: 44 }, platformFit: { fadbook: 0.75, tiktak: 0.9 },
    bestFormats: ['demo_video', 'asmr_unboxing', 'ugc_testimonial'],
    bestHooks: ['unboxing', 'gift_idea', 'pov'],
    bestAngles: ['gift', 'aspirational', 'curiosity'],
    seasonality: [0.8, 1.1, 0.85, 0.85, 0.9, 0.85, 0.8, 0.85, 0.9, 1, 1.3, 1.6],
    trend: EVERGREEN, startCompetitors: 14, defectRate: 0.32, claimRisk: 0.02, scaleCeiling: 1800,
    keywords: ['floats', 'magnetic levitation', 'mesmerizing', 'unique gift', 'rotating', 'warm glow', 'statement piece', 'conversation starter', 'desk decor', 'night light'],
    objections: ['Is it hard to get it floating?', 'What happens during a power outage?', 'Does it arrive safely packed?', 'Is it loud?', 'What if it stops floating?'],
    publicSignals: { ordersBase: 1600, rating: 4.7, reviews: 1200, supplierYears: 2, choice: false },
    releaseDay: 66, brandable: 0.4,
  },
  'heated-throw': {
    supplierTitle: 'Electric Heated Throw Blanket Sherpa Flannel 50x60 Heating Blanket 6 Heat Levels 4H Auto Off Machine Washable Winter Warm Sofa Office',
    supplierDescription: d(`
      Product: Electric Heated Throw
      Size: 127*152cm (50"x60")
      Material: Flannel top + Sherpa back
      Power: 110V 100W, US plug
      Controller: 6 heat level, 4 hour auto off timer, LCD
      Feature:
      1. Heat up in 5 minute, save heating bill, warm only where you need.
      2. Detachable controller, machine washable.
      3. Overheat protection, safe to use.
      Package: 1*Blanket, 1*Controller, 1*Manual`),
    specs: { Size: '50" x 60"', Material: 'Flannel top, sherpa back', Power: '100 W, US 110V', Controls: '6 heat levels, 4 h auto-off', Care: 'Machine washable (controller detached)', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Cream', 'Grey', 'Sage'] }, { name: 'Size', values: ['50x60 Throw', '62x84 Twin'] }],
    cogs: 15.2, shipCost: 5.9, shipDays: STD_SLOW, weightKg: 1.4, moq: 200,
    perceivedValue: 74.99, amazonPrice: 59.99,
    baseDemand: 0.85, wow: 0.45, problemSolving: 0.7, impulse: 0.45, giftable: 0.8, repeatRate: 0,
    audience: { gender: 'female', ageMin: 25, ageMax: 65 }, platformFit: { fadbook: 0.95, tiktak: 0.6 },
    bestFormats: ['ugc_testimonial', 'asmr_unboxing', 'slideshow'],
    bestHooks: ['gift_idea', 'shock_stat', 'pov'],
    bestAngles: ['self_care', 'gift', 'savings'],
    seasonality: [1.6, 1.2, 0.5, 0.3, 0.22, 0.2, 0.2, 0.25, 0.5, 1.25, 1.75, 1.9],
    trend: EVERGREEN, startCompetitors: 22, defectRate: 0.05, claimRisk: 0.05, scaleCeiling: 2400,
    keywords: ['cozy', 'warm in minutes', 'lower heating bill', 'auto shut-off', 'machine washable', 'soft sherpa', 'perfect gift', 'movie nights', 'safe', 'six heat settings'],
    objections: ['Is it safe to fall asleep under?', 'Can I wash it?', 'How much electricity does it use?', 'Does it heat evenly?', 'Will it arrive before the holidays?'],
    publicSignals: { ordersBase: 2600, rating: 4.6, reviews: 2100, supplierYears: 6, choice: false },
    releaseDay: 180, brandable: 0.6,
  },

  // ==========================================================================
  // KITCHEN
  // ==========================================================================
  'oil-sprayer': {
    supplierTitle: 'Olive Oil Sprayer Bottle For Cooking 200ml Glass Oil Dispenser Mister Kitchen Air Fryer Salad BBQ Vinegar Spray Bottle Portion Control',
    supplierDescription: d(`
      Name: Oil Spray Bottle
      Capacity: 200ml / 300ml
      Material: High borosilicate glass + PP pump
      Spray: 0.25ml per press, fine mist
      Use: Air fryer, salad, BBQ, baking, frying.
      Package: 1*Bottle (oil not include)
      Note: Glass product, we pack carefully, if broken please contact us.`),
    specs: { Capacity: '200 ml / 300 ml', Material: 'Borosilicate glass, PP pump', Output: '0.25 ml per spray', Origin: 'Mainland China' },
    variants: [{ name: 'Capacity', values: ['200ml', '300ml'] }, { name: 'Color', values: ['Black', 'White'] }],
    cogs: 2.4, shipCost: 2, shipDays: CHOICE, weightKg: 0.25, moq: 500,
    perceivedValue: 9.99, amazonPrice: 8.99,
    baseDemand: 0.35, wow: 0.35, problemSolving: 0.4, impulse: 0.7, giftable: 0.1, repeatRate: 0.02,
    audience: { gender: 'all', ageMin: 25, ageMax: 55 }, platformFit: { fadbook: 0.6, tiktak: 0.55 },
    bestFormats: ['demo_video', 'ugc_testimonial'],
    bestHooks: ['life_hack', 'pov'],
    bestAngles: ['health', 'convenience'],
    seasonality: [1.05, 1, 1, 1, 1, 1.05, 1.05, 1, 1, 1, 1.05, 1.1],
    trend: EVERGREEN, startCompetitors: 30, defectRate: 0.06, claimRisk: 0.1, scaleCeiling: 150,
    keywords: ['fine mist', 'air fryer', 'less oil', 'portion control', 'glass', 'even coating', 'healthier cooking', 'salads', 'refillable', 'no aerosol'],
    objections: ['Does it clog?', 'Does it spray or just squirt?', 'Does the glass arrive broken?', 'Does it work with thicker oils like avocado?'],
    publicSignals: { ordersBase: 14000, rating: 4.55, reviews: 8700, supplierYears: 6, choice: true },
    releaseDay: 0, brandable: 0.25,
  },
  'veggie-chopper': {
    supplierTitle: 'Multifunctional Vegetable Chopper Onion Dicer Slicer Cutter 14 In 1 Food Chopper With Container Kitchen Gadgets Salad Mandoline Grater',
    supplierDescription: d(`
      Product: 14 in 1 Vegetable Chopper
      Material: ABS + 420 Stainless Steel Blade
      Container: 1.2L with lid
      Include: 8 blades, 1 hand guard, 1 cleaning brush, 1 container
      Feature:
      1. Dice onion in 3 second, no tears.
      2. Chop, slice, grate, julienne, egg separator.
      3. Non-slip base, dishwasher safe (except blade).
      Package: 14pcs/set`),
    specs: { Material: 'ABS, 420 stainless blades', Container: '1.2 L', Blades: '8 interchangeable', 'Dishwasher Safe': 'Container & lid', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Green', 'Grey'] }, { name: 'Set', values: ['14 in 1', '16 in 1'] }],
    cogs: 6.9, shipCost: 3.4, shipDays: CHOICE, weightKg: 0.7, moq: 300,
    perceivedValue: 29.99, amazonPrice: 22.99,
    baseDemand: 0.74, wow: 0.65, problemSolving: 0.7, impulse: 0.6, giftable: 0.15, repeatRate: 0,
    audience: { gender: 'female', ageMin: 25, ageMax: 60 }, platformFit: { fadbook: 0.9, tiktak: 0.7 },
    bestFormats: ['demo_video', 'asmr_unboxing', 'ugc_testimonial'],
    bestHooks: ['asmr', 'life_hack', 'problem_callout'],
    bestAngles: ['time_saving', 'convenience'],
    seasonality: [1.1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.05, 1.05],
    trend: declining(700, 1200), startCompetitors: 75, defectRate: 0.06, claimRisk: 0.02, scaleCeiling: 800,
    keywords: ['meal prep', 'no tears', 'seconds', 'uniform cuts', 'dishwasher safe', 'less mess', 'stainless blades', 'container', 'one push', 'safe hand guard'],
    objections: ['Are the blades hard to clean?', 'Does it cut hard veggies like carrots?', 'Does the lid snap or break?', 'Are the blades sharp enough?'],
    publicSignals: { ordersBase: 10500, rating: 4.6, reviews: 19500, supplierYears: 9, choice: true },
    releaseDay: 0, brandable: 0.35,
  },
  'portable-blender': {
    supplierTitle: 'Portable Blender USB Rechargeable Mini Juicer Cup 380ml Personal Smoothie Maker 6 Blades Fresh Juice Shakes Travel Gym Fruit Mixer',
    supplierDescription: d(`
      Product: Portable Blender Juicer
      Capacity: 380ml
      Battery: 1500mAh, 12-15 cups per charge, Type-C
      Blade: 6 stainless steel blades, 22000RPM
      Safety: Magnetic induction switch, only work when cup installed correct.
      Material: BPA free Tritan
      Package: 1*Blender, 1*USB cable, 1*Manual`),
    specs: { Capacity: '380 ml', Battery: '1500 mAh USB-C', Blades: '6 stainless, 22,000 RPM', Material: 'BPA-free Tritan', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Pastel Blue', 'Pink', 'White', 'Mint'] }],
    cogs: 6.3, shipCost: 2.9, shipDays: CHOICE, weightKg: 0.5, moq: 500,
    perceivedValue: 29.99, amazonPrice: 24.99,
    baseDemand: 0.72, wow: 0.55, problemSolving: 0.45, impulse: 0.7, giftable: 0.35, repeatRate: 0,
    audience: { gender: 'female', ageMin: 18, ageMax: 40 }, platformFit: { fadbook: 0.7, tiktak: 0.8 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'green_screen'],
    bestHooks: ['pov', 'life_hack', 'tiktak_made_me_buy'],
    bestAngles: ['health', 'convenience', 'aspirational'],
    seasonality: [1.15, 1.05, 1, 1, 1.05, 1.15, 1.15, 1.1, 0.95, 0.9, 0.9, 1],
    trend: declining(450, 1300), startCompetitors: 88, defectRate: 0.07, claimRisk: 0.08, scaleCeiling: 700,
    keywords: ['smoothies anywhere', 'rechargeable', 'gym', 'protein shakes', 'BPA-free', 'on the go', 'easy clean', 'healthy', 'USB-C', 'fresh juice'],
    objections: ['Can it crush ice or frozen fruit?', 'How many blends per charge?', 'Is it easy to clean?', 'Does it leak in a bag?'],
    publicSignals: { ordersBase: 13000, rating: 4.5, reviews: 31000, supplierYears: 7, choice: true },
    releaseDay: 0, brandable: 0.45,
  },
  'milk-frother': {
    supplierTitle: 'Electric Milk Frother Handheld Whisk Coffee Foam Maker Mini Mixer Battery Operated Stainless Steel Latte Cappuccino Hot Chocolate Stirrer',
    supplierDescription: d(`
      Name: Handheld Milk Frother
      Power: 2*AA battery (not include)
      Speed: 19000RPM
      Material: 304 stainless steel whisk + ABS handle
      Use: Latte, cappuccino, matcha, protein drink, egg.
      Package: 1*Frother`),
    specs: { Power: '2 x AA (not included)', Speed: '19,000 RPM', Whisk: '304 stainless steel', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Black', 'Silver', 'White'] }],
    cogs: 1.6, shipCost: 1.4, shipDays: CHOICE, weightKg: 0.1, moq: 500,
    perceivedValue: 7.99, amazonPrice: 7.99,
    baseDemand: 0.3, wow: 0.4, problemSolving: 0.3, impulse: 0.8, giftable: 0.25, repeatRate: 0,
    audience: { gender: 'female', ageMin: 22, ageMax: 50 }, platformFit: { fadbook: 0.55, tiktak: 0.6 },
    bestFormats: ['demo_video', 'ugc_testimonial'],
    bestHooks: ['asmr', 'pov'],
    bestAngles: ['convenience', 'savings'],
    seasonality: [1.05, 1, 1, 1, 0.95, 0.95, 0.95, 0.95, 1, 1.05, 1.05, 1.1],
    trend: EVERGREEN, startCompetitors: 25, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 150,
    keywords: ['cafe-style foam', 'seconds', 'latte at home', 'save money', 'matcha', 'easy', 'frothy', 'hot chocolate', 'one-handed', 'stainless steel'],
    objections: ['Are batteries included?', 'Does it froth plant milk?', 'Does it splash?', 'Is it strong enough for thick foam?'],
    publicSignals: { ordersBase: 15000, rating: 4.7, reviews: 13000, supplierYears: 8, choice: true },
    releaseDay: 0, brandable: 0.2,
  },
  'ice-ball-maker': {
    supplierTitle: 'Crystal Clear Ice Ball Maker Mold Whiskey Ice Sphere Maker Large 2.4 Inch Round Ice Cube Tray Cocktail Bar Directional Freezing Box',
    supplierDescription: d(`
      Product: Clear Ice Ball Maker
      Ice Size: 6cm diameter sphere, 4 ball per time
      Material: Food grade silicone + PP insulated box
      Principle: Directional freezing, impurity and air push to bottom, top ball crystal clear like bar.
      Freeze Time: 18-24 hours
      Package: 1*insulation box, 4*silicone mold, 1*funnel`),
    specs: { 'Ice Size': '6 cm sphere x 4', Material: 'Food-grade silicone, insulated PP', 'Freeze Time': '18–24 h', Method: 'Directional freezing', Origin: 'Mainland China' },
    variants: [{ name: 'Shape', values: ['Sphere x4', 'Cube x4'] }],
    cogs: 4.2, shipCost: 2.5, shipDays: STD, weightKg: 0.35, moq: 300,
    perceivedValue: 22.99, amazonPrice: 19.99,
    baseDemand: 0.58, wow: 0.65, problemSolving: 0.2, impulse: 0.6, giftable: 0.6, repeatRate: 0,
    audience: { gender: 'male', ageMin: 25, ageMax: 55 }, platformFit: { fadbook: 0.85, tiktak: 0.65 },
    bestFormats: ['asmr_unboxing', 'demo_video', 'static_image'],
    bestHooks: ['asmr', 'question', 'life_hack'],
    bestAngles: ['aspirational', 'gift', 'curiosity'],
    seasonality: [0.95, 0.9, 0.9, 0.95, 1.05, 1.25, 1.05, 1, 0.95, 1, 1.1, 1.35],
    trend: EVERGREEN, startCompetitors: 12, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 650,
    keywords: ['crystal clear', 'bar-quality', 'slow melting', 'whiskey', 'cocktails', 'impress guests', 'no cloudy ice', 'perfect spheres', 'gift for him', 'home bar'],
    objections: ['Is it really crystal clear?', 'How long does it take to freeze?', 'Will it fit in my freezer?', 'Does it crack the ice?'],
    publicSignals: { ordersBase: 2300, rating: 4.5, reviews: 1500, supplierYears: 4, choice: false },
    releaseDay: 40, brandable: 0.55,
  },
  'gravity-grinder': {
    supplierTitle: 'Gravity Electric Salt and Pepper Grinder Set Automatic Pepper Mill Battery Powered LED Light Adjustable Coarseness One Hand Operation 2 Pack',
    supplierDescription: d(`
      Product: Gravity Induction Electric Grinder (2pcs)
      Material: ABS + Ceramic Core
      Power: 6*AAA battery each (not include)
      Operation: Turn upside down, auto grind with blue LED light. Put back, stop.
      Coarseness: Adjustable from fine to coarse by knob.
      Capacity: 70ml
      Package: 2*grinder, 1*stand, 1*cleaning brush`),
    specs: { Material: 'ABS, ceramic burr', Power: '6 x AAA each (not included)', Capacity: '70 ml', Operation: 'Gravity switch, one-handed', Light: 'Blue LED', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Matte Black', 'Stainless', 'White'] }, { name: 'Pack', values: ['2 Pack', '2 Pack + Stand'] }],
    cogs: 7.4, shipCost: 2.8, shipDays: CHOICE, weightKg: 0.6, moq: 300,
    perceivedValue: 44.99, amazonPrice: 39.99,
    baseDemand: 0.86, wow: 0.8, problemSolving: 0.4, impulse: 0.6, giftable: 0.75, repeatRate: 0.02,
    audience: { gender: 'all', ageMin: 25, ageMax: 55 }, platformFit: { fadbook: 0.85, tiktak: 0.85 },
    bestFormats: ['demo_video', 'asmr_unboxing', 'ugc_testimonial'],
    bestHooks: ['asmr', 'gift_idea', 'pov'],
    bestAngles: ['gift', 'convenience', 'aspirational'],
    seasonality: [0.95, 0.95, 0.95, 0.95, 1, 1.05, 0.95, 0.95, 1, 1.05, 1.25, 1.45],
    trend: EVERGREEN, startCompetitors: 10, defectRate: 0.06, claimRisk: 0.02, scaleCeiling: 3000,
    keywords: ['one-handed', 'flip to grind', 'LED light', 'adjustable', 'ceramic', 'no mess', 'sleek', 'housewarming gift', 'effortless', 'automatic'],
    objections: ['Are batteries included?', 'How long do batteries last?', 'Is it easy to refill?', 'Can I adjust coarseness?', 'Does it grind sea salt?'],
    publicSignals: { ordersBase: 3000, rating: 4.7, reviews: 1700, supplierYears: 4, choice: true },
    releaseDay: 52, brandable: 0.6,
  },
  'herb-keeper': {
    supplierTitle: 'Fresh Herb Keeper Container Refrigerator Herb Saver Cilantro Mint Parsley Storage Pod Keep Fresh 2-3 Weeks Kitchen Organizer',
    supplierDescription: d(`
      Name: Herb Keeper
      Material: PET + PP, BPA free
      Size: 10*10*23cm
      Use: Add water in bottom, put herb stem, close lid, keep in fridge. Herb fresh 2-3 week.
      Package: 1*Herb keeper`),
    specs: { Material: 'PET, PP, BPA-free', Size: '10 x 10 x 23 cm', Origin: 'Mainland China' },
    variants: [{ name: 'Pack', values: ['1 pc', '2 pcs'] }],
    cogs: 3.8, shipCost: 2.6, shipDays: STD, weightKg: 0.3, moq: 500,
    perceivedValue: 11.99, amazonPrice: 12.99,
    baseDemand: 0.28, wow: 0.25, problemSolving: 0.4, impulse: 0.5, giftable: 0.1, repeatRate: 0,
    audience: { gender: 'female', ageMin: 30, ageMax: 60 }, platformFit: { fadbook: 0.65, tiktak: 0.45 },
    bestFormats: ['slideshow', 'ugc_testimonial'],
    bestHooks: ['life_hack', 'problem_callout'],
    bestAngles: ['savings', 'convenience'],
    seasonality: [1, 1, 1, 1, 1.05, 1.05, 1.05, 1, 1, 1, 0.95, 1],
    trend: EVERGREEN, startCompetitors: 6, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 150,
    keywords: ['fresh herbs', 'less waste', 'save money', 'fridge', 'weeks', 'longer lasting', 'organized', 'meal prep', 'crisp', 'BPA-free'],
    objections: ['Will it fit in my fridge door?', 'Does it really keep herbs fresh longer?', 'Is it easy to clean?', 'How long do herbs actually last in it?'],
    publicSignals: { ordersBase: 1500, rating: 4.6, reviews: 700, supplierYears: 5, choice: false },
    releaseDay: 33, brandable: 0.2,
  },

  // ==========================================================================
  // WELLNESS & FITNESS
  // ==========================================================================
  'posture-corrector': {
    supplierTitle: 'Posture Corrector For Men Women Adjustable Upper Back Brace Clavicle Support Shoulder Straightener Invisible Hunchback Correction Belt',
    supplierDescription: d(`
      Product: Adjustable Posture Corrector
      Material: Neoprene + Nylon + Breathable Mesh
      Size: S / M / L / XL (chest 70-125cm)
      Feature:
      1. Pull shoulder back gently, train muscle memory for correct posture.
      2. Relieve neck, shoulder and upper back pain from sitting long time at computer.
      3. Invisible under clothes, lightweight and breathable.
      4. Adjustable velcro, fit man and woman.
      Suggest: Wear 30 min first day, then add time slowly, max 3 hours per day.
      Package: 1*posture corrector`),
    specs: { Material: 'Neoprene, nylon, breathable mesh', Sizes: 'S–XL (chest 70–125 cm)', Closure: 'Adjustable hook & loop', Origin: 'Mainland China' },
    variants: [{ name: 'Size', values: ['S', 'M', 'L', 'XL'] }, { name: 'Color', values: ['Black', 'Beige'] }],
    cogs: 3.4, shipCost: 1.9, shipDays: CHOICE, weightKg: 0.15, moq: 500,
    perceivedValue: 24.99, amazonPrice: 21.99,
    baseDemand: 0.84, wow: 0.55, problemSolving: 0.85, impulse: 0.75, giftable: 0.1, repeatRate: 0,
    audience: { gender: 'all', ageMin: 25, ageMax: 55 }, platformFit: { fadbook: 0.9, tiktak: 0.75 },
    bestFormats: ['ugc_testimonial', 'before_after_video', 'demo_video'],
    bestHooks: ['problem_callout', 'before_after', 'shock_stat'],
    bestAngles: ['pain_point', 'health', 'self_care'],
    seasonality: [1.25, 1.1, 1, 1, 0.95, 0.9, 0.9, 0.95, 1.1, 1.05, 0.95, 0.9],
    trend: EVERGREEN, startCompetitors: 25, defectRate: 0.05, claimRisk: 0.3, scaleCeiling: 3200,
    keywords: ['desk posture', 'back pain', 'neck pain', 'stand taller', 'confidence', 'invisible under clothes', 'breathable', 'adjustable', 'muscle memory', 'minutes a day', 'comfortable', 'work from home'],
    objections: ['Is it uncomfortable to wear?', 'Can people see it under my shirt?', 'Which size do I need?', 'How long until my posture improves?', 'Will it make my muscles weaker?'],
    publicSignals: { ordersBase: 7200, rating: 4.6, reviews: 12000, supplierYears: 7, choice: true },
    releaseDay: 30, brandable: 0.6,
  },
  'neck-massager': {
    supplierTitle: 'Cordless Shiatsu Neck and Back Massager With Heat Deep Tissue Kneading Shoulder Massage Pillow Electric Rechargeable Muscle Pain Relief',
    supplierDescription: d(`
      Product: Cordless Shiatsu Neck Massager
      Nodes: 8 deep kneading 3D rotating nodes
      Heat: 40-45°C infrared heat, can turn off
      Battery: 2500mAh rechargeable, 90 min use
      Mode: 3 speed, bi-direction auto change every 1 min, 15 min auto off
      Use for: Neck, shoulder, back, waist, leg. Home, office, car.
      Package: 1*Massager, 1*Charger (US plug), 1*Manual, gift box`),
    specs: { Nodes: '8 rotating 3D nodes', Heat: '40–45 °C, switchable', Battery: '2500 mAh, ~90 min', 'Auto-off': '15 min', Charger: 'US plug', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Grey', 'Black'] }],
    cogs: 16.8, shipCost: 4.6, shipDays: STD, weightKg: 1.1, moq: 200, bulkRatio: 0.66, privateLabelMoq: 500,
    perceivedValue: 109.99, amazonPrice: 89.99,
    baseDemand: 0.78, wow: 0.7, problemSolving: 0.85, impulse: 0.3, giftable: 0.75, repeatRate: 0,
    audience: { gender: 'all', ageMin: 30, ageMax: 65 }, platformFit: { fadbook: 0.95, tiktak: 0.6 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'founder_story'],
    bestHooks: ['testimonial', 'problem_callout', 'gift_idea'],
    bestAngles: ['pain_point', 'self_care', 'gift'],
    seasonality: [0.95, 1, 0.95, 0.95, 1.15, 1.1, 0.9, 0.9, 0.95, 1, 1.25, 1.5],
    trend: EVERGREEN, startCompetitors: 11, defectRate: 0.06, claimRisk: 0.3, scaleCeiling: 3500,
    keywords: ['deep tissue', 'soothing heat', 'cordless', 'knots', 'tension', 'at home', 'office', 'relief', 'massage therapist feel', 'perfect gift', 'rechargeable', 'unwind'],
    objections: ['Is it too strong or too weak?', 'Does the heat get too hot?', 'How long does the battery last?', 'Is it cordless?', 'Is there a warranty?', 'Can I use it on my lower back?'],
    publicSignals: { ordersBase: 1500, rating: 4.7, reviews: 980, supplierYears: 6, choice: false },
    releaseDay: 0, brandable: 0.75,
  },
  'mini-massage-gun': {
    supplierTitle: 'Mini Massage Gun Deep Tissue Percussion Muscle Massager Portable Fascial Gun 4 Heads 6 Speeds Quiet Pocket Size Body Relaxation',
    supplierDescription: d(`
      Name: Mini Fascial Massage Gun
      Speed: 6 gear 1800-3200 RPM
      Battery: 2000mAh Type-C, 6 hours
      Noise: <45dB
      Heads: 4 (ball, flat, bullet, fork)
      Weight: 380g pocket size
      Package: 1*gun, 4*heads, 1*cable, 1*bag`),
    specs: { Speeds: '6 (1800–3200 RPM)', Battery: '2000 mAh USB-C', Noise: '< 45 dB', Heads: '4', Weight: '380 g', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Matte Black', 'White', 'Pink'] }],
    cogs: 9.8, shipCost: 3.2, shipDays: CHOICE, weightKg: 0.6, moq: 300,
    perceivedValue: 44.99, amazonPrice: 34.99,
    baseDemand: 0.72, wow: 0.55, problemSolving: 0.65, impulse: 0.5, giftable: 0.6, repeatRate: 0,
    audience: { gender: 'all', ageMin: 18, ageMax: 45 }, platformFit: { fadbook: 0.75, tiktak: 0.8 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'asmr_unboxing'],
    bestHooks: ['asmr', 'pov', 'testimonial'],
    bestAngles: ['pain_point', 'self_care', 'gift'],
    seasonality: [1.15, 1, 1, 1, 1, 0.95, 0.9, 0.95, 1, 1, 1.2, 1.3],
    trend: declining(500, 1400), startCompetitors: 82, defectRate: 0.06, claimRisk: 0.2, scaleCeiling: 800,
    keywords: ['sore muscles', 'recovery', 'pocket size', 'quiet', 'deep tissue', 'gym bag', 'rechargeable', 'relief', 'six speeds', 'lightweight'],
    objections: ['Is it powerful enough for deep tissue?', 'How loud is it?', 'How long does the battery last?', 'Is it better than a full-size gun?'],
    publicSignals: { ordersBase: 9800, rating: 4.6, reviews: 16000, supplierYears: 6, choice: true },
    releaseDay: 0, brandable: 0.55,
  },
  'smart-jump-rope': {
    supplierTitle: 'Smart Jump Rope With Digital Counter Calorie Counting Skipping Rope Cordless Weighted Ball Fitness Training Adjustable Speed Rope',
    supplierDescription: d(`
      Product: Smart Counting Jump Rope
      Display: LCD show count, time, calorie
      Rope: 2.8m adjustable PVC steel wire + 2 cordless weighted ball
      Battery: CR2032 (include)
      Feature: Can use with rope or cordless for small room, low ceiling.
      Package: 1*Rope, 2*Cordless balls, 1*Manual`),
    specs: { Display: 'LCD count / time / kcal', Rope: '2.8 m adjustable steel core', Modes: 'Rope or cordless', Battery: 'CR2032 included', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Black/Orange', 'Pink', 'Blue'] }],
    cogs: 5.9, shipCost: 2.5, shipDays: CHOICE, weightKg: 0.35, moq: 500,
    perceivedValue: 24.99, amazonPrice: 21.99,
    baseDemand: 0.6, wow: 0.45, problemSolving: 0.5, impulse: 0.6, giftable: 0.3, repeatRate: 0,
    audience: { gender: 'all', ageMin: 18, ageMax: 40 }, platformFit: { fadbook: 0.6, tiktak: 0.8 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'green_screen'],
    bestHooks: ['pov', 'shock_stat', 'question'],
    bestAngles: ['health', 'time_saving', 'aspirational'],
    seasonality: [1.5, 1.2, 1.1, 1.1, 1.1, 1, 0.85, 0.85, 0.95, 0.9, 0.85, 0.95],
    trend: EVERGREEN, startCompetitors: 14, defectRate: 0.06, claimRisk: 0.15, scaleCeiling: 650,
    keywords: ['calorie counter', '10-minute workout', 'cordless mode', 'small spaces', 'cardio', 'track progress', 'adjustable', 'home workout', 'burn calories', 'beginner-friendly'],
    objections: ['Is the counter accurate?', 'Can I use it in an apartment with low ceilings?', 'Is it good for beginners?', 'Is the rope length adjustable?'],
    publicSignals: { ordersBase: 2800, rating: 4.5, reviews: 1600, supplierYears: 5, choice: true },
    releaseDay: 56, brandable: 0.45,
  },
  'ab-roller': {
    supplierTitle: 'Automatic Rebound Ab Roller Wheel With Elbow Support Timer Abdominal Core Trainer Home Gym Exercise Equipment Plank Fitness Wheel',
    supplierDescription: d(`
      Product: Auto Rebound Ab Wheel
      Material: ABS + TPR non-slip wheel + EVA pad
      Feature:
      1. Built-in rebound spring help you return, protect waist, suitable for beginner.
      2. Elbow support design, reduce pressure on wrist and arm.
      3. Smart timer and counter.
      4. Quiet wheel, not damage floor.
      Load: 150kg
      Package: 1*ab roller, 1*knee pad, 1*manual`),
    specs: { Material: 'ABS, TPR wheels, EVA pads', 'Max Load': '150 kg', Features: 'Spring rebound, elbow support, timer', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Black', 'Pink', 'Blue'] }],
    cogs: 7.6, shipCost: 3.9, shipDays: STD, weightKg: 1, moq: 300,
    perceivedValue: 44.99, amazonPrice: 36.99,
    baseDemand: 0.85, wow: 0.6, problemSolving: 0.6, impulse: 0.55, giftable: 0.15, repeatRate: 0,
    audience: { gender: 'all', ageMin: 18, ageMax: 45 }, platformFit: { fadbook: 0.75, tiktak: 0.85 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'before_after_video'],
    bestHooks: ['before_after', 'pov', 'shock_stat'],
    bestAngles: ['health', 'aspirational', 'time_saving'],
    seasonality: [2, 1.5, 1.1, 1, 0.9, 0.7, 0.4, 0.38, 0.45, 0.4, 0.45, 0.95],
    trend: EVERGREEN, startCompetitors: 16, defectRate: 0.05, claimRisk: 0.25, scaleCeiling: 2200,
    keywords: ['core strength', 'beginner-friendly', 'protects your back', 'elbow support', 'home workout', 'minutes a day', 'timer', 'toned', 'no gym', 'stronger core'],
    objections: ['Is it safe for my lower back?', 'Is it good for beginners?', 'Will it scratch my floor?', 'How fast will I see results?'],
    publicSignals: { ordersBase: 4400, rating: 4.6, reviews: 3100, supplierYears: 5, choice: false },
    releaseDay: 150, brandable: 0.5,
  },
  'resistance-bands': {
    supplierTitle: 'Resistance Bands Set Fabric Booty Bands Hip Glute Loop Exercise Elastic Band Yoga Squat Fitness Workout Anti-Slip 3 5 Levels',
    supplierDescription: d(`
      Name: Fabric Resistance Band Set
      Material: Polyester cotton + latex silk
      Level: Light / Medium / Heavy / X-Heavy / XX-Heavy
      Size: 33cm / 36cm / 38cm
      Feature: Non slip, not roll up, not pinch skin.
      Package: 5 bands + 1 mesh bag`),
    specs: { Material: 'Polyester-cotton, latex thread', Levels: '5', Lengths: '33 / 36 / 38 cm', Origin: 'Mainland China' },
    variants: [{ name: 'Set', values: ['3 Bands', '5 Bands'] }],
    cogs: 4.1, shipCost: 2.6, shipDays: CHOICE, weightKg: 0.35, moq: 500,
    perceivedValue: 14.99, amazonPrice: 11.99,
    baseDemand: 0.35, wow: 0.25, problemSolving: 0.4, impulse: 0.6, giftable: 0.15, repeatRate: 0,
    audience: { gender: 'female', ageMin: 18, ageMax: 45 }, platformFit: { fadbook: 0.6, tiktak: 0.65 },
    bestFormats: ['ugc_testimonial', 'demo_video'],
    bestHooks: ['pov', 'question'],
    bestAngles: ['health', 'savings'],
    seasonality: [1.4, 1.15, 1.05, 1.05, 1.05, 1, 0.9, 0.9, 0.95, 0.9, 0.85, 0.9],
    trend: EVERGREEN, startCompetitors: 35, defectRate: 0.04, claimRisk: 0.1, scaleCeiling: 150,
    keywords: ['non-slip', 'home workout', 'glutes', 'no rolling', 'portable', 'five levels', 'booty', 'squats', 'travel', 'durable'],
    objections: ['Do they roll up during squats?', 'Which level should I start with?', 'Do they lose stretch over time?', 'Are they strong enough for experienced lifters?'],
    publicSignals: { ordersBase: 11000, rating: 4.7, reviews: 8800, supplierYears: 9, choice: true },
    releaseDay: 0, brandable: 0.35,
  },
  'acupressure-mat': {
    supplierTitle: 'Acupressure Mat and Pillow Set Back Neck Pain Relief Massage Mat Spike Lotus Yoga Mat Muscle Relaxation Stress Relief Natural Cotton',
    supplierDescription: d(`
      Product: Acupressure Mat & Pillow Set
      Size: Mat 67*42cm, Pillow 37*16cm
      Material: Cotton linen cover + coconut fiber filling + ABS lotus spikes (6210 points)
      Use: Lie on mat 10-20 minute before sleep, start with shirt on.
      Effect: Relax muscle, promote blood circulation, better sleep, relieve stress.
      Package: 1*mat, 1*pillow, 1*carry bag`),
    specs: { 'Mat Size': '67 x 42 cm', 'Pillow Size': '37 x 16 cm', 'Pressure Points': '6,210', Filling: 'Coconut fiber', Cover: 'Cotton-linen, removable', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Teal', 'Purple', 'Grey'] }],
    cogs: 8.2, shipCost: 4, shipDays: STD, weightKg: 0.9, moq: 300,
    perceivedValue: 42.99, amazonPrice: 32.99,
    baseDemand: 0.58, wow: 0.4, problemSolving: 0.65, impulse: 0.4, giftable: 0.35, repeatRate: 0,
    audience: { gender: 'female', ageMin: 25, ageMax: 60 }, platformFit: { fadbook: 0.85, tiktak: 0.55 },
    bestFormats: ['ugc_testimonial', 'founder_story', 'demo_video'],
    bestHooks: ['testimonial', 'question', 'shock_stat'],
    bestAngles: ['self_care', 'pain_point', 'health'],
    seasonality: [1.15, 1.05, 1, 1, 1, 0.95, 0.9, 0.9, 1, 1, 1.05, 1.1],
    trend: EVERGREEN, startCompetitors: 13, defectRate: 0.04, claimRisk: 0.35, scaleCeiling: 650,
    keywords: ['unwind', 'tension relief', 'better sleep', '20 minutes', 'natural', 'coconut fiber', 'at-home spa', 'stress', 'calm', 'relax'],
    objections: ['Does it hurt?', 'How long should I lie on it?', 'Can I wash the cover?', 'Does it actually help back pain?'],
    publicSignals: { ordersBase: 1900, rating: 4.6, reviews: 1300, supplierYears: 6, choice: false },
    releaseDay: 63, brandable: 0.55,
  },
  'mouth-tape': {
    supplierTitle: 'Mouth Tape For Sleeping 90pcs Anti Snoring Strips Nose Breathing Improve Sleep Quality Gentle Adhesive Sleep Strips Mouth Breathing Stop',
    supplierDescription: d(`
      Product: Sleep Mouth Tape
      Quantity: 90 strips / box (3 month)
      Material: Medical grade PU film + hypoallergenic adhesive, breathable center hole
      Use: Clean and dry lips, apply strip over mouth before sleep, peel off in morning.
      Benefit: Train nose breathing, reduce snoring, wake up without dry mouth.
      Warning: Not for children, people with nose blocked or breathing disease.
      Package: 90pcs strips in box`),
    specs: { Quantity: '90 strips', Material: 'Medical-grade PU film, hypoallergenic adhesive', Design: 'X-shape with breathing vent', Origin: 'Mainland China' },
    variants: [{ name: 'Pack', values: ['90 strips', '180 strips'] }],
    cogs: 2.7, shipCost: 1.3, shipDays: CHOICE, weightKg: 0.06, moq: 500,
    perceivedValue: 19.99, amazonPrice: 17.99,
    baseDemand: 0.84, wow: 0.55, problemSolving: 0.7, impulse: 0.8, giftable: 0.05, repeatRate: 0.35,
    audience: { gender: 'all', ageMin: 25, ageMax: 55 }, platformFit: { fadbook: 0.75, tiktak: 0.9 },
    bestFormats: ['ugc_testimonial', 'green_screen', 'skit'],
    bestHooks: ['question', 'shock_stat', 'controversial'],
    bestAngles: ['health', 'curiosity', 'self_care'],
    seasonality: [1.1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    trend: rising(60, 150, 180), startCompetitors: 2, defectRate: 0.03, claimRisk: 0.4, scaleCeiling: 2400,
    keywords: ['nose breathing', 'wake up rested', 'no dry mouth', 'quieter nights', 'gentle', 'hypoallergenic', '90 nights', 'better sleep', 'partner will thank you', 'snoring'],
    objections: ['Is it safe? What if I can not breathe?', 'Does it hurt to peel off?', 'Will it irritate my skin?', 'Does it really stop snoring?'],
    publicSignals: { ordersBase: 2600, rating: 4.6, reviews: 900, supplierYears: 2, choice: true },
    releaseDay: 45, brandable: 0.75,
  },
  'sunrise-alarm': {
    supplierTitle: 'Sunrise Alarm Clock Wake Up Light Simulation Sunset Bedside Lamp 7 Colors Natural Sounds FM Radio Snooze Kids Adults Heavy Sleepers',
    supplierDescription: d(`
      Product: Wake Up Light Sunrise Alarm Clock
      Light: 20 level brightness, 7 color atmosphere
      Sunrise: Light gradually bright 10/20/30 min before alarm
      Sound: 7 natural sound + FM radio
      Power: USB 5V (adapter include, US plug)
      Other: Dual alarm, snooze, sunset mode for fall asleep, night light.
      Package: 1*clock, 1*adapter, 1*manual`),
    specs: { Brightness: '20 levels', 'Sunrise Window': '10 / 20 / 30 min', Sounds: '7 nature sounds + FM', Alarms: 'Dual with snooze', Power: 'USB 5V, US adapter', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['White', 'Wood Grain'] }],
    cogs: 9.8, shipCost: 3.5, shipDays: STD, weightKg: 0.6, moq: 300,
    perceivedValue: 54.99, amazonPrice: 44.99,
    baseDemand: 0.85, wow: 0.55, problemSolving: 0.75, impulse: 0.4, giftable: 0.55, repeatRate: 0,
    audience: { gender: 'all', ageMin: 20, ageMax: 50 }, platformFit: { fadbook: 0.85, tiktak: 0.7 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'skit'],
    bestHooks: ['problem_callout', 'pov', 'question'],
    bestAngles: ['self_care', 'health', 'pain_point'],
    seasonality: [1.8, 1.4, 0.9, 0.5, 0.35, 0.3, 0.3, 0.4, 0.8, 1.4, 1.75, 1.85],
    trend: EVERGREEN, startCompetitors: 9, defectRate: 0.05, claimRisk: 0.2, scaleCeiling: 2000,
    keywords: ['wake up naturally', 'no jarring alarm', 'dark mornings', 'gentle light', 'sunset mode', 'better mornings', 'nature sounds', 'heavy sleepers', 'energized', 'sleep better'],
    objections: ['Is it bright enough to wake me up?', 'Does it have a backup sound alarm?', 'Can I dim the display at night?', 'Does it work for heavy sleepers?'],
    publicSignals: { ordersBase: 2700, rating: 4.5, reviews: 1900, supplierYears: 5, choice: false },
    releaseDay: 140, brandable: 0.65,
  },
  'weighted-eye-mask': {
    supplierTitle: 'Weighted Eye Mask For Sleeping 3D Contoured Blackout Sleep Mask Soft Silk Blindfold Pressure Relief Hot Cold Therapy Travel Nap',
    supplierDescription: d(`
      Product: Weighted Sleep Eye Mask
      Weight: 200g glass bead filling
      Material: Ice silk + memory foam
      Feature:
      1. 3D contour, no pressure on eyes, 100% blackout.
      2. Gentle weight relax you, help fall asleep faster.
      3. Adjustable strap, suitable side sleeper.
      4. Can put in fridge for cold or microwave for warm.
      Package: 1*eye mask, 1*storage bag`),
    specs: { Weight: '200 g glass beads', Material: 'Ice silk, memory foam', Strap: 'Adjustable', Therapy: 'Chill or warm', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Dusty Pink', 'Grey', 'Black', 'Lavender'] }],
    cogs: 4.4, shipCost: 1.9, shipDays: CHOICE, weightKg: 0.25, moq: 500,
    perceivedValue: 24.99, amazonPrice: 22.99,
    baseDemand: 0.58, wow: 0.35, problemSolving: 0.6, impulse: 0.6, giftable: 0.5, repeatRate: 0,
    audience: { gender: 'female', ageMin: 22, ageMax: 50 }, platformFit: { fadbook: 0.8, tiktak: 0.7 },
    bestFormats: ['ugc_testimonial', 'asmr_unboxing', 'slideshow'],
    bestHooks: ['pov', 'testimonial', 'question'],
    bestAngles: ['self_care', 'health', 'gift'],
    seasonality: [1.05, 1, 1, 0.95, 0.95, 0.95, 0.95, 0.95, 1, 1, 1.05, 1.2],
    trend: EVERGREEN, startCompetitors: 11, defectRate: 0.04, claimRisk: 0.2, scaleCeiling: 600,
    keywords: ['fall asleep faster', 'blackout', 'gentle pressure', 'calming', 'side sleepers', 'travel', 'naps', 'soft', 'self-care', 'relaxing'],
    objections: ['Is it too heavy on the eyes?', 'Does it stay on if I move?', 'Can I wash it?', 'Does it block all light?'],
    publicSignals: { ordersBase: 2100, rating: 4.7, reviews: 1500, supplierYears: 4, choice: true },
    releaseDay: 70, brandable: 0.65,
  },
  'red-light-wand': {
    supplierTitle: 'Red Light Therapy Wand Face Skin Care Device Microcurrent Facial Massager Anti Aging Wrinkle Eye Lifting Tightening Beauty Tool Portable',
    supplierDescription: d(`
      Product: Red Light Therapy Facial Wand
      Light: 630nm red + 830nm near infrared
      Function: Red light + microcurrent + 42°C warm + vibration 6000/min
      Battery: 500mAh Type-C, 30 days use (10 min daily)
      Effect: Firm skin, reduce fine line, brighten, depuff eye.
      Material: ABS + zinc alloy head
      Package: 1*wand, 1*cable, 1*manual, gift box`),
    specs: { Light: '630 nm red + 830 nm NIR', Modes: 'Red light, microcurrent, warmth, sonic vibration', Battery: '500 mAh USB-C', Timer: '10 min', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['White', 'Rose Gold'] }],
    cogs: 10.9, shipCost: 2.6, shipDays: STD, weightKg: 0.3, moq: 300, bulkRatio: 0.64,
    perceivedValue: 69.99, amazonPrice: 59.99,
    baseDemand: 0.82, wow: 0.75, problemSolving: 0.55, impulse: 0.4, giftable: 0.55, repeatRate: 0,
    audience: { gender: 'female', ageMin: 25, ageMax: 55 }, platformFit: { fadbook: 0.85, tiktak: 0.85 },
    bestFormats: ['ugc_testimonial', 'before_after_video', 'demo_video'],
    bestHooks: ['testimonial', 'before_after', 'shock_stat'],
    bestAngles: ['self_care', 'savings', 'aspirational'],
    seasonality: [1.05, 1, 1, 1, 1.1, 1, 0.9, 0.9, 0.95, 1, 1.15, 1.3],
    trend: rising(110, 190, 220), startCompetitors: 3, defectRate: 0.05, claimRisk: 0.5, scaleCeiling: 2600,
    keywords: ['glow', 'firmer skin', 'fine lines', 'at-home facial', 'red light', 'gentle warmth', '10 minutes', 'rechargeable', 'travel-size', 'self-care ritual', 'depuff'],
    objections: ['Does red light therapy really work?', 'Is it safe around my eyes?', 'How long until I see results?', 'How is it different from the $200 wands?', 'Can I use it with my serums?'],
    publicSignals: { ordersBase: 1400, rating: 4.6, reviews: 380, supplierYears: 3, choice: false },
    releaseDay: 95, brandable: 0.8,
  },

  // ==========================================================================
  // CAR
  // ==========================================================================
  'magnetic-phone-mount': {
    supplierTitle: 'Magnetic Car Phone Holder Air Vent Mount Strong Magnet 360 Rotation Universal Mobile Phone Stand For All Smartphones Car Accessories',
    supplierDescription: d(`
      Name: Magnetic Car Phone Mount
      Material: Aluminum alloy + N52 magnet
      Install: Air vent clip
      Include: 1 holder + 2 metal plates + 2 protective film
      Rotation: 360 degree
      Package: As above`),
    specs: { Material: 'Aluminum alloy, N52 magnet', Mount: 'Air vent clip', Rotation: '360°', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Black', 'Silver'] }],
    cogs: 1.7, shipCost: 1.4, shipDays: CHOICE, weightKg: 0.08, moq: 500,
    perceivedValue: 8.99, amazonPrice: 7.99,
    baseDemand: 0.3, wow: 0.2, problemSolving: 0.45, impulse: 0.7, giftable: 0.1, repeatRate: 0,
    audience: { gender: 'male', ageMin: 18, ageMax: 55 }, platformFit: { fadbook: 0.55, tiktak: 0.5 },
    bestFormats: ['demo_video', 'static_image'],
    bestHooks: ['life_hack', 'problem_callout'],
    bestAngles: ['convenience', 'time_saving'],
    seasonality: [1, 1, 1, 1, 1, 1.05, 1.05, 1, 1, 1, 1, 1.05],
    trend: EVERGREEN, startCompetitors: 40, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 150,
    keywords: ['one-hand', 'strong magnet', 'hands-free', 'navigation', 'universal', 'secure grip', 'one second', 'safe driving', 'sleek', '360° rotation'],
    objections: ['Does the magnet hurt my phone?', 'Will it hold a heavy phone on bumpy roads?', 'Does it fit my vents?', 'Will it interfere with wireless charging?'],
    publicSignals: { ordersBase: 16000, rating: 4.7, reviews: 22000, supplierYears: 9, choice: true },
    releaseDay: 0, brandable: 0.2,
  },
  'seat-gap-filler': {
    supplierTitle: 'Car Seat Gap Filler Organizer 2 Pack PU Leather Console Side Pocket Storage Box Universal Seat Crevice Catcher Phone Holder Stop Drop',
    supplierDescription: d(`
      Product: Car Seat Gap Filler (2pcs)
      Material: PU leather + high density sponge
      Size: 48*6*3cm
      Feature:
      1. Fill the gap between seat and console, stop phone, keys, coins, fries drop down.
      2. Small pocket for store card and cable.
      3. Universal fit, no install, just push in.
      Package: 2*gap filler`),
    specs: { Material: 'PU leather, high-density foam', Size: '48 x 6 x 3 cm', Fit: 'Universal, push-in', Pack: '2 pieces', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Black', 'Beige', 'Red Stitch'] }],
    cogs: 4.9, shipCost: 2.8, shipDays: CHOICE, weightKg: 0.5, moq: 500,
    perceivedValue: 26.99, amazonPrice: 24.99,
    baseDemand: 0.62, wow: 0.45, problemSolving: 0.75, impulse: 0.75, giftable: 0.3, repeatRate: 0,
    audience: { gender: 'all', ageMin: 20, ageMax: 55 }, platformFit: { fadbook: 0.8, tiktak: 0.75 },
    bestFormats: ['demo_video', 'skit', 'ugc_testimonial'],
    bestHooks: ['problem_callout', 'pov', 'life_hack'],
    bestAngles: ['pain_point', 'convenience'],
    seasonality: [1, 0.95, 0.95, 1, 1, 1.05, 1.05, 1, 0.95, 1, 1.05, 1.15],
    trend: EVERGREEN, startCompetitors: 17, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 650,
    keywords: ['no more dropped phones', 'safer driving', 'universal fit', 'no install', 'extra storage', 'clean car', 'stocking stuffer', 'keys', 'fries', 'custom look'],
    objections: ['Will it fit my car?', 'Does it block the seat belt buckle?', 'Does it move when I adjust my seat?', 'Does it look cheap?'],
    publicSignals: { ordersBase: 3300, rating: 4.5, reviews: 2300, supplierYears: 5, choice: true },
    releaseDay: 80, brandable: 0.4,
  },
  'car-vacuum': {
    supplierTitle: 'Cordless Handheld Car Vacuum Cleaner High Power 9000Pa Portable Mini Vacuum Wireless Rechargeable Wet Dry Auto Interior Cleaning',
    supplierDescription: d(`
      Name: Cordless Car Vacuum
      Suction: 9000Pa
      Power: 120W
      Battery: 2200mAh, 25-30 minute
      Filter: Washable HEPA
      Attachment: Crevice nozzle, brush nozzle, extension hose
      Use: Car seat, carpet, keyboard, pet hair, sofa. Wet and dry.
      Package: 1*vacuum, 3*nozzles, 1*USB cable, 1*bag`),
    specs: { Suction: '9,000 Pa', Power: '120 W', Battery: '2200 mAh, 25–30 min', Filter: 'Washable HEPA', Attachments: '3 nozzles + hose', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Black', 'White'] }],
    cogs: 11.4, shipCost: 4.2, shipDays: STD, weightKg: 0.9, moq: 300,
    perceivedValue: 49.99, amazonPrice: 39.99,
    baseDemand: 0.6, wow: 0.55, problemSolving: 0.7, impulse: 0.45, giftable: 0.35, repeatRate: 0,
    audience: { gender: 'all', ageMin: 22, ageMax: 55 }, platformFit: { fadbook: 0.8, tiktak: 0.7 },
    bestFormats: ['before_after_video', 'demo_video', 'ugc_testimonial'],
    bestHooks: ['before_after', 'asmr', 'pov'],
    bestAngles: ['convenience', 'time_saving'],
    seasonality: [1, 0.95, 1.05, 1.05, 1, 1, 1, 1, 0.95, 1, 1.1, 1.2],
    trend: EVERGREEN, startCompetitors: 26, defectRate: 0.07, claimRisk: 0.02, scaleCeiling: 700,
    keywords: ['cordless', 'strong suction', 'crumbs', 'pet hair', 'tight spaces', 'rechargeable', 'washable filter', 'detailing', 'clean car', 'lightweight'],
    objections: ['Is the suction actually strong?', 'How long does the battery last?', 'Is the filter easy to clean?', 'Does it pick up pet hair?'],
    publicSignals: { ordersBase: 3600, rating: 4.5, reviews: 2800, supplierYears: 6, choice: false },
    releaseDay: 92, brandable: 0.5,
  },
  'jump-starter': {
    supplierTitle: 'Car Jump Starter Power Bank 2000A Peak 12V Portable Battery Booster Emergency Starting Device LED Light Auto Battery Charger Jumper',
    supplierDescription: d(`
      Product: Portable Car Jump Starter
      Peak Current: 2000A (up to 7.0L gas / 5.5L diesel)
      Capacity: 16000mAh
      Output: USB 5V/2.1A, Type-C
      Protection: Reverse polarity, short circuit, over current, over charge
      Extra: LED flashlight with SOS mode
      Working Temp: -20°C ~ 60°C
      Package: 1*jump starter, 1*smart clamp, 1*USB-C cable, 1*storage case
      Note: Lithium battery product, ship by special line.`),
    specs: { 'Peak Current': '2000 A', Capacity: '16,000 mAh', Engines: 'Up to 7.0L gas / 5.5L diesel', Protection: '8 safety protections', Extras: 'Power bank, LED/SOS light', Origin: 'Mainland China' },
    variants: [{ name: 'Model', values: ['2000A', '2500A'] }],
    cogs: 19.8, shipCost: 6.2, shipDays: STD_SLOW, weightKg: 0.8, moq: 200, bulkRatio: 0.7,
    perceivedValue: 99.99, amazonPrice: 89.99,
    baseDemand: 0.85, wow: 0.6, problemSolving: 0.9, impulse: 0.35, giftable: 0.55, repeatRate: 0,
    audience: { gender: 'all', ageMin: 20, ageMax: 60 }, platformFit: { fadbook: 0.9, tiktak: 0.6 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'skit'],
    bestHooks: ['problem_callout', 'shock_stat', 'gift_idea'],
    bestAngles: ['pain_point', 'savings', 'gift'],
    seasonality: [1.9, 1.5, 0.9, 0.5, 0.4, 0.4, 0.45, 0.45, 0.6, 1, 1.5, 1.85],
    trend: EVERGREEN, startCompetitors: 10, defectRate: 0.06, claimRisk: 0.05, scaleCeiling: 2200,
    keywords: ['never stranded', 'no second car', 'no cables', 'safe clamps', 'power bank', 'cold mornings', 'peace of mind', 'glovebox size', 'gift for new drivers', 'emergency'],
    objections: ['Will it start my truck/V8?', 'Is it safe if I connect it wrong?', 'How long does it hold a charge?', 'Does it work in freezing weather?', 'Can I take it on a plane?'],
    publicSignals: { ordersBase: 2400, rating: 4.6, reviews: 1800, supplierYears: 7, choice: false },
    releaseDay: 160, brandable: 0.6,
  },

  // ==========================================================================
  // GADGETS
  // ==========================================================================
  'magsafe-charger-stand': {
    supplierTitle: '3 In 1 Magnetic Wireless Charger Stand Foldable 15W Fast Charging Station For Phone Watch Earbuds Travel Charger Dock Desk Holder',
    supplierDescription: d(`
      Product: 3 in 1 Foldable Magnetic Wireless Charger
      Output: Phone 15W / Watch 3W / Earbuds 5W
      Input: Type-C PD 20W (adapter need 20W or above, not include)
      Feature:
      1. Strong magnet auto align, charge 3 device same time.
      2. Foldable design, pocket size for travel.
      3. Temperature control, over voltage protection.
      Package: 1*charger, 1*Type-C cable, 1*manual`),
    specs: { Output: 'Phone 15 W, watch 3 W, earbuds 5 W', Input: 'USB-C PD 20 W (adapter not included)', Design: 'Foldable', Safety: 'Temperature control, over-voltage protection', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['White', 'Black'] }],
    cogs: 7.2, shipCost: 2.6, shipDays: CHOICE, weightKg: 0.35, moq: 300,
    perceivedValue: 34.99, amazonPrice: 27.99,
    baseDemand: 0.72, wow: 0.55, problemSolving: 0.55, impulse: 0.55, giftable: 0.6, repeatRate: 0,
    audience: { gender: 'all', ageMin: 18, ageMax: 40 }, platformFit: { fadbook: 0.7, tiktak: 0.8 },
    bestFormats: ['demo_video', 'asmr_unboxing', 'static_image'],
    bestHooks: ['asmr', 'pov', 'life_hack'],
    bestAngles: ['convenience', 'aspirational', 'gift'],
    seasonality: [0.95, 0.95, 0.95, 0.95, 1, 1, 0.95, 1, 1, 1, 1.2, 1.3],
    trend: declining(600, 1000), startCompetitors: 78, defectRate: 0.07, claimRisk: 0.02, scaleCeiling: 800,
    keywords: ['one charger', 'declutter', 'foldable', 'travel', 'fast charging', 'magnetic snap', 'nightstand', 'three devices', 'sleek', 'gift'],
    objections: ['Does it need a special power adapter?', 'Does it work with thick cases?', 'Does it overheat?', 'Is it really 15W fast charging?'],
    publicSignals: { ordersBase: 12500, rating: 4.5, reviews: 17000, supplierYears: 6, choice: true },
    releaseDay: 5, brandable: 0.5,
  },
  'thermal-printer': {
    supplierTitle: 'Mini Pocket Thermal Printer Portable Sticker Photo Printer Bluetooth Inkless Label Maker Study Notes Journal DIY Kids Gift 57mm Paper',
    supplierDescription: d(`
      Product: Mini Thermal Printer
      Print Method: Thermal (no ink, no toner)
      Paper Width: 57mm (normal / sticker / transparent / color paper)
      Resolution: 203 DPI
      Connect: Bluetooth 5.0, free APP (phone and tablet)
      Battery: 1200mAh, print 10 roll per charge
      Use for: study notes, photo, journal, to-do list, label, wrong question.
      Package: 1*printer, 1*roll paper, 1*USB cable, 1*manual`),
    specs: { Method: 'Inkless thermal', Paper: '57 mm rolls (plain, sticker, clear)', Resolution: '203 DPI', Connectivity: 'Bluetooth 5.0 + app', Battery: '1200 mAh USB', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Pink', 'White', 'Mint', 'Lavender'] }, { name: 'Bundle', values: ['Printer', 'Printer + 6 Sticker Rolls'] }],
    cogs: 8.6, shipCost: 2.4, shipDays: CHOICE, weightKg: 0.3, moq: 300,
    perceivedValue: 49.99, amazonPrice: 39.99,
    baseDemand: 0.88, wow: 0.85, problemSolving: 0.35, impulse: 0.75, giftable: 0.8, repeatRate: 0.3,
    audience: { gender: 'female', ageMin: 14, ageMax: 30 }, platformFit: { fadbook: 0.55, tiktak: 0.95 },
    bestFormats: ['asmr_unboxing', 'ugc_testimonial', 'demo_video'],
    bestHooks: ['asmr', 'tiktak_made_me_buy', 'unboxing'],
    bestAngles: ['aspirational', 'gift', 'curiosity'],
    seasonality: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1, 1.25, 1.2, 1, 1.25, 1.5],
    trend: rising(-40, 70, 260), startCompetitors: 7, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 3200,
    keywords: ['no ink ever', 'stickers', 'study notes', 'journaling', 'cute', 'wireless', 'print from your phone', 'aesthetic', 'perfect gift', 'organize', 'pocket-size'],
    objections: ['Do I ever need ink?', 'Does the app work on my phone?', 'How long do prints last before fading?', 'Where do I buy more paper?', 'Can it print photos?'],
    publicSignals: { ordersBase: 3300, rating: 4.8, reviews: 2900, supplierYears: 4, choice: true },
    releaseDay: 88, brandable: 0.7,
  },
  'ring-light': {
    supplierTitle: '10 Inch Selfie Ring Light With Tripod Stand Phone Holder LED Circle Fill Light Dimmable Makeup Live Streaming Video Photography Lamp',
    supplierDescription: d(`
      Product: 10" LED Ring Light with Tripod
      Light: 120 LED beads, 3 color mode (warm / cool / natural), 10 level brightness
      Tripod: Adjustable 50-160cm
      Power: USB 5V
      Include: Ring light, tripod, phone holder, bluetooth remote shutter
      Use for: Live stream, makeup, TikTak video, selfie, vlog.
      Package: As picture`),
    specs: { Size: '10 inch', LEDs: '120', Modes: '3 color temps x 10 brightness', Tripod: '50–160 cm', Extras: 'Phone holder, Bluetooth shutter', Origin: 'Mainland China' },
    variants: [{ name: 'Size', values: ['10 inch', '12 inch'] }],
    cogs: 5.9, shipCost: 4.2, shipDays: CHOICE, weightKg: 1.2, moq: 300,
    perceivedValue: 32.99, amazonPrice: 22.99,
    baseDemand: 0.7, wow: 0.35, problemSolving: 0.45, impulse: 0.5, giftable: 0.35, repeatRate: 0,
    audience: { gender: 'female', ageMin: 16, ageMax: 35 }, platformFit: { fadbook: 0.55, tiktak: 0.8 },
    bestFormats: ['before_after_video', 'demo_video', 'ugc_testimonial'],
    bestHooks: ['before_after', 'pov', 'us_vs_them'],
    bestAngles: ['aspirational', 'convenience'],
    seasonality: [1, 0.95, 0.95, 0.95, 0.95, 0.95, 1, 1.05, 1, 1, 1.1, 1.15],
    trend: declining(400, 1800), startCompetitors: 90, defectRate: 0.07, claimRisk: 0.02, scaleCeiling: 500,
    keywords: ['flattering light', 'content creation', 'makeup', 'video calls', 'dimmable', 'tripod', 'remote shutter', 'selfies', 'streaming', 'even lighting'],
    objections: ['Is the tripod sturdy?', 'Is it bright enough?', 'Does it work with any phone?', 'Can I adjust the height and angle?'],
    publicSignals: { ordersBase: 15000, rating: 4.5, reviews: 38000, supplierYears: 7, choice: true },
    releaseDay: 0, brandable: 0.3,
  },
  'open-ear-buds': {
    supplierTitle: 'Open Ear Clip Earbuds Wireless Bluetooth 5.4 Headphones Bone Conduction Style Ear Cuff Sport Running Earphones Waterproof HiFi Stereo',
    supplierDescription: d(`
      Product: Open Ear Clip-on Earbuds
      Bluetooth: 5.4
      Battery: Earbud 6 hour + case 30 hour
      Waterproof: IPX5
      Feature:
      1. Clip on ear, not in ear canal, comfortable long time wear, no pain.
      2. Hear surround sound, safe for running and cycling.
      3. Directional audio, less sound leak.
      Package: 2*earbuds, 1*charging case, 1*Type-C cable`),
    specs: { Bluetooth: '5.4', Battery: '6 h (30 h with case)', Waterproof: 'IPX5', Fit: 'Ear-cuff clip, open ear', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Matte White', 'Black', 'Purple'] }],
    cogs: 11.2, shipCost: 2.4, shipDays: CHOICE, weightKg: 0.12, moq: 300,
    perceivedValue: 54.99, amazonPrice: 45.99,
    baseDemand: 0.62, wow: 0.5, problemSolving: 0.5, impulse: 0.4, giftable: 0.5, repeatRate: 0,
    audience: { gender: 'all', ageMin: 18, ageMax: 45 }, platformFit: { fadbook: 0.7, tiktak: 0.8 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'green_screen'],
    bestHooks: ['us_vs_them', 'problem_callout', 'pov'],
    bestAngles: ['convenience', 'health', 'aspirational'],
    seasonality: [1.05, 0.95, 1, 1.05, 1.05, 1, 0.95, 0.95, 1, 1, 1.15, 1.2],
    trend: EVERGREEN, startCompetitors: 21, defectRate: 0.07, claimRisk: 0.05, scaleCeiling: 750,
    keywords: ['all-day comfort', 'no ear pain', 'stay aware', 'running', 'secure fit', 'sweatproof', 'long battery', 'open-ear', 'clear calls', 'lightweight'],
    objections: ['Do they fall out when running?', 'Can people nearby hear my music?', 'How is the sound quality?', 'Do they work with glasses?'],
    publicSignals: { ordersBase: 3000, rating: 4.45, reviews: 1400, supplierYears: 3, choice: true },
    releaseDay: 100, brandable: 0.55,
  },
  'retro-earbuds': {
    supplierTitle: 'Transparent Wireless Earbuds Bluetooth 5.3 Clear Case Retro Cyberpunk TWS Headphones See Through Design Gaming Earphones Low Latency',
    supplierDescription: d(`
      Product: Transparent TWS Earbuds
      Bluetooth: 5.3
      Battery: Earbud 4 hour, case 20 hour
      Design: Full transparent shell see the circuit inside
      Function: Touch control, gaming low latency mode
      Package: 2*earbuds, 1*case, 1*cable
      Note: Normal use time depend on volume.`),
    specs: { Bluetooth: '5.3', Battery: '4 h (20 h with case)', Design: 'Transparent shell', Controls: 'Touch', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Clear', 'Smoke Black', 'Clear White'] }],
    cogs: 5.4, shipCost: 2.1, shipDays: CHOICE, weightKg: 0.1, moq: 500,
    perceivedValue: 42.99, amazonPrice: 34.99,
    baseDemand: 0.82, wow: 0.9, problemSolving: 0.15, impulse: 0.8, giftable: 0.6, repeatRate: 0,
    audience: { gender: 'all', ageMin: 16, ageMax: 30 }, platformFit: { fadbook: 0.5, tiktak: 0.95 },
    bestFormats: ['asmr_unboxing', 'ugc_testimonial', 'demo_video'],
    bestHooks: ['unboxing', 'tiktak_made_me_buy', 'asmr'],
    bestAngles: ['aspirational', 'curiosity', 'gift'],
    seasonality: [1, 1, 1, 1, 1, 1, 1, 1.05, 1, 1, 1.15, 1.25],
    trend: fad(100, 150, 35), startCompetitors: 5, defectRate: 0.3, claimRisk: 0.02, scaleCeiling: 2000,
    keywords: ['see-through', 'retro tech', 'aesthetic', 'statement', 'wireless', 'low latency', 'unique gift', 'conversation piece', 'touch controls', 'long battery'],
    objections: ['How long does the battery really last?', 'Does the connection drop?', 'Is the sound quality good?', 'What if one side stops working?'],
    publicSignals: { ordersBase: 5200, rating: 4.6, reviews: 2600, supplierYears: 1, choice: true },
    releaseDay: 120, brandable: 0.35,
  },

  // ==========================================================================
  // BABY & KIDS
  // ==========================================================================
  'baby-nail-trimmer': {
    supplierTitle: 'Electric Baby Nail Trimmer Safe Nail Clipper Grinder File Polisher LED Light Newborn Toddler Kids Manicure Set 6 Grinding Pads Quiet',
    supplierDescription: d(`
      Product: Electric Baby Nail File
      Speed: 2 speed, forward and reverse
      Noise: <45dB, baby not wake up
      Light: LED light for night trimming
      Pads: 6 replaceable grinding pads (0-3m, 3-12m, 1y+, adult)
      Power: 2*AA battery
      Feature: No blade, no cut, no pinch. Safe for newborn.
      Package: 1*trimmer, 6*pads, 1*storage box`),
    specs: { Speeds: '2, forward / reverse', Noise: '< 45 dB', Light: 'LED', Pads: '6 age-graded pads', Power: '2 x AA', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['White', 'Pink', 'Blue'] }],
    cogs: 4.4, shipCost: 2, shipDays: CHOICE, weightKg: 0.15, moq: 500,
    perceivedValue: 29.99, amazonPrice: 26.99,
    baseDemand: 0.86, wow: 0.6, problemSolving: 0.95, impulse: 0.65, giftable: 0.55, repeatRate: 0.05,
    audience: { gender: 'female', ageMin: 22, ageMax: 40 }, platformFit: { fadbook: 0.95, tiktak: 0.75 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'founder_story'],
    bestHooks: ['problem_callout', 'testimonial', 'pov'],
    bestAngles: ['parenting', 'pain_point', 'gift'],
    seasonality: [1, 1, 1, 1, 1.05, 1, 1, 1, 1, 1, 1, 1.05],
    trend: EVERGREEN, startCompetitors: 8, defectRate: 0.04, claimRisk: 0.05, scaleCeiling: 2800,
    keywords: ['no more clipping fear', 'safe', 'no blades', 'quiet', 'while baby sleeps', 'LED light', 'gentle', 'newborn', 'peace of mind', 'baby shower gift'],
    objections: ['Is it safe for a newborn?', 'Will the noise wake my baby?', 'Does it take long?', 'Which pad do I use for which age?', 'Are batteries included?'],
    publicSignals: { ordersBase: 2500, rating: 4.8, reviews: 2100, supplierYears: 5, choice: true },
    releaseDay: 74, brandable: 0.75,
  },
  'white-noise-machine': {
    supplierTitle: 'Portable White Noise Machine For Baby Sleep Sound Machine 30 Soothing Sounds Night Light Timer Stroller Travel Rechargeable Shusher',
    supplierDescription: d(`
      Product: Portable Baby Sound Machine
      Sounds: 30 (white noise, fan, rain, heartbeat, shush, lullaby)
      Battery: 2000mAh, 20 hour play
      Timer: 30/60/90/continuous
      Night Light: warm 3 level
      Strap: Hang on stroller, car seat, crib.
      Package: 1*machine, 1*strap, 1*USB-C cable`),
    specs: { Sounds: '30', Battery: '2000 mAh, ~20 h', Timer: '30 / 60 / 90 min or continuous', Light: 'Warm night light, 3 levels', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Sage', 'Grey', 'Pink'] }],
    cogs: 6.2, shipCost: 2.4, shipDays: CHOICE, weightKg: 0.3, moq: 300,
    perceivedValue: 29.99, amazonPrice: 24.99,
    baseDemand: 0.62, wow: 0.3, problemSolving: 0.8, impulse: 0.5, giftable: 0.5, repeatRate: 0,
    audience: { gender: 'female', ageMin: 22, ageMax: 40 }, platformFit: { fadbook: 0.9, tiktak: 0.6 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'skit'],
    bestHooks: ['problem_callout', 'testimonial', 'pov'],
    bestAngles: ['parenting', 'pain_point', 'health'],
    seasonality: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.05],
    trend: EVERGREEN, startCompetitors: 23, defectRate: 0.04, claimRisk: 0.15, scaleCeiling: 650,
    keywords: ['longer naps', 'soothing', 'portable', 'stroller', 'travel', 'rechargeable', 'night light', 'calm baby', 'sleep through', 'gentle'],
    objections: ['Is it loud enough?', 'Does the battery last all night?', 'Is it safe for newborns?', 'Does it loop without gaps?'],
    publicSignals: { ordersBase: 2600, rating: 4.7, reviews: 3000, supplierYears: 6, choice: true },
    releaseDay: 105, brandable: 0.6,
  },
  'busy-board': {
    supplierTitle: 'Montessori Busy Board Wooden Toddler Toys Sensory Activity Board Educational Fine Motor Skill Learning Toy Latches Switches Gift 1-4 Years',
    supplierDescription: d(`
      Product: Montessori Wooden Busy Board
      Material: Natural wood + non-toxic water paint
      Size: 30*22*3cm
      Include activity: latch, switch, zipper, gear, buckle, lock, abacus, clock, LED light switch (battery)
      Age: 1-4 years
      Benefit: Develop fine motor skill, logic, hand-eye coordination, screen-free play.
      Warning: Small parts, adult supervision.
      Package: 1*busy board, gift box`),
    specs: { Material: 'Natural wood, water-based paint', Size: '30 x 22 x 3 cm', Activities: '12+', Age: '1–4 years', Safety: 'Rounded edges, non-toxic paint', Origin: 'Mainland China' },
    variants: [{ name: 'Style', values: ['Classic', 'Dinosaur', 'Travel Size'] }],
    cogs: 8.3, shipCost: 4.6, shipDays: STD, weightKg: 1.1, moq: 200,
    perceivedValue: 44.99, amazonPrice: 36.99,
    baseDemand: 0.85, wow: 0.6, problemSolving: 0.55, impulse: 0.45, giftable: 0.95, repeatRate: 0,
    audience: { gender: 'female', ageMin: 25, ageMax: 40 }, platformFit: { fadbook: 0.95, tiktak: 0.65 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'slideshow'],
    bestHooks: ['gift_idea', 'problem_callout', 'testimonial'],
    bestAngles: ['parenting', 'gift', 'aspirational'],
    seasonality: [0.55, 0.45, 0.45, 0.4, 0.45, 0.4, 0.45, 0.5, 0.6, 0.9, 1.6, 1.8],
    trend: EVERGREEN, startCompetitors: 15, defectRate: 0.05, claimRisk: 0.05, scaleCeiling: 2300,
    keywords: ['screen-free', 'Montessori', 'fine motor skills', 'busy hands', 'wooden', 'non-toxic', 'learning through play', 'perfect gift', 'toddler', 'travel-friendly', 'independent play'],
    objections: ['Is it safe? Any small parts?', 'What age is it for?', 'Is the paint non-toxic?', 'Will my toddler get bored quickly?', 'Will it arrive in time for the holidays?'],
    publicSignals: { ordersBase: 2200, rating: 4.7, reviews: 1500, supplierYears: 4, choice: false },
    releaseDay: 130, brandable: 0.65,
  },
  'drawing-projector': {
    supplierTitle: 'Kids Drawing Projector Toy Dinosaur Tracing Painting Table Learning Educational Art Projector Sketching Board Children Gift 32 Slides',
    supplierDescription: d(`
      Product: Kids Projector Drawing Table
      Include: Projector, drawing board, 32 pattern slides (dinosaur, animal, vehicle), 12 watercolor pens
      Power: 3*AA battery (not include)
      Age: 3+
      Use: Project image on paper, kid trace the outline and color. Build confidence and creativity.
      Package: As picture`),
    specs: { Includes: 'Projector, board, 32 slides, 12 pens', Power: '3 x AA (not included)', Age: '3+', Origin: 'Mainland China' },
    variants: [{ name: 'Style', values: ['Dinosaur', 'Unicorn', 'Rocket'] }],
    cogs: 7.8, shipCost: 3, shipDays: STD, weightKg: 0.45, moq: 300,
    perceivedValue: 36.99, amazonPrice: 32.99,
    baseDemand: 0.6, wow: 0.65, problemSolving: 0.35, impulse: 0.5, giftable: 0.75, repeatRate: 0,
    audience: { gender: 'female', ageMin: 25, ageMax: 42 }, platformFit: { fadbook: 0.85, tiktak: 0.75 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'slideshow'],
    bestHooks: ['gift_idea', 'pov', 'question'],
    bestAngles: ['parenting', 'gift', 'curiosity'],
    seasonality: [0.7, 0.7, 0.75, 0.75, 0.8, 0.85, 0.9, 0.95, 0.9, 1, 1.3, 1.6],
    trend: EVERGREEN, startCompetitors: 12, defectRate: 0.06, claimRisk: 0.05, scaleCeiling: 650,
    keywords: ['creativity', 'confidence', 'screen-free', 'learn to draw', 'rainy days', 'educational', 'gift', 'independent play', 'art skills', 'kids love it'],
    objections: ['Is the projection bright enough in daylight?', 'Are batteries included?', 'What age is it good for?', 'Can I get more slides?'],
    publicSignals: { ordersBase: 1900, rating: 4.5, reviews: 1100, supplierYears: 4, choice: false },
    releaseDay: 115, brandable: 0.5,
  },
  'magnetic-tiles': {
    supplierTitle: 'Magnetic Tiles 60PCS Building Blocks Kids Toys Magnet Construction Set STEM Educational 3D Clear Rainbow Tiles Toddler Boys Girls Gift',
    supplierDescription: d(`
      Product: Magnetic Building Tiles 60pcs
      Material: ABS food-grade plastic + strong magnet (ultrasonic welded, not fall out)
      Shape: square, triangle, rectangle, hexagon
      Age: 3+
      Benefit: STEM learning, creativity, spatial thinking, color recognition.
      Package: 60 tiles + storage bag + idea booklet`),
    specs: { Pieces: '60', Material: 'Food-grade ABS, sealed magnets', Age: '3+', Includes: 'Storage bag, idea booklet', Origin: 'Mainland China' },
    variants: [{ name: 'Set', values: ['60 pcs', '100 pcs'] }],
    cogs: 14.2, shipCost: 6.4, shipDays: STD_SLOW, weightKg: 1.6, moq: 200,
    perceivedValue: 59.99, amazonPrice: 49.99,
    baseDemand: 0.74, wow: 0.6, problemSolving: 0.35, impulse: 0.35, giftable: 0.85, repeatRate: 0,
    audience: { gender: 'female', ageMin: 25, ageMax: 42 }, platformFit: { fadbook: 0.9, tiktak: 0.6 },
    bestFormats: ['ugc_testimonial', 'demo_video', 'slideshow'],
    bestHooks: ['gift_idea', 'testimonial', 'pov'],
    bestAngles: ['parenting', 'gift', 'aspirational'],
    seasonality: [0.8, 0.75, 0.8, 0.8, 0.85, 0.85, 0.85, 0.9, 0.9, 1, 1.4, 1.75],
    trend: EVERGREEN, startCompetitors: 64, defectRate: 0.05, claimRisk: 0.05, scaleCeiling: 800,
    keywords: ['STEM', 'open-ended play', 'creativity', 'sealed magnets', 'hours of play', 'gift', 'educational', 'screen-free', 'strong magnets', 'toddler-safe'],
    objections: ['Can the magnets come loose?', 'Are they compatible with other brands?', 'What age is it for?', 'How strong are the magnets?'],
    publicSignals: { ordersBase: 5400, rating: 4.7, reviews: 7200, supplierYears: 8, choice: false },
    releaseDay: 12, brandable: 0.45,
  },

  // ==========================================================================
  // FASHION
  // ==========================================================================
  'anti-theft-backpack': {
    supplierTitle: 'Anti Theft Backpack Men Women Waterproof Laptop Backpack 15.6 Inch USB Charging Port Hidden Zipper Travel Business School Bag Large',
    supplierDescription: d(`
      Product: Anti-theft Laptop Backpack
      Material: Waterproof Oxford + Polyester lining
      Size: 45*30*15cm, fit 15.6 inch laptop
      Feature:
      1. Hidden zipper on back, thief can not open.
      2. External USB port for charging on the go (power bank not include).
      3. Multi pocket, luggage strap, breathable back padding.
      Package: 1*backpack`),
    specs: { Material: 'Water-resistant Oxford', Size: '45 x 30 x 15 cm', Laptop: 'Up to 15.6"', Features: 'Hidden zipper, USB port, luggage strap', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Charcoal', 'Black', 'Navy'] }],
    cogs: 13.6, shipCost: 5.2, shipDays: STD, weightKg: 1, moq: 200,
    perceivedValue: 59.99, amazonPrice: 49.99,
    baseDemand: 0.6, wow: 0.45, problemSolving: 0.6, impulse: 0.35, giftable: 0.35, repeatRate: 0,
    audience: { gender: 'all', ageMin: 18, ageMax: 45 }, platformFit: { fadbook: 0.85, tiktak: 0.6 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'carousel'],
    bestHooks: ['problem_callout', 'shock_stat', 'pov'],
    bestAngles: ['pain_point', 'convenience', 'aspirational'],
    seasonality: [0.9, 0.85, 0.9, 0.95, 1, 1.15, 1.15, 1.3, 1.05, 0.9, 0.95, 1.1],
    trend: EVERGREEN, startCompetitors: 20, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 700,
    keywords: ['pickpocket-proof', 'hidden zipper', 'travel', 'laptop', 'USB charging', 'water-resistant', 'commute', 'organized', 'peace of mind', 'comfortable'],
    objections: ['Does it fit my 15.6" laptop?', 'Is it really waterproof?', 'Does the USB port include a power bank?', 'How durable are the zippers?'],
    publicSignals: { ordersBase: 3500, rating: 4.6, reviews: 4800, supplierYears: 7, choice: false },
    releaseDay: 124, brandable: 0.55,
  },
  'minimalist-wallet': {
    supplierTitle: 'Slim Minimalist Wallet For Men RFID Blocking Aluminum Metal Card Holder Pop Up Credit Card Case Front Pocket Money Clip Thin Wallet',
    supplierDescription: d(`
      Product: RFID Aluminum Card Holder
      Material: Aluminum alloy + PU leather back
      Capacity: 5-7 cards + cash clip
      Feature:
      1. Push button card pop up, easy take out.
      2. RFID blocking protect your info from skimming.
      3. Ultra thin, fit front pocket.
      Package: 1*wallet, gift box`),
    specs: { Material: 'Aluminum alloy, PU leather', Capacity: '5–7 cards + cash', Protection: 'RFID blocking', Size: '10 x 6.5 x 1 cm', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Black', 'Carbon', 'Brown', 'Navy'] }],
    cogs: 3.6, shipCost: 1.8, shipDays: CHOICE, weightKg: 0.1, moq: 500,
    perceivedValue: 24.99, amazonPrice: 19.99,
    baseDemand: 0.72, wow: 0.45, problemSolving: 0.5, impulse: 0.7, giftable: 0.7, repeatRate: 0,
    audience: { gender: 'male', ageMin: 20, ageMax: 50 }, platformFit: { fadbook: 0.85, tiktak: 0.7 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'carousel'],
    bestHooks: ['us_vs_them', 'shock_stat', 'pov'],
    bestAngles: ['convenience', 'aspirational', 'gift'],
    seasonality: [0.9, 0.95, 0.95, 0.95, 1, 1.35, 0.95, 0.9, 0.95, 1, 1.2, 1.5],
    trend: declining(800, 1600), startCompetitors: 72, defectRate: 0.05, claimRisk: 0.02, scaleCeiling: 800,
    keywords: ['slim', 'RFID protection', 'front pocket', 'quick access', 'minimalist', 'gift for him', 'durable', 'no bulk', 'pop-up cards', 'lifetime durable'],
    objections: ['How many cards does it really hold?', 'Do cards fall out?', 'Is the RFID blocking real?', 'Where do I keep cash?'],
    publicSignals: { ordersBase: 9400, rating: 4.6, reviews: 14000, supplierYears: 8, choice: true },
    releaseDay: 0, brandable: 0.55,
  },
  'claw-clip-set': {
    supplierTitle: '6PCS Matte Claw Clips Hair Clip Set Large Hair Claw Strong Hold Non Slip Jaw Clip For Thick Thin Hair Women Girls Accessories Neutral',
    supplierDescription: d(`
      Product: Matte Hair Claw Clip 6pcs
      Material: Acetate-like PC
      Size: 11cm large
      Color: 6 neutral color (black, brown, beige, grey, coffee, milk white)
      Package: 6pcs`),
    specs: { Material: 'Matte PC', Size: '11 cm', Pieces: '6', Origin: 'Mainland China' },
    variants: [{ name: 'Set', values: ['Neutral 6pcs', 'Tortoise 6pcs'] }],
    cogs: 2.3, shipCost: 1.7, shipDays: CHOICE, weightKg: 0.15, moq: 500,
    perceivedValue: 9.99, amazonPrice: 9.99,
    baseDemand: 0.3, wow: 0.25, problemSolving: 0.1, impulse: 0.85, giftable: 0.3, repeatRate: 0.03,
    audience: { gender: 'female', ageMin: 16, ageMax: 40 }, platformFit: { fadbook: 0.5, tiktak: 0.8 },
    bestFormats: ['slideshow', 'ugc_testimonial'],
    bestHooks: ['pov', 'tiktak_made_me_buy'],
    bestAngles: ['aspirational', 'savings'],
    seasonality: [1, 1, 1, 1, 1.05, 1.1, 1.1, 1.05, 1, 0.95, 1, 1.05],
    trend: EVERGREEN, startCompetitors: 28, defectRate: 0.06, claimRisk: 0.02, scaleCeiling: 150,
    keywords: ['strong hold', 'matte', 'neutral tones', 'thick hair', 'everyday', 'no damage', 'quick updo', 'comfortable', 'classy', 'set of six'],
    objections: ['Will they snap?', 'Do they hold thick hair?', 'Are the colors as shown?', 'Are they comfortable to sit back against?'],
    publicSignals: { ordersBase: 13000, rating: 4.7, reviews: 6600, supplierYears: 5, choice: true },
    releaseDay: 47, brandable: 0.3,
  },

  // ==========================================================================
  // OUTDOOR
  // ==========================================================================
  'heated-vest': {
    supplierTitle: 'USB Heated Vest Men Women Electric Heating Jacket 9 Zones Winter Warm Thermal Clothing Outdoor Hunting Fishing Motorcycle Washable',
    supplierDescription: d(`
      Product: USB Electric Heated Vest
      Heating Zone: 9 zone (back, chest, neck, pocket)
      Temperature: 3 level (45°C / 50°C / 55°C)
      Power: USB 5V 2A power bank (NOT include, recommend 10000mAh+)
      Material: Nylon + cotton padding
      Size: S-4XL (Asian size, please choose 1-2 size up)
      Care: Remove power bank then hand wash.
      Package: 1*vest`),
    specs: { Zones: '9', Heat: '3 levels, 45–55 °C', Power: 'USB 5V 2A power bank (not included)', Sizes: 'S–4XL (runs small)', Care: 'Hand wash, cable removed', Origin: 'Mainland China' },
    variants: [{ name: 'Size', values: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'] }, { name: 'Color', values: ['Black', 'Grey', 'Army Green'] }],
    cogs: 12.6, shipCost: 4.9, shipDays: STD, weightKg: 0.7, moq: 200,
    perceivedValue: 74.99, amazonPrice: 59.99,
    baseDemand: 0.85, wow: 0.65, problemSolving: 0.8, impulse: 0.4, giftable: 0.6, repeatRate: 0,
    audience: { gender: 'male', ageMin: 25, ageMax: 60 }, platformFit: { fadbook: 0.9, tiktak: 0.6 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'skit'],
    bestHooks: ['problem_callout', 'shock_stat', 'gift_idea'],
    bestAngles: ['pain_point', 'gift', 'convenience'],
    seasonality: [1.75, 1.3, 0.6, 0.3, 0.22, 0.2, 0.2, 0.25, 0.5, 1.2, 1.8, 1.95],
    trend: EVERGREEN, startCompetitors: 12, defectRate: 0.07, claimRisk: 0.05, scaleCeiling: 2400,
    keywords: ['instant warmth', 'nine heat zones', 'outdoor work', 'hunting', 'commute', 'washable', 'lightweight', 'no bulky coat', 'gift for dad', 'three heat settings'],
    objections: ['Is a power bank included?', 'Does it run small?', 'How long does it stay warm?', 'Can I wash it?', 'Is it safe in the rain?'],
    publicSignals: { ordersBase: 3100, rating: 4.5, reviews: 2200, supplierYears: 5, choice: false },
    releaseDay: 170, brandable: 0.55,
  },
  'solar-firefly-lights': {
    supplierTitle: 'Solar Firefly Garden Lights Outdoor Waterproof Swaying Starburst LED Lights Decorative Pathway Yard Patio Landscape Lamp 2 Pack 8 LED',
    supplierDescription: d(`
      Product: Solar Firefly Swaying Lights (2pcs)
      LED: 8 LED per light, warm white
      Solar Panel: 2V 100mA, 6-8 hour sunlight, work 8-10 hour at night
      Waterproof: IP65
      Height: 75cm
      Feature: Auto on at dusk, auto off at dawn. Wind blow, fireflies sway, very beautiful.
      Package: 2*solar lights`),
    specs: { LEDs: '8 per stake, warm white', Solar: '2V 100 mA panel', Runtime: '8–10 h after full sun', Waterproof: 'IP65', Height: '75 cm', Origin: 'Mainland China' },
    variants: [{ name: 'Pack', values: ['2 Pack', '4 Pack', '6 Pack'] }],
    cogs: 4.6, shipCost: 2.9, shipDays: CHOICE, weightKg: 0.4, moq: 500,
    perceivedValue: 29.99, amazonPrice: 24.99,
    baseDemand: 0.85, wow: 0.8, problemSolving: 0.15, impulse: 0.7, giftable: 0.4, repeatRate: 0,
    audience: { gender: 'female', ageMin: 28, ageMax: 65 }, platformFit: { fadbook: 0.95, tiktak: 0.7 },
    bestFormats: ['demo_video', 'ugc_testimonial', 'slideshow'],
    bestHooks: ['pov', 'asmr', 'gift_idea'],
    bestAngles: ['aspirational', 'gift', 'curiosity'],
    seasonality: [0.25, 0.35, 0.8, 1.5, 1.9, 1.8, 1.5, 1.1, 0.7, 0.45, 0.35, 0.35],
    trend: EVERGREEN, startCompetitors: 18, defectRate: 0.08, claimRisk: 0.02, scaleCeiling: 2000,
    keywords: ['magical', 'no wiring', 'solar powered', 'sways in the breeze', 'dusk to dawn', 'waterproof', 'backyard', 'curb appeal', 'Mother\'s Day', 'no electricity bill'],
    objections: ['How bright are they?', 'Do they work on cloudy days?', 'How long do they last each night?', 'Are they sturdy in wind and rain?'],
    publicSignals: { ordersBase: 4800, rating: 4.4, reviews: 5200, supplierYears: 4, choice: true },
    releaseDay: 10, brandable: 0.4,
  },
  'bug-zapper-lamp': {
    supplierTitle: 'Rechargeable Bug Zapper Lamp Electric Mosquito Killer Outdoor Indoor Insect Trap Fly Zapper Camping Lantern 3 In 1 Portable Waterproof',
    supplierDescription: d(`
      Product: 3 in 1 Bug Zapper Lantern
      Voltage: 4200V high voltage grid
      Light: 395nm UV light attract insect + LED camping light
      Battery: 4000mAh, Type-C, 12 hour
      Coverage: 30㎡
      Waterproof: IPX6
      Package: 1*zapper, 1*cleaning brush, 1*USB cable
      Warning: Keep away from children and pet finger.`),
    specs: { Grid: '4200 V', 'UV Wavelength': '395 nm', Battery: '4000 mAh USB-C, ~12 h', Coverage: '~30 m² (320 sq ft)', Waterproof: 'IPX6', Origin: 'Mainland China' },
    variants: [{ name: 'Color', values: ['Black', 'Green'] }],
    cogs: 6.4, shipCost: 3.2, shipDays: CHOICE, weightKg: 0.45, moq: 300,
    perceivedValue: 36.99, amazonPrice: 29.99,
    baseDemand: 0.85, wow: 0.65, problemSolving: 0.85, impulse: 0.6, giftable: 0.1, repeatRate: 0,
    audience: { gender: 'all', ageMin: 25, ageMax: 65 }, platformFit: { fadbook: 0.9, tiktak: 0.7 },
    bestFormats: ['demo_video', 'skit', 'ugc_testimonial'],
    bestHooks: ['problem_callout', 'asmr', 'pov'],
    bestAngles: ['pain_point', 'convenience', 'health'],
    seasonality: [0.2, 0.25, 0.4, 0.8, 1.45, 1.95, 2, 1.7, 0.9, 0.45, 0.25, 0.2],
    trend: EVERGREEN, startCompetitors: 20, defectRate: 0.06, claimRisk: 0.15, scaleCeiling: 2200,
    keywords: ['bite-free', 'chemical-free', 'rechargeable', 'patio', 'camping', 'quiet', 'waterproof', 'summer nights', 'lantern', 'mosquito-free'],
    objections: ['Is it safe around kids and pets?', 'Does it actually kill mosquitoes?', 'How long does the battery last?', 'Is it loud?', 'Is it easy to clean?'],
    publicSignals: { ordersBase: 5100, rating: 4.5, reviews: 6100, supplierYears: 6, choice: true },
    releaseDay: 38, brandable: 0.45,
  },
}

const r2 = (x: number) => Math.round(x * 100) / 100

/** Every product with its economics. Throws at import if productList.ts gained an id without data. */
export const PRODUCTS: ProductDef[] = PRODUCT_LIST.map(l => {
  const a = A[l.id]
  if (!a) throw new Error(`data/products.ts: missing economics for "${l.id}"`)
  const { bulkRatio = 0.68, privateLabelMoq, ...rest } = a
  const bulkCogs = r2(a.cogs * bulkRatio)
  return {
    id: l.id,
    name: l.name,
    niche: l.niche,
    archetype: l.archetype,
    ...rest,
    bulkCogs,
    privateLabelCogs: r2(bulkCogs * 1.15),
    privateLabelMoq: privateLabelMoq ?? (a.cogs < 6 ? 1000 : a.cogs < 15 ? 750 : 500),
    startSaturation: r2(1 - Math.exp(-a.startCompetitors / 45)),
  }
})

export const PRODUCT_BY_ID: Readonly<Record<string, ProductDef>> = Object.fromEntries(PRODUCTS.map(p => [p.id, p]))
