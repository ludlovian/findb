import { test } from 'uvu'
import * as assert from 'uvu/assert'

import { put, get, del } from 'httpie'

import { setData } from '../src/db/mem.mjs'
import main from '../src/main.mjs'

const TESTDATA = {
  Stock: [
    { ticker: 'BAR', price: '23', dividend: '1.2' },
    { ticker: 'BAZ', price: '34', dividend: '2.3' },
    { ticker: 'FOO', price: '12' },
    { ticker: 'QUUX' }
  ],
  Position: [
    { who: 'AJL', account: 'ISA', ticker: 'BAR', qty: '10' },
    { who: 'AJL', account: 'ISA', ticker: 'FOO', qty: '15' }
  ],
  Trade: [
    { who: 'AJL', account: 'SIPP', ticker: 'BAR', seq: 1, cost: '123' },
    { who: 'AJL', account: 'SIPP', ticker: 'FOO', seq: 1, cost: '234' },
    { who: 'AJL', account: 'SIPP', ticker: 'FOO', seq: 2, cost: '345' }
  ]
}

test.before(async ctx => {
  ctx.app = main({ port: 39790, saveDelay: '2s', backend: 'mem' })
  ctx.url = 'http://localhost:39790'
  for (const k in TESTDATA) setData(k, TESTDATA[k])
  await ctx.app.start()
})

test.after(async ({ app }) => {
  app.save.cancel()
  app.close()
})

test('get all stocks', async ({ url }) => {
  const res = await get(`${url}/stock`)
  assert.equal(res.data, TESTDATA.Stock)
})

test('get active stocks', async ({ url }) => {
  const res = await get(`${url}/stock/active`)
  const tickers = res.data.map(s => s.ticker).sort()
  assert.equal(tickers, ['BAR', 'BAZ', 'FOO'])
})

test('update stocks', async ({ url }) => {
  const row = { ticker: 'QUUX', name: 'quux' }
  const res = await put(`${url}/stock`, { body: row })
  assert.is(res.statusCode, 200)

  const rows = (await get(`${url}/stock`)).data
  const changedRow = rows.find(r => r.ticker === 'QUUX')
  assert.is(changedRow.name, 'quux')
})

test('delete stocks', async ({ url }) => {
  const row = { ticker: 'QUUX' }
  const res = await del(`${url}/stock`, { body: row })
  assert.is(res.statusCode, 200)

  const rows = (await get(`${url}/stock`)).data
  assert.is(
    rows.find(s => s.ticker === 'QUUX'),
    undefined
  )
})

test('get positions', async ({ url }) => {
  const res = await get(`${url}/position`)
  assert.equal(res.data, TESTDATA.Position)
})

test('put positions', async ({ url }) => {
  const row = { ...TESTDATA.Position[1], qty: '20' }
  const res = await put(`${url}/position`, { body: [row] })

  assert.is(res.statusCode, 200)

  const rows = (await get(`${url}/position`)).data
  const changedRow = rows.find(r => r.ticker === row.ticker)
  assert.is(changedRow.qty, '20')
})

test('delete positions', async ({ url }) => {
  const row = { who: 'AJL', account: 'ISA', ticker: 'BAR' }
  const res = await del(`${url}/position`, { body: row })
  assert.is(res.statusCode, 200)

  const rows = (await get(`${url}/position`)).data
  assert.is(rows.length, TESTDATA.Position.length - 1)
})

test('get trades', async ({ url }) => {
  const res = await get(`${url}/trade`)
  assert.equal(res.data, TESTDATA.Trade)
})

test('put trades', async ({ url }) => {
  const row = { ...TESTDATA.Trade[1], gain: '987' }
  const res = await put(`${url}/trade`, { body: [row] })
  assert.is(res.statusCode, 200)

  const rows = (await get(`${url}/trade`)).data
  const changedRow = rows.find(t => t.cost === '234')
  assert.is(changedRow.gain, '987')
})

test.run()
