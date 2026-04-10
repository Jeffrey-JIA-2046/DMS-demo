import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { fetchMyDashboardTasks, approveRetentionTask, rejectRetentionTask, delegateRetentionTask } from '../api/dashboard'
import { fetchDocument, approveDocument, rejectDocument, delegateApproval, buildDownloadUrl } from '../api/documents'
import DocumentDetails from './DocumentDetails'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

const PRIORITY_WEIGHT = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 }
const TODO_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'BLOCKED'])
const WORKFLOW_TYPES = new Set(['WORKFLOW', 'APPROVAL', 'REJECTION', 'RETENTION'])
const LAST_LOGOUT_KEY = 'dms_last_logout_at'
const REMINDER_TYPE = 'REMINDER'
const RETENTION_TYPE = 'RETENTION'

const isoFromDate = (date) => {
  const clone = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  return clone.toISOString().slice(0, 10)
}

const startOfWeek = (date) => {
  const reference = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = reference.getDay()
  const offset = (day + 6) % 7
  reference.setDate(reference.getDate() - offset)
  return reference
}

const endOfWeek = (date) => {
  const reference = startOfWeek(date)
  reference.setDate(reference.getDate() + 6)
  return reference
}

const addDays = (date, amount) => {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

const monthAnchor = (date) => new Date(date.getFullYear(), date.getMonth(), 1)

const buildCalendarMatrix = (anchorDate, tasksByDate) => {
  const firstOfMonth = monthAnchor(anchorDate)
  const calendarStart = startOfWeek(firstOfMonth)
  const calendarEnd = endOfWeek(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0))
  const todayIso = isoFromDate(new Date())

  const days = []
  for (let cursor = new Date(calendarStart); cursor <= calendarEnd; cursor = addDays(cursor, 1)) {
    const iso = isoFromDate(cursor)
    days.push({
      key: iso,
      date: new Date(cursor),
      isCurrentMonth: cursor.getMonth() === anchorDate.getMonth(),
      isToday: iso === todayIso,
      tasks: tasksByDate.get(iso) ?? [],
    })
  }

  const matrix = []
  for (let i = 0; i < days.length; i += 7) {
    matrix.push(days.slice(i, i + 7))
  }
  return matrix
}

const priorityRank = (priority) => PRIORITY_WEIGHT[priority] ?? 0

const formatDueDate = (isoDate) => {
  if (!isoDate) return 'No due date'
  const date = new Date(`${isoDate}T00:00:00`)
  return DATE_FORMATTER.format(date)
}

const formatTimestamp = (isoInstant) => {
  if (!isoInstant) return 'Not synced yet'
  const instant = new Date(isoInstant)
  return `${DATE_FORMATTER.format(instant)} · ${TIME_FORMATTER.format(instant)}`
}

