import { fetchJson } from './httpClient'

const queryString = (params = {}) => {
  const query = new URLSearchParams()
  if (typeof params.page === 'number') query.set('page', String(params.page))
  if (typeof params.size === 'number') query.set('size', String(params.size))
  if (params.query) query.set('q', params.query)
  if (Array.isArray(params.tags)) params.tags.filter(Boolean).forEach((tag) => query.append('tags', tag))
  if (params.starredOnly) query.set('starredOnly', 'true')
  if (params.joinedOnly) query.set('joinedOnly', 'true')
  return query.toString()
}

export const searchKnowledgeTopics = async (params = {}) => fetchJson(`/api/knowledge/topics?${queryString(params)}`)
export const createKnowledgeTopic = async (payload) => fetchJson('/api/knowledge/topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const fetchKnowledgeTopic = async (id) => fetchJson(`/api/knowledge/topics/${id}`)
export const updateKnowledgeTopic = async (id, payload) => fetchJson(`/api/knowledge/topics/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const joinKnowledgeTopic = async (id) => fetchJson(`/api/knowledge/topics/${id}/join`, { method: 'POST' })
export const addKnowledgeContribution = async (id, payload) => fetchJson(`/api/knowledge/topics/${id}/contributions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const shareKnowledgeTopic = async (id, payload) => fetchJson(`/api/knowledge/topics/${id}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const starKnowledgeTopic = async (id) => fetchJson(`/api/knowledge/topics/${id}/stars`, { method: 'POST' })
export const unstarKnowledgeTopic = async (id) => fetchJson(`/api/knowledge/topics/${id}/stars`, { method: 'DELETE' })
export const linkKnowledgeDocument = async (id, payload) => fetchJson(`/api/knowledge/topics/${id}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const unlinkKnowledgeDocument = async (id, linkId) => fetchJson(`/api/knowledge/topics/${id}/links/${linkId}`, { method: 'DELETE' })

export const uploadKnowledgeAttachment = async (topicId, fileAsset, description) => {
  const formData = new FormData()
  formData.append('file', {
    uri: fileAsset.uri,
    name: fileAsset.name || 'attachment.bin',
    type: fileAsset.mimeType || 'application/octet-stream',
  })
  if (description) formData.append('description', description)
  return fetchJson(`/api/knowledge/topics/${topicId}/documents`, { method: 'POST', body: formData })
}
