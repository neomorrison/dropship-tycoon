// Creative building blocks shown in CreatorHub (Studio): formats, hooks, angles and script beats.
// OWNER: sim-ads. Player-facing copy only. Descriptions say WHAT each option is and how it is made,
// never which products it suits. Discovering the right combination per product is the skill
// (sim/ads/scoring.ts holds the hidden fit model).
import type { AngleId, BeatId, CreativeProducer, FormatId, HookId } from '../core/types'

export interface TaxonomyItem<T extends string> {
  id: T
  /** display name */
  name: string
  /** one-line summary for cards */
  short: string
  /** 1–3 sentences: what it is, how it plays out on screen */
  description: string
  /** concrete examples (generic, product-agnostic) */
  examples: string[]
  /** lucide-react icon name for cards */
  icon: string
}

export interface FormatDef extends TaxonomyItem<FormatId> {
  /** renders as video (hook/hold metrics apply) */
  video: boolean
  /** a person talks to camera (a lav mic helps) */
  talking: boolean
  /** typical seconds of footage per script beat */
  secondsPerBeat: number
  /** clamp for the finished cut, seconds (0 for stills) */
  durationRange: [number, number]
  /** who can produce it */
  producers: CreativeProducer[]
  /** production notes shown in the brief */
  productionNote: string
}

export interface HookDef extends TaxonomyItem<HookId> {
  /** on-screen text patterns players can adapt (___ = fill in) */
  textPatterns: string[]
  /** platform policy note (public knowledge), if any */
  policyNote?: string
}

export interface AngleDef extends TaxonomyItem<AngleId> {
  policyNote?: string
}

export interface BeatDef extends TaxonomyItem<BeatId> {
  /** default length in seconds */
  seconds: number
}

const ALL_PRODUCERS: CreativeProducer[] = ['self', 'ugc', 'agency', 'staff']

