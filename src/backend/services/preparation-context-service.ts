import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  AbvxContextRequest,
  PreparationContextKnowledgeItem,
  PreparationContextOperationalState,
  PreparationContextProviderStatus,
  PreparationContextResult,
  SessionContext
} from '../../shared/app-types'

const execFile = promisify(execFileCallback)

const DEFAULT_ABVX_ROOT = path.resolve(process.cwd(), '..', 'ABVX-OS')

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)

const uniq = (values: string[]) => [...new Set(values.filter(Boolean))]

const buildTask = (context: SessionContext) => {
  const parts = [
    context.company.trim(),
    context.role.trim(),
    context.context.trim(),
    context.goal.trim()
  ].filter(Boolean)

  return parts.length > 0
    ? `Prepare compact context for a professional conversation: ${parts.join(' · ')}.`
    : 'Prepare compact context for a professional conversation.'
}

export const buildPreparationContextRequest = (
  context: SessionContext,
  now = Date.now()
): AbvxContextRequest => {
  const companySlug = slugify(context.company) || 'general'
  const roleSlug = slugify(context.role) || 'call'

  return {
    schema_version: 'v1',
    request_id: `coqpi-prep-${companySlug}-${roleSlug}-${now}`,
    consumer: 'coqpi',
    task: buildTask(context),
    intent: 'professional_preparation',
    related_projects: ['coqpi'],
    entities: uniq([
      'Anton',
      'CoqPi',
      context.company.trim(),
      context.role.trim(),
      context.context.trim()
    ]),
    domains: ['professional-context', 'current-work'],
    freshness_requirement: 'CURRENT',
    privacy_domain: 'PERSONAL_PRIVATE',
    max_items: 6,
    context_budget: {
      max_excerpt_chars: 280,
      provider_timeout_seconds: 20,
      token_usage: 'NOT_METERED'
    },
    provider_hints: ['cortexabv']
  }
}

const resolveAbvxRoot = () =>
  process.env.COQPI_ABVX_ROOT
    ? path.resolve(process.cwd(), process.env.COQPI_ABVX_ROOT)
    : DEFAULT_ABVX_ROOT

const normalizeProviderStatuses = (
  providers: unknown
): PreparationContextProviderStatus[] => {
  if (!Array.isArray(providers)) {
    return []
  }

  return providers
    .map((provider) => {
      if (!provider || typeof provider !== 'object') {
        return null
      }

      const candidate = provider as Record<string, unknown>

      return {
        id: typeof candidate.id === 'string' ? candidate.id : 'unknown',
        status:
          typeof candidate.status === 'string' ? candidate.status : 'unknown',
        items_returned:
          typeof candidate.items_returned === 'number'
            ? candidate.items_returned
            : 0
      }
    })
    .filter((value): value is PreparationContextProviderStatus => Boolean(value))
}

const buildProvenanceLabel = (item: Record<string, unknown>) => {
  const provenance =
    item.provenance && typeof item.provenance === 'object'
      ? (item.provenance as Record<string, unknown>)
      : null
  const directSource =
    provenance && typeof provenance.source === 'string'
      ? provenance.source
      : ''
  const canonicalUrl =
    provenance && typeof provenance.canonical_url === 'string'
      ? provenance.canonical_url
      : ''

  return canonicalUrl || directSource || 'source unavailable'
}

const firstProofUrl = (
  itemId: string,
  proofAssets: unknown
): string | undefined => {
  if (!Array.isArray(proofAssets)) {
    return undefined
  }

  const match = proofAssets.find((asset) => {
    if (!asset || typeof asset !== 'object') {
      return false
    }

    const candidate = asset as Record<string, unknown>
    return (
      typeof candidate.entity_id === 'string' && itemId.includes(candidate.entity_id)
    )
  }) as Record<string, unknown> | undefined

  return match && typeof match.url === 'string' ? match.url : undefined
}

const normalizeItems = (
  items: unknown,
  proofAssets: unknown
): PreparationContextKnowledgeItem[] => {
  if (!Array.isArray(items)) {
    return []
  }

  const normalized: PreparationContextKnowledgeItem[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const candidate = item as Record<string, unknown>
    const id = typeof candidate.id === 'string' ? candidate.id : ''

    if (!id) {
      continue
    }

    normalized.push({
      id,
      category:
        typeof candidate.category === 'string' ? candidate.category : 'unknown',
      title: typeof candidate.title === 'string' ? candidate.title : id,
      summary: typeof candidate.summary === 'string' ? candidate.summary : '',
      excerpt: typeof candidate.excerpt === 'string' ? candidate.excerpt : '',
      confidence:
        typeof candidate.confidence === 'string'
          ? candidate.confidence
          : 'UNKNOWN',
      provider:
        typeof candidate.provider === 'string' ? candidate.provider : 'unknown',
      privacy_classification:
        typeof candidate.privacy_classification === 'string'
          ? candidate.privacy_classification
          : 'UNKNOWN',
      provenance_label: buildProvenanceLabel(candidate),
      proof_url: firstProofUrl(id, proofAssets)
    })
  }

  return normalized
}

