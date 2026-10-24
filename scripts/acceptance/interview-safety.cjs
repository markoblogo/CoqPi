// Explicitly authorized paid text evaluation; private results never belong in Git.
const { _electron } = require(process.env.COQPI_PLAYWRIGHT_MODULE || 'playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

;(async () => {
  if (process.env.COQPI_ACCEPTANCE_PAID !== '1') throw new Error('Explicit paid authorization required')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-content-safety-'))
  await fs.chmod(directory, 0o700)
  const source = path.join(os.homedir(), 'Library/Application Support/CoqPi')
  for (const name of ['profile', 'personal-knowledge-core', 'simple-assistant']) {
    try { await fs.cp(path.join(source, 'data', name), path.join(directory, 'data', name), { recursive: true }) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  await fs.mkdir(path.join(directory, 'data/sessions'), {recursive:true})
  try { await fs.copyFile(path.join(source, 'data/sessions/current-session.json'), path.join(directory, 'data/sessions/current-session.json')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const secret = path.join(directory, 'electron/secrets/openai-key.bin')
  await fs.mkdir(path.dirname(secret), {recursive:true})
  await fs.copyFile(path.join(source, 'secrets/openai-key.bin'), secret)
  let app
  try {
    app = await _electron.launch({
      executablePath: '/Applications/CoqPi.app/Contents/MacOS/CoqPi',
      args: [`--user-data-dir=${path.join(directory, 'electron')}`], cwd: directory,
      env: { PATH:process.env.PATH, HOME:os.homedir(), TMPDIR:os.tmpdir(),
        COQPI_ENV_FILE:path.join(directory, 'absent.env'), COQPI_DATA_DIR:path.join(directory,'data'),
        COQPI_PERSONAL_KNOWLEDGE_CORE_DIR:path.join(directory,'data/personal-knowledge-core'),
        COQPI_ASSISTANT_PROVIDER_PROFILE:'openai:0', COQPI_ASSISTANT_FAILOVER_MODE:'none', OPENAI_ASSISTANT_MODEL:'gpt-4o-mini' },
      timeout:60000
    })
    const report = await app.evaluate(async (_, repo) => {
      const req = process.mainModule.require.bind(process.mainModule)
      const { analyzeRecentTranscript } = req(repo + '/dist-electron/backend/services/assistant-service.js')
      const { interviewSafetyScenarios } = req(repo + '/dist-electron/shared/interview-safety-scenarios.js')
      const originalFetch = globalThis.fetch
      let calls = 0, reservedUsd = 0, usageUsd = 0
      globalThis.fetch = async (url, options) => {
        if (String(url) !== 'https://api.openai.com/v1/responses') throw new Error('Unexpected evaluation endpoint')
        const body = JSON.parse(options.body)
        if (body.model !== 'gpt-4o-mini' || ++calls > 30) throw new Error('Evaluation limit')
        body.max_output_tokens = 512
        // UTF-8 bytes upper-bound input tokens; reserve even for failed requests.
        const upperBound = Buffer.byteLength(JSON.stringify(body)) * 0.15 / 1e6 + 512 * 0.60 / 1e6
        if (reservedUsd + upperBound > 0.50) throw new Error('Evaluation budget exhausted')
        reservedUsd += upperBound
        const response = await originalFetch(url, {...options, body:JSON.stringify(body)})
        if (response.ok) {
          const result = await response.clone().json()
          usageUsd += ((result.usage?.input_tokens || 0) * 0.15 + (result.usage?.output_tokens || 0) * 0.60) / 1e6
        }
        return response
      }
      const results = []
      try {
        for (const scenario of interviewSafetyScenarios) {
          const result = await analyzeRecentTranscript({responseStyle:'brief',transcriptText:scenario.question,
            latestIncomingUtterance:scenario.question,callLanguage:scenario.language,answerLanguage:scenario.language,
            mode:'manual',includeProfileContext:true,recentWindowLabel:'last-30-seconds',costMode:'balanced'})
          results.push({...scenario, answer:result.suggestedAnswers[0]?.text,model:result.model,latencyMs:result.latencyMs})
        }
        return {results,calls,reservedUsd,usageUsd,automaticSemanticVerdict:false}
      } finally { globalThis.fetch = originalFetch }
    }, path.resolve('.'))
    const reportPath = path.join(directory, 'report.json')
    await fs.writeFile(reportPath, JSON.stringify(report,null,2), {mode:0o600})
    console.log(JSON.stringify({reportPath,cases:report.results.length,reservedUsd:report.reservedUsd,usageUsd:report.usageUsd}))
  } finally {
    if (app) await app.close()
    await fs.rm(secret,{force:true})
  }
})().catch(error => { console.error(error.message); process.exitCode=1 })
