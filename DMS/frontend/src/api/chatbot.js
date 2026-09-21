import {
  resolveApiUrl,
  authHeaders,
  handleJsonResponse,
  isSessionInvalidationMessage,
  redirectToLogin,
} from './httpClient'

const jsonHeaders = () => ({ 'Content-Type': 'application/json', ...authHeaders() })
const CHATBOT_API_BASE = (
  import.meta.env.VITE_CHATBOT_API_URL
  ?? import.meta.env.VITE_API_BASE_URL
  ?? ''
).replace(/\/$/, '')

const EMBEDDING_API_BASE = (
  import.meta.env.VITE_EMBEDDING_API_URL
  ?? import.meta.env.VITE_API_BASE_URL
  ?? ''
).replace(/\/$/, '')
const CHATBOT_DEBUG_STREAM = String(import.meta.env.VITE_CHATBOT_DEBUG_STREAM ?? 'false').toLowerCase() === 'true'
const CHATBOT_RESULT_SNIPPET_MAX_CHARS = Number(import.meta.env.VITE_CHATBOT_RESULT_SNIPPET_MAX_CHARS ?? 480)

const resolveChatbotUrl = (path) => {
  return CHATBOT_API_BASE ? `${CHATBOT_API_BASE}${path}` : resolveApiUrl(path)
}

const resolveEmbeddingUrl = (path) => {
  return EMBEDDING_API_BASE ? `${EMBEDDING_API_BASE}${path}` : resolveApiUrl(path)
}

const logStreamDebug = (event, payload = {}) => {
  if (!CHATBOT_DEBUG_STREAM) {
    return
  }
  const timestamp = new Date().toISOString()
  // eslint-disable-next-line no-console
  console.debug(`[chatbot-stream][${timestamp}] ${event}`, payload)
}

const CONTEXT_TOO_LONG_MESSAGE = 'Please start a new session (context too long)'

const isContextTooLongErrorText = (value) => {
  const text = String(value ?? '').toLowerCase()
  if (!text) {
    return false
  }
  return (
    text.includes('context_length_exceeded')
    || text.includes('context too long')
    || text.includes('exceed_context_size_error')
    || text.includes('exceeds the available context size')
  )
}

const normalizeChatbotErrorMessage = (payload, fallback = 'Request failed') => {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const detail = payload.detail
  if (typeof detail === 'string') {
    if (isContextTooLongErrorText(detail)) {
      return CONTEXT_TOO_LONG_MESSAGE
    }
    return detail
  }
  if (detail && typeof detail === 'object') {
    if (
      String(detail.exceed_tokens || '').toLowerCase() === 'context_length_exceeded'
      || isContextTooLongErrorText(detail.message)
    ) {
      return CONTEXT_TOO_LONG_MESSAGE
    }
    if (typeof detail.message === 'string' && detail.message.trim()) {
      return detail.message
    }
  }

  const message = payload.message
  if (typeof message === 'string' && message.trim()) {
    if (isContextTooLongErrorText(message)) {
      return CONTEXT_TOO_LONG_MESSAGE
    }
    return message
  }

  const error = payload.error
  if (typeof error === 'string' && error.trim()) {
    if (isContextTooLongErrorText(error)) {
      return CONTEXT_TOO_LONG_MESSAGE
    }
    return error
  }
  if (error && typeof error === 'object') {
    if (
      String(error.type || '').toLowerCase() === 'exceed_context_size_error'
      || isContextTooLongErrorText(error.message)
    ) {
      return CONTEXT_TOO_LONG_MESSAGE
    }
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message
    }
  }

  return fallback
}

const parseErrorMessage = async (response) => {
  const raw = await response.text().catch(() => '')
  if (!raw) {
    return 'Request failed'
  }
  try {
    const parsed = JSON.parse(raw)
    return normalizeChatbotErrorMessage(parsed, raw)
  } catch (err) {
    if (isContextTooLongErrorText(raw)) {
      return CONTEXT_TOO_LONG_MESSAGE
    }
    return raw
  }
}

const compactWhitespace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

