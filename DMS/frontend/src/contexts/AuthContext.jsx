import React, { createContext, useState, useMemo, useEffect, useCallback } from 'react'
import { authHeaders, getClientSessionId } from '../api/httpClient'

export const Roles = Object.freeze({
  ROOT: 'Root administrator',
  SYS_ADMIN: 'System administrator',
  USER_ADMIN: 'User administrator',
  DOC_ADMIN: 'Document administrator',
  DOC_VIEWER: 'Document Viewer',
})

const defaultRole = Roles.DOC_VIEWER
const roleLabelMap = Object.freeze({
  ROOT: Roles.ROOT,
  SYS_ADMIN: Roles.SYS_ADMIN,
  USER_ADMIN: Roles.USER_ADMIN,
  DOC_ADMIN: Roles.DOC_ADMIN,
  DOC_VIEWER: Roles.DOC_VIEWER,
})

const documentPermissionsForRole = (role) => {
  switch (role) {
    case Roles.ROOT:
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

export const AuthContext = createContext({
  role: defaultRole,
  setRole: () => {},
  functionsAccess: {},
  documentPermissions: {},
  setDocumentPermissionsOverride: () => {},
  login: async () => {},
  logout: () => {},
  authToken: null,
  currentUser: null,
})

export function AuthProvider({ children }) {
  const [role, setRole] = useState(() => {
    try {
      return localStorage.getItem('dms_role') || defaultRole
    } catch (e) {
      return defaultRole
    }
  })

  const [authToken, setAuthToken] = useState(() => {
    try {
      return localStorage.getItem('dms_auth') || null
    } catch (e) {
      return null
    }
  })

  const [currentUser, setCurrentUser] = useState(null)

  const functionsAccess = useMemo(() => ({
    'My Dashboard': true,
    'System Administration': [Roles.ROOT, Roles.SYS_ADMIN].includes(role),
    'User Management': [Roles.ROOT, Roles.SYS_ADMIN, Roles.USER_ADMIN].includes(role),
    'Document Management': [Roles.ROOT, Roles.SYS_ADMIN, Roles.USER_ADMIN, Roles.DOC_ADMIN, Roles.DOC_VIEWER].includes(role),
    'Knowledge Collaboration': [Roles.ROOT, Roles.SYS_ADMIN, Roles.USER_ADMIN, Roles.DOC_ADMIN, Roles.DOC_VIEWER].includes(role),
    'System Auditing': [Roles.ROOT, Roles.SYS_ADMIN, Roles.USER_ADMIN].includes(role),
    'Reports': [Roles.ROOT, Roles.SYS_ADMIN, Roles.USER_ADMIN].includes(role),
  }), [role])

  const [documentPermissions, setDocumentPermissions] = useState(() => documentPermissionsForRole(role))

  useEffect(() => {
    setDocumentPermissions(documentPermissionsForRole(role))
  }, [role])

  const setDocumentPermissionsOverride = useCallback((overrides) => {
    if (!overrides) {
      setDocumentPermissions(documentPermissionsForRole(role))
      return
    }
    setDocumentPermissions({
      read: !!overrides.read,
      write: !!overrides.write,
      delete: !!overrides.delete,
    })
  }, [role])

  const setRoleAndPersist = (next) => {
    setRole(next)
    try {
      localStorage.setItem('dms_role', next)
    } catch (e) {
      // ignore
    }
  }

  const resolveAuthErrorMessage = async (response) => {
    let backendMessage = ''
    try {
      const payload = await response.json()
      backendMessage = typeof payload?.error === 'string' ? payload.error.trim() : ''
    } catch (e) {
      // ignore parse failures and fallback to status based message
    }

    if (backendMessage) {
      return backendMessage
    }

    if (response.status === 401) {
      return 'Invalid username or password'
    }
    if (response.status === 403) {
      return 'Login temporarily blocked. Please retry later.'
    }
    return 'Login failed. Please try again.'
  }

  const hydrateProfile = async (token) => {
    const response = await fetch('/api/me', {
      headers: {
        ...authHeaders(),
        Authorization: `Basic ${token}`,
        'X-Client-Session-Id': getClientSessionId(),
      },
    })
    if (!response.ok) {
      throw new Error(await resolveAuthErrorMessage(response))
    }
    const profile = await response.json()
    const resolvedRole = roleLabelMap[profile.role]
    if (!resolvedRole) {
      throw new Error('Unsupported role')
    }
    setRoleAndPersist(resolvedRole)
    setCurrentUser(profile)
  }

  const login = async (username, password) => {
    const token = btoa(`${username}:${password}`)
    await hydrateProfile(token)
    try {
      localStorage.setItem('dms_auth', token)
    } catch (e) {
      // ignore
    }
    setAuthToken(token)
  }

  const logout = () => {
    try {
      localStorage.setItem('dms_last_logout_at', new Date().toISOString())
    } catch (e) {}
    try {
      localStorage.removeItem('dms_auth')
    } catch (e) {}
    try {
      localStorage.removeItem('dms_role')
    } catch (e) {}
    setAuthToken(null)
    setCurrentUser(null)
    setRole(defaultRole)
  }

  useEffect(() => {
    const bootstrap = async () => {
      if (!authToken) return
      try {
        await hydrateProfile(authToken)
      } catch (err) {
        logout()
      }
    }
    bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  return (
    <AuthContext.Provider value={{
      role,
      setRole: setRoleAndPersist,
      functionsAccess,
      documentPermissions,
      setDocumentPermissionsOverride,
      login,
      logout,
      authToken,
      isAuthenticated: !!authToken,
      currentUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthProvider
