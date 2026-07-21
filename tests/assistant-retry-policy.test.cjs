const assert = require('node:assert/strict')
const test = require('node:test')

const {
  isRetryableProviderError,
  shouldContinueFallback
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

test('does not continue fallback when there is only one provider', () => {
  assert.equal(shouldContinueFallback(['openai'], 0), false)
})

test('continues fallback only when more than one provider exists and index is not last', () => {
  const profileOrder = ['openai', 'ollama', 'mock']

  assert.equal(shouldContinueFallback(profileOrder, 0), true)
  assert.equal(shouldContinueFallback(profileOrder, 1), true)
  assert.equal(shouldContinueFallback(profileOrder, 2), false)
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

test('does not retry on temporary client-side HTTP errors', () => {
  assert.equal(
    isRetryableProviderError(new Error('Ollama API request failed: 400 Bad Request')),
    false
  )

  assert.equal(
    isRetryableProviderError(new Error('OpenAI request failed with status 413')),
    false
  )
  assert.equal(
    isRetryableProviderError(new Error('OpenAI request failed with status 401')),
    false
  )
  assert.equal(
    isRetryableProviderError(new Error('OpenAI request failed with status 403')),
    false
  )
})

test('does not retry governance blocks', () => {
  const governanceBlocked = new Error('Governance blocked action: risk high')
  governanceBlocked.name = 'GovernanceBlockedError'

  assert.equal(isRetryableProviderError(governanceBlocked), false)
})
