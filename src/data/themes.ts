// Shopifly Theme Store — parody of the Shopify theme store.
// OWNER: sim-store. Read by the page grader (load time, design, built-ins) and the
// Online Store / Theme Editor UI. Numbers are game-tuned to real theme behaviour:
// free "Dawn"-style themes are fast and plain; premium conversion themes add
// built-in sticky add-to-cart / trust icons / quantity breaks at the cost of weight.

export interface ThemePreset {
  name: string
  primaryColor: string
  background: string
  accent: string
  font: string
}

export interface ThemeDef {
  id: string
  name: string
  developer: string
  /** one-time price in USD (0 = free) */
  price: number
  /** baseline product-page load time in seconds (mobile, 4G) */
  loadTime: number
  /** 0..100 visual design / polish score used by the page grader */
  design: number
  tagline: string
  description: string
  /** bullet list shown on the theme's store page */
  features: string[]
  /** conversion features that work without an app */
  builtIn: { stickyAtc?: boolean; trustBadges?: boolean; quantityBreaks?: boolean }
  presets: ThemePreset[]
  /** Theme Store review stats */
  positivePct: number
  reviews: number
  version: string
  /** "Best for" chips */
  industries: string[]
  /** catalog size the layout is built for */
  catalogSize: 'small' | 'medium' | 'large'
}

