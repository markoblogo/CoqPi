import type {
  PreparationContextKnowledgeItem,
  PreparationContextResult
} from './app-types'

export interface PreparationContextSurfaceItem {
  id: string
  title: string
  summary: string
  meta: string
  proofUrl?: string
}

export interface PreparationContextSurfaceSection {
  id:
    | 'current_focus'
    | 'capabilities'
    | 'proof'
    | 'collaboration_fit'
    | 'constraints'
    | 'known_gaps'
  title: string
  items: PreparationContextSurfaceItem[]
}

export interface PreparationContextSurface {
  statusLabel: string
  hint: string
  statsLabel: string
  sections: PreparationContextSurfaceSection[]
}

const toMeta = (item: PreparationContextKnowledgeItem) =>
  [item.provider, item.confidence, item.provenance_label]
    .filter(Boolean)
    .join(' · ')

const toSurfaceItem = (
  item: PreparationContextKnowledgeItem
): PreparationContextSurfaceItem => ({
  id: item.id,
  title: item.title,
  summary: item.summary || item.excerpt,
  meta: toMeta(item),
  proofUrl: item.proof_url
})

const pickItems = (
  items: PreparationContextKnowledgeItem[],
  allowedCategories: string[],
  limit = 2
) =>
  items
    .filter((item) => allowedCategories.includes(item.category))
    .slice(0, limit)
    .map(toSurfaceItem)

export const buildPreparationContextSurface = (
  result: PreparationContextResult
): PreparationContextSurface => {
  const sections: PreparationContextSurfaceSection[] = []
  const currentFocus = pickItems(result.items, ['current_focus'])
  const capabilities = pickItems(result.items, ['capabilities'])
  const proof = pickItems(result.items, ['publication', 'project', 'recent_work'])
  const collaborationFit = pickItems(result.items, [
    'collaboration_preference',
    'professional_goal',
    'role_fit'
  ])
  const constraints = pickItems(result.items, ['professional_constraint'])

  if (currentFocus.length > 0) {
    sections.push({
      id: 'current_focus',
      title: 'Current focus',
      items: currentFocus
    })
  }

  if (capabilities.length > 0) {
    sections.push({
      id: 'capabilities',
      title: 'Relevant capabilities',
      items: capabilities
    })
  }

  if (proof.length > 0) {
    sections.push({
      id: 'proof',
      title: 'Recent projects / proof',
      items: proof
    })
  }

  if (collaborationFit.length > 0) {
    sections.push({
      id: 'collaboration_fit',
      title: 'Collaboration fit',
      items: collaborationFit
    })
  }

  if (constraints.length > 0) {
    sections.push({
      id: 'constraints',
      title: 'Preparation constraints',
      items: constraints
    })
  }

  if (result.known_gaps.length > 0) {
    sections.push({
      id: 'known_gaps',
      title: 'Known gaps',
      items: result.known_gaps.slice(0, 4).map((gap, index) => ({
        id: `gap-${index}`,
        title: `Gap ${index + 1}`,
        summary: gap,
        meta: 'ABVX context pack'
      }))
    })
  }

  const statusLabel =
    result.status === 'ready'
      ? 'Ready'
      : result.status === 'partial'
        ? 'Partial'
        : result.status === 'denied'
          ? 'Privacy denied'
          : result.status === 'unavailable'
            ? 'ABVX unavailable'
            : 'No relevant knowledge'

  const hint =
    result.status === 'ready'
      ? 'Compact private prep context loaded.'
      : result.status === 'partial'
        ? 'Useful context loaded with explicit gaps or truncation.'
        : result.message

  const statsLabel = `${result.item_count} item${
    result.item_count === 1 ? '' : 's'
  } · ${result.pack_bytes} bytes${
    result.truncated ? ' · truncated' : ''
  }${result.available_more ? ' · more available' : ''}`

  return {
    statusLabel,
    hint,
    statsLabel,
    sections
  }
}
