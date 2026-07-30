export type PrivacyRedactionKind = 'email' | 'phone' | 'tracking_url'

export interface PrivacySanitizationResult {
  safeText: string
  redactions: PrivacyRedactionKind[]
  blocked: boolean
  reason?: string
}

const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/gu,
  /\b(?:ghp|github_pat|xox[baprs])-?[A-Za-z0-9_-]{16,}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/giu,
  /\b(?:api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*[^\s,;]+/giu
]

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const phonePattern = /(?<!\w)(?:\+[0-9][0-9 .()-]{7,}[0-9]|\([0-9]{2,4}\)[0-9 .-]{5,}[0-9])(?!\w)/gu
const trackingUrlPattern = /https?:\/\/[^\s)]+(?:utm_[^\s)]+|token=[^\s)]+|sig(?:nature)?=[^\s)]+)/giu

export const sanitizeForExternalAssistant = (
  value: unknown
): PrivacySanitizationResult => {
  const input = typeof value === 'string' ? value : ''

  for (const pattern of secretPatterns) {
    if (pattern.test(input)) {
      pattern.lastIndex = 0
      return {
        safeText: '',
        redactions: [],
        blocked: true,
        reason: 'secret-like material detected before external provider call'
      }
    }
    pattern.lastIndex = 0
  }

  const redactions = new Set<PrivacyRedactionKind>()
  let safeText = input.replace(emailPattern, () => {
    redactions.add('email')
    return '[email redacted]'
  })
  safeText = safeText.replace(phonePattern, () => {
    redactions.add('phone')
    return '[phone redacted]'
  })
  safeText = safeText.replace(trackingUrlPattern, () => {
    redactions.add('tracking_url')
    return '[tracking URL redacted]'
  })

  return { safeText, redactions: [...redactions], blocked: false }
}
