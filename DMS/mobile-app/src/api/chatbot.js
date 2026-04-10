import { fetchJson, fetchText } from './httpClient'

export const searchChatDocuments = async ({ prompt, limit } = {}) => {
  return fetchJson('/api/chatbot/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, limit }),
  })
}

export const summarizeDocumentWithChatbot = async (documentId) => {
  const summary = await fetchText(`/api/chatbot/documents/${documentId}/summary/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return { summary }
}

export const askDocumentQuestion = async (documentId, question) => {
  const answer = await fetchText(`/api/chatbot/documents/${documentId}/qa/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  return { answer }
}
