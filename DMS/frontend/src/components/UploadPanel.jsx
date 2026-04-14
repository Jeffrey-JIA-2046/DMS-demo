import { useEffect, useMemo, useState, useContext } from 'react'
import { listApproverOptions, listSupervisorOptions } from '../api/documents'
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

const NODE_SCANNER_BASE_URL = 'http://localhost:8787'
const NODE_SCANNER_DISCOVERY_TIMEOUT_MS = 15_000
const NODE_SCANNER_SCAN_TIMEOUT_MS = 60_000
const NODE_SCANNER_SAFE_PAGE_CAP = 60

const makePngBlobFromRgba = (rgba, width, height) => new Promise((resolve, reject) => {
  if (!(rgba instanceof Uint8ClampedArray) || !width || !height) {
    reject(new Error('Scanner returned invalid image data'))
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    reject(new Error('Canvas is unavailable for scan image conversion'))
    return
  }
  const imageData = new ImageData(rgba, width, height)
  context.putImageData(imageData, 0, 0)
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error('Failed to create a scanned image file'))
      return
    }
    resolve(blob)
  }, 'image/png')
})

const sanitizeScanFileName = (name) => {
  const compact = String(name || '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
  return compact || `scanned-${Date.now()}`
}

const buildScanFile = async ({ data, width, height, sourceName }) => {
  const blob = await makePngBlobFromRgba(data, width, height)
  const safeName = sanitizeScanFileName(sourceName)
  return new File([blob], `${safeName}.png`, {
    type: 'image/png',
    lastModified: Date.now(),
  })
}

const isPngBytes = (bytes) => bytes?.length >= 8
  && bytes[0] === 0x89
  && bytes[1] === 0x50
  && bytes[2] === 0x4e
  && bytes[3] === 0x47

const isJpegBytes = (bytes) => bytes?.length >= 3
  && bytes[0] === 0xff
  && bytes[1] === 0xd8
  && bytes[2] === 0xff

const blobToPngBytes = async (blob) => {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Unable to decode scanned image for PDF conversion'))
      element.src = objectUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas is unavailable for scan image conversion')
    }
    context.drawImage(img, 0, 0)

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error('Failed to convert scanned image to PNG'))
          return
        }
        resolve(result)
      }, 'image/png')
    })
    return pngBlob.arrayBuffer()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const buildScanFileFromBase64 = ({ base64, fileName = `scan-${Date.now()}.png`, mimeType = 'image/png' }) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  })
}

const buildPdfFileFromPngBlobs = async ({ blobs, sourceName }) => {
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  const A4_WIDTH = 595.28
  const A4_HEIGHT = 841.89

  for (const blob of blobs) {
    let bytes = await blob.arrayBuffer()
    let image = null
    const byteView = new Uint8Array(bytes)
    if (isPngBytes(byteView)) {
      image = await pdf.embedPng(bytes)
    } else if (isJpegBytes(byteView)) {
      image = await pdf.embedJpg(bytes)
    } else {
      bytes = await blobToPngBytes(blob)
      image = await pdf.embedPng(bytes)
    }
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT])
    const scale = Math.min(A4_WIDTH / image.width, A4_HEIGHT / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    const drawX = (A4_WIDTH - drawWidth) / 2
    const drawY = (A4_HEIGHT - drawHeight) / 2
    page.drawImage(image, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    })
  }

  const safeName = sanitizeScanFileName(sourceName)
  const pdfBytes = await pdf.save()
  return new File([pdfBytes], `${safeName}.pdf`, {
    type: 'application/pdf',
    lastModified: Date.now(),
  })
}

const readPdfPageCount = async (file) => {
  const { PDFDocument } = await import('pdf-lib')
  const bytes = await file.arrayBuffer()
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return doc.getPageCount()
}

const statusMessageFromSane = (lib, status) => {
  if (status == null) {
    return 'Unknown scanner status'
  }
  try {
    return lib.sane_strstatus(status)
  } catch {
    return `Scanner status ${String(status)}`
  }
}

