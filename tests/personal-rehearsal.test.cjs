const test = require('node:test')
const assert = require('node:assert/strict')
const { validateRehearsalDraft, validateEvidence } = require('../dist-electron/shared/personal-rehearsal.js')
const draft = () => ({ company: 'Synthetic Alpha', role: 'Product manager', goal: 'Clarify role and expectations', language: 'en', maxTurns: 8, confirmed: true,
  cv: { label: 'Submitted CV A', text: 'Synthetic candidate managed discovery for a booking product for two years. Led customer interviews and coordinated a small pilot with design and engineering. Contact: synthetic-person@example.invalid' },
  vacancy: { label: 'Vacancy A', text: 'Synthetic Alpha seeks a product manager for discovery, prioritisation and customer interviews. The role coordinates engineering and design for an early booking product.' },
  companyInfo: { label: 'Company A', text: 'Synthetic Alpha builds booking tools for independent studios. Its first pilot is planned for six weeks.' } })
test('personal rehearsal requires reviewed actual material content, not merely links', () => {
  assert.equal(validateRehearsalDraft(draft()).cv.label, 'Submitted CV A')
  assert.throws(() => validateRehearsalDraft({ ...draft(), confirmed: false }), /confirm/)
  assert.throws(() => validateRehearsalDraft({ ...draft(), cv: { label: 'URL', text: 'https://example.invalid/cv' } }), /CV/)
  assert.throws(() => validateRehearsalDraft({ ...draft(), maxTurns: 100 }), /questions/)
})
test('material evidence must be an exact quote from the declared source', () => {
  const sources = { cv: draft().cv.text, vacancy: draft().vacancy.text, company: draft().companyInfo.text, answer: 'I would first interview customers.' }
  assert.equal(validateEvidence({ source: 'cv', quote: 'two years' }, sources).source, 'cv')
  assert.throws(() => validateEvidence({ source: 'cv', quote: 'ten years' }, sources), /evidence/)
  assert.throws(() => validateEvidence({ source: 'company', quote: 'two years' }, sources), /evidence/)
})

