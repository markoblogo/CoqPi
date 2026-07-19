import path from 'node:path'
import type { GovernanceAction, GovernanceReceipt } from '../../shared/app-types'
import { getAppInfo } from './app-state'
import {
  executeGovernedProviderAction,
  GovernanceBlockedError
} from './governance-action-runner'
import { appendReceipt } from './governance-receipt-service'

export { GovernanceBlockedError }

interface GovernanceUsage {
  tokenCount?: number
  costUsd?: number
}

const appendDefaultGovernanceReceipt = (receipt: GovernanceReceipt) =>
  appendReceipt(
    receipt,
    path.join(getAppInfo().governanceDirectory, 'receipts.jsonl')
  )

export const runGovernedProviderAction = <T>(
  action: GovernanceAction,
  execute: () => Promise<T>,
  getUsage?: (result: T) => GovernanceUsage | undefined
) =>
  executeGovernedProviderAction(
    action,
    execute,
    appendDefaultGovernanceReceipt,
    getUsage
  )
