import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

const UPLOAD_AI_API_BASE_URL = (import.meta.env.VITE_UPLOAD_AI_API_BASE_URL ?? 'http://localhost:5201').replace(/\/$/, '')

export const listDocuments = async ({ page = 0, size = 12, filters = {} }) => {
  const params = new URLSearchParams({ page, size })
  if (filters.query) params.set('q', filters.query)
  if (filters.searchOperator) params.set('searchOperator', filters.searchOperator)
  if (Array.isArray(filters.searchColumns) && filters.searchColumns.length) {
    filters.searchColumns.forEach((column) => {
      if (column) {
        params.append('searchColumns', column)
      }
    })
  }
  if (filters.owner) params.set('owner', filters.owner)
  if (filters.category) params.set('category', filters.category)
  if (filters.status && filters.status !== 'ALL') params.set('status', filters.status)
  if (filters.folderId) params.set('folderId', filters.folderId)
  if (filters.conditionOperator) params.set('conditionOperator', filters.conditionOperator)
  if (Array.isArray(filters.conditions) && filters.conditions.length) {
    filters.conditions.forEach((condition) => {
      params.append('conditionField', condition?.field || '')
      params.append('conditionValue', condition?.value || '')
      params.append('conditionOp', condition?.operator || 'contains')
      params.append('conditionGroup', String(Number.isFinite(Number(condition?.group)) ? Number(condition.group) : 0))
      params.append('conditionJoin', condition?.join || '')
    })
  }
  if (filters.tags && filters.tags.length) {
    filters.tags.forEach((tag) => params.append('tags', tag))
  }
  // Optional sorting: expect a string like 'field,asc' or 'field,desc'
  if (filters.sort) params.set('sort', filters.sort)

  const response = await fetch(resolveApiUrl(`/api/documents?${params.toString()}`), { headers: { ...authHeaders() } })
  return handleJsonResponse(response)
}

export const listFolderTree = async () => {
  const response = await fetch(resolveApiUrl('/api/folders/tree'), { headers: { ...authHeaders() } })
  return handleJsonResponse(response)
}

