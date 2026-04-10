import { fetchJson } from './httpClient'
import * as FileSystem from 'expo-file-system'

const toQuery = (params) => new URLSearchParams(params).toString()

export const listDocuments = async ({ page = 0, size = 12, filters = {} }) => {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (filters.query) params.set('q', filters.query)
  if (filters.owner) params.set('owner', filters.owner)
  if (filters.category) params.set('category', filters.category)
  if (filters.status && filters.status !== 'ALL') params.set('status', filters.status)
  if (filters.folderId) params.set('folderId', String(filters.folderId))
  if (filters.sort) params.set('sort', filters.sort)
  if (Array.isArray(filters.tags)) {
    filters.tags.filter(Boolean).forEach((tag) => params.append('tags', tag))
  }
  return fetchJson(`/api/documents?${params.toString()}`)
}

export const fetchDocument = async (id) => fetchJson(`/api/documents/${id}`)
export const listFolderTree = async () => fetchJson('/api/folders/tree')
export const createFolder = async (payload) => fetchJson('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const updateFolder = async (id, payload) => fetchJson(`/api/folders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const deleteFolder = async (id) => fetchJson(`/api/folders/${id}`, { method: 'DELETE' })
export const fetchMyFolderPermissions = async (id) => fetchJson(`/api/folders/${id}/my-permissions`)
export const fetchFolderPermissions = async (id) => fetchJson(`/api/folders/${id}/permissions`)
export const fetchFolderPermissionTemplate = async () => fetchJson('/api/folders/permissions/template')
export const updateFolderPermissions = async (id, payload) => fetchJson(`/api/folders/${id}/permissions`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const listApproverOptions = async () => fetchJson('/api/documents/approvers')
export const listSupervisorOptions = async () => fetchJson('/api/documents/supervisors')

export const uploadDocument = async (metadata, fileAsset) => {
  const metadataPath = `${FileSystem.cacheDirectory}metadata-${Date.now()}.json`
  await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(metadata), { encoding: FileSystem.EncodingType.UTF8 })
  const formData = new FormData()
  formData.append('metadata', {
    uri: metadataPath,
    name: 'metadata.json',
    type: 'application/json',
  })
  formData.append('file', {
    uri: fileAsset.uri,
    name: fileAsset.name || 'upload.bin',
    type: fileAsset.mimeType || 'application/octet-stream',
  })
  try {
    return await fetchJson('/api/documents', { method: 'POST', body: formData })
  } finally {
    await FileSystem.deleteAsync(metadataPath, { idempotent: true }).catch(() => {})
  }
}

export const uploadVersion = async (documentId, fileAsset) => {
  const formData = new FormData()
  formData.append('file', {
    uri: fileAsset.uri,
    name: fileAsset.name || 'version.bin',
    type: fileAsset.mimeType || 'application/octet-stream',
  })
  return fetchJson(`/api/documents/${documentId}/versions`, { method: 'POST', body: formData })
}

export const archiveDocument = async (id, { permanent = false } = {}) => fetchJson(`/api/documents/${id}${permanent ? '?permanent=true' : ''}`, { method: 'DELETE' })
export const updateDocument = async (id, payload) => fetchJson(`/api/documents/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

export const addApprovalNote = async (id, payload) => fetchJson(`/api/documents/${id}/approval/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const approveDocument = async (id, payload = {}) => fetchJson(`/api/documents/${id}/approval/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const rejectDocument = async (id, payload = {}) => fetchJson(`/api/documents/${id}/approval/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const delegateApproval = async (id, payload) => fetchJson(`/api/documents/${id}/approval/delegate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

export const runStoredDocumentOcr = async (documentId, prompt = 'prompt_layout_all_en', confidence = 95) => fetchJson(`/api/documents/${documentId}/ocr/pdf?${toQuery({ prompt, confidence: String(confidence) })}`, { method: 'POST' })
export const getStoredDocumentOcr = async (documentId, prompt = 'prompt_layout_all_en', confidence = 95) => fetchJson(`/api/documents/${documentId}/ocr/pdf?${toQuery({ prompt, confidence: String(confidence) })}`)

export const runDataExtraction = async (ocrText, metadataTemplate, formType = 'form1') => {
  const response = await fetch('http://localhost:5001/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ocr_text: ocrText, form_type: formType, metadata_template: metadataTemplate }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || 'Extraction request failed')
  }
  return response.json()
}