export const FORMATS: Record<FormatId, FormatDef> = {
  ugc_testimonial: {
    id: 'ugc_testimonial', name: 'UGC testimonial', icon: 'MessageCircleHeart',
    short: 'A real-looking customer talks to camera about using it.',
    description: 'Selfie-style video of a person sharing their experience, filmed on a phone in a normal home. Feels like a friend\'s post, not an ad.',
    examples: ['"Okay I need to talk about this thing I bought last month…"', 'Creator holds the product up while explaining why they reorder it'],
    video: true, talking: true, secondsPerBeat: 4.5, durationRange: [15, 45], producers: ALL_PRODUCERS,
    productionNote: 'Needs the product in hand. Natural light and clear audio matter more than a fancy camera.',
  },
  demo_video: {
    id: 'demo_video', name: 'Product demo', icon: 'PlayCircle',
    short: 'Show the product doing its job, up close.',
    description: 'Hands-on footage of the product in use, usually with quick cuts and captions. The viewer sees exactly what it does within a few seconds.',
    examples: ['Close-up of the product working, then a wide shot of the result', 'Side-by-side "normal way vs. this" clip'],
    video: true, talking: false, secondsPerBeat: 3.5, durationRange: [10, 35], producers: ALL_PRODUCERS,
    productionNote: 'Needs the product in hand. Good lighting makes the details pop.',
  },
  green_screen: {
    id: 'green_screen', name: 'Green screen', icon: 'Layers',
    short: 'Creator talks in front of a screenshot, review or article.',
    description: 'The creator appears over a background image such as reviews, comments, a news headline or a product page, and reacts to it or explains it.',
    examples: ['Creator pointing at a wall of 5-star reviews', 'Reacting to a viral comment asking "does this actually work?"'],
    video: true, talking: true, secondsPerBeat: 4, durationRange: [12, 40], producers: ALL_PRODUCERS,
    productionNote: 'Filmed on a phone with a green-screen effect. Works best with a person on camera.',
  },
  slideshow: {
    id: 'slideshow', name: 'Slideshow', icon: 'GalleryHorizontal',
    short: 'A sequence of photos with text overlays and music.',
    description: 'Several still images played in order with bold captions and a trending sound, the "photo mode" style native to short-video feeds.',
    examples: ['"5 things I wish I bought sooner" with one photo per item', 'Photo 1: the problem, photos 2–4: the product, photo 5: the price'],
    video: true, talking: false, secondsPerBeat: 2.5, durationRange: [8, 20], producers: ['self', 'supplier_edit', 'ugc', 'agency', 'staff'],
    productionNote: 'Can be built from supplier photos. No filming needed.',
  },
  static_image: {
    id: 'static_image', name: 'Static image', icon: 'Image',
    short: 'A single designed image with a headline.',
    description: 'One still graphic: product photo, a headline, maybe a badge or price. Cheap to make and quick to test many versions.',
    examples: ['Product on a clean background with a bold benefit headline', 'A screenshot-style "review card" with the product photo'],
    video: false, talking: false, secondsPerBeat: 0, durationRange: [0, 0], producers: ['self', 'supplier_edit', 'agency', 'staff'],
    productionNote: 'Can be built from supplier photos. No video metrics (hook/hold) apply.',
  },
  carousel: {
    id: 'carousel', name: 'Carousel', icon: 'GalleryVerticalEnd',
    short: 'Swipeable cards, each with its own image and caption.',
    description: 'Three to ten swipeable image cards. Each card can show a feature, a use case, a variant or a review.',
    examples: ['Card 1: hero shot, cards 2–4: features, card 5: offer', 'One card per color variant'],
    video: false, talking: false, secondsPerBeat: 0, durationRange: [0, 0], producers: ['self', 'supplier_edit', 'agency', 'staff'],
    productionNote: 'Can be built from supplier photos. No video metrics apply.',
  },
  before_after_video: {
    id: 'before_after_video', name: 'Before & after video', icon: 'ArrowLeftRight',
    short: 'Show the same thing before and after using the product.',
    description: 'Footage of a starting state, the product being used, then the end state, so the change is visible on screen.',
    examples: ['Split-screen of the same spot before and after', 'Time-lapse from start to finish'],
    video: true, talking: false, secondsPerBeat: 3.5, durationRange: [10, 35], producers: ALL_PRODUCERS,
    productionNote: 'Needs the product in hand and a real, visible change to film. Platforms review before/after footage closely.',
  },
  asmr_unboxing: {
    id: 'asmr_unboxing', name: 'ASMR / unboxing', icon: 'Package',
    short: 'Satisfying sounds and close-ups: opening, clicking, pouring.',
    description: 'No talking. Crisp audio and macro shots of unboxing, handling and using the product. Built for sound-on feeds.',
    examples: ['Slow unboxing with every click and crinkle amplified', 'Close-up of the product in use with natural sounds only'],
    video: true, talking: false, secondsPerBeat: 4, durationRange: [12, 40], producers: ALL_PRODUCERS,
    productionNote: 'Needs the product in hand. Audio quality makes or breaks this format.',
  },
  founder_story: {
    id: 'founder_story', name: 'Founder story', icon: 'UserRound',
    short: 'The person behind the brand explains why it exists.',
    description: 'A talking-head video from the founder: the frustration that started it, what they changed, and why it\'s different.',
    examples: ['"I started this because I was sick of…"', 'Walking through the warehouse showing how orders are packed'],
    video: true, talking: true, secondsPerBeat: 5.5, durationRange: [20, 60], producers: ['self', 'agency', 'staff'],
    productionNote: 'Filmed by you (or produced by an agency with your input).',
  },
  supplier_edit: {
    id: 'supplier_edit', name: 'Supplier footage edit', icon: 'Scissors',
    short: 'Re-cut the supplier\'s promo video with new text and music.',
    description: 'Takes the factory video that comes with the listing, trims it, adds your captions and a new sound. Fast and free, but other stores can run the same footage.',
    examples: ['Supplier clip with new captions: "this changed my mornings"', 'Best 8 seconds of the factory demo looped with a trending sound'],
    video: true, talking: false, secondsPerBeat: 3, durationRange: [8, 30], producers: ['supplier_edit', 'agency'],
    productionNote: 'No sample needed. The footage is shared with every other store selling this item.',
  },
  skit: {
    id: 'skit', name: 'Skit', icon: 'Clapperboard',
    short: 'A short scripted scene or joke that reveals the product.',
    description: 'A mini story with a setup and a punchline, often playing two characters, where the product is the payoff.',
    examples: ['Roommate A struggles, roommate B pulls out the product', '"Things that just make sense" bit with a twist ending'],
    video: true, talking: true, secondsPerBeat: 4.5, durationRange: [15, 50], producers: ALL_PRODUCERS,
    productionNote: 'Needs the product in hand and a bit of acting. Timing matters.',
  },
}

