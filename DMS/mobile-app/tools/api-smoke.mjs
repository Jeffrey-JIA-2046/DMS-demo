/* eslint-disable no-console */

const baseUrl = (process.env.DMS_SMOKE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '')
const username = process.env.DMS_SMOKE_USER
const password = process.env.DMS_SMOKE_PASS
const runAdminChecks = String(process.env.DMS_SMOKE_ADMIN || 'false').toLowerCase() === 'true'

if (!username || !password) {
  console.error('Missing credentials. Set DMS_SMOKE_USER and DMS_SMOKE_PASS.')
  process.exit(1)
}

const token = Buffer.from(`${username}:${password}`).toString('base64')
const authHeaders = { Authorization: `Basic ${token}` }

const endpoints = [
  { name: 'profile', path: '/api/me', expect: [200] },
  { name: 'dashboard', path: '/api/dashboard/my-tasks', expect: [200] },
  { name: 'documents', path: '/api/documents?page=0&size=1', expect: [200] },
  { name: 'folders', path: '/api/folders/tree', expect: [200] },
  { name: 'knowledge-topics', path: '/api/knowledge/topics?page=0&size=1', expect: [200] },
  {
    name: 'chatbot-search',
    path: '/api/chatbot/search',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { prompt: 'mobile smoke test', limit: 1 },
    expect: [200],
  },
  { name: 'audit', path: '/api/audit?page=0&size=1', expect: [200, 403] },
]

if (runAdminChecks) {
  endpoints.push({ name: 'admin-users', path: '/api/admin/users', expect: [200, 403] })
  endpoints.push({ name: 'admin-groups', path: '/api/admin/groups', expect: [200, 403] })
  endpoints.push({ name: 'admin-code-tables', path: '/api/admin/code-tables', expect: [200, 403] })
}

const runOne = async (entry) => {
  const options = {
    method: entry.method || 'GET',
    headers: {
      ...authHeaders,
      ...(entry.headers || {}),
    },
  }
  if (entry.body !== undefined) {
    options.body = JSON.stringify(entry.body)
  }

  const started = Date.now()
  const response = await fetch(`${baseUrl}${entry.path}`, options)
  const elapsed = Date.now() - started
  const ok = entry.expect.includes(response.status)
  let details = ''
  if (!ok) {
    details = await response.text().catch(() => '')
  }
  return {
    ok,
    name: entry.name,
    method: options.method,
    path: entry.path,
    status: response.status,
    elapsed,
    details,
  }
}

const main = async () => {
  console.log(`Running DMS API smoke tests against ${baseUrl}`)
  const results = []
  for (const endpoint of endpoints) {
    try {
      const result = await runOne(endpoint)
      results.push(result)
      const marker = result.ok ? 'PASS' : 'FAIL'
      console.log(`${marker} ${result.name} [${result.status}] ${result.elapsed}ms`) // intentional
      if (!result.ok && result.details) {
        console.log(`  details: ${result.details.slice(0, 400)}`)
      }
    } catch (err) {
      results.push({
        ok: false,
        name: endpoint.name,
        method: endpoint.method || 'GET',
        path: endpoint.path,
        status: 0,
        elapsed: 0,
        details: err.message || String(err),
      })
      console.log(`FAIL ${endpoint.name} [ERR] ${err.message || String(err)}`)
    }
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} checks passed.`)
  if (failed.length) {
    process.exit(2)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(99)
})
