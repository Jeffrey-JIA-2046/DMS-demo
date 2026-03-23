import React, { createContext, useState, useMemo, useEffect, useCallback } from 'react'

export const Roles = Object.freeze({
  SYS_ADMIN: 'System administrator',
  USER_ADMIN: 'User administrator',
  DOC_ADMIN: 'Document administrator',
  DOC_VIEWER: 'Document Viewer',
})

const defaultRole = Roles.DOC_VIEWER
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
    'Workspace Management': role === Roles.SYS_ADMIN,
    'System Administration': role === Roles.SYS_ADMIN,
    'User Management': role === Roles.SYS_ADMIN,
    'Document Management': [Roles.SYS_ADMIN, Roles.USER_ADMIN, Roles.DOC_ADMIN, Roles.DOC_VIEWER].includes(role),
    'Knowledge Collaboration': [Roles.SYS_ADMIN, Roles.USER_ADMIN, Roles.DOC_ADMIN, Roles.DOC_VIEWER].includes(role),
    'System Auditing': [Roles.SYS_ADMIN, Roles.USER_ADMIN].includes(role),
    'Reports': [Roles.SYS_ADMIN, Roles.USER_ADMIN].includes(role),
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

  const hydrateProfile = async (token) => {
    const response = await fetch('/api/me', {
      headers: {
        Authorization: `Basic ${token}`,
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
