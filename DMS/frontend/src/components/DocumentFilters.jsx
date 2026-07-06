import { useEffect, useMemo, useState } from 'react'

const searchColumnOptions = [
  { label: 'Title', value: 'title' },
  { label: 'Description', value: 'description' },
  { label: 'Owner', value: 'owner' },
  { label: 'Category', value: 'category' },
  { label: 'Tags', value: 'tags' },
  { label: 'Document metadata', value: 'documentMetadata' },
  { label: 'Folder name', value: 'folderName' },
  { label: 'Folder metadata', value: 'folderMetadata' },
  { label: 'Created date', value: 'createdDate' },
  { label: 'Modified date', value: 'modifiedDate' },
]

const operatorOptions = [
  { label: 'contains', value: 'contains' },
  { label: 'not contains', value: 'not_contains' },
  { label: 'is', value: 'is' },
  { label: 'is not', value: 'is_not' },
  { label: 'starts with', value: 'starts_with' },
  { label: 'ends with', value: 'ends_with' },
  { label: 'after', value: 'after' },
  { label: 'before', value: 'before' },
]

const FOLDER_METADATA_FIELD = 'folderMetadata'
const createCondition = (field = 'title', value = '', metadataField = '', operator = 'contains') => ({
  field,
  value,
  metadataField,
  operator,
})
const createGroup = (id, logic = 'AND', conditions = [createCondition()]) => ({ id, logic, conditions })

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
    operator: condition?.operator || 'contains',
    metadataField: (() => {
      const raw = String(condition?.field || '').trim()
      if (raw.toLowerCase().startsWith('foldermeta:')) {
        return raw.slice('foldermeta:'.length)
      }
      return condition?.metadataField || ''
    })(),
  }))
}

const ensureGroups = (groups = [], defaultField = 'title') => {
  if (!Array.isArray(groups) || !groups.length) {
    return [createGroup(0, 'AND', [createCondition(defaultField)])]
  }
  return groups.map((group, groupIndex) => ({
    id: Number.isFinite(group?.id) ? group.id : groupIndex,
    logic: group?.logic === 'OR' ? 'OR' : 'AND',
    conditions: normalizeConditions(group?.conditions, defaultField),
  }))
}

const conditionsToGroups = (conditions = [], defaultField = 'title') => {
  if (!Array.isArray(conditions) || !conditions.length) {
    return [createGroup(0, 'AND', [createCondition(defaultField)])]
  }

  const normalizedRows = conditions.map((condition, index) => {
    const rawField = String(condition?.field || '').trim()
    const field = rawField.toLowerCase().startsWith('foldermeta:')
      ? FOLDER_METADATA_FIELD
      : (rawField || defaultField)
    const metadataField = rawField.toLowerCase().startsWith('foldermeta:')
      ? rawField.slice('foldermeta:'.length)
      : (condition?.metadataField || '')
    const join = String(condition?.join || '').trim().toUpperCase()
    const group = Number.isFinite(Number(condition?.group)) ? Number(condition.group) : 0
    return {
      index,
      group,
      join: join === 'OR' ? 'OR' : (join === 'AND' ? 'AND' : ''),
      condition: {
        field,
        value: condition?.value || '',
        operator: condition?.operator || 'contains',
        metadataField,
      },
    }
  })

  const groupOrder = []
  const rowsByGroup = new Map()
  normalizedRows.forEach((row) => {
    if (!rowsByGroup.has(row.group)) {
      rowsByGroup.set(row.group, [])
      groupOrder.push(row.group)
    }
    rowsByGroup.get(row.group).push(row)
  })

  const interGroupLogic = new Map()
  for (let i = 0; i < normalizedRows.length - 1; i++) {
    const current = normalizedRows[i]
    const next = normalizedRows[i + 1]
    if (current.group !== next.group && (current.join === 'AND' || current.join === 'OR')) {
      interGroupLogic.set(next.group, current.join)
    }
  }

  return groupOrder.map((groupId, idx) => {
    const groupRows = rowsByGroup.get(groupId) || []
    let groupLogic = idx === 0 ? 'AND' : (interGroupLogic.get(groupId) || 'AND')

    for (let i = 0; i < groupRows.length - 1; i++) {
      const rowJoin = groupRows[i]?.join
      if (rowJoin === 'AND' || rowJoin === 'OR') {
        groupLogic = rowJoin
        break
      }
    }

    const groupConditions = groupRows.length
      ? groupRows.map((row) => row.condition)
      : [createCondition(defaultField)]

    return createGroup(idx, groupLogic, groupConditions)
  })
}

