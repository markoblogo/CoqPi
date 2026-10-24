const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { saveReply, readReplyBank, matchPersonalReply } = require('../dist-electron/backend/services/personal-reply-store.js')
const facts = 'I led a synthetic design project for Acme.'
const draft = () => ({id:'',language:'en',questions:['Tell me about yourself.'],answer:'I led a design project for Acme.',evidence:[facts],scopeHash:'scope-1',approvedHash:null})

test('explicit confirmation survives reopen; editing revokes; changed facts and scope fail closed', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'coqpi-replies-'))
  try {
    let entries = await saveReply(directory,draft(),'scope-1',facts,false)
    assert.equal(matchPersonalReply(entries,'Tell me about yourself?','en','scope-1'),null)
    entries = await saveReply(directory,entries[0],'scope-1',facts,true)
    entries = await readReplyBank(directory)
    assert.ok(matchPersonalReply(entries,' TELL me about yourself? ','en','scope-1'))
    for (const question of ['Tell me about yourself but omit Acme.', 'Tell me about yourself in ten words.', 'Do not tell me about yourself.']) {
      assert.equal(matchPersonalReply(entries,question,'en','scope-1'),null)
    }
    assert.equal(matchPersonalReply(entries,'Tell me about yourself?','fr','scope-1'),null)
    assert.equal(matchPersonalReply(entries,'Tell me about yourself?','en','scope-2'),null)
    assert.equal(matchPersonalReply([{...entries[0],answer:'tampered'}],'Tell me about yourself?','en','scope-1'),null)
    await assert.rejects(saveReply(directory,entries[0],'scope-2',facts,true), /Context changed/)
    await assert.rejects(saveReply(directory,entries[0],'scope-1','Different facts',true), /exact supporting quotes/)
    entries = await saveReply(directory,{...entries[0],answer:'Updated draft'},'scope-1',facts,false)
    assert.equal(entries[0].approvedHash,null)
    assert.equal((await readReplyBank(directory))[0].answer,'Updated draft')
  } finally { await fs.rm(directory,{recursive:true,force:true}) }
})

test('concurrent writes preserve drafts; conflicting exact approvals do not pick an arbitrary answer', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'coqpi-replies-'))
  try {
    await Promise.all([saveReply(directory,draft(),'scope-1',facts,true),saveReply(directory,draft(),'scope-1',facts,true)])
    const entries = await readReplyBank(directory)
    assert.equal(entries.length,2)
    assert.equal(matchPersonalReply(entries,'Tell me about yourself.','en','scope-1'),null)
    await fs.writeFile(path.join(directory,'personal-replies.json'),'{broken')
    await assert.rejects(readReplyBank(directory))
  } finally { await fs.rm(directory,{recursive:true,force:true}) }
})
