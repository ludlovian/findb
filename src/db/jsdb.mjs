import Database from 'jsdb'

let tables

/* c8 ignore start */
export default function open (name) {
  if (!tables) makeTables()
  const db = tables[name]
  return {
    get: async () => (await db.getAll()).map(rec => ({ ...rec })),
    upsert: async docs => db.upsert(docs),
    delete: async docs => db.delete(docs),
    onsave: async () => db.compact()
  }
}

function makeTables () {
  const Position = new Database('position.db')
  Position.ensureIndex({
    name: 'primary',
    fields: ['who', 'account', 'ticker']
  })

  const Stock = new Database('stock.db')
  Stock.ensureIndex({ name: 'primary', fields: ['ticker'] })

  const Trade = new Database('trade.db')
  Trade.ensureIndex({
    name: 'primary',
    fields: ['who', 'account', 'ticker', 'seq']
  })

  tables = { Position, Stock, Trade }
}
/* c8 ignore end */
