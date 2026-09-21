import React from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import HomeHubScreen from '../screens/HomeHubScreen'
import DashboardScreen from '../screens/DashboardScreen'
import DocumentsScreen from '../screens/DocumentsScreen'
import DocumentDetailScreen from '../screens/DocumentDetailScreen'
import AIAssistantScreen from '../screens/AIAssistantScreen'
import KnowledgeScreen from '../screens/KnowledgeScreen'
import LoginScreen from '../screens/LoginScreen'
import ProfileScreen from '../screens/ProfileScreen'
import { useAuth } from '../contexts/AuthContext'
import { colors } from '../theme'

const Stack = createNativeStackNavigator()

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#f8fafc',
    card: '#ffffff',
    text: colors.inkStrong,
    primary: colors.accent,
    border: '#e2e8f0',
  },
}

function Splash() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc' }}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ color: colors.inkMuted }}>Loading...</Text>
    </View>
  )
}

export default function AppNavigator() {
  const { isAuthenticated, loading } = useAuth()

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator>
        {loading ? (
          <Stack.Screen name="Splash" component={Splash} options={{ headerShown: false }} />
        ) : isAuthenticated ? (
          <>
            <Stack.Screen name="Home" component={HomeHubScreen} options={{ headerShown: false }} />
            <Stack.Screen name="My Dashboard" component={DashboardScreen} options={{ title: 'My Dashboard' }} />
            <Stack.Screen name="Documents" component={DocumentsScreen} options={{ title: 'Documents' }} />
            <Stack.Screen name="AI Assistant" component={AIAssistantScreen} options={{ title: 'AI Assistant' }} />
            <Stack.Screen name="Knowledge" component={KnowledgeScreen} options={{ title: 'Knowledge' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
            <Stack.Screen name="DocumentDetail" component={DocumentDetailScreen} options={{ title: 'Document Details' }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
