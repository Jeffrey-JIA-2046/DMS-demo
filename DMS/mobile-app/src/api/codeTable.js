import { fetchJson } from './httpClient'

export const listTableCodes = async () => fetchJson('/api/admin/code-tables')
export const listCodeTableItems = async (tableCode) => fetchJson(`/api/admin/code-tables/${encodeURIComponent(tableCode)}`)
export const createCodeTableItem = async (tableCode, payload) => fetchJson(`/api/admin/code-tables/${encodeURIComponent(tableCode)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const updateCodeTableItem = async (tableCode, id, payload) => fetchJson(`/api/admin/code-tables/${encodeURIComponent(tableCode)}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const deleteCodeTableItem = async (tableCode, id) => fetchJson(`/api/admin/code-tables/${encodeURIComponent(tableCode)}/${id}`, { method: 'DELETE' })
export const fetchActiveCodeTableItems = async (tableCode) => fetchJson(`/api/code-tables/${encodeURIComponent(tableCode)}`)
