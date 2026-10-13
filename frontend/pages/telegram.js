import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Bot,
  Send,
  Users,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Settings,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  Play,
  Pause,
  ShieldAlert,
  Info,
  ExternalLink,
  ChevronRight,
  Radio,
  Check,
  X
} from 'lucide-react'

const BotHealthDashboard = dynamic(() => import('../components/BotHealthDashboard'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
      Загрузка диаграмм здоровья...
    </div>
  )
})

const ALL_CATEGORIES = [
  { value: 'system', label: 'Система' },
  { value: 'website', label: 'Веб-сайты' },
  { value: 'service', label: 'Сервисы' },
  { value: 'docker', label: 'Docker' },
  { value: 'security', label: 'Безопасность' },
]

function StatusBadge({ status }) {
  const isOnline = status === 'online'
  const isOffline = status === 'offline'
  const isError = status === 'error'

  let bg = '#1e293b'
  let color = '#94a3b8'
  let text = 'Неизвестно'
  let dotColor = '#64748b'

  if (isOnline) {
    bg = 'rgba(34, 197, 94, 0.12)'
    color = '#4ade80'
    text = 'Онлайн'
    dotColor = '#22c55e'
  } else if (isOffline) {
    bg = 'rgba(239, 68, 68, 0.12)'
    color = '#f87171'
    text = 'Оффлайн'
    dotColor = '#ef4444'
  } else if (isError) {
    bg = 'rgba(234, 179, 8, 0.12)'
    color = '#facc15'
    text = 'Ошибка'
    dotColor = '#eab308'
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 9999,
        background: bg,
        border: `1px solid ${color}30`,
        fontSize: 11,
        fontWeight: 600,
        color
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dotColor,
          boxShadow: isOnline ? `0 0 6px ${dotColor}` : 'none'
        }}
      />
      {text}
    </span>
  )
}

