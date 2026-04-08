import { useCallback, useEffect, useMemo, useState, useContext, useRef } from 'react'
import {
  addApprovalNote,
  approveDocument,
  archiveDocument,
  buildDownloadUrl,
  createFolder,
  deleteFolder,
  fetchDocument,
  fetchMyFolderPermissions,
  fetchFolderPermissions,
  fetchFolderPermissionTemplate,
  listDocuments,
  listFolderTree,
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
} from '../api/documents'
import DocumentFilters from './DocumentFilters'
import DocumentList from './DocumentList'
import DocumentDetails from './DocumentDetails'
import UploadPanel from './UploadPanel'
import FolderBrowser from './FolderBrowser'
import ChatbotPanel from './ChatbotPanel'
import { AuthContext, Roles } from '../contexts/AuthContext'
import { AnnounceContext } from '../contexts/AnnounceContext'
import { findFolderNode, findFolderPath } from '../utils/folders'
import { createKnowledgeTopic, linkKnowledgeDocument } from '../api/knowledge'

const buildDefaultFilters = () => ({
  query: '',
  owner: '',
  category: '',
  status: 'ALL',
  tags: [],
  folderId: null,
})

const defaultPage = { page: 0, size: 12 }

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

  let html = escapeHtml(content)
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

  const blocks = html
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^<h[1-6]>/.test(block) || /^<table[\s>]/.test(block) || /^<img[\s>]/.test(block) || /^<ul[\s>]/.test(block) || /^<ol[\s>]/.test(block) || /^<pre[\s>]/.test(block)) {
        return block
      }
      return `<p>${block.replace(/\n/g, '<br />')}</p>`
    })

  return blocks.join('\n')
}

