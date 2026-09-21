import { authHeaders } from './documents'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const resolveUrl = (path) => `${API_BASE_URL}${path}`

const handleResponse = async (response) => {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || 'Request failed')
  }
  if (response.status === 204) {
    return null
  }
  return response.json()
}

const jsonHeaders = () => ({ 'Content-Type': 'application/json', ...authHeaders() })

export const fetchGroups = async () => {
  const res = await fetch(resolveUrl('/api/admin/groups'), { headers: { ...authHeaders() } })
  return handleResponse(res)
}

export const createGroup = async (payload) => {
  const res = await fetch(resolveUrl('/api/admin/groups'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  return handleResponse(res)
}

export const updateGroup = async (id, payload) => {
  const res = await fetch(resolveUrl(`/api/admin/groups/${id}`), {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  return handleResponse(res)
}

export const deleteGroup = async (id) => {
  const res = await fetch(resolveUrl(`/api/admin/groups/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleResponse(res)
}

export const fetchUsers = async () => {
  const res = await fetch(resolveUrl('/api/admin/users'), { headers: { ...authHeaders() } })
  return handleResponse(res)
}

export const createUser = async (payload) => {
  const res = await fetch(resolveUrl('/api/admin/users'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  return handleResponse(res)
}

export const updateUser = async (id, payload) => {
  const res = await fetch(resolveUrl(`/api/admin/users/${id}`), {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  return handleResponse(res)
}

export const deleteUser = async (id) => {
  const res = await fetch(resolveUrl(`/api/admin/users/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  return handleResponse(res)
}
