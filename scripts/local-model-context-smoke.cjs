#!/usr/bin/env node
const fs = require('node:fs/promises')
const path = require('node:path')

const fixturePath = process.argv[2] || path.join(__dirname, '..', 'tests', 'fixtures', 'local-model-context.json')
const endpoint = process.env.COQPI_LOCAL_MODEL_URL || 'http://127.0.0.1:8766/v1/answer'

async function main() {
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'))
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...fixture, project: 'coqpi' })
  })
  const payload = await response.json()
  if (!response.ok || !payload.ok) throw new Error(payload.error || `local model HTTP ${response.status}`)
  if (payload.evidence?.context_mode !== 'explicit_only' || payload.evidence?.live_proof !== false) {
    throw new Error('local model receipt violated the explicit-context/read-only contract')
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`)
  process.exitCode = 1
})
