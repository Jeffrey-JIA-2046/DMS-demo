import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
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

const DEFAULT_NODE_POSITION = { x: 260, y: 180 }

const ACTIVITY_TO_BPMN = {
  BEGIN: 'bpmn:StartEvent',
  END: 'bpmn:EndEvent',
  CONDITION: 'bpmn:ExclusiveGateway',
  MANUAL: 'bpmn:UserTask',
  AUTO: 'bpmn:ServiceTask',
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
  bpmnXml: '',
  published: false,
  lifecycleStatus: 'DRAFT',
  versionNumber: 0,
  basedOnTemplateId: null,
  activities: [createBeginActivity(), createEndActivity()],
  connections: [],
})

const isFlowNodeShape = (element) => element && !element.waypoints && element.type !== 'bpmn:Process' && element.parent

const toActivityType = (shapeType) => {
  switch (shapeType) {
    case 'bpmn:StartEvent':
      return 'BEGIN'
    case 'bpmn:EndEvent':
      return 'END'
    case 'bpmn:ExclusiveGateway':
      return 'CONDITION'
    case 'bpmn:ServiceTask':
      return 'AUTO'
    case 'bpmn:UserTask':
    case 'bpmn:Task':
    default:
      return 'MANUAL'
  }
}

const toBpmnType = (activityType) => ACTIVITY_TO_BPMN[activityType] || 'bpmn:Task'

const toDefaultName = (activityType) => {
  switch (activityType) {
    case 'BEGIN':
      return 'Begin'
    case 'END':
      return 'End'
    case 'CONDITION':
      return 'Condition'
    case 'AUTO':
      return 'Auto'
    case 'MANUAL':
    default:
      return 'Manual'
  }
}

const toDiagramSnapshot = (value) => {
  const activities = Array.isArray(value?.activities)
    ? value.activities.map((activity) => ({
        id: activity.id,
        type: activity.type,
        name: activity.name,
        x: activity.x,
        y: activity.y,
      }))
    : []

  const connections = Array.isArray(value?.connections)
    ? value.connections.map((connection) => ({
        id: connection.id,
        fromActivityId: connection.fromActivityId,
        toActivityId: connection.toActivityId,
        label: connection.label,
      }))
    : []

  return JSON.stringify({ activities, connections })
}

const extractDraftFromModeler = (modeler, previousDraft) => {
  const elementRegistry = modeler.get('elementRegistry')
  const allElements = elementRegistry.getAll()
  const previousActivities = new Map((previousDraft?.activities || []).map((activity) => [activity.id, activity]))
  const previousConnections = new Map((previousDraft?.connections || []).map((connection) => [connection.id, connection]))

  const activities = allElements
    .filter(isFlowNodeShape)
    .map((shape) => {
      const fallbackName = toDefaultName(toActivityType(shape.type))
      const previous = previousActivities.get(shape.id)
      return {
        id: shape.id,
        name: shape.businessObject?.name || previous?.name || fallbackName,
        type: toActivityType(shape.type),
        x: Math.round(shape.x || 0),
        y: Math.round(shape.y || 0),
        config: previous?.config || {},
      }
    })

  const connections = allElements
    .filter((element) => element.waypoints && element.type === 'bpmn:SequenceFlow')
    .map((connection) => {
      const previous = previousConnections.get(connection.id)
      return {
        id: connection.id,
        fromActivityId: connection.source?.id || '',
        toActivityId: connection.target?.id || '',
        conditionCase: previous?.conditionCase || '',
        label: connection.businessObject?.name || previous?.label || '',
      }
    })

  return {
    ...previousDraft,
    activities,
    connections,
  }
}

