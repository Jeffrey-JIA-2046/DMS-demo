import { useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react'
import { AuthContext, Roles } from '../contexts/AuthContext'
import {
  branchWorkflowTemplate,
  createWorkflowTemplate,
  deleteWorkflowBinding,
  listAutoActivities,
  listWorkflowBindings,
  listWorkflowCategories,
  listWorkflowTemplates,
  publishWorkflowTemplate,
  updateWorkflowTemplate,
  upsertWorkflowBinding,
} from '../api/workflow'

const CANVAS_WIDTH = 980
const CANVAS_HEIGHT = 560

const ACTIVITY_COLORS = {
  BEGIN: '#16a34a',
  END: '#dc2626',
  CONDITION: '#d97706',
  MANUAL: '#2563eb',
  AUTO: '#7c3aed',
}

const CONDITION_OPERATORS = [
  'DATE_BEFORE_FIELD',
  'DATE_AFTER_FIELD',
  'DATE_BEFORE_VALUE',
  'DATE_AFTER_VALUE',
  'STRING_EQUALS',
  'STRING_CONTAINS',
  'NUMBER_GT',
  'NUMBER_GTE',
  'NUMBER_LT',
  'NUMBER_LTE',
]

const CONDITION_GROUP_TEMPLATE = JSON.stringify(
  [
    {
      logic: 'AND',
      rules: [
        { field: 'expiryDate', operator: 'DATE_BEFORE_VALUE', value: '2026-12-31', rightField: '', negate: false },
        { field: 'priority', operator: 'NUMBER_GTE', value: '2', rightField: '', negate: false },
      ],
    },
  ],
  null,
  2,
)

const createConditionRule = () => ({
  field: '',
  operator: 'STRING_EQUALS',
  value: '',
  rightField: '',
  negate: false,
})

const createConditionGroup = () => ({
  logic: 'AND',
  rules: [createConditionRule()],
})

const normalizeConditionGroups = (value) => {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((group) => {
      const rules = Array.isArray(group?.rules)
        ? group.rules
            .map((rule) => ({
              field: typeof rule?.field === 'string' ? rule.field : '',
              operator: CONDITION_OPERATORS.includes(rule?.operator) ? rule.operator : 'STRING_EQUALS',
              value: typeof rule?.value === 'string' ? rule.value : '',
              rightField: typeof rule?.rightField === 'string' ? rule.rightField : '',
              negate: Boolean(rule?.negate),
            }))
            .filter((rule) => rule.field || rule.value || rule.rightField)
        : []

      return {
        logic: group?.logic === 'OR' ? 'OR' : 'AND',
        rules: rules.length ? rules : [createConditionRule()],
      }
    })
    .filter(Boolean)
}

const parseConditionGroups = (rulesJson) => {
  if (!rulesJson?.trim()) {
    return { groups: [], error: '' }
  }
  try {
    const parsed = JSON.parse(rulesJson)
    if (!Array.isArray(parsed)) {
      return { groups: [], error: 'Grouped rules JSON must be an array of groups.' }
    }
    return { groups: normalizeConditionGroups(parsed), error: '' }
  } catch {
    return { groups: [], error: 'Grouped rules JSON is invalid. Fix JSON or reset grouped rules.' }
  }
}

const toConditionRulesJson = (groups) => JSON.stringify(normalizeConditionGroups(groups), null, 2)

const deepClone = (value) => {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `wf-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const createBeginActivity = () => ({
  id: createId(),
  name: 'Begin',
  type: 'BEGIN',
  x: 90,
  y: 120,
  config: {},
})

const createActivity = (type, x = 220, y = 180) => ({
  id: createId(),
  name: type === 'END' ? 'End' : type === 'CONDITION' ? 'Condition' : type === 'AUTO' ? 'Auto' : 'Manual',
  type,
  x,
  y,
  config: {},
})

const createEndActivity = () => ({
  id: createId(),
  name: 'End',
  type: 'END',
  x: 420,
  y: 120,
  config: {},
})

const createTemplateDraft = () => ({
  id: '',
  templateGroupId: '',
  name: 'New workflow template',
  description: '',
  published: false,
  lifecycleStatus: 'DRAFT',
  versionNumber: 0,
  basedOnTemplateId: null,
  activities: [createBeginActivity(), createEndActivity()],
  connections: [],
})

const nodeCenter = (activity) => ({
  x: (activity?.x || 0) + 84,
  y: (activity?.y || 0) + 30,
})

export default function WorkflowDesigner() {
  const { role } = useContext(AuthContext)
  const canPublishAndBind = role === Roles.SYS_ADMIN
  const canDrag = role === Roles.SYS_ADMIN

  const [templates, setTemplates] = useState([])
  const [bindings, setBindings] = useState([])
  const [categories, setCategories] = useState([])
  const [autoActivities, setAutoActivities] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [draft, setDraft] = useState(createTemplateDraft)
  const [selectedActivityId, setSelectedActivityId] = useState('')
  const [connectMode, setConnectMode] = useState(false)
  const [connectSourceId, setConnectSourceId] = useState('')
  const [dragging, setDragging] = useState(null)
  const [bindingForm, setBindingForm] = useState({ category: '', templateId: '' })
  const [showConditionJsonPreview, setShowConditionJsonPreview] = useState(false)

  const canvasRef = useRef(null)

  const selectedActivity = useMemo(() => {
    return draft.activities.find((activity) => activity.id === selectedActivityId) || null
  }, [draft.activities, selectedActivityId])

  const conditionGroupsState = useMemo(() => {
    if (selectedActivity?.type !== 'CONDITION' || !selectedActivity?.config?.rulesJson) {
      return { groups: [], error: '' }
    }
    return parseConditionGroups(selectedActivity.config.rulesJson)
  }, [selectedActivity])

  const conditionGroups = conditionGroupsState.groups
  const conditionGroupsError = conditionGroupsState.error

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [templateData, bindingData, categoryData, autoData] = await Promise.all([
        listWorkflowTemplates(),
        listWorkflowBindings(),
        listWorkflowCategories(),
        listAutoActivities(),
      ])
      const normalizedTemplates = Array.isArray(templateData) ? templateData : []
      setTemplates(normalizedTemplates)
      setBindings(Array.isArray(bindingData) ? bindingData : [])
      setCategories(Array.isArray(categoryData) ? categoryData : [])
      setAutoActivities(Array.isArray(autoData) ? autoData : [])

      if (!selectedTemplateId && normalizedTemplates.length > 0) {
        const first = normalizedTemplates[0]
        setSelectedTemplateId(first.id)
        setDraft(deepClone(first) || createTemplateDraft())
        setSelectedActivityId('')
      } else if (normalizedTemplates.length === 0) {
        setSelectedTemplateId('')
        setDraft(createTemplateDraft())
      }

      setBindingForm((prev) => ({
        category: prev.category || (Array.isArray(categoryData) && categoryData[0]) || '',
        templateId: prev.templateId || (normalizedTemplates[0]?.id || ''),
      }))
    } catch (err) {
      setError(err.message || 'Failed to load workflow data')
    } finally {
      setLoading(false)
    }
  }, [selectedTemplateId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleSelectTemplate = (templateId) => {
    setSelectedTemplateId(templateId)
    const found = templates.find((template) => template.id === templateId)
    if (found) {
      setDraft(deepClone(found) || createTemplateDraft())
      setSelectedActivityId('')
      setConnectSourceId('')
      setConnectMode(false)
    }
  }

  const handleCreateNew = () => {
    setSelectedTemplateId('')
    setDraft(createTemplateDraft())
    setSelectedActivityId('')
    setConnectSourceId('')
    setConnectMode(false)
    setInfo('Started a new workflow template draft')
  }

  const handleSaveTemplate = async () => {
    if (!draft.name?.trim()) {
      setError('Template name is required')
      return
    }
    setSaving(true)
    setError('')
    setInfo('')
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description || '',
        activities: draft.activities,
        connections: draft.connections,
      }
      const saved = draft.id
        ? await updateWorkflowTemplate(draft.id, payload)
        : await createWorkflowTemplate(payload)

      setDraft(deepClone(saved) || createTemplateDraft())
      setSelectedTemplateId(saved.id || '')
      setInfo(draft.id ? 'Workflow template updated' : 'Workflow template created')
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to save workflow template')
    } finally {
      setSaving(false)
    }
  }

  const handlePublishTemplate = async () => {
    if (!draft.id) {
      setError('Save the template before publishing')
      return
    }
    setSaving(true)
    setError('')
    setInfo('')
    try {
      const published = await publishWorkflowTemplate(draft.id)
      setDraft(deepClone(published) || createTemplateDraft())
      setInfo(`Workflow template published as version ${published.versionNumber ?? ''}`.trim())
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to publish template')
    } finally {
      setSaving(false)
    }
  }

  const handleBranchTemplate = async () => {
    if (!draft.id) {
      setError('Select a published template first')
      return
    }
    setSaving(true)
    setError('')
    setInfo('')
    try {
      const branched = await branchWorkflowTemplate(draft.id)
      setDraft(deepClone(branched) || createTemplateDraft())
      setSelectedTemplateId(branched.id || '')
      setInfo('Draft branch created from published version')
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to branch template')
    } finally {
      setSaving(false)
    }
  }

  const addActivity = (type) => {
    setDraft((prev) => ({
      ...prev,
      activities: [...prev.activities, createActivity(type, 180 + prev.activities.length * 20, 140 + prev.activities.length * 16)],
    }))
  }

  const removeSelectedActivity = () => {
    if (!selectedActivity || selectedActivity.type === 'BEGIN' || selectedActivity.type === 'END') {
      return
    }
    const id = selectedActivity.id
    setDraft((prev) => ({
      ...prev,
      activities: prev.activities.filter((activity) => activity.id !== id),
      connections: prev.connections.filter((connection) => connection.fromActivityId !== id && connection.toActivityId !== id),
    }))
    setSelectedActivityId('')
    setConnectSourceId((prev) => (prev === id ? '' : prev))
  }

  const handleNodePointerDown = (event, activityId) => {
    if (connectMode) {
      if (!connectSourceId) {
        setConnectSourceId(activityId)
        return
      }
      if (connectSourceId === activityId) {
        setConnectSourceId('')
        return
      }
      setDraft((prev) => ({
        ...prev,
        connections: [
          ...prev.connections,
          {
            id: createId(),
            fromActivityId: connectSourceId,
            toActivityId: activityId,
            conditionCase: '',
            label: '',
          },
        ],
      }))
      setConnectSourceId('')
      return
    }

    setSelectedActivityId(activityId)
    if (!canDrag) {
      return
    }

    const target = draft.activities.find((activity) => activity.id === activityId)
    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (!target || !canvasRect) {
      return
    }

    setDragging({
      id: activityId,
      offsetX: event.clientX - canvasRect.left - target.x,
      offsetY: event.clientY - canvasRect.top - target.y,
    })
  }

  const handleCanvasPointerMove = (event) => {
    if (!dragging || !canDrag) return
    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (!canvasRect) return

    const nextX = Math.max(0, Math.min(CANVAS_WIDTH - 168, event.clientX - canvasRect.left - dragging.offsetX))
    const nextY = Math.max(0, Math.min(CANVAS_HEIGHT - 60, event.clientY - canvasRect.top - dragging.offsetY))

    setDraft((prev) => ({
      ...prev,
      activities: prev.activities.map((activity) => {
        if (activity.id !== dragging.id) {
          return activity
        }
        return {
          ...activity,
          x: Math.round(nextX),
          y: Math.round(nextY),
        }
      }),
    }))
  }

  const handlePointerUp = () => {
    setDragging(null)
  }

  const updateSelectedActivity = (patch) => {
    if (!selectedActivityId) return
    setDraft((prev) => ({
      ...prev,
      activities: prev.activities.map((activity) => {
        if (activity.id !== selectedActivityId) return activity
        return {
          ...activity,
          ...patch,
        }
      }),
    }))
  }

  const updateSelectedActivityConfig = (key, value) => {
    if (!selectedActivityId) return
    setDraft((prev) => ({
      ...prev,
      activities: prev.activities.map((activity) => {
        if (activity.id !== selectedActivityId) return activity
        return {
          ...activity,
          config: {
            ...(activity.config || {}),
            [key]: value,
          },
        }
      }),
    }))
  }

  const updateConditionGroups = (updater) => {
    if (!selectedActivity || selectedActivity.type !== 'CONDITION') {
      return
    }
    const current = conditionGroups.length ? conditionGroups : [createConditionGroup()]
    const next = typeof updater === 'function' ? updater(current) : current
    updateSelectedActivityConfig('rulesJson', toConditionRulesJson(next))
  }

  const addConditionGroup = () => {
    updateConditionGroups((groups) => [...groups, createConditionGroup()])
  }

  const removeConditionGroup = (groupIndex) => {
    updateConditionGroups((groups) => {
      const next = groups.filter((_, index) => index !== groupIndex)
      return next.length ? next : [createConditionGroup()]
    })
  }

  const updateConditionGroup = (groupIndex, patch) => {
    updateConditionGroups((groups) => groups.map((group, index) => (index === groupIndex ? { ...group, ...patch } : group)))
  }

  const addConditionRule = (groupIndex) => {
    updateConditionGroups((groups) => groups.map((group, index) => {
      if (index !== groupIndex) {
        return group
      }
      return {
        ...group,
        rules: [...(group.rules || []), createConditionRule()],
      }
    }))
  }

  const removeConditionRule = (groupIndex, ruleIndex) => {
    updateConditionGroups((groups) => groups.map((group, index) => {
      if (index !== groupIndex) {
        return group
      }
      const nextRules = (group.rules || []).filter((_, currentIndex) => currentIndex !== ruleIndex)
      return {
        ...group,
        rules: nextRules.length ? nextRules : [createConditionRule()],
      }
    }))
  }

  const updateConditionRule = (groupIndex, ruleIndex, patch) => {
    updateConditionGroups((groups) => groups.map((group, index) => {
      if (index !== groupIndex) {
        return group
      }
      return {
        ...group,
        rules: (group.rules || []).map((rule, currentIndex) => (currentIndex === ruleIndex ? { ...rule, ...patch } : rule)),
      }
    }))
  }

  const resetConditionGroups = () => {
    updateSelectedActivityConfig('groupLogic', 'AND')
    updateSelectedActivityConfig('rulesJson', toConditionRulesJson([createConditionGroup()]))
  }

  const updateConnection = (connectionId, patch) => {
    setDraft((prev) => ({
      ...prev,
      connections: prev.connections.map((connection) => {
        if (connection.id !== connectionId) return connection
        return { ...connection, ...patch }
      }),
    }))
  }

  const removeConnection = (connectionId) => {
    setDraft((prev) => ({
      ...prev,
      connections: prev.connections.filter((connection) => connection.id !== connectionId),
    }))
  }

  const handleUpsertBinding = async (event) => {
    event.preventDefault()
    if (!bindingForm.category || !bindingForm.templateId) {
      setError('Category and template are required for binding')
      return
    }
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await upsertWorkflowBinding({
        category: bindingForm.category,
        templateId: bindingForm.templateId,
        active: true,
      })
      setInfo('Category workflow binding saved')
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to save binding')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteBinding = async (bindingId) => {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await deleteWorkflowBinding(bindingId)
      setInfo('Binding removed')
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to delete binding')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card workflow-admin">
      <div className="list-card__header">
        <div>
          <p className="eyebrow">System administration</p>
          <h3>Workflow Designer</h3>
          <p className="details-description">
            Build workflow templates from activities. Workflows begin at Begin and follow arrow lines until End.
          </p>
          {!canDrag && (
            <p className="details-description">
              Drag and drop positioning is available to system administrators. You can still create and edit templates.
            </p>
          )}
        </div>
      </div>

      {error && <p className="feedback feedback--error">{error}</p>}
      {info && <p className="feedback">{info}</p>}

      <div className="workflow-admin__layout">
        <aside className="workflow-admin__sidebar">
          <div className="workflow-admin__section">
            <div className="workflow-admin__section-header">
              <h4>Templates</h4>
              <button type="button" className="ghost ghost--small" onClick={handleCreateNew}>New</button>
            </div>
            {loading && <p className="empty-state">Loading templates...</p>}
            {!loading && templates.length === 0 && <p className="empty-state">No workflow templates yet.</p>}
            {!loading && templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`workflow-admin__template-btn ${selectedTemplateId === template.id ? 'is-active' : ''}`}
                onClick={() => handleSelectTemplate(template.id)}
              >
                <span>{template.name}</span>
                <small>
                  {template.lifecycleStatus || (template.published ? 'PUBLISHED' : 'DRAFT')} v{template.versionNumber ?? 0}
                </small>
              </button>
            ))}
          </div>

          <div className="workflow-admin__section">
            <h4>Template details</h4>
            <label>
              <span>Name</span>
              <input
                type="text"
                value={draft.name || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                rows={3}
                value={draft.description || ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
            <div className="workflow-admin__actions-row">
              <button type="button" className="primary" onClick={handleSaveTemplate} disabled={saving}>
                {saving ? 'Saving...' : 'Save template'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={handlePublishTemplate}
                disabled={!canPublishAndBind || !draft.id || saving || draft.lifecycleStatus === 'PUBLISHED'}
                title={!canPublishAndBind ? 'Only system administrator can publish templates' : 'Publish template'}
              >
                Publish
              </button>
              <button
                type="button"
                className="ghost"
                onClick={handleBranchTemplate}
                disabled={saving || !draft.id || draft.lifecycleStatus !== 'PUBLISHED'}
                title="Create an editable draft branch from this published version"
              >
                Branch draft
              </button>
            </div>
            <p className="empty-state">
              Status: {draft.lifecycleStatus || 'DRAFT'} | Version: v{draft.versionNumber ?? 0}
            </p>
          </div>

          <div className="workflow-admin__section">
            <h4>Selected activity</h4>
            {!selectedActivity && <p className="empty-state">Select an activity node to edit details.</p>}
            {selectedActivity && (
              <>
                <label>
                  <span>Type</span>
                  <input type="text" value={selectedActivity.type} readOnly />
                </label>
                <label>
                  <span>Name</span>
                  <input
                    type="text"
                    value={selectedActivity.name || ''}
                    onChange={(event) => updateSelectedActivity({ name: event.target.value })}
                  />
                </label>

                {selectedActivity.type === 'CONDITION' && (
                  <>
                    <label className="workflow-admin__toggle-row">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedActivity.config?.rulesJson)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            updateSelectedActivityConfig('rulesJson', selectedActivity.config?.rulesJson || CONDITION_GROUP_TEMPLATE)
                            updateSelectedActivityConfig('groupLogic', selectedActivity.config?.groupLogic || 'AND')
                          } else {
                            updateSelectedActivityConfig('rulesJson', '')
                            updateSelectedActivityConfig('groupLogic', '')
                          }
                        }}
                      />
                      <span>Use advanced grouped conditions (AND/OR)</span>
                    </label>

                    {!selectedActivity.config?.rulesJson && (
                      <>
                        <label>
                          <span>Field</span>
                          <input
                            type="text"
                            value={selectedActivity.config?.field || ''}
                            onChange={(event) => updateSelectedActivityConfig('field', event.target.value)}
                            placeholder="metadata field name"
                          />
                        </label>
                        <label>
                          <span>Operator</span>
                          <select
                            value={selectedActivity.config?.operator || 'STRING_EQUALS'}
                            onChange={(event) => updateSelectedActivityConfig('operator', event.target.value)}
                          >
                            {CONDITION_OPERATORS.map((operator) => (
                              <option key={operator} value={operator}>{operator}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Compare to value</span>
                          <input
                            type="text"
                            value={selectedActivity.config?.value || ''}
                            onChange={(event) => updateSelectedActivityConfig('value', event.target.value)}
                          />
                        </label>
                        <label>
                          <span>Or compare to field</span>
                          <input
                            type="text"
                            value={selectedActivity.config?.rightField || ''}
                            onChange={(event) => updateSelectedActivityConfig('rightField', event.target.value)}
                            placeholder="optional metadata field"
                          />
                        </label>
                      </>
                    )}

                    {selectedActivity.config?.rulesJson && (
                      <>
                        <label>
                          <span>Group logic</span>
                          <select
                            value={selectedActivity.config?.groupLogic || 'AND'}
                            onChange={(event) => updateSelectedActivityConfig('groupLogic', event.target.value)}
                          >
                            <option value="AND">AND</option>
                            <option value="OR">OR</option>
                          </select>
                        </label>
                        {conditionGroupsError && (
                          <>
                            <p className="feedback feedback--error">{conditionGroupsError}</p>
                            <button
                              type="button"
                              className="ghost ghost--small"
                              onClick={resetConditionGroups}
                            >
                              Reset grouped rules
                            </button>
                          </>
                        )}

                        {!conditionGroupsError && (
                          <div className="workflow-admin__condition-builder">
                            {conditionGroups.map((group, groupIndex) => (
                              <div key={`group-${groupIndex}`} className="workflow-admin__condition-group">
                                <div className="workflow-admin__condition-group-header">
                                  <strong>Group {groupIndex + 1}</strong>
                                  <div className="workflow-admin__condition-group-actions">
                                    <select
                                      value={group.logic || 'AND'}
                                      onChange={(event) => updateConditionGroup(groupIndex, { logic: event.target.value })}
                                    >
                                      <option value="AND">AND</option>
                                      <option value="OR">OR</option>
                                    </select>
                                    <button
                                      type="button"
                                      className="ghost ghost--danger ghost--small"
                                      onClick={() => removeConditionGroup(groupIndex)}
                                      disabled={conditionGroups.length <= 1}
                                    >
                                      Remove group
                                    </button>
                                  </div>
                                </div>

                                {(group.rules || []).map((rule, ruleIndex) => (
                                  <div key={`group-${groupIndex}-rule-${ruleIndex}`} className="workflow-admin__condition-rule">
                                    <input
                                      type="text"
                                      value={rule.field || ''}
                                      onChange={(event) => updateConditionRule(groupIndex, ruleIndex, { field: event.target.value })}
                                      placeholder="metadata field"
                                    />
                                    <select
                                      value={rule.operator || 'STRING_EQUALS'}
                                      onChange={(event) => updateConditionRule(groupIndex, ruleIndex, { operator: event.target.value })}
                                    >
                                      {CONDITION_OPERATORS.map((operator) => (
                                        <option key={operator} value={operator}>{operator}</option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      value={rule.value || ''}
                                      onChange={(event) => updateConditionRule(groupIndex, ruleIndex, { value: event.target.value })}
                                      placeholder="compare value"
                                    />
                                    <input
                                      type="text"
                                      value={rule.rightField || ''}
                                      onChange={(event) => updateConditionRule(groupIndex, ruleIndex, { rightField: event.target.value })}
                                      placeholder="or right field"
                                    />
                                    <label className="workflow-admin__toggle-row">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(rule.negate)}
                                        onChange={(event) => updateConditionRule(groupIndex, ruleIndex, { negate: event.target.checked })}
                                      />
                                      <span>NOT</span>
                                    </label>
                                    <button
                                      type="button"
                                      className="ghost ghost--danger ghost--small"
                                      onClick={() => removeConditionRule(groupIndex, ruleIndex)}
                                    >
                                      Remove rule
                                    </button>
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  className="ghost ghost--small"
                                  onClick={() => addConditionRule(groupIndex)}
                                >
                                  + Add rule
                                </button>
                              </div>
                            ))}

                            <button type="button" className="ghost ghost--small" onClick={addConditionGroup}>
                              + Add group
                            </button>
                          </div>
                        )}

                        <div className="workflow-admin__json-preview">
                          <div className="workflow-admin__json-preview-header">
                            <span>Generated grouped rules JSON</span>
                            <button
                              type="button"
                              className="ghost ghost--small"
                              onClick={() => setShowConditionJsonPreview((prev) => !prev)}
                            >
                              {showConditionJsonPreview ? 'Hide JSON preview' : 'Show JSON preview'}
                            </button>
                          </div>
                          {showConditionJsonPreview && (
                            <textarea
                              rows={9}
                              value={selectedActivity.config?.rulesJson || ''}
                              readOnly
                            />
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}

                {selectedActivity.type === 'MANUAL' && (
                  <>
                    <label>
                      <span>Assignee role (optional)</span>
                      <select
                        value={selectedActivity.config?.assigneeRole || ''}
                        onChange={(event) => updateSelectedActivityConfig('assigneeRole', event.target.value)}
                      >
                        <option value="">Any role</option>
                        <option value="SYS_ADMIN">SYS_ADMIN</option>
                        <option value="USER_ADMIN">USER_ADMIN</option>
                        <option value="DOC_ADMIN">DOC_ADMIN</option>
                        <option value="DOC_VIEWER">DOC_VIEWER</option>
                      </select>
                    </label>
                    <label>
                      <span>Assignee username (optional)</span>
                      <input
                        type="text"
                        value={selectedActivity.config?.assigneeUsername || ''}
                        onChange={(event) => updateSelectedActivityConfig('assigneeUsername', event.target.value)}
                        placeholder="specific username"
                      />
                    </label>
                    <label>
                      <span>Assignee from document role</span>
                      <select
                        value={selectedActivity.config?.assigneeType || ''}
                        onChange={(event) => updateSelectedActivityConfig('assigneeType', event.target.value)}
                      >
                        <option value="">None</option>
                        <option value="DOCUMENT_APPROVER">DOCUMENT_APPROVER</option>
                        <option value="DOCUMENT_SUPERVISOR">DOCUMENT_SUPERVISOR</option>
                        <option value="DOCUMENT_OWNER">DOCUMENT_OWNER</option>
                      </select>
                    </label>
                  </>
                )}

                {selectedActivity.type === 'AUTO' && (
                  <label>
                    <span>Auto class</span>
                    <select
                      value={selectedActivity.config?.autoClass || ''}
                      onChange={(event) => updateSelectedActivityConfig('autoClass', event.target.value)}
                    >
                      <option value="">Select class</option>
                      {autoActivities.map((activity) => (
                        <option key={activity.key} value={activity.key}>
                          {activity.key} - {activity.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  className="ghost ghost--danger"
                  onClick={removeSelectedActivity}
                  disabled={selectedActivity.type === 'BEGIN' || selectedActivity.type === 'END'}
                >
                  Remove activity
                </button>
              </>
            )}
          </div>
        </aside>

        <div className="workflow-admin__designer">
          <div className="workflow-admin__toolbar">
            <button type="button" className="ghost ghost--small" onClick={() => addActivity('MANUAL')}>+ Manual</button>
            <button type="button" className="ghost ghost--small" onClick={() => addActivity('AUTO')}>+ Auto</button>
            <button type="button" className="ghost ghost--small" onClick={() => addActivity('CONDITION')}>+ Condition</button>
            <button
              type="button"
              className={`ghost ghost--small ${connectMode ? 'is-active' : ''}`}
              onClick={() => {
                setConnectMode((prev) => !prev)
                setConnectSourceId('')
              }}
            >
              {connectMode ? 'Exit connect mode' : 'Connect activities'}
            </button>
            {connectMode && (
              <small>
                {connectSourceId ? 'Select target activity...' : 'Select source activity...'}
              </small>
            )}
          </div>

          <div
            ref={canvasRef}
            className="workflow-canvas"
            style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
            onMouseMove={handleCanvasPointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
          >
            <svg className="workflow-canvas__links" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
              <defs>
                <marker id="workflow-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L10,4 L0,8 z" fill="#64748b" />
                </marker>
              </defs>
              {draft.connections.map((connection) => {
                const from = draft.activities.find((activity) => activity.id === connection.fromActivityId)
                const to = draft.activities.find((activity) => activity.id === connection.toActivityId)
                if (!from || !to) return null
                const start = nodeCenter(from)
                const end = nodeCenter(to)
                const midX = (start.x + end.x) / 2
                const path = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`
                return (
                  <g key={connection.id}>
                    <path d={path} stroke="#64748b" fill="none" strokeWidth="2" markerEnd="url(#workflow-arrow)" />
                  </g>
                )
              })}
            </svg>

            {draft.activities.map((activity) => (
              <button
                key={activity.id}
                type="button"
                className={`workflow-node ${selectedActivityId === activity.id ? 'is-selected' : ''} ${connectSourceId === activity.id ? 'is-source' : ''}`}
                style={{
                  left: activity.x,
                  top: activity.y,
                  borderColor: ACTIVITY_COLORS[activity.type] || '#334155',
                }}
                onMouseDown={(event) => handleNodePointerDown(event, activity.id)}
              >
                <strong>{activity.name}</strong>
                <small>{activity.type}</small>
              </button>
            ))}
          </div>

          <div className="workflow-admin__connections">
            <h4>Connections</h4>
            {!draft.connections.length && <p className="empty-state">No arrow lines yet.</p>}
            {draft.connections.map((connection) => {
              const from = draft.activities.find((activity) => activity.id === connection.fromActivityId)
              const to = draft.activities.find((activity) => activity.id === connection.toActivityId)
              return (
                <div key={connection.id} className="workflow-admin__connection-row">
                  <div>
                      <p>{from?.name || 'Unknown'} {'->'} {to?.name || 'Unknown'}</p>
                    <div className="workflow-admin__connection-fields">
                      <input
                        type="text"
                        value={connection.conditionCase || ''}
                        onChange={(event) => updateConnection(connection.id, { conditionCase: event.target.value })}
                        placeholder="case: TRUE/FALSE/DEFAULT"
                      />
                      <input
                        type="text"
                        value={connection.label || ''}
                        onChange={(event) => updateConnection(connection.id, { label: event.target.value })}
                        placeholder="label"
                      />
                    </div>
                  </div>
                  <button type="button" className="ghost ghost--danger ghost--small" onClick={() => removeConnection(connection.id)}>
                    Remove
                  </button>
                </div>
              )
            })}
          </div>

          <div className="workflow-admin__bindings">
            <h4>Category binding</h4>
            <form onSubmit={handleUpsertBinding} className="workflow-admin__binding-form">
              <label>
                <span>Category</span>
                <input
                  list="workflow-categories"
                  value={bindingForm.category}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, category: event.target.value }))}
                  placeholder="Document category"
                />
                <datalist id="workflow-categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </label>

              <label>
                <span>Template</span>
                <select
                  value={bindingForm.templateId}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, templateId: event.target.value }))}
                >
                  <option value="">Select template</option>
                  {templates.filter((template) => template.lifecycleStatus === 'PUBLISHED' || template.published).map((template) => (
                    <option key={template.id} value={template.id}>{template.name} (v{template.versionNumber ?? 0})</option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="primary"
                disabled={!canPublishAndBind || saving || !bindingForm.category || !bindingForm.templateId}
                title={!canPublishAndBind ? 'Only system administrator can bind templates to categories' : 'Save binding'}
              >
                Save binding
              </button>
            </form>

            <div className="workflow-admin__bindings-list">
              {!bindings.length && <p className="empty-state">No category bindings defined.</p>}
              {bindings.map((binding) => {
                const template = templates.find((item) => item.id === binding.templateId)
                return (
                  <article key={binding.id} className="workflow-admin__binding-row">
                    <div>
                      <strong>{binding.category}</strong>
                      <p>{template?.name || binding.templateId}</p>
                    </div>
                    <button
                      type="button"
                      className="ghost ghost--danger ghost--small"
                      onClick={() => handleDeleteBinding(binding.id)}
                      disabled={!canPublishAndBind || saving}
                    >
                      Remove
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
