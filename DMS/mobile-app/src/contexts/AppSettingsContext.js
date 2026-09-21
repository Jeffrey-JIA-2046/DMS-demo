import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { appDefaultSettings, setRuntimeSettings } from '../config'

const STORAGE_KEY = 'dms_app_settings'

const AppSettingsContext = createContext(null)

export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState(appDefaultSettings)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const parsed = raw ? JSON.parse(raw) : null
        const next = parsed ? { ...appDefaultSettings, ...parsed } : appDefaultSettings
        setSettings(next)
        setRuntimeSettings(next)
      } catch {
        setSettings(appDefaultSettings)
        setRuntimeSettings(appDefaultSettings)
      } finally {
        setLoaded(true)
      }
    }
    bootstrap()
  }, [])

  const saveSettings = useCallback(async (nextSettings) => {
    const merged = { ...appDefaultSettings, ...nextSettings }
    setSettings(merged)
    setRuntimeSettings(merged)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  }, [])

  const resetSettings = useCallback(async () => {
    setSettings(appDefaultSettings)
    setRuntimeSettings(appDefaultSettings)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(appDefaultSettings))
  }, [])

  const value = useMemo(() => ({ settings, loaded, saveSettings, resetSettings }), [settings, loaded, saveSettings, resetSettings])

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
}

export const useAppSettings = () => {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) {
    throw new Error('useAppSettings must be used within AppSettingsProvider')
  }
  return ctx
}