export const createFolder = async (payload) => {
  const response = await fetch(resolveApiUrl('/api/folders'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const updateFolder = async (folderId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/folders/${folderId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const deleteFolder = async (folderId) => {
  const response = await fetch(resolveApiUrl(`/api/folders/${folderId}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const fetchMyFolderPermissions = async (folderId) => {
  if (!folderId) {
    throw new Error('Folder ID is required')
  }
  const response = await fetch(resolveApiUrl(`/api/folders/${folderId}/my-permissions`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const fetchFolderPermissions = async (folderId) => {
  const response = await fetch(resolveApiUrl(`/api/folders/${folderId}/permissions`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const fetchFolderPermissionTemplate = async () => {
  const response = await fetch(resolveApiUrl('/api/folders/permissions/template'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const listApproverOptions = async () => {
  const response = await fetch(resolveApiUrl('/api/documents/approvers'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const listSupervisorOptions = async () => {
  const response = await fetch(resolveApiUrl('/api/documents/supervisors'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const updateFolderPermissions = async (folderId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/folders/${folderId}/permissions`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const fetchDocument = async (id) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${id}`), { headers: { ...authHeaders() } })
  return handleJsonResponse(response)
}

export const fetchDocumentPreview = async (documentId, versionId) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/versions/${versionId}/preview`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const uploadDocument = async (metadata, file) => {
  const formData = new FormData()
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json')
  formData.append('file', file)

  const response = await fetch(resolveApiUrl('/api/documents'), {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  })
  return handleJsonResponse(response)
}

export const uploadDocumentAiFiling = async (metadata, file, { detectPrompt = '' } = {}) => {
  const formData = new FormData()
  formData.append('mode', 'ai_filing')
  formData.append('metadata_json', JSON.stringify(metadata))
  formData.append('file', file)
  if (detectPrompt && String(detectPrompt).trim().length) {
    formData.append('detect_prompt', String(detectPrompt).trim())
  }

  const response = await fetch(`${UPLOAD_AI_API_BASE_URL}/upload`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  })

  return handleJsonResponse(response)
}

export const uploadVersion = async (documentId, file) => {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/versions`), {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  })
  return handleJsonResponse(response)
}

export const runPdfOcr = async (file, prompt = 'prompt_ocr', confidence = 95) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('prompt', prompt)
  formData.append('confidence', String(confidence))

  const response = await fetch(resolveApiUrl('/api/documents/ocr/pdf'), {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  })
  return handleJsonResponse(response)
}

export const runStoredDocumentOcr = async (documentId, prompt = 'prompt_ocr', confidence = 95, force = false) => {
  const params = new URLSearchParams()
  if (prompt) {
    params.set('prompt', prompt)
  }
  params.set('confidence', String(confidence))
  if (force) {
    params.set('force', 'true')
  }
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/ocr/pdf?${params.toString()}`), {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const getStoredDocumentOcr = async (documentId, prompt = 'prompt_ocr', confidence = 95) => {
  const params = new URLSearchParams()
  if (prompt) {
    params.set('prompt', prompt)
  }
  params.set('confidence', String(confidence))
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/ocr/pdf?${params.toString()}`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const archiveDocument = async (documentId, { permanent = false } = {}) => {
  const path = `/api/documents/${documentId}` + (permanent ? '?permanent=true' : '')
  const response = await fetch(resolveApiUrl(path), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}

export const updateDocument = async (documentId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const addApprovalNote = async (documentId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/approval/notes`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const approveDocument = async (documentId, payload = {}) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/approval/approve`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const rejectDocument = async (documentId, payload = {}) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/approval/reject`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const delegateApproval = async (documentId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/approval/delegate`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const resubmitApproval = async (documentId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/approval/resubmit`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}

export const buildDownloadUrl = (documentId, versionId) => {
  const path = versionId
    ? `/api/documents/${documentId}/versions/${versionId}/download`
    : `/api/documents/${documentId}/download`
  return resolveApiUrl(path)
}

export const buildDocumentAccessUrl = (documentId) => {
  if (!documentId) {
    return ''
  }

  if (typeof window === 'undefined' || !window.location) {
    const fallback = new URL('/', 'http://localhost:5173')
    fallback.searchParams.set('documentId', String(documentId))
    return fallback.toString()
  }

  const currentPath = window.location.pathname || '/'
  const basePath = currentPath.endsWith('/')
    ? currentPath
    : currentPath.replace(/[^/]*$/, '') || '/'
  const accessUrl = new URL(basePath, window.location.origin)
  accessUrl.searchParams.set('documentId', String(documentId))
  return accessUrl.toString()
}

export const downloadDocument = async (documentId, versionId, suggestedName, onProgress) => {
  const path = versionId
    ? `/api/documents/${documentId}/versions/${versionId}/download`
    : `/api/documents/${documentId}/download`
  const res = await fetch(resolveApiUrl(path), { headers: { ...authHeaders() } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Download failed: ${res.status} ${body}`)
  }

  const contentLength = res.headers.get('Content-Length') || res.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : null

  if (!res.body || !res.body.getReader) {
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName || 'download'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    if (onProgress) onProgress(1, 1)
    return
  }

  const reader = res.body.getReader()
  const chunks = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (onProgress) onProgress(loaded, total)
  }

  const blob = new Blob(chunks)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export { authHeaders }

// ---------------------------------------------------------------------------
// Data Extraction API  (calls the standalone extraction service at dots.ocr/API)
// ---------------------------------------------------------------------------

const EXTRACTION_API_BASE = (import.meta.env.VITE_EXTRACTION_API_URL ?? 'http://localhost:5001').replace(/\/$/, '')

/**
 * Call the data extraction service with OCR text and metadata template.
 *
 * @param {string} ocrText           - Plain text from the OCR result
 * @param {Array} metadataTemplate   - List of field definitions (from folder.metadata_template)
 * @param {string} formType          - Form identifier (e.g. "form1")
 * @returns {Promise<{status_code: number, form_type: string, extracted_json: object}>}
 */
export const runDataExtraction = async (ocrText, metadataTemplate, formType = 'form1') => {
  if (!metadataTemplate || metadataTemplate.length === 0) {
    throw new Error('metadata_template is required for extraction')
  }
  const response = await fetch(`${EXTRACTION_API_BASE}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ocr_text: ocrText,
      form_type: formType,
      metadata_template: metadataTemplate,
    }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || body.message || `Extraction service error (${response.status})`)
  }
  return response.json()
}

export const saveDataExtractionResult = async (documentId, payload) => {
  const response = await fetch(resolveApiUrl(`/api/documents/${documentId}/extraction`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  return handleJsonResponse(response)
}
