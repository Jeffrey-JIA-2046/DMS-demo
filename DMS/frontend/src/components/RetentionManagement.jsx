import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createRetentionRule,
  deleteRetentionRule,
  listRetentionCategories,
  listRetentionRules,
  runRetentionSweep,
} from '../api/retentionManagement'

const DATE_BASIS_OPTIONS = [
  { value: 'APPROVAL_DATE', label: 'Approval date' },
  { value: 'ARCHIVE_DATE', label: 'Archive date' },
]

export default function RetentionManagement() {
  const [rules, setRules] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [form, setForm] = useState({ category: '', dateBasis: 'APPROVAL_DATE', yearsToRetain: 7 })

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ruleData, categoryData] = await Promise.all([
        listRetentionRules(),
        listRetentionCategories(),
      ])
      setRules(Array.isArray(ruleData) ? ruleData : [])
      setCategories(Array.isArray(categoryData) ? categoryData : [])
      setForm((prev) => {
        if (prev.category) {
          return prev
        }
        return {
          ...prev,
          category: (Array.isArray(categoryData) && categoryData.length > 0) ? categoryData[0] : '',
        }
      })
    } catch (err) {
      setError(err.message || 'Failed to load retention data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const canSubmit = useMemo(() => {
    return !!form.category && Number(form.yearsToRetain) > 0
  }, [form])

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!canSubmit) {
      setError('Please choose a category and years to retain')
      return
    }
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await createRetentionRule({
        category: form.category,
        dateBasis: form.dateBasis,
        yearsToRetain: Number(form.yearsToRetain),
        active: true,
      })
      setInfo('Retention rule created')
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to create retention rule')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ruleId) => {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await deleteRetentionRule(ruleId)
      setInfo('Retention rule deleted')
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to delete retention rule')
    } finally {
      setSaving(false)
    }
  }

  const handleRunSweep = async () => {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      const summary = await runRetentionSweep()
      setInfo(`Retention sweep complete: disposed ${summary?.disposedDocuments ?? 0} of ${summary?.scannedDocuments ?? 0} scanned documents`)
    } catch (err) {
      setError(err.message || 'Failed to run retention sweep')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card retention">
      <div className="list-card__header">
        <div>
          <p className="eyebrow">System administration</p>
          <h3>Retention Management</h3>
          <p className="details-description">Define category-based retention rules. Documents are disposed automatically when disposal dates are reached.</p>
        </div>
        <button type="button" className="ghost" onClick={handleRunSweep} disabled={saving || loading}>
          Run sweep now
        </button>
      </div>

      {error && <p className="feedback feedback--error">{error}</p>}
      {info && <p className="feedback">{info}</p>}

      <form className="retention__form" onSubmit={handleCreate}>
        <label>
          <span>Document category</span>
          <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Date metadata</span>
          <select value={form.dateBasis} onChange={(e) => setForm((prev) => ({ ...prev, dateBasis: e.target.value }))}>
            {DATE_BASIS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Years to retain</span>
          <input
            type="number"
            min={1}
            max={100}
            value={form.yearsToRetain}
            onChange={(e) => setForm((prev) => ({ ...prev, yearsToRetain: e.target.value }))}
          />
        </label>

        <button type="submit" className="primary" disabled={!canSubmit || saving || loading}>
          {saving ? 'Saving…' : 'Create rule'}
        </button>
      </form>

      <div className="retention__rules">
        {loading && <p className="empty-state">Loading retention rules…</p>}
        {!loading && rules.length === 0 && <p className="empty-state">No retention rules defined.</p>}
        {!loading && rules.map((rule) => (
          <article key={rule.id} className="retention__rule">
            <div>
              <strong>{rule.category}</strong>
              <p>{rule.dateBasis === 'APPROVAL_DATE' ? 'Approval date' : 'Archive date'} + {rule.yearsToRetain} year(s)</p>
            </div>
            <button type="button" className="ghost ghost--danger" onClick={() => handleDelete(rule.id)} disabled={saving}>
              Delete
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
