import fs from 'node:fs/promises'
import path from 'node:path'
import type { LocalMemoryState } from '../../shared/app-types'
import {
  buildLocalMemoryState,
  formatLocalMemoryAssistantContext
} from '../../shared/local-memory-core'
import { getAppInfo } from './app-state'
import { getContextSourceManifest } from './context-source-service'
import { getFinderSearchStore } from './finder-search-service'
import { getSessionSummaries } from './session-summary-service'

const getMemoryCoreJsonPath = () =>
  path.join(getAppInfo().personalKnowledgeCoreDirectory, 'coqpi-local-memory-core.json')

const getMemoryCoreMarkdownPath = () =>
  path.join(getAppInfo().personalKnowledgeCoreDirectory, 'coqpi-local-memory-core.md')

const writeArtifacts = async (state: LocalMemoryState) => {
  const jsonPath = getMemoryCoreJsonPath()
  const markdownPath = getMemoryCoreMarkdownPath()

  const markdown = [
    '# CoqPi Local Memory Core',
    `Generated: ${new Date().toISOString()}`,
    `Records: ${state.records.length}`,
    `Included for assistant: ${state.assistantView.included.length}`,
    `Dropped for assistant: ${state.assistantView.dropped.length}`,
    '',
    '## Included',
    ...state.assistantView.included.map(
      ({ record, reason }) =>
        `- ${record.title} [${record.kind}] (${reason})`
    ),
    '',
    '## Dropped',
    ...state.assistantView.dropped
      .slice(0, 12)
      .map(({ record, reason }) => `- ${record.title} [${record.kind}] (${reason})`),
    '',
    '## Assistant context preview',
    formatLocalMemoryAssistantContext(state) || 'none',
    ''
  ].join('\n')

  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.writeFile(jsonPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await fs.writeFile(markdownPath, `${markdown}\n`, 'utf8')
}

export const getLocalMemoryCoreState = async ({
  selectedPackIds = [],
  selectedDraftId = '',
  persistArtifacts = false
}: {
  selectedPackIds?: string[]
  selectedDraftId?: string
  persistArtifacts?: boolean
} = {}): Promise<LocalMemoryState> => {
  const [{ manifest }, { store }] = await Promise.all([
    getContextSourceManifest(),
    getFinderSearchStore()
  ])
  const { summaries } = await getSessionSummaries()

  const state = buildLocalMemoryState({
    manifest,
    finderStore: store,
    sessionSummaries: summaries,
    selectedPackIds,
    selectedDraftId
  })

  if (persistArtifacts) {
    await writeArtifacts(state)
  }

  return state
}
