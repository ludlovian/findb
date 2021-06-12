import send from '@polka/send'
import { json } from '@polka/parse'
import arrify from 'pixutil/arrify'

import log from 'logjs'

const info = log.prefix('findb:app:').level(2)

export default function makeApp (app) {
  const db = app.db

  app.use(json({ limit: 1e7 }))
  app.use(logRequest)

  app.get('/stock', getData('stocks'))
  app.get('/stock/active', getActiveStocks)
  app.put('/stock', updateData('stocks'))
  app.delete('/stock', deleteData('stocks'))

  app.get('/position', getData('positions'))
  app.put('/position', updateData('positions'))
  app.delete('/position', deleteData('positions'))

  app.get('/trade', getData('trades'))
  app.put('/trade', updateData('trades'))
  app.delete('/trade', deleteData('trades'))

  function getData (table) {
    return (req, res) => {
      const data = [...db[table].all()]
      res.emit('report', data)
      send(res, 200, data)
    }
  }

  function updateData (table) {
    return (req, res) => {
      const data = req.body
      db[table].upsert(data)
      app.save()
      send(res, 200)
    }
  }

  function deleteData (table) {
    return (req, res) => {
      const data = req.body
      db[table].delete(data)
      app.save()
      send(res, 200)
    }
  }

  function getActiveStocks (req, res) {
    const tickers = new Set()
    for (const stock of db.stocks.all()) {
      if (stock.dividend) tickers.add(stock.ticker)
    }
    for (const pos of db.positions.all()) {
      tickers.add(pos.ticker)
    }
    const data = [...db.stocks.all()].filter(s => tickers.has(s.ticker))
    res.emit('report', data)
    send(res, 200, data)
  }
}

function logRequest (req, res, next) {
  res.once('report', data => {
    let items = ''
    if (data) {
      const n = arrify(data).length
      items = pluralise(` (${n} items?)`, n)
    }
    info('%s %s%s', req.method, req.url, items)
  })

  if (req.method !== 'GET') res.emit('report', req.body)
  next()
}

function pluralise (s, n) {
  return n > 1 ? s.replaceAll('s?', 's') : s.replaceAll('s?', '')
}
