import { useCallback, useEffect, useMemo, useState, useContext, useRef } from 'react'
import {
  addApprovalNote,
  approveDocument,
  archiveDocument,
  buildDocumentAccessUrl,
  buildDownloadUrl,
  createFolder,
  deleteFolder,
  fetchDocument,
  fetchMyFolderPermissions,
  fetchFolderPermissions,
  fetchFolderPermissionTemplate,
  listApproverOptions,
  listDocuments,
  listFolderTree,
  listSupervisorOptions,
  delegateApproval,
  rejectDocument,
  updateFolder,
  updateDocument,
  updateFolderPermissions,
  uploadDocument,
  uploadVersion,
  getStoredDocumentOcr,
  runStoredDocumentOcr,
  authHeaders,
  runDataExtraction,
  saveDataExtractionResult,
} from '../api/documents'
import DocumentFilters from './DocumentFilters'
import DocumentList from './DocumentList'
import DocumentDetails from './DocumentDetails'
import UploadPanel from './UploadPanel'
import FolderBrowser from './FolderBrowser'
import ChatbotPanel from './ChatbotPanel'
import { getEmbeddingJobStatus, startEmbeddingJob } from '../api/chatbot'
import { AuthContext, Roles } from '../contexts/AuthContext'
import { AnnounceContext } from '../contexts/AnnounceContext'
import { findFolderBreadcrumbs, findFolderNode } from '../utils/folders'
import { validateMetadataValues } from '../utils/metadataTemplate'
import { createKnowledgeTopic, linkKnowledgeDocument } from '../api/knowledge'

const buildDefaultFilters = () => ({
  query: '',
  searchColumns: ['title'],
  searchOperator: 'OR',
  conditions: [
    { field: 'title', value: '', join: '', metadataField: '' },
  ],
  conditionOperator: 'OR',
  owner: '',
  category: '',
  status: 'ALL',
  tags: [],
  folderId: null,
})

const defaultPage = { page: 0, size: 12 }
const PAGE_SIZE_OPTIONS = new Set([5, 10, 12, 20, 50])
const PAGINATION_STORAGE_KEY = 'dms.documents.pagination'

const normalizePersistedPageState = (value) => {
  if (!value || typeof value !== 'object') {
    return defaultPage
  }
  const page = Number(value.page)
  const size = Number(value.size)
  return {
    page: Number.isFinite(page) && page >= 0 ? Math.floor(page) : defaultPage.page,
    size: Number.isFinite(size) && PAGE_SIZE_OPTIONS.has(size) ? size : defaultPage.size,
  }
}

const buildPaginationStorageKey = (username) => {
  const normalized = (username || '').toString().trim().toLowerCase()
  return normalized ? `${PAGINATION_STORAGE_KEY}.${normalized}` : PAGINATION_STORAGE_KEY
}

const readPersistedPageState = (username) => {
  try {
    const raw = window.localStorage.getItem(buildPaginationStorageKey(username))
    if (!raw) {
      return defaultPage
    }
    return normalizePersistedPageState(JSON.parse(raw))
  } catch {
    return defaultPage
  }
}

const persistPageState = (username, state) => {
  try {
    const normalizedState = normalizePersistedPageState(state)
    window.localStorage.setItem(buildPaginationStorageKey(username), JSON.stringify(normalizedState))
    // Keep a generic fallback for sessions before user context is available.
    window.localStorage.setItem(PAGINATION_STORAGE_KEY, JSON.stringify(normalizedState))
  } catch {
    // Ignore persistence failures (e.g. storage disabled).
  }
}

const OCR_STATUS_META = {
  NOT_STARTED: { label: 'Not Run', tone: 'neutral', description: 'OCR has not been run for this document.' },
  QUEUED: { label: 'Queued', tone: 'info', description: 'OCR job has been queued in the backend.' },
  RUNNING: { label: 'Running', tone: 'info', description: 'OCR is currently running.' },
  READY: { label: 'Ready', tone: 'success', description: 'OCR result is available.' },
  FAILED: { label: 'Failed', tone: 'danger', description: 'OCR failed. Review the status message and try again.' },
}

const EMBEDDING_STATUS_META = {
  IDLE: { label: 'Idle', tone: 'neutral' },
  QUEUED: { label: 'Queued', tone: 'info' },
  RUNNING: { label: 'Running', tone: 'info' },
  COMPLETED: { label: 'Ready', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
}

const OCR_DEFAULT_CONFIDENCE = 95

const EXTRACTION_PLACEHOLDER_VALUES = new Set(['n/a', 'na', 'not available', 'not found', 'none', 'null', 'undefined', 'unknown'])

function normalizeOcrStatus(value, isOcr) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (normalized && OCR_STATUS_META[normalized]) {
    return normalized
  }
  return isOcr ? 'READY' : 'NOT_STARTED'
}

function normalizeTags(value) {
  return (value ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length)
}

const collectTextFromNode = (node, lines) => {
  if (!node) return
  if (typeof node === 'string') {
    const trimmed = node.trim()
    if (trimmed.length) {
      lines.push(trimmed)
    }
    return
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectTextFromNode(item, lines))
    return
  }
  if (typeof node === 'object') {
    collectTextFromNode(node.text, lines)
    collectTextFromNode(node.markdown, lines)
    collectTextFromNode(node.md, lines)
    collectTextFromNode(node.content, lines)
    collectTextFromNode(node.md_content, lines)
    collectTextFromNode(node.markdown_content, lines)
    collectTextFromNode(node.preview_markdown, lines)
    collectTextFromNode(node.combined_md_content, lines)
    if (Array.isArray(node.cells_data)) {
      node.cells_data.forEach((cell) => collectTextFromNode(cell?.text, lines))
    }
  }
}

const extractOcrPreview = (response) => {
  const lines = []
  collectTextFromNode(response?.results, lines)
  if (!lines.length) {
    collectTextFromNode(response, lines)
  }
  return lines.join('\n\n')
}

const extractPagePreview = (page) => {
  if (!page) {
    return ''
  }
  const lines = []
  if (typeof page.md_content === 'string' && page.md_content.trim().length) {
    lines.push(page.md_content.trim())
  }
  if (!lines.length) {
    collectTextFromNode(page, lines)
  }
  return lines.join('\n\n')
}

const escapeHtml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const convertMarkdownLikeImages = (content) => {
  if (!content) {
    return ''
  }

  // Markdown image syntax: ![alt](url)
  let next = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const safeAlt = escapeHtml(alt || '')
    const safeUrl = (url || '').trim()
    return `<img src="${safeUrl}" alt="${safeAlt}" />`
  })

  // Bare data-image URL on its own line/segment.
  next = next.replace(/(^|\s)(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)(?=\s|$)/g, (_, prefix, dataUrl) => {
    return `${prefix}<img src="${dataUrl}" alt="OCR embedded image" />`
  })

  return next
}

const renderSimpleMarkdown = (content) => {
  if (!content) {
    return ''
  }

  // Split into blocks by paragraph breaks first (before escaping)
  const blocks = content
    .split(/\r?\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      // Check if this block is raw HTML (tag detected before escaping)
      const isHtmlBlock = /^<[a-z][\s\S]*>/.test(block)

      if (isHtmlBlock) {
        // Keep HTML blocks as-is
        return block
      }

      // For non-HTML blocks, escape and apply markdown formatting
      let html = escapeHtml(block)
      html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img src="${url.trim()}" alt="${alt}" />`)
      html = html
        .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
        .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
        .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
        .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
        .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
        .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')

      // Check if markdown formatting produced HTML tags (headings, images, etc.)
      if (/^<[a-z]/.test(html)) {
        return html
      }

      // Wrap remaining non-HTML content in paragraph tags with br for line breaks
      return `<p>${html.replace(/\r?\n/g, '<br />')}</p>`
    })

  return blocks.join('\n')
}

const buildPreviewDocument = (content) => {
  const body = `<article class="ocr-markdown">${renderSimpleMarkdown(content)}</article>`

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Segoe UI, sans-serif; font-size: 13px; margin: 0; padding: 12px; color: #0f172a; background: #fff; }
      .ocr-markdown { line-height: 1.4; }
      .ocr-markdown h1, .ocr-markdown h2, .ocr-markdown h3, .ocr-markdown h4 { margin: 10px 0 8px; }
      .ocr-markdown table { border-collapse: collapse; width: 100%; margin: 10px 0; }
      .ocr-markdown td, .ocr-markdown th { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
      .ocr-markdown p { margin: 0 0 10px 0; }
      .ocr-markdown img { max-width: 100%; height: auto; display: block; margin: 10px 0; border-radius: 8px; }
      .ocr-raw { white-space: pre-wrap; margin: 0; font-family: Consolas, monospace; font-size: 8px; }
    </style>
  </head>
  <body>${body}</body>
</html>`
}

const safeFileStem = (input) => {
  const value = (input || 'document').trim().replace(/\.[^/.]+$/, '')
  return value.replace(/[^a-z0-9\-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'document'
}

const getLatestVersion = (versions) => {
  if (!Array.isArray(versions) || !versions.length) {
    return null
  }
  return versions.reduce((latest, current) => {
    if (!latest) {
      return current
    }
    return (current?.version ?? 0) > (latest?.version ?? 0) ? current : latest
  }, null)
}

const toTimestamp = (value) => {
  if (!value) return 0
  const millis = new Date(value).getTime()
  return Number.isFinite(millis) ? millis : 0
}

const toDateInputValue = (value, fallback = '') => {
  if (!value) {
    return fallback
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return fallback
  }
  return date.toISOString().slice(0, 10)
}

const normalizeReviewerOptions = (data) => {
  if (!Array.isArray(data)) {
    return []
  }
  return data
    .map((item) => {
      const id = item?.id ?? item?.userId ?? item?.username ?? null
      return id != null ? String(id).trim() : ''
    })
    .filter(Boolean)
}

const compareText = (a, b) => {
  const left = (a ?? '').toString().toLowerCase()
  const right = (b ?? '').toString().toLowerCase()
  return left.localeCompare(right)
}

const sortDocumentsLocally = (items, sortValue) => {
  if (!Array.isArray(items) || items.length <= 1) {
    return Array.isArray(items) ? items : []
  }

  const [fieldRaw, directionRaw] = (sortValue || 'createdAt,desc').split(',')
  const field = (fieldRaw || 'createdAt').trim()
  const direction = (directionRaw || 'desc').trim().toLowerCase() === 'asc' ? 1 : -1

  const sorted = [...items].sort((a, b) => {
    switch (field) {
      case 'title':
        return compareText(a?.title, b?.title) * direction
      case 'status':
        return compareText(a?.status, b?.status) * direction
      case 'latestSizeBytes': {
        const left = Number(a?.latestSizeBytes || 0)
        const right = Number(b?.latestSizeBytes || 0)
        return (left - right) * direction
      }
      case 'updatedAt': {
        const left = toTimestamp(a?.updatedAt)
        const right = toTimestamp(b?.updatedAt)
        return (left - right) * direction
      }
      case 'createdAt':
      default: {
        // Summary payload may not expose createdAt; fall back to updatedAt.
        const left = toTimestamp(a?.createdAt || a?.updatedAt)
        const right = toTimestamp(b?.createdAt || b?.updatedAt)
        return (left - right) * direction
      }
    }
  })

  return sorted
}

const deepCloneJson = (value) => {
  try {
    return JSON.parse(JSON.stringify(value ?? {}))
  } catch {
    return {}
  }
}

const parseJsonObject = (raw) => {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const buildEditableRows = (node, prefix = '', level = 0, rows = []) => {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return rows
  }
  Object.entries(node).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      rows.push({ type: 'group', key: path, label: key, level })
      buildEditableRows(value, path, level + 1, rows)
      return
    }
    rows.push({ type: 'field', key: path, label: key, path, level, value })
  })
  return rows
}