const findScanOption = (options, name) => options?.options?.find((option) => option?.descriptor?.name === name) || null

const requestUsbPermission = async () => {
  if (typeof navigator === 'undefined' || !('usb' in navigator) || typeof navigator.usb?.requestDevice !== 'function') {
    return false
  }
  try {
    await navigator.usb.requestDevice({ filters: [{}] })
    return true
  } catch (error) {
    if (error?.name === 'NotFoundError') {
      return false
    }
    throw error
  }
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = 30_000, timeoutMessage = '') => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      const seconds = Math.max(1, Math.round(timeoutMs / 1000))
      throw new Error(timeoutMessage || `Request timed out after ${seconds}s`)
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

const fetchNodeScanners = async () => {
  const response = await fetchWithTimeout(
    `${NODE_SCANNER_BASE_URL}/scanners`,
    {},
    NODE_SCANNER_DISCOVERY_TIMEOUT_MS,
    'Scanner detection timed out. Make sure Node scanner bridge is running on port 8787.'
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to list scanners from Node bridge')
  }
  return Array.isArray(payload?.devices) ? payload.devices : []
}

const scanViaNodeBridge = async ({ deviceName, resolution, colorMode, maxImages, duplex, paperSize }) => {
  const response = await fetchWithTimeout(
    `${NODE_SCANNER_BASE_URL}/scan`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceName,
        resolution,
        colorMode,
        maxImages,
        duplex,
        paperSize,
        silent: true,
      }),
    },
    NODE_SCANNER_SCAN_TIMEOUT_MS,
    'Scanning timed out after 4 minutes. Please check scanner feeder/driver and retry.'
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to scan via Node bridge')
  }
  if (!payload?.base64 && !(Array.isArray(payload?.pages) && payload.pages.some((page) => page?.base64))) {
    throw new Error('Node bridge returned empty scan data')
  }
  return payload
}

const extractNodeScanFiles = (payload) => {
  const pagePayloads = Array.isArray(payload?.pages) && payload.pages.length
    ? payload.pages
    : [payload]
  return pagePayloads
    .filter((page) => page?.base64)
    .map((page, index) => buildScanFileFromBase64({
      base64: page.base64,
      fileName: page.fileName || `scan-${Date.now()}-p${index + 1}.png`,
      mimeType: page.mimeType || 'image/png',
    }))
}

const validateScannerRuntime = () => {
  if (typeof window === 'undefined') {
    return 'Scanner is only available in browser mode.'
  }
  if (!window.isSecureContext) {
    return 'Scanner access requires HTTPS or localhost secure context.'
  }
  if (!('usb' in navigator)) {
    return 'WebUSB is not available in this browser. Use Chromium-based browser on localhost/HTTPS.'
  }
  if (typeof window.SharedArrayBuffer === 'undefined') {
    return 'SharedArrayBuffer is not available. Ensure cross-origin isolation (COOP/COEP) is enabled, then restart frontend and reload the page.'
  }
  return ''
}

const formatDiagBool = (value) => (value ? 'Yes' : 'No')

const countAuthorizedUsbDevices = async () => {
  if (typeof navigator === 'undefined' || !('usb' in navigator) || typeof navigator.usb?.getDevices !== 'function') {
    return 0
  }
  try {
    const devices = await navigator.usb.getDevices()
    return Array.isArray(devices) ? devices.length : 0
  } catch {
    return 0
  }
}

const pickStringConstraintValue = (constraint, preferredValues = []) => {
  if (!Array.isArray(constraint) || !constraint.length) {
    return null
  }
  const normalizedMap = new Map(constraint.map((value) => [String(value).toLowerCase(), value]))
  for (const preferred of preferredValues) {
    const hit = normalizedMap.get(String(preferred).toLowerCase())
    if (hit != null) {
      return hit
    }
  }
  return constraint[0]
}

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
  runOcr: false,
  runDataExtraction: false,
  runEmbedding: false,
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

