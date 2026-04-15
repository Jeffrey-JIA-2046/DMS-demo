import { resolveApiUrl, handleJsonResponse } from './httpClient'

export const authHeader = (token) => (token ? { Authorization: `Basic ${token}` } : {})

export const listFolders = async (token) => {
  const response = await fetch(resolveApiUrl('/api/folders/tree'), {
    headers: { ...authHeader(token) },
  })
  return handleJsonResponse(response)
}

export const listDocuments = async (token, { page = 0, size = 20, folderId, query } = {}) => {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (folderId) params.set('folderId', String(folderId))
  if (query) params.set('q', query)

  const response = await fetch(resolveApiUrl(`/api/documents?${params.toString()}`), {
    headers: { ...authHeader(token) },
  })
  return handleJsonResponse(response)
}

export const fetchDocument = async (token, id) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${id}`), {
    headers: { ...authHeader(token) },
  })
  return handleJsonResponse(response)
}

export const listApproverOptions = async (token) => {
  const response = await fetch(resolveApiUrl('/api/documents/approvers'), {
    headers: { ...authHeader(token) },
  })
  return handleJsonResponse(response)
}

export const approveDocument = async (token, documentId, payload = {}) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/approval/approve`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const rejectDocument = async (token, documentId, payload = {}) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/approval/reject`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const delegateApproval = async (token, documentId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/approval/delegate`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const buildOnlineViewUrl = (documentId) => resolveApiUrl(`/api/documents/${documentId}/download`)

export const uploadDocument = async (token, { file, metadata }) => {
  const formData = new FormData()
  formData.append('metadata', JSON.stringify(metadata))
  formData.append('file', {
    uri: file.uri,
    name: file.name || 'upload.bin',
    type: file.mimeType || 'application/octet-stream',
  })

  const response = await fetch(resolveApiUrl('/api/documents'), {
    method: 'POST',
    headers: {
      ...authHeader(token),
    },
    body: formData,
  })
  return handleJsonResponse(response)
}
