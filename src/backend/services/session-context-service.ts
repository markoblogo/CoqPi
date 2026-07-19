import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  SessionContext,
  SessionContextResult
} from '../../shared/app-types'
import { getAppInfo } from './app-state'

const emptySessionContext: SessionContext = {
  company: '',
  role: '',
  context: '',
  goal: '',
  notes: ''
}

const getSessionContextPath = () => {
  return path.join(getAppInfo().sessionsDirectory, 'current-session.json')
}

const sanitizeText = (value: unknown) => {
  return typeof value === 'string' ? value.trim() : ''
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
    notes: sanitizeText(candidate.notes)
  }
}

export const getSessionContext = async (): Promise<SessionContextResult> => {
  try {
    const raw = await fs.readFile(getSessionContextPath(), 'utf8')

    return {
      context: sanitizeSessionContext(JSON.parse(raw))
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
  const sanitized = sanitizeSessionContext(context)
  const filePath = getSessionContextPath()

  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(sanitized, null, 2), 'utf8')

  return {
    context: sanitized
  }
}
