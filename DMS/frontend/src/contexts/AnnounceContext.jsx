import React, { createContext, useCallback, useState, useRef, useEffect } from 'react'

export const AnnounceContext = createContext({ announce: (msg) => {}, toast: (msg, opts) => {}, dismissToast: (id) => {} })

export function AnnounceProvider({ children }) {
  const [message, setMessage] = useState('')
  const timeoutRef = useRef(null)

  const [toasts, setToasts] = useState([])
  const toastsRef = useRef(toasts)
  useEffect(() => {
    toastsRef.current = toasts
  }, [toasts])

  const announce = useCallback((msg, clearAfter = 3000) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setMessage(msg)
    if (clearAfter > 0) {
      timeoutRef.current = setTimeout(() => setMessage(''), clearAfter)
    }
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((text, { type = 'info', timeout = 4000 } = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const t = { id, text, type }
    setToasts((prev) => [t, ...prev])
    if (timeout > 0) {
      setTimeout(() => {
        setToasts((curr) => curr.filter((x) => x.id !== id))
      }, timeout)
    }
    return id
  }, [])

  // Confirm modal support: returns a Promise<boolean>
  const [confirmState, setConfirmState] = useState(null)

  const confirm = useCallback((message, { title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel' } = {}) => {
    return new Promise((resolve) => {
      setConfirmState({ message, title, confirmText, cancelText, resolve })
    })
  }, [])

  const handleConfirm = useCallback((value) => {
    if (!confirmState) return
    try {
      confirmState.resolve(!!value)
    } finally {
      setConfirmState(null)
    }
  }, [confirmState])

  return (
    <AnnounceContext.Provider value={{ announce, toast, dismissToast, toasts, confirm }}>
      {children}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
        {message}
      </div>

      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} role="status">
            <div className="toast__message">{t.text}</div>
            <button className="toast__close" aria-label="Close" onClick={() => dismissToast(t.id)}>✕</button>
          </div>
        ))}
      </div>
      {confirmState && (
        <div className="confirm-modal__backdrop">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h3 id="confirm-title">{confirmState.title}</h3>
            <p style={{ marginTop: 8 }}>{confirmState.message}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="ghost" onClick={() => handleConfirm(false)}>{confirmState.cancelText}</button>
              <button className="primary" onClick={() => handleConfirm(true)}>{confirmState.confirmText}</button>
            </div>
          </div>
        </div>
      )}
    </AnnounceContext.Provider>
  )
}

export default AnnounceProvider
