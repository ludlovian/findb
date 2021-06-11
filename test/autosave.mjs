import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { put, del } from 'httpie'
import sleep from 'pixutil/sleep'

import { setHook } from '../src/db/mem.mjs'
import main from '../src/main.mjs'

test('autosave', async () => {
  const app = main({ port: 39791, saveDelay: '100ms', backend: 'mem' })
  let calls = {}
  setHook((type, data) => (calls[type] = data))
  await app.start()

  await put('http://localhost:39791/stock', {
    body: { ticker: 'BAZZY', name: 'BAR' }
  })
  await sleep(200)

  assert.equal(calls.upsert, [{ ticker: 'BAZZY', name: 'BAR' }])
  assert.is(calls.delete, undefined)
  calls = {}

  await del('http://localhost:39791/stock', {
    body: [{ ticker: 'BAZZY', name: 'BAR' }]
  })
  await sleep(200)

  assert.equal(calls.delete, [{ ticker: 'BAZZY', name: 'BAR' }])
  assert.is(calls.upsert, undefined)

  app.close()
})

test.run()
