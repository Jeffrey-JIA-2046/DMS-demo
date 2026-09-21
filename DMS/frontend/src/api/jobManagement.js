import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

export const listJobSchedules = async () => {
  const response = await fetch(resolveApiUrl('/api/admin/job-schedules'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const updateJobSchedule = async (jobKey, payload) => {
  const response = await fetch(resolveApiUrl(`/api/admin/job-schedules/${encodeURIComponent(jobKey)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const runJobNow = async (jobKey) => {
  const response = await fetch(resolveApiUrl(`/api/admin/job-schedules/${encodeURIComponent(jobKey)}/run`), {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}
