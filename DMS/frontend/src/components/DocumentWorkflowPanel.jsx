import { useEffect, useMemo, useState } from 'react'
import { listDocumentWorkflowInstances, submitWorkflowManualDecision } from '../api/workflow'

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—')

const statusTone = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'COMPLETED':
      return 'success'
    case 'FAILED':
      return 'danger'
    default:
      return 'warning'
  }
}

const findPendingManualStep = (instance) => {
  if (!Array.isArray(instance?.steps)) {
    return null
  }
  for (let index = instance.steps.length - 1; index >= 0; index -= 1) {
    const step = instance.steps[index]
    if (step?.status === 'WAITING_MANUAL') {
      return step
    }
  }
  return null
}

export default function DocumentWorkflowPanel({ documentId, toast }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [instances, setInstances] = useState([])
  const [error, setError] = useState('')
  const [noteMap, setNoteMap] = useState({})

  const pendingCount = useMemo(() => {
    return instances.reduce((count, instance) => count + (findPendingManualStep(instance) ? 1 : 0), 0)
  }, [instances])

  const loadInstances = async () => {
    if (!documentId) return
    setLoading(true)
    setError('')
    try {
      const data = await listDocumentWorkflowInstances(documentId)
      setInstances(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Failed to load workflow instances')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    loadInstances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId])

  const handleManualDecision = async (instanceId, decision) => {
    setSaving(true)
    setError('')
    try {
      const note = noteMap[instanceId] || ''
      await submitWorkflowManualDecision(instanceId, decision, note)
      toast && toast(`Workflow manual step ${decision.toLowerCase()}d`, { type: 'success' })
      await loadInstances()
    } catch (err) {
      setError(err.message || 'Failed to process workflow decision')
      toast && toast(err.message || 'Failed to process workflow decision', { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="details-card__section workflow-inspector">
      <div className="section-header">
        <h4>Workflow</h4>
        <button type="button" className={`ghost ghost--small ${open ? 'is-active' : ''}`} onClick={() => setOpen((prev) => !prev)}>
          {open ? 'Hide workflow' : `Workflow${pendingCount ? ` (${pendingCount} pending)` : ''}`}
        </button>
      </div>

      {open && (
        <>
          {error && <p className="feedback feedback--error">{error}</p>}
          {loading && <p className="empty-state">Loading workflow steps...</p>}
          {!loading && !instances.length && <p className="empty-state">No workflow instance is linked to this document.</p>}

          {!loading && instances.map((instance) => {
            const pendingManual = findPendingManualStep(instance)
            return (
              <article key={instance.id} className="workflow-inspector__instance">
                <header className="workflow-inspector__instance-header">
                  <div>
                    <strong>{instance.templateName || 'Workflow template'}</strong>
                    <p>Instance ID: {instance.id}</p>
                  </div>
                  <span className={`badge badge--${statusTone(instance.status)}`}>{instance.status}</span>
                </header>

                <dl className="metadata metadata--compact">
                  <div>
                    <dt>Started</dt>
                    <dd>{formatDate(instance.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>Ended</dt>
                    <dd>{formatDate(instance.endedAt)}</dd>
                  </div>
                  <div>
                    <dt>Current step</dt>
                    <dd>{instance.currentActivityId || '—'}</dd>
                  </div>
                </dl>

                <div className="workflow-inspector__steps">
                  {(instance.steps || []).map((step) => (
                    <div key={step.id} className={`workflow-inspector__step workflow-inspector__step--${(step.status || '').toLowerCase()}`}>
                      <div>
                        <strong>{step.activityName}</strong>
                        <p>{step.activityType}</p>
                      </div>
                      <div>
                        <p>{step.status}</p>
                        <small>{formatDate(step.startedAt)} - {formatDate(step.finishedAt)}</small>
                      </div>
                      <div>
                        <small>{step.actor || 'system'}</small>
                        {step.note && <p>{step.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                {pendingManual && (
                  <div className="workflow-inspector__manual">
                    <p>
                      Manual step <strong>{pendingManual.activityName}</strong> is waiting for user decision.
                    </p>
                    <textarea
                      rows={2}
                      placeholder="Add optional decision note"
                      value={noteMap[instance.id] || ''}
                      onChange={(event) => setNoteMap((prev) => ({ ...prev, [instance.id]: event.target.value }))}
                    />
                    <div className="workflow-inspector__manual-actions">
                      <button type="button" className="ghost ghost--danger" disabled={saving} onClick={() => handleManualDecision(instance.id, 'REJECT')}>
                        Reject
                      </button>
                      <button type="button" className="primary" disabled={saving} onClick={() => handleManualDecision(instance.id, 'APPROVE')}>
                        Approve
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </>
      )}
    </div>
  )
}
