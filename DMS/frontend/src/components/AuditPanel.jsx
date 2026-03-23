import { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { authHeaders } from '../api/documents'
import { AnnounceContext } from '../contexts/AnnounceContext'

export default function AuditPanel() {
  const { role, isAuthenticated } = useContext(AuthContext)
  const { toast } = useContext(AnnounceContext)
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        if (!isAuthenticated) {
          setError('Not authenticated')
          return
        }
        const res = await fetch('/api/audit?limit=100', { headers: { ...authHeaders() } })
        if (!res.ok) throw new Error('Failed to load audit logs')
        const data = await res.json()
        setLogs(data)
      } catch (err) {
        setError(err.message)
        toast && toast(err.message || 'Failed to load audit logs', { type: 'error' })
      }
    }
    fetchLogs()
  }, [role])

  return (
    <div className="card">
      <div className="list-card__header">
        <div>
          <p className="eyebrow">System</p>
          <h3>Audit logs</h3>
        </div>
      </div>
      {error && <p className="feedback feedback--error">{error}</p>}
      <div style={{ maxHeight: 480, overflow: 'auto', marginTop: '0.75rem' }}>
        {logs.length === 0 && !error && <p className="empty-state">No audit logs found.</p>}
        {logs.map((l) => (
          <article key={l.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <strong>{l.action}</strong> — <small>{l.performedBy}</small>
              </div>
              <small>{new Date(l.createdAt).toLocaleString()}</small>
            </div>
            <div style={{ marginTop: 6 }}><small>doc: {l.documentId} · {l.details}</small></div>
          </article>
        ))}
      </div>
    </div>
  )
}
