const assert = require('node:assert/strict')
const test = require('node:test')

const {
  parseCounterpartyPackJsonPayload,
  normalizeLinksText
} = require('../dist-electron/shared/counterparty-pack-import.js')

test('normalizes linksText lines for counterparty pack import', () => {
  assert.deepEqual(
    normalizeLinksText('https://a.example\n\n https://b.example \nhttps://a.example'),
    ['https://a.example', 'https://b.example']
  )
})

test('rejects malformed counterparty pack payload missing required fields', () => {
  assert.throws(
    () =>
      parseCounterpartyPackJsonPayload(
        JSON.stringify({
          sourceId: '',
          kind: 'job',
          partnerName: 'Acme',
          title: 'Role',
          summary: 'Summary'
        })
      ),
    /A counterparty pack requires kind, sourceId, partnerName, title and summary./
  )

  assert.throws(
    () =>
      parseCounterpartyPackJsonPayload(
        JSON.stringify({
          kind: 'job',
          partnerName: 'Acme',
          title: 'Role',
          summary: 'Summary'
        })
      ),
    /A counterparty pack requires kind, sourceId, partnerName, title and summary./
  )
})

test('parses a single-object payload into one draft', () => {
  const packs = parseCounterpartyPackJsonPayload(
    JSON.stringify({
      kind: 'investor',
      sourceId: 'finder:investor:001',
      partnerName: 'Atlas Capital',
      title: 'Seed round investor',
      summary: 'Looking for agri-commodity AI platform.',
      linksText: 'https://atlas.example\n\nhttps://deck.example'
    })
  )

  assert.equal(packs.length, 1)
  assert.equal(packs[0].kind, 'investor')
  assert.equal(packs[0].partnerName, 'Atlas Capital')
  assert.equal(packs[0].links.length, 2)
  assert.equal(packs[0].links[0], 'https://atlas.example')
  assert.equal(packs[0].selected, true)
})
