import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import {
  archiveDocument,
  fetchDocument,
  getStoredDocumentOcr,
  listDocuments,
  listFolderTree,
  runDataExtraction,
  runStoredDocumentOcr,
  updateDocument,
  uploadDocument,
  uploadVersion,
} from '../api/documents'
import { askDocumentQuestion, searchChatDocuments, summarizeDocumentWithChatbot } from '../api/chatbot'
import { createKnowledgeTopic, linkKnowledgeDocument } from '../api/knowledge'
import { downloadAndPreview, downloadAndShare } from '../utils/fileTransfer'
import { AuthContext } from '../contexts/AuthContext'
import AccessNotice from '../components/AccessNotice'
import SectionTabs from '../components/SectionTabs'

const statuses = ['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']

const parseTags = (tagsText) => tagsText.split(',').map((x) => x.trim()).filter(Boolean)
const isPdfFile = (fileName, contentType) => /pdf/i.test(contentType || '') || /\.pdf$/i.test(fileName || '')

const getLatestVersion = (detail) => {
  if (detail?.latestVersion) return detail.latestVersion
  if (!Array.isArray(detail?.versions) || detail.versions.length === 0) return null

  return [...detail.versions].sort((a, b) => Number(b?.version || 0) - Number(a?.version || 0))[0]
}

const getDocumentDownloadName = (detail, fallbackTitle = 'document') => {
  const latest = getLatestVersion(detail)
  if (latest?.fileName) return latest.fileName
  return `${fallbackTitle}.bin`
}

const getItemsFromPayload = (payload) => {
  if (Array.isArray(payload?.content)) return payload.content
  if (Array.isArray(payload)) return payload
  return []
}

const buildExpandedMap = (nodes, level = 0, map = {}) => {
  if (!Array.isArray(nodes)) return map
  nodes.forEach((node) => {
    if (!node?.id) return
    map[node.id] = level < 2
    buildExpandedMap(node.children || [], level + 1, map)
  })
  return map
}

const findFolderNodeById = (nodes, id) => {
  if (!id || !Array.isArray(nodes)) return null
  for (const node of nodes) {
    if (node?.id === id) return node
    const childHit = findFolderNodeById(node?.children || [], id)
    if (childHit) return childHit
  }
  return null
}

function FolderTreeNode({ node, level, selectedId, expandedIds, onToggle, onSelect }) {
  const children = Array.isArray(node?.children) ? node.children : []
  const hasChildren = children.length > 0
  const expanded = Boolean(expandedIds[node.id])

  return (
    <View>
      <View style={[styles.folderRow, { paddingLeft: 8 + level * 14 }]}>
        {hasChildren ? (
          <Pressable style={styles.folderToggle} onPress={() => onToggle(node.id)}>
            <Text style={styles.folderToggleText}>{expanded ? '▾' : '▸'}</Text>
          </Pressable>
        ) : (
          <View style={styles.folderSpacer} />
        )}
        <Pressable style={[styles.folderItem, selectedId === node.id && styles.folderItemSelected]} onPress={() => onSelect(node)}>
          <Text style={styles.folderItemIcon}>[+]</Text>
          <Text style={styles.folderItemText}>{node?.name || '(untitled folder)'}</Text>
        </Pressable>
      </View>
      {hasChildren && expanded ? children.map((child) => (
        <FolderTreeNode
          key={child.id}
          node={child}
          level={level + 1}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      )) : null}
    </View>
  )
}

