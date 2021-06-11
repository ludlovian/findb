import mri from 'mri'
import main from './main.mjs'

const version = '__VERSION__'
const opts = mri(process.argv.slice(2), {
  alias: {
    saveDelay: 'save-delay',
    port: 'p',
    help: 'h',
    version: 'v'
  },
  default: {
    saveDelay: '1m',
    port: 39705,
    backend: 'google'
  }
})
if (opts.version) {
  console.log('findb %s', version)
} else if (opts.help) {
  console.log(
    '\n  Usage\n\n' +
      '    findb [options]\n\n' +
      '  Options\n' +
      '    -v, --version     Display current version\n' +
      '    -h, --help        Displays this message\n' +
      '    -p, --port        Sets the port (default: 39705)\n' +
      '    --save-delay      Sets the save delay (default: 1m)\n' +
      '    --backend         Sets the backend to use (default google)\n'
  )
} else {
  main(opts).start()
}
