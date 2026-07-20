import { randomUUID } from 'node:crypto'
import type {
  GovernanceAction,
  GovernanceReceipt
} from '../../shared/app-types'
import {
  evaluateGovernanceAction,
  getGovernanceActionFingerprint,
  getGovernanceMode
} from './governance-policy-service'

export class GovernanceBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GovernanceBlockedError'
  }
}

interface GovernanceUsage {
  tokenCount?: number
  costUsd?: number
}

type AppendGovernanceReceipt = (receipt: GovernanceReceipt) => Promise<void>

const roundLatency = (startedAt: number) =>
  Math.max(0, Math.round(performance.now() - startedAt))

const errorReason = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError'
    ? 'provider request was aborted'
    : 'provider request failed'

const appendBestEffort = async (
  appendGovernanceReceipt: AppendGovernanceReceipt,
  receipt: GovernanceReceipt
) => {
  try {
    await appendGovernanceReceipt(receipt)
  } catch {
    // Receipts improve observability but must not interrupt the live voice loop.
  }
}

export const executeGovernedProviderAction = async <T>(
  action: GovernanceAction,
  execute: () => Promise<T>,
  appendGovernanceReceipt: AppendGovernanceReceipt,
  getUsage?: (result: T) => GovernanceUsage | undefined
): Promise<T> => {
  // Local STT/audio has no external effect and stays outside the I/O path.
  if (!action.external) {
    return execute()
  }

  const mode = getGovernanceMode()
  const evaluation = evaluateGovernanceAction(action, mode)
  const correlationId = randomUUID()
  const actionFingerprint = getGovernanceActionFingerprint(action)
  const baseReceipt = {
    version: 1 as const,
    timestamp: new Date().toISOString(),
    correlationId,
    mode,
    actionKind: action.kind,
    actionFingerprint,
    decision: evaluation.decision,
    enforced: mode === 'enforce',
    reason: evaluation.reason,
    provider: action.provider,
    ...(action.model ? { model: action.model } : {}),
    ...(action.routeIndex !== undefined
      ? { routeIndex: action.routeIndex }
      : {}),
    ...(action.routeCount !== undefined
      ? { routeCount: action.routeCount }
      : {}),
    ...(action.routeLabel ? { routeLabel: action.routeLabel } : {}),
    ...(action.providerTimeoutMs !== undefined
      ? { providerTimeoutMs: action.providerTimeoutMs }
      : {}),
    ...(action.providerBudgetMs !== undefined
      ? { providerBudgetMs: action.providerBudgetMs }
      : {})
  }

  await appendBestEffort(appendGovernanceReceipt, {
    ...baseReceipt,
    stage: 'preflight',
    outcome: 'pending'
  })

  const startedAt = performance.now()

  if (!evaluation.shouldProceed) {
    await appendBestEffort(appendGovernanceReceipt, {
      ...baseReceipt,
      timestamp: new Date().toISOString(),
      stage: 'completed',
      outcome: 'blocked',
      latencyMs: roundLatency(startedAt)
    })
    throw new GovernanceBlockedError(`Governance blocked action: ${evaluation.reason}`)
  }

  try {
    const result = await execute()
    const usage = getUsage?.(result)

    await appendBestEffort(appendGovernanceReceipt, {
      ...baseReceipt,
      timestamp: new Date().toISOString(),
      stage: 'completed',
      outcome: 'allowed',
      latencyMs: roundLatency(startedAt),
      ...(usage?.tokenCount !== undefined
        ? { tokenCount: usage.tokenCount }
        : {}),
      ...(usage?.costUsd !== undefined ? { costUsd: usage.costUsd } : {})
    })

    return result
  } catch (error) {
    await appendBestEffort(appendGovernanceReceipt, {
      ...baseReceipt,
      timestamp: new Date().toISOString(),
      stage: 'completed',
      outcome: 'failed',
      reason: errorReason(error),
      latencyMs: roundLatency(startedAt)
    })
    throw error
  }
}
