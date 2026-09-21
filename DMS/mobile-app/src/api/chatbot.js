import { getChatbotApiUrl } from '../config'
import { authHeader } from './documents'
import { handleJsonResponse } from './httpClient'

const resolveChatbotUrl = (path) => `${getChatbotApiUrl()}${path}`

export const searchDocumentsByAi = async (token, { prompt, page = 1, perPage = 20, searchMode = 'hybrid' }) => {
  const response = await fetch(resolveChatbotUrl('/api/chatbot/search'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify({
      q: prompt,
      page,
      per_page: perPage,
      search_mode: searchMode,
    }),
  })
  return handleJsonResponse(response)
}

const parseErrorMessage = async (response) => {
  const raw = await response.text().catch(() => '')
  if (!raw) return 'Request failed'
  try {
    const parsed = JSON.parse(raw)
    return parsed.message || parsed.error || raw
  } catch {
    return raw
  }
}

const streamSse = async ({ token, path, body, onChunk }) => {
  const response = await fetch(resolveChatbotUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(token),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  if (!response.body?.getReader) {
    const text = await response.text()
    onChunk?.(text)
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''

  const consumeLine = (line) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return

    try {
      const parsed = JSON.parse(payload)
      const chunk = parsed?.chunk ?? parsed?.assistant_response ?? ''
      if (chunk) {
        text += chunk
        onChunk?.(chunk)
      }
    } catch {
      text += payload
      onChunk?.(payload)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const piece = decoder.decode(value, { stream: true })
    if (!piece) continue
    buffer += piece
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    lines.forEach(consumeLine)
  }
  if (buffer) {
    buffer.split(/\r?\n/).forEach(consumeLine)
  }

  return text
}

export const summarizeSelectedDocuments = async (token, { chatId, pressReleases }, onChunk) => {
  const summary = await streamSse({
    token,
    path: '/api/chatbot/summarize-multiple',
    body: {
      chat_id: chatId,
      press_releases: pressReleases,
      stream: true,
    },
    onChunk,
  })
  return summary
}

export const askQuestionOnSelectedDocuments = async (token, { chatId, question, pressReleases }, onChunk) => {
  const answer = await streamSse({
    token,
    path: '/api/chatbot/chat',
    body: {
      chat_id: chatId,
      question,
      press_releases: pressReleases,
      stream: true,
    },
    onChunk,
  })
  return answer
}
