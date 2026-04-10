import { fetchJson } from './httpClient'

export const fetchMyDashboardTasks = async () => fetchJson('/api/dashboard/my-tasks')
export const approveRetentionTask = async (taskId, payload = {}) => fetchJson(`/api/dashboard/tasks/${taskId}/retention/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const rejectRetentionTask = async (taskId, payload = {}) => fetchJson(`/api/dashboard/tasks/${taskId}/retention/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const delegateRetentionTask = async (taskId, payload) => fetchJson(`/api/dashboard/tasks/${taskId}/retention/delegate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
