import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

export const listEformDefinitions = async () => {
  const response = await fetch(resolveApiUrl('/api/admin/eforms'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const getEformDefinitionAdmin = async (categoryCode) => {
  const response = await fetch(resolveApiUrl(`/api/admin/eforms/${encodeURIComponent(categoryCode)}`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const upsertEformDefinition = async (categoryCode, payload) => {
  const response = await fetch(resolveApiUrl(`/api/admin/eforms/${encodeURIComponent(categoryCode)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const deleteEformDefinition = async (categoryCode) => {
  const response = await fetch(resolveApiUrl(`/api/admin/eforms/${encodeURIComponent(categoryCode)}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const getEformDefinition = async (categoryCode) => {
  const response = await fetch(resolveApiUrl(`/api/eforms/${encodeURIComponent(categoryCode)}`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}
