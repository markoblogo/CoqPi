import type {
  MonitorAccountLogin,
  MonitorAccountLoginResult,
  GovernanceToolRisk,
  MonitorLiveCopilotRequest,
  MonitorLiveCopilotResponse,
  MonitorLiveCopilotSaveResult,
  MonitorTokenStatus
} from '../../shared/app-types'
import {
  deleteEncryptedSecret,
  resolveEncryptedSecret,
  saveEncryptedSecret
} from './secret-storage-service'
import { getStoredSettings } from './user-settings-service'
import { runGovernedProviderAction } from './governance-service'

const MONITOR_TOKEN_SECRET = 'mn7r-monitor-token'
const REQUEST_TIMEOUT_MS = 12_000

const normalizeMonitorBaseUrl = (value: string) => {
  const baseUrl = value.trim().replace(/\/+$/u, '')
  if (!baseUrl) throw new Error('Monitor URL is required.')
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname))) {
    throw new Error('Monitor URL must use HTTPS (HTTP is allowed only for localhost).')
  }
  return baseUrl
}

const resolveMonitorToken = async () =>
  (await resolveEncryptedSecret(MONITOR_TOKEN_SECRET)) ||
  process.env.MN7R_MONITOR_TOKEN?.trim() ||
  ''

const normalizedConnection = async () => {
  const settings = await getStoredSettings()
  if (!settings.monitorLiveCopilotEnabled) {
    throw new Error('Monitor Live Copilot is disabled in Settings.')
  }
  if (!settings.monitorConsentConfirmed) {
    throw new Error('Confirm permission to process client speech in Settings.')
  }
  const baseUrl = normalizeMonitorBaseUrl(settings.monitorBaseUrl || process.env.MN7R_MONITOR_URL || '')
  const companyId = (settings.monitorCompanyId || process.env.MN7R_MONITOR_COMPANY_ID || '').trim()
  const token = await resolveMonitorToken()
  if (!baseUrl || !companyId || !token) {
    throw new Error('Monitor URL, client ID, and secure token are required.')
  }
  return { settings, baseUrl, companyId, token }
}

type MonitorConnection = Awaited<ReturnType<typeof normalizedConnection>>

const monitorRequest = async (
  path: string | ((connection: MonitorConnection) => string),
  body: unknown | ((connection: MonitorConnection) => unknown),
  action: { toolRisk: GovernanceToolRisk; approvalGranted?: boolean; routeLabel: string }
) => {
  const connection = await normalizedConnection()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const requestPath = typeof path === 'function' ? path(connection) : path
    const requestBody = typeof body === 'function' ? body(connection) : body
    const response = await runGovernedProviderAction(
      {
        kind: 'tool_route',
        provider: 'mn7r_monitor',
        external: true,
        toolRisk: action.toolRisk,
        approvalGranted: action.approvalGranted,
        routeLabel: action.routeLabel,
        providerTimeoutMs: REQUEST_TIMEOUT_MS
      },
      () => fetch(`${connection.baseUrl}${requestPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })
    )
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      const publicMessage = typeof payload.error === 'string'
        ? payload.error
        : `Monitor request failed (${response.status}).`
      throw new Error(publicMessage)
    }
    return { payload, connection }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Monitor request timed out.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export const getMonitorTokenStatus = async (): Promise<MonitorTokenStatus> => {
  const stored = await resolveEncryptedSecret(MONITOR_TOKEN_SECRET)
    .then(Boolean)
    .catch(() => false)
  const env = Boolean(process.env.MN7R_MONITOR_TOKEN?.trim())
  return {
    hasStoredToken: stored,
    hasEnvToken: env,
    effectiveTokenAvailable: stored || env
  }
}

export const saveMonitorToken = async (token: string) => {
  await saveEncryptedSecret(MONITOR_TOKEN_SECRET, token)
  return { ok: true }
}

export const deleteMonitorToken = async () => {
  await deleteEncryptedSecret(MONITOR_TOKEN_SECRET)
  return { ok: true }
}

export const connectMonitorAccount = async (
  login: MonitorAccountLogin
): Promise<MonitorAccountLoginResult> => {
  const username = String(login?.username || '').trim()
  const password = String(login?.password || '')
  if (!username || !password) throw new Error('Monitor username and password are required.')
  const settings = await getStoredSettings()
  const baseUrl = normalizeMonitorBaseUrl(login.baseUrl || settings.monitorBaseUrl || process.env.MN7R_MONITOR_URL || '')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await runGovernedProviderAction(
      {
        kind: 'tool_route',
        provider: 'mn7r_monitor',
        external: true,
        toolRisk: 'read_only',
        routeLabel: 'connect Monitor account',
        providerTimeoutMs: REQUEST_TIMEOUT_MS
      },
      () => fetch(`${baseUrl}/api/mn7r/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal
      })
    )
    const payload = await response.json().catch(() => ({})) as {
      token?: unknown
      error?: unknown
      user?: { displayName?: unknown }
    }
    if (!response.ok || typeof payload.token !== 'string' || !payload.token.trim()) {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'Monitor sign-in failed.')
    }
    await saveEncryptedSecret(MONITOR_TOKEN_SECRET, payload.token)
    return {
      ok: true,
      displayName: typeof payload.user?.displayName === 'string'
        ? payload.user.displayName
        : username
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Monitor sign-in timed out.')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export const analyzeMonitorLiveRequest = async (
  request: MonitorLiveCopilotRequest
): Promise<MonitorLiveCopilotResponse> => {
  if (!request.segments.length || request.segments.some(segment => segment.speaker !== 'OTHER')) {
    throw new Error('Only finalized client speech can be sent to Monitor.')
  }
  const { payload } = await monitorRequest(
    (connection: MonitorConnection) => `/api/sea-brokerage-monitor/clients/${encodeURIComponent(connection.companyId)}/negotiations/live-preview`,
    (connection: MonitorConnection) => ({
      ...request,
      clientName: request.clientName || connection.settings.monitorClientName || connection.companyId,
      consentConfirmed: true,
      allowAiProcessing: connection.settings.monitorAllowAiProcessing
    }),
    { toolRisk: 'read_only', routeLabel: 'preview live brokerage request' }
  )
  return payload as unknown as MonitorLiveCopilotResponse
}

export const saveMonitorLiveDraft = async (
  request: MonitorLiveCopilotRequest
): Promise<MonitorLiveCopilotSaveResult> => {
  if (!request.segments.length || request.segments.some(segment => segment.speaker !== 'OTHER')) {
    throw new Error('Only finalized client speech can be saved to Monitor.')
  }
  const { payload } = await monitorRequest(
    (connection: MonitorConnection) => `/api/sea-brokerage-monitor/clients/${encodeURIComponent(connection.companyId)}/negotiations/import`,
    (connection: MonitorConnection) => ({
      title: `Live call · ${request.clientName || connection.settings.monitorClientName || connection.companyId}`,
      sourceName: 'CoqPi Live Call',
      transcript: request.segments.map(segment => `[${segment.timestamp}] OTHER: ${segment.text}`).join('\n'),
      segments: request.segments,
      consentConfirmed: true,
      allowAiProcessing: connection.settings.monitorAllowAiProcessing
    }),
    { toolRisk: 'external_write', approvalGranted: true, routeLabel: 'save reviewed call to Monitor Draft Inbox' }
  )
  const session = payload.session as { id?: unknown } | undefined
  const sessionId = typeof session?.id === 'string' ? session.id : ''
  if (!sessionId) throw new Error('Monitor did not return a saved Draft Inbox session.')
  return { ok: true, sessionId }
}
