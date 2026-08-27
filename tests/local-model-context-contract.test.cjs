const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { spawn } = require('node:child_process')
const path = require('node:path')

test('local model smoke adapter preserves read-only receipt contract', async () => {
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      const input = JSON.parse(body)
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({
        ok: true,
        schema_version: 'local-answer.v1',
        status: 'ANSWERED',
        project: input.project,
        evidence: { source_ids: ['fixture'], context_mode: 'explicit_only', live_proof: false }
      }))
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'local-model-context-smoke.cjs')], {
    env: { ...process.env, COQPI_LOCAL_MODEL_URL: `http://127.0.0.1:${port}/v1/answer` }
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  const exitCode = await new Promise(resolve => child.on('close', resolve))
  await new Promise(resolve => server.close(resolve))
  assert.equal(exitCode, 0, stderr)
  const result = JSON.parse(stdout)
  assert.equal(result.evidence.context_mode, 'explicit_only')
  assert.equal(result.evidence.live_proof, false)
})