const jsonPretty = (value) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function DocumentsScreen() {
  const { documentPermissions } = React.useContext(AuthContext)
  const [docs, setDocs] = useState([])
  const [selected, setSelected] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [query, setQuery] = useState('')
  const [owner, setOwner] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('ALL')
  const [tags, setTags] = useState('')
  const [folderId, setFolderId] = useState('')

  const [uploadTitle] = useState('')
  const [uploadDescription] = useState('')
  const [uploadOwner] = useState('')
  const [uploadCategory] = useState('')
  const [uploadStatus] = useState('DRAFT')
  const [uploadTags] = useState('')

  const [chatPrompt, setChatPrompt] = useState('')
  const [chatQuestion, setChatQuestion] = useState('')
  const [chatOutput, setChatOutput] = useState('')

  const [ocrPrompt, setOcrPrompt] = useState('prompt_layout_all_en')
  const [ocrConfidence, setOcrConfidence] = useState('95')
  const [ocrOutput, setOcrOutput] = useState('')
  const [extractOutput, setExtractOutput] = useState('')

  const [topicTitle, setTopicTitle] = useState('')
  const [topicDesc, setTopicDesc] = useState('')
  const [topicTags, setTopicTags] = useState('')
  const [section, setSection] = useState('search')
  const [folderTree, setFolderTree] = useState([])
  const [expandedFolderIds, setExpandedFolderIds] = useState({})
  const [page, setPage] = useState(0)
  const [pageSize] = useState(10)
  const [sortField, setSortField] = useState('updatedAt')
  const [sortDir, setSortDir] = useState('desc')
  const [tableFilterText, setTableFilterText] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewPages, setPreviewPages] = useState([])
  const [previewPageIndex, setPreviewPageIndex] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const selectedId = selectedDetail?.id || selected?.id
  const selectedFolder = useMemo(() => findFolderNodeById(folderTree, folderId), [folderTree, folderId])
  const canWrite = Boolean(documentPermissions?.write)
  const canDelete = Boolean(documentPermissions?.delete)

  const sectionOptions = [
    { label: 'Search', value: 'search' },
    { label: 'Document', value: 'document' },
    { label: 'Folders', value: 'folders' },
    { label: 'AI/OCR', value: 'ai' },
    { label: 'Knowledge', value: 'knowledge' },
  ]

  const docItems = useMemo(() => {
    if (Array.isArray(docs?.content)) return docs.content
    if (Array.isArray(docs)) return docs
    return []
  }, [docs])

  const filteredTableRows = useMemo(() => {
    const keyword = tableFilterText.trim().toLowerCase()
    if (!keyword) return docItems
    return docItems.filter((item) => {
      const haystack = [item?.title, item?.owner, item?.category, item?.status].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })
  }, [docItems, tableFilterText])

  const totalPages = typeof docs?.totalPages === 'number' ? docs.totalPages : 0
  const totalElements = typeof docs?.totalElements === 'number' ? docs.totalElements : filteredTableRows.length

  const execute = async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message || 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const loadDocuments = async ({
    overrideFolderId = folderId,
    overridePage = page,
    overrideSortField = sortField,
    overrideSortDir = sortDir,
    navigateToDocument = false,
  } = {}) => {
    await execute(async () => {
      const normalizedQuery = (query || '').trim()
      const normalizedOwner = (owner || '').trim().replace(/^owner\s*=\s*/i, '')
      const normalizedCategory = (category || '').trim()
      const sort = `${overrideSortField},${overrideSortDir}`
      let payload = await listDocuments({
        page: overridePage,
        size: pageSize,
        filters: {
          query: normalizedQuery,
          owner: normalizedOwner,
          category: normalizedCategory,
          status,
          folderId: overrideFolderId || null,
          tags: parseTags(tags),
          sort,
        },
      })

      const items = getItemsFromPayload(payload)
      if (normalizedOwner && items.length === 0) {
        // Fallback for strict filter combinations (folder/tags/category) that can hide owner matches.
        payload = await listDocuments({
          page: 0,
          size: pageSize,
          filters: {
            owner: normalizedOwner,
            status: 'ALL',
            sort,
          },
        })
      }

      setPage(typeof payload?.page === 'number' ? payload.page : overridePage)
      setDocs(payload)

      if (navigateToDocument) {
        setSection('document')
      }
    })
  }

  const loadFolderTree = useCallback(async () => {
    await execute(async () => {
      const payload = await listFolderTree()
      const nodes = Array.isArray(payload) ? payload : []
      setFolderTree(nodes)
      setExpandedFolderIds(buildExpandedMap(nodes))

      if (folderId) {
        const selectedFolder = findFolderNodeById(nodes, folderId)
        if (!selectedFolder) {
          setFolderId('')
        }
      }
    })
  }, [folderId])

  useEffect(() => {
    loadFolderTree()
  }, [loadFolderTree])

  const onToggleFolder = (id) => {
    setExpandedFolderIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const onSelectFolder = async (folder) => {
    const nextFolderId = folder?.id || ''
    setFolderId(nextFolderId)
    if (!nextFolderId) {
      await loadDocuments({ overrideFolderId: '', overridePage: 0 })
      return
    }
    await loadDocuments({ overrideFolderId: nextFolderId, overridePage: 0 })
  }

  const splitPreviewPages = (rawText) => {
    if (!rawText) return []
    const byFormFeed = String(rawText).split(/\f+/).map((x) => x.trim()).filter(Boolean)
    if (byFormFeed.length > 1) return byFormFeed
    return [String(rawText)]
  }

  const loadPdfPreview = async (documentId, titleHint) => {
    setPreviewLoading(true)
    setPreviewError('')
    setPreviewTitle(titleHint || `Document ${documentId}`)
    try {
      const payload = await getStoredDocumentOcr(documentId, ocrPrompt, Number(ocrConfidence || 95))
      let pages = []
      if (Array.isArray(payload?.pages)) {
        pages = payload.pages.map((p) => {
          if (typeof p === 'string') return p
          if (typeof p?.text === 'string') return p.text
          return jsonPretty(p)
        }).filter(Boolean)
      } else if (typeof payload === 'string') {
        pages = splitPreviewPages(payload)
      } else if (typeof payload?.text === 'string') {
        pages = splitPreviewPages(payload.text)
      } else {
        pages = splitPreviewPages(jsonPretty(payload))
      }

      if (pages.length === 0) {
        setPreviewError('No preview content returned for this PDF.')
        setPreviewPages([])
        setPreviewPageIndex(0)
      } else {
        setPreviewPages(pages)
        setPreviewPageIndex(0)
      }
    } catch (err) {
      setPreviewError(err?.message || 'Failed to load PDF preview.')
      setPreviewPages([])
      setPreviewPageIndex(0)
    } finally {
      setPreviewLoading(false)
    }
  }

  const loadDetail = async (id) => {
    await execute(async () => {
      const detail = await fetchDocument(id)
      setSelected({ id: detail.id, title: detail.title })
      setSelectedDetail(detail)
    })
  }

  const onSelectDocument = async (id, titleHint) => {
    await execute(async () => {
      const detail = await fetchDocument(id)
      setSelected({ id: detail.id, title: detail.title })
      setSelectedDetail(detail)

      const latest = getLatestVersion(detail)
      const fileName = getDocumentDownloadName(detail, detail?.title || titleHint || 'document')

      if (isPdfFile(fileName, latest?.contentType)) {
        await loadPdfPreview(id, detail?.title || titleHint || fileName)
      } else {
        setPreviewPages([])
        setPreviewPageIndex(0)
        setPreviewError('')
        setPreviewTitle('')
      }
    })
  }

  const onToggleSort = async (field) => {
    const nextDir = sortField === field && sortDir === 'asc' ? 'desc' : 'asc'
    setSortField(field)
    setSortDir(nextDir)
    await loadDocuments({ overridePage: 0, overrideSortField: field, overrideSortDir: nextDir })
  }

  const onPrevPage = async () => {
    if (page <= 0) return
    await loadDocuments({ overridePage: page - 1 })
  }

  const onNextPage = async () => {
    if (totalPages <= 0 || page >= totalPages - 1) return
    await loadDocuments({ overridePage: page + 1 })
  }

  const pickOneFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false })
    if (result.canceled) return null
    return result.assets?.[0] || null
  }

  const onUploadDocument = async () => {
    if (!folderId) {
      setError('Pick a destination folder before uploading.')
      return
    }

    const file = await pickOneFile()
    if (!file) return
    await execute(async () => {
      const created = await uploadDocument({
        title: uploadTitle,
        description: uploadDescription,
        owner: uploadOwner,
        category: uploadCategory,
        status: uploadStatus,
        tags: parseTags(uploadTags),
        folderId: folderId || null,
      }, file)
      setSelectedDetail(created)
      await loadDocuments()
    })
  }

  const onUploadVersion = async () => {
    if (!selectedId) return
    const file = await pickOneFile()
    if (!file) return
    await execute(async () => {
      await uploadVersion(selectedId, file)
      await loadDetail(selectedId)
    })
  }

  const onArchive = async () => {
    if (!selectedId) return
    await execute(async () => {
      await archiveDocument(selectedId)
      await loadDocuments()
      setSelectedDetail(null)
    })
  }

  const onUpdateDocument = async () => {
    if (!selectedId) return
    await execute(async () => {
      const updated = await updateDocument(selectedId, {
        title: uploadTitle || selectedDetail?.title,
        description: uploadDescription || selectedDetail?.description,
        category: uploadCategory || selectedDetail?.category,
        status: uploadStatus || selectedDetail?.status,
        tags: parseTags(uploadTags),
      })
      setSelectedDetail(updated)
      await loadDocuments()
    })
  }

  const onDownloadLatest = async () => {
    if (!selectedId) return
    await execute(async () => {
      await downloadAndShare(`/api/documents/${selectedId}/download`, `${selectedDetail?.title || 'document'}.bin`)
    })
  }

  const onOpenVersion = async (version) => {
    if (!selectedId || !version?.id) return
    await execute(async () => {
      const fileName = version?.fileName || 'version.bin'
      if (isPdfFile(fileName, version?.contentType)) {
        await downloadAndPreview(`/api/documents/${selectedId}/versions/${version.id}/download`, fileName)
      } else {
        await downloadAndShare(`/api/documents/${selectedId}/versions/${version.id}/download`, fileName)
      }
    })
  }

  const onChatSearch = async () => {
    await execute(async () => {
      const payload = await searchChatDocuments({ prompt: chatPrompt })
      setChatOutput(jsonPretty(payload))
    })
  }

  const onChatSummary = async () => {
    if (!selectedId) return
    await execute(async () => {
      const payload = await summarizeDocumentWithChatbot(selectedId)
      setChatOutput(payload.summary || '')
    })
  }

  const onChatQuestion = async () => {
    if (!selectedId) return
    await execute(async () => {
      const payload = await askDocumentQuestion(selectedId, chatQuestion)
      setChatOutput(payload.answer || '')
    })
  }

  const onRunOcr = async () => {
    if (!selectedId) return
    await execute(async () => {
      const payload = await runStoredDocumentOcr(selectedId, ocrPrompt, Number(ocrConfidence || 95))
      setOcrOutput(jsonPretty(payload))
    })
  }

  const onLoadOcr = async () => {
    if (!selectedId) return
    await execute(async () => {
      const payload = await getStoredDocumentOcr(selectedId, ocrPrompt, Number(ocrConfidence || 95))
      setOcrOutput(jsonPretty(payload))
      const raw = typeof payload === 'string' ? payload : jsonPretty(payload)
      const extraction = await runDataExtraction(raw, [], 'form1').catch(() => null)
      if (extraction) setExtractOutput(jsonPretty(extraction))
    })
  }

  const onCreateTopicAndLink = async () => {
    if (!selectedId) return
    await execute(async () => {
      const topic = await createKnowledgeTopic({ title: topicTitle, description: topicDesc, tags: parseTags(topicTags) })
      await linkKnowledgeDocument(topic.id, { documentId: selectedId, note: 'Linked from mobile documents module' })
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Document Management</Text>
          <Text style={styles.heroCopy}>Browse folders, manage versions, and preview files with the same visual style as web.</Text>
        </View>
        <SectionTabs value={section} onChange={setSection} options={sectionOptions} />

        {section === 'search' && (
          <View style={styles.card}>
          <Text style={styles.sectionTitle}>Search</Text>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Query" />
          <TextInput style={styles.input} value={owner} onChangeText={setOwner} placeholder="Owner (e.g. Jeffrey or Owner=Jeffrey)" />
          <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Category" />
          <TextInput style={styles.input} value={status} onChangeText={setStatus} placeholder={`Status (${statuses.join('|')})`} />
          <TextInput style={styles.input} value={tags} onChangeText={setTags} placeholder="Tags (comma separated)" />
          <TextInput style={styles.input} value={folderId} onChangeText={setFolderId} placeholder="Folder ID" />
          <Pressable style={styles.primaryButton} onPress={() => loadDocuments({ overridePage: 0, navigateToDocument: true })}><Text style={styles.primaryText}>Load Documents</Text></Pressable>
          <Text style={styles.smallLabel}>Results appear in the Document tab as a vertical list.</Text>
          </View>
        )}

        {section === 'document' && (
          <View style={styles.card}>
          <Text style={styles.sectionTitle}>Document List</Text>
          <TextInput style={styles.input} value={tableFilterText} onChangeText={setTableFilterText} placeholder="Filter current page (title/owner/category/status)" />

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.tableWrap}>
              <View style={[styles.tableRow, styles.tableHeaderRow]}>
                <Pressable style={styles.colTitle} onPress={() => onToggleSort('title')}><Text style={styles.tableHeaderText}>Title {sortField === 'title' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</Text></Pressable>
                <Pressable style={styles.colOwner} onPress={() => onToggleSort('owner')}><Text style={styles.tableHeaderText}>Owner {sortField === 'owner' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</Text></Pressable>
                <Pressable style={styles.colCategory} onPress={() => onToggleSort('category')}><Text style={styles.tableHeaderText}>Category {sortField === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</Text></Pressable>
                <Pressable style={styles.colStatus} onPress={() => onToggleSort('status')}><Text style={styles.tableHeaderText}>Status {sortField === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</Text></Pressable>
                <Pressable style={styles.colUpdated} onPress={() => onToggleSort('updatedAt')}><Text style={styles.tableHeaderText}>Updated {sortField === 'updatedAt' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</Text></Pressable>
              </View>

              {filteredTableRows.length === 0 ? (
                <Text style={styles.smallLabel}>No documents matched the current filters.</Text>
              ) : filteredTableRows.map((item) => (
                <Pressable key={String(item.id)} style={[styles.tableRow, styles.tableBodyRow, selected?.id === item.id && styles.tableRowActive]} onPress={() => onSelectDocument(item.id, item.title)}>
                  <Text style={styles.colTitle} numberOfLines={1}>{item.title || `#${item.id}`}</Text>
                  <Text style={styles.colOwner} numberOfLines={1}>{item.owner || '-'}</Text>
                  <Text style={styles.colCategory} numberOfLines={1}>{item.category || '-'}</Text>
                  <Text style={styles.colStatus} numberOfLines={1}>{item.status || '-'}</Text>
                  <Text style={styles.colUpdated} numberOfLines={1}>{item.updatedAt ? String(item.updatedAt).replace('T', ' ').slice(0, 16) : '-'}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View style={styles.paginationRow}>
            <Pressable style={[styles.secondaryButton, page <= 0 && styles.disabled]} onPress={onPrevPage} disabled={page <= 0}><Text style={styles.secondaryText}>Prev</Text></Pressable>
            <Text style={styles.smallLabel}>Page {totalPages > 0 ? page + 1 : 0} / {totalPages} | Total {totalElements}</Text>
            <Pressable style={[styles.secondaryButton, (totalPages <= 0 || page >= totalPages - 1) && styles.disabled]} onPress={onNextPage} disabled={totalPages <= 0 || page >= totalPages - 1}><Text style={styles.secondaryText}>Next</Text></Pressable>
          </View>

          <Text style={styles.sectionTitle}>Selected Document</Text>
          {selectedDetail ? (
            <View style={styles.selectedDocPanel}>
              <Text style={styles.listTitle}>{selectedDetail.title || `#${selectedDetail.id}`}</Text>
              <Text style={styles.smallLabel}>Owner: {selectedDetail.owner || '-'}</Text>
              <Text style={styles.smallLabel}>Category: {selectedDetail.category || '-'}</Text>
              <Text style={styles.smallLabel}>Status: {selectedDetail.status || '-'}</Text>
            </View>
          ) : <Text style={styles.smallLabel}>No document selected.</Text>}

          <View style={styles.rowWrap}>
            {canWrite && <Pressable style={styles.secondaryButton} onPress={onUploadVersion}><Text style={styles.secondaryText}>Upload Version</Text></Pressable>}
            {canWrite && <Pressable style={styles.secondaryButton} onPress={onUpdateDocument}><Text style={styles.secondaryText}>Update Metadata</Text></Pressable>}
            {canDelete && <Pressable style={styles.warningButton} onPress={onArchive}><Text style={styles.warningText}>Archive</Text></Pressable>}
            <Pressable style={styles.secondaryButton} onPress={onDownloadLatest}><Text style={styles.secondaryText}>Download Latest</Text></Pressable>
          </View>
          {!canWrite && !canDelete ? <AccessNotice title="Read-only mode" message="Your role allows viewing and downloading documents only." /> : null}
          <Text style={styles.smallLabel}>Versions</Text>
          {selectedDetail?.versions?.map((version) => (
            <Pressable key={version.id} style={styles.linkButton} onPress={() => onOpenVersion(version)}>
              <Text style={styles.linkText}>Open v{version.version} - {version.fileName}</Text>
            </Pressable>
          ))}

          <View style={styles.previewPanel}>
            <Text style={styles.sectionTitle}>PDF Preview</Text>
            {previewTitle ? <Text style={styles.smallLabel}>{previewTitle}</Text> : null}
            {previewLoading ? <ActivityIndicator size="small" /> : null}
            {previewError ? <Text style={styles.error}>{previewError}</Text> : null}
            {!previewLoading && !previewError && previewPages.length === 0 ? <Text style={styles.smallLabel}>Select a PDF document to preview here.</Text> : null}
            {previewPages.length > 0 ? (
              <>
                <View style={styles.paginationRow}>
                  <Pressable style={[styles.secondaryButton, previewPageIndex <= 0 && styles.disabled]} onPress={() => setPreviewPageIndex((p) => Math.max(0, p - 1))} disabled={previewPageIndex <= 0}><Text style={styles.secondaryText}>Prev Page</Text></Pressable>
                  <Text style={styles.smallLabel}>Page {previewPageIndex + 1} / {previewPages.length}</Text>
                  <Pressable style={[styles.secondaryButton, previewPageIndex >= previewPages.length - 1 && styles.disabled]} onPress={() => setPreviewPageIndex((p) => Math.min(previewPages.length - 1, p + 1))} disabled={previewPageIndex >= previewPages.length - 1}><Text style={styles.secondaryText}>Next Page</Text></Pressable>
                </View>
                <View style={styles.previewContentPanel}>
                  <Text selectable style={styles.previewText}>{previewPages[previewPageIndex]}</Text>
                </View>
              </>
            ) : null}
          </View>
          </View>
        )}

        {section === 'folders' && (
          <View style={styles.card}>
          <Text style={styles.sectionTitle}>Folders</Text>
          <View style={styles.folderActionRow}>
            <Text style={styles.smallLabel} numberOfLines={1}>
              {selectedFolder ? `Selected: ${selectedFolder.name || selectedFolder.id}` : 'Select a folder to upload documents.'}
            </Text>
            {canWrite ? (
              <Pressable
                style={[styles.folderUploadButton, !selectedFolder && styles.disabled]}
                onPress={onUploadDocument}
                disabled={!selectedFolder}
              >
                <Text style={styles.folderUploadIcon}>⤴</Text>
                <Text style={styles.folderUploadText}>Upload document</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.folderTreeCard}>
            {folderTree.length ? (
              <View style={styles.folderTreeContainer}>
                {folderTree.map((node) => (
                  <FolderTreeNode
                    key={node.id}
                    node={node}
                    level={0}
                    selectedId={folderId}
                    expandedIds={expandedFolderIds}
                    onToggle={onToggleFolder}
                    onSelect={onSelectFolder}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.smallLabel}>No folder data available.</Text>
            )}
          </View>
          </View>
        )}

        {section === 'ai' && (
          <View style={styles.card}>
          <Text style={styles.sectionTitle}>AI Chatbot & OCR</Text>
          <TextInput style={styles.input} value={chatPrompt} onChangeText={setChatPrompt} placeholder="Search prompt" />
          <Pressable style={styles.secondaryButton} onPress={onChatSearch}><Text style={styles.secondaryText}>Search Documents</Text></Pressable>
          <TextInput style={styles.input} value={chatQuestion} onChangeText={setChatQuestion} placeholder="Question for selected document" />
          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={onChatSummary}><Text style={styles.secondaryText}>Summarize Selected</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={onChatQuestion}><Text style={styles.secondaryText}>Ask Question</Text></Pressable>
          </View>
          <TextInput style={styles.input} value={ocrPrompt} onChangeText={setOcrPrompt} placeholder="OCR prompt" />
          <TextInput style={styles.input} value={ocrConfidence} onChangeText={setOcrConfidence} placeholder="OCR confidence" keyboardType="numeric" />
          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={onRunOcr}><Text style={styles.secondaryText}>Run OCR</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={onLoadOcr}><Text style={styles.secondaryText}>Load OCR</Text></Pressable>
          </View>
          <Text selectable>{chatOutput || ocrOutput || extractOutput || 'No AI output yet.'}</Text>
          </View>
        )}

        {section === 'knowledge' && (
          <View style={styles.card}>
          <Text style={styles.sectionTitle}>Create Knowledge Topic From Document</Text>
          <TextInput style={styles.input} value={topicTitle} onChangeText={setTopicTitle} placeholder="Topic title" />
          <TextInput style={styles.input} value={topicDesc} onChangeText={setTopicDesc} placeholder="Topic description" />
          <TextInput style={styles.input} value={topicTags} onChangeText={setTopicTags} placeholder="Topic tags (comma separated)" />
          <Pressable style={styles.primaryButton} onPress={onCreateTopicAndLink}><Text style={styles.primaryText}>Create Topic + Link Selected Document</Text></Pressable>
          </View>
        )}

        {busy ? <ActivityIndicator size="large" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2ff' },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  hero: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.18)',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  heroCopy: { color: '#475569', marginTop: 4 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#0f172a' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  bigInput: { minHeight: 110, textAlignVertical: 'top' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  folderActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  folderUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  folderUploadIcon: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  folderUploadText: { color: '#ffffff', fontWeight: '600' },
  folderTreeCard: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 8, gap: 8, overflow: 'hidden' },
  folderTreeContainer: {
    borderRadius: 8,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 6,
    minHeight: 44,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  folderRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34, paddingRight: 8 },
  folderToggle: { width: 24, alignItems: 'center', justifyContent: 'center' },
  folderToggleText: { color: '#334155', fontSize: 14, fontWeight: '700' },
  folderSpacer: { width: 24 },
  folderItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 6 },
  folderItemSelected: { backgroundColor: '#ccfbf1' },
  folderItemIcon: { color: '#0369a1', fontWeight: '700' },
  folderItemText: { color: '#0f172a', fontSize: 14 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondaryButton: { backgroundColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  secondaryText: { color: '#0f172a', fontWeight: '600' },
  warningButton: { backgroundColor: '#fca5a5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  warningText: { color: '#7f1d1d', fontWeight: '700' },
  disabled: { opacity: 0.45 },
  linkButton: { paddingVertical: 6 },
  linkText: { color: '#0369a1', textDecorationLine: 'underline' },
  chip: { backgroundColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, marginRight: 8 },
  chipActive: { backgroundColor: '#dbeafe' },
  chipText: { color: '#0f172a' },
  tableWrap: {
    minWidth: 760,
    gap: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tableHeaderRow: {
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  tableBodyRow: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tableRowActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  tableHeaderText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  colTitle: { width: 210, color: '#0f172a' },
  colOwner: { width: 130, color: '#0f172a' },
  colCategory: { width: 130, color: '#0f172a' },
  colStatus: { width: 110, color: '#0f172a' },
  colUpdated: { width: 160, color: '#0f172a' },
  paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6, marginBottom: 6 },
  selectedDocPanel: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, gap: 2 },
  listTitle: { color: '#0f172a', fontWeight: '700' },
  previewPanel: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8, gap: 8 },
  previewContentPanel: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10 },
  previewText: { color: '#0f172a', lineHeight: 20 },
  smallLabel: { fontSize: 12, color: '#475569', marginTop: 4 },
  error: { color: '#b91c1c', fontWeight: '600' },
})
