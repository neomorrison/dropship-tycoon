// "Export" modal for the Orders and Customers index pages (Shopify's export dialog): pick which
// records, then download a CSV built from the game state.
import { useState } from 'react'
import { BlockStack, ChoiceList, Modal, Text } from '../../../kit/polaris'

export interface ExportScope<T> {
  value: string
  label: string
  rows: T[]
}

/** CSV text with Excel-safe quoting. */
export function toCsv(headings: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  return [headings, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
}

/** Save text as a file through the browser (no-op outside a DOM). */
export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ExportModal<T>({ open, onClose, resource, scopes, filename, headings, toRow }: {
  open: boolean
  onClose: () => void
  /** plural resource name, e.g. "orders" */
  resource: string
  /** export choices in order; empty scopes are disabled */
  scopes: ExportScope<T>[]
  filename: string
  headings: string[]
  toRow: (item: T) => (string | number | null | undefined)[]
}) {
  const firstUsable = scopes.find(x => x.rows.length > 0)?.value ?? scopes[0]?.value ?? ''
  const [pick, setPick] = useState(firstUsable)
  const scope = scopes.find(x => x.value === pick && x.rows.length > 0) ?? scopes.find(x => x.value === firstUsable)
  const n = scope?.rows.length ?? 0
  const run = () => {
    if (!scope || !n) return
    downloadText(filename, toCsv(headings, scope.rows.map(toRow)))
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Export ${resource}`}
      sectioned
      primaryAction={{ content: `Export ${resource}`, onAction: run, disabled: !n }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <BlockStack gap="400">
        <ChoiceList
          title="Export"
          choices={scopes.map(x => ({ value: x.value, label: `${x.label} (${x.rows.length.toLocaleString('en-US')})`, disabled: x.rows.length === 0 }))}
          selected={[scope?.value ?? pick]}
          onChange={v => setPick(v[0])}
        />
        <ChoiceList title="Export as" choices={[{ value: 'csv', label: 'CSV for Excel, Numbers, or other spreadsheet programs' }]} selected={['csv']} />
        <Text as="p" variant="bodySm" tone="subdued">The file downloads to your computer.</Text>
      </BlockStack>
    </Modal>
  )
}
