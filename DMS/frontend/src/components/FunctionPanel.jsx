import React, { useContext, useEffect } from 'react'
import { AuthContext } from '../contexts/AuthContext'

const FUNCTIONS = [
  'My Dashboard',
  'System Administration',
  'User Management',
  'Document Management',
  'Knowledge Collaboration',
  'System Auditing',
]

export default function FunctionPanel({ selected, onSelect }) {
  const { functionsAccess } = useContext(AuthContext)
  const availableFunctions = FUNCTIONS.filter((fn) => functionsAccess[fn])

  useEffect(() => {
    if (!functionsAccess[selected] && availableFunctions.length && onSelect) {
      onSelect(availableFunctions[0])
    }
  }, [availableFunctions, functionsAccess, onSelect, selected])

  const ICONS = {
    'My Dashboard': '🏠',
    'System Administration': '🔧',
    'User Management': '👥',
    'Document Management': '📄',
    'Knowledge Collaboration': '🧠',
    'System Auditing': '📋',
    'Reports': '📊',
  }

  return (
    <aside className="function-panel card">
      <div className="function-panel__header">
        <h3>Functions</h3>
      </div>

      <nav className="function-panel__nav">
        {availableFunctions.map((fn) => {
          return (
            <button
              type="button"
               key={fn}
               className={`function-panel__item ${selected === fn ? 'is-active' : ''}`}
               onClick={(e) => {
                 e.preventDefault()
                 e.stopPropagation()
                 if (onSelect) {
                   console.debug('FunctionPanel: selecting', fn)
                   onSelect(fn)
                 }
               }}
            >
              <span className="function-icon" aria-hidden="true">{ICONS[fn] || '⚙️'}</span>
              <span>{fn}</span>
            </button>
          )
        })}
      </nav>

      <footer className="function-panel__footer" aria-label="Function panel footer">
        <a
          className="function-panel__shortcut"
          href="/user-manual.html"
          target="_blank"
          rel="noreferrer"
        >
          User Help Manual
        </a>
        <a
          className="function-panel__shortcut"
          href="/system-admin-manual.html"
          target="_blank"
          rel="noreferrer"
        >
          Administration Manual
        </a>
        <div className="function-panel__divider" />
        <small className="function-panel__copyright">Copyright (c) 2026 Automated Smart ECM</small>
      </footer>
    </aside>
  )
}
