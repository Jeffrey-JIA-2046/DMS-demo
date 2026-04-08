import { useMemo, useState } from 'react'
import { searchChatDocuments } from '../api/chatbot'

const REPORT_RESULT_LIMIT = 8

const looksLikeCsv = (text) => {
  if (!text) return false
  const firstLine = text.split(/\r?\n/)[0] || ''
  return firstLine.includes(',') && /folder|user|permission|group|document|metadata/i.test(firstLine)
}

const resolveCsvFileName = (csvContent) => {
  const firstLine = (csvContent || '').split(/\r?\n/)[0]?.toLowerCase() || ''
  const date = new Date().toISOString().slice(0, 10)
  if (firstLine.includes('documentid') && firstLine.includes('metadata')) {
    return `document-metadata-${date}.csv`
  }
  if (firstLine.includes('folderid') && firstLine.includes('permission')) {
    return `folder-permissions-${date}.csv`
  }
  return `report-${date}.csv`
}

const downloadText = (content, fileName, mimeType = 'text/plain;charset=utf-8;') => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

const buildGuidedPrompt = (form) => {
  const categories = form.categories
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const owners = form.owners
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

  const lines = [
    `Generate a ${form.reportType.toLowerCase()} report for: ${form.objective || 'general document insights'}.`,
    `Audience: ${form.audience || 'management team'}.`,
    `Time range: ${form.timeRange}.`,
    `Output format: ${form.outputFormat}.`,
    `Include a summary section: ${form.includeSummary ? 'yes' : 'no'}.`,
    `Include a table: ${form.includeTable ? 'yes' : 'no'}.`,
    `Table columns: ${form.tableColumns || 'title, owner, category, status, updated date'}.`,
    `Sorting preference: ${form.sorting || 'updated date descending'}.`,
    `Search criteria: ${form.criteria || 'relevant, high-impact documents'}.`,
  ]

  if (categories.length) {
    lines.push(`Focus categories: ${categories.join(', ')}.`)
  }
  if (owners.length) {
    lines.push(`Focus owners: ${owners.join(', ')}.`)
  }

  lines.push('Use concise headings and action-oriented recommendations.')
  return lines.join(' ')
}

