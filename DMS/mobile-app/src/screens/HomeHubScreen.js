import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Card from '../components/Card'
import PrimaryButton from '../components/PrimaryButton'
import ScreenShell from '../components/ScreenShell'
import { useAuth } from '../contexts/AuthContext'
import { colors } from '../theme'

export default function HomeHubScreen({ navigation }) {
  const { profile, logout } = useAuth()

  return (
    <ScreenShell>
      <Card style={styles.hero}>
        <Text style={styles.title}>Automated Smart ECM</Text>
        <Text style={styles.subtitle}>Welcome {profile?.displayName || profile?.username || 'User'}</Text>
      </Card>

      <Card style={styles.menu}>
        <Text style={styles.sectionTitle}>Modules</Text>
        <View style={styles.actions}>
          <PrimaryButton title="Documents" onPress={() => navigation.navigate('Documents')} />
          <PrimaryButton title="AI Assistant" onPress={() => navigation.navigate('AI Assistant')} />
          <PrimaryButton title="Knowledge" onPress={() => navigation.navigate('Knowledge')} />
          <PrimaryButton title="Profile" onPress={() => navigation.navigate('Profile')} />
        </View>
      </Card>

      <Card style={styles.footer}>
        <PrimaryButton title="Logout" variant="outline" onPress={logout} />
      </Card>
    </ScreenShell>
  )
}

const styles = StyleSheet.create({
  hero: {
    gap: 6,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkMuted,
  },
  menu: {
    gap: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkStrong,
  },
  actions: {
    gap: 8,
  },
  footer: {
    gap: 8,
  },
})
