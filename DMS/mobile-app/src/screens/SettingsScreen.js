import React, { useContext, useState } from 'react'
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { AuthContext } from '../contexts/AuthContext'

export default function SettingsScreen() {
  const { apiBaseUrl, setApiBaseUrl, logout } = useContext(AuthContext)
  const [nextUrl, setNextUrl] = useState(apiBaseUrl)
  const [status, setStatus] = useState('')

  const handleSave = async () => {
    await setApiBaseUrl(nextUrl)
    setStatus('API base URL saved')
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Backend API base URL</Text>
          <TextInput style={styles.input} value={nextUrl} onChangeText={setNextUrl} autoCapitalize="none" placeholder="http://10.0.2.2:8080" />
          <Text style={styles.helper}>Use LAN IP for physical devices.</Text>
          <Pressable style={styles.primaryButton} onPress={handleSave}>
            <Text style={styles.primaryText}>Save URL</Text>
          </Pressable>
          {status ? <Text style={styles.ok}>{status}</Text> : null}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Session</Text>
          <Pressable style={styles.dangerButton} onPress={logout}>
            <Text style={styles.dangerText}>Logout</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10 },
  label: { fontWeight: '600', color: '#0f172a' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  helper: { color: '#64748b', fontSize: 12 },
  primaryButton: { backgroundColor: '#0369a1', borderRadius: 8, padding: 10, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '600' },
  dangerButton: { backgroundColor: '#ef4444', borderRadius: 8, padding: 10, alignItems: 'center' },
  dangerText: { color: '#fff', fontWeight: '600' },
  ok: { color: '#15803d', fontSize: 12 },
})