function ReportResult({ result }) {
  if (!result) {
    return null
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h4>Generated report</h4>
      <p style={{ whiteSpace: 'pre-wrap' }}>{result.overview || 'No report content returned.'}</p>
      {looksLikeCsv(result.overview) && (
        <button
          type="button"
          className="ghost ghost--small"
          onClick={() => downloadText(result.overview, resolveCsvFileName(result.overview), 'text/csv;charset=utf-8;')}
          style={{ marginBottom: 12 }}
        >
          Download CSV
        </button>
      )}
      <h5 style={{ marginTop: 16 }}>Matched documents</h5>
      {!result.results?.length ? (
        <p className="empty-state">No matched documents.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Title</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Owner</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Category</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Status</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((row) => (
                <tr key={row.documentId}>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>
                    <div>{row.title}</div>
                    {row.snippet && <small style={{ color: '#666' }}>{row.snippet}</small>}
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{row.owner || '-'}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{row.category || '-'}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{row.status || '-'}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: 8 }}>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ReportsManagement() {
  const [tab, setTab] = useState('freeform')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const [freeformPrompt, setFreeformPrompt] = useState('')

  const [guidedForm, setGuidedForm] = useState({
    reportType: 'Executive Summary',
    objective: '',
    audience: '',
    timeRange: 'Last 30 days',
    outputFormat: 'Markdown report with bullets and table',
    includeSummary: true,
    includeTable: true,
    tableColumns: 'Title, Owner, Category, Status, Updated Date',
    sorting: 'Updated date descending',
    criteria: '',
    categories: '',
    owners: '',
  })

  const guidedPrompt = useMemo(() => buildGuidedPrompt(guidedForm), [guidedForm])

  const runPrompt = async (prompt) => {
    if (!prompt?.trim()) {
      setError('Please enter a prompt first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await searchChatDocuments({ prompt: prompt.trim(), limit: REPORT_RESULT_LIMIT })
      setResult(response)
    } catch (err) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card retention">
      <div className="list-card__header">
        <div>
          <p className="eyebrow">Reports</p>
          <h3>AI Report Studio</h3>
          <p className="details-description">Generate reports with natural language or use the guided builder for format, table, and search criteria.</p>
        </div>
      </div>

      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" className={`ghost ${tab === 'freeform' ? 'is-active' : ''}`} onClick={() => setTab('freeform')}>
          Ask DeepSeek
        </button>
        <button type="button" className={`ghost ${tab === 'guided' ? 'is-active' : ''}`} onClick={() => setTab('guided')}>
          Guided Report Builder
        </button>
      </nav>

      {error && <p className="feedback feedback--error">{error}</p>}

      {tab === 'freeform' && (
        <div className="retention__form" style={{ alignItems: 'stretch' }}>
          <label style={{ width: '100%' }}>
            <span>Describe the report you want</span>
            <textarea
              value={freeformPrompt}
              onChange={(e) => setFreeformPrompt(e.target.value)}
              rows={6}
              placeholder="Example: Generate a monthly compliance report highlighting overdue approvals, high-risk categories, and owners with the most pending documents."
            />
          </label>
          <button
            type="button"
            className="primary reports-generate-btn reports-generate-btn--deepseek"
            disabled={loading}
            onClick={() => runPrompt(freeformPrompt)}
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      )}

      {tab === 'guided' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="retention__form" style={{ alignItems: 'flex-end' }}>
            <label>
              <span>Report type</span>
              <select value={guidedForm.reportType} onChange={(e) => setGuidedForm((p) => ({ ...p, reportType: e.target.value }))}>
                <option>Executive Summary</option>
                <option>Operational Report</option>
                <option>Compliance Report</option>
                <option>Risk Report</option>
                <option>Audit Readiness Report</option>
              </select>
            </label>
            <label>
              <span>Audience</span>
              <input value={guidedForm.audience} onChange={(e) => setGuidedForm((p) => ({ ...p, audience: e.target.value }))} placeholder="e.g. COO and Compliance Manager" />
            </label>
            <label>
              <span>Time range</span>
              <select value={guidedForm.timeRange} onChange={(e) => setGuidedForm((p) => ({ ...p, timeRange: e.target.value }))}>
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Last 90 days</option>
                <option>Year to date</option>
                <option>All time</option>
              </select>
            </label>
          </div>

          <div className="retention__form" style={{ alignItems: 'stretch' }}>
            <label style={{ width: '100%' }}>
              <span>Objective</span>
              <textarea value={guidedForm.objective} onChange={(e) => setGuidedForm((p) => ({ ...p, objective: e.target.value }))} rows={3} placeholder="What decisions should this report support?" />
            </label>
          </div>

          <div className="retention__form" style={{ alignItems: 'flex-end' }}>
            <label style={{ minWidth: 260 }}>
              <span>Output format</span>
              <input value={guidedForm.outputFormat} onChange={(e) => setGuidedForm((p) => ({ ...p, outputFormat: e.target.value }))} />
            </label>
            <label style={{ minWidth: 260 }}>
              <span>Table columns</span>
              <input value={guidedForm.tableColumns} onChange={(e) => setGuidedForm((p) => ({ ...p, tableColumns: e.target.value }))} />
            </label>
            <label style={{ minWidth: 260 }}>
              <span>Sorting</span>
              <input value={guidedForm.sorting} onChange={(e) => setGuidedForm((p) => ({ ...p, sorting: e.target.value }))} />
            </label>
          </div>

          <div className="retention__form" style={{ alignItems: 'flex-end' }}>
            <label>
              <span>Search criteria</span>
              <input value={guidedForm.criteria} onChange={(e) => setGuidedForm((p) => ({ ...p, criteria: e.target.value }))} placeholder="e.g. overdue, rejected, high-priority" />
            </label>
            <label>
              <span>Categories (comma-separated)</span>
              <input value={guidedForm.categories} onChange={(e) => setGuidedForm((p) => ({ ...p, categories: e.target.value }))} placeholder="Finance, Legal" />
            </label>
            <label>
              <span>Owners (comma-separated)</span>
              <input value={guidedForm.owners} onChange={(e) => setGuidedForm((p) => ({ ...p, owners: e.target.value }))} placeholder="alice, bob" />
            </label>
          </div>

          <div className="retention__form" style={{ alignItems: 'center' }}>
            <label className="checkbox">
              <input type="checkbox" checked={guidedForm.includeSummary} onChange={(e) => setGuidedForm((p) => ({ ...p, includeSummary: e.target.checked }))} />
              <span>Include summary section</span>
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={guidedForm.includeTable} onChange={(e) => setGuidedForm((p) => ({ ...p, includeTable: e.target.checked }))} />
              <span>Include table</span>
            </label>
            <button
              type="button"
              className="primary reports-generate-btn"
              disabled={loading}
              onClick={() => runPrompt(guidedPrompt)}
            >
              {loading ? 'Generating...' : 'Generate Guided Report'}
            </button>
          </div>

          <div className="card" style={{ padding: 12, background: '#fafafa' }}>
            <strong>Generated prompt preview</strong>
            <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{guidedPrompt}</p>
          </div>
        </div>
      )}

      <ReportResult result={result} />
    </section>
  )
}
