import { resolveApiUrl, authHeaders, handleJsonResponse } from './httpClient'

const jsonHeaders = () => ({ 'Content-Type': 'application/json', ...authHeaders() })
const CHATBOT_API_BASE = (
  import.meta.env.VITE_CHATBOT_API_URL
  ?? import.meta.env.VITE_API_BASE_URL
  ?? 'http://localhost:5100'
).replace(/\/$/, '')

const EMBEDDING_API_BASE = (
  import.meta.env.VITE_EMBEDDING_API_URL
  ?? 'http://localhost:5101'
).replace(/\/$/, '')

const resolveChatbotUrl = (path) => {
  return `${CHATBOT_API_BASE}${path}`
}

const resolveEmbeddingUrl = (path) => {
  return `${EMBEDDING_API_BASE}${path}`
}

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

const streamSseTextResponse = async ({ path, body, onChunk }) => {
  const response = await fetch(resolveChatbotUrl(path), {
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
  let buffer = ''
  let result = ''
  let meta = {}

  const handleSseData = (line) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload) return
    try {
      const parsed = JSON.parse(payload)
      if (parsed?.error) {
        throw new Error(parsed.error)
      }
      if (parsed?.chat_id) {
        meta = { ...meta, chat_id: parsed.chat_id }
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
        if (onChunk) onChunk(chunk)
      }
      return
    } catch (err) {
      if (payload && payload !== '[DONE]') {
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
    }
  }
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
      snippet: source.ocr_content ?? source.description ?? source.press_release ?? source.content ?? '',
      raw: item,
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

export const summarizeDocumentWithChatbot = async ({ chatId, pressReleases }, onChunk) => {
  const { text, meta } = await streamSseTextResponse({
    path: '/api/chatbot/summarize-multiple',
    body: {
      chat_id: chatId,
      press_releases: pressReleases,
      stream: true,
    },
    onChunk,
  })
  return { summary: text, chat_id: meta?.chat_id ?? chatId ?? null, token_usage: meta?.token_usage ?? null }
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
  return { answer: text, chat_id: meta?.chat_id ?? chatId ?? null, token_usage: meta?.token_usage ?? null }
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
    intent: meta?.intent ?? null,
    sources: meta?.sources ?? null,
    token_usage: meta?.token_usage ?? null,
  }
}

export const startEmbeddingJob = async (payload) => {
  const response = await fetch(resolveEmbeddingUrl('/embed/jobs'), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const message = await parseErrorMessage(response)
    throw new Error(message)
  }
  return response.json()
}

export const getEmbeddingJobStatus = async (jobId) => {
  const response = await fetch(resolveEmbeddingUrl(`/embed/jobs/${encodeURIComponent(jobId)}`), {
    headers: jsonHeaders(),
  })
  if (!response.ok) {
    const message = await parseErrorMessage(response)
    throw new Error(message)
  }
  return response.json()
}
