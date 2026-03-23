import DocumentWorkspace from './components/DocumentWorkspace'
import FunctionPanel from './components/FunctionPanel'
import AuditPanel from './components/AuditPanel'
import AuthProvider, { AuthContext } from './contexts/AuthContext'
import LoginPanel from './components/LoginPanel'
import AnnounceProvider from './contexts/AnnounceContext'
import './App.css'
import { useState, useContext, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import UserManagement from './components/UserManagement'
import UserDashboard from './components/UserDashboard'
import KnowledgeCollaboration from './components/KnowledgeCollaboration'

export default function App() {
  // HMR ping: 2026-03-10 — touch to verify Vite HMR behavior

  const [selected, setSelected] = useState('My Dashboard')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')

  // Debug: log mounts/unmounts, unloads and selection changes to diagnose unexpected reloads
  useEffect(() => {
    console.debug('App mounted')
    const onBefore = (e) => { console.debug('window beforeunload'); }
    const onUnload = (e) => { console.debug('window unload') }
    const onVis = () => { console.debug('document.visibilityState', document.visibilityState) }
    window.addEventListener('beforeunload', onBefore)
    window.addEventListener('unload', onUnload)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      console.debug('App unmounted')
      window.removeEventListener('beforeunload', onBefore)
      window.removeEventListener('unload', onUnload)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  useEffect(() => {
    console.debug('App selected changed', selected)
  }, [selected])

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme)
    } catch (e) {}
  }, [theme])

  const themeOptions = ['light','dark','compact','colorful','simple','mythological','thematic','cny','christmas']

  const previewThemes = async () => {
    const original = theme
    for (const t of themeOptions) {
      setTheme(t)
      await new Promise((r) => setTimeout(r, 700))
    }
    setTheme(original)
  }
  
  function HeaderAuth() {
    const { isAuthenticated } = useContext(AuthContext)
    return isAuthenticated ? <LoginPanel /> : <Link to="/login"><button className="primary">Sign in</button></Link>
  }

  const renderContent = () => {
    switch (selected) {
      case 'My Dashboard':
        return <UserDashboard />
      case 'Knowledge Collaboration':
        return <KnowledgeCollaboration />
      case 'System Administration':
      case 'System Auditing':
        return <AuditPanel />
      case 'User Management':
        return <UserManagement />
      default:
        return <DocumentWorkspace currentFunction={selected} />
    }
  }

  return (
    <AnnounceProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={
              <div className={`app-shell theme-${theme}`}>
                <header className="hero">
                  {theme === 'cny' && (
                    <div className="cny-decor" aria-hidden>
                      <span className="cny-item lantern">🏮</span>
                      <span className="cny-item envelope">🧧</span>
                      <span className="cny-item firework">🎆</span>
                      <span className="cny-item dragon">🐲</span>
                    </div>
                  )}
                  <div>
                    <p className="eyebrow">Document Operations</p>
                    <h1>Unified Document Management</h1>
                    <p className="hero__copy">
                      Search, review, and version important files across teams without leaving this workspace.
                      Built for compliance-heavy teams that need clarity and speed.
                    </p>
                  </div>
                  <div className="hero__cta">
                    <div className="theme-control" style={{ marginRight: 8 }}>
                      <label htmlFor="theme-select" style={{display:'flex',flexDirection:'column',gap:4}}>
                        <small className="eyebrow">Theme</small>
                        <select id="theme-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
                          <option value="light">Light</option>
                          <option value="dark">Dark</option>
                          <option value="compact">Compact</option>
                          <option value="colorful">Colorful</option>
                          <option value="simple">Simple</option>
                          <option value="mythological">Mythological</option>
                          <option value="thematic">Thematic</option>
                          <option value="cny">Chinese New Year</option>
                          <option value="christmas">Christmas</option>
                        </select>
                      </label>
                      <div style={{marginTop:6}}>
                        <button type="button" className="ghost ghost--small" onClick={previewThemes}>Preview themes</button>
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <HeaderAuth />
                    </div>
                  </div>
                </header>

                <div className="main-area">
                  <FunctionPanel selected={selected} onSelect={setSelected} />
                  <main className="main-area__content">
                    {renderContent()}
                  </main>
                </div>
              </div>
            } />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </AnnounceProvider>
  )
}
