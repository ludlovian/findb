import send from '@polka/send'
import { json } from '@polka/parse'

import log from 'logjs'

const info = log.level(2)

export default function makeApp (app) {
  const db = app.db

  app.use(logRequest)
  app.use(json())

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

  function logRequest (req, res, next) {
    info('%s %s', req.method, req.url)
    next()
  }

  function getData (table) {
    return (req, res) => {
      const data = [...db[table].all()]
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
    send(res, 200, data)
  }
}