export const THEMES: ThemeDef[] = [
  {
    id: 'dawnish',
    name: 'Dawnish',
    developer: 'Shopifly',
    price: 0,
    loadTime: 1.8,
    design: 60,
    tagline: 'A clean, fast foundation for any store.',
    description:
      'Dawnish is the reference theme every new Shopifly store starts on. It is minimal, accessible and very fast, ' +
      'but it gives you nothing beyond the basics: no sticky cart button, no trust icons, no bundles. What converts ' +
      'is up to the sections and apps you add.',
    features: ['Mega menu', 'Product image zoom', 'Quick buy', 'Color swatches', 'Predictive search', 'Cart drawer'],
    builtIn: {},
    presets: [
      { name: 'Default', primaryColor: '#121212', background: '#ffffff', accent: '#334fb4', font: 'Assistant' },
      { name: 'Ember', primaryColor: '#1f1f1f', background: '#fff8f2', accent: '#c2410c', font: 'Inter' },
      { name: 'Mint', primaryColor: '#0f3d3e', background: '#f4fbf8', accent: '#10b981', font: 'DM Sans' },
    ],
    positivePct: 90,
    reviews: 1872,
    version: '15.2.0',
    industries: ['Any'],
    catalogSize: 'small',
  },
  {
    id: 'sensed',
    name: 'Sensed',
    developer: 'Shopifly',
    price: 0,
    loadTime: 1.9,
    design: 64,
    tagline: 'Soft gradients and rounded shapes for beauty and wellness brands.',
    description:
      'Sensed adds warmer typography, rounded cards and gradient backgrounds on top of the Dawnish core. It looks a ' +
      'little more "brand" out of the box with almost no speed cost. Conversion features still come from sections and apps.',
    features: ['Gradient color schemes', 'Rounded image cards', 'Collapsible content rows', 'Quick buy', 'Cart drawer', 'Blog'],
    builtIn: {},
    presets: [
      { name: 'Default', primaryColor: '#2b1f33', background: '#fdf7f4', accent: '#e56b8a', font: 'Nunito Sans' },
      { name: 'Lavender', primaryColor: '#2e2553', background: '#f6f3ff', accent: '#8b5cf6', font: 'Nunito Sans' },
    ],
    positivePct: 88,
    reviews: 694,
    version: '15.2.0',
    industries: ['Beauty', 'Health & wellness'],
    catalogSize: 'small',
  },
  {
    id: 'studioish',
    name: 'Studioish',
    developer: 'Shopifly',
    price: 0,
    loadTime: 2.0,
    design: 58,
    tagline: 'Editorial layout for makers and artists.',
    description:
      'A magazine-style free theme with big typography and lots of whitespace. It looks good for handmade brands, ' +
      'but the long editorial layout pushes the buy button below the fold on phones.',
    features: ['Editorial image layouts', 'Video hero', 'Blog-first navigation', 'Cart page', 'Collapsible rows'],
    builtIn: {},
    presets: [{ name: 'Default', primaryColor: '#1d1d1b', background: '#f5f2ec', accent: '#9a3412', font: 'Libre Baskerville' }],
    positivePct: 81,
    reviews: 212,
    version: '15.1.0',
    industries: ['Art & photography', 'Handmade'],
    catalogSize: 'small',
  },
  {
    id: 'shrined',
    name: 'Shrined',
    developer: 'Shrinecraft Labs',
    price: 250,
    loadTime: 2.0,
    design: 80,
    tagline: 'The high-converting theme built for one-product stores.',
    description:
      'Shrined is built for single-product and small-catalog stores. It ships with a sticky add-to-cart bar, trust ' +
      'badges under the buy button, animated benefit icons and a clean product layout, so you need fewer apps. ' +
      'One-time purchase, free updates.',
    features: ['Built-in sticky add to cart', 'Built-in trust badges', 'Benefit icon rows', 'Product tabs', 'Cart upsells', 'Announcement bar with timer'],
    builtIn: { stickyAtc: true, trustBadges: true },
    presets: [
      { name: 'Default', primaryColor: '#111827', background: '#ffffff', accent: '#16a34a', font: 'Poppins' },
      { name: 'Luxe', primaryColor: '#1c1917', background: '#faf7f2', accent: '#b45309', font: 'Playfair Display' },
      { name: 'Ocean', primaryColor: '#0c4a6e', background: '#f0f9ff', accent: '#0284c7', font: 'Poppins' },
    ],
    positivePct: 96,
    reviews: 3410,
    version: '1.4.2',
    industries: ['Dropshipping', 'Single product', 'Gadgets'],
    catalogSize: 'small',
  },
  {
    id: 'impulsive',
    name: 'Impulsive',
    developer: 'Archetypal Themes',
    price: 350,
    loadTime: 2.2,
    design: 86,
    tagline: 'Promotions-first theme for high-volume stores.',
    description:
      'Impulsive is made for stores that run promotions. Quantity-break bundles and a sticky add-to-cart are built ' +
      'in, and it has a polished, fashion-grade product page. It is heavier than the free themes, so watch your app count.',
    features: ['Built-in quantity breaks', 'Built-in sticky add to cart', 'Promo tiles', 'Color swatches', 'Size chart drawer', 'Advanced filtering'],
    builtIn: { stickyAtc: true, quantityBreaks: true },
    presets: [
      { name: 'Default', primaryColor: '#000000', background: '#ffffff', accent: '#e11d48', font: 'Archivo' },
      { name: 'Bold', primaryColor: '#111111', background: '#fffbeb', accent: '#f59e0b', font: 'Archivo' },
    ],
    positivePct: 94,
    reviews: 1285,
    version: '8.0.1',
    industries: ['Fashion', 'Home & garden', 'High volume'],
    catalogSize: 'large',
  },
  {
    id: 'prestigio',
    name: 'Prestigio',
    developer: 'Maestro & Co',
    price: 400,
    loadTime: 2.6,
    design: 84,
    tagline: 'Luxury look for premium brands.',
    description:
      'An upscale theme with parallax heroes, video backgrounds and serif typography. It signals "premium" and suits ' +
      'high-ticket products, but all that motion is heavy. Expect a slower product page unless you trim apps.',
    features: ['Parallax hero', 'Video backgrounds', 'Lookbooks', 'Store locator', 'Quick view', 'Mega menu with images'],
    builtIn: {},
    presets: [
      { name: 'Noir', primaryColor: '#0a0a0a', background: '#f7f5f0', accent: '#a16207', font: 'Cormorant Garamond' },
      { name: 'Ivory', primaryColor: '#292524', background: '#fffdf8', accent: '#78716c', font: 'Cormorant Garamond' },
    ],
    positivePct: 92,
    reviews: 988,
    version: '10.3.0',
    industries: ['Luxury', 'Jewelry', 'High-ticket'],
    catalogSize: 'medium',
  },
  {
    id: 'motionly',
    name: 'Motionly',
    developer: 'Kinetic Studio',
    price: 380,
    loadTime: 2.9,
    design: 88,
    tagline: 'Scroll animations that make your products move.',
    description:
      'The best-looking theme in the store, built around scroll-triggered animations and full-bleed video. Great in a ' +
      'demo. On a mid-range phone over 4G the product page is noticeably slower, and every second over ~2.5s costs you sales.',
    features: ['Scroll-triggered animations', 'Full-bleed video sections', 'Animated product gallery', 'Sticky header', 'Before/after slider'],
    builtIn: {},
    presets: [
      { name: 'Default', primaryColor: '#0b0b0f', background: '#ffffff', accent: '#6d28d9', font: 'Space Grotesk' },
      { name: 'Neon', primaryColor: '#e5e7eb', background: '#0b0b0f', accent: '#22d3ee', font: 'Space Grotesk' },
    ],
    positivePct: 89,
    reviews: 431,
    version: '3.2.4',
    industries: ['Gadgets', 'Tech', 'Lifestyle'],
    catalogSize: 'medium',
  },
]

export const DEFAULT_THEME_ID = 'dawnish'

export function themeDef(id: string): ThemeDef {
  return THEMES.find(t => t.id === id) ?? THEMES[0]
}
