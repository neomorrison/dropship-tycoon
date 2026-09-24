// CreatorHub routing. Paths are site-internal (no leading slash):
//   ''                      → New brief
//   'new' | 'brief'         → New brief
//   'new/<id>' | 'brief/<id>' | 'new?product=<id>'
//                           → New brief with that product preselected (store product id or catalog id)
//   'library'               → Creative library (ADS_PATHS.library); 'library?product=<catalogId>' filters it
//   'library/<creativeId>' | 'creative/<creativeId>' → creative detail
//   'creators'              → creator marketplace
//   'creators/<creatorId>'  → marketplace with that creator highlighted
export type StudioRoute =
  | { page: 'brief'; productRef: string | null }
  | { page: 'library'; creativeId: string | null; product: string | null }
  | { page: 'creators'; creatorId: string | null }

const safeDecode = (x: string) => {
  try { return decodeURIComponent(x) } catch { return x }
}

export function parseRoute(path: string): StudioRoute {
  const [rawPath, query = ''] = (path || '').replace(/^\/+/, '').split('?')
  const params = new URLSearchParams(query)
  const parts = rawPath.split('/').filter(Boolean).map(safeDecode)
  const head = parts[0] ?? ''
  switch (head) {
    case 'library':
    case 'creatives':
      return { page: 'library', creativeId: parts[1] ?? params.get('creative') ?? null, product: params.get('product') }
    case 'creative':
      return { page: 'library', creativeId: parts[1] ?? null, product: null }
    case 'creators':
    case 'marketplace':
      return { page: 'creators', creatorId: parts[1] ?? params.get('creator') ?? null }
    default:
      return { page: 'brief', productRef: parts[1] ?? params.get('product') ?? null }
  }
}

export const studioPaths = {
  brief: (productRef?: string) => (productRef ? `new/${encodeURIComponent(productRef)}` : 'new'),
  library: 'library',
  libraryFor: (catalogId: string) => `library?product=${encodeURIComponent(catalogId)}`,
  creative: (id: string) => `library/${encodeURIComponent(id)}`,
  creators: 'creators',
  creator: (id: string) => `creators/${encodeURIComponent(id)}`,
}
