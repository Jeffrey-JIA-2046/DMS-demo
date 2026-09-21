import { useCallback, useEffect, useState } from 'react'
import { listJobSchedules, runJobNow, updateJobSchedule } from '../api/jobManagement'

const WEEKDAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

const SCHEDULE_TYPE_OPTIONS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom cron' },
]

const formatDateTime = (value) => {
  if (!value) return 'Never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Never'
  return parsed.toLocaleString()
}

const toTwoDigits = (value) => String(value).padStart(2, '0')

const normalizeCronDraft = (cronExpression = '') => {
  const raw = (cronExpression || '').trim()
  const parts = raw.split(/\s+/)
  if (parts.length !== 6) {
    return {
      scheduleType: 'custom',
      minute: '0',
      hour: '2',
      dayOfWeek: '1',
      dayOfMonth: '1',
      customCron: raw,
    }
  }

  const [sec, min, hour, dom, mon, dow] = parts
  const minute = /^\d+$/.test(min) ? min : '0'
  const hourValue = /^\d+$/.test(hour) ? hour : '2'
  const dayOfMonth = /^\d+$/.test(dom) ? dom : '1'
  const dayOfWeek = /^\d+$/.test(dow) ? dow : '1'

  if (sec === '0' && mon === '*' && dom === '*' && dow === '*' && hour === '*') {
    return { scheduleType: 'hourly', minute, hour: hourValue, dayOfWeek, dayOfMonth, customCron: raw }
  }
  if (sec === '0' && mon === '*' && dom === '*' && dow === '*' && /^\d+$/.test(hour)) {
    return { scheduleType: 'daily', minute, hour: hourValue, dayOfWeek, dayOfMonth, customCron: raw }
  }
  if (sec === '0' && mon === '*' && dom === '*' && /^\d+$/.test(hour) && /^\d+$/.test(dow)) {
    return { scheduleType: 'weekly', minute, hour: hourValue, dayOfWeek, dayOfMonth, customCron: raw }
  }
  if (sec === '0' && mon === '*' && /^\d+$/.test(dom) && /^\d+$/.test(hour) && dow === '*') {
    return { scheduleType: 'monthly', minute, hour: hourValue, dayOfWeek, dayOfMonth, customCron: raw }
  }

  return {
    scheduleType: 'custom',
    minute,
    hour: hourValue,
    dayOfWeek,
    dayOfMonth,
    customCron: raw,
  }
}

const buildCronExpression = (draft) => {
  const minute = Math.min(59, Math.max(0, Number(draft.minute ?? 0)))
  const hour = Math.min(23, Math.max(0, Number(draft.hour ?? 0)))
  const dayOfMonth = Math.min(31, Math.max(1, Number(draft.dayOfMonth ?? 1)))
  const dayOfWeek = Math.min(6, Math.max(0, Number(draft.dayOfWeek ?? 1)))

  switch (draft.scheduleType) {
    case 'hourly':
      return `0 ${minute} * * * *`
    case 'daily':
      return `0 ${minute} ${hour} * * *`
    case 'weekly':
      return `0 ${minute} ${hour} * * ${dayOfWeek}`
    case 'monthly':
      return `0 ${minute} ${hour} ${dayOfMonth} * *`
    case 'custom':
    default:
      return (draft.customCron || '').trim()
  }
}

const scheduleSummary = (draft) => {
  const minute = toTwoDigits(Math.min(59, Math.max(0, Number(draft.minute ?? 0))))
  const hour = toTwoDigits(Math.min(23, Math.max(0, Number(draft.hour ?? 0))))
  const dayName = WEEKDAY_OPTIONS.find((opt) => opt.value === String(draft.dayOfWeek))?.label ?? 'Monday'

  switch (draft.scheduleType) {
    case 'hourly':
      return `Runs every hour at minute ${minute}`
    case 'daily':
      return `Runs every day at ${hour}:${minute}`
    case 'weekly':
      return `Runs every ${dayName} at ${hour}:${minute}`
    case 'monthly':
      return `Runs on day ${draft.dayOfMonth} of each month at ${hour}:${minute}`
    case 'custom':
    default:
      return 'Runs using custom cron expression'
  }
}

