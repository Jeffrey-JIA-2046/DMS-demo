import React, { useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import {
  addKnowledgeContribution,
  createKnowledgeTopic,
  fetchKnowledgeTopic,
  joinKnowledgeTopic,
  linkKnowledgeDocument,
  searchKnowledgeTopics,
  shareKnowledgeTopic,
  starKnowledgeTopic,
  unlinkKnowledgeDocument,
  unstarKnowledgeTopic,
  updateKnowledgeTopic,
  uploadKnowledgeAttachment,
} from '../api/knowledge'
import { downloadAndShare } from '../utils/fileTransfer'

const parseCsv = (value) => value.split(',').map((x) => x.trim()).filter(Boolean)

const pretty = (v) => {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export default function KnowledgeScreen() {
  const [topics, setTopics] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [query, setQuery] = useState('')
  const [tags, setTags] = useState('')
  const [starredOnly, setStarredOnly] = useState('false')
  const [joinedOnly, setJoinedOnly] = useState('false')

  const [topicTitle, setTopicTitle] = useState('')
  const [topicDescription, setTopicDescription] = useState('')
  const [topicTags, setTopicTags] = useState('')

  const [contribText, setContribText] = useState('')
  const [shareUsers, setShareUsers] = useState('')
  const [linkDocumentId, setLinkDocumentId] = useState('')
  const [linkNote, setLinkNote] = useState('')
  const [unlinkLinkId, setUnlinkLinkId] = useState('')

  const listItems = useMemo(() => {
    if (Array.isArray(topics?.content)) return topics.content
    if (Array.isArray(topics)) return topics
    return []
  }, [topics])

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

  const loadTopics = async () => {
    await execute(async () => {
      const payload = await searchKnowledgeTopics({
        query,
        tags: parseCsv(tags),
        starredOnly: starredOnly === 'true',
        joinedOnly: joinedOnly === 'true',
      })
      setTopics(payload)
    })
  }

  const openTopic = async (id) => {
    await execute(async () => {
      const detail = await fetchKnowledgeTopic(id)
      setSelectedId(id)
      setSelectedDetail(detail)
    })
  }

  const createTopic = async () => {
    await execute(async () => {
      const created = await createKnowledgeTopic({
        title: topicTitle,
        description: topicDescription,
        tags: parseCsv(topicTags),
      })
      setSelectedId(created.id)
      setSelectedDetail(created)
      await loadTopics()
    })
  }

  const updateTopic = async () => {
    if (!selectedId) return
    await execute(async () => {
      const updated = await updateKnowledgeTopic(selectedId, {
        title: topicTitle || selectedDetail?.title,
        description: topicDescription || selectedDetail?.description,
        tags: parseCsv(topicTags),
      })
      setSelectedDetail(updated)
      await loadTopics()
    })
  }

  const joinTopic = async () => {
    if (!selectedId) return
    await execute(async () => {
      await joinKnowledgeTopic(selectedId)
      await openTopic(selectedId)
    })
  }

  const toggleStar = async () => {
    if (!selectedId) return
    await execute(async () => {
      const isStarred = Boolean(selectedDetail?.starred)
      if (isStarred) await unstarKnowledgeTopic(selectedId)
      else await starKnowledgeTopic(selectedId)
      await openTopic(selectedId)
    })
  }

  const addContribution = async () => {
    if (!selectedId) return
    await execute(async () => {
      await addKnowledgeContribution(selectedId, { content: contribText })
      setContribText('')
      await openTopic(selectedId)
    })
  }

  const shareTopic = async () => {
    if (!selectedId) return
    await execute(async () => {
      await shareKnowledgeTopic(selectedId, { recipients: parseCsv(shareUsers) })
      setShareUsers('')
    })
  }

  const linkDocument = async () => {
    if (!selectedId || !linkDocumentId) return
    await execute(async () => {
      await linkKnowledgeDocument(selectedId, { documentId: Number(linkDocumentId), note: linkNote })
      await openTopic(selectedId)
    })
  }

  const unlinkDocument = async () => {
    if (!selectedId || !unlinkLinkId) return
    await execute(async () => {
      await unlinkKnowledgeDocument(selectedId, Number(unlinkLinkId))
      await openTopic(selectedId)
    })
  }

  const uploadAttachment = async () => {
    if (!selectedId) return
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false })
    if (result.canceled) return
    const file = result.assets?.[0]
    if (!file) return
    await execute(async () => {
      await uploadKnowledgeAttachment(selectedId, file, 'Uploaded from mobile app')
      await openTopic(selectedId)
    })
  }

  const downloadChain = async () => {
    if (!selectedId) return
    await execute(async () => {
      await downloadAndShare(`/api/knowledge/topics/${selectedId}/chain/download`, `knowledge-topic-${selectedId}.md`)
    })
  }

  const downloadAttachment = async (uploadId) => {
    if (!selectedId || !uploadId) return
    await execute(async () => {
      await downloadAndShare(`/api/knowledge/topics/${selectedId}/documents/${uploadId}/download`, `attachment-${uploadId}`)
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Knowledge Management</Text>
          <Text style={styles.heroCopy}>Search, share, and curate knowledge topics with the same style used in frontend.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Search Topics</Text>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Query" />
          <TextInput style={styles.input} value={tags} onChangeText={setTags} placeholder="Tags CSV" />
          <TextInput style={styles.input} value={starredOnly} onChangeText={setStarredOnly} placeholder="starredOnly true|false" />
          <TextInput style={styles.input} value={joinedOnly} onChangeText={setJoinedOnly} placeholder="joinedOnly true|false" />
          <Pressable style={styles.primaryButton} onPress={loadTopics}><Text style={styles.primaryText}>Load Topics</Text></Pressable>

          <FlatList
            data={listItems}
            keyExtractor={(item) => String(item.id)}
            horizontal
            renderItem={({ item }) => (
              <Pressable style={[styles.chip, selectedId === item.id && styles.chipActive]} onPress={() => openTopic(item.id)}>
                <Text style={styles.chipText}>{item.title || `Topic ${item.id}`}</Text>
              </Pressable>
            )}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Create / Update Topic</Text>
          <TextInput style={styles.input} value={topicTitle} onChangeText={setTopicTitle} placeholder="Topic title" />
          <TextInput style={styles.input} value={topicDescription} onChangeText={setTopicDescription} placeholder="Description" />
          <TextInput style={styles.input} value={topicTags} onChangeText={setTopicTags} placeholder="Tags CSV" />
          <View style={styles.rowWrap}>
            <Pressable style={styles.primaryButton} onPress={createTopic}><Text style={styles.primaryText}>Create Topic</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={updateTopic}><Text style={styles.secondaryText}>Update Selected</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={joinTopic}><Text style={styles.secondaryText}>Join Selected</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={toggleStar}><Text style={styles.secondaryText}>Toggle Star</Text></Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Contributions / Sharing / Linking</Text>
          <TextInput style={styles.input} value={contribText} onChangeText={setContribText} placeholder="Contribution text" />
          <Pressable style={styles.secondaryButton} onPress={addContribution}><Text style={styles.secondaryText}>Add Contribution</Text></Pressable>

          <TextInput style={styles.input} value={shareUsers} onChangeText={setShareUsers} placeholder="Share recipients CSV" />
          <Pressable style={styles.secondaryButton} onPress={shareTopic}><Text style={styles.secondaryText}>Share Topic</Text></Pressable>

          <TextInput style={styles.input} value={linkDocumentId} onChangeText={setLinkDocumentId} placeholder="Document ID to link" keyboardType="numeric" />
          <TextInput style={styles.input} value={linkNote} onChangeText={setLinkNote} placeholder="Link note" />
          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={linkDocument}><Text style={styles.secondaryText}>Link Document</Text></Pressable>
            <TextInput style={[styles.input, styles.flexInput]} value={unlinkLinkId} onChangeText={setUnlinkLinkId} placeholder="Link ID" keyboardType="numeric" />
            <Pressable style={styles.warningButton} onPress={unlinkDocument}><Text style={styles.warningText}>Unlink</Text></Pressable>
          </View>

          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={uploadAttachment}><Text style={styles.secondaryText}>Upload Attachment</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={downloadChain}><Text style={styles.secondaryText}>Download Chain</Text></Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Selected Topic Detail</Text>
          {selectedDetail?.uploads?.map((item) => (
            <Pressable key={item.id} style={styles.linkButton} onPress={() => downloadAttachment(item.id)}>
              <Text style={styles.linkText}>Download attachment #{item.id} {item.fileName ? `(${item.fileName})` : ''}</Text>
            </Pressable>
          ))}
          <Text selectable>{selectedDetail ? pretty(selectedDetail) : 'No selected topic.'}</Text>
        </View>

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
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  flexInput: { flex: 1, minWidth: 100 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondaryButton: { backgroundColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  secondaryText: { color: '#0f172a', fontWeight: '600' },
  warningButton: { backgroundColor: '#fca5a5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  warningText: { color: '#7f1d1d', fontWeight: '700' },
  chip: { backgroundColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, marginRight: 8 },
  chipActive: { backgroundColor: '#dbeafe' },
  chipText: { color: '#0f172a' },
  linkButton: { paddingVertical: 5 },
  linkText: { color: '#0369a1', textDecorationLine: 'underline' },
  error: { color: '#b91c1c', fontWeight: '600' },
})