const truncateText = (value, maxChars = CHATBOT_RESULT_SNIPPET_MAX_CHARS) => {
  const normalized = compactWhitespace(value)
  if (!normalized) {
    return ''
  }
  if (!Number.isFinite(maxChars) || maxChars <= 0 || normalized.length <= maxChars) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

const streamSseTextResponse = async ({ path, body, onChunk }) => {
  const traceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  logStreamDebug('request:start', { traceId, path, hasBody: body !== undefined })
  const response = await fetch(resolveChatbotUrl(path), {
    method: 'POST',
    headers: jsonHeaders(),
    body: body !== undefined ? JSON.stringify(body) : '{}',
  })
  logStreamDebug('request:response', { traceId, path, status: response.status, ok: response.ok })
  if (!response.ok) {
    const message = await parseErrorMessage(response)
    logStreamDebug('request:error-response', { traceId, path, status: response.status, message })
    if (response.status === 401 && isSessionInvalidationMessage(message)) {
      redirectToLogin()
    }
    const error = new Error(message)
    error.status = response.status
    throw error
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
  let buffer = ''
  let result = ''
  let meta = {}
  let streamError = ''
  let chunkCount = 0

  const handleSseData = (line) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload) return
    if (payload === '[DONE]') return
    try {
      const parsed = JSON.parse(payload)
      const contextExceeded =
        String(parsed?.exceed_tokens || '').toLowerCase() === 'context_length_exceeded'
        || isContextTooLongErrorText(parsed?.message)
      if (contextExceeded) {
        streamError = CONTEXT_TOO_LONG_MESSAGE
        return
      }
      if (parsed?.error) {
        streamError = normalizeChatbotErrorMessage(
          typeof parsed.error === 'object' ? { error: parsed.error } : { error: String(parsed.error) },
          String(parsed.error),
        )
        return
      }
      if (parsed?.chat_id) {
        meta = { ...meta, chat_id: parsed.chat_id }
        logStreamDebug('stream:chat-id', { traceId, path, chat_id: parsed.chat_id })
      }
      if (parsed?.request_id) {
        meta = { ...meta, request_id: parsed.request_id }
        logStreamDebug('stream:request-id', { traceId, path, request_id: parsed.request_id })
      }
      if (parsed?.token_usage) {
        meta = { ...meta, token_usage: parsed.token_usage }
      }
      if (parsed?.intent) {
        meta = { ...meta, intent: parsed.intent }
      }
      if (parsed?.sources) {
        meta = { ...meta, sources: parsed.sources }
      }
      const chunk = parsed?.chunk ?? (!parsed?.complete ? parsed?.assistant_response : '') ?? ''
      if (chunk) {
        result += chunk
        chunkCount += 1
        if (chunkCount <= 3 || chunkCount % 50 === 0) {
          logStreamDebug('stream:chunk', {
            traceId,
            path,
            chunkCount,
            chunkLength: chunk.length,
            totalChars: result.length,
          })
        }
        if (onChunk) onChunk(chunk)
      }
      return
    } catch (err) {
      if (payload) {
        result += payload
        if (onChunk) onChunk(payload)
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    const chunk = decoder.decode(value, { stream: true })
    if (!chunk) continue
    buffer += chunk

    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      handleSseData(line)
      if (streamError) {
        break
      }
    }
    if (streamError) {
      try {
        await reader.cancel()
      } catch (err) {
        // ignore reader cancel failures
      }
      break
    }
  }

  const lastChunk = decoder.decode()
  if (lastChunk) {
    buffer += lastChunk
  }
  if (buffer) {
    const lines = buffer.split(/\r?\n/)
    for (const line of lines) {
      handleSseData(line)
      if (streamError) {
        break
      }
    }
  }
  if (streamError) {
    logStreamDebug('stream:error', { traceId, path, chunkCount, totalChars: result.length, streamError })
    if (isSessionInvalidationMessage(streamError)) {
      redirectToLogin()
    }
    throw new Error(streamError)
  }
  logStreamDebug('stream:complete', {
    traceId,
    path,
    chunkCount,
    totalChars: result.length,
    chat_id: meta?.chat_id ?? null,
    request_id: meta?.request_id ?? null,
  })
  return { text: result, meta }
}

export const searchChatDocuments = async ({
  prompt,
  startDate,
  endDate,
  owners,
  categories,
  tags,
  folderNames,
  folderPaths,
  metadataFilters,
  page = 1,
  perPage = 20,
  limit,
  searchMode = 'hybrid',
  exactPhrase = false,
} = {}) => {
  const resolvedPerPage = Math.max(1, Math.min(limit ?? perPage ?? 20, 50))
  const response = await fetch(resolveChatbotUrl('/api/chatbot/search'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      q: prompt ?? '',
      start_date: startDate ?? '',
      end_date: endDate ?? '',
      owners: Array.isArray(owners) ? owners : [],
      categories: Array.isArray(categories) ? categories : [],
      tags: Array.isArray(tags) ? tags : [],
      folder_names: Array.isArray(folderNames) ? folderNames : [],
      folder_paths: Array.isArray(folderPaths) ? folderPaths : [],
      metadata_filters: metadataFilters && typeof metadataFilters === 'object' ? metadataFilters : {},
      page: Math.max(1, Number(page) || 1),
      per_page: resolvedPerPage,
      search_mode: searchMode ?? 'hybrid',
      exact_phrase: searchMode === 'text' ? Boolean(exactPhrase) : false,
    }),
  })
  const payload = await handleJsonResponse(response)
  const normalizedResults = (payload?.results ?? []).map((item) => {
    const source = item?.source ?? {}
    const highlight = item?.highlight ?? {}
    const highlightedSnippet = Array.isArray(highlight?.ocr_content) && highlight.ocr_content.length
      ? highlight.ocr_content.join(' ... ')
      : ''
    const fallbackSnippet = source.description ?? source.press_release ?? source.content ?? source.ocr_content ?? ''
    const snippet = truncateText(highlightedSnippet || fallbackSnippet)
    return {
      documentId: item?.id,
      folderId: source.folder?.id ?? source.folder_id ?? source.folderId ?? null,
      relevanceScore: Number.isFinite(Number(item?.score)) ? Number(item.score) : null,
      title: source.title ?? source.document_title ?? source.name ?? 'Untitled',
      owner: source.owner ?? source.author ?? source.publisher ?? '',
      category: source.category ?? source.topic ?? '',
      description: source.description ?? '',
      tags: Array.isArray(source.tags) ? source.tags : [],
      folderName: source.folder_name ?? '',
      folderPath: source.folder_path ?? '',
      metadata: source.document_metadata && typeof source.document_metadata === 'object' ? source.document_metadata : {},
      snippet,
      raw: {
        source: {
          formatted_date: source.formatted_date,
          release_date: source.release_date,
          updatedAt: source.updatedAt,
          updated_at: source.updated_at,
        },
      },
    }
  })
  return {
    results: normalizedResults,
    overview: normalizedResults.length
      ? `Found ${normalizedResults.length} matching result${normalizedResults.length > 1 ? 's' : ''}.`
      : 'No matches found.',
    total: Number(payload?.total ?? 0),
    page: Number(payload?.page ?? page ?? 1),
    perPage: Number(payload?.per_page ?? resolvedPerPage),
    totalPages: Number(payload?.total_pages ?? 1),
    debug: payload?.debug ?? null,
  }
}

