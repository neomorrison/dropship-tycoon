// UpWorx freelancers: roles, pay bands, personas (matched to portraits p01–p18) and profile copy.
// Weekly rates reflect 2025–26 freelance marketplace rates for e-commerce contractors
// (offshore VAs $4–10/h, performance media buyers $40–90/h part-time, etc.).
// OWNER: sim-life-finance.
import type { StaffRole } from '../core/types'

export interface StaffConfigField {
  key: string
  label: string
  kind: 'toggle' | 'number' | 'select' | 'product'
  help: string
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  step?: number
}

export interface StaffRoleDef {
  id: StaffRole
  label: string
  plural: string
  /** weekly pay band, USD */
  rate: [number, number]
  hoursPerWeek: [number, number]
  /** what they do for you (player-facing) */
  summary: string
  /** how skill changes their output (player-facing) */
  skillNote: string
  defaults: Record<string, string | number | boolean>
  config: StaffConfigField[]
  /** candidate mix weight */
  weight: number
}

export const STAFF_ROLES: Record<StaffRole, StaffRoleDef> = {
  va: {
    id: 'va', label: 'Virtual Assistant', plural: 'Virtual assistants', rate: [180, 400], hoursPerWeek: [30, 40], weight: 0.26,
    summary: 'Answers support tickets every day (9 AM–5 PM) and can file chargeback evidence for you.',
    skillNote: 'Solves about 15 tickets/day per skill point. Better VAs also write stronger dispute evidence.',
    defaults: { fightChargebacks: true },
    config: [
      { key: 'fightChargebacks', label: 'Respond to chargebacks', kind: 'toggle', help: 'Submits tracking + delivery proof on new disputes before the deadline.' },
    ],
  },
  ugc_creator: {
    id: 'ugc_creator', label: 'UGC Creator', plural: 'UGC creators', rate: [400, 1200], hoursPerWeek: [10, 20], weight: 0.2,
    summary: 'Films 2–4 new ad creatives a week for the product you assign. Needs a sample or 3PL stock.',
    skillNote: 'Output quality ≈ 0.45 + 0.05 × skill. Higher skill also picks hooks and angles that fit the product.',
    defaults: { catalogId: '', autoProduce: true, format: 'auto', hook: 'auto', angle: 'auto' },
    config: [
      { key: 'catalogId', label: 'Product focus', kind: 'product', help: 'Leave on Auto to film for your best-selling product that has a sample or stock.' },
      { key: 'autoProduce', label: 'Film weekly quota automatically', kind: 'toggle', help: 'Off = only films briefs you send from CreatorHub.' },
    ],
  },
  media_buyer: {
    id: 'media_buyer', label: 'Media Buyer', plural: 'Media buyers', rate: [800, 2500], hoursPerWeek: [20, 40], weight: 0.15,
    summary: 'Every morning at 9 AM: kills ads burning past 2× break-even CPA, scales winners 15–20%, duplicates the best ad sets and rotates in fresh creatives.',
    skillNote: 'Low-skill buyers trust platform-reported numbers, make impulsive 40% budget jumps and kill ads too early. Great ones cross-check Shopifly sales and respect learning.',
    defaults: { platform: 'both', autoKill: true, autoScale: true, duplicateWinners: true, launchCreatives: true, maxDailyBudget: 1000 },
    config: [
      { key: 'platform', label: 'Platforms', kind: 'select', help: 'Which ad accounts they manage.', options: [{ value: 'both', label: 'Fadbook + TikTak' }, { value: 'fadbook', label: 'Fadbook only' }, { value: 'tiktak', label: 'TikTak only' }] },
      { key: 'autoKill', label: 'Pause losing ads', kind: 'toggle', help: 'Spend > 2× break-even CPA with ROAS < 0.7× break-even.' },
      { key: 'autoScale', label: 'Scale winners', kind: 'toggle', help: 'ROAS > 1.3× break-even → +15–20% budget.' },
      { key: 'duplicateWinners', label: 'Duplicate winning ad sets', kind: 'toggle', help: 'Clones ad sets holding > 1.6× break-even ROAS.' },
      { key: 'launchCreatives', label: 'Refresh creatives', kind: 'toggle', help: 'Adds your newest unused creative to any ad set running on fewer than 2 live ads.' },
      { key: 'maxDailyBudget', label: 'Max daily budget per ad set / campaign ($)', kind: 'number', help: 'They never scale past this.', min: 20, max: 50000, step: 10 },
    ],
  },
  designer: {
    id: 'designer', label: 'Store Designer', plural: 'Store designers', rate: [600, 1500], hoursPerWeek: [15, 30], weight: 0.13,
    summary: 'Polishes your theme and product pages: better design score on every product and a slightly faster store.',
    skillNote: '+2 page-design points per skill point on all products, −0.1 s load time.',
    defaults: {},
    config: [],
  },
  copywriter: {
    id: 'copywriter', label: 'Copywriter', plural: 'Copywriters', rate: [500, 1200], hoursPerWeek: [10, 25], weight: 0.12,
    summary: 'Unlocks "Rewrite with copywriter" in the product editor: benefit-led titles, descriptions and FAQs.',
    skillNote: 'Copy quality rises with skill. A great copywriter handles objections you didn\'t think of.',
    defaults: {},
    config: [],
  },
  ops_manager: {
    id: 'ops_manager', label: 'Operations Manager', plural: 'Operations managers', rate: [900, 2000], hoursPerWeek: [30, 40], weight: 0.14,
    summary: 'Watches 3PL stock, reorders bulk inventory at the reorder point, negotiates 5–10% off bulk COGS and stocks up before Chinese New Year.',
    skillNote: 'Better managers negotiate harder and forecast demand more accurately.',
    defaults: { autoReorder: true, shipMethod: 'auto', cnyStockUp: true, coverDays: 45 },
    config: [
      { key: 'autoReorder', label: 'Reorder automatically', kind: 'toggle', help: 'Places bulk orders when stock + inbound falls below the reorder point.' },
      { key: 'shipMethod', label: 'Freight', kind: 'select', help: 'Auto flies stock in only when you would otherwise run out.', options: [{ value: 'auto', label: 'Auto (sea, air if urgent)' }, { value: 'sea', label: 'Always sea' }, { value: 'air', label: 'Always air' }] },
      { key: 'coverDays', label: 'Days of stock per order', kind: 'number', help: 'Order size in days of sales.', min: 15, max: 120, step: 5 },
      { key: 'cnyStockUp', label: 'Stock up before Chinese New Year', kind: 'toggle', help: 'Orders extra inventory 5–10 weeks before factories close.' },
    ],
  },
}
export const STAFF_ROLE_LIST: StaffRoleDef[] = Object.values(STAFF_ROLES)

