import { useEffect, useState } from 'react'

const statusOptions = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Archived', value: 'ARCHIVED' },
]

export default function DocumentFilters({ value, onChange, onReset }) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  const handleChange = (field, newValue) => {
    const next = { ...local, [field]: newValue }
    setLocal(next)
    onChange(next)
  }

  return (
    <div className="card">
      <div className="field">
        <label htmlFor="query">Keyword</label>
        <input
          id="query"
          type="search"
          placeholder="Title or description"
          value={local.query}
          onChange={(e) => handleChange('query', e.target.value)}
        />
      </div>
      <div className="filters-grid">
        <div className="field">
          <label htmlFor="owner">Owner</label>
          <input id="owner" value={local.owner} onChange={(e) => handleChange('owner', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <input id="category" value={local.category} onChange={(e) => handleChange('category', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={local.status} onChange={(e) => handleChange('status', e.target.value)}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="tags">Tags</label>
        <input
          id="tags"
          placeholder="finance, quarterly"
          value={Array.isArray(local.tags) ? local.tags.join(', ') : ''}
          onChange={(e) => handleChange('tags', e.target.value.split(','))}
        />
        <small>Comma separated list</small>
      </div>
      <div className="filters-actions">
        <button type="button" className="ghost" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  )
}
