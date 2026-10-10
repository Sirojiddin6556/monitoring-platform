import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import ProtectedRoute from '../../components/ProtectedRoute'
import apiFetch from '../../lib/api'
import {
  Users,
  Shield,
  UserPlus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  Lock,
  Mail,
  UserCheck
} from 'lucide-react'

function UserRow({ user, onEdit, onDelete, onToggleActive }) {
  const roleLower = String(user.role || '').toLowerCase()
  const isAdmin = roleLower === 'admin'
  const isUser = roleLower === 'user'

  return (
    <tr style={{ borderBottom: '1px solid #1e293b20', transition: 'background 0.15s ease' }}>
      <td style={{ padding: '12px 16px', color: '#64748b', fontFeatureSettings: '"tnum"', width: 60 }}>
        #{user.id}
      </td>
      <td style={{ padding: '12px 16px', color: '#f8fafc', fontWeight: 600 }}>
        {user.username}
      </td>
      <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
        {user.email}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span
          style={{
            padding: '3px 8px',
            background: isAdmin ? '#f59e0b15' : isUser ? '#2563eb15' : '#64748b15',
            border: `1px solid ${isAdmin ? '#f59e0b35' : isUser ? '#2563eb35' : '#64748b35'}`,
            color: isAdmin ? '#fbbf24' : isUser ? '#38bdf8' : '#94a3b8',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {isAdmin ? 'Администратор' : isUser ? 'Пользователь' : 'Просмотр'}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <button
          onClick={() => onToggleActive(user)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            background: user.is_active ? '#10b98115' : '#ef444415',
            border: `1px solid ${user.is_active ? '#10b98135' : '#ef444435'}`,
            color: user.is_active ? '#10b981' : '#f87171',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {user.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
          {user.is_active ? 'Активен' : 'Отключен'}
        </button>
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <button
            onClick={() => onEdit(user)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              background: '#2563eb18',
              color: '#38bdf8',
              border: '1px solid #2563eb40',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Edit2 size={12} /> Изменить
          </button>
          <button
            onClick={() => onDelete(user.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              background: '#ef444415',
              color: '#f87171',
              border: '1px solid #ef444435',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} /> Удалить
          </button>
        </div>
      </td>
    </tr>
  )
}

function CreateUserModal({ onClose, onCreated }) {
  const [formData, setFormData] = useState({ username: '', email: '', password: '', role: 'viewer' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!formData.username.trim() || !formData.email.trim() || !formData.password.trim()) {
      setError('Все поля обязательны для заполнения')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(formData),
      })
      if (res.detail) {
        setError(res.detail)
      } else if (res.id) {
        onCreated(res)
        onClose()
      } else {
        setError('Не удалось создать пользователя')
      }
    } catch (err) {
      setError(err.message || 'Ошибка создания пользователя')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>
            Создание пользователя
          </h3>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        {error && <div style={errorBannerStyle}>{error}</div>}

        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Имя пользователя (логин)</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="alex"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="alex@company.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Пароль</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Минимум 6 символов"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Роль доступа</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              style={inputStyle}
            >
              <option value="viewer">Просмотр (Viewer)</option>
              <option value="user">Пользователь (User)</option>
              <option value="admin">Администратор (Admin)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '9px 16px',
                borderRadius: 6,
                background: '#1e293b',
                border: 'none',
                color: '#94a3b8',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '9px 16px',
                borderRadius: 6,
                background: '#2563eb',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditUserModal({ user, onClose, onSave }) {
  const [formData, setFormData] = useState({
    username: user.username,
    email: user.email,
    password: '',
    role: String(user.role || '').toLowerCase(),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      username: formData.username,
      email: formData.email,
      role: formData.role,
    }
    if (formData.password.trim()) {
      payload.password = formData.password.trim()
    }

    try {
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      if (res.detail) {
        setError(res.detail)
      } else if (res.id) {
        onSave(res)
        onClose()
      } else {
        setError('Не удалось обновить пользователя')
      }
    } catch (err) {
      setError(err.message || 'Ошибка сохранения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 16, fontWeight: 700 }}>
            Редактирование пользователя #{user.id}
          </h3>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        {error && <div style={errorBannerStyle}>{error}</div>}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Логин</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Новый пароль (оставьте пустым, если не меняется)</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Роль доступа</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              style={inputStyle}
            >
              <option value="viewer">Просмотр (Viewer)</option>
              <option value="user">Пользователь (User)</option>
              <option value="admin">Администратор (Admin)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '9px 16px',
                borderRadius: 6,
                background: '#1e293b',
                border: 'none',
                color: '#94a3b8',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '9px 16px',
                borderRadius: 6,
                background: '#2563eb',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminPanel() {
  const [mounted, setMounted] = useState(false)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [search, setSearch] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/admin/users')
      setUsers(res || [])
    } catch (err) {
      setError(err.message || 'Ошибка загрузки списка пользователей')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    loadUsers()
  }, [])

  const handleDelete = async (userId) => {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      setUsers(users.filter((u) => u.id !== userId))
    } catch (err) {
      alert(err.message || 'Ошибка удаления')
    }
  }

  const handleToggleActive = async (user) => {
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !user.is_active }),
      })
      setUsers(users.map((u) => (u.id === user.id ? res : u)))
    } catch (err) {
      alert(err.message || 'Ошибка изменения статуса')
    }
  }

  const handleSaveUser = (updatedUser) => {
    setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)))
  }

  const filteredUsers = users.filter((u) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    )
  })

  if (!mounted) return null

  return (
    <ProtectedRoute requiredRole="admin">
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 7, borderRadius: 6, background: '#2563eb18', color: '#38bdf8' }}>
                  <Shield size={20} />
                </div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  Панель администратора
                </h1>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Управление учетными записями, ролями доступа и правами пользователей
              </div>
            </div>

            <button
              onClick={() => setShowCreateUser(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px solid #1e293b',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <UserPlus size={13} />
              Добавить пользователя
            </button>
          </div>

          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
            <div style={statCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={statLabelStyle}>Всего учетных записей</span>
                <Users size={16} style={{ color: '#2563eb' }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc' }}>{users.length}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={statLabelStyle}>Администраторы</span>
                <Shield size={16} style={{ color: '#f59e0b' }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fbbf24' }}>
                {users.filter((u) => String(u.role || '').toLowerCase() === 'admin').length}
              </div>
            </div>

            <div style={statCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={statLabelStyle}>Активные аккаунты</span>
                <UserCheck size={16} style={{ color: '#10b981' }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981' }}>
                {users.filter((u) => u.is_active).length}
              </div>
            </div>
          </div>

          {/* User Table */}
          <div
            style={{
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                Список пользователей ({filteredUsers.length})
              </div>
              <div style={{ position: 'relative', width: 220 }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: '#64748b' }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по имени или email..."
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    background: '#090d16',
                    border: '1px solid #1e293b',
                    borderRadius: 4,
                    color: '#f8fafc',
                    fontSize: 12,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Загрузка списка пользователей...
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', color: '#64748b', textAlign: 'left' }}>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>ID</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Пользователь</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Email</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Роль</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Статус</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                          Пользователи не найдены
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <UserRow
                          key={u.id}
                          user={u}
                          onEdit={setEditingUser}
                          onDelete={handleDelete}
                          onToggleActive={handleToggleActive}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {showCreateUser && (
        <CreateUserModal
          onClose={() => setShowCreateUser(false)}
          onCreated={(newUser) => setUsers([...users, newUser])}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSaveUser}
        />
      )}
    </ProtectedRoute>
  )
}

const statCardStyle = {
  background: '#101726',
  border: '1px solid #1e293b',
  borderRadius: 8,
  padding: '14px 16px',
}

const statLabelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
  padding: 16,
}

const modalContentStyle = {
  background: '#101726',
  border: '1px solid #1e293b',
  borderRadius: 8,
  padding: 24,
  maxWidth: 420,
  width: '100%',
  boxSizing: 'border-box',
}

const closeButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#64748b',
  fontSize: 16,
  cursor: 'pointer',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: 4,
}

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 4,
  border: '1px solid #1e293b',
  background: '#090d16',
  color: '#f8fafc',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
}

const errorBannerStyle = {
  padding: '8px 12px',
  borderRadius: 4,
  background: '#ef444415',
  border: '1px solid #ef444440',
  color: '#f87171',
  fontSize: 12,
  marginBottom: 12,
}
