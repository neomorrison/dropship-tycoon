// Report catalog shared by Analytics ("View report" links) and the Reports page.
export type ReportId =
  | 'sales-over-time' | 'sales-by-product' | 'sales-by-channel' | 'orders-over-time' | 'aov-over-time'
  | 'sessions-over-time' | 'sessions-by-device' | 'sessions-by-source' | 'conversion-over-time' | 'product-conversion'
  | 'returning-customers' | 'profit-by-product' | 'finance-summary' | 'orders-by-location'

export type ReportCategory = 'Sales' | 'Acquisition' | 'Behavior' | 'Customers' | 'Profit margin' | 'Finances'

export interface ReportDef {
  id: ReportId
  name: string
  category: ReportCategory
  description: string
}

export const REPORTS: ReportDef[] = [
  { id: 'sales-over-time', name: 'Total sales over time', category: 'Sales', description: 'Gross sales, discounts, returns, net sales, shipping and total sales by day.' },
  { id: 'sales-by-product', name: 'Total sales by product', category: 'Sales', description: 'Units, orders and sales for each product.' },
  { id: 'sales-by-channel', name: 'Total sales by referring channel', category: 'Sales', description: 'Sessions, orders and sales for each marketing channel.' },
  { id: 'orders-over-time', name: 'Orders over time', category: 'Sales', description: 'Orders and items ordered by day.' },
  { id: 'aov-over-time', name: 'Average order value over time', category: 'Sales', description: 'Gross sales minus discounts, divided by orders, by day.' },
  { id: 'sessions-over-time', name: 'Sessions over time', category: 'Acquisition', description: 'Online store sessions by day.' },
  { id: 'sessions-by-source', name: 'Sessions by referrer', category: 'Acquisition', description: 'Where your online store visitors came from.' },
  { id: 'sessions-by-device', name: 'Sessions by device type', category: 'Acquisition', description: 'Mobile, desktop and tablet sessions.' },
  { id: 'conversion-over-time', name: 'Conversion rate over time', category: 'Behavior', description: 'Sessions, added to cart, reached checkout and conversion rate by day.' },
  { id: 'product-conversion', name: 'Product conversion', category: 'Behavior', description: 'Sessions, add-to-cart rate and conversion rate for each product page.' },
  { id: 'returning-customers', name: 'Returning customer rate over time', category: 'Customers', description: 'New and returning customers by day.' },
  { id: 'orders-by-location', name: 'Orders by customer location', category: 'Customers', description: 'Orders and sales by US state.' },
  { id: 'profit-by-product', name: 'Profit by product', category: 'Profit margin', description: 'Net sales minus product cost, shipping, transaction fees and ad spend, per product.' },
  { id: 'finance-summary', name: 'Finance summary', category: 'Finances', description: 'Sales, payments, costs and net profit for the period.' },
]

export const reportDef = (id: string): ReportDef | undefined => REPORTS.find(r => r.id === id)