export default function JobManagement() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [drafts, setDrafts] = useState({})

  const loadJobs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listJobSchedules()
      const rows = Array.isArray(data) ? data : []
      setJobs(rows)
      setDrafts(
        Object.fromEntries(
          rows.map((job) => [
            job.jobKey,
            {
              ...normalizeCronDraft(job.cronExpression),
              enabled: Boolean(job.enabled),
            },
          ])
        )
      )
    } catch (err) {
      setError(err.message || 'Failed to load job schedules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  const updateDraft = (jobKey, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [jobKey]: { ...(prev[jobKey] || {}), ...patch },
    }))
  }

  const handleSave = async (jobKey) => {
    const draft = drafts[jobKey] || {}
    const cronExpression = buildCronExpression(draft)
    if (!cronExpression) {
      setError('Cron expression is required')
      return
    }

    setSavingKey(jobKey)
    setError('')
    setInfo('')
    try {
      await updateJobSchedule(jobKey, {
        cronExpression,
        enabled: Boolean(draft.enabled),
      })
      setInfo('Job schedule updated')
      await loadJobs()
    } catch (err) {
      setError(err.message || 'Failed to update job schedule')
    } finally {
      setSavingKey('')
    }
  }

  const handleRunNow = async (jobKey) => {
    setSavingKey(jobKey)
    setError('')
    setInfo('')
    try {
      await runJobNow(jobKey)
      setInfo('Job executed successfully')
      await loadJobs()
    } catch (err) {
      setError(err.message || 'Failed to run job')
    } finally {
      setSavingKey('')
    }
  }

  return (
    <section className="card retention">
      <div className="list-card__header">
        <div>
          <p className="eyebrow">System administration</p>
          <h3>Job Management</h3>
          <p className="details-description">Configure job schedules and run system jobs such as reminder and retention sweeps.</p>
        </div>
      </div>

      {error && <p className="feedback feedback--error">{error}</p>}
      {info && <p className="feedback">{info}</p>}

      <div className="retention__rules">
        {loading && <p className="empty-state">Loading jobs...</p>}
        {!loading && jobs.length === 0 && <p className="empty-state">No jobs found.</p>}
        {!loading && jobs.map((job) => {
          const draft = drafts[job.jobKey] || { ...normalizeCronDraft(job.cronExpression), enabled: job.enabled }
          const isSaving = savingKey === job.jobKey
          const renderedCron = buildCronExpression(draft)
          return (
            <article key={job.jobKey} className="retention__rule" style={{ display: 'block' }}>
              <div style={{ marginBottom: 8 }}>
                <strong>{job.jobName}</strong>
                <p style={{ margin: '4px 0' }}>Key: {job.jobKey}</p>
                <p style={{ margin: '4px 0' }}>Last run: {formatDateTime(job.lastRunAt)}</p>
                <p style={{ margin: '4px 0' }}>Last status: {job.lastStatus || 'N/A'}</p>
                <p style={{ margin: '4px 0' }}><strong>Schedule:</strong> {scheduleSummary(draft)}</p>
                <p style={{ margin: '4px 0' }}><small>Cron: {renderedCron || '(invalid)'}</small></p>
                {job.lastMessage && <p style={{ margin: '4px 0' }}>Message: {job.lastMessage}</p>}
              </div>

              <div className="retention__form" style={{ alignItems: 'flex-end' }}>
                <label>
                  <span>Frequency</span>
                  <select
                    value={draft.scheduleType || 'daily'}
                    onChange={(e) => updateDraft(job.jobKey, { scheduleType: e.target.value })}
                    disabled={isSaving}
                  >
                    {SCHEDULE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                {draft.scheduleType === 'hourly' && (
                  <label>
                    <span>Minute</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={draft.minute ?? 0}
                      onChange={(e) => updateDraft(job.jobKey, { minute: e.target.value })}
                      disabled={isSaving}
                    />
                  </label>
                )}

                {(draft.scheduleType === 'daily' || draft.scheduleType === 'weekly' || draft.scheduleType === 'monthly') && (
                  <>
                    <label>
                      <span>Hour (24h)</span>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={draft.hour ?? 2}
                        onChange={(e) => updateDraft(job.jobKey, { hour: e.target.value })}
                        disabled={isSaving}
                      />
                    </label>
                    <label>
                      <span>Minute</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        value={draft.minute ?? 0}
                        onChange={(e) => updateDraft(job.jobKey, { minute: e.target.value })}
                        disabled={isSaving}
                      />
                    </label>
                  </>
                )}

                {draft.scheduleType === 'weekly' && (
                  <label>
                    <span>Day of week</span>
                    <select
                      value={draft.dayOfWeek ?? '1'}
                      onChange={(e) => updateDraft(job.jobKey, { dayOfWeek: e.target.value })}
                      disabled={isSaving}
                    >
                      {WEEKDAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                )}

                {draft.scheduleType === 'monthly' && (
                  <label>
                    <span>Day of month</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={draft.dayOfMonth ?? 1}
                      onChange={(e) => updateDraft(job.jobKey, { dayOfMonth: e.target.value })}
                      disabled={isSaving}
                    />
                  </label>
                )}

                {draft.scheduleType === 'custom' && (
                  <label style={{ minWidth: 320 }}>
                    <span>Custom cron</span>
                    <input
                      value={draft.customCron || ''}
                      onChange={(e) => updateDraft(job.jobKey, { customCron: e.target.value })}
                      placeholder="0 0 2 * * *"
                      disabled={isSaving}
                    />
                  </label>
                )}

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.enabled)}
                    onChange={(e) => updateDraft(job.jobKey, { enabled: e.target.checked })}
                    disabled={isSaving}
                  />
                  <span>Enabled</span>
                </label>
                <button type="button" className="primary" onClick={() => handleSave(job.jobKey)} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save schedule'}
                </button>
                <button type="button" className="ghost" onClick={() => handleRunNow(job.jobKey)} disabled={isSaving}>
                  Run now
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
