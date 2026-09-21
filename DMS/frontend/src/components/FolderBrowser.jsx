import { useEffect, useMemo, useState } from 'react'
import FolderTree from './FolderTree'
import MetadataTemplateBuilder from './MetadataTemplateBuilder'
import { findFolderNode, findFolderPath } from '../utils/folders'
import { validateMetadataTemplate } from '../utils/metadataTemplate'

const flattenFolders = (nodes = [], trail = []) => {
  const entries = []
  nodes.forEach((node) => {
    const nextTrail = [...trail, node.name]
    entries.push({ id: node.id, path: nextTrail })
    if (node.children?.length) {
      entries.push(...flattenFolders(node.children, nextTrail))
    }
  })
  return entries
}

const collectDescendantIds = (node) => {
  const ids = []
  if (!node?.children?.length) {
    return ids
  }
  const walk = (children) => {
    children.forEach((child) => {
      ids.push(child.id)
      if (child.children?.length) {
        walk(child.children)
      }
    })
  }
  walk(node.children)
  return ids
}

const permissionKeys = [
  { key: 'canRead', label: 'Read' },
  { key: 'canWrite', label: 'Write' },
  { key: 'canDelete', label: 'Delete' },
]

export default function FolderBrowser({
  nodes = [],
  loading,
  error,
  busy,
  selectedId,
  onSelect,
  onClear,
  onRefresh,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  draggingDocumentId,
  onDocumentDrop,
  canManagePermissions = false,
  onLoadPermissionTemplate,
  onLoadFolderPermissions,
  cardClassName = '',
  cardStyle,
  onCardDragOver,
  onCardDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardResizeStart,
  cardDragging = false,
  cardResizing = false,
}) {
  const [modalMode, setModalMode] = useState(null)
  const [name, setName] = useState('')
  const [nestUnderSelection, setNestUnderSelection] = useState(false)
  const [inheritMetadataTemplate, setInheritMetadataTemplate] = useState(false)
  const [templateFields, setTemplateFields] = useState([])
  const [templateError, setTemplateError] = useState('')
  const [editingFolder, setEditingFolder] = useState(null)
  const [editParentId, setEditParentId] = useState(null)
  const [modalPermissions, setModalPermissions] = useState([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)

  const selectionPath = useMemo(() => findFolderPath(nodes, selectedId), [nodes, selectedId])
  const selectedFolder = useMemo(() => findFolderNode(nodes, selectedId), [nodes, selectedId])
  const selectedTemplate = selectedFolder?.metadataTemplate ?? []
  const isModalOpen = modalMode != null

  useEffect(() => {
    if (!selectedId) {
      setNestUnderSelection(false)
    }
  }, [selectedId])

  useEffect(() => {
    if (!isModalOpen) {
      setTemplateFields([])
      setTemplateError('')
      setName('')
      setNestUnderSelection(false)
      setInheritMetadataTemplate(false)
      setEditParentId(null)
      setModalPermissions([])
      setPermissionsLoading(false)
    }
  }, [isModalOpen])

  useEffect(() => {
    let cancelled = false

    const loadPermissions = async () => {
      if (!isModalOpen || !canManagePermissions) {
        return
      }
      setPermissionsLoading(true)
      try {
        if (modalMode === 'edit' && editingFolder?.id && typeof onLoadFolderPermissions === 'function') {
          const data = await onLoadFolderPermissions(editingFolder.id)
          if (!cancelled) {
            setModalPermissions(Array.isArray(data?.permissions) ? data.permissions : [])
          }
          return
        }
        if (modalMode === 'create' && typeof onLoadPermissionTemplate === 'function') {
          const data = await onLoadPermissionTemplate()
          if (!cancelled) {
            setModalPermissions(Array.isArray(data?.permissions) ? data.permissions : [])
          }
          return
        }
        if (!cancelled) {
          setModalPermissions([])
        }
      } catch (err) {
        if (!cancelled) {
          setTemplateError(err.message || 'Failed to load folder permissions')
          setModalPermissions([])
        }
      } finally {
        if (!cancelled) {
          setPermissionsLoading(false)
        }
      }
    }

    loadPermissions()

    return () => {
      cancelled = true
    }
  }, [isModalOpen, canManagePermissions, modalMode, editingFolder?.id, onLoadFolderPermissions, onLoadPermissionTemplate])

  const flatFolderList = useMemo(() => flattenFolders(nodes), [nodes])

  const editDisallowedIds = useMemo(() => {
    if (modalMode !== 'edit' || !editingFolder) {
      return new Set()
    }
    const node = findFolderNode(nodes, editingFolder.id)
    if (!node) {
      return new Set([editingFolder.id])
    }
    const blocked = new Set([editingFolder.id, ...collectDescendantIds(node)])
    return blocked
  }, [modalMode, editingFolder, nodes])

  const editParentOptions = useMemo(() => {
    if (modalMode !== 'edit') {
      return []
    }
    return flatFolderList
      .filter((entry) => !editDisallowedIds.has(entry.id))
      .map((entry) => ({ id: entry.id, label: entry.path.join(' / ') }))
  }, [flatFolderList, editDisallowedIds, modalMode])

  const handleSubmit = async () => {
    if (!name.trim()) {
      setTemplateError('Folder name is required')
      return
    }
    const { valid, error: metaError, normalized } = validateMetadataTemplate(templateFields)
    if (!valid) {
      setTemplateError(metaError)
      return
    }
    setTemplateError('')
    const parentId =
      modalMode === 'edit'
        ? editParentId ?? null
        : nestUnderSelection && selectedId
          ? selectedId
          : null
    const shouldInheritTemplate = modalMode !== 'edit' && inheritMetadataTemplate && Boolean(parentId)
    const payload = {
      name: name.trim(),
      parentId,
      metadataTemplate: shouldInheritTemplate ? [] : normalized,
      inheritMetadataTemplateFromParent: shouldInheritTemplate,
      permissionEntries: canManagePermissions ? modalPermissions : undefined,
    }
    try {
      if (modalMode === 'edit') {
        if (editingFolder?.id && onUpdateFolder) {
          await onUpdateFolder(editingFolder.id, payload)
        }
      } else {
        await onCreateFolder(payload)
      }
      setModalMode(null)
    } catch (err) {
      // error surfaced via parent-provided error prop
    }
  }

  const openCreateModal = () => {
    setEditingFolder(null)
    setTemplateFields([])
    setTemplateError('')
    setName('')
    setNestUnderSelection(Boolean(selectedId))
    setInheritMetadataTemplate(Boolean(selectedId))
    setEditParentId(null)
    setModalMode('create')
  }

  const openEditModal = () => {
    if (!selectedFolder || !onUpdateFolder) {
      return
    }
    setEditingFolder({
      id: selectedFolder.id,
      parentId: selectedFolder.parentId ?? null,
      path: selectionPath ? [...selectionPath] : [selectedFolder.name],
    })
    setName(selectedFolder.name ?? '')
    setTemplateFields(selectedTemplate.map((field) => ({ ...field })))
    setTemplateError('')
    setEditParentId(selectedFolder.parentId ?? null)
    setModalMode('edit')
  }

  const handleDelete = async () => {
    if (!selectedFolder || !onDeleteFolder) {
      return
    }
    const confirmed = window.confirm(`Delete folder "${selectedFolder.name}"? This only works when the folder has no subfolders and no documents.`)
    if (!confirmed) {
      return
    }
    await onDeleteFolder(selectedFolder.id)
  }

  const closeModal = () => setModalMode(null)
  const modalTitle = modalMode === 'edit' ? 'Edit folder' : 'Create new folder'

  const handleModalPermissionToggle = (groupId, key, value) => {
    setModalPermissions((prev) => prev.map((entry) => (entry.groupId === groupId ? { ...entry, [key]: value } : entry)))
  }

  return (
    <div
      className={`card folder-browser workspace-card ${cardClassName} ${cardDragging ? 'is-dragging' : ''} ${cardResizing ? 'is-resizing' : ''}`.trim()}
      style={cardStyle}
      onDragOver={onCardDragOver}
      onDrop={onCardDrop}
    >
      <button
        type="button"
        className="workspace__drag-handle workspace__drag-handle--card"
        title="Drag to reorder"
        draggable
        onDragStart={onCardDragStart}
        onDragEnd={onCardDragEnd}
      >
        ⠿
      </button>
      <div
        className="workspace__resize-handle workspace__resize-handle--card"
        title="Resize card"
        onMouseDown={onCardResizeStart}
      />
      <div className="workspace-card__viewport folder-browser__viewport">
        <div className="folder-browser__header">
          <div>
            <p className="eyebrow">Library</p>
            <h3 onDoubleClick={() => onRefresh && onRefresh()} title="Double-click to refresh folders">Folders</h3>
            <small className="sr-only">Double-click the title to refresh the folder list</small>
          </div>
          <div className="folder-browser__actions">
            <button
              type="button"
              className="ghost icon-btn"
              onClick={openCreateModal}
              disabled={busy || isModalOpen}
              title="New folder"
              aria-label="New folder"
            >
              <span aria-hidden className="icon">📁</span>
            </button>
            <button
              type="button"
              className="ghost icon-btn"
              onClick={openEditModal}
              disabled={busy || isModalOpen || !selectedFolder || !onUpdateFolder}
              title="Edit folder"
              aria-label="Edit folder"
            >
              <span aria-hidden className="icon">✏️</span>
            </button>
            <button
              type="button"
              className="ghost icon-btn"
              onClick={handleDelete}
              disabled={busy || isModalOpen || !selectedFolder || !onDeleteFolder}
              title="Delete folder"
              aria-label="Delete folder"
            >
              <span aria-hidden className="icon">🗑️</span>
            </button>
          </div>
        </div>
        {loading ? (
          <p className="pill pill--info">Loading folders…</p>
        ) : nodes?.length ? (
          <FolderTree
            nodes={nodes}
            selectedId={selectedId}
            onSelect={onSelect}
            draggingDocumentId={draggingDocumentId}
            onDropDocument={onDocumentDrop}
          />
        ) : (
          <p className="empty-state">No folders yet. Create one to get started.</p>
        )}
        {draggingDocumentId && <p className="pill pill--info">Drop a document on a folder name to move it.</p>}
        {error && <p className="feedback feedback--error">{error}</p>}
      </div>
      {isModalOpen && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="folder-modal-title">
          <div className="modal-layer__backdrop" onClick={closeModal} />
          <div className="modal-layer__content folder-modal">
            <div className="modal-layer__header">
              <div>
                <p className="eyebrow">Folder</p>
                <h3 id="folder-modal-title">{modalTitle}</h3>
              </div>
              <button type="button" className="ghost" onClick={closeModal}>
                Close
              </button>
            </div>
            <form
              className="folder-form"
              onSubmit={(event) => {
                event.preventDefault()
                handleSubmit()
              }}
            >
              <label>
                <span>Folder name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q1 Reports" />
              </label>
              {modalMode === 'edit' ? (
                <label>
                  <span>Parent folder</span>
                  <select
                    value={editParentId ?? ''}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setEditParentId(nextValue ? Number(nextValue) : null)
                    }}
                  >
                    <option value="">Library root</option>
                    {editParentOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={nestUnderSelection}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setNestUnderSelection(checked)
                        if (!checked) {
                          setInheritMetadataTemplate(false)
                        }
                      }}
                      disabled={!selectedId}
                    />
                    <span>Nest inside selected folder</span>
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={inheritMetadataTemplate}
                      onChange={(e) => setInheritMetadataTemplate(e.target.checked)}
                      disabled={!selectedId || !nestUnderSelection}
                    />
                    <span>Metadata template inherit from parent folder</span>
                  </label>
                </>
              )}
              <MetadataTemplateBuilder
                value={templateFields}
                onChange={(next) => {
                  setTemplateFields(next)
                  setTemplateError('')
                }}
                disabled={busy || (modalMode !== 'edit' && inheritMetadataTemplate && nestUnderSelection && Boolean(selectedId))}
                error={templateError}
              />
              {canManagePermissions && (
                <div className="metadata-input-card">
                  <div className="metadata-input-card__header">
                    <span>Folder permissions</span>
                    <small>Assign read/upload-edit/delete access by user group</small>
                  </div>
                  {permissionsLoading ? (
                    <p className="pill pill--info">Loading permissions…</p>
                  ) : modalPermissions.length ? (
                    <div className="permissions-matrix" role="region" aria-live="polite">
                      <div className="permissions-matrix__header">
                        <span>Group</span>
                        {permissionKeys.map((item) => (
                          <span key={item.key}>{item.label}</span>
                        ))}
                      </div>
                      <ul className="permissions-matrix__list">
                        {modalPermissions.map((entry) => (
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
                                  onChange={(event) => handleModalPermissionToggle(entry.groupId, item.key, event.target.checked)}
                                  disabled={busy}
                                  aria-label={`${item.label} permission for ${entry.groupName}`}
                                />
                              </label>
                            ))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="empty-state">No groups available yet. Create a user group to assign folder permissions.</p>
                  )}
                </div>
              )}
              {templateError && <p className="feedback feedback--error">{templateError}</p>}
              <div className="modal-layer__actions">
                <button type="button" className="ghost" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={busy || !name.trim()}>
                  {modalMode === 'edit' ? 'Save changes' : 'Create folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
