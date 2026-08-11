import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { Buffer } from 'buffer'
import Card from '../components/Card'
import PrimaryButton from '../components/PrimaryButton'
import ScreenShell from '../components/ScreenShell'
import { buildOnlineViewUrl, fetchDocument } from '../api/documents'
import { useAuth } from '../contexts/AuthContext'
import { colors } from '../theme'

const buildPdfPreviewHtml = (pdfBase64) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #0b1020; color: #fff; }
      .toolbar { position: sticky; top: 0; background: #111827; padding: 10px; display: flex; gap: 8px; align-items: center; }
      button { border: 0; border-radius: 6px; padding: 8px 10px; background: #2563eb; color: #fff; font-weight: 600; }
      button:disabled { opacity: 0.5; }
      #meta { font-size: 12px; color: #dbeafe; }
      #container { padding: 8px; display: flex; justify-content: center; }
      canvas { width: 100%; max-width: 980px; height: auto; background: #fff; border-radius: 8px; }
      #error { color: #fca5a5; padding: 8px 12px; font-size: 13px; display: none; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
  </head>
  <body>
    <div class="toolbar">
      <button id="prev">Prev</button>
      <button id="next">Next</button>
      <span id="meta">Page 1 / 1</span>
    </div>
    <div id="error"></div>
    <div id="container"><canvas id="pdfCanvas"></canvas></div>

    <script>
      const errorEl = document.getElementById('error')
      const prevBtn = document.getElementById('prev')
      const nextBtn = document.getElementById('next')
      const metaEl = document.getElementById('meta')
      const canvas = document.getElementById('pdfCanvas')
      const ctx = canvas.getContext('2d')

      const raw = '${pdfBase64}'
      const binary = atob(raw)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }

      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'

      let pdfDoc = null
      let currentPage = 1

      const updateControls = () => {
        if (!pdfDoc) return
        metaEl.textContent = 'Page ' + currentPage + ' / ' + pdfDoc.numPages
        prevBtn.disabled = currentPage <= 1
        nextBtn.disabled = currentPage >= pdfDoc.numPages
      }

      const renderPage = async (pageNumber) => {
        const page = await pdfDoc.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 1.4 })
        const ratio = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = viewport.width + 'px'
        canvas.style.height = viewport.height + 'px'
        const transform = ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null
        await page.render({ canvasContext: ctx, viewport, transform }).promise
        updateControls()
      }

      prevBtn.addEventListener('click', async () => {
        if (currentPage <= 1) return
        currentPage -= 1
        await renderPage(currentPage)
      })

      nextBtn.addEventListener('click', async () => {
        if (!pdfDoc || currentPage >= pdfDoc.numPages) return
        currentPage += 1
        await renderPage(currentPage)
      })

      ;(async () => {
        try {
          const loadingTask = pdfjsLib.getDocument({ data: bytes })
          pdfDoc = await loadingTask.promise
          await renderPage(1)
        } catch (error) {
          errorEl.style.display = 'block'
          errorEl.textContent = 'Unable to preview this PDF: ' + (error?.message || 'Unknown error')
        }
      })()
    </script>
  </body>
</html>`

const toDisplayValue = (value) => {
  if (value == null || value === '') {
    return 'N/A'
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ') || 'N/A'
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, inner]) => `${key}: ${typeof inner === 'object' ? JSON.stringify(inner) : String(inner)}`)
    return entries.join(' | ') || 'N/A'
  }
  return String(value)
}

const buildMetadataFields = (metadata) => {
  const source = metadata && typeof metadata === 'object' ? metadata : {}
  const entries = Object.entries(source)
  if (!entries.length) {
    return [{ key: 'metadata', label: 'Metadata', value: 'No metadata available' }]
  }
  return entries.map(([key, value]) => ({
    key,
    label: key,
    value: toDisplayValue(value),
  }))
}

export default function DocumentDetailScreen({ route, navigation }) {
  const { authToken } = useAuth()
  const documentId = route.params?.documentId
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const metadataFields = useMemo(() => buildMetadataFields(document?.metadata), [document?.metadata])

  useEffect(() => {
    const load = async () => {
      if (!documentId) return
      try {
        setLoading(true)
        const data = await fetchDocument(authToken, documentId)
        setDocument(data)
      } catch (err) {
        Alert.alert('Load failed', err.message || 'Unable to load document details')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [authToken, documentId])

  const viewerUrl = useMemo(() => buildOnlineViewUrl(documentId), [documentId])

  const openPdfPreview = async () => {
    try {
      setPreviewLoading(true)
      const response = await fetch(viewerUrl, {
        headers: { Authorization: `Basic ${authToken}` },
      })
      if (!response.ok) {
        throw new Error(`Preview request failed (${response.status})`)
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      if (contentType && !contentType.includes('pdf')) {
        throw new Error('Selected document is not a PDF file')
      }

      const arrayBuffer = await response.arrayBuffer()
      const pdfBase64 = Buffer.from(arrayBuffer).toString('base64')
      setPreviewHtml(buildPdfPreviewHtml(pdfBase64))
      setViewerOpen(true)
    } catch (err) {
      Alert.alert('Preview failed', err.message || 'Unable to preview this document')
    } finally {
      setPreviewLoading(false)
    }
  }

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </ScreenShell>
    )
  }

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.header}>
          <Text style={styles.title}>{document?.title || 'Untitled document'}</Text>
          <Text style={styles.meta}>Owner: {document?.owner || 'N/A'}</Text>
          <Text style={styles.meta}>Category: {document?.category || 'N/A'}</Text>
          <Text style={styles.meta}>Status: {document?.status || 'N/A'}</Text>
          <Text style={styles.meta}>Updated: {document?.updatedAt || 'N/A'}</Text>
        </Card>

        <View style={styles.actions}>
          <PrimaryButton title="Preview PDF" onPress={openPdfPreview} loading={previewLoading} />
          <PrimaryButton
            title="Process with AI"
            variant="outline"
            onPress={() => navigation.navigate('AI Assistant', {
              selectedDocument: {
                documentId: document?.id,
                title: document?.title,
                snippet: document?.description || '',
                metadata: document?.metadata,
                updatedAt: document?.updatedAt,
              },
            })}
          />
        </View>

        <Card>
          <Text style={styles.section}>Metadata</Text>
          <View style={styles.metadataList}>
            {metadataFields.map((field) => (
              <View key={field.key} style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>{field.label}</Text>
                <Text style={styles.metadataValue}>{field.value}</Text>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>

      <Modal visible={viewerOpen} animationType="slide" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerTopBar}>
          <PrimaryButton title="Close" variant="outline" onPress={() => setViewerOpen(false)} />
          <Text style={styles.viewerTitle}>Online Viewer</Text>
        </View>
        {previewHtml ? (
          <WebView
            source={{ html: previewHtml }}
            originWhitelist={['*']}
            startInLoadingState
            javaScriptEnabled
          />
        ) : (
          <View style={styles.centered}>
            <Text style={styles.meta}>Preparing preview...</Text>
          </View>
        )}
      </Modal>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    gap: 10,
    paddingBottom: 20,
  },
  header: {
    gap: 5,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  meta: {
    fontSize: 13,
    color: colors.inkMuted,
  },
  actions: {
    gap: 8,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkStrong,
    marginBottom: 8,
  },
  metadataList: {
    gap: 8,
  },
  metadataRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    gap: 4,
  },
  metadataLabel: {
    color: colors.inkStrong,
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'capitalize',
  },
  metadataValue: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  viewerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  viewerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkStrong,
  },
})