const buildPreviewDocument = (content) => {
  const converted = convertMarkdownLikeImages(content)
  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(content)
  const body = hasHtmlTags
    ? `<article class="ocr-markdown">${converted}</article>`
    : `<article class="ocr-markdown">${renderSimpleMarkdown(content)}</article>`

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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default function DocumentWorkspace({ currentFunction = 'Document Management', onFindRelatedTopics = null, navigationContext = null }) {
  const { documentPermissions, role, setDocumentPermissionsOverride, currentUser, isAuthenticated } = useContext(AuthContext)
  const { toast } = useContext(AnnounceContext)
  const [filters, setFilters] = useState(buildDefaultFilters)
  const [pageState, setPageState] = useState(defaultPage)
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
  const [ocrPrompt, setOcrPrompt] = useState('prompt_layout_all_en')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrLoadingCached, setOcrLoadingCached] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [ocrResult, setOcrResult] = useState(null)
  const [ocrPreview, setOcrPreview] = useState('')
  const [ocrPreviewMode, setOcrPreviewMode] = useState('render')
  const [ocrConfidenceLevel, setOcrConfidenceLevel] = useState(95)
  const [ocrPageIndex, setOcrPageIndex] = useState(0)
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

  const normalizedFilters = useMemo(() => ({
    ...filters,
    tags: normalizeTags(filters.tags ?? []),
  }), [filters])
  // Debounce timer for loadDocuments to avoid rapid repeated calls
  const loadDebounceTimerRef = useRef(null)
  // Request id counter and latest id for guarding stale responses
  const requestCounterRef = useRef(0)
  const latestRequestIdRef = useRef(0)
  const workspaceSelectionPath = useMemo(() => findFolderPath(folderTree, filters.folderId), [folderTree, filters.folderId])
  const selectedDocumentFolderId = selectedDocument?.folder?.id ?? null
  const activePermissionFolderId = filters.folderId ?? selectedDocumentFolderId ?? null
  const canManageFolderPermissions = role === Roles.SYS_ADMIN || role === Roles.USER_ADMIN
  const approverUsername = currentUser?.username ? currentUser.username.toLowerCase() : null
  const latestSelectedVersion = useMemo(() => getLatestVersion(selectedDocument?.versions), [selectedDocument?.versions])
  const selectedFileName = latestSelectedVersion?.fileName ?? ''
  const selectedContentType = latestSelectedVersion?.contentType ?? ''
  const selectedLooksPdf = useMemo(() => {
    const byName = selectedFileName.toLowerCase().endsWith('.pdf')
    const byType = selectedContentType.toLowerCase().includes('pdf')
    return byName || byType
  }, [selectedFileName, selectedContentType])
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
    let cancelled = false

    const loadCachedOcr = async () => {
      if (!selectedId || !selectedLooksPdf) {
        setOcrResult(null)
        setOcrPreview('')
        setOcrError('')
        return
      }

      setOcrLoadingCached(true)
      setOcrError('')
      try {
        const cached = await getStoredDocumentOcr(selectedId, ocrPrompt, ocrConfidenceLevel)
        if (!cancelled) {
          setOcrResult(cached)
          setOcrPreview(extractOcrPreview(cached))
          setOcrPageIndex(0)
          if (typeof cached?.dms_confidence === 'number') {
            setOcrConfidenceLevel(Math.min(100, Math.max(0, cached.dms_confidence)))
          }
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
  }, [selectedId, selectedLooksPdf, ocrPrompt, ocrConfidenceLevel])

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
  }, [normalizedFilters, pageState.page])

  useEffect(() => {
    console.debug('DocumentWorkspace mounted')
    return () => {
      console.debug('DocumentWorkspace unmounted')
    }
  }, [])

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
      setPageState({ ...defaultPage })
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
        setPageState({ ...defaultPage })
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
        setDocuments(sortDocumentsLocally(data.content, sort))
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

  const handleDocumentMaximize = async (id) => {
    if (!id) return
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
    try {
      const response = await runStoredDocumentOcr(selectedId, ocrPrompt, ocrConfidenceLevel)
      setOcrResult(response)
      setOcrPreview(extractOcrPreview(response))
      setOcrPageIndex(0)
      if (typeof response?.dms_confidence === 'number') {
        setOcrConfidenceLevel(Math.min(100, Math.max(0, response.dms_confidence)))
      }
      toast && toast('OCR completed for selected document', { type: 'success' })
    } catch (err) {
      const message = err.message || 'OCR failed'
      setOcrError(message)
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
    const ocrText = activeOcrPreviewContent
    const metadataTemplate = selectedDocument?.folder?.metadataTemplate

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
      setExtractionResult(result)
      const extracted = deepCloneJson(result?.extracted_json)
      setEditableExtractionData(extracted)
      setOriginalExtractionData(deepCloneJson(extracted))
      toast && toast('Data extraction completed.', { type: 'success' })
    } catch (err) {
      const message = err.message || 'Data extraction failed'
      setExtractionError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setExtractionBusy(false)
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

  const handleFilterChange = (nextFilters) => {
    setFilters((prev) => ({ ...nextFilters, folderId: prev.folderId }))
    setPageState({ ...defaultPage })
  }

  const handlePageChange = (nextPage) => {
    setPageState((prev) => ({ ...prev, page: nextPage }))
  }

  const handleFolderSelect = (folderId) => {
    setFilters((prev) => ({ ...prev, folderId }))
    setPageState({ ...defaultPage })
    setSelectedId(null)
    setSelectedDocument(null)
  }

  const handleFolderClear = () => handleFolderSelect(null)

  const handleUpload = async (payload, file) => {
    setBusy(true)
    setError('')
    try {
      await uploadDocument({
        ...payload,
        tags: normalizeTags(payload.tags),
        metadata: payload.metadata ?? {},
      }, file)
      setUploadOpen(false)
      await loadDocuments()
      toast && toast('Upload complete', { type: 'success' })
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

  const handleApprovalDecision = async (documentId, note, action) => {
    if (!documentId || !action) return
    setBusy(true)
    setError('')
    try {
      const payload = note && note.trim().length ? { note: note.trim() } : {}
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

      const numericDocumentId = Number(doc.id)
      const linkPayload = {
        documentId: Number.isNaN(numericDocumentId) ? doc.id : numericDocumentId,
        note: 'Linked from document list quick action.',
      }

      try {
        await linkKnowledgeDocument(topicId, linkPayload)
      } catch (linkErr) {
        const linkMessage = String(linkErr?.message || '').toLowerCase()
        if (linkMessage.includes('knowledge topic not found')) {
          await delay(250)
          await linkKnowledgeDocument(topicId, linkPayload)
        } else {
          throw linkErr
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
          <DocumentFilters value={filters} onChange={handleFilterChange} onReset={() => handleFilterChange(buildDefaultFilters())} />
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
                    <span className="folder-selection__label">{part}</span>
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
          onDragStart={handleDocumentDragStart}
          onDragEnd={handleDocumentDragEnd}
          draggingId={draggedDocumentId}
          movingId={movingDocumentId}
          onMaximize={handleDocumentMaximize}
          onUpload={() => { if (documentPermissions?.write) setUploadOpen(true) }}
          onOcrSelected={handleRunSelectedOcr}
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
                const copied = JSON.parse(raw)
                // open upload panel prefilled with metadata from copied document
                setUploadPrefill({ title: `Copy of ${copied.title}`, description: copied.description, category: copied.category, tags: copied.tags ?? [], metadata: {} })
                setUploadOpen(true)
                return
              }
              if (action === 'generateLink') {
                const url = buildDownloadUrl(documentId)
                await navigator.clipboard.writeText(url)
                toast && toast('Download link copied to clipboard', { type: 'success' })
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
        <section className="card workspace-ocr-card">
          <div className="workspace-ocr-card__header">
            <div>
              <p className="eyebrow">OCR Output</p>
              <h3>Selected Document OCR</h3>
            </div>
            {ocrWorkspaceTab === 'ocr' ? (
              <button
                type="button"
                className="primary"
                onClick={handleRunSelectedOcr}
                disabled={ocrBusy || !(documentPermissions?.write ?? false) || !selectedId || !selectedLooksPdf}
                title={!selectedId ? 'Select a document first' : !selectedLooksPdf ? 'OCR currently supports PDF documents only' : undefined}
              >
                {ocrBusy ? 'Running OCR...' : 'Run OCR'}
              </button>
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
          {/* Nav-tabs */}
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
              <select value={ocrPrompt} onChange={(evt) => setOcrPrompt(evt.target.value)} disabled={ocrBusy}>
                <option value="prompt_layout_all_en">prompt_layout_all_en</option>
                <option value="prompt_layout_only_en">prompt_layout_only_en</option>
                <option value="prompt_ocr">prompt_ocr</option>
              </select>
            </label>
            <label>
              <span>Confidence level</span>
              <input
                type="number"
                value={ocrConfidenceLevel}
                min={0}
                max={100}
                step={1}
                disabled={ocrBusy}
                onChange={(evt) => {
                  const next = Number(evt.target.value)
                  if (Number.isNaN(next)) { setOcrConfidenceLevel(95); return }
                  setOcrConfidenceLevel(Math.min(100, Math.max(0, Math.round(next))))
                }}
              />
            </label>
          </div>}
          {ocrWorkspaceTab === 'ocr' && !selectedId && <p className="feedback">Select a document in the workspace list to run OCR.</p>}
          {ocrWorkspaceTab === 'ocr' && selectedId && !selectedLooksPdf && <p className="feedback">Selected document is not a PDF. OCR supports PDF only.</p>}
          {ocrWorkspaceTab === 'ocr' && ocrLoadingCached && <p className="feedback">Loading cached OCR result...</p>}
          {ocrWorkspaceTab === 'ocr' && ocrError && <p className="feedback feedback--error">{ocrError}</p>}
          {ocrWorkspaceTab === 'extraction' && (
            <div className="workspace-ocr-extraction">
              {!activeOcrPreviewContent && (
                <p className="feedback">Run OCR on a document first to enable data extraction.</p>
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
          )}
          {ocrWorkspaceTab === 'edit' && (
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
          )}
          {ocrWorkspaceTab === 'ocr' && ocrResult && (
            <div className="workspace-ocr-card__content">
              <div className="workspace-ocr-card__actions">
                <button type="button" className="ghost" onClick={handleDownloadOcrJson}>Download OCR JSON</button>
                <button type="button" className="ghost" onClick={handleDownloadOcrMarkdown} disabled={!ocrPreview}>Download OCR Markdown</button>
                <button type="button" className="ghost" onClick={() => setOcrPreviewMode('render')} disabled={ocrPreviewMode === 'render'}>Rendered</button>
                <button type="button" className="ghost" onClick={() => setOcrPreviewMode('raw')} disabled={ocrPreviewMode === 'raw'}>Raw</button>
              </div>
              <div className="workspace-ocr-card__grid">
                <section className="workspace-ocr-pane">
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
                </section>
                <section className="workspace-ocr-pane">
                  <div className="workspace-ocr-pane__header">
                    <h4>Result Display</h4>
                    <div className="workspace-ocr-page-nav">
                      <button type="button" className="ghost" disabled={!ocrPages.length || ocrPageIndex <= 0} onClick={() => setOcrPageIndex((prev) => Math.max(prev - 1, 0))}>Prev</button>
                      <span>{ocrPages.length ? `${ocrPageIndex + 1} / ${ocrPages.length}` : '0 / 0'}</span>
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
      </div>
      <div className="workspace__details">
        <DocumentDetails
          key={selectedDocument?.id ?? 'empty'}
          document={selectedDocument}
          onUploadVersion={handleUploadVersion}
          onArchive={handleArchive}
          onSaveMetadata={handleMetadataUpdate}
          onAddApprovalNote={handleApprovalNote}
          onApprove={(id, note) => handleApprovalDecision(id, note, 'approve')}
          onReject={(id, note) => handleApprovalDecision(id, note, 'reject')}
          onDelegate={handleDelegateApproval}
          busy={busy}
          initialTab={detailsInitialTab}
          downloadUrlBuilder={buildDownloadUrl}
        />
        <ChatbotPanel
          selectedDocument={selectedDocument}
          onDocumentSelect={setSelectedId}
          open={chatbotOpen}
          onOpenChange={setChatbotOpen}
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
                onApprove={(id, note) => handleApprovalDecision(id, note, 'approve')}
                onReject={(id, note) => handleApprovalDecision(id, note, 'reject')}
                onDelegate={handleDelegateApproval}
                busy={busy}
                downloadUrlBuilder={buildDownloadUrl}
                initialTab="content"
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
      {topicCreateModal.open && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-topic-from-document-title"
        >
          <div className="modal modal--focus" onClick={(e) => e.stopPropagation()}>
            <header className="modal__header">
              <h3 id="create-topic-from-document-title">Create topic from document</h3>
              <button type="button" className="ghost" onClick={closeTopicCreateModal} disabled={busy}>✕</button>
            </header>
            <form className="modal__body" onSubmit={handleSubmitTopicFromDocument}>
              <div className="field">
                <label>Source document</label>
                <input
                  type="text"
                  value={topicCreateModal.document?.title || topicCreateModal.document?.description || `Document #${topicCreateModal.document?.id ?? ''}`}
                  readOnly
                />
              </div>
              <div className="field">
                <label>Topic title</label>
                <input
                  type="text"
                  value={topicCreateModal.title}
                  onChange={(e) => setTopicCreateModal((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Topic title"
                />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea
                  rows={3}
                  value={topicCreateModal.description}
                  onChange={(e) => setTopicCreateModal((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Topic description"
                />
              </div>
              <div className="field">
                <label>Tags</label>
                <input
                  type="text"
                  value={topicCreateModal.tags}
                  onChange={(e) => setTopicCreateModal((prev) => ({ ...prev, tags: e.target.value }))}
                  placeholder="tag1, tag2"
                />
              </div>
              <div className="modal__actions">
                <button type="button" className="ghost" onClick={closeTopicCreateModal} disabled={busy}>Cancel</button>
                <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create topic'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
