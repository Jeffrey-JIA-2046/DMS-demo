const path = require('node:path')
const { Service } = require('node-windows')

const serviceName = process.env.DMS_BRIDGE_SERVICE_NAME || 'DMSNodeScannerBridge'
const displayName = process.env.DMS_BRIDGE_DISPLAY_NAME || 'DMS Node Scanner Bridge'

const service = new Service({
  id: serviceName,
  name: displayName,
  script: path.join(__dirname, 'server.js'),
})

let finished = false
const done = (code, message) => {
  if (finished) return
  finished = true
  if (message) {
    const target = code === 0 ? process.stdout : process.stderr
    target.write(`${message}\n`)
  }
  process.exit(code)
}

service.on('uninstall', () => done(0, `Service '${serviceName}' removed.`))
service.on('alreadyuninstalled', () => done(0, `Service '${serviceName}' is not installed.`))
service.on('error', (err) => done(1, err?.message || String(err)))

try {
  service.uninstall()
} catch (err) {
  done(1, err?.message || String(err))
}
