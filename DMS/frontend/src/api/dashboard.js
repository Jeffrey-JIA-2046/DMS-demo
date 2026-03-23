import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

export const fetchMyDashboardTasks = async () => {
  const response = await fetch(resolveApiUrl('/api/dashboard/my-tasks'), {
    headers: { ...authHeaders() },
  })
  return handleJsonResponse(response)
}
