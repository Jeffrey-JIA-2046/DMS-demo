import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import Card from '../components/Card'
import LabeledInput from '../components/LabeledInput'
import PrimaryButton from '../components/PrimaryButton'
import ScreenShell from '../components/ScreenShell'
import { useAuth } from '../contexts/AuthContext'
import { listDocuments, listFolders, uploadDocument } from '../api/documents'
import { colors, text } from '../theme'

const resolveFolderPath = (tree = [], pathIds = []) => {
  const nodesAlongPath = []
  let currentLevel = Array.isArray(tree) ? tree : []

  for (const id of pathIds) {
    const found = currentLevel.find((item) => item?.id === id)
    if (!found) {
      break
    }
    nodesAlongPath.push(found)
    currentLevel = Array.isArray(found.children) ? found.children : []
  }

  return {
    nodesAlongPath,
    nextLevelFolders: currentLevel,
    validPathIds: nodesAlongPath.map((item) => item.id),
  }
}

export default function DocumentsScreen({ navigation }) {
  const { authToken } = useAuth()
  const [folders, setFolders] = useState([])
  const [documents, setDocuments] = useState([])
  const [activeFolderPath, setActiveFolderPath] = useState([])
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pickedFile, setPickedFile] = useState(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadCategory, setUploadCategory] = useState('')
  const [uploadTags, setUploadTags] = useState('')

  const folderNavigation = useMemo(() => resolveFolderPath(folders, activeFolderPath), [folders, activeFolderPath])
  const selectedFolderId = folderNavigation.validPathIds.length
    ? folderNavigation.validPathIds[folderNavigation.validPathIds.length - 1]
    : null
  const activePathKey = activeFolderPath.join('|')
  const validPathKey = folderNavigation.validPathIds.join('|')

  const loadFolders = useCallback(async () => {
    setLoadingFolders(true)
    try {
      const folderData = await listFolders(authToken)
      setFolders(Array.isArray(folderData) ? folderData : folderData?.folders || [])
    } catch (err) {
      Alert.alert('Load failed', err.message || 'Unable to load folders')
    } finally {
      setLoadingFolders(false)
    }
  }, [authToken])

  const loadDocuments = useCallback(async () => {
    setLoadingDocuments(true)
    try {
      const documentData = await listDocuments(authToken, { folderId: selectedFolderId || undefined, query })
      setDocuments(documentData?.content || documentData?.items || [])
    } catch (err) {
      Alert.alert('Load failed', err.message || 'Unable to load documents')
    } finally {
      setLoadingDocuments(false)
    }
  }, [authToken, selectedFolderId, query])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    // Keep breadcrumb path valid after folder tree refresh.
    if (activePathKey !== validPathKey) {
      setActiveFolderPath(folderNavigation.validPathIds)
    }
  }, [activePathKey, validPathKey, folderNavigation.validPathIds])

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadFolders(), loadDocuments()])
    setRefreshing(false)
  }

  const handleFolderOpen = (folderId) => {
    setActiveFolderPath((prev) => [...prev, folderId])
  }

  const handleBreadcrumbPress = (index) => {
    if (index <= 0) {
      setActiveFolderPath([])
      return
    }
    setActiveFolderPath((prev) => prev.slice(0, index))
  }

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: false,
      multiple: false,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (asset) {
      setPickedFile(asset)
      if (!uploadTitle.trim()) {
        setUploadTitle(asset.name?.replace(/\.[^.]+$/, '') || '')
      }
    }
  }

  const normalizeCapturedAsset = (asset) => {
    const extension = asset?.type === 'video' ? 'mp4' : 'jpg'
    const generatedName = `${asset?.type || 'capture'}_${Date.now()}.${extension}`
    return {
      uri: asset.uri,
      name: asset.fileName || generatedName,
      mimeType: asset.mimeType || (asset?.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      size: asset.fileSize,
    }
  }

  const captureFromCamera = async (mediaType) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Camera permission required', 'Please allow camera access to capture media.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: mediaType === 'video'
        ? ImagePicker.MediaTypeOptions.Videos
        : ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      videoMaxDuration: 300,
    })

    if (result.canceled) {
      return
    }

    const asset = result.assets?.[0]
    if (asset?.uri) {
      const normalized = normalizeCapturedAsset(asset)
      setPickedFile(normalized)
      if (!uploadTitle.trim()) {
        setUploadTitle((normalized.name || '').replace(/\.[^.]+$/, ''))
      }
    }
  }

  const submitUpload = async () => {
    if (!pickedFile) {
      Alert.alert('No file selected', 'Choose a file to upload')
      return
    }
    try {
      setUploading(true)
      await uploadDocument(authToken, {
        file: pickedFile,
        metadata: {
          title: uploadTitle || pickedFile.name,
          category: uploadCategory,
          tags: uploadTags.split(',').map((tag) => tag.trim()).filter(Boolean),
          folderId: selectedFolderId,
        },
      })
      setUploadOpen(false)
      setPickedFile(null)
      setUploadTitle('')
      setUploadCategory('')
      setUploadTags('')
      await loadDocuments()
      Alert.alert('Uploaded', 'Document uploaded successfully')
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Unable to upload document')
    } finally {
      setUploading(false)
    }
  }

  return (
    <ScreenShell>
      <Card style={styles.hero}>
        <Text style={text.title}>Document Workspace</Text>
        <Text style={text.body}>Browse folders, open documents, and upload from your mobile device.</Text>
        <View style={styles.heroActions}>
          <Pressable style={styles.aiIconButton} onPress={() => navigation.navigate('AI Assistant')}>
            <Text style={styles.aiIconGlyph}>AI</Text>
          </Pressable>
        </View>
      </Card>

      <View style={styles.toolbar}>
        <LabeledInput label="Search documents" value={query} onChangeText={setQuery} placeholder="Title or keyword" />
        <PrimaryButton title="Search" onPress={loadDocuments} loading={loadingDocuments} />
      </View>

      <Card style={styles.folderCard}>
        <Text style={styles.sectionTitle}>Folders</Text>
        <View style={styles.breadcrumbRow}>
          <Pressable onPress={() => handleBreadcrumbPress(0)}>
            <Text style={[styles.breadcrumbText, !selectedFolderId && styles.breadcrumbTextActive]}>Root</Text>
          </Pressable>
          {folderNavigation.nodesAlongPath.map((node, index) => (
            <View key={node.id} style={styles.breadcrumbNode}>
              <Text style={styles.breadcrumbSep}>/</Text>
              <Pressable onPress={() => handleBreadcrumbPress(index + 1)}>
                <Text style={[styles.breadcrumbText, index === folderNavigation.nodesAlongPath.length - 1 && styles.breadcrumbTextActive]}>
                  {node.name}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={folderNavigation.nextLevelFolders}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            return (
              <Pressable
                style={styles.folderChip}
                onPress={() => handleFolderOpen(item.id)}
              >
                <Text style={styles.folderChipText}>
                  {item.name}
                </Text>
              </Pressable>
            )
          }}
          ListEmptyComponent={!loadingFolders ? <Text style={styles.emptyFolder}>No child folders.</Text> : null}
        />
      </Card>

      <View style={styles.actionsRow}>
        <PrimaryButton title="Upload Document" onPress={() => setUploadOpen(true)} />
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('DocumentDetail', { documentId: item.id })}>
            <Card style={styles.docCard}>
              <Text style={styles.docTitle}>{item.title || 'Untitled'}</Text>
              <Text style={styles.docMeta}>Owner: {item.owner || 'N/A'}</Text>
              <Text style={styles.docMeta}>Category: {item.category || 'N/A'}</Text>
              <Text style={styles.docMeta}>Status: {item.status || 'N/A'}</Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={!loadingDocuments ? <Text style={styles.empty}>No documents found.</Text> : null}
      />

      <Modal visible={uploadOpen} transparent animationType="slide" onRequestClose={() => setUploadOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Upload Document</Text>
            <PrimaryButton title={pickedFile ? `Selected: ${pickedFile.name}` : 'Pick file from device'} onPress={pickFile} variant="outline" />
            <View style={styles.captureActions}>
              <PrimaryButton title="Take Photo" onPress={() => captureFromCamera('image')} variant="outline" />
              <PrimaryButton title="Record Video" onPress={() => captureFromCamera('video')} variant="outline" />
            </View>
            <LabeledInput label="Title" value={uploadTitle} onChangeText={setUploadTitle} placeholder="Document title" />
            <LabeledInput label="Category" value={uploadCategory} onChangeText={setUploadCategory} placeholder="Policy / Contract / ..." />
            <LabeledInput label="Tags" value={uploadTags} onChangeText={setUploadTags} placeholder="tag1, tag2" />
            <View style={styles.modalActions}>
              <PrimaryButton title="Cancel" variant="outline" onPress={() => setUploadOpen(false)} />
              <PrimaryButton title="Upload" onPress={submitUpload} loading={uploading} />
            </View>
          </Card>
        </View>
      </Modal>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  hero: {
    gap: 6,
    marginBottom: 10,
  },
  heroActions: {
    marginTop: 4,
    alignItems: 'flex-start',
  },
  aiIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#93c5fd',
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiIconGlyph: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  toolbar: {
    marginBottom: 10,
    gap: 8,
  },
  folderCard: {
    marginBottom: 10,
    gap: 10,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  breadcrumbNode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  breadcrumbSep: {
    color: '#64748b',
    fontSize: 12,
  },
  breadcrumbText: {
    color: '#475569',
    fontSize: 12,
  },
  breadcrumbTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  folderChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  folderChipText: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  emptyFolder: {
    color: colors.inkMuted,
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  actionsRow: {
    marginBottom: 10,
  },
  listContent: {
    gap: 10,
    paddingBottom: 24,
  },
  docCard: {
    gap: 4,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  docMeta: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  empty: {
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.42)',
    justifyContent: 'center',
    padding: 14,
  },
  modalCard: {
    gap: 12,
  },
  captureActions: {
    gap: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
})
