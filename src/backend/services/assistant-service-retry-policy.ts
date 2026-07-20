const NON_RETRYABLE_ERROR_PATTERNS = [
  'Invalid model response',
  'Model response JSON does not match the expected shape.',
  'OPENAI_API_KEY',
  'OPENAI returned an empty response.',
  'Governance blocked action'
] as const

export const isRetryableProviderError = (error: Error): boolean => {
  if (error.name === 'GovernanceBlockedError') {
    return false
  }

  const message = error.message

  return !NON_RETRYABLE_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern)
  )
}