export interface Persona { portrait: string; name: string; country: string; city: string }

/** 3 personas per portrait (see docs/ART.md for who each portrait shows). */
export const PERSONAS: Persona[] = [
  { portrait: 'p01', name: 'Amara Okafor', country: 'Nigeria', city: 'Lagos' },
  { portrait: 'p01', name: 'Imani Brooks', country: 'United States', city: 'Atlanta, GA' },
  { portrait: 'p01', name: 'Zuri Mwangi', country: 'Kenya', city: 'Nairobi' },
  { portrait: 'p02', name: 'Jae-won Park', country: 'South Korea', city: 'Seoul' },
  { portrait: 'p02', name: 'Kenji Watanabe', country: 'Japan', city: 'Osaka' },
  { portrait: 'p02', name: 'Leo Chen', country: 'United States', city: 'San Jose, CA' },
  { portrait: 'p03', name: 'Marisol Vega', country: 'Mexico', city: 'Guadalajara' },
  { portrait: 'p03', name: 'Carmen Ruiz', country: 'Colombia', city: 'Medellín' },
  { portrait: 'p03', name: 'Valentina Ortega', country: 'Argentina', city: 'Buenos Aires' },
  { portrait: 'p04', name: 'Graham Whitfield', country: 'United Kingdom', city: 'Leeds' },
  { portrait: 'p04', name: 'Frank Dillard', country: 'United States', city: 'Columbus, OH' },
  { portrait: 'p04', name: 'Ian MacLeod', country: 'Canada', city: 'Halifax' },
  { portrait: 'p05', name: 'Ayesha Rahman', country: 'Bangladesh', city: 'Dhaka' },
  { portrait: 'p05', name: 'Sana Qureshi', country: 'Pakistan', city: 'Lahore' },
  { portrait: 'p05', name: 'Nadia Hussain', country: 'United Kingdom', city: 'Birmingham' },
  { portrait: 'p06', name: 'Marcus Bell', country: 'United States', city: 'Charlotte, NC' },
  { portrait: 'p06', name: 'Kwame Asante', country: 'Ghana', city: 'Accra' },
  { portrait: 'p06', name: 'Trevor Grant', country: 'Jamaica', city: 'Kingston' },
  { portrait: 'p07', name: 'Siobhan Kelly', country: 'Ireland', city: 'Galway' },
  { portrait: 'p07', name: 'Molly Brennan', country: 'United States', city: 'Boston, MA' },
  { portrait: 'p07', name: 'Hannah Cole', country: 'United Kingdom', city: 'Bristol' },
  { portrait: 'p08', name: 'Mei-Ling Wu', country: 'Taiwan', city: 'Taipei' },
  { portrait: 'p08', name: 'Grace Lin', country: 'United States', city: 'Seattle, WA' },
  { portrait: 'p08', name: 'Yuko Sato', country: 'Japan', city: 'Yokohama' },
  { portrait: 'p09', name: 'Omar Haddad', country: 'Jordan', city: 'Amman' },
  { portrait: 'p09', name: 'Karim Nassar', country: 'Lebanon', city: 'Beirut' },
  { portrait: 'p09', name: 'Youssef Amrani', country: 'Morocco', city: 'Casablanca' },
  { portrait: 'p10', name: 'River Jensen', country: 'United States', city: 'Portland, OR' },
  { portrait: 'p10', name: 'Jules Moreau', country: 'Canada', city: 'Montréal' },
  { portrait: 'p10', name: 'Ash Kowalski', country: 'Poland', city: 'Kraków' },
  { portrait: 'p11', name: 'Kristin Olsen', country: 'United States', city: 'Minneapolis, MN' },
  { portrait: 'p11', name: 'Heather Lindqvist', country: 'Sweden', city: 'Gothenburg' },
  { portrait: 'p11', name: 'Megan Albright', country: 'Australia', city: 'Brisbane' },
  { portrait: 'p12', name: 'Diego Ramírez', country: 'United States', city: 'San Antonio, TX' },
  { portrait: 'p12', name: 'Luis Santana', country: 'Dominican Republic', city: 'Santo Domingo' },
  { portrait: 'p12', name: 'Andrés Molina', country: 'Mexico', city: 'Monterrey' },
  { portrait: 'p13', name: 'Gloria Washington', country: 'United States', city: 'Detroit, MI' },
  { portrait: 'p13', name: 'Thandiwe Nkosi', country: 'South Africa', city: 'Johannesburg' },
  { portrait: 'p13', name: 'Bernice Clarke', country: 'Jamaica', city: 'Montego Bay' },
  { portrait: 'p14', name: 'Rajesh Iyer', country: 'India', city: 'Bengaluru' },
  { portrait: 'p14', name: 'Arjun Mehta', country: 'India', city: 'Pune' },
  { portrait: 'p14', name: 'Sanjay Perera', country: 'Sri Lanka', city: 'Colombo' },
  { portrait: 'p15', name: 'Maria Santos', country: 'Philippines', city: 'Cebu City' },
  { portrait: 'p15', name: 'Putri Wijaya', country: 'Indonesia', city: 'Bandung' },
  { portrait: 'p15', name: 'Linh Nguyen', country: 'Vietnam', city: 'Ho Chi Minh City' },
  { portrait: 'p16', name: 'Margaret Hale', country: 'United States', city: 'Tucson, AZ' },
  { portrait: 'p16', name: 'Judith Byrne', country: 'Canada', city: 'Victoria' },
  { portrait: 'p16', name: 'Carol Jennings', country: 'New Zealand', city: 'Christchurch' },
  { portrait: 'p17', name: 'Tyler Begay', country: 'United States', city: 'Albuquerque, NM' },
  { portrait: 'p17', name: 'Nathan Yazzie', country: 'United States', city: 'Flagstaff, AZ' },
  { portrait: 'p17', name: 'Mateo Quispe', country: 'Peru', city: 'Cusco' },
  { portrait: 'p18', name: 'David Liu', country: 'Canada', city: 'Vancouver' },
  { portrait: 'p18', name: 'Kevin Zhang', country: 'United States', city: 'Irvine, CA' },
  { portrait: 'p18', name: 'Hiroshi Tanaka', country: 'Japan', city: 'Fukuoka' },
]

