const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const CLIENT_SESSION_KEY = 'dms_client_session_id'

export const resolveApiUrl = (path) => `${API_BASE_URL}${path}`

const createClientSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `client-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

export const getClientSessionId = () => {
  try {
    const existing = localStorage.getItem(CLIENT_SESSION_KEY)
    if (existing) {
      return existing
    }
    const generated = createClientSessionId()
    localStorage.setItem(CLIENT_SESSION_KEY, generated)
    return generated
  } catch (err) {
    return createClientSessionId()
  }
}

export const authHeaders = () => {
  try {
    const token = localStorage.getItem('dms_auth')
    return token
      ? {
          Authorization: `Basic ${token}`,
          'X-Client-Session-Id': getClientSessionId(),
        }
      : {}
  } catch (err) {
    return {}
  }
}

export const isSessionInvalidationMessage = (message = '') => {
  const normalized = String(message || '').toLowerCase()
  return normalized.includes('session expired')
    || normalized.includes('session was signed out')
    || normalized.includes('signed out')
    || normalized.includes('login again')
    || normalized.includes('http 401')
}

export const redirectToLogin = () => {
  try {
    localStorage.removeItem('dms_auth')
    localStorage.removeItem('dms_role')
  } catch (err) {
    // ignore
  }

  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login')
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
    const message = body.message || body.error || body.detail || response.statusText || 'Request failed'
    if (response.status === 401 && isSessionInvalidationMessage(message)) {
      redirectToLogin()
    }
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
