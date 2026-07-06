import React, { memo, useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'

const STATUS_TONE = {
  DRAFT: 'warning',
  ACTIVE: 'success',
  REJECTED: 'danger',
  ARCHIVED: 'neutral',
}

const formatBytes = (bytes) => {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(1)} ${units[exponent]}`
}

const formatDocumentTime = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return null
  }
  return date.toLocaleString()
}

const getIconForFileName = (fileName = '') => {
  if (!fileName || typeof fileName !== 'string') return '📄'
  const name = fileName.split(/[?#]/)[0]
  const parts = name.split('.')
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : ''
  const map = {
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    xls: '📊',
    xlsx: '📊',
    csv: '📑',
    ppt: '📽️',
    pptx: '📽️',
    txt: '📄',
    md: '📄',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    svg: '🖼️',
    zip: '🗜️',
    rar: '🗜️',
    mp4: '🎞️',
    mov: '🎞️',
    mp3: '🎵',
    wav: '🎵',
  }
  return map[ext] || '📄'
}

function DocumentList({
  items,
  selectedId,
  onSelect,
  loading,
  pageMeta,
  onPageChange,
  pageSize = 12,
  onPageSizeChange,
  sort,
  onSortChange,
  filterQuery,
  onFilterQueryChange,
  onDragStart = () => {},
  onDragEnd = () => {},
  draggingId = null,
  movingId = null,
  onMaximize = () => {},
  onContextAction = () => {},
  onUpload = null,
  onOcrSelected = null,
  canRunOcrOnSelected = false,
  canUpload = false,
  onHover = null,
  onCreateTopicFromDocument = null,
  onFindRelatedTopics = null,
  cardClassName = '',
  cardStyle,
  onCardDragOver,
  onCardDrop,
  dragHandle = null,
  resizeHandle = null,
  workspaceSelectionInfo = null,
}) {
  const { documentPermissions } = useContext(AuthContext)
  const handleDragStart = (event, id) => {
    if (!(documentPermissions?.write ?? false)) {
      // not allowed to drag/move documents
      event.preventDefault()
      return
    }
    if (!event?.dataTransfer) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-document-id', String(id))
    onDragStart(id)
  }

  // Context menu state
  const [contextMenu, setContextMenu] = React.useState({ open: false, x: 0, y: 0, docId: null })

  const closeContextMenu = () => setContextMenu({ open: false, x: 0, y: 0, docId: null })

  const hoverTimerRef = React.useRef(null)

  const clearHoverTimer = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  React.useEffect(() => {
    return () => {
      clearHoverTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleContextMenu = (event, id) => {
    event.preventDefault()
    setContextMenu({ open: true, x: event.clientX, y: event.clientY, docId: id })
  }

  const handleListContextMenu = (event) => {
    if (event.target?.closest?.('.document-list__item-row')) {
      return
    }
    handleContextMenu(event, null)
  }

  const hasDocumentSelection = contextMenu.docId != null
  const currentPage = Number(pageMeta?.page ?? 0)
  const totalPages = Number(pageMeta?.totalPages ?? 0)
  const totalItems = Number(pageMeta?.totalElements ?? 0)
  const pageNumbers = (() => {
    if (!totalPages || totalPages <= 1) {
      return []
    }
    const windowSize = 5
    const start = Math.max(0, currentPage - Math.floor(windowSize / 2))
    const end = Math.min(totalPages - 1, start + windowSize - 1)
    const adjustedStart = Math.max(0, end - windowSize + 1)
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index)
  })()

  return (
    <div
      className={`card list-card workspace-card ${cardClassName}`.trim()}
      style={cardStyle}
      onDragOver={onCardDragOver}
      onDrop={onCardDrop}
    >
      {dragHandle}
      {resizeHandle}
      <div className="workspace-card__viewport">
        <div className="list-card__header">
          <div>
            <p className="eyebrow">Workspace</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ margin: 0 }}>Documents</h3>
              {loading && (
                <span className="document-list__loading-badge" aria-live="polite" aria-label="Loading documents">
                  <span className="document-list__loading-spinner" aria-hidden="true" />
                  <span>Loading…</span>
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <input
                type="search"
                placeholder="Filter keywords"
                value={filterQuery || ''}
                onChange={(e) => onFilterQueryChange && onFilterQueryChange(e.target.value)}
                style={{padding:'6px 8px', borderRadius:6, border:'1px solid rgba(15,23,42,0.06)'}}
              />
            </div>
            <label style={{display:'flex',alignItems:'center',gap:6}}>
              <small className="eyebrow" style={{margin:0,marginRight:6}}>Sort</small>
              <select value={sort || ''} onChange={(e) => onSortChange && onSortChange(e.target.value)}>
                <option value="createdAt,desc">Newest</option>
                <option value="createdAt,asc">Oldest</option>
                <option value="title,asc">Title A–Z</option>
                <option value="title,desc">Title Z–A</option>
                <option value="latestSizeBytes,desc">Size ↓</option>
                <option value="latestSizeBytes,asc">Size ↑</option>
                <option value="status,asc">Status</option>
              </select>
            </label>
            {onOcrSelected && (
              <button
                type="button"
                className="ghost"
                onClick={onOcrSelected}
                disabled={!canUpload || loading || !canRunOcrOnSelected}
                title={!canUpload ? 'You do not have permission to run OCR' : canRunOcrOnSelected ? 'Run OCR on selected document' : 'Select a PDF document first'}
              >
                OCR Selected
              </button>
            )}
            {onUpload && (
              <button
                type="button"
                className="primary"
                onClick={onUpload}
                disabled={!canUpload || loading}
                aria-label="Upload"
                title={!canUpload ? 'You do not have permission to upload documents' : undefined}
              >
                Upload
              </button>
            )}
          </div>
        </div>
        {workspaceSelectionInfo && <div className="list-card__selection-info">{workspaceSelectionInfo}</div>}
        <div className="document-list" onContextMenu={handleListContextMenu}>
        {items.map((doc) => (
          <div key={doc.id} className="document-list__item-row">
            <button
              type="button"
              className={`document-list__item ${doc.id === selectedId ? 'is-active' : ''} ${draggingId === doc.id ? 'is-dragging' : ''} ${movingId === doc.id ? 'is-moving' : ''}`}
              onClick={() => onSelect(doc.id)}
              onDoubleClick={(event) => {
                event.preventDefault()
                onSelect(doc.id)
                onMaximize(doc.id)
              }}
              onContextMenu={(e) => {
                e.stopPropagation()
                handleContextMenu(e, doc.id)
              }}
              draggable={documentPermissions?.write ?? false}
              onDragStart={(event) => handleDragStart(event, doc.id)}
              onDragEnd={onDragEnd}
              aria-grabbed={draggingId === doc.id}
              aria-pressed={doc.id === selectedId}
              data-document-id={doc.id}
              onMouseEnter={() => {
                clearHoverTimer()
                if (typeof onHover === 'function') {
                  hoverTimerRef.current = setTimeout(() => onHover(doc.id), 5000)
                }
              }}
              onMouseLeave={() => {
                clearHoverTimer()
              }}
            >
              <div>
                <p className="document-list__title">
                  <span
                    className="document-list__icon"
                    aria-hidden
                  >
                    {getIconForFileName(
                      // Prefer the explicit file name if available, fall back to title
                      doc.latestVersion && typeof doc.latestVersion === 'object' && doc.latestVersion.fileName
                        ? doc.latestVersion.fileName
                        : doc.fileName ?? doc.title
                    )}
                  </span>
                  <span className="document-list__name">{doc.title}</span>
                </p>
                <p className="document-list__meta">
                  {(doc.folder?.breadcrumbs?.join(' / ') ?? 'No folder')} · {doc.category || 'Uncategorized'} · Owner: {doc.owner || 'TBD'} · Supervisor: {doc.supervisor || 'TBD'}
                </p>
              </div>
              <div className="document-list__right">
                <span className={`badge badge--${STATUS_TONE[doc.status] || 'neutral'}`}>{doc.status}</span>
                  {movingId === doc.id ? (
                  <span className="pill pill--info">Moving...</span>
                ) : (
                    <>
                      <small>v{doc.latestVersion} · {formatBytes(doc.latestSizeBytes)}</small>
                      <small className="document-list__time">
                        {formatDocumentTime(doc.createdAt ?? doc.created_at) ? `Created ${formatDocumentTime(doc.createdAt ?? doc.created_at)}` : `Updated ${formatDocumentTime(doc.updatedAt ?? doc.updated_at) || '—'}`}
                      </small>
                      <small>Confidence {Number.isFinite(doc.confidenceScore) ? doc.confidenceScore : 0}%</small>
                      {!(documentPermissions?.write ?? false) && <small className="action-lock"> 🔒</small>}
                    </>
                )}
              </div>
            </button>
            <div className="document-list__row-actions">
              {typeof onCreateTopicFromDocument === 'function' && (
                <button
                  type="button"
                  className="ghost icon-btn document-list__topic-btn"
                  aria-label={`Create topic from ${doc.title}`}
                  title="Create Topic"
                  onClick={() => onCreateTopicFromDocument(doc)}
                >
                  <span aria-hidden className="icon">🧠</span>
                </button>
              )}
              {typeof onFindRelatedTopics === 'function' && (
                <button
                  type="button"
                  className="ghost icon-btn document-list__topic-btn"
                  aria-label={`Find related topics for ${doc.title}`}
                  title="Find related Topic"
                  onClick={() => onFindRelatedTopics(doc)}
                >
                  <span aria-hidden className="icon">🔎</span>
                </button>
              )}
            </div>
          </div>
        ))}
        {!items.length && !loading && <p className="empty-state">No documents match the filters. Try adjusting them.</p>}
        </div>
      {contextMenu.open && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x, position: 'fixed', zIndex: 1200 }}
          onMouseLeave={closeContextMenu}
        >
          <button type="button" disabled={!hasDocumentSelection} onClick={() => { onContextAction(contextMenu.docId, 'copy'); closeContextMenu() }}>Copy</button>
          <button type="button" onClick={() => { onContextAction(contextMenu.docId, 'paste'); closeContextMenu() }}>Paste to selected folder</button>
          <button type="button" disabled={!hasDocumentSelection} onClick={() => { onContextAction(contextMenu.docId, 'generateLink'); closeContextMenu() }}>Generate link</button>
          <button type="button" disabled={!hasDocumentSelection} onClick={() => { onContextAction(contextMenu.docId, 'checkout'); closeContextMenu() }}>Check out</button>
        </div>
      )}
        {pageMeta && (
          <div className="pagination">
          <div className="pagination__left">
            <span>{totalItems} document{totalItems === 1 ? '' : 's'}</span>
            <label>
              <span className="sr-only">Page size</span>
              <select value={pageSize} onChange={(e) => onPageSizeChange && onPageSizeChange(Number(e.target.value))}>
                <option value={5}>5 / page</option>
                <option value={10}>10 / page</option>
                <option value={12}>12 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </label>
          </div>
          <div className="pagination__right">
            <button type="button" className="ghost" disabled={currentPage === 0} onClick={() => onPageChange(currentPage - 1)}>
            Previous
            </button>
            {pageNumbers.map((page) => (
              <button
                key={page}
                type="button"
                className={`ghost ${page === currentPage ? 'is-current' : ''}`}
                onClick={() => onPageChange(page)}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page + 1}
              </button>
            ))}
            <span>
              Page {currentPage + 1} of {Math.max(totalPages, 1)}
            </span>
            <button
              type="button"
              className="ghost"
              disabled={Boolean(pageMeta.last) || totalPages <= 1}
              onClick={() => onPageChange(currentPage + 1)}
            >
            Next
            </button>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(DocumentList)
