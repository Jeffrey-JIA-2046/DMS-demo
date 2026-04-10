import React, { useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { approveRetentionTask, delegateRetentionTask, fetchMyDashboardTasks, rejectRetentionTask } from '../api/dashboard'
import { approveDocument, delegateApproval, fetchDocument, rejectDocument } from '../api/documents'
import { downloadAndShare } from '../utils/fileTransfer'

const RETENTION_TYPE = 'RETENTION'

const pretty = (v) => {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export default function DashboardScreen() {
  const [tasksPayload, setTasksPayload] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [approverId, setApproverId] = useState('')

  const tasks = useMemo(() => (Array.isArray(tasksPayload?.tasks) ? tasksPayload.tasks : []), [tasksPayload])

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

  const loadTasks = async () => {
    await execute(async () => {
      const payload = await fetchMyDashboardTasks()
      setTasksPayload(payload)
    })
  }

  const openTask = async (task) => {
    setSelectedTask(task)
    setSelectedDocument(null)
    if (!task?.documentId) return
    await execute(async () => {
      const detail = await fetchDocument(task.documentId)
      setSelectedDocument(detail)
    })
  }

  const approve = async () => {
    if (!selectedTask) return
    await execute(async () => {
      if (selectedTask.taskType === RETENTION_TYPE) {
        await approveRetentionTask(selectedTask.id, { note })
      } else if (selectedTask.documentId) {
        await approveDocument(selectedTask.documentId, { note })
      }
      await loadTasks()
    })
  }

  const reject = async () => {
    if (!selectedTask) return
    await execute(async () => {
      if (selectedTask.taskType === RETENTION_TYPE) {
        await rejectRetentionTask(selectedTask.id, { note })
      } else if (selectedTask.documentId) {
        await rejectDocument(selectedTask.documentId, { note })
      }
      await loadTasks()
    })
  }

  const delegate = async () => {
    if (!selectedTask || !approverId) return
    await execute(async () => {
      if (selectedTask.taskType === RETENTION_TYPE) {
        await delegateRetentionTask(selectedTask.id, { approverId: Number(approverId), note })
      } else if (selectedTask.documentId) {
        await delegateApproval(selectedTask.documentId, { approverId: Number(approverId), note })
      }
      await loadTasks()
    })
  }

  const downloadDocument = async () => {
    if (!selectedTask?.documentId) return
    await execute(async () => {
      await downloadAndShare(`/api/documents/${selectedTask.documentId}/download`, `dashboard-document-${selectedTask.documentId}.bin`)
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>My Dashboard</Text>
          <Text style={styles.heroCopy}>Review approvals and tasks in the same clean interface language as web.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tasks</Text>
          <Pressable style={styles.primaryButton} onPress={loadTasks}><Text style={styles.primaryText}>Refresh Tasks</Text></Pressable>
          <Text style={styles.small}>Generated at: {tasksPayload?.generatedAt || '-'}</Text>
          <FlatList
            data={tasks}
            keyExtractor={(item) => String(item.id)}
            horizontal
            renderItem={({ item }) => (
              <Pressable style={[styles.chip, selectedTask?.id === item.id && styles.chipActive]} onPress={() => openTask(item)}>
                <Text style={styles.chipText}>{item.title || `Task ${item.id}`}</Text>
                <Text style={styles.small}>{item.taskType || '-'} | {item.status || '-'}</Text>
              </Pressable>
            )}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Task Actions</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Decision note" />
          <TextInput style={styles.input} value={approverId} onChangeText={setApproverId} placeholder="Delegate approver ID" keyboardType="numeric" />
          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={approve}><Text style={styles.secondaryText}>Approve</Text></Pressable>
            <Pressable style={styles.warningButton} onPress={reject}><Text style={styles.warningText}>Reject</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={delegate}><Text style={styles.secondaryText}>Delegate</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={downloadDocument}><Text style={styles.secondaryText}>Download Doc</Text></Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Selected Task</Text>
          <Text selectable>{selectedTask ? pretty(selectedTask) : 'No task selected.'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Related Document</Text>
          <Text selectable>{selectedDocument ? pretty(selectedDocument) : 'No related document loaded.'}</Text>
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
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondaryButton: { backgroundColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  secondaryText: { color: '#0f172a', fontWeight: '600' },
  warningButton: { backgroundColor: '#fca5a5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  warningText: { color: '#7f1d1d', fontWeight: '700' },
  chip: { backgroundColor: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, marginRight: 8, gap: 3 },
  chipActive: { backgroundColor: '#dbeafe' },
  chipText: { color: '#0f172a', fontWeight: '600' },
  small: { fontSize: 12, color: '#475569' },
  error: { color: '#b91c1c', fontWeight: '600' },
})
