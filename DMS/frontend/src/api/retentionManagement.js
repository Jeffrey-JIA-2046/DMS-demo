import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

export const listRetentionRules = async () => {
  const response = await fetch(resolveApiUrl('/api/admin/retention-rules'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const listRetentionCategories = async () => {
  const response = await fetch(resolveApiUrl('/api/admin/retention-rules/categories'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const createRetentionRule = async (payload) => {
  const response = await fetch(resolveApiUrl('/api/admin/retention-rules'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const updateRetentionRule = async (id, payload) => {
  const response = await fetch(resolveApiUrl(`/api/admin/retention-rules/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const deleteRetentionRule = async (id) => {
  const response = await fetch(resolveApiUrl(`/api/admin/retention-rules/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const runRetentionSweep = async () => {
  const response = await fetch(resolveApiUrl('/api/admin/retention-rules/sweep'), {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const listReminderRules = async () => {
  const response = await fetch(resolveApiUrl('/api/admin/reminder-rules'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const createReminderRule = async (payload) => {
  const response = await fetch(resolveApiUrl('/api/admin/reminder-rules'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const deleteReminderRule = async (id) => {
  const response = await fetch(resolveApiUrl(`/api/admin/reminder-rules/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const runReminderSweep = async () => {
  const response = await fetch(resolveApiUrl('/api/admin/reminder-rules/sweep'), {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}
