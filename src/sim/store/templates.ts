// Player-facing text templates: support tickets, store policies, dispute reasons.
import type { Chargeback, GameState, SupportTicket } from '../../core/types'
import { pick, type RngHolder } from '../../core/rng'
import { supportEmail } from './util'

export interface TicketVars { first: string; order: number; product: string; days: number; promise: string }
type Tpl = { subject: string; body: string }

const TICKETS: Record<SupportTicket['kind'], Tpl[]> = {
  wismo: [
    { subject: 'Where is my order #{order}?', body: 'Hi, I ordered the {product} {days} days ago and it still hasn\'t arrived. The tracking hasn\'t moved in a week. Can you tell me when I\'ll actually get it?\n\n{first}' },
    { subject: 'Order #{order} status', body: 'Hello, just checking on my order. It\'s been {days} days. Is it still coming? Thanks, {first}' },
    { subject: 'Still waiting on my package', body: 'Your site said {promise}. It\'s now been {days} days and nothing. Please send me an update.\n\n- {first}' },
    { subject: 'Tracking not updating', body: 'The tracking number for order #{order} just says "In transit" and hasn\'t changed in days. Where is my package?\n\n{first}' },
    { subject: 'Has my order shipped?', body: 'Hi there! I haven\'t received a shipping update for #{order} ({product}). Can you confirm it\'s on the way? {first}' },
  ],
  defect: [
    { subject: 'Product stopped working', body: 'Hi, my {product} stopped working after two days. It won\'t turn on at all. What can you do? Order #{order}.\n\n{first}' },
    { subject: 'Item arrived damaged', body: 'The package came today and the {product} was cracked on one side. I\'d like a replacement please. Order #{order}.' },
    { subject: 'Not like the pictures', body: 'Honestly this looks nothing like the photos on your website. It feels really cheap. Pretty disappointed. - {first}' },
    { subject: 'Missing piece in my order', body: 'Opened order #{order} and one of the parts is missing. Can you send it? Thanks, {first}' },
    { subject: 'Doesn\'t work as shown', body: 'I tried the {product} several times and it doesn\'t do what the video showed. Is there a trick to it or is mine defective?\n\n{first}' },
  ],
  refund_request: [
    { subject: 'Refund request for #{order}', body: 'Hi, I\'d like a refund for my {product}. It doesn\'t work the way the ad showed. How do I return it?\n\n{first}' },
    { subject: 'I want my money back', body: 'It took {days} days to get here and it barely works. Please refund me. Order #{order}.' },
    { subject: 'Return / refund', body: 'Hello, the {product} isn\'t for me. Can I get a refund? Order #{order}. Thank you, {first}' },
    { subject: 'Refund please', body: 'Received my order but the quality is really poor. I\'d like a full refund. - {first}' },
  ],
  angry: [
    { subject: 'Is this a scam??', body: 'It\'s been {days} days. No package, no reply to my emails. If I don\'t hear back in 24 hours I\'m disputing the charge with my bank.\n\n{first}' },
    { subject: 'Terrible experience', body: 'Your website said {promise}. It\'s been {days} days. This is ridiculous. Refund me now or I\'m filing a chargeback.' },
    { subject: 'Final warning before I call my bank', body: 'Order #{order}. Nothing received and nobody answers. I\'m done waiting.\n\n{first}' },
  ],
  question: [
    { subject: 'Can I change my shipping address?', body: 'Hi! I just placed order #{order} and realized I used my old address. Can you update it before it ships? Thanks! {first}' },
    { subject: 'Question about my order', body: 'Hey, does the {product} come with instructions? And roughly when will it ship? {first}' },
    { subject: 'Add another one to my order?', body: 'Can I add a second {product} to order #{order}? It\'s going to be a gift. Thanks, {first}' },
    { subject: 'Gift receipt?', body: 'Hi, this is a present. Can you leave the receipt out of the package? Order #{order}. {first}' },
    { subject: 'Discount code didn\'t work', body: 'I tried to use a discount code at checkout but it didn\'t apply. Can you refund the difference? Order #{order}. - {first}' },
  ],
}

function fill(t: string, v: TicketVars): string {
  return t
    .replace(/\{first\}/g, v.first)
    .replace(/\{order\}/g, String(v.order))
    .replace(/\{product\}/g, v.product)
    .replace(/\{days\}/g, String(v.days))
    .replace(/\{promise\}/g, v.promise)
}

export function ticketText(s: RngHolder, kind: SupportTicket['kind'], v: TicketVars): Tpl {
  const t = pick(s, TICKETS[kind])
  return { subject: fill(t.subject, v), body: fill(t.body, v) }
}

