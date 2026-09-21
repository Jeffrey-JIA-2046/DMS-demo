const path = require('node:path')
const { Service } = require('node-windows')

const serviceName = process.env.DMS_BRIDGE_SERVICE_NAME || 'DMSNodeScannerBridge'
const displayName = process.env.DMS_BRIDGE_DISPLAY_NAME || 'DMS Node Scanner Bridge'
const serviceDescription = 'Local scanner bridge for DMS frontend (http://localhost:8787).'

const service = new Service({
  id: serviceName,
  name: displayName,
  description: serviceDescription,
  script: path.join(__dirname, 'server.js'),
  workingDirectory: __dirname,
  wait: 2,
  grow: 0,
  maxRetries: 3,
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

service.on('install', () => done(0, `Service '${serviceName}' installed.`))
service.on('alreadyinstalled', () => done(0, `Service '${serviceName}' already installed.`))
service.on('invalidinstallation', () => done(1, `Service '${serviceName}' installation is invalid.`))
service.on('error', (err) => done(1, err?.message || String(err)))

try {
  service.install()
} catch (err) {
  done(1, err?.message || String(err))
}