export const HOOKS: Record<HookId, HookDef> = {
  problem_callout: {
    id: 'problem_callout', name: 'Problem callout', icon: 'AlertCircle',
    short: 'Open by naming a frustration the viewer has.',
    description: 'The first line calls out a specific annoyance so the right people stop scrolling because they feel seen.',
    examples: ['"If you\'re still doing ___ the hard way, stop."', '"Tired of ___ every single morning?"'],
    textPatterns: ['Tired of ___?', 'Stop ___ like this', 'If you hate ___, watch this'],
  },
  pov: {
    id: 'pov', name: 'POV', icon: 'Eye',
    short: '"POV:" puts the viewer inside a relatable moment.',
    description: 'A first-person scenario caption that makes the viewer imagine themselves in the situation, a staple of short-video feeds.',
    examples: ['"POV: you finally found a fix for ___"', '"POV: your partner asks why you\'re smiling at ___"'],
    textPatterns: ['POV: you finally ___', 'POV: you just discovered ___', 'POV: it\'s 7am and ___'],
  },
  tiktak_made_me_buy: {
    id: 'tiktak_made_me_buy', name: '"TikTak made me buy it"', icon: 'ShoppingBag',
    short: 'The viral-find framing: "I saw it everywhere, so I tried it."',
    description: 'Borrows the trend of people testing products they kept seeing in their feed. Signals the item is popular and worth checking out.',
    examples: ['"TikTak made me buy it… and I\'m not mad"', '"Testing the viral ___ so you don\'t have to"'],
    textPatterns: ['TikTak made me buy it: ___', 'Testing the viral ___', 'Is the viral ___ worth it?'],
  },
  before_after: {
    id: 'before_after', name: 'Before / after reveal', icon: 'SplitSquareHorizontal',
    short: 'Tease the end result right in the first frame.',
    description: 'The opening frame shows the result (or a split with the starting point) so the viewer stays to see how it happened.',
    examples: ['"Before vs. after one use"', 'First frame split down the middle: messy / spotless'],
    textPatterns: ['Before vs after ___', 'Wait for the after…', 'Day 1 vs day 14'],
    policyNote: 'Platforms scrutinize before/after claims, especially about bodies, skin and health, and may reject them.',
  },
  asmr: {
    id: 'asmr', name: 'ASMR open', icon: 'AudioLines',
    short: 'Start with a satisfying sound or motion, no words.',
    description: 'The first second is a crisp, satisfying sound or visual that triggers curiosity for sound-on viewers.',
    examples: ['A perfect click, pop or pour in the first frame', 'Slow-motion close-up with amplified sound'],
    textPatterns: ['(sound on 🔊)', 'the sound at the end…', 'so satisfying'],
  },
  shock_stat: {
    id: 'shock_stat', name: 'Shock stat', icon: 'Percent',
    short: 'Lead with a surprising number or fact.',
    description: 'An unexpected statistic grabs attention and frames why the product matters. Needs to be true and specific.',
    examples: ['"9 out of 10 people do ___ wrong"', '"You\'re wasting 40 minutes a week on ___"'],
    textPatterns: ['___% of people don\'t know this', 'You spend ___ hours a year on ___', '1 in ___ people…'],
    policyNote: 'Unsupported health or results claims get ads rejected.',
  },
  unboxing: {
    id: 'unboxing', name: 'Unboxing', icon: 'PackageOpen',
    short: 'Open with the box arriving or being opened.',
    description: 'The excitement of a delivery: package in hand, tearing it open, first reaction to what\'s inside.',
    examples: ['"It finally came!"', 'Hands ripping open a mailer straight to camera'],
    textPatterns: ['It finally came 📦', 'Unboxing the ___ everyone\'s talking about', 'What I ordered vs what I got'],
  },
  us_vs_them: {
    id: 'us_vs_them', name: 'Us vs. them', icon: 'Swords',
    short: 'Compare it head-to-head with the usual alternative.',
    description: 'Puts the product next to the common way of doing things (or a pricier option) and shows the difference.',
    examples: ['"$15 vs $80: which one actually works?"', '"The old way vs. the smart way"'],
    textPatterns: ['___ vs ___: no contest', 'Why I switched from ___', 'The $___ version vs this'],
  },
  testimonial: {
    id: 'testimonial', name: 'Testimonial quote', icon: 'Quote',
    short: 'Open on a customer\'s words or reaction.',
    description: 'Leads with a genuine-sounding quote or reaction from someone who uses it, often shown as a caption over their face.',
    examples: ['"I was skeptical, but…"', '"My mom asked me where I got this"'],
    textPatterns: ['"I was skeptical but…"', '"Why didn\'t anyone tell me about ___ sooner"', '"Okay, I\'m obsessed"'],
  },
  gift_idea: {
    id: 'gift_idea', name: 'Gift idea', icon: 'Gift',
    short: 'Frame it as the perfect present for someone.',
    description: 'Positions the item as a gift and names who it\'s for, so viewers think of a person on their list.',
    examples: ['"Gift idea for the person who has everything"', '"What to get your dad this year"'],
    textPatterns: ['Gift idea for ___', 'The gift they won\'t stop using', 'Stocking stuffer for ___'],
  },
  life_hack: {
    id: 'life_hack', name: 'Life hack', icon: 'Lightbulb',
    short: 'Present it as a clever trick viewers didn\'t know.',
    description: 'Frames the product as a smart shortcut, the kind of tip people save and share with friends.',
    examples: ['"The ___ hack I use every day"', '"Why is nobody talking about this trick?"'],
    textPatterns: ['The ___ hack nobody told you', 'Save this for later', 'Game-changing ___ hack'],
  },
  controversial: {
    id: 'controversial', name: 'Hot take', icon: 'Flame',
    short: 'Open with a bold, divisive opinion.',
    description: 'A provocative statement sparks disagreement in the comments, which can boost reach. It also attracts arguers and can be misread.',
    examples: ['"Unpopular opinion: ___ is a scam"', '"I\'ll say it: you\'re doing ___ wrong"'],
    textPatterns: ['Unpopular opinion: ___', 'Nobody wants to hear this but ___', 'I\'ll get hate for this…'],
    policyNote: 'Divisive openers invite negative feedback that can hurt account quality.',
  },
  question: {
    id: 'question', name: 'Question', icon: 'HelpCircle',
    short: 'Open with a question the viewer wants answered.',
    description: 'A direct question that the viewer silently answers "yes" to, or wants the answer to.',
    examples: ['"Do you also ___?"', '"Why does nobody use ___?"'],
    textPatterns: ['Do you ___ too?', 'Why does nobody ___?', 'Did you know ___?'],
  },
}

