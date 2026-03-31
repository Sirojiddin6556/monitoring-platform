import {useState, useEffect} from 'react'
import Sidebar from '../../components/Sidebar'
import ProtectedRoute from '../../components/ProtectedRoute'

function UserRow({user, onEdit, onDelete, onToggleActive}) {
  return (
    <tr style={{borderBottom: '1px solid #1a2940'}}>
      <td style={{padding: 12, color: '#fff'}}>{user.id}</td>
      <td style={{padding: 12, color: '#fff'}}>{user.username}</td>
      <td style={{padding: 12, color: '#fff'}}>{user.email}</td>
      <td style={{padding: 12, color: '#fff'}}>
        <span style={{
          padding: '4px 8px',
          background: user.role === 'admin' ? '#facc15' : user.role === 'user' ? '#3b82f6' : '#9aa4b2',
          color: '#000',
          borderRadius: 3,
          fontSize: 11,
          fontWeight: 600
        }}>
          {user.role === 'admin' ? 'Админ' : user.role === 'user' ? 'Пользователь' : 'Просмотр'}
        </span>
      </td>
      <td style={{padding: 12, color: '#fff'}}>
        <span style={{
          padding: '4px 8px',
          background: user.is_active ? '#4ade8060' : '#ef444460',
          color: user.is_active ? '#4ade80' : '#ef4444',
          borderRadius: 3,
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer'
        }} onClick={() => onToggleActive(user)}>
          {user.is_active ? 'Активен' : 'Отключен'}
        </span>
      </td>
      <td style={{padding: 12, textAlign: 'right'}}>
        <button onClick={() => onEdit(user)} style={{
          padding: '6px 12px',
          background: '#00d4ff60',
          color: '#00d4ff',
          border: '1px solid #00d4ff',
          borderRadius: 3,
          fontSize: 12,
          cursor: 'pointer',
          marginRight: 8
        }}>
          Редактировать
        </button>
        <button onClick={() => onDelete(user.id)} style={{
          padding: '6px 12px',
          background: '#ef444460',
          color: '#ef4444',
          border: '1px solid #ef4444',
          borderRadius: 3,
          fontSize: 12,
          cursor: 'pointer'
        }}>
          Удалить
        </button>
      </td>
    </tr>
  )
}

