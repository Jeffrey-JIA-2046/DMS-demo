import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { authHeaders } from '../api/documents'
import { resolveApiUrl } from '../api/httpClient'
import { AnnounceContext } from '../contexts/AnnounceContext'

const KNOWN_ACTIONS = [
  'CREATE',
  'UPLOAD_VERSION',
  'UPDATE',
  'ARCHIVE',
  'DELETE',
  'APPROVAL_NOTE',
  'APPROVE',
  'REJECT',
  'DELEGATE',
]

const escapeCsv = (value) => {
  const text = value == null ? '' : String(value)
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

const downloadBlob = (content, mimeType, fileName) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const normalizeAuditLog = (log = {}) => ({
  id: log.id,
  action: log.action || '',
  performedBy: log.performedBy ?? log.performed_by ?? '',
  createdAt: log.createdAt ?? log.created_at ?? '',
  documentId: log.documentId ?? log.document_id ?? '',
  details: log.details || '',
})

export default function AuditPanel() {
  const { role, isAuthenticated } = useContext(AuthContext)
  const { toast } = useContext(AnnounceContext)
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(25)
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLast, setIsLast] = useState(true)
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    performer: '',
    action: '',
  })

  const actionOptions = Array.from(new Set([...KNOWN_ACTIONS, ...logs.map((log) => log?.action).filter(Boolean), filters.action].filter(Boolean))).sort()

  const buildQuery = (override = {}) => {
    const nextPage = override.page ?? page
    const nextSize = override.size ?? size
    const nextFilters = override.filters ?? filters
    const params = new URLSearchParams({ page: String(nextPage), size: String(nextSize) })
    if (nextFilters.startDate) params.set('startDate', nextFilters.startDate)
    if (nextFilters.endDate) params.set('endDate', nextFilters.endDate)
    if (nextFilters.performer.trim()) params.set('performer', nextFilters.performer.trim())
    if (nextFilters.action) params.set('action', nextFilters.action)
    return params
  }

  const fetchLogs = async () => {
    try {
      setError('')
      setLoading(true)
      if (!isAuthenticated) {
        setError('Not authenticated')
        setLogs([])
        return
      }

      const params = buildQuery()

      const res = await fetch(resolveApiUrl(`/api/audit?${params.toString()}`), { headers: { ...authHeaders() } })
      if (!res.ok) {
        if (res.status === 401) throw new Error('Not authenticated')
        if (res.status === 403) throw new Error('No permission to view audit logs')
        throw new Error('Failed to load audit logs')
      }
      const data = await res.json()
      const content = Array.isArray(data?.content) ? data.content.map(normalizeAuditLog) : []
      setLogs(content)
      setTotalElements(Number(data?.totalElements ?? 0))
      setTotalPages(Number(data?.totalPages ?? 0))
      setIsLast(Boolean(data?.last ?? true))
    } catch (err) {
      setError(err.message || 'Failed to load audit logs')
      toast && toast(err.message || 'Failed to load audit logs', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, isAuthenticated, page, size])

  const handleSearch = () => {
    if (page !== 0) {
      setPage(0)
      return
    }
    fetchLogs()
  }

  const clearFilters = () => {
    setFilters({ startDate: '', endDate: '', performer: '', action: '' })
    if (page !== 0) {
      setPage(0)
      return
    }
    fetchLogs()
  }

  const fetchAllFilteredLogs = async () => {
    const params = buildQuery({ page: 0, size: 5000 })
    const res = await fetch(resolveApiUrl(`/api/audit?${params.toString()}`), { headers: { ...authHeaders() } })
    if (!res.ok) {
      throw new Error('Failed to export audit logs')
    }
    const data = await res.json()
    return Array.isArray(data?.content) ? data.content.map(normalizeAuditLog) : []
  }

  const exportCsv = async () => {
    if (!totalElements) return
    try {
      const allLogs = await fetchAllFilteredLogs()
      const header = ['Performer', 'Action', 'Timestamp', 'Document ID', 'Details']
      const rows = allLogs.map((log) => [
        log.performedBy || '',
        log.action || '',
        log.createdAt ? new Date(log.createdAt).toISOString() : '',
        log.documentId || '',
        log.details || '',
      ])
      const content = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
      downloadBlob(content, 'text/csv;charset=utf-8;', `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (err) {
      setError(err.message || 'Failed to export CSV')
    }
  }

  const exportExcel = async () => {
    if (!totalElements) return
    try {
      const allLogs = await fetchAllFilteredLogs()
      const header = '<tr><th>Performer</th><th>Action</th><th>Timestamp</th><th>Document ID</th><th>Details</th></tr>'
      const rows = allLogs
        .map((log) => `<tr><td>${log.performedBy || ''}</td><td>${log.action || ''}</td><td>${log.createdAt ? new Date(log.createdAt).toISOString() : ''}</td><td>${log.documentId || ''}</td><td>${(log.details || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td></tr>`)
        .join('')
      const html = `<table>${header}${rows}</table>`
      downloadBlob(html, 'application/vnd.ms-excel', `audit-logs-${new Date().toISOString().slice(0, 10)}.xls`)
    } catch (err) {
      setError(err.message || 'Failed to export Excel')
    }
  }

  return (
    <div className="card">
      <div className="list-card__header">
        <div>
          <p className="eyebrow">System</p>
          <h3>Audit logs</h3>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ghost ghost--small" onClick={exportCsv} disabled={!totalElements}>Export CSV</button>
          <button type="button" className="ghost ghost--small" onClick={exportExcel} disabled={!totalElements}>Export Excel</button>
        </div>
      </div>

      <div className="retention__form" style={{ marginTop: 12, alignItems: 'flex-end' }}>
        <label>
          <span>Start date</span>
          <input type="date" value={filters.startDate} onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))} />
        </label>
        <label>
          <span>End date</span>
          <input type="date" value={filters.endDate} onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))} />
        </label>
        <label>
          <span>Performer</span>
          <input value={filters.performer} onChange={(e) => setFilters((prev) => ({ ...prev, performer: e.target.value }))} placeholder="username" />
        </label>
        <label>
          <span>Action</span>
          <select value={filters.action} onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}>
            <option value="">All actions</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" onClick={handleSearch} disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
        <button type="button" className="ghost" onClick={clearFilters} disabled={loading}>Clear</button>
      </div>

      {error && <p className="feedback feedback--error">{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <small>Total: {totalElements}</small>
        <label>
          <small>Page size </small>
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value))
              setPage(0)
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button type="button" className="ghost ghost--small" disabled={loading || page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button>
        <small>Page {totalPages === 0 ? 0 : page + 1} / {totalPages}</small>
        <button type="button" className="ghost ghost--small" disabled={loading || isLast || totalPages === 0} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
      <div style={{ maxHeight: 480, overflow: 'auto', marginTop: '0.75rem' }}>
        {logs.length === 0 && !error && <p className="empty-state">No audit logs found.</p>}
        {logs.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>Performer</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>Action</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>Timestamp</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>Document ID</th>
                <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{l.performedBy || '-'}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{l.action || '-'}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{l.createdAt ? new Date(l.createdAt).toLocaleString() : '-'}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{l.documentId || '-'}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{l.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
