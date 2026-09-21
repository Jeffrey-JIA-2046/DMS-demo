import React, { useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Card from '../components/Card'
import LabeledInput from '../components/LabeledInput'
import PrimaryButton from '../components/PrimaryButton'
import ScreenShell from '../components/ScreenShell'
import { askQuestionOnSelectedDocuments, searchDocumentsByAi, summarizeSelectedDocuments } from '../api/chatbot'
import { useAuth } from '../contexts/AuthContext'
import { colors } from '../theme'

const buildPressReleasePayload = (doc) => ({
  id: doc.documentId,
  title: doc.title || 'Untitled',
  date: doc.updatedAt || new Date().toISOString().slice(0, 10),
  content: [doc.snippet, doc.metadata ? JSON.stringify(doc.metadata, null, 2) : ''].filter(Boolean).join('\n\n') || doc.title,
})

export default function AIAssistantScreen({ route }) {
  const { authToken } = useAuth()
  const selectedDocumentFromRoute = route.params?.selectedDocument
  const [prompt, setPrompt] = useState('')
  const [question, setQuestion] = useState('')
  const [searching, setSearching] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [results, setResults] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [chatLog, setChatLog] = useState([])

  useEffect(() => {
    if (!selectedDocumentFromRoute?.documentId) return
    const normalized = {
      documentId: selectedDocumentFromRoute.documentId,
      title: selectedDocumentFromRoute.title,
      snippet: selectedDocumentFromRoute.snippet,
      metadata: selectedDocumentFromRoute.metadata,
      updatedAt: selectedDocumentFromRoute.updatedAt,
    }
    setResults((prev) => {
      const byId = new Map(prev.map((item) => [item.documentId, item]))
      byId.set(normalized.documentId, normalized)
      return Array.from(byId.values())
    })
    setSelectedIds((prev) => {
      if (prev.includes(normalized.documentId)) return prev
      return [...prev, normalized.documentId].slice(0, 3)
    })
  }, [selectedDocumentFromRoute])

  const selectedDocs = useMemo(
    () => selectedIds.map((id) => results.find((item) => item.documentId === id)).filter(Boolean),
    [selectedIds, results],
  )

  const toggleDoc = (docId) => {
    setSelectedIds((prev) => {
      if (prev.includes(docId)) return prev.filter((id) => id !== docId)
      if (prev.length >= 3) {
        Alert.alert('Limit reached', 'Maximum 3 documents can be selected')
        return prev
      }
      return [...prev, docId]
    })
  }

  const runSearch = async () => {
    if (!prompt.trim()) {
      Alert.alert('Missing prompt', 'Enter a prompt to search')
      return
    }
    try {
      setSearching(true)
      const data = await searchDocumentsByAi(authToken, { prompt: prompt.trim() })
      const normalized = (data?.results || []).map((item) => ({
        documentId: item?.id,
        title: item?.source?.title || item?.source?.document_title || 'Untitled',
        snippet: item?.source?.ocr_content || item?.source?.description || '',
        metadata: item?.source,
        updatedAt: item?.source?.updatedAt || item?.source?.updated_at,
      }))
      setResults(normalized)
    } catch (err) {
      Alert.alert('Search failed', err.message || 'Unable to search')
    } finally {
      setSearching(false)
    }
  }

  const summarizeSelected = async () => {
    if (!selectedDocs.length) {
      Alert.alert('No selection', 'Select at least one document')
      return
    }
    try {
      setSummarizing(true)
      setChatLog((prev) => [...prev, { role: 'user', content: `Summarize ${selectedDocs.length} selected document(s)` }, { role: 'ai', content: '' }])
      const pressReleases = selectedDocs.map(buildPressReleasePayload)
      const summary = await summarizeSelectedDocuments(authToken, { pressReleases }, (chunk) => {
        setChatLog((prev) => {
          const next = [...prev]
          const index = next.length - 1
          if (index >= 0 && next[index].role === 'ai') {
            next[index] = { ...next[index], content: `${next[index].content || ''}${chunk}` }
          }
          return next
        })
      })
      if (!summary) {
        setChatLog((prev) => {
          const next = [...prev]
          const index = next.length - 1
          if (index >= 0 && next[index].role === 'ai' && !next[index].content) {
            next[index] = { ...next[index], content: 'No summary generated.' }
          }
          return next
        })
      }
    } catch (err) {
      Alert.alert('Summary failed', err.message || 'Unable to summarize')
    } finally {
      setSummarizing(false)
    }
  }

  const askQuestion = async () => {
    if (!selectedDocs.length) {
      Alert.alert('No selection', 'Select at least one document')
      return
    }
    if (!question.trim()) {
      Alert.alert('Missing question', 'Type your question first')
      return
    }
    const ask = question.trim()
    setQuestion('')
    try {
      setAnswering(true)
      setChatLog((prev) => [...prev, { role: 'user', content: ask }, { role: 'ai', content: '' }])
      const pressReleases = selectedDocs.map(buildPressReleasePayload)
      await askQuestionOnSelectedDocuments(authToken, { question: ask, pressReleases }, (chunk) => {
        setChatLog((prev) => {
          const next = [...prev]
          const index = next.length - 1
          if (index >= 0 && next[index].role === 'ai') {
            next[index] = { ...next[index], content: `${next[index].content || ''}${chunk}` }
          }
          return next
        })
      })
    } catch (err) {
      Alert.alert('Question failed', err.message || 'Unable to answer')
    } finally {
      setAnswering(false)
    }
  }

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>AI Document Search</Text>
          <LabeledInput label="Prompt" value={prompt} onChangeText={setPrompt} placeholder="Find policy updates for 2026" />
          <PrimaryButton title="Search" onPress={runSearch} loading={searching} />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Search Results (Select up to 3)</Text>
          <FlatList
            data={results}
            keyExtractor={(item, idx) => `${item.documentId || 'doc'}-${idx}`}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.documentId)
              return (
                <Pressable style={[styles.resultRow, selected && styles.resultRowSelected]} onPress={() => toggleDoc(item.documentId)}>
                  <Text style={styles.resultTitle}>{item.title || 'Untitled'}</Text>
                  {!!item.snippet && <Text style={styles.resultSnippet}>{item.snippet.slice(0, 140)}</Text>}
                  <Text style={styles.resultHint}>{selected ? 'Selected' : 'Tap to select'}</Text>
                </Pressable>
              )
            }}
            ListEmptyComponent={<Text style={styles.empty}>No results yet.</Text>}
          />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>AI Processing for Selected Documents</Text>
          <View style={styles.rowButtons}>
            <PrimaryButton title="Summarize" onPress={summarizeSelected} loading={summarizing} />
            <PrimaryButton title="Clear Selection" variant="outline" onPress={() => setSelectedIds([])} />
          </View>
          <LabeledInput label="Ask question" value={question} onChangeText={setQuestion} placeholder="What are the retention obligations?" />
          <PrimaryButton title="Ask" onPress={askQuestion} loading={answering} />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Conversation</Text>
          {chatLog.length ? chatLog.map((item, index) => (
            <View key={`${item.role}-${index}`} style={[styles.message, item.role === 'user' ? styles.user : styles.ai]}>
              <Text style={styles.messageRole}>{item.role === 'user' ? 'You' : 'AI'}</Text>
              <Text style={styles.messageContent}>{item.content || '...'}</Text>
            </View>
          )) : <Text style={styles.empty}>No messages yet.</Text>}
        </Card>
      </ScrollView>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 10,
    paddingBottom: 20,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  list: {
    gap: 8,
  },
  resultRow: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#fff',
    gap: 4,
  },
  resultRowSelected: {
    borderColor: colors.accent,
    backgroundColor: '#dbeafe',
  },
  resultTitle: {
    fontWeight: '700',
    color: colors.inkStrong,
    fontSize: 14,
  },
  resultSnippet: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  resultHint: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  message: {
    borderRadius: 12,
    padding: 10,
    gap: 3,
  },
  user: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  ai: {
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  messageRole: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  messageContent: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  empty: {
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
})