export type SkillTier = 'junior' | 'mid' | 'senior'
export const skillTier = (skill: number): SkillTier => (skill <= 3 ? 'junior' : skill <= 7 ? 'mid' : 'senior')

/** UpWorx headline per role and tier. */
export const HEADLINES: Record<StaffRole, Record<SkillTier, string[]>> = {
  va: {
    junior: ['E-commerce VA | Fast learner, available US hours', 'Virtual Assistant — email & chat support'],
    mid: ['Shopifly Customer Support VA | WISMO, refunds, macros', 'E-com Support Specialist — 3 yrs dropshipping stores'],
    senior: ['Top Rated CX Lead | 7-figure DTC brands | Chargeback evidence', 'Senior E-com VA — inbox zero daily, dispute win-rate 70%+'],
  },
  ugc_creator: {
    junior: ['UGC creator — relatable, unpolished, affordable', 'New UGC creator | Home & lifestyle'],
    mid: ['UGC Creator | Demos, POV hooks, testimonials', 'Native-style UGC for TikTak & Instaglam Reels'],
    senior: ['Top UGC Creator | 300+ ads shipped | Scroll-stopping hooks', 'Performance UGC — hooks tested on $2M+ spend'],
  },
  media_buyer: {
    junior: ['Fadbook Ads specialist | Beginner-friendly rates', 'Junior media buyer — certified, eager to prove results'],
    mid: ['Media Buyer | Fadbook + TikTak | DTC & dropshipping', 'Paid social buyer — testing frameworks, ROAS-focused'],
    senior: ['Senior Media Buyer | $15M+ managed | Scaling without breaking learning', 'Performance Marketer — profitable scaling on Fadbook & TikTak'],
  },
  designer: {
    junior: ['Shopifly theme designer — clean & simple', 'Web designer | Shopifly & landing pages'],
    mid: ['Shopifly CRO Designer | Product pages that convert', 'E-commerce UI designer — mobile-first product pages'],
    senior: ['Top Rated Shopifly CRO Expert | +30% CVR case studies', 'Senior Conversion Designer | 150+ stores redesigned'],
  },
  copywriter: {
    junior: ['Product description writer | Quick turnaround', 'Copywriter — e-commerce & social captions'],
    mid: ['DTC Copywriter | Product pages, emails, ad copy', 'Conversion copywriter — benefits over features'],
    senior: ['Direct-Response Copywriter | Pages that sell | 9-figure brands', 'Senior DTC Copywriter — objection-crushing product pages'],
  },
  ops_manager: {
    junior: ['Operations assistant — supplier follow-ups & tracking', 'E-com ops coordinator | Order management'],
    mid: ['E-commerce Ops Manager | Sourcing agents, 3PL, forecasting', 'Supply chain coordinator — China sourcing & freight'],
    senior: ['Senior Ops Lead | 3PL + China supply chain | CNY planning', 'Operations Director (fractional) — inventory for 8-figure DTC'],
  },
}