const createBpmnGraphFromDraft = async (modeler, draft) => {
  await modeler.createDiagram()

  const elementFactory = modeler.get('elementFactory')
  const modeling = modeler.get('modeling')
  const canvas = modeler.get('canvas')
  const root = canvas.getRootElement()

  const shapeById = new Map()

  for (const activity of draft.activities || []) {
    const shape = elementFactory.createShape({ type: toBpmnType(activity.type) })
    const baseX = Number.isFinite(activity.x) ? activity.x : DEFAULT_NODE_POSITION.x
    const baseY = Number.isFinite(activity.y) ? activity.y : DEFAULT_NODE_POSITION.y
    const position = {
      x: baseX + (shape.width || 100) / 2,
      y: baseY + (shape.height || 80) / 2,
    }

    const created = modeling.createShape(shape, position, root)
    try {
      modeling.updateProperties(created, {
        id: activity.id || createId(),
        name: activity.name || toDefaultName(activity.type),
      })
    } catch {
      modeling.updateProperties(created, {
        name: activity.name || toDefaultName(activity.type),
      })
    }
    shapeById.set(activity.id, created)
  }

  for (const connection of draft.connections || []) {
    const source = shapeById.get(connection.fromActivityId)
    const target = shapeById.get(connection.toActivityId)
    if (!source || !target) {
      continue
    }
    const createdConnection = modeling.connect(source, target, { type: 'bpmn:SequenceFlow' })
    try {
      modeling.updateProperties(createdConnection, {
        id: connection.id || createId(),
        name: connection.label || '',
      })
    } catch {
      modeling.updateProperties(createdConnection, {
        name: connection.label || '',
      })
    }
  }

  canvas.zoom('fit-viewport', 'auto')
}

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
  const [bindingForm, setBindingForm] = useState({ category: '', templateId: '' })
  const [showConditionJsonPreview, setShowConditionJsonPreview] = useState(false)

  const modelerRef = useRef(null)
  const modelerCanvasRef = useRef(null)
  const bpmnImportInputRef = useRef(null)
  const importingDiagramRef = useRef(false)
  const lastModelSnapshotRef = useRef('')

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

  useEffect(() => {
    if (!modelerCanvasRef.current) {
      return undefined
    }

    const modeler = new BpmnModeler({
      container: modelerCanvasRef.current,
    })

    modelerRef.current = modeler

    const eventBus = modeler.get('eventBus')
    const selection = modeler.get('selection')

    eventBus.on('selection.changed', (event) => {
      const selected = event.newSelection?.[0]
      if (!selected || selected.waypoints) {
        setSelectedActivityId('')
        return
      }
      setSelectedActivityId(selected.id)
    })

    eventBus.on('commandStack.changed', () => {
      if (importingDiagramRef.current) {
        return
      }
      setDraft((prev) => {
        const next = extractDraftFromModeler(modeler, prev)
        lastModelSnapshotRef.current = toDiagramSnapshot(next)
        return next
      })
    })

    createBpmnGraphFromDraft(modeler, createTemplateDraft())
      .then(() => {
        const initialDraft = createTemplateDraft()
        lastModelSnapshotRef.current = toDiagramSnapshot(initialDraft)
        const firstActivity = initialDraft.activities?.[0]
        if (firstActivity?.id) {
          const element = modeler.get('elementRegistry').get(firstActivity.id)
          if (element) {
            selection.select(element)
          }
        }
      })
      .catch(() => {
        setError('Failed to initialize BPMN workflow designer')
      })

    return () => {
      modeler.destroy()
      modelerRef.current = null
    }
  }, [])

  useEffect(() => {
    const modeler = modelerRef.current
    if (!modeler) {
      return
    }
    const snapshot = toDiagramSnapshot(draft)
    if (snapshot === lastModelSnapshotRef.current) {
      return
    }

    importingDiagramRef.current = true
    createBpmnGraphFromDraft(modeler, draft)
      .then(() => {
        lastModelSnapshotRef.current = snapshot
      })
      .catch(() => {
        setError('Failed to render BPMN graph from workflow draft')
      })
      .finally(() => {
        importingDiagramRef.current = false
      })
  }, [draft])

  const handleSelectTemplate = (templateId) => {
    setSelectedTemplateId(templateId)
    const found = templates.find((template) => template.id === templateId)
    if (found) {
      setDraft(deepClone(found) || createTemplateDraft())
      setSelectedActivityId('')
    }
  }

  const handleCreateNew = () => {
    setSelectedTemplateId('')
    setDraft(createTemplateDraft())
    setSelectedActivityId('')
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
      let bpmnXml = typeof draft.bpmnXml === 'string' ? draft.bpmnXml : ''
      const modeler = modelerRef.current
      if (modeler) {
        try {
          const result = await modeler.saveXML({ format: true })
          bpmnXml = result?.xml || bpmnXml
        } catch {
          // Keep save functional even if XML export fails unexpectedly.
        }
      }

      const payload = {
        name: draft.name.trim(),
        description: draft.description || '',
        bpmnXml,
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
    const modeler = modelerRef.current
    if (!modeler) {
      return
    }
    const elementFactory = modeler.get('elementFactory')
    const modeling = modeler.get('modeling')
    const canvas = modeler.get('canvas')
    const root = canvas.getRootElement()

    const shape = elementFactory.createShape({ type: toBpmnType(type) })
    const index = draft.activities.length
    const position = {
      x: DEFAULT_NODE_POSITION.x + index * 28,
      y: DEFAULT_NODE_POSITION.y + index * 20,
    }

    const created = modeling.createShape(shape, position, root)
    try {
      modeling.updateProperties(created, {
        id: createId(),
        name: toDefaultName(type),
      })
    } catch {
      modeling.updateProperties(created, {
        name: toDefaultName(type),
      })
    }
    modeler.get('selection').select(created)
  }

  const removeSelectedActivity = () => {
    if (!selectedActivity || selectedActivity.type === 'BEGIN' || selectedActivity.type === 'END') {
      return
    }
    const modeler = modelerRef.current
    if (!modeler) {
      return
    }
    const elementRegistry = modeler.get('elementRegistry')
    const modeling = modeler.get('modeling')
    const element = elementRegistry.get(selectedActivity.id)
    if (!element || element.waypoints) {
      return
    }
    modeling.removeElements([element])
  }

  const updateSelectedActivity = (patch) => {
    if (!selectedActivityId) return
    const modeler = modelerRef.current
    if (Object.prototype.hasOwnProperty.call(patch, 'name') && modeler) {
      const elementRegistry = modeler.get('elementRegistry')
      const modeling = modeler.get('modeling')
      const element = elementRegistry.get(selectedActivityId)
      if (element) {
        modeling.updateProperties(element, { name: patch.name || '' })
        return
      }
    }

    setDraft((prev) => {
      const nextActivities = prev.activities.map((activity) => {
        if (activity.id !== selectedActivityId) return activity
        return {
          ...activity,
          ...patch,
        }
      })
      return {
        ...prev,
        activities: nextActivities,
      }
    })
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
    const modeler = modelerRef.current
    if (Object.prototype.hasOwnProperty.call(patch, 'label') && modeler) {
      const elementRegistry = modeler.get('elementRegistry')
      const modeling = modeler.get('modeling')
      const connectionElement = elementRegistry.get(connectionId)
      if (connectionElement) {
        modeling.updateProperties(connectionElement, { name: patch.label || '' })
      }
    }

    setDraft((prev) => ({
      ...prev,
      connections: prev.connections.map((connection) => {
        if (connection.id !== connectionId) return connection
        return { ...connection, ...patch }
      }),
    }))
  }

  const removeConnection = (connectionId) => {
    const modeler = modelerRef.current
    if (!modeler) {
      return
    }
    const elementRegistry = modeler.get('elementRegistry')
    const modeling = modeler.get('modeling')
    const connectionElement = elementRegistry.get(connectionId)
    if (connectionElement?.waypoints) {
      modeling.removeConnection(connectionElement)
      return
    }

    setDraft((prev) => ({
      ...prev,
      connections: prev.connections.filter((connection) => connection.id !== connectionId),
    }))
  }

  const fitBpmnView = () => {
    const modeler = modelerRef.current
    if (!modeler) {
      return
    }
    const canvas = modeler.get('canvas')
    canvas.zoom('fit-viewport', 'auto')
  }

  const triggerBpmnImport = () => {
    bpmnImportInputRef.current?.click()
  }

  const handleExportBpmnXml = async () => {
    const modeler = modelerRef.current
    if (!modeler) {
      return
    }

    setError('')
    try {
      const result = await modeler.saveXML({ format: true })
      const xml = result?.xml || ''
      if (!xml.trim()) {
        setError('Failed to export BPMN XML: empty diagram content')
        return
      }

      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const sanitizedName = (draft.name || 'workflow-template').trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '')
      const filename = `${sanitizedName || 'workflow-template'}.bpmn`
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      setInfo(`Exported BPMN XML as ${filename}`)
    } catch {
      setError('Failed to export BPMN XML')
    }
  }

  const handleImportBpmnXml = async (event) => {
    const file = event.target.files?.[0]
    const modeler = modelerRef.current
    if (!file || !modeler) {
      return
    }

    setError('')
    setInfo('')
    try {
      const xml = await file.text()
      if (!xml.trim()) {
        setError('Selected BPMN XML file is empty')
        return
      }

      importingDiagramRef.current = true
      await modeler.importXML(xml)
      const nextDraft = extractDraftFromModeler(modeler, draft)
      const nextSnapshot = toDiagramSnapshot(nextDraft)
      lastModelSnapshotRef.current = nextSnapshot
      setDraft((prev) => ({
        ...prev,
        bpmnXml: xml,
        activities: nextDraft.activities,
        connections: nextDraft.connections,
      }))

      const selection = modeler.get('selection')
      const firstActivityId = nextDraft.activities?.[0]?.id
      if (firstActivityId) {
        const element = modeler.get('elementRegistry').get(firstActivityId)
        if (element) {
          selection.select(element)
          setSelectedActivityId(firstActivityId)
        } else {
          setSelectedActivityId('')
        }
      } else {
        setSelectedActivityId('')
      }

      fitBpmnView()
      setInfo(`Imported BPMN XML from ${file.name}`)
    } catch {
      setError('Failed to import BPMN XML file')
    } finally {
      importingDiagramRef.current = false
      event.target.value = ''
    }
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
            Build workflow templates with BPMN elements. Start from Begin and connect sequence flows until End.
          </p>
          {!canDrag && (
            <p className="details-description">
              BPMN canvas interactions are available. Use the toolbar for quick system workflow nodes.
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
                        <option value="DOCUMENT_REVIEWER">DOCUMENT_REVIEWER</option>
                        <option value="DOCUMENT_OWNER">DOCUMENT_OWNER</option>
                      </select>
                      <small>Use DOCUMENT_APPROVER or DOCUMENT_REVIEWER to bind this step to users selected during document upload.</small>
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
            <button type="button" className="ghost ghost--small" onClick={() => addActivity('BEGIN')}>+ Begin</button>
            <button type="button" className="ghost ghost--small" onClick={() => addActivity('END')}>+ End</button>
            <button type="button" className="ghost ghost--small" onClick={fitBpmnView}>Fit view</button>
            <button type="button" className="ghost ghost--small" onClick={handleExportBpmnXml}>Export BPMN XML</button>
            <button type="button" className="ghost ghost--small" onClick={triggerBpmnImport}>Import BPMN XML</button>
            <input
              ref={bpmnImportInputRef}
              type="file"
              accept=".bpmn,.xml,text/xml,application/xml"
              onChange={handleImportBpmnXml}
              style={{ display: 'none' }}
            />
            <small>Use BPMN palette and connectors directly in the canvas.</small>
          </div>

          <div className="workflow-bpmn-shell">
            <div ref={modelerCanvasRef} className="workflow-bpmn-canvas" />
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
                <select
                  value={bindingForm.category}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, category: event.target.value }))}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
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
