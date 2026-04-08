import React from 'react'
import { useNavigate } from 'react-router-dom'
import LoginPanel from '../components/LoginPanel'
import '../App.css'

export default function LoginPage() {
  const navigate = useNavigate()

  return (
    <div className="login-page-shell">
      <div className="card login-page-panel">
        <div className="login-page-titlebar">Knowledge Base</div>
        <h2 style={{ marginBottom: 8 }}>Sign in</h2>
        <p className="login-page-description">login with your windows account</p>
        <LoginPanel onSuccess={() => navigate('/', { replace: true })} />
      </div>
    </div>
  )
}