export const ANGLES: Record<AngleId, AngleDef> = {
  pain_point: {
    id: 'pain_point', name: 'Pain point', icon: 'Frown',
    short: 'Focus on the problem and the relief of solving it.',
    description: 'The story is built around a frustration: show it, make it sting, then show it disappearing.',
    examples: ['"Every day I dealt with ___. Not anymore."'],
  },
  convenience: {
    id: 'convenience', name: 'Convenience', icon: 'Zap',
    short: 'It makes something easier or effortless.',
    description: 'Sells how little effort it takes: fewer steps, no mess, works anywhere.',
    examples: ['"One button. That\'s it."', '"Fits in my bag, works anywhere."'],
  },
  gift: {
    id: 'gift', name: 'Gift', icon: 'Gift',
    short: 'Buy it for someone you love.',
    description: 'Frames the purchase around the recipient\'s reaction rather than the buyer\'s needs.',
    examples: ['"Their face when they opened it…"'],
  },
  social_proof: {
    id: 'social_proof', name: 'Social proof', icon: 'Users',
    short: 'Everyone is using it. Here\'s the proof.',
    description: 'Leans on reviews, sales counts, sold-out moments and real people using it.',
    examples: ['"40,000 people can\'t be wrong"', 'Montage of customer clips'],
  },
  savings: {
    id: 'savings', name: 'Savings', icon: 'PiggyBank',
    short: 'It saves money, or it\'s a steal for what it does.',
    description: 'Compares cost against the alternatives or shows how it pays for itself.',
    examples: ['"Stopped paying $___ a month for ___"', '"Same result for a fraction of the price"'],
  },
  aspirational: {
    id: 'aspirational', name: 'Aspirational', icon: 'Sparkles',
    short: 'The lifestyle and identity it brings.',
    description: 'Sells the feeling: the aesthetic home, the put-together morning, the person you want to be.',
    examples: ['"That girl morning routine"', 'Slow, beautiful shots in a styled space'],
  },
  curiosity: {
    id: 'curiosity', name: 'Curiosity', icon: 'Search',
    short: 'Make them wonder what it is and how it works.',
    description: 'Withholds the reveal, so viewers keep watching to find out.',
    examples: ['"I didn\'t believe this would work until…"', '"Wait for it…"'],
  },
  health: {
    id: 'health', name: 'Health', icon: 'HeartPulse',
    short: 'Feel better, move better, sleep better.',
    description: 'Centers on physical or mental well-being outcomes.',
    examples: ['"My back after a week of using this"'],
    policyNote: 'Health outcome claims are policy-sensitive: avoid promising cures or guaranteed results.',
  },
  time_saving: {
    id: 'time_saving', name: 'Time saving', icon: 'Timer',
    short: 'Get minutes (or hours) of your life back.',
    description: 'Quantifies time: faster routines, fewer chores, more free time.',
    examples: ['"What used to take 20 minutes now takes 2"'],
  },
  pet_love: {
    id: 'pet_love', name: 'Pet love', icon: 'PawPrint',
    short: 'Because they\'re family.',
    description: 'Taps into how much owners adore their animals: comfort, happiness, spoiling them.',
    examples: ['"He does this happy dance every time"'],
  },
  parenting: {
    id: 'parenting', name: 'Parenting', icon: 'Baby',
    short: 'Real parent life: safer, calmer, easier.',
    description: 'Speaks to parents about the daily chaos and the small wins that make it easier.',
    examples: ['"Mom hack that saved my sanity"'],
  },
  self_care: {
    id: 'self_care', name: 'Self-care', icon: 'Flower2',
    short: 'You deserve a little treat.',
    description: 'Positions the product as a ritual of care and indulgence for yourself.',
    examples: ['"My Sunday reset essential"'],
  },
}

