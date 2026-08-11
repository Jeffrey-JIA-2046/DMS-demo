import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Buffer } from 'buffer'
import { clearMany, keys, readJson, writeJson } from '../utils/storage'
import { resolveApiUrl, handleJsonResponse } from '../api/httpClient'

const AuthContext = createContext(null)

const roleLabelMap = Object.freeze({
  SYS_ADMIN: 'System administrator',
  USER_ADMIN: 'User administrator',
  DOC_ADMIN: 'Document administrator',
  DOC_VIEWER: 'Document Viewer',
})

const invertRoleLabel = (roleLabel) => {
  const match = Object.entries(roleLabelMap).find(([, label]) => label === roleLabel)
  return match ? match[0] : 'DOC_VIEWER'
}

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const bootstrap = useCallback(async () => {
    const rememberLogin = await readJson(keys.rememberLogin, false)
    if (!rememberLogin) {
      await clearMany([keys.auth, keys.me, keys.role])
      setAuthToken(null)
      setProfile(null)
      setLoading(false)
      return
    }

    const token = await readJson(keys.auth)
    const me = await readJson(keys.me)
    if (token) {
      setAuthToken(token)
      if (me) {
        setProfile(me)
      } else {
        try {
          const response = await fetch(resolveApiUrl('/api/me'), {
            headers: { Authorization: `Basic ${token}` },
          })
          const data = await handleJsonResponse(response)
          setProfile(data)
          await writeJson(keys.me, data)
        } catch {
          await clearMany([keys.auth, keys.me, keys.role])
          setAuthToken(null)
          setProfile(null)
        }
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  const login = useCallback(async (username, password, rememberLogin = false) => {
    const token = Buffer.from(`${username}:${password}`).toString('base64')
    const response = await fetch(resolveApiUrl('/api/me'), {
      headers: { Authorization: `Basic ${token}` },
    })
    const data = await handleJsonResponse(response)

    if (rememberLogin) {
      await writeJson(keys.auth, token)
      await writeJson(keys.me, data)
      await writeJson(keys.role, invertRoleLabel(data.role))
    } else {
      await clearMany([keys.auth, keys.me, keys.role])
    }
    await writeJson(keys.rememberLogin, rememberLogin)

    setAuthToken(token)
    setProfile(data)
  }, [])

  const logout = useCallback(async () => {
    await writeJson(keys.lastLogoutAt, new Date().toISOString())
    await clearMany([keys.auth, keys.me, keys.role, keys.rememberLogin])
    setAuthToken(null)
    setProfile(null)
  }, [])

  const value = useMemo(() => ({
    authToken,
    profile,
    roleLabel: profile?.role || roleLabelMap.DOC_VIEWER,
    isAuthenticated: !!authToken,
    loading,
    login,
    logout,
  }), [authToken, profile, loading, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
