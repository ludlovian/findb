import sortBy from 'sortby'
import MemTable from 'memdb'
import log from 'logjs'

import googleBackend from './google.mjs'
import memBackend from './mem.mjs'
import jsdbBackend from './jsdb.mjs'

const info = log.level(2)

export default function connect (backend) {
  /* c8 ignore next 2 */
  if (backend === 'google') backend = googleBackend
  else if (backend === 'jsdb') backend = jsdbBackend
  else backend = memBackend

  const stocks = new Stocks(backend)
  const positions = new Positions(backend)
  const trades = new Trades(backend)
  const allTables = [stocks, positions, trades]
  const save = () => Promise.all(allTables.map(t => t.save()))
  const load = () => Promise.all(allTables.map(t => t.load()))
  return { stocks, positions, trades, save, load }
}

class Table extends MemTable {
  constructor (name, store, main) {
    super({ main })
    this.name = name
    this.store = store(name)
  }

  async load () {
    const rows = await this.store.get()
    if (this.order) rows.sort(this.order)
    info('Loaded %d rows from %s', rows.length, this.name)
    super.load(rows)
  }

  async onsave (updated, deleted) {
    updated = [...updated]
    if (updated.length) {
      await this.store.upsert(updated)
      info('Upserted %d rows to %s', updated.length, this.name)
    }
    deleted = [...deleted]
    if (deleted.length) {
      await this.store.delete(deleted)
      info('Deleted %d rows from %s', deleted.length, this.name)
    }
  }
}

class Stocks extends Table {
  constructor (store) {
    super('Stock', store, s => s.ticker)
    this.order = sortBy('ticker')
  }
}

class Positions extends Table {
  constructor (store) {
    super('Position', store, p => `${p.who}_${p.account}_${p.ticker}`)
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker')
  }
}

class Trades extends Table {
  constructor (store) {
    const main = t => `${t.who}_${t.account}_${t.ticker}_${t.seq}`
    const pos = t => `${t.who}_${t.account}_${t.ticker}`
    super('Trade', store, main)
    this.order = sortBy('who')
      .thenBy('account')
      .thenBy('ticker')
      .thenBy('seq')
    this.addIndex('pos', pos)
  }
}
