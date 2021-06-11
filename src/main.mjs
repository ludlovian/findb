import { parse } from '@lukeed/ms'
import polka from 'polka'

import log from 'logjs'

import connect from './db/index.mjs'
import makeApp from './app.mjs'

const info = log.level(1)

export default function main (opts) {
  const { port, backend, saveDelay } = opts
  const version = '__VERSION__'
  info('version %s', version)
  info('started')

  const app = polka()
  const db = connect(backend)
  app.db = db

  makeApp(app)

  app.start = () =>
    db
      .load()
      .then(() => listen(app, port))
      .then(() => info('listening on port %d', port))
      .catch(bail)
  app.close = () => app.server.close()
  app.save = makeSaver(app.db, saveDelay)

  return app
}

function listen (app, port) {
  return new Promise((resolve, reject) => {
    app.listen(port)
    app.server.on('error', reject).on('listening', resolve)
  })
}

function makeSaver (db, delay) {
  let tm
  delay = parse(delay)

  function save () {
    tm = null
    log.level(2)('Storing updates')
    db.save().catch(bail)
  }

  function cancel () {
    if (!tm) return
    clearTimeout(tm)
    tm = null
  }

  function request () {
    cancel()
    tm = setTimeout(save, delay)
  }

  request.cancel = cancel

  return request
}

/* c8 ignore next 4 */
function bail (err) {
  console.error(err)
  process.exit(2)
}
