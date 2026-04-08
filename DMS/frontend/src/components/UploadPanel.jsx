import { useEffect, useMemo, useState, useContext } from 'react'
import { listApproverOptions, listSupervisorOptions, runPdfOcr } from '../api/documents'
import FolderTree from './FolderTree'
import { collectFolderIds, findFolderNode, findFolderPath } from '../utils/folders'
import { AnnounceContext } from '../contexts/AnnounceContext'
import { AuthContext } from '../contexts/AuthContext'
import MetadataTemplateBuilder from './MetadataTemplateBuilder'
import MetadataFieldInputs from './MetadataFieldInputs'
import { fetchActiveCodeTableItems } from '../api/codeTable'
import {
  describeMetadataField,
  normalizeMetadataValues,
  validateMetadataTemplate,
  validateMetadataValues,
} from '../utils/metadataTemplate'

const initialState = {
  title: '',
  description: '',
  owner: '',
  category: '',
  documentDate: '',
  expiryDate: '',
  tags: [],
  folderId: null,
  approverId: null,
  supervisorId: null,
}

const normalizeApproverOptions = (data) => {
  if (!Array.isArray(data)) {
    return []
  }
  return data
    .map((item) => {
      const id = item?.id ?? item?.userId ?? item?.username ?? null
      return {
        id: id != null ? String(id) : '',
        username: item?.username ?? '',
        displayName: item?.displayName ?? '',
      }
    })
    .filter((item) => item.id)
}

const isPdfFile = (selectedFile) => {
  if (!selectedFile) {
    return false
  }
  const fileName = (selectedFile.name ?? '').toLowerCase()
  const contentType = (selectedFile.type ?? '').toLowerCase()
  return fileName.endsWith('.pdf') || contentType.includes('pdf')
}

const deriveTitleFromFileName = (name = '') => {
  const trimmed = String(name || '').trim()
  if (!trimmed) {
    return ''
  }
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot <= 0) {
    return trimmed
  }
  return trimmed.slice(0, lastDot)
}

const collectTextFromNode = (node, lines) => {
  if (!node) {
    return
  }
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
    if (typeof node.text === 'string') {
      collectTextFromNode(node.text, lines)
    }
    if (typeof node.markdown === 'string') {
      collectTextFromNode(node.markdown, lines)
    }
    if (typeof node.md === 'string') {
      collectTextFromNode(node.md, lines)
    }
    if (typeof node.content === 'string') {
      collectTextFromNode(node.content, lines)
    }
  }
}

const extractOcrPreview = (response) => {
  const lines = []
  collectTextFromNode(response?.results, lines)
  if (!lines.length) {
    collectTextFromNode(response, lines)
  }
  if (!lines.length) {
    return ''
  }
  return lines.join('\n\n')
}

