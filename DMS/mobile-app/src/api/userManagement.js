import { fetchJson } from './httpClient'

export const fetchGroups = async () => fetchJson('/api/admin/groups')
export const createGroup = async (payload) => fetchJson('/api/admin/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const updateGroup = async (id, payload) => fetchJson(`/api/admin/groups/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const deleteGroup = async (id) => fetchJson(`/api/admin/groups/${id}`, { method: 'DELETE' })

export const fetchUsers = async () => fetchJson('/api/admin/users')
export const createUser = async (payload) => fetchJson('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const updateUser = async (id, payload) => fetchJson(`/api/admin/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const deleteUser = async (id) => fetchJson(`/api/admin/users/${id}`, { method: 'DELETE' })
