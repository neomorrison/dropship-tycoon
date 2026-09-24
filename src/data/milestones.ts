// Milestones (achievements). OWNER: sim-market-events. Checked by sim/events checkMilestones().
// `icon` is a lucide-react icon name.

export interface MilestoneData {
  id: string
  title: string
  description: string
  icon: string
  /** congratulation mail from Coach Kev */
  mail: string
}

export const MILESTONES: MilestoneData[] = [
  { id: 'first_store', title: 'Open for Business', description: 'Create your Shopifly store.', icon: 'Store',
    mail: "Every seven-figure brand started as an empty Shopifly theme. Next step: find ONE product worth testing. Don't marry it — test it." },
  { id: 'first_product_live', title: 'Live!', description: 'Publish your first product page.', icon: 'Rocket',
    mail: "Your first product is live. Before you spend a dollar on ads, open the page on your phone and ask: would I buy this from a store I've never heard of?" },
  { id: 'first_sale', title: 'Cha-ching!', description: 'Make your first sale.', icon: 'ShoppingBag',
    mail: 'FIRST SALE! Screenshot it. Now the real work starts: one sale is a signal, not proof. Watch your cost per purchase against your break-even before you scale.' },
  { id: 'first_100_day', title: 'Triple Digits', description: 'Do $100 in sales in a single day.', icon: 'TrendingUp',
    mail: "$100 in a day. Check your real profit after ad spend, product, shipping and fees — revenue is vanity, profit is sanity." },
  { id: 'first_1k_day', title: 'Four-Figure Day', description: 'Do $1,000 in sales in a single day.', icon: 'Flame',
    mail: "$1,000 day! This is where people blow up their accounts by doubling budgets. Scale in ~20% steps, keep feeding new creatives, and watch your card balance." },
  { id: 'first_10k_day', title: 'Five-Figure Day', description: 'Do $10,000 in sales in a single day.', icon: 'Zap',
    mail: "$10K in a day. At this size, cash flow, inventory and customer support break before ads do. Get stock into a US warehouse and hire help." },
  { id: 'month_10k', title: '$10K Month', description: 'Do $10,000 in sales in 30 days.', icon: 'CalendarCheck',
    mail: "$10K in 30 days. That's a real business. Know your numbers: blended ROAS, refund rate, chargeback ratio." },
  { id: 'month_100k', title: '$100K Month', description: 'Do $100,000 in sales in 30 days.', icon: 'Trophy',
    mail: '$100K month. Very few stores ever get here. Protect it: diversify products and platforms, and keep a cash buffer for ad bills.' },
  { id: 'lifetime_1m', title: 'Seven Figures', description: 'Reach $1,000,000 in lifetime sales.', icon: 'Crown',
    mail: 'One. Million. Dollars. In lifetime sales. From a McDoodle\'s break room to seven figures. I\'m genuinely proud of you.' },
  { id: 'quit_job', title: 'Two Weeks\' Notice', description: 'Quit your job at McDoodle\'s.', icon: 'DoorOpen',
    mail: 'You quit. Bold. Make sure the business covers rent, food and ad spend for at least three months — no more paychecks to fall back on.' },
  { id: 'first_hire', title: 'Boss Mode', description: 'Hire your first team member.', icon: 'UserPlus',
    mail: "Your first hire! Delegate the repetitive work (tickets, fulfillment checks) so you can spend your time on products and creatives." },
  { id: 'move_out', title: 'Leaving the Nest', description: "Move out of your parents' basement.", icon: 'Home',
    mail: "New place! Rent is a fixed cost now — make sure your 30-day profit covers it comfortably." },
  { id: 'penthouse', title: 'Penthouse Life', description: 'Move into the penthouse.', icon: 'Building2',
    mail: 'The penthouse. The view is incredible. Don\'t forget the kid in the basement who figured out break-even ROAS.' },
  { id: 'first_winner', title: 'Found a Winner', description: 'Earn $10,000 in profit from a single product.', icon: 'Award',
    mail: '$10K profit on one product — you found a winner. Winners don\'t last forever: start testing the next one while this one pays for it.' },
  { id: 'chargeback_won', title: 'Case Closed', description: 'Win a chargeback dispute.', icon: 'Scale',
    mail: 'You won a dispute! Tracking, proof of delivery and clear policies win cases. Better still: answer tickets fast so customers never call their bank.' },
  { id: 'networth_100k', title: 'Six-Figure Net Worth', description: 'Reach a net worth of $100,000.', icon: 'PiggyBank',
    mail: 'Net worth $100K. Real money. Pay down that card, keep a buffer, and think about what you want this business to become.' },
  { id: 'networth_1m', title: 'Millionaire', description: 'Reach a net worth of $1,000,000.', icon: 'Gem',
    mail: 'You are a millionaire. From $1,850 in savings and a cracked phone. Legendary.' },
]

export const MILESTONE_BY_ID: Record<string, MilestoneData> = Object.fromEntries(MILESTONES.map(m => [m.id, m]))
