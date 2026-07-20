const NON_RETRYABLE_ERROR_PATTERNS = [
  'Invalid model response',
  'Model response JSON does not match the expected shape.',
  'OPENAI_API_KEY',
  'OPENAI returned an empty response.',
  'Governance blocked action'
] as const

const RETRYABLE_STATUS_CODES = new Set([
  408,
  429,
  500,
  502,
  503,
  504,
  509
])

const NETWORK_ERROR_PATTERNS = [
  'ENOTFOUND',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'fetch failed'
] as const

const getErrorStatusCode = (error: Error): number | undefined => {
  const directStatus =
    (error as { status?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode ??
    (error as { cause?: { status?: unknown } }).cause?.status ??
    (error as { cause?: { statusCode?: unknown } }).cause?.statusCode

  if (typeof directStatus === 'number') {
    return directStatus
  }

  const statusMatch = error.message.match(
    /(?:\bstatus\b|\bcode\b|\bresponse\b|\bHTTP\b|failed:?)\D{0,8}(\d{3})/i
  )
  if (!statusMatch?.[1]) {
    return undefined
  }

  const parsed = Number.parseInt(statusMatch[1], 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const isRetryableProviderError = (error: Error): boolean => {
  if (error.name === 'GovernanceBlockedError') {
    return false
  }

  const message = error.message
  const statusCode = getErrorStatusCode(error)

  if (statusCode !== undefined) {
    if (statusCode >= 100 && statusCode < 400) {
      return false
    }

    if (statusCode >= 400 && statusCode < 500) {
      return RETRYABLE_STATUS_CODES.has(statusCode)
    }

    return statusCode >= 500
  }

  if (NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
    return true
  }

  return !NON_RETRYABLE_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern)
  )
}

export const shouldContinueFallback = (
  providerProfiles: readonly unknown[],
  currentIndex: number
): boolean =>
  providerProfiles.length > 1 && currentIndex < providerProfiles.length - 1