export default function UploadPanel({
  onClose,
  onSubmit,
  busy,
  presetFolderId = null,
  folders = [],
  foldersLoading,
  folderBusy,
  folderError,
  onCreateFolder,
  initial = null,
}) {
  const [form, setForm] = useState(initialState)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [nestUnderSelection, setNestUnderSelection] = useState(false)
  const [inheritMetadataTemplate, setInheritMetadataTemplate] = useState(false)
  const [templateFields, setTemplateFields] = useState([])
  const [templateError, setTemplateError] = useState('')
  const [metadataValues, setMetadataValues] = useState({})
  const [metadataErrors, setMetadataErrors] = useState({})
  const [codeTableItems, setCodeTableItems] = useState({})
  const [documentCategoryOptions, setDocumentCategoryOptions] = useState([])
  const [approverOptions, setApproverOptions] = useState([])
  const [approverLoading, setApproverLoading] = useState(false)
  const [approverError, setApproverError] = useState('')
  const [supervisorOptions, setSupervisorOptions] = useState([])
  const [supervisorLoading, setSupervisorLoading] = useState(false)
  const [supervisorError, setSupervisorError] = useState('')
  const [ocrPrompt, setOcrPrompt] = useState('prompt_layout_all_en')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [ocrPreview, setOcrPreview] = useState('')
  const [ocrRaw, setOcrRaw] = useState(null)
  const { toast, confirm } = useContext(AnnounceContext)
  const { currentUser } = useContext(AuthContext)

  const knownFolderIds = useMemo(() => new Set(collectFolderIds(folders)), [folders])
  const folderPath = useMemo(() => findFolderPath(folders, form.folderId), [folders, form.folderId])
  const selectedFolder = useMemo(() => findFolderNode(folders, form.folderId), [folders, form.folderId])
  const selectedTemplate = selectedFolder?.metadataTemplate ?? []
  const isFolderLocked = Boolean(presetFolderId && knownFolderIds.has(presetFolderId))
  const currentOwner = (currentUser?.username || '').trim()

  useEffect(() => {
    if (form.folderId && !knownFolderIds.has(form.folderId)) {
      setForm((prev) => ({ ...prev, folderId: null }))
    }
  }, [form.folderId, knownFolderIds])

  useEffect(() => {
    if (!isFolderLocked) {
      return
    }
    setForm((prev) => (prev.folderId === presetFolderId ? prev : { ...prev, folderId: presetFolderId }))
  }, [isFolderLocked, presetFolderId])

  useEffect(() => {
    if (initial) {
      setForm((prev) => ({
        ...prev,
        title: initial.title ?? prev.title,
        description: initial.description ?? prev.description,
        category: initial.category ?? prev.category,
        tags: initial.tags ?? prev.tags,
        metadata: initial.metadata ?? {},
      }))
    }

    if (!form.folderId || !selectedTemplate.length) {
      setMetadataValues({})
      setMetadataErrors({})
      return
    }
    setMetadataValues((prev) => {
      const next = {}
      selectedTemplate.forEach((field) => {
        next[field.key] = prev[field.key] ?? ''
      })
      return next
    })
    setMetadataErrors({})
  }, [form.folderId, selectedTemplate])

  useEffect(() => {
    if (!currentOwner) {
      return
    }
    setForm((prev) => (prev.owner === currentOwner ? prev : { ...prev, owner: currentOwner }))
  }, [currentOwner])

  useEffect(() => {
    const dropdownFields = selectedTemplate.filter((f) => f.type === 'DROPDOWN' && f.codeTableCode)
    if (!dropdownFields.length) {
      setCodeTableItems({})
      return
    }
    const codes = [...new Set(dropdownFields.map((f) => f.codeTableCode))]
    Promise.all(codes.map((code) => fetchActiveCodeTableItems(code).then((items) => [code, items]).catch(() => [code, []]))).then(
      (results) => setCodeTableItems(Object.fromEntries(results))
    )
  }, [selectedTemplate])

  useEffect(() => {
    let cancelled = false
    fetchActiveCodeTableItems('DOCUMENT_CATEGORY')
      .then((items) => {
        if (cancelled) {
          return
        }
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

  useEffect(() => {
    let cancelled = false
    const loadSupervisors = async () => {
      setSupervisorLoading(true)
      setSupervisorError('')
      try {
        const data = await listSupervisorOptions()
        if (!cancelled) {
          setSupervisorOptions(normalizeApproverOptions(data))
        }
      } catch (err) {
        if (!cancelled) {
          setSupervisorError(err.message || 'Unable to load supervisors')
          setSupervisorOptions([])
        }
      } finally {
        if (!cancelled) {
          setSupervisorLoading(false)
        }
      }
    }
    loadSupervisors()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!showFolderForm) {
      setTemplateFields([])
      setTemplateError('')
      setInheritMetadataTemplate(false)
    }
  }, [showFolderForm])

  useEffect(() => {
    let cancelled = false
    const loadApprovers = async () => {
      setApproverLoading(true)
      setApproverError('')
      try {
        const data = await listApproverOptions()
        if (!cancelled) {
          setApproverOptions(normalizeApproverOptions(data))
        }
      } catch (err) {
        if (!cancelled) {
          setApproverError(err.message || 'Unable to load approvers')
          setApproverOptions([])
        }
      } finally {
        if (!cancelled) {
          setApproverLoading(false)
        }
      }
    }
    loadApprovers()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setOcrError('')
    setOcrPreview('')
    setOcrRaw(null)
  }, [file])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!file) {
      setError('Select a file before uploading')
      toast && toast('Select a file before uploading', { type: 'error' })
      return
    }
    if (!form.folderId) {
      setError('Pick a destination folder before uploading')
      toast && toast('Pick a destination folder before uploading', { type: 'error' })
      return
    }
    if (!form.approverId) {
      setError('Select an approver before uploading')
      toast && toast('Select an approver before uploading', { type: 'error' })
      return
    }
    if (!form.supervisorId) {
      setError('Select a supervisor before uploading')
      toast && toast('Select a supervisor before uploading', { type: 'error' })
      return
    }
    const normalizedApproverId = String(form.approverId).trim()
    if (!normalizedApproverId) {
      setError('Select an approver before uploading')
      toast && toast('Select an approver before uploading', { type: 'error' })
      return
    }
    const normalizedSupervisorId = String(form.supervisorId).trim()
    if (!normalizedSupervisorId) {
      setError('Select a supervisor before uploading')
      toast && toast('Select a supervisor before uploading', { type: 'error' })
      return
    }
    if (!currentOwner) {
      setError('Unable to detect the current logged-in user')
      toast && toast('Unable to detect the current logged-in user', { type: 'error' })
      return
    }
    const metadataValidation = validateMetadataValues(selectedTemplate, metadataValues)
    if (!metadataValidation.valid) {
      setMetadataErrors(metadataValidation.errors)
      const message = 'Resolve the highlighted metadata fields before uploading'
      setError(message)
      toast && toast(message, { type: 'error' })
      return
    }
    const normalizedMetadata = normalizeMetadataValues(selectedTemplate, metadataValues)
    setError('')
    setMetadataErrors({})
    onSubmit({
      ...form,
      owner: currentOwner,
      approverId: normalizedApproverId,
      supervisorId: normalizedSupervisorId,
      tags: form.tags,
      metadata: normalizedMetadata,
    }, file)
  }

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] ?? null
    setFile(nextFile)
    if (!nextFile) {
      return
    }
    const suggestedTitle = deriveTitleFromFileName(nextFile.name)
    if (!suggestedTitle) {
      return
    }
    setForm((prev) => ({ ...prev, title: suggestedTitle }))
  }

  const handleMetadataValueChange = (key, value) => {
    setMetadataValues((prev) => ({ ...prev, [key]: value }))
    setMetadataErrors((prev) => {
      if (!prev[key]) {
        return prev
      }
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const handleFolderSelect = (folderId) => {
    setForm((prev) => ({ ...prev, folderId }))
    setError('')
  }

  const handleFolderCreate = async () => {
    if (!newFolderName.trim()) {
      setError('Provide a folder name before creating it')
      return
    }
    const { valid, error: metaError, normalized } = validateMetadataTemplate(templateFields)
    if (!valid) {
      setTemplateError(metaError)
      setError(metaError)
      toast && toast(metaError, { type: 'error' })
      return
    }
    setTemplateError('')
    setError('')
    try {
      const parentId = nestUnderSelection && form.folderId ? form.folderId : null
      const shouldInheritTemplate = inheritMetadataTemplate && Boolean(parentId)
      const payload = {
        name: newFolderName.trim(),
        parentId,
        metadataTemplate: shouldInheritTemplate ? [] : normalized,
        inheritMetadataTemplateFromParent: shouldInheritTemplate,
      }
      const created = await onCreateFolder(payload)
      setForm((prev) => ({ ...prev, folderId: created.id }))
      setNewFolderName('')
      setShowFolderForm(false)
      setTemplateFields([])
      toast && toast('Folder created', { type: 'success' })
    } catch (err) {
      setError(err.message)
      toast && toast(err.message || 'Failed to create folder', { type: 'error' })
    }
  }

  const handleRunOcr = async () => {
    if (!file) {
      setOcrError('Select a PDF file first')
      return
    }
    if (!isPdfFile(file)) {
      setOcrError('OCR currently supports PDF files only')
      return
    }

    setOcrBusy(true)
    setOcrError('')
    try {
      const response = await runPdfOcr(file, ocrPrompt)
      setOcrRaw(response)
      setOcrPreview(extractOcrPreview(response))
      toast && toast('OCR completed', { type: 'success' })
    } catch (err) {
      const message = err.message || 'OCR failed'
      setOcrError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setOcrBusy(false)
    }
  }

  const selectedFolderSummary = folderPath?.join(' / ')
  const canRunOcr = file && isPdfFile(file)

  return (
    <div className="upload-panel">
      <div className="upload-panel__backdrop" onClick={async () => {
        // if form has data, confirm discard
        const hasMetadataValues = Object.values(metadataValues).some((val) => val && String(val).trim().length)
        const dirty = file || form.title || form.description || form.category || form.documentDate || form.expiryDate || (form.tags && form.tags.length) || form.folderId || form.approverId || form.supervisorId || hasMetadataValues
        if (dirty) {
          const ok = await confirm('Discard upload and close? Any entered data will be lost.')
          if (!ok) {
            toast && toast('Close cancelled', { type: 'info' })
            return
          }
        }
        onClose()
      }} />
      <form className="upload-panel__content" onSubmit={handleSubmit}>
        <header>
          <div>
            <p className="eyebrow">New upload</p>
            <h3>Document metadata</h3>
          </div>
          <button type="button" className="ghost" onClick={async () => {
            const hasMetadataValues = Object.values(metadataValues).some((val) => val && String(val).trim().length)
            const dirty = file || form.title || form.description || form.category || form.documentDate || form.expiryDate || (form.tags && form.tags.length) || form.folderId || form.approverId || form.supervisorId || hasMetadataValues
            if (dirty) {
              const ok = await confirm('Discard upload and close? Any entered data will be lost.')
              if (!ok) {
                toast && toast('Close cancelled', { type: 'info' })
                return
              }
            }
            onClose()
          }}>
            Close
          </button>
        </header>
        <div className="upload-panel__layout">
          <div className="upload-panel__primary">
            <label>
              <span>Document Category</span>
              <select value={form.category} onChange={(e) => handleChange('category', e.target.value)}>
                <option value="">Select document category</option>
                {documentCategoryOptions.map((item) => (
                  <option key={item.id ?? item.itemCode} value={item.itemCode || ''}>
                    {item.itemLabel || item.itemCode || ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>File</span>
              <input
                type="file"
                required
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg"
                onChange={handleFileChange}
              />
              <small>Select a document file to upload. OCR runs on PDF files.</small>
            </label>
            <label>
              <span>Title</span>
              <input required value={form.title} onChange={(e) => handleChange('title', e.target.value)} />
            </label>
            <label>
              <span>Description</span>
              <textarea value={form.description} onChange={(e) => handleChange('description', e.target.value)} />
            </label>
            <label>
              <span>Document date</span>
              <input type="date" required value={form.documentDate} onChange={(e) => handleChange('documentDate', e.target.value)} />
            </label>
            <label>
              <span>Expiry date</span>
              <input type="date" required value={form.expiryDate} onChange={(e) => handleChange('expiryDate', e.target.value)} />
            </label>
            <label>
              <span>Tags</span>
              <input value={form.tags.join(', ')} onChange={(e) => handleChange('tags', e.target.value.split(','))} placeholder="policy, quarterly" />
            </label>
            <label>
              <span>Approver</span>
              {approverLoading ? (
                <span className="pill pill--info">Loading approvers…</span>
              ) : approverOptions.length ? (
                <select
                  required
                  value={form.approverId ?? ''}
                  onChange={(e) => handleChange('approverId', e.target.value || null)}
                  disabled={busy}
                >
                  <option value="" disabled>Select an approver</option>
                  {approverOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.displayName || option.username} · {option.username}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="pill pill--warning">No eligible approvers available</span>
              )}
              <small>Select a teammate from your shared groups to review this upload.</small>
              {approverError && <p className="feedback feedback--error">{approverError}</p>}
            </label>
            <label>
              <span>Supervisor</span>
              {supervisorLoading ? (
                <span className="pill pill--info">Loading supervisors…</span>
              ) : supervisorOptions.length ? (
                <select
                  required
                  value={form.supervisorId ?? ''}
                  onChange={(e) => handleChange('supervisorId', e.target.value || null)}
                  disabled={busy}
                >
                  <option value="" disabled>Select a supervisor</option>
                  {supervisorOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.displayName || option.username} · {option.username}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="pill pill--warning">No eligible supervisors available</span>
              )}
              <small>Supervisor will receive reminder, retention, and rejection follow-up tasks.</small>
              {supervisorError && <p className="feedback feedback--error">{supervisorError}</p>}
            </label>
            {file && isPdfFile(file) && (
              <section className="metadata-input-card">
                <label>
                  <span>OCR prompt</span>
                  <input
                    value={ocrPrompt}
                    onChange={(e) => setOcrPrompt(e.target.value)}
                    placeholder="prompt_layout_all_en"
                    disabled={ocrBusy || busy}
                  />
                </label>
                <p className="feedback">Run OCR from the action buttons below.</p>
                {ocrError && <p className="feedback feedback--error">{ocrError}</p>}
                {ocrPreview && (
                  <>
                    <label>
                      <span>OCR preview</span>
                      <textarea value={ocrPreview} readOnly rows={8} />
                    </label>
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      onClick={() => {
                        handleChange('description', ocrPreview)
                        toast && toast('Description filled from OCR preview', { type: 'success' })
                      }}
                    >
                      Use OCR Preview As Description
                    </button>
                  </>
                )}
                {ocrRaw && !ocrPreview && (
                  <p className="feedback">OCR returned data. The response does not include a text field to preview.</p>
                )}
              </section>
            )}
          </div>

          <div className="upload-panel__secondary">
            <section className="folder-section">
              <div className="folder-section__header">
                <span>Destination folder</span>
                {!isFolderLocked && (
                  <button type="button" className="ghost" onClick={() => setShowFolderForm((prev) => !prev)}>
                    {showFolderForm ? 'Close form' : 'New folder'}
                  </button>
                )}
              </div>
              {isFolderLocked ? (
                <p className="folder-selection">Target folder: {selectedFolderSummary || 'Selected folder'}</p>
              ) : (
                <>
                  {foldersLoading ? (
                    <p className="pill pill--info">Loading folders…</p>
                  ) : folders?.length ? (
                    <FolderTree nodes={folders} selectedId={form.folderId} onSelect={handleFolderSelect} />
                  ) : (
                    <p className="empty-state">Create a folder to start uploading documents.</p>
                  )}
                  {folderError && <p className="feedback feedback--error">{folderError}</p>}
                  {form.folderId && selectedFolderSummary && <p className="folder-selection">Selected: {selectedFolderSummary}</p>}
                  {!form.folderId && <p className="folder-selection folder-selection--warning">Select a folder before uploading.</p>}
                </>
              )}
              {form.folderId && (
                <div className="metadata-template-summary">
                  <p className="metadata-template-summary__title">Folder metadata</p>
                  {selectedTemplate.length ? (
                    <ul className="metadata-template-summary__list">
                      {selectedTemplate.map((field) => (
                        <li key={field.key}>
                          <strong>{field.label}</strong>
                          <span>{describeMetadataField(field)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="metadata-template-summary__empty">No custom metadata fields for this folder.</p>
                  )}
                </div>
              )}
              {form.folderId && selectedTemplate.length > 0 && (
                <div className="metadata-input-card">
                  <MetadataFieldInputs
                    template={selectedTemplate}
                    values={metadataValues}
                    errors={metadataErrors}
                    onChange={handleMetadataValueChange}
                    disabled={busy}
                    codeTableItems={codeTableItems}
                  />
                </div>
              )}
              {!isFolderLocked && showFolderForm && (
                <div className="folder-form">
                  <label>
                    <span>Folder name</span>
                    <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Q1 Reports" />
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={nestUnderSelection}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setNestUnderSelection(checked)
                        if (!checked) {
                          setInheritMetadataTemplate(false)
                        }
                      }}
                    />
                    <span>Nest inside currently selected folder</span>
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={inheritMetadataTemplate}
                      onChange={(e) => setInheritMetadataTemplate(e.target.checked)}
                      disabled={!nestUnderSelection || !form.folderId}
                    />
                    <span>Metadata template inherit from parent folder</span>
                  </label>
                  <MetadataTemplateBuilder
                    value={templateFields}
                    onChange={(next) => {
                      setTemplateFields(next)
                      setTemplateError('')
                    }}
                    disabled={folderBusy || (inheritMetadataTemplate && nestUnderSelection && Boolean(form.folderId))}
                    error={templateError}
                  />
                  <button type="button" className="primary" onClick={handleFolderCreate} disabled={folderBusy || !newFolderName.trim()}>
                    Create folder
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
        {error && <p className="feedback feedback--error">{error}</p>}
        <div className="upload-panel__actions">
          <button
            type="button"
            className="ghost upload-panel__ocr-action"
            disabled={ocrBusy || busy || !canRunOcr}
            onClick={handleRunOcr}
            title={canRunOcr ? 'Run OCR on selected PDF' : 'Select a PDF file to enable OCR'}
          >
            {ocrBusy ? 'Running OCR...' : canRunOcr ? 'Run OCR' : 'Run OCR (PDF only)'}
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || ocrBusy || approverLoading || supervisorLoading || !approverOptions.length || !supervisorOptions.length}
            aria-label="Upload"
            title="Upload"
          >
            <span className="icon" aria-hidden="true">⭱</span>
          </button>
        </div>
      </form>
    </div>
  )
}
