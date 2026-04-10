import { useContext, useEffect, useMemo, useState } from 'react'
import { AnnounceContext } from '../contexts/AnnounceContext'
import {
  askDocumentQuestion,
  searchChatDocuments,
  summarizeDocumentWithChatbot,
} from '../api/chatbot'

/**
 * Converts a plain markdown-ish string to safe HTML for chat rendering.
 * HTML entities are escaped first to prevent XSS; only known markdown
 * patterns are then converted to allowed tags.
 */
function formatMessage(text) {
  if (!text) return ''
  // 1. Escape raw HTML so injected tags cannot execute
  let msg = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // 2. Headings (## … ######)
  msg = msg.replace(/^#{2,6} (.+)$/gm, '<h3>$1</h3>')
  // 3. Bold **text**
  msg = msg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  // 4. Inline code `code`
  msg = msg.replace(/`([^`]+)`/g, '<code>$1</code>')
  // 5. Unordered list items (- or *)
  msg = msg.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
  // 6. Newlines
  msg = msg.replace(/\n\n/g, '<br><br>')
  msg = msg.replace(/\n/g, '<br>')
  return msg
}

export default function ChatbotPanel({ selectedDocument, onDocumentSelect, open: openProp, onOpenChange }) {
  const { toast } = useContext(AnnounceContext)
  const [internalOpen, setInternalOpen] = useState(false)
  const controlled = typeof openProp === 'boolean'
  const open = controlled ? openProp : internalOpen
  const setOpen = (v) => {
    if (typeof v === 'function') {
      if (!controlled) {
        setInternalOpen((prev) => {
          const next = v(prev)
          onOpenChange && onOpenChange(next)
          return next
        })
      } else {
        const next = v(open)
        onOpenChange && onOpenChange(next)
      }
    } else {
      if (!controlled) setInternalOpen(v)
      onOpenChange && onOpenChange(v)
    }
  }
  const [prompt, setPrompt] = useState('')
  const [question, setQuestion] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [searchMode, setSearchMode] = useState('hybrid')
  const [searchResults, setSearchResults] = useState([])
  const [totalResults, setTotalResults] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [searchLoading, setSearchLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [qaLoading, setQaLoading] = useState(false)
  const [chatId, setChatId] = useState(null)
  const [activeDocumentId, setActiveDocumentId] = useState(null)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([])
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      content: 'Hello! Select 1-3 documents to compare and summarize them.',
    },
  ])
  const [error, setError] = useState('')

  useEffect(() => {
    const today = new Date()
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(today.getFullYear() - 2)
    const formatDate = (value) => value.toISOString().slice(0, 10)
    setStartDate(formatDate(twoYearsAgo))
    setEndDate(formatDate(today))
  }, [])

  useEffect(() => {
    if (selectedDocument?.id) {
      setActiveDocumentId(selectedDocument.id)
    }
  }, [selectedDocument])

  const allSelectableDocuments = useMemo(() => {
    const mappedSelectedDocument = selectedDocument?.id
      ? {
          documentId: selectedDocument.id,
          title: selectedDocument.title || 'Untitled',
          owner: selectedDocument.owner || '',
          category: selectedDocument.category || '',
          snippet: selectedDocument.description || '',
          raw: {
            source: {
              updatedAt: selectedDocument.updatedAt,
              updated_at: selectedDocument.updated_at,
            },
          },
          metadata: selectedDocument.metadata,
        }
      : null

    const byId = new Map()
    if (mappedSelectedDocument) {
      byId.set(mappedSelectedDocument.documentId, mappedSelectedDocument)
    }
    for (const item of searchResults) {
      byId.set(item.documentId, item)
    }
    return Array.from(byId.values())
  }, [searchResults, selectedDocument])

  const activeDocument = useMemo(
    () => allSelectableDocuments.find((item) => item.documentId === activeDocumentId) || null,
    [activeDocumentId, allSelectableDocuments],
  )

  const selectedPressReleases = useMemo(() => {
    return selectedDocumentIds
      .map((docId) => allSelectableDocuments.find((item) => item.documentId === docId))
      .filter(Boolean)
      .map((doc) => {
        const title = doc.title || 'Untitled'
        const date =
          doc?.raw?.source?.formatted_date
          || doc?.raw?.source?.release_date
          || doc?.raw?.source?.updatedAt
          || doc?.raw?.source?.updated_at
          || selectedDocument?.updatedAt
          || selectedDocument?.updated_at
          || new Date().toISOString().slice(0, 10)
        const content = [
          doc.snippet,
          selectedDocument?.description,
          doc?.metadata ? JSON.stringify(doc.metadata, null, 2) : '',
          selectedDocument?.metadata ? JSON.stringify(selectedDocument.metadata, null, 2) : '',
        ].filter(Boolean).join('\n\n')
        return {
          id: doc.documentId,
          title,
          date,
          content: content || title,
        }
      })
  }, [selectedDocumentIds, allSelectableDocuments, selectedDocument])

  const appendMessage = (role, content = '', loading = false) => {
    setMessages((prev) => [...prev, { role, content, loading }])
  }

  const updateLastAiMessage = (updater) => {
    setMessages((prev) => {
      if (!prev.length) return prev
      const next = [...prev]
      const lastIndex = next.length - 1
      const last = next[lastIndex]
      if (last.role !== 'ai') return prev
      next[lastIndex] = {
        ...last,
        ...updater(last),
      }
      return next
    })
  }

  const toggleDocumentSelection = (documentId, checked) => {
    setSelectedDocumentIds((prev) => {
      if (checked) {
        if (prev.includes(documentId)) {
          return prev
        }
        if (prev.length >= 3) {
          const message = 'Maximum of 3 documents can be selected'
          setError(message)
          toast && toast(message, { type: 'error' })
          return prev
        }
        return [...prev, documentId]
      }
      return prev.filter((id) => id !== documentId)
    })
  }

  const clearAllSelections = () => {
    setSelectedDocumentIds([])
  }

  const runSearch = async ({ page = 1, perPage = itemsPerPage } = {}) => {
    setSearchLoading(true)
    setError('')
    try {
      const data = await searchChatDocuments({
        prompt: prompt.trim(),
        startDate,
        endDate,
        page,
        perPage,
        searchMode,
      })
      setSearchResults(data.results ?? [])
      setTotalResults(data.total ?? 0)
      setCurrentPage(data.page ?? page)
      setItemsPerPage(data.perPage ?? perPage)
      setTotalPages(Math.max(1, data.totalPages ?? 1))
      if (data.results?.length && !activeDocumentId) {
        setActiveDocumentId(data.results[0].documentId)
      }
    } catch (err) {
      const message = err.message || 'Search failed'
      setError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSearch = async (event) => {
    event.preventDefault()
    await runSearch({ page: 1, perPage: itemsPerPage })
  }

  const handleGoToPage = async (page) => {
    if (page < 1 || page > totalPages || page === currentPage) {
      return
    }
    await runSearch({ page, perPage: itemsPerPage })
  }

  const handlePerPageChange = async (event) => {
    const value = Number(event.target.value) || 20
    setItemsPerPage(value)
    await runSearch({ page: 1, perPage: value })
  }

  const handleSummarizeSelected = async () => {
    if (!selectedPressReleases.length) {
      setError('Select 1-3 documents to summarize')
      return
    }

    setSummaryLoading(true)
    setError('')

    appendMessage('user', `Summarize ${selectedPressReleases.length} selected document(s)`)
    appendMessage('ai', 'AI Assistant is thinking...', true)

    try {
      const data = await summarizeDocumentWithChatbot({
        chatId,
        pressReleases: selectedPressReleases,
      }, (chunk) => {
        updateLastAiMessage((last) => ({
          content: `${last.loading ? '' : last.content}${chunk}`,
          loading: false,
        }))
      })
      if (data?.chat_id) {
        setChatId(data.chat_id)
      }
      const completedSummary = (data.summary || '').trim()
      updateLastAiMessage(() => ({
        content: completedSummary || 'No summary was generated.',
        loading: false,
      }))
    } catch (err) {
      const message = err.message || 'Summary failed'
      setError(message)
      toast && toast(message, { type: 'error' })
      updateLastAiMessage(() => ({ content: `Error: ${message}`, loading: false }))
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleQuestion = async (event) => {
    event.preventDefault()
    if (!selectedPressReleases.length) {
      setError('Select 1-3 documents before asking a question')
      return
    }
    if (!question.trim()) {
      setError('Type a question before asking the assistant')
      return
    }
    setQaLoading(true)
    setError('')

    try {
      const trimmed = question.trim()
      appendMessage('user', trimmed)
      setQuestion('')
      appendMessage('ai', 'AI Assistant is thinking...', true)

      const data = await askDocumentQuestion({
        question: trimmed,
        chatId,
        pressReleases: selectedPressReleases,
      }, (chunk) => {
        updateLastAiMessage((last) => ({
          content: `${last.loading ? '' : last.content}${chunk}`,
          loading: false,
        }))
      })
      if (data?.chat_id) {
        setChatId(data.chat_id)
      }
      const completedAnswer = (data.answer || '').trim()
      updateLastAiMessage(() => ({
        content: completedAnswer || 'No response was generated.',
        loading: false,
      }))
    } catch (err) {
      const message = err.message || 'Unable to answer right now'
      setError(message)
      toast && toast(message, { type: 'error' })
      updateLastAiMessage(() => ({ content: `Error: ${message}`, loading: false }))
    } finally {
      setQaLoading(false)
    }
  }

  const handleResultFocus = (documentId) => {
    setActiveDocumentId(documentId)
    onDocumentSelect && onDocumentSelect(documentId)
  }

  const paginationModel = useMemo(() => {
    if (totalPages <= 1) {
      return [1]
    }
    const maxVisible = 5
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
    let end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }

    const pages = []
    if (start > 1) {
      pages.push(1)
      if (start > 2) {
        pages.push('ellipsis-left')
      }
    }
    for (let value = start; value <= end; value += 1) {
      pages.push(value)
    }
    if (end < totalPages) {
      if (end < totalPages - 1) {
        pages.push('ellipsis-right')
      }
      pages.push(totalPages)
    }
    return pages
  }, [currentPage, totalPages])

  const renderPanel = () => (
    <section className="chatbot-panel chatbot-panel--template">
      <div className="chatbot-template">
        <div className="chatbot-template__search-section">
          <div className="chatbot-template__header">
            <h3>Search Documents</h3>
            <p>Search through archived documents with filters.</p>
          </div>

          <form className="chatbot-template__search-box" onSubmit={handleSearch}>
            <input
              id="chatbot-search"
              type="text"
              placeholder="Search documents..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <button type="submit" className="primary" disabled={searchLoading}>Search</button>
          </form>

          <div className="chatbot-template__filters">
            <label>
              <span>From Date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              <span>To Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>

          <div className="chatbot-template__search-mode">
            <label>
              <input
                type="radio"
                name="search-mode"
                value="text"
                checked={searchMode === 'text'}
                onChange={() => setSearchMode('text')}
              />
              <span>Text Search Only</span>
            </label>
            <label>
              <input
                type="radio"
                name="search-mode"
                value="hybrid"
                checked={searchMode === 'hybrid'}
                onChange={() => setSearchMode('hybrid')}
              />
              <span>Natural Language Search</span>
            </label>
          </div>

          <div className="chatbot-template__results-card">
            <div className="chatbot-template__results-head">
              <h4>Search Results</h4>
              <span>{totalResults} {totalResults === 1 ? 'release' : 'releases'} found</span>
            </div>

            <div className="chatbot-panel__action-bar" style={{ display: selectedDocumentIds.length ? 'flex' : 'none' }}>
              <button
                type="button"
                className="ghost"
                onClick={handleSummarizeSelected}
                disabled={summaryLoading || !selectedDocumentIds.length}
              >
                {summaryLoading ? 'Processing…' : 'Summarize Selected (Max 3)'}
              </button>
              <button type="button" className="ghost" onClick={clearAllSelections}>Clear Selection</button>
              <span className="chatbot-panel__selection-count">{selectedDocumentIds.length} selected</span>
            </div>

            {searchLoading && (
              <div className="chatbot-template__loading">Searching documents...</div>
            )}

            {!searchLoading && !searchResults.length && (
              <div className="chatbot-template__empty">No documents found matching your criteria.</div>
            )}

            {!searchLoading && !!searchResults.length && (
              <ul className="chatbot-template__results-list">
                {searchResults.map((result) => (
                  <li key={result.documentId} className={result.documentId === activeDocumentId ? 'is-active' : ''}>
                    <input
                      type="checkbox"
                      className="chatbot-template__checkbox"
                      checked={selectedDocumentIds.includes(result.documentId)}
                      onChange={(event) => toggleDocumentSelection(result.documentId, event.target.checked)}
                    />
                    <div className="chatbot-template__result-body">
                      <p className="chatbot-panel__result-title">{result.title}</p>
                      <p className="chatbot-panel__result-meta">
                        {result.owner ? `Owner: ${result.owner}` : 'Unknown owner'} · {result.category || 'Uncategorized'}
                        {Number.isFinite(result.relevanceScore) ? ` · Score: ${result.relevanceScore.toFixed(3)}` : ''}
                      </p>
                      <p className="chatbot-panel__result-snippet">{result.snippet || 'No preview content'}</p>
                    </div>
                    <button type="button" className="ghost" onClick={() => handleResultFocus(result.documentId)}>
                      Focus
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="chatbot-template__pagination" style={{ display: totalResults ? 'flex' : 'none' }}>
              <div className="chatbot-template__pagination-controls">
                <button
                  type="button"
                  className="ghost"
                  disabled={currentPage <= 1}
                  onClick={() => handleGoToPage(currentPage - 1)}
                >
                  Prev
                </button>
                {paginationModel.map((item) => {
                  if (typeof item !== 'number') {
                    return <span key={item} className="chatbot-template__ellipsis">...</span>
                  }
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`ghost ${item === currentPage ? 'is-current' : ''}`}
                      onClick={() => handleGoToPage(item)}
                    >
                      {item}
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="ghost"
                  disabled={currentPage >= totalPages}
                  onClick={() => handleGoToPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
              <div className="chatbot-template__page-info">Page {currentPage} of {totalPages}</div>
              <label className="chatbot-template__per-page">
                <span>Show</span>
                <select value={itemsPerPage} onChange={handlePerPageChange}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="chatbot-template__chat-section">
          <div className="chatbot-template__chat-head">
            <div>
              <h4>AI Assistant</h4>
              <p>Get summaries and insights about selected documents.</p>
            </div>
          </div>

          <div className="chatbot-panel__chat-window">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`chatbot-panel__message chatbot-panel__message--${message.role}`}>
                <div className="chatbot-panel__message-content">
                  {message.role === 'user'
                    ? message.content
                    : message.loading
                      ? (
                        <span className="chatbot-panel__loading-dots">
                          <span>AI is thinking</span>
                          <span className="chatbot-panel__dot" />
                          <span className="chatbot-panel__dot" />
                          <span className="chatbot-panel__dot" />
                        </span>
                      )
                      : <span dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }} />
                  }
                </div>
                <div className="chatbot-panel__message-meta">{message.role === 'user' ? 'You' : 'AI Assistant'}</div>
              </div>
            ))}
          </div>

          <form className="chatbot-template__chat-input" onSubmit={handleQuestion}>
            <input
              id="chatbot-question"
              type="text"
              placeholder="Ask about the selected document..."
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button type="submit" className="primary" disabled={qaLoading}>
              {qaLoading ? 'Sending...' : 'Send'}
            </button>
          </form>

          <div className="chatbot-template__chat-actions">
            {activeDocument?.title && <span className="chatbot-template__active-doc">Focused: {activeDocument.title}</span>}
          </div>

          {error && <p className="feedback feedback--error">{error}</p>}
        </div>
      </div>
    </section>
  )

  return (
    <>
      <div
        className="chatbot-floating-icon"
        role="button"
        aria-label={open ? 'Minimize DeepSeek assistant' : 'Open DeepSeek assistant'}
        title={open ? 'Minimize DeepSeek assistant' : 'Open DeepSeek assistant'}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      {open && (
        <div className="chatbot-overlay" onMouseDown={() => setOpen(false)}>
          <div
            className="chatbot-floating-panel"
            role="dialog"
            aria-label="DeepSeek assistant"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="chatbot-floating-panel__toolbar">
              <span className="chatbot-floating-panel__title">DeepSeek assistant</span>
              <button
                type="button"
                className="ghost chatbot-floating-panel__minimize"
                aria-label="Minimize DeepSeek assistant"
                title="Minimize"
                onClick={() => setOpen(false)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M5 12h14" />
                </svg>
              </button>
            </div>
            {renderPanel()}
          </div>
        </div>
      )}
    </>
  )
}
