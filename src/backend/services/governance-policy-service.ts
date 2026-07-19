import { createHash } from 'node:crypto'
import type {
  GovernanceAction,
  GovernanceEvaluation,
  GovernanceMode
} from '../../shared/app-types'

const SHADOW_MODE: GovernanceMode = 'shadow'

export const getGovernanceMode = (): GovernanceMode =>
  process.env.COQPI_GOVERNANCE_MODE === 'enforce' ? 'enforce' : SHADOW_MODE

export const evaluateGovernanceAction = (
  action: GovernanceAction,
  mode = getGovernanceMode()
): GovernanceEvaluation => {
  if (!action.external) {
    return {
      decision: 'allow',
      shouldProceed: true,
      shouldRecord: false,
      reason: 'local audio or provider path has no external side effect'
    }
  }

  let decision: GovernanceEvaluation['decision'] = 'allow'
  let reason = 'known external provider route'

  if (action.kind === 'tool_route') {
    if (action.toolRisk === 'system_write') {
      decision = 'deny'
      reason = 'system write tool routes are not enabled in CoqPi'
    } else if (action.toolRisk === 'external_write') {
      decision = 'require_approval'
      reason = 'external write tool routes require explicit approval'
    } else {
      reason = 'read-only external tool route'
    }
  }

  return {
    decision,
    shouldProceed: mode === 'shadow' || decision === 'allow',
    shouldRecord: true,
    reason
  }
}

export const getGovernanceActionFingerprint = (action: GovernanceAction) => {
  const safeDescriptor = JSON.stringify({
    kind: action.kind,
    provider: action.provider,
    model: action.model ?? '',
    external: action.external,
    toolRisk: action.toolRisk ?? ''
  })

  return createHash('sha256').update(safeDescriptor).digest('hex').slice(0, 16)
}
