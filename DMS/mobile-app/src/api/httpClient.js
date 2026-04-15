import { getApiBaseUrl } from '../config'

const parseError = async (response) => {
  const raw = await response.text().catch(() => '')
  if (!raw) return response.statusText || 'Request failed'
  try {
    const parsed = JSON.parse(raw)
    return parsed.message || parsed.error || raw
  } catch {
    return raw
  }
}

export const resolveApiUrl = (path) => `${getApiBaseUrl()}${path}`

export const handleJsonResponse = async (response) => {
  if (!response.ok) {
    const message = await parseError(response)
    const err = new Error(message)
    err.status = response.status
    throw err
  }
  if (response.status === 204) {
    return null
  }
  return response.json()
}
