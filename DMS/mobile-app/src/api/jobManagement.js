import { fetchJson } from './httpClient'

export const listJobSchedules = async () => fetchJson('/api/admin/job-schedules')
export const updateJobSchedule = async (jobKey, payload) => fetchJson(`/api/admin/job-schedules/${encodeURIComponent(jobKey)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const runJobNow = async (jobKey) => fetchJson(`/api/admin/job-schedules/${encodeURIComponent(jobKey)}/run`, { method: 'POST' })
