import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from './contexts/AuthContext'
import { AppSettingsProvider } from './contexts/AppSettingsContext'
import AppNavigator from './navigation/AppNavigator'

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppSettingsProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </AppSettingsProvider>
    </SafeAreaProvider>
  )
}
