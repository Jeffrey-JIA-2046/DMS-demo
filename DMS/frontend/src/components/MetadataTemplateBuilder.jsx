import { useMemo } from 'react'
import {
  METADATA_FIELD_TYPE_OPTIONS,
  MAX_METADATA_FIELDS,
  METADATA_KEY_PATTERN,
  createEmptyMetadataField,
} from '../utils/metadataTemplate'

const defaultField = () => createEmptyMetadataField()

const createKeyDiagnostics = (fields = []) => {
  const counts = {}
  fields.forEach((field) => {
    const trimmed = (field?.key ?? '').trim()
    if (trimmed) {
      const keyId = trimmed.toLowerCase()
      counts[keyId] = (counts[keyId] ?? 0) + 1
    }
  })
  return fields.map((field) => {
    const trimmed = (field?.key ?? '').trim()
    if (!trimmed) {
      return ''
    }
    if (!METADATA_KEY_PATTERN.test(trimmed)) {
      return 'Start with a letter; use letters, numbers, underscores, or hyphens.'
    }
    const keyId = trimmed.toLowerCase()
    if (counts[keyId] > 1) {
      return 'Key must be unique within the template.'
    }
    return ''
  })
}

export default function MetadataTemplateBuilder({ value = [], onChange, disabled = false, error = '' }) {
  const fields = Array.isArray(value) ? value : []
  const keyDiagnostics = useMemo(() => createKeyDiagnostics(fields), [fields])
  const maxReached = fields.length >= MAX_METADATA_FIELDS

  const updateField = (index, updates) => {
    if (typeof onChange !== 'function') return
    onChange(fields.map((field, idx) => (idx === index ? { ...field, ...updates } : field)))
  }

  const removeField = (index) => {
    if (typeof onChange !== 'function') return
    onChange(fields.filter((_, idx) => idx !== index))
  }

  const addField = () => {
    if (typeof onChange !== 'function' || maxReached || disabled) return
    onChange([...fields, defaultField()])
  }

  const moveField = (index, delta) => {
    if (typeof onChange !== 'function') return
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= fields.length) return
    const copy = [...fields]
    const [item] = copy.splice(index, 1)
    copy.splice(nextIndex, 0, item)
    onChange(copy)
  }

  return (
    <div className="metadata-template-builder">
      <div className="metadata-template-builder__header">
        <div>
          <p className="eyebrow">Metadata template</p>
          <h4>Custom fields per folder</h4>
        </div>
        <button
          type="button"
          className="ghost ghost--small"
          onClick={addField}
          disabled={disabled || maxReached}
        >
          Add field
        </button>
      </div>
      {fields.length === 0 && (
        <p className="metadata-template-builder__empty">
          No custom fields yet. Add a field to capture folder-specific metadata during uploads.
        </p>
      )}
      {fields.length > 0 && (
        <ol className="metadata-field-list">
          {fields.map((field, index) => (
            <li key={`metadata-field-${index}`}>
              <div className="metadata-field">
                <div className="metadata-field__grid">
                  <label>
                    <span>Key</span>
                    <input
                      value={field.key ?? ''}
                      onChange={(e) => updateField(index, { key: e.target.value })}
                      placeholder="invoiceNumber"
                      disabled={disabled}
                    />
                  </label>
                  <label>
                    <span>Label</span>
                    <input
                      value={field.label ?? ''}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      placeholder="Invoice number"
                      disabled={disabled}
                    />
                  </label>
                  <label>
                    <span>Type</span>
                    <select
                      value={field.type ?? 'TEXT'}
                      onChange={(e) => updateField(index, { type: e.target.value })}
                      disabled={disabled}
                    >
                      {METADATA_FIELD_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="checkbox metadata-field__required">
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(e) => updateField(index, { required: e.target.checked })}
                      disabled={disabled}
                    />
                    <span>Required</span>
                  </label>
                  <label className="metadata-field__hint">
                    <span>Hint (optional)</span>
                    <input
                      value={field.hint ?? ''}
                      onChange={(e) => updateField(index, { hint: e.target.value })}
                      placeholder="Shown to uploaders"
                      disabled={disabled}
                    />
                  </label>
                </div>
                {keyDiagnostics[index] && (
                  <p className="metadata-field__error">{keyDiagnostics[index]}</p>
                )}
                <div className="metadata-field__controls">
                  <div className="metadata-field__order">
                    <button
                      type="button"
                      className="ghost ghost--small"
                      onClick={() => moveField(index, -1)}
                      disabled={disabled || index === 0}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="ghost ghost--small"
                      onClick={() => moveField(index, 1)}
                      disabled={disabled || index === fields.length - 1}
                    >
                      Move down
                    </button>
                  </div>
                  <button
                    type="button"
                    className="ghost ghost--small"
                    onClick={() => removeField(index)}
                    disabled={disabled}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {maxReached && (
        <p className="metadata-template-builder__limit">
          Reached the maximum of {MAX_METADATA_FIELDS} metadata fields per folder.
        </p>
      )}
      {error && <p className="feedback feedback--error">{error}</p>}
    </div>
  )
}