/** Canned replies shown in the Inbox reply box (UI), keyed by resolution. */
export const REPLY_TEMPLATES: Record<NonNullable<SupportTicket['resolution']>, string> = {
  answered: 'Hi {first}, thanks for reaching out! Here is the latest tracking for your order #{order}. It\'s on its way and should arrive soon. We\'re here if you need anything else.',
  refunded: 'Hi {first}, I\'m sorry the product didn\'t work out. I\'ve issued a full refund to your original payment method. It should appear within 5–10 business days.',
  replacement: 'Hi {first}, so sorry about that! We\'re sending you a replacement right away, free of charge. You\'ll get a new tracking number by email.',
  partial_refund: 'Hi {first}, sorry for the trouble. As an apology we\'ve refunded part of your order. Please keep the item, and let us know if there\'s anything else we can do.',
}

// ---- disputes ----
export const DISPUTE_REASON_TEXT: Record<Chargeback['reason'], string> = {
  not_received: 'Product not received: the cardholder says the order never arrived.',
  not_as_described: 'Product unacceptable: the cardholder says the item was defective or not as described.',
  fraudulent: 'Fraudulent: the cardholder says they did not authorize this payment.',
  unrecognized: 'Unrecognized: the cardholder doesn\'t recognize the charge on their statement.',
}

// ---- policies ----
export type PolicyKind = keyof GameState['store']['policies']

export function policyTemplate(s: GameState, kind: PolicyKind, window: [number, number] | null): string {
  const st = s.store
  const name = st.name || 'Our store'
  const email = supportEmail(s)
  const domain = st.customDomain ?? st.subdomain
  const ship = window ? `${window[0]}–${window[1]} days` : '10–20 days'
  switch (kind) {
    case 'refund':
      return [
        `${name} Refund Policy`,
        '',
        'We offer a 30-day money-back guarantee. If you are not happy with your purchase for any reason, contact us within 30 days of delivery and we will make it right with a refund or a replacement.',
        '',
        'Damaged or defective items: email us a photo within 30 days of delivery and we will send a free replacement or issue a full refund. You will not need to return a defective item.',
        '',
        'Returns: unused items in their original packaging can be returned within 30 days of delivery. Email us first for the return address. Refunds are issued to the original payment method within 5 business days of receiving the return and usually appear within 5–10 business days.',
        '',
        `Questions? Email ${email}. We reply within 24 hours on business days.`,
      ].join('\n')
    case 'shipping':
      return [
        `${name} Shipping Policy`,
        '',
        'All orders ship free with tracking.',
        '',
        `Processing: orders are processed within 1–3 business days. Delivery: most orders arrive within ${ship} of purchase. During holidays and peak periods, allow a few extra days.`,
        '',
        'Tracking: you will receive a tracking number by email as soon as your order ships. Tracking may take 2–5 days to show movement while your parcel moves between carriers.',
        '',
        'Customs: we ship to the United States. Any import duties are included in your price.',
        '',
        `Lost or late orders: if your order has not arrived within ${window ? window[1] + 5 : 25} days, email ${email} and we will reship it or refund you in full.`,
      ].join('\n')
    case 'privacy':
      return [
        `${name} Privacy Policy`,
        '',
        `This policy explains how ${name} ("we") collects, uses and shares your personal information when you visit or buy from ${domain}.`,
        '',
        'Information we collect: contact and shipping details you give us at checkout, order history, and device and browsing data collected with cookies and pixels (including advertising pixels from our marketing partners).',
        '',
        'How we use it: to fulfill and ship your order, to communicate with you about your order, to prevent fraud, and, with your consent, to send marketing emails you can unsubscribe from at any time.',
        '',
        'Sharing: we share information with service providers that help us run the store (payment processing, fulfillment partners, email and advertising platforms). We never sell your personal information.',
        '',
        `Your rights: you can request access to, correction of, or deletion of your personal information by emailing ${email}.`,
      ].join('\n')
    case 'terms':
      return [
        `${name} Terms of Service`,
        '',
        `By visiting ${domain} or purchasing from us, you agree to these terms.`,
        '',
        'Products: we try to show colors and details as accurately as possible, but screens vary. Prices and availability may change without notice. We may limit quantities or cancel orders we suspect are fraudulent.',
        '',
        'Payment: payment is taken at checkout. All prices are in US dollars.',
        '',
        'Returns and refunds are handled as described in our Refund Policy. Shipping is handled as described in our Shipping Policy.',
        '',
        'Liability: to the extent permitted by law, our liability is limited to the amount you paid for the product.',
        '',
        `Contact: ${email}`,
      ].join('\n')
    case 'contact':
      return [
        `Email: ${email}`,
        'Support hours: Monday–Friday, 9am–6pm ET (we reply within 24 hours)',
        `Store: ${name}`,
      ].join('\n')
  }
}