export default function Telegram() {
  const [mounted, setMounted] = useState(false)
  const [bots, setBots] = useState([])
  const [selected, setSelected] = useState(null)
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', token: '', chat_id: '' })
  const [addError, setAddError] = useState(null)
  const [addLoading, setAddLoading] = useState(false)
  const [checkLoading, setCheckLoading] = useState(false)
  const [sendForm, setSendForm] = useState('')
  const [sendResult, setSendResult] = useState(null)
  const [sendLoading, setSendLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [botUsers, setBotUsers] = useState([])
  const [botUsersLoading, setBotUsersLoading] = useState(false)
  const [orgs, setOrgs] = useState([])
  const [showAddUser, setShowAddUser] = useState(false)
  const [addUserForm, setAddUserForm] = useState({
    telegram_id: '',
    username: '',
    first_name: '',
    last_name: '',
    org_id: null,
    notify_critical: true,
    notify_warning: true,
    notify_info: false,
    notify_categories: []
  })
  const [addUserError, setAddUserError] = useState(null)
  const [addUserSaving, setAddUserSaving] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [editUserForm, setEditUserForm] = useState({
    org_id: null,
    notify_critical: true,
    notify_warning: true,
    notify_info: false,
    notify_categories: []
  })
  const [editUserSaving, setEditUserSaving] = useState(false)
  const [sendUserModal, setSendUserModal] = useState(null)
  const [sendUserMsg, setSendUserMsg] = useState('')
  const [sendUserSending, setSendUserSending] = useState(false)
  const [sendUserResult, setSendUserResult] = useState(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadBots = async () => {
    try {
      setError(null)
      const d = await apiFetch('/api/telegram/bots')
      setBots(d.bots || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        setError(null)
        const d = await apiFetch('/api/telegram/bots')
        const botList = d.bots || []
        setBots(botList)
        setLoading(false)
        if (botList.length > 0) {
          if (!selected) {
            setSelected(botList[0])
            loadUpdates(botList[0])
          }
          await Promise.allSettled(
            botList.map(b => apiFetch(`/api/telegram/bots/${b.id}/check`, { method: 'POST' }))
          )
          const fresh = await apiFetch('/api/telegram/bots')
          setBots(fresh.bots || [])
        }
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    })()

    ;(async () => {
      try {
        const d = await apiFetch('/api/organizations')
        setOrgs(d.organizations || [])
      } catch {}
    })()

    const interval = setInterval(loadBots, 60000)
    return () => clearInterval(interval)
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setAddError(null)
    if (!addForm.name.trim() || !addForm.token.trim()) {
      setAddError('Имя и токен обязательны')
      return
    }
    setAddLoading(true)
    try {
      const res = await apiFetch('/api/telegram/bots', {
        method: 'POST',
        body: JSON.stringify(addForm)
      })
      if (res.detail) {
        setAddError(res.detail)
        return
      }
      setAddForm({ name: '', token: '', chat_id: '' })
      setShowAdd(false)
      await loadBots()
    } catch (err) {
      setAddError(err.message || 'Ошибка добавления')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Вы действительно хотите удалить бота?')) return
    try {
      await apiFetch(`/api/telegram/bots/${id}`, { method: 'DELETE' })
      if (selected?.id === id) {
        setSelected(null)
        setUpdates([])
      }
      await loadBots()
    } catch (err) {
      setError('Ошибка удаления')
    }
  }

  async function handleCheck(id) {
    setCheckLoading(true)
    try {
      await apiFetch(`/api/telegram/bots/${id}/check`, { method: 'POST' })
      await loadBots()
    } catch (err) {
      setError('Ошибка проверки бота')
    } finally {
      setCheckLoading(false)
    }
  }

  async function loadUpdates(bot) {
    setSelected(bot)
    setUpdates([])
    setSendResult(null)
    setBotUsers([])
    setBotUsersLoading(true)
    try {
      const [d, u] = await Promise.all([
        apiFetch(`/api/telegram/bots/${bot.id}/updates`),
        apiFetch(`/api/telegram/bots/${bot.id}/users`)
      ])
      setUpdates(d.updates || [])
      setBotUsers(u.users || [])
    } catch (err) {
    } finally {
      setBotUsersLoading(false)
    }
  }

  async function loadBotUsers(botId) {
    try {
      const u = await apiFetch(`/api/telegram/bots/${botId}/users`)
      setBotUsers(u.users || [])
    } catch {}
  }

  async function handleToggleUser(userId) {
    if (!selected) return
    try {
      await apiFetch(`/api/telegram/bots/${selected.id}/users/${userId}/toggle`, { method: 'POST' })
      await loadBotUsers(selected.id)
    } catch {}
  }

  async function handleDeleteUser(userId) {
    if (!confirm('Удалить пользователя из списка подписчиков?')) return
    if (!selected) return
    try {
      await apiFetch(`/api/telegram/bots/${selected.id}/users/${userId}`, { method: 'DELETE' })
      await loadBotUsers(selected.id)
    } catch {}
  }

  function openAddUser() {
    setAddUserForm({
      telegram_id: '',
      username: '',
      first_name: '',
      last_name: '',
      org_id: null,
      notify_critical: true,
      notify_warning: true,
      notify_info: false,
      notify_categories: []
    })
    setAddUserError(null)
    setShowAddUser(true)
  }

  async function handleAddUser() {
    if (!selected) return
    if (!addUserForm.telegram_id.trim()) {
      setAddUserError('Telegram ID обязателен')
      return
    }
    setAddUserSaving(true)
    setAddUserError(null)
    try {
      await apiFetch(`/api/telegram/bots/${selected.id}/users`, {
        method: 'POST',
        body: JSON.stringify(addUserForm)
      })
      setShowAddUser(false)
      await loadBotUsers(selected.id)
    } catch (err) {
      setAddUserError(err.message || 'Ошибка создания')
    } finally {
      setAddUserSaving(false)
    }
  }

  function openEditUser(u) {
    setEditUser(u)
    setEditUserForm({
      org_id: u.org_id || null,
      notify_critical: u.notify_critical,
      notify_warning: u.notify_warning,
      notify_info: u.notify_info,
      notify_categories: u.notify_categories || []
    })
  }

  async function handleSaveUser() {
    if (!selected || !editUser) return
    setEditUserSaving(true)
    try {
      await apiFetch(`/api/telegram/bots/${selected.id}/users/${editUser.id}`, {
        method: 'PUT',
        body: JSON.stringify(editUserForm)
      })
      setEditUser(null)
      await loadBotUsers(selected.id)
    } catch {} finally {
      setEditUserSaving(false)
    }
  }

  function openSendUser(u) {
    setSendUserModal(u)
    setSendUserMsg('')
    setSendUserResult(null)
  }

  async function handleSendToUser() {
    if (!selected || !sendUserModal || !sendUserMsg.trim()) return
    setSendUserSending(true)
    setSendUserResult(null)
    try {
      const r = await apiFetch(`/api/telegram/bots/${selected.id}/users/${sendUserModal.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ message: sendUserMsg })
      })
      setSendUserResult(r)
    } catch (err) {
      setSendUserResult({ sent: false, error: err.message })
    } finally {
      setSendUserSending(false)
    }
  }

  async function handleSend() {
    if (!selected || !sendForm.trim()) return
    setSendResult(null)
    setSendLoading(true)
    try {
      const res = await apiFetch(`/api/telegram/bots/${selected.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ message: sendForm })
      })
      setSendResult(res)
      if (res.sent) setSendForm('')
    } catch (err) {
      setSendResult({ sent: false, error: err.message })
    } finally {
      setSendLoading(false)
    }
  }

  if (!mounted) return null

  const selBot = selected ? bots.find(b => b.id === selected.id) || selected : null
  const info = selBot?.last_info || {}

  const filteredBots = search.trim()
    ? bots.filter(
        b =>
          (b.name || '').toLowerCase().includes(search.toLowerCase()) ||
          (b.last_username || '').toLowerCase().includes(search.toLowerCase())
      )
    : bots

  return (
    <ProtectedRoute requiredRole="admin">
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto', boxSizing: 'border-box' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24,
              flexWrap: 'wrap',
              gap: 16
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <Bot size={26} color="#38bdf8" />
                Telegram Боты & Интеграции
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
                Централизованное управление ботами уведомлений, подписчиками и каналом информирования
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setShowAdd(!showAdd)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 16px',
                  borderRadius: 8,
                  border: showAdd ? '1px solid #334155' : 'none',
                  background: showAdd ? '#1e293b' : '#2563eb',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: showAdd ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                {showAdd ? <X size={16} /> : <Plus size={16} />}
                {showAdd ? 'Закрыть форму' : 'Добавить бота'}
              </button>
            </div>
          </div>

          {/* Add Bot Form Panel */}
          {showAdd && (
            <div
              style={{
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 12,
                padding: 20,
                marginBottom: 24,
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
              }}
            >
              <h3
                style={{
                  margin: '0 0 16px',
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Plus size={18} color="#38bdf8" />
                Регистрация нового Telegram бота
              </h3>

              <form onSubmit={handleAdd}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>
                      Название бота <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      value={addForm.name}
                      onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                      placeholder="Например: Production Alerts Bot"
                      style={modernInputStyle}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>
                      Bot Token (из @BotFather) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      value={addForm.token}
                      onChange={e => setAddForm({ ...addForm, token: e.target.value })}
                      placeholder="123456789:ABCdefGHI..."
                      type="password"
                      style={modernInputStyle}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>
                      Дефолтный Chat ID (группа / канал)
                    </label>
                    <input
                      value={addForm.chat_id}
                      onChange={e => setAddForm({ ...addForm, chat_id: e.target.value })}
                      placeholder="-100123456789"
                      style={modernInputStyle}
                    />
                  </div>
                </div>

                {addError && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: '10px 14px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 8,
                      color: '#f87171',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <AlertTriangle size={16} />
                    {addError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: '1px solid #334155',
                      background: '#1e293b',
                      color: '#94a3b8',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={addLoading}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {addLoading ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
                    {addLoading ? 'Проверка токена...' : 'Зарегистрировать'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {error && (
            <div
              style={{
                marginBottom: 20,
                padding: '12px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 8,
                color: '#f87171',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          {loading ? (
            <div
              style={{
                padding: 60,
                textAlign: 'center',
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 12,
                color: '#94a3b8'
              }}
            >
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
              <div>Синхронизация информации о ботах...</div>
            </div>
          ) : bots.length === 0 && !showAdd ? (
            <div
              style={{
                padding: 60,
                textAlign: 'center',
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 12
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: 'rgba(56, 189, 248, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}
              >
                <Bot size={28} color="#38bdf8" />
              </div>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Telegram боты еще не добавлены</div>
              <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 420, margin: '8px auto 20px' }}>
                Для получения мгновенных уведомлений об авариях и событиях создайте бота через @BotFather и подключите его к платформе.
              </p>
              <button
                onClick={() => setShowAdd(true)}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + Добавить первого бота
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
              {/* Bot list sidebar */}
              <div
                style={{
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 12,
                  padding: 16,
                  position: 'sticky',
                  top: 24
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Боты ({bots.length})
                  </span>
                  <button
                    onClick={loadBots}
                    title="Обновить список"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 4,
                      borderRadius: 4
                    }}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Search
                    size={14}
                    color="#64748b"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск бота..."
                    style={{
                      ...modernInputStyle,
                      paddingLeft: 32,
                      fontSize: 12,
                      paddingTop: 7,
                      paddingBottom: 7
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredBots.map(b => {
                    const isSelected = selected?.id === b.id
                    return (
                      <div
                        key={b.id}
                        onClick={() => loadUpdates(b)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(37, 99, 235, 0.15)' : '#0d131f',
                          border: isSelected ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid #1e293b',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 8,
                            background: isSelected ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          <Bot size={18} color={isSelected ? '#38bdf8' : '#94a3b8'} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: '#fff',
                              fontWeight: isSelected ? 600 : 500,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {b.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            @{b.last_username || 'unknown'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <StatusBadge status={b.last_status} />
                        </div>

                        <button
                          onClick={e => {
                            e.stopPropagation()
                            handleDelete(b.id)
                          }}
                          title="Удалить бота"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: 4,
                            borderRadius: 4,
                            opacity: 0.4,
                            transition: 'opacity 0.15s'
                          }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Detail panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {!selBot ? (
                  <div
                    style={{
                      background: '#101726',
                      border: '1px solid #1e293b',
                      borderRadius: 12,
                      padding: 60,
                      textAlign: 'center'
                    }}
                  >
                    <Bot size={40} color="#64748b" style={{ margin: '0 auto 12px' }} />
                    <div style={{ color: '#94a3b8', fontSize: 14 }}>Выберите бота из списка слева для просмотра деталей</div>
                  </div>
                ) : (
                  <>
                    {/* Bot header info card */}
                    <div
                      style={{
                        background: '#101726',
                        border: '1px solid #1e293b',
                        borderRadius: 12,
                        padding: 20
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 18,
                          flexWrap: 'wrap',
                          gap: 12
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 10,
                              background: 'rgba(56, 189, 248, 0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Bot size={24} color="#38bdf8" />
                          </div>
                          <div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{selBot.name}</div>
                            <div style={{ fontSize: 12, color: '#38bdf8' }}>@{selBot.last_username || '—'}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <StatusBadge status={selBot.last_status} />
                          <button
                            onClick={() => handleCheck(selBot.id)}
                            disabled={checkLoading}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '7px 14px',
                              borderRadius: 6,
                              border: '1px solid #334155',
                              background: '#1e293b',
                              color: '#f8fafc',
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer'
                            }}
                          >
                            <RefreshCw size={13} className={checkLoading ? 'spin' : ''} />
                            {checkLoading ? 'Проверка...' : 'Проверить статус'}
                          </button>
                        </div>
                      </div>

                      {/* Info grid */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: 12,
                          background: '#090d16',
                          border: '1px solid #1e293b',
                          borderRadius: 8,
                          padding: 14,
                          fontSize: 12
                        }}
                      >
                        <div>
                          <span style={{ color: '#64748b' }}>Имя API:</span>{' '}
                          <span style={{ color: '#fff', fontWeight: 500 }}>{info.first_name || '—'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Поддержка групп:</span>{' '}
                          <span style={{ color: info.can_join_groups ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                            {info.can_join_groups ? 'Да' : 'Нет'}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Inline режим:</span>{' '}
                          <span style={{ color: info.supports_inline ? '#4ade80' : '#94a3b8', fontWeight: 600 }}>
                            {info.supports_inline ? 'Да' : 'Нет'}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Pending updates:</span>{' '}
                          <span style={{ color: info.pending_updates > 0 ? '#facc15' : '#4ade80', fontWeight: 600 }}>
                            {info.pending_updates || 0}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Дефолтный Chat ID:</span>{' '}
                          <span style={{ color: '#fff', fontFamily: 'monospace' }}>{selBot.chat_id || 'Не задан'}</span>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Последняя проверка:</span>{' '}
                          <span style={{ color: '#94a3b8' }}>
                            {selBot.last_check ? new Date(selBot.last_check).toLocaleString('ru-RU') : '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bot Health Dashboard */}
                    <BotHealthDashboard bot={selBot} onCheck={loadBots} />

                    {/* Bot users */}
                    <div
                      style={{
                        background: '#101726',
                        border: '1px solid #1e293b',
                        borderRadius: 12,
                        padding: 20
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 16
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Users size={18} color="#38bdf8" />
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Подписчики бота ({botUsers.length})
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => loadBotUsers(selBot.id)}
                            title="Обновить подписчиков"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: '1px solid #334155',
                              background: '#1e293b',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              fontSize: 12
                            }}
                          >
                            <RefreshCw size={13} />
                          </button>
                          <button
                            onClick={openAddUser}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 14px',
                              borderRadius: 6,
                              border: 'none',
                              background: '#2563eb',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            <Plus size={14} />
                            Добавить подписчика
                          </button>
                        </div>
                      </div>

                      {botUsersLoading ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                          <RefreshCw size={18} className="spin" style={{ margin: '0 auto 8px' }} />
                          Загрузка пользователей...
                        </div>
                      ) : botUsers.length === 0 ? (
                        <div
                          style={{
                            padding: 30,
                            textAlign: 'center',
                            background: '#090d16',
                            border: '1px dashed #1e293b',
                            borderRadius: 8
                          }}
                        >
                          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 10 }}>
                            Пока нет зарегистрированных пользователей для этого бота
                          </div>
                          <button
                            onClick={openAddUser}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 6,
                              border: '1px solid rgba(56, 189, 248, 0.4)',
                              background: 'rgba(56, 189, 248, 0.1)',
                              color: '#38bdf8',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            + Добавить первого пользователя
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                          {botUsers.map(u => (
                            <div
                              key={u.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 14px',
                                background: '#090d16',
                                borderRadius: 8,
                                border: '1px solid #1e293b',
                                transition: 'border-color 0.15s ease'
                              }}
                            >
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: '50%',
                                  background: u.is_active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}
                              >
                                {u.is_active ? (
                                  <CheckCircle2 size={18} color="#22c55e" />
                                ) : (
                                  <XCircle size={18} color="#ef4444" />
                                )}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
                                    {u.first_name || 'Без имени'}
                                    {u.last_name ? ` ${u.last_name}` : ''}
                                  </span>
                                  <span style={{ fontSize: 11, color: '#38bdf8' }}>
                                    {u.username ? `@${u.username}` : `ID: ${u.telegram_id}`}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Building2 size={12} color="#64748b" />
                                    {u.org_name || 'Все организации'}
                                  </span>

                                  <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                    {u.notify_critical && (
                                      <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontSize: 10, fontWeight: 600 }}>
                                        CRIT
                                      </span>
                                    )}
                                    {u.notify_warning && (
                                      <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', fontSize: 10, fontWeight: 600 }}>
                                        WARN
                                      </span>
                                    )}
                                    {u.notify_info && (
                                      <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: 10, fontWeight: 600 }}>
                                        INFO
                                      </span>
                                    )}
                                    {!u.notify_critical && !u.notify_warning && !u.notify_info && (
                                      <span style={{ color: '#ef4444', fontSize: 10 }}>Отключены</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button
                                  onClick={() => openEditUser(u)}
                                  title="Настройки уведомлений"
                                  style={actionBtnStyle}
                                >
                                  <Settings size={14} color="#94a3b8" />
                                </button>
                                <button
                                  onClick={() => openSendUser(u)}
                                  title="Отправить личное сообщение"
                                  style={actionBtnStyle}
                                >
                                  <MessageSquare size={14} color="#38bdf8" />
                                </button>
                                <button
                                  onClick={() => handleToggleUser(u.id)}
                                  title={u.is_active ? 'Приостановить' : 'Активировать'}
                                  style={actionBtnStyle}
                                >
                                  {u.is_active ? <Pause size={14} color="#facc15" /> : <Play size={14} color="#4ade80" />}
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u.id)}
                                  title="Удалить подписчика"
                                  style={{ ...actionBtnStyle, borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                >
                                  <Trash2 size={14} color="#f87171" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Send test message to default chat */}
                    {selBot.chat_id && (
                      <div
                        style={{
                          background: '#101726',
                          border: '1px solid #1e293b',
                          borderRadius: 12,
                          padding: 20
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#f8fafc',
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            marginBottom: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}
                        >
                          <Send size={16} color="#38bdf8" />
                          Отправить тестовое оповещение в Chat ID ({selBot.chat_id})
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <input
                            value={sendForm}
                            onChange={e => setSendForm(e.target.value)}
                            placeholder="Текст служебного сообщения..."
                            style={{ ...modernInputStyle, flex: 1 }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSend()
                            }}
                          />
                          <button
                            onClick={handleSend}
                            disabled={sendLoading || !sendForm.trim()}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '9px 20px',
                              borderRadius: 8,
                              border: 'none',
                              background: '#2563eb',
                              color: '#fff',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <Send size={14} />
                            {sendLoading ? 'Отправка...' : 'Отправить'}
                          </button>
                        </div>

                        {sendResult && (
                          <div
                            style={{
                              marginTop: 12,
                              padding: '8px 12px',
                              borderRadius: 6,
                              background: sendResult.sent ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                              border: `1px solid ${sendResult.sent ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                              color: sendResult.sent ? '#4ade80' : '#f87171',
                              fontSize: 12,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8
                            }}
                          >
                            {sendResult.sent ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                            {sendResult.sent
                              ? `Успешно доставлено (Message ID: ${sendResult.message_id})`
                              : `Ошибка отправки: ${sendResult.error}`}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Updates log */}
                    <div
                      style={{
                        background: '#101726',
                        border: '1px solid #1e293b',
                        borderRadius: 12,
                        padding: 20
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 14
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Radio size={16} color="#38bdf8" />
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Последние входящие события / Updates
                          </span>
                        </div>
                        <button
                          onClick={() => loadUpdates(selBot)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 12px',
                            borderRadius: 6,
                            border: '1px solid #334155',
                            background: '#1e293b',
                            color: '#94a3b8',
                            fontSize: 11,
                            cursor: 'pointer'
                          }}
                        >
                          <RefreshCw size={12} />
                          Обновить
                        </button>
                      </div>

                      {updates.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                          Входящих сообщений не обнаружено
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                          {updates.map((u, i) => (
                            <div
                              key={u.update_id || i}
                              style={{
                                padding: '10px 14px',
                                background: '#090d16',
                                borderRadius: 8,
                                border: '1px solid #1e293b',
                                borderLeft: '3px solid #2563eb'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#38bdf8' }}>@{u.from || 'anonymous'}</span>
                                <span style={{ fontSize: 11, color: '#64748b' }}>
                                  {u.date ? new Date(u.date * 1000).toLocaleString('ru-RU') : '—'}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, color: '#f8fafc', margin: '4px 0' }}>{u.text || '—'}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>
                                Чат: {u.chat_title || 'Личный'} ({u.chat_id})
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setShowAddUser(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plus size={18} color="#38bdf8" />
                Добавить пользователя бота
              </h3>
              <button
                onClick={() => setShowAddUser(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            {addUserError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  padding: 10,
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <AlertTriangle size={16} />
                {addUserError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                  Telegram ID <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  value={addUserForm.telegram_id}
                  onChange={e => setAddUserForm({ ...addUserForm, telegram_id: e.target.value })}
                  placeholder="Числовой ID (например: 123456789)"
                  style={modernInputStyle}
                />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Узнать свой ID можно через бота @userinfobot
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Имя</label>
                  <input
                    value={addUserForm.first_name}
                    onChange={e => setAddUserForm({ ...addUserForm, first_name: e.target.value })}
                    placeholder="Имя"
                    style={modernInputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Фамилия</label>
                  <input
                    value={addUserForm.last_name}
                    onChange={e => setAddUserForm({ ...addUserForm, last_name: e.target.value })}
                    placeholder="Фамилия"
                    style={modernInputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Username (без @)</label>
                <input
                  value={addUserForm.username}
                  onChange={e => setAddUserForm({ ...addUserForm, username: e.target.value })}
                  placeholder="username"
                  style={modernInputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Организация</label>
                <select
                  value={addUserForm.org_id || ''}
                  onChange={e =>
                    setAddUserForm({ ...addUserForm, org_id: e.target.value ? parseInt(e.target.value) : null })
                  }
                  style={modernInputStyle}
                >
                  <option value="">Не назначена (Все уведомления)</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Уровни важности</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'notify_critical', label: 'Critical', color: '#ef4444' },
                    { key: 'notify_warning', label: 'Warning', color: '#f59e0b' },
                    { key: 'notify_info', label: 'Info', color: '#38bdf8' }
                  ].map(s => {
                    const active = addUserForm[s.key]
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setAddUserForm({ ...addUserForm, [s.key]: !active })}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: 12,
                          textAlign: 'center',
                          border: `1px solid ${active ? s.color : '#334155'}`,
                          background: active ? `${s.color}20` : '#090d16',
                          color: active ? s.color : '#64748b'
                        }}
                      >
                        {active ? '✓ ' : '✕ '} {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  Категории уведомлений
                </label>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                  Если ничего не выбрано — доставляются все категории
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {ALL_CATEGORIES.map(cat => {
                    const active = (addUserForm.notify_categories || []).includes(cat.value)
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => {
                          const cats = addUserForm.notify_categories || []
                          setAddUserForm({
                            ...addUserForm,
                            notify_categories: active ? cats.filter(c => c !== cat.value) : [...cats, cat.value]
                          })
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          textAlign: 'center',
                          border: `1px solid ${active ? '#38bdf8' : '#1e293b'}`,
                          background: active ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                          color: active ? '#38bdf8' : '#64748b'
                        }}
                      >
                        {active ? '✓ ' : '○ '} {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid #334155',
                    background: '#1e293b',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={addUserSaving}
                  onClick={handleAddUser}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {addUserSaving ? 'Сохранение...' : 'Добавить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setEditUser(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={18} color="#38bdf8" />
                Настройки подписчика
              </h3>
              <button
                onClick={() => setEditUser(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 18,
                padding: 12,
                background: '#090d16',
                borderRadius: 8,
                border: '1px solid #1e293b'
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Users size={18} color="#38bdf8" />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>
                  {editUser.first_name || 'Без имени'}
                  {editUser.last_name ? ` ${editUser.last_name}` : ''}
                </div>
                <div style={{ fontSize: 11, color: '#38bdf8' }}>
                  {editUser.username ? `@${editUser.username}` : `ID: ${editUser.telegram_id}`}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Организация</label>
                <select
                  value={editUserForm.org_id || ''}
                  onChange={e =>
                    setEditUserForm({ ...editUserForm, org_id: e.target.value ? parseInt(e.target.value) : null })
                  }
                  style={modernInputStyle}
                >
                  <option value="">Не назначена (Все организации)</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Пользователь будет получать уведомления только по ресурсам назначенной организации
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Уровни важности</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'notify_critical', label: 'Critical', color: '#ef4444' },
                    { key: 'notify_warning', label: 'Warning', color: '#f59e0b' },
                    { key: 'notify_info', label: 'Info', color: '#38bdf8' }
                  ].map(s => {
                    const active = editUserForm[s.key]
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setEditUserForm({ ...editUserForm, [s.key]: !active })}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: 12,
                          textAlign: 'center',
                          border: `1px solid ${active ? s.color : '#334155'}`,
                          background: active ? `${s.color}20` : '#090d16',
                          color: active ? s.color : '#64748b'
                        }}
                      >
                        {active ? '✓ ' : '✕ '} {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                  Категории уведомлений
                </label>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                  Если ничего не выбрано — доставляются все категории
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {ALL_CATEGORIES.map(cat => {
                    const active = (editUserForm.notify_categories || []).includes(cat.value)
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => {
                          const cats = editUserForm.notify_categories || []
                          setEditUserForm({
                            ...editUserForm,
                            notify_categories: active ? cats.filter(c => c !== cat.value) : [...cats, cat.value]
                          })
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          textAlign: 'center',
                          border: `1px solid ${active ? '#38bdf8' : '#1e293b'}`,
                          background: active ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                          color: active ? '#38bdf8' : '#64748b'
                        }}
                      >
                        {active ? '✓ ' : '○ '} {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid #334155',
                    background: '#1e293b',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={editUserSaving}
                  onClick={handleSaveUser}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {editUserSaving ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direct Message to User Modal */}
      {sendUserModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setSendUserModal(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#101726',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Send size={16} color="#38bdf8" />
                Личное оповещение
              </h3>
              <button
                onClick={() => setSendUserModal(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
              Получатель:{' '}
              <b style={{ color: '#fff' }}>
                {sendUserModal.first_name || sendUserModal.username || sendUserModal.telegram_id}
              </b>
            </div>

            <textarea
              rows={4}
              value={sendUserMsg}
              onChange={e => setSendUserMsg(e.target.value)}
              placeholder="Введите текст сообщения..."
              style={{ ...modernInputStyle, width: '100%', marginBottom: 12, resize: 'vertical' }}
            />

            {sendUserResult && (
              <div
                style={{
                  fontSize: 12,
                  marginBottom: 12,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: sendUserResult.sent ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  border: `1px solid ${sendUserResult.sent ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  color: sendUserResult.sent ? '#4ade80' : '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {sendUserResult.sent ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {sendUserResult.sent ? 'Сообщение успешно доставлено!' : `Ошибка: ${sendUserResult.error || 'Сбой'}`}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSendUserModal(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: '#1e293b',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                Закрыть
              </button>
              <button
                type="button"
                disabled={sendUserSending || !sendUserMsg.trim()}
                onClick={handleSendToUser}
                style={{
                  padding: '8px 20px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Send size={14} />
                {sendUserSending ? 'Отправка...' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  )
}

const modernInputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #1e293b',
  background: '#090d16',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box'
}

const actionBtnStyle = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #1e293b',
  background: '#090d16',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'border-color 0.15s ease'
}
