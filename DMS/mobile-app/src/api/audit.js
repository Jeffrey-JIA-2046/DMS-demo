import { fetchJson } from './httpClient'

export const listAuditLogs = async ({ page = 0, size = 25, startDate = '', endDate = '', performer = '', action = '' } = {}) => {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  if (performer) params.set('performer', performer)
  if (action) params.set('action', action)
  return fetchJson(`/api/audit?${params.toString()}`)
}
