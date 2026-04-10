const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export const resolveApiUrl = (path) => `${API_BASE_URL}${path}`

export const authHeaders = () => {
  try {
    const token = localStorage.getItem('dms_auth')
    return token ? { Authorization: `Basic ${token}` } : {}
  } catch (err) {
    return {}
  }
}

export const handleJsonResponse = async (response) => {
  if (!response.ok) {
    const rawBody = await response.text().catch(() => '')
    let body = {}
    if (rawBody) {
      try {
        body = JSON.parse(rawBody)
      } catch {
        body = { message: rawBody }
      }
    }
    const message = body.message || body.error || response.statusText || 'Request failed'
    const error = new Error(message)
    error.status = response.status
    error.body = body
    throw error
  }
  if (response.status === 204) {
    return null
  }
  return response.json()
}
