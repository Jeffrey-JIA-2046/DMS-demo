import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Card from '../components/Card'
import PrimaryButton from '../components/PrimaryButton'
import ScreenShell from '../components/ScreenShell'
import { useAuth } from '../contexts/AuthContext'
import { colors } from '../theme'

export default function ProfileScreen() {
  const { profile, roleLabel, logout } = useAuth()

  return (
    <ScreenShell>
      <Card style={styles.panel}>
        <Text style={styles.title}>My Profile</Text>
        <Text style={styles.line}>Name: {profile?.displayName || profile?.username || 'N/A'}</Text>
        <Text style={styles.line}>Role: {profile?.role || roleLabel || 'N/A'}</Text>
        <Text style={styles.line}>Email: {profile?.email || 'N/A'}</Text>
        <View style={styles.logoutWrap}>
          <PrimaryButton title="Logout" onPress={logout} />
        </View>
      </Card>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  panel: {
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.inkStrong,
    marginBottom: 4,
  },
  line: {
    color: colors.inkMuted,
    fontSize: 14,
  },
  logoutWrap: {
    marginTop: 12,
  },
})
