import React, { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Card from '../components/Card'
import LabeledInput from '../components/LabeledInput'
import PrimaryButton from '../components/PrimaryButton'
import ScreenShell from '../components/ScreenShell'
import { useAuth } from '../contexts/AuthContext'
import { useAppSettings } from '../contexts/AppSettingsContext'
import { AVAILABLE_THEMES } from '../config'
import { colors, text } from '../theme'

export default function LoginScreen() {
  const { login } = useAuth()
  const { settings, saveSettings, resetSettings } = useAppSettings()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState(settings.apiBaseUrl)
  const [chatbotApiUrl, setChatbotApiUrl] = useState(settings.chatbotApiUrl)
  const [embeddingApiUrl, setEmbeddingApiUrl] = useState(settings.embeddingApiUrl)
  const [theme, setTheme] = useState(settings.theme)
  const [settingsSaving, setSettingsSaving] = useState(false)

  const openSettings = () => {
    setApiBaseUrl(settings.apiBaseUrl)
    setChatbotApiUrl(settings.chatbotApiUrl)
    setEmbeddingApiUrl(settings.embeddingApiUrl)
    setTheme(settings.theme)
    setSettingsOpen(true)
  }

  const handleSaveSettings = async () => {
    setSettingsSaving(true)
    try {
      await saveSettings({
        apiBaseUrl: apiBaseUrl.trim(),
        chatbotApiUrl: chatbotApiUrl.trim(),
        embeddingApiUrl: embeddingApiUrl.trim(),
        theme,
      })
      setSettingsOpen(false)
    } catch (err) {
      setError(err.message || 'Unable to save settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleResetSettings = async () => {
    setSettingsSaving(true)
    try {
      await resetSettings()
      setApiBaseUrl('')
      setChatbotApiUrl('')
      setEmbeddingApiUrl('')
      setTheme('light')
      setSettingsOpen(false)
    } catch (err) {
      setError(err.message || 'Unable to reset settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password')
      return
    }

    try {
      setError('')
      setLoading(true)
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenShell>
      <KeyboardAvoidingView style={styles.centered} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Card style={styles.panel}>
          <View style={styles.settingsRow}>
            <Pressable onPress={openSettings} style={styles.settingsButton}>
              <Text style={styles.settingsButtonText}>Settings</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>Automated Smart ECM</Text>
          <Text style={styles.subtitle}>Sign in with your Windows account</Text>

          <View style={styles.form}>
            <LabeledInput label="Username" value={username} onChangeText={setUsername} placeholder="domain\\username" />
            <LabeledInput label="Password" value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <PrimaryButton title="Login" onPress={handleLogin} loading={loading} />
          </View>
        </Card>
      </KeyboardAvoidingView>

      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>App Settings</Text>
            <LabeledInput label="Backend API URL" value={apiBaseUrl} onChangeText={setApiBaseUrl} placeholder="http://10.0.2.2:8080" />
            <LabeledInput label="Chatbot API URL" value={chatbotApiUrl} onChangeText={setChatbotApiUrl} placeholder="http://10.0.2.2:5100" />
            <LabeledInput label="Embedding API URL" value={embeddingApiUrl} onChangeText={setEmbeddingApiUrl} placeholder="http://10.0.2.2:5101" />

            <View style={styles.themeWrap}>
              <Text style={styles.themeTitle}>Theme</Text>
              <View style={styles.themeChips}>
                {AVAILABLE_THEMES.map((item) => {
                  const active = item === theme
                  return (
                    <Pressable key={item} style={[styles.themeChip, active && styles.themeChipActive]} onPress={() => setTheme(item)}>
                      <Text style={[styles.themeChipText, active && styles.themeChipTextActive]}>{item}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            <View style={styles.modalActions}>
              <PrimaryButton title="Cancel" variant="outline" onPress={() => setSettingsOpen(false)} />
              <PrimaryButton title="Reset" variant="outline" onPress={handleResetSettings} loading={settingsSaving} />
              <PrimaryButton title="Save" onPress={handleSaveSettings} loading={settingsSaving} />
            </View>
          </Card>
        </View>
      </Modal>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 80,
  },
  panel: {
    gap: 8,
  },
  settingsRow: {
    alignItems: 'flex-end',
  },
  settingsButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  settingsButtonText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 12,
  },
  title: {
    ...text.title,
  },
  subtitle: {
    ...text.body,
    marginBottom: 8,
  },
  form: {
    gap: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    justifyContent: 'center',
    padding: 14,
  },
  modalCard: {
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  themeWrap: {
    gap: 8,
  },
  themeTitle: {
    color: colors.inkStrong,
    fontWeight: '600',
    fontSize: 13,
  },
  themeChips: {
    flexDirection: 'row',
    gap: 8,
  },
  themeChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  themeChipActive: {
    borderColor: colors.accent,
    backgroundColor: '#dbeafe',
  },
  themeChipText: {
    color: colors.inkMuted,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  themeChipTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
})
