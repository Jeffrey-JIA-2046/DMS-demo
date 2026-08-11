import { useCallback, useEffect, useState } from 'react'
import {
  createCodeTableItem,
  deleteCodeTableItem,
  listCodeTableItems,
  listTableCodes,
  updateCodeTableItem,
} from '../api/codeTable'

const WELL_KNOWN_TABLES = ['DOCUMENT_CATEGORY', 'DEPARTMENT', 'DOCUMENT_TYPE', 'CLASSIFICATION_LEVEL']

const emptyForm = (tableCode = '') => ({
  tableCode,
  itemCode: '',
  itemLabel: '',
  description: '',
  sortOrder: 0,
  active: true,
})

export default function CodeTableManagement() {
  const [tableCodes, setTableCodes] = useState([])
  const [selectedTable, setSelectedTable] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [newTableCode, setNewTableCode] = useState('')
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState(null)

  const loadTableCodes = useCallback(async () => {
    try {
      const data = await listTableCodes()
      const merged = Array.from(new Set([...WELL_KNOWN_TABLES, ...(Array.isArray(data) ? data : [])]))
        .sort()
      setTableCodes(merged)
      if (!selectedTable && merged.length > 0) {
        setSelectedTable(merged[0])
      }
    } catch (err) {
      setError(err.message || 'Failed to load code tables')
    }
  }, [selectedTable])

  const loadItems = useCallback(async (tableCode) => {
    if (!tableCode) return
    setLoading(true)
    setError('')
    try {
      const data = await listCodeTableItems(tableCode)
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err.message && err.message.includes('404')) {
        setItems([])
      } else {
        setError(err.message || 'Failed to load items')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTableCodes()
  }, [loadTableCodes])

  useEffect(() => {
    if (selectedTable) {
      loadItems(selectedTable)
      setForm(emptyForm(selectedTable))
      setEditingId(null)
      setError('')
      setInfo('')
    }
  }, [selectedTable, loadItems])

  const handleSelectTable = (code) => {
    setSelectedTable(code)
  }

  const handleAddNewTable = () => {
    const code = newTableCode.trim().toUpperCase().replace(/\s+/g, '_')
    if (!code) return
    if (!tableCodes.includes(code)) {
      setTableCodes((prev) => [...prev, code].sort())
    }
    setSelectedTable(code)
    setNewTableCode('')
  }

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleEdit = (item) => {
    setEditingId(item.id)
    setForm({
      tableCode: item.tableCode,
      itemCode: item.itemCode,
      itemLabel: item.itemLabel,
      description: item.description || '',
      sortOrder: item.sortOrder,
      active: item.active,
    })
    setError('')
    setInfo('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm(emptyForm(selectedTable))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!form.itemCode.trim() || !form.itemLabel.trim()) {
      setError('Item code and label are required')
      return
    }
    setSaving(true)
    setError('')
    setInfo('')
    try {
      const payload = {
        itemCode: form.itemCode.trim(),
        itemLabel: form.itemLabel.trim(),
        description: form.description.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        active: form.active,
      }
      if (editingId) {
        await updateCodeTableItem(selectedTable, editingId, payload)
        setInfo('Item updated')
      } else {
        await createCodeTableItem(selectedTable, payload)
        setInfo('Item created')
      }
      setEditingId(null)
      setForm(emptyForm(selectedTable))
      await loadItems(selectedTable)
      await loadTableCodes()
    } catch (err) {
      setError(err.message || 'Failed to save item')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await deleteCodeTableItem(selectedTable, item.id)
      setInfo(`Deleted "${item.itemLabel}"`)
      await loadItems(selectedTable)
    } catch (err) {
      setError(err.message || 'Failed to delete item')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = form.itemCode.trim() && form.itemLabel.trim()

  return (
    <section className="card retention">
      <div className="list-card__header">
        <div>
          <p className="eyebrow">System administration</p>
          <h3>Code Table Management</h3>
          <p className="details-description">
            Define reusable lookup values (e.g. document categories, departments) that users can select as metadata when uploading documents.
          </p>
        </div>
      </div>

      {error && <p className="feedback feedback--error">{error}</p>}
      {info && <p className="feedback">{info}</p>}

      <div className="retention__form" style={{ alignItems: 'flex-end' }}>
        <label style={{ flex: 1 }}>
          <span>New table code</span>
          <input
            value={newTableCode}
            onChange={(e) => setNewTableCode(e.target.value)}
            placeholder="e.g. DOCUMENT_CATEGORY"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewTable() } }}
          />
        </label>
        <button type="button" className="ghost" onClick={handleAddNewTable} disabled={!newTableCode.trim()}>
          Add table
        </button>
      </div>

      <nav className="code-table__tabs" role="tablist">
        {tableCodes.map((code) => (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={selectedTable === code}
            className={`code-table__tab ${selectedTable === code ? 'is-active' : ''}`}
            onClick={() => handleSelectTable(code)}
          >
            {code}
          </button>
        ))}
      </nav>

      {selectedTable && (
        <>
          <form className="retention__form" onSubmit={handleSave}>
            <label>
              <span>Item code</span>
              <input
                value={form.itemCode}
                onChange={(e) => handleFormChange('itemCode', e.target.value)}
                placeholder="e.g. FINANCE"
                disabled={saving || Boolean(editingId)}
              />
            </label>
            <label>
              <span>Item label (display)</span>
              <input
                value={form.itemLabel}
                onChange={(e) => handleFormChange('itemLabel', e.target.value)}
                placeholder="e.g. Finance"
                disabled={saving}
              />
            </label>
            <label>
              <span>Description</span>
              <input
                value={form.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                placeholder="Optional description"
                disabled={saving}
              />
            </label>
            <label>
              <span>Sort order</span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => handleFormChange('sortOrder', e.target.value)}
                min={0}
                disabled={saving}
              />
            </label>
            <label className="checkbox" style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => handleFormChange('active', e.target.checked)}
                disabled={saving}
              />
              <span>Active</span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
              {editingId && (
                <button type="button" className="ghost" onClick={handleCancelEdit} disabled={saving}>
                  Cancel
                </button>
              )}
              <button type="submit" className="primary" disabled={!canSubmit || saving}>
                {saving ? 'Saving…' : editingId ? 'Update item' : 'Add item'}
              </button>
            </div>
          </form>

          <div className="retention__rules">
            {loading && <p className="empty-state">Loading items…</p>}
            {!loading && items.length === 0 && (
              <p className="empty-state">No items in <strong>{selectedTable}</strong>. Add the first one above.</p>
            )}
            {!loading && items.map((item) => (
              <article key={item.id} className="retention__rule">
                <div>
                  <strong>{item.itemLabel}</strong>
                  <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.7 }}>
                    Code: {item.itemCode}
                    {item.description ? ` · ${item.description}` : ''}
                    {!item.active ? ' · Inactive' : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="ghost ghost--small" onClick={() => handleEdit(item)} disabled={saving}>
                    Edit
                  </button>
                  <button type="button" className="ghost ghost--danger" onClick={() => handleDelete(item)} disabled={saving}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
