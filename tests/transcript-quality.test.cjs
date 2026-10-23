const test = require('node:test')
const assert = require('node:assert/strict')
const {words, wordErrors} = require('../scripts/acceptance/transcript-quality.cjs')

test('transcript comparison tolerates French thousands spacing only', () => {
  assert.equal(wordErrors(words('15000 euros, pas 50000'), words('15 000 euros, pas 50\u202f000')), 0)
  assert.ok(wordErrors(words('15000 euros, pas 50000'), words('50000 euros, pas 15000')) > 0)
  assert.ok(wordErrors(words('sans réduire les tests'), words('réduire les tests')) > 0)
  assert.ok(wordErrors(words('27 novembre'), words('28 novembre')) > 0)
  assert.deepEqual(words('15 27 000'), ['15', '27000'])
})