const parseIso = (value) => {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

export default function UserDashboard() {
  // Fast-refresh probe: add a lightweight debug log to detect HMR without full reload
  console.debug('UserDashboard render — fast-refresh probe', new Date().toISOString())
  const { isAuthenticated, currentUser } = useContext(AuthContext)
  const [tasks, setTasks] = useState([])
  const [generatedAt, setGeneratedAt] = useState(null)
  const [activeMonth, setActiveMonth] = useState(() => monthAnchor(new Date()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTask, setReviewTask] = useState(null)
  const [reviewDocument, setReviewDocument] = useState(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)

  const loadTasks = useCallback(async () => {
    if (!isAuthenticated) {
      setTasks([])
      setGeneratedAt(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetchMyDashboardTasks()
      setTasks(Array.isArray(response?.tasks) ? response.tasks : [])
      setGeneratedAt(response?.generatedAt ?? null)
    } catch (err) {
      setError(err.message || 'Unable to load dashboard tasks')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const tasksByDate = useMemo(() => {
    const map = new Map()
    tasks.forEach((task) => {
      if (!task?.dueDate) {
        return
      }
      const bucket = map.get(task.dueDate) ?? []
      bucket.push(task)
      map.set(task.dueDate, bucket)
    })
    map.forEach((bucket) => bucket.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority)))
    return map
  }, [tasks])

  const calendarWeeks = useMemo(
    () => buildCalendarMatrix(activeMonth, tasksByDate),
    [activeMonth, tasksByDate]
  )

  const workflowTodos = useMemo(() => {
    return tasks
      .filter((task) => WORKFLOW_TYPES.has(task.taskType) && TODO_STATUSES.has(task.status))
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return new Date(`${a.dueDate}T00:00:00`) - new Date(`${b.dueDate}T00:00:00`)
        }
        if (a.dueDate) return -1
        if (b.dueDate) return 1
        return priorityRank(b.priority) - priorityRank(a.priority)
      })
  }, [tasks])

  const reminderTodos = useMemo(() => {
    return tasks
      .filter((task) => task.taskType === REMINDER_TYPE && TODO_STATUSES.has(task.status))
      .sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return new Date(`${a.dueDate}T00:00:00`) - new Date(`${b.dueDate}T00:00:00`)
        }
        if (a.dueDate) return -1
        if (b.dueDate) return 1
        return 0
      })
  }, [tasks])

  const dashboardKpis = useMemo(() => {
    const storedLastLogout = typeof window !== 'undefined' ? window.localStorage.getItem(LAST_LOGOUT_KEY) : null
    const lastLogoutMs = parseIso(storedLastLogout)
    const now = Date.now()
    const sinceBoundary = lastLogoutMs ?? (now - (24 * 60 * 60 * 1000))
    const upcomingBoundary = now + (7 * 24 * 60 * 60 * 1000)

    const pendingTasks = tasks.filter((task) => TODO_STATUSES.has(task.status)).length
    const newTasks = tasks.filter((task) => {
      const created = parseIso(task.createdAt)
      return created != null && created >= sinceBoundary
    }).length
    const newDocuments = new Set(
      tasks
        .filter((task) => {
          if (!task.documentId) return false
          if (task.taskType !== 'WORKFLOW') return false
          const created = parseIso(task.createdAt)
          return created != null && created >= sinceBoundary
        })
        .map((task) => task.documentId)
    ).size
    const upcomingReminders = tasks.filter((task) => {
      if (task.taskType !== REMINDER_TYPE || !TODO_STATUSES.has(task.status) || !task.dueDate) return false
      const dueMs = Date.parse(`${task.dueDate}T00:00:00`)
      return !Number.isNaN(dueMs) && dueMs >= now && dueMs <= upcomingBoundary
    }).length

    const items = [
      { key: 'newTasks', label: 'New Tasks since last logout', value: newTasks, tone: 'sky' },
      { key: 'pending', label: 'Remain Pending Tasks', value: pendingTasks, tone: 'amber' },
      { key: 'newDocs', label: 'New Documents Uploaded', value: newDocuments, tone: 'teal' },
      { key: 'reminders', label: 'Upcoming Reminders', value: upcomingReminders, tone: 'rose' },
    ]
    const maxValue = Math.max(1, ...items.map((item) => item.value))
    return {
      items: items.map((item) => ({
        ...item,
        widthPct: Math.max(8, Math.round((item.value / maxValue) * 100)),
      })),
      sinceText: lastLogoutMs != null ? `Since ${formatTimestamp(new Date(lastLogoutMs).toISOString())}` : 'Since your last day',
    }
  }, [tasks])

  const handleMonthChange = (offset) => {
    setActiveMonth((prev) => {
      const next = new Date(prev)
      next.setMonth(next.getMonth() + offset)
      return monthAnchor(next)
    })
  }

  const closeReview = () => {
    setReviewOpen(false)
    setReviewTask(null)
    setReviewDocument(null)
    setReviewError('')
    setReviewLoading(false)
    setReviewBusy(false)
  }

  const openReview = async (task) => {
    if (!task?.documentId) {
      return
    }
    setReviewOpen(true)
    setReviewTask(task)
    setReviewDocument(null)
    setReviewError('')
    setReviewLoading(true)
    try {
      const detail = await fetchDocument(task.documentId)
      setReviewDocument(detail)
    } catch (err) {
      setReviewError(err.message || 'Unable to load document details')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleDecision = async (documentId, decision, action) => {
    if (!documentId) return
    setReviewBusy(true)
    setReviewError('')
    try {
      const payload = typeof decision === 'string'
        ? (decision && decision.trim().length ? { note: decision.trim() } : {})
        : { ...(decision || {}) }
      const isRetentionTask = reviewTask?.taskType === RETENTION_TYPE
      const updated = isRetentionTask
        ? (action === 'approve'
            ? await approveRetentionTask(reviewTask.id, payload)
            : await rejectRetentionTask(reviewTask.id, payload))
        : (action === 'approve'
            ? await approveDocument(documentId, payload)
            : await rejectDocument(documentId, payload))
      setReviewDocument(updated)
      await loadTasks()
      closeReview()
    } catch (err) {
      setReviewError(err.message || 'Unable to save approval decision')
    } finally {
      setReviewBusy(false)
    }
  }

  const handleDelegate = async (documentId, approverId, note) => {
    if (!documentId || !approverId) return
    setReviewBusy(true)
    setReviewError('')
    try {
      const payload = {
        approverId,
        ...(note && note.trim().length ? { note: note.trim() } : {}),
      }
      const isRetentionTask = reviewTask?.taskType === RETENTION_TYPE
      const updated = isRetentionTask
        ? await delegateRetentionTask(reviewTask.id, payload)
        : await delegateApproval(documentId, payload)
      setReviewDocument(updated)
      await loadTasks()
      closeReview()
    } catch (err) {
      setReviewError(err.message || 'Unable to delegate approval')
    } finally {
      setReviewBusy(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <section className="dashboard card">
        <div className="dashboard__empty">
          <p className="eyebrow">Dashboard</p>
          <h2>Sign in to personalize your tasks</h2>
          <p>You need to log in to view workflow assignments and calendar obligations.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="dashboard card">
      <header className="dashboard__header">
        <div>
          <p className="eyebrow">My dashboard</p>
          <h2>Welcome back, {currentUser?.displayName || currentUser?.username || 'there'}.</h2>
          <p>Track workflow approvals, reviews, and upcoming work without leaving the workspace.</p>
        </div>
        <div className="dashboard__header-meta">
          <span className="dashboard__synced">Last synced · {formatTimestamp(generatedAt)}</span>
          <button className="ghost ghost--small" onClick={loadTasks} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="feedback feedback--error">{error}</div>
      )}

      <section className="dashboard-panel dashboard-panel--kpis">
        <div className="dashboard-panel__header">
          <div>
            <p className="eyebrow">Graphic Summary</p>
            <h3>Task and document pulse</h3>
          </div>
          <span className="dashboard__synced">{dashboardKpis.sinceText}</span>
        </div>
        <div className="dashboard-kpi-grid">
          {dashboardKpis.items.map((metric) => (
            <article key={metric.key} className={`dashboard-kpi dashboard-kpi--${metric.tone}`}>
              <p className="dashboard-kpi__label">{metric.label}</p>
              <div className="dashboard-kpi__value-row">
                <strong className="dashboard-kpi__value">{metric.value}</strong>
              </div>
              <div className="dashboard-kpi__track" role="img" aria-label={`${metric.label}: ${metric.value}`}>
                <span className="dashboard-kpi__bar" style={{ width: `${metric.widthPct}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard__grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="eyebrow">Calendar</p>
              <h3>{MONTH_FORMATTER.format(activeMonth)}</h3>
            </div>
            <div className="dashboard__calendar-controls">
              <button className="ghost ghost--small" onClick={() => handleMonthChange(-1)} disabled={loading}>
                ← Prev
              </button>
              <button className="ghost ghost--small" onClick={() => setActiveMonth(monthAnchor(new Date()))} disabled={loading}>
                Today
              </button>
              <button className="ghost ghost--small" onClick={() => handleMonthChange(1)} disabled={loading}>
                Next →
              </button>
            </div>
          </div>
          <div className="dashboard__calendar">
            <div className="dashboard__weekday-row">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label} className="dashboard__weekday">
                  {label}
                </span>
              ))}
            </div>
            <div className="dashboard__calendar-weeks">
              {calendarWeeks.map((week, weekIndex) => (
                <div key={`week-${weekIndex}`} className="dashboard__week">
                  {week.map((day) => (
                    <div
                      key={day.key}
                      className={`dashboard__day ${day.isCurrentMonth ? '' : 'dashboard__day--muted'} ${day.isToday ? 'dashboard__day--today' : ''}`.trim()}
                    >
                      <div className="dashboard__day-header">
                        <span>{day.date.getDate()}</span>
                        {day.tasks.length > 0 && (
                          <span className="dashboard__task-count">{day.tasks.length}</span>
                        )}
                      </div>
                      <div className="dashboard__day-tasks">
                        {day.tasks.slice(0, 3).map((task) => (
                          <span
                            key={`${day.key}-${task.id}`}
                            className={`dashboard__task-pill status-${task.status?.toLowerCase() || 'pending'}`}
                          >
                            {task.title}
                          </span>
                        ))}
                        {day.tasks.length > 3 && (
                          <small className="dashboard__more">+{day.tasks.length - 3} more</small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="eyebrow">Workflow queue</p>
              <h3>Pending tasks</h3>
            </div>
            <span className="dashboard__todo-count">{workflowTodos.length}</span>
          </div>
          {loading && workflowTodos.length === 0 ? (
            <p className="dashboard__empty">Loading your tasks…</p>
          ) : workflowTodos.length === 0 ? (
            <div className="dashboard__empty">
              <h4>You're caught up 🎉</h4>
              <p>No pending workflow tasks at the moment.</p>
            </div>
          ) : (
            <ul className="dashboard__todo-list">
              {workflowTodos.map((task) => (
                <li key={task.id} className="dashboard__todo-item">
                  <div>
                    <p className="dashboard__todo-title">{task.title}</p>
                    <small className="dashboard__todo-step">{task.workflowStep || task.documentTitle || 'Workflow task'}</small>
                  </div>
                  <div className="dashboard__todo-meta">
                    <span className="dashboard__due-date">{formatDueDate(task.dueDate)}</span>
                    <span className={`dashboard__status-dot status-${task.status?.toLowerCase() || 'pending'}`}>
                      {task.status?.replace('_', ' ').toLowerCase()}
                    </span>
                    {task.documentId && (
                      <button
                        type="button"
                        className="ghost ghost--small"
                        onClick={() => openReview(task)}
                      >
                        Review
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <p className="eyebrow">Reminders</p>
              <h3>Upcoming document reminders</h3>
            </div>
            <span className="dashboard__todo-count">{reminderTodos.length}</span>
          </div>
          {loading && reminderTodos.length === 0 ? (
            <p className="dashboard__empty">Loading reminders…</p>
          ) : reminderTodos.length === 0 ? (
            <div className="dashboard__empty">
              <h4>No reminders</h4>
              <p>No pending document reminders. Reminder rules can be configured in admin settings.</p>
            </div>
          ) : (
            <ul className="dashboard__todo-list">
              {reminderTodos.map((task) => (
                <li key={task.id} className="dashboard__todo-item">
                  <div>
                    <p className="dashboard__todo-title">{task.title}</p>
                    <small className="dashboard__todo-step">{task.documentTitle || task.workflowStep || 'Document reminder'}</small>
                  </div>
                  <div className="dashboard__todo-meta">
                    <span className="dashboard__due-date">{formatDueDate(task.dueDate)}</span>
                    <span className={`dashboard__status-dot status-${task.status?.toLowerCase() || 'pending'}`}>
                      {task.status?.replace('_', ' ').toLowerCase()}
                    </span>
                    {task.documentId && (
                      <button
                        type="button"
                        className="ghost ghost--small"
                        onClick={() => openReview(task)}
                      >
                        View
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {reviewOpen && (
        <div className="document-viewer-modal" role="dialog" aria-modal="true">
          <div className="document-viewer-modal__backdrop" onClick={closeReview} />
          <div className="document-viewer-modal__content">
            <div className="document-viewer-modal__header">
              <div>
                <p className="eyebrow">Pending approval</p>
                <h3>{reviewTask?.documentTitle || reviewDocument?.title || 'Document review'}</h3>
              </div>
              <button type="button" className="ghost" onClick={closeReview}>
                Close
              </button>
            </div>
            {reviewLoading && <span className="pill pill--info">Loading document…</span>}
            {reviewError && <p className="feedback feedback--error">{reviewError}</p>}
            {!reviewLoading && !reviewError && reviewDocument && (
              <DocumentDetails
                document={reviewDocument}
                taskContext={reviewTask}
                onApprove={(id, payload) => handleDecision(id, payload, 'approve')}
                onReject={(id, note) => handleDecision(id, note, 'reject')}
                onDelegate={handleDelegate}
                busy={reviewBusy}
                downloadUrlBuilder={buildDownloadUrl}
                initialTab="details"
              />
            )}
          </div>
        </div>
      )}
    </section>
  )
}
