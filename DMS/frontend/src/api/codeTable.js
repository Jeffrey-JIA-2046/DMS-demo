import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

export const listTableCodes = async () => {
  const response = await fetch(resolveApiUrl('/api/admin/code-tables'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const listCodeTableItems = async (tableCode) => {
  const response = await fetch(resolveApiUrl(`/api/admin/code-tables/${encodeURIComponent(tableCode)}`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const createCodeTableItem = async (tableCode, payload) => {
  const response = await fetch(resolveApiUrl(`/api/admin/code-tables/${encodeURIComponent(tableCode)}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const updateCodeTableItem = async (tableCode, id, payload) => {
  const response = await fetch(resolveApiUrl(`/api/admin/code-tables/${encodeURIComponent(tableCode)}/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const deleteCodeTableItem = async (tableCode, id) => {
  const response = await fetch(resolveApiUrl(`/api/admin/code-tables/${encodeURIComponent(tableCode)}/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

// Public endpoint — fetches only active items (no admin auth required)
export const fetchActiveCodeTableItems = async (tableCode) => {
  const response = await fetch(resolveApiUrl(`/api/code-tables/${encodeURIComponent(tableCode)}`))
  return handleJsonResponse(response)
}
