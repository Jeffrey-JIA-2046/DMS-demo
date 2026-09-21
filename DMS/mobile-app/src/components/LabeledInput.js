import React from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { colors, radius } from '../theme'

export default function LabeledInput({ label, value, onChangeText, placeholder, secureTextEntry, multiline = false }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        secureTextEntry={secureTextEntry}
        multiline={multiline}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkStrong,
  },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    color: colors.inkStrong,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
})
