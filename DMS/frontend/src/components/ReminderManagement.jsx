import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createReminderRule,
  deleteReminderRule,
  listReminderRules,
  listRetentionCategories,
  runReminderSweep,
} from '../api/retentionManagement'

const REMINDER_DATE_COLUMN_OPTIONS = [
  { value: 'DOCUMENT_DATE', label: 'Document date' },
  { value: 'APPROVAL_DATE', label: 'Approval date' },
  { value: 'EXPIRY_DATE', label: 'Expiry date' },
  { value: 'ARCHIVE_DATE', label: 'Archive date' },
]

const REMINDER_DIRECTION_OPTIONS = [
  { value: 'BEFORE', label: 'Before' },
  { value: 'AFTER', label: 'After' },
]

const REMINDER_UNIT_OPTIONS = [
  { value: 'DAYS', label: 'Days' },
  { value: 'MONTHS', label: 'Months' },
  { value: 'YEARS', label: 'Years' },
]

export default function ReminderManagement() {
  const [rules, setRules] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [form, setForm] = useState({
    category: '',
    dateColumn: 'EXPIRY_DATE',
    direction: 'BEFORE',
    offsetValue: 90,
    offsetUnit: 'DAYS',
  })

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ruleData, categoryData] = await Promise.all([
        listReminderRules(),
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
      setError(err.message || 'Failed to load reminder data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const canSubmit = useMemo(() => {
    return !!form.category && Number(form.offsetValue) > 0
  }, [form])

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!canSubmit) {
      setError('Please choose a reminder category and positive offset')
      return
    }
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await createReminderRule({
        category: form.category,
        dateColumn: form.dateColumn,
        direction: form.direction,
        offsetValue: Number(form.offsetValue),
        offsetUnit: form.offsetUnit,
        active: true,
      })
      setInfo('Reminder rule created')
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to create reminder rule')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ruleId) => {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await deleteReminderRule(ruleId)
      setInfo('Reminder rule deleted')
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to delete reminder rule')
    } finally {
      setSaving(false)
    }
  }

  const handleRunSweep = async () => {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      const summary = await runReminderSweep()
      setInfo(`Reminder sweep complete: updated ${summary?.tasksUpserted ?? 0} reminder task(s) from ${summary?.scannedDocuments ?? 0} scanned document(s)`)
    } catch (err) {
      setError(err.message || 'Failed to run reminder sweep')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card retention">
      <div className="list-card__header">
        <div>
          <p className="eyebrow">System administration</p>
          <h3>Reminder Management</h3>
          <p className="details-description">Define reminder offsets per category using a selected date column (for example, 90 days before expiry date).</p>
        </div>
        <button type="button" className="ghost" onClick={handleRunSweep} disabled={saving || loading}>
          Run reminder sweep
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
          <span>Date column</span>
          <select value={form.dateColumn} onChange={(e) => setForm((prev) => ({ ...prev, dateColumn: e.target.value }))}>
            {REMINDER_DATE_COLUMN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Direction</span>
          <select value={form.direction} onChange={(e) => setForm((prev) => ({ ...prev, direction: e.target.value }))}>
            {REMINDER_DIRECTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Offset value</span>
          <input
            type="number"
            min={1}
            max={10000}
            value={form.offsetValue}
            onChange={(e) => setForm((prev) => ({ ...prev, offsetValue: e.target.value }))}
          />
        </label>

        <label>
          <span>Offset unit</span>
          <select value={form.offsetUnit} onChange={(e) => setForm((prev) => ({ ...prev, offsetUnit: e.target.value }))}>
            {REMINDER_UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <button type="submit" className="primary" disabled={!canSubmit || saving || loading}>
          {saving ? 'Saving…' : 'Create reminder rule'}
        </button>
      </form>

      <div className="retention__rules">
        {loading && <p className="empty-state">Loading reminder rules…</p>}
        {!loading && rules.length === 0 && <p className="empty-state">No reminder rules defined.</p>}
        {!loading && rules.map((rule) => (
          <article key={rule.id} className="retention__rule">
            <div>
              <strong>{rule.category}</strong>
              <p>{rule.offsetValue} {rule.offsetUnit.toLowerCase()} {rule.direction.toLowerCase()} {rule.dateColumn.toLowerCase().replace('_', ' ')}</p>
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
