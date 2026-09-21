import { authHeaders, handleJsonResponse, resolveApiUrl } from './httpClient'

export const listWorkflowTemplates = async () => {
  const response = await fetch(resolveApiUrl('/api/workflows/templates'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const createWorkflowTemplate = async (payload) => {
  const response = await fetch(resolveApiUrl('/api/workflows/templates'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const updateWorkflowTemplate = async (id, payload) => {
  const response = await fetch(resolveApiUrl(`/api/workflows/templates/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const publishWorkflowTemplate = async (id) => {
  const response = await fetch(resolveApiUrl(`/api/workflows/templates/${id}/publish`), {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const branchWorkflowTemplate = async (id) => {
  const response = await fetch(resolveApiUrl(`/api/workflows/templates/${id}/branch`), {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const listWorkflowCategories = async () => {
  const response = await fetch(resolveApiUrl('/api/workflows/categories'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const listWorkflowBindings = async () => {
  const response = await fetch(resolveApiUrl('/api/workflows/bindings'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const upsertWorkflowBinding = async (payload) => {
  const response = await fetch(resolveApiUrl('/api/workflows/bindings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const deleteWorkflowBinding = async (id) => {
  const response = await fetch(resolveApiUrl(`/api/workflows/bindings/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const listAutoActivities = async () => {
  const response = await fetch(resolveApiUrl('/api/workflows/auto-activities'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const listDocumentWorkflowInstances = async (documentId) => {
  const response = await fetch(resolveApiUrl(`/api/workflows/documents/${documentId}/instances`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const submitWorkflowManualDecision = async (instanceId, decision, note = '') => {
  const response = await fetch(resolveApiUrl(`/api/workflows/instances/${instanceId}/manual-decision`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ decision, note }),
  })
  return handleJsonResponse(response)
}