export const BEATS: Record<BeatId, BeatDef> = {
  hook: { id: 'hook', name: 'Hook', icon: 'Magnet', seconds: 3, short: 'The first 1–3 seconds that stop the scroll.', description: 'The opening frame and line. It decides whether anyone watches the rest.', examples: ['Bold on-screen text plus a striking first shot'] },
  problem: { id: 'problem', name: 'Problem', icon: 'CircleAlert', seconds: 4, short: 'Show the frustration.', description: 'Show the situation the viewer recognizes.', examples: ['Struggling with the old way on camera'] },
  agitate: { id: 'agitate', name: 'Agitate', icon: 'TrendingDown', seconds: 3, short: 'Make the problem sting.', description: 'Twist the knife: the time, money or embarrassment the problem costs.', examples: ['"And it happens every. single. day."'] },
  demo: { id: 'demo', name: 'Demo', icon: 'Hand', seconds: 5, short: 'The product in action.', description: 'Show it working, clearly and up close.', examples: ['Close-up of the product doing its job'] },
  benefits: { id: 'benefits', name: 'Benefits', icon: 'ListChecks', seconds: 4, short: 'What you get out of it.', description: 'Two or three concrete benefits, ideally shown rather than listed.', examples: ['Quick cuts with a benefit caption on each'] },
  social_proof: { id: 'social_proof', name: 'Social proof', icon: 'Star', seconds: 3, short: 'Reviews, numbers, other people.', description: 'Evidence that others bought it and like it.', examples: ['Screenshot of reviews', '"Over 10,000 sold"'] },
  offer: { id: 'offer', name: 'Offer', icon: 'BadgePercent', seconds: 3, short: 'Price, discount, bundle or guarantee.', description: 'The deal: what it costs, what\'s included, what makes now a good time.', examples: ['"Buy 2 get 1 free this week"', '"30-day money-back guarantee"'] },
  urgency: { id: 'urgency', name: 'Urgency', icon: 'Hourglass', seconds: 2, short: 'A reason to act now.', description: 'Limited stock, a sale ending, a seasonal deadline. Must be honest to keep trust.', examples: ['"Sale ends Sunday"'] },
  cta: { id: 'cta', name: 'Call to action', icon: 'MousePointerClick', seconds: 2, short: 'Tell them exactly what to do.', description: 'A clear instruction to tap, shop or order, usually at the end.', examples: ['"Tap Shop Now to grab yours"'] },
  unboxing: { id: 'unboxing', name: 'Unboxing', icon: 'PackageOpen', seconds: 4, short: 'Opening the package.', description: 'The reveal of what comes in the box.', examples: ['Hands opening the package to camera'] },
  comparison: { id: 'comparison', name: 'Comparison', icon: 'Scale', seconds: 4, short: 'Side by side with the alternative.', description: 'Show it against the usual way or a competitor.', examples: ['Split screen: old way vs. this'] },
  testimonial: { id: 'testimonial', name: 'Testimonial', icon: 'MessageSquareQuote', seconds: 4, short: 'A customer in their own words.', description: 'A short quote or clip from someone who uses it.', examples: ['"Honestly the best $30 I\'ve spent"'] },
}

