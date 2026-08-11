import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { useAppSettings } from '../contexts/AppSettingsContext'
import { getThemeColors, radius } from '../theme'

export default function PrimaryButton({ title, onPress, loading, disabled, variant = 'solid' }) {
  const { settings } = useAppSettings()
  const colors = getThemeColors(settings.theme)
  const inactive = disabled || loading
  const style = variant === 'outline'
    ? [styles.outline, { borderColor: colors.accent }]
    : [styles.solid, { backgroundColor: colors.accent }]
  const textStyle = variant === 'outline'
    ? [styles.outlineText, { color: colors.accent }]
    : styles.solidText

  return (
    <Pressable onPress={onPress} disabled={inactive} style={[styles.base, ...style, inactive && styles.disabled]}>
      {loading ? <ActivityIndicator color={variant === 'outline' ? colors.accent : '#fff'} /> : <Text style={textStyle}>{title}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  solid: {
    backgroundColor: '#2563eb',
  },
  outline: {
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#fff',
  },
  solidText: {
    color: '#fff',
    fontWeight: '600',
  },
  outlineText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.55,
  },
})
