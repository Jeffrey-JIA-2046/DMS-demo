import React, { useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { listAuditLogs } from '../api/audit'

const prettyDate = (value) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export default function AuditScreen() {
  const [payload, setPayload] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState('0')
  const [size, setSize] = useState('25')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [performer, setPerformer] = useState('')
  const [action, setAction] = useState('')

  const items = useMemo(() => (Array.isArray(payload?.content) ? payload.content : []), [payload])

  const load = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await listAuditLogs({
        page: Number(page || 0),
        size: Number(size || 25),
        startDate,
        endDate,
        performer,
        action,
      })
      setPayload(data)
    } catch (err) {
      setError(err.message || 'Failed to load audit logs')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>System Auditing</Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Filters</Text>
          <TextInput style={styles.input} value={page} onChangeText={setPage} keyboardType="numeric" placeholder="Page" />
          <TextInput style={styles.input} value={size} onChangeText={setSize} keyboardType="numeric" placeholder="Size" />
          <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="Start date yyyy-mm-dd" />
          <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="End date yyyy-mm-dd" />
          <TextInput style={styles.input} value={performer} onChangeText={setPerformer} placeholder="Performer" />
          <TextInput style={styles.input} value={action} onChangeText={setAction} placeholder="Action" />
          <Pressable style={styles.primaryButton} onPress={load}><Text style={styles.primaryText}>Search</Text></Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Results ({payload?.totalElements ?? 0})</Text>
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>{item.action || '-'}</Text>
                <Text style={styles.rowMeta}>{item.performedBy || '-'} | {prettyDate(item.createdAt)}</Text>
                <Text style={styles.rowMeta}>Document #{item.documentId || '-'}</Text>
                {item.details ? <Text style={styles.rowDetails}>{item.details}</Text> : null}
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No records loaded.</Text>}
          />
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
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  primaryText: { color: '#fff', fontWeight: '600' },
  row: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 8, gap: 3 },
  rowTitle: { fontWeight: '700', color: '#0f172a' },
  rowMeta: { color: '#334155', fontSize: 12 },
  rowDetails: { color: '#475569' },
  empty: { color: '#64748b' },
  error: { color: '#b91c1c', fontWeight: '600' },
})