/** Profile bios. Tokens: {years} {city} {country} {hours} */
export const BIOS: Record<StaffRole, Record<SkillTier, string[]>> = {
  va: {
    junior: [
      'Hi! I\'m based in {city} and just started freelancing after two years in a call center. I type fast, I\'m patient with upset customers, and I\'m available during US business hours. I\'m still learning Shopifly but I pick things up quickly.',
      'Customer service is my thing — I worked retail for {years} years before going remote. I can answer emails and chats, update orders and keep a spreadsheet of issues. Looking for my first long-term e-commerce client.',
    ],
    mid: [
      '{years} years supporting dropshipping and DTC stores (50–300 orders/day). I write macros for "where is my order" tickets, handle refund and replacement requests inside your policy, and keep first response under 4 hours. Comfortable in Shopifly, Gorgeous helpdesk and TrackWise.',
      'I run support for two Shopifly stores from {city}. Tickets, returns, supplier follow-ups and tagging customers who might dispute. I flag patterns ("12 people say the zipper breaks") so you can fix the product, not just the ticket.',
    ],
    senior: [
      'CX lead for 7-figure brands for {years} years. I keep inboxes at zero daily, write the macros your future team will use, and assemble chargeback evidence packets (tracking, delivery scans, policy screenshots, customer comms) — my dispute win-rate last year was above 70%. Weekly report every Monday.',
      'Top Rated on UpWorx with 100% job success. I\'ve built support playbooks for stores doing 1,000+ orders/day, cut refund rates by answering WISMO before it becomes a dispute, and fight chargebacks with evidence banks win on. Based in {city}, overlap with US hours.',
    ],
  },
  ugc_creator: {
    junior: [
      'Hey! I make casual, real-feeling videos from my apartment in {city}. Phone + ring light, lots of energy. I\'m building my portfolio so my rates are low — happy to film demos, unboxings and "POV" style clips.',
      'New UGC creator, mom of two, very comfortable on camera. My videos feel like a friend recommending something, not an ad. I film in natural light and can turn around videos within a few days of the product arriving.',
    ],
    mid: [
      '{years} years making UGC for home, pet and beauty brands. I script my own hooks, film multiple openers per concept so you can test them, and deliver raw + edited files. My best ad ran for 4 months at a 38% hook rate.',
      'Native-style UGC that doesn\'t look like an ad: problem → demo → honest reaction. I\'ve made 120+ videos for dropshipping stores and know the first 2 seconds matter more than the rest.',
    ],
    senior: [
      'Performance UGC creator — 300+ ads shipped, several scaled past $5k/day. I study the product\'s reviews before filming, pick the angle that matches the buyer\'s pain, and deliver 3 hook variations per video. Studio lighting, lav audio, color-graded.',
      'Former agency creative strategist, now filming full-time from {city}. I don\'t just shoot what you send — I tell you which hook and angle to test first and why. Clients keep me for years.',
    ],
  },
  media_buyer: {
    junior: [
      'Fadbook Ads certified and I\'ve run ads for two local businesses. I follow a testing framework and send daily reports. Still building my track record, so I\'m priced accordingly.',
      'I\'ve managed about $20k in ad spend for small shops. I\'m good at launching campaigns quickly and I check them every day. I\'m learning scaling strategies and would love to grow with your store.',
    ],
    mid: [
      '{years} years buying Fadbook and TikTak ads for DTC and dropshipping stores (~$1.5M managed). Structured creative testing, clear kill rules, and scaling in 15–20% steps so learning doesn\'t reset. I report ROAS against your break-even, not vanity metrics.',
      'Media buyer focused on profitable scaling. I use broad targeting with strong creatives, kill losers fast at 2× break-even CPA, and duplicate winners instead of shocking budgets. Weekly video recap included.',
    ],
    senior: [
      'Senior buyer, $15M+ managed across Fadbook and TikTak. I never trust platform-reported ROAS alone — I reconcile against Shopifly sales daily. I respect learning phases, scale in controlled steps, and protect your cash flow when the card is tight.',
      'Ex-agency head of paid social. I\'ve scaled 14 stores past $10k/day. My rule: data before decisions — no ad gets killed before it spends its break-even CPA, and no budget jumps more than 20%. Based in {city}, available in US mornings.',
    ],
  },
  designer: {
    junior: [
      'Web designer in {city}. I can set up your theme, pick fonts and colors, and make product pages look clean on mobile. Quick turnaround and unlimited small revisions.',
      'Graphic design grad specializing in Shopifly themes. I make simple, tidy stores and custom banners in Canvo.',
    ],
    mid: [
      '{years} years designing Shopifly stores with conversion in mind: sticky add-to-cart, benefit icons, trust sections, fast-loading images. I test every page on a real phone before handing it over.',
      'E-commerce UI designer. I rebuild product pages around the buyer\'s questions — what is it, does it work, can I trust you — and keep load times low by compressing everything.',
    ],
    senior: [
      'Top Rated Shopifly CRO designer with 150+ stores redesigned. Case studies with +18% to +34% conversion lifts. I combine design, page speed and trust signals, and I document everything so your team can maintain it.',
      'Senior conversion designer, formerly at a DTC agency. I design for mobile first (78% of your traffic), shave seconds off load time and build pages that look like a brand, not a dropshipper.',
    ],
  },
  copywriter: {
    junior: [
      'I write product descriptions, captions and short emails. English literature graduate from {city} with a knack for making ordinary products sound interesting.',
      'Freelance writer building my e-commerce portfolio. Fast, reliable and happy to take feedback.',
    ],
    mid: [
      '{years} years writing DTC product pages and ad copy. I lead with benefits, answer objections in the copy and FAQ, and write titles people actually search for — never supplier keyword soup.',
      'Conversion copywriter: product pages, email flows, ad primary text. I interview your reviews before I write a word, so the copy speaks your customer\'s language.',
    ],
    senior: [
      'Direct-response copywriter for 9-figure brands. My product pages turn features into outcomes, handle every buying objection and make the guarantee impossible to miss. Past pages lifted conversion 20%+.',
      'Senior DTC copywriter trained in classic direct response. I write the page, the FAQ, the email flow and three ad angles to test. Clients hire me when "good enough" copy stops converting.',
    ],
  },
  ops_manager: {
    junior: [
      'Operations assistant from {city}. I chase suppliers, update tracking, keep your order spreadsheet tidy and flag stock problems early.',
      'Organized and detail-oriented. I\'ve coordinated orders for a small online shop and I\'m learning inventory planning and freight.',
    ],
    mid: [
      '{years} years coordinating China sourcing agents, 3PLs and freight forwarders for DTC brands. I forecast from your sales velocity, reorder before stockouts, and negotiate unit costs down on repeat orders.',
      'E-commerce ops manager. I set reorder points, manage sea vs. air freight decisions and keep a buffer for Chinese New Year — the month that kills unprepared stores.',
    ],
    senior: [
      'Fractional operations director for 8-figure DTC brands. Supplier negotiation (typically 8–10% off bulk COGS), demand forecasting, 3PL management and CNY stock-up planning starting 10 weeks out. I speak Mandarin and visit factories twice a year.',
      'Senior supply-chain lead with {years} years in consumer goods. I keep stockouts near zero without tying up cash in dead inventory, and I plan freight around peak season and factory shutdowns.',
    ],
  },
}

/** UpWorx client marketplace fee on freelancer payments */
export const UPWORX_FEE_PCT = 0.05
export const STAFF_RULES = {
  candidatesPerWeek: [5, 8] as [number, number],
  maxTeam: 12,
  /** VA workday (local hours [from, to)) */
  vaHours: [9, 17] as [number, number],
  ticketsPerSkillPerDay: 15,
  /** days of unpaid salary before a freelancer walks */
  unpaidQuitDays: 3,
  moraleTarget: 70,
  quitMorale: 20,
  /** media buyer daily review hour */
  mediaBuyerHour: 9,
}