function EditUserModal({user, onClose, onSave}) {
  const [formData, setFormData] = useState(user || {})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    try {
      const {default: apiFetch} = await import('../../lib/api')
      const res = await apiFetch(`/api/admin/users/${formData.id}`, {
        method: 'PUT',
        body: JSON.stringify(formData)
      })
      if(res.id){
        onSave(res)
        onClose()
      } else {
        setError(res.detail || 'Ошибка обновления')
      }
    } catch(err){
      setError('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#00000080',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: '#0a1a2e',
        border: '1px solid #1a2940',
        borderRadius: 8,
        padding: 24,
        maxWidth: 400,
        width: '100%'
      }}>
        <h2 style={{color: '#fff', marginBottom: 16}}>Редактировать пользователя</h2>
        
        {error && <div style={{color: '#ef4444', marginBottom: 12}}>{error}</div>}
        
        <div style={{marginBottom: 12}}>
          <label style={{color: '#9aa4b2', fontSize: 12, display: 'block', marginBottom: 4}}>Имя пользователя</label>
          <input value={formData.username || ''} onChange={(e) => setFormData({...formData, username: e.target.value})} style={{
            width: '100%',
            padding: '8px 10px',
            background: '#07111e',
            border: '1px solid #1a2940',
            color: '#fff',
            borderRadius: 4,
            boxSizing: 'border-box'
          }} />
        </div>
        
        <div style={{marginBottom: 12}}>
          <label style={{color: '#9aa4b2', fontSize: 12, display: 'block', marginBottom: 4}}>Email</label>
          <input value={formData.email || ''} onChange={(e) => setFormData({...formData, email: e.target.value})} style={{
            width: '100%',
            padding: '8px 10px',
            background: '#07111e',
            border: '1px solid #1a2940',
            color: '#fff',
            borderRadius: 4,
            boxSizing: 'border-box'
          }} />
        </div>
        
        <div style={{marginBottom: 12}}>
          <label style={{color: '#9aa4b2', fontSize: 12, display: 'block', marginBottom: 4}}>Роль</label>
          <select value={formData.role || 'viewer'} onChange={(e) => setFormData({...formData, role: e.target.value})} style={{
            width: '100%',
            padding: '8px 10px',
            background: '#07111e',
            border: '1px solid #1a2940',
            color: '#fff',
            borderRadius: 4,
            boxSizing: 'border-box'
          }}>
            <option value="viewer">Просмотр</option>
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
        </div>
        
        <div style={{display: 'flex', gap: 8}}>
          <button onClick={handleSave} disabled={loading} style={{flex: 1, padding: '10px 16px', background: '#00d4ff', color: '#000', border: 'none', borderRadius: 4, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1}}>
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button onClick={onClose} style={{flex: 1, padding: '10px 16px', background: '#1a294060', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer'}}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingUser, setEditingUser] = useState(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const {default: apiFetch} = await import('../../lib/api')
      const res = await apiFetch('/api/admin/users')
      setUsers(res || [])
    } catch(err) {
      setError('Ошибка загрузки пользователей: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (userId) => {
    if(!confirm('Вы уверены?')) return
    try {
      const {default: apiFetch} = await import('../../lib/api')
      await apiFetch(`/api/admin/users/${userId}`, {method: 'DELETE'})
      setUsers(users.filter(u => u.id !== userId))
    } catch(err) {
      alert('Ошибка: ' + err.message)
    }
  }

  const handleToggleActive = async (user) => {
    try {
      const {default: apiFetch} = await import('../../lib/api')
      const res = await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({is_active: !user.is_active})
      })
      setUsers(users.map(u => u.id === user.id ? res : u))
    } catch(err) {
      alert('Ошибка: ' + err.message)
    }
  }

  const handleSaveUser = (updatedUser) => {
    setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u))
  }

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="app-shell">
        <Sidebar />
        <div className="page">
          <h1>Администраторская панель</h1>
          
          <div style={{marginBottom: 24}}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16}}>
              <div className="card" style={{padding: 16}}>
                <div style={{fontSize: 11, color: '#9aa4b2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8}}>Всего пользователей</div>
                <div style={{fontSize: 28, fontWeight: 700, color: '#fff'}}>{users.length}</div>
              </div>
              <div className="card" style={{padding: 16}}>
                <div style={{fontSize: 11, color: '#9aa4b2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8}}>Администраторы</div>
                <div style={{fontSize: 28, fontWeight: 700, color: '#facc15'}}>{users.filter(u => u.role === 'admin').length}</div>
              </div>
              <div className="card" style={{padding: 16}}>
                <div style={{fontSize: 11, color: '#9aa4b2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8}}>Активных пользователей</div>
                <div style={{fontSize: 28, fontWeight: 700, color: '#4ade80'}}>{users.filter(u => u.is_active).length}</div>
              </div>
            </div>
          </div>
          
          <div className="card">
            <h2 style={{padding: 16, borderBottom: '1px solid #1a2940', margin: 0, color: '#fff'}}>Управление пользователями</h2>
            
            {loading && <div style={{padding: 16, textAlign: 'center', color: '#9aa4b2'}}>Загрузка...</div>}
            {error && <div style={{padding: 16, color: '#ef4444'}}>{error}</div>}
            
            {!loading && !error && users.length > 0 && (
              <div style={{overflowX: 'auto'}}>
                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{borderBottom: '1px solid #1a2940'}}>
                      <th style={{padding: 12, textAlign: 'left', color: '#9aa4b2', fontWeight: 600, fontSize: 12}}>ID</th>
                      <th style={{padding: 12, textAlign: 'left', color: '#9aa4b2', fontWeight: 600, fontSize: 12}}>Имя</th>
                      <th style={{padding: 12, textAlign: 'left', color: '#9aa4b2', fontWeight: 600, fontSize: 12}}>Email</th>
                      <th style={{padding: 12, textAlign: 'left', color: '#9aa4b2', fontWeight: 600, fontSize: 12}}>Роль</th>
                      <th style={{padding: 12, textAlign: 'left', color: '#9aa4b2', fontWeight: 600, fontSize: 12}}>Статус</th>
                      <th style={{padding: 12, textAlign: 'right', color: '#9aa4b2', fontWeight: 600, fontSize: 12}}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => <UserRow key={u.id} user={u} onEdit={setEditingUser} onDelete={handleDelete} onToggleActive={handleToggleActive} />)}
                  </tbody>
                </table>
              </div>
            )}
            
            {!loading && !error && users.length === 0 && (
              <div style={{padding: 16, textAlign: 'center', color: '#9aa4b2'}}>Нет пользователей</div>
            )}
          </div>
          
          {editingUser && <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSave={handleSaveUser} />}
        </div>
      </div>
    </ProtectedRoute>
  )
}
