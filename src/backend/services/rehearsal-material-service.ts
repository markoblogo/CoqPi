import fs from 'node:fs/promises'
import path from 'node:path'
import { convertDocumentSourceToMarkdown, isMarkItDownSupportedLocation } from './markitdown-service'
import { runGovernedProviderAction } from './governance-service'
import type { RehearsalMaterial } from '../../shared/personal-rehearsal'

export const readRehearsalMaterialFile = async (filePath: string): Promise<RehearsalMaterial> => {
  const stats = await fs.stat(filePath)
  if (!stats.isFile() || stats.size > 10 * 1024 * 1024) throw new Error('Choose one local document up to 10 MB.')
  const extension = path.extname(filePath).toLowerCase()
  let text: string
  if (['.md', '.txt', '.json', '.csv'].includes(extension)) text = (await fs.readFile(filePath, 'utf8')).replace(/\0/g, '').trim()
  else if (isMarkItDownSupportedLocation(filePath)) {
    try { text = (await convertDocumentSourceToMarkdown(filePath)).trim() }
    catch { throw new Error('Document conversion unavailable. Paste the reviewed text, or configure the local MarkItDown Python adapter.') }
  } else throw new Error('Use TXT, MD, JSON, CSV, PDF or a supported Office document.')
  if (!text || text.length > 30000) throw new Error('Document is empty or exceeds 30,000 characters. Paste the exact relevant content; no silent truncation is performed.')
  return { label: path.basename(filePath), locator: filePath, text }
}
export const loadRehearsalPublicPage = async (url: string): Promise<RehearsalMaterial> => runGovernedProviderAction({ kind: 'tool_route', provider: 'public-web', external: true, toolRisk: 'read_only' }, async () => {
  const { fetchPublicPreparationExcerpt } = await import('./finder-search-service')
  return fetchPublicPreparationExcerpt(url)
})
