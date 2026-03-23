import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

const buildQueryString = (params) => {
  const query = new URLSearchParams()
  if (typeof params.page === 'number') query.set('page', params.page)
  if (typeof params.size === 'number') query.set('size', params.size)
  if (params.query) query.set('q', params.query)
  if (params.tags && params.tags.length) {
    params.tags.forEach((tag) => query.append('tags', tag))
  }
  if (params.starredOnly) query.set('starredOnly', 'true')
  if (params.joinedOnly) query.set('joinedOnly', 'true')
  return query.toString()
}

const extractFileName = (contentDisposition) => {
  if (!contentDisposition) return null
  const match = /filename="?([^";]+)"?/i.exec(contentDisposition)
  return match ? match[1] : null
}

export const searchKnowledgeTopics = async ({ page = 0, size = 8, query = '', tags = [], starredOnly = false, joinedOnly = false } = {}) => {
  const qs = buildQueryString({ page, size, query, tags, starredOnly, joinedOnly })
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics?${qs}`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(res)
}

export const createKnowledgeTopic = async (payload) => {
  const res = await fetch(resolveApiUrl('/api/knowledge/topics'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res)
}

export const fetchKnowledgeTopic = async (topicId) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}`), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(res)
}

export const updateKnowledgeTopic = async (topicId, payload) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res)
}

export const joinKnowledgeTopic = async (topicId) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/join`), {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(res)
}

export const addKnowledgeContribution = async (topicId, payload) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/contributions`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res)
}

export const shareKnowledgeTopic = async (topicId, payload) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/share`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res)
}

export const starKnowledgeTopic = async (topicId) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/stars`), {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(res)
}

export const unstarKnowledgeTopic = async (topicId) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/stars`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(res)
}

export const linkKnowledgeDocument = async (topicId, payload) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/links`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(res)
}

export const unlinkKnowledgeDocument = async (topicId, linkId) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/links/${linkId}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(res)
}

export const uploadKnowledgeAttachment = async (topicId, file, description) => {
  const formData = new FormData()
  formData.append('file', file)
  if (description) {
    formData.append('description', description)
  }
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/documents`), {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  })
  return handleJsonResponse(res)
}

export const downloadKnowledgeChain = async (topicId) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/chain/download`), {
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'Unable to download knowledge chain')
  }
  const blob = await res.blob()
  const fileName = extractFileName(res.headers.get('Content-Disposition')) || `knowledge-topic-${topicId}.md`
  return { blob, fileName }
}

export const downloadKnowledgeAttachment = async (topicId, uploadId) => {
  const res = await fetch(resolveApiUrl(`/api/knowledge/topics/${topicId}/documents/${uploadId}/download`), {
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || 'Unable to download attachment')
  }
  const blob = await res.blob()
  const fileName = extractFileName(res.headers.get('Content-Disposition')) || `attachment-${uploadId}`
  return { blob, fileName }
}
