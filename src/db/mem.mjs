const data = {}
let hook = () => {}

export default function open (name) {
  const table = data[name] || (data[name] = new Set())
  return {
    get: async () => [...table],
    upsert: async rows => {
      hook('upsert', rows)
      rows.forEach(row => table.add(row))
    },
    delete: async rows => {
      hook('delete', rows)
      rows.forEach(row => table.delete(row))
    }
  }
}

/* c8 ignore start */
export function setData (name, rows) {
  if (!data[name]) data[name] = new Set()
  data[name].clear()
  for (const r of rows) data[name].add(r)
}

export function setHook (fn) {
  hook = fn
}
/* c8 ignore end */
