// Creator & work gear sold on Amazin. Icons: public/assets/gear/<id>.webp via gearImage(id).
// Prices are 2026 US street prices for the real-world equivalent (parody names only).
// OWNER: sim-life-finance.
import type { GearSlot } from '../core/types'

export interface GearDef {
  id: string
  name: string
  /** parody maker shown on the listing */
  brand: string
  slot: GearSlot
  price: number
  rating: number
  reviews: number
  /** Amazin "Prime-ish" fast delivery badge */
  prime: boolean
  /** self-shot creative quality bonus (phone & camera don't stack: the better capture device is used) */
  filmQuality: number
  /** extra quality only on formats where someone talks to camera (lav mic) */
  talkingBonus?: number
  /** multiplier on filming time (phone-pro 0.9 = 10% faster) */
  filmTimeMult?: number
  /** computer: multiplier on business-task durations (lower = faster) */
  productivity?: number
  /** computer: edit-quality bonus on creatives you cut yourself */
  editBonus?: number
  description: string
  bullets: string[]
  /** starter item you already own (not sold) */
  starter?: boolean
}

export const GEAR: GearDef[] = [
  {
    id: 'phone-cracked', name: 'Your Phone (cracked screen)', brand: 'Pear', slot: 'phone', price: 0, rating: 2.1, reviews: 1, prime: false,
    filmQuality: 0, filmTimeMult: 1, starter: true,
    description: 'Four years old, a spiderweb crack across the lens corner, and 11% battery health. It films. Technically.',
    bullets: ['1080p video (when it doesn\'t overheat)', 'Cracked glass adds a free "vintage haze"', 'Storage: 2 GB free after deleting everything'],
  },
  {
    id: 'phone-pro', name: 'Pear Phone 17 Pro, 256 GB', brand: 'Pear', slot: 'phone', price: 1099, rating: 4.7, reviews: 38412, prime: true,
    filmQuality: 0.12, filmTimeMult: 0.9,
    description: 'The phone every UGC creator actually shoots on. 4K60 HDR, cinematic stabilization and a mic array good enough for voiceovers.',
    bullets: ['4K 60fps Dolby-style HDR video', 'Action-mode stabilization', 'Shoot, edit and export on the device (films ~10% faster)', 'Triple camera with 5× telephoto for macro product shots'],
  },
  {
    id: 'ring-light', name: 'Halo 18" LED Ring Light with Tripod Stand', brand: 'Lumiglo', slot: 'lighting', price: 39, rating: 4.5, reviews: 91233, prime: true,
    filmQuality: 0.05,
    description: 'The classic creator starter light. Even, flattering front light and a phone holder in the middle.',
    bullets: ['3 color modes, 10 brightness levels', '62" adjustable tripod + phone clamp', 'Bluetooth remote shutter'],
  },
  {
    id: 'softbox-kit', name: 'StudioPro 2-Softbox Continuous Lighting Kit', brand: 'Lumiglo', slot: 'lighting', price: 189, rating: 4.6, reviews: 12870, prime: true,
    filmQuality: 0.1,
    description: 'Two 24" softboxes with 5600K bulbs. Soft, shadow-free product light that makes $8 gadgets look like $80 ones.',
    bullets: ['2 × 24" softboxes with diffusers', '5600K daylight-balanced 85W LED bulbs', 'Air-cushioned stands up to 80"', 'Carry bag included'],
  },
  {
    id: 'mirrorless-camera', name: 'Sonee Vlog-10 Mirrorless Creator Kit', brand: 'Sonee', slot: 'camera', price: 1298, rating: 4.8, reviews: 6541, prime: true,
    filmQuality: 0.12,
    description: 'APS-C mirrorless with a 16-50mm kit lens, flip screen and real background blur. Replaces your phone as the camera when filming.',
    bullets: ['24MP APS-C sensor, 4K30 oversampled video', 'Product showcase autofocus mode', 'Flip-out selfie screen', 'Kit lens 16–50mm'],
  },
  {
    id: 'laptop-old', name: 'Your 2017 Laptop', brand: 'Dellish', slot: 'computer', price: 0, rating: 2.8, reviews: 1, prime: false,
    productivity: 1.25, filmQuality: 0, starter: true,
    description: 'Fans spin up when you open a second browser tab. Everything takes a little longer on this thing.',
    bullets: ['8 GB RAM, 128 GB SSD (full)', 'Battery lasts 40 minutes', 'Business tasks take 25% longer'],
  },
  {
    id: 'laptop-pro', name: 'PearBook Pro 14" (M-series, 32 GB)', brand: 'Pear', slot: 'computer', price: 1999, rating: 4.8, reviews: 22109, prime: true,
    productivity: 1.0, filmQuality: 0,
    description: 'Fast, silent, all-day battery. Ads Manager with 40 tabs open and a 4K edit in the background — no problem.',
    bullets: ['32 GB unified memory, 1 TB SSD', '18-hour battery life', 'Business tasks at normal speed (vs. 25% slower on your old laptop)'],
  },
  {
    id: 'workstation', name: 'Titan X9 Creator Workstation + 2 × 27" 4K Monitors', brand: 'Titan', slot: 'computer', price: 3499, rating: 4.7, reviews: 3318, prime: false,
    productivity: 0.85, filmQuality: 0, editBonus: 0.03,
    description: 'A 16-core tower with a creator GPU and dual 4K screens. Research, support and editing all go faster, and your cuts look sharper.',
    bullets: ['16-core CPU, 64 GB RAM, 2 TB NVMe', 'Creator GPU for fast 4K exports', 'Dual 27" 4K monitors included', 'Business tasks 15% faster, +0.03 edit quality'],
  },
  {
    id: 'lav-mic', name: 'Roadie Wireless Lav Mic (2-pack, USB-C)', brand: 'Roadie', slot: 'audio', price: 79, rating: 4.4, reviews: 18760, prime: true,
    filmQuality: 0, talkingBonus: 0.04,
    description: 'Clip-on wireless mics with noise cancellation. Clean voice audio matters most when you talk to camera.',
    bullets: ['2 transmitters + 1 receiver', '60 m range, 8-hour battery', 'Built-in noise cancellation', 'Improves talking formats (testimonials, green screen, founder story)'],
  },
]

export const GEAR_SLOTS: { slot: GearSlot; label: string }[] = [
  { slot: 'phone', label: 'Phone' },
  { slot: 'camera', label: 'Camera' },
  { slot: 'lighting', label: 'Lighting' },
  { slot: 'audio', label: 'Audio' },
  { slot: 'computer', label: 'Computer' },
]

export const gearDef = (id: string): GearDef | undefined => GEAR.find(g => g.id === id)