const normalizeOperationalContext = (
  operationalContext: unknown
): PreparationContextOperationalState[] => {
  if (!Array.isArray(operationalContext)) {
    return []
  }

  const normalized: PreparationContextOperationalState[] = []

  for (const entry of operationalContext) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const candidate = entry as Record<string, unknown>

    if (
      typeof candidate.project !== 'string' ||
      typeof candidate.operational_state !== 'string' ||
      typeof candidate.current_outcome !== 'string' ||
      typeof candidate.next_action !== 'string'
    ) {
      continue
    }

    normalized.push({
      project: candidate.project,
      operational_state: candidate.operational_state,
      current_outcome: candidate.current_outcome,
      next_action: candidate.next_action,
      waiting_reason:
        typeof candidate.waiting_reason === 'string'
          ? candidate.waiting_reason
          : undefined,
      human_attention_required: candidate.human_attention_required === true
    })
  }

  return normalized
}

export const formatPreparationContextResult = (
  request: AbvxContextRequest,
  pack: Record<string, unknown>,
  packBytes: number
): PreparationContextResult => {
  const items = normalizeItems(pack.knowledge_items, pack.proof_assets)
  const providerStatuses = normalizeProviderStatuses(pack.providers)
  const knownGaps = Array.isArray(pack.known_gaps)
    ? pack.known_gaps.filter((gap): gap is string => typeof gap === 'string')
    : []
  const constraints =
    pack.constraints && typeof pack.constraints === 'object'
      ? (pack.constraints as Record<string, unknown>)
      : {}
  const truncated = constraints.truncated === true
  const availableMore = constraints.available_more === true
  const statusSet = new Set(providerStatuses.map((provider) => provider.status))

  const status =
    items.length === 0 && statusSet.has('denied')
      ? 'denied'
      : items.length === 0 &&
          [...statusSet].some((statusValue) =>
            ['unavailable', 'malformed'].includes(statusValue)
          )
        ? 'unavailable'
        : items.length === 0
          ? 'empty'
          : truncated ||
              knownGaps.length > 0 ||
              [...statusSet].some((statusValue) =>
                ['gap', 'denied', 'unavailable', 'malformed'].includes(
                  statusValue
                )
              )
            ? 'partial'
            : 'ready'

  const message =
    status === 'ready'
      ? 'Compact preparation context loaded.'
      : status === 'partial'
        ? 'Compact preparation context loaded with explicit gaps.'
        : status === 'denied'
          ? 'Private preparation context was denied by the provider boundary.'
          : status === 'unavailable'
            ? 'ABVX context bridge is unavailable right now.'
            : 'No relevant Cortex-backed preparation context was returned.'

  return {
    status,
    message,
    request,
    pack_id: typeof pack.pack_id === 'string' ? pack.pack_id : null,
    generated_at:
      typeof pack.generated_at === 'string' ? pack.generated_at : null,
    item_count: items.length,
    pack_bytes: packBytes,
    truncated,
    available_more: availableMore,
    known_gaps: knownGaps,
    provider_statuses: providerStatuses,
    items,
    operational_context: normalizeOperationalContext(pack.operational_context)
  }
}

const fallbackResult = (
  request: AbvxContextRequest,
  message: string
): PreparationContextResult => ({
  status: 'unavailable',
  message,
  request,
  pack_id: null,
  generated_at: null,
  item_count: 0,
  pack_bytes: 0,
  truncated: false,
  available_more: false,
  known_gaps: [],
  provider_statuses: [],
  items: [],
  operational_context: []
})

export const requestPreparationContext = async (
  context: SessionContext
): Promise<PreparationContextResult> => {
  const request = buildPreparationContextRequest(context)
  const abvxRoot = resolveAbvxRoot()
  const abvxCli = path.join(abvxRoot, 'bin', 'abvx')
  const tempRoot = path.join(abvxRoot, '.tmp')
  await fs.mkdir(tempRoot, { recursive: true })
  const tempDir = await fs.mkdtemp(
    path.join(tempRoot, 'coqpi-preparation-context-')
  )
  const requestPath = path.join(tempDir, 'request.json')

  try {
    await fs.writeFile(requestPath, JSON.stringify(request, null, 2), 'utf8')
    const { stdout } = await execFile(
      abvxCli,
      ['context', 'request', '--file', requestPath, '--json'],
      {
        cwd: abvxRoot,
        maxBuffer: 1024 * 1024
      }
    )
    const payload = JSON.parse(stdout) as Record<string, unknown>
    const packPath =
      typeof payload.pack_path === 'string'
        ? path.join(abvxRoot, payload.pack_path)
        : null

    if (!packPath) {
      return fallbackResult(request, 'ABVX returned no context pack path.')
    }

    const serializedPack = await fs.readFile(packPath, 'utf8')
    const pack = JSON.parse(serializedPack) as Record<string, unknown>
    return formatPreparationContextResult(
      request,
      pack,
      Buffer.byteLength(serializedPack, 'utf8')
    )
  } catch (error) {
    return fallbackResult(
      request,
      error instanceof Error ? error.message : 'ABVX context request failed.'
    )
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}
