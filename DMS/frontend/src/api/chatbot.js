import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

const jsonHeaders = () => ({ 'Content-Type': 'application/json', ...authHeaders() })

const parseErrorMessage = async (response) => {
  const raw = await response.text().catch(() => '')
  if (!raw) {
    return 'Request failed'
  }
  try {
    const parsed = JSON.parse(raw)
    return parsed.message || parsed.error || raw
  } catch (err) {
    return raw
  }
}

const streamTextResponse = async ({ path, body, onChunk }) => {
  const response = await fetch(resolveApiUrl(path), {
    method: 'POST',
    headers: jsonHeaders(),
    body: body !== undefined ? JSON.stringify(body) : '{}',
  })
  if (!response.ok) {
    const message = await parseErrorMessage(response)
    throw new Error(message)
  }
  if (!response.body || !response.body.getReader) {
    const fallback = await response.text()
    if (fallback && onChunk) {
      onChunk(fallback)
    }
    return fallback
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    const chunk = decoder.decode(value, { stream: true })
    if (!chunk) continue
    result += chunk
    if (onChunk) {
      onChunk(chunk)
    }
  }
  const lastChunk = decoder.decode()
  if (lastChunk) {
    result += lastChunk
    if (onChunk) {
      onChunk(lastChunk)
    }
  }
  return result
}

export const searchChatDocuments = async ({ prompt, limit } = {}) => {
  const response = await fetch(resolveApiUrl('/api/chatbot/search'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ prompt, limit }),
  })
  return handleJsonResponse(response)
}

export const summarizeDocumentWithChatbot = async (documentId, onChunk) => {
  const text = await streamTextResponse({
    path: `/api/chatbot/documents/${documentId}/summary/stream`,
    body: {},
    onChunk,
  })
  return { summary: text }
}

export const askDocumentQuestion = async (documentId, question, onChunk) => {
  const text = await streamTextResponse({
    path: `/api/chatbot/documents/${documentId}/qa/stream`,
    body: { question },
    onChunk,
  })
  return { answer: text }
}
