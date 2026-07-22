import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  SessionContext,
  SessionContextResult
} from '../../shared/app-types'
import { getAppInfo } from './app-state'
import { resolveSessionSelectedCounterpartyPackIds } from './context-source-service'

const emptySessionContext: SessionContext = {
  company: '',
  role: '',
  context: '',
  goal: '',
  notes: '',
  selectedCounterpartyPackIds: []
}

const getSessionContextPath = () => {
  return path.join(getAppInfo().sessionsDirectory, 'current-session.json')
}

const sanitizeText = (value: unknown) => {
  return typeof value === 'string' ? value.trim() : ''
}

const sanitizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()

  for (const item of value) {
    const entry = sanitizeText(item)
    if (!entry) {
      continue
    }

    seen.add(entry)
  }

  return [...seen]
}

const sanitizeSessionContext = (value: unknown): SessionContext => {
  if (!value || typeof value !== 'object') {
    return emptySessionContext
  }

  const candidate = value as Partial<SessionContext>

  return {
    company: sanitizeText(candidate.company),
    role: sanitizeText(candidate.role),
    context: sanitizeText(candidate.context),
    goal: sanitizeText(candidate.goal),
    notes: sanitizeText(candidate.notes),
    selectedCounterpartyPackIds: sanitizeStringArray(candidate.selectedCounterpartyPackIds)
  }
}

const normalizeSessionContextForActivePacks = async (
  context: SessionContext
): Promise<SessionContext> => ({
  ...context,
  selectedCounterpartyPackIds: await resolveSessionSelectedCounterpartyPackIds(
    context.selectedCounterpartyPackIds
  )
})

export const getSessionContext = async (): Promise<SessionContextResult> => {
  try {
    const raw = await fs.readFile(getSessionContextPath(), 'utf8')
    const context = await normalizeSessionContextForActivePacks(
      sanitizeSessionContext(JSON.parse(raw))
    )

    return {
      context
    }
  } catch {
    return {
      context: emptySessionContext
    }
  }
}

export const saveSessionContext = async (
  context: SessionContext
): Promise<SessionContextResult> => {
  const sanitized = await normalizeSessionContextForActivePacks(
    sanitizeSessionContext(context)
  )
  const filePath = getSessionContextPath()

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(sanitized, null, 2), 'utf8')

  return {
    context: sanitized
  }
}