export default function DocumentFilters({ value, onSearch, onReset, folderMetadataFields = [] }) {
  const [local, setLocal] = useState(value)
  const [advancedEnabled, setAdvancedEnabled] = useState(false)
  const [groups, setGroups] = useState([createGroup(0)])

  const combinedFieldOptions = [...searchColumnOptions]
    .filter((option, index, array) => option?.value && array.findIndex((candidate) => candidate?.value === option.value) === index)
  const defaultConditionField = combinedFieldOptions[0]?.value || 'title'

  useEffect(() => {
    const normalizedConditions = normalizeConditions(value?.conditions, defaultConditionField)
    setLocal({
      ...value,
      conditions: normalizedConditions,
    })
    setGroups(conditionsToGroups(value?.conditions, defaultConditionField))
    setAdvancedEnabled(normalizedConditions.some((condition) => String(condition?.value || '').trim().length > 0))
  }, [value, defaultConditionField])

  const nextGroupId = useMemo(() => {
    if (!groups.length) {
      return 1
    }
    return Math.max(...groups.map((group) => group.id)) + 1
  }, [groups])

  const updateGroups = (updater) => {
    setGroups((prev) => ensureGroups(updater(ensureGroups(prev, defaultConditionField)), defaultConditionField))
  }

  const handleGroupLogicChange = (groupId, logic) => {
    updateGroups((prev) => prev.map((group) => (group.id === groupId ? { ...group, logic } : group)))
  }

  const handleConditionChange = (groupId, conditionIndex, field, newValue) => {
    updateGroups((prev) => prev.map((group) => {
      if (group.id !== groupId) {
        return group
      }
      return {
        ...group,
        conditions: group.conditions.map((condition, index) => {
          if (index !== conditionIndex) {
            return condition
          }
          if (field === 'field' && newValue !== FOLDER_METADATA_FIELD) {
            return { ...condition, field: newValue, metadataField: '' }
          }
          return { ...condition, [field]: newValue }
        }),
      }
    }))
  }

  const handleAddCondition = (groupId) => {
    updateGroups((prev) => prev.map((group) => (
      group.id === groupId
        ? { ...group, conditions: [...group.conditions, createCondition(defaultConditionField)] }
        : group
    )))
  }

  const handleRemoveCondition = (groupId, conditionIndex) => {
    updateGroups((prev) => prev.map((group) => {
      if (group.id !== groupId) {
        return group
      }
      const nextConditions = group.conditions.filter((_, index) => index !== conditionIndex)
      return {
        ...group,
        conditions: nextConditions.length ? nextConditions : [createCondition(defaultConditionField)],
      }
    }))
  }

  const handleAddGroup = () => {
    updateGroups((prev) => [...prev, createGroup(nextGroupId, 'AND', [createCondition(defaultConditionField)])])
    setAdvancedEnabled(true)
  }

  const handleRemoveGroup = (groupId) => {
    updateGroups((prev) => {
      if (prev.length <= 1) {
        return prev
      }
      return prev.filter((group) => group.id !== groupId)
    })
  }

  const toSearchConditions = () => {
    const flattened = []
    groups.forEach((group, groupIndex) => {
      const validConditions = group.conditions
        .filter((condition) => String(condition?.value || '').trim().length > 0)
        .filter((condition) => condition.field !== FOLDER_METADATA_FIELD || String(condition.metadataField || '').trim().length > 0)

      validConditions.forEach((condition, conditionIndex) => {
        const isLastConditionInGroup = conditionIndex === validConditions.length - 1
        const joinWithinGroup = isLastConditionInGroup ? '' : group.logic
        const nextGroupLogic = groupIndex < groups.length - 1 ? groups[groupIndex + 1]?.logic : null
        const joinAcrossGroups = isLastConditionInGroup && nextGroupLogic ? nextGroupLogic : ''

        flattened.push({
          field: condition.field === FOLDER_METADATA_FIELD
            ? `folderMeta:${String(condition.metadataField || '').trim()}`
            : condition.field,
          value: String(condition.value || '').trim(),
          operator: String(condition.operator || 'contains').trim(),
          group: groupIndex,
          join: joinWithinGroup || joinAcrossGroups,
        })
      })
    })

    if (flattened.length) {
      flattened[flattened.length - 1].join = ''
    }

    return flattened
  }

  const handleSearch = () => {
    if (typeof onSearch !== 'function') {
      return
    }

    onSearch({
      ...local,
      query: String(local?.query || '').trim(),
      conditions: advancedEnabled ? toSearchConditions() : [],
    })
  }

  const handleResetAll = () => {
    setLocal((prev) => ({
      ...prev,
      query: '',
      conditions: [createCondition(defaultConditionField)],
    }))
    setGroups([createGroup(0, 'AND', [createCondition(defaultConditionField)])])
    setAdvancedEnabled(false)
    if (typeof onReset === 'function') {
      onReset()
    }
  }

  const queryPreview = useMemo(() => {
    const groupText = groups.map((group) => {
      const items = group.conditions
        .filter((condition) => String(condition?.value || '').trim().length > 0)
        .map((condition) => {
          const fieldLabel = condition.field === FOLDER_METADATA_FIELD
            ? (condition.metadataField || 'Folder metadata')
            : (combinedFieldOptions.find((option) => option.value === condition.field)?.label || condition.field)
          const operatorLabel = String(condition.operator || 'contains').replaceAll('_', ' ')
          return `${fieldLabel} ${operatorLabel} \"${condition.value}\"`
        })
      if (!items.length) {
        return ''
      }
      return items.join(` ${group.logic} `)
    }).filter(Boolean)

    if (!groupText.length) {
      return 'No conditions added'
    }
    if (groupText.length === 1) {
      return groupText[0]
    }

    let preview = `(${groupText[0]})`
    for (let i = 1; i < groupText.length; i++) {
      const connector = groups[i]?.logic === 'OR' ? 'OR' : 'AND'
      preview += ` ${connector} (${groupText[i]})`
    }
    return preview
  }, [groups, combinedFieldOptions])

  const readyConditionsCount = useMemo(() => {
    return groups.reduce((sum, group) => (
      sum + group.conditions.filter((condition) => String(condition?.value || '').trim().length > 0).length
    ), 0)
  }, [groups])

  return (
    <div className="search-doc-builder">
      <div className="search-doc-builder__header">
        <div className="search-doc-builder__quick-search">
          <i className="fas fa-search" aria-hidden="true" />
          <input
            type="text"
            value={local?.query || ''}
            onChange={(e) => setLocal((prev) => ({ ...prev, query: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSearch()
              }
            }}
          />
        </div>
        <div className="search-doc-builder__header-actions">
          <button type="button" className="ghost" onClick={() => setAdvancedEnabled((prev) => !prev)}>
            <i className="fas fa-sliders-h" aria-hidden="true" />
            {advancedEnabled ? 'Hide Advanced' : 'Advanced'}
          </button>
          <button type="button" className="primary" onClick={handleSearch}>
            <i className="fas fa-search" aria-hidden="true" />
            Search
          </button>
        </div>
      </div>

      <div className="search-doc-builder__toggle-row">
        <label className="search-doc-builder__toggle-label">
          <input
            type="checkbox"
            checked={advancedEnabled}
            onChange={(e) => setAdvancedEnabled(e.target.checked)}
          />
          <span>Enable condition groups</span>
        </label>
        <span className="search-doc-builder__badge">Nested AND / OR</span>
        <div className="search-doc-builder__query-preview" title={queryPreview}>
          <i className="fas fa-quote-right" aria-hidden="true" />
          <span>{queryPreview}</span>
        </div>
      </div>

      {advancedEnabled && (
        <div className="search-doc-builder__advanced">
          <div className="search-doc-builder__topbar">
            <button type="button" className="search-doc-builder__add-group" onClick={handleAddGroup}>
              <i className="fas fa-layer-group" aria-hidden="true" />
              Add condition group
            </button>
            <span className="search-doc-builder__hint">
              <i className="fas fa-lightbulb" aria-hidden="true" />
              Group rows with AND / OR logic.
            </span>
          </div>

          {groups.map((group, groupIndex) => (
            <div key={group.id} className={`search-doc-builder__group ${groupIndex > 0 ? 'search-doc-builder__group--nested' : ''}`}>
              <div className="search-doc-builder__group-header">
                <div className="search-doc-builder__logic-toggle">
                  <button
                    type="button"
                    className={group.logic === 'AND' ? 'is-active' : ''}
                    onClick={() => handleGroupLogicChange(group.id, 'AND')}
                  >
                    AND
                  </button>
                  <button
                    type="button"
                    className={group.logic === 'OR' ? 'is-active' : ''}
                    onClick={() => handleGroupLogicChange(group.id, 'OR')}
                  >
                    OR
                  </button>
                </div>
                <span className="search-doc-builder__group-label">Group {groupIndex + 1}</span>
                <div className="search-doc-builder__group-actions">
                  <button type="button" onClick={() => handleAddCondition(group.id)}>
                    <i className="fas fa-plus" aria-hidden="true" />
                    Add condition
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => handleRemoveGroup(group.id)}
                    disabled={groups.length <= 1}
                    title={groups.length <= 1 ? 'Keep at least one group' : 'Remove group'}
                  >
                    Remove group
                  </button>
                </div>
              </div>

              <div className="search-doc-builder__conditions">
                {group.conditions.map((condition, index) => (
                  <div key={`group-${group.id}-condition-${index}`} className="search-doc-builder__condition-row">
                    <span className={`search-doc-builder__row-logic ${index === 0 ? 'is-hidden' : ''} ${group.logic === 'OR' ? 'is-or' : 'is-and'}`}>
                      {group.logic}
                    </span>

                    <select
                      className="search-doc-builder__field-select"
                      value={condition.field || defaultConditionField}
                      onChange={(e) => handleConditionChange(group.id, index, 'field', e.target.value)}
                    >
                      {combinedFieldOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>

                    <select
                      className="search-doc-builder__operator-select"
                      value={condition.operator || 'contains'}
                      onChange={(e) => handleConditionChange(group.id, index, 'operator', e.target.value)}
                    >
                      {operatorOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>

                    {condition.field === FOLDER_METADATA_FIELD && (
                      <select
                        className="search-doc-builder__field-select"
                        value={condition.metadataField || ''}
                        onChange={(e) => handleConditionChange(group.id, index, 'metadataField', e.target.value)}
                      >
                        <option value="">Select folder field</option>
                        {(Array.isArray(folderMetadataFields) ? folderMetadataFields : []).map((field) => (
                          <option key={field.key} value={field.key}>{field.label}</option>
                        ))}
                      </select>
                    )}

                    <input
                      className="search-doc-builder__value-input"
                      type={condition.field === 'createdDate' || condition.field === 'modifiedDate' ? 'date' : 'text'}
                      value={condition.value || ''}
                      onChange={(e) => handleConditionChange(group.id, index, 'value', e.target.value)}
                      placeholder="Enter value"
                    />

                    <div className="search-doc-builder__row-actions">
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => handleRemoveCondition(group.id, index)}
                        aria-label="Remove condition"
                        title="Remove condition"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="search-doc-builder__actions">
            <button type="button" className="primary" onClick={handleSearch}>
              <i className="fas fa-search" aria-hidden="true" />
              Search
            </button>
            <button type="button" className="ghost" onClick={handleResetAll}>Reset</button>
            <div className="search-doc-builder__result-count">
              <strong>{readyConditionsCount}</strong> conditions ready
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
