import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

export default function AccessNotice({ title = 'Access restricted', message = 'Your role does not allow this action.' }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff7ed',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(234, 88, 12, 0.25)',
    padding: 12,
    gap: 6,
  },
  title: {
    color: '#9a3412',
    fontWeight: '700',
    fontSize: 16,
  },
  message: {
    color: '#7c2d12',
  },
})
