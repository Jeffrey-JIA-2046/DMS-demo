import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  searchKnowledgeTopics,
  createKnowledgeTopic,
  updateKnowledgeTopic,
  fetchKnowledgeTopic,
  joinKnowledgeTopic,
  addKnowledgeContribution,
  shareKnowledgeTopic,
  starKnowledgeTopic,
  unstarKnowledgeTopic,
  linkKnowledgeDocument,
  unlinkKnowledgeDocument,
  uploadKnowledgeAttachment,
  downloadKnowledgeAttachment,
  downloadKnowledgeChain,
} from '../api/knowledge'
import { listDocuments } from '../api/documents'
import { AuthContext } from '../contexts/AuthContext'

const describeDocumentOption = (doc) => {
  if (!doc) {
    return ''
  }
  const parts = []
  if (doc.title) {
    parts.push(doc.title)
  } else {
    parts.push('Untitled')
  }
  if (doc.category) {
    parts.push(doc.category)
  }
  if (doc.owner) {
    parts.push(`Owner: ${doc.owner}`)
  }
  parts.push(`v${doc.latestVersion ?? 1}`)
  return parts.join(' · ')
}

const parseTags = (value) => {
  if (!value) return []
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const buildRelatedTopicQuery = (context) => {
  if (!context) return ''
  const title = (context.title || '').trim()
  const description = (context.description || '').trim()
  if (title) return title
  if (description) {
    return description.length > 120 ? `${description.slice(0, 120)}...` : description
  }
  return ''
}

export default function KnowledgeCollaboration({ navigationContext = null, onOpenLinkedDocument = null }) {
  const { isAuthenticated, currentUser } = useContext(AuthContext)
  const [filters, setFilters] = useState({ query: '', tags: '', starredOnly: false, joinedOnly: false })
  const [page, setPage] = useState(0)
  const [pageMeta, setPageMeta] = useState({ page: 0, size: 8, totalPages: 0, totalElements: 0 })
  const [topics, setTopics] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState(null)
  const [selectedTopicId, setSelectedTopicId] = useState(null)
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [topicLoading, setTopicLoading] = useState(false)
  const [topicError, setTopicError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [createForm, setCreateForm] = useState({ title: '', description: '', tags: '', linkDocumentId: '', linkNote: '', uploadFile: null, uploadDescription: '' })
  const [creating, setCreating] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [contributionText, setContributionText] = useState('')
  const [contributionDocId, setContributionDocId] = useState('')
  const [contributing, setContributing] = useState(false)
  const [shareForm, setShareForm] = useState({ recipients: '', message: '' })
  const [sharing, setSharing] = useState(false)
  const [linkForm, setLinkForm] = useState({ documentId: '', note: '' })
  const [linking, setLinking] = useState(false)
  const [documentQuery, setDocumentQuery] = useState('')
  const [documentOptions, setDocumentOptions] = useState([])
  const [docOptionsLoading, setDocOptionsLoading] = useState(false)
  const [docOptionsError, setDocOptionsError] = useState(null)
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [banner, setBanner] = useState(null)
  const [bannerTone, setBannerTone] = useState('info')

  const showBanner = useCallback((message, tone = 'info') => {
    setBanner(message)
    setBannerTone(tone)
    if (message) {
      setTimeout(() => setBanner(null), 4000)
    }
  }, [])
  const [editingTopicId, setEditingTopicId] = useState(null)

  const [detailPanelOpen, setDetailPanelOpen] = useState(false)

  const renderTopicDetail = (topic) => {
    if (!topic) return null
    return (
      <div className="knowledge__detail--panel">
        <div className="knowledge__detail-header">
          <div>

        {detailPanelOpen && selectedTopic && (
          <div className="topic-detail-panel" role="dialog" aria-label={`Topic detail: ${selectedTopic.title}`}>
            <div className="topic-detail-inner card">
              <button type="button" aria-label="Close topic detail" className="ghost topic-detail-close" onClick={() => setDetailPanelOpen(false)}>✕</button>
              {renderTopicDetail(selectedTopic)}
            </div>
          </div>
        )}
            <p className="eyebrow">Topic</p>
            <h2>{topic.title}</h2>
            <p className="knowledge__topic-desc">{topic.description || 'No description yet.'}</p>
            <div className="knowledge__tags">
              {(topic.tags || []).map((tag) => (
                <span key={tag} className="pill pill--info">{tag}</span>
              ))}
            </div>
          </div>
          <div className="knowledge__actions">
            <button className="ghost" onClick={handleStarToggle} disabled={!canStar}>
              {topic.starredByMe ? '★ Starred' : '☆ Star topic'}
            </button>
            {canJoin && (
              <button className="primary" onClick={handleJoin}>
                Join topic
              </button>
            )}
            {!canJoin && (
              <button className="ghost" onClick={handleDownloadChain}>
                Download chain
              </button>
            )}
          </div>
        </div>
        <div className="knowledge__stat-grid">
          {topicStats.map((stat) => (
            <div key={stat.label} className="knowledge__stat">
              <span className="eyebrow">{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const refreshTopics = useCallback(() => {
    setRefreshKey((key) => key + 1)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setTopics([])
      setSelectedTopicId(null)
      setSelectedTopic(null)
      setListError(null)
      return
    }
    let ignore = false
    const load = async () => {
      setListLoading(true)
      setListError(null)
      try {
        const response = await searchKnowledgeTopics({
          page,
          size: 8,
          query: filters.query.trim(),
          tags: parseTags(filters.tags),
          starredOnly: filters.starredOnly,
          joinedOnly: filters.joinedOnly,
        })
        if (ignore) return
        const sortedTopics = [...(response?.content ?? [])].sort((a, b) => {
          const starDelta = (b?.starCount ?? 0) - (a?.starCount ?? 0)
          if (starDelta !== 0) {
            return starDelta
          }
          return (a?.title ?? '').localeCompare(b?.title ?? '')
        })
        setTopics(sortedTopics)
        setPageMeta({
          page: response?.page ?? 0,
          size: response?.size ?? 8,
          totalPages: response?.totalPages ?? 0,
          totalElements: response?.totalElements ?? 0,
        })
        if (sortedTopics.length === 0) {
          setSelectedTopicId(null)
        } else {
          setSelectedTopicId((current) => {
            if (current && sortedTopics.some((topic) => topic.id === current)) {
              return current
            }
            return sortedTopics[0]?.id ?? null
          })
        }
      } catch (err) {
        if (!ignore) {
          setListError(err.message || 'Unable to load knowledge topics')
          setTopics([])
          setSelectedTopicId(null)
        }
      } finally {
        if (!ignore) {
          setListLoading(false)
        }
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [filters, page, isAuthenticated, refreshKey])

  useEffect(() => {
    if (!isAuthenticated || !selectedTopicId) {
      setSelectedTopic(null)
      setTopicError(null)
      return
    }
    let ignore = false
    const loadTopic = async () => {
      setTopicLoading(true)
      setTopicError(null)
      try {
        const data = await fetchKnowledgeTopic(selectedTopicId)
        if (!ignore) {
          setSelectedTopic(data)
        }
      } catch (err) {
        if (!ignore) {
          setTopicError(err.message || 'Unable to load topic details')
          setSelectedTopic(null)
        }
      } finally {
        if (!ignore) {
          setTopicLoading(false)
        }
      }
    }
    loadTopic()
    return () => {
      ignore = true
    }
  }, [selectedTopicId, isAuthenticated, refreshKey])

  useEffect(() => {
    if (!isAuthenticated) {
      setDocumentOptions([])
      setDocOptionsError(null)
      return
    }
    let ignore = false
    const loadDocuments = async () => {
      setDocOptionsLoading(true)
      setDocOptionsError(null)
      try {
        const response = await listDocuments({
          page: 0,
          size: 12,
          filters: {
            query: documentQuery.trim(),
          },
        })
        if (!ignore) {
          setDocumentOptions(response?.content ?? [])
        }
      } catch (err) {
        if (!ignore) {
          setDocOptionsError(err.message || 'Unable to load documents')
          setDocumentOptions([])
        }
      } finally {
        if (!ignore) {
          setDocOptionsLoading(false)
        }
      }
    }
    loadDocuments()
    return () => {
      ignore = true
    }
  }, [documentQuery, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !navigationContext?.stamp) {
      return
    }
    const query = buildRelatedTopicQuery(navigationContext)
    setPage(0)
    setFilters((prev) => ({
      ...prev,
      query,
      starredOnly: false,
      joinedOnly: false,
    }))
    if (query) {
      showBanner(`Showing related topics for document: ${navigationContext.title || navigationContext.documentId}`, 'info')
    }
  }, [navigationContext?.stamp, isAuthenticated, showBanner])

  const canJoin = selectedTopic && !selectedTopic.member
  const canStar = !!selectedTopic

  const handleCreateTopic = async (event) => {
    event.preventDefault()
    if (!createForm.title.trim()) {
      showBanner('Give the topic a title first.', 'error')
      return
    }
    setCreating(true)
    try {
      const wasEditing = !!editingTopicId
      const payload = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        tags: parseTags(createForm.tags),
      }
      let topic
      if (editingTopicId) {
        topic = await updateKnowledgeTopic(editingTopicId, payload)
      } else {
        topic = await createKnowledgeTopic(payload)
      }

      // If user selected an existing document to attach/link
      if (createForm.linkDocumentId) {
        try {
          const linkPayload = {
            documentId: String(createForm.linkDocumentId),
            note: createForm.linkNote,
          }
          for (let attempt = 0; attempt < 4; attempt += 1) {
            try {
              await linkKnowledgeDocument(topic.id, linkPayload)
              break
            } catch (linkErr) {
              const linkMessage = String(linkErr?.message || '').toLowerCase()
              const shouldRetry = linkErr?.status === 404 || linkMessage.includes('knowledge topic not found')
              if (!shouldRetry || attempt === 3) {
                throw linkErr
              }
              await delay(250 * (attempt + 1))
            }
          }
        } catch (linkErr) {
          showBanner(linkErr.message || 'Unable to link document', 'error')
        }
      }

      // If user uploaded a new file, attach it
      if (createForm.uploadFile) {
        try {
          await uploadKnowledgeAttachment(topic.id, createForm.uploadFile, createForm.uploadDescription)
        } catch (upErr) {
          showBanner(upErr.message || 'Unable to upload attachment', 'error')
        }
      }

      setCreateForm({ title: '', description: '', tags: '', linkDocumentId: '', linkNote: '', uploadFile: null, uploadDescription: '' })
      setSelectedTopicId(topic?.id ?? null)
      setCreateModalOpen(false)
      setEditingTopicId(null)
      showBanner(wasEditing ? 'Topic updated' : 'Topic created', 'success')
      setPage(0)
      refreshTopics()
    } catch (err) {
      showBanner(err.message || 'Unable to create topic', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async () => {
    if (!selectedTopicId) return
    try {
      const updated = await joinKnowledgeTopic(selectedTopicId)
      setSelectedTopic(updated)
      showBanner('Joined the topic', 'success')
      refreshTopics()
    } catch (err) {
      showBanner(err.message || 'Unable to join topic', 'error')
    }
  }

  const handleStarToggle = async () => {
    if (!selectedTopicId || !canStar) return
    try {
      const updated = selectedTopic?.starredByMe
        ? await unstarKnowledgeTopic(selectedTopicId)
        : await starKnowledgeTopic(selectedTopicId)
      setSelectedTopic(updated)
      refreshTopics()
    } catch (err) {
      showBanner(err.message || 'Unable to update star', 'error')
    }
  }

  const handleContribution = async (event) => {
    event.preventDefault()
    if (!selectedTopicId || !selectedTopic) return
    if (!contributionText.trim()) {
      showBanner('Add a note before publishing.', 'error')
      return
    }
    setContributing(true)
    try {
      const payload = {
        content: contributionText.trim(),
        linkedDocumentId: contributionDocId || null,
      }
      const updated = await addKnowledgeContribution(selectedTopicId, payload)
      setSelectedTopic(updated)
      setContributionText('')
      setContributionDocId('')
      showBanner('Contribution posted', 'success')
      refreshTopics()
    } catch (err) {
      showBanner(err.message || 'Unable to add contribution', 'error')
    } finally {
      setContributing(false)
    }
  }

  const handleShare = async (event) => {
    event.preventDefault()
    if (!selectedTopicId || !selectedTopic) return
    const usernames = shareForm.recipients
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    if (usernames.length === 0) {
      showBanner('Add user names to share with.', 'error')
      return
    }
    setSharing(true)
    try {
      const payload = {
        recipientUsernames: usernames,
        message: shareForm.message.trim(),
      }
      const updated = await shareKnowledgeTopic(selectedTopicId, payload)
      setSelectedTopic(updated)
      setShareForm({ recipients: '', message: '' })
      showBanner('Topic shared', 'success')
      refreshTopics()
    } catch (err) {
      showBanner(err.message || 'Unable to share topic', 'error')
    } finally {
      setSharing(false)
    }
  }

  const handleLinkDocument = async (event) => {
    event.preventDefault()
    if (!selectedTopicId || !selectedTopic) return
    if (!linkForm.documentId) {
      showBanner('Select a document to link.', 'error')
      return
    }
    setLinking(true)
    try {
      const payload = {
        documentId: linkForm.documentId,
        note: linkForm.note.trim(),
      }
      const updated = await linkKnowledgeDocument(selectedTopicId, payload)
      setSelectedTopic(updated)
      setLinkForm({ documentId: '', note: '' })
      showBanner('Document linked', 'success')
      refreshTopics()
    } catch (err) {
      showBanner(err.message || 'Unable to link document', 'error')
    } finally {
      setLinking(false)
    }
  }

  const handleUnlinkDocument = async (linkId) => {
    if (!selectedTopicId || !selectedTopic) return
    try {
      const updated = await unlinkKnowledgeDocument(selectedTopicId, linkId)
      setSelectedTopic(updated)
      showBanner('Link removed', 'success')
      refreshTopics()
    } catch (err) {
      showBanner(err.message || 'Unable to remove link', 'error')
    }
  }

  const handleUpload = async (event) => {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!selectedTopicId || !selectedTopic) return
    if (!uploadFile) {
      showBanner('Choose a file before uploading.', 'error')
      return
    }
    setUploading(true)
    try {
      const updated = await uploadKnowledgeAttachment(selectedTopicId, uploadFile, uploadDescription.trim())
      setSelectedTopic(updated)
      setUploadDescription('')
      setUploadFile(null)
      formElement.reset()
      showBanner('Attachment uploaded', 'success')
    } catch (err) {
      showBanner(err.message || 'Unable to upload file', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDownloadChain = async () => {
    if (!selectedTopicId) return
    try {
      const { blob, fileName } = await downloadKnowledgeChain(selectedTopicId)
      downloadBlob(blob, fileName)
      showBanner('Knowledge chain exported', 'success')
    } catch (err) {
      showBanner(err.message || 'Unable to download knowledge chain', 'error')
    }
  }

  const handleDownloadAttachment = async (uploadId) => {
    if (!selectedTopicId) return
    try {
      const { blob, fileName } = await downloadKnowledgeAttachment(selectedTopicId, uploadId)
      downloadBlob(blob, fileName)
    } catch (err) {
      showBanner(err.message || 'Unable to download attachment', 'error')
    }
  }

  const handleOpenLinkedDocument = async (documentId) => {
    if (!documentId) return
    if (typeof onOpenLinkedDocument === 'function') {
      onOpenLinkedDocument(String(documentId))
      return
    }
    showBanner('Document navigation is unavailable.', 'error')
  }

  const topicStats = useMemo(() => {
    if (!selectedTopic) return []
    return [
      { label: 'Contributions', value: selectedTopic.contributionCount },
      { label: 'Members', value: selectedTopic.memberCount },
      { label: 'Linked docs', value: selectedTopic.linkedDocumentCount },
      { label: 'Stars', value: selectedTopic.starCount },
    ]
  }, [selectedTopic])

  if (!isAuthenticated) {
    return (
      <section className="knowledge card">
        <div className="knowledge__empty">
          <p className="eyebrow">Knowledge collaboration</p>
          <h2>Sign in to curate knowledge topics</h2>
          <p>Create collaborative knowledge chains once you authenticate.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="knowledge card">
      <header className="knowledge__header">
        <div>
          <p className="eyebrow">Knowledge collaboration</p>
          <h2>Curate living knowledge chains</h2>
          <p>Spin up topics, pull teammates in, drop in supplemental documents, and export the full lineage for audits.</p>
        </div>
        {banner && <div className={`knowledge__banner knowledge__banner--${bannerTone}`}>{banner}</div>}
      </header>

      <div className="knowledge__grid">
        <aside className="knowledge__panel knowledge__panel--list">
          <form className="knowledge__filters" onSubmit={(e) => e.preventDefault()}>
            <div className="field">
              <label>Search</label>
              <input
                type="search"
                placeholder="Topic, tag, description"
                value={filters.query}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, query: e.target.value }))
                  setPage(0)
                }}
              />
            </div>
            <div className="field">
              <label>Tags</label>
              <input
                type="text"
                placeholder="strategy, ai, playbook"
                value={filters.tags}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, tags: e.target.value }))
                  setPage(0)
                }}
              />
            </div>
            <div className="knowledge__toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={filters.starredOnly}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, starredOnly: e.target.checked }))
                    setPage(0)
                  }}
                />
                Favorites only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.joinedOnly}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, joinedOnly: e.target.checked }))
                    setPage(0)
                  }}
                />
                Joined topics
              </label>
            </div>
          </form>

          <div className="knowledge__create">
            <div>
              <p className="eyebrow">New topic</p>
              <h3>Capture a knowledge stream</h3>
            </div>
            <button className="primary" onClick={() => setCreateModalOpen(true)}>
              New topic
            </button>
          </div>

          {createModalOpen && (
            <div
              className="upload-panel topic-create-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="topic-create-modal-title"
            >
              <div className="upload-panel__backdrop" onClick={() => { setCreateModalOpen(false); setEditingTopicId(null) }} />
              <form className="upload-panel__content topic-create-panel__content" onSubmit={handleCreateTopic} onClick={(e) => e.stopPropagation()}>
                <header>
                  <div>
                    <p className="eyebrow">New upload</p>
                    <h3 id="topic-create-modal-title">Topic metadata</h3>
                  </div>
                  <button type="button" className="ghost" onClick={() => { setCreateModalOpen(false); setEditingTopicId(null) }}>Close</button>
                </header>

                <div className="upload-panel__layout topic-create-panel__layout">
                  <div className="upload-panel__primary">
                    <label>
                      <span>Title</span>
                      <input
                        type="text"
                        value={createForm.title}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Zero-trust onboarding"
                      />
                    </label>
                    <label>
                      <span>Description</span>
                      <textarea
                        rows={4}
                        value={createForm.description}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="What problem are we solving?"
                      />
                    </label>
                    <label>
                      <span>Tags</span>
                      <input
                        type="text"
                        value={createForm.tags}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, tags: e.target.value }))}
                        placeholder="compliance, onboarding"
                      />
                      <small>Use comma-separated tags.</small>
                    </label>
                  </div>

                  <div className="upload-panel__secondary topic-create-panel__secondary">
                    <section className="folder-section">
                      <div className="folder-section__header">
                        <span>Attach document</span>
                      </div>
                      <label>
                        <span>Search documents</span>
                        <input
                          type="search"
                          placeholder="Search documents by title, owner"
                          value={documentQuery}
                          onChange={(e) => setDocumentQuery(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Select document</span>
                        <select
                          value={createForm.linkDocumentId}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, linkDocumentId: e.target.value }))}
                        >
                          <option value="">Choose a document to link</option>
                          {documentOptions.map((doc) => (
                            <option key={doc.id} value={doc.id}>{describeDocumentOption(doc)}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Link note (optional)</span>
                        <input
                          type="text"
                          placeholder="Why is this document relevant?"
                          value={createForm.linkNote}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, linkNote: e.target.value }))}
                        />
                      </label>
                      {docOptionsLoading && <p className="feedback">Loading documents...</p>}
                      {docOptionsError && <p className="feedback feedback--error">{docOptionsError}</p>}
                    </section>

                    <section className="folder-section">
                      <div className="folder-section__header">
                        <span>Upload document</span>
                      </div>
                      <label>
                        <span>Attachment</span>
                        <input
                          type="file"
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, uploadFile: e.target.files?.[0] ?? null }))}
                        />
                        <small>{createForm.uploadFile ? `Selected: ${createForm.uploadFile.name}` : 'Optional file to include in this topic.'}</small>
                      </label>
                      <label>
                        <span>Attachment note (optional)</span>
                        <input
                          type="text"
                          placeholder="File notes"
                          value={createForm.uploadDescription}
                          onChange={(e) => setCreateForm((prev) => ({ ...prev, uploadDescription: e.target.value }))}
                        />
                      </label>
                    </section>
                  </div>
                </div>

                <div className="upload-panel__actions topic-create-panel__actions">
                  <button type="button" className="ghost" onClick={() => { setCreateModalOpen(false); setEditingTopicId(null) }}>
                    Close
                  </button>
                  <button className="primary" type="submit" disabled={creating}>
                    {creating ? 'Saving...' : editingTopicId ? 'Save' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="knowledge__topic-list">
            {listLoading && <p className="knowledge__status">Loading topics…</p>}
            {listError && <div className="feedback feedback--error">{listError}</div>}
            {!listLoading && !listError && topics.length === 0 && (
              <p className="knowledge__status">No topics match the filters yet.</p>
            )}
            {topics.map((topic) => (
              <button
                key={topic.id}
                className={`knowledge__topic ${selectedTopicId === topic.id ? 'is-active' : ''}`}
                onClick={() => { setSelectedTopicId(topic.id) }}
              >
                <div>
                  <p className="knowledge__topic-title">{topic.title}</p>
                  <p className="knowledge__topic-desc">{topic.description || 'No description yet.'}</p>
                </div>
                <div className="knowledge__topic-stats">
                  <span>★ {topic.starCount}</span>
                  <span>👥 {topic.memberCount}</span>
                </div>
              </button>
            ))}
          </div>

          {pageMeta.totalPages > 1 && (
            <div className="knowledge__pagination">
              <button className="ghost ghost--small" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Prev
              </button>
              <span>{pageMeta.page + 1} / {pageMeta.totalPages || 1}</span>
              <button
                className="ghost ghost--small"
                disabled={pageMeta.totalPages === 0 || pageMeta.page >= pageMeta.totalPages - 1}
                onClick={() => setPage((p) => (pageMeta.totalPages ? Math.min(pageMeta.totalPages - 1, p + 1) : 0))}
              >
                Next
              </button>
            </div>
          )}
        </aside>

        <div className="knowledge__panel knowledge__panel--detail">
          {topicLoading && <p className="knowledge__status">Loading topic…</p>}
          {topicError && <div className="feedback feedback--error">{topicError}</div>}
          {!topicLoading && !selectedTopic && !topicError && (
            <div className="knowledge__empty">
              <h3>Select a topic</h3>
              <p>Pick a topic on the left to inspect its knowledge chain.</p>
            </div>
          )}

          {selectedTopic && !topicLoading && (
            <div className="knowledge__detail">
              <div className="knowledge__detail-header">
                <div>
                  <p className="eyebrow">Topic</p>
                  <h2>{selectedTopic.title}</h2>
                  <p className="knowledge__topic-desc">{selectedTopic.description || 'No description yet.'}</p>
                  <div className="knowledge__tags">
                    {(selectedTopic.tags || []).map((tag) => (
                      <span key={tag} className="pill pill--info">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="knowledge__actions">
                  <button className="ghost" onClick={handleStarToggle} disabled={!canStar}>
                    {selectedTopic.starredByMe ? '★ Starred' : '☆ Star topic'}
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setEditingTopicId(selectedTopic.id)
                      setCreateForm({
                        title: selectedTopic.title || '',
                        description: selectedTopic.description || '',
                        tags: (selectedTopic.tags || []).join(', '),
                        linkDocumentId: '',
                        linkNote: '',
                        uploadFile: null,
                        uploadDescription: '',
                      })
                      setCreateModalOpen(true)
                    }}
                  >
                    Edit topic
                  </button>
                  {canJoin && (
                    <button className="primary" onClick={handleJoin}>
                      Join topic
                    </button>
                  )}
                  {!canJoin && (
                    <button className="ghost" onClick={handleDownloadChain}>
                      Download chain
                    </button>
                  )}
                </div>
              </div>

              <div className="knowledge__stat-grid">
                {topicStats.map((stat) => (
                  <div key={stat.label} className="knowledge__stat">
                    <span className="eyebrow">{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>

              {!selectedTopic.member && (
                <div className="knowledge__alert">
                  <strong>{currentUser?.displayName || 'You'} are viewing in read-only mode.</strong>
                  <p>Join the topic to contribute knowledge, link documents, or drop new files.</p>
                </div>
              )}

              {selectedTopic.member && (
                <div className="knowledge__form-grid">
                  <form className="knowledge__editor" onSubmit={handleContribution}>
                    <h4>Add contribution</h4>
                    <textarea
                      rows={3}
                      placeholder="Share context, wins, or TODOs"
                      value={contributionText}
                      onChange={(e) => setContributionText(e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="Link document id (optional)"
                      value={contributionDocId}
                      onChange={(e) => setContributionDocId(e.target.value)}
                    />
                    <button className="primary" type="submit" disabled={contributing}>
                      {contributing ? 'Posting…' : 'Publish update'}
                    </button>
                  </form>

                  <form className="knowledge__editor" onSubmit={handleShare}>
                    <h4>Share topic</h4>
                    <input
                      type="text"
                      placeholder="user.one, user.two"
                      value={shareForm.recipients}
                      onChange={(e) => setShareForm((prev) => ({ ...prev, recipients: e.target.value }))}
                    />
                    <textarea
                      rows={2}
                      placeholder="Message (optional)"
                      value={shareForm.message}
                      onChange={(e) => setShareForm((prev) => ({ ...prev, message: e.target.value }))}
                    />
                    <button className="ghost" type="submit" disabled={sharing}>
                      {sharing ? 'Sharing…' : 'Send invites'}
                    </button>
                  </form>
                </div>
              )}

              {selectedTopic.member && (
                <form className="knowledge__form-row" onSubmit={handleLinkDocument}>
                  <div className="field">
                    <label>Search documents</label>
                    <input
                      type="search"
                      value={documentQuery}
                      onChange={(e) => setDocumentQuery(e.target.value)}
                      placeholder="Title, owner, category"
                    />
                    {docOptionsLoading && <small>Searching…</small>}
                    {docOptionsError && <small className="feedback feedback--error">{docOptionsError}</small>}
                  </div>
                  <div className="field">
                    <label>Select document</label>
                    <select
                      value={linkForm.documentId}
                      onChange={(e) => setLinkForm((prev) => ({ ...prev, documentId: e.target.value }))}
                      disabled={docOptionsLoading || documentOptions.length === 0}
                    >
                      <option value="">{docOptionsLoading ? 'Loading…' : 'Choose a document'}</option>
                      {documentOptions.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {describeDocumentOption(doc)}
                        </option>
                      ))}
                    </select>
                    {!docOptionsLoading && documentOptions.length === 0 && !docOptionsError && (
                      <small>No documents found.</small>
                    )}
                  </div>
                  <div className="field">
                    <label>Note</label>
                    <input
                      type="text"
                      value={linkForm.note}
                      onChange={(e) => setLinkForm((prev) => ({ ...prev, note: e.target.value }))}
                      placeholder="Why is it relevant?"
                    />
                  </div>
                  <button className="ghost" type="submit" disabled={linking}>
                    {linking ? 'Linking…' : 'Link document'}
                  </button>
                </form>
              )}

              {selectedTopic.member && (
                <form className="knowledge__form-row" onSubmit={handleUpload}>
                  <div className="field">
                    <label>Upload document</label>
                    <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                  </div>
                  <div className="field">
                    <label>Notes</label>
                    <input
                      type="text"
                      value={uploadDescription}
                      onChange={(e) => setUploadDescription(e.target.value)}
                      placeholder="Optional context"
                    />
                  </div>
                  <button className="primary" type="submit" disabled={uploading}>
                    {uploading ? 'Uploading…' : 'Attach file'}
                  </button>
                </form>
              )}

              <section className="knowledge__section">
                <header className="section-header">
                  <div>
                    <p className="eyebrow">Knowledge chain</p>
                    <h3>Latest contributions</h3>
                  </div>
                </header>
                {selectedTopic.contributions?.length === 0 ? (
                  <p className="knowledge__status">No contributions yet.</p>
                ) : (
                  <ul className="knowledge__timeline">
                    {selectedTopic.contributions.map((entry) => (
                      <li key={entry.id}>
                        <div>
                          <strong>{entry.author}</strong>
                          <p>{entry.content}</p>
                          {entry.linkedDocumentId && (
                            <small>Linked document #{entry.linkedDocumentId} · {entry.linkedDocumentTitle}</small>
                          )}
                        </div>
                        <span>{new Date(entry.createdAt).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="knowledge__section">
                <header className="section-header">
                  <div>
                    <p className="eyebrow">Linked documents</p>
                    <h3>Contextual evidence</h3>
                  </div>
                </header>
                {selectedTopic.documentLinks?.length === 0 ? (
                  <p className="knowledge__status">No linked documents yet.</p>
                ) : (
                  <ul className="knowledge__list">
                    {selectedTopic.documentLinks.map((link) => (
                      <li key={link.id}>
                        <div>
                          <strong>{link.documentTitle || `Document #${link.documentId}`}</strong>
                          <p>{link.note || 'No notes provided.'}</p>
                          <small>Linked by {link.linkedBy}</small>
                        </div>
                        <div className="knowledge__actions">
                          <button
                            type="button"
                            className="ghost icon-btn"
                            onClick={() => handleOpenLinkedDocument(link.documentId)}
                            title="Open linked document"
                            aria-label={`Open linked document ${link.documentTitle || link.documentId}`}
                          >
                            <span aria-hidden className="icon">↗️</span>
                          </button>
                          {selectedTopic.member && (
                            <button
                              type="button"
                              className="ghost icon-btn"
                              onClick={() => handleUnlinkDocument(link.id)}
                              title="Remove linked document"
                              aria-label={`Remove linked document ${link.documentTitle || link.documentId}`}
                            >
                              <span aria-hidden className="icon">🗑️</span>
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="knowledge__section">
                <header className="section-header">
                  <div>
                    <p className="eyebrow">Topic uploads</p>
                    <h3>Reference files</h3>
                  </div>
                </header>
                {selectedTopic.uploads?.length === 0 ? (
                  <p className="knowledge__status">No files uploaded.</p>
                ) : (
                  <ul className="knowledge__list">
                    {selectedTopic.uploads.map((upload) => (
                      <li key={upload.id}>
                        <div>
                          <strong>{upload.fileName}</strong>
                          <p>{upload.description || 'No description'}</p>
                          <small>{(upload.size / 1024).toFixed(1)} KB · {upload.uploadedBy}</small>
                        </div>
                        <button
                          type="button"
                          className="ghost icon-btn"
                          onClick={() => handleDownloadAttachment(upload.id)}
                          title={`Download ${upload.fileName}`}
                          aria-label={`Download ${upload.fileName}`}
                        >
                          <span aria-hidden className="icon">⬇️</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="knowledge__section">
                <header className="section-header">
                  <div>
                    <p className="eyebrow">Members</p>
                    <h3>Topic collaborators</h3>
                  </div>
                </header>
                {selectedTopic.members?.length === 0 ? (
                  <p className="knowledge__status">No members yet.</p>
                ) : (
                  <ul className="knowledge__chips">
                    {selectedTopic.members.map((member) => (
                      <li key={member.userId || member.displayName}>{member.displayName}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="knowledge__section">
                <header className="section-header">
                  <div>
                    <p className="eyebrow">Share history</p>
                    <h3>Invites sent</h3>
                  </div>
                </header>
                {selectedTopic.shares?.length === 0 ? (
                  <p className="knowledge__status">No share events recorded.</p>
                ) : (
                  <ul className="knowledge__timeline">
                    {selectedTopic.shares.map((share) => (
                      <li key={share.id}>
                        <div>
                          <strong>{share.sender} → {share.recipient}</strong>
                          <p>{share.message || 'No message provided.'}</p>
                        </div>
                        <span>{new Date(share.sharedAt).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
