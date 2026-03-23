import { useEffect, useRef, useState, useContext } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { AuthContext } from '../contexts/AuthContext'
import { AnnounceContext } from '../contexts/AnnounceContext'
import { authHeaders, downloadDocument } from '../api/documents'
import MetadataFieldInputs from './MetadataFieldInputs'
import { describeMetadataField, normalizeMetadataValues, validateMetadataValues } from '../utils/metadataTemplate'

GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc
// Debug: log the worker src to help diagnose reloads/HMR triggers
try {
  console.debug('[pdfjs] workerSrc ->', GlobalWorkerOptions.workerSrc)
} catch (e) {
  // ignore in non-browser env
}

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—')
const formatInstant = (value) => (value ? new Date(value).toLocaleString() : '—')
const formatBytes = (bytes) => {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(1)} ${units[exponent]}`
}

const MAX_PREVIEW_CHARS = 100000

const STATUS_TONE = {
  DRAFT: 'warning',
  ACTIVE: 'success',
  REJECTED: 'danger',
  ARCHIVED: 'neutral',
}

const isTextLikeContent = (type = '') => {
  if (!type) return false
  if (type.startsWith('text/')) return true
  return /(json|xml|csv|yaml|yml)/i.test(type)
}

const isPdfContent = (type = '') => type.toLowerCase().includes('pdf')

const createPreviewState = () => ({
  status: 'idle',
  mode: 'text',
  text: '',
  pdfData: null,
  error: '',
  contentType: '',
  versionId: null,
  supported: true,
  truncated: false,
})

const buildFormState = (doc) => ({
  title: doc?.title ?? '',
  description: doc?.description ?? '',
  category: doc?.category ?? '',
  tags: doc?.tags ?? [],
  metadata: doc?.metadata ? { ...doc.metadata } : {},
})

const normalizeInitialTab = (value) => (value === 'details' ? 'details' : 'content')
export default function DocumentDetails({
  document,
  onUploadVersion,
  onArchive,
  onSaveMetadata,
  onAddApprovalNote,
  onApprove,
  onReject,
  busy,
  downloadUrlBuilder,
  initialTab = 'content',
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => buildFormState(document))
  const [fileInputKey, setFileInputKey] = useState(0)
  const [activeTab, setActiveTab] = useState(normalizeInitialTab(initialTab))
  const [previewState, setPreviewState] = useState(createPreviewState)
  const [previewReloadKey, setPreviewReloadKey] = useState(0)
  const lastRequestedVersionRef = useRef(null)
  const [downloadingMap, setDownloadingMap] = useState({})
  const [printing, setPrinting] = useState(false)
  const [metadataErrors, setMetadataErrors] = useState({})
  const [approvalModal, setApprovalModal] = useState(null)
  const [approvalNote, setApprovalNote] = useState('')
  const { documentPermissions, currentUser } = useContext(AuthContext)
  const { announce, toast, confirm } = useContext(AnnounceContext)
  const resolvedInitialTab = normalizeInitialTab(initialTab)

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleMetadataValueChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      metadata: {
        ...(prev.metadata || {}),
        [key]: value,
      },
    }))
    setMetadataErrors((prevErrors) => {
      if (!prevErrors[key]) {
        return prevErrors
      }
      const next = { ...prevErrors }
      delete next[key]
      return next
    })
  }

  const openApprovalModal = (mode) => {
    if (!document) return
    setApprovalNote('')
    setApprovalModal(mode)
  }

  const closeApprovalModal = () => {
    setApprovalModal(null)
    setApprovalNote('')
  }

  const handleApprovalModalSubmit = async (event) => {
    event?.preventDefault?.()
    if (!document || !approvalModal) return
    const trimmed = approvalNote.trim()
    if (approvalModal === 'note' && !trimmed) {
      toast && toast('Add a note before saving', { type: 'error' })
      return
    }
    try {
      if (approvalModal === 'note' && typeof onAddApprovalNote === 'function') {
        await onAddApprovalNote(document.id, trimmed)
      } else if (approvalModal === 'approve' && typeof onApprove === 'function') {
        await onApprove(document.id, trimmed)
      } else if (approvalModal === 'reject' && typeof onReject === 'function') {
        await onReject(document.id, trimmed)
      }
      closeApprovalModal()
    } catch (err) {
      toast && toast(err.message || 'Unable to record approval action', { type: 'error' })
    }
  }

  const handleSubmit = (event) => {
    event?.preventDefault?.()
    if (!document || !canEditMetadata) return
    const metadataValidation = validateMetadataValues(folderTemplate, form.metadata)
    if (!metadataValidation.valid) {
      setMetadataErrors(metadataValidation.errors)
      toast && toast('Resolve the highlighted metadata fields before saving', { type: 'error' })
      return
    }
    const normalizedMetadata = normalizeMetadataValues(folderTemplate, form.metadata)
    onSaveMetadata && onSaveMetadata(document.id, { ...form, tags: form.tags, metadata: normalizedMetadata })
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setForm(buildFormState(document))
    setMetadataErrors({})
  }

  const beginEdit = () => {
    if (!document || !canEditMetadata) return
    setForm(buildFormState(document))
    setMetadataErrors({})
    setEditing(true)
  }

  const handleVersionUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (document) {
      onUploadVersion && onUploadVersion(document.id, file)
    }
    setFileInputKey((prev) => prev + 1)
  }

  useEffect(() => {
    setForm(buildFormState(document))
    setEditing(false)
    setFileInputKey((prev) => prev + 1)
    setActiveTab(resolvedInitialTab)
    setPreviewState(createPreviewState())
    lastRequestedVersionRef.current = null
    setPrinting(false)
    setMetadataErrors({})
    setApprovalModal(null)
    setApprovalNote('')
  }, [document, resolvedInitialTab])

  useEffect(() => {
    console.debug('[DocumentDetails] preview effect trigger', { activeTab, documentId: document?.id, previewReloadKey, lastRequestedVersion: lastRequestedVersionRef.current })
    if (activeTab !== 'content' || !document) {
      console.debug('[DocumentDetails] preview effect early return (no document or not content tab)', { activeTab, documentId: document?.id })
      return
    }
    const latestVersion = document.versions?.[0]
    if (!latestVersion) {
      console.debug('[DocumentDetails] preview effect: no versions available for document', { documentId: document?.id })
      setPreviewState((prev) => ({ ...prev, status: 'empty', versionId: null, error: '' }))
      return
    }
    // Prevent duplicate fetches for the same version when the effect
    // retriggers rapidly (e.g. during HMR reconnects). Do not mark
    // the version as requested until the preview actually starts
    // loading (after debounce), otherwise a quick re-run can abort
    // the in-flight load and then block future attempts.
    if (lastRequestedVersionRef.current === latestVersion.id) {
      console.debug('[DocumentDetails] preview effect: already requested this version, skipping', { versionId: latestVersion.id })
      return
    }

    const controller = new AbortController()
    let startTimer = null

    const loadPreview = async () => {
      // debounce a tiny bit to squash rapid repeated triggers
      if (startTimer) clearTimeout(startTimer)
      await new Promise((res) => (startTimer = setTimeout(res, 60)))
      startTimer = null
      // mark that we've requested this version now that loading begins
      lastRequestedVersionRef.current = latestVersion.id
      console.debug('[DocumentDetails] loadPreview start for version', latestVersion?.id)
      setPreviewState({
        status: 'loading',
        mode: 'text',
        text: '',
        pdfData: null,
        error: '',
        contentType: '',
        versionId: latestVersion.id,
        supported: true,
        truncated: false,
      })
      try {
        const response = await fetch(downloadUrlBuilder(document.id, latestVersion.id), { signal: controller.signal, headers: { ...authHeaders() } })
        if (!response.ok) {
          throw new Error('Failed to load document content')
        }
        const contentType = response.headers.get('Content-Type') || ''
        if (isPdfContent(contentType)) {
          const pdfBuffer = await response.arrayBuffer()
          console.debug('[DocumentDetails] loaded pdf buffer, size=', pdfBuffer.byteLength)
          setPreviewState({
            status: 'ready',
            mode: 'pdf',
            text: '',
            pdfData: new Uint8Array(pdfBuffer),
            error: '',
            contentType,
            versionId: latestVersion.id,
            supported: true,
            truncated: false,
          })
          return
        }
        if (!isTextLikeContent(contentType)) {
          setPreviewState({
            status: 'unsupported',
            mode: 'text',
            text: '',
            pdfData: null,
            error: '',
            contentType,
            versionId: latestVersion.id,
            supported: false,
            truncated: false,
          })
          return
        }
        const blob = await response.blob()
        const rawText = await blob.text()
        const truncated = rawText.length > MAX_PREVIEW_CHARS
        const text = truncated
          ? `${rawText.slice(0, MAX_PREVIEW_CHARS)}\n\n--- Preview truncated after ${MAX_PREVIEW_CHARS.toLocaleString()} characters ---`
          : rawText
        setPreviewState({
          status: 'ready',
          mode: 'text',
          text,
          pdfData: null,
          error: '',
          contentType,
          versionId: latestVersion.id,
          supported: true,
          truncated,
        })
      } catch (err) {
        if (controller.signal.aborted) {
          return
        }
        setPreviewState((prev) => ({
          ...prev,
          status: 'error',
          error: err.message || 'Failed to load document content',
          versionId: latestVersion.id,
        }))
      }
    }

    loadPreview()

    return () => {
      if (startTimer) clearTimeout(startTimer)
      controller.abort()
    }
  // Note: avoid including `previewState` fields in the dependency list —
  // changes to `previewState` (status/versionId) cause this effect to
  // re-run and can create repeated reloads. Use explicit triggers instead.
  }, [activeTab, document, downloadUrlBuilder, previewReloadKey])

  const handlePreviewRetry = () => {
    lastRequestedVersionRef.current = null
    setPreviewState(createPreviewState())
    setPreviewReloadKey((prev) => prev + 1)
  }

  const latestVersion = document?.versions?.[0]
  const latestDownloadUrl = latestVersion ? downloadUrlBuilder(document.id, latestVersion.id) : null
  const folderTemplate = document?.folder?.metadataTemplate ?? []
  const metadataValues = document?.metadata ?? {}
  const metadataDisplay = (folderTemplate.length
    ? folderTemplate.map((field) => ({
        key: field.key,
        label: field.label,
        value: metadataValues[field.key],
        required: field.required,
      }))
    : Object.entries(metadataValues).map(([key, value]) => ({ key, label: key, value }))
  ).filter((entry) => entry)
  const statusTone = STATUS_TONE[document?.status] || 'neutral'
  const approvalInfo = document?.approval ?? null
  const approvalNotes = Array.isArray(document?.approvalNotes) ? document.approvalNotes : []
  const isApprover = approvalInfo?.approverUsername && currentUser?.username
    ? approvalInfo.approverUsername.toLowerCase() === currentUser.username.toLowerCase()
    : false
  const awaitingApproval = document?.status === 'DRAFT'
  const canEditMetadata = (documentPermissions?.write ?? false) || (isApprover && awaitingApproval)
  const canAddApprovalNote = isApprover && awaitingApproval && typeof onAddApprovalNote === 'function'
  const canDecideApproval = isApprover && awaitingApproval && typeof onApprove === 'function' && typeof onReject === 'function'

  const handlePrintLatest = async () => {
    if (!latestVersion || !document) return
    setPrinting(true)
    try {
      const response = await fetch(downloadUrlBuilder(document.id, latestVersion.id), { headers: { ...authHeaders() } })
      if (!response.ok) {
        throw new Error('Unable to load document for printing')
      }
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const printWindow = window.open(blobUrl, '_blank', 'noopener')
      if (!printWindow) {
        URL.revokeObjectURL(blobUrl)
        throw new Error('Please allow pop-up windows to print documents')
      }
      const cleanup = () => {
        URL.revokeObjectURL(blobUrl)
      }
      const triggerPrint = () => {
        try {
          printWindow.focus()
          printWindow.print()
        } finally {
          setTimeout(() => {
            printWindow.close()
            cleanup()
          }, 0)
        }
      }
      if (printWindow.document?.readyState === 'complete') {
        triggerPrint()
      } else {
        printWindow.addEventListener('load', triggerPrint, { once: true })
      }
      toast && toast('Sent to printer', { type: 'success' })
    } catch (err) {
      toast && toast(err.message || 'Failed to print document', { type: 'error' })
    } finally {
      setPrinting(false)
    }
  }

  const handleDownload = async (version) => {
    if (!version) return
    const vid = version.id
    setDownloadingMap((prev) => ({ ...prev, [vid]: { percent: 0, active: true, lastAnnouncedPercent: -1 } }))
    announce(`Download started: ${version.fileName}`)
    toast(`Download started: ${version.fileName}`, { type: 'info' })
    try {
      await downloadDocument(document.id, vid, version.fileName, (loaded, total) => {
        const percent = total ? Math.round((loaded / total) * 100) : null
        setDownloadingMap((prev) => {
          const entry = prev[vid] || { lastAnnouncedPercent: -1 }
          const last = entry.lastAnnouncedPercent ?? -1
          let shouldAnnounce = false
          if (percent != null) {
            if (percent === 100) shouldAnnounce = true
            else if (percent - last >= 10) shouldAnnounce = true
          }
          const updated = { ...prev }
          updated[vid] = { ...entry, percent, active: true, lastAnnouncedPercent: shouldAnnounce ? percent : last }
          if (shouldAnnounce) {
            announce(`Downloading ${version.fileName}: ${percent}%`)
          }
          return updated
        })
      })
      announce(`Download complete: ${version.fileName}`)
      toast(`Download complete: ${version.fileName}`, { type: 'success' })
    } catch (err) {
      console.error('Download failed', err)
      toast('Download failed: ' + (err.message || ''), { type: 'error' })
      announce(`Download failed: ${version.fileName}`)
    } finally {
      setDownloadingMap((prev) => {
        const copy = { ...prev }
        delete copy[vid]
        return copy
      })
    }
  }

  if (!document) {
    return (
      <div className="card details-card">
        <p className="empty-state">Select a document to see its metadata and version history.</p>
      </div>
    )
  }

  return (
    <div className="card details-card">
      <div className="details-card__header">
        <div>
          <p className="eyebrow">Details</p>
          <h3>{document.title}</h3>
        </div>
        <div className="details-card__actions">
          <button
            type="button"
            className="ghost icon-btn"
            onClick={async () => {
              if (!document || !(documentPermissions?.write ?? false)) return
              const ok = await confirm('Archive this document? It will be moved to archived state. Continue?')
              if (!ok) {
                toast && toast('Archive cancelled', { type: 'info' })
                return
              }
              try {
                await (onArchive && onArchive(document.id, false))
                toast && toast('Document archived', { type: 'success' })
              } catch (err) {
                toast && toast(err.message || 'Archive failed', { type: 'error' })
              }
            }}
            disabled={busy || document.status === 'ARCHIVED' || !(documentPermissions?.write ?? false)}
            title={!(documentPermissions?.write ?? false) ? 'You do not have permission to archive this document' : 'Archive document'}
            aria-label="Archive document"
          >
            <span aria-hidden className="icon">🗄️</span>
            {!documentPermissions?.write && <span className="action-lock"> 🔒</span>}
          </button>
          <label
            className="ghost icon-btn"
            title={!(documentPermissions?.write ?? false) ? 'You do not have permission to upload versions' : 'Upload version'}
            aria-label="Upload version"
          >
            <input key={fileInputKey} type="file" hidden onChange={handleVersionUpload} disabled={busy || !(documentPermissions?.write ?? false)} />
            <span aria-hidden className="icon">⬆️</span>
            {!documentPermissions?.write && <span className="action-lock"> 🔒</span>}
          </label>
            {documentPermissions?.delete && (
              <button
                type="button"
                className="ghost icon-btn"
                onClick={async () => {
                  if (!document) return
                  const ok = await confirm('Permanently delete this document? This action cannot be undone.')
                  if (!ok) {
                    toast && toast('Delete cancelled', { type: 'info' })
                    return
                  }
                  try {
                    await (onArchive && onArchive(document.id, true))
                    toast && toast('Document deletion requested', { type: 'info' })
                  } catch (err) {
                    toast && toast('Delete failed: ' + (err.message || ''), { type: 'error' })
                  }
                }}
                disabled={busy}
                title={!documentPermissions?.delete ? 'You do not have permission to delete this document' : 'Delete document'}
                aria-label="Delete document"
              >
                <span aria-hidden className="icon">🗑️</span>
              </button>
            )}
      
        </div>
      </div>
      <div className="details-tabs">
        <button
          type="button"
          className={`details-tabs__btn ${activeTab === 'details' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Document details
        </button>
        <button
          type="button"
          className={`details-tabs__btn ${activeTab === 'content' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          Document content
        </button>
      </div>
      {activeTab === 'details' ? (
          <>
            <dl className="metadata">
              <div>
                <dt>Owner</dt>
                <dd>{document.owner || '—'}</dd>
              </div>
              <div>
                <dt>Folder</dt>
                <dd>{document.folder?.breadcrumbs?.join(' / ') || 'No folder'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`badge badge--${statusTone}`}>{document.status}</span>
                </dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{document.category || '—'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(document.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(document.updatedAt)}</dd>
              </div>
            </dl>
            {folderTemplate.length > 0 && (
              <div className="metadata-template-summary">
                <p className="metadata-template-summary__title">Folder metadata requirements</p>
                <ul className="metadata-template-summary__list">
                  {folderTemplate.map((field) => (
                    <li key={field.key}>
                      <strong>{field.label}</strong>
                      <span>{describeMetadataField(field)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="details-card__section approval-card">
              <div className="section-header">
                <h4>Approval workflow</h4>
                {(canAddApprovalNote || canDecideApproval) && (
                  <div className="approval-card__actions">
                    {canAddApprovalNote && (
                      <button type="button" className="ghost ghost--small" onClick={() => openApprovalModal('note')} disabled={busy}>
                        Add note
                      </button>
                    )}
                    {canDecideApproval && (
                      <>
                        <button type="button" className="ghost ghost--small ghost--danger" onClick={() => openApprovalModal('reject')} disabled={busy}>
                          Reject
                        </button>
                        <button type="button" className="primary" onClick={() => openApprovalModal('approve')} disabled={busy}>
                          Approve
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <dl className="metadata metadata--compact">
                <div>
                  <dt>Approver</dt>
                  <dd>{approvalInfo ? `${approvalInfo.approverDisplayName || approvalInfo.approverUsername}` : 'Not assigned'}</dd>
                </div>
                <div>
                  <dt>Requested</dt>
                  <dd>{formatInstant(approvalInfo?.requestedAt)}</dd>
                </div>
                <div>
                  <dt>Decision</dt>
                  <dd>{approvalInfo?.decidedAt ? formatInstant(approvalInfo.decidedAt) : awaitingApproval ? 'Pending' : '—'}</dd>
                </div>
              </dl>
              <div className="approval-notes">
                {approvalNotes.length ? (
                  approvalNotes.map((note) => (
                    <article key={note.id ?? `${note.createdAt}-${note.authorUsername}`} className="approval-note">
                      <div className="approval-note__header">
                        <strong>{note.authorDisplayName || note.authorUsername || 'Approver'}</strong>
                        <small>{formatInstant(note.createdAt)}</small>
                      </div>
                      <p>{note.note}</p>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">No notes yet.</p>
                )}
              </div>
            </div>
            <div className="details-card__section">
              <div className="section-header">
                <h4>Metadata</h4>
                {canEditMetadata ? (
                  <button type="button" className="ghost" onClick={beginEdit} disabled={busy}>
                    Edit
                  </button>
                ) : null}
              </div>
              <p className="details-description">{document.description || 'No description yet.'}</p>
              <div className="tag-list">
                {document.tags?.length ? (
                  document.tags.map((tag) => (
                    <span key={tag} className="pill pill--neutral">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="tag-list__empty">No tags</span>
                )}
              </div>
            </div>
            <div className="details-card__section">
              <div className="section-header">
                <h4>Versions</h4>
              </div>
              <div className="versions">
                {document.versions?.map((version) => (
                  <article key={version.id} className="version-row">
                    <div>
                      <p>v{version.version}</p>
                      <small>{formatDate(version.createdAt)}</small>
                    </div>
                    <div>
                      <p>{version.fileName}</p>
                      <small>{formatBytes(version.sizeBytes)}</small>
                    </div>
                    <button className="ghost" onClick={() => handleDownload(version)} disabled={!!downloadingMap[version.id]?.active}>
                      Download
                    </button>
                    {downloadingMap[version.id] && (
                      <div className="download-progress" style={{ marginLeft: 8 }}>
                        <div
                          className="download-progress__track"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={downloadingMap[version.id].percent ?? undefined}
                          aria-valuetext={downloadingMap[version.id].percent == null ? 'Downloading' : undefined}
                          aria-label={`Download progress for ${version.fileName}`}
                        >
                          <div className="download-progress__bar" style={{ width: `${downloadingMap[version.id].percent || 0}%` }} />
                        </div>
                      </div>
                    )}
                  </article>
                ))}
                {!document.versions?.length && <p className="empty-state">No versions yet.</p>}
              </div>
            </div>
          </>
        ) : (
          <div className="content-panel">
            {!latestVersion ? (
              <p className="empty-state">Upload a version to preview its content.</p>
            ) : (
              <>
                <div className="content-panel__meta">
                  <div>
                    <p className="content-panel__title">Latest version v{latestVersion.version}</p>
                    <small>
                      {latestVersion.fileName} · {formatBytes(latestVersion.sizeBytes)} · {latestVersion.contentType || 'Unknown type'}
                    </small>
                  </div>
                  <div className="content-panel__actions">
                    <button type="button" className="ghost icon-btn" onClick={handlePreviewRetry} disabled={previewState.status === 'loading'} title="Refresh preview" aria-label="Refresh preview">
                      <span aria-hidden className="icon">🔄</span>
                    </button>
                    {latestDownloadUrl && (
                      <button
                        type="button"
                        className="ghost icon-btn"
                        onClick={handlePrintLatest}
                        disabled={printing}
                        title={printing ? 'Preparing…' : 'Print'}
                        aria-label="Print latest version"
                      >
                        <span aria-hidden className="icon">🖨️</span>
                      </button>
                    )}
                    {latestDownloadUrl && (
                      <button className="ghost icon-btn" onClick={() => handleDownload(latestVersion)} disabled={!!downloadingMap[latestVersion.id]?.active} title="Download latest" aria-label="Download latest">
                        <span aria-hidden className="icon">⬇️</span>
                      </button>
                    )}
                    {downloadingMap[latestVersion?.id] && (
                      <div style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center' }}>
                        <div className="download-progress" style={{ width: 140 }}>
                          <div
                            className="download-progress__track"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={downloadingMap[latestVersion.id].percent ?? undefined}
                            aria-valuetext={downloadingMap[latestVersion.id].percent == null ? 'Downloading' : undefined}
                            aria-label={`Download progress for ${latestVersion.fileName}`}
                          >
                            <div className="download-progress__bar" style={{ width: `${downloadingMap[latestVersion.id].percent || 0}%` }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {previewState.status === 'loading' && <span className="pill pill--info">Loading content...</span>}
                {previewState.status === 'error' && (
                  <div className="feedback feedback--error">
                    <p>{previewState.error}</p>
                    <button type="button" className="ghost" onClick={handlePreviewRetry}>
                      Retry preview
                    </button>
                  </div>
                )}
                {previewState.status === 'unsupported' && (
                  <p className="empty-state">
                    Preview not available for {previewState.contentType || 'this file type'}. Download the file to view it.
                  </p>
                )}
                {previewState.status === 'ready' && previewState.mode === 'text' && (
                  <>
                    <pre className="content-preview" aria-label="Document content preview">
                      {previewState.text}
                    </pre>
                    {previewState.truncated && (
                      <small className="content-panel__hint">Preview truncated for performance. Download the file to view the full contents.</small>
                    )}
                  </>
                )}
                {previewState.status === 'ready' && previewState.mode === 'pdf' && previewState.pdfData && (
                  <PdfPreview data={previewState.pdfData} />
                )}
                {previewState.status === 'empty' && <p className="empty-state">No versions available for preview.</p>}
                {previewState.status === 'idle' && <p className="empty-state">Select refresh to load the preview.</p>}
              </>
            )}
          </div>
        )}
      {editing && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="metadata-modal-title">
          <div className="modal-layer__backdrop" onClick={handleCancelEdit} />
          <form className="modal-layer__content metadata-modal" onSubmit={handleSubmit}>
            <div className="modal-layer__header">
              <div>
                <p className="eyebrow">Metadata</p>
                <h3 id="metadata-modal-title">Edit document metadata</h3>
              </div>
              <button type="button" className="ghost" onClick={handleCancelEdit}>
                Close
              </button>
            </div>
            <label>
              <span>Title</span>
              <input value={form.title} onChange={(e) => handleChange('title', e.target.value)} disabled={!canEditMetadata} />
            </label>
            <label>
              <span>Description</span>
              <textarea value={form.description} onChange={(e) => handleChange('description', e.target.value)} disabled={!canEditMetadata} />
            </label>
            <label>
              <span>Category</span>
              <input value={form.category} onChange={(e) => handleChange('category', e.target.value)} disabled={!canEditMetadata} />
            </label>
            <label>
              <span>Tags</span>
              <input value={form.tags.join(', ')} onChange={(e) => handleChange('tags', e.target.value.split(','))} disabled={!canEditMetadata} />
            </label>
            {folderTemplate.length > 0 && (
              <div className="metadata-input-card">
                <div className="metadata-input-card__header">
                  <span>Folder metadata</span>
                  <small>{document.folder?.name || 'Folder requirements'}</small>
                </div>
                <MetadataFieldInputs
                  template={folderTemplate}
                  values={form.metadata}
                  errors={metadataErrors}
                  onChange={handleMetadataValueChange}
                  disabled={!canEditMetadata}
                />
              </div>
            )}
            <div className="modal-layer__actions">
              <button type="button" className="ghost" onClick={handleCancelEdit}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy || !canEditMetadata}>
                Save metadata
              </button>
            </div>
          </form>
        </div>
      )}
      {approvalModal && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="approval-modal-title">
          <div className="modal-layer__backdrop" onClick={closeApprovalModal} />
          <form className="modal-layer__content approval-modal" onSubmit={handleApprovalModalSubmit}>
            <div className="modal-layer__header">
              <div>
                <p className="eyebrow">Approval workflow</p>
                <h3 id="approval-modal-title">
                  {approvalModal === 'note' && 'Add approval note'}
                  {approvalModal === 'approve' && 'Approve document'}
                  {approvalModal === 'reject' && 'Reject document'}
                </h3>
              </div>
              <button type="button" className="ghost" onClick={closeApprovalModal}>
                Close
              </button>
            </div>
            <label>
              <span>Notes</span>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder={approvalModal === 'note' ? 'Share guidance with the document owner' : 'Share context for your decision'}
              />
            </label>
            {approvalModal === 'note' && <small>Notes remain visible in the approval history.</small>}
            <div className="modal-layer__actions">
              <button type="button" className="ghost" onClick={closeApprovalModal}>
                Cancel
              </button>
              <button
                type="submit"
                className={approvalModal === 'reject' ? 'ghost ghost--danger' : 'primary'}
                disabled={busy || (approvalModal === 'note' && !approvalNote.trim())}
              >
                {approvalModal === 'note' && 'Save note'}
                {approvalModal === 'approve' && 'Approve document'}
                {approvalModal === 'reject' && 'Reject document'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function PdfPreview({ data }) {
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [renderingPage, setRenderingPage] = useState(false)
  const [pageInput, setPageInput] = useState('1')

  useEffect(() => {
    if (!data?.length) {
      setStatus('idle')
      setError('')
      setPageCount(0)
      setPageNumber(1)
      setScale(1.2)
      setRenderingPage(false)
      return
    }
    let cancelled = false
    const typedData = data instanceof Uint8Array ? data : new Uint8Array(data)
    const loadingTask = getDocument({ data: typedData })
    setStatus('loading')
    setError('')
    setPageNumber(1)
    setPageInput('1')
    setScale(1.2)
    setPageCount(0)
    setRenderingPage(true)

    loadingTask.promise
      .then((pdf) => {
        console.debug('[PdfPreview] pdf loaded, numPages=', pdf.numPages)
        if (cancelled) {
          pdf.destroy()
          return
        }
        pdfRef.current = pdf
        setPageCount(pdf.numPages)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) {
          return
        }
        console.debug('[PdfPreview] pdf load error', err)
        setError(err.message || 'Failed to load PDF')
        setStatus('error')
        setRenderingPage(false)
      })

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
      pdfRef.current?.destroy()
      pdfRef.current = null
      loadingTask.destroy()
    }
  }, [data])

  useEffect(() => {
    if (!pageCount) {
      setPageNumber(1)
      setPageInput('1')
      return
    }
    setPageNumber((prev) => {
      if (prev < 1) return 1
      if (prev > pageCount) return pageCount
      return prev
    })
  }, [pageCount])

  useEffect(() => {
    setPageInput(String(Math.min(pageNumber, pageCount || pageNumber || 1)))
  }, [pageNumber, pageCount])

  useEffect(() => {
    const pdf = pdfRef.current
    if (!pdf || status !== 'ready') {
      return
    }
    let cancelled = false
    setRenderingPage(true)

    const renderPage = async () => {
      try {
        console.debug('[PdfPreview] renderPage', pageNumber, 'scale', scale)
        const page = await pdf.getPage(pageNumber)
        if (cancelled) return
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas) return
        const context = canvas.getContext('2d')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const task = page.render({ canvasContext: context, viewport })
        renderTaskRef.current = task
        await task.promise
        console.debug('[PdfPreview] render complete for page', pageNumber)
        if (!cancelled) {
          setRenderingPage(false)
        }
      } catch (err) {
        if (cancelled) return
        console.debug('[PdfPreview] render error', err)
        setError(err.message || 'Failed to render PDF page')
        setStatus('error')
        setRenderingPage(false)
      }
    }

    renderPage()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
      setRenderingPage(false)
    }
  }, [pageNumber, scale, status])

  const canNavigate = status === 'ready' && pageCount > 1
  const canZoom = status === 'ready'
  const zoomPercent = Math.round(scale * 100)

  const handleZoom = (delta) => {
    setScale((prev) => {
      const next = Math.min(Math.max(prev + delta, 0.5), 3)
      return Number(next.toFixed(2))
    })
  }

  const resetZoom = () => setScale(1.2)

  const handlePageInputChange = (event) => {
    setPageInput(event.target.value)
  }

  const commitPageInput = () => {
    const target = Number(pageInput)
    if (Number.isFinite(target) && target >= 1 && target <= (pageCount || 1)) {
      setPageNumber(target)
    } else {
      setPageInput(String(pageNumber))
    }
  }

  const handlePageInputKey = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitPageInput()
    }
  }

  return (
    <div className="pdf-preview">
      <div className="pdf-preview__toolbar">
        <div className="pdf-preview__group">
          <button
            type="button"
            className="ghost"
            aria-label="Previous page"
            disabled={!canNavigate || pageNumber <= 1 || renderingPage}
            onClick={() => setPageNumber((prev) => Math.max(1, prev - 1))}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="sr-only">Previous page</span>
          </button>
          <span className="pdf-preview__page">
            Page {Math.min(pageNumber, pageCount) || 1} of {pageCount || 1}
          </span>
          <button
            type="button"
            className="ghost"
            aria-label="Next page"
            disabled={!canNavigate || pageNumber >= pageCount || renderingPage}
            onClick={() => setPageNumber((prev) => Math.min(pageCount || 1, prev + 1))}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
            <span className="sr-only">Next page</span>
          </button>
          <div className="pdf-preview__pager">
            <label>
              <span className="sr-only">Go to page</span>
              <input
                type="number"
                min={1}
                max={pageCount || 1}
                value={pageInput}
                onChange={handlePageInputChange}
                onKeyDown={handlePageInputKey}
                disabled={!canNavigate || renderingPage}
              />
            </label>
            <button type="button" className="ghost" onClick={commitPageInput} disabled={!canNavigate || renderingPage}>
              Go
            </button>
          </div>
        </div>
        {/* zoom controls removed per request */}
      </div>
      {canNavigate && pageCount > 1 && (
        <div className="pdf-preview__slider">
          <input
            type="range"
            min="1"
            max={pageCount}
            value={Math.min(pageNumber, pageCount)}
            onChange={(event) => setPageNumber(Number(event.target.value))}
            disabled={renderingPage}
          />
        </div>
      )}
      {status === 'loading' && <span className="pill pill--info">Rendering PDF…</span>}
      {status === 'error' && <div className="feedback feedback--error">{error}</div>}
      <canvas ref={canvasRef} className="pdf-preview__canvas" aria-label="PDF preview" />
      {renderingPage && status === 'ready' && <small className="content-panel__hint">Rendering page {pageNumber}…</small>}
      {status === 'ready' && pageCount > 1 && !renderingPage && (
        <small className="content-panel__hint">Viewing page {pageNumber} of {pageCount}.</small>
      )}
    </div>
  )
}