export const FORMAT_LIST: FormatDef[] = Object.values(FORMATS)
export const HOOK_LIST: HookDef[] = Object.values(HOOKS)
export const ANGLE_LIST: AngleDef[] = Object.values(ANGLES)
export const BEAT_LIST: BeatDef[] = Object.values(BEATS)

/** Formats the "Supplier footage edit" producer can make (no sample needed). */
export const SUPPLIER_EDIT_FORMATS: FormatId[] = ['supplier_edit', 'slideshow', 'static_image', 'carousel']
/** Formats that need no filming at all. */
export const STILL_FORMATS: FormatId[] = ['static_image', 'carousel']

export const PRODUCER_INFO: Record<CreativeProducer, { name: string; short: string; description: string }> = {
  self: {
    name: 'Film it yourself',
    short: 'Free, about 3 hours of your time. Needs the product in hand.',
    description: 'Shoot it at home on your own gear. Quality depends on your camera, lighting, audio, your creative skill, your apartment and your mood.',
  },
  supplier_edit: {
    name: 'Supplier footage edit',
    short: 'Free, about 1.5 hours. No sample needed.',
    description: 'Re-cut the supplier\'s photos and promo clip. Quick and free, but low quality, and the same footage is already running in other stores\' ads.',
  },
  ugc: {
    name: 'Hire a UGC creator',
    short: 'Paid per video. The product is shipped to the creator.',
    description: 'A creator films the video in their own home and style. You send them a unit (your sample or 3PL stock); delivery time includes shipping.',
  },
  agency: {
    name: 'Creative agency pack',
    short: '3 polished variations, 1–2 weeks.',
    description: 'A studio produces three variations of your concept with pro lighting, editing and their own hook copy on two of them.',
  },
  staff: {
    name: 'Your in-house creator',
    short: 'Included in their salary. 1–2 days.',
    description: 'Brief the UGC creator on your team. They need a sample or 3PL stock to film.',
  },
}

export const formatName = (id: FormatId) => FORMATS[id]?.name ?? id
export const hookName = (id: HookId) => HOOKS[id]?.name ?? id
export const angleName = (id: AngleId) => ANGLES[id]?.name ?? id
export const beatName = (id: BeatId) => BEATS[id]?.name ?? id
