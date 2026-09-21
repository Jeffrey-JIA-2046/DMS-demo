import React, { useState, useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { AnnounceContext } from '../contexts/AnnounceContext'

export default function LoginPanel({ onSuccess }) {
  const { login, logout, isAuthenticated, role, currentUser } = useContext(AuthContext)
  const { toast } = useContext(AnnounceContext)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      await login(username.trim(), password)
      setError('')
      setUsername('')
      setPassword('')
      toast && toast(`Logged in as ${username}`, { type: 'success' })
      onSuccess && onSuccess()
    } catch (err) {
      setError(err.message || 'Login failed')
      toast && toast(err.message || 'Login failed', { type: 'error' })
    }
  }

  if (isAuthenticated) {
    return (
      <div className="login-panel" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="login-info" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <small className="login-name" style={{ fontWeight: 600 }}>{currentUser?.displayName || 'Signed in'}</small>
          <small className="login-role">{role}</small>
        </div>
        <button className="ghost" onClick={() => { logout(); toast && toast('Logged out', { type: 'info' }) }}>Logout</button>
      </div>
    )
  }

  return (
    <form onSubmit={handleLogin} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="primary" type="submit">Login</button>
      {error && <small style={{ color: 'crimson' }}>{error}</small>}
    </form>
  )
}
