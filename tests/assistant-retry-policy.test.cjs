const assert = require('node:assert/strict')
const test = require('node:test')

const {
  isRetryableProviderError
} = require('../dist-electron/backend/services/assistant-service-retry-policy.js')

test('does not retry on schema/contract validation failures', () => {
  assert.equal(
    isRetryableProviderError(
      new Error('Invalid model response: Model response JSON does not match the expected shape.')
    ),
    false
  )

  assert.equal(
    isRetryableProviderError(
      new Error('Model response JSON does not match the expected shape.')
    ),
    false
  )
})

test('does retry on operational network/API and transport errors', () => {
  assert.equal(
    isRetryableProviderError(
      new Error('Ollama API request failed: 503 Service Unavailable')
    ),
    true
  )

  assert.equal(
    isRetryableProviderError(new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:11434')),
    true
  )
})

test('does not retry governance blocks', () => {
  const governanceBlocked = new Error('Governance blocked action: risk high')
  governanceBlocked.name = 'GovernanceBlockedError'

  assert.equal(isRetryableProviderError(governanceBlocked), false)
})

