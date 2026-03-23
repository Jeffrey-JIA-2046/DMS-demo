import { useContext, useEffect, useMemo, useState } from 'react'
import { AnnounceContext } from '../contexts/AnnounceContext'
import {
  askDocumentQuestion,
  searchChatDocuments,
  summarizeDocumentWithChatbot,
} from '../api/chatbot'

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
  const [searchResults, setSearchResults] = useState([])
  const [searchOverview, setSearchOverview] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [qaLoading, setQaLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [answer, setAnswer] = useState('')
  const [activeDocumentId, setActiveDocumentId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (selectedDocument?.id) {
      setActiveDocumentId(selectedDocument.id)
    }
  }, [selectedDocument])

  useEffect(() => {
    setSummary('')
    setAnswer('')
  }, [activeDocumentId])

  const activeDocument = useMemo(() => {
    if (!activeDocumentId) {
      return null
    }
    if (selectedDocument?.id === activeDocumentId) {
      return {
        id: selectedDocument.id,
        title: selectedDocument.title,
        owner: selectedDocument.owner,
        category: selectedDocument.category,
      }
    }
    return searchResults.find((item) => item.documentId === activeDocumentId) || null
  }, [activeDocumentId, selectedDocument, searchResults])

  const handleSearch = async (event) => {
    event.preventDefault()
    if (!prompt.trim()) {
      setError('Enter a prompt to search across documents')
      return
    }
    setSearchLoading(true)
    setError('')
    try {
      const data = await searchChatDocuments({ prompt: prompt.trim(), limit: 5 })
      setSearchResults(data.results ?? [])
      setSearchOverview(data.overview ?? '')
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

  const handleSummarize = async () => {
    if (!activeDocumentId) {
      setError('Choose a document to summarize')
      return
    }
    setSummaryLoading(true)
    setError('')
    setSummary('')
    try {
      const data = await summarizeDocumentWithChatbot(activeDocumentId, (chunk) => {
        setSummary((prev) => prev + chunk)
      })
      setSummary((data.summary || '').trim())
    } catch (err) {
      const message = err.message || 'Summary failed'
      setError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setSummaryLoading(false)
    }
  }

  const handleQuestion = async (event) => {
    event.preventDefault()
    if (!activeDocumentId) {
      setError('Select a document, then ask your question')
      return
    }
    if (!question.trim()) {
      setError('Type a question before asking the assistant')
      return
    }
    setQaLoading(true)
    setError('')
    setAnswer('')
    try {
      const trimmed = question.trim()
      const data = await askDocumentQuestion(activeDocumentId, trimmed, (chunk) => {
        setAnswer((prev) => prev + chunk)
      })
      setAnswer((data.answer || '').trim())
    } catch (err) {
      const message = err.message || 'Unable to answer right now'
      setError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setQaLoading(false)
    }
  }

  const handleResultSelect = (documentId) => {
    setActiveDocumentId(documentId)
    onDocumentSelect && onDocumentSelect(documentId)
  }

  const renderPanel = () => (
    <section className="chatbot-panel">
      <div className="chatbot-panel__header">
        <div>
          <p className="eyebrow">DeepSeek copilots your review</p>
          <h3>Ask the Document Concierge</h3>
          <p className="chatbot-panel__intro">
            Search with plain language, then let DeepSeek summarize or interrogate any file without leaving the workspace.
          </p>
        </div>
      </div>

      <form className="chatbot-panel__search" onSubmit={handleSearch}>
        <label htmlFor="chatbot-search" className="field">
          <span>What do you need?</span>
          <input
            id="chatbot-search"
            type="text"
            placeholder="e.g. security policy for onboarding"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <button type="submit" className="primary" disabled={searchLoading}>
          {searchLoading ? 'Searching…' : 'Search with DeepSeek'}
        </button>
      </form>

      {searchOverview && (
        <div className="chatbot-panel__overview">
          <p className="eyebrow">Assistant insight</p>
          <p>{searchOverview}</p>
        </div>
      )}

      {!!searchResults.length && (
        <div className="chatbot-panel__results">
          <div className="section-header">
            <div>
              <p className="eyebrow">Suggested files</p>
              <h4>Top matches</h4>
            </div>
          </div>
          <ul>
            {searchResults.map((result) => (
              <li key={result.documentId} className={result.documentId === activeDocumentId ? 'is-active' : ''}>
                <div>
                  <p className="chatbot-panel__result-title">{result.title}</p>
                  <p className="chatbot-panel__result-meta">
                    {result.owner ? `Owner: ${result.owner}` : 'Unknown owner'} · {result.category || 'Uncategorized'}
                  </p>
                  <p className="chatbot-panel__result-snippet">{result.snippet}</p>
                </div>
                <button type="button" className="ghost" onClick={() => handleResultSelect(result.documentId)}>
                  Focus
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="chatbot-panel__actions">
        <div>
          <p className="eyebrow">Working file</p>
          <h4>{activeDocument?.title || 'No document targeted'}</h4>
          {activeDocument?.owner && <p className="chatbot-panel__result-meta">Owner · {activeDocument.owner}</p>}
        </div>
        <div className="chatbot-panel__action-buttons">
          <button type="button" className="ghost" onClick={handleSummarize} disabled={summaryLoading || !activeDocumentId}>
            {summaryLoading ? 'Streaming…' : 'Summarize selection'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (selectedDocument?.id) {
                handleResultSelect(selectedDocument.id)
              }
            }}
          >
            Sync with viewer
          </button>
        </div>
      </div>

      {summary && (
        <div className="chatbot-panel__summary">
          <p className="eyebrow">Summary</p>
          <p>{summary}</p>
        </div>
      )}

      <form className="chatbot-panel__qa" onSubmit={handleQuestion}>
        <label htmlFor="chatbot-question" className="field">
          <span>Ask about this document</span>
          <textarea
            id="chatbot-question"
            rows={3}
            placeholder="What changed in version three?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <button type="submit" className="primary" disabled={qaLoading}>
          {qaLoading ? 'Streaming…' : 'Ask DeepSeek'}
        </button>
      </form>

      {answer && (
        <div className="chatbot-panel__answer">
          <p className="eyebrow">Response</p>
          <p>{answer}</p>
        </div>
      )}

      {error && <p className="feedback feedback--error">{error}</p>}
    </section>
  )

  return (
    <>
      <div
        className="chatbot-floating-icon"
        role="button"
        aria-label="Open DeepSeek assistant"
        title="Double-click to open DeepSeek assistant"
        onDoubleClick={() => setOpen((v) => !v)}
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
            onMouseLeave={() => setOpen(false)}
          >
            {renderPanel()}
          </div>
        </div>
      )}
    </>
  )
}
