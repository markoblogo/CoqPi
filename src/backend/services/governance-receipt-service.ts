import fs from 'node:fs/promises'
import path from 'node:path'
import type { GovernanceReceipt } from '../../shared/app-types'

const toPublicReceipt = (receipt: GovernanceReceipt): GovernanceReceipt => ({
  version: receipt.version,
  timestamp: receipt.timestamp,
  stage: receipt.stage,
  correlationId: receipt.correlationId,
  mode: receipt.mode,
  actionKind: receipt.actionKind,
  actionFingerprint: receipt.actionFingerprint,
  decision: receipt.decision,
  enforced: receipt.enforced,
  outcome: receipt.outcome,
  reason: receipt.reason,
  ...(receipt.latencyMs !== undefined ? { latencyMs: receipt.latencyMs } : {}),
  ...(receipt.provider ? { provider: receipt.provider } : {}),
  ...(receipt.model ? { model: receipt.model } : {}),
  ...(receipt.tokenCount !== undefined
    ? { tokenCount: receipt.tokenCount }
    : {}),
  ...(receipt.costUsd !== undefined ? { costUsd: receipt.costUsd } : {}),
  ...(receipt.routeIndex !== undefined ? { routeIndex: receipt.routeIndex } : {}),
  ...(receipt.routeCount !== undefined ? { routeCount: receipt.routeCount } : {}),
  ...(receipt.routeLabel ? { routeLabel: receipt.routeLabel } : {}),
  ...(receipt.providerTimeoutMs !== undefined
    ? { providerTimeoutMs: receipt.providerTimeoutMs }
    : {}),
  ...(receipt.providerBudgetMs !== undefined
    ? { providerBudgetMs: receipt.providerBudgetMs }
    : {})
})

export const appendReceipt = async (
  receipt: GovernanceReceipt,
  filePath: string
) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, `${JSON.stringify(toPublicReceipt(receipt))}\n`, 'utf8')
}
