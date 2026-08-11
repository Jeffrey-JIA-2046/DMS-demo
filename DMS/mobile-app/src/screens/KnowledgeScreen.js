import React, { useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import Card from '../components/Card'
import LabeledInput from '../components/LabeledInput'
import PrimaryButton from '../components/PrimaryButton'
import ScreenShell from '../components/ScreenShell'
import { createKnowledgeTopic, searchKnowledgeTopics } from '../api/knowledge'
import { useAuth } from '../contexts/AuthContext'
import { colors } from '../theme'

export default function KnowledgeScreen() {
  const { authToken } = useAuth()
  const [query, setQuery] = useState('')
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingCreate, setLoadingCreate] = useState(false)
  const [topics, setTopics] = useState([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')

  const runSearch = async () => {
    try {
      setLoadingSearch(true)
      const data = await searchKnowledgeTopics(authToken, { query })
      setTopics(data?.content || data?.items || [])
    } catch (err) {
      Alert.alert('Search failed', err.message || 'Unable to search topics')
    } finally {
      setLoadingSearch(false)
    }
  }

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Topic title is required')
      return
    }
    try {
      setLoadingCreate(true)
      await createKnowledgeTopic(authToken, {
        title: title.trim(),
        description,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      })
      setTitle('')
      setDescription('')
      setTags('')
      await runSearch()
      Alert.alert('Created', 'Knowledge topic created successfully')
    } catch (err) {
      Alert.alert('Create failed', err.message || 'Unable to create topic')
    } finally {
      setLoadingCreate(false)
    }
  }

  return (
    <ScreenShell>
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Knowledge Topic Search</Text>
        <LabeledInput label="Keyword" value={query} onChangeText={setQuery} placeholder="Search topic title or tags" />
        <PrimaryButton title="Search" onPress={runSearch} loading={loadingSearch} />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Create Topic</Text>
        <LabeledInput label="Title" value={title} onChangeText={setTitle} placeholder="Topic title" />
        <LabeledInput label="Description" value={description} onChangeText={setDescription} placeholder="What should collaborators know?" multiline />
        <LabeledInput label="Tags" value={tags} onChangeText={setTags} placeholder="compliance, legal, onboarding" />
        <PrimaryButton title="Create Topic" onPress={handleCreate} loading={loadingCreate} />
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Results</Text>
        <FlatList
          data={topics}
          keyExtractor={(item, idx) => `${item.id || 'topic'}-${idx}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowTitle}>{item.title || 'Untitled'}</Text>
              <Text style={styles.rowMeta}>{item.description || 'No description'}</Text>
              <Text style={styles.rowMeta}>Tags: {(item.tags || []).join(', ') || 'N/A'}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No topics found.</Text>}
        />
      </Card>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  list: {
    gap: 8,
  },
  row: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#fff',
    gap: 3,
  },
  rowTitle: {
    color: colors.inkStrong,
    fontWeight: '700',
  },
  rowMeta: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  empty: {
    textAlign: 'center',
    color: colors.inkMuted,
    paddingVertical: 8,
  },
})
