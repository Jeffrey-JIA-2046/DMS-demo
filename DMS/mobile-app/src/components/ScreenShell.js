import React from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useAppSettings } from '../contexts/AppSettingsContext'
import { getThemeColors } from '../theme'

export default function ScreenShell({ children }) {
  const { settings } = useAppSettings()
  const colors = getThemeColors(settings.theme)

  return (
    <LinearGradient colors={[colors.bgTop, colors.bgMiddle, colors.bgBottom]} style={styles.bg}>
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
})
