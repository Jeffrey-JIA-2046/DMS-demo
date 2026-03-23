import React, { useEffect, useMemo, useState, useContext } from 'react'
import { Roles } from '../contexts/AuthContext'
import { AnnounceContext } from '../contexts/AnnounceContext'
import {
  fetchGroups,
  fetchUsers,
  createGroup,
  updateGroup,
  deleteGroup,
  createUser,
  updateUser,
  deleteUser,
} from '../api/userManagement'

const ROLE_OPTIONS = [
  { value: 'SYS_ADMIN', label: Roles.SYS_ADMIN },
  { value: 'USER_ADMIN', label: Roles.USER_ADMIN },
  { value: 'DOC_ADMIN', label: Roles.DOC_ADMIN },
  { value: 'DOC_VIEWER', label: Roles.DOC_VIEWER },
]

const defaultUserForm = () => ({
  username: '',
  displayName: '',
  password: '',
  role: 'DOC_VIEWER',
  groupIds: [],
})

const defaultGroupForm = () => ({ name: '', description: '' })

export default function UserManagement() {
  const { toast, confirm } = useContext(AnnounceContext)
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [userForm, setUserForm] = useState(defaultUserForm())
  const [groupForm, setGroupForm] = useState(defaultGroupForm())
  const [editingUserId, setEditingUserId] = useState(null)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [savingUser, setSavingUser] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [originalPassword, setOriginalPassword] = useState('')
  const [isGroupModalOpen, setGroupModalOpen] = useState(false)
  const [isUserModalOpen, setUserModalOpen] = useState(false)

  const roleLabel = useMemo(() => {
    const map = new Map()
    ROLE_OPTIONS.forEach((opt) => map.set(opt.value, opt.label))
    return map
  }, [])

  useEffect(() => {
    refreshAll()
  }, [])

  function resetUserEditor() {
    setUserForm(defaultUserForm())
    setEditingUserId(null)
    setOriginalPassword('')
    setShowPassword(false)
  }

  function openGroupModalForCreate() {
    setGroupForm(defaultGroupForm())
    setEditingGroupId(null)
    setGroupModalOpen(true)
  }

  function closeGroupModal() {
    setGroupModalOpen(false)
    setGroupForm(defaultGroupForm())
    setEditingGroupId(null)
  }

  function openUserModalForCreate() {
    resetUserEditor()
    setUserModalOpen(true)
  }

  function closeUserModal() {
    resetUserEditor()
    setUserModalOpen(false)
  }

  async function refreshAll() {
    try {
      setLoading(true)
      const [groupData, userData] = await Promise.all([fetchGroups(), fetchUsers()])
      setGroups(groupData)
      setUsers(userData)
    } catch (err) {
      toast && toast(err.message || 'Failed to load users', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleGroupSubmit(e) {
    e.preventDefault()
    if (!groupForm.name.trim()) {
      toast && toast('Group name is required', { type: 'error' })
      return
    }
    try {
      setSavingGroup(true)
      const payload = { name: groupForm.name.trim(), description: groupForm.description?.trim() ?? '' }
      if (editingGroupId) {
        await updateGroup(editingGroupId, payload)
        toast && toast('Group updated', { type: 'success' })
      } else {
        await createGroup(payload)
        toast && toast('Group created', { type: 'success' })
      }
      await refreshAll()
      closeGroupModal()
    } catch (err) {
      toast && toast(err.message || 'Group save failed', { type: 'error' })
    } finally {
      setSavingGroup(false)
    }
  }

  async function handleGroupDelete(group) {
    if (!(await confirm?.(`Delete group "${group.name}"?`))) return
    try {
      await deleteGroup(group.id)
      toast && toast('Group deleted', { type: 'info' })
      await refreshAll()
      if (editingGroupId === group.id) {
        closeGroupModal()
      }
    } catch (err) {
      toast && toast(err.message || 'Failed to delete group', { type: 'error' })
    }
  }

  async function handleUserSubmit(e) {
    e.preventDefault()
    if (!userForm.username.trim() || !userForm.displayName.trim()) {
      toast && toast('Username and display name are required', { type: 'error' })
      return
    }
    try {
      setSavingUser(true)
      const trimmedPassword = (userForm.password || '').trim()
      if (trimmedPassword && trimmedPassword.length < 8) {
        toast && toast('Password must be at least 8 characters', { type: 'error' })
        return
      }
      const payload = {
        username: userForm.username.trim(),
        displayName: userForm.displayName.trim(),
        role: userForm.role,
        groupIds: userForm.groupIds,
      }
      if (!editingUserId && trimmedPassword) {
        payload.password = trimmedPassword
      }
      if (editingUserId && trimmedPassword && trimmedPassword !== originalPassword) {
        payload.password = trimmedPassword
      }
      if (editingUserId) {
        await updateUser(editingUserId, payload)
        toast && toast('User updated', { type: 'success' })
      } else {
        await createUser(payload)
        toast && toast('User created', { type: 'success' })
      }
      await refreshAll()
      closeUserModal()
    } catch (err) {
      toast && toast(err.message || 'User save failed', { type: 'error' })
    } finally {
      setSavingUser(false)
    }
  }

  async function handleUserDelete(user) {
    if (!(await confirm?.(`Delete user ${user.username}?`))) return
    try {
      await deleteUser(user.id)
      toast && toast('User deleted', { type: 'info' })
      await refreshAll()
      if (editingUserId === user.id) {
        closeUserModal()
      }
    } catch (err) {
      toast && toast(err.message || 'Failed to delete user', { type: 'error' })
    }
  }

  function startEditUser(user) {
    setEditingUserId(user.id)
    const managedPassword = user.userPassword || ''
    setUserForm({
      username: user.username,
      displayName: user.displayName,
      password: managedPassword,
      role: user.role,
      groupIds: user.groups?.map((g) => g.id) ?? [],
    })
    setOriginalPassword(managedPassword)
    setShowPassword(false)
    setUserModalOpen(true)
  }

  function startEditGroup(group) {
    setEditingGroupId(group.id)
    setGroupForm({ name: group.name, description: group.description ?? '' })
    setGroupModalOpen(true)
  }

  function toggleGroupSelection(groupId) {
    setUserForm((prev) => {
      const hasGroup = prev.groupIds.includes(groupId)
      return {
        ...prev,
        groupIds: hasGroup
          ? prev.groupIds.filter((id) => id !== groupId)
          : [...prev.groupIds, groupId],
      }
    })
  }

  return (
    <div className="user-management">
      <section className="card user-management__panel">
        <header className="section-header">
          <div>
            <h3>Groups</h3>
            <p className="content-panel__hint">Organize users by responsibility areas.</p>
          </div>
          <button type="button" className="primary" onClick={openGroupModalForCreate}>
            New group
          </button>
        </header>
        <div className="user-management__list" aria-live="polite">
          {loading ? (
            <p className="empty-state">Loading groups…</p>
          ) : groups.length === 0 ? (
            <p className="empty-state">No groups defined yet.</p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="user-management__row">
                <div>
                  <strong>{group.name}</strong>
                  <p className="user-management__meta">{group.description || '—'}</p>
                  <small className="user-management__muted">{group.memberCount} members</small>
                </div>
                <div className="user-management__actions">
                  <button className="ghost" onClick={() => startEditGroup(group)}>Edit</button>
                  <button className="ghost icon-btn" onClick={() => handleGroupDelete(group)} title={`Delete group ${group.name}`} aria-label={`Delete group ${group.name}`}>
                    <span aria-hidden className="icon">🗑️</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card user-management__panel">
        <header className="section-header">
          <div>
            <h3>Users</h3>
            <p className="content-panel__hint">Assign roles and align users with groups.</p>
          </div>
          <button type="button" className="primary" onClick={openUserModalForCreate}>
            New user
          </button>
        </header>
        <div className="user-management__list" aria-live="polite">
          {loading ? (
            <p className="empty-state">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="empty-state">No users have been created yet.</p>
          ) : (
            users.map((user) => (
              <div key={user.id} className="user-management__row">
                <div>
                  <strong>{user.displayName} </strong>
                  <span className="badge badge--neutral">{user.username}</span>
                  <p className="user-management__meta">{roleLabel.get(user.role) || user.role}</p>
                  <small className="user-management__muted">
                    {user.groups && user.groups.length
                      ? user.groups.map((g) => g.name).join(', ')
                      : 'No groups'}
                  </small>
                </div>
                <div className="user-management__actions">
                  <button className="ghost" onClick={() => startEditUser(user)}>Edit</button>
                  <button className="ghost icon-btn" onClick={() => handleUserDelete(user)} title={`Delete user ${user.username}`} aria-label={`Delete user ${user.username}`}>
                    <span aria-hidden className="icon">🗑️</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
      {isGroupModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="group-modal-title">
          <div className="modal card">
            <div className="modal__header">
              <h4 id="group-modal-title">{editingGroupId ? 'Edit group' : 'Create group'}</h4>
              <button type="button" className="ghost ghost--small" onClick={closeGroupModal}>
                Close
              </button>
            </div>
            <form onSubmit={handleGroupSubmit} className="user-management__form">
              <input
                placeholder="Group name"
                value={groupForm.name}
                onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <textarea
                placeholder="Description"
                value={groupForm.description}
                onChange={(e) => setGroupForm((prev) => ({ ...prev, description: e.target.value }))}
              />
              <div className="user-management__form-actions modal__actions">
                <button type="button" className="ghost" onClick={closeGroupModal}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={savingGroup}>
                  {savingGroup ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isUserModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
          <div className="modal card">
            <div className="modal__header">
              <h4 id="user-modal-title">{editingUserId ? 'Edit user' : 'Create user'}</h4>
              <button type="button" className="ghost ghost--small" onClick={closeUserModal}>
                Close
              </button>
            </div>
            <form onSubmit={handleUserSubmit} className="user-management__form">
              <input
                placeholder="Username"
                value={userForm.username}
                onChange={(e) => setUserForm((prev) => ({ ...prev, username: e.target.value }))}
                disabled={!!editingUserId}
              />
              <input
                placeholder="Display name"
                value={userForm.displayName}
                onChange={(e) => setUserForm((prev) => ({ ...prev, displayName: e.target.value }))}
              />
              <div className="user-management__password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={editingUserId ? 'Update password' : 'Password (optional)'}
                  value={userForm.password}
                  onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))}
                />
                <button
                  type="button"
                  className="ghost"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <small className="user-management__muted">
                {editingUserId
                  ? 'The current password is pre-filled. Update the field to set a new value.'
                  : 'Leave blank to use the default password (P@ssw0rd).'}
              </small>
              <select value={userForm.role} onChange={(e) => setUserForm((prev) => ({ ...prev, role: e.target.value }))}>
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="user-management__groups">
                <p className="user-management__hint">Groups</p>
                {groups.length === 0 ? (
                  <small className="user-management__muted">Create a group first.</small>
                ) : (
                  groups.map((group) => (
                    <label key={group.id} className="checkbox">
                      <input
                        type="checkbox"
                        checked={userForm.groupIds.includes(group.id)}
                        onChange={() => toggleGroupSelection(group.id)}
                      />
                      {group.name}
                    </label>
                  ))
                )}
              </div>
              <div className="user-management__form-actions modal__actions">
                <button type="button" className="ghost" onClick={closeUserModal}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={savingUser}>
                  {savingUser ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
