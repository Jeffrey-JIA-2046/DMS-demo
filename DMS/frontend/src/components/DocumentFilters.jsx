import { useEffect, useState } from 'react'

const searchColumnOptions = [
  { label: 'Title', value: 'title' },
  { label: 'Description', value: 'description' },
  { label: 'Owner', value: 'owner' },
  { label: 'Category', value: 'category' },
  { label: 'Tags', value: 'tags' },
  { label: 'Document metadata', value: 'documentMetadata' },
  { label: 'Folder name', value: 'folderName' },
  { label: 'Folder metadata', value: 'folderMetadata' },
]

const createCondition = (field = 'title', value = '', join = '', metadataField = '') => ({ field, value, join, metadataField })
const FOLDER_METADATA_FIELD = 'folderMetadata'

const normalizeConditions = (conditions = [], defaultField = 'title') => {
  if (!Array.isArray(conditions) || !conditions.length) {
    return [createCondition(defaultField)]
  }
  return conditions.map((condition) => ({
    field: (() => {
      const raw = String(condition?.field || '').trim()
      if (raw.toLowerCase().startsWith('foldermeta:')) {
        return FOLDER_METADATA_FIELD
      }
      return raw || defaultField
    })(),
    value: condition?.value || '',
    join: condition?.join || '',
    metadataField: (() => {
      const raw = String(condition?.field || '').trim()
      if (raw.toLowerCase().startsWith('foldermeta:')) {
        return raw.slice('foldermeta:'.length)
      }
      return condition?.metadataField || ''
    })(),
  }))
}

export default function DocumentFilters({ value, onSearch, onReset, folderMetadataFields = [] }) {
  const [local, setLocal] = useState(value)

  const combinedFieldOptions = [...searchColumnOptions]
    .filter((option, index, array) => option?.value && array.findIndex((candidate) => candidate?.value === option.value) === index)
  const defaultConditionField = combinedFieldOptions[0]?.value || 'title'

  useEffect(() => {
    setLocal({
      ...value,
      conditions: normalizeConditions(value?.conditions, defaultConditionField),
    })
  }, [value, defaultConditionField])

  const handleChange = (field, newValue) => {
    setLocal((prev) => ({ ...prev, [field]: newValue }))
  }

  const handleConditionChange = (index, field, newValue) => {
    setLocal((prev) => {
      const current = normalizeConditions(prev.conditions, defaultConditionField)
      const nextConditions = current.map((item, idx) => (idx === index ? { ...item, [field]: newValue } : item))

      if (field === 'join' && idxIsLast(index, nextConditions) && (newValue === 'AND' || newValue === 'OR')) {
        nextConditions.push(createCondition(defaultConditionField))
      }

      return {
        ...prev,
        conditions: nextConditions,
      }
    })
  }

  const idxIsLast = (index, array) => index === array.length - 1

  const handleAddCondition = () => {
    setLocal((prev) => {
      const current = normalizeConditions(prev.conditions, defaultConditionField)
      return {
        ...prev,
        conditions: [...current, createCondition(defaultConditionField)],
      }
    })
  }

  const handleRemoveCondition = (index) => {
    setLocal((prev) => {
      const current = normalizeConditions(prev.conditions, defaultConditionField)
      const nextConditions = current.filter((_, idx) => idx !== index)
      return {
        ...prev,
        conditions: nextConditions.length ? nextConditions : [createCondition(defaultConditionField)],
      }
    })
  }

  const handleSearch = () => {
    if (typeof onSearch !== 'function') {
      return
    }
    const conditions = normalizeConditions(local.conditions, defaultConditionField)
      .filter((condition) => (condition?.value || '').trim().length > 0)
      .filter((condition) => condition.field !== FOLDER_METADATA_FIELD || String(condition.metadataField || '').trim().length > 0)
      .map((condition, index, array) => ({
        field: condition.field === FOLDER_METADATA_FIELD
          ? `folderMeta:${String(condition.metadataField || '').trim()}`
          : condition.field,
        value: condition.value.trim(),
        join: index < array.length - 1 ? (condition.join || 'AND') : '',
      }))

    onSearch({
      ...local,
      conditions,
    })
  }

  return (
    <div className="card">
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Search conditions</label>
        <small>Add conditions and connect each row with AND/OR.</small>
      </div>

      {normalizeConditions(local.conditions, defaultConditionField).map((condition, index, array) => (
        <div key={`condition-${index}`} className="filters-grid" style={{ marginBottom: 8 }}>
          <div className="field">
            <select
              value={condition.field || defaultConditionField}
              onChange={(e) => handleConditionChange(index, 'field', e.target.value)}
            >
              {combinedFieldOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <input
              type="search"
              placeholder="Enter search value"
              value={condition.value || ''}
              onChange={(e) => handleConditionChange(index, 'value', e.target.value)}
            />
          </div>
          <div className="field">
            <select
              value={condition.join || ''}
              onChange={(e) => handleConditionChange(index, 'join', e.target.value)}
              disabled={idxIsLast(index, array) && !(condition.value || '').trim().length}
            >
              <option value="">Then...</option>
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
          </div>
          <div className="field">
            <button type="button" className="ghost" onClick={() => handleRemoveCondition(index)}>Remove</button>
          </div>
          {condition.field === FOLDER_METADATA_FIELD && (
            <div className="field">
              <select
                value={condition.metadataField || ''}
                onChange={(e) => handleConditionChange(index, 'metadataField', e.target.value)}
              >
                <option value="">Select folder field</option>
                {(Array.isArray(folderMetadataFields) ? folderMetadataFields : []).map((field) => (
                  <option key={field.key} value={field.key}>{field.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}

      <div className="filters-actions">
        <button type="button" className="ghost" onClick={handleAddCondition}>
          + Add
        </button>
        <button type="button" className="ghost" onClick={handleSearch}>
          Search
        </button>
        <button type="button" className="ghost" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  )
}