const workspace = async run => {
  const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), Module = require('node:module')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-personal-'))
  const names = ['COQPI_SESSIONS_DIR', 'COQPI_PROFILE_DIR', 'COQPI_DATA_DIR', 'COQPI_GOVERNANCE_DIR', 'COQPI_PERSONAL_KNOWLEDGE_CORE_DIR']
  const oldEnv = Object.fromEntries(names.map(key => [key, process.env[key]]))
  for (const key of names) process.env[key] = path.join(directory, key)
  const oldLoad = Module._load
  Module._load = (request, parent, isMain) => {
    if (request === 'electron') return { app: { getName: () => 'CoqPi', getPath: () => directory, getAppPath: () => process.cwd(), isPackaged: false } }
    if (request === './secret-storage-service') return { resolveOpenAIApiKey: async () => 'synthetic-key' }
    if (request === './governance-service') return { runGovernedProviderAction: async (action, operation) => { assert.equal(action.toolRisk, 'read_only'); assert.doesNotMatch(JSON.stringify(action), /Synthetic Alpha|customer interviews/); return operation() } }
    return oldLoad(request, parent, isMain)
  }
  const oldFetch = global.fetch
  try {
    const context = require('../dist-electron/backend/services/personal-rehearsal-context.js')
    const service = require('../dist-electron/backend/services/personal-rehearsal-service.js')
    const recording = require('../dist-electron/backend/services/meeting-transcription-service.js')
    await run({ context, service, recording, fs, path, directory })
  } finally {
    global.fetch = oldFetch; Module._load = oldLoad
    for (const key of names) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key] }
    await fs.rm(directory, { recursive: true, force: true })
  }
}
test('two exact CV snapshots isolate adaptive questions, Live scope and durable review', () => workspace(async ({ context, service, recording, fs, path }) => {
  const a = await context.createRehearsalSnapshot(draft())
  const b = await context.createRehearsalSnapshot({ ...draft(), company: 'Synthetic Beta', language: 'fr', cv: { label: 'Submitted CV B', text: 'Synthetic candidate worked on five years of design research for museum exhibitions. Managed visitor research, coordinated creative partners and prepared exhibition briefs.' } })
  assert.notEqual(a.id, b.id); assert.notEqual(a.hash, b.hash)
  assert.equal(a.cv, undefined, 'summary does not expose saved raw CV')
  const session = { id: 'synthetic-session-a', language: 'en', mode: 'copilot', scenario: 'PERSONAL interview rehearsal', startedAt: '2026-10-25T12:00:00Z', status: 'recording', inputLabel: 'Fixture mic', segments: [], interim: {}, practice: { kind: 'personal-interview', snapshotId: a.id, snapshotHash: a.hash, company: a.company, turns: [] } }
  await recording.saveCurrentMeetingTranscriptionSession(session)
  let calls = 0, badQuote = false, failure = false
  global.fetch = async (url, options) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    const body = JSON.parse(options.body)
    assert.equal(body.store, false)
    const schema = body.text.format.schema
    const evidence = body.instructions.startsWith('Review') ? schema.properties.strengths.items.properties.evidence : schema.properties.evidence
    assert.ok(evidence.items.anyOf.length > 0, 'source quotes must be constrained before generation')
    assert.doesNotMatch(JSON.stringify(evidence), /synthetic-person@example/)
    assert.ok(evidence.items.anyOf.every(option => option.properties.source.enum.length === 1 && option.properties.quote.enum.every(quote => body.input.includes(quote))))
    assert.match(body.input, /Submitted CV A/)
    assert.doesNotMatch(body.input, /Submitted CV B|museum exhibitions|Synthetic Beta/)
    if (failure) return { ok: false, status: 503 }
    const data = body.instructions.startsWith('Review') ? {
      strengths: [{ text: 'Used a concrete discovery approach.', evidence: [{ source: 'answer', quote: 'interview customers' }] }],
      claimsToCheck: [], languagePoints: [], nextSteps: [{ text: 'Prepare one specific example.', evidence: [{ source: 'cv', quote: 'customer interviews' }] }]
    } : { question: session.practice.turns.length ? 'How would you choose which customers to interview first?' : 'How would your customer interviews help this product role?', reason: 'Role relevance.', evidence: [{ source: session.practice.turns.length ? 'answer' : 'cv', quote: badQuote ? 'invented evidence' : session.practice.turns.length ? 'interview customers' : 'customer interviews' }] }
    return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] }) }
  }
  const question = await service.nextRehearsalQuestion({ snapshotId: a.id, sessionId: session.id, index: 0 })
  assert.equal((await service.nextRehearsalQuestion({ snapshotId: a.id, sessionId: session.id, index: 0 })).question, question.question)
  assert.equal(calls, 1, 'same turn uses persisted question, not another provider call')
  session.practice.turns.push({ input: 'voice', requestedAt: session.startedAt, question: question.question })
  await recording.saveCurrentMeetingTranscriptionSession(session)
  const safe = await context.resolvePersonalRehearsalRequest({ practiceScenario: 'personal-interview-v1', rehearsalId: a.id, rehearsalSessionId: session.id, latestIncomingUtterance: question.question, includeProfileContext: true, selectedCounterpartyPackIds: ['foreign-pack'], answerLanguage: 'fr' })
  assert.equal(safe.includeProfileContext, false); assert.equal(safe.answerLanguage, 'en'); assert.deepEqual(safe.selectedCounterpartyPackIds, [])
  await assert.rejects(context.resolvePersonalRehearsalRequest({ ...safe, rehearsalId: b.id }), /do not match/)
  await assert.rejects(context.resolvePersonalRehearsalRequest({ ...safe, latestIncomingUtterance: 'Old unrelated question?' }), /Stale/)
  await assert.rejects(service.nextRehearsalQuestion({ snapshotId: a.id, sessionId: session.id, index: 1 }), /previous question/)
  session.segments.push({ id: 'me-1', text: 'I would interview customers.', sourceItemId: 'turn-0:one', speaker: 'ME', source: 'microphone', isFinal: true, startTime: session.startedAt })
  await recording.saveCurrentMeetingTranscriptionSession(session)
  badQuote = true
  await assert.rejects(service.nextRehearsalQuestion({ snapshotId: a.id, sessionId: session.id, index: 1 }), /evidence/)
  badQuote = false; failure = true
  await assert.rejects(service.nextRehearsalQuestion({ snapshotId: a.id, sessionId: session.id, index: 1 }), /Recording and materials preserved/)
  failure = false
  const followup = await service.nextRehearsalQuestion({ snapshotId: a.id, sessionId: session.id, index: 1 })
  assert.equal(followup.evidence[0].source, 'answer')
  await assert.rejects(service.reviewPersonalRehearsal({ snapshotId: a.id, sessionId: session.id }), /Stop and save/)
  session.status = 'stopped'; session.endedAt = '2026-10-25T12:02:00Z'
  await recording.saveCurrentMeetingTranscriptionSession(session)
  const before = await recording.getArchivedMeetingTranscriptionSession(session.id)
  const report = await service.reviewPersonalRehearsal({ snapshotId: a.id, sessionId: session.id })
  const count = calls
  assert.equal((await service.readPersonalRehearsalReport({ snapshotId: a.id, sessionId: session.id })).transcriptHash, report.transcriptHash)
  assert.equal((await service.reviewPersonalRehearsal({ snapshotId: a.id, sessionId: session.id })).transcriptHash, report.transcriptHash)
  assert.equal(calls, count)
  assert.deepEqual(await recording.getArchivedMeetingTranscriptionSession(session.id), before)
  assert.equal((await context.listRehearsalSnapshots()).length, 2)
  assert.equal((await recording.getMeetingTranscriptionHistory()).find(item => item.id === session.id).practiceCompany, a.company)
  await assert.rejects(context.resolvePersonalRehearsalRequest(safe), /stopped/)
  session.segments[0].text += ' Additional detail.'
  await recording.saveCurrentMeetingTranscriptionSession(session)
  assert.equal(await service.readPersonalRehearsalReport({ snapshotId: a.id, sessionId: session.id }), null)
  const file = path.join(context.rehearsalRoot(), 'materials', `${a.id}.json`)
  const damaged = JSON.parse(await fs.readFile(file, 'utf8')); damaged.cv.text += ' Tampered.'
  await fs.writeFile(file, JSON.stringify(damaged))
  await assert.rejects(context.loadRehearsalSnapshot(a.id), /changed or are damaged/)
}))

