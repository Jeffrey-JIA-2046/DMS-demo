import 'react-native-gesture-handler'
import React, { useContext } from 'react'
import { Buffer } from 'buffer'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { AuthContext, AuthProvider } from './src/contexts/AuthContext'
import LoginScreen from './src/screens/LoginScreen'
import DocumentsScreen from './src/screens/DocumentsScreen'
import KnowledgeScreen from './src/screens/KnowledgeScreen'
import DashboardScreen from './src/screens/DashboardScreen'

global.Buffer = global.Buffer || Buffer

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function MainTabs() {
  const { functionsAccess } = useContext(AuthContext)

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: 'rgba(15, 23, 42, 0.08)',
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      {functionsAccess['Document Management'] && <Tab.Screen name="Documents" component={DocumentsScreen} />}
      {functionsAccess['Knowledge Collaboration'] && <Tab.Screen name="Knowledge" component={KnowledgeScreen} />}
      <Tab.Screen name="My Dashboard" component={DashboardScreen} />
    </Tab.Navigator>
  )
}

function AppNavigator() {
  const { isAuthenticated, loading } = useContext(AuthContext)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? <Stack.Screen name="Login" component={LoginScreen} /> : <Stack.Screen name="Main" component={MainTabs} />}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
