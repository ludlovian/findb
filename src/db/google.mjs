import { Table } from 'googlejs/datastore'

/* c8 ignore start */
export default function open (name) {
  const table = new Table(name)

  return {
    get: () => table.select(),
    upsert: rows => table.upsert(rows),
    delete: rows => table.delete(rows)
  }
}
/* c8 ignore end */
