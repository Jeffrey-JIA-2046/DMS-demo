import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { Buffer } from 'buffer'
import {
  clearSession,
  getStoredApiBaseUrl,
  getToken,
  resolveApiUrl,
  setStoredApiBaseUrl,
  setToken,
} from '../api/httpClient'

export const Roles = Object.freeze({
  SYS_ADMIN: 'System administrator',
  USER_ADMIN: 'User administrator',
  DOC_ADMIN: 'Document administrator',
  DOC_VIEWER: 'Document Viewer',
})

const DEFAULT_ROLE = Roles.DOC_VIEWER

const roleLabelMap = Object.freeze({
  SYS_ADMIN: Roles.SYS_ADMIN,
  USER_ADMIN: Roles.USER_ADMIN,
  DOC_ADMIN: Roles.DOC_ADMIN,
  DOC_VIEWER: Roles.DOC_VIEWER,
})

const documentPermissionsForRole = (role) => {
  switch (role) {
    case Roles.SYS_ADMIN:
    case Roles.USER_ADMIN:
      return { read: true, write: true, delete: true }
    case Roles.DOC_ADMIN:
      return { read: true, write: true, delete: false }
    case Roles.DOC_VIEWER:
      return { read: true, write: false, delete: false }
    default:
      return { read: false, write: false, delete: false }
  }
}

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(null)
  const [username, setUsername] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [role, setRole] = useState(DEFAULT_ROLE)
  const [currentUser, setCurrentUser] = useState(null)
  const [documentPermissions, setDocumentPermissions] = useState(documentPermissionsForRole(DEFAULT_ROLE))
  const [loading, setLoading] = useState(true)

  const functionsAccess = useMemo(() => ({
    'My Dashboard': true,
    'System Administration': role === Roles.SYS_ADMIN,
    'User Management': role === Roles.SYS_ADMIN,
    'Document Management': [Roles.SYS_ADMIN, Roles.USER_ADMIN, Roles.DOC_ADMIN, Roles.DOC_VIEWER].includes(role),
    'Knowledge Collaboration': [Roles.SYS_ADMIN, Roles.USER_ADMIN, Roles.DOC_ADMIN, Roles.DOC_VIEWER].includes(role),
    'System Auditing': [Roles.SYS_ADMIN, Roles.USER_ADMIN].includes(role),
    Reports: [Roles.SYS_ADMIN, Roles.USER_ADMIN].includes(role),
  }), [role])

  useEffect(() => {
    setDocumentPermissions(documentPermissionsForRole(role))
  }, [role])

  const hydrateProfile = useCallback(async (authToken) => {
    const url = await resolveApiUrl('/api/me')
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${authToken}`,
      },
    })
    if (!response.ok) {
      throw new Error('Invalid username or password')
    }
    const profile = await response.json()
    const resolvedRole = roleLabelMap[profile.role]
    if (!resolvedRole) {
      throw new Error('Unsupported role')
    }
    setRole(resolvedRole)
    setCurrentUser(profile)
    setUsername(profile.username || profile.displayName || '')
    return profile
  }, [])

  useEffect(() => {
    const bootstrap = async () => {
      const [storedToken, base] = await Promise.all([getToken(), getStoredApiBaseUrl()])
      setTokenState(storedToken)
      setApiBaseUrl(base)
      if (storedToken) {
        try {
          await hydrateProfile(storedToken)
        } catch {
          await clearSession()
          setTokenState(null)
          setRole(DEFAULT_ROLE)
          setCurrentUser(null)
        }
      }
      setLoading(false)
    }
    bootstrap()
  }, [hydrateProfile])

  const login = useCallback(async (nextUsername, password) => {
    const basic = Buffer.from(`${nextUsername}:${password}`).toString('base64')
    try {
      await hydrateProfile(basic)
      await setToken(basic)
      setTokenState(basic)
      setUsername(nextUsername)
    } catch (err) {
      await clearSession()
      setTokenState(null)
      setRole(DEFAULT_ROLE)
      setCurrentUser(null)
      throw err
    }
  }, [hydrateProfile])

  const logout = useCallback(async () => {
    await clearSession()
    setTokenState(null)
    setUsername('')
    setRole(DEFAULT_ROLE)
    setCurrentUser(null)
  }, [])

  const updateApiBaseUrl = useCallback(async (value) => {
    const next = await setStoredApiBaseUrl(value)
    setApiBaseUrl(next)
  }, [])

  const value = useMemo(() => ({
    token,
    username,
    apiBaseUrl,
    role,
    currentUser,
    functionsAccess,
    documentPermissions,
    loading,
    isAuthenticated: Boolean(token),
    login,
    logout,
    setApiBaseUrl: updateApiBaseUrl,
  }), [
    token,
    username,
    apiBaseUrl,
    role,
    currentUser,
    functionsAccess,
    documentPermissions,
    loading,
    login,
    logout,
    updateApiBaseUrl,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
