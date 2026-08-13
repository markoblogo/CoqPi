const assert = require('node:assert/strict')
const test = require('node:test')
const Module = require('node:module')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')

const mockElectron = {
  app: {
    getName: () => 'CoqPi',
    getPath: () => path.join(os.tmpdir(), 'coqpi-meeting-userdata')
  }
}

const withMeetingWorkspace = async (run) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'coqpi-meeting-'))
  const previousSessionsDirectory = process.env.COQPI_SESSIONS_DIR
  const originalModuleLoad = Module._load

  process.env.COQPI_SESSIONS_DIR = path.join(directory, 'sessions')

  Module._load = (request, parent, isMain) => {
    if (request === 'electron') {
      return mockElectron
    }

    return originalModuleLoad(request, parent, isMain)
  }

  try {
    const service = require('../dist-electron/backend/services/meeting-transcription-service.js')
    const shared = require('../dist-electron/shared/meeting-transcription.js')
    await run({ service, shared, directory })
  } finally {
    Module._load = originalModuleLoad

    if (previousSessionsDirectory === undefined) {
      delete process.env.COQPI_SESSIONS_DIR
    } else {
      process.env.COQPI_SESSIONS_DIR = previousSessionsDirectory
    }

    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('meeting transcription service autosaves restores exports and clears session', async () => {
  await withMeetingWorkspace(async ({ service, shared, directory }) => {
    let session = shared.createMeetingTranscriptionSession({
      id: 'meeting-1',
      language: 'uk',
      inputLabel: 'MacBook Microphone',
      now: '2026-08-13T10:00:00.000Z'
    })
    session = shared.applyMeetingTranscriptionRealtimeEvent({
      session,
      event: {
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'a',
        transcript: 'Доброго дня.'
      },
      now: '2026-08-13T10:00:04.000Z',
      createSegmentId: () => 'segment-1'
    }).session

    await service.saveCurrentMeetingTranscriptionSession(session)
    const restored = await service.getCurrentMeetingTranscriptionSession()

    assert.equal(restored.segments[0].text, 'Доброго дня.')
    assert.equal(restored.interim.a, undefined)

    const exportPath = path.join(directory, 'meeting.md')
    await service.writeMeetingTranscriptExport(
      { session: restored, format: 'md' },
      exportPath
    )

    const exported = await fs.readFile(exportPath, 'utf8')
    assert.match(exported, /Language: Ukrainian/)
    assert.match(exported, /Доброго дня/)

    await service.clearCurrentMeetingTranscriptionSession()
    assert.equal(await service.getCurrentMeetingTranscriptionSession(), null)
  })
})