const setNestedValue = (source, path, nextValue) => {
  const clone = deepCloneJson(source)
  const keys = path.split('.')
  let current = clone
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i]
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
      current[key] = {}
    }
    current = current[key]
  }
  current[keys[keys.length - 1]] = nextValue
  return clone
}

const prettifyLabel = (value) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase())

const isMeaningfulExtractionValue = (value) => {
  if (value == null) {
    return false
  }
  const normalized = String(value).trim()
  if (!normalized) {
    return false
  }
  return !EXTRACTION_PLACEHOLDER_VALUES.has(normalized.toLowerCase())
}

const mergeExtractedMetadata = (currentMetadata, extractedMetadata, metadataTemplate = []) => {
  const merged = currentMetadata && typeof currentMetadata === 'object' ? { ...currentMetadata } : {}
  if (!extractedMetadata || typeof extractedMetadata !== 'object') {
    return merged
  }
  metadataTemplate.forEach((field) => {
    const key = field?.key
    if (!key) {
      return
    }
    const nextValue = extractedMetadata[key]
    if (!isMeaningfulExtractionValue(nextValue)) {
      return
    }
    merged[key] = String(nextValue).trim()
  })
  return merged
}

const isJsonObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const hasJsonObjectKeys = (value) => isJsonObject(value) && Object.keys(value).length > 0

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default function DocumentWorkspace({ currentFunction = 'Document Management', onFindRelatedTopics = null, navigationContext = null }) {
  const { documentPermissions, role, setDocumentPermissionsOverride, currentUser, isAuthenticated } = useContext(AuthContext)
  const { toast } = useContext(AnnounceContext)
  const [filters, setFilters] = useState(buildDefaultFilters)
  const [pageState, setPageState] = useState(() => readPersistedPageState())
  const [sort, setSort] = useState('createdAt,desc')
  const [filterQueryLocal, setFilterQueryLocal] = useState('')
  const [documents, setDocuments] = useState([])
  const [pageMeta, setPageMeta] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [ocrWorkspaceOpen, setOcrWorkspaceOpen] = useState(false)
  const [uploadPrefill, setUploadPrefill] = useState(null)
  const [topicCreateModal, setTopicCreateModal] = useState({
    open: false,
    document: null,
    title: '',
    description: '',
    tags: '',
  })
  const [folderTree, setFolderTree] = useState([])
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draggedDocumentId, setDraggedDocumentId] = useState(null)
  const [movingDocumentId, setMovingDocumentId] = useState(null)
  const [expandedDocumentId, setExpandedDocumentId] = useState(null)
  const [expandedDocument, setExpandedDocument] = useState(null)
  const [expandedLoading, setExpandedLoading] = useState(false)
  const [expandedError, setExpandedError] = useState('')
  const [chatbotOpen, setChatbotOpen] = useState(false)
  // Ensure details view opens on the content tab when a document is selected
  const [detailsInitialTab, setDetailsInitialTab] = useState('content')
  const [ocrPrompt, setOcrPrompt] = useState('prompt_ocr')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrLoadingCached, setOcrLoadingCached] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [ocrResult, setOcrResult] = useState(null)
  const [ocrPreview, setOcrPreview] = useState('')
  const [ocrPreviewMode, setOcrPreviewMode] = useState('render')
  const [ocrPageIndex, setOcrPageIndex] = useState(0)
  const [ocrRefreshKey, setOcrRefreshKey] = useState(0)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('')
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false)
  const [pdfPreviewError, setPdfPreviewError] = useState('')
  // OCR workspace nav-tab: 'ocr' | 'extraction'
  const [ocrWorkspaceTab, setOcrWorkspaceTab] = useState('ocr')
  const [extractionBusy, setExtractionBusy] = useState(false)
  const [extractionError, setExtractionError] = useState('')
  const [extractionResult, setExtractionResult] = useState(null)
  const [editableExtractionData, setEditableExtractionData] = useState(null)
  const [originalExtractionData, setOriginalExtractionData] = useState(null)
  const [embeddingBusy, setEmbeddingBusy] = useState(false)
  const [embeddingJobId, setEmbeddingJobId] = useState(null)
  const [embeddingStatus, setEmbeddingStatus] = useState('IDLE')
  const [embeddingMessage, setEmbeddingMessage] = useState('')
  const [embeddingError, setEmbeddingError] = useState('')
  const [embeddingResult, setEmbeddingResult] = useState(null)
  const paginationRestoreDoneRef = useRef(false)

  const normalizedFilters = useMemo(() => ({
    ...filters,
    tags: normalizeTags(filters.tags ?? []),
  }), [filters])
  // Debounce timer for loadDocuments to avoid rapid repeated calls
  const loadDebounceTimerRef = useRef(null)
  // Request id counter and latest id for guarding stale responses
  const requestCounterRef = useRef(0)
  const latestRequestIdRef = useRef(0)
  const workspaceSelectionPath = useMemo(() => findFolderBreadcrumbs(folderTree, filters.folderId), [folderTree, filters.folderId])
  const selectedListDocument = useMemo(
    () => documents.find((doc) => String(doc.id) === String(selectedId ?? '')) ?? null,
    [documents, selectedId]
  )
  const selectedDocumentFolderId = selectedDocument?.folder?.id ?? null
  const selectedFilterFolder = useMemo(
    () => (filters.folderId ? findFolderNode(folderTree, filters.folderId) : null),
    [folderTree, filters.folderId]
  )
  const activeSearchFolderTemplate = useMemo(() => {
    if (Array.isArray(selectedFilterFolder?.metadataTemplate) && selectedFilterFolder.metadataTemplate.length) {
      return selectedFilterFolder.metadataTemplate
    }
    if (Array.isArray(selectedDocument?.folder?.metadataTemplate) && selectedDocument.folder.metadataTemplate.length) {
      return selectedDocument.folder.metadataTemplate
    }
    if (Array.isArray(selectedListDocument?.folder?.metadataTemplate) && selectedListDocument.folder.metadataTemplate.length) {
      return selectedListDocument.folder.metadataTemplate
    }
    return []
  }, [selectedFilterFolder, selectedDocument?.folder?.metadataTemplate, selectedListDocument?.folder?.metadataTemplate])
  const folderMetadataFieldOptions = useMemo(() => {
    const template = Array.isArray(activeSearchFolderTemplate) ? activeSearchFolderTemplate : []
    return template
      .filter((field) => field?.key)
      .map((field) => {
        const key = String(field.key).trim()
        const label = (field.label || key).trim()
        return { key, label }
      })
      .filter((field) => field.key)
  }, [activeSearchFolderTemplate])
  const activePermissionFolderId = filters.folderId ?? selectedDocumentFolderId ?? null
  const canManageFolderPermissions = role === Roles.SYS_ADMIN || role === Roles.USER_ADMIN
  const approverUsername = currentUser?.username ? currentUser.username.toLowerCase() : null
  const latestSelectedVersion = useMemo(() => getLatestVersion(selectedDocument?.versions), [selectedDocument?.versions])
  const selectedFileName = latestSelectedVersion?.fileName ?? ''
  const selectedContentType = latestSelectedVersion?.contentType ?? ''
  const selectedDocumentIsOcr = Boolean(
    selectedDocument?.isOcr ?? selectedDocument?.is_ocr ?? selectedListDocument?.isOcr ?? selectedListDocument?.is_ocr
  )
  const selectedDocumentOcrStatus = useMemo(
    () => normalizeOcrStatus(
      selectedDocument?.ocrStatus
        ?? selectedDocument?.ocr_status
        ?? selectedListDocument?.ocrStatus
        ?? selectedListDocument?.ocr_status,
      selectedDocumentIsOcr
    ),
    [
      selectedDocument?.ocrStatus,
      selectedDocument?.ocr_status,
      selectedListDocument?.ocrStatus,
      selectedListDocument?.ocr_status,
      selectedDocumentIsOcr,
    ]
  )
  const selectedDocumentOcrStatusMeta = OCR_STATUS_META[selectedDocumentOcrStatus] ?? OCR_STATUS_META.NOT_STARTED
  const selectedDocumentOcrStatusMessage =
    selectedDocument?.ocrStatusMessage
      ?? selectedDocument?.ocr_status_message
      ?? selectedListDocument?.ocrStatusMessage
      ?? selectedListDocument?.ocr_status_message
      ?? selectedDocumentOcrStatusMeta.description
  const selectedDocumentOcrStatusUpdatedAt =
    selectedDocument?.ocrStatusUpdatedAt
      ?? selectedDocument?.ocr_status_updated_at
      ?? selectedListDocument?.ocrStatusUpdatedAt
      ?? selectedListDocument?.ocr_status_updated_at
      ?? null
  const embeddingStatusMeta = EMBEDDING_STATUS_META[embeddingStatus] ?? EMBEDDING_STATUS_META.IDLE
  const selectedLooksPdf = useMemo(() => {
    const byName = selectedFileName.toLowerCase().endsWith('.pdf')
    const byType = selectedContentType.toLowerCase().includes('pdf')
    return byName || byType
  }, [selectedFileName, selectedContentType])
  const selectedDocumentHasExtraction = Boolean(
    selectedDocument?.hasDataExtraction
      ?? selectedDocument?.has_data_extraction
      ?? selectedListDocument?.hasDataExtraction
      ?? selectedListDocument?.has_data_extraction
  )
  const extractionPayloadAvailable = useMemo(() => {
    const extractedFromOcr = ocrResult?.extracted_json
    if (extractedFromOcr && typeof extractedFromOcr === 'object') {
      return true
    }
    const extractedFromDocument = selectedDocument?.extractedJson ?? selectedDocument?.extracted_json
    if (extractedFromDocument && typeof extractedFromDocument === 'object') {
      return true
    }
    return false
  }, [ocrResult?.extracted_json, selectedDocument?.extractedJson, selectedDocument?.extracted_json])
  const extractionBackendPending =
    selectedId
    && selectedLooksPdf
    && (
      selectedDocumentOcrStatus === 'QUEUED'
      || selectedDocumentOcrStatus === 'RUNNING'
      || (selectedDocumentOcrStatus === 'READY' && selectedDocumentHasExtraction && !extractionPayloadAvailable)
    )
  const ocrPages = useMemo(() => (Array.isArray(ocrResult?.results) ? ocrResult.results : []), [ocrResult])
  const currentOcrPage = ocrPages.length ? ocrPages[Math.min(Math.max(ocrPageIndex, 0), ocrPages.length - 1)] : null
  const currentOcrPagePreview = useMemo(() => extractPagePreview(currentOcrPage), [currentOcrPage])
  const currentOcrPageJson = useMemo(() => {
    if (!currentOcrPage) {
      return ''
    }
    const payload = Array.isArray(currentOcrPage.cells_data) ? currentOcrPage.cells_data : currentOcrPage
    try {
      return JSON.stringify(payload, null, 2)
    } catch {
      return String(payload)
    }
  }, [currentOcrPage])

  const activeOcrPreviewContent = useMemo(() => {
    if (ocrPages.length) {
      return currentOcrPagePreview
    }
    return ocrPreview
  }, [ocrPages.length, currentOcrPagePreview, ocrPreview])

  const editableRows = useMemo(() => {
    if (!editableExtractionData || typeof editableExtractionData !== 'object') {
      return []
    }
    return buildEditableRows(editableExtractionData)
  }, [editableExtractionData])

  useEffect(() => {
    if (!selectedDocumentIsOcr && ocrPrompt !== 'prompt_ocr') {
      setOcrPrompt('prompt_ocr')
    }
  }, [selectedDocumentIsOcr, ocrPrompt])

  useEffect(() => {
    let cancelled = false

    const loadCachedOcr = async () => {
      if (!selectedId || !selectedLooksPdf) {
        setOcrResult(null)
        setOcrPreview('')
        setOcrError('')
        return
      }

      if (!selectedDocumentIsOcr) {
        setOcrResult(null)
        setOcrPreview('')
        setOcrError('')
        setOcrLoadingCached(false)
        return
      }

      if (ocrPrompt !== 'prompt_ocr') {
        setOcrResult(null)
        setOcrPreview('')
        setOcrError('')
        setOcrLoadingCached(false)
        return
      }

      setOcrLoadingCached(true)
      setOcrError('')
      try {
        const cached = await getStoredDocumentOcr(selectedId, ocrPrompt, OCR_DEFAULT_CONFIDENCE)
        if (!cancelled) {
          setOcrResult(cached)
          setOcrPreview(extractOcrPreview(cached))
          setOcrPageIndex(0)
        }
      } catch (err) {
        if (!cancelled) {
          const message = err.message || ''
          if (message.toLowerCase().includes('no cached ocr result')) {
            setOcrResult(null)
            setOcrPreview('')
          } else {
            setOcrError(message)
          }
        }
      } finally {
        if (!cancelled) {
          setOcrLoadingCached(false)
        }
      }
    }

    loadCachedOcr()

    return () => {
      cancelled = true
    }
  }, [selectedId, selectedLooksPdf, selectedDocumentIsOcr, ocrPrompt, ocrRefreshKey])

  useEffect(() => {
    setEmbeddingBusy(false)
    setEmbeddingJobId(null)
    setEmbeddingStatus('IDLE')
    setEmbeddingMessage('')
    setEmbeddingError('')
    setEmbeddingResult(null)
  }, [selectedId])

  useEffect(() => {
    if (!embeddingJobId || !['QUEUED', 'RUNNING'].includes(embeddingStatus)) {
      return undefined
    }

    let cancelled = false
    const pollEmbeddingJob = async () => {
      try {
        const response = await getEmbeddingJobStatus(embeddingJobId)
        if (cancelled) {
          return
        }
        const nextStatus = String(response?.status ?? 'FAILED').toUpperCase()
        const nextMessage = response?.message ?? ''
        const nextError = response?.error ?? ''
        setEmbeddingStatus(nextStatus)
        setEmbeddingMessage(nextMessage)
        setEmbeddingError(nextError)
        setEmbeddingResult(response?.result ?? null)
        setEmbeddingBusy(nextStatus === 'QUEUED' || nextStatus === 'RUNNING')
        if (nextStatus === 'COMPLETED') {
          toast && toast('Chunking and embedding completed for chatbot search.', { type: 'success' })
        } else if (nextStatus === 'FAILED') {
          toast && toast(nextError || nextMessage || 'Chunking and embedding failed.', { type: 'error' })
        }
      } catch (err) {
        if (cancelled) {
          return
        }
        const message = err.message || 'Failed to poll embedding job status'
        setEmbeddingBusy(false)
        setEmbeddingStatus('FAILED')
        setEmbeddingMessage(message)
        setEmbeddingError(message)
        toast && toast(message, { type: 'error' })
      }
    }

    pollEmbeddingJob()
    const timer = window.setInterval(pollEmbeddingJob, 3000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [embeddingJobId, embeddingStatus, toast])

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    const loadPreview = async () => {
      if (!selectedId || !selectedLooksPdf) {
        setPdfPreviewUrl('')
        setPdfPreviewError('')
        setPdfPreviewLoading(false)
        return
      }

      setPdfPreviewLoading(true)
      setPdfPreviewError('')
      try {
        const response = await fetch(buildDownloadUrl(selectedId), { headers: { ...authHeaders() } })
        if (!response.ok) {
          throw new Error(`Failed to load PDF preview (${response.status})`)
        }
        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) {
          setPdfPreviewUrl(objectUrl)
        }
      } catch (err) {
        if (!cancelled) {
          setPdfPreviewError(err.message || 'Unable to load PDF preview')
          setPdfPreviewUrl('')
        }
      } finally {
        if (!cancelled) {
          setPdfPreviewLoading(false)
        }
      }
    }

    loadPreview()

    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [selectedId, selectedLooksPdf])

  const canOverrideWriteForDocument = (documentId) => {
    if (!documentId || !approverUsername) {
      return false
    }
    const target = selectedDocument?.id === documentId
      ? selectedDocument
      : expandedDocument?.id === documentId
        ? expandedDocument
        : null
    if (!target || target.status !== 'DRAFT' || !target?.approval?.approverUsername) {
      return false
    }
    return target.approval.approverUsername.toLowerCase() === approverUsername
  }

  useEffect(() => {
    loadDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedFilters, pageState.page, pageState.size])

  useEffect(() => {
    console.debug('DocumentWorkspace mounted')
    return () => {
      console.debug('DocumentWorkspace unmounted')
    }
  }, [])

  useEffect(() => {
    if (paginationRestoreDoneRef.current) {
      return
    }
    const restoredState = readPersistedPageState(currentUser?.username)
    setPageState(restoredState)
    paginationRestoreDoneRef.current = true
  }, [currentUser?.username])

  useEffect(() => {
    persistPageState(currentUser?.username, pageState)
  }, [currentUser?.username, pageState.page, pageState.size])

  useEffect(() => {
    // reload when sort changes
    setPageState((p) => ({ ...p, page: 0 }))
    loadDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort])

  useEffect(() => {
    // debounce simple filter query locally, then apply
    const t = setTimeout(() => {
      setFilters((prev) => ({ ...prev, query: filterQueryLocal }))
      setPageState((prev) => ({ ...prev, page: 0 }))
    }, 300)
    return () => clearTimeout(t)
  }, [filterQueryLocal])

  useEffect(() => {
    if (!isAuthenticated || !navigationContext?.stamp) {
      return
    }
    const targetId = (navigationContext.documentId ?? '').toString().trim()
    if (!targetId) {
      return
    }
    let cancelled = false
    const openLinkedDocument = async () => {
      try {
        const detail = await fetchDocument(targetId)
        if (cancelled) {
          return
        }
        const resolvedId = detail?.id != null ? String(detail.id) : targetId
        setSelectedId(resolvedId)
        setSelectedDocument(detail)
        setFilterQueryLocal('')
        setFilters((prev) => ({ ...buildDefaultFilters(), folderId: prev.folderId }))
        setPageState((prev) => ({ ...prev, page: 0 }))
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          toast && toast(err.message || 'Unable to open linked document', { type: 'error' })
        }
      }
    }
    openLinkedDocument()
    return () => {
      cancelled = true
    }
  }, [navigationContext?.stamp, isAuthenticated])

  const loadFolderTree = useCallback(async () => {
    setFolderLoading(true)
    setFolderError('')
    try {
      const data = await listFolderTree()
      setFolderTree(data)
    } catch (err) {
      setFolderError(err.message)
      toast && toast(err.message || 'Failed to load folders', { type: 'error' })
    } finally {
      setFolderLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFolderTree()
  }, [loadFolderTree])

  useEffect(() => {
    return () => {
      if (loadDebounceTimerRef.current) clearTimeout(loadDebounceTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (uploadOpen) {
      loadFolderTree()
    }
  }, [uploadOpen, loadFolderTree])

  useEffect(() => {
    if (typeof setDocumentPermissionsOverride !== 'function') {
      return
    }
    if (role === Roles.SYS_ADMIN) {
      setDocumentPermissionsOverride(null)
      return
    }
    if (!activePermissionFolderId) {
      setDocumentPermissionsOverride(null)
      return
    }
    let cancelled = false
    const fetchPermissions = async () => {
      try {
        const result = await fetchMyFolderPermissions(activePermissionFolderId)
        if (cancelled) return
        setDocumentPermissionsOverride({
          read: !!(result?.canRead),
          write: !!(result?.canWrite),
          delete: !!(result?.canDelete),
        })
      } catch (err) {
        if (cancelled) return
        setDocumentPermissionsOverride({ read: false, write: false, delete: false })
        toast && toast(err.message || 'Unable to load folder permissions', { type: 'error' })
      }
    }
    fetchPermissions()
    return () => {
      cancelled = true
    }
  }, [activePermissionFolderId, role, setDocumentPermissionsOverride, toast])

  useEffect(() => {
    if (documents.length && selectedId == null) {
      setSelectedId(documents[0].id)
    }
  }, [documents, selectedId])

  useEffect(() => {
    if (selectedId == null) {
      setSelectedDocument(null)
      return
    }
    loadDocumentDetails(selectedId)
  }, [selectedId])

  useEffect(() => {
    if (!expandedDocumentId || !selectedDocument) {
      return
    }
    if (String(expandedDocumentId) !== String(selectedDocument.id)) {
      return
    }
    setExpandedDocument(selectedDocument)
  }, [expandedDocumentId, selectedDocument])

  useEffect(() => {
    if (!selectedId || !['QUEUED', 'RUNNING'].includes(selectedDocumentOcrStatus)) {
      return
    }
    let cancelled = false
    const intervalId = window.setInterval(async () => {
      try {
        const document = await fetchDocument(selectedId)
        if (cancelled) {
          return
        }
        setSelectedDocument(document)
        if (expandedDocument?.id === selectedId) {
          setExpandedDocument(document)
        }
      } catch {
        // keep polling silent while background OCR is in progress
      }
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [selectedId, selectedDocumentOcrStatus, expandedDocument?.id])

  useEffect(() => {
    if (ocrWorkspaceTab !== 'extraction' || !extractionBackendPending) {
      return
    }
    let cancelled = false
    const refreshExtractionState = async () => {
      try {
        const document = await fetchDocument(selectedId)
        if (cancelled) {
          return
        }
        setSelectedDocument(document)
        if (expandedDocument?.id === selectedId) {
          setExpandedDocument(document)
        }
        setOcrRefreshKey((value) => value + 1)
      } catch {
        // keep polling silent while backend extraction is still running
      }
    }
    refreshExtractionState()
    const intervalId = window.setInterval(refreshExtractionState, 3000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [ocrWorkspaceTab, extractionBackendPending, selectedId, expandedDocument?.id])

  const loadDocuments = async () => {
    console.debug('loadDocuments requested', { filters: normalizedFilters, page: pageState.page, size: pageState.size, sort })
    // debounce to collapse rapid calls
    if (loadDebounceTimerRef.current) clearTimeout(loadDebounceTimerRef.current)
    loadDebounceTimerRef.current = setTimeout(async () => {
      const requestId = ++requestCounterRef.current
      latestRequestIdRef.current = requestId
      console.debug('loadDocuments start', { requestId, filters: normalizedFilters, page: pageState.page })
      setLoading(true)
      setError('')
      try {
        const data = await listDocuments({ page: pageState.page, size: pageState.size, filters: { ...normalizedFilters, sort } })
        // ignore stale responses
        if (latestRequestIdRef.current !== requestId) {
          console.debug('loadDocuments: stale response ignored', { requestId })
          return
        }
        const sortedDocuments = sortDocumentsLocally(data.content, sort)
        setDocuments(sortedDocuments)
        if (selectedId != null) {
          const matchingSummary = sortedDocuments.find((doc) => String(doc.id) === String(selectedId))
          if (matchingSummary) {
            setSelectedDocument((prev) => {
              if (!prev || String(prev.id) !== String(selectedId)) {
                return prev
              }
              return {
                ...prev,
                isOcr: matchingSummary.isOcr ?? matchingSummary.is_ocr ?? prev.isOcr ?? prev.is_ocr,
                ocrStatus: matchingSummary.ocrStatus ?? matchingSummary.ocr_status ?? prev.ocrStatus ?? prev.ocr_status,
                ocrStatusMessage: matchingSummary.ocrStatusMessage ?? matchingSummary.ocr_status_message ?? prev.ocrStatusMessage ?? prev.ocr_status_message,
                ocrStatusUpdatedAt: matchingSummary.ocrStatusUpdatedAt ?? matchingSummary.ocr_status_updated_at ?? prev.ocrStatusUpdatedAt ?? prev.ocr_status_updated_at,
                hasDataExtraction: matchingSummary.hasDataExtraction ?? matchingSummary.has_data_extraction ?? prev.hasDataExtraction ?? prev.has_data_extraction,
                extractedJson: matchingSummary.extractedJson ?? matchingSummary.extracted_json ?? prev.extractedJson ?? prev.extracted_json,
                extractionFormType: matchingSummary.extractionFormType ?? matchingSummary.extraction_form_type ?? prev.extractionFormType ?? prev.extraction_form_type,
              }
            })
          }
        }
        console.debug('loadDocuments success', { requestId, count: data.content?.length ?? 0 })
        setPageMeta(data)
        const selectedIdText = selectedId == null ? null : String(selectedId)
        const selectedInPage = selectedIdText != null
          ? data.content.some((doc) => String(doc.id) === selectedIdText)
          : false
        const selectedInDetail = selectedIdText != null && selectedDocument?.id != null
          ? String(selectedDocument.id) === selectedIdText
          : false
        if (selectedIdText != null && !selectedInPage && !selectedInDetail) {
          setSelectedId(null)
        }
      } catch (err) {
        if (latestRequestIdRef.current !== requestId) {
          console.debug('loadDocuments: stale error ignored', { requestId, error: err })
          return
        }
        console.debug('loadDocuments error', err)
        setError(err.message)
        toast && toast(err.message || 'Failed to load documents', { type: 'error' })
      } finally {
        if (latestRequestIdRef.current === requestId) setLoading(false)
      }
    }, 120)
  }

  const loadDocumentDetails = async (id) => {
    if (!id) return
    try {
      const document = await fetchDocument(id)
      setSelectedDocument(document)
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to load document details', { type: 'error' })
    }
  }

  const handleRefreshOcrWorkspace = async () => {
    if (!selectedId) {
      toast && toast('Select a document first', { type: 'info' })
      return
    }
    setOcrLoadingCached(true)
    setOcrError('')
    try {
      await loadDocumentDetails(selectedId)
      await loadDocuments()
      setOcrRefreshKey((prev) => prev + 1)
      toast && toast('OCR workspace refreshed', { type: 'success' })
    } catch (err) {
      const message = err.message || 'Failed to refresh OCR workspace'
      setOcrError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setOcrLoadingCached(false)
    }
  }

  const handleOpenOcrWorkspace = () => {
    if (!selectedId) {
      toast && toast('Select a document first', { type: 'info' })
      return
    }
    if (!selectedLooksPdf) {
      setOcrError('Selected document is not a PDF')
      toast && toast('OCR currently supports PDF documents only', { type: 'warning' })
      return
    }
    setOcrWorkspaceTab('ocr')
    setOcrWorkspaceOpen(true)
  }

  const handleDocumentMaximize = async (id) => {
    if (!id) return
    setDetailsInitialTab('content')
    setSelectedId(id)
    setExpandedDocumentId(id)
    setExpandedDocument(null)
    setExpandedLoading(true)
    setExpandedError('')
    try {
      const detail = await fetchDocument(id)
      setExpandedDocument(detail)
    } catch (err) {
      const message = err.message || 'Failed to open document viewer'
      setExpandedError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setExpandedLoading(false)
    }
  }

  const closeExpandedViewer = () => {
    setExpandedDocumentId(null)
    setExpandedDocument(null)
    setExpandedError('')
    setExpandedLoading(false)
  }

  const handleDocumentDragStart = (documentId) => {
    setDraggedDocumentId(documentId)
  }

  const handleDocumentDragEnd = () => {
    setDraggedDocumentId(null)
  }

  const handleDocumentMove = async (targetFolderId) => {
    if (!(documentPermissions?.write ?? false)) {
      setError('Insufficient permissions to move documents')
      toast && toast('Insufficient permissions to move documents', { type: 'error' })
      setDraggedDocumentId(null)
      return
    }
    if (!draggedDocumentId) return
    const doc = documents.find((item) => item.id === draggedDocumentId)
    const currentFolderId = doc?.folder?.id ?? null
    if (currentFolderId === targetFolderId) {
      setDraggedDocumentId(null)
      return
    }
    setMovingDocumentId(draggedDocumentId)
    setError('')
    try {
      await updateDocument(draggedDocumentId, { folderId: targetFolderId })
      await loadDocuments()
      if (selectedDocument?.id === draggedDocumentId) {
        await loadDocumentDetails(draggedDocumentId)
      }
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to move document', { type: 'error' })
    } finally {
      setDraggedDocumentId(null)
      setMovingDocumentId(null)
    }
  }

  const handleRunSelectedOcr = async () => {
    if (!selectedId) {
      toast && toast('Select a document first', { type: 'info' })
      return
    }
    if (!selectedLooksPdf) {
      setOcrError('Selected document is not a PDF')
      toast && toast('OCR currently supports PDF documents only', { type: 'warning' })
      return
    }
    setOcrBusy(true)
    setOcrLoadingCached(false)
    setOcrError('')
    setSelectedDocument((prev) => (prev ? {
      ...prev,
      ocrStatus: 'RUNNING',
      ocrStatusMessage: 'OCR is currently running.',
      ocrStatusUpdatedAt: new Date().toISOString(),
    } : prev))
    try {
      const effectivePrompt = selectedDocumentIsOcr ? ocrPrompt : 'prompt_ocr'
      const response = await runStoredDocumentOcr(selectedId, effectivePrompt, OCR_DEFAULT_CONFIDENCE, true)
      setOcrResult(response)
      setOcrPreview(extractOcrPreview(response))
      setOcrPageIndex(0)
      setSelectedDocument((prev) => (prev ? {
        ...prev,
        isOcr: true,
        ocrStatus: 'READY',
        ocrStatusMessage: 'OCR result is available.',
        ocrStatusUpdatedAt: new Date().toISOString(),
      } : prev))
      toast && toast('OCR completed for selected document', { type: 'success' })
    } catch (err) {
      const message = err.message || 'OCR failed'
      setOcrError(message)
      setSelectedDocument((prev) => (prev ? {
        ...prev,
        isOcr: false,
        ocrStatus: 'FAILED',
        ocrStatusMessage: message,
        ocrStatusUpdatedAt: new Date().toISOString(),
      } : prev))
      toast && toast(message, { type: 'error' })
    } finally {
      setOcrBusy(false)
    }
  }

  const downloadTextFile = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const handleDownloadOcrJson = () => {
    if (!ocrResult) return
    const stem = safeFileStem(selectedDocument?.title)
    downloadTextFile(JSON.stringify(ocrResult, null, 2), `${stem}.ocr.json`)
  }

  const handleDownloadOcrMarkdown = () => {
    if (!ocrPreview) return
    const stem = safeFileStem(selectedDocument?.title)
    downloadTextFile(ocrPreview, `${stem}.ocr.md`)
  }

  const handleRunExtraction = async () => {
    // Use all pages for extraction too, matching the embedding behaviour.
    const ocrText = ocrPages.length > 1
      ? ocrPages
          .map((page, idx) => {
            const content = typeof page.md_content === 'string' ? page.md_content.trim() : extractPagePreview(page)
            return content ? `[Page ${idx + 1}]\n${content}` : ''
          })
          .filter(Boolean)
          .join('\n\n---\n\n')
      : activeOcrPreviewContent
    const metadataTemplate = selectedDocument?.folder?.metadataTemplate
    const effectivePrompt = selectedDocumentIsOcr ? ocrPrompt : 'prompt_ocr'

    if (!ocrText) {
      toast && toast('Run OCR first to get text for extraction.', { type: 'info' })
      return
    }
    if (!metadataTemplate || metadataTemplate.length === 0) {
      toast && toast('Document folder does not have a metadata template. Cannot extract.', { type: 'warning' })
      return
    }

    setExtractionBusy(true)
    setExtractionError('')
    setExtractionResult(null)
    setEditableExtractionData(null)
    setOriginalExtractionData(null)
    try {
      const result = await runDataExtraction(ocrText, metadataTemplate)
      const persisted = selectedId
        ? await saveDataExtractionResult(selectedId, {
            prompt: effectivePrompt,
            formType: result?.form_type ?? 'form1',
            extractedJson: result?.extracted_json ?? {},
          })
        : null
      const mergedResult = {
        ...(result || {}),
        extracted_json: result?.extracted_json ?? persisted?.extracted_json ?? {},
        form_type: result?.form_type ?? persisted?.form_type ?? 'form1',
      }
      setExtractionResult(mergedResult)
      const extracted = deepCloneJson(mergedResult?.extracted_json)
      setEditableExtractionData(extracted)
      setOriginalExtractionData(deepCloneJson(extracted))

      const persistence = await persistExtractedMetadata(extracted, metadataTemplate, {
        successMessage: 'Data extraction completed and document metadata updated.',
        skippedMessage: 'Data extraction completed. Review the extracted data before updating document metadata.',
      })
      toast && toast(persistence.message, { type: persistence.type })
    } catch (err) {
      const message = err.message || 'Data extraction failed'
      setExtractionError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setExtractionBusy(false)
    }
  }

  const handleRunEmbedding = async () => {
    // For multi-page OCR documents, concatenate all pages' md_content so that
    // the entire document is embedded, not just the currently-viewed page.
    const ocrText = ocrPages.length > 1
      ? ocrPages
          .map((page, idx) => {
            const content = typeof page.md_content === 'string' ? page.md_content.trim() : extractPagePreview(page)
            return content ? `[Page ${idx + 1}]\n${content}` : ''
          })
          .filter(Boolean)
          .join('\n\n---\n\n')
      : activeOcrPreviewContent
    const embeddingDocument = selectedDocument ?? selectedListDocument ?? null
    const embeddingFolder = embeddingDocument?.folder ?? null
    const folderBreadcrumbs = Array.isArray(embeddingFolder?.breadcrumbs) ? embeddingFolder.breadcrumbs.filter(Boolean) : []

    if (!selectedId) {
      toast && toast('Select a document first.', { type: 'info' })
      return
    }

    if (!ocrText) {
      toast && toast('Run OCR first to obtain text for chunking and embedding.', { type: 'info' })
      return
    }

    setEmbeddingBusy(true)
    setEmbeddingError('')
    setEmbeddingResult(null)
    setEmbeddingStatus('QUEUED')
    setEmbeddingMessage('Embedding job queued.')

    try {
      const response = await startEmbeddingJob({
        document_id: String(selectedId),
        title: embeddingDocument?.title ?? '',
        description: embeddingDocument?.description ?? '',
        ocr_text: ocrText,
        category: embeddingDocument?.category ?? null,
        owner: embeddingDocument?.owner ?? null,
        tags: Array.isArray(embeddingDocument?.tags) ? embeddingDocument.tags : [],
        document_metadata: embeddingDocument?.metadata ?? {},
        folder_name: embeddingFolder?.name ?? null,
        folder_path: folderBreadcrumbs.length ? folderBreadcrumbs.join(' / ') : null,
        folder_breadcrumbs: folderBreadcrumbs,
        created_at:
          embeddingDocument?.createdAt
          ?? embeddingDocument?.created_at
          ?? null,
        force_reindex: true,
      })
      setEmbeddingJobId(response?.job_id ?? null)
      setEmbeddingStatus(String(response?.status ?? 'QUEUED').toUpperCase())
      setEmbeddingMessage(response?.message ?? 'Embedding job queued.')
      toast && toast('Chunking and embedding job started in the backend.', { type: 'success' })
    } catch (err) {
      const message = err.message || 'Failed to start embedding job'
      setEmbeddingBusy(false)
      setEmbeddingStatus('FAILED')
      setEmbeddingMessage(message)
      setEmbeddingError(message)
      toast && toast(message, { type: 'error' })
    }
  }

  const handleDownloadExtractionJson = () => {
    if (!extractionResult) return
    const stem = safeFileStem(selectedDocument?.title)
    downloadTextFile(JSON.stringify(extractionResult.extracted_json, null, 2), `${stem}.extracted.json`)
  }

  const handleLoadExtractionForEditing = () => {
    const extracted = extractionResult?.extracted_json
    if (!extracted || typeof extracted !== 'object') {
      toast && toast('Extract data first before editing.', { type: 'info' })
      return
    }
    const cloned = deepCloneJson(extracted)
    setOriginalExtractionData(cloned)
    setEditableExtractionData(deepCloneJson(cloned))
    setOcrWorkspaceTab('edit')
  }

  const handleEditableFieldChange = (path, value) => {
    setEditableExtractionData((prev) => setNestedValue(prev ?? {}, path, value))
  }

  const handleSaveEditedExtraction = async () => {
    if (!editableExtractionData) {
      toast && toast('No edited data to save.', { type: 'info' })
      return
    }
    const metadataTemplate = selectedDocument?.folder?.metadataTemplate
    setExtractionBusy(true)
    setExtractionError('')
    setExtractionResult((prev) => {
      if (!prev) return prev
      return { ...prev, extracted_json: deepCloneJson(editableExtractionData) }
    })
    try {
      const effectivePrompt = selectedDocumentIsOcr ? ocrPrompt : 'prompt_ocr'
      if (selectedId) {
        await saveDataExtractionResult(selectedId, {
          prompt: effectivePrompt,
          formType: extractionResult?.form_type ?? 'form1',
          extractedJson: editableExtractionData,
        })
      }
      const persistence = await persistExtractedMetadata(editableExtractionData, metadataTemplate, {
        successMessage: 'Edited extraction saved and document metadata updated.',
        skippedMessage: 'Edited extraction saved locally. Document metadata was not updated.',
      })
      toast && toast(persistence.message, { type: persistence.type })
    } catch (err) {
      const message = err.message || 'Edited data saved locally, but metadata update failed.'
      setExtractionError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setExtractionBusy(false)
    }
  }

  const handleResetEditedExtraction = () => {
    if (!originalExtractionData) {
      toast && toast('Nothing to reset.', { type: 'info' })
      return
    }
    setEditableExtractionData(deepCloneJson(originalExtractionData))
    toast && toast('Edited data reset.', { type: 'info' })
  }

  const handleDownloadEditedExtractionJson = () => {
    const payload = editableExtractionData ?? extractionResult?.extracted_json
    if (!payload) return
    const stem = safeFileStem(selectedDocument?.title)
    downloadTextFile(JSON.stringify(payload, null, 2), `${stem}.edited.extracted.json`)
  }

  const renderWorkspaceFilePreview = () => (
    <>
      <h4>File Preview</h4>
      {pdfPreviewLoading && <p className="feedback">Loading PDF preview...</p>}
      {!pdfPreviewLoading && pdfPreviewError && <p className="feedback feedback--error">{pdfPreviewError}</p>}
      {!pdfPreviewLoading && !pdfPreviewError && pdfPreviewUrl && (
        <iframe
          title="Selected PDF preview"
          className="workspace-ocr-card__preview-frame"
          src={pdfPreviewUrl}
        />
      )}
      {!pdfPreviewLoading && !pdfPreviewError && !pdfPreviewUrl && (
        <p className="feedback">No PDF preview available for this selection.</p>
      )}
    </>
  )

  const renderOcrWorkspace = () => (
    <section className="card workspace-ocr-card">
      <div className="workspace-ocr-card__header">
        <div>
          <p className="eyebrow">OCR Output</p>
          <h3>Selected Document OCR</h3>
          {selectedId && (
            <div className="workspace-ocr-card__status">
              <span className={`pill pill--${selectedDocumentOcrStatusMeta.tone}`}>
                {selectedDocumentOcrStatusMeta.label}
              </span>
              <small>{selectedDocumentOcrStatusMessage}</small>
              {selectedDocumentOcrStatusUpdatedAt && (
                <small>Updated {new Date(selectedDocumentOcrStatusUpdatedAt).toLocaleString()}</small>
              )}
            </div>
          )}
        </div>
        <div className="workspace-ocr-card__header-actions">
          <button
            type="button"
            className="ghost"
            onClick={handleRefreshOcrWorkspace}
            disabled={!selectedId || ocrBusy || ocrLoadingCached}
            title={!selectedId ? 'Select a document first' : 'Refresh OCR status and output'}
          >
            {ocrLoadingCached ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="ghost" onClick={() => setOcrWorkspaceOpen(false)}>
            Close
          </button>
          {ocrWorkspaceTab === 'ocr' ? (
            <>
              <button
                type="button"
                className="ghost"
                onClick={handleRunEmbedding}
                disabled={embeddingBusy || !selectedId || !activeOcrPreviewContent}
                title={!selectedId ? 'Select a document first' : !activeOcrPreviewContent ? 'Run OCR first to obtain text for chunking and embedding' : undefined}
              >
                {embeddingBusy ? 'Embedding...' : 'Embed for Search'}
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleRunSelectedOcr}
                disabled={ocrBusy || !(documentPermissions?.write ?? false) || !selectedId || !selectedLooksPdf}
                title={!selectedId ? 'Select a document first' : !selectedLooksPdf ? 'OCR currently supports PDF documents only' : undefined}
              >
                {ocrBusy ? 'Running OCR...' : 'Run OCR'}
              </button>
            </>
          ) : ocrWorkspaceTab === 'extraction' ? (
            <button
              type="button"
              className="primary"
              onClick={handleRunExtraction}
              disabled={extractionBusy || !activeOcrPreviewContent}
              title={!activeOcrPreviewContent ? 'Run OCR first to obtain text for extraction' : undefined}
            >
              {extractionBusy ? 'Extracting...' : 'Extract Data'}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={handleSaveEditedExtraction}
              disabled={!editableExtractionData}
            >
              Save Changes
            </button>
          )}
        </div>
      </div>
      <div className="workspace-ocr-tabs">
        <button
          type="button"
          className={`workspace-ocr-tab ${ocrWorkspaceTab === 'ocr' ? 'is-active' : ''}`}
          onClick={() => setOcrWorkspaceTab('ocr')}
        >
          OCR Output
        </button>
        <button
          type="button"
          className={`workspace-ocr-tab ${ocrWorkspaceTab === 'extraction' ? 'is-active' : ''}`}
          onClick={() => setOcrWorkspaceTab('extraction')}
        >
          Data Extraction
        </button>
        <button
          type="button"
          className={`workspace-ocr-tab ${ocrWorkspaceTab === 'edit' ? 'is-active' : ''}`}
          onClick={() => setOcrWorkspaceTab('edit')}
        >
          Edit Data
        </button>
      </div>
      {ocrWorkspaceTab === 'ocr' && <div className="workspace-ocr-card__settings">
        <label>
          <span>OCR prompt</span>
          <select value={ocrPrompt} onChange={(evt) => setOcrPrompt(evt.target.value)} disabled={ocrBusy || !selectedDocumentIsOcr}>
            <option value="prompt_ocr">prompt_ocr</option>
            {selectedDocumentIsOcr && <option value="prompt_layout_all_en">prompt_layout_all_en</option>}
            {selectedDocumentIsOcr && <option value="prompt_layout_only_en">prompt_layout_only_en</option>}
          </select>
          {!selectedDocumentIsOcr && <small>First OCR run is fixed to prompt_ocr. Layout prompts unlock after OCR is completed.</small>}
        </label>
      </div>}
      {ocrWorkspaceTab === 'ocr' && !selectedId && <p className="feedback">Select a document in the workspace list to run OCR.</p>}
      {ocrWorkspaceTab === 'ocr' && selectedId && embeddingStatus !== 'IDLE' && (
        <p className={`feedback${embeddingStatus === 'FAILED' ? ' feedback--error' : ''}`}>
          <span className={`pill pill--${embeddingStatusMeta.tone}`}>{embeddingStatusMeta.label}</span>{' '}
          {embeddingError || embeddingMessage || 'Embedding status unavailable.'}
          {embeddingResult?.chunk_count ? ` Chunks: ${embeddingResult.chunk_count}.` : ''}
        </p>
      )}
      {ocrWorkspaceTab === 'ocr' && selectedId && !selectedLooksPdf && <p className="feedback">Selected document is not a PDF. OCR supports PDF only.</p>}
      {ocrWorkspaceTab === 'ocr' && selectedId && selectedLooksPdf && selectedDocumentOcrStatus === 'QUEUED' && <p className="feedback">OCR is queued and will start in the backend shortly.</p>}
      {ocrWorkspaceTab === 'ocr' && selectedId && selectedLooksPdf && selectedDocumentOcrStatus === 'RUNNING' && <p className="feedback">OCR is running in the backend. This panel refreshes automatically.</p>}
      {ocrWorkspaceTab === 'ocr' && ocrLoadingCached && <p className="feedback">Loading cached OCR result...</p>}
      {ocrWorkspaceTab === 'ocr' && ocrError && <p className="feedback feedback--error">{ocrError}</p>}
      {ocrWorkspaceTab === 'extraction' && (
        <div className="workspace-ocr-card__grid">
          <section className="workspace-ocr-pane">
            {renderWorkspaceFilePreview()}
          </section>
          <section className="workspace-ocr-pane">
            <div className="workspace-ocr-extraction">
              {!activeOcrPreviewContent && (
                <p className="feedback">Run OCR on a document first to enable data extraction.</p>
              )}
              {selectedId && selectedLooksPdf && selectedDocumentOcrStatus === 'QUEUED' && (
                <p className="feedback">OCR and data extraction are queued in the backend. This tab refreshes automatically.</p>
              )}
              {selectedId && selectedLooksPdf && selectedDocumentOcrStatus === 'RUNNING' && (
                <p className="feedback">Backend processing is running. OCR/extraction results will appear here automatically.</p>
              )}
              {selectedId && selectedLooksPdf && selectedDocumentOcrStatus === 'READY' && selectedDocumentHasExtraction && !extractionPayloadAvailable && (
                <p className="feedback">Waiting for extracted JSON from backend. Refreshing automatically...</p>
              )}
              {extractionError && <p className="feedback feedback--error">{extractionError}</p>}
              {extractionResult && (
                <div className="workspace-ocr-extraction__result">
                  <div className="workspace-ocr-card__actions">
                    <button type="button" className="ghost" onClick={handleLoadExtractionForEditing}>Load Data to Table</button>
                    <button type="button" className="ghost" onClick={handleDownloadExtractionJson}>Download JSON</button>
                  </div>
                  <pre className="workspace-ocr-extraction__json">{JSON.stringify(extractionResult.extracted_json, null, 2)}</pre>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      {ocrWorkspaceTab === 'edit' && (
        <div className="workspace-ocr-card__grid">
          <section className="workspace-ocr-pane">
            {renderWorkspaceFilePreview()}
          </section>
          <section className="workspace-ocr-pane">
            <div className="workspace-ocr-extraction workspace-ocr-edit">
              <div className="workspace-ocr-card__actions">
                <button type="button" className="ghost" onClick={handleLoadExtractionForEditing} disabled={!extractionResult?.extracted_json}>Load Data to Table</button>
                <button type="button" className="ghost" onClick={handleSaveEditedExtraction} disabled={!editableExtractionData}>Save Changes</button>
                <button type="button" className="ghost" onClick={handleDownloadEditedExtractionJson} disabled={!editableExtractionData && !extractionResult?.extracted_json}>Download Edited JSON</button>
                <button type="button" className="ghost" onClick={handleResetEditedExtraction} disabled={!originalExtractionData}>Reset</button>
              </div>
              {!editableRows.length && <p className="feedback">Extract data first, then click "Load Data to Table".</p>}
              {!!editableRows.length && (
                <div className="workspace-ocr-edit__table-wrap">
                  <table className="workspace-ocr-edit__table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editableRows.map((row) => (
                        row.type === 'group' ? (
                          <tr key={row.key} className="workspace-ocr-edit__group">
                            <td colSpan={2}>{prettifyLabel(row.label)}</td>
                          </tr>
                        ) : (
                          <tr key={row.path}>
                            <td style={{ paddingLeft: `${Math.min(row.level * 16, 72)}px` }}>{prettifyLabel(row.label)}</td>
                            <td>
                              <input
                                type="text"
                                value={row.value == null ? '' : String(row.value)}
                                onChange={(evt) => handleEditableFieldChange(row.path, evt.target.value)}
                              />
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="workspace-ocr-extraction__result">
                <h4>Preview</h4>
                <pre className="workspace-ocr-extraction__json">{JSON.stringify(editableExtractionData ?? extractionResult?.extracted_json ?? {}, null, 2)}</pre>
              </div>
            </div>
          </section>
        </div>
      )}
      {ocrWorkspaceTab === 'ocr' && (
        <div className="workspace-ocr-card__content">
          <div className="workspace-ocr-card__actions">
            <button type="button" className="ghost" onClick={handleDownloadOcrJson} disabled={!ocrResult}>Download OCR JSON</button>
            <button type="button" className="ghost" onClick={handleDownloadOcrMarkdown} disabled={!ocrPreview}>Download OCR Markdown</button>
            <button type="button" className="ghost" onClick={() => setOcrPreviewMode('render')} disabled={ocrPreviewMode === 'render'}>Rendered</button>
            <button type="button" className="ghost" onClick={() => setOcrPreviewMode('raw')} disabled={ocrPreviewMode === 'raw'}>Raw</button>
          </div>
          <div className="workspace-ocr-card__grid">
            <section className="workspace-ocr-pane">
              {renderWorkspaceFilePreview()}
            </section>
            <section className="workspace-ocr-pane">
              <div className="workspace-ocr-pane__header">
                <h4>Result Display</h4>
                <div className="workspace-ocr-page-nav">
                  <button type="button" className="ghost" disabled={!ocrPages.length || ocrPageIndex <= 0} onClick={() => setOcrPageIndex((prev) => Math.max(prev - 1, 0))}>Prev</button>
                  <input
                    type="number"
                    className="workspace-ocr-page-nav__input"
                    min={1}
                    max={ocrPages.length || 1}
                    value={ocrPages.length ? ocrPageIndex + 1 : ''}
                    disabled={!ocrPages.length}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!isNaN(v)) setOcrPageIndex(Math.min(Math.max(v - 1, 0), ocrPages.length - 1))
                    }}
                    aria-label="Page number"
                  />
                  <span className="workspace-ocr-page-nav__of">/ {ocrPages.length || 0}</span>
                  <button type="button" className="ghost" disabled={!ocrPages.length || ocrPageIndex >= ocrPages.length - 1} onClick={() => setOcrPageIndex((prev) => Math.min(prev + 1, ocrPages.length - 1))}>Next</button>
                </div>
              </div>
              {activeOcrPreviewContent ? (
                ocrPreviewMode === 'render' ? (
                  <iframe
                    title="OCR rendered preview"
                    className="workspace-ocr-card__preview-frame"
                    sandbox=""
                    srcDoc={buildPreviewDocument(activeOcrPreviewContent)}
                  />
                ) : (
                  <textarea className="workspace-ocr-result-raw" value={activeOcrPreviewContent} readOnly rows={20} />
                )
              ) : (
                <textarea className="workspace-ocr-result-raw" value={'OCR completed. No preview text extracted from response.'} readOnly rows={6} />
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  )

  useEffect(() => {
    if (ocrWorkspaceTab !== 'extraction') {
      return
    }
    const metadata = selectedDocument?.metadata ?? {}
    const metadataHasExtraction = String(metadata?.dms_has_data_extraction ?? '').toLowerCase() === 'true'
    const documentHasExtraction = selectedDocument?.hasDataExtraction === true || selectedDocument?.has_data_extraction === true
    const hasSavedExtraction = ocrResult?.has_data_extraction === true || documentHasExtraction || metadataHasExtraction
    const parsedMetadataExtracted = parseJsonObject(metadata?.dms_extracted_json)
    const extractionCandidates = [
      ocrResult?.extracted_json,
      selectedDocument?.extractedJson,
      selectedDocument?.extracted_json,
      parsedMetadataExtracted,
    ]
    const extractedWithValues = extractionCandidates.find((value) => hasJsonObjectKeys(value))
    const extractedAnyObject = extractionCandidates.find((value) => isJsonObject(value))
    const extracted = extractedWithValues ?? extractedAnyObject ?? {}
    if (!hasSavedExtraction && !hasJsonObjectKeys(extracted)) {
      return
    }

    const currentExtracted = extractionResult?.extracted_json
    const extractedChanged = JSON.stringify(currentExtracted ?? {}) !== JSON.stringify(extracted ?? {})
    if (extractionResult && !extractedChanged) {
      return
    }

    const hydrated = {
      extracted_json: deepCloneJson(extracted ?? {}),
      form_type:
        ocrResult?.form_type
        ?? selectedDocument?.extractionFormType
        ?? selectedDocument?.extraction_form_type
        ?? metadata?.dms_extraction_form_type
        ?? 'form1',
    }
    setExtractionResult(hydrated)
    setEditableExtractionData(deepCloneJson(hydrated.extracted_json))
    setOriginalExtractionData(deepCloneJson(hydrated.extracted_json))
  }, [ocrWorkspaceTab, extractionResult, ocrResult, selectedDocument])

  const handleFilterChange = (nextFilters) => {
    setFilters((prev) => ({ ...nextFilters, folderId: prev.folderId }))
    setPageState((prev) => ({ ...prev, page: 0 }))
  }

  const handleSearchSubmit = (nextFilters) => {
    const normalizedConditions = Array.isArray(nextFilters?.conditions)
      ? nextFilters.conditions
          .filter((condition) => (condition?.value || '').trim().length > 0)
          .map((condition) => ({
            field: condition.field,
            value: condition.value,
            join: condition.join || '',
          }))
      : []

    const hasDocColumnTokens = Array.isArray(normalizedConditions)
      ? normalizedConditions.map((condition) => condition.field).filter(Boolean)
      : []

    // Condition-builder search should be authoritative; clear quick-text query to avoid accidental extra filtering.
    setFilterQueryLocal('')

    setFilters((prev) => ({
      ...nextFilters,
      folderId: prev.folderId,
      query: '',
      conditions: normalizedConditions,
      searchColumns: hasDocColumnTokens,
      conditionOperator: 'AND',
    }))
    setPageState((prev) => ({ ...prev, page: 0 }))
  }

  const handlePageChange = (nextPage) => {
    setPageState((prev) => ({ ...prev, page: nextPage }))
  }

  const handlePageSizeChange = (nextSize) => {
    const size = Number(nextSize)
    if (!Number.isFinite(size) || size <= 0) {
      return
    }
    setPageState({ page: 0, size })
  }

  const handleFolderSelect = (folderId) => {
    setFilters((prev) => ({ ...prev, folderId }))
    setPageState((prev) => ({ ...prev, page: 0 }))
    setSelectedId(null)
    setSelectedDocument(null)
  }

  const handleFolderClear = () => handleFolderSelect(null)

  const handleUpload = async (payload, file) => {
    setBusy(true)
    setError('')
    try {
      const created = await uploadDocument({
        ...payload,
        tags: normalizeTags(payload.tags),
        metadata: payload.metadata ?? {},
      }, file)
      setUploadOpen(false)
      if (created?.id) {
        setSelectedId(created.id)
        setSelectedDocument(created)
      }
      await loadDocuments()
      toast && toast(
        payload?.runOcr
          ? 'Upload complete. OCR is running in the background.'
          : 'Upload complete',
        { type: 'success' }
      )
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Upload failed', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleFolderCreate = async (payload) => {
    setFolderBusy(true)
    setFolderError('')
    try {
      const { permissionEntries, ...folderPayload } = payload || {}
      const folder = await createFolder(folderPayload)
      if (canManageFolderPermissions && Array.isArray(permissionEntries)) {
        await updateFolderPermissions(folder.id, {
          entries: permissionEntries.map((entry) => ({
            groupId: entry.groupId,
            canRead: !!entry.canRead,
            canWrite: !!entry.canWrite,
            canDelete: !!entry.canDelete,
          })),
        })
      }
      await loadFolderTree()
      handleFolderSelect(folder.id)
      toast && toast('Folder created', { type: 'success' })
      return folder
    } catch (err) {
      setFolderError(err.message)
      toast && toast(err.message || 'Failed to create folder', { type: 'error' })
      throw err
    } finally {
      setFolderBusy(false)
    }
  }

  const handleFolderUpdate = async (folderId, payload) => {
    if (!folderId) {
      return null
    }
    setFolderBusy(true)
    setFolderError('')
    try {
      const { permissionEntries, ...folderPayload } = payload || {}
      const folder = await updateFolder(folderId, folderPayload)
      if (canManageFolderPermissions && Array.isArray(permissionEntries)) {
        await updateFolderPermissions(folder.id, {
          entries: permissionEntries.map((entry) => ({
            groupId: entry.groupId,
            canRead: !!entry.canRead,
            canWrite: !!entry.canWrite,
            canDelete: !!entry.canDelete,
          })),
        })
      }
      await loadFolderTree()
      handleFolderSelect(folder.id)
      toast && toast('Folder updated', { type: 'success' })
      return folder
    } catch (err) {
      setFolderError(err.message)
      toast && toast(err.message || 'Failed to update folder', { type: 'error' })
      throw err
    } finally {
      setFolderBusy(false)
    }
  }

  const handleFolderDelete = async (folderId) => {
    if (!folderId) {
      return
    }
    setFolderBusy(true)
    setFolderError('')
    try {
      await deleteFolder(folderId)
      await loadFolderTree()
      if (filters.folderId === folderId) {
        handleFolderSelect(null)
      }
      toast && toast('Folder deleted', { type: 'success' })
    } catch (err) {
      setFolderError(err.message)
      toast && toast(err.message || 'Failed to delete folder', { type: 'error' })
      throw err
    } finally {
      setFolderBusy(false)
    }
  }

  const handleUploadVersion = async (documentId, file) => {
    if (!documentId) return
    if (!(documentPermissions?.write ?? false)) {
      setError('Insufficient permissions to upload new versions')
      toast && toast('Insufficient permissions to upload new versions', { type: 'error' })
      return
    }
    setBusy(true)
    setError('')
    try {
      const updated = await uploadVersion(documentId, file)
      if (selectedDocument?.id === documentId) {
        setSelectedDocument(updated)
      }
      if (expandedDocument?.id === documentId) {
        setExpandedDocument(updated)
      }
      await loadDocuments()
      toast && toast('Version uploaded', { type: 'success' })
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to upload version', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleArchive = async (documentId, permanent = false) => {
    if (!documentId) return
    if (permanent && !(documentPermissions?.delete ?? false)) {
      setError('Insufficient permissions to delete documents')
      toast && toast('Insufficient permissions to delete documents', { type: 'error' })
      return
    }
    if (!permanent && !(documentPermissions?.write ?? false)) {
      setError('Insufficient permissions to archive documents')
      toast && toast('Insufficient permissions to archive documents', { type: 'error' })
      return
    }
    setBusy(true)
    setError('')
    try {
      await archiveDocument(documentId, { permanent })
      await loadDocuments()
      if (selectedDocument?.id === documentId) {
        setSelectedDocument(null)
        setSelectedId(null)
      }
      if (expandedDocument?.id === documentId) {
        closeExpandedViewer()
      }
      toast && toast(permanent ? 'Document deleted' : 'Document archived', { type: 'success' })
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to update document status', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleMetadataUpdate = async (documentId, payload) => {
    if (!documentId) return
    const overrideWrite = canOverrideWriteForDocument(documentId)
    if (!(documentPermissions?.write ?? false) && !overrideWrite) {
      setError('Insufficient permissions to update metadata')
      toast && toast('Insufficient permissions to update metadata', { type: 'error' })
      return
    }
    setBusy(true)
    setError('')
    try {
      const updated = await updateDocument(documentId, {
        ...payload,
        tags: payload.tags ? normalizeTags(payload.tags) : undefined,
        metadata: payload.metadata ?? undefined,
      })
      if (selectedDocument?.id === documentId) {
        setSelectedDocument(updated)
      }
      if (expandedDocument?.id === documentId) {
        setExpandedDocument(updated)
      }
      await loadDocuments()
      toast && toast('Metadata updated', { type: 'success' })
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to update metadata', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const persistExtractedMetadata = async (extractedMetadata, metadataTemplate, {
    successMessage,
    skippedMessage,
  } = {}) => {
    if (!selectedId) {
      return { message: skippedMessage || 'Data extraction completed.', type: 'success' }
    }

    if (!Array.isArray(metadataTemplate) || !metadataTemplate.length) {
      return { message: skippedMessage || 'Data extraction completed.', type: 'success' }
    }

    if (!extractedMetadata || typeof extractedMetadata !== 'object') {
      return { message: skippedMessage || 'Data extraction completed.', type: 'success' }
    }

    const mergedMetadata = mergeExtractedMetadata(selectedDocument?.metadata, extractedMetadata, metadataTemplate)
    const validation = validateMetadataValues(metadataTemplate, mergedMetadata)
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0] || 'The extracted values do not satisfy the folder metadata rules.'
      return {
        message: `Data extraction completed, but document metadata was not updated: ${firstError}`,
        type: 'warning',
      }
    }

    const overrideWrite = canOverrideWriteForDocument(selectedId)
    if (!(documentPermissions?.write ?? false) && !overrideWrite) {
      return {
        message: 'Data extraction completed, but document metadata was not updated because you do not have permission to edit this document.',
        type: 'warning',
      }
    }

    const updated = await updateDocument(selectedId, { metadata: mergedMetadata })
    setSelectedDocument(updated)
    if (expandedDocument?.id === selectedId) {
      setExpandedDocument(updated)
    }
    await loadDocuments()
    return {
      message: successMessage || 'Document metadata updated from extracted data.',
      type: 'success',
      updated,
    }
  }

  const handleApprovalNote = async (documentId, note) => {
    if (!documentId || !note || !note.trim()) return
    setBusy(true)
    setError('')
    try {
      const updated = await addApprovalNote(documentId, { note: note.trim() })
      if (selectedDocument?.id === documentId) {
        setSelectedDocument(updated)
      }
      if (expandedDocument?.id === documentId) {
        setExpandedDocument(updated)
      }
      toast && toast('Note added to approval log', { type: 'success' })
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to add note', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleApprovalDecision = async (documentId, decision, action) => {
    if (!documentId || !action) return
    setBusy(true)
    setError('')
    try {
      const payload = typeof decision === 'string'
        ? (decision && decision.trim().length ? { note: decision.trim() } : {})
        : { ...(decision || {}) }
      const updated = action === 'approve'
        ? await approveDocument(documentId, payload)
        : await rejectDocument(documentId, payload)
      if (selectedDocument?.id === documentId) {
        setSelectedDocument(updated)
      }
      if (expandedDocument?.id === documentId) {
        setExpandedDocument(updated)
      }
      await loadDocuments()
      toast && toast(action === 'approve' ? 'Document approved' : 'Document rejected', {
        type: action === 'approve' ? 'success' : 'warning',
      })
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to record decision', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleCreateTopicFromDocument = (doc) => {
    if (!doc?.id) return
    if (!isAuthenticated) {
      toast && toast('Please sign in before creating a knowledge topic.', { type: 'warning' })
      return
    }

    const titleSeed = String(doc.title || doc.description || 'Untitled document').trim()
    const initialDescription = String(doc.description || '').trim()
    const initialTags = doc.category ? String(doc.category).trim().toLowerCase() : ''

    setTopicCreateModal({
      open: true,
      document: doc,
      title: `${titleSeed} topic`,
      description: initialDescription,
      tags: initialTags,
    })
  }

  const handleFindRelatedTopicsFromDocument = (doc) => {
    if (!doc?.id) return
    if (typeof onFindRelatedTopics === 'function') {
      onFindRelatedTopics(doc)
    }
  }

  const closeTopicCreateModal = () => {
    if (busy) return
    setTopicCreateModal({
      open: false,
      document: null,
      title: '',
      description: '',
      tags: '',
    })
  }

  const handleSubmitTopicFromDocument = async (event) => {
    event.preventDefault()
    const doc = topicCreateModal.document
    if (!doc?.id) {
      closeTopicCreateModal()
      return
    }

    if (!topicCreateModal.title.trim()) {
      toast && toast('Please provide a topic title.', { type: 'warning' })
      return
    }

    setBusy(true)
    setError('')
    try {
      const title = topicCreateModal.title.trim()
      const description = topicCreateModal.description.trim().length
        ? topicCreateModal.description.trim()
        : `Knowledge topic created from document "${String(doc.title || doc.description || 'Untitled document').trim()}".`
      const tags = topicCreateModal.tags
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
      const topic = await createKnowledgeTopic({ title, description, tags })
      const topicId = topic?.id
      if (!topicId) {
        throw new Error('Topic created but topic id is missing in response')
      }

      const linkPayload = {
        documentId: String(doc.id),
        note: 'Linked from document list quick action.',
      }

      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          await linkKnowledgeDocument(topicId, linkPayload)
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

      toast && toast(`Topic created: ${topic.title}`, { type: 'success' })
      closeTopicCreateModal()
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to create topic from document', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleDelegateApproval = async (documentId, approverId, note) => {
    if (!documentId || !approverId) return
    setBusy(true)
    setError('')
    try {
      const payload = {
        approverId,
        ...(note && note.trim().length ? { note: note.trim() } : {}),
      }
      const updated = await delegateApproval(documentId, payload)
      if (selectedDocument?.id === documentId) {
        setSelectedDocument(updated)
      }
      if (expandedDocument?.id === documentId) {
        setExpandedDocument(updated)
      }
      await loadDocuments()
      toast && toast('Approval delegated', { type: 'success' })
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to delegate approval', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleOpenPermissions = async (folderId) => {
    if (!folderId) {
      toast && toast('Select a folder to manage permissions', { type: 'info' })
      return
    }
    const folder = findFolderNode(folderTree, folderId)
    if (!folder) {
      toast && toast('Folder not found', { type: 'error' })
      return
    }
    setPermissionModal({
      open: true,
      folder,
      entries: [],
      loading: true,
      saving: false,
      error: '',
    })
    try {
      const data = await fetchFolderPermissions(folder.id)
      setPermissionModal((prev) => ({
        ...prev,
        entries: data?.permissions ?? [],
        loading: false,
      }))
    } catch (err) {
      const message = err.message || 'Failed to load permissions'
      setPermissionModal((prev) => ({ ...prev, loading: false, error: message }))
      toast && toast(message, { type: 'error' })
    }
  }

  const handleLoadPermissionTemplate = async () => {
    return fetchFolderPermissionTemplate()
  }

  const handleLoadFolderPermissions = async (folderId) => {
    if (!folderId) {
      return { permissions: [] }
    }
    return fetchFolderPermissions(folderId)
  }

  const closePermissionsModal = () => {
    setPermissionModal({
      open: false,
      folder: null,
      entries: [],
      loading: false,
      saving: false,
      error: '',
    })
  }

  const handlePermissionToggle = (groupId, key, value) => {
    setPermissionModal((prev) => ({
      ...prev,
      entries: prev.entries.map((entry) =>
        entry.groupId === groupId ? { ...entry, [key]: value } : entry
      ),
    }))
  }

  const handlePermissionSave = async () => {
    if (!permissionModal.folder) {
      return
    }
    setPermissionModal((prev) => ({ ...prev, saving: true, error: '' }))
    try {
      const payload = {
        entries: permissionModal.entries.map((entry) => ({
          groupId: entry.groupId,
          canRead: entry.canRead,
          canWrite: entry.canWrite,
          canDelete: entry.canDelete,
        })),
      }
      const data = await updateFolderPermissions(permissionModal.folder.id, payload)
      setPermissionModal((prev) => ({
        ...prev,
        saving: false,
        entries: data?.permissions ?? [],
      }))
      toast && toast('Permissions updated', { type: 'success' })
    } catch (err) {
      const message = err.message || 'Failed to update permissions'
      setPermissionModal((prev) => ({ ...prev, saving: false, error: message }))
      toast && toast(message, { type: 'error' })
    }
  }

  return (
    <section className="workspace">
      <div
        className={`workspace__filters-flyout ${filtersOpen ? 'is-visible' : ''}`}
        onMouseEnter={() => setFiltersOpen(true)}
        onMouseLeave={() => setFiltersOpen(false)}
      >
        <div className="workspace__filters card">
          <div className="workspace__filters-header">
            <div>
              <p className="eyebrow">Control Tower</p>
              <h2>Search documents</h2>
            </div>
            <button className="ghost" type="button" onClick={() => setFiltersOpen(false)}>
              Hide
            </button>
          </div>
          <DocumentFilters
            value={filters}
            onSearch={handleSearchSubmit}
            onReset={() => handleFilterChange(buildDefaultFilters())}
            folderMetadataFields={folderMetadataFieldOptions}
          />
          {error && <p className="feedback feedback--error">{error}</p>}
        </div>
      </div>
      <div className="workspace__folders">
        <FolderBrowser
          nodes={folderTree}
          loading={folderLoading}
          error={folderError}
          busy={folderBusy}
          selectedId={filters.folderId}
          onSelect={handleFolderSelect}
          onClear={handleFolderClear}
          onRefresh={loadFolderTree}
          onCreateFolder={handleFolderCreate}
          onUpdateFolder={handleFolderUpdate}
          onDeleteFolder={handleFolderDelete}
          draggingDocumentId={draggedDocumentId}
          onDocumentDrop={handleDocumentMove}
          canManagePermissions={canManageFolderPermissions}
          onLoadPermissionTemplate={handleLoadPermissionTemplate}
          onLoadFolderPermissions={handleLoadFolderPermissions}
        />
      </div>
      <div className="workspace__content">
        <div
          className="workspace__filters-hitbox workspace__filters-hitbox--top"
          onMouseEnter={() => setFiltersOpen(true)}
        />
        <div className="workspace__content-actions">
          <p className="folder-selection">
            {filters.folderId && workspaceSelectionPath?.length ? (
              <>
                Selected:{' '}
                {workspaceSelectionPath.map((part, i) => (
                  <span key={i} className="folder-selection__part">
                    <span className="folder-selection__icon" aria-hidden>
                      📁
                    </span>
                    <button
                      type="button"
                      className={`folder-selection__link ${part.id === filters.folderId ? 'is-current' : ''}`}
                      onClick={() => handleFolderSelect(part.id)}
                    >
                      {part.name}
                    </button>
                    {i < workspaceSelectionPath.length - 1 && <span className="folder-selection__sep"> / </span>}
                  </span>
                ))}
              </>
            ) : (
              'Showing all documents'
            )}
          </p>
        </div>
        <DocumentList
          items={documents}
          loading={loading}
          selectedId={selectedId}
          onSelect={(id) => {
            setDetailsInitialTab('content')
            setSelectedId(id)
          }}
          sort={sort}
          onSortChange={(s) => { setSort(s); setPageState((p) => ({ ...p, page: 0 })) }}
          filterQuery={filters.query}
          onFilterQueryChange={(q) => setFilterQueryLocal(q)}
          onHover={(id) => { setSelectedId(id); setChatbotOpen(true) }}
          pageMeta={pageMeta}
          onPageChange={handlePageChange}
          pageSize={pageState.size}
          onPageSizeChange={handlePageSizeChange}
          onDragStart={handleDocumentDragStart}
          onDragEnd={handleDocumentDragEnd}
          draggingId={draggedDocumentId}
          movingId={movingDocumentId}
          onMaximize={handleDocumentMaximize}
          onUpload={() => { if (documentPermissions?.write) setUploadOpen(true) }}
          onOcrSelected={handleOpenOcrWorkspace}
          canRunOcrOnSelected={!!selectedId && selectedLooksPdf}
          canUpload={documentPermissions?.write ?? false}
          onCreateTopicFromDocument={handleCreateTopicFromDocument}
          onFindRelatedTopics={handleFindRelatedTopicsFromDocument}
          onContextAction={async (documentId, action) => {
            // Actions: copy, paste, generateLink, checkout
            try {
              if (action === 'copy') {
                const doc = documents.find((d) => d.id === documentId)
                if (doc) {
                  window.localStorage.setItem('copiedDocument', JSON.stringify({ id: doc.id, title: doc.title, description: doc.description, category: doc.category, tags: doc.tags }))
                  toast && toast('Document copied to local clipboard', { type: 'success' })
                }
                return
              }
              if (action === 'paste') {
                const raw = window.localStorage.getItem('copiedDocument')
                if (!raw) {
                  toast && toast('No document in clipboard to paste', { type: 'info' })
                  return
                }
                if (!(documentPermissions?.write ?? false)) {
                  toast && toast('Insufficient permissions to copy documents', { type: 'error' })
                  return
                }
                if (!filters.folderId) {
                  toast && toast('Select a target folder before pasting a document', { type: 'warning' })
                  return
                }

                const copied = JSON.parse(raw)
                if (!copied?.id) {
                  toast && toast('Copied document info is invalid', { type: 'error' })
                  return
                }

                const detail = await fetchDocument(copied.id)
                const downloadResponse = await fetch(buildDownloadUrl(copied.id), { headers: { ...authHeaders() } })
                if (!downloadResponse.ok) {
                  throw new Error(`Failed to retrieve source document file (${downloadResponse.status})`)
                }
                const sourceBlob = await downloadResponse.blob()

                const defaultFileName = detail?.latestVersion?.fileName
                  || detail?.fileName
                  || `${safeFileStem(detail?.title || copied.title || 'document')}.bin`
                const sourceFile = new File([sourceBlob], defaultFileName, {
                  type: sourceBlob.type || 'application/octet-stream',
                })

                const today = new Date()
                const nextYear = new Date(today)
                nextYear.setFullYear(nextYear.getFullYear() + 1)
                const fallbackDocumentDate = toDateInputValue(today)
                const fallbackExpiryDate = toDateInputValue(nextYear)

                const copyPayload = {
                  title: `Copy of ${detail?.title || copied.title || 'Document'}`,
                  description: detail?.description || copied.description || '',
                  owner: detail?.owner || currentUser?.username || '',
                  category: detail?.category || copied.category || '',
                  documentDate: toDateInputValue(detail?.documentDate || detail?.metadata?.documentDate, fallbackDocumentDate),
                  expiryDate: toDateInputValue(detail?.expiryDate || detail?.metadata?.expiryDate, fallbackExpiryDate),
                  tags: normalizeTags(detail?.tags || copied.tags || []),
                  folderId: filters.folderId,
                  approverId: detail?.approval?.approverId || detail?.approverId || null,
                  supervisorId: detail?.approval?.supervisorId || detail?.supervisorId || null,
                  metadata: detail?.metadata || {},
                }

                if (!copyPayload.approverId || !String(copyPayload.approverId).trim()) {
                  const approverIds = normalizeReviewerOptions(await listApproverOptions())
                  copyPayload.approverId = approverIds[0] || null
                }
                if (!copyPayload.supervisorId || !String(copyPayload.supervisorId).trim()) {
                  const supervisorIds = normalizeReviewerOptions(await listSupervisorOptions())
                  copyPayload.supervisorId = supervisorIds[0] || null
                }
                if (!copyPayload.approverId || !copyPayload.supervisorId) {
                  throw new Error('Unable to paste document: approver/supervisor setup is incomplete. Please configure reviewer options and try again.')
                }

                await handleUpload(copyPayload, sourceFile)
                toast && toast('Document copied to selected folder', { type: 'success' })
                return
              }
              if (action === 'generateLink') {
                const url = buildDocumentAccessUrl(documentId)
                await navigator.clipboard.writeText(url)
                toast && toast('Document access link copied to clipboard', { type: 'success' })
                return
              }
              if (action === 'checkout') {
                // toggle checkout by setting metadata.checkedOutBy to current user or removing it
                const target = documents.find((d) => d.id === documentId)
                if (!target) return
                const checkedOutBy = target.metadata?.checkedOutBy
                const me = currentUser?.username ?? null
                const metadata = { ...(target.metadata ?? {}) }
                if (checkedOutBy && checkedOutBy === me) {
                  delete metadata.checkedOutBy
                } else {
                  metadata.checkedOutBy = me
                }
                await handleMetadataUpdate(documentId, { metadata })
                return
              }
            } catch (err) {
              toast && toast(err.message || 'Context action failed', { type: 'error' })
            }
          }}
        />
        {error && <p className="feedback feedback--error">{error}</p>}
      </div>
      <div className="workspace__details">
        <DocumentDetails
          key={selectedDocument?.id ?? 'empty'}
          document={selectedDocument}
          onUploadVersion={handleUploadVersion}
          onArchive={handleArchive}
          onSaveMetadata={handleMetadataUpdate}
          onAddApprovalNote={handleApprovalNote}
          onApprove={(id, payload) => handleApprovalDecision(id, payload, 'approve')}
          onReject={(id, note) => handleApprovalDecision(id, note, 'reject')}
          onDelegate={handleDelegateApproval}
          busy={busy}
          initialTab={detailsInitialTab}
          downloadUrlBuilder={buildDownloadUrl}
        />
        <ChatbotPanel
          selectedDocument={selectedDocument}
          onDocumentSelect={setSelectedId}
          onDocumentMaximize={handleDocumentMaximize}
          open={chatbotOpen}
          onOpenChange={setChatbotOpen}
          folders={folderTree}
        />
      </div>
      {expandedDocumentId && (
        <div className="document-viewer-modal" role="dialog" aria-modal="true">
          <div className="document-viewer-modal__backdrop" onClick={closeExpandedViewer} />
          <div className="document-viewer-modal__content">
            <div className="document-viewer-modal__header">
              <div>
                <p className="eyebrow">Maximized view</p>
                <h3>{expandedDocument?.title || 'Document viewer'}</h3>
              </div>
              <button type="button" className="ghost" onClick={closeExpandedViewer}>
                Close
              </button>
            </div>
            {expandedLoading && <span className="pill pill--info">Loading document…</span>}
            {expandedError && <p className="feedback feedback--error">{expandedError}</p>}
            {!expandedLoading && !expandedError && expandedDocument && (
              <DocumentDetails
                key={`expanded-${expandedDocument.id}`}
                document={expandedDocument}
                onUploadVersion={handleUploadVersion}
                onArchive={handleArchive}
                onSaveMetadata={handleMetadataUpdate}
                onAddApprovalNote={handleApprovalNote}
                onApprove={(id, payload) => handleApprovalDecision(id, payload, 'approve')}
                onReject={(id, note) => handleApprovalDecision(id, note, 'reject')}
                onDelegate={handleDelegateApproval}
                busy={busy}
                downloadUrlBuilder={buildDownloadUrl}
                initialTab="content"
                showPdfTextPreview={false}
              />
            )}
          </div>
        </div>
      )}
      {uploadOpen && (
        <UploadPanel
          onClose={() => { setUploadOpen(false); setUploadPrefill(null) }}
          onSubmit={handleUpload}
          busy={busy}
          presetFolderId={filters.folderId ?? null}
          folders={folderTree}
          foldersLoading={folderLoading}
          folderBusy={folderBusy}
          folderError={folderError}
          onCreateFolder={handleFolderCreate}
          initial={uploadPrefill}
        />
      )}
      {ocrWorkspaceOpen && (
        <div
          className="upload-panel ocr-workspace-modal"
          role="dialog"
          aria-modal="true"
          aria-label="OCR Workspace"
        >
          <div className="upload-panel__backdrop" onClick={() => setOcrWorkspaceOpen(false)} />
          <div className="upload-panel__content ocr-workspace-modal__content" onClick={(e) => e.stopPropagation()}>
            {renderOcrWorkspace()}
          </div>
        </div>
      )}
      {topicCreateModal.open && (
        <div
          className="upload-panel topic-create-panel topic-create-panel--compact"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-topic-from-document-title"
        >
          <div className="upload-panel__backdrop" onClick={closeTopicCreateModal} />
          <form className="upload-panel__content topic-create-panel__content" onSubmit={handleSubmitTopicFromDocument} onClick={(e) => e.stopPropagation()}>
            <header>
              <div>
                <p className="eyebrow">New upload</p>
                <h3 id="create-topic-from-document-title">Topic metadata</h3>
              </div>
              <button type="button" className="ghost" onClick={closeTopicCreateModal} disabled={busy}>Close</button>
            </header>
            <div className="upload-panel__primary">
              <section className="folder-section">
                <div className="folder-section__header">
                  <span>Source document</span>
                </div>
                <label>
                  <span>Document</span>
                  <input
                    type="text"
                    value={topicCreateModal.document?.title || topicCreateModal.document?.description || `Document #${topicCreateModal.document?.id ?? ''}`}
                    readOnly
                  />
                </label>
              </section>

              <label>
                <span>Title</span>
                <input
                  type="text"
                  value={topicCreateModal.title}
                  onChange={(e) => setTopicCreateModal((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Topic title"
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  rows={4}
                  value={topicCreateModal.description}
                  onChange={(e) => setTopicCreateModal((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Topic description"
                />
              </label>
              <label>
                <span>Tags</span>
                <input
                  type="text"
                  value={topicCreateModal.tags}
                  onChange={(e) => setTopicCreateModal((prev) => ({ ...prev, tags: e.target.value }))}
                  placeholder="tag1, tag2"
                />
                <small>Use comma-separated tags.</small>
              </label>
            </div>
            <div className="upload-panel__actions topic-create-panel__actions">
              <button type="button" className="ghost" onClick={closeTopicCreateModal} disabled={busy}>Close</button>
              <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
