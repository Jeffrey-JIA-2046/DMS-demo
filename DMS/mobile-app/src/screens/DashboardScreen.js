import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Card from '../components/Card'
import PrimaryButton from '../components/PrimaryButton'
import ScreenShell from '../components/ScreenShell'
import {
  approveRetentionTask,
  delegateRetentionTask,
  fetchMyDashboardTasks,
  rejectRetentionTask,
} from '../api/dashboard'
import {
  approveDocument,
  delegateApproval,
  fetchDocument,
  listApproverOptions,
  rejectDocument,
} from '../api/documents'
import { useAuth } from '../contexts/AuthContext'
import { colors } from '../theme'
import { keys, readJson } from '../utils/storage'

const TODO_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'BLOCKED'])
const REMINDER_TYPE = 'REMINDER'
const RETENTION_TYPE = 'RETENTION'
const WORKFLOW_TYPES = new Set(['WORKFLOW', 'APPROVAL', 'REJECTION', 'RETENTION'])

const parseIso = (value) => {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

const taskCreatedMs = (task) => parseIso(task?.createdAt) ?? parseIso(task?.updatedAt)

const startOfTodayMs = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime()
}

const endOfDayMs = (baseMs, daysAhead = 0) => {
  const date = new Date(baseMs)
  date.setDate(date.getDate() + daysAhead)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

const formatDate = (value) => {
  if (!value) return 'No due date'
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const formatTimestamp = (iso) => {
  if (!iso) return 'Not synced yet'
  const date = new Date(iso)
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const getTaskLabel = (task) => {
  return task?.title
    || task?.subject
    || task?.documentTitle
    || task?.taskTitle
    || `Task ${task?.id || ''}`.trim()
}

const getApproverOptionId = (option) => {
  return String(
    option?.approverId
      || option?.id
      || option?.username
      || option?.userId
      || '',
  )
}

const getApproverOptionLabel = (option) => {
  return option?.displayName
    || option?.name
    || option?.fullName
    || option?.username
    || getApproverOptionId(option)
}

export default function DashboardScreen() {
  const { authToken, profile } = useAuth()
  const [tasks, setTasks] = useState([])
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastLogoutAt, setLastLogoutAt] = useState(null)
  const [actionModalOpen, setActionModalOpen] = useState(false)
  const [actionMode, setActionMode] = useState('approve')
  const [selectedTask, setSelectedTask] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [approvalNote, setApprovalNote] = useState('')
  const [approvalDates, setApprovalDates] = useState({ documentDate: '', expiryDate: '' })
  const [delegateOptions, setDelegateOptions] = useState([])
  const [delegateLoading, setDelegateLoading] = useState(false)
  const [delegateApproverId, setDelegateApproverId] = useState('')
  const [actionPreparing, setActionPreparing] = useState(false)

  const loadTasks = useCallback(async () => {
    if (!authToken) return
    try {
      setLoading(true)
      setError('')
      const response = await fetchMyDashboardTasks(authToken)
      setTasks(Array.isArray(response?.tasks) ? response.tasks : [])
      setGeneratedAt(response?.generatedAt ?? null)
    } catch (err) {
      setError(err.message || 'Unable to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [authToken])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadTasks()
    setRefreshing(false)
  }, [loadTasks])

  React.useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const activeTasks = useMemo(
    () => tasks.filter((task) => TODO_STATUSES.has(task?.status)),
    [tasks],
  )

  const reminderTasks = useMemo(
    () => activeTasks.filter((task) => task?.taskType === REMINDER_TYPE),
    [activeTasks],
  )

  const workflowTasks = useMemo(
    () => activeTasks.filter((task) => task?.taskType !== REMINDER_TYPE),
    [activeTasks],
  )

  const isActionableTask = useCallback(
    (task) => WORKFLOW_TYPES.has(task?.taskType) && TODO_STATUSES.has(task?.status),
    [],
  )

  const closeActionModal = useCallback(() => {
    setActionModalOpen(false)
    setActionMode('approve')
    setSelectedTask(null)
    setActionBusy(false)
    setActionPreparing(false)
    setActionError('')
    setApprovalNote('')
    setApprovalDates({ documentDate: '', expiryDate: '' })
    setDelegateOptions([])
    setDelegateLoading(false)
    setDelegateApproverId('')
  }, [])

  const openActionModal = useCallback(async (task, mode) => {
    setSelectedTask(task)
    setActionMode(mode)
    setActionModalOpen(true)
    setActionError('')
    setApprovalNote('')
    setApprovalDates({ documentDate: '', expiryDate: '' })
    setDelegateOptions([])
    setDelegateApproverId('')

    if (mode === 'delegate') {
      setDelegateLoading(true)
      try {
        const options = await listApproverOptions(authToken)
        setDelegateOptions(Array.isArray(options) ? options : [])
      } catch (err) {
        setDelegateOptions([])
        setActionError(err.message || 'Unable to load approver options')
      } finally {
        setDelegateLoading(false)
      }
    }

    if (mode === 'approve' && task?.documentId && task?.taskType !== RETENTION_TYPE) {
      setActionPreparing(true)
      try {
        const detail = await fetchDocument(authToken, task.documentId)
        setApprovalDates({
          documentDate: detail?.metadata?.documentDate || '',
          expiryDate: detail?.metadata?.expiryDate || '',
        })
      } catch {
        // Optional prefill only; user can still enter values manually.
      } finally {
        setActionPreparing(false)
      }
    }
  }, [authToken])

  const submitTaskAction = useCallback(async () => {
    if (!selectedTask) return
    const trimmedNote = approvalNote.trim()
    const isRetentionTask = selectedTask?.taskType === RETENTION_TYPE

    if (actionMode === 'delegate' && !delegateApproverId) {
      setActionError('Select a user to delegate this task to.')
      return
    }

    if (actionMode === 'approve' && !isRetentionTask) {
      if (!approvalDates.documentDate.trim() || !approvalDates.expiryDate.trim()) {
        setActionError('Document date and expiry date are required before approval.')
        return
      }
    }

    if (!isRetentionTask && !selectedTask?.documentId) {
      setActionError('This task has no associated document to approve.')
      return
    }

    const payload = {
      ...(trimmedNote ? { note: trimmedNote } : {}),
      ...(actionMode === 'delegate' ? { approverId: delegateApproverId } : {}),
      ...(actionMode === 'approve' && !isRetentionTask
        ? {
            documentDate: approvalDates.documentDate.trim(),
            expiryDate: approvalDates.expiryDate.trim(),
          }
        : {}),
    }

    setActionBusy(true)
    setActionError('')
    try {
      if (isRetentionTask) {
        if (actionMode === 'approve') {
          await approveRetentionTask(authToken, selectedTask.id, payload)
        } else if (actionMode === 'reject') {
          await rejectRetentionTask(authToken, selectedTask.id, payload)
        } else {
          await delegateRetentionTask(authToken, selectedTask.id, payload)
        }
      } else if (actionMode === 'approve') {
        await approveDocument(authToken, selectedTask.documentId, payload)
      } else if (actionMode === 'reject') {
        await rejectDocument(authToken, selectedTask.documentId, payload)
      } else {
        await delegateApproval(authToken, selectedTask.documentId, payload)
      }

      Alert.alert('Action completed', `Task ${actionMode}d successfully.`)
      closeActionModal()
      await loadTasks()
    } catch (err) {
      setActionError(err.message || 'Unable to complete task action')
    } finally {
      setActionBusy(false)
    }
  }, [
    selectedTask,
    approvalNote,
    actionMode,
    delegateApproverId,
    approvalDates.documentDate,
    approvalDates.expiryDate,
    authToken,
    closeActionModal,
    loadTasks,
  ])

  const [sinceLabel, setSinceLabel] = useState('Since your last sync')

  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      const stored = await readJson(keys.lastLogoutAt)
      if (!mounted) return
      setLastLogoutAt(stored || null)
      setSinceLabel(stored ? `Since ${formatTimestamp(stored)}` : 'Since your last sync')
    })()
    return () => {
      mounted = false
    }
  }, [generatedAt])

  const kpis = useMemo(() => {
    const todayStartMs = startOfTodayMs()
    const upcomingBoundary = endOfDayMs(todayStartMs, 7)
    const sinceBoundary = parseIso(lastLogoutAt) ?? (Date.now() - (24 * 60 * 60 * 1000))

    const newTasks = tasks.filter((task) => {
      const created = taskCreatedMs(task)
      return created != null && created >= sinceBoundary && TODO_STATUSES.has(task?.status)
    }).length

    const newDocuments = new Set(
      tasks
        .filter((task) => {
          if (!task?.documentId || task?.taskType === REMINDER_TYPE) return false
          const created = taskCreatedMs(task)
          return created != null && created >= sinceBoundary
        })
        .map((task) => task.documentId),
    ).size

    const upcomingReminders = activeTasks.filter((task) => {
      if (task?.taskType !== REMINDER_TYPE || !task?.dueDate) return false
      const dueMs = Date.parse(`${task.dueDate}T00:00:00`)
      return !Number.isNaN(dueMs) && dueMs >= todayStartMs && dueMs <= upcomingBoundary
    }).length

    return {
      newTasks,
      pending: activeTasks.length,
      newDocuments,
      upcomingReminders,
      workflow: workflowTasks.length,
      reminders: reminderTasks.length,
    }
  }, [tasks, activeTasks, workflowTasks.length, reminderTasks.length, lastLogoutAt])

  return (
    <ScreenShell>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Card style={styles.hero}>
          <Text style={styles.title}>My Dashboard</Text>
          <Text style={styles.subtitle}>Welcome back, {profile?.displayName || profile?.username || 'User'}.</Text>
          <Text style={styles.helper}>Track approvals, pending workflow tasks, and reminders.</Text>
          <View style={styles.headerActions}>
            <PrimaryButton title={loading ? 'Refreshing...' : 'Refresh'} onPress={loadTasks} loading={loading} />
          </View>
          <Text style={styles.synced}>Last synced · {formatTimestamp(generatedAt)}</Text>
        </Card>

        {!!error && (
          <Card>
            <Text style={styles.error}>{error}</Text>
          </Card>
        )}

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Graphic View</Text>
          <Text style={styles.sectionHint}>{sinceLabel}</Text>
          <View style={styles.kpiGrid}>
            <View style={[styles.kpi, styles.kpiSky]}>
              <Text style={styles.kpiLabel}>New Tasks</Text>
              <Text style={styles.kpiValue}>{kpis.newTasks}</Text>
            </View>
            <View style={[styles.kpi, styles.kpiAmber]}>
              <Text style={styles.kpiLabel}>Pending Tasks</Text>
              <Text style={styles.kpiValue}>{kpis.pending}</Text>
            </View>
            <View style={[styles.kpi, styles.kpiRose]}>
              <Text style={styles.kpiLabel}>Upcoming Reminders</Text>
              <Text style={styles.kpiValue}>{kpis.upcomingReminders}</Text>
            </View>
            <View style={[styles.kpi, styles.kpiTeal]}>
              <Text style={styles.kpiLabel}>New Documents</Text>
              <Text style={styles.kpiValue}>{kpis.newDocuments}</Text>
            </View>
          </View>
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>To-do List (Workflow)</Text>
          {workflowTasks.length ? workflowTasks.map((task) => (
            <View key={String(task.id)} style={styles.taskRow}>
              <Text style={styles.taskTitle}>{getTaskLabel(task)}</Text>
              <Text style={styles.taskMeta}>Due: {formatDate(task?.dueDate)} · Priority: {task?.priority || 'N/A'}</Text>
              <Text style={styles.taskMeta}>Status: {task?.status || 'N/A'} · Type: {task?.taskType || 'N/A'}</Text>
              {isActionableTask(task) && (
                <View style={styles.taskActions}>
                  <Pressable style={[styles.actionChip, styles.approveChip]} onPress={() => openActionModal(task, 'approve')}>
                    <Text style={styles.approveChipText}>Approve</Text>
                  </Pressable>
                  <Pressable style={[styles.actionChip, styles.rejectChip]} onPress={() => openActionModal(task, 'reject')}>
                    <Text style={styles.rejectChipText}>Reject</Text>
                  </Pressable>
                  <Pressable style={[styles.actionChip, styles.delegateChip]} onPress={() => openActionModal(task, 'delegate')}>
                    <Text style={styles.delegateChipText}>Delegate</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )) : <Text style={styles.empty}>No workflow tasks.</Text>}
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>To-do List (Reminders)</Text>
          {reminderTasks.length ? reminderTasks.map((task) => (
            <View key={String(task.id)} style={styles.taskRow}>
              <Text style={styles.taskTitle}>{getTaskLabel(task)}</Text>
              <Text style={styles.taskMeta}>Due: {formatDate(task?.dueDate)} · Priority: {task?.priority || 'N/A'}</Text>
              <Text style={styles.taskMeta}>Status: {task?.status || 'N/A'}</Text>
            </View>
          )) : <Text style={styles.empty}>No reminders.</Text>}
        </Card>
      </ScrollView>

      <Modal visible={actionModalOpen} transparent animationType="fade" onRequestClose={closeActionModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{actionMode[0].toUpperCase() + actionMode.slice(1)} Task</Text>
            <Text style={styles.modalTask}>{getTaskLabel(selectedTask)}</Text>

            {actionPreparing && (
              <View style={styles.preparingRow}>
                <ActivityIndicator color={colors.accent} size="small" />
                <Text style={styles.preparingText}>Preparing task data...</Text>
              </View>
            )}

            {actionMode === 'approve' && selectedTask?.taskType !== RETENTION_TYPE && (
              <View style={styles.formBlock}>
                <Text style={styles.inputLabel}>Document Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={approvalDates.documentDate}
                  onChangeText={(value) => setApprovalDates((prev) => ({ ...prev, documentDate: value }))}
                  placeholder="2026-04-15"
                  placeholderTextColor="#94a3b8"
                />
                <Text style={styles.inputLabel}>Expiry Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={approvalDates.expiryDate}
                  onChangeText={(value) => setApprovalDates((prev) => ({ ...prev, expiryDate: value }))}
                  placeholder="2027-04-15"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            )}

            {actionMode === 'delegate' && (
              <View style={styles.formBlock}>
                <Text style={styles.inputLabel}>Delegate To</Text>
                {delegateLoading ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <ScrollView style={styles.delegateList} contentContainerStyle={styles.delegateListContent}>
                    {delegateOptions.length ? delegateOptions.map((option) => {
                      const optionId = getApproverOptionId(option)
                      return (
                        <Pressable
                          key={optionId}
                          style={[styles.delegateOption, delegateApproverId === optionId && styles.delegateOptionActive]}
                          onPress={() => setDelegateApproverId(optionId)}
                        >
                          <Text style={styles.delegateOptionText}>{getApproverOptionLabel(option)}</Text>
                        </Pressable>
                      )
                    }) : <Text style={styles.empty}>No approvers available.</Text>}
                  </ScrollView>
                )}
              </View>
            )}

            <View style={styles.formBlock}>
              <Text style={styles.inputLabel}>Note (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={approvalNote}
                onChangeText={setApprovalNote}
                placeholder={actionMode === 'reject' ? 'Why is this rejected?' : 'Add context for this action'}
                placeholderTextColor="#94a3b8"
                multiline
              />
            </View>

            {!!actionError && <Text style={styles.error}>{actionError}</Text>}

            <View style={styles.modalActions}>
              <PrimaryButton title="Cancel" variant="outline" onPress={closeActionModal} disabled={actionBusy} />
              <PrimaryButton
                title={actionBusy ? 'Saving...' : actionMode[0].toUpperCase() + actionMode.slice(1)}
                onPress={submitTaskAction}
                loading={actionBusy}
                disabled={actionPreparing || delegateLoading}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 10,
    paddingBottom: 20,
  },
  hero: {
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkMuted,
  },
  helper: {
    fontSize: 13,
    color: colors.inkMuted,
  },
  headerActions: {
    marginTop: 4,
  },
  synced: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.inkStrong,
    fontWeight: '700',
    fontSize: 16,
  },
  sectionHint: {
    color: '#64748b',
    fontSize: 12,
  },
  kpiGrid: {
    gap: 8,
  },
  kpi: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 4,
    backgroundColor: '#fff',
  },
  kpiSky: {
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
  },
  kpiAmber: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  kpiRose: {
    borderColor: '#fecdd3',
    backgroundColor: '#fff1f2',
  },
  kpiTeal: {
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
  },
  kpiLabel: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  kpiValue: {
    color: colors.inkStrong,
    fontSize: 26,
    fontWeight: '800',
  },
  taskRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    gap: 3,
    backgroundColor: '#fff',
  },
  taskTitle: {
    color: colors.inkStrong,
    fontWeight: '700',
    fontSize: 14,
  },
  taskMeta: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  taskActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  approveChip: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  approveChipText: {
    color: '#166534',
    fontWeight: '700',
    fontSize: 12,
  },
  rejectChip: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  rejectChipText: {
    color: '#991b1b',
    fontWeight: '700',
    fontSize: 12,
  },
  delegateChip: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  delegateChipText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
    maxHeight: '86%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.inkStrong,
  },
  modalTask: {
    color: colors.inkMuted,
    fontSize: 13,
  },
  preparingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  preparingText: {
    color: colors.inkMuted,
    fontSize: 12,
  },
  formBlock: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#fff',
    color: colors.inkStrong,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 42,
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  delegateList: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
  },
  delegateListContent: {
    padding: 8,
    gap: 6,
  },
  delegateOption: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  delegateOptionActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  delegateOptionText: {
    color: colors.inkStrong,
    fontSize: 12,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  empty: {
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
})
