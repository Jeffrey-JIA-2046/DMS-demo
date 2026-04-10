import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const TOKEN_KEY = 'dms_mobile_auth'
const API_BASE_KEY = 'dms_mobile_api_base_url'

const defaultBaseUrl = () => {
  if (Platform.OS === 'android') return 'http://10.0.2.2:8080'
  return 'http://localhost:8080'
}

let cachedBaseUrl = null

export const getStoredApiBaseUrl = async () => {
  if (cachedBaseUrl) return cachedBaseUrl
  const stored = (await AsyncStorage.getItem(API_BASE_KEY)) || defaultBaseUrl()
  cachedBaseUrl = stored.replace(/\/$/, '')
  return cachedBaseUrl
}

export const setStoredApiBaseUrl = async (value) => {
  const normalized = (value || '').trim().replace(/\/$/, '')
  const next = normalized || defaultBaseUrl()
  cachedBaseUrl = next
  await AsyncStorage.setItem(API_BASE_KEY, next)
  return next
}

export const getToken = async () => AsyncStorage.getItem(TOKEN_KEY)

export const setToken = async (token) => {
  if (!token) {
    await AsyncStorage.removeItem(TOKEN_KEY)
    return
  }
  await AsyncStorage.setItem(TOKEN_KEY, token)
}

export const clearSession = async () => {
  await AsyncStorage.removeItem(TOKEN_KEY)
}

export const resolveApiUrl = async (path) => {
  const base = await getStoredApiBaseUrl()
  return `${base}${path}`
}

export const authHeaders = async () => {
  const token = await getToken()
  return token ? { Authorization: `Basic ${token}` } : {}
}

export const handleJsonResponse = async (response) => {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    let message = body
    try {
      const parsed = JSON.parse(body)
      message = parsed.message || parsed.error || body
    } catch {
      message = body || `Request failed (${response.status})`
    }
    throw new Error(message || `Request failed (${response.status})`)
  }
  if (response.status === 204) {
    return null
  }
  return response.json()
}

export const fetchJson = async (path, options = {}) => {
  const url = await resolveApiUrl(path)
  const headers = { ...(await authHeaders()), ...(options.headers || {}) }
  const response = await fetch(url, { ...options, headers })
  return handleJsonResponse(response)
}

export const fetchText = async (path, options = {}) => {
  const url = await resolveApiUrl(path)
  const headers = { ...(await authHeaders()), ...(options.headers || {}) }
  const response = await fetch(url, { ...options, headers })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Request failed (${response.status})`)
  }
  return response.text()
}
