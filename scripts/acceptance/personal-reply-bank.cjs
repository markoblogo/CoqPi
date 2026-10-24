/* global window, document */
const assert = require('node:assert/strict')
const {start} = require('../test-support/recording-ui-harness.cjs')
;(async () => {
  const h = await start()
  try {
    const p = h.page
    await p.evaluate(() => {
      let entries = [{id:'synthetic',language:'en',questions:['Tell me about yourself.'],answer:'I led a synthetic project.',evidence:['I led a synthetic project.'],scopeHash:'one',approvedHash:null}]
      entries.push(...Array.from({length:19},(_,index) => ({...entries[0],id:`extra-${index}`,questions:[`Describe your experience in a synthetic project number ${index}.`]})))
      window.__audit.api.assistant.getPersonalReplyBank = () => ({entries,scopeHash:'one',ownerFacts:'I led a synthetic project.'})
      window.__audit.api.assistant.savePersonalReply = (_request,entry,approve) => {
        entries = entries.map(item => item.id === entry.id ? {...entry,approvedHash:approve?'synthetic-approval':null} : item)
        return {entries,scopeHash:'one',ownerFacts:'I led a synthetic project.'}
      }
    })
    await h.openMode('Prepare a session')
    await p.getByText('Мои готовые ответы · EN / FR',{exact:true}).click()
    await p.getByLabel('Выбрать ответ',{exact:true}).selectOption('synthetic')
    await p.getByLabel('Мой ответ',{exact:true}).fill('I worked on a synthetic project.')
    await p.getByRole('button',{name:'Подтверждаю факты и ответ'}).click()
    assert.match(await p.locator('option[value="synthetic"]').innerText(),/Подтверждён/)
    await p.getByLabel('Выбрать ответ',{exact:true}).selectOption('synthetic')
    await p.getByRole('button',{name:'Сохранить черновик / снять подтверждение'}).click()
    assert.match(await p.locator('option[value="synthetic"]').innerText(),/Черновик/)
    await p.getByLabel('Выбрать ответ',{exact:true}).selectOption('synthetic')
    for (const width of [400,640]) {
      await p.setViewportSize({width,height:650})
      const shot = await h.snap(`personal-replies-${width}`)
      assert.equal(shot.scrollWidth, width)
      const fits = await p.locator('.personal-reply-bank').evaluate(el => [...el.querySelectorAll('textarea,button,select')].every(node => node.getBoundingClientRect().right <= document.documentElement.clientWidth + 1))
      assert.ok(fits)
    }
    assert.deepEqual(h.errors,[])
    console.log('Personal reply bank: draft, edit, approve, revoke and 400/640px layout passed')
  } finally { await h.close() }
})().catch(error => {console.error(error);process.exitCode=1})
