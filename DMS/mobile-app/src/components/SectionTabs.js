import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

export default function SectionTabs({ value, onChange, options }) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((option) => {
          const active = option.value === value
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 6,
  },
  row: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  chipText: {
    color: '#475569',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#1d4ed8',
  },
})
