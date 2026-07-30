const assert = require('node:assert/strict')
const test = require('node:test')

const { sanitizeForExternalAssistant } = require('../dist-electron/shared/privacy-sanitizer.js')
const { processTranscriptForAssistant } = require('../dist-electron/shared/transcript-processing.js')
const { buildPreCallPreparationPacket, buildPostCallRecapDraft } = require('../dist-electron/shared/meeting-workflow.js')

test('privacy gate redacts PII and blocks secret-like material', () => {
  const result = sanitizeForExternalAssistant('Email me at owner@example.com or call +33 6 12 34 56 78')
  assert.equal(result.blocked, false)
  assert.deepEqual(result.redactions.sort(), ['email', 'phone'])
  assert.doesNotMatch(result.safeText, /owner@example.com|\+33 6/)

  const blocked = sanitizeForExternalAssistant('api_key=sk-abcdefghijklmnopqrstuvwxyz')
  assert.equal(blocked.blocked, true)
  assert.equal(blocked.safeText, '')
})

test('transcript processing removes local noise and keeps explicit language handling', () => {
  const result = processTranscriptForAssistant('[noise] Could you explain your role? [inaudible]', 'auto')
  assert.equal(result.languageHint, 'en')
  assert.equal(result.removedNoise, true)
  assert.equal(result.text, 'Could you explain your role?')
})

test('pre-call packet stays bounded to selected packs and post-call recap has an agenda', () => {
  const sessionContext = {
    company: 'Northfield Labs', role: 'AI Product Lead', context: '',
    goal: 'Understand the role and next steps', notes: 'Mention discovery work',
    selectedCounterpartyPackIds: ['pack-selected'], selectedFinderOutreachDraftId: 'draft-1'
  }
  const selected = { id: 'pack-selected', partnerName: 'Northfield Labs', title: 'AI Product Lead', summary: 'AI transformation role' }
  const ignored = { id: 'pack-ignored', partnerName: 'Other', title: 'Other', summary: 'Must not enter packet' }
  const draft = { id: 'draft-1', targetName: 'Northfield Labs', whyRelevant: 'Strong fit' }
  const packet = buildPreCallPreparationPacket({ sessionContext, packs: [selected, ignored], draft })
  assert.deepEqual(packet.selectedPackIds, ['pack-selected'])
  assert.doesNotMatch(packet.participantContext.join(' '), /Must not enter packet/)
  const recap = buildPostCallRecapDraft({ sessionContext, summary: 'Intro call completed.' })
  assert.deepEqual(recap.agenda, ['Understand the role and next steps'])
})
