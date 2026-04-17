import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AnnounceContext } from '../contexts/AnnounceContext'
import {
  askDocumentQuestion,
  searchChatDocuments,
  summarizeDocumentWithChatbot,
} from '../api/chatbot'

const FILTER_TYPE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'category', label: 'Category' },
  { value: 'tag', label: 'Tag' },
  { value: 'folder_path', label: 'Folder Path' },
  { value: 'metadata', label: 'Metadata' },
]

function createFilterCondition(type = 'owner') {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    value: '',
    metadataKey: '',
    metadataValue: '',
  }
}

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

function collectFolderPathOptions(nodes = [], trail = []) {
  const options = []
  for (const node of nodes) {
    const nextTrail = [...trail, node.name].filter(Boolean)
    if (node.id && nextTrail.length) {
      const path = nextTrail.join(' / ')
      options.push({ value: path, label: path })
    }
    if (node.children?.length) {
      options.push(...collectFolderPathOptions(node.children, nextTrail))
    }
  }
  return options
}

export default function ChatbotPanel({ selectedDocument, onDocumentSelect, open: openProp, onOpenChange, folders = [] }) {
  const { toast } = useContext(AnnounceContext)
  const resizeStateRef = useRef(null)
  const sectionResizeStateRef = useRef(null)
  const initialMessages = useMemo(() => ([
    {
      role: 'ai',
      content: 'Hello! Select 1-3 documents to compare and summarize them.',
    },
  ]), [])
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
  const [filterConditions, setFilterConditions] = useState([createFilterCondition()])
  const [panelSize, setPanelSize] = useState({ width: 1180, height: 820 })
  const [panelPosition, setPanelPosition] = useState({ left: null, top: null })
  const [sectionWidths, setSectionWidths] = useState({ filters: 320, results: 430 })
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
  const [messages, setMessages] = useState(initialMessages)
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

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return
    }

    const nextLeft = Math.max(12, window.innerWidth - panelSize.width - 20)
    const nextTop = Math.max(12, window.innerHeight - panelSize.height - 80)

    setPanelPosition((prev) => ({
      left: prev.left == null ? nextLeft : Math.min(Math.max(prev.left, 12), Math.max(12, window.innerWidth - panelSize.width - 12)),
      top: prev.top == null ? nextTop : Math.min(Math.max(prev.top, 12), Math.max(12, window.innerHeight - panelSize.height - 12)),
    }))
  }, [open, panelSize.height, panelSize.width])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleWindowResize = () => {
      setPanelSize((prev) => ({
        width: Math.min(prev.width, window.innerWidth - 24),
        height: Math.min(prev.height, window.innerHeight - 24),
      }))
      setPanelPosition((prev) => ({
        left: prev.left == null ? prev.left : Math.min(Math.max(prev.left, 12), Math.max(12, window.innerWidth - panelSize.width - 12)),
        top: prev.top == null ? prev.top : Math.min(Math.max(prev.top, 12), Math.max(12, window.innerHeight - panelSize.height - 12)),
      }))
    }

    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [panelSize.height, panelSize.width])

  const folderPathOptions = useMemo(() => collectFolderPathOptions(folders), [folders])
  const isThreeColumnResizable = panelSize.width > 1100

  const templateStyle = useMemo(() => {
    if (!isThreeColumnResizable) {
      return undefined
    }
    return {
      gridTemplateColumns: `${sectionWidths.filters}px 10px ${sectionWidths.results}px 10px minmax(320px, 1fr)`,
    }
  }, [isThreeColumnResizable, sectionWidths.filters, sectionWidths.results])

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

  const addFilterCondition = () => {
    setFilterConditions((prev) => [...prev, createFilterCondition()])
  }

  const removeFilterCondition = (id) => {
    setFilterConditions((prev) => {
      if (prev.length <= 1) {
        return [createFilterCondition()]
      }
      return prev.filter((condition) => condition.id !== id)
    })
  }

  const updateFilterCondition = (id, changes) => {
    setFilterConditions((prev) => prev.map((condition) => {
      if (condition.id !== id) {
        return condition
      }
      const next = { ...condition, ...changes }
      if (changes.type && changes.type !== condition.type) {
        next.value = ''
        next.metadataKey = ''
        next.metadataValue = ''
      }
      return next
    }))
  }

  const clearFilterConditions = () => {
    setFilterConditions([createFilterCondition()])
  }

  const handleResizeStart = (mode, event) => {
    event.preventDefault()
    event.stopPropagation()
    resizeStateRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: panelPosition.left ?? Math.max(12, window.innerWidth - panelSize.width - 20),
      startWidth: panelSize.width,
      startHeight: panelSize.height,
      minWidth: 980,
      minHeight: 620,
    }

    const handlePointerMove = (moveEvent) => {
      const state = resizeStateRef.current
      if (!state) {
        return
      }

      const anchorRight = Math.min(state.startLeft + state.startWidth, window.innerWidth - 12)
      const nextWidth = state.mode === 'height'
        ? state.startWidth
        : Math.min(
          Math.max(state.startWidth + (state.startX - moveEvent.clientX), state.minWidth),
          Math.max(state.minWidth, anchorRight - 12),
        )
      const nextHeight = state.mode === 'width-left'
        ? state.startHeight
        : Math.min(
          Math.max(state.startHeight + (moveEvent.clientY - state.startY), state.minHeight),
          window.innerHeight - 24,
        )

      if (state.mode === 'width-left') {
        setPanelPosition((prev) => ({
          ...prev,
          left: anchorRight - nextWidth,
        }))
      }

      setPanelSize({ width: nextWidth, height: nextHeight })
    }

    const handlePointerUp = () => {
      resizeStateRef.current = null
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
  }

  const handleSectionResizeStart = (section, event) => {
    if (!isThreeColumnResizable) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    sectionResizeStateRef.current = {
      section,
      startX: event.clientX,
      startFiltersWidth: sectionWidths.filters,
      startResultsWidth: sectionWidths.results,
    }

    const handlePointerMove = (moveEvent) => {
      const state = sectionResizeStateRef.current
      if (!state) {
        return
      }

      const deltaX = moveEvent.clientX - state.startX
      const panelInnerWidth = Math.max(panelSize.width - 72, 960)
      const splitterAllowance = 20
      const chatMinWidth = 320
      const filtersMinWidth = 260
      const resultsMinWidth = 300

      if (state.section === 'filters') {
        const maxFiltersWidth = Math.max(filtersMinWidth, panelInnerWidth - splitterAllowance - state.startResultsWidth - chatMinWidth)
        const nextFiltersWidth = Math.min(Math.max(state.startFiltersWidth + deltaX, filtersMinWidth), maxFiltersWidth)
        setSectionWidths((prev) => ({ ...prev, filters: nextFiltersWidth }))
        return
      }

      const maxResultsWidth = Math.max(resultsMinWidth, panelInnerWidth - splitterAllowance - sectionWidths.filters - chatMinWidth)
      const nextResultsWidth = Math.min(Math.max(state.startResultsWidth + deltaX, resultsMinWidth), maxResultsWidth)
      setSectionWidths((prev) => ({ ...prev, results: nextResultsWidth }))
    }

    const handlePointerUp = () => {
      sectionResizeStateRef.current = null
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
  }

  const resetChatSession = () => {
    setChatId(null)
    setMessages(initialMessages)
    setError('')
    toast && toast('Started a new chat session.', { type: 'info' })
  }

  const runSearch = async ({ page = 1, perPage = itemsPerPage } = {}) => {
    setSearchLoading(true)
    setError('')
    try {
      const owners = []
      const categories = []
      const tags = []
      const folderPaths = []
      const metadataFilters = {}

      filterConditions.forEach((condition) => {
        if (condition.type === 'owner' && condition.value.trim()) {
          owners.push(condition.value.trim())
        }
        if (condition.type === 'category' && condition.value.trim()) {
          categories.push(condition.value.trim())
        }
        if (condition.type === 'tag' && condition.value.trim()) {
          tags.push(condition.value.trim())
        }
        if (condition.type === 'folder_path' && condition.value.trim()) {
          folderPaths.push(condition.value.trim())
        }
        if (condition.type === 'metadata' && condition.metadataKey.trim() && condition.metadataValue.trim()) {
          metadataFilters[condition.metadataKey.trim()] = condition.metadataValue.trim()
        }
      })

      const data = await searchChatDocuments({
        prompt: prompt.trim(),
        startDate,
        endDate,
        owners,
        categories,
        tags,
        folderPaths,
        metadataFilters,
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
      <div className="chatbot-template" style={templateStyle}>
        <div className="chatbot-template__filters-section">
          <div className="chatbot-template__header">
            <h3>Filters</h3>
            <p>Refine the document search before running it.</p>
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

          <div className="chatbot-template__filters chatbot-template__filters--pair">
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

          <div className="chatbot-template__condition-builder">
            <div className="chatbot-template__condition-header">
              <span>Conditions</span>
              <div className="chatbot-template__condition-actions">
                <button type="button" className="ghost" onClick={addFilterCondition}>Add Condition</button>
                <button type="button" className="ghost" onClick={clearFilterConditions}>Clear</button>
              </div>
            </div>

            <div className="chatbot-template__condition-list">
              {filterConditions.map((condition) => (
                <div key={condition.id} className="chatbot-template__condition-row">
                  <label>
                    <span>Type</span>
                    <select
                      value={condition.type}
                      onChange={(event) => updateFilterCondition(condition.id, { type: event.target.value })}
                    >
                      {FILTER_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  {condition.type === 'metadata' ? (
                    <>
                      <label>
                        <span>Metadata Key</span>
                        <input
                          type="text"
                          placeholder="department"
                          value={condition.metadataKey}
                          onChange={(event) => updateFilterCondition(condition.id, { metadataKey: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>Metadata Value</span>
                        <input
                          type="text"
                          placeholder="Finance"
                          value={condition.metadataValue}
                          onChange={(event) => updateFilterCondition(condition.id, { metadataValue: event.target.value })}
                        />
                      </label>
                    </>
                  ) : condition.type === 'folder_path' ? (
                    <label className="chatbot-template__condition-field chatbot-template__condition-field--wide">
                      <span>Folder Path</span>
                      <select
                        value={condition.value}
                        onChange={(event) => updateFilterCondition(condition.id, { value: event.target.value })}
                      >
                        <option value="">Select folder path</option>
                        {folderPathOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="chatbot-template__condition-field chatbot-template__condition-field--wide">
                      <span>Value</span>
                      <input
                        type="text"
                        placeholder={`Enter ${condition.type.replace('_', ' ')}`}
                        value={condition.value}
                        onChange={(event) => updateFilterCondition(condition.id, { value: event.target.value })}
                      />
                    </label>
                  )}

                  <button
                    type="button"
                    className="ghost chatbot-template__condition-remove"
                    onClick={() => removeFilterCondition(condition.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
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
        </div>

        {isThreeColumnResizable && (
          <div
            className="chatbot-template__section-resizer"
            role="presentation"
            onMouseDown={(event) => handleSectionResizeStart('filters', event)}
          />
        )}

        <div className="chatbot-template__results-section">
          <div className="chatbot-template__results-card">
            <div className="chatbot-template__results-head">
              <div>
                <h4>Search Results</h4>
                <p>Review matches and focus a document for chat.</p>
              </div>
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
                        {result.folderPath ? ` · ${result.folderPath}` : ''}
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

        {isThreeColumnResizable && (
          <div
            className="chatbot-template__section-resizer"
            role="presentation"
            onMouseDown={(event) => handleSectionResizeStart('results', event)}
          />
        )}

        <div className="chatbot-template__chat-section">
          <div className="chatbot-template__chat-head">
            <div>
              <h4>AI Assistant</h4>
              <p>Get summaries and insights about selected documents.</p>
            </div>
            <button type="button" className="ghost" onClick={resetChatSession} disabled={qaLoading || summaryLoading}>
              New Session
            </button>
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
            {chatId && <span className="chatbot-template__active-doc">Session: {chatId}</span>}
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
            style={{
              width: `${panelSize.width}px`,
              height: `${panelSize.height}px`,
              left: panelPosition.left == null ? undefined : `${panelPosition.left}px`,
              top: panelPosition.top == null ? undefined : `${panelPosition.top}px`,
            }}
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
            <div
              className="chatbot-floating-panel__resize-handle chatbot-floating-panel__resize-handle--left"
              role="presentation"
              onMouseDown={(event) => handleResizeStart('width-left', event)}
            />
            <div
              className="chatbot-floating-panel__resize-handle chatbot-floating-panel__resize-handle--bottom"
              role="presentation"
              onMouseDown={(event) => handleResizeStart('height', event)}
            />
            {renderPanel()}
          </div>
        </div>
      )}
    </>
  )
}
