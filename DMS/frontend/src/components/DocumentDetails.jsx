import { useEffect, useRef, useState, useContext } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { AuthContext } from '../contexts/AuthContext'
import { AnnounceContext } from '../contexts/AnnounceContext'
import { authHeaders, downloadDocument, listApproverOptions } from '../api/documents'
import MetadataFieldInputs from './MetadataFieldInputs'
import { describeMetadataField, normalizeMetadataValues, validateMetadataValues } from '../utils/metadataTemplate'
import { fetchActiveCodeTableItems } from '../api/codeTable'

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

const formatMetadataDisplayValue = (field, rawValue, codeTableItems = {}) => {
  const normalized = rawValue == null ? '' : String(rawValue).trim()
  if (!normalized) {
    return '—'
  }
  if (field?.type === 'DROPDOWN' && field.codeTableCode) {
    const options = Array.isArray(codeTableItems[field.codeTableCode]) ? codeTableItems[field.codeTableCode] : []
    const matched = options.find((item) => String(item?.itemCode ?? '') === normalized)
    return matched?.itemLabel || normalized
  }
  return normalized
}

const MAX_PREVIEW_CHARS = 100000
const MAX_PDF_PREVIEW_CHARS = 120000
const SYSTEM_METADATA_KEYS = ['documentDate', 'approvalDate', 'expiryDate', 'archiveDate', 'reminderDate']

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
  taskContext,
  onUploadVersion,
  onArchive,
  onSaveMetadata,
  onAddApprovalNote,
  onApprove,
  onReject,
  onDelegate,
  busy,
  downloadUrlBuilder,
  initialTab = 'content',
  showPdfTextPreview = true,
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => buildFormState(document))
  const [fileInputKey, setFileInputKey] = useState(0)
  const [activeTab, setActiveTab] = useState(normalizeInitialTab(initialTab))
  const [previewState, setPreviewState] = useState(createPreviewState)
  const [previewReloadKey, setPreviewReloadKey] = useState(0)
  const [pdfPager, setPdfPager] = useState({ pageNumber: 1, pageCount: 0, renderingPage: false, status: 'idle' })
  const [requestedPdfPage, setRequestedPdfPage] = useState(1)
  const [pdfPageInput, setPdfPageInput] = useState('1')
  const lastRequestedVersionRef = useRef(null)
  const [downloadingMap, setDownloadingMap] = useState({})
  const [printing, setPrinting] = useState(false)
  const [metadataErrors, setMetadataErrors] = useState({})
  const [documentCategoryOptions, setDocumentCategoryOptions] = useState([])
  const [approvalModal, setApprovalModal] = useState(null)
  const [approvalNote, setApprovalNote] = useState('')
  const [approvalDates, setApprovalDates] = useState({ documentDate: '', expiryDate: '' })
  const [delegateApproverId, setDelegateApproverId] = useState('')
  const [delegateOptions, setDelegateOptions] = useState([])
  const [delegateLoading, setDelegateLoading] = useState(false)
  const [delegateError, setDelegateError] = useState('')
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
    setApprovalDates({
      documentDate: document.metadata?.documentDate ?? '',
      expiryDate: document.metadata?.expiryDate ?? '',
    })
    setDelegateApproverId('')
    setDelegateError('')
    setApprovalModal(mode)
  }

  const closeApprovalModal = () => {
    setApprovalModal(null)
    setApprovalNote('')
    setApprovalDates({ documentDate: '', expiryDate: '' })
    setDelegateApproverId('')
    setDelegateError('')
  }

  const handleApprovalModalSubmit = async (event) => {
    event?.preventDefault?.()
    if (!document || !approvalModal) return
    const trimmed = approvalNote.trim()
    if (approvalModal === 'note' && !trimmed) {
      toast && toast('Add a note before saving', { type: 'error' })
      return
    }
    if (approvalModal === 'delegate' && !delegateApproverId) {
      toast && toast('Select a user to delegate to', { type: 'error' })
      return
    }
    if (approvalModal === 'approve') {
      if (!approvalDates.documentDate.trim() || !approvalDates.expiryDate.trim()) {
        toast && toast('Document date and expiry date are required before approval', { type: 'error' })
        return
      }
    }
    try {
      if (approvalModal === 'note' && typeof onAddApprovalNote === 'function') {
        await onAddApprovalNote(document.id, trimmed)
      } else if (approvalModal === 'approve' && typeof onApprove === 'function') {
        const payload = {
          ...(trimmed ? { note: trimmed } : {}),
          documentDate: approvalDates.documentDate.trim(),
          expiryDate: approvalDates.expiryDate.trim(),
        }
        await onApprove(document.id, payload)
      } else if (approvalModal === 'reject' && typeof onReject === 'function') {
        await onReject(document.id, trimmed)
      } else if (approvalModal === 'delegate' && typeof onDelegate === 'function') {
        await onDelegate(document.id, delegateApproverId, trimmed)
      }
      closeApprovalModal()
    } catch (err) {
      toast && toast(err.message || 'Unable to record approval action', { type: 'error' })
    }
  }

  useEffect(() => {
    if (approvalModal !== 'delegate') {
      return
    }
    let cancelled = false
    setDelegateLoading(true)
    setDelegateError('')
    listApproverOptions()
      .then((options) => {
        if (cancelled) return
        const normalized = Array.isArray(options) ? options : []
        setDelegateOptions(normalized)
      })
      .catch((err) => {
        if (cancelled) return
        setDelegateOptions([])
        setDelegateError(err.message || 'Failed to load approver options')
      })
      .finally(() => {
        if (cancelled) return
        setDelegateLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [approvalModal])

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
    SYSTEM_METADATA_KEYS.forEach((key) => {
      const value = form.metadata?.[key]
      if (typeof value === 'string' && value.trim()) {
        normalizedMetadata[key] = value.trim()
      }
    })
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
    setPdfPager({ pageNumber: 1, pageCount: 0, renderingPage: false, status: 'idle' })
    setRequestedPdfPage(1)
    setPdfPageInput('1')
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
    setPdfPager({ pageNumber: 1, pageCount: 0, renderingPage: false, status: 'idle' })
    setRequestedPdfPage(1)
    setPdfPageInput('1')
    setPreviewReloadKey((prev) => prev + 1)
  }

  const latestVersion = document?.versions?.[0]
  const latestDownloadUrl = latestVersion ? downloadUrlBuilder(document.id, latestVersion.id) : null
  const folderTemplate = document?.folder?.metadataTemplate ?? []
  const metadataValues = document?.metadata ?? {}

  const [codeTableItems, setCodeTableItems] = useState({})
  useEffect(() => {
    const dropdownFields = folderTemplate.filter((f) => f.type === 'DROPDOWN' && f.codeTableCode)
    if (!dropdownFields.length) {
      setCodeTableItems({})
      return
    }
    const codes = [...new Set(dropdownFields.map((f) => f.codeTableCode))]
    Promise.all(codes.map((code) => fetchActiveCodeTableItems(code).then((items) => [code, items]).catch(() => [code, []]))).then(
      (results) => setCodeTableItems(Object.fromEntries(results))
    )
  }, [document?.folder?.id])

  useEffect(() => {
    let cancelled = false
    fetchActiveCodeTableItems('DOCUMENT_CATEGORY')
      .then((items) => {
        if (cancelled) return
        setDocumentCategoryOptions(Array.isArray(items) ? items : [])
      })
      .catch(() => {
        if (!cancelled) {
          setDocumentCategoryOptions([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])
  const systemMetadataLabels = {
    documentDate: 'Document Date',
    approvalDate: 'Approval Date',
    expiryDate: 'Expiry Date',
    archiveDate: 'Archive Date',
    reminderDate: 'Reminder Date',
  }
  const templateKeys = new Set(folderTemplate.map((field) => field.key))
  const systemMetadataEntries = SYSTEM_METADATA_KEYS
    .filter((key) => metadataValues[key] && !templateKeys.has(key))
    .map((key) => ({
      key,
      label: systemMetadataLabels[key],
      value: metadataValues[key],
      displayValue: formatMetadataDisplayValue(null, metadataValues[key]),
      required: false,
      note: 'System metadata',
    }))
  const metadataDisplay = (folderTemplate.length
    ? folderTemplate.map((field) => ({
        key: field.key,
        label: field.label,
        value: metadataValues[field.key],
        required: field.required,
        displayValue: formatMetadataDisplayValue(field, metadataValues[field.key], codeTableItems),
        note: field.hint || describeMetadataField(field),
      })).concat(systemMetadataEntries)
    : Object.entries(metadataValues).map(([key, value]) => ({
        key,
        label: key,
        value,
        displayValue: formatMetadataDisplayValue(null, value),
        required: false,
        note: null,
      }))
  ).filter((entry) => entry)
  const statusTone = STATUS_TONE[document?.status] || 'neutral'
  const approvalInfo = document?.approval ?? null
  const approvalNotes = Array.isArray(document?.approvalNotes) ? document.approvalNotes : []
  const approvalNeedsDates = approvalModal === 'approve'
    && (!String(document?.metadata?.documentDate ?? '').trim() || !String(document?.metadata?.expiryDate ?? '').trim())
  const isApprover = approvalInfo?.approverUsername && currentUser?.username
    ? approvalInfo.approverUsername.toLowerCase() === currentUser.username.toLowerCase()
    : false
  const isRetentionTask = taskContext?.taskType === 'RETENTION'
    && ['PENDING', 'IN_PROGRESS', 'BLOCKED'].includes(taskContext?.status)
  const awaitingApproval = document?.status === 'DRAFT'
  const canEditMetadata = (documentPermissions?.write ?? false) || (isApprover && awaitingApproval)
  const canAddApprovalNote = isApprover && awaitingApproval && typeof onAddApprovalNote === 'function'
  const canDecideApproval =
    ((isApprover && awaitingApproval) || isRetentionTask)
    && typeof onApprove === 'function'
    && typeof onReject === 'function'
  const canDelegateApproval =
    ((isApprover && awaitingApproval) || isRetentionTask)
    && typeof onDelegate === 'function'
  const canPdfNavigate = previewState.status === 'ready' && previewState.mode === 'pdf' && pdfPager.status === 'ready' && !pdfPager.nativeViewer && pdfPager.pageCount > 1
  const documentDateValue = form.metadata?.documentDate ?? ''
  const expiryDateValue = form.metadata?.expiryDate ?? ''

  useEffect(() => {
    const maxPage = pdfPager.pageCount || 1
    const safePage = Math.min(Math.max(pdfPager.pageNumber || 1, 1), maxPage)
    setPdfPageInput(String(safePage))
  }, [pdfPager.pageNumber, pdfPager.pageCount])

  const commitPdfPageInput = () => {
    const target = Number(pdfPageInput)
    const maxPage = pdfPager.pageCount || 1
    if (Number.isFinite(target) && target >= 1 && target <= maxPage) {
      setRequestedPdfPage(Math.floor(target))
    } else {
      setPdfPageInput(String(Math.min(Math.max(pdfPager.pageNumber || 1, 1), maxPage)))
    }
  }

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
                <dt>Supervisor</dt>
                <dd>{document.supervisor || '—'}</dd>
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
                <dt>Confidence Score</dt>
                <dd>{Number.isFinite(document.confidenceScore) ? document.confidenceScore : 0}%</dd>
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
                <h4>{isRetentionTask ? 'Retention disposition' : 'Approval workflow'}</h4>
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
                        {canDelegateApproval && (
                          <button type="button" className="ghost ghost--small" onClick={() => openApprovalModal('delegate')} disabled={busy}>
                            Delegate
                          </button>
                        )}
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
              {metadataDisplay.length ? (
                <dl className="metadata metadata--compact metadata-display-grid">
                  {metadataDisplay.map((entry) => (
                    <div key={entry.key} className="metadata-display-grid__item">
                      <dt>
                        {entry.label}
                        {entry.required ? <span className="metadata-display-grid__required"> *</span> : null}
                      </dt>
                      <dd>{entry.displayValue}</dd>
                      {entry.note ? <small className="metadata-display-grid__note">{entry.note}</small> : null}
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="metadata-template-summary__empty">No metadata fields are defined for this document.</p>
              )}
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
                    <div className="content-panel__quick-actions">
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
                    </div>
                    {previewState.status === 'ready' && previewState.mode === 'pdf' && (
                      <div className="content-panel__pager">
                        <button
                          type="button"
                          className="ghost icon-btn"
                          aria-label="Previous page"
                          disabled={!canPdfNavigate || pdfPager.pageNumber <= 1 || pdfPager.renderingPage}
                          onClick={() => setRequestedPdfPage(Math.max(1, pdfPager.pageNumber - 1))}
                        >
                          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                          <span className="sr-only">Previous page</span>
                        </button>
                        <span className="content-panel__page">
                          Page {Math.min(pdfPager.pageNumber, pdfPager.pageCount) || 1} of {pdfPager.pageCount || 1}
                        </span>
                        <button
                          type="button"
                          className="ghost icon-btn"
                          aria-label="Next page"
                          disabled={!canPdfNavigate || pdfPager.pageNumber >= pdfPager.pageCount || pdfPager.renderingPage}
                          onClick={() => setRequestedPdfPage(Math.min(pdfPager.pageCount || 1, pdfPager.pageNumber + 1))}
                        >
                          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 6l6 6-6 6" />
                          </svg>
                          <span className="sr-only">Next page</span>
                        </button>
                        <label className="content-panel__pager-input">
                          <span className="sr-only">Go to page</span>
                          <input
                            type="number"
                            min={1}
                            max={pdfPager.pageCount || 1}
                            value={pdfPageInput}
                            onChange={(event) => setPdfPageInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                commitPdfPageInput()
                              }
                            }}
                            disabled={!canPdfNavigate || pdfPager.renderingPage}
                          />
                        </label>
                        <button type="button" className="ghost" onClick={commitPdfPageInput} disabled={!canPdfNavigate || pdfPager.renderingPage}>
                          Go
                        </button>
                      </div>
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
                  <PdfPreview
                    data={previewState.pdfData}
                    requestedPage={requestedPdfPage}
                    onPagerStateChange={setPdfPager}
                    showTextPreview={showPdfTextPreview}
                  />
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
                <p className="eyebrow">Document metadata</p>
                <h3 id="metadata-modal-title">Update document details</h3>
              </div>
              <button type="button" className="ghost" onClick={handleCancelEdit}>
                Close
              </button>
            </div>
            <div className="metadata-modal__grid">
              <section className="metadata-modal__section">
                <div className="metadata-modal__section-header">
                  <span>Document fields</span>
                  <small>Aligned with upload form</small>
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
                  <span>Document category</span>
                  <select value={form.category} onChange={(e) => handleChange('category', e.target.value)} disabled={!canEditMetadata}>
                    <option value="">Select document category</option>
                    {documentCategoryOptions.map((item) => (
                      <option key={item.id ?? item.itemCode} value={item.itemCode || ''}>
                        {item.itemLabel || item.itemCode || ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="metadata-modal__date-grid">
                  <label>
                    <span>Document date</span>
                    <input
                      type="date"
                      value={documentDateValue}
                      onChange={(e) => handleMetadataValueChange('documentDate', e.target.value)}
                      disabled={!canEditMetadata}
                      required
                    />
                  </label>
                  <label>
                    <span>Expiry date</span>
                    <input
                      type="date"
                      value={expiryDateValue}
                      onChange={(e) => handleMetadataValueChange('expiryDate', e.target.value)}
                      disabled={!canEditMetadata}
                      required
                    />
                  </label>
                </div>
                <label>
                  <span>Tags</span>
                  <input
                    value={form.tags.join(', ')}
                    onChange={(e) => handleChange('tags', e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean))}
                    disabled={!canEditMetadata}
                    placeholder="policy, quarterly"
                  />
                </label>
              </section>

              <section className="metadata-modal__section metadata-modal__section--secondary">
                <div className="metadata-input-card__header">
                  <span>Folder metadata</span>
                  <small>{document.folder?.name || 'Folder requirements'}</small>
                </div>
                {folderTemplate.length > 0 ? (
                  <>
                    <div className="metadata-template-summary">
                      <ul className="metadata-template-summary__list">
                        {folderTemplate.map((field) => (
                          <li key={field.key}>
                            <strong>{field.label}</strong>
                            <span>{describeMetadataField(field)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="metadata-input-card">
                      <MetadataFieldInputs
                        template={folderTemplate}
                        values={form.metadata}
                        errors={metadataErrors}
                        onChange={handleMetadataValueChange}
                        disabled={!canEditMetadata}
                        codeTableItems={codeTableItems}
                      />
                    </div>
                  </>
                ) : (
                  <p className="metadata-template-summary__empty">No custom metadata fields for this folder.</p>
                )}
              </section>
            </div>
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
                  {approvalModal === 'delegate' && 'Delegate approval'}
                </h3>
              </div>
              <button type="button" className="ghost" onClick={closeApprovalModal}>
                Close
              </button>
            </div>
            {approvalModal === 'delegate' && (
              <label>
                <span>Delegate to</span>
                <select
                  value={delegateApproverId}
                  onChange={(e) => setDelegateApproverId(e.target.value)}
                  disabled={delegateLoading || busy}
                >
                  <option value="">Select approver</option>
                  {delegateOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.displayName || option.username}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {approvalModal === 'delegate' && delegateError && <small className="feedback feedback--error">{delegateError}</small>}
            {approvalNeedsDates && (
              <>
                <label>
                  <span>Document date</span>
                  <input
                    type="date"
                    value={approvalDates.documentDate}
                    onChange={(e) => setApprovalDates((prev) => ({ ...prev, documentDate: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Expiry date</span>
                  <input
                    type="date"
                    value={approvalDates.expiryDate}
                    onChange={(e) => setApprovalDates((prev) => ({ ...prev, expiryDate: e.target.value }))}
                    required
                  />
                </label>
                <small>These dates are missing from the document metadata and must be restored before approval.</small>
              </>
            )}
            <label>
              <span>Notes</span>
              <textarea
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder={approvalModal === 'note' ? 'Share guidance with the document owner' : approvalModal === 'delegate' ? 'Optionally explain why this is being delegated' : 'Share context for your decision'}
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
                disabled={busy || (approvalModal === 'note' && !approvalNote.trim()) || (approvalModal === 'delegate' && (!delegateApproverId || delegateLoading))}
              >
                {approvalModal === 'note' && 'Save note'}
                {approvalModal === 'approve' && 'Approve document'}
                {approvalModal === 'reject' && 'Reject document'}
                {approvalModal === 'delegate' && 'Delegate approval'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function PdfPreview({ data, requestedPage = 1, onPagerStateChange, showTextPreview = true }) {
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [renderingPage, setRenderingPage] = useState(false)
  const [selectableText, setSelectableText] = useState('')
  const [textTruncated, setTextTruncated] = useState(false)
  const MIN_SCALE = 0.6
  const MAX_SCALE = 3
  const SCALE_STEP = 0.2

  const clampScale = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))

  const extractPdfText = async (pdf) => {
    let chunks = []
    let totalChars = 0
    let truncated = false
    for (let page = 1; page <= pdf.numPages; page += 1) {
      const pageRef = await pdf.getPage(page)
      const textContent = await pageRef.getTextContent()
      let pageText = ''
      for (const item of textContent.items || []) {
        const str = typeof item?.str === 'string' ? item.str : ''
        if (!str) continue
        pageText += str
        pageText += item?.hasEOL ? '\n' : ' '
      }
      pageText = pageText.trim()
      if (!pageText) continue
      const labeledPageText = `--- Page ${page} ---\n${pageText}\n\n`
      if (totalChars + labeledPageText.length > MAX_PDF_PREVIEW_CHARS) {
        const remaining = Math.max(0, MAX_PDF_PREVIEW_CHARS - totalChars)
        if (remaining > 0) {
          chunks.push(labeledPageText.slice(0, remaining))
        }
        truncated = true
        break
      }
      chunks.push(labeledPageText)
      totalChars += labeledPageText.length
    }
    return { text: chunks.join('').trim(), truncated }
  }

  const handleCopyText = async () => {
    if (!selectableText || !navigator?.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(selectableText)
    } catch (err) {
      console.debug('[PdfPreview] clipboard copy failed', err)
    }
  }

  useEffect(() => {
    if (!data?.length) {
      setStatus('idle')
      setError('')
      setPageCount(0)
      setPageNumber(1)
      setScale(1.2)
      setRenderingPage(false)
      setSelectableText('')
      setTextTruncated(false)
      return
    }
    let cancelled = false
    const typedData = data instanceof Uint8Array ? data : new Uint8Array(data)
    const loadingTask = getDocument({ data: typedData })
    setStatus('loading')
    setError('')
    setPageNumber(1)
    setScale(1.2)
    setPageCount(0)
    setRenderingPage(true)
    setSelectableText('')
    setTextTruncated(false)

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
        if (showTextPreview) {
          extractPdfText(pdf)
            .then(({ text, truncated }) => {
              if (cancelled) return
              setSelectableText(text)
              setTextTruncated(truncated)
            })
            .catch((err) => {
              if (cancelled) return
              console.debug('[PdfPreview] text extraction error', err)
              setSelectableText('')
              setTextTruncated(false)
            })
        } else {
          setSelectableText('')
          setTextTruncated(false)
        }
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
  }, [data, showTextPreview])

  useEffect(() => {
    if (!pageCount) {
      setPageNumber(1)
      return
    }
    setPageNumber((prev) => {
      if (prev < 1) return 1
      if (prev > pageCount) return pageCount
      return prev
    })
  }, [pageCount])

  useEffect(() => {
    const target = Number(requestedPage)
    if (!Number.isFinite(target)) {
      return
    }
    const maxPage = pageCount || 1
    const nextPage = Math.min(Math.max(Math.floor(target), 1), maxPage)
    setPageNumber((prev) => (prev === nextPage ? prev : nextPage))
  }, [requestedPage, pageCount])

  useEffect(() => {
    onPagerStateChange && onPagerStateChange({
      pageNumber,
      pageCount,
      renderingPage,
      status,
      nativeViewer: false,
    })
  }, [pageNumber, pageCount, renderingPage, status, onPagerStateChange])

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

  return (
    <div className="pdf-preview">
      {status === 'loading' && <span className="pill pill--info">Rendering PDF…</span>}
      {status === 'error' && <div className="feedback feedback--error">{error}</div>}
      {status === 'ready' && (
        <div className="pdf-preview__toolbar" role="group" aria-label="PDF zoom controls">
          <button
            type="button"
            className="ghost ghost--small"
            onClick={() => setScale((prev) => clampScale(prev - SCALE_STEP))}
            disabled={scale <= MIN_SCALE || renderingPage}
          >
            Zoom out
          </button>
          <span className="pdf-preview__zoom">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="ghost ghost--small"
            onClick={() => setScale((prev) => clampScale(prev + SCALE_STEP))}
            disabled={scale >= MAX_SCALE || renderingPage}
          >
            Zoom in
          </button>
        </div>
      )}
      <div className="pdf-preview__viewport" aria-label="PDF preview viewport">
        <canvas ref={canvasRef} className="pdf-preview__canvas" aria-label="PDF preview" />
      </div>
      {renderingPage && status === 'ready' && <small className="content-panel__hint">Rendering page {pageNumber}…</small>}
      {status === 'ready' && pageCount > 1 && !renderingPage && (
        <small className="content-panel__hint">Viewing page {pageNumber} of {pageCount}.</small>
      )}
      {showTextPreview && status === 'ready' && selectableText && (
        <div className="pdf-preview__text-panel">
          <div className="pdf-preview__text-header">
            <strong>Selectable text preview</strong>
            <button type="button" className="ghost" onClick={handleCopyText}>
              Copy text
            </button>
          </div>
          <pre className="content-preview content-preview--selectable" aria-label="Extracted PDF text preview">
            {selectableText}
          </pre>
          {textTruncated && <small className="content-panel__hint">Extracted text preview truncated for performance.</small>}
        </div>
      )}
    </div>
  )
}