for (const language of ['en', 'fr']) test(`${language}: adaptive voice controller journals all eight turns and stops stale questions`, async () => {
  const { VirtualInterviewSession } = require('../dist-electron/shared/virtual-interview-session.js')
  const { personalHintRequest } = require('../dist-electron/shared/personal-rehearsal.js')
  let count = 0
  const saves = [], questions = []
  const controller = new VirtualInterviewSession({ id: () => `id-${++count}`, now: () => Date.now(), changed() {}, save: async item => { saves.push(structuredClone(item)) }, flush: async () => {}, openAudio: async () => {}, closeAudio: async () => {}, speak: async () => {}, cancelSpeech() {}, listen: async () => {}, stopListening: async () => {}, cancel() {}, analyze: async () => ({ ok: true, data: { suggestedAnswers: [{ text: 'Scoped hint' }], meaningRu: '', model: 'fixture', latencyMs: 10 } }) }, {
    snapshotId: 'scope-a', snapshotHash: 'hash-a', company: 'Synthetic Alpha', maxTurns: 8,
    question: async (session, index) => { questions.push(structuredClone(session)); return `Question ${index + 1} in ${language}?` },
    request: (id, lang, question, stream) => personalHintRequest('scope-a', id, lang, question, stream)
  })
  await controller.start(language)
  for (let i = 0; i < 8; i++) {
    controller.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: `answer-${i}`, transcript: `Synthetic voice answer ${i}` })
    await controller.next()
  }
  assert.equal(controller.phase, 'stopped')
  assert.equal(questions.length, 8)
  assert.equal(questions[1].segments.at(-1).text, 'Synthetic voice answer 0')
  assert.equal(saves.at(-1).segments.filter(item => item.speaker === 'ME').length, 8)
  assert.equal(saves.at(-1).practice.snapshotId, 'scope-a')
})

