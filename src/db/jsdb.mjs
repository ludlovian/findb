import Database from 'jsdb'

/* c8 ignore start */
const tables = {
  Position: new Database('position.db'),
  Stock: new Database('stock.db'),
  Trade: new Database('trade.db')
}

tables.Position.ensureIndex({
  name: 'primary',
  fields: ['who', 'account', 'ticker']
})
tables.Stock.ensureIndex({ name: 'primary', fields: ['ticker'] })
tables.Trade.ensureIndex({
  name: 'primary',
  fields: ['who', 'account', 'ticker', 'seq']
})

export default function open (name) {
  const db = tables[name]
  return {
    get: async () => db.getAll().map(rec => ({ ...rec })),
    upsert: async docs => db.upsert(docs),
    delete: async docs => db.delete(docs)
  }
}
/* c8 ignore end */
