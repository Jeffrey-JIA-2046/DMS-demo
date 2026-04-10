import React, { useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { createCodeTableItem, deleteCodeTableItem, fetchActiveCodeTableItems, listCodeTableItems, listTableCodes, updateCodeTableItem } from '../api/codeTable'
import { listJobSchedules, runJobNow, updateJobSchedule } from '../api/jobManagement'
import { createReminderRule, createRetentionRule, deleteReminderRule, deleteRetentionRule, listReminderRules, listRetentionCategories, listRetentionRules, runReminderSweep, runRetentionSweep, updateRetentionRule } from '../api/retentionManagement'
import { createGroup, createUser, deleteGroup, deleteUser, fetchGroups, fetchUsers, updateGroup, updateUser } from '../api/userManagement'
import { AuthContext } from '../contexts/AuthContext'
import AccessNotice from '../components/AccessNotice'
import SectionTabs from '../components/SectionTabs'

const pretty = (v) => {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export default function AdminScreen() {
  const { functionsAccess } = React.useContext(AuthContext)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [output, setOutput] = useState('')
  const [section, setSection] = useState('users')

  const [jsonPayload, setJsonPayload] = useState('{}')
  const [entityId, setEntityId] = useState('')
  const [tableCode, setTableCode] = useState('')
  const [jobKey, setJobKey] = useState('')
  const [codeItemId, setCodeItemId] = useState('')

  const execute = async (fn) => {
    setBusy(true)
    setError('')
    try {
      const result = await fn()
      if (result !== undefined) setOutput(pretty(result))
    } catch (err) {
      setError(err.message || 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  const json = () => JSON.parse(jsonPayload || '{}')

  const sectionOptions = [
    { label: 'Users/Groups', value: 'users' },
    { label: 'Retention', value: 'retention' },
    { label: 'Jobs', value: 'jobs' },
    { label: 'Code Tables', value: 'codes' },
    { label: 'Output', value: 'output' },
  ]

  if (!functionsAccess['System Administration']) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Admin</Text>
          <AccessNotice title="Access denied" message="Only System administrator can access this module." />
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Admin</Text>
        <SectionTabs value={section} onChange={setSection} options={sectionOptions} />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Common Inputs</Text>
          <TextInput style={styles.input} value={entityId} onChangeText={setEntityId} placeholder="Entity ID" keyboardType="numeric" />
          <TextInput style={styles.input} value={tableCode} onChangeText={setTableCode} placeholder="Code table (example: DOC_STATUS)" />
          <TextInput style={styles.input} value={codeItemId} onChangeText={setCodeItemId} placeholder="Code item ID" keyboardType="numeric" />
          <TextInput style={styles.input} value={jobKey} onChangeText={setJobKey} placeholder="Job key" />
          <TextInput style={[styles.input, styles.bigInput]} multiline value={jsonPayload} onChangeText={setJsonPayload} placeholder="JSON payload" />
        </View>

        {section === 'users' && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Users / Groups</Text>
          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={() => execute(fetchUsers)}><Text style={styles.secondaryText}>List Users</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(fetchGroups)}><Text style={styles.secondaryText}>List Groups</Text></Pressable>
            <Pressable style={styles.primaryButton} onPress={() => execute(() => createUser(json()))}><Text style={styles.primaryText}>Create User</Text></Pressable>
            <Pressable style={styles.primaryButton} onPress={() => execute(() => createGroup(json()))}><Text style={styles.primaryText}>Create Group</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(() => updateUser(Number(entityId), json()))}><Text style={styles.secondaryText}>Update User</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(() => updateGroup(Number(entityId), json()))}><Text style={styles.secondaryText}>Update Group</Text></Pressable>
            <Pressable style={styles.warningButton} onPress={() => execute(() => deleteUser(Number(entityId)))}><Text style={styles.warningText}>Delete User</Text></Pressable>
            <Pressable style={styles.warningButton} onPress={() => execute(() => deleteGroup(Number(entityId)))}><Text style={styles.warningText}>Delete Group</Text></Pressable>
          </View>
        </View>}

        {section === 'retention' && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Retention / Reminder</Text>
          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={() => execute(listRetentionRules)}><Text style={styles.secondaryText}>List Retention Rules</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(listRetentionCategories)}><Text style={styles.secondaryText}>List Categories</Text></Pressable>
            <Pressable style={styles.primaryButton} onPress={() => execute(() => createRetentionRule(json()))}><Text style={styles.primaryText}>Create Retention Rule</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(() => updateRetentionRule(Number(entityId), json()))}><Text style={styles.secondaryText}>Update Retention Rule</Text></Pressable>
            <Pressable style={styles.warningButton} onPress={() => execute(() => deleteRetentionRule(Number(entityId)))}><Text style={styles.warningText}>Delete Retention Rule</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(runRetentionSweep)}><Text style={styles.secondaryText}>Run Retention Sweep</Text></Pressable>
          </View>
          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={() => execute(listReminderRules)}><Text style={styles.secondaryText}>List Reminder Rules</Text></Pressable>
            <Pressable style={styles.primaryButton} onPress={() => execute(() => createReminderRule(json()))}><Text style={styles.primaryText}>Create Reminder Rule</Text></Pressable>
            <Pressable style={styles.warningButton} onPress={() => execute(() => deleteReminderRule(Number(entityId)))}><Text style={styles.warningText}>Delete Reminder Rule</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(runReminderSweep)}><Text style={styles.secondaryText}>Run Reminder Sweep</Text></Pressable>
          </View>
        </View>}

        {section === 'jobs' && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Job Management</Text>
          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={() => execute(listJobSchedules)}><Text style={styles.secondaryText}>List Jobs</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(() => updateJobSchedule(jobKey, json()))}><Text style={styles.secondaryText}>Update Job</Text></Pressable>
            <Pressable style={styles.primaryButton} onPress={() => execute(() => runJobNow(jobKey))}><Text style={styles.primaryText}>Run Job Now</Text></Pressable>
          </View>
        </View>}

        {section === 'codes' && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Code Tables</Text>
          <View style={styles.rowWrap}>
            <Pressable style={styles.secondaryButton} onPress={() => execute(listTableCodes)}><Text style={styles.secondaryText}>List Table Codes</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(() => listCodeTableItems(tableCode))}><Text style={styles.secondaryText}>List Table Items</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(() => fetchActiveCodeTableItems(tableCode))}><Text style={styles.secondaryText}>List Active Items</Text></Pressable>
            <Pressable style={styles.primaryButton} onPress={() => execute(() => createCodeTableItem(tableCode, json()))}><Text style={styles.primaryText}>Create Item</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => execute(() => updateCodeTableItem(tableCode, Number(codeItemId), json()))}><Text style={styles.secondaryText}>Update Item</Text></Pressable>
            <Pressable style={styles.warningButton} onPress={() => execute(() => deleteCodeTableItem(tableCode, Number(codeItemId)))}><Text style={styles.warningText}>Delete Item</Text></Pressable>
          </View>
        </View>}

        {busy ? <ActivityIndicator size="large" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {section === 'output' && <View style={styles.card}>
          <Text style={styles.sectionTitle}>Result</Text>
          <Text selectable>{output || 'Execute an action to see output.'}</Text>
        </View>}
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
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondaryButton: { backgroundColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  secondaryText: { color: '#0f172a', fontWeight: '600' },
  warningButton: { backgroundColor: '#fca5a5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  warningText: { color: '#7f1d1d', fontWeight: '700' },
  error: { color: '#b91c1c', fontWeight: '600' },
})
