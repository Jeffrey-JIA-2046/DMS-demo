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
    const body = await response.json().catch(() => ({}))
    const message = body.message || body.error || 'Request failed'
    throw new Error(message)
  }
  if (response.status === 204) {
    return null
  }
  return response.json()
}
