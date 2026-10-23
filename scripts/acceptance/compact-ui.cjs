/* global window, document, innerWidth, getComputedStyle */
// Synthetic UI regression only; not a substitute for installed audio acceptance.
const assert = require('node:assert/strict')
const { start } = require('../test-support/recording-ui-harness.cjs')

;(async () => {
  const h = await start(), p = h.page
  try {
    for (const width of [520, 400]) {
      await p.setViewportSize({ width, height: 390 })
      assert.equal(await p.locator('.mode-options button').count(), 3)
      assert.equal(await p.getByTitle('Find and review targets').count(), 0)
      await h.snap(`compact-home-${width}`)
      await p.getByTitle('Live assistant', { exact: true }).click()
      await p.getByLabel('Громкая связь', { exact: true }).check()
      await p.getByRole('button', { name: 'Продолжить', exact: true }).click()
      assert.equal(await p.locator('.app-bar').count(), 0)
      assert.equal(await p.locator('.call-answer').count(), 1)
      assert.equal(await p.locator('.call-heard').count(), 1)
      assert.equal(await p.getByRole('button', { name: 'I am speaking', exact: true }).count(), 0)
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      assert.equal(await p.locator('.call-answer > p').evaluate(el => getComputedStyle(el).fontSize), '30px')
      await h.snap(`compact-call-${width}`)
      await h.openMode('Meeting transcription')
      const overflow = await p.evaluate(() => [...document.querySelectorAll('button,select')].filter(el => {
        const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1)
      }).map(el => el.textContent.slice(0, 40)))
      assert.deepEqual(overflow, [])
      await h.snap(`compact-recorder-${width}`)
      await p.getByRole('button', { name: 'Choose mode', exact: true }).click()
    }
    await h.openMode('Settings')
    for (const width of [640, 400]) {
      await p.setViewportSize({width, height:320})
      for (const name of ['Звук', 'Разговор', 'Запись', 'Мои данные', 'Подключение']) {
        await p.getByRole('tab', {name, exact:true}).click()
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        await h.snap(`settings-${width}-${name}`)
      }
    }
    await p.locator('input[type=password]').first().fill('synthetic-unused')
    await p.getByRole('button', { name: 'Save', exact: true }).click()
    await p.getByRole('button', { name: 'Choose mode', exact: true }).click()
    await p.getByTitle('Live assistant', { exact: true }).click()
    await p.getByLabel('Наушники + микрофон', { exact: true }).check()
    await p.getByLabel('Other side input', { exact: true }).selectOption('synthetic-loopback')
    await p.getByRole('button', { name: 'Продолжить', exact: true }).click()
    await p.getByRole('button', { name: 'Start listening', exact: true }).click()
    await p.waitForFunction(() => window.__audit.channels?.length === 2)
    assert.equal(await p.getByRole('button', { name: 'I am speaking', exact: true }).count(), 0)
    assert.equal(await p.locator('.call-focus-toolbar button:visible').count(), 1)
    await p.locator('.call-heard').click()
    await p.keyboard.down('Space')
    await p.evaluate(() => window.__audit.channels[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'compact-test', transcript: 'Could you explain how you manage a difficult project?' }) })))
    await p.waitForFunction(() => window.__audit.requests.length > 0)
    await p.evaluate(() => {
      const streamId = window.__audit.requests.at(-1).streamId
      for (const listener of window.__audit.progressListeners) listener({streamId,meaningRu:'Как вы ведёте проект?',answer:'I begin by'})
    })
    await p.getByText('I begin by', {exact:true}).waitFor()
    await p.waitForFunction(() => document.querySelector('.call-answer > p')?.textContent.startsWith('I would'))
    await p.keyboard.up('Space')
    await h.snap('compact-answer-headphones')
    await p.getByRole('button', { name: 'Stop listening', exact: true }).click()
    await p.evaluate(() => {
      const streamId = window.__audit.requests.at(-1).streamId
      for (const listener of window.__audit.progressListeners) listener({streamId,meaningRu:'STALE',answer:'STALE'})
    })
    assert.equal(await p.getByText('STALE', {exact:true}).count(), 0)
    assert.equal(await p.evaluate(() => window.__audit.progressListeners.size), 0)
    await h.openMode('Live assistant')
    await p.getByRole('button', { name: 'Choose mode', exact: true }).click()
    await p.getByTitle('Live assistant', { exact: true }).click()
    await p.getByLabel('Громкая связь', { exact: true }).check()
    await p.getByRole('button', { name: 'Продолжить', exact: true }).click()
    await p.getByRole('button', { name: 'Start listening', exact: true }).click()
    await p.getByRole('button', { name: 'I am speaking', exact: true }).click()
    assert.equal(await p.getByRole('button', { name: 'I am speaking', exact: true }).getAttribute('aria-pressed'), 'true')
    await h.snap('compact-answer-speaker')
    await p.getByRole('button', { name: 'Stop listening', exact: true }).click()
    assert.deepEqual(h.errors, [])
    assert.deepEqual(h.blocked, [])
    console.log('PASS: three modes; 400/520px; two conversation blocks; automatic dual-source/manual single-source controls; no external requests')
  } finally { await h.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
