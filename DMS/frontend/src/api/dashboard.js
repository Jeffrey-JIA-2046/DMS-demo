import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

export const fetchMyDashboardTasks = async () => {
  const response = await fetch(resolveApiUrl('/api/dashboard/my-tasks'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const approveRetentionTask = async (taskId, payload = {}) => {
  const response = await fetch(resolveApiUrl(`/api/dashboard/tasks/${taskId}/retention/approve`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const rejectRetentionTask = async (taskId, payload = {}) => {
  const response = await fetch(resolveApiUrl(`/api/dashboard/tasks/${taskId}/retention/reject`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const delegateRetentionTask = async (taskId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/dashboard/tasks/${taskId}/retention/delegate`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const addFavorite = async ({ targetType, targetId }) => {
  const response = await fetch(resolveApiUrl('/api/dashboard/favorites'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ targetType, targetId }),
  })
  return handleJsonResponse(response)
}

export const removeFavorite = async ({ targetType, targetId }) => {
  const params = new URLSearchParams({ targetType, targetId })
  const response = await fetch(resolveApiUrl(`/api/dashboard/favorites?${params.toString()}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}