export const summarizeDocumentWithChatbot = async ({ chatId, question, pressReleases }, onChunk) => {
  const { text, meta } = await streamSseTextResponse({
    path: '/api/chatbot/summarize-multiple',
    body: {
      chat_id: chatId,
      question: question ?? '',
      press_releases: pressReleases,
      stream: true,
    },
    onChunk,
  })
  return {
    summary: text,
    chat_id: meta?.chat_id ?? chatId ?? null,
    request_id: meta?.request_id ?? null,
    token_usage: meta?.token_usage ?? null,
  }
}

export const askDocumentQuestion = async ({ question, chatId, pressReleases }, onChunk) => {
  const { text, meta } = await streamSseTextResponse({
    path: '/api/chatbot/chat',
    body: {
      question,
      chat_id: chatId,
      press_releases: pressReleases,
      stream: true,
    },
    onChunk,
  })
  return {
    answer: text,
    chat_id: meta?.chat_id ?? chatId ?? null,
    request_id: meta?.request_id ?? null,
    token_usage: meta?.token_usage ?? null,
  }
}

export const askAgentQuestion = async ({ question, chatId, includeNeighborPages = false, statisticsGeneration = false }, onChunk) => {
  const { text, meta } = await streamSseTextResponse({
    path: '/api/chatbot/agent-chat',
    body: {
      question,
      chat_id: chatId,
      stream: true,
      include_neighbor_pages: Boolean(includeNeighborPages),
      statistics_generation: Boolean(statisticsGeneration),
    },
    onChunk,
  })
  return {
    answer: text,
    chat_id: meta?.chat_id ?? chatId ?? null,
    request_id: meta?.request_id ?? null,
    intent: meta?.intent ?? null,
    sources: meta?.sources ?? null,
    token_usage: meta?.token_usage ?? null,
  }
}

const withSessionRedirect = async (requestFn) => {
  try {
    return await requestFn()
  } catch (err) {
    const message = err?.message || ''
    const status = err?.status || 0
    if (status === 401 && isSessionInvalidationMessage(message)) {
      redirectToLogin()
    }
    throw err
  }
}

export const startEmbeddingJob = async (payload) => {
  return withSessionRedirect(async () => {
    const response = await fetch(resolveEmbeddingUrl('/embed/jobs'), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const message = await parseErrorMessage(response)
      const error = new Error(message)
      error.status = response.status
      throw error
    }
    return response.json()
  })
}

export const getEmbeddingJobStatus = async (jobId) => {
  return withSessionRedirect(async () => {
    const response = await fetch(resolveEmbeddingUrl(`/embed/jobs/${encodeURIComponent(jobId)}`), {
      headers: jsonHeaders(),
    })
    if (!response.ok) {
      const message = await parseErrorMessage(response)
      const error = new Error(message)
      error.status = response.status
      throw error
    }
    return response.json()
  })
}