const fileLooksPdf = (candidate) => {
  if (!candidate) {
    return false
  }
  const fileName = typeof candidate.name === 'string' ? candidate.name.toLowerCase() : ''
  const contentType = typeof candidate.type === 'string' ? candidate.type.toLowerCase() : ''
  return fileName.endsWith('.pdf') || contentType.includes('pdf')
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
  const [scanBusy, setScanBusy] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  const [scanEngine, setScanEngine] = useState('node')
  const [scanDevices, setScanDevices] = useState([])
  const [selectedScanDevice, setSelectedScanDevice] = useState('')
  const [scanResolution, setScanResolution] = useState(300)
  const [scanColorMode, setScanColorMode] = useState('Color')
  const [scanDuplex, setScanDuplex] = useState(true)
  const [scanMaxPages] = useState(999)
  const [scanPaperSize, setScanPaperSize] = useState('A4')
  const [scanOutputFormat, setScanOutputFormat] = useState('pdf')
  const [scanPages, setScanPages] = useState([])
  const [scanPageCount, setScanPageCount] = useState(0)
  const [scanPanelOpen, setScanPanelOpen] = useState(false)
  const [scanDiagnostics, setScanDiagnostics] = useState(null)
  const [scanDiagnosticsBusy, setScanDiagnosticsBusy] = useState(false)
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
    if (!scanPanelOpen) {
      return
    }

    let cancelled = false
    const autoDetectNodeScanners = async () => {
      setScanBusy(true)
      setScanStatus('Detecting scanners through Node bridge...')
      setError('')
      try {
        const devices = await fetchNodeScanners()
        if (cancelled) {
          return
        }
        setScanDevices(devices)
        if (!devices.length) {
          setSelectedScanDevice('')
          setScanStatus('No scanner detected by Node bridge. Verify scanner power/cable and that the bridge service is running.')
          return
        }
        setSelectedScanDevice((prev) => (prev && devices.some((device) => device.name === prev) ? prev : devices[0].name))
        setScanStatus('')
      } catch (scanError) {
        if (cancelled) {
          return
        }
        const message = scanError?.message || 'Unable to detect scanners via Node bridge'
        setScanStatus(message)
        setError(message)
        toast && toast(message, { type: 'error' })
      } finally {
        if (!cancelled) {
          setScanBusy(false)
        }
      }
    }

    autoDetectNodeScanners()
    return () => {
      cancelled = true
    }
  }, [scanPanelOpen, toast])

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
      runOcr: Boolean((form.runOcr || form.runDataExtraction || form.runEmbedding) && fileLooksPdf(file)),
      runDataExtraction: Boolean(form.runDataExtraction && fileLooksPdf(file)),
      runEmbedding: Boolean(form.runEmbedding && fileLooksPdf(file)),
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
    if (!fileLooksPdf(nextFile)) {
      setForm((prev) => ({ ...prev, runOcr: false, runDataExtraction: false, runEmbedding: false }))
    }
    if (!nextFile) {
      return
    }
    const suggestedTitle = deriveTitleFromFileName(nextFile.name)
    if (!suggestedTitle) {
      return
    }
    setForm((prev) => ({ ...prev, title: suggestedTitle }))
  }

  const canRunUploadOcr = fileLooksPdf(file)

  const fetchScanDevices = async () => {
    const sane = await import('sane-wasm')
    const lib = await sane.libsane()
    const init = lib.sane_init()
    if (init.status !== sane.SANEStatus.GOOD) {
      throw new Error(`Unable to initialize scanner: ${statusMessageFromSane(lib, init.status)}`)
    }

    try {
      const devicesResult = await lib.sane_get_devices()
      if (devicesResult.status !== sane.SANEStatus.GOOD) {
        throw new Error(`Unable to get scanner devices: ${statusMessageFromSane(lib, devicesResult.status)}`)
      }
      return devicesResult.devices || []
    } finally {
      try {
        await lib.sane_exit()
      } catch {
        // best effort cleanup
      }
    }
  }

  const handleLoadScanners = async () => {
    if (scanEngine === 'node') {
      setScanBusy(true)
      setScanStatus('Detecting scanners through Node bridge...')
      setError('')
      try {
        const devices = await fetchNodeScanners()
        setScanDevices(devices)
        if (!devices.length) {
          setSelectedScanDevice('')
          throw new Error('No scanner detected by Node bridge. Verify scanner power/cable and that the bridge service is running.')
        }
        setSelectedScanDevice((prev) => (prev && devices.some((device) => device.name === prev) ? prev : devices[0].name))
        setScanStatus(`Detected ${devices.length} scanner(s) via Node bridge.`)
      } catch (scanError) {
        const message = scanError?.message || 'Unable to detect scanners via Node bridge'
        setScanStatus(message)
        setError(message)
        toast && toast(message, { type: 'error' })
      } finally {
        setScanBusy(false)
      }
      return
    }

    const runtimeError = validateScannerRuntime()
    if (runtimeError) {
      setScanStatus(runtimeError)
      toast && toast(runtimeError, { type: 'error' })
      return
    }

    setScanBusy(true)
    setScanStatus('Detecting scanners...')
    setError('')
    try {
      let devices = await fetchScanDevices()
      if (!devices.length) {
        setScanStatus('No authorized scanner found. Requesting USB permission...')
        const granted = await requestUsbPermission()
        if (granted) {
          devices = await fetchScanDevices()
        }
      }

      setScanDevices(devices)
      if (!devices.length) {
        setSelectedScanDevice('')
        const authorizedCount = await countAuthorizedUsbDevices()
        if (authorizedCount > 0) {
          throw new Error(`No scanner backend detected by sane-wasm (authorized USB devices: ${authorizedCount}). Your scanner is connected, but likely exposed only via TWAIN/WIA driver mode, which browser SANE/WebUSB cannot use.`)
        }
        throw new Error('No scanner detected. On Windows, browser scanning works only with WebUSB-supported SANE backends. Kodak S2050 often exposes TWAIN/WIA instead, which sane-wasm cannot detect.')
      }
      setSelectedScanDevice((prev) => (prev && devices.some((device) => device.name === prev) ? prev : devices[0].name))
      setScanStatus(`Detected ${devices.length} scanner(s).`)
    } catch (scanError) {
      const rawMessage = scanError?.message || 'Unable to detect scanners'
      const message = /share.?array.?buffer/i.test(rawMessage)
        ? 'SharedArrayBuffer is blocked. Restart the frontend dev server and reload this page so COOP/COEP headers take effect.'
        : rawMessage
      setScanStatus(message)
      toast && toast(message, { type: 'error' })
      setError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      setScanBusy(false)
    }
  }

  const applyScanSettings = async (sane, options) => {
    if (!options) {
      return
    }

    const resolutionOption = options.resolution || findScanOption(options, 'resolution')
    if (resolutionOption?.descriptor?.cap?.SOFT_SELECT) {
      const result = await options.setValue(resolutionOption.index, Math.max(75, Math.min(1200, Number(scanResolution) || 300)))
      if (result?.status !== sane.SANEStatus.GOOD) {
        setScanStatus(`Resolution setting not applied: ${sane.SANEStatus[result.status] || result.status}`)
      }
    }

    const modeOption = findScanOption(options, 'mode')
    if (modeOption?.descriptor?.cap?.SOFT_SELECT && Array.isArray(modeOption?.descriptor?.constraint)) {
      const preferredValues = scanColorMode === 'Gray'
        ? ['Gray', 'Grayscale', 'Lineart']
        : ['Color', 'RGB']
      const targetValue = pickStringConstraintValue(modeOption.descriptor.constraint, preferredValues)
      if (targetValue != null) {
        const result = await options.setValue(modeOption.index, targetValue)
        if (result?.status !== sane.SANEStatus.GOOD) {
          setScanStatus(`Color mode setting not applied: ${sane.SANEStatus[result.status] || result.status}`)
        }
      }
    }
  }

  const runScannerDiagnostics = async () => {
    if (typeof window === 'undefined') {
      return
    }

    setScanDiagnosticsBusy(true)
    setScanStatus('Running scanner diagnostics...')
    try {
      const diagnostics = {
        origin: window.location.origin,
        secureContext: Boolean(window.isSecureContext),
        webUsbAvailable: typeof navigator !== 'undefined' && 'usb' in navigator,
        sharedArrayBufferAvailable: typeof window.SharedArrayBuffer !== 'undefined',
        crossOriginIsolated: Boolean(window.crossOriginIsolated),
        coop: 'Unavailable',
        coep: 'Unavailable',
        authorizedUsbDevices: null,
      }

      try {
        const response = await fetch(window.location.href, { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
        diagnostics.coop = response.headers.get('Cross-Origin-Opener-Policy') || 'Missing'
        diagnostics.coep = response.headers.get('Cross-Origin-Embedder-Policy') || 'Missing'
      } catch {
        diagnostics.coop = 'Read failed'
        diagnostics.coep = 'Read failed'
      }

      if (diagnostics.webUsbAvailable && typeof navigator.usb?.getDevices === 'function') {
        try {
          const devices = await navigator.usb.getDevices()
          diagnostics.authorizedUsbDevices = Array.isArray(devices) ? devices.length : 0
        } catch {
          diagnostics.authorizedUsbDevices = -1
        }
      }

      setScanDiagnostics(diagnostics)
      const ready = diagnostics.secureContext
        && diagnostics.webUsbAvailable
        && diagnostics.sharedArrayBufferAvailable
        && diagnostics.crossOriginIsolated
      setScanStatus(ready ? 'Diagnostics complete: browser runtime is scanner-ready.' : 'Diagnostics complete: browser runtime is missing scanner prerequisites.')
    } finally {
      setScanDiagnosticsBusy(false)
    }
  }

  const finalizeScannedFile = async (scanFile, sourceName = 'scanner') => {
    const files = Array.isArray(scanFile) ? scanFile.filter(Boolean) : [scanFile].filter(Boolean)
    if (!files.length) {
      throw new Error('Scanner returned no page images')
    }

    let finalFile = files[files.length - 1]
    if (scanOutputFormat === 'pdf') {
      const pages = [...scanPages, ...files]
      setScanPages(pages)
      setScanPageCount(pages.length)
      setScanStatus(`Scanned page ${pages.length}. Building PDF...`)
      finalFile = await buildPdfFileFromPngBlobs({
        blobs: pages,
        sourceName,
      })
    } else {
      setScanPages([])
      setScanPageCount(0)
    }

    setFile(finalFile)
    const suggestedTitle = deriveTitleFromFileName(finalFile.name)
    setForm((prev) => ({
      ...prev,
      title: prev.title?.trim() ? prev.title : suggestedTitle,
      runOcr: false,
      runDataExtraction: false,
      runEmbedding: false,
    }))

    const successMessage = scanOutputFormat === 'pdf'
      ? `Scan complete: ${finalFile.name} (${scanPages.length + files.length} page(s))`
      : `Scan complete: ${finalFile.name}`
    setScanStatus(successMessage)
    toast && toast(successMessage, { type: 'success' })
  }

  const handleScanWithNode = async () => {
    setScanBusy(true)
    setScanStatus(`Scanning with Node bridge... 0s elapsed (up to ${NODE_SCANNER_SAFE_PAGE_CAP} pages)`)
    setError('')
    const startedAt = Date.now()
    const progressTimer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
      setScanStatus(`Scanning with Node bridge... ${elapsedSeconds}s elapsed`)
    }, 1000)

    try {
      if (!selectedScanDevice) {
        throw new Error('Select a scanner first, then try scanning again.')
      }
      const payload = await scanViaNodeBridge({
        deviceName: selectedScanDevice,
        resolution: scanResolution,
        colorMode: scanColorMode,
        maxImages: scanOutputFormat === 'pdf' ? NODE_SCANNER_SAFE_PAGE_CAP : 1,
        duplex: scanOutputFormat === 'pdf' ? scanDuplex : false,
        paperSize: scanPaperSize,
      })
      if ((payload?.mimeType || '').toLowerCase() === 'application/pdf' && payload?.base64) {
        const pdfFile = buildScanFileFromBase64({
          base64: payload.base64,
          fileName: payload.fileName || `scan-${Date.now()}.pdf`,
          mimeType: 'application/pdf',
        })
        let detectedPages = 0
        try {
          detectedPages = await readPdfPageCount(pdfFile)
        } catch {
          throw new Error('Scanner returned an invalid PDF. Please retry scanning.')
        }
        if (detectedPages <= 0) {
          throw new Error('Scanner generated a PDF with 0 pages. Please check feeder pages and retry.')
        }
        setScanPages([])
        setScanPageCount(detectedPages)
        setFile(pdfFile)
        const suggestedTitle = deriveTitleFromFileName(pdfFile.name)
        setForm((prev) => ({
          ...prev,
          title: prev.title?.trim() ? prev.title : suggestedTitle,
          runOcr: false,
          runDataExtraction: false,
          runEmbedding: false,
        }))
        const doneMessage = `Scan complete: PDF attached (${detectedPages} page(s)).`
        setScanStatus(doneMessage)
        toast && toast(doneMessage, { type: 'success' })
        return
      }
      if (scanOutputFormat === 'pdf' && Number.isFinite(Number(payload?.pageCount))) {
        setScanStatus(`Node bridge returned ${payload.pageCount} page(s). Building PDF...`)
      }
      const scanFiles = extractNodeScanFiles(payload)

      if (!scanFiles.length) {
        throw new Error('No pages were scanned from ADF. Check feeder state and try again.')
      }

      await finalizeScannedFile(scanFiles, selectedScanDevice)
    } catch (scanError) {
      const message = scanError?.message || 'Node bridge scan failed'
      setScanStatus(message)
      setError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      window.clearInterval(progressTimer)
      setScanBusy(false)
    }
  }

  const handleScanAction = async () => {
    await handleScanWithNode()
  }

  const handleScanWithSane = async () => {
    const runtimeError = validateScannerRuntime()
    if (runtimeError) {
      setScanStatus(runtimeError)
      toast && toast(runtimeError, { type: 'error' })
      return
    }

    let lib = null
    setScanBusy(true)
    setScanStatus('Initializing scanner...')
    setError('')

    try {
      const sane = await import('sane-wasm')
      lib = await sane.libsane()

      const init = lib.sane_init()
      if (init.status !== sane.SANEStatus.GOOD) {
        throw new Error(`Unable to initialize scanner: ${statusMessageFromSane(lib, init.status)}`)
      }

      setScanStatus('Looking for scanners...')
      const devicesResult = await lib.sane_get_devices()
      if (devicesResult.status !== sane.SANEStatus.GOOD) {
        throw new Error(`Unable to get scanner devices: ${statusMessageFromSane(lib, devicesResult.status)}`)
      }

      const devices = devicesResult.devices || []
      setScanDevices(devices)
      if (!devices.length) {
        throw new Error('No scanner detected. Connect a scanner and allow WebUSB access, then try again.')
      }

      const selectedDevice = devices.find((device) => device.name === selectedScanDevice) || devices[0]
      if (!selectedScanDevice && selectedDevice?.name) {
        setSelectedScanDevice(selectedDevice.name)
      }
      setScanStatus(`Connecting to ${selectedDevice.vendor || 'Scanner'} ${selectedDevice.model || ''}...`)
      const openResult = await lib.sane_open(selectedDevice.name)
      if (openResult.status !== sane.SANEStatus.GOOD) {
        throw new Error(`Unable to open scanner: ${statusMessageFromSane(lib, openResult.status)}`)
      }

      const options = await sane.ScanOptions.get(lib)
      await applyScanSettings(sane, options)

      setScanStatus('Scanning page...')
      const reader = new sane.ScanImageReader(lib)

      const scannedImage = await new Promise((resolve, reject) => {
        let done = false

        reader.on('image', (parameters, data) => {
          if (done) {
            return
          }
          done = true
          resolve({ parameters, data })
        })

        reader.on('stop', (parameters, scanError) => {
          if (done) {
            return
          }
          if (scanError) {
            done = true
            reject(scanError)
          } else if (parameters && parameters.pixels_per_line > 0 && parameters.lines > 0) {
            done = true
            reject(new Error('Scan finished without image data. Please try scanning again.'))
          }
        })

        reader.start().then((result) => {
          if (result.status !== sane.SANEStatus.GOOD) {
            done = true
            reject(new Error(`Scan failed to start: ${statusMessageFromSane(lib, result.status)}`))
            return
          }
          result.promise.catch((scanError) => {
            if (!done) {
              done = true
              reject(scanError)
            }
          })
        }).catch((scanError) => {
          if (!done) {
            done = true
            reject(scanError)
          }
        })
      })

      const width = scannedImage?.parameters?.pixels_per_line
      const height = scannedImage?.parameters?.lines
      if (!width || !height || !scannedImage?.data) {
        throw new Error('Scanner returned incomplete image output')
      }

      const sourceName = `${selectedDevice.vendor || 'scanner'}-${selectedDevice.model || 'scan'}`
      const scanFile = await buildScanFile({
        data: scannedImage.data,
        width,
        height,
        sourceName,
      })

      await finalizeScannedFile(scanFile, sourceName)
    } catch (scanError) {
      const rawMessage = scanError?.message || 'Scan failed'
      const message = /share.?array.?buffer/i.test(rawMessage)
        ? 'SharedArrayBuffer is blocked. Restart the frontend dev server and reload this page so COOP/COEP headers take effect.'
        : rawMessage
      setScanStatus(message)
      setError(message)
      toast && toast(message, { type: 'error' })
    } finally {
      if (lib) {
        try {
          await lib.sane_close()
        } catch {
          // best effort cleanup
        }
        try {
          await lib.sane_exit()
        } catch {
          // best effort cleanup
        }
      }
      setScanBusy(false)
    }
  }

  const handleOcrToggle = (checked) => {
    setForm((prev) => ({
      ...prev,
      runOcr: checked || prev.runDataExtraction,
    }))
  }

  const handleExtractionToggle = (checked) => {
    setForm((prev) => ({
      ...prev,
      runDataExtraction: checked,
      runOcr: checked ? true : prev.runOcr,
    }))
  }

  const handleEmbeddingToggle = (checked) => {
    setForm((prev) => ({
      ...prev,
      runEmbedding: checked,
      runOcr: checked ? true : prev.runOcr,
    }))
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

  const selectedFolderSummary = folderPath?.join(' / ')

  const clearScannedPages = () => {
    setScanPages([])
    setScanPageCount(0)
    if (scanOutputFormat === 'pdf') {
      setScanStatus('Cleared scanned PDF pages.')
    }
  }

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
              <div className="upload-panel__file-row">
                <input
                  type="file"
                  required={!file}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  className="ghost upload-panel__scan-action"
                  onClick={() => setScanPanelOpen((prev) => !prev)}
                  disabled={busy || scanBusy}
                >
                  {scanPanelOpen ? 'Hide Scan' : 'Scan'}
                </button>
              </div>
              <small>{file ? `Selected: ${file.name}` : 'Select a document file to upload.'}</small>
            </label>
            {scanPanelOpen && (
            <div className="upload-panel__scan-row">
              <div className="upload-panel__scan-controls">
                <label>
                  <span>Scanner</span>
                  <select
                    value={selectedScanDevice}
                    onChange={(event) => setSelectedScanDevice(event.target.value)}
                    disabled={busy || scanBusy || !scanDevices.length}
                  >
                    {!scanDevices.length && <option value="">No scanner detected</option>}
                    {scanDevices.map((device) => (
                      <option key={device.name} value={device.name}>
                        {(device.vendor || 'Scanner')} {(device.model || '')}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Resolution (DPI)</span>
                  <input
                    type="number"
                    min={75}
                    max={1200}
                    step={25}
                    value={scanResolution}
                    onChange={(event) => setScanResolution(Math.min(1200, Math.max(75, Number(event.target.value) || 300)))}
                    disabled={busy || scanBusy}
                  />
                </label>
                <label>
                  <span>Color mode</span>
                  <select value={scanColorMode} onChange={(event) => setScanColorMode(event.target.value)} disabled={busy || scanBusy}>
                    <option value="Color">Color</option>
                    <option value="Gray">Gray</option>
                  </select>
                </label>
                <label>
                  <span>Paper size</span>
                  <select value={scanPaperSize} onChange={(event) => setScanPaperSize(event.target.value)} disabled={busy || scanBusy}>
                    <option value="A4">A4</option>
                    <option value="A3">A3</option>
                  </select>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={scanDuplex}
                    onChange={(event) => setScanDuplex(event.target.checked)}
                    disabled={busy || scanBusy || scanOutputFormat !== 'pdf'}
                  />
                  <span>Duplex (ADF, when supported)</span>
                </label>
                <label>
                  <span>Output</span>
                  <select
                    value={scanOutputFormat}
                    onChange={(event) => {
                      const value = event.target.value
                      setScanOutputFormat(value)
                      if (value !== 'pdf') {
                        setScanPages([])
                        setScanPageCount(0)
                      }
                    }}
                    disabled={busy || scanBusy}
                  >
                    <option value="pdf">PDF (multi-page)</option>
                    <option value="png">PNG (single page)</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="ghost upload-panel__scan-action"
                onClick={handleScanAction}
                disabled={busy || scanBusy}
              >
                {scanBusy
                  ? 'Scanning...'
                  : scanOutputFormat === 'pdf'
                    ? 'Scan to PDF'
                    : 'Scan (Node usb)'}
              </button>
              {scanOutputFormat === 'pdf' && (
                <div className="upload-panel__scan-pdf-row">
                  <span className="pill pill--info">Pages scanned: {scanPageCount}</span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={clearScannedPages}
                    disabled={busy || scanBusy || !scanPageCount}
                  >
                    Clear pages
                  </button>
                </div>
              )}
              {scanStatus && <p className="feedback">{scanStatus}</p>}
            </div>
            )}
            <label className="checkbox upload-panel__checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(form.runOcr && canRunUploadOcr)}
                onChange={(e) => handleOcrToggle(e.target.checked)}
                disabled={busy || !canRunUploadOcr || Boolean(form.runDataExtraction)}
              />
              <span>Run OCR after upload</span>
            </label>
            <label className="checkbox upload-panel__checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(form.runDataExtraction && canRunUploadOcr)}
                onChange={(e) => handleExtractionToggle(e.target.checked)}
                disabled={busy || !canRunUploadOcr}
              />
              <span>Run data extraction after upload</span>
            </label>
            <label className="checkbox upload-panel__checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(form.runEmbedding && canRunUploadOcr)}
                onChange={(e) => handleEmbeddingToggle(e.target.checked)}
                disabled={busy || !canRunUploadOcr}
              />
              <span>Embed for search</span>
            </label>
            <small className="upload-panel__hint">
              {canRunUploadOcr
                ? form.runEmbedding
                  ? 'The document uploads first. OCR runs in the backend, then chunking and embedding updates the search index.'
                  : form.runDataExtraction
                    ? 'The document uploads first. OCR runs in the backend, then data extraction updates document metadata automatically.'
                    : 'The document uploads first. OCR then runs in the backend so the upload dialog can close immediately.'
                : 'OCR and backend operations during upload are available for PDF files only.'}
            </small>
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
            type="submit"
            className="primary"
            disabled={busy || approverLoading || supervisorLoading || !approverOptions.length || !supervisorOptions.length}
            aria-label="Upload"
            title="Upload"
          >
            Upload
          </button>
        </div>
      </form>
    </div>
  )
}
