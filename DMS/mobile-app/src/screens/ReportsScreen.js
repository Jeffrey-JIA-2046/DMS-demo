import React, { useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { searchChatDocuments } from '../api/chatbot'

export default function ReportsScreen() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState(null)

  const run = async () => {
    if (!prompt.trim()) {
      setError('Please enter a report prompt.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const payload = await searchChatDocuments({ prompt: prompt.trim(), limit: 8 })
      setResult(payload)
    } catch (err) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Reports</Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>AI Report Prompt</Text>
          <TextInput
            style={[styles.input, styles.bigInput]}
            multiline
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Example: Generate a monthly compliance report highlighting pending approvals, rejection trends, and top-risk categories."
          />
          <Pressable style={styles.primaryButton} onPress={run}><Text style={styles.primaryText}>Generate Report</Text></Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Generated Overview</Text>
          <Text selectable>{result?.overview || 'No report generated yet.'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Matched Documents</Text>
          {!result?.results?.length ? <Text style={styles.empty}>No matched documents.</Text> : null}
          {result?.results?.map((row) => (
            <View key={row.documentId} style={styles.row}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowMeta}>{row.owner || '-'} | {row.category || '-'} | {row.status || '-'}</Text>
              {row.snippet ? <Text style={styles.rowSnippet}>{row.snippet}</Text> : null}
            </View>
          ))}
        </View>

        {busy ? <ActivityIndicator size="large" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#0f172a' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  bigInput: { minHeight: 120, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  primaryText: { color: '#fff', fontWeight: '600' },
  row: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 8, gap: 3 },
  rowTitle: { fontWeight: '700', color: '#0f172a' },
  rowMeta: { color: '#334155', fontSize: 12 },
  rowSnippet: { color: '#475569' },
  empty: { color: '#64748b' },
  error: { color: '#b91c1c', fontWeight: '600' },
})
