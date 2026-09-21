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
import ReportsManagement from './components/ReportsManagement'
import RetentionManagement from './components/RetentionManagement'
import ReminderManagement from './components/ReminderManagement'
import JobManagement from './components/JobManagement'
import CodeTableManagement from './components/CodeTableManagement'
import WorkflowDesigner from './components/WorkflowDesigner'
import EformDesigner from './components/EformDesigner'

function SystemAdministration() {
  const [adminTab, setAdminTab] = useState('retention')
  return (
    <div>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'retention', label: 'Retention Management' },
          { key: 'reminder', label: 'Reminder Management' },
          { key: 'jobs', label: 'Job Management' },
          { key: 'codetable', label: 'Code Table Management' },
          { key: 'workflow', label: 'Workflow Designer' },
          { key: 'eform', label: 'eForm Designer' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`ghost ${adminTab === tab.key ? 'is-active' : ''}`}
            onClick={() => setAdminTab(tab.key)}
            style={{ fontWeight: adminTab === tab.key ? 700 : 400 }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {adminTab === 'retention' && <RetentionManagement />}
      {adminTab === 'reminder' && <ReminderManagement />}
      {adminTab === 'jobs' && <JobManagement />}
      {adminTab === 'codetable' && <CodeTableManagement />}
      {adminTab === 'workflow' && <WorkflowDesigner />}
      {adminTab === 'eform' && <EformDesigner />}
    </div>
  )
}

export default function App() {
  // HMR ping: 2026-03-10 — touch to verify Vite HMR behavior

  const themeOptions = ['light','colorful','simple','mythological','thematic','cny','christmas']

  const [selected, setSelected] = useState('My Dashboard')
  const [knowledgeSearchContext, setKnowledgeSearchContext] = useState(null)
  const [documentNavigationContext, setDocumentNavigationContext] = useState(null)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    return themeOptions.includes(saved) ? saved : 'light'
  })

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const params = new URLSearchParams(window.location.search || '')
    const linkedDocumentId = (params.get('documentId') || '').trim()
    if (!linkedDocumentId) {
      return
    }

    setDocumentNavigationContext({
      documentId: linkedDocumentId,
      stamp: Date.now(),
    })
    setSelected('Document Management')
  }, [])

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
        return (
          <UserDashboard
            onOpenFavorite={(context) => {
              if (!context || (!context.documentId && !context.folderId)) {
                return
              }
              setDocumentNavigationContext({
                documentId: context.documentId ? String(context.documentId) : '',
                folderId: context.folderId ? String(context.folderId) : '',
                stamp: Date.now(),
              })
              setSelected('Document Management')
            }}
          />
        )
      case 'Knowledge Collaboration':
        return (
          <KnowledgeCollaboration
            navigationContext={knowledgeSearchContext}
            onOpenLinkedDocument={(documentId) => {
              setDocumentNavigationContext({
                documentId: String(documentId),
                stamp: Date.now(),
              })
              setSelected('Document Management')
            }}
          />
        )
      case 'System Administration':
        return <SystemAdministration />
      case 'System Auditing':
        return <AuditPanel />
      case 'User Management':
        return <UserManagement />
      case 'Reports':
        return <ReportsManagement />
      default:
        return (
          <DocumentWorkspace
            currentFunction={selected}
            navigationContext={documentNavigationContext}
            onFindRelatedTopics={(document) => {
              setKnowledgeSearchContext({
                documentId: document?.id != null ? String(document.id) : '',
                title: document?.title || '',
                description: document?.description || '',
                stamp: Date.now(),
              })
              setSelected('Knowledge Collaboration')
            }}
          />
        )
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
                    <h1>Automated Smart ECM</h1>
                    <p className="hero__copy">
                      AI driven, centralize documents and team knowledge in one secure workspace
                    </p>
                  </div>
                  <div className="hero__cta">
                    <div className="theme-control" style={{ marginRight: 8 }}>
                      <label htmlFor="theme-select" style={{display:'flex',flexDirection:'column',gap:4}}>
                        <small className="eyebrow">Theme</small>
                        <select id="theme-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
                          <option value="light">Light</option>
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
