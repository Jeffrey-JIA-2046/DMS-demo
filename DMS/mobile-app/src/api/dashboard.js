import { resolveApiUrl, handleJsonResponse } from './httpClient'
import { authHeader } from './documents'

export const fetchMyDashboardTasks = async (token) => {
  const response = await fetch(resolveApiUrl('/api/dashboard/my-tasks'), {
    headers: { ...authHeader(token) },
  })
  return handleJsonResponse(response)
}

export const approveRetentionTask = async (token, taskId, payload = {}) => {
  const response = await fetch(resolveApiUrl(`/api/dashboard/tasks/${taskId}/retention/approve`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const rejectRetentionTask = async (token, taskId, payload = {}) => {
  const response = await fetch(resolveApiUrl(`/api/dashboard/tasks/${taskId}/retention/reject`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const delegateRetentionTask = async (token, taskId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/dashboard/tasks/${taskId}/retention/delegate`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}
