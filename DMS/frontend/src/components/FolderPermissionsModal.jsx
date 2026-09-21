import React from 'react'

const permissionKeys = [
  { key: 'canRead', label: 'Read' },
  { key: 'canWrite', label: 'Write' },
  { key: 'canDelete', label: 'Delete' },
]

export default function FolderPermissionsModal({
  folderName,
  entries = [],
  loading,
  error,
  saving,
  onClose,
  onSave,
  onToggle,
}) {
  const handleToggle = (groupId, key, value) => {
    if (typeof onToggle === 'function') {
      onToggle(groupId, key, value)
    }
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="folder-permissions-title">
      <div className="modal-layer__backdrop" onClick={onClose} />
      <div className="modal-layer__content folder-permissions-modal">
        <div className="modal-layer__header">
          <div>
            <p className="eyebrow">Workspace security</p>
            <h3 id="folder-permissions-title">
              Permissions · <span className="folder-permissions__name"><span className="folder-permissions__icon" aria-hidden>📁</span>{folderName || 'Folder'}</span>
            </h3>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {loading ? (
          <p className="pill pill--info">Loading permissions…</p>
        ) : entries.length ? (
          <div className="permissions-matrix" role="region" aria-live="polite">
            <div className="permissions-matrix__header">
              <span>Group</span>
              {permissionKeys.map((item) => (
                <span key={item.key}>{item.label}</span>
              ))}
            </div>
            <ul className="permissions-matrix__list">
              {entries.map((entry) => (
                <li key={entry.groupId} className="permissions-matrix__row">
                  <div className="permissions-matrix__group">
                    <strong>{entry.groupName}</strong>
                    {entry.groupDescription && <span>{entry.groupDescription}</span>}
                  </div>
                  {permissionKeys.map((item) => (
                    <label key={item.key} className="permission-toggle">
                      <input
                        type="checkbox"
                        checked={entry[item.key]}
                        onChange={(event) => handleToggle(entry.groupId, item.key, event.target.checked)}
                        disabled={saving || loading}
                        aria-label={`${item.label} permission for ${entry.groupName}`}
                      />
                    </label>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="empty-state">No groups available yet. Create a user group to assign permissions.</p>
        )}
        {error && <p className="feedback feedback--error">{error}</p>}
        <div className="modal-layer__actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={saving || loading || !entries.length} onClick={onSave}>
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
        </div>
      </div>
    </div>
  )
}
