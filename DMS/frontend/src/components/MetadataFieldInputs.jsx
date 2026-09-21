import React from 'react'

const TYPE_TO_INPUT = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
}

export default function MetadataFieldInputs({ template = [], values = {}, errors = {}, onChange = () => {}, disabled = false, codeTableItems = {} }) {
  if (!template?.length) {
    return null
  }

  return (
    <div className="metadata-field-inputs">
      {template.map((field) => {
        const value = values?.[field.key] ?? ''
        const error = errors?.[field.key]

        if (field.type === 'DROPDOWN') {
          const options = (field.codeTableCode && codeTableItems[field.codeTableCode]) ? codeTableItems[field.codeTableCode] : []
          return (
            <label key={field.key} className="metadata-input">
              <div className="metadata-input__header">
                <span>
                  {field.label}
                  {field.required && <span className="metadata-input__required">*</span>}
                </span>
                <small className="metadata-input__type">DROPDOWN</small>
              </div>
              <select
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                disabled={disabled}
              >
                <option value="">-- Select --</option>
                {options.map((opt) => (
                  <option key={opt.itemCode} value={opt.itemCode}>{opt.itemLabel}</option>
                ))}
              </select>
              {field.hint && <small className="metadata-input__hint">{field.hint}</small>}
              {error && <p className="metadata-input__error">{error}</p>}
            </label>
          )
        }

        const inputType = TYPE_TO_INPUT[field.type] || 'text'
        return (
          <label key={field.key} className="metadata-input">
            <div className="metadata-input__header">
              <span>
                {field.label}
                {field.required && <span className="metadata-input__required">*</span>}
              </span>
              <small className="metadata-input__type">{field.type}</small>
            </div>
            <input
              type={inputType}
              value={value}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.hint || ''}
              disabled={disabled}
            />
            {field.hint && <small className="metadata-input__hint">{field.hint}</small>}
            {error && <p className="metadata-input__error">{error}</p>}
          </label>
        )
      })}
    </div>
  )
}
