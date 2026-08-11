import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useAppSettings } from '../contexts/AppSettingsContext'
import { getThemeColors, radius } from '../theme'

export default function Card({ children, style }) {
  const { settings } = useAppSettings()
  const colors = getThemeColors(settings.theme)

  return <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
})