test('failed adaptive question is retryable; Stop suppresses a late generated question', async () => {
  const { VirtualInterviewSession } = require('../dist-electron/shared/virtual-interview-session.js')
  const { personalHintRequest } = require('../dist-electron/shared/personal-rehearsal.js')
  let sequence = 0, fail = false, release
  const controller = new VirtualInterviewSession({ id: () => `id-${++sequence}`, now: () => Date.now(), changed() {}, save: async () => {}, flush: async () => {}, openAudio: async () => {}, closeAudio: async () => {}, speak: async () => {}, cancelSpeech() {}, listen: async () => {}, stopListening: async () => {}, cancel() {}, analyze: async () => ({ ok: true, data: { suggestedAnswers: [{ text: 'Hint' }], meaningRu: '' } }) }, {
    snapshotId: 'snapshot', snapshotHash: 'hash', company: 'Alpha', maxTurns: 8,
    question: async (_session, index) => { if (fail) throw new Error('offline'); if (index === 2) return new Promise(resolve => { release = resolve }); return `Question ${index}?` },
    request: (id, lang, question, stream) => personalHintRequest('snapshot', id, lang, question, stream)
  })
  await controller.start('en'); controller.typed('First answer')
  fail = true; await assert.rejects(controller.next(), /offline/)
  assert.equal(controller.phase, 'question-error'); assert.equal(controller.index, 0)
  controller.typed('Must not become an answer during retry')
  assert.equal(controller.session.segments.filter(item => item.speaker === 'ME (typed)').length, 1)
  fail = false; await controller.next(); controller.typed('Second answer')
  const next = controller.next(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.phase, 'preparing')
  await controller.stop(); release('STALE question?'); await next
  assert.equal(controller.phase, 'stopped'); assert.equal(controller.session.practice.turns.length, 2)
  assert.ok(!controller.session.segments.some(item => item.text === 'STALE question?'))
})

test('material ingestion is explicit, bounded and public-only; converter failures keep a paste fallback', () => workspace(async ({ fs, path, directory }) => {
  const material = require('../dist-electron/backend/services/rehearsal-material-service.js')
  const markitdown = require('../dist-electron/backend/services/markitdown-service.js')
  const finder = require('../dist-electron/backend/services/finder-search-service.js')
  const location = path.join(directory, 'exact-cv.txt')
  await fs.writeFile(location, draft().cv.text)
  assert.equal((await material.readRehearsalMaterialFile(location)).text, draft().cv.text)
  await fs.writeFile(location, 'x'.repeat(30001))
  await assert.rejects(material.readRehearsalMaterialFile(location), /no silent truncation/)
  const pdf = path.join(directory, 'exact-cv.pdf'); await fs.writeFile(pdf, 'synthetic')
  markitdown.setMarkItDownRunnerForTests(async () => draft().cv.text)
  assert.equal((await material.readRehearsalMaterialFile(pdf)).label, 'exact-cv.pdf')
  markitdown.setMarkItDownRunnerForTests(async () => { throw new Error('missing converter') })
  await assert.rejects(material.readRehearsalMaterialFile(pdf), /Paste the reviewed text/)
  finder.setFinderPublicPageFetcherForTests(async url => ({ requestedUrl: url, finalUrl: url, title: 'Synthetic company', description: 'Reviewed public snippet.', excerpt: draft().companyInfo.text }))
  try {
    await assert.rejects(material.loadRehearsalPublicPage('http://127.0.0.1/private'), /Private/)
    assert.equal((await material.loadRehearsalPublicPage('https://example.test/company')).label, 'Synthetic company')
  } finally { finder.setFinderPublicPageFetcherForTests(null); markitdown.setMarkItDownRunnerForTests(null) }
}))
