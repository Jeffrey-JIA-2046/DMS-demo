import { resolveApiUrl, handleJsonResponse } from './httpClient'
import { authHeader } from './documents'

export const searchKnowledgeTopics = async (token, { query = '', page = 0, size = 12 } = {}) => {
  const params = new URLSearchParams({ q: query, page: String(page), size: String(size) })
  const response = await fetch(resolveApiUrl(`/api/knowledge/topics?${params.toString()}`), {
    headers: { ...authHeader(token) },
  })
  return handleJsonResponse(response)
}

export const createKnowledgeTopic = async (token, payload) => {
  const response = await fetch(resolveApiUrl('/api/knowledge/topics'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(payload),
  })
  return handleJsonResponse(response)
}
