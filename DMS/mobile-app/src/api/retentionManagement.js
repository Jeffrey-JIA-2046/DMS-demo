import { fetchJson } from './httpClient'

export const listRetentionRules = async () => fetchJson('/api/admin/retention-rules')
export const listRetentionCategories = async () => fetchJson('/api/admin/retention-rules/categories')
export const createRetentionRule = async (payload) => fetchJson('/api/admin/retention-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const updateRetentionRule = async (id, payload) => fetchJson(`/api/admin/retention-rules/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const deleteRetentionRule = async (id) => fetchJson(`/api/admin/retention-rules/${id}`, { method: 'DELETE' })
export const runRetentionSweep = async () => fetchJson('/api/admin/retention-rules/sweep', { method: 'POST' })

export const listReminderRules = async () => fetchJson('/api/admin/reminder-rules')
export const createReminderRule = async (payload) => fetchJson('/api/admin/reminder-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const deleteReminderRule = async (id) => fetchJson(`/api/admin/reminder-rules/${id}`, { method: 'DELETE' })
export const runReminderSweep = async () => fetchJson('/api/admin/reminder-rules/sweep', { method: 'POST' })
