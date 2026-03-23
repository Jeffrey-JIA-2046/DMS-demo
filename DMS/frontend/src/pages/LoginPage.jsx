import React from 'react'
import { useNavigate } from 'react-router-dom'
import LoginPanel from '../components/LoginPanel'
import '../App.css'

export default function LoginPage() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '80vh', display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ width: 440 }}>
        <h2 style={{ marginBottom: 8 }}>Sign in</h2>
        <p style={{ marginBottom: 16, color: 'var(--ink-muted)' }}>
          Use your development credentials to sign in (sysadmin/useradmin/docadmin/viewer · password: P@ssw0rd)
        </p>
        <LoginPanel onSuccess={() => navigate('/', { replace: true })} />
      </div>
    </div>
  )
}
